/**
 * Comprehensive MySQL column migration — safe check-then-ALTER pattern.
 * Covers ALL columns referenced in backend routes that may be missing on EC2.
 * MySQL 8 does NOT support ADD COLUMN IF NOT EXISTS — hence this script.
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
    console.log(`  · ${table}.${column} — already exists`);
  } else {
    await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
    console.log(`  ✓ ${table}.${column} — added`);
  }
}

async function tableExists(conn, table) {
  const [rows] = await conn.execute(
    `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return rows.length > 0;
}

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("=== Full Comprehensive Column Migration ===\n");

    // ── companies ────────────────────────────────────────────────────────────
    console.log("[1] companies");
    await addCol(conn, "companies", "public_token", "VARCHAR(64) DEFAULT NULL");
    await addCol(conn, "companies", "enabled_modules", "TEXT DEFAULT NULL");
    await addCol(conn, "companies", "logo_url", "VARCHAR(500) DEFAULT NULL");
    await addCol(conn, "companies", "sector", "VARCHAR(80) DEFAULT NULL");
    await addCol(conn, "companies", "sectors", "TEXT DEFAULT NULL");
    await addCol(conn, "companies", "entity_type", "VARCHAR(80) DEFAULT NULL");
    await addCol(conn, "companies", "facility_type", "VARCHAR(80) DEFAULT NULL");
    await addCol(conn, "companies", "contact_person_name", "VARCHAR(160) DEFAULT NULL");
    await addCol(conn, "companies", "contact_person_phone", "VARCHAR(32) DEFAULT NULL");
    await addCol(conn, "companies", "contact_email", "VARCHAR(160) DEFAULT NULL");

    // ── work_orders ──────────────────────────────────────────────────────────
    console.log("\n[2] work_orders");
    await addCol(conn, "work_orders", "cp_assigned_to", "INT DEFAULT NULL");
    await addCol(conn, "work_orders", "cp_created_by", "INT DEFAULT NULL");
    await addCol(conn, "work_orders", "assigned_note", "TEXT DEFAULT NULL");
    await addCol(conn, "work_orders", "escalation_level", "INT NOT NULL DEFAULT 0");
    await addCol(conn, "work_orders", "expected_completion_at", "DATETIME DEFAULT NULL");
    await addCol(conn, "work_orders", "escalation_interval_minutes", "INT DEFAULT NULL");
    await addCol(conn, "work_orders", "escalation_note", "TEXT DEFAULT NULL");
    await addCol(conn, "work_orders", "closed_at", "DATETIME DEFAULT NULL");
    await addCol(conn, "work_orders", "flag_id", "INT DEFAULT NULL");
    await addCol(conn, "work_orders", "company_id", "INT DEFAULT NULL");
    await addCol(conn, "work_orders", "issue_source", "VARCHAR(60) DEFAULT NULL");
    await addCol(conn, "work_orders", "asset_name", "VARCHAR(200) DEFAULT NULL");
    await addCol(conn, "work_orders", "location", "VARCHAR(255) DEFAULT NULL");
    await addCol(conn, "work_orders", "issue_description", "TEXT DEFAULT NULL");
    await addCol(conn, "work_orders", "work_order_number", "VARCHAR(30) DEFAULT NULL");
    await addCol(conn, "work_orders", "updated_at", "DATETIME DEFAULT NOW() ON UPDATE NOW()");

    // ── company_users ────────────────────────────────────────────────────────
    console.log("\n[3] company_users");
    await addCol(conn, "company_users", "shift", "VARCHAR(60) DEFAULT NULL");
    await addCol(conn, "company_users", "service_domain", "VARCHAR(60) DEFAULT 'technical'");
    await addCol(conn, "company_users", "supervisor_id", "INT DEFAULT NULL");
    await addCol(conn, "company_users", "username", "VARCHAR(100) DEFAULT NULL");
    await addCol(conn, "company_users", "push_token", "VARCHAR(500) DEFAULT NULL");
    await addCol(conn, "company_users", "push_token_platform", "VARCHAR(10) DEFAULT NULL");
    await addCol(conn, "company_users", "permissions", "JSON DEFAULT NULL");
    await addCol(conn, "company_users", "module_access", "JSON DEFAULT NULL");

    // ── assets ───────────────────────────────────────────────────────────────
    console.log("\n[4] assets");
    await addCol(conn, "assets", "assigned_to", "INT DEFAULT NULL");
    await addCol(conn, "assets", "assigned_by", "INT DEFAULT NULL");
    await addCol(conn, "assets", "assigned_at", "DATETIME DEFAULT NULL");
    await addCol(conn, "assets", "open_flags_count", "INT NOT NULL DEFAULT 0");
    await addCol(conn, "assets", "health_status", "VARCHAR(20) NOT NULL DEFAULT 'green'");
    await addCol(conn, "assets", "risk_level", "VARCHAR(20) NOT NULL DEFAULT 'normal'");

    // ── checklist_templates ──────────────────────────────────────────────────
    console.log("\n[5] checklist_templates");
    await addCol(conn, "checklist_templates", "questions", "JSON DEFAULT NULL");
    await addCol(conn, "checklist_templates", "asset_id", "INT UNSIGNED DEFAULT NULL");
    await addCol(conn, "checklist_templates", "shift_id", "INT UNSIGNED DEFAULT NULL");

    // ── checklist_template_questions ─────────────────────────────────────────
    console.log("\n[6] checklist_template_questions");
    await addCol(conn, "checklist_template_questions", "reference_image_url", "TEXT DEFAULT NULL");
    await addCol(conn, "checklist_template_questions", "question_image_url", "TEXT DEFAULT NULL");

    // ── checklist_submissions ────────────────────────────────────────────────
    console.log("\n[7] checklist_submissions");
    await addCol(conn, "checklist_submissions", "company_user_id", "INT UNSIGNED DEFAULT NULL");
    await addCol(conn, "checklist_submissions", "supervisor_id", "INT UNSIGNED DEFAULT NULL");
    await addCol(conn, "checklist_submissions", "latitude", "DOUBLE DEFAULT NULL");
    await addCol(conn, "checklist_submissions", "longitude", "DOUBLE DEFAULT NULL");
    await addCol(conn, "checklist_submissions", "device_ip", "VARCHAR(64) DEFAULT NULL");
    await addCol(conn, "checklist_submissions", "location_address", "TEXT DEFAULT NULL");

    // ── logsheet_templates ───────────────────────────────────────────────────
    console.log("\n[8] logsheet_templates");
    await addCol(conn, "logsheet_templates", "layout_type", "VARCHAR(20) NOT NULL DEFAULT 'standard'");
    await addCol(conn, "logsheet_templates", "asset_id", "INT UNSIGNED DEFAULT NULL");
    await addCol(conn, "logsheet_templates", "frequency", "VARCHAR(20) NOT NULL DEFAULT 'daily'");
    await addCol(conn, "logsheet_templates", "shift_id", "INT UNSIGNED DEFAULT NULL");

    // ── logsheet_entries ─────────────────────────────────────────────────────
    console.log("\n[9] logsheet_entries");
    await addCol(conn, "logsheet_entries", "company_user_id", "INT UNSIGNED DEFAULT NULL");
    await addCol(conn, "logsheet_entries", "latitude", "DOUBLE DEFAULT NULL");
    await addCol(conn, "logsheet_entries", "longitude", "DOUBLE DEFAULT NULL");
    await addCol(conn, "logsheet_entries", "device_ip", "VARCHAR(64) DEFAULT NULL");
    await addCol(conn, "logsheet_entries", "location_address", "TEXT DEFAULT NULL");
    await addCol(conn, "logsheet_entries", "status", "VARCHAR(20) NOT NULL DEFAULT 'submitted'");
    await addCol(conn, "logsheet_entries", "data", "JSON DEFAULT NULL");

    // ── logsheet_questions ───────────────────────────────────────────────────
    console.log("\n[10] logsheet_questions");
    await addCol(conn, "logsheet_questions", "rule_json", "JSON DEFAULT NULL");
    await addCol(conn, "logsheet_questions", "priority", "VARCHAR(20) DEFAULT NULL");
    await addCol(conn, "logsheet_questions", "issue_detail", "TEXT DEFAULT NULL");

    // ── asset_queries ────────────────────────────────────────────────────────
    console.log("\n[11] asset_queries");
    await addCol(conn, "asset_queries", "raised_by", "INT DEFAULT NULL");
    await addCol(conn, "asset_queries", "title", "VARCHAR(500) DEFAULT NULL");
    await addCol(conn, "asset_queries", "description", "TEXT DEFAULT NULL");
    await addCol(conn, "asset_queries", "images", "JSON DEFAULT NULL");
    await addCol(conn, "asset_queries", "priority", "VARCHAR(20) DEFAULT 'normal'");
    await addCol(conn, "asset_queries", "escalation_level", "INT DEFAULT 0");
    await addCol(conn, "asset_queries", "cutoff_hours", "INT DEFAULT 24");
    await addCol(conn, "asset_queries", "resolved_by", "INT DEFAULT NULL");
    await addCol(conn, "asset_queries", "resolution_note", "TEXT DEFAULT NULL");
    await addCol(conn, "asset_queries", "requester_name", "VARCHAR(255) DEFAULT NULL");
    await addCol(conn, "asset_queries", "close_code", "VARCHAR(10) DEFAULT NULL");
    await addCol(conn, "asset_queries", "updated_at", "DATETIME DEFAULT NOW() ON UPDATE NOW()");

    // ── notifications ────────────────────────────────────────────────────────
    console.log("\n[12] notifications");
    await addCol(conn, "notifications", "company_id", "INT DEFAULT NULL");
    await addCol(conn, "notifications", "recipient_id", "INT DEFAULT NULL");
    await addCol(conn, "notifications", "flag_id", "INT DEFAULT NULL");
    await addCol(conn, "notifications", "type", "VARCHAR(60) DEFAULT 'flag_raised'");
    await addCol(conn, "notifications", "title", "VARCHAR(500) DEFAULT NULL");
    await addCol(conn, "notifications", "message", "TEXT DEFAULT NULL");
    await addCol(conn, "notifications", "is_read", "TINYINT(1) NOT NULL DEFAULT 0");

    // ── flags ────────────────────────────────────────────────────────────────
    console.log("\n[13] flags");
    await addCol(conn, "flags", "logsheet_entry_id", "INT UNSIGNED DEFAULT NULL");
    await addCol(conn, "flags", "logsheet_answer_id", "INT UNSIGNED DEFAULT NULL");
    await addCol(conn, "flags", "entered_value", "VARCHAR(255) DEFAULT NULL");
    await addCol(conn, "flags", "expected_rule", "VARCHAR(500) DEFAULT NULL");
    await addCol(conn, "flags", "repeat_count", "INT NOT NULL DEFAULT 1");
    await addCol(conn, "flags", "escalated", "TINYINT(1) NOT NULL DEFAULT 0");
    await addCol(conn, "flags", "escalated_at", "DATETIME DEFAULT NULL");
    await addCol(conn, "flags", "resolved_at", "DATETIME DEFAULT NULL");
    await addCol(conn, "flags", "work_order_id", "INT UNSIGNED DEFAULT NULL");
    await addCol(conn, "flags", "supervisor_id", "INT UNSIGNED DEFAULT NULL");

    // ── work_order_history ───────────────────────────────────────────────────
    console.log("\n[14] work_order_history");
    await addCol(conn, "work_order_history", "updated_by", "INT DEFAULT NULL");
    await addCol(conn, "work_order_history", "event_at", "DATETIME DEFAULT NOW()");

    // ── Missing tables ────────────────────────────────────────────────────────
    console.log("\n[15] Missing tables check");

    if (!(await tableExists(conn, "work_order_escalation_history"))) {
      await conn.execute(`
        CREATE TABLE work_order_escalation_history (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          work_order_id INT NOT NULL,
          escalation_level INT NOT NULL DEFAULT 1,
          escalated_at DATETIME NOT NULL DEFAULT NOW(),
          previous_assignee_name VARCHAR(255) DEFAULT NULL,
          new_assignee_name VARCHAR(255) DEFAULT NULL,
          reason TEXT DEFAULT NULL,
          PRIMARY KEY (id),
          KEY idx_woeh_wo (work_order_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      console.log("  ✓ work_order_escalation_history — created");
    } else {
      console.log("  · work_order_escalation_history — already exists");
    }

    if (!(await tableExists(conn, "employee_shifts"))) {
      await conn.execute(`
        CREATE TABLE employee_shifts (
          id INT UNSIGNED NOT NULL AUTO_INCREMENT,
          shift_id INT UNSIGNED NOT NULL,
          company_user_id INT NOT NULL,
          company_id INT DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_employee_shifts (shift_id, company_user_id),
          KEY idx_es_user (company_user_id),
          KEY idx_es_shift (shift_id),
          CONSTRAINT fk_es_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE CASCADE,
          CONSTRAINT fk_es_user FOREIGN KEY (company_user_id) REFERENCES company_users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      console.log("  ✓ employee_shifts — created");
    } else {
      console.log("  · employee_shifts — already exists");
    }

    console.log("\n=== Migration complete ===");
  } catch (err) {
    console.error("\nFatal:", err.message);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
