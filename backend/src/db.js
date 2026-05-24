import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { config as dotenvConfig } from "dotenv";
import mysql from "mysql2/promise";

// Load .env from backend root — works regardless of where node is invoked from
const __envDir = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__envDir, "../.env") });

// ── Connection pool ────────────────────────────────────────────────────────────
const poolInstance = mysql.createPool({
  host:               process.env.DB_HOST     || "127.0.0.1",
  port:               Number(process.env.DB_PORT || 3306),
  user:               process.env.DB_USER     || "root",
  password:           process.env.DB_PASSWORD || "",
  database:           process.env.DB_NAME     || "fmapp",
  waitForConnections: true,
  connectionLimit:    Number(process.env.DB_POOL_SIZE || 10),
  connectTimeout:     Number(process.env.DB_CONNECT_TIMEOUT_MS || 10000),
  timezone:           "+00:00",
  dateStrings:        false,
});

// ── SQL compatibility: normalise PostgreSQL-isms to MySQL ──────────────────────
//
// The route files were written targeting PostgreSQL/Supabase. This layer
// transparently converts the small subset of PG-only syntax used in DML
// queries so that mysql2 receives valid MySQL SQL.
//
// Transformations applied (in order):
//  1. RETURNING <cols>        → stripped (insertId comes from OkPacket)
//  2. INTERVAL 'N unit'       → INTERVAL N unit  (PG → MySQL literal)
//  3. ::type cast             → stripped  (e.g. ::int, ::text, ::boolean, ::jsonb)
//  4. date_trunc('part',expr) → DATE_FORMAT / DATE_SUB equivalents
//  5. BOOLEAN NOT NULL DEFAULT → TINYINT(1) NOT NULL DEFAULT  (DDL calls)
//  6. SERIAL PRIMARY KEY      → INT NOT NULL AUTO_INCREMENT PRIMARY KEY (DDL)
//  7. TIMESTAMPTZ / BIGSERIAL → TIMESTAMP / BIGINT (DDL)
//  8. JSONB                   → JSON  (DDL)
//  9. DEFAULT NOW()           → already MySQL-compatible — no change needed
// 10. CREATE UNIQUE INDEX … WHERE → stripped (partial indexes unsupported)
// 11. DROP CONSTRAINT IF EXISTS → ALTER TABLE … DROP INDEX (best-effort)
// 12. ON CONFLICT … DO UPDATE  → ON DUPLICATE KEY UPDATE  (upserts)
//
// DDL auto-migration calls in the routes are all wrapped in .catch(() => {})
// so any remaining incompatibilities are silently swallowed.

function normalizeSql(sql) {
  let s = sql;

  // 1. Strip RETURNING clause (INSERT/UPDATE … RETURNING …) — must handle multiline
  //    RETURNING is always at the end of the statement, so strip from RETURNING to EOF.
  s = s.replace(/\bRETURNING\b[\s\S]*/i, "");

  // 2. INTERVAL 'N unit' → INTERVAL N unit
  s = s.replace(/INTERVAL\s+'(\d+)\s+(second|minute|hour|day|week|month|year)s?'/gi,
    (_, n, unit) => `INTERVAL ${n} ${unit.toUpperCase()}`);

  // 3. Strip PostgreSQL type casts ::type
  s = s.replace(/::(int|integer|bigint|text|boolean|bool|jsonb|json|float|numeric|varchar\([^)]+\)|date|timestamp)/gi, "");

  // 4. date_trunc('week', expr) → DATE_FORMAT(expr, '%Y-%u') and similar
  s = s.replace(/date_trunc\s*\(\s*'week'\s*,\s*([^)]+)\)/gi,
    (_, expr) => `DATE_FORMAT(${expr}, '%Y-%u')`);
  s = s.replace(/date_trunc\s*\(\s*'month'\s*,\s*([^)]+)\)/gi,
    (_, expr) => `DATE_FORMAT(${expr}, '%Y-%m')`);
  s = s.replace(/date_trunc\s*\(\s*'year'\s*,\s*([^)]+)\)/gi,
    (_, expr) => `DATE_FORMAT(${expr}, '%Y')`);

  // 5. BOOLEAN NOT NULL → TINYINT(1) NOT NULL  (DDL)
  s = s.replace(/\bBOOLEAN\b/gi, "TINYINT(1)");

  // 6. SERIAL PRIMARY KEY → INT NOT NULL AUTO_INCREMENT PRIMARY KEY  (DDL)
  s = s.replace(/\bBIGSERIAL\b/gi, "BIGINT NOT NULL AUTO_INCREMENT");
  s = s.replace(/\bSERIAL\b/gi, "INT NOT NULL AUTO_INCREMENT");

  // 7. TIMESTAMPTZ → DATETIME / BIGSERIAL handled above  (DDL)
  s = s.replace(/\bTIMESTAMPTZ\b/gi, "DATETIME");

  // 8. JSONB → JSON  (DDL)
  s = s.replace(/\bJSONB\b/gi, "JSON");

  // 9. DEFAULT '{}'::jsonb or DEFAULT '[]'::jsonb → no default (JSON can't have non-NULL default in MySQL 8.0 < 8.0.13)
  s = s.replace(/DEFAULT\s+'(\{\}|\[\])'/gi, "");

  // 10. Strip partial index WHERE clause in CREATE INDEX
  s = s.replace(/(CREATE\s+(?:UNIQUE\s+)?INDEX\s+[^\n(]+\([^)]+\))\s+WHERE\s+[^\n;]+/gi, "$1");

  // 11. ON CONFLICT (cols) DO UPDATE SET → ON DUPLICATE KEY UPDATE
  s = s.replace(/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET\b/gi, "ON DUPLICATE KEY UPDATE");
  // Strip EXCLUDED. references (not valid in MySQL ON DUPLICATE KEY)
  s = s.replace(/\bEXCLUDED\.\w+/gi, "VALUES($&)".replace("VALUES(EXCLUDED.", "VALUES(").replace(")", ""));

  // 12. COUNT(...)::int or similar already handled by rule 3

  // 13. ADD COLUMN IF NOT EXISTS → ADD COLUMN  (MySQL doesn't support IF NOT EXISTS on ADD COLUMN)
  s = s.replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, "ADD COLUMN");

  // 14. DROP CONSTRAINT IF EXISTS name → DROP INDEX name (best-effort for MySQL)
  s = s.replace(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+(\w+)/gi, "DROP INDEX $1");

  // 15. EXTRACT(EPOCH FROM (expr1 - expr2)) → TIMESTAMPDIFF(SECOND, expr2, expr1)
  //     Handles: EXTRACT(EPOCH FROM (NOW() - col)) / divisor → TIMESTAMPDIFF(SECOND, col, NOW()) / divisor
  s = s.replace(/EXTRACT\s*\(\s*EPOCH\s+FROM\s*\(\s*(NOW\(\))\s*-\s*([^)]+)\)\s*\)/gi,
    (_, _now, col) => `TIMESTAMPDIFF(SECOND, ${col.trim()}, NOW())`);
  s = s.replace(/EXTRACT\s*\(\s*EPOCH\s+FROM\s*\(\s*([^-\s][^-]*?)\s*-\s*([^)]+)\)\s*\)/gi,
    (_, expr1, expr2) => `TIMESTAMPDIFF(SECOND, ${expr2.trim()}, ${expr1.trim()})`);

  // 16. NULLS LAST / NULLS FIRST → stripped (MySQL doesn't support it;
  //     MySQL DESC already sorts NULLs last, ASC sorts them first — closest match)
  s = s.replace(/\s+NULLS\s+(LAST|FIRST)\b/gi, "");

  return s;
}

// ── Retry logic ────────────────────────────────────────────────────────────────
const RETRY_ATTEMPTS   = Number(process.env.DB_RETRY_ATTEMPTS || 3);
const RETRY_DELAY_MS   = Number(process.env.DB_RETRY_BASE_DELAY_MS || 300);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const isTransient = (err) => {
  const c = String(err?.code || "").toUpperCase();
  return ["ETIMEDOUT", "ECONNRESET", "ENETUNREACH", "ECONNREFUSED", "PROTOCOL_CONNECTION_LOST"].includes(c);
};

async function withRetry(fn) {
  let last;
  for (let i = 1; i <= RETRY_ATTEMPTS; i++) {
    try { return await fn(); }
    catch (err) {
      last = err;
      if (i < RETRY_ATTEMPTS && isTransient(err)) { await wait(RETRY_DELAY_MS * i); continue; }
      throw err;
    }
  }
  throw last;
}

// ── Core execute wrapper ───────────────────────────────────────────────────────
// Returns [rows, okPacket] – exactly the mysql2 promise API shape.
// Route code already expects this tuple:  const [rows] = await pool.query(...)
async function run(executor, sql, params = []) {
  const normalized = normalizeSql(sql);  // strips RETURNING among other things
  const values     = params || [];

  // ── RETURNING emulation for MySQL ─────────────────────────────────────────
  // PostgreSQL's RETURNING clause is unsupported by MySQL.  normalizeSql strips
  // it, which leaves the route receiving an OkPacket instead of the row array
  // it expects.  We detect it here, execute the DML, then re-fetch the affected
  // row with a SELECT so every caller continues to get [rows, fields].
  //
  // Assumptions (hold throughout this codebase):
  //   INSERT – mysql2 OkPacket.insertId is the new row's PK.
  //   UPDATE – the primary-key value is the LAST bound parameter.
  const returningMatch = /\bRETURNING\b\s+([\s\S]+)/i.exec(sql);
  if (returningMatch) {
    const cols      = returningMatch[1].trim().replace(/\s*;?\s*$/, "");
    const tableMatch = /^\s*(?:INSERT\s+INTO|UPDATE)\s+`?(\w+)`?/i.exec(normalized);
    const isInsert   = /^\s*INSERT\b/i.test(normalized.trimStart());

    const [okPacket] = await withRetry(() => executor.query(normalized, values));

    if (tableMatch) {
      const table = tableMatch[1];
      const rowId  = isInsert
        ? okPacket.insertId                // INSERT → new auto-increment id
        : values[values.length - 1];      // UPDATE → id is always last param
      if (rowId != null && rowId !== "" && rowId !== 0) {
        return await withRetry(() =>
          executor.query(`SELECT ${cols} FROM \`${table}\` WHERE id = ?`, [rowId])
        );
      }
    }
    // Fallback: wrap OkPacket so destructuring `const [rows] = …` still works
    return [[okPacket], []];
  }

  const result = await withRetry(() => executor.query(normalized, values));
  // mysql2 returns [rows, fields] for SELECT and [OkPacket, fields] for DML
  return result;
}

// ── Public pool object ─────────────────────────────────────────────────────────
const pool = {
  query:   (sql, params) => run(poolInstance, sql, params),
  execute: (sql, params) => run(poolInstance, sql, params),

  getConnection: async () => {
    const conn = await withRetry(() => poolInstance.getConnection());
    const runner = (sql, params) => run(conn, sql, params);
    return {
      query:            runner,
      execute:          runner,
      beginTransaction: () => conn.beginTransaction(),
      commit:           () => conn.commit(),
      rollback:         () => conn.rollback(),
      release:          () => conn.release(),
    };
  },
};

export default pool;

// ── Migration helper ───────────────────────────────────────────────────────────
// Returns true for errors that are expected and harmless during startup
// migrations (column already exists, key already exists, deadlock on
// concurrent startup, etc.).  Callers should stay silent for these.
export const isMigrationSafeError = (err) => {
  const safeCodes = new Set([
    "ER_DUP_FIELDNAME",       // 1060 – ADD COLUMN on existing column
    "ER_CANT_DROP_FIELD_OR_KEY", // 1091 – DROP on non-existent column/key
    "ER_DUP_KEYNAME",         // 1061 – CREATE INDEX / key already exists
    "ER_LOCK_DEADLOCK",       // 1213 – concurrent startup deadlock
    "ER_TABLE_EXISTS_ERROR",  // 1050 – CREATE TABLE IF NOT EXISTS (safety)
    "ER_DUP_ENTRY",           // 1062 – unique constraint on data seed rows
  ]);
  if (safeCodes.has(err?.code)) return true;
  // Fallback: match common message fragments for DBs that use numeric codes
  return /duplicate column|duplicate key|can'?t drop|deadlock|already exists/i.test(err?.message || "");
};
