import pool from "./src/db.js";

async function run() {
  const conn = await pool.getConnection();
  try {
    console.log("=== Fix Collation + Create Missing Tables ===\n");

    // 1. Fix collation on tables that have utf8mb4_unicode_ci
    const tablesToFix = [
      "asset_pre_qr",
      "asset_queries",
      "company_users",
      "fleet_maintenance",
      "notifications",
      "ojt_module_contents",
      "ojt_modules",
      "ojt_questions",
      "ojt_test_attempts",
      "ojt_tests",
      "ojt_trainings",
      "ojt_user_progress",
      "role_permissions",
    ];

    console.log("[1] Converting collation to utf8mb4_0900_ai_ci...");
    for (const tbl of tablesToFix) {
      try {
        await conn.execute(
          `ALTER TABLE \`${tbl}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
        );
        console.log(`  ✓ ${tbl} — converted`);
      } catch (err) {
        console.log(`  ✗ ${tbl} — ${err.message}`);
      }
    }

    // 2. Create employee_shifts table if missing
    // Note: shifts.id is INT UNSIGNED; company_users.id is INT (signed) — must match exactly
    console.log("\n[2] Creating employee_shifts table if missing...");
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS employee_shifts (
        id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
        shift_id        INT UNSIGNED NOT NULL,
        company_user_id INT          NOT NULL,
        company_id      INT          NULL,
        created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_employee_shifts (shift_id, company_user_id),
        KEY idx_employee_shifts_user (company_user_id),
        KEY idx_employee_shifts_shift (shift_id),
        CONSTRAINT fk_es_shift FOREIGN KEY (shift_id)        REFERENCES shifts(id)        ON DELETE CASCADE,
        CONSTRAINT fk_es_user  FOREIGN KEY (company_user_id) REFERENCES company_users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log("  ✓ employee_shifts — ok");

    // 3. Check for any other commonly needed tables
    console.log("\n[3] Checking for other missing tables...");
    const neededTables = [
      ["training_modules", `CREATE TABLE IF NOT EXISTS training_modules (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id INT UNSIGNED NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_tm_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`],
    ];

    for (const [tableName, ddl] of neededTables) {
      const [rows] = await conn.execute(
        `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [tableName]
      );
      if (rows.length === 0) {
        try {
          await conn.execute(ddl);
          console.log(`  ✓ ${tableName} — created`);
        } catch (err) {
          console.log(`  ✗ ${tableName} — ${err.message}`);
        }
      } else {
        console.log(`  · ${tableName} — already exists`);
      }
    }

    console.log("\n=== Migration complete ===");
  } catch (err) {
    console.error("Fatal:", err.message);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

run();
