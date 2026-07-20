/**
 * PMS Checklist + Scheduler API
 * Prefix: /api/company-portal/pms
 *
 * Module 1 – Checklist management  (CRUD + duplicate + bulk-assign)
 * Module 2 – Asset assignment       (assign checklist to assets)
 * Module 3 – PMS Schedules          (create / manage scheduled jobs)
 */

import { Router } from "express";
import { body, query, param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { isMigrationSafeError } from "../db.js";

const router = Router();
router.use(requireCompanyAuth);

// ── Auto-migration ─────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => {
    try { await pool.query(sql); }
    catch (e) { if (!isMigrationSafeError(e)) console.warn("[pms] migration:", e.message); }
  };
  await safe(`CREATE TABLE IF NOT EXISTS pms_checklists (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id INT UNSIGNED NOT NULL,
    checklist_name VARCHAR(200) NOT NULL,
    checklist_code VARCHAR(60) NOT NULL,
    asset_category VARCHAR(80) NULL,
    asset_type VARCHAR(120) NULL,
    manufacturer VARCHAR(120) NULL,
    model VARCHAR(120) NULL,
    version VARCHAR(40) NOT NULL DEFAULT '1.0',
    estimated_duration INT NULL,
    frequency VARCHAR(40) NOT NULL DEFAULT 'Monthly',
    description TEXT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_pms_code (company_id, checklist_code),
    KEY idx_pms_cl_company (company_id),
    CONSTRAINT fk_pms_cl_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS pms_checklist_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    checklist_id INT UNSIGNED NOT NULL,
    serial_no INT NOT NULL DEFAULT 1,
    inspection_point VARCHAR(300) NOT NULL,
    check_type VARCHAR(80) NOT NULL DEFAULT 'Visual Inspection',
    response_type VARCHAR(40) NOT NULL DEFAULT 'Pass/Fail',
    is_mandatory TINYINT(1) NOT NULL DEFAULT 1,
    tolerance_value VARCHAR(100) NULL,
    remarks_required TINYINT(1) NOT NULL DEFAULT 0,
    photo_required TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pms_items_cl (checklist_id),
    CONSTRAINT fk_pms_items_cl FOREIGN KEY (checklist_id) REFERENCES pms_checklists(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`ALTER TABLE assets ADD COLUMN pms_checklist_id INT UNSIGNED NULL`);
  await safe(`ALTER TABLE assets ADD COLUMN last_pms_date DATE NULL`);
  await safe(`ALTER TABLE assets ADD COLUMN next_pms_due DATE NULL`);

  await safe(`CREATE TABLE IF NOT EXISTS pms_schedules (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id INT UNSIGNED NOT NULL,
    schedule_number VARCHAR(60) NULL,
    maintenance_date DATE NOT NULL,
    engineer_id INT UNSIGNED NULL,
    engineer_name VARCHAR(160) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    notes TEXT NULL,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pms_sched_company (company_id),
    KEY idx_pms_sched_date (maintenance_date),
    CONSTRAINT fk_pms_sched_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS pms_schedule_assets (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    schedule_id INT UNSIGNED NOT NULL,
    asset_id INT UNSIGNED NOT NULL,
    checklist_id INT UNSIGNED NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    completed_by INT UNSIGNED NULL,
    completed_at DATETIME NULL,
    notes TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sched_asset (schedule_id, asset_id),
    KEY idx_pms_sa_sched (schedule_id),
    KEY idx_pms_sa_asset (asset_id),
    CONSTRAINT fk_pms_sa_sched FOREIGN KEY (schedule_id) REFERENCES pms_schedules(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cid = (req) => req.companyUser.companyId;

async function nextChecklistCode(companyId) {
  const [[{ n }]] = await pool.query(
    "SELECT COUNT(*) AS n FROM pms_checklists WHERE company_id = ?", [companyId]
  );
  return `PMS-${String(Number(n) + 1).padStart(4, "0")}`;
}

async function insertItems(conn, checklistId, items = []) {
  if (!items.length) return;
  const values = items.map((item, i) => [
    checklistId,
    item.serialNo ?? (i + 1),
    (item.inspectionPoint || "").trim(),
    item.checkType || "Visual Inspection",
    item.responseType || "Pass/Fail",
    item.isMandatory ?? 1,
    item.toleranceValue || null,
    item.remarksRequired ?? 0,
    item.photoRequired ?? 0,
    i,
  ]);
  await conn.query(
    `INSERT INTO pms_checklist_items
       (checklist_id, serial_no, inspection_point, check_type, response_type,
        is_mandatory, tolerance_value, remarks_required, photo_required, sort_order)
     VALUES ?`,
    [values]
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 1 – PMS CHECKLISTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /checklists — list all checklists for company
router.get("/checklists", async (req, res, next) => {
  try {
    const { search, category, status } = req.query;
    let where = "WHERE pc.company_id = ?";
    const params = [cid(req)];
    if (status)   { where += " AND pc.status = ?";          params.push(status); }
    if (category) { where += " AND pc.asset_category = ?";  params.push(category); }
    if (search)   {
      where += " AND (pc.checklist_name LIKE ? OR pc.checklist_code LIKE ? OR pc.asset_type LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    const [rows] = await pool.query(
      `SELECT pc.*, COUNT(pi.id) AS itemCount
       FROM pms_checklists pc
       LEFT JOIN pms_checklist_items pi ON pi.checklist_id = pc.id
       ${where}
       GROUP BY pc.id
       ORDER BY pc.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /checklists — create checklist with items
router.post("/checklists", validate([
  body("checklistName").trim().notEmpty().withMessage("checklistName required"),
  body("frequency").optional().isString(),
  body("items").optional().isArray(),
]), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      checklistName, assetCategory, assetType, manufacturer, model,
      version = "1.0", estimatedDuration, frequency = "Monthly",
      description, status = "active", items = [],
    } = req.body;

    const code = await nextChecklistCode(cid(req));
    const [ins] = await conn.execute(
      `INSERT INTO pms_checklists
         (company_id, checklist_name, checklist_code, asset_category, asset_type,
          manufacturer, model, version, estimated_duration, frequency,
          description, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [cid(req), checklistName.trim(), code, assetCategory || null, assetType || null,
       manufacturer || null, model || null, version, estimatedDuration || null,
       frequency, description || null, status, req.companyUser.id]
    );
    const checklistId = ins.insertId;
    await insertItems(conn, checklistId, items);
    await conn.commit();

    const [[checklist]] = await pool.query(
      "SELECT * FROM pms_checklists WHERE id = ?", [checklistId]
    );
    const [checklistItems] = await pool.query(
      "SELECT * FROM pms_checklist_items WHERE checklist_id = ? ORDER BY sort_order", [checklistId]
    );
    res.status(201).json({ ...checklist, items: checklistItems });
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

// GET /checklists/:id — get single checklist with items
router.get("/checklists/:id", async (req, res, next) => {
  try {
    const [[checklist]] = await pool.query(
      "SELECT * FROM pms_checklists WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!checklist) return res.status(404).json({ message: "Checklist not found" });
    const [items] = await pool.query(
      "SELECT * FROM pms_checklist_items WHERE checklist_id = ? ORDER BY sort_order",
      [req.params.id]
    );
    res.json({ ...checklist, items });
  } catch (err) { next(err); }
});

// PUT /checklists/:id — update checklist and replace items
router.put("/checklists/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.execute(
      "SELECT id FROM pms_checklists WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!existing) { await conn.rollback(); conn.release(); return res.status(404).json({ message: "Not found" }); }

    const {
      checklistName, assetCategory, assetType, manufacturer, model, version,
      estimatedDuration, frequency, description, status, items,
    } = req.body;

    await conn.execute(
      `UPDATE pms_checklists SET
         checklist_name = COALESCE(?, checklist_name),
         asset_category = ?,
         asset_type     = ?,
         manufacturer   = ?,
         model          = ?,
         version        = COALESCE(?, version),
         estimated_duration = ?,
         frequency      = COALESCE(?, frequency),
         description    = ?,
         status         = COALESCE(?, status)
       WHERE id = ?`,
      [checklistName ?? null, assetCategory ?? null, assetType ?? null,
       manufacturer ?? null, model ?? null, version ?? null,
       estimatedDuration ?? null, frequency ?? null, description ?? null,
       status ?? null, req.params.id]
    );

    if (Array.isArray(items)) {
      await conn.execute("DELETE FROM pms_checklist_items WHERE checklist_id = ?", [req.params.id]);
      await insertItems(conn, Number(req.params.id), items);
    }

    await conn.commit();
    const [[checklist]] = await pool.query("SELECT * FROM pms_checklists WHERE id = ?", [req.params.id]);
    const [updatedItems] = await pool.query(
      "SELECT * FROM pms_checklist_items WHERE checklist_id = ? ORDER BY sort_order", [req.params.id]
    );
    res.json({ ...checklist, items: updatedItems });
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

// DELETE /checklists/:id
router.delete("/checklists/:id", async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      "SELECT id FROM pms_checklists WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!existing) return res.status(404).json({ message: "Not found" });
    await pool.query("DELETE FROM pms_checklists WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /checklists/:id/duplicate
router.post("/checklists/:id/duplicate", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[src]] = await conn.execute(
      "SELECT * FROM pms_checklists WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!src) { await conn.rollback(); conn.release(); return res.status(404).json({ message: "Not found" }); }

    const [srcItems] = await conn.execute(
      "SELECT * FROM pms_checklist_items WHERE checklist_id = ? ORDER BY sort_order",
      [req.params.id]
    );

    const newCode = await nextChecklistCode(cid(req));
    const [ins] = await conn.execute(
      `INSERT INTO pms_checklists
         (company_id, checklist_name, checklist_code, asset_category, asset_type,
          manufacturer, model, version, estimated_duration, frequency,
          description, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [cid(req), `${src.checklist_name} (Copy)`, newCode, src.asset_category, src.asset_type,
       src.manufacturer, src.model, src.version, src.estimated_duration, src.frequency,
       src.description, "active", req.companyUser.id]
    );
    const newId = ins.insertId;

    if (srcItems.length) {
      const vals = srcItems.map(i => [
        newId, i.serial_no, i.inspection_point, i.check_type, i.response_type,
        i.is_mandatory, i.tolerance_value, i.remarks_required, i.photo_required, i.sort_order
      ]);
      await conn.query(
        `INSERT INTO pms_checklist_items
           (checklist_id, serial_no, inspection_point, check_type, response_type,
            is_mandatory, tolerance_value, remarks_required, photo_required, sort_order)
         VALUES ?`,
        [vals]
      );
    }
    await conn.commit();

    const [[newChecklist]] = await pool.query("SELECT * FROM pms_checklists WHERE id = ?", [newId]);
    const [newItems] = await pool.query(
      "SELECT * FROM pms_checklist_items WHERE checklist_id = ? ORDER BY sort_order", [newId]
    );
    res.status(201).json({ ...newChecklist, items: newItems });
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 2 – ASSIGN CHECKLIST TO ASSETS
// ═══════════════════════════════════════════════════════════════════════════════

// POST /assign — bulk assign checklist to multiple assets
router.post("/assign", validate([
  body("checklistId").isInt({ min: 1 }).withMessage("checklistId required"),
  body("assetIds").isArray({ min: 1 }).withMessage("assetIds required"),
]), async (req, res, next) => {
  try {
    const { checklistId, assetIds } = req.body;
    const [[checklist]] = await pool.query(
      "SELECT id FROM pms_checklists WHERE id = ? AND company_id = ?",
      [checklistId, cid(req)]
    );
    if (!checklist) return res.status(404).json({ message: "Checklist not found" });

    let success = 0, failed = 0, alreadyAssigned = 0;
    for (const assetId of assetIds) {
      try {
        const [[asset]] = await pool.query(
          "SELECT id, pms_checklist_id FROM assets WHERE id = ? AND company_id = ?",
          [assetId, cid(req)]
        );
        if (!asset) { failed++; continue; }
        if (asset.pms_checklist_id === Number(checklistId)) { alreadyAssigned++; continue; }
        await pool.query(
          "UPDATE assets SET pms_checklist_id = ? WHERE id = ?",
          [checklistId, assetId]
        );
        success++;
      } catch { failed++; }
    }
    res.json({ ok: true, success, failed, alreadyAssigned });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE 3 – PMS SCHEDULES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /schedules — list schedules with asset count
router.get("/schedules", async (req, res, next) => {
  try {
    const { status, dateFrom, dateTo } = req.query;
    let where = "WHERE ps.company_id = ?";
    const params = [cid(req)];
    if (status)   { where += " AND ps.status = ?";                params.push(status); }
    if (dateFrom) { where += " AND ps.maintenance_date >= ?";     params.push(dateFrom); }
    if (dateTo)   { where += " AND ps.maintenance_date <= ?";     params.push(dateTo); }

    const [rows] = await pool.query(
      `SELECT ps.*,
              COUNT(psa.id) AS totalAssets,
              SUM(psa.status = 'completed') AS completedAssets,
              SUM(psa.status = 'pending')   AS pendingAssets
       FROM pms_schedules ps
       LEFT JOIN pms_schedule_assets psa ON psa.schedule_id = ps.id
       ${where}
       GROUP BY ps.id
       ORDER BY ps.maintenance_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /schedules — create a new schedule and attach assets
router.post("/schedules", validate([
  body("maintenanceDate").isDate().withMessage("maintenanceDate required (YYYY-MM-DD)"),
  body("assetIds").isArray({ min: 1 }).withMessage("assetIds required"),
]), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { maintenanceDate, engineerId, engineerName, notes, assetIds } = req.body;

    // Generate schedule number
    const [[{ n }]] = await conn.query(
      "SELECT COUNT(*) AS n FROM pms_schedules WHERE company_id = ?", [cid(req)]
    );
    const schedNum = `SCH-${String(Number(n) + 1).padStart(5, "0")}`;

    const [ins] = await conn.execute(
      `INSERT INTO pms_schedules
         (company_id, schedule_number, maintenance_date, engineer_id, engineer_name, notes, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [cid(req), schedNum, maintenanceDate, engineerId || null,
       engineerName || null, notes || null, req.companyUser.id]
    );
    const scheduleId = ins.insertId;

    // Attach assets (with their assigned checklists)
    let added = 0, skipped = 0;
    const assetRows = [];
    for (const assetId of assetIds) {
      const [[asset]] = await conn.execute(
        "SELECT id, pms_checklist_id FROM assets WHERE id = ? AND company_id = ?",
        [assetId, cid(req)]
      );
      if (!asset) { skipped++; continue; }
      assetRows.push([scheduleId, assetId, asset.pms_checklist_id || null, "pending"]);
      added++;
    }
    if (assetRows.length) {
      await conn.query(
        "INSERT IGNORE INTO pms_schedule_assets (schedule_id, asset_id, checklist_id, status) VALUES ?",
        [assetRows]
      );
    }

    await conn.commit();
    res.status(201).json({ scheduleId, scheduleNumber: schedNum, added, skipped });
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

// GET /schedules/:id — get single schedule with full asset list
router.get("/schedules/:id", async (req, res, next) => {
  try {
    const [[schedule]] = await pool.query(
      "SELECT * FROM pms_schedules WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });

    const [assets] = await pool.query(
      `SELECT psa.*, a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId,
              a.department_id AS departmentId, a.building, a.floor, a.room,
              a.last_pms_date AS lastPmsDate, a.next_pms_due AS nextPmsDue,
              d.name AS departmentName,
              pc.checklist_name AS checklistName, pc.checklist_code AS checklistCode
       FROM pms_schedule_assets psa
       JOIN assets a ON a.id = psa.asset_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN pms_checklists pc ON pc.id = psa.checklist_id
       WHERE psa.schedule_id = ?
       ORDER BY a.asset_name`,
      [req.params.id]
    );
    res.json({ ...schedule, assets });
  } catch (err) { next(err); }
});

// PUT /schedules/:id — update schedule status / engineer
router.put("/schedules/:id", async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      "SELECT id FROM pms_schedules WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!existing) return res.status(404).json({ message: "Not found" });
    const { maintenanceDate, engineerId, engineerName, status, notes } = req.body;
    await pool.query(
      `UPDATE pms_schedules SET
         maintenance_date = COALESCE(?, maintenance_date),
         engineer_id      = COALESCE(?, engineer_id),
         engineer_name    = COALESCE(?, engineer_name),
         status           = COALESCE(?, status),
         notes            = COALESCE(?, notes)
       WHERE id = ?`,
      [maintenanceDate ?? null, engineerId ?? null, engineerName ?? null,
       status ?? null, notes ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /schedules/:id
router.delete("/schedules/:id", async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      "SELECT id FROM pms_schedules WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!existing) return res.status(404).json({ message: "Not found" });
    await pool.query("DELETE FROM pms_schedules WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Support: assets list for scheduler ───────────────────────────────────────
router.get("/assets", async (req, res, next) => {
  try {
    const { departmentId, building, assetCategory, assetType, search, withChecklist } = req.query;
    let where = "WHERE a.company_id = ? AND a.status = 'Active'";
    const params = [cid(req)];
    if (departmentId) { where += " AND a.department_id = ?";  params.push(departmentId); }
    if (building)     { where += " AND a.building LIKE ?";    params.push(`%${building}%`); }
    if (assetCategory){ where += " AND a.asset_type = ?"; params.push(assetCategory); }
    if (assetType)    { where += " AND a.asset_type = ?";     params.push(assetType); }
    if (withChecklist === "true") { where += " AND a.pms_checklist_id IS NOT NULL"; }
    if (search) {
      where += " AND (a.asset_name LIKE ? OR a.asset_unique_id LIKE ?)";
      const s = `%${search}%`; params.push(s, s);
    }
    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId,
              a.building, a.floor, a.room, a.asset_type AS assetType,
              a.asset_type AS assetCategory, a.pms_checklist_id AS pmsChecklistId,
              a.last_pms_date AS lastPmsDate, a.next_pms_due AS nextPmsDue, a.status,
              d.name AS departmentName,
              pc.checklist_name AS checklistName, pc.checklist_code AS checklistCode
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN pms_checklists pc ON pc.id = a.pms_checklist_id
       ${where}
       ORDER BY a.asset_name
       LIMIT 1000`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ─── Support: engineers for scheduler ─────────────────────────────────────────
router.get("/engineers", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT cu.id, cu.full_name AS fullName, cu.email, cu.designation,
              cu.role, d.name AS departmentName,
              COUNT(psa.id) AS currentWorkload
       FROM company_users cu
       LEFT JOIN departments d ON d.id = cu.department_id
       LEFT JOIN pms_schedule_assets psa ON psa.completed_by = cu.id
         AND psa.status = 'pending'
       WHERE cu.company_id = ? AND cu.status = 'Active'
         AND cu.role IN ('engineer','technician','admin','supervisor')
       GROUP BY cu.id
       ORDER BY cu.full_name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

export default router;
