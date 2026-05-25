/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Asset Registration & QR Generation Load Test
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Tests:
 *  1. Asset Registration (POST /api/assets) — single & concurrent
 *  2. Bulk Excel Import (POST /api/assets/bulk-import) — custom row count
 *  3. QR Lookup (GET /api/asset-qr/qr-lookup/:uid) — concurrent scans
 *  4. Company Portal Bulk Import (POST /api/company-portal/assets/bulk-import)
 *
 * Usage:
 *   node load-test-assets.mjs [options]
 *
 * Options (env vars or CLI):
 *   BASE_URL          API base URL (default: http://localhost:4000)
 *   AUTH_TOKEN        Bearer token for admin user (required)
 *   CP_TOKEN          Bearer token for company portal admin (optional)
 *   COMPANY_ID        Company ID to register assets under (default: 1)
 *   DEPARTMENT_ID     Department ID (default: 1)
 *   ASSET_TYPE        Asset type code (default: general)
 *   CONCURRENCY       Number of parallel requests (default: 10)
 *   TOTAL_ASSETS      Total assets to create (default: 100)
 *   BATCH_SIZE        Assets per bulk-import batch (default: 1000, max enforced by server)
 *
 * Example:
 *   AUTH_TOKEN=eyJ... COMPANY_ID=2 TOTAL_ASSETS=500 CONCURRENCY=20 node load-test-assets.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Config ────────────────────────────────────────────────────────────────────

const BASE_URL      = process.env.BASE_URL      || "http://localhost:4000";
const AUTH_TOKEN    = process.env.AUTH_TOKEN    || "";
const CP_TOKEN      = process.env.CP_TOKEN      || "";
const COMPANY_ID    = Number(process.env.COMPANY_ID    || 1);
const DEPARTMENT_ID = Number(process.env.DEPARTMENT_ID || 1);
const ASSET_TYPE    = process.env.ASSET_TYPE    || "general";
const CONCURRENCY   = Number(process.env.CONCURRENCY   || 10);
const TOTAL_ASSETS  = Number(process.env.TOTAL_ASSETS  || 100);
const BATCH_SIZE    = Math.min(Number(process.env.BATCH_SIZE || 1000), 1000); // server cap per request

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const colorize = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
};

function printHeader(title) {
  const line = "─".repeat(70);
  console.log(`\n${colorize.cyan(line)}`);
  console.log(colorize.bold(`  ${title}`));
  console.log(colorize.cyan(line));
}

function printResult(label, value, ok = true) {
  const marker = ok ? colorize.green("✓") : colorize.red("✗");
  console.log(`  ${marker}  ${label}: ${colorize.bold(String(value))}`);
}

/** Run at most `concurrency` promises at a time from the `tasks` array. */
async function pLimit(tasks, concurrency) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

/** POST JSON request. Returns { ok, status, data, ms }. */
async function postJson(path, body, token = AUTH_TOKEN) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, status: 0, data: { message: err.message }, ms: Date.now() - t0 };
  }
}

/** GET request. Returns { ok, status, data, ms }. */
async function getJson(path, token = AUTH_TOKEN) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, status: 0, data: { message: err.message }, ms: Date.now() - t0 };
  }
}

/** Build an in-memory XLSX buffer with `count` asset rows (no xlsx lib needed – uses CSV). */
function buildCsvBuffer(count, prefix = "LoadTest") {
  const lines = [
    "assetName*,assetType,departmentName,building,floor,room,assetUniqueId,status",
  ];
  for (let i = 1; i <= count; i++) {
    lines.push(`${prefix}-Asset-${i},${ASSET_TYPE},,Block-A,1,Room-${i},,Active`);
  }
  return Buffer.from(lines.join("\n"), "utf8");
}

/** POST multipart/form-data with a file buffer. Returns { ok, status, data, ms }. */
async function postFormData(path, fileBuffer, filename, token = AUTH_TOKEN) {
  const t0 = Date.now();
  try {
    const { FormData, Blob } = await import("node:buffer").then(() => globalThis);

    // Node 18+ has FormData / Blob globally; older versions need the form-data package
    const fd = new FormData();
    const blob = new Blob([fileBuffer], { type: "text/csv" });
    fd.append("file", blob, filename);

    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, status: 0, data: { message: err.message }, ms: Date.now() - t0 };
  }
}

/** Summarise an array of { ok, ms } results. */
function summarise(results) {
  const passed  = results.filter((r) => r.ok).length;
  const failed  = results.length - passed;
  const times   = results.map((r) => r.ms).sort((a, b) => a - b);
  const avg     = Math.round(times.reduce((s, v) => s + v, 0) / (times.length || 1));
  const p50     = times[Math.floor(times.length * 0.5)] ?? 0;
  const p95     = times[Math.floor(times.length * 0.95)] ?? 0;
  const p99     = times[Math.floor(times.length * 0.99)] ?? 0;
  const minMs   = times[0] ?? 0;
  const maxMs   = times[times.length - 1] ?? 0;
  return { total: results.length, passed, failed, avg, p50, p95, p99, minMs, maxMs };
}

function printSummary(s, label) {
  printResult(`${label} — Total`, s.total);
  printResult(`${label} — Passed`, s.passed, s.failed === 0);
  if (s.failed) printResult(`${label} — Failed`, s.failed, false);
  console.log(colorize.dim(`       Latency avg=${s.avg}ms  p50=${s.p50}ms  p95=${s.p95}ms  p99=${s.p99}ms  min=${s.minMs}ms  max=${s.maxMs}ms`));
}

// ── Test 1: Single asset registration ────────────────────────────────────────

async function testSingleAssetRegistration() {
  printHeader("TEST 1 — Single Asset Registration (POST /api/assets)");

  if (!AUTH_TOKEN) {
    console.log(colorize.yellow("  SKIP — AUTH_TOKEN not set"));
    return;
  }

  const payload = {
    companyId:    COMPANY_ID,
    departmentId: DEPARTMENT_ID,
    assetName:    `LoadTest-Single-${Date.now()}`,
    assetType:    ASSET_TYPE,
    status:       "Active",
    building:     "Block-A",
    floor:        "1",
    room:         "101",
  };

  const result = await postJson("/api/assets", payload);
  printResult("Status",     result.status, result.ok);
  printResult("Latency",    `${result.ms}ms`);
  printResult("Asset ID",   result.data?.id ?? "—", !!result.data?.id);
  printResult("Unique ID",  result.data?.assetUniqueId ?? result.data?.message ?? "—", result.ok);

  return result;
}

// ── Test 2: Concurrent asset registrations ────────────────────────────────────

async function testConcurrentAssetRegistration(total = TOTAL_ASSETS, concurrency = CONCURRENCY) {
  printHeader(`TEST 2 — Concurrent Asset Registration (${total} assets, concurrency=${concurrency})`);

  if (!AUTH_TOKEN) {
    console.log(colorize.yellow("  SKIP — AUTH_TOKEN not set"));
    return;
  }

  const tasks = Array.from({ length: total }, (_, i) => async () => {
    const payload = {
      companyId:    COMPANY_ID,
      departmentId: DEPARTMENT_ID,
      assetName:    `LoadTest-Concurrent-${i + 1}-${Date.now()}`,
      assetType:    ASSET_TYPE,
      status:       "Active",
      building:     "Block-A",
      floor:        `${(i % 5) + 1}`,
      room:         `${100 + i}`,
    };
    return postJson("/api/assets", payload);
  });

  const t0 = Date.now();
  const results = await pLimit(tasks, concurrency);
  const wall = Date.now() - t0;

  const s = summarise(results);
  printSummary(s, "Registration");
  console.log(colorize.dim(`       Wall time: ${wall}ms  Throughput: ${Math.round((total / wall) * 1000)} req/s`));

  // Print first 3 errors if any
  results.filter((r) => !r.ok).slice(0, 3).forEach((r, i) => {
    console.log(colorize.red(`  Error ${i + 1}: [${r.status}] ${JSON.stringify(r.data).slice(0, 120)}`));
  });

  return { results, wall };
}

// ── Test 3: Bulk Excel/CSV Import ─────────────────────────────────────────────

async function testBulkImport(totalAssets = TOTAL_ASSETS) {
  printHeader(`TEST 3 — Bulk CSV Import (${totalAssets} assets via /api/assets/bulk-import)`);

  if (!AUTH_TOKEN) {
    console.log(colorize.yellow("  SKIP — AUTH_TOKEN not set"));
    return;
  }

  // Server currently caps at 1000 per request; split into batches
  const batches = [];
  let remaining = totalAssets;
  let batchNum  = 0;
  while (remaining > 0) {
    batches.push(Math.min(remaining, BATCH_SIZE));
    remaining -= BATCH_SIZE;
    batchNum++;
  }

  console.log(`  Splitting into ${batches.length} batch(es) of up to ${BATCH_SIZE} rows each`);

  let totalCreated = 0;
  let totalSkipped = 0;
  const allMs = [];

  for (let b = 0; b < batches.length; b++) {
    const count  = batches[b];
    const prefix = `Batch${b + 1}`;
    const csv    = buildCsvBuffer(count, prefix);
    const result = await postFormData(
      `/api/assets/bulk-import?companyId=${COMPANY_ID}`,
      csv,
      `batch-${b + 1}.csv`
    );

    allMs.push(result.ms);
    const created = result.data?.created ?? 0;
    const skipped = result.data?.skipped ?? 0;
    totalCreated += created;
    totalSkipped += skipped;

    const marker = result.ok ? colorize.green("✓") : colorize.red("✗");
    console.log(`  ${marker} Batch ${b + 1}/${batches.length}: status=${result.status} created=${created} skipped=${skipped} time=${result.ms}ms`);

    if (!result.ok) {
      console.log(colorize.red(`    Error: ${JSON.stringify(result.data).slice(0, 200)}`));
    }
  }

  const totalMs = allMs.reduce((s, v) => s + v, 0);
  console.log(`\n  Total created : ${colorize.bold(String(totalCreated))}`);
  console.log(`  Total skipped : ${colorize.bold(String(totalSkipped))}`);
  console.log(`  Total wall time: ${colorize.bold(totalMs + "ms")}`);
}

// ── Test 4: Company Portal Bulk Import ────────────────────────────────────────

async function testCompanyPortalBulkImport(totalAssets = TOTAL_ASSETS) {
  printHeader(`TEST 4 — Company Portal Bulk Import (${totalAssets} assets)`);

  if (!CP_TOKEN) {
    console.log(colorize.yellow("  SKIP — CP_TOKEN not set"));
    return;
  }

  const batches = [];
  let remaining = totalAssets;
  while (remaining > 0) {
    batches.push(Math.min(remaining, BATCH_SIZE));
    remaining -= BATCH_SIZE;
  }

  console.log(`  Splitting into ${batches.length} batch(es)`);

  let totalCreated = 0;
  let totalSkipped = 0;

  for (let b = 0; b < batches.length; b++) {
    const count  = batches[b];
    const prefix = `CPBatch${b + 1}`;
    const csv    = buildCsvBuffer(count, prefix);
    const result = await postFormData(
      `/api/company-portal/assets/bulk-import`,
      csv,
      `cp-batch-${b + 1}.csv`,
      CP_TOKEN
    );

    const created = result.data?.created ?? 0;
    const skipped = result.data?.skipped ?? 0;
    totalCreated += created;
    totalSkipped += skipped;

    const marker = result.ok ? colorize.green("✓") : colorize.red("✗");
    console.log(`  ${marker} Batch ${b + 1}/${batches.length}: status=${result.status} created=${created} skipped=${skipped} time=${result.ms}ms`);
    if (!result.ok) {
      console.log(colorize.red(`    Error: ${JSON.stringify(result.data).slice(0, 200)}`));
    }
  }

  console.log(`\n  Total created: ${colorize.bold(String(totalCreated))}`);
  console.log(`  Total skipped: ${colorize.bold(String(totalSkipped))}`);
}

// ── Test 5: QR Lookup Stress Test ─────────────────────────────────────────────

async function testQRLookup(qrIds = [], concurrency = CONCURRENCY) {
  printHeader(`TEST 5 — QR Code Lookup Stress Test (${qrIds.length} lookups, concurrency=${concurrency})`);

  if (!qrIds.length) {
    console.log(colorize.yellow("  SKIP — No QR IDs provided. Run asset registration first and pass IDs."));
    return;
  }

  const tasks = qrIds.map((uid) => async () =>
    getJson(`/api/asset-qr/qr-lookup/${encodeURIComponent(uid)}`, "")
  );

  const t0 = Date.now();
  const results = await pLimit(tasks, concurrency);
  const wall = Date.now() - t0;

  const s = summarise(results);
  printSummary(s, "QR Lookup");
  console.log(colorize.dim(`       Wall time: ${wall}ms  Throughput: ${Math.round((qrIds.length / wall) * 1000)} req/s`));
}

// ── Test 6: Delete All Assets (cleanup) ───────────────────────────────────────

async function testDeleteAllAssets() {
  printHeader("TEST 6 — Delete All Assets (DELETE /api/assets/delete-all)");

  if (!AUTH_TOKEN) {
    console.log(colorize.yellow("  SKIP — AUTH_TOKEN not set"));
    return;
  }

  const t0 = Date.now();
  try {
    const res = await fetch(
      `${BASE_URL}/api/assets/delete-all?companyId=${COMPANY_ID}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
      }
    );
    const data = await res.json().catch(() => ({}));
    const ms = Date.now() - t0;
    printResult("Status",  res.status, res.ok);
    printResult("Deleted", data.deleted ?? "—", res.ok);
    printResult("Latency", `${ms}ms`);
  } catch (err) {
    printResult("Error", err.message, false);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(colorize.bold("\n🚀 FM Asset Load Test"));
  console.log(colorize.dim(`   BASE_URL=${BASE_URL}  COMPANY_ID=${COMPANY_ID}  DEPARTMENT_ID=${DEPARTMENT_ID}`));
  console.log(colorize.dim(`   TOTAL_ASSETS=${TOTAL_ASSETS}  CONCURRENCY=${CONCURRENCY}  BATCH_SIZE=${BATCH_SIZE}`));

  if (!AUTH_TOKEN && !CP_TOKEN) {
    console.log(colorize.red("\n⛔ No AUTH_TOKEN or CP_TOKEN provided. Set them as environment variables.\n"));
    console.log("  Example:");
    console.log(colorize.cyan("    AUTH_TOKEN=eyJ... COMPANY_ID=1 DEPARTMENT_ID=1 TOTAL_ASSETS=1000 node load-test-assets.mjs\n"));
    process.exit(1);
  }

  // 1. Single registration sanity check
  const single = await testSingleAssetRegistration();

  // 2. Concurrent registration stress test
  const concurrent = await testConcurrentAssetRegistration();

  // 3. Bulk CSV import (batched, no limit)
  await testBulkImport();

  // 4. Company portal bulk import (if CP_TOKEN available)
  await testCompanyPortalBulkImport();

  // 5. QR lookup stress test (use IDs from concurrent test)
  const qrIds = (concurrent?.results ?? [])
    .filter((r) => r.ok && r.data?.assetUniqueId)
    .slice(0, 200)
    .map((r) => r.data.assetUniqueId);
  await testQRLookup(qrIds);

  // 6. Cleanup — delete all created assets
  const shouldCleanup = process.env.CLEANUP !== "false";
  if (shouldCleanup) {
    await testDeleteAllAssets();
  }

  console.log(colorize.bold(colorize.green("\n✅ Load test complete.\n")));
}

main().catch((err) => {
  console.error(colorize.red("\n💥 Fatal error:"), err);
  process.exit(1);
});
