/**
 * Calibration Management API
 * Prefix: /api/company-portal/calibration
 *
 * 1. Vendor Management
 * 2. Schedule Management (recurring, conflict detection)
 * 3. Certificate Upload & Management (S3)
 * 4. Reports (asset-wise history)
 * 5. Audit Log
 */

import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { isMigrationSafeError } from "../db.js";
import { uploadToS3, getPresignedUrl, keyFromS3Url } from "../utils/s3.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const S3_READY = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const CERT_LOCAL_DIR = path.join(__dirname, "../../uploads/calibration");

// Upload a certificate buffer — S3 when credentials exist, local disk otherwise
async function saveCertFile({ buffer, mimetype, filename }) {
  if (S3_READY) {
    return uploadToS3({ buffer, mimetype, folder: "calibration", filename });
  }
  fs.mkdirSync(CERT_LOCAL_DIR, { recursive: true });
  const safeName = path.basename(filename);
  fs.writeFileSync(path.join(CERT_LOCAL_DIR, safeName), buffer);
  return `/uploads/calibration/${safeName}`;
}

const router = Router();
router.use(requireCompanyAuth);
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === ".pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"), false);
  },
});

// ── Auto-migration ─────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => {
    try { await pool.query(sql); }
    catch (e) { if (!isMigrationSafeError(e)) console.warn("[calibration] migration:", e.message); }
  };

  await safe(`CREATE TABLE IF NOT EXISTS calibration_vendors (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id INT UNSIGNED NOT NULL,
    vendor_name VARCHAR(200) NOT NULL,
    vendor_code VARCHAR(60) NOT NULL,
    contact_person VARCHAR(160) NULL,
    mobile VARCHAR(30) NULL,
    email VARCHAR(200) NULL,
    company_name VARCHAR(200) NULL,
    gst_number VARCHAR(20) NULL,
    address TEXT NULL,
    city VARCHAR(100) NULL,
    state VARCHAR(100) NULL,
    country VARCHAR(80) NULL DEFAULT 'India',
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_calib_vendor_code (company_id, vendor_code),
    KEY idx_calib_vendor_company (company_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS calibration_schedules (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id INT UNSIGNED NOT NULL,
    schedule_number VARCHAR(60) NULL,
    calibration_date DATE NOT NULL,
    frequency VARCHAR(40) NOT NULL DEFAULT 'One Time',
    status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
    notes TEXT NULL,
    recurring_group_id CHAR(36) NULL,
    occurrence_index INT NOT NULL DEFAULT 0,
    created_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_calib_sched_company (company_id),
    KEY idx_calib_sched_date (calibration_date),
    KEY idx_calib_sched_group (recurring_group_id),
    CONSTRAINT fk_calib_sched_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS calibration_schedule_assets (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    schedule_id INT UNSIGNED NOT NULL,
    asset_id INT UNSIGNED NOT NULL,
    vendor_id INT UNSIGNED NULL,
    vendor_name VARCHAR(200) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    certificate_id INT UNSIGNED NULL,
    completed_at DATETIME NULL,
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_calib_sched_asset (schedule_id, asset_id),
    KEY idx_calib_sa_sched (schedule_id),
    KEY idx_calib_sa_asset (asset_id),
    CONSTRAINT fk_calib_sa_sched FOREIGN KEY (schedule_id) REFERENCES calibration_schedules(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS calibration_certificates (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id INT UNSIGNED NOT NULL,
    asset_id INT UNSIGNED NOT NULL,
    schedule_asset_id INT UNSIGNED NULL,
    vendor_id INT UNSIGNED NULL,
    vendor_name VARCHAR(200) NULL,
    file_url VARCHAR(1000) NOT NULL,
    file_name VARCHAR(300) NOT NULL,
    file_size INT UNSIGNED NULL,
    version INT NOT NULL DEFAULT 1,
    calibration_date DATE NULL,
    uploaded_by INT UNSIGNED NULL,
    uploaded_by_name VARCHAR(160) NULL,
    notes TEXT NULL,
    is_current TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_calib_cert_asset (asset_id),
    KEY idx_calib_cert_company (company_id),
    KEY idx_calib_cert_sa (schedule_asset_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS calibration_audit_log (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id INT UNSIGNED NOT NULL,
    action VARCHAR(80) NOT NULL,
    actor_id INT UNSIGNED NULL,
    actor_name VARCHAR(160) NULL,
    actor_role VARCHAR(60) NULL,
    target_type VARCHAR(60) NULL,
    target_id INT UNSIGNED NULL,
    details JSON NULL,
    ip_address VARCHAR(60) NULL,
    device_info VARCHAR(300) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_calib_audit_company (company_id),
    KEY idx_calib_audit_target (target_type, target_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Link asset to latest calibration info
  await safe(`ALTER TABLE assets ADD COLUMN last_calibration_date DATE NULL`);
  await safe(`ALTER TABLE assets ADD COLUMN next_calibration_due DATE NULL`);

  // Safety: ensure all required columns exist on pre-existing tables
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER id`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN vendor_name VARCHAR(200) NOT NULL DEFAULT '' AFTER company_id`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN vendor_code VARCHAR(60) NOT NULL DEFAULT '' AFTER vendor_name`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN contact_person VARCHAR(160) NULL`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN mobile VARCHAR(30) NULL`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN email VARCHAR(200) NULL`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN company_name VARCHAR(200) NULL`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN gst_number VARCHAR(20) NULL`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN address TEXT NULL`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN city VARCHAR(100) NULL`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN state VARCHAR(100) NULL`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN country VARCHAR(80) NULL DEFAULT 'India'`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN status ENUM('active','inactive') NOT NULL DEFAULT 'active'`);
  await safe(`ALTER TABLE calibration_vendors ADD COLUMN created_by INT UNSIGNED NULL`);
  await safe(`ALTER TABLE calibration_schedules ADD COLUMN company_id INT UNSIGNED NOT NULL DEFAULT 0 AFTER id`);
  await safe(`ALTER TABLE calibration_schedules ADD COLUMN schedule_number VARCHAR(60) NULL`);
  await safe(`ALTER TABLE calibration_schedules ADD COLUMN calibration_date DATE NOT NULL DEFAULT '2000-01-01'`);
  await safe(`ALTER TABLE calibration_schedules ADD COLUMN frequency VARCHAR(40) NOT NULL DEFAULT 'One Time'`);
  await safe(`ALTER TABLE calibration_schedules ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'scheduled'`);
  await safe(`ALTER TABLE calibration_schedules ADD COLUMN notes TEXT NULL`);
  await safe(`ALTER TABLE calibration_schedules ADD COLUMN recurring_group_id CHAR(36) NULL`);
  await safe(`ALTER TABLE calibration_schedules ADD COLUMN occurrence_index INT NOT NULL DEFAULT 0`);
  await safe(`ALTER TABLE calibration_schedules ADD COLUMN created_by INT UNSIGNED NULL`);
  await safe(`ALTER TABLE calibration_schedule_assets ADD COLUMN vendor_id INT UNSIGNED NULL`);
  await safe(`ALTER TABLE calibration_schedule_assets ADD COLUMN vendor_name VARCHAR(200) NULL`);
  await safe(`ALTER TABLE calibration_schedule_assets ADD COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending'`);
  await safe(`ALTER TABLE calibration_schedule_assets ADD COLUMN certificate_id INT UNSIGNED NULL`);
  await safe(`ALTER TABLE calibration_schedule_assets ADD COLUMN completed_at DATETIME NULL`);
  await safe(`ALTER TABLE calibration_schedule_assets ADD COLUMN notes TEXT NULL`);

  // Data fix: reassign any orphaned rows (company_id=0 from pre-existing tables) to the first company
  try {
    const [[firstCo]] = await pool.query("SELECT id FROM companies ORDER BY id LIMIT 1");
    if (firstCo?.id) {
      await pool.query("UPDATE calibration_vendors SET company_id = ? WHERE company_id = 0", [firstCo.id]);
      await pool.query("UPDATE calibration_schedules SET company_id = ? WHERE company_id = 0", [firstCo.id]);
    }
  } catch (e) { console.warn("[calibration] company_id data-fix:", e.message); }

  // Cleanup: remove ghost records with empty vendor_name (created before input was working)
  try {
    await pool.query("DELETE FROM calibration_vendors WHERE vendor_name IS NULL OR vendor_name = ''");
  } catch (e) { console.warn("[calibration] ghost vendor cleanup:", e.message); }
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cid = (req) => req.companyUser.companyId;
const uid = (req) => req.companyUser.id;
const uname = (req) => req.companyUser.name || req.companyUser.email || "Unknown";
const urole = (req) => req.companyUser.role || "unknown";

function nextCalibDate(dateStr, frequency) {
  const d = new Date(dateStr);
  switch (frequency) {
    case "Monthly":     return new Date(d.getFullYear(), d.getMonth() + 1,  d.getDate());
    case "Quarterly":   return new Date(d.getFullYear(), d.getMonth() + 3,  d.getDate());
    case "Half-Yearly": return new Date(d.getFullYear(), d.getMonth() + 6,  d.getDate());
    case "Yearly":      return new Date(d.getFullYear() + 1, d.getMonth(),  d.getDate());
    default:            return null;
  }
}
function extraOccurrences(freq) {
  return { Monthly: 11, Quarterly: 3, "Half-Yearly": 1, Yearly: 1 }[freq] ?? 0;
}
function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function newUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
async function nextVendorCode(companyId) {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM calibration_vendors WHERE company_id = ?", [companyId]);
  return `VND-${String(Number(n) + 1).padStart(4, "0")}`;
}
async function nextScheduleNumber(companyId) {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM calibration_schedules WHERE company_id = ?", [companyId]);
  return `CAL-${String(Number(n) + 1).padStart(5, "0")}`;
}
async function auditLog(companyId, action, actorId, actorName, actorRole, targetType, targetId, details, req) {
  const ip = req?.ip || req?.headers?.["x-forwarded-for"] || null;
  const ua = req?.headers?.["user-agent"] || null;
  await pool.query(
    `INSERT INTO calibration_audit_log (company_id, action, actor_id, actor_name, actor_role, target_type, target_id, details, ip_address, device_info)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyId, action, actorId, actorName, actorRole, targetType, targetId, details ? JSON.stringify(details) : null, ip, ua]
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// GET /vendors — list vendors
router.get("/vendors", async (req, res, next) => {
  try {
    const { status, search } = req.query;
    let sql = `SELECT * FROM calibration_vendors WHERE company_id = ?`;
    const params = [cid(req)];
    if (status) { sql += ` AND status = ?`; params.push(status); }
    if (search) { sql += ` AND (vendor_name LIKE ? OR vendor_code LIKE ? OR contact_person LIKE ? OR email LIKE ?)`; const s = `%${search}%`; params.push(s, s, s, s); }
    sql += ` ORDER BY vendor_name`;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /vendors — create vendor
router.post("/vendors", async (req, res, next) => {
  try {
    const { vendorName, contactPerson, mobile, email, companyName, gstNumber, address, city, state, country } = req.body;
    if (!vendorName?.trim()) return res.status(400).json({ message: "Vendor name is required" });
    const vendorCode = await nextVendorCode(cid(req));
    const [r] = await pool.query(
      `INSERT INTO calibration_vendors (company_id, vendor_name, vendor_code, contact_person, mobile, email, company_name, gst_number, address, city, state, country, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid(req), vendorName.trim(), vendorCode, contactPerson||null, mobile||null, email||null, companyName||null, gstNumber||null, address||null, city||null, state||null, country||"India", uid(req)]
    );
    await auditLog(cid(req), "VENDOR_CREATED", uid(req), uname(req), urole(req), "vendor", r.insertId, { vendorName, vendorCode }, req);
    const [[created]] = await pool.query("SELECT * FROM calibration_vendors WHERE id = ?", [r.insertId]);
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// PATCH /vendors/:id — update vendor
router.patch("/vendors/:id", async (req, res, next) => {
  try {
    const { vendorName, contactPerson, mobile, email, companyName, gstNumber, address, city, state, country, status } = req.body;
    const id = Number(req.params.id);
    const [[v]] = await pool.query("SELECT id, company_id FROM calibration_vendors WHERE id = ?", [id]);
    if (!v || (v.company_id !== 0 && v.company_id !== cid(req))) return res.status(404).json({ message: "Vendor not found" });
    if (v.company_id === 0) await pool.query("UPDATE calibration_vendors SET company_id = ? WHERE id = ?", [cid(req), id]);
    await pool.query(
      `UPDATE calibration_vendors SET vendor_name=COALESCE(?,vendor_name), contact_person=COALESCE(?,contact_person), mobile=COALESCE(?,mobile), email=COALESCE(?,email), company_name=COALESCE(?,company_name), gst_number=COALESCE(?,gst_number), address=COALESCE(?,address), city=COALESCE(?,city), state=COALESCE(?,state), country=COALESCE(?,country), status=COALESCE(?,status) WHERE id=?`,
      [vendorName||null, contactPerson||null, mobile||null, email||null, companyName||null, gstNumber||null, address||null, city||null, state||null, country||null, status||null, id]
    );
    await auditLog(cid(req), "VENDOR_UPDATED", uid(req), uname(req), urole(req), "vendor", id, req.body, req);
    const [[updated]] = await pool.query("SELECT * FROM calibration_vendors WHERE id = ?", [id]);
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /vendors/:id — delete vendor (only if not referenced)
router.delete("/vendors/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[v]] = await pool.query("SELECT id, company_id FROM calibration_vendors WHERE id = ?", [id]);
    if (!v || (v.company_id !== 0 && v.company_id !== cid(req))) return res.status(404).json({ message: "Vendor not found" });
    const [[{ cnt }]] = await pool.query("SELECT COUNT(*) AS cnt FROM calibration_schedule_assets WHERE vendor_id = ?", [id]);
    if (cnt > 0) return res.status(409).json({ message: "Vendor is in use and cannot be deleted. Deactivate it instead." });
    await pool.query("DELETE FROM calibration_vendors WHERE id = ? AND company_id = ?", [id, cid(req)]);
    await auditLog(cid(req), "VENDOR_DELETED", uid(req), uname(req), urole(req), "vendor", id, null, req);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// POST /schedules/check-conflicts — detect conflicting future schedules
router.post("/schedules/check-conflicts", async (req, res, next) => {
  try {
    const { assetIds = [] } = req.body;
    if (!assetIds.length) return res.json({ conflicts: [] });
    const [conflicts] = await pool.query(
      `SELECT csa.asset_id, a.asset_name, a.generated_asset_id, cs.calibration_date, cs.schedule_number
       FROM calibration_schedule_assets csa
       JOIN calibration_schedules cs ON cs.id = csa.schedule_id
       JOIN assets a ON a.id = csa.asset_id
       WHERE csa.asset_id IN (?) AND cs.company_id = ? AND cs.calibration_date >= CURDATE()
         AND csa.status IN ('pending','in_progress')
       ORDER BY cs.calibration_date`,
      [assetIds, cid(req)]
    );
    res.json({ conflicts });
  } catch (e) { next(e); }
});

// GET /schedules — list/calendar schedules
router.get("/schedules", async (req, res, next) => {
  try {
    const { from, to, status, search } = req.query;
    let sql = `
      SELECT cs.id, cs.schedule_number, cs.calibration_date, cs.frequency, cs.status, cs.notes,
             cs.recurring_group_id, cs.occurrence_index, cs.created_at,
             COUNT(csa.id) AS total_assets,
             SUM(csa.status = 'completed') AS completed_assets,
             SUM(csa.status = 'pending') AS pending_assets
      FROM calibration_schedules cs
      LEFT JOIN calibration_schedule_assets csa ON csa.schedule_id = cs.id
      WHERE cs.company_id = ?`;
    const params = [cid(req)];
    if (from) { sql += ` AND cs.calibration_date >= ?`; params.push(from); }
    if (to)   { sql += ` AND cs.calibration_date <= ?`; params.push(to);   }
    if (status) { sql += ` AND cs.status = ?`; params.push(status); }
    if (search) { sql += ` AND (cs.schedule_number LIKE ?)`; params.push(`%${search}%`); }
    sql += ` GROUP BY cs.id ORDER BY cs.calibration_date DESC`;
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /schedules — create schedule(s)
router.post("/schedules", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { calibrationDate, frequency = "One Time", notes, assetIds = [], replaceConflicts = false } = req.body;
    if (!calibrationDate) return res.status(400).json({ message: "calibrationDate is required" });
    if (!assetIds.length)  return res.status(400).json({ message: "Select at least one asset" });

    // Replace conflicts if requested
    if (replaceConflicts) {
      const [conflictRows] = await conn.query(
        `SELECT csa.id FROM calibration_schedule_assets csa
         JOIN calibration_schedules cs ON cs.id = csa.schedule_id
         WHERE csa.asset_id IN (?) AND cs.company_id = ? AND cs.calibration_date >= CURDATE()
           AND csa.status IN ('pending','in_progress')`,
        [assetIds, cid(req)]
      );
      if (conflictRows.length) {
        const ids = conflictRows.map(r => r.id);
        await conn.query(`DELETE FROM calibration_schedule_assets WHERE id IN (?)`, [ids]);
      }
    }

    // Determine occurrences: One Time = 1, others = 1 year worth
    const extra = extraOccurrences(frequency);
    const groupId = extra > 0 ? newUUID() : null;
    let currentDate = calibrationDate;
    const schedulesCreated = [];

    for (let idx = 0; idx <= extra; idx++) {
      const schedNum = await nextScheduleNumber(cid(req));
      const [sr] = await conn.query(
        `INSERT INTO calibration_schedules (company_id, schedule_number, calibration_date, frequency, notes, recurring_group_id, occurrence_index, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cid(req), schedNum, currentDate, frequency, notes||null, groupId, idx, uid(req)]
      );
      const scheduleId = sr.insertId;

      // Insert assets (skip already-scheduled ones if not replacing)
      let added = 0, skipped = 0;
      for (const assetId of assetIds) {
        try {
          await conn.query(
            `INSERT INTO calibration_schedule_assets (schedule_id, asset_id) VALUES (?, ?)`,
            [scheduleId, assetId]
          );
          added++;
        } catch (e) {
          if (e.code === "ER_DUP_ENTRY") { skipped++; } else throw e;
        }
      }
      schedulesCreated.push({ scheduleId, scheduleNumber: schedNum, date: currentDate, added, skipped });

      // Advance date for next occurrence
      if (idx < extra) {
        const next = nextCalibDate(currentDate, frequency);
        if (!next) break;
        currentDate = fmtDate(next);
      }
    }

    await conn.commit();
    await auditLog(cid(req), "SCHEDULE_CREATED", uid(req), uname(req), urole(req), "schedule", schedulesCreated[0]?.scheduleId, { frequency, assetCount: assetIds.length, occurrences: schedulesCreated.length }, req);
    res.status(201).json({ ok: true, occurrencesCreated: schedulesCreated.length, schedules: schedulesCreated, recurringGroupId: groupId });
  } catch (e) {
    await conn.rollback();
    next(e);
  } finally { conn.release(); }
});

// GET /schedules/:id — schedule detail
router.get("/schedules/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[sched]] = await pool.query(
      `SELECT cs.*, COUNT(csa.id) AS total_assets, SUM(csa.status='completed') AS completed_assets
       FROM calibration_schedules cs LEFT JOIN calibration_schedule_assets csa ON csa.schedule_id=cs.id
       WHERE cs.id=? AND cs.company_id=? GROUP BY cs.id`,
      [id, cid(req)]
    );
    if (!sched) return res.status(404).json({ message: "Schedule not found" });
    res.json(sched);
  } catch (e) { next(e); }
});

// GET /schedules/:id/assets — assets for a schedule
router.get("/schedules/:id/assets", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [rows] = await pool.query(
      `SELECT csa.id, csa.asset_id, csa.vendor_id, csa.vendor_name, csa.status, csa.completed_at, csa.notes,
              a.asset_name, a.generated_asset_id, a.asset_unique_id, a.asset_type,
              JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.category')) AS asset_category,
              JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.make'))     AS manufacturer,
              JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.model'))    AS model,
              d.name AS departmentName,
              cc.id AS certificate_id, cc.file_name AS cert_file_name, cc.version AS cert_version, cc.created_at AS cert_uploaded_at
       FROM calibration_schedule_assets csa
       JOIN assets a ON a.id = csa.asset_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN calibration_certificates cc ON cc.id = csa.certificate_id
       WHERE csa.schedule_id = ?
       ORDER BY a.asset_name`,
      [id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// PATCH /schedule-assets/:id/vendor — assign vendor
router.patch("/schedule-assets/:id/vendor", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { vendorId } = req.body;
    let vendorName = null;
    if (vendorId) {
      const [[v]] = await pool.query("SELECT vendor_name FROM calibration_vendors WHERE id = ? AND company_id = ?", [vendorId, cid(req)]);
      if (!v) return res.status(404).json({ message: "Vendor not found" });
      vendorName = v.vendor_name;
    }
    await pool.query("UPDATE calibration_schedule_assets SET vendor_id = ?, vendor_name = ? WHERE id = ?", [vendorId||null, vendorName, id]);
    await auditLog(cid(req), "VENDOR_ASSIGNED", uid(req), uname(req), urole(req), "schedule_asset", id, { vendorId, vendorName }, req);
    res.json({ ok: true, vendorName });
  } catch (e) { next(e); }
});

// PATCH /schedule-assets/bulk-vendor — assign vendor to multiple assets
router.patch("/schedule-assets/bulk-vendor", async (req, res, next) => {
  try {
    const { assetRowIds = [], vendorId } = req.body;
    if (!assetRowIds.length) return res.status(400).json({ message: "No assets selected" });
    let vendorName = null;
    if (vendorId) {
      const [[v]] = await pool.query("SELECT vendor_name FROM calibration_vendors WHERE id = ? AND company_id = ?", [vendorId, cid(req)]);
      if (!v) return res.status(404).json({ message: "Vendor not found" });
      vendorName = v.vendor_name;
    }
    await pool.query("UPDATE calibration_schedule_assets SET vendor_id = ?, vendor_name = ? WHERE id IN (?)", [vendorId||null, vendorName, assetRowIds]);
    res.json({ ok: true, updated: assetRowIds.length });
  } catch (e) { next(e); }
});

// PATCH /schedule-assets/:id/complete — mark calibration complete
router.patch("/schedule-assets/:id/complete", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { notes } = req.body;
    await pool.query(
      "UPDATE calibration_schedule_assets SET status='completed', completed_at=NOW(), notes=COALESCE(?,notes) WHERE id=?",
      [notes||null, id]
    );
    // Update schedule status if all assets done
    const [[sa]] = await pool.query("SELECT schedule_id FROM calibration_schedule_assets WHERE id=?", [id]);
    if (sa) {
      const [[{ pending }]] = await pool.query(
        "SELECT COUNT(*) AS pending FROM calibration_schedule_assets WHERE schedule_id=? AND status!='completed'",
        [sa.schedule_id]
      );
      if (pending === 0) {
        await pool.query("UPDATE calibration_schedules SET status='completed' WHERE id=?", [sa.schedule_id]);
      }
    }
    await auditLog(cid(req), "CALIBRATION_COMPLETED", uid(req), uname(req), urole(req), "schedule_asset", id, null, req);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CERTIFICATE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// POST /schedule-assets/:id/certificate — upload certificate
router.post("/schedule-assets/:id/certificate", upload.single("certificate"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No PDF file uploaded" });
    const saId = Number(req.params.id);
    const [[sa]] = await pool.query(
      `SELECT csa.*, cs.company_id, cs.calibration_date FROM calibration_schedule_assets csa
       JOIN calibration_schedules cs ON cs.id = csa.schedule_id WHERE csa.id = ?`,
      [saId]
    );
    if (!sa || sa.company_id !== cid(req)) return res.status(404).json({ message: "Not found" });

    // Get current version number
    const [[{ curVersion }]] = await pool.query(
      "SELECT COALESCE(MAX(version),0) AS curVersion FROM calibration_certificates WHERE asset_id = ? AND company_id = ?",
      [sa.asset_id, cid(req)]
    );
    const newVersion = curVersion + 1;

    // Mark old certificates as not current
    await pool.query("UPDATE calibration_certificates SET is_current = 0 WHERE asset_id = ? AND company_id = ?", [sa.asset_id, cid(req)]);

    // Upload to S3
    const ext = path.extname(req.file.originalname) || ".pdf";
    const filename = `${cid(req)}/${sa.asset_id}-v${newVersion}-${Date.now()}${ext}`;
    const fileUrl = await saveCertFile({ buffer: req.file.buffer, mimetype: req.file.mimetype, filename });

    const [certResult] = await pool.query(
      `INSERT INTO calibration_certificates (company_id, asset_id, schedule_asset_id, vendor_id, vendor_name, file_url, file_name, file_size, version, calibration_date, uploaded_by, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid(req), sa.asset_id, saId, sa.vendor_id||null, sa.vendor_name||null, fileUrl, req.file.originalname, req.file.size, newVersion, sa.calibration_date, uid(req), uname(req)]
    );
    // Link certificate to schedule asset
    await pool.query("UPDATE calibration_schedule_assets SET certificate_id = ?, status = 'completed', completed_at = NOW() WHERE id = ?", [certResult.insertId, saId]);

    // Sync asset last/next calibration dates
    await pool.query("UPDATE assets SET last_calibration_date = ? WHERE id = ?", [sa.calibration_date, sa.asset_id]);

    await auditLog(cid(req), "CERTIFICATE_UPLOADED", uid(req), uname(req), urole(req), "certificate", certResult.insertId, { assetId: sa.asset_id, version: newVersion, fileName: req.file.originalname }, req);
    res.status(201).json({ ok: true, certificateId: certResult.insertId, version: newVersion, fileUrl });
  } catch (e) { next(e); }
});

// POST /certificates/bulk-upload — bulk upload by asset ID filename matching
router.post("/certificates/bulk-upload", upload.array("certificates", 500), async (req, res, next) => {
  try {
    const { scheduleId } = req.body;
    if (!req.files?.length) return res.status(400).json({ message: "No files uploaded" });
    if (!scheduleId) return res.status(400).json({ message: "scheduleId is required" });

    // Load all assets for the schedule
    const [schedAssets] = await pool.query(
      `SELECT csa.id AS saId, csa.asset_id, a.generated_asset_id, a.asset_name,
              cs.calibration_date, cs.company_id
       FROM calibration_schedule_assets csa
       JOIN assets a ON a.id = csa.asset_id
       JOIN calibration_schedules cs ON cs.id = csa.schedule_id
       WHERE csa.schedule_id = ? AND cs.company_id = ?`,
      [scheduleId, cid(req)]
    );

    const assetMap = {};
    for (const sa of schedAssets) assetMap[sa.generated_asset_id?.toLowerCase()] = sa;

    const results = { total: req.files.length, matched: 0, imported: 0, unmatched: [], duplicate: [], errors: [] };

    for (const file of req.files) {
      const baseName = path.basename(file.originalname, path.extname(file.originalname)).trim();
      const sa = assetMap[baseName.toLowerCase()];
      if (!sa) { results.unmatched.push(file.originalname); continue; }
      results.matched++;

      try {
        const [[{ curVersion }]] = await pool.query(
          "SELECT COALESCE(MAX(version),0) AS curVersion FROM calibration_certificates WHERE asset_id = ? AND company_id = ?",
          [sa.asset_id, cid(req)]
        );
        const newVersion = curVersion + 1;
        await pool.query("UPDATE calibration_certificates SET is_current = 0 WHERE asset_id = ? AND company_id = ?", [sa.asset_id, cid(req)]);
        const fileUrl = await saveCertFile({ buffer: file.buffer, mimetype: file.mimetype, filename: `${cid(req)}/${sa.asset_id}-v${newVersion}-${Date.now()}.pdf` });
        const [certResult] = await pool.query(
          `INSERT INTO calibration_certificates (company_id, asset_id, schedule_asset_id, vendor_id, vendor_name, file_url, file_name, file_size, version, calibration_date, uploaded_by, uploaded_by_name)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [cid(req), sa.asset_id, sa.saId, null, null, fileUrl, file.originalname, file.size, newVersion, sa.calibration_date, uid(req), uname(req)]
        );
        await pool.query("UPDATE calibration_schedule_assets SET certificate_id = ?, status = 'completed', completed_at = NOW() WHERE id = ?", [certResult.insertId, sa.saId]);
        await pool.query("UPDATE assets SET last_calibration_date = ? WHERE id = ?", [sa.calibration_date, sa.asset_id]);
        results.imported++;
      } catch (e) {
        results.errors.push({ file: file.originalname, error: e.message });
      }
    }
    res.json({ ok: true, ...results });
  } catch (e) { next(e); }
});

// GET /certificates/:id/download — get presigned download URL
router.get("/certificates/:id/download", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[cert]] = await pool.query("SELECT * FROM calibration_certificates WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!cert) return res.status(404).json({ message: "Certificate not found" });
    const key = keyFromS3Url(cert.file_url);
    if (!key) return res.json({ url: cert.file_url });
    const url = await getPresignedUrl(key, 300);
    await auditLog(cid(req), "CERTIFICATE_DOWNLOADED", uid(req), uname(req), urole(req), "certificate", id, { fileName: cert.file_name }, req);
    res.json({ url, fileName: cert.file_name });
  } catch (e) { next(e); }
});

// GET /assets/:assetId/certificates — certificate history for an asset
router.get("/assets/:assetId/certificates", async (req, res, next) => {
  try {
    const assetId = Number(req.params.assetId);
    const [rows] = await pool.query(
      `SELECT cc.*, v.vendor_name AS vendor_label
       FROM calibration_certificates cc
       LEFT JOIN calibration_vendors v ON v.id = cc.vendor_id
       WHERE cc.asset_id = ? AND cc.company_id = ? ORDER BY cc.version DESC`,
      [assetId, cid(req)]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /reports — asset-wise calibration summary
router.get("/reports", async (req, res, next) => {
  try {
    const { search, department, vendor, status, frequency, from, to, page = 1, pageSize = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);

    let where = `a.company_id = ?`;
    const params = [cid(req)];

    // Only assets that have at least one calibration schedule
    where += ` AND EXISTS (SELECT 1 FROM calibration_schedule_assets csa2 JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id)`;

    if (search) { where += ` AND (a.asset_name LIKE ? OR a.generated_asset_id LIKE ? OR a.qr_code LIKE ?)`; const s=`%${search}%`; params.push(s,s,s); }
    if (department) { where += ` AND d.id = ?`; params.push(department); }

    const sql = `
      SELECT a.id AS assetId, a.asset_name AS assetName, a.generated_asset_id AS assetId2, a.asset_type,
             JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.category')) AS asset_category,
             JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.make'))     AS manufacturer,
             JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.model'))    AS model,
             d.name AS departmentName,
             (SELECT cs2.frequency FROM calibration_schedule_assets csa2
              JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id
              WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id ORDER BY cs2.calibration_date DESC LIMIT 1) AS frequency,
             (SELECT v2.vendor_name FROM calibration_schedule_assets csa2
              JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id
              LEFT JOIN calibration_vendors v2 ON v2.id=csa2.vendor_id
              WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id AND csa2.vendor_id IS NOT NULL ORDER BY cs2.calibration_date DESC LIMIT 1) AS lastVendor,
             (SELECT cs2.calibration_date FROM calibration_schedule_assets csa2
              JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id
              WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id AND csa2.status='completed' ORDER BY cs2.calibration_date DESC LIMIT 1) AS lastCalibrationDate,
             (SELECT cs2.calibration_date FROM calibration_schedule_assets csa2
              JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id
              WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id AND cs2.calibration_date >= CURDATE() AND csa2.status='pending' ORDER BY cs2.calibration_date ASC LIMIT 1) AS nextCalibrationDate,
             (SELECT COUNT(*) FROM calibration_schedule_assets csa2
              JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id
              WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id) AS totalSchedules,
             (SELECT COUNT(*) FROM calibration_schedule_assets csa2
              JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id
              WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id AND csa2.status='completed') AS completedSchedules,
             (SELECT COUNT(*) FROM calibration_schedule_assets csa2
              JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id
              WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id AND csa2.status='pending') AS pendingSchedules,
             (SELECT csa2.status FROM calibration_schedule_assets csa2
              JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id
              WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id ORDER BY cs2.calibration_date DESC LIMIT 1) AS currentStatus,
             (SELECT IF(csa2.certificate_id IS NOT NULL,'uploaded','missing') FROM calibration_schedule_assets csa2
              JOIN calibration_schedules cs2 ON cs2.id=csa2.schedule_id
              WHERE csa2.asset_id=a.id AND cs2.company_id=a.company_id AND csa2.status='completed' ORDER BY cs2.calibration_date DESC LIMIT 1) AS certStatus
      FROM assets a
      LEFT JOIN asset_details ad ON ad.asset_id = a.id
      LEFT JOIN departments d ON d.id = a.department_id
      WHERE ${where}
      ORDER BY a.asset_name
      LIMIT ? OFFSET ?`;
    params.push(Number(pageSize), offset);

    const [rows] = await pool.query(sql, params);
    const [[{ total }]] = await pool.query(`SELECT COUNT(DISTINCT a.id) AS total FROM assets a LEFT JOIN departments d ON d.id=a.department_id WHERE ${where}`, params.slice(0, -2));
    res.json({ rows, total, page: Number(page), pageSize: Number(pageSize) });
  } catch (e) { next(e); }
});

// GET /reports/:assetId — full calibration history for an asset
router.get("/reports/:assetId", async (req, res, next) => {
  try {
    const assetId = Number(req.params.assetId);
    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name, a.generated_asset_id, a.asset_unique_id, a.qr_code, a.asset_type,
              JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.category')) AS asset_category,
              JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.make'))     AS manufacturer,
              JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.model'))    AS model,
              d.name AS departmentName
       FROM assets a
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       LEFT JOIN departments d ON d.id=a.department_id WHERE a.id=? AND a.company_id=?`,
      [assetId, cid(req)]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const [history] = await pool.query(
      `SELECT csa.id AS saId, cs.id AS scheduleId, cs.schedule_number, cs.calibration_date, cs.frequency, csa.status,
              csa.vendor_id, csa.vendor_name, csa.completed_at, csa.notes,
              cc.id AS certId, cc.file_name AS certFileName, cc.version AS certVersion, cc.file_url AS certFileUrl,
              cc.uploaded_by_name AS certUploadedBy, cc.created_at AS certUploadedAt,
              cs.occurrence_index, cs.recurring_group_id
       FROM calibration_schedule_assets csa
       JOIN calibration_schedules cs ON cs.id = csa.schedule_id
       LEFT JOIN calibration_certificates cc ON cc.id = csa.certificate_id
       WHERE csa.asset_id = ? AND cs.company_id = ?
       ORDER BY cs.calibration_date DESC`,
      [assetId, cid(req)]
    );
    res.json({ asset, history });
  } catch (e) { next(e); }
});

// GET /audit-log — audit trail
router.get("/audit-log", async (req, res, next) => {
  try {
    const { targetType, targetId, page = 1, pageSize = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    let sql = `SELECT * FROM calibration_audit_log WHERE company_id = ?`;
    const params = [cid(req)];
    if (targetType) { sql += ` AND target_type = ?`; params.push(targetType); }
    if (targetId)   { sql += ` AND target_id = ?`;   params.push(targetId);   }
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(Number(pageSize), offset);
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

export default router;
