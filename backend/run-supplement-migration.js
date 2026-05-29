/**
 * Safe MySQL column migration script
 * Adds all missing columns from supplement-mysql.sql using IF NOT EXISTS pattern
 * that works with MySQL 8.0 (which doesn't support ALTER TABLE ... ADD COLUMN IF NOT EXISTS)
 */
import pool from "./src/db.js";

async function colExists(conn, table, column) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function addCol(conn, table, column, def) {
  if (await colExists(conn, table, column)) {
    console.log(`  · ${table}.${column} already exists – skipped`);
  } else {
    await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
    console.log(`  ✓ ${table}.${column} added`);
  }
}

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("══════════════════════════════════════════════════════");
    console.log(" Supplement MySQL Migration — Missing Columns");
    console.log("══════════════════════════════════════════════════════");

    // ── company_users ─────────────────────────────────────────────────────────
    console.log("\n[1] company_users columns...");
    await addCol(conn, "company_users", "username",        "VARCHAR(100) NULL");
    await addCol(conn, "company_users", "push_token",      "VARCHAR(500) NULL");
    await addCol(conn, "company_users", "push_token_platform", "VARCHAR(10) NULL");
    await addCol(conn, "company_users", "permissions",     "JSON NULL");
    await addCol(conn, "company_users", "module_access",   "JSON NULL");

    // ── assets ────────────────────────────────────────────────────────────────
    console.log("\n[2] assets columns...");
    await addCol(conn, "assets", "open_flags_count", "INT NOT NULL DEFAULT 0");
    await addCol(conn, "assets", "health_status",    "VARCHAR(20) NOT NULL DEFAULT 'green'");
    await addCol(conn, "assets", "risk_level",       "VARCHAR(20) NOT NULL DEFAULT 'normal'");

    // ── companies ─────────────────────────────────────────────────────────────
    console.log("\n[3] companies columns...");
    await addCol(conn, "companies", "enabled_modules", "TEXT DEFAULT NULL");
    await addCol(conn, "companies", "logo_url",        "VARCHAR(500) DEFAULT NULL");

    // ── checklist_templates ───────────────────────────────────────────────────
    console.log("\n[4] checklist_templates columns...");
    await addCol(conn, "checklist_templates", "questions", "JSON NULL");
    await addCol(conn, "checklist_templates", "asset_id",  "INT UNSIGNED NULL");
    await addCol(conn, "checklist_templates", "shift_id",  "INT UNSIGNED NULL");

    // ── checklist_template_questions ──────────────────────────────────────────
    console.log("\n[5] checklist_template_questions columns...");
    await addCol(conn, "checklist_template_questions", "reference_image_url", "TEXT NULL");
    await addCol(conn, "checklist_template_questions", "question_image_url",  "TEXT NULL");

    // ── checklist_submissions ─────────────────────────────────────────────────
    console.log("\n[6] checklist_submissions columns...");
    await addCol(conn, "checklist_submissions", "company_user_id",  "INT UNSIGNED NULL");
    await addCol(conn, "checklist_submissions", "supervisor_id",    "INT UNSIGNED NULL");
    await addCol(conn, "checklist_submissions", "latitude",         "DOUBLE NULL");
    await addCol(conn, "checklist_submissions", "longitude",        "DOUBLE NULL");
    await addCol(conn, "checklist_submissions", "device_ip",        "VARCHAR(64) NULL");
    await addCol(conn, "checklist_submissions", "location_address", "TEXT NULL");

    // ── logsheet_templates ────────────────────────────────────────────────────
    console.log("\n[7] logsheet_templates columns...");
    await addCol(conn, "logsheet_templates", "layout_type", "VARCHAR(20) NOT NULL DEFAULT 'standard'");
    await addCol(conn, "logsheet_templates", "asset_id",    "INT UNSIGNED NULL");
    await addCol(conn, "logsheet_templates", "frequency",   "VARCHAR(20) NOT NULL DEFAULT 'daily'");
    await addCol(conn, "logsheet_templates", "shift_id",    "INT UNSIGNED NULL");

    // ── logsheet_entries ──────────────────────────────────────────────────────
    console.log("\n[8] logsheet_entries columns...");
    await addCol(conn, "logsheet_entries", "company_user_id",  "INT UNSIGNED NULL");
    await addCol(conn, "logsheet_entries", "latitude",         "DOUBLE NULL");
    await addCol(conn, "logsheet_entries", "longitude",        "DOUBLE NULL");
    await addCol(conn, "logsheet_entries", "device_ip",        "VARCHAR(64) NULL");
    await addCol(conn, "logsheet_entries", "location_address", "TEXT NULL");

    // ── work_orders ───────────────────────────────────────────────────────────
    console.log("\n[9] work_orders columns...");
    await addCol(conn, "work_orders", "flag_id",         "INT UNSIGNED NULL");
    await addCol(conn, "work_orders", "issue_source",    "VARCHAR(80)  NULL");
    await addCol(conn, "work_orders", "company_id",      "INT UNSIGNED NULL");
    await addCol(conn, "work_orders", "company_user_id", "INT UNSIGNED NULL");
    await addCol(conn, "work_orders", "cp_assigned_to",  "INT UNSIGNED NULL");
    await addCol(conn, "work_orders", "source_label",    "VARCHAR(80)  NULL");
    await addCol(conn, "work_orders", "completion_note", "TEXT NULL");
    await addCol(conn, "work_orders", "escalation_level", "INT NOT NULL DEFAULT 0");
    await addCol(conn, "work_orders", "escalation_interval_minutes", "INT NOT NULL DEFAULT 60");
    await addCol(conn, "work_orders", "escalation_note", "TEXT NULL");
    await addCol(conn, "work_orders", "updated_at",      "DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");
    await addCol(conn, "work_orders", "expected_completion_at", "DATETIME NULL");
    await addCol(conn, "work_orders", "on_hold_reason",  "TEXT NULL");
    await addCol(conn, "work_orders", "department_id",   "INT UNSIGNED NULL");
    await addCol(conn, "work_orders", "cutoff_time",     "DATETIME NULL");
    await addCol(conn, "work_orders", "is_overdue",      "TINYINT(1) NOT NULL DEFAULT 0");

    // ── logsheet_questions extra cols ─────────────────────────────────────────
    console.log("\n[10] logsheet_questions columns...");
    await addCol(conn, "logsheet_questions", "rule_json", "JSON NULL");
    await addCol(conn, "logsheet_questions", "priority",  "ENUM('low','medium','high','critical') NOT NULL DEFAULT 'medium'");
    await addCol(conn, "logsheet_questions", "issue_detail", "JSON NULL");

    // ── logsheet_entries status ───────────────────────────────────────────────
    console.log("\n[11] logsheet_entries.status...");
    await addCol(conn, "logsheet_entries", "status", "ENUM('draft','submitted') NOT NULL DEFAULT 'submitted'");

    // ── asset_queries: closed status + updated_at ─────────────────────────────
    console.log("\n[12] asset_queries columns...");
    await addCol(conn, "asset_queries", "updated_at", "DATETIME DEFAULT NOW()");

    console.log("\n✓ All missing columns added successfully!");
  } finally {
    conn.release();
    process.exit(0);
  }
}

run().catch((err) => { console.error("Migration failed:", err.message); process.exit(1); });
