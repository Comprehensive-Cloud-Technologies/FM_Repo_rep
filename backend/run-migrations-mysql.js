#!/usr/bin/env node
/**
 * run-migrations-mysql.js
 * Applies all *.sql files in backend/sql/migrations/ in lexicographic order.
 * Uses the same normalizeSql transformation as db.js to convert PostgreSQL/MariaDB
 * syntax to MySQL-compatible SQL before execution.
 *
 * Usage:
 *   node run-migrations-mysql.js
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "sql", "migrations");

// ── Same normalizeSql from db.js ───────────────────────────────────────────────
function normalizeSql(sql) {
  let s = sql;
  s = s.replace(/\bRETURNING\b[\s\S]*/i, "");
  s = s.replace(/INTERVAL\s+'(\d+)\s+(second|minute|hour|day|week|month|year)s?'/gi,
    (_, n, unit) => `INTERVAL ${n} ${unit.toUpperCase()}`);
  s = s.replace(/::(int|integer|bigint|text|boolean|bool|jsonb|json|float|numeric|varchar\([^)]+\)|date|timestamp)/gi, "");
  s = s.replace(/date_trunc\s*\(\s*'week'\s*,\s*([^)]+)\)/gi,
    (_, expr) => `DATE_FORMAT(${expr}, '%Y-%u')`);
  s = s.replace(/date_trunc\s*\(\s*'month'\s*,\s*([^)]+)\)/gi,
    (_, expr) => `DATE_FORMAT(${expr}, '%Y-%m')`);
  s = s.replace(/date_trunc\s*\(\s*'year'\s*,\s*([^)]+)\)/gi,
    (_, expr) => `DATE_FORMAT(${expr}, '%Y')`);
  s = s.replace(/\bBOOLEAN\b/gi, "TINYINT(1)");
  s = s.replace(/\bBIGSERIAL\b/gi, "BIGINT NOT NULL AUTO_INCREMENT");
  s = s.replace(/\bSERIAL\b/gi, "INT NOT NULL AUTO_INCREMENT");
  s = s.replace(/\bTIMESTAMPTZ\b/gi, "DATETIME");
  s = s.replace(/\bJSONB\b/gi, "JSON");
  s = s.replace(/DEFAULT\s+'(\{\}|\[\])'/gi, "");
  s = s.replace(/(CREATE\s+(?:UNIQUE\s+)?INDEX\s+[^\n(]+\([^)]+\))\s+WHERE\s+[^\n;]+/gi, "$1");
  s = s.replace(/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET\b/gi, "ON DUPLICATE KEY UPDATE");
  s = s.replace(/\bEXCLUDED\.\w+/gi, "VALUES($&)".replace("VALUES(EXCLUDED.", "VALUES(").replace(")", ""));
  // Key fix: ADD COLUMN IF NOT EXISTS → ADD COLUMN  (MariaDB-only in ALTER TABLE)
  s = s.replace(/\bADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\b/gi, "ADD COLUMN");
  s = s.replace(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+(\w+)/gi, "DROP INDEX $1");
  // CREATE INDEX IF NOT EXISTS → CREATE INDEX  (MySQL 8.0 doesn't support IF NOT EXISTS on INDEX)
  s = s.replace(/\bCREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\b/gi, "CREATE $1INDEX");
  s = s.replace(/EXTRACT\s*\(\s*EPOCH\s+FROM\s*\(\s*(NOW\(\))\s*-\s*([^)]+)\)\s*\)/gi,
    (_, _now, col) => `TIMESTAMPDIFF(SECOND, ${col.trim()}, NOW())`);
  s = s.replace(/EXTRACT\s*\(\s*EPOCH\s+FROM\s*\(\s*([^-\s][^-]*?)\s*-\s*([^)]+)\)\s*\)/gi,
    (_, expr1, expr2) => `TIMESTAMPDIFF(SECOND, ${expr2.trim()}, ${expr1.trim()})`);
  s = s.replace(/\s+NULLS\s+(LAST|FIRST)\b/gi, "");
  // BIGINT references → INT UNSIGNED for FK compatibility
  s = s.replace(/\bBIGINT\b/gi, "BIGINT");
  // DEFAULT FALSE / TRUE → 0 / 1
  s = s.replace(/\bDEFAULT\s+FALSE\b/gi, "DEFAULT 0");
  s = s.replace(/\bDEFAULT\s+TRUE\b/gi, "DEFAULT 1");
  // NOT NULL DEFAULT FALSE/TRUE (already handled above, but catch variations)
  s = s.replace(/\bFALSE\b/gi, "0");
  s = s.replace(/\bTRUE\b/gi, "1");
  // ALTER COLUMN x DROP NOT NULL → MODIFY COLUMN x type NULL
  // (Can't do without schema knowledge; mark as comment so it's skipped)
  s = s.replace(/\bALTER\s+COLUMN\s+(\w+)\s+DROP\s+NOT\s+NULL\b/gi, "-- SKIPPED_PG: ALTER COLUMN $1 DROP NOT NULL");
  s = s.replace(/\bALTER\s+COLUMN\s+(\w+)\s+SET\s+NOT\s+NULL\b/gi,  "-- SKIPPED_PG: ALTER COLUMN $1 SET NOT NULL");
  // ON CONFLICT DO NOTHING → strip entirely (INSERT will just fail on dup and be safe)
  s = s.replace(/\s*ON\s+CONFLICT\s*(?:\([^)]+\))?\s*DO\s+NOTHING/gi, "");
  s = s.replace(/\s*ON\s+CONFLICT\s+DO\s+NOTHING/gi, "");
  // DROP INDEX IF EXISTS → strip IF EXISTS only
  s = s.replace(/\bDROP\s+INDEX\s+IF\s+EXISTS\s+(\w+)/gi, "DROP INDEX $1 ON __PLACEHOLDER__");
  // CREATE UNIQUE INDEX on LOWER(col) → strip LOWER() function
  s = s.replace(/\bCREATE\s+(UNIQUE\s+)?INDEX\s+(\w+)\s+ON\s+(\w+)\s*\(\s*LOWER\s*\((\w+)\)\s*\)/gi,
    "CREATE $1INDEX $2 ON $3($4)");
  // UPDATE t1 alias SET ... FROM t2 → mark as PG-only so it's caught by isPgOnlyBlock
  // These are all backfill queries; safe to skip on fresh installs
  s = s.replace(/^(UPDATE\s+\w+\s+\w+\s+SET\b[\s\S]*?\bFROM\b)/gim, "-- PG_UPDATE_FROM: $1");
  return s;
}

// ── Safe error codes – errors we can ignore during migration ───────────────────
const SAFE_CODES = new Set([
  "ER_DUP_FIELDNAME",              // 1060 – column already exists
  "ER_CANT_DROP_FIELD_OR_KEY",     // 1091 – drop non-existent
  "ER_DUP_KEYNAME",                // 1061 – index already exists
  "ER_TABLE_EXISTS_ERROR",         // 1050 – table already exists
  "ER_DUP_ENTRY",                  // 1062 – duplicate data
  "ER_NO_SUCH_TABLE",              // 1146 – skip if table missing
  "ER_BAD_INDEX_ERROR",            // 1073 – index error variants
  "ER_FK_DUP_NAME",                // 1826 – duplicate FK constraint name
  "ER_BAD_FIELD_ERROR",            // 1054 – unknown column
  "ER_CHECK_CONSTRAINT_DUP_NAME",  // – duplicate CHECK constraint name
  "ER_UNKNOWN_SYSTEM_VARIABLE",    // – mangled backfill query (safe to skip)
]);

function isSafe(err) {
  if (SAFE_CODES.has(err?.code)) return true;
  return /duplicate column|duplicate key|can'?t drop|already exists|doesn't exist/i.test(err?.message || "");
}

// ── Detect PostgreSQL-only or mangled blocks that can't run on MySQL ────────────
function isPgOnlyBlock(stmt) {
  const s = stmt.trim();
  // Anonymous DO $$ ... $$ blocks
  if (/^DO\s*(\$\$|')/i.test(s)) return true;
  // RAISE NOTICE (PG-only)
  if (/^RAISE\s+NOTICE/i.test(s)) return true;
  // Bare IF/END IF/RETURN without CREATE/ALTER context
  if (/^(END\s+IF|RETURN|END\s*\$\$)\s*;?$/i.test(s)) return true;
  // COMMENT ON COLUMN (PostgreSQL DDL, not MySQL)
  if (/^COMMENT\s+ON\s+/i.test(s)) return true;
  // Bare BEGIN (PG anonymous block start without MySQL context)
  if (/^BEGIN\s*(?:--|$)/i.test(s)) return true;
  // Bare END, $$
  if (/^(END|\$\$)\s*;?$/i.test(s)) return true;
  // PG IF condition (without stored procedure context)
  if (/^IF\s+\w+\s+IS\s+(NULL|NOT)/i.test(s)) return true;
  // Backfill comments we inserted
  if (/^--\s*PG_UPDATE_FROM/i.test(s)) return true;
  if (/^--\s*SKIPPED_PG/i.test(s)) return true;
  // DROP INDEX ... ON __PLACEHOLDER__ (we mangled it)
  if (/__PLACEHOLDER__/.test(s)) return true;
  // PG anonymous block: BEGIN ... SELECT x INTO var (PL/pgSQL variable assignment)
  if (/BEGIN\b[\s\S]*SELECT\s+\w+\s+INTO\s+\w+/i.test(s)) return true;
  return false;
}

// ── Split SQL into individual statements ───────────────────────────────────────
// Splits on semicolons, respects quoted strings and DELIMITER blocks
function splitStatements(sql) {
  const stmts = [];
  let current = "";
  let delimiter = ";";
  const lines = sql.split(/\r?\n/);

  for (const line of lines) {
    const delimMatch = /^\s*DELIMITER\s+(\S+)/i.exec(line);
    if (delimMatch) {
      if (current.trim()) { stmts.push(current.trim()); current = ""; }
      delimiter = delimMatch[1];
      continue;
    }

    if (line.trimEnd().endsWith(delimiter)) {
      current += line.slice(0, line.lastIndexOf(delimiter)) + "\n";
      if (current.trim()) stmts.push(current.trim());
      current = "";
    } else {
      current += line + "\n";
    }
  }
  if (current.trim()) stmts.push(current.trim());
  // Filter out empty statements or pure comment blocks
  return stmts.filter(s => {
    const nonComment = s.replace(/--[^\n]*/g, "").trim();
    return nonComment.length > 0;
  });
}

async function main() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || "localhost",
    port:     Number(process.env.DB_PORT || 3306),
    user:     process.env.DB_USER     || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME     || "fmapp",
    multipleStatements: true,
    connectTimeout: 10000,
  });

  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();

  let totalOk = 0;
  let totalSkipped = 0;
  let totalErr = 0;

  for (const file of files) {
    const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const normalized = normalizeSql(raw);
    // Split into individual statements for error isolation
    const stmts = splitStatements(normalized);

    process.stdout.write(`\n▶ ${file} (${stmts.length} stmts) `);

    let fileOk = 0, fileSkip = 0, fileErr = 0;

    for (const stmt of stmts) {
      const s = stmt.trim();
      // Remove comment lines and check if any real SQL remains
      const sqlContent = s.replace(/--[^\n]*/g, "").trim();
      if (!sqlContent) continue;
      if (isPgOnlyBlock(sqlContent)) { fileSkip++; continue; }

      try {
        await conn.query(s);
        fileOk++;
      } catch (err) {
        if (isSafe(err)) {
          fileSkip++;
        } else {
          console.error(`\n  ✗ [${err.code}] ${err.message}`);
          console.error(`    SQL: ${s.slice(0, 150).replace(/\n/g, " ")}`);
          fileErr++;
        }
      }
    }

    console.log(`→ ✓${fileOk} ⚠${fileSkip} ✗${fileErr}`);
    totalOk += fileOk;
    totalSkipped += fileSkip;
    totalErr += fileErr;
  }

  await conn.end();

  console.log(`\n${"=".repeat(50)}`);
  console.log(`DONE: ${totalOk} ok, ${totalSkipped} skipped, ${totalErr} errors`);
  if (totalErr > 0) process.exit(1);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
