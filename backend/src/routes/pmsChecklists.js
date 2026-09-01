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
import { requirePermission } from "../middleware/requirePermission.js";
import { isMigrationSafeError } from "../db.js";
import { sendPushNotification, sendMulticast } from "../services/fcmService.js";

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
  await safe(`ALTER TABLE pms_schedules ADD COLUMN frequency VARCHAR(30) NULL DEFAULT 'Monthly'`);
  // Store a time-of-day with the maintenance date (schedules can carry a time now).
  await safe(`ALTER TABLE pms_schedules MODIFY COLUMN maintenance_date DATETIME NOT NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN engineer_id INT UNSIGNED NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN engineer_name VARCHAR(160) NULL`);

  // ── Approval workflow columns ────────────────────────────────────────────────
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN submitted_at DATETIME NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN engineer_notes TEXT NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN engineer_images JSON NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN approval_status VARCHAR(30) NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN approved_by INT UNSIGNED NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN approved_at DATETIME NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN approval_comments TEXT NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN reviewer_id INT UNSIGNED NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN reviewer_name VARCHAR(160) NULL`);
  await safe(`ALTER TABLE company_users ADD COLUMN department_id INT UNSIGNED NULL`);
  // Backfill: propagate schedule-level engineer assignment down to asset rows.
  // Schedules assigned before per-asset engineer_id was populated wouldn't appear
  // on the engineer's mobile /my-pms (which filters pms_schedule_assets.engineer_id).
  await safe(`UPDATE pms_schedule_assets psa
                JOIN pms_schedules ps ON ps.id = psa.schedule_id
                 SET psa.engineer_id   = ps.engineer_id,
                     psa.engineer_name = COALESCE(psa.engineer_name, ps.engineer_name)
               WHERE psa.engineer_id IS NULL AND ps.engineer_id IS NOT NULL`);

  await safe(`CREATE TABLE IF NOT EXISTS pms_submission_responses (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    pms_assignment_id INT UNSIGNED NOT NULL,
    checklist_item_id INT UNSIGNED NOT NULL,
    response_value TEXT NULL,
    photo_url VARCHAR(500) NULL,
    remarks TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_psr_assignment (pms_assignment_id),
    CONSTRAINT fk_psr_assignment FOREIGN KEY (pms_assignment_id) REFERENCES pms_schedule_assets(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS pms_audit_log (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id INT UNSIGNED NOT NULL,
    pms_assignment_id INT UNSIGNED NOT NULL,
    action VARCHAR(60) NOT NULL,
    actor_id INT UNSIGNED NULL,
    actor_name VARCHAR(160) NULL,
    actor_role VARCHAR(60) NULL,
    comments TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_pal_assignment (pms_assignment_id),
    KEY idx_pal_company (company_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

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

  // Data fix: rename legacy 'pending_approval' status to 'completed'
  await safe(`UPDATE pms_schedule_assets SET status = 'completed' WHERE status = 'pending_approval'`);

  // Recurring schedule support
  await safe(`ALTER TABLE pms_schedules ADD COLUMN recurring_group_id CHAR(36) NULL`);
  await safe(`ALTER TABLE pms_schedules ADD COLUMN occurrence_index INT NOT NULL DEFAULT 0`);

  // Audit metadata (GPS, IP, device) for submission and review
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN submission_metadata JSON NULL`);
  await safe(`ALTER TABLE pms_schedule_assets ADD COLUMN review_metadata JSON NULL`);
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cid = (req) => req.companyUser.companyId;

// Helper: returns all company IDs this user can access
async function getAccessibleCompanyIds(userId, primaryId) {
  const [extra] = await pool.query(
    `SELECT company_id AS companyId FROM user_company_access WHERE user_id = ?`, [userId]
  ).catch(() => [[]]);
  const ids = new Set([Number(primaryId)]);
  extra.forEach(r => ids.add(Number(r.companyId)));
  return [...ids];
}

// ── Recurring date helpers ─────────────────────────────────────────────────────
function nextOccurrenceDate(dateStr, frequency) {
  const d = new Date(dateStr);
  switch (frequency) {
    case 'Monthly':     return new Date(d.getFullYear(), d.getMonth() + 1,  d.getDate());
    case 'Quarterly':   return new Date(d.getFullYear(), d.getMonth() + 3,  d.getDate());
    case 'Half-Yearly': return new Date(d.getFullYear(), d.getMonth() + 6,  d.getDate());
    case 'Yearly':      return new Date(d.getFullYear() + 1, d.getMonth(),  d.getDate());
    default:            return null;
  }
}
function extraOccurrences(frequency) {
  return { Monthly: 11, Quarterly: 3, 'Half-Yearly': 1, Yearly: 1 }[frequency] ?? 0;
}
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function newGroupId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

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
router.post("/checklists", requirePermission("pms:schedule"), validate([
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
router.put("/checklists/:id", requirePermission("pms:schedule"), async (req, res, next) => {
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
router.delete("/checklists/:id", requirePermission("pms:schedule"), async (req, res, next) => {
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
router.post("/assign", requirePermission("pms:assign_checklist"), validate([
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
    const { status, dateFrom, dateTo, companyId: qCompanyId, allCompanies } = req.query;

    let companyWhere, params;
    if (allCompanies === "true") {
      const ids = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
      companyWhere = `ps.company_id IN (${ids.map(() => "?").join(",")})`;
      params = [...ids];
    } else if (qCompanyId) {
      const ids = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
      if (!ids.includes(Number(qCompanyId))) return res.status(403).json({ message: "Access denied" });
      companyWhere = "ps.company_id = ?";
      params = [Number(qCompanyId)];
    } else {
      companyWhere = "ps.company_id = ?";
      params = [cid(req)];
    }

    let where = `WHERE ${companyWhere}`;
    if (status)   { where += " AND ps.status = ?";                params.push(status); }
    if (dateFrom) { where += " AND ps.maintenance_date >= ?";     params.push(dateFrom); }
    if (dateTo)   { where += " AND ps.maintenance_date <= ?";     params.push(dateTo); }

    const [rows] = await pool.query(
      `SELECT ps.*,
              co.company_name AS companyName,
              COUNT(psa.id) AS totalAssets,
              SUM(psa.status = 'completed') AS completedAssets,
              SUM(psa.status = 'pending')   AS pendingAssets,
              GROUP_CONCAT(DISTINCT psa.asset_id) AS assetIds,
              GROUP_CONCAT(DISTINCT CONCAT_WS('~', psa.asset_id, COALESCE(a.asset_name,''),
                COALESCE(a.generated_asset_id,''), COALESCE(psa.status,'')) SEPARATOR '||') AS assetsConcat
       FROM pms_schedules ps
       LEFT JOIN companies co ON co.id = ps.company_id
       LEFT JOIN pms_schedule_assets psa ON psa.schedule_id = ps.id
       LEFT JOIN assets a ON a.id = psa.asset_id
       ${where}
       GROUP BY ps.id
       ORDER BY ps.maintenance_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /schedules/check-conflicts — pre-flight check before creating a new schedule
router.post("/schedules/check-conflicts", async (req, res, next) => {
  try {
    const { assetIds = [] } = req.body;
    if (!assetIds.length) return res.json({ conflicts: [] });
    const placeholders = assetIds.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT a.id AS assetId, a.asset_name AS assetName,
              a.generated_asset_id AS generatedAssetId,
              ps.id AS scheduleId, ps.schedule_number AS scheduleNumber,
              ps.maintenance_date AS maintenanceDate, ps.frequency,
              psa.id AS psaId, psa.status
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       JOIN assets a ON a.id = psa.asset_id
       WHERE a.id IN (${placeholders})
         AND ps.company_id = ?
         AND psa.status IN ('pending','in_progress')
         AND ps.maintenance_date >= CURDATE()
       ORDER BY ps.maintenance_date ASC`,
      [...assetIds, cid(req)]
    );
    // Deduplicate to one conflict record per asset
    const seen = new Set();
    const conflicts = rows.filter(r => { if (seen.has(r.assetId)) return false; seen.add(r.assetId); return true; });
    res.json({ conflicts });
  } catch (err) { next(err); }
});

// POST /schedules — create a new schedule and attach assets (generates recurring occurrences)
router.post("/schedules", requirePermission("pms:schedule"), validate([
  body("maintenanceDate").isDate().withMessage("maintenanceDate required (YYYY-MM-DD)"),
  body("assetIds").isArray({ min: 1 }).withMessage("assetIds required"),
]), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { maintenanceDate, maintenanceTime, engineerId, engineerName, notes, assetIds,
            frequency = 'Monthly', replaceConflicts = false } = req.body;
    // Time-of-day for the schedule (defaults to 09:00 when not supplied).
    const timeStr = /^\d{2}:\d{2}/.test(String(maintenanceTime || "")) ? String(maintenanceTime).slice(0, 5) : "09:00";

    // If replaceConflicts: cancel all future pending occurrences for selected assets
    if (replaceConflicts && assetIds.length) {
      const placeholders = assetIds.map(() => "?").join(",");
      await conn.query(
        `DELETE psa FROM pms_schedule_assets psa
         JOIN pms_schedules ps ON ps.id = psa.schedule_id
         WHERE psa.asset_id IN (${placeholders})
           AND ps.company_id = ?
           AND psa.status IN ('pending','in_progress')
           AND ps.maintenance_date >= CURDATE()`,
        [...assetIds, cid(req)]
      );
    }

    // Resolve assets once (avoid N+1 inside occurrence loop)
    const assetMap = new Map();
    for (const assetId of assetIds) {
      const [[asset]] = await conn.execute(
        "SELECT id, pms_checklist_id FROM assets WHERE id = ? AND company_id = ?",
        [assetId, cid(req)]
      );
      if (asset) assetMap.set(Number(assetId), asset);
    }
    if (!assetMap.size) {
      await conn.rollback();
      return res.status(400).json({ message: "No valid assets found" });
    }

    // Get current schedule count for numbering
    const [[{ n }]] = await conn.query(
      "SELECT COUNT(*) AS n FROM pms_schedules WHERE company_id = ?", [cid(req)]
    );

    const groupId = newGroupId();
    const occurrenceCount = extraOccurrences(frequency);
    const createdScheduleIds = [];
    let schedNum = Number(n) + 1;

    // Generate first occurrence + recurring occurrences
    let currentDate = maintenanceDate;
    for (let idx = 0; idx <= occurrenceCount; idx++) {
      const sNum = `SCH-${String(schedNum++).padStart(5, "0")}`;
      const isFirst = idx === 0;

      const [ins] = await conn.execute(
        `INSERT INTO pms_schedules
           (company_id, schedule_number, maintenance_date, engineer_id, engineer_name,
            notes, frequency, created_by, recurring_group_id, occurrence_index)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          cid(req), sNum, `${currentDate} ${timeStr}:00`,
          isFirst ? (engineerId || null) : null,    // only first gets engineer
          isFirst ? (engineerName || null) : null,
          notes || null, frequency, req.companyUser.id,
          occurrenceCount > 0 ? groupId : null,     // null for 'Once' schedules
          idx,
        ]
      );
      const scheduleId = ins.insertId;
      createdScheduleIds.push(scheduleId);

      // Attach assets to this occurrence. Propagate the schedule's engineer down
      // to each asset row — the mobile engineer view (/my-pms) filters on
      // pms_schedule_assets.engineer_id, so without this the assigned PMS never
      // appears on the engineer's phone. Only the first occurrence gets the engineer.
      const psaEngineerId   = isFirst ? (engineerId || null)   : null;
      const psaEngineerName = isFirst ? (engineerName || null) : null;
      const assetRows = [...assetMap.values()].map(a => [scheduleId, a.id, a.pms_checklist_id || null, "pending", psaEngineerId, psaEngineerName]);
      if (assetRows.length) {
        await conn.query(
          "INSERT IGNORE INTO pms_schedule_assets (schedule_id, asset_id, checklist_id, status, engineer_id, engineer_name) VALUES ?",
          [assetRows]
        );
      }

      // Advance date for next occurrence
      if (idx < occurrenceCount) {
        const next = nextOccurrenceDate(currentDate, frequency);
        if (!next) break;
        currentDate = fmtDate(next);
      }
    }

    await conn.commit();
    res.status(201).json({
      scheduleId: createdScheduleIds[0],
      scheduleNumber: `SCH-${String(Number(n) + 1).padStart(5, "0")}`,
      occurrencesCreated: createdScheduleIds.length,
      recurringGroupId: occurrenceCount > 0 ? groupId : null,
      added: assetMap.size,
      skipped: assetIds.length - assetMap.size,
    });
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

router.get("/schedules/export", async (req, res, next) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const cId = req.query.companyId && req.query.companyId !== "undefined" ? req.query.companyId : null;
    let accessibleIds = [];
    if (!cId) {
      accessibleIds = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
    }

    let whereClause = `YEAR(ps.maintenance_date) = ?`;
    let params = [year];

    if (cId) {
      whereClause += ` AND ps.company_id = ?`;
      params.push(cId);
    } else {
      whereClause += ` AND ps.company_id IN (?)`;
      params.push(accessibleIds.length ? accessibleIds : [cid(req)]);
    }

    const query = `
      SELECT 
        a.generated_asset_id AS generatedAssetId,
        a.asset_name AS assetName,
        MONTH(ps.maintenance_date) AS monthIdx,
        psa.status
      FROM pms_schedule_assets psa
      JOIN pms_schedules ps ON ps.id = psa.schedule_id
      JOIN assets a ON a.id = psa.asset_id
      WHERE ${whereClause}
      ORDER BY a.asset_name, ps.maintenance_date
    `;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /schedules/:id — details of a specific schedule with full asset list
router.get("/schedules/:id", async (req, res, next) => {
  try {
    // Scope to every hospital the user can access, so schedule details open in
    // "All Hospitals" mode too (not just the user's primary company).
    const ids = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
    const ph = ids.map(() => "?").join(",");
    const [[schedule]] = await pool.query(
      `SELECT * FROM pms_schedules WHERE id = ? AND company_id IN (${ph})`,
      [req.params.id, ...ids]
    );
    if (!schedule) return res.status(404).json({ message: "Schedule not found" });

    const [assets] = await pool.query(
      `SELECT psa.*, a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId,
              a.generated_asset_id AS generatedAssetId,
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
    const ids = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
    const ph = ids.map(() => "?").join(",");
    const [[existing]] = await pool.query(
      `SELECT id FROM pms_schedules WHERE id = ? AND company_id IN (${ph})`,
      [req.params.id, ...ids]
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
    // Propagate the (re)assigned engineer down to the asset rows so it shows in
    // the mobile engineer view (/my-pms reads pms_schedule_assets.engineer_id).
    if (engineerId) {
      await pool.query(
        "UPDATE pms_schedule_assets SET engineer_id = ?, engineer_name = COALESCE(?, engineer_name) WHERE schedule_id = ?",
        [engineerId, engineerName ?? null, req.params.id]
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /schedules/:id
router.delete("/schedules/:id", requirePermission("pms:delete"), async (req, res, next) => {
  try {
    const ids = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
    const ph = ids.map(() => "?").join(",");
    const [[existing]] = await pool.query(
      `SELECT id FROM pms_schedules WHERE id = ? AND company_id IN (${ph})`,
      [req.params.id, ...ids]
    );
    if (!existing) return res.status(404).json({ message: "Not found" });
    await pool.query("DELETE FROM pms_schedule_assets WHERE schedule_id = ?", [req.params.id]).catch(() => {});
    await pool.query("DELETE FROM pms_schedules WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /schedules/bulk-delete — delete all schedule occurrences whose
// maintenance_date falls within a date range (and optionally specific months).
// Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', months?: ['YYYY-MM', ...] }
router.post("/schedules/bulk-delete", requirePermission("pms:delete"), async (req, res, next) => {
  try {
    const { from, to, months } = req.body || {};
    const companyIds = await getAccessibleCompanyIds(req.companyUser.id, cid(req));

    let where = `company_id IN (${companyIds.map(() => "?").join(",")})`;
    const params = [...companyIds];

    if (Array.isArray(months) && months.length) {
      // Specific months e.g. ['2026-08','2026-10']
      const valid = months.filter(m => /^\d{4}-\d{2}$/.test(m));
      if (!valid.length) return res.status(400).json({ message: "No valid months provided" });
      where += ` AND DATE_FORMAT(maintenance_date, '%Y-%m') IN (${valid.map(() => "?").join(",")})`;
      params.push(...valid);
    } else if (from && to) {
      where += " AND maintenance_date BETWEEN ? AND ?";
      params.push(from, to);
    } else {
      return res.status(400).json({ message: "Provide a date range (from/to) or a list of months" });
    }

    // Collect affected schedule ids first so we can clean up child rows
    const [rows] = await pool.query(`SELECT id FROM pms_schedules WHERE ${where}`, params);
    const ids = rows.map(r => r.id);
    if (!ids.length) return res.json({ ok: true, deleted: 0 });

    const ph = ids.map(() => "?").join(",");
    await pool.query(`DELETE FROM pms_schedule_assets WHERE schedule_id IN (${ph})`, ids).catch(() => {});
    await pool.query(`DELETE FROM pms_schedules WHERE id IN (${ph})`, ids);
    res.json({ ok: true, deleted: ids.length });
  } catch (err) { next(err); }
});

// POST /schedules/:id/assets — add assets to an existing schedule
router.post("/schedules/:id/assets", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[existing]] = await conn.query(
      "SELECT id, engineer_id, engineer_name FROM pms_schedules WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!existing) return res.status(404).json({ message: "Not found" });
    const { assetIds } = req.body;
    if (!Array.isArray(assetIds) || !assetIds.length)
      return res.status(400).json({ message: "assetIds required" });
    let added = 0, skipped = 0;
    const assetRows = [];
    for (const assetId of assetIds) {
      const [[asset]] = await conn.execute(
        "SELECT id, pms_checklist_id FROM assets WHERE id = ? AND company_id = ?",
        [assetId, cid(req)]
      );
      if (!asset) { skipped++; continue; }
      // Inherit the schedule's engineer so new assets appear on that engineer's /my-pms
      assetRows.push([req.params.id, assetId, asset.pms_checklist_id || null, "pending", existing.engineer_id || null, existing.engineer_name || null]);
      added++;
    }
    if (assetRows.length) {
      await conn.query(
        "INSERT IGNORE INTO pms_schedule_assets (schedule_id, asset_id, checklist_id, status, engineer_id, engineer_name) VALUES ?",
        [assetRows]
      );
    }
    await conn.commit();
    res.json({ added, skipped });
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

// DELETE /schedules/:id/assets/:assetId — remove a single asset from a schedule
router.delete("/schedules/:id/assets/:assetId", async (req, res, next) => {
  try {
    const [[existing]] = await pool.query(
      "SELECT id FROM pms_schedules WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!existing) return res.status(404).json({ message: "Not found" });
    await pool.query(
      "DELETE FROM pms_schedule_assets WHERE schedule_id = ? AND asset_id = ?",
      [req.params.id, req.params.assetId]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── Support: assets list for scheduler ───────────────────────────────────────
router.get("/assets", async (req, res, next) => {
  try {
    const { departmentId, building, assetCategory, assetType, search, withChecklist, allCompanies, companyId } = req.query;

    // Support allCompanies=true and companyId=X filtering
    let companyWhere, params;
    if (allCompanies === "true") {
      const ids = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
      companyWhere = `a.company_id IN (${ids.map(() => "?").join(",")})`;
      params = [...ids];
    } else if (companyId) {
      const ids = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
      if (!ids.includes(Number(companyId))) return res.status(403).json({ message: "Access denied" });
      companyWhere = "a.company_id = ?";
      params = [Number(companyId)];
    } else {
      companyWhere = "a.company_id = ?";
      params = [cid(req)];
    }

    let where = `WHERE ${companyWhere} AND a.status = 'Active'`;
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
              a.generated_asset_id AS generatedAssetId,
              a.building, a.floor, a.room, a.asset_type AS assetType,
              a.asset_type AS assetCategory, a.pms_checklist_id AS pmsChecklistId,
              a.last_pms_date AS lastPmsDate, a.next_pms_due AS nextPmsDue, a.status,
              a.company_id AS companyId, co.company_name AS companyName,
              d.name AS departmentName,
              pc.checklist_name AS checklistName, pc.checklist_code AS checklistCode
       FROM assets a
       LEFT JOIN companies co ON co.id = a.company_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN pms_checklists pc ON pc.id = a.pms_checklist_id
       ${where}
       ORDER BY co.company_name, a.asset_name
       LIMIT 10000`,
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

// ─── Per-asset engineer assignment ───────────────────────────────────────────
router.patch("/schedule-assets/:id", async (req, res, next) => {
  try {
    const { engineerId, engineerName } = req.body;
    const [[existing]] = await pool.query(
      `SELECT psa.id FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       WHERE psa.id = ? AND ps.company_id = ?`,
      [req.params.id, cid(req)]
    );
    if (!existing) return res.status(404).json({ message: "Not found" });
    await pool.query(
      `UPDATE pms_schedule_assets SET
         engineer_id   = ?,
         engineer_name = ?
       WHERE id = ?`,
      [engineerId || null, engineerName || null, req.params.id]
    );

    // ── Send FCM notification to the assigned engineer ──────────────────────
    if (engineerId) {
      try {
        const [[eng]] = await pool.query(
          "SELECT fcm_token, full_name FROM company_users WHERE id = ? LIMIT 1",
          [engineerId]
        );
        if (eng?.fcm_token) {
          // Fetch asset + schedule info for the notification body
          const [[info]] = await pool.query(
            `SELECT a.asset_name, ps.maintenance_date, ps.schedule_number
             FROM pms_schedule_assets psa
             JOIN pms_schedules ps ON ps.id = psa.schedule_id
             JOIN assets a ON a.id = psa.asset_id
             WHERE psa.id = ? LIMIT 1`,
            [req.params.id]
          ).catch(() => [[null]]);
          const assetLabel = info?.asset_name || "an asset";
          const dateLabel  = info?.maintenance_date?.toISOString?.()?.slice(0,10)
                          || String(info?.maintenance_date || "").slice(0,10)
                          || "a scheduled date";
          await sendPushNotification(
            eng.fcm_token,
            "PMS Task Assigned",
            `You have been assigned PMS for ${assetLabel} on ${dateLabel}`,
            { type: "pms_assigned", psaId: String(req.params.id), scheduleNumber: info?.schedule_number || "" }
          );
        }
      } catch { /* non-fatal */ }
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── My PMS (engineer view) ───────────────────────────────────────────────────

// GET /verify-asset-qr?qrValue=XXX&assetId=123 — check if a scanned QR belongs to the expected asset
// assetId may be the asset's DB id OR the pms_schedule_assets.id (handled below)
router.get("/verify-asset-qr", async (req, res, next) => {
  try {
    const { qrValue, assetId } = req.query;
    if (!qrValue || !assetId) return res.status(400).json({ match: false });
    const companyId = cid(req);

    // ── Step 1: resolve which DB asset the scanned QR belongs to ──────────────
    let foundAssetId = null;
    let unlinkedQrId = null; // pre_qr.id for an unlinked QR (asset_id IS NULL)

    // 1a: asset_unique_id match
    const [[byUniq]] = await pool.query(
      "SELECT id FROM assets WHERE asset_unique_id = ? AND company_id = ?",
      [qrValue, companyId]
    );
    if (byUniq) foundAssetId = byUniq.id;

    // 1b: asset_pre_qr lookup
    if (!foundAssetId) {
      const [[byQr]] = await pool.query(
        "SELECT id, asset_id FROM asset_pre_qr WHERE qr_unique_id = ? AND company_id = ?",
        [qrValue, companyId]
      );
      if (byQr && byQr.asset_id) foundAssetId = byQr.asset_id;
      else if (byQr && byQr.asset_id === null) unlinkedQrId = byQr.id;
    }

    // 1c: generated_asset_id match
    if (!foundAssetId) {
      const [[byGen]] = await pool.query(
        "SELECT id FROM assets WHERE generated_asset_id = ? AND company_id = ?",
        [qrValue, companyId]
      );
      if (byGen) foundAssetId = byGen.id;
    }

    // ── Step 2: resolve what "assetId" the caller actually meant ──────────────
    // It can be the asset's DB id OR a pms_schedule_assets.id (old bug still
    // present on cached/un-refreshed clients).
    const resolveTargetAssetId = async (rawId) => {
      // Try direct asset lookup first
      const [[directAsset]] = await pool.query(
        "SELECT id FROM assets WHERE id = ? AND company_id = ?",
        [rawId, companyId]
      );
      if (directAsset) return Number(rawId);
      // Treat as PMS assignment id
      const [[pmsRow]] = await pool.query(
        `SELECT psa.asset_id FROM pms_schedule_assets psa
         JOIN pms_schedules ps ON ps.id = psa.schedule_id
         WHERE psa.id = ? AND ps.company_id = ?`,
        [rawId, companyId]
      );
      return pmsRow ? Number(pmsRow.asset_id) : null;
    };

    // ── Step 3: compare ───────────────────────────────────────────────────────
    if (foundAssetId) {
      if (String(foundAssetId) === String(assetId)) return res.json({ match: true });
      const targetAssetId = await resolveTargetAssetId(assetId);
      if (targetAssetId && targetAssetId === Number(foundAssetId))
        return res.json({ match: true });
    }

    // ── Step 4: unlinked pre-QR — auto-link and accept ────────────────────────
    if (unlinkedQrId) {
      const targetAssetId = await resolveTargetAssetId(assetId);
      if (targetAssetId) {
        await pool.query(
          "UPDATE asset_pre_qr SET asset_id = ?, linked_at = NOW() WHERE id = ?",
          [targetAssetId, unlinkedQrId]
        );
        return res.json({ match: true });
      }
    }

    res.json({ match: false });
  } catch (err) { next(err); }
});

/* GET /dashboard-stats — aggregate PMS KPI counts for the company dashboard */
router.get("/dashboard-stats", async (req, res, next) => {
  try {
    // Scope to the currently-selected hospital by default; only aggregate across
    // all accessible hospitals when the dashboard is in "All Hospitals" mode.
    const ids        = req.query.allCompanies === "true"
      ? await getAccessibleCompanyIds(req.companyUser.id, cid(req))
      : [cid(req)];
    const ph         = ids.map(() => "?").join(",");
    const today      = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";
    const nextMonthDate = new Date(monthStart);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
    const monthEnd     = nextMonthDate.toISOString().slice(0, 10);
    const upcoming30   = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    // Count UNIQUE assets (an asset in multiple schedules counts once) for the
    // asset metrics, and DISTINCT schedules for the schedule metrics.
    const [[stats]] = await pool.query(
      `SELECT
         COUNT(DISTINCT CASE WHEN ps.maintenance_date >= ? AND ps.maintenance_date < ? THEN ps.id END)                                                   AS dueThisMonth,
         COUNT(DISTINCT CASE WHEN ps.maintenance_date < ? AND ps.status NOT IN ('completed','cancelled') THEN ps.id END)                                 AS overdue,
         COUNT(DISTINCT CASE WHEN ps.maintenance_date >= ? AND ps.maintenance_date <= ? AND ps.status NOT IN ('completed','cancelled') THEN ps.id END)   AS upcoming30d,
         COUNT(DISTINCT CASE WHEN ps.maintenance_date >= ? AND ps.maintenance_date < ? AND ps.status = 'completed' THEN ps.id END)                       AS completedThisMonth,
         COUNT(DISTINCT CASE WHEN ps.maintenance_date >= ? AND ps.maintenance_date < ? THEN psa.asset_id END)                                            AS dueThisMonthAssets,
         COUNT(DISTINCT CASE WHEN ps.maintenance_date < ? AND ps.status NOT IN ('completed','cancelled') THEN psa.asset_id END)                          AS overdueAssets,
         COUNT(DISTINCT CASE WHEN ps.maintenance_date >= ? AND ps.maintenance_date <= ? AND ps.status NOT IN ('completed','cancelled') THEN psa.asset_id END) AS upcoming30dAssets,
         COUNT(DISTINCT CASE WHEN ps.maintenance_date >= ? AND ps.maintenance_date < ? AND ps.status = 'completed' THEN psa.asset_id END)                AS completedThisMonthAssets,
         COUNT(DISTINCT psa.asset_id)                                                                                                                    AS totalAssetsInPms,
         COUNT(DISTINCT CASE WHEN ps.status = 'completed' THEN psa.asset_id END)                                                                          AS totalCompletedAssets
       FROM pms_schedules ps
       LEFT JOIN pms_schedule_assets psa ON psa.schedule_id = ps.id
       WHERE ps.company_id IN (${ph})`,
      [
        monthStart, monthEnd,
        today,
        today, upcoming30,
        monthStart, monthEnd,
        monthStart, monthEnd,
        today,
        today, upcoming30,
        monthStart, monthEnd,
        ...ids,
      ]
    );

    res.json({
      dueThisMonth:              Number(stats?.dueThisMonth              || 0),
      overdue:                   Number(stats?.overdue                   || 0),
      upcoming30d:               Number(stats?.upcoming30d               || 0),
      completedThisMonth:        Number(stats?.completedThisMonth        || 0),
      dueThisMonthAssets:        Number(stats?.dueThisMonthAssets        || 0),
      overdueAssets:             Number(stats?.overdueAssets             || 0),
      upcoming30dAssets:         Number(stats?.upcoming30dAssets         || 0),
      completedThisMonthAssets:  Number(stats?.completedThisMonthAssets  || 0),
      totalAssetsInPms:          Number(stats?.totalAssetsInPms          || 0),
      totalCompletedAssets:      Number(stats?.totalCompletedAssets      || 0),
    });
  } catch (err) { next(err); }
});

/* GET /overdue-details — list overdue PMS schedule assets for dashboard alert */
router.get("/overdue-details", async (req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const ids   = req.query.allCompanies === "true"
      ? await getAccessibleCompanyIds(req.companyUser.id, cid(req))
      : [cid(req)];
    const [rows] = await pool.query(
      `SELECT
         ps.id              AS scheduleId,
         ps.schedule_number AS scheduleNumber,
         ps.maintenance_date AS maintenanceDate,
         ps.engineer_name   AS engineerName,
         a.id               AS assetId,
         a.asset_name       AS assetName,
         a.generated_asset_id AS assetCode,
         d.name             AS departmentName,
         co.company_name    AS companyName,
         psa.id             AS psaId,
         psa.status         AS psaStatus,
         DATEDIFF(?, ps.maintenance_date) AS daysOverdue
       FROM pms_schedules ps
       JOIN pms_schedule_assets psa ON psa.schedule_id = ps.id
       JOIN assets a ON a.id = psa.asset_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN companies co ON co.id = ps.company_id
       WHERE ps.company_id IN (${ids.map(() => "?").join(",")})
         AND ps.maintenance_date < ?
         AND ps.status NOT IN ('completed','cancelled')
         AND psa.status NOT IN ('completed','cancelled')
       ORDER BY ps.maintenance_date ASC
       LIMIT 100`,
      [today, ...ids, today]
    );
    res.json(rows || []);
  } catch (err) { next(err); }
});

router.get("/my-pms/stats", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const [[stats]] = await pool.query(
      `SELECT
         COUNT(*)                            AS total,
         SUM(psa.status = 'pending')         AS assigned,
         SUM(psa.status = 'in_progress')     AS inProgress,
         SUM(psa.status = 'completed')       AS completed,
         SUM(psa.status = 'missed')          AS missed
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       WHERE ps.company_id = ? AND psa.engineer_id = ?`,
      [cid(req), userId]
    );
    res.json(stats || { total: 0, assigned: 0, inProgress: 0, completed: 0, missed: 0 });
  } catch (err) { next(err); }
});

router.get("/my-pms", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const { status } = req.query;
    let where = "WHERE ps.company_id = ? AND psa.engineer_id = ?";
    const params = [cid(req), userId];
    if (status) { where += " AND psa.status = ?"; params.push(status); }
    const [rows] = await pool.query(
      `SELECT psa.id, psa.schedule_id, psa.asset_id AS assetId, psa.checklist_id,
              psa.status, psa.completed_at, psa.notes,
              ps.schedule_number, ps.maintenance_date, ps.frequency,
              a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId,
              a.generated_asset_id AS generatedAssetId,
              COALESCE(
                (SELECT qr_unique_id FROM asset_pre_qr WHERE asset_id = a.id AND company_id = ps.company_id LIMIT 1),
                a.asset_unique_id
              ) AS assetQrCode,
              a.building, a.floor, a.room,
              d.name AS departmentName,
              pc.checklist_name AS checklistName, pc.checklist_code AS checklistCode
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       JOIN assets a ON a.id = psa.asset_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN pms_checklists pc ON pc.id = psa.checklist_id
       ${where}
       ORDER BY ps.maintenance_date ASC, a.asset_name ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get("/my-pms/:id/checklist", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const [[psa]] = await pool.query(
      `SELECT psa.*, ps.schedule_number, ps.maintenance_date, ps.frequency,
              a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId,
              a.generated_asset_id AS generatedAssetId,
              COALESCE(
                (SELECT qr_unique_id FROM asset_pre_qr WHERE asset_id = a.id AND company_id = ps.company_id LIMIT 1),
                a.asset_unique_id
              ) AS assetQrCode,
              a.building, a.floor, a.room,
              d.name AS departmentName,
              pc.checklist_name AS checklistName, pc.checklist_code AS checklistCode
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       JOIN assets a ON a.id = psa.asset_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN pms_checklists pc ON pc.id = psa.checklist_id
       WHERE psa.id = ? AND ps.company_id = ? AND psa.engineer_id = ?`,
      [req.params.id, cid(req), userId]
    );
    if (!psa) return res.status(404).json({ message: "PMS assignment not found" });
    const [items] = await pool.query(
      "SELECT * FROM pms_checklist_items WHERE checklist_id = ? ORDER BY sort_order, serial_no",
      [psa.checklist_id]
    );
    res.json({ ...psa, checklistItems: items || [] });
  } catch (err) { next(err); }
});

router.patch("/my-pms/:id/start", requirePermission("pms:fill"), async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const [[psa]] = await pool.query(
      `SELECT psa.id FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       WHERE psa.id = ? AND ps.company_id = ? AND psa.engineer_id = ?`,
      [req.params.id, cid(req), userId]
    );
    if (!psa) return res.status(404).json({ message: "Not found" });
    await pool.query(
      "UPDATE pms_schedule_assets SET status = 'in_progress' WHERE id = ? AND status IN ('pending', 'rework_required')",
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.patch("/my-pms/:id/complete", requirePermission("pms:fill"), async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    const userName = req.companyUser.fullName || req.companyUser.email;
    const { responses = [], engineerNotes = "", engineerImages = [], submissionMetadata = null } = req.body;

    const [[psa]] = await pool.query(
      `SELECT psa.id, psa.asset_id, psa.status, a.department_id,
              ps.maintenance_date, ps.frequency
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       JOIN assets a ON a.id = psa.asset_id
       WHERE psa.id = ? AND ps.company_id = ? AND psa.engineer_id = ?`,
      [req.params.id, cid(req), userId]
    );
    if (!psa) return res.status(404).json({ message: "Not found" });

    // Block re-submission if already completed or closed
    if (["completed", "closed"].includes(psa.status)) {
      // Calculate next occurrence date for the response message
      const mDate   = new Date(psa.maintenance_date);
      const freq    = (psa.frequency || "").toLowerCase();
      if (freq === "monthly")         mDate.setMonth(mDate.getMonth() + 1);
      else if (freq === "quarterly")  mDate.setMonth(mDate.getMonth() + 3);
      else if (freq === "half-yearly")mDate.setMonth(mDate.getMonth() + 6);
      else if (freq === "yearly")     mDate.setFullYear(mDate.getFullYear() + 1);
      const nextDateStr = isNaN(mDate.getTime()) ? null
        : mDate.toISOString().slice(0, 10);

      return res.status(409).json({
        message: psa.status === "closed"
          ? "This PMS has already been closed by the Department Head."
          : "PMS already submitted for this schedule. Re-submission is not allowed.",
        nextPmsDate: nextDateStr,
        currentStatus: psa.status,
      });
    }

    // Save checklist responses
    if (responses.length > 0) {
      await pool.query("DELETE FROM pms_submission_responses WHERE pms_assignment_id = ?", [psa.id]);
      const vals = responses.map((r, i) => [
        psa.id, r.checklistItemId, r.responseValue ?? null, r.photoUrl ?? null, r.remarks ?? null, i,
      ]);
      await pool.query(
        "INSERT INTO pms_submission_responses (pms_assignment_id, checklist_item_id, response_value, photo_url, remarks, sort_order) VALUES ?",
        [vals]
      );
    }

    // Check if ANY department_head exists in this company (status-agnostic)
    const [[anyDeptHead]] = await pool.query(
      "SELECT id FROM company_users WHERE company_id = ? AND role = 'department_head' LIMIT 1",
      [cid(req)]
    );
    const approvalStatus = anyDeptHead ? "pending" : "auto_approved";

    // Engineer submitting = checklist is completed; dept head will close it later
    const newStatus = "completed";
    const metaJson = submissionMetadata ? JSON.stringify({ ...submissionMetadata, capturedAt: new Date().toISOString() }) : null;
    await pool.query(
      `UPDATE pms_schedule_assets
       SET status = ?, completed_by = ?, completed_at = NOW(), submitted_at = NOW(),
           engineer_notes = ?, engineer_images = ?, approval_status = ?, submission_metadata = ?
       WHERE id = ?`,
      [newStatus, userId, engineerNotes || null, engineerImages.length ? JSON.stringify(engineerImages) : null, approvalStatus, metaJson, psa.id]
    );
    await pool.query("UPDATE assets SET last_pms_date = CURDATE() WHERE id = ?", [psa.asset_id]);

    // Audit log
    await pool.query(
      "INSERT INTO pms_audit_log (company_id, pms_assignment_id, action, actor_id, actor_name, actor_role, comments) VALUES (?,?,?,?,?,?,?)",
      [cid(req), psa.id, "engineer_submitted", userId, userName, "engineer", engineerNotes || null]
    );

    res.json({ ok: true, approvalStatus, newStatus });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: DEPARTMENT HEAD APPROVAL
// ═══════════════════════════════════════════════════════════════════════════════

// GET /dept-head/pending — PMS submissions awaiting approval for this dept head's department
router.get("/dept-head/pending", async (req, res, next) => {
  try {
    const user = req.companyUser;
    if (user.role !== "department_head" && user.role !== "admin")
      return res.status(403).json({ message: "Department Head access required" });

    // Resolve department filter for non-admin dept heads.
    // If the dept head has a department_id set → filter to their dept only.
    // If department_id is NULL → they see ALL company-wide pending submissions.
    let deptFilter = "";
    let params;
    if (user.role === "admin") {
      params = [cid(req)];
    } else {
      const [[dhu]] = await pool.query(
        "SELECT department_id FROM company_users WHERE id = ? AND company_id = ? LIMIT 1",
        [user.id, cid(req)]
      );
      if (dhu?.department_id) {
        deptFilter = "AND a.department_id = ?";
        params = [cid(req), dhu.department_id];
      } else {
        // No department assigned → show all pending for the company
        params = [cid(req)];
      }
    }

    const [rows] = await pool.query(
      `SELECT psa.id, psa.asset_id AS assetId, psa.schedule_id AS scheduleId,
              psa.status, psa.approval_status AS approvalStatus,
              psa.submitted_at AS submittedAt, psa.engineer_notes AS engineerNotes,
              psa.engineer_images AS engineerImages,
              psa.completed_at AS completedAt,
              a.asset_name AS assetName, a.generated_asset_id AS generatedAssetId,
              a.asset_unique_id AS assetUniqueId, a.building, a.floor, a.room,
              d.name AS departmentName,
              ps.schedule_number AS scheduleNumber, ps.maintenance_date AS maintenanceDate,
              ps.frequency,
              cu.full_name AS engineerName,
              pc.checklist_name AS checklistName
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       JOIN assets a ON a.id = psa.asset_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN company_users cu ON cu.id = psa.completed_by
       LEFT JOIN pms_checklists pc ON pc.id = psa.checklist_id
       WHERE ps.company_id = ? AND psa.approval_status IN ('pending', 'auto_approved')
       ${deptFilter}
       ORDER BY psa.submitted_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /dept-head/stats — summary counts for this dept head's department
router.get("/dept-head/stats", async (req, res, next) => {
  try {
    const user = req.companyUser;
    if (user.role !== "department_head" && user.role !== "admin")
      return res.status(403).json({ message: "Department Head access required" });

    let deptFilter = "";
    let params = [cid(req)];
    if (user.role !== "admin") {
      const [[dhu]] = await pool.query(
        "SELECT department_id FROM company_users WHERE id = ? AND company_id = ? LIMIT 1",
        [user.id, cid(req)]
      );
      if (dhu?.department_id) {
        deptFilter = "AND a.department_id = ?";
        params = [cid(req), dhu.department_id];
      }
    }

    const [[row]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(psa.approval_status IN ('pending','auto_approved')) AS pending,
         SUM(psa.approval_status = 'approved') AS approved,
         SUM(psa.approval_status = 'closed') AS closed,
         SUM(psa.approval_status = 'rejected') AS rejected
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       JOIN assets a ON a.id = psa.asset_id
       WHERE ps.company_id = ? AND psa.submitted_at IS NOT NULL
       ${deptFilter}`,
      params
    );
    res.json({
      total:    Number(row.total)    || 0,
      pending:  Number(row.pending)  || 0,
      approved: Number(row.approved) || 0,
      closed:   Number(row.closed)   || 0,
      rejected: Number(row.rejected) || 0,
    });
  } catch (err) { next(err); }
});

// GET /dept-head/:id/details — full submission detail for dept head review
router.get("/dept-head/:id/details", async (req, res, next) => {
  try {
    const user = req.companyUser;
    if (user.role !== "department_head" && user.role !== "admin")
      return res.status(403).json({ message: "Department Head access required" });

    const [[psa]] = await pool.query(
      `SELECT psa.*,
              a.asset_name AS assetName, a.generated_asset_id AS generatedAssetId,
              a.asset_unique_id AS assetUniqueId, a.building, a.floor, a.room,
              a.department_id AS departmentId,
              d.name AS departmentName,
              ps.schedule_number AS scheduleNumber, ps.maintenance_date AS maintenanceDate, ps.frequency,
              cu.full_name AS engineerName, cu.designation AS engineerDesignation,
              pc.checklist_name AS checklistName, pc.checklist_code AS checklistCode,
              approver.full_name AS approvedByName
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       JOIN assets a ON a.id = psa.asset_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN company_users cu ON cu.id = psa.completed_by
       LEFT JOIN pms_checklists pc ON pc.id = psa.checklist_id
       LEFT JOIN company_users approver ON approver.id = psa.approved_by
       WHERE psa.id = ? AND ps.company_id = ?`,
      [req.params.id, cid(req)]
    );
    if (!psa) return res.status(404).json({ message: "Not found" });

    // Checklist responses with item details (LEFT JOIN so responses are never lost if items were edited)
    const [responses] = await pool.query(
      `SELECT r.id, r.checklist_item_id AS checklistItemId,
              r.response_value AS responseValue, r.photo_url AS photoUrl, r.remarks,
              r.sort_order AS sortOrder,
              COALESCE(i.inspection_point, CONCAT('Item #', r.checklist_item_id)) AS inspectionPoint,
              COALESCE(i.check_type, '—') AS checkType,
              COALESCE(i.response_type, '—') AS responseType,
              COALESCE(i.is_mandatory, 0) AS isMandatory,
              i.tolerance_value AS toleranceValue
       FROM pms_submission_responses r
       LEFT JOIN pms_checklist_items i ON i.id = r.checklist_item_id
       WHERE r.pms_assignment_id = ?
       ORDER BY r.sort_order`,
      [psa.id]
    );

    // Audit log
    const [auditLog] = await pool.query(
      "SELECT * FROM pms_audit_log WHERE pms_assignment_id = ? ORDER BY created_at ASC",
      [psa.id]
    );

    const safeJson = (val) => {
      if (val == null) return null;
      if (typeof val === "object") return val; // already parsed by mysql2
      try { return JSON.parse(val); } catch { return null; }
    };

    res.json({
      ...psa,
      engineerImages:     safeJson(psa.engineer_images)     ?? [],
      submissionMetadata: safeJson(psa.submission_metadata) ?? null,
      reviewMetadata:     safeJson(psa.review_metadata)     ?? null,
      responses,
      auditLog,
    });
  } catch (err) { next(err); }
});

// PATCH /dept-head/:id/review — close PMS or request rework
router.patch("/dept-head/:id/review", async (req, res, next) => {
  try {
    const user = req.companyUser;
    if (user.role !== "department_head" && user.role !== "admin")
      return res.status(403).json({ message: "Department Head access required" });

    const { decision, approvalComments = "", reviewMetadata = null } = req.body;
    if (!["closed", "rework_required"].includes(decision))
      return res.status(400).json({ message: "decision must be closed | rework_required" });

    const [[psa]] = await pool.query(
      `SELECT psa.id FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       WHERE psa.id = ? AND ps.company_id = ?`,
      [req.params.id, cid(req)]
    );
    if (!psa) return res.status(404).json({ message: "Not found" });

    const newStatus = decision === "closed" ? "closed" : "rework_required";
    const newApprovalStatus = decision === "closed" ? "closed" : "rework_required";
    const metaJson = reviewMetadata ? JSON.stringify({ ...reviewMetadata, capturedAt: new Date().toISOString() }) : null;
    await pool.query(
      `UPDATE pms_schedule_assets
       SET approval_status = ?, approved_by = ?, approved_at = NOW(),
           approval_comments = ?, reviewer_id = ?, reviewer_name = ?,
           status = ?, review_metadata = ?
       WHERE id = ?`,
      [newApprovalStatus, user.id, approvalComments || null, user.id, user.fullName || user.email, newStatus, metaJson, psa.id]
    );

    await pool.query(
      "INSERT INTO pms_audit_log (company_id, pms_assignment_id, action, actor_id, actor_name, actor_role, comments) VALUES (?,?,?,?,?,?,?)",
      [cid(req), psa.id, `dept_head_${decision}`, user.id, user.fullName || user.email, "department_head", approvalComments || null]
    );

    res.json({ ok: true, newStatus, decision });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE: PMS REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /reports — asset-wise PMS summary (one row per asset that has at least one PMS)
router.get("/reports", async (req, res, next) => {
  try {
    const { department, building, floor, engineer, status: statusFilter, search, allCompanies } = req.query;
    let having = "";

    let companyWhere;
    let params;
    if (allCompanies === "true") {
      const ids = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
      companyWhere = `ps.company_id IN (${ids.map(() => "?").join(",")})`;
      params = [...ids];
    } else {
      companyWhere = "ps.company_id = ?";
      params = [cid(req)];
    }

    const conditions = [];
    if (department) { conditions.push("a.department_id = ?"); params.push(department); }
    if (building)   { conditions.push("a.building = ?");    params.push(building); }
    if (floor)      { conditions.push("a.floor = ?");       params.push(floor); }
    if (engineer)   { conditions.push("psa.completed_by = ?"); params.push(engineer); }
    if (statusFilter) { conditions.push("psa.approval_status = ?"); params.push(statusFilter); }
    if (search) {
      conditions.push("(a.asset_name LIKE ? OR a.generated_asset_id LIKE ? OR a.asset_unique_id LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const extraWhere = conditions.length ? `AND ${conditions.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `SELECT a.id AS assetId, a.asset_name AS assetName,
              a.generated_asset_id AS generatedAssetId, a.asset_unique_id AS assetUniqueId,
              a.building, a.floor, a.room,
              d.name AS departmentName,
              ANY_VALUE(co.company_name) AS hospitalName,
              COUNT(psa.id) AS totalPms,
              SUM(psa.approval_status IN ('closed','approved','auto_approved')) AS closedPms,
              SUM(psa.approval_status = 'pending') AS pendingApproval,
              MAX(psa.completed_at) AS lastPmsDate,
              (SELECT MIN(ps2.maintenance_date)
               FROM pms_schedules ps2
               JOIN pms_schedule_assets psa2 ON psa2.schedule_id = ps2.id AND psa2.asset_id = a.id
               WHERE ps2.company_id = a.company_id
                 AND ps2.maintenance_date > CURDATE()
              ) AS nextPmsDate
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       JOIN assets a ON a.id = psa.asset_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN companies co ON co.id = a.company_id
       WHERE ${companyWhere} ${extraWhere}
       GROUP BY a.id
       ORDER BY lastPmsDate DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /reports/:assetId — full PMS timeline for one asset
router.get("/reports/:assetId", async (req, res, next) => {
  try {
    // Scope to every company the user can access (admins in All-Hospitals mode
    // may open an asset that belongs to another accessible hospital).
    const ids = await getAccessibleCompanyIds(req.companyUser.id, cid(req));
    const ph = ids.map(() => "?").join(",");
    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name AS assetName, a.generated_asset_id AS generatedAssetId,
              a.asset_unique_id AS assetUniqueId, a.building, a.floor, a.room,
              a.last_pms_date AS lastPmsDate, a.next_pms_due AS nextPmsDue,
              d.name AS departmentName,
              ad.metadata
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ? AND a.company_id IN (${ph})`,
      [req.params.assetId, ...ids]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const [history] = await pool.query(
      `SELECT psa.id, psa.status, psa.approval_status AS approvalStatus,
              psa.submitted_at AS submittedAt, psa.completed_at AS completedAt,
              psa.approved_at AS approvedAt, psa.approval_comments AS approvalComments,
              psa.engineer_notes AS engineerNotes,
              psa.submission_metadata AS submissionMetadata,
              psa.review_metadata AS reviewMetadata,
              ps.schedule_number AS scheduleNumber, ps.maintenance_date AS maintenanceDate, ps.frequency,
              cu.full_name AS engineerName,
              reviewer.full_name AS reviewerName,
              pc.checklist_name AS checklistName, pc.checklist_code AS checklistCode,
              (SELECT COUNT(*) FROM pms_submission_responses WHERE pms_assignment_id = psa.id) AS responseCount
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       LEFT JOIN company_users cu ON cu.id = psa.completed_by
       LEFT JOIN company_users reviewer ON reviewer.id = psa.reviewer_id
       LEFT JOIN pms_checklists pc ON pc.id = psa.checklist_id
       WHERE psa.asset_id = ? AND ps.company_id IN (${ph})
       ORDER BY ps.maintenance_date DESC`,
      [req.params.assetId, ...ids]
    );

    res.json({ asset, history });
  } catch (err) { next(err); }
});

// GET /assignments/:id/responses — full submission responses for admin/reports view
router.get("/assignments/:id/responses", async (req, res, next) => {
  try {
    const [[psa]] = await pool.query(
      `SELECT psa.*, ps.company_id AS companyId,
              a.asset_name AS assetName, a.generated_asset_id AS generatedAssetId,
              d.name AS departmentName,
              ps.schedule_number AS scheduleNumber, ps.maintenance_date AS maintenanceDate,
              cu.full_name AS engineerName,
              pc.checklist_name AS checklistName,
              approver.full_name AS approvedByName
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       JOIN assets a ON a.id = psa.asset_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN company_users cu ON cu.id = psa.completed_by
       LEFT JOIN pms_checklists pc ON pc.id = psa.checklist_id
       LEFT JOIN company_users approver ON approver.id = psa.approved_by
       WHERE psa.id = ? AND ps.company_id = ?`,
      [req.params.id, cid(req)]
    );
    if (!psa) return res.status(404).json({ message: "Not found" });

    const [responses] = await pool.query(
      `SELECT r.id, r.checklist_item_id AS checklistItemId,
              r.response_value AS responseValue, r.photo_url AS photoUrl,
              r.remarks, r.sort_order AS sortOrder,
              i.inspection_point AS inspectionPoint, i.check_type AS checkType,
              i.response_type AS responseType, i.is_mandatory AS isMandatory,
              i.tolerance_value AS toleranceValue, i.serial_no AS serialNo
       FROM pms_submission_responses r
       JOIN pms_checklist_items i ON i.id = r.checklist_item_id
       WHERE r.pms_assignment_id = ?
       ORDER BY r.sort_order`,
      [psa.id]
    );

    const [auditLog] = await pool.query(
      "SELECT * FROM pms_audit_log WHERE pms_assignment_id = ? ORDER BY created_at ASC",
      [psa.id]
    );

    res.json({
      ...psa,
      engineerImages: psa.engineer_images ? JSON.parse(psa.engineer_images) : [],
      responses,
      auditLog,
    });
  } catch (err) { next(err); }
});

export default router;
