/**
 * Asset Audit — physical existence verification (stock-take).
 * Prefix: /api/company-portal/audits
 *
 * An "audit" is a time-boxed campaign, scoped to a department or a location
 * (building/floor/room), that snapshots the assets expected to be there and
 * lets a field user confirm each one exists: Found / Not Found. On completion,
 * anything still pending becomes "Not Found" (missing) and a reconciliation
 * summary is produced.
 *
 * Company-scoped and permission-gated, matching the rest of the portal.
 *   audit:view    — see audits & reports
 *   audit:manage  — create / start / complete / cancel
 *   audit:conduct — mark items found / not found (the field work)
 */
import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { emitToCompany } from "../utils/socket.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

async function getAccessibleCompanyIds(userId, primaryCompanyId) {
  const [extra] = await pool.query(
    `SELECT company_id AS companyId FROM user_company_access WHERE user_id = ?`, [userId]
  ).catch(() => [[]]);
  const ids = new Set([Number(primaryCompanyId)]);
  extra.forEach((r) => ids.add(Number(r.companyId)));
  return [...ids];
}

/* ─── Auto-migration ────────────────────────────────────────────────────────── */
const safe = (sql) => pool.query(sql).catch((e) => { if (!/already exists|duplicate|check that column/i.test(e.message)) console.warn("[audit-migrate]", e.message); });
(async () => {
  await safe(`CREATE TABLE IF NOT EXISTS asset_audits (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id    INT NOT NULL,
    title         VARCHAR(160) NOT NULL,
    scope_type    ENUM('company','department','building','floor','room') NOT NULL DEFAULT 'department',
    scope_ref     INT NULL,
    scope_label   VARCHAR(200) NULL,
    status        ENUM('draft','in_progress','completed','cancelled') NOT NULL DEFAULT 'draft',
    expected_count INT NOT NULL DEFAULT 0,
    notes         TEXT NULL,
    created_by    INT NULL,
    created_by_name VARCHAR(160) NULL,
    started_at    DATETIME NULL,
    completed_at  DATETIME NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_company_status (company_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`CREATE TABLE IF NOT EXISTS asset_audit_items (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    audit_id       INT UNSIGNED NOT NULL,
    company_id     INT NOT NULL,
    asset_id       INT NOT NULL,
    snapshot_name  VARCHAR(220) NULL,
    snapshot_code  VARCHAR(120) NULL,
    snapshot_department VARCHAR(160) NULL,
    snapshot_location   VARCHAR(220) NULL,
    status         ENUM('pending','found','not_found') NOT NULL DEFAULT 'pending',
    method         ENUM('qr_scan','manual') NULL,
    remarks        VARCHAR(500) NULL,
    audited_by     INT NULL,
    audited_by_name VARCHAR(160) NULL,
    audited_at     DATETIME NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_audit_asset (audit_id, asset_id),
    KEY idx_audit_status (audit_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`ALTER TABLE assets ADD COLUMN last_audited_at DATETIME NULL`);
  await safe(`ALTER TABLE assets ADD COLUMN last_audit_status VARCHAR(20) NULL`);
})();

/* ─── Helpers ───────────────────────────────────────────────────────────────── */
// Column on `assets` used to filter a given scope type.
const SCOPE_COL = { department: "department_id", building: "building_id", floor: "floor_id", room: "room_id" };

// Build the "assets in scope" WHERE + params for a company set.
function scopeWhere(scopeType, scopeRef, companyIds) {
  const ph = companyIds.map(() => "?").join(",");
  let where = `a.company_id IN (${ph}) AND a.status = 'Active'`;
  const params = [...companyIds];
  if (scopeType !== "company") {
    const col = SCOPE_COL[scopeType];
    if (!col) throw new Error("Invalid scope type");
    where += ` AND a.${col} = ?`;
    params.push(Number(scopeRef));
  }
  return { where, params };
}

// Resolve a scanned QR/barcode (which may be a URL) to an asset id, matching the
// same shapes the app's main QR scanner handles:
//   • /q/<uid>            → asset_pre_qr.qr_unique_id
//   • /asset-scan/<id>, /assets/<id>, ?assetId=<id>, or a bare number → assets.id
//   • otherwise the raw string → qr_unique_id / asset_unique_id / generated_asset_id
async function resolveScannedAsset(companyIds, code, assetId) {
  const ph = companyIds.map(() => "?").join(",");
  if (assetId) {
    const [[a]] = await pool.query(`SELECT id FROM assets WHERE id = ? AND company_id IN (${ph}) LIMIT 1`, [Number(assetId), ...companyIds]);
    return a ? a.id : null;
  }
  const raw = String(code || "").trim();
  if (!raw) return null;
  const qUid = raw.match(/\/q\/([^/?#]+)/i)?.[1];
  const uid = qUid ? decodeURIComponent(qUid).trim() : null;
  const numeric = raw.match(/\/asset-scan\/(\d+)/i)?.[1]
    || raw.match(/\/assets?\/(\d+)/i)?.[1]
    || raw.match(/[?&]assetId=(\d+)/i)?.[1]
    || (/^\d+$/.test(raw) ? raw : null);

  // 1) Match code/uid against QR + asset identifiers.
  for (const c of [uid, raw].filter(Boolean)) {
    const [[a]] = await pool.query(
      `SELECT a.id FROM assets a
       LEFT JOIN asset_pre_qr q ON q.asset_id = a.id AND q.company_id = a.company_id
       WHERE a.company_id IN (${ph})
         AND (UPPER(a.generated_asset_id)=UPPER(?) OR UPPER(a.asset_unique_id)=UPPER(?) OR UPPER(q.qr_unique_id)=UPPER(?))
       LIMIT 1`, [...companyIds, c, c, c]
    );
    if (a) return a.id;
  }
  // 2) Pre-QR table directly by uid (linked pre-printed QR).
  if (uid) {
    const [[q]] = await pool.query(
      `SELECT asset_id FROM asset_pre_qr WHERE qr_unique_id = ? AND company_id IN (${ph}) AND asset_id IS NOT NULL LIMIT 1`,
      [uid, ...companyIds]
    );
    if (q?.asset_id) return q.asset_id;
  }
  // 3) Numeric asset id (from a /asset-scan/<id>-style URL or a bare number).
  if (numeric) {
    const [[a]] = await pool.query(`SELECT id FROM assets WHERE id = ? AND company_id IN (${ph}) LIMIT 1`, [Number(numeric), ...companyIds]);
    if (a) return a.id;
  }
  return null;
}

// Per-audit found/not_found/pending counts.
async function auditStats(auditId) {
  const [[s]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status='found')     AS found,
       SUM(status='not_found') AS notFound,
       SUM(status='pending')   AS pending
     FROM asset_audit_items WHERE audit_id = ?`, [auditId]
  );
  return {
    total: Number(s.total || 0), found: Number(s.found || 0),
    notFound: Number(s.notFound || 0), pending: Number(s.pending || 0),
    verifiedPct: s.total > 0 ? Math.round((Number(s.found || 0) / Number(s.total)) * 100) : 0,
  };
}

/* ─── GET /scope-preview — how many assets a scope would include ────────────── */
router.get("/scope-preview", requirePermission("audit:manage"), async (req, res, next) => {
  try {
    const { scopeType = "department", scopeRef } = req.query;
    if (scopeType !== "company" && !scopeRef) return res.status(400).json({ message: "scopeRef required" });
    const companyIds = req.query.allCompanies === "true"
      ? await getAccessibleCompanyIds(req.companyUser.id, cid(req)) : [cid(req)];
    const { where, params } = scopeWhere(scopeType, scopeRef, companyIds);
    const [[row]] = await pool.query(`SELECT COUNT(*) AS n FROM assets a WHERE ${where}`, params);
    res.json({ count: Number(row.n || 0) });
  } catch (err) { next(err); }
});

/* ─── GET / — list audits with live stats ──────────────────────────────────── */
router.get("/", requirePermission("audit:view"), async (req, res, next) => {
  try {
    const companyIds = req.query.allCompanies === "true"
      ? await getAccessibleCompanyIds(req.companyUser.id, cid(req)) : [cid(req)];
    const ph = companyIds.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT au.*,
              (SELECT COUNT(*) FROM asset_audit_items i WHERE i.audit_id = au.id AND i.status='found')     AS foundCount,
              (SELECT COUNT(*) FROM asset_audit_items i WHERE i.audit_id = au.id AND i.status='not_found') AS notFoundCount,
              (SELECT COUNT(*) FROM asset_audit_items i WHERE i.audit_id = au.id AND i.status='pending')   AS pendingCount
       FROM asset_audits au
       WHERE au.company_id IN (${ph})
       ORDER BY au.created_at DESC`,
      companyIds
    );
    res.json(rows.map((r) => ({
      id: r.id, title: r.title, scopeType: r.scope_type, scopeLabel: r.scope_label,
      status: r.status, expectedCount: r.expected_count,
      foundCount: Number(r.foundCount), notFoundCount: Number(r.notFoundCount), pendingCount: Number(r.pendingCount),
      verifiedPct: r.expected_count > 0 ? Math.round((Number(r.foundCount) / r.expected_count) * 100) : 0,
      createdByName: r.created_by_name, startedAt: r.started_at, completedAt: r.completed_at, createdAt: r.created_at,
    })));
  } catch (err) { next(err); }
});

/* ─── POST / — create an audit and snapshot the in-scope assets ────────────── */
router.post("/", requirePermission("audit:manage"), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { title, scopeType = "department", scopeRef = null, scopeLabel = null, notes = null, allCompanies = false } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ message: "title is required" });
    if (scopeType !== "company" && !scopeRef) return res.status(400).json({ message: "scopeRef required for this scope" });

    const companyIds = allCompanies ? await getAccessibleCompanyIds(req.companyUser.id, cid(req)) : [cid(req)];
    const { where, params } = scopeWhere(scopeType, scopeRef, companyIds);

    const [assets] = await conn.query(
      `SELECT a.id, a.asset_name AS name,
              COALESCE(a.generated_asset_id, a.asset_unique_id) AS code,
              d.name AS dept,
              NULLIF(CONCAT_WS(', ', a.building, a.floor, a.room), '') AS location
       FROM assets a LEFT JOIN departments d ON d.id = a.department_id
       WHERE ${where}`, params
    );
    if (!assets.length) { conn.release(); return res.status(400).json({ message: "No active assets found in this scope." }); }

    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO asset_audits (company_id, title, scope_type, scope_ref, scope_label, status, expected_count, notes, created_by, created_by_name)
       VALUES (?,?,?,?,?, 'draft', ?, ?, ?, ?)`,
      [cid(req), String(title).trim().slice(0, 160), scopeType, scopeType === "company" ? null : Number(scopeRef),
       scopeLabel || (scopeType === "company" ? "All assets" : null), assets.length, notes,
       req.companyUser.id, req.companyUser.fullName || req.companyUser.name || null]
    );
    const auditId = ins.insertId;
    const values = assets.map((a) => [auditId, cid(req), a.id, a.name, a.code, a.dept, a.location]);
    await conn.query(
      `INSERT INTO asset_audit_items (audit_id, company_id, asset_id, snapshot_name, snapshot_code, snapshot_department, snapshot_location)
       VALUES ?`, [values]
    );
    await conn.commit();
    res.status(201).json({ id: auditId, expectedCount: assets.length });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

/* ─── GET /:id — audit detail + stats ──────────────────────────────────────── */
router.get("/:id", requirePermission("audit:view"), async (req, res, next) => {
  try {
    const [[au]] = await pool.query(`SELECT * FROM asset_audits WHERE id = ? AND company_id = ?`, [req.params.id, cid(req)]);
    if (!au) return res.status(404).json({ message: "Audit not found" });
    const stats = await auditStats(au.id);
    res.json({
      id: au.id, title: au.title, scopeType: au.scope_type, scopeLabel: au.scope_label, status: au.status,
      expectedCount: au.expected_count, notes: au.notes, createdByName: au.created_by_name,
      startedAt: au.started_at, completedAt: au.completed_at, createdAt: au.created_at, stats,
    });
  } catch (err) { next(err); }
});

/* ─── GET /:id/items?status= — the checklist ───────────────────────────────── */
router.get("/:id/items", requirePermission("audit:view"), async (req, res, next) => {
  try {
    const [[au]] = await pool.query(`SELECT id FROM asset_audits WHERE id = ? AND company_id = ?`, [req.params.id, cid(req)]);
    if (!au) return res.status(404).json({ message: "Audit not found" });
    let where = "audit_id = ?"; const params = [au.id];
    if (req.query.status && ["pending", "found", "not_found"].includes(req.query.status)) { where += " AND status = ?"; params.push(req.query.status); }
    if (req.query.search) { where += " AND (snapshot_name LIKE ? OR snapshot_code LIKE ?)"; const s = `%${req.query.search}%`; params.push(s, s); }
    const [rows] = await pool.query(
      `SELECT id, asset_id AS assetId, snapshot_name AS name, snapshot_code AS code,
              snapshot_department AS department, snapshot_location AS location,
              status, method, remarks, audited_by_name AS auditedByName, audited_at AS auditedAt
       FROM asset_audit_items WHERE ${where}
       ORDER BY (status='pending') DESC, snapshot_name ASC`, params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ─── Lifecycle: start / complete / cancel ─────────────────────────────────── */
router.patch("/:id/start", requirePermission("audit:manage"), async (req, res, next) => {
  try {
    const [r] = await pool.query(
      `UPDATE asset_audits SET status='in_progress', started_at=COALESCE(started_at, NOW())
       WHERE id=? AND company_id=? AND status='draft'`, [req.params.id, cid(req)]);
    if (!r.affectedRows) return res.status(409).json({ message: "Audit can't be started (not in draft)." });
    emitToCompany(cid(req), "audit:updated", { id: Number(req.params.id), status: "in_progress" });
    res.json({ ok: true, status: "in_progress" });
  } catch (err) { next(err); }
});

router.patch("/:id/complete", requirePermission("audit:manage"), async (req, res, next) => {
  try {
    const [[au]] = await pool.query(`SELECT id FROM asset_audits WHERE id=? AND company_id=? AND status='in_progress'`, [req.params.id, cid(req)]);
    if (!au) return res.status(409).json({ message: "Audit is not in progress." });
    // Anything still pending is treated as missing.
    await pool.query(`UPDATE asset_audit_items SET status='not_found' WHERE audit_id=? AND status='pending'`, [au.id]);
    await pool.query(`UPDATE asset_audits SET status='completed', completed_at=NOW() WHERE id=?`, [au.id]);
    // Stamp last-audit info on the assets.
    await pool.query(`UPDATE assets a JOIN asset_audit_items i ON i.asset_id=a.id AND i.audit_id=?
                      SET a.last_audited_at=NOW(), a.last_audit_status=i.status`, [au.id]).catch(() => {});
    emitToCompany(cid(req), "audit:updated", { id: au.id, status: "completed" });
    res.json({ ok: true, status: "completed", stats: await auditStats(au.id) });
  } catch (err) { next(err); }
});

router.patch("/:id/cancel", requirePermission("audit:manage"), async (req, res, next) => {
  try {
    const [r] = await pool.query(`UPDATE asset_audits SET status='cancelled' WHERE id=? AND company_id=? AND status IN ('draft','in_progress')`, [req.params.id, cid(req)]);
    if (!r.affectedRows) return res.status(409).json({ message: "Audit can't be cancelled." });
    res.json({ ok: true, status: "cancelled" });
  } catch (err) { next(err); }
});

/* ─── PATCH /:id/items/:itemId — mark one item ─────────────────────────────── */
router.patch("/:id/items/:itemId", requirePermission("audit:conduct"), async (req, res, next) => {
  try {
    const { status, remarks = null, method = "manual" } = req.body || {};
    if (!["found", "not_found", "pending"].includes(status)) return res.status(400).json({ message: "Invalid status" });
    const [[au]] = await pool.query(`SELECT id, status FROM asset_audits WHERE id=? AND company_id=?`, [req.params.id, cid(req)]);
    if (!au) return res.status(404).json({ message: "Audit not found" });
    if (au.status !== "in_progress") return res.status(409).json({ message: "Start the audit before recording results." });
    const [r] = await pool.query(
      `UPDATE asset_audit_items
         SET status=?, method=?, remarks=?, audited_by=?, audited_by_name=?, audited_at=NOW()
       WHERE id=? AND audit_id=?`,
      [status, status === "pending" ? null : method, remarks, req.companyUser.id,
       req.companyUser.fullName || req.companyUser.name || null, req.params.itemId, au.id]
    );
    if (!r.affectedRows) return res.status(404).json({ message: "Item not found" });
    const stats = await auditStats(au.id);
    emitToCompany(cid(req), "audit:progress", { id: au.id, stats });
    res.json({ ok: true, stats });
  } catch (err) { next(err); }
});

/* ─── POST /scan — scan-first: find the active audit for this asset & mark Found ─
 * No audit id needed. Resolves the scanned code → asset → an in-progress audit
 * that includes it → marks it Found. Used by the mobile "Asset Audit" quick action.
 */
router.post("/lookup", requirePermission("audit:conduct"), async (req, res, next) => {
  try {
    const { code, assetId } = req.body || {};
    const companyIds = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
    const ph = companyIds.map(() => "?").join(",");
    const clean = (v) => (v == null || v === "null" ? null : v);

    // Resolve the asset (explicit id, or the scanned QR/URL/barcode).
    if (!code && !assetId) return res.status(400).json({ message: "code or assetId required" });
    const resolvedId = await resolveScannedAsset(companyIds, code, assetId);
    if (!resolvedId) return res.json({ outcome: "unknown", message: "That code doesn't match any asset in your register." });

    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name AS name,
              COALESCE(a.generated_asset_id, a.asset_unique_id) AS code,
              d.name AS department,
              NULLIF(CONCAT_WS(', ', a.building, a.floor, a.room), '') AS location,
              a.asset_category AS category, a.working_status AS status, a.criticality,
              CASE WHEN a.is_verified = 1 THEN 1 ELSE 0 END AS verified,
              a.last_audited_at AS lastAuditedAt, a.last_audit_status AS lastAuditStatus,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.make')), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.manufacturer'))) AS make,
              JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.model')) AS model,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.serialNo')), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.srNo'))) AS serialNo
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ? AND a.company_id IN (${ph}) LIMIT 1`,
      [resolvedId, ...companyIds]
    );
    if (!asset) return res.json({ outcome: "unknown", message: "Asset not found." });

    const [[item]] = await pool.query(
      `SELECT i.id, i.status, i.audit_id AS auditId, au.title AS auditTitle
       FROM asset_audit_items i JOIN asset_audits au ON au.id = i.audit_id
       WHERE i.company_id IN (${ph}) AND i.asset_id = ? AND au.status = 'in_progress'
       ORDER BY au.started_at DESC LIMIT 1`,
      [...companyIds, resolvedId]
    );

    res.json({
      outcome: item ? "in_audit" : "no_audit",
      asset: { ...asset, make: clean(asset.make), model: clean(asset.model), serialNo: clean(asset.serialNo), verified: !!asset.verified },
      audit: item ? { id: item.auditId, title: item.auditTitle } : null,
      item: item ? { id: item.id, status: item.status } : null,
    });
  } catch (err) { next(err); }
});

/* ─── POST /scan — scan-first: find the active audit for this asset & mark Found ─
 * No audit id needed. Resolves the scanned code → asset → an in-progress audit
 * that includes it → marks it Found. Used by the mobile "Asset Audit" quick action.
 */
router.post("/scan", requirePermission("audit:conduct"), async (req, res, next) => {
  try {
    const { code, assetId } = req.body || {};
    const companyIds = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
    const ph = companyIds.map(() => "?").join(",");

    // Resolve the asset (explicit id, or the scanned QR/URL/barcode).
    if (!code && !assetId) return res.status(400).json({ message: "code or assetId required" });
    const resolvedId = await resolveScannedAsset(companyIds, code, assetId);
    if (!resolvedId) return res.json({ outcome: "unknown", message: "That code doesn't match any asset in your register." });

    // Find an in-progress audit (most recently started) that includes this asset.
    const [[item]] = await pool.query(
      `SELECT i.id, i.audit_id AS auditId, i.status, i.snapshot_name AS name, i.snapshot_code AS code,
              au.title AS auditTitle
       FROM asset_audit_items i
       JOIN asset_audits au ON au.id = i.audit_id
       WHERE i.company_id IN (${ph}) AND i.asset_id = ? AND au.status = 'in_progress'
       ORDER BY au.started_at DESC LIMIT 1`,
      [...companyIds, resolvedId]
    );
    if (!item) {
      const [[asset]] = await pool.query(`SELECT asset_name AS name FROM assets WHERE id=? LIMIT 1`, [resolvedId]);
      return res.json({ outcome: "no_audit", assetName: asset?.name || null, message: "No active audit includes this asset." });
    }

    await pool.query(
      `UPDATE asset_audit_items SET status='found', method='qr_scan', audited_by=?, audited_by_name=?, audited_at=NOW() WHERE id=?`,
      [req.companyUser.id, req.companyUser.fullName || req.companyUser.name || null, item.id]
    );
    const stats = await auditStats(item.auditId);
    emitToCompany(cid(req), "audit:progress", { id: item.auditId, stats });
    res.json({
      outcome: item.status === "found" ? "already_found" : "found",
      auditId: item.auditId, auditTitle: item.auditTitle,
      item: { id: item.id, name: item.name, code: item.code }, stats,
    });
  } catch (err) { next(err); }
});

/* ─── POST /:id/scan — resolve a scanned QR/code and mark Found ─────────────── */
router.post("/:id/scan", requirePermission("audit:conduct"), async (req, res, next) => {
  try {
    const { code, assetId } = req.body || {};
    const [[au]] = await pool.query(`SELECT id, status FROM asset_audits WHERE id=? AND company_id=?`, [req.params.id, cid(req)]);
    if (!au) return res.status(404).json({ message: "Audit not found" });
    if (au.status !== "in_progress") return res.status(409).json({ message: "Start the audit before scanning." });

    // Resolve the asset (explicit id, or the scanned QR/URL/barcode).
    if (!code && !assetId) return res.status(400).json({ message: "code or assetId required" });
    const resolvedId = await resolveScannedAsset([cid(req)], code, assetId);
    if (!resolvedId) return res.json({ outcome: "unknown", message: "That code doesn't match any asset in your register." });

    const [[item]] = await pool.query(
      `SELECT id, status, snapshot_name AS name, snapshot_code AS code FROM asset_audit_items WHERE audit_id=? AND asset_id=?`,
      [au.id, resolvedId]
    );
    if (!item) {
      const [[asset]] = await pool.query(`SELECT asset_name AS name FROM assets WHERE id=? AND company_id=?`, [resolvedId, cid(req)]);
      return res.json({ outcome: "out_of_scope", assetName: asset?.name || null, message: "That asset exists but isn't part of this audit's area." });
    }
    await pool.query(
      `UPDATE asset_audit_items SET status='found', method='qr_scan', audited_by=?, audited_by_name=?, audited_at=NOW() WHERE id=?`,
      [req.companyUser.id, req.companyUser.fullName || req.companyUser.name || null, item.id]
    );
    const stats = await auditStats(au.id);
    emitToCompany(cid(req), "audit:progress", { id: au.id, stats });
    res.json({ outcome: item.status === "found" ? "already_found" : "found", item: { id: item.id, name: item.name, code: item.code }, stats });
  } catch (err) { next(err); }
});

/* ─── GET /:id/report — reconciliation summary ─────────────────────────────── */
router.get("/:id/report", requirePermission("audit:view"), async (req, res, next) => {
  try {
    const [[au]] = await pool.query(`SELECT * FROM asset_audits WHERE id=? AND company_id=?`, [req.params.id, cid(req)]);
    if (!au) return res.status(404).json({ message: "Audit not found" });
    const stats = await auditStats(au.id);
    const [byDept] = await pool.query(
      `SELECT COALESCE(snapshot_department,'—') AS department,
              COUNT(*) AS total, SUM(status='found') AS found, SUM(status='not_found') AS notFound
       FROM asset_audit_items WHERE audit_id=? GROUP BY snapshot_department ORDER BY total DESC`, [au.id]
    );
    const [missing] = await pool.query(
      `SELECT snapshot_name AS name, snapshot_code AS code, snapshot_department AS department, snapshot_location AS location
       FROM asset_audit_items WHERE audit_id=? AND status='not_found' ORDER BY snapshot_name`, [au.id]
    );
    res.json({
      audit: { id: au.id, title: au.title, scopeLabel: au.scope_label, status: au.status, completedAt: au.completed_at },
      stats,
      byDepartment: byDept.map((d) => ({ department: d.department, total: Number(d.total), found: Number(d.found), notFound: Number(d.notFound) })),
      missing,
    });
  } catch (err) { next(err); }
});

export default router;
