import { Router } from "express";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import pool from "../db.js";
import { isMigrationSafeError } from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { evaluateRule, createFlag, detectChecklistFlags } from "../utils/flagsHelper.js";
import { dispatchFlagNotifications } from "../utils/notificationsHelper.js";
import { emitToCompany } from "../utils/socket.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, "../../uploads");
const queryImagesDir = path.join(__dirname, "../../uploads/query-images");
fs.mkdirSync(uploadsDir, { recursive: true }); // ensure directory exists
fs.mkdirSync(queryImagesDir, { recursive: true });

const ojtStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `ojt_${Date.now()}_${safe}`);
  },
});
const uploadOjt = multer({
  storage: ojtStorage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(mp4|mkv|avi|mov|webm|wmv|flv|3gp|pdf|doc|docx|csv|xlsx|xls|pptx|ppt|txt|odt|ods)$/i;
    if (allowed.test(file.originalname)) cb(null, true);
    else cb(new Error("File type not allowed"));
  },
});

// Separate multer instance for image uploads (reference photos, question photos)
const uploadImage = multer({
  storage: ojtStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;
    if (allowed.test(file.originalname) || file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// Company logo upload (stores as company-{id}.{ext} in uploads/logos/)
const logosDir = path.join(__dirname, "../../uploads/logos");
fs.mkdirSync(logosDir, { recursive: true });
const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, logosDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".png";
    cb(null, `company-${req.companyUser.companyId}${ext}`);
  },
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed for logo"));
  },
});

const router = Router();

// ── GET /assets/bulk-import/template  (public — no auth needed) ──────────────
// This route MUST be before router.use(requireCompanyAuth).
// Query param: mode=update → returns update template with assetId column instead of add template
router.get("/assets/bulk-import/template", (req, res) => {
  const mode = (req.query.mode || "add").toLowerCase();
  import("xlsx").then((XLSX) => {
    const wb = XLSX.utils.book_new();

    if (mode === "update") {
      // Update template: assetId is required, assetName is optional
      const headers = [
        "assetId*", "assetName", "assetType", "departmentName",
        "building", "floor", "room", "status",
        "make", "model", "serialNo", "accessories", "dealer",
        "purchaseCost", "purchaseDate", "installationDate", "mfgYear",
        "maintenanceType", "warrantyStart", "warrantyEnd",
        "amcStart", "amcEnd", "cmcStart", "cmcEnd",
        "remarks",
      ];
      const example  = ["004-27-000142", "Ventilator", "healthcare", "ICU",   "Block A", "1", "101", "Active", "GE", "R860", "SN001", "", "ABC Supplier", "150000", "2022-01-01", "2022-03-01", "2021", "AMC", "", "", "2023-04-01", "2024-03-31", "", "", "Serviced"];
      const example2 = ["004-27-000149", "ECG Machine", "",          "OPD",   "Block B", "2", "202", "",       "",   "",     "",     "", "",            "",       "",            "",            "",     "Warranty", "2022-06-01", "2024-05-31", "", "", "", "", ""];
      const ws = XLSX.utils.aoa_to_sheet([headers, example, example2]);
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.replace("*","").length + 2, 18) }));
      XLSX.utils.book_append_sheet(wb, ws, "Update Assets");

      const notes = [
        ["Column",           "Required?", "Notes"],
        ["assetId",          "YES",       "Asset ID (e.g. 004-27-000142) — used to find the existing record"],
        ["assetName",        "No",        "Leave blank to keep existing name"],
        ["assetType",        "No",        "Leave blank to keep existing type"],
        ["departmentName",   "No",        "Exact department name. Leave blank to keep existing."],
        ["building/floor/room","No",      "Leave blank to keep existing location"],
        ["status",           "No",        "Active or Inactive. Leave blank to keep existing."],
        ["make/model/...",   "No",        "Any blank cell keeps the existing value"],
        ["maintenanceType",  "No",        "Warranty, AMC, CMC, In House, Catalyst, High End, Rented"],
        ["warrantyStart",    "No",        "Warranty start date (YYYY-MM-DD). Fill only if maintenanceType = Warranty"],
        ["warrantyEnd",      "No",        "Warranty end/expiry date (YYYY-MM-DD)"],
        ["amcStart",         "No",        "AMC start date (YYYY-MM-DD). Fill only if maintenanceType = AMC"],
        ["amcEnd",           "No",        "AMC end/expiry date (YYYY-MM-DD)"],
        ["cmcStart",         "No",        "CMC start date (YYYY-MM-DD). Fill only if maintenanceType = CMC"],
        ["cmcEnd",           "No",        "CMC end/expiry date (YYYY-MM-DD)"],
        ["IMPORTANT",        "—",         "QR Code, Asset ID, and all historical records remain unchanged"],
        ["TIP",              "—",         "You can also use 'startDate' and 'endDate' columns — they auto-map to the maintenance type"],
      ];
      const wsNotes = XLSX.utils.aoa_to_sheet(notes);
      wsNotes["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 65 }];
      XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", 'attachment; filename="asset-update-template.xlsx"');
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    } else {
      // Add template (default)
      const headers = [
        "assetName*", "assetType", "departmentName",
        "building", "floor", "room", "assetUniqueId", "status",
      ];
      const example  = ["Machine A",   "general",    "ICU",   "Block A", "1", "101", "", "Active"];
      const example2 = ["Ventilator B", "healthcare", "OPD",   "Block B", "2", "202", "", "Active"];
      const ws = XLSX.utils.aoa_to_sheet([headers, example, example2]);
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 20) }));
      XLSX.utils.book_append_sheet(wb, ws, "Assets");

      const notes = [
        ["Column",         "Required?", "Notes"],
        ["assetName",      "Yes",       "Name / Equipment Name / Item Name"],
        ["assetType",      "No",        "e.g. general, healthcare, fleet — defaults to 'general'"],
        ["departmentName", "No",        "Exact department name. Leave blank if unknown."],
        ["building",       "No",        "Building / Location label"],
        ["floor",          "No",        "Floor number or label"],
        ["room",           "No",        "Room / Ward number"],
        ["assetUniqueId",  "No",        "Leave blank to auto-generate a unique QR code ID"],
        ["status",         "No",        "Active or Inactive — defaults to Active"],
      ];
      const wsNotes = XLSX.utils.aoa_to_sheet(notes);
      wsNotes["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 55 }];
      XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");

      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      res.setHeader("Content-Disposition", 'attachment; filename="asset-import-template.xlsx"');
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.send(buf);
    }
  }).catch((err) => {
    console.error("Template generation error:", err);
    res.status(500).json({ message: "Failed to generate template" });
  });
});

router.use(requireCompanyAuth);

// ── GET /all-companies  (engineer: list all companies for asset assignment) ───
router.get("/all-companies", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, company_name AS companyName FROM companies ORDER BY company_name"
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /departments-by-company/:companyId  (engineer: deps for any company) ──
router.get("/departments-by-company/:companyId", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name FROM departments WHERE company_id = ? ORDER BY name",
      [req.params.companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /departments-by-company/:companyId  (any company user: add dept from mobile) ──
router.post("/departments-by-company/:companyId", async (req, res, next) => {
  try {
    const { companyId } = req.params;
    // Engineers may register assets for any company, so no company-match guard here.
    // Authentication is already enforced by requireCompanyAuth above.
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "name is required" });
    const [result] = await pool.query(
      "INSERT INTO departments (company_id, name) VALUES (?, ?)",
      [Number(companyId), name.trim()]
    );
    res.status(201).json({ id: result.insertId, name: name.trim() });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY" || err.code === "23505") {
      return res.status(409).json({ message: "Department already exists" });
    }
    next(err);
  }
});

// ── Startup migrations ────────────────────────────────────────────────────────
(async () => {
  const migrations = [
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cp_assigned_to INT DEFAULT NULL`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cp_created_by INT DEFAULT NULL`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS assigned_note TEXT DEFAULT NULL`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS escalation_level INT DEFAULT 0`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS expected_completion_at DATETIME DEFAULT NULL`,
    `ALTER TABLE company_users ADD COLUMN IF NOT EXISTS shift VARCHAR(60) DEFAULT NULL`,
    `ALTER TABLE company_users ADD COLUMN IF NOT EXISTS service_domain VARCHAR(60) DEFAULT 'technical'`,
    `ALTER TABLE company_users ADD COLUMN IF NOT EXISTS supervisor_id INT DEFAULT NULL`,
    // Drop incorrect FK on assets.created_by (it references users but we store company_users.id)
    `ALTER TABLE assets DROP FOREIGN KEY fk_assets_user`,
    // Asset assignment
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS assigned_to INT DEFAULT NULL`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS assigned_by INT DEFAULT NULL`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS assigned_at DATETIME DEFAULT NULL`,
    // Asset queries / requests (raised via barcode scan)
    `CREATE TABLE IF NOT EXISTS asset_queries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      asset_id INT NOT NULL,
      raised_by INT NOT NULL,
      assigned_to INT DEFAULT NULL,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      images JSON,
      status VARCHAR(30) DEFAULT 'open',
      priority VARCHAR(20) DEFAULT 'normal',
      escalation_level INT DEFAULT 0,
      cutoff_hours INT DEFAULT 24,
      resolved_by INT DEFAULT NULL,
      resolved_at DATETIME DEFAULT NULL,
      resolution_note TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT NOW(),
      updated_at DATETIME DEFAULT NOW()
    )`,
  // Patch columns missing from the old asset_queries table schema (IF NOT EXISTS skips CREATE if old table exists)
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS raised_by INT DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS title VARCHAR(500) DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS description TEXT DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS images JSON DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal'`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS escalation_level INT DEFAULT 0`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS cutoff_hours INT DEFAULT 24`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS resolved_by INT DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS resolution_note TEXT DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS requester_name VARCHAR(255) DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS close_code VARCHAR(10) DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS rating TINYINT DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS review_text TEXT DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS reviewed_at DATETIME DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS parts_replaced TEXT DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS before_photos JSON DEFAULT NULL`,
  `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS after_photos JSON DEFAULT NULL`,
  // Ensure notifications table has the right columns (may have been created by old flag engine)
  `CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT DEFAULT NULL,
    recipient_id INT DEFAULT NULL,
    flag_id INT DEFAULT NULL,
    type VARCHAR(60) DEFAULT 'flag_raised',
    title VARCHAR(500),
    message TEXT,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS company_id INT DEFAULT NULL`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_id INT DEFAULT NULL`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS flag_id INT DEFAULT NULL`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type VARCHAR(60) DEFAULT 'flag_raised'`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title VARCHAR(500) DEFAULT NULL`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT DEFAULT NULL`,
  `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read TINYINT(1) NOT NULL DEFAULT 0`,
  // Pre-generated QR codes (printed & pasted on machines before asset registration)
  `CREATE TABLE IF NOT EXISTS asset_pre_qr (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    qr_unique_id VARCHAR(60) NOT NULL,
    asset_id INT DEFAULT NULL,
    linked_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT NOW(),
    UNIQUE KEY uq_qr_uid (qr_unique_id)
  )`,
    // Calibration module
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS calibration_required TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS calibration_frequency VARCHAR(40) DEFAULT NULL`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS last_calibration_date DATE DEFAULT NULL`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS next_calibration_due_date DATE DEFAULT NULL`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS calibration_status VARCHAR(30) DEFAULT NULL`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS calibration_vendor_id INT DEFAULT NULL`,
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS alert_before_days INT DEFAULT NULL`,
    `CREATE TABLE IF NOT EXISTS calibration_vendors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      vendor_name VARCHAR(200) NOT NULL,
      contact_person VARCHAR(160) DEFAULT NULL,
      phone VARCHAR(32) DEFAULT NULL,
      email VARCHAR(160) DEFAULT NULL,
      address VARCHAR(255) DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Active',
      created_at DATETIME DEFAULT NOW(),
      updated_at DATETIME DEFAULT NOW(),
      UNIQUE KEY uq_calibration_vendor_name (vendor_name)
    )`,
    `CREATE TABLE IF NOT EXISTS calibration_records (
      id INT AUTO_INCREMENT PRIMARY KEY,
      asset_id INT NOT NULL,
      calibration_date DATE NOT NULL,
      next_due_date DATE DEFAULT NULL,
      vendor_id INT DEFAULT NULL,
      certificate_number VARCHAR(160) DEFAULT NULL,
      certificate_url VARCHAR(512) DEFAULT NULL,
      remarks TEXT DEFAULT NULL,
      calibrated_by VARCHAR(160) DEFAULT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'Pending',
      created_at DATETIME DEFAULT NOW(),
      KEY idx_calibration_records_asset (asset_id),
      KEY idx_calibration_records_due (next_due_date),
      KEY idx_calibration_records_vendor (vendor_id)
    )`,
    `INSERT INTO calibration_vendors (vendor_name, status)
     VALUES ('Philips Biomedical', 'Active'), ('GE Healthcare', 'Active'), ('Siemens Healthcare', 'Active')
     ON DUPLICATE KEY UPDATE vendor_name = VALUES(vendor_name)`,
    // Allow 'Unverified' status for mobile-registered assets (MODIFY COLUMN is idempotent)
    `ALTER TABLE assets MODIFY COLUMN status ENUM('Active','Inactive','Unverified') NOT NULL DEFAULT 'Active'`,
    // Working/operational status of the asset (Working, WIP, Not_Working, Condemned)
    `ALTER TABLE assets ADD COLUMN IF NOT EXISTS working_status VARCHAR(30) DEFAULT NULL`,
    // Company-specific custom asset statuses (Status Master)
    `CREATE TABLE IF NOT EXISTS asset_statuses (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      name VARCHAR(60) NOT NULL,
      color VARCHAR(20) DEFAULT '#64748b',
      sort_order INT DEFAULT 0,
      created_at DATETIME DEFAULT NOW(),
      UNIQUE KEY uq_asset_statuses (company_id, name)
    )`,
  ];
  for (const sql of migrations) {
    try { await pool.query(sql); } catch (err) {
      if (!isMigrationSafeError(err)) console.warn("[company-portal] migration:", err.message);
    }
  }

  const ensureIndex = async (indexName, tableName, ddl) => {
    try {
      const [[row]] = await pool.query(
        `SELECT COUNT(*) AS cnt
         FROM information_schema.statistics
         WHERE table_schema = DATABASE()
           AND table_name = ?
           AND index_name = ?`,
        [tableName, indexName]
      );
      if (!Number(row?.cnt || 0)) await pool.query(ddl);
    } catch (err) {
      if (!isMigrationSafeError(err)) console.warn("[company-portal] migration:", err.message);
    }
  };

  await ensureIndex(
    "idx_assets_calibration_due",
    "assets",
    "CREATE INDEX idx_assets_calibration_due ON assets(next_calibration_due_date)"
  );
  await ensureIndex(
    "idx_assets_calibration_vendor",
    "assets",
    "CREATE INDEX idx_assets_calibration_vendor ON assets(calibration_vendor_id)"
  );
})();

// ─── Public config endpoints (no auth required) ───────────────────────────────
// Working status list — update here and restart PM2; no APK rebuild needed.
const WORKING_STATUSES = [
  'Working',
  'Not_Working',
  'WIP',
  'Condemned',
  'Critical',
  'Unverified',
  'Verified',
];

router.get('/working-statuses', (_req, res) => {
  res.json({ statuses: WORKING_STATUSES });
});

// ── Asset Status Master (per-company custom statuses) ─────────────────────────
// GET  /api/company-portal/asset-statuses        — list statuses for this company
// POST /api/company-portal/asset-statuses        — create new status
// PUT  /api/company-portal/asset-statuses/:id    — update
// DELETE /api/company-portal/asset-statuses/:id  — delete

router.get('/asset-statuses', async (req, res, next) => {
  try {
    const companyId = req.companyUser?.companyId;
    if (!companyId) return res.status(401).json({ message: 'Not authenticated' });
    const [rows] = await pool.query(
      'SELECT id, name, color, sort_order AS sortOrder FROM asset_statuses WHERE company_id = ? ORDER BY sort_order, name',
      [companyId]
    );
    // Merge with defaults so the list always has something
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/asset-statuses', async (req, res, next) => {
  try {
    const companyId = req.companyUser?.companyId;
    if (!companyId) return res.status(401).json({ message: 'Not authenticated' });
    const { name, color = '#64748b' } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'name is required' });
    const [result] = await pool.query(
      'INSERT INTO asset_statuses (company_id, name, color) VALUES (?, ?, ?)',
      [companyId, name.trim(), color]
    );
    res.status(201).json({ id: result.insertId, name: name.trim(), color });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Status already exists' });
    next(err);
  }
});

router.put('/asset-statuses/:id', async (req, res, next) => {
  try {
    const companyId = req.companyUser?.companyId;
    if (!companyId) return res.status(401).json({ message: 'Not authenticated' });
    const { name, color } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'name is required' });
    await pool.query(
      'UPDATE asset_statuses SET name = ?, color = ? WHERE id = ? AND company_id = ?',
      [name.trim(), color || '#64748b', req.params.id, companyId]
    );
    res.json({ message: 'Updated' });
  } catch (err) { next(err); }
});

router.delete('/asset-statuses/:id', async (req, res, next) => {
  try {
    const companyId = req.companyUser?.companyId;
    if (!companyId) return res.status(401).json({ message: 'Not authenticated' });
    await pool.query('DELETE FROM asset_statuses WHERE id = ? AND company_id = ?', [req.params.id, companyId]);
    res.json({ message: 'Deleted' });
  } catch (err) { next(err); }
});

const cid = (req) => req.companyUser.companyId;

const sanitizeAssetIdPart = (value, fallback) => {
  const cleaned = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned || fallback;
};

const getAssetIdPrefix = async (conn, companyId) => {
  const [[co]] = await conn.query(
    `SELECT c.company_code AS companyCode, s.state_code AS stateCode
     FROM companies c
     LEFT JOIN states s ON s.id = c.state_id
     WHERE c.id = ?`,
    [companyId]
  );
  const cCode = sanitizeAssetIdPart(co?.companyCode, "CO");
  const sCode = sanitizeAssetIdPart(co?.stateCode, "NA");
  return `${cCode}-${sCode}`;
};

const getNextSerialForPrefix = async (conn, prefix) => {
  const [[row]] = await conn.query(
    `SELECT MAX(serialNum) AS maxNum
     FROM (
       SELECT CAST(SUBSTRING_INDEX(generated_asset_id, '-', -1) AS UNSIGNED) AS serialNum
       FROM assets
       WHERE generated_asset_id REGEXP CONCAT('^', ?, '-[0-9]+$')
       UNION ALL
       SELECT CAST(SUBSTRING_INDEX(qr_unique_id, '-', -1) AS UNSIGNED) AS serialNum
       FROM asset_pre_qr
       WHERE qr_unique_id REGEXP CONCAT('^', ?, '-[0-9]+$')
     ) seqs`,
    [prefix, prefix]
  );
  return Number(row?.maxNum || 0) + 1;
};

// QR-only serial: only looks at asset_pre_qr so deleting all QRs restarts serial from 1
const getNextQrSerialForPrefix = async (conn, prefix) => {
  const [[row]] = await conn.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(qr_unique_id, '-', -1) AS UNSIGNED)) AS maxNum
     FROM asset_pre_qr WHERE qr_unique_id REGEXP CONCAT('^', ?, '-[0-9]+$')`,
    [prefix]
  );
  return Number(row?.maxNum || 0) + 1;
};

const getNextGeneratedAssetId = async (conn, companyId) => {
  const prefix = await getAssetIdPrefix(conn, companyId);
  const serial = await getNextSerialForPrefix(conn, prefix);
  return `${prefix}-${String(serial).padStart(6, "0")}`;
};

const normalizeCalibrationFrequency = (value) => {
  if (!value) return null;
  const raw = String(value).trim().toLowerCase();
  const map = {
    monthly: "Monthly",
    quarter: "Quarterly",
    quarterly: "Quarterly",
    "half yearly": "Half Yearly",
    "half-yearly": "Half Yearly",
    halfyearly: "Half Yearly",
    yearly: "Yearly",
    annual: "Yearly",
    "6 months": "Half Yearly",
  };
  return map[raw] || String(value).trim();
};

const toDateOnly = (value) => {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  // Handle DD/MM/YYYY (sent by mobile datepicker) → convert to YYYY-MM-DD
  const ddmmyyyy = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  // Handle DD-MM-YYYY
  const ddmmyyyy2 = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy2) return `${ddmmyyyy2[3]}-${ddmmyyyy2[2]}-${ddmmyyyy2[1]}`;
  return str.length >= 10 ? str.slice(0, 10) : str;
};

const resolveCalibrationVendorId = async (conn, vendorName) => {
  if (!vendorName) return null;
  const clean = String(vendorName).trim();
  if (!clean) return null;
  const [[existing]] = await conn.query(
    "SELECT id FROM calibration_vendors WHERE LOWER(vendor_name) = LOWER(?) LIMIT 1",
    [clean]
  );
  if (existing?.id) return existing.id;
  const [ins] = await conn.query(
    "INSERT INTO calibration_vendors (vendor_name, status) VALUES (?, 'Active')",
    [clean]
  );
  return ins.insertId || null;
};

const deriveCalibrationFromInput = async (conn, input = {}, metadata = {}) => {
  const metaCalibration = metadata?.calibration || {};
  const required = Boolean(
    input.calibrationRequired ?? metaCalibration.required ?? metadata?.calibrationRequired ?? false
  );
  const frequency = normalizeCalibrationFrequency(
    input.calibrationFrequency ?? metaCalibration.frequency ?? metadata?.calibrationFrequency
  );
  const lastDate = toDateOnly(
    input.lastCalibrationDate ?? metaCalibration.lastCalibrationDate ?? metadata?.lastCalibrationDate
  );
  const nextDue = toDateOnly(
    input.nextCalibrationDueDate ?? metaCalibration.nextCalibrationDueDate ?? metadata?.nextCalibrationDueDate
  );
  const certNo =
    input.calibrationCertificateNumber ??
    metaCalibration.certificateNumber ??
    metadata?.calibrationCertificateNumber ??
    null;
  const status =
    input.calibrationStatus ??
    metaCalibration.status ??
    metadata?.calibrationStatus ??
    (required ? "Pending" : null);
  const alertBefore =
    input.alertBeforeDays ?? metaCalibration.alertBeforeDays ?? metadata?.alertBeforeDays ?? null;
  const vendorName =
    input.calibrationVendorName ??
    metaCalibration.vendorName ??
    metadata?.calibrationVendorName ??
    metadata?.dealer ??
    null;
  const vendorId = await resolveCalibrationVendorId(conn, vendorName);

  return {
    required,
    frequency,
    lastCalibrationDate: lastDate,
    nextCalibrationDueDate: nextDue,
    status,
    vendorId,
    vendorName: vendorName ? String(vendorName).trim() : null,
    alertBeforeDays: alertBefore != null && alertBefore !== "" ? Number(alertBefore) : null,
    certificateNumber: certNo ? String(certNo).trim() : null,
  };
};

const upsertLocationHierarchyForCompany = async (conn, {
  companyId,
  buildingName,
  floorName,
  roomName,
  createdBy,
}) => {
  const norm = (v) => (v || "").trim();
  const bName = norm(buildingName);
  const fName = norm(floorName);
  const rName = norm(roomName);

  let buildingId = null;
  let floorId = null;
  let roomId = null;
  let locationId = null;
  let buildingLocId = null;
  let floorLocId = null;

  if (bName) {
    const [[b]] = await conn.query(
      `SELECT id FROM buildings WHERE company_id = ? AND LOWER(building_name) = LOWER(?) AND status != 'Deleted' LIMIT 1`,
      [companyId, bName]
    );
    if (b) {
      buildingId = b.id;
    } else {
      const [[{ cnt: bCount }]] = await conn.query("SELECT COUNT(*) AS cnt FROM buildings WHERE company_id = ?", [companyId]);
      const bCode = `BLD-${String(bCount + 1).padStart(3, "0")}`;
      const [insB] = await conn.execute(
        `INSERT INTO buildings (company_id, building_code, building_name, status, created_by)
         VALUES (?, ?, ?, 'Active', ?)`,
        [companyId, bCode, bName, createdBy || null]
      );
      buildingId = insB.insertId;
      const [locB] = await conn.execute(
        `INSERT INTO locations (company_id, location_type, reference_id, parent_location_id, location_code, location_name, status, created_by)
         VALUES (?, 'Building', ?, NULL, ?, ?, 'Active', ?)`,
        [companyId, buildingId, bCode, bName, createdBy || null]
      );
      buildingLocId = locB.insertId;
    }
    if (!buildingLocId) {
      const [[loc]] = await conn.query("SELECT id FROM locations WHERE location_type = 'Building' AND reference_id = ? LIMIT 1", [buildingId]);
      buildingLocId = loc?.id || null;
    }
  }

  if (buildingId && fName) {
    const [[f]] = await conn.query(
      `SELECT id FROM floors WHERE building_id = ? AND LOWER(floor_name) = LOWER(?) AND status != 'Deleted' LIMIT 1`,
      [buildingId, fName]
    );
    if (f) {
      floorId = f.id;
    } else {
      const [[{ cnt: fCount }]] = await conn.query("SELECT COUNT(*) AS cnt FROM floors WHERE building_id = ?", [buildingId]);
      const fCode = `FLR-${String(fCount + 1).padStart(3, "0")}`;
      const parsedFloorNum = /^\d+$/.test(fName) ? Number(fName) : null;
      const [insF] = await conn.execute(
        `INSERT INTO floors (building_id, floor_code, floor_name, floor_number, status, created_by)
         VALUES (?, ?, ?, ?, 'Active', ?)`,
        [buildingId, fCode, fName, parsedFloorNum, createdBy || null]
      );
      floorId = insF.insertId;
      const [locF] = await conn.execute(
        `INSERT INTO locations (company_id, location_type, reference_id, parent_location_id, location_code, location_name, status, created_by)
         VALUES (?, 'Floor', ?, ?, ?, ?, 'Active', ?)`,
        [companyId, floorId, buildingLocId, fCode, fName, createdBy || null]
      );
      floorLocId = locF.insertId;
    }
    if (!floorLocId) {
      const [[loc]] = await conn.query("SELECT id FROM locations WHERE location_type = 'Floor' AND reference_id = ? LIMIT 1", [floorId]);
      floorLocId = loc?.id || null;
    }
  }

  if (floorId && rName) {
    const [[r]] = await conn.query(
      `SELECT id FROM rooms WHERE floor_id = ? AND LOWER(room_name) = LOWER(?) AND status != 'Deleted' LIMIT 1`,
      [floorId, rName]
    );
    if (r) {
      roomId = r.id;
    } else {
      const [[{ cnt: rCount }]] = await conn.query("SELECT COUNT(*) AS cnt FROM rooms WHERE floor_id = ?", [floorId]);
      const rCode = `RM-${String(rCount + 1).padStart(3, "0")}`;
      const [insR] = await conn.execute(
        `INSERT INTO rooms (floor_id, room_code, room_name, status, created_by)
         VALUES (?, ?, ?, 'Active', ?)`,
        [floorId, rCode, rName, createdBy || null]
      );
      roomId = insR.insertId;
      const [locR] = await conn.execute(
        `INSERT INTO locations (company_id, location_type, reference_id, parent_location_id, location_code, location_name, status, created_by)
         VALUES (?, 'Room', ?, ?, ?, ?, 'Active', ?)`,
        [companyId, roomId, floorLocId, rCode, rName, createdBy || null]
      );
      locationId = locR.insertId;
    }
    if (!locationId) {
      const [[loc]] = await conn.query("SELECT id FROM locations WHERE location_type = 'Room' AND reference_id = ? LIMIT 1", [roomId]);
      locationId = loc?.id || null;
    }
  }

  return {
    building: bName || null,
    floor: fName || null,
    room: rName || null,
    buildingId,
    floorId,
    roomId,
    locationId,
  };
};

/* ── Helper: compute cutoff status from expectedCompletionAt ─────────────────
   Returns 'overdue' | 'at_risk' | 'on_time' | null                           */
const getCutoffStatus = (expectedCompletionAt, status) => {
  if (!expectedCompletionAt) return null;
  if (status === 'completed' || status === 'closed') return null;
  const deadline = new Date(expectedCompletionAt);
  const now = new Date();
  const msLeft = deadline - now;
  if (msLeft < 0) return 'overdue';
  if (msLeft < 2 * 60 * 60 * 1000) return 'at_risk'; // within 2 hours
  return 'on_time';
};
const isShiftActive = (startTime, endTime) => {
  const now = new Date();
  const toMin = (t) => {
    const [h, m] = String(t).split(":").map(Number);
    return h * 60 + m;
  };
  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const startMin = toMin(startTime);
  const endMin   = toMin(endTime);
  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin < endMin;
  } else {
    return nowMin >= startMin || nowMin < endMin;
  }
};

// pg returns JSONB columns as already-parsed JS objects; guard against that
const safeParse = (v) => {
  if (v == null) return null;
  if (typeof v === "string") return JSON.parse(v);
  return v;
};

const getCalibrationStatusFromDates = (nextDueDate) => {
  if (!nextDueDate) return "Pending";
  const today = new Date();
  const due = new Date(nextDueDate);
  const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "Expired";
  if (diffDays <= 30) return "Due Soon";
  return "Active";
};

const runCalibrationNotificationEngine = async (companyId) => {
  const [assets] = await pool.query(
    `SELECT id, asset_name AS assetName, generated_asset_id AS generatedAssetId,
            next_calibration_due_date AS nextDueDate
     FROM assets
     WHERE company_id = ? AND calibration_required = 1 AND next_calibration_due_date IS NOT NULL`,
    [companyId]
  );
  if (!assets.length) return { created: 0 };

  const [recipients] = await pool.query(
    `SELECT id
     FROM company_users
     WHERE company_id = ?
       AND (
         LOWER(COALESCE(role, '')) IN ('biomedical_engineer', 'htm_manager', 'facility_manager')
         OR LOWER(COALESCE(role, '')) LIKE '%biomedical%'
         OR LOWER(COALESCE(role, '')) LIKE '%facility%'
         OR LOWER(COALESCE(role, '')) LIKE '%htm%'
         OR LOWER(COALESCE(designation, '')) LIKE '%biomedical%'
         OR LOWER(COALESCE(designation, '')) LIKE '%facility%'
         OR LOWER(COALESCE(designation, '')) LIKE '%htm%'
       )`,
    [companyId]
  );
  if (!recipients.length) return { created: 0 };

  let created = 0;
  const today = new Date();
  const mkDate = (v) => new Date(String(v).slice(0, 10) + "T00:00:00");
  for (const a of assets) {
    const due = mkDate(a.nextDueDate);
    const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    let msg = null;
    if (diff === 30) msg = `${a.assetName} (${a.generatedAssetId || a.id}) calibration due in 30 days`;
    else if (diff === 15) msg = `${a.assetName} (${a.generatedAssetId || a.id}) calibration due in 15 days`;
    else if (diff < 0) msg = `${a.assetName} (${a.generatedAssetId || a.id}) calibration overdue by ${Math.abs(diff)} days`;
    if (!msg) continue;

    for (const r of recipients) {
      const [[dup]] = await pool.query(
        `SELECT id FROM notifications
         WHERE company_id = ? AND recipient_id = ? AND type = 'calibration_due'
           AND message = ?
           AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
         LIMIT 1`,
        [companyId, r.id, msg]
      );
      if (dup) continue;
      await pool.query(
        `INSERT INTO notifications (company_id, recipient_id, type, title, message, is_read)
         VALUES (?, ?, 'calibration_due', 'Calibration Alert', ?, 0)`,
        [companyId, r.id, msg]
      );
      created += 1;
    }
  }
  return { created };
};

// Ensure questions column exists (safe to run on every start)
pool.query("ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS questions JSONB NULL").catch(() => {});
// Ensure reference_image_url column exists on checklist_template_questions
pool.query("ALTER TABLE checklist_template_questions ADD COLUMN IF NOT EXISTS reference_image_url TEXT NULL").catch(() => {});
// Ensure question_image_url column exists (photo-as-question feature)
pool.query("ALTER TABLE checklist_template_questions ADD COLUMN IF NOT EXISTS question_image_url TEXT NULL").catch(() => {});

// Ensure qr_card_label column exists (admin-typed client label for QR card header)
// Use a safe migration that works on MySQL < 8.0 which lacks IF NOT EXISTS for ADD COLUMN
pool.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'qr_card_label'")
  .then(([rows]) => { if (!rows.length) return pool.query("ALTER TABLE companies ADD COLUMN qr_card_label VARCHAR(120) DEFAULT NULL"); })
  .catch(() => {});

// Ensure tabular-logsheet columns exist (migration 2026-03-02-tabular-logsheet)
pool.query("ALTER TABLE logsheet_templates ADD COLUMN IF NOT EXISTS layout_type VARCHAR(20) NOT NULL DEFAULT 'standard'").catch(() => {});
pool.query("ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS data JSONB").catch(() => {});
// Ensure company_user_id column exists (migration 2026-02-28-logsheet-company-user)
pool.query("ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS company_user_id BIGINT REFERENCES company_users(id) ON DELETE SET NULL").catch(() => {});
pool.query("ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS company_user_id BIGINT REFERENCES company_users(id) ON DELETE SET NULL").catch(() => {});

// ── FK Bug Fix: checklist_templates.created_by must reference company_users, not users ──
pool.query(`ALTER TABLE checklist_templates DROP CONSTRAINT IF EXISTS checklist_templates_created_by_fkey`).catch(() => {});
pool.query(`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS created_by INTEGER NULL`).catch(() => {});

// ── OJT Management Tables ──────────────────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_trainings (
    id           SERIAL PRIMARY KEY,
    company_id   INTEGER NOT NULL,
    asset_id     INTEGER REFERENCES assets(id) ON DELETE SET NULL,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    status       VARCHAR(20) NOT NULL DEFAULT 'draft',
    passing_percentage INTEGER NOT NULL DEFAULT 70,
    created_by   INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`CREATE INDEX IF NOT EXISTS ojt_trainings_company ON ojt_trainings(company_id)`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS asset_id INTEGER REFERENCES assets(id) ON DELETE SET NULL`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_modules (
    id           SERIAL PRIMARY KEY,
    training_id  INTEGER NOT NULL REFERENCES ojt_trainings(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    order_number INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_module_contents (
    id          SERIAL PRIMARY KEY,
    module_id   INTEGER NOT NULL REFERENCES ojt_modules(id) ON DELETE CASCADE,
    type        VARCHAR(30) NOT NULL DEFAULT 'text',
    url         TEXT,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_tests (
    id           SERIAL PRIMARY KEY,
    training_id  INTEGER NOT NULL REFERENCES ojt_trainings(id) ON DELETE CASCADE,
    total_marks  INTEGER NOT NULL DEFAULT 100,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_questions (
    id             SERIAL PRIMARY KEY,
    test_id        INTEGER NOT NULL REFERENCES ojt_tests(id) ON DELETE CASCADE,
    question       TEXT NOT NULL,
    options        JSONB,
    correct_answer TEXT,
    marks          INTEGER NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_user_progress (
    id                 SERIAL PRIMARY KEY,
    training_id        INTEGER NOT NULL REFERENCES ojt_trainings(id) ON DELETE CASCADE,
    company_user_id    INTEGER NOT NULL,
    completed_modules  JSONB DEFAULT '[]',
    score              INTEGER,
    status             VARCHAR(30) NOT NULL DEFAULT 'not_started',
    certificate_url    TEXT,
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(training_id, company_user_id)
  )
`).catch(() => {});

// ── OJT Industry-Standard Column Migrations ─────────────────────────────────
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS category VARCHAR(60) NOT NULL DEFAULT 'general'`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS estimated_duration_minutes INTEGER NOT NULL DEFAULT 60`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS is_sequential BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3`).catch(() => {});
pool.query(`ALTER TABLE ojt_trainings ADD COLUMN IF NOT EXISTS trainer_id INTEGER REFERENCES company_users(id) ON DELETE SET NULL`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS due_date DATE`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS assigned_by INTEGER REFERENCES company_users(id) ON DELETE SET NULL`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS trainer_id INTEGER REFERENCES company_users(id) ON DELETE SET NULL`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS trainer_sign_off_at TIMESTAMPTZ`).catch(() => {});
pool.query(`ALTER TABLE ojt_user_progress ADD COLUMN IF NOT EXISTS trainer_sign_off_notes TEXT`).catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS ojt_test_attempts (
    id               SERIAL       PRIMARY KEY,
    progress_id      INTEGER      NOT NULL REFERENCES ojt_user_progress(id) ON DELETE CASCADE,
    training_id      INTEGER      NOT NULL REFERENCES ojt_trainings(id)     ON DELETE CASCADE,
    company_user_id  INTEGER      NOT NULL,
    attempt_number   INTEGER      NOT NULL DEFAULT 1,
    score            INTEGER,
    earned_marks     INTEGER,
    total_marks      INTEGER,
    passed           BOOLEAN,
    submitted_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

// ── Fleet Management Tables ────────────────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS fleet_inspections (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER NOT NULL,
    asset_id        INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    checklist_items JSONB DEFAULT '[]',
    status          VARCHAR(30) NOT NULL DEFAULT 'pending',
    notes           TEXT,
    inspected_by    INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`CREATE INDEX IF NOT EXISTS fleet_inspections_company ON fleet_inspections(company_id)`).catch(() => {});
pool.query(`CREATE INDEX IF NOT EXISTS fleet_inspections_asset ON fleet_inspections(asset_id)`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS fleet_fuel_logs (
    id          SERIAL PRIMARY KEY,
    company_id  INTEGER NOT NULL,
    asset_id    INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    fuel_amount NUMERIC(10,2),
    cost        NUMERIC(10,2),
    odometer    NUMERIC(10,2),
    fuel_type   VARCHAR(50),
    log_date    DATE NOT NULL DEFAULT CURRENT_DATE,
    added_by    INTEGER,
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`CREATE INDEX IF NOT EXISTS fleet_fuel_company ON fleet_fuel_logs(company_id)`).catch(() => {});

pool.query(`
  CREATE TABLE IF NOT EXISTS fleet_maintenance (
    id            SERIAL PRIMARY KEY,
    company_id    INTEGER NOT NULL,
    asset_id      INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    issue_title   VARCHAR(255) NOT NULL,
    description   TEXT,
    priority      VARCHAR(20) NOT NULL DEFAULT 'medium',
    status        VARCHAR(30) NOT NULL DEFAULT 'open',
    assigned_to   INTEGER,
    scheduled_date DATE,
    completed_date DATE,
    cost          NUMERIC(10,2),
    created_by    INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

pool.query(`CREATE INDEX IF NOT EXISTS fleet_maintenance_company ON fleet_maintenance(company_id)`).catch(() => {});

/* ── Dashboard ──────────────────────────────────────────────────────────────── */
router.get("/dashboard", async (req, res, next) => {
  try {
    const companyId  = cid(req);
    const { role, id: userId } = req.companyUser;

    // Base flag filter – admin sees all, supervisor sees their team's flags
    let flagWhere  = "f.company_id = ?";
    const flagParams = [companyId];
    if (role === "supervisor") {
      flagWhere += ` AND (f.supervisor_id = ? OR f.raised_by IN (
        SELECT id FROM company_users WHERE supervisor_id = ? AND company_id = ?
      ))`;
      flagParams.push(userId, userId, companyId);
    }

    const [
      [assetRows], [deptRows], [empRows], [activeAssets], [issueRows],
      [openFlags], [criticalFlags], [flagsBySeverity], [assetsHealth],
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS cnt FROM assets WHERE company_id = ?", [companyId]),
      pool.query("SELECT COUNT(*) AS cnt FROM departments WHERE company_id = ?", [companyId]),
      pool.query("SELECT COUNT(*) AS cnt FROM company_users WHERE company_id = ? AND status = 'Active'", [companyId]),
      pool.query("SELECT COUNT(*) AS cnt FROM assets WHERE company_id = ? AND status = 'Active'", [companyId]),
      pool.query(
        `SELECT COUNT(*) AS cnt FROM work_orders wo
         JOIN assets a ON wo.asset_id = a.id
         WHERE a.company_id = ? AND wo.status = 'open'`,
        [companyId]
      ),
      // Open flags count
      pool.query(
        `SELECT COUNT(*) AS cnt FROM flags f
         WHERE ${flagWhere} AND f.status IN ('open', 'in_progress')`,
        flagParams
      ),
      // Critical flags count
      pool.query(
        `SELECT COUNT(*) AS cnt FROM flags f
         WHERE ${flagWhere} AND f.severity = 'critical' AND f.status IN ('open', 'in_progress')`,
        flagParams
      ),
      // Flags grouped by severity (open only)
      pool.query(
        `SELECT f.severity, COUNT(*) AS cnt FROM flags f
         WHERE ${flagWhere} AND f.status IN ('open', 'in_progress')
         GROUP BY f.severity`,
        flagParams
      ),
      // Asset health distribution
      pool.query(
        `SELECT health_status AS "healthStatus", COUNT(*) AS cnt
         FROM assets WHERE company_id = ? GROUP BY health_status`,
        [companyId]
      ),
    ]);

    const severityMap = {};
    for (const r of flagsBySeverity) severityMap[r.severity] = Number(r.cnt);

    const healthMap = {};
    for (const r of assetsHealth) healthMap[r.healthStatus] = Number(r.cnt);

    res.json({
      totalAssets:      Number(assetRows[0]?.cnt      || 0),
      activeAssets:     Number(activeAssets[0]?.cnt   || 0),
      totalDepartments: Number(deptRows[0]?.cnt        || 0),
      activeEmployees:  Number(empRows[0]?.cnt         || 0),
      openIssues:       Number(issueRows[0]?.cnt        || 0),
      flags: {
        open:     Number(openFlags[0]?.cnt     || 0),
        critical: Number(criticalFlags[0]?.cnt || 0),
        bySeverity: {
          low:      severityMap.low      || 0,
          medium:   severityMap.medium   || 0,
          high:     severityMap.high     || 0,
          critical: severityMap.critical || 0,
        },
      },
      assetHealth: {
        green:  healthMap.green  || 0,
        yellow: healthMap.yellow || 0,
        red:    healthMap.red    || 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

/* ── Dashboard Chart Stats ──────────────────────────────────────────────────── */
router.get("/dashboard/chart-stats", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const { period = "day", startDate, endDate } = req.query;

    let dateFrom, dateTo;
    if (startDate && endDate) {
      dateFrom = startDate;
      dateTo   = endDate;
    } else {
      if (period === "day") {
        dateFrom = today;
        dateTo   = today;
      } else if (period === "week") {
        const d = new Date(now);
        d.setDate(now.getDate() - now.getDay());
        dateFrom = d.toISOString().split("T")[0];
        const e = new Date(d); e.setDate(d.getDate() + 6);
        dateTo = e.toISOString().split("T")[0];
      } else if (period === "month") {
        const y = now.getFullYear(), m = now.getMonth() + 1;
        dateFrom = `${y}-${String(m).padStart(2,"0")}-01`;
        const last = new Date(y, m, 0).getDate();
        dateTo = `${y}-${String(m).padStart(2,"0")}-${String(last).padStart(2,"0")}`;
      } else {
        // year
        dateFrom = `${now.getFullYear()}-01-01`;
        dateTo   = `${now.getFullYear()}-12-31`;
      }
    }

    // Run all 4 queries separately so one failure doesn't kill the rest
    const safe = async (fn) => { try { return await fn(); } catch (e) { console.error("[chart-stats]", e.message); return [[{ cnt: 0 }]]; } };

    const [[ltRows]]  = await safe(() => pool.query(
      `SELECT COUNT(*) AS cnt FROM logsheet_templates WHERE company_id = ?`,
      [companyId]
    ));
    const [[ctRows]]  = await safe(() => pool.query(
      `SELECT COUNT(*) AS cnt FROM checklist_templates WHERE company_id = ?`,
      [companyId]
    ));
    const [[subLSRows]] = await safe(() => pool.query(
      `SELECT COUNT(*) AS cnt
       FROM logsheet_entries le
       JOIN logsheet_templates lt ON lt.id = le.template_id
       WHERE lt.company_id = ?
         AND DATE(le.submitted_at) BETWEEN ? AND ?`,
      [companyId, dateFrom, dateTo]
    ));
    const [[subCSRows]] = await safe(() => pool.query(
      `SELECT COUNT(*) AS cnt
       FROM checklist_submissions cs
       JOIN checklist_templates ct ON ct.id = cs.template_id
       WHERE ct.company_id = ?
         AND DATE(cs.submitted_at) BETWEEN ? AND ?`,
      [companyId, dateFrom, dateTo]
    ));

    const totalLogsheets   = Number(ltRows?.cnt   || 0);
    const totalChecklists  = Number(ctRows?.cnt   || 0);
    const filledLogsheets  = Number(subLSRows?.cnt || 0);
    const filledChecklists = Number(subCSRows?.cnt || 0);

    res.json({
      totalLogsheets,
      totalChecklists,
      filledLogsheets,
      filledChecklists,
      pendingLogsheets:  Math.max(0, totalLogsheets  - filledLogsheets),
      pendingChecklists: Math.max(0, totalChecklists - filledChecklists),
      period,
      dateFrom,
      dateTo,
    });
  } catch (err) {
    next(err);
  }
});

/* ── Asset Types (company portal admin CRUD) ───────────────────────────────── */
router.get("/asset-types", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, label, category, status,
              workflow_type AS "workflowType",
              field_layout  AS "fieldLayout"
       FROM asset_types
       WHERE status = 'Active'
       ORDER BY label`
    );
    const parsed = rows.map(r => ({ ...r, fieldLayout: r.fieldLayout || null }));
    res.json(parsed);
  } catch (err) { next(err); }
});

router.post("/asset-types", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { code, label, category, workflowType = "standard", fieldLayout } = req.body;
    if (!code?.trim() || !label?.trim()) return res.status(400).json({ message: "code and label are required" });
    const fl = fieldLayout?.fields?.length ? JSON.stringify(fieldLayout) : null;
    const [rows] = await pool.query(
      `INSERT INTO asset_types (code, label, category, status, workflow_type, field_layout)
       VALUES (?, ?, ?, 'Active', ?, ?)
       RETURNING id, code, label, category, status,
                 workflow_type AS "workflowType",
                 field_layout  AS "fieldLayout"`,
      [code.trim().toLowerCase(), label.trim(), category?.trim() || null, workflowType, fl]
    );
    res.status(201).json({ ...rows[0], fieldLayout: rows[0].fieldLayout || null });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Asset type code already exists" });
    next(err);
  }
});

router.put("/asset-types/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { label, category, workflowType = "standard", fieldLayout } = req.body;
    if (!label?.trim()) return res.status(400).json({ message: "label is required" });
    const fl = fieldLayout?.fields?.length ? JSON.stringify(fieldLayout) : null;
    const [rows] = await pool.query(
      `UPDATE asset_types SET label = ?, category = ?, workflow_type = ?, field_layout = ?
       WHERE id = ?
       RETURNING id, code, label, category, status,
                 workflow_type AS "workflowType",
                 field_layout  AS "fieldLayout"`,
      [label.trim(), category?.trim() || null, workflowType, fl, id]
    );
    if (!rows.length) return res.status(404).json({ message: "Asset type not found" });
    res.json({ ...rows[0], fieldLayout: rows[0].fieldLayout || null });
  } catch (err) { next(err); }
});

router.delete("/asset-types/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [rows] = await pool.query(`UPDATE asset_types SET status = 'Inactive' WHERE id = ? RETURNING id`, [id]);
    if (!rows.length) return res.status(404).json({ message: "Asset type not found" });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Departments ────────────────────────────────────────────────────────────── */
let deptLocationColumnsReady = false;
const ensureDepartmentLocationColumns = async () => {
  if (deptLocationColumnsReady) return;
  const { isMigrationSafeError } = await import('../db.js');
  const safeAlter = async (sql) => {
    try { await pool.query(sql); } catch (e) { if (!isMigrationSafeError(e)) throw e; }
  };
  await safeAlter(`ALTER TABLE departments ADD COLUMN building_id INT UNSIGNED NULL`);
  await safeAlter(`ALTER TABLE departments ADD COLUMN floor_id INT UNSIGNED NULL`);
  await safeAlter(`ALTER TABLE departments ADD COLUMN room_id INT UNSIGNED NULL`);
  deptLocationColumnsReady = true;
};

router.get("/departments", async (req, res, next) => {
  try {
    await ensureDepartmentLocationColumns();
    const [rows] = await pool.query(
      `SELECT d.id, d.name AS "departmentName", d.description,
              d.building_id AS "buildingId", d.floor_id AS "floorId", d.room_id AS "roomId",
              b.building_name AS "buildingName", f.floor_name AS "floorName", r.room_name AS "roomName",
              d.created_at AS "createdAt"
       FROM departments d
       LEFT JOIN buildings b ON b.id = d.building_id
       LEFT JOIN floors f ON f.id = d.floor_id
       LEFT JOIN rooms r ON r.id = d.room_id
       WHERE d.company_id = ? ORDER BY d.name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/departments", async (req, res, next) => {
  try {
    await ensureDepartmentLocationColumns();
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { name, description, buildingId, floorId, roomId } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "name is required" });
    const [rows] = await pool.query(
      `INSERT INTO departments (company_id, name, description, building_id, floor_id, room_id)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING id, name AS "departmentName", description,
                 building_id AS "buildingId", floor_id AS "floorId", room_id AS "roomId",
                 created_at AS "createdAt"`,
      [cid(req), name.trim(), description || null, buildingId || null, floorId || null, roomId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Department name already exists" });
    next(err);
  }
});

router.put("/departments/:id", async (req, res, next) => {
  try {
    await ensureDepartmentLocationColumns();
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { name, description, buildingId, floorId, roomId } = req.body;
    const [[check]] = await pool.query("SELECT id FROM departments WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Department not found" });
    const [rows] = await pool.query(
      `UPDATE departments
       SET name = COALESCE(?, name),
           description = ?,
           building_id = ?,
           floor_id = ?,
           room_id = ?
       WHERE id = ?
       RETURNING id, name AS "departmentName", description,
                 building_id AS "buildingId", floor_id AS "floorId", room_id AS "roomId",
                 created_at AS "createdAt"`,
      [name?.trim() || null, description ?? null, buildingId || null, floorId || null, roomId || null, id]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Department name already exists" });
    next(err);
  }
});

router.delete("/departments/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM departments WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Department not found" });
    await pool.query("DELETE FROM departments WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ── Assets ─────────────────────────────────────────────────────────────────── */
router.get("/assets", async (req, res, next) => {
  try {
    // Determine service domain from company_users + role capabilities.
    // service_domain: technical → exclude soft assets, soft → only soft, both → all
    // For users without explicit service_domain, infer from role capabilities.
    const [[cuRow]] = await pool.query(
      `SELECT cu.service_domain AS "serviceDomain",
              COALESCE(cr.can_raise_soft_issue, FALSE)      AS "canRaiseSoftIssue",
              COALESCE(cr.is_technician, FALSE)             AS "isTechnician",
              COALESCE(cr.is_technical_supervisor, FALSE)   AS "isTechnicalSupervisor",
              COALESCE(cr.is_soft_manager, FALSE)           AS "isSoftManager"
       FROM company_users cu
       LEFT JOIN company_roles cr
         ON cr.company_id = cu.company_id AND cr.role_key = cu.role AND cr.is_active = TRUE
       WHERE cu.id = ? LIMIT 1`,
      [req.companyUser.id]
    );

    let serviceDomain = (cuRow?.serviceDomain || '').toLowerCase();

    const userRole = req.companyUser?.role || '';
    const isAdminRole = ['admin', 'catalyst_admin'].includes(userRole);

    // Infer service domain from capabilities when not explicitly set
    if (!isAdminRole && serviceDomain !== 'both') {
      const hasSoftCap = Boolean(cuRow?.canRaiseSoftIssue || cuRow?.isSoftManager);
      const hasTechCap = Boolean(cuRow?.isTechnician || cuRow?.isTechnicalSupervisor);
      if (hasSoftCap && !hasTechCap) {
        // Strictly a soft-service user — force to soft regardless of service_domain setting
        serviceDomain = 'soft';
      } else if (hasTechCap && !hasSoftCap) {
        // Strictly a technical user — exclude soft assets
        serviceDomain = 'technical';
      } else if (!serviceDomain) {
        serviceDomain = 'technical'; // safe default
      }
    }

    // Build the asset type filter
    let softFilter = '';
    if (!isAdminRole && serviceDomain !== 'both') {
      if (serviceDomain === 'soft') {
        // Only show assets whose type belongs to soft-service workflow
        softFilter = `AND (
          LOWER(TRIM(COALESCE(a.asset_type,''))) = 'soft'
          OR a.asset_type IN (SELECT code FROM asset_types WHERE workflow_type = 'soft' AND status = 'Active')
        )`;
      } else {
        // 'technical' — exclude all soft-service asset types
        softFilter = `AND LOWER(TRIM(COALESCE(a.asset_type,''))) != 'soft'
          AND (a.asset_type IS NULL OR a.asset_type NOT IN (SELECT code FROM asset_types WHERE workflow_type = 'soft' AND status = 'Active'))`;
      }
    }
    // 'both' domain or admin role → no filter

    const { search, type, assignedOnly, assignedToMe, verified } = req.query;
    const params = [cid(req)];
    let extraFilters = softFilter;
    if (type) { extraFilters += ` AND a.asset_type = ?`; params.push(type); }
    if (verified === "true")  { extraFilters += ` AND a.is_verified = 1`; }
    if (verified === "false") { extraFilters += ` AND (a.is_verified = 0 OR a.is_verified IS NULL)`; }
    if (search) {
      extraFilters += ` AND (a.asset_name LIKE ? OR a.asset_unique_id LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }
    if (assignedToMe === 'true' && req.companyUser?.id) {
      extraFilters += ` AND a.assigned_to = ?`;
      params.push(req.companyUser.id);
    }
    if (assignedOnly === 'true' && req.companyUser?.id) {
      extraFilters += `
        AND a.id IN (
          SELECT COALESCE(ct.asset_id, lta.asset_id)
          FROM template_user_assignments tua
          LEFT JOIN checklist_templates ct
            ON tua.template_type = 'checklist' AND tua.template_id = ct.id AND ct.company_id = tua.company_id
          LEFT JOIN logsheet_template_assignments lta
            ON tua.template_type = 'logsheet' AND lta.template_id = tua.template_id
          WHERE tua.assigned_to = ? AND tua.company_id = ?
        )`;
      params.push(req.companyUser.id, cid(req));
    }

    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.generated_asset_id AS "generatedAssetId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              a.building_id AS "buildingId", a.floor_id AS "floorId", a.room_id AS "roomId",
              a.location_id AS "locationId", a.company_id AS "companyId",
              a.criticality, a.working_status AS "workingStatus",
              a.calibration_required AS "calibrationRequired",
              a.calibration_frequency AS "calibrationFrequency",
              a.last_calibration_date AS "lastCalibrationDate",
              a.next_calibration_due_date AS "nextCalibrationDueDate",
              a.calibration_status AS "calibrationStatus",
              a.calibration_vendor_id AS "calibrationVendorId",
              a.alert_before_days AS "alertBeforeDays",
              a.department_id AS "departmentId",
              a.assigned_to AS "assignedTo",
              a.assigned_at AS "assignedAt",
              a.is_verified AS "isVerified",
              a.created_by AS "createdBy",
              a.created_at AS "createdAt",
              cu.full_name AS "assignedToName",
              COALESCE(creator.full_name, creator.email, '') AS "createdByName",
              d.name AS "departmentName",
              ad.metadata, ad.documents
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       LEFT JOIN company_users cu ON cu.id = a.assigned_to
       LEFT JOIN company_users creator ON creator.id = a.created_by
       WHERE a.company_id = ? ${extraFilters}
       ORDER BY a.asset_name`,
      params
    );
    const normalized = rows.map((r) => {
      const meta = r.metadata == null ? {} : (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata);
      const docs = r.documents == null ? undefined : (typeof r.documents === "string" ? JSON.parse(r.documents) : r.documents);
      return { ...r, metadata: docs ? { ...meta, documents: docs } : meta, documents: undefined };
    });
    res.json(normalized);
  } catch (err) {
    next(err);
  }
});

// Multer instance for Excel uploads (disk storage — avoids holding file buffer in RAM)
const excelUploadDir = path.join(__dirname, "../../uploads/tmp-excel");
fs.mkdirSync(excelUploadDir, { recursive: true });
const excelAssetUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, excelUploadDir),
    filename: (_req, _file, cb) => cb(null, `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max (typical 500-row Excel is < 1MB)
  fileFilter: (_req, file, cb) => {
    /\.(xlsx|xls|csv)$/i.test(file.originalname) ? cb(null, true) : cb(new Error("Only .xlsx/.xls/.csv files allowed"));
  },
});

// ── POST /assets/bulk-import ──────────────────────────────────────────────────
// Upload Excel/CSV to bulk-register assets for this company (admin/supervisor only).
// Form fields (multipart): file (required)
// Department is resolved per-row from the "departmentName" column (optional).
// Each row auto-generates a unique asset ID + QR entry.
router.post("/assets/bulk-import", (req, res, next) => {
  excelAssetUpload.single("file")(req, res, (err) => {
    if (err) {
      if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (_) {}
      if (err.code === "LIMIT_FILE_SIZE") return res.status(413).json({ message: "Excel file is too large. Maximum allowed size is 10 MB." });
      return res.status(400).json({ message: err.message || "File upload failed" });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const role = req.companyUser.role;
    if (role !== "admin" && role !== "supervisor")
      return res.status(403).json({ message: "Admin or supervisor access required" });

    if (!req.file) return res.status(400).json({ message: "Excel file is required" });

    const [[co]] = await pool.query("SELECT sector, sectors FROM companies WHERE id = ?", [cid(req)]);
    const sectors = co?.sectors
      ? (typeof co.sectors === "string" ? JSON.parse(co.sectors) : co.sectors)
      : (co?.sector ? [co.sector] : []);
    const isHC = sectors.includes("healthcare");

    // Cache department lookups by name (case-insensitive) to avoid N+1 queries
    const [allDepts] = await pool.query(
      "SELECT id, name FROM departments WHERE company_id = ?", [cid(req)]
    );
    const deptByName = new Map(
      allDepts.map((d) => [d.name.toLowerCase().trim(), d.id])
    );

    const generateUniqueId = () => {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      return isHC ? `HC-${dateStr}-${rand}` : `AST-${Date.now().toString(36).toUpperCase()}-${rand}`;
    };

    const [[coCode]] = await pool.query(
      `SELECT c.company_code AS companyCode, s.state_code AS stateCode
       FROM companies c LEFT JOIN states s ON s.id = c.state_id
       WHERE c.id = ?`,
      [cid(req)]
    );
    const cCode = sanitizeAssetIdPart(coCode?.companyCode, "CO");
    const sCode = sanitizeAssetIdPart(coCode?.stateCode, "NA");
    const [[{ cnt: initialAssetCount }]] = await pool.query("SELECT COUNT(*) AS cnt FROM assets WHERE company_id = ?", [cid(req)]);
    let assetSeq = Number(initialAssetCount || 0);

    const { read, utils } = await import("xlsx");
    const wb = read(req.file.path, { type: "file" });
    // Clean up temp file immediately after parsing — free disk + avoid accumulation
    try { fs.unlinkSync(req.file.path); } catch (_) {}

    // Some files have title rows or multiple sheets; auto-select the best candidate.
    const likelyAssetKey = (key) => [
      "assetname", "asset_name", "name", "equipmentname", "equipment_name",
      "itemname", "item_name", "description", "equipmentdescription", "assetdescription",
      "machinename", "devicename", "equipment"
    ].includes(String(key || "").replace(/[*\s]/g, "").toLowerCase());

    const parseRows = (ws, range = 0) => utils.sheet_to_json(ws, { defval: "", range });
    let best = { score: -1, rows: [], range: 0 };
    for (const sheetName of wb.SheetNames || []) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      for (const range of [0, 1, 2]) {
        const rows = parseRows(ws, range);
        if (!rows.length) continue;
        const keys = Object.keys(rows[0] || {});
        const keyHits = keys.filter((k) => likelyAssetKey(k)).length;
        const score = keyHits * 10 + Math.min(rows.length, 50) / 50;
        if (score > best.score) best = { score, rows, range };
      }
    }
    const rawRows = best.rows;
    const dataStartOffset = best.range + 2;

    if (!rawRows.length) return res.status(400).json({ message: "The file has no data rows" });

    const normalise = (row) => {
      const n = {};
      for (const [k, v] of Object.entries(row))
        n[k.replace(/[*\s]/g, "").toLowerCase()] = String(v ?? "").trim();
      return n;
    };

    const isEffectivelyEmptyRow = (row) =>
      !row || Object.values(row).every((v) => String(v ?? "").trim() === "");

    // Helper: pick first non-empty value from a list of candidate keys
    const pick = (row, ...keys) => {
      for (const k of keys) { const v = row[k]; const s = (v === undefined || v === null) ? "" : String(v).trim(); if (s) return s; }
      return "";
    };

    const created = [];
    const updated = [];
    const unchanged = [];
    const skipped = [];    // validation errors
    const notFound = [];  // update mode: asset ID not in DB
    const auditRecords = []; // field-level audit trail for update mode

    const mode = (req.query.mode || "add").toLowerCase(); // "add" | "update"

    for (let i = 0; i < rawRows.length; i++) {
      const row    = normalise(rawRows[i]);
      const rowNum = i + dataStartOffset;

      // Skip fully empty rows without counting them as errors.
      const hasAnyData = Object.values(row).some((v) => String(v || "").trim() !== "");
      if (!hasAnyData) continue;

      // Ignore empty tail rows (common in user-managed Excel files with formatting).
      if (isEffectivelyEmptyRow(row)) continue;

      // Asset name — accept many real-world column names
      const assetName = pick(row,
        "assetname", "asset_name", "name", "equipmentname", "equipment_name",
        "itemname", "item_name", "description", "equipmentdescription",
        "assetdescription", "machinename", "devicename", "equipment", "equipname",
        "itemdescription", "equipmentdetails", "assetdetails", "asset"
      );
      if (!assetName) { skipped.push({ row: rowNum, reason: "Asset name column is empty" }); continue; }

      // Asset type
      const assetType = pick(row,
        "assettype", "asset_type", "type", "category", "equipmenttype",
        "equipment_type", "itemtype", "assetcategory", "subgroup", "sub_group",
        "group", "equipmentcategory"
      ) || "general";

      // Location fields
      const building = pick(row, "building", "block", "location", "site", "campus", "area", "buildingname", "facility") || null;
      const floor    = pick(row, "floor", "level", "storey", "floorname", "floorno", "floornumber") || null;
      const room     = pick(row, "room", "ward", "unit", "roomno", "roomnumber", "bed", "station", "roomname") || null;

      // Status
      const rawStatus = pick(row, "status", "condition", "state");
      const status = rawStatus && rawStatus.toLowerCase().includes("inact") ? "Inactive" : "Active";

      // Unique ID / QR
      const providedUniqueId = pick(row,
        "assetuniqueid", "asset_unique_id", "uniqueid", "qrcode", "qr_code",
        "barcode", "assetcode", "asset_code", "assetid", "equipmentid",
        "equipmentno", "tagno", "tagnumber", "assettag", "id", "code", "tag"
      );
      const uniqueIdToUse = providedUniqueId || generateUniqueId();

      // Department: look up or auto-create (dedup by name)
      const deptNameRaw = pick(row,
        "departmentname", "department_name", "department", "dept",
        "ward", "unit", "section", "division", "departmentcode", "department_code"
      );
      let departmentId = null;
      if (deptNameRaw) {
        const key = deptNameRaw.toLowerCase().trim();
        if (deptByName.has(key)) {
          departmentId = deptByName.get(key);
        } else {
          const [deptResult] = await pool.execute(
            "INSERT IGNORE INTO departments (company_id, name) VALUES (?, ?)",
            [cid(req), deptNameRaw.trim()]
          );
          let newId = deptResult.insertId;
          if (!newId) {
            // IGNORE triggered — fetch existing id
            const [[existing]] = await pool.query(
              "SELECT id FROM departments WHERE company_id = ? AND name = ? LIMIT 1",
              [cid(req), deptNameRaw.trim()]
            );
            newId = existing?.id ?? null;
          }
          if (newId) {
            deptByName.set(key, newId);
            departmentId = newId;
          }
        }
      }

      try {
        const loc = await upsertLocationHierarchyForCompany(pool, {
          companyId: cid(req),
          buildingName: building,
          floorName: floor,
          roomName: room,
          createdBy: req.companyUser.id || null,
        });

        // Resolve which existing asset to match against (mode-dependent)
        let existing;
        if (mode === "update") {
          // Update mode: match by generated_asset_id from Excel "assetId" column; never create new records
          const targetAssetId = pick(row, "assetid", "asset_id", "generatedassetid", "generated_asset_id");
          if (!targetAssetId) { continue; } // silently skip blank assetId rows in update mode
          // Match by full ID (e.g. "002-27-036949") or just numeric suffix (e.g. "36949" → padded to "%-036949")
          let assetIdParam, assetIdQuery;
          if (/[-]/.test(targetAssetId)) {
            // Full ID provided — exact match
            assetIdQuery = `a.generated_asset_id = ?`;
            assetIdParam = targetAssetId;
          } else {
            // Only the numeric part — pad to 6 digits and match suffix
            const padded = String(targetAssetId).padStart(6, "0");
            assetIdQuery = `a.generated_asset_id LIKE ?`;
            assetIdParam = `%-${padded}`;
          }
          [[existing]] = await pool.query(
            `SELECT a.id, a.generated_asset_id, a.asset_name, a.department_id, a.asset_type,
                    a.building, a.floor, a.room, a.building_id, a.floor_id, a.room_id, a.location_id,
                    a.status, ad.metadata
             FROM assets a
             LEFT JOIN asset_details ad ON ad.asset_id = a.id
             WHERE ${assetIdQuery} AND a.company_id = ? LIMIT 1`,
            [assetIdParam, cid(req)]
          );
          if (!existing) { notFound.push({ row: rowNum, assetId: targetAssetId, assetName }); continue; }
        } else {
          // Add mode: match by asset_unique_id (upsert — update if collision, else create)
          [[existing]] = await pool.query(
            `SELECT a.id, a.generated_asset_id, a.asset_name, a.department_id, a.asset_type,
                    a.building, a.floor, a.room, a.building_id, a.floor_id, a.room_id, a.location_id,
                    a.status, ad.metadata
             FROM assets a
             LEFT JOIN asset_details ad ON ad.asset_id = a.id
             WHERE a.asset_unique_id = ? AND a.company_id = ? LIMIT 1`,
            [uniqueIdToUse, cid(req)]
          );
        }
        if (existing) {
          // Build incoming metadata from this Excel row
          const incomingMeta = {};
          const mp2 = pick(row, "make", "manufacturer", "manufacturername", "brand", "mfg", "madeby", "makeby"); if (mp2) incomingMeta.make = mp2;
          const mdl2 = pick(row, "model", "modelno", "model_no", "modelname"); if (mdl2) incomingMeta.model = mdl2;
          const sn2 = pick(row, "serialno", "serial_no", "serialnumber", "srnumber", "srno", "sr_no", "serialnum"); if (sn2) incomingMeta.serialNo = sn2;
          const acc2 = pick(row, "accessories", "accessory", "attachments"); if (acc2) incomingMeta.accessories = acc2;
          const pd2 = pick(row, "purchasedate", "purchase_date", "dateofpurchase", "podate"); if (pd2) incomingMeta.purchaseDate = pd2;
          const id2up = pick(row, "installationdate", "installation_date", "dateofinstallation", "commissioningdate"); if (id2up) incomingMeta.installationDate = id2up;
          const inv2 = pick(row, "invoiceno", "invoice_no", "invoicenumber", "invoice", "invoicenum"); if (inv2) incomingMeta.invoiceNo = inv2;
          const pc2 = pick(row, "purchasecost", "purchase_cost", "cost", "price", "amount", "purchasevalue"); if (pc2) incomingMeta.purchaseCost = pc2;
          const my2 = pick(row, "mfgyear", "mfg_year", "manufacturingyear", "yearofmanufacture", "yearmfg", "year"); if (my2) incomingMeta.manufacturingYear = my2;
          const dl2 = pick(row, "dealer", "distributor", "vendor", "supplier", "vendorname", "dealername"); if (dl2) incomingMeta.dealer = dl2;
          const rm2 = pick(row, "remarks", "notes", "comment", "comments", "note", "remark"); if (rm2) incomingMeta.remarks = rm2;
          const rb2 = pick(row, "rber", "riskbased", "risk_based", "riskbasedexaminationreport"); if (rb2) incomingMeta.rber = rb2.toLowerCase() === "yes" || rb2 === "1" || rb2.toLowerCase() === "true";
          const mn2 = pick(row, "maintenancetype", "maintenance_type", "maintenance", "maintenancecontract", "maintenancecategory", "maintenance_category"); if (mn2) {
            incomingMeta.maintenanceType = mn2;
            const mnLower2 = mn2.toLowerCase();
            incomingMeta.maintenanceTypes = { warranty: mnLower2 === "warranty", amc: mnLower2 === "amc", cmc: mnLower2 === "cmc", inhouse: mnLower2 === "in house" || mnLower2 === "inhouse", catalyst: mnLower2 === "catalyst", highEnd: mnLower2 === "high end" || mnLower2 === "highend", rented: mnLower2 === "rented" };
          }
          // Maintenance date ranges — explicit per-type columns
          const ws2 = pick(row, "warrantystart", "warranty_start", "warrantybegin", "warrantybegindate"); if (ws2) incomingMeta.warrantyStart = ws2;
          const we2 = pick(row, "warrantyend", "warranty_end", "warrantyexpiry", "warrantyexpiration", "warrantyenddate"); if (we2) incomingMeta.warrantyEnd = we2;
          const as2 = pick(row, "amcstart", "amc_start", "amcbegin", "amcbegindate"); if (as2) incomingMeta.amcStart = as2;
          const ae2 = pick(row, "amcend", "amc_end", "amcexpiry", "amcexpiration", "amcenddate"); if (ae2) incomingMeta.amcEnd = ae2;
          const cs2 = pick(row, "cmcstart", "cmc_start", "cmcbegin", "cmcbegindate"); if (cs2) incomingMeta.cmcStart = cs2;
          const ce2 = pick(row, "cmcend", "cmc_end", "cmcexpiry", "cmcexpiration", "cmcenddate"); if (ce2) incomingMeta.cmcEnd = ce2;
          // Generic "Start Date" / "End Date" → map to the maintenance type column value
          const gs2 = pick(row, "startdate", "start_date", "contractstart", "contractstartdate", "fromdate", "from_date");
          const ge2 = pick(row, "enddate", "end_date", "expirydate", "expiry_date", "contractend", "contractenddate", "todate", "to_date", "duedate");
          if (gs2 || ge2) {
            const mnL = (incomingMeta.maintenanceType || "").toLowerCase();
            if (mnL === "warranty") { if (gs2 && !incomingMeta.warrantyStart) incomingMeta.warrantyStart = gs2; if (ge2 && !incomingMeta.warrantyEnd) incomingMeta.warrantyEnd = ge2; }
            else if (mnL === "amc") { if (gs2 && !incomingMeta.amcStart) incomingMeta.amcStart = gs2; if (ge2 && !incomingMeta.amcEnd) incomingMeta.amcEnd = ge2; }
            else if (mnL === "cmc") { if (gs2 && !incomingMeta.cmcStart) incomingMeta.cmcStart = gs2; if (ge2 && !incomingMeta.cmcEnd) incomingMeta.cmcEnd = ge2; }
          }

          // Existing metadata (merge: only overwrite keys that appear in Excel row)
          const existingMeta = existing.metadata
            ? (typeof existing.metadata === "string" ? JSON.parse(existing.metadata) : existing.metadata)
            : {};
          const mergedMeta = { ...existingMeta };
          let metaChanged = false;
          for (const [k, v] of Object.entries(incomingMeta)) {
            if (String(mergedMeta[k] ?? "") !== String(v)) {
              mergedMeta[k] = v;
              metaChanged = true;
            }
          }

          // Detect changes in core asset fields
          const assetChanges = {};
          if (assetName && assetName !== existing.asset_name)           assetChanges.asset_name    = assetName;
          if (departmentId != null && departmentId !== existing.department_id) assetChanges.department_id = departmentId;
          if (assetType && assetType !== existing.asset_type)           assetChanges.asset_type    = assetType;
          if (loc.building && loc.building !== existing.building)       assetChanges.building      = loc.building;
          if (loc.floor    && loc.floor    !== existing.floor)          assetChanges.floor         = loc.floor;
          if (loc.room     && loc.room     !== existing.room)           assetChanges.room          = loc.room;
          if (loc.buildingId && loc.buildingId !== existing.building_id) assetChanges.building_id  = loc.buildingId;
          if (loc.floorId  && loc.floorId  !== existing.floor_id)      assetChanges.floor_id      = loc.floorId;
          if (loc.roomId   && loc.roomId   !== existing.room_id)        assetChanges.room_id       = loc.roomId;
          if (loc.locationId && loc.locationId !== existing.location_id) assetChanges.location_id  = loc.locationId;
          if (status && status !== existing.status)                     assetChanges.status        = status;

          const hasAssetChanges = Object.keys(assetChanges).length > 0;

          // Nothing changed — skip without touching DB
          if (!hasAssetChanges && !metaChanged) {
            unchanged.push({ row: rowNum, assetUniqueId: uniqueIdToUse, assetName });
            continue;
          }

          // Apply core field changes
          if (hasAssetChanges) {
            const setClauses = Object.keys(assetChanges).map(k => `${k} = ?`).join(", ");
            await pool.execute(
              `UPDATE assets SET ${setClauses}, updated_at = NOW() WHERE id = ?`,
              [...Object.values(assetChanges), existing.id]
            );
          }

          // Apply metadata changes (merge only)
          if (metaChanged) {
            await pool.execute(
              `INSERT INTO asset_details (asset_id, metadata) VALUES (?, ?)
               ON DUPLICATE KEY UPDATE metadata = VALUES(metadata)`,
              [existing.id, JSON.stringify(mergedMeta)]
            );
          }

          updated.push({
            row: rowNum, id: existing.id, assetName,
            assetUniqueId: uniqueIdToUse,
            generatedAssetId: existing.generated_asset_id,
            changedFields: [...Object.keys(assetChanges), ...(metaChanged ? ["metadata"] : [])],
          });
          // Collect field-level audit record
          if (mode === "update") {
            const oldVals = {}; const newVals = {};
            for (const k of Object.keys(assetChanges)) { oldVals[k] = existing[k] ?? null; newVals[k] = assetChanges[k]; }
            if (metaChanged) {
              for (const [k, v] of Object.entries(incomingMeta)) {
                if (String(existingMeta[k] ?? "") !== String(v)) { oldVals[`meta.${k}`] = existingMeta[k] ?? null; newVals[`meta.${k}`] = v; }
              }
            }
            auditRecords.push({ companyId: cid(req), importedBy: req.companyUser?.id || null, assetId: existing.id, generatedAssetId: existing.generated_asset_id, assetName, oldValues: oldVals, newValues: newVals });
          }
          continue;
        }

        // In update mode: never create new records (should not reach here due to earlier continue, but safety net)
        if (mode === "update") { skipped.push({ row: rowNum, assetName, reason: "No matching asset found to update" }); continue; }

          assetSeq += 1;
          const generatedAssetId = `${cCode}-${sCode}-${String(assetSeq).padStart(6, "0")}`;
        const [result] = await pool.execute(
          `INSERT INTO assets
             (company_id, department_id, asset_name, asset_unique_id, generated_asset_id, asset_type,
              building, floor, room, building_id, floor_id, room_id, location_id,
              status, qr_code)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
           [cid(req), departmentId, assetName, uniqueIdToUse, generatedAssetId, assetType,
            loc.building, loc.floor, loc.room, loc.buildingId, loc.floorId, loc.roomId, loc.locationId,
            status, uniqueIdToUse]
        );
        const assetId = result.insertId;

        // Save all metadata fields picked from the Excel row
        const meta = {};
        const mp = pick(row,
          "make", "manufacturer", "manufacturername", "brand", "mfg", "madeby", "makeby");
        if (mp) meta.make = mp;
        const mdl = pick(row, "model", "modelno", "model_no", "modelname", "modelno");
        if (mdl) meta.model = mdl;
        const sn = pick(row, "serialno", "serial_no", "serialnumber", "srnumber", "srno", "sr_no", "serialnum");
        if (sn) meta.serialNo = sn;
        const acc = pick(row, "accessories", "accessory", "attachments");
        if (acc) meta.accessories = acc;
        const pd = pick(row, "purchasedate", "purchase_date", "dateofpurchase", "podate");
        if (pd) meta.purchaseDate = pd;
        const id2 = pick(row, "installationdate", "installation_date", "dateofinstallation", "commissioningdate");
        if (id2) meta.installationDate = id2;
        const inv = pick(row, "invoiceno", "invoice_no", "invoicenumber", "invoice", "invoicenum");
        if (inv) meta.invoiceNo = inv;
        const pc = pick(row, "purchasecost", "purchase_cost", "cost", "price", "amount", "purchasevalue");
        if (pc) meta.purchaseCost = pc;
        const my = pick(row, "mfgyear", "mfg_year", "manufacturingyear", "yearofmanufacture", "yearmfg", "year");
        if (my) meta.manufacturingYear = my;
        const dl = pick(row, "dealer", "distributor", "vendor", "supplier", "vendorname", "dealername");
        if (dl) meta.dealer = dl;
        const rm = pick(row, "remarks", "notes", "comment", "comments", "note", "remark");
        if (rm) meta.remarks = rm;
        const rb = pick(row, "rber", "riskbased", "risk_based", "riskbasedexaminationreport");
        if (rb) meta.rber = rb.toLowerCase() === "yes" || rb === "1" || rb.toLowerCase() === "true";
        const mn = pick(row, "maintenancetype", "maintenance_type", "maintenance", "maintenancecontract", "maintenancecategory", "maintenance_category");
        if (mn) {
          meta.maintenanceType = mn;
          const mnLower = mn.toLowerCase();
          meta.maintenanceTypes = { warranty: mnLower === "warranty", amc: mnLower === "amc", cmc: mnLower === "cmc", inhouse: mnLower === "in house" || mnLower === "inhouse", catalyst: mnLower === "catalyst", highEnd: mnLower === "high end" || mnLower === "highend", rented: mnLower === "rented" };
        }
        // Maintenance date ranges — explicit per-type columns
        const ws = pick(row, "warrantystart", "warranty_start", "warrantybegin", "warrantybegindate"); if (ws) meta.warrantyStart = ws;
        const we = pick(row, "warrantyend", "warranty_end", "warrantyexpiry", "warrantyexpiration", "warrantyenddate"); if (we) meta.warrantyEnd = we;
        const as = pick(row, "amcstart", "amc_start", "amcbegin", "amcbegindate"); if (as) meta.amcStart = as;
        const ae = pick(row, "amcend", "amc_end", "amcexpiry", "amcexpiration", "amcenddate"); if (ae) meta.amcEnd = ae;
        const cs = pick(row, "cmcstart", "cmc_start", "cmcbegin", "cmcbegindate"); if (cs) meta.cmcStart = cs;
        const ce = pick(row, "cmcend", "cmc_end", "cmcexpiry", "cmcexpiration", "cmcenddate"); if (ce) meta.cmcEnd = ce;
        // Generic "Start Date" / "End Date" → map to the maintenance type column value
        const gs = pick(row, "startdate", "start_date", "contractstart", "contractstartdate", "fromdate", "from_date");
        const ge = pick(row, "enddate", "end_date", "expirydate", "expiry_date", "contractend", "contractenddate", "todate", "to_date", "duedate");
        if (gs || ge) {
          const mnL = (meta.maintenanceType || "").toLowerCase();
          if (mnL === "warranty") { if (gs && !meta.warrantyStart) meta.warrantyStart = gs; if (ge && !meta.warrantyEnd) meta.warrantyEnd = ge; }
          else if (mnL === "amc") { if (gs && !meta.amcStart) meta.amcStart = gs; if (ge && !meta.amcEnd) meta.amcEnd = ge; }
          else if (mnL === "cmc") { if (gs && !meta.cmcStart) meta.cmcStart = gs; if (ge && !meta.cmcEnd) meta.cmcEnd = ge; }
        }
        await pool.execute("INSERT INTO asset_details (asset_id, metadata) VALUES (?, ?)", [assetId, JSON.stringify(meta)]);

        await pool.execute(
          `INSERT INTO asset_pre_qr (company_id, qr_unique_id, asset_id, linked_at)
           VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE asset_id = VALUES(asset_id), linked_at = NOW()`,
          [cid(req), uniqueIdToUse, assetId]
        );

        created.push({
          row: rowNum, id: assetId, assetName, assetUniqueId: uniqueIdToUse,
          generatedAssetId,
          assetType, qrCode: uniqueIdToUse, building: loc.building, floor: loc.floor, room: loc.room, status,
          departmentName: deptNameRaw || null,
        });
      } catch (rowErr) {
        skipped.push({ row: rowNum, assetName, reason: rowErr.message });
      }
    }

    // Persist audit trail (create table on first use)
    if (mode === "update" && auditRecords.length > 0) {
      try {
        await pool.execute(`CREATE TABLE IF NOT EXISTS asset_import_audits (
          id INT AUTO_INCREMENT PRIMARY KEY, company_id INT NOT NULL, imported_by INT DEFAULT NULL,
          import_mode VARCHAR(10) DEFAULT 'add', imported_at DATETIME DEFAULT NOW(),
          asset_id INT DEFAULT NULL, generated_asset_id VARCHAR(100), asset_name VARCHAR(255),
          changed_fields JSON, old_values JSON, new_values JSON,
          INDEX idx_aia_company (company_id), INDEX idx_aia_asset (asset_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
        for (const r of auditRecords) {
          await pool.execute(
            `INSERT INTO asset_import_audits (company_id, imported_by, import_mode, asset_id, generated_asset_id, asset_name, changed_fields, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [r.companyId, r.importedBy, mode, r.assetId, r.generatedAssetId, r.assetName, JSON.stringify(Object.keys(r.newValues)), JSON.stringify(r.oldValues), JSON.stringify(r.newValues)]
          );
        }
      } catch (_) {} // audit failure must not block import response
    }

    res.status(201).json({
      total: rawRows.length, created: created.length, updated: updated.length,
      unchanged: unchanged.length, skipped: skipped.length, notFound: notFound.length,
      assets: created, updatedAssets: updated, unchangedAssets: unchanged,
      errors: skipped, notFoundRows: notFound,
    });
  } catch (err) { next(err); }
});

router.get("/assets/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.generated_asset_id AS "generatedAssetId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              a.building_id AS "buildingId", a.floor_id AS "floorId", a.room_id AS "roomId",
              a.location_id AS "locationId", a.company_id AS "companyId",
              a.department_id AS "departmentId",
              a.calibration_required AS "calibrationRequired",
              a.calibration_frequency AS "calibrationFrequency",
              a.last_calibration_date AS "lastCalibrationDate",
              a.next_calibration_due_date AS "nextCalibrationDueDate",
              a.calibration_status AS "calibrationStatus",
              a.calibration_vendor_id AS "calibrationVendorId",
              a.alert_before_days AS "alertBeforeDays",
              a.created_at AS "createdAt",
              d.name AS "departmentName",
              ad.metadata
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ? AND a.company_id = ?`,
      [id, cid(req)]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const meta = asset.metadata == null ? {} : (typeof asset.metadata === "string" ? JSON.parse(asset.metadata) : asset.metadata);

    // Templates that match this asset's type – wrap in try/catch so a missing
    // column or table never kills the main asset response
    let checklists = [];
    try {
      const [rows] = await pool.query(
        `SELECT id, 'checklist' AS "templateType", template_name AS "templateName", description
         FROM checklist_templates WHERE company_id = ? AND asset_type = ?
         UNION ALL
         SELECT id, 'logsheet' AS "templateType", template_name AS "templateName", description
         FROM logsheet_templates WHERE company_id = ? AND asset_type = ?
         ORDER BY 3 LIMIT 50`,
        [cid(req), asset.assetType, cid(req), asset.assetType]
      );
      checklists = rows;
    } catch (e) {
      console.error("[assets/:id] templates query failed:", e.message);
    }

    // Assignments for templates of this asset type
    let assignments = [];
    try {
      const [rows] = await pool.query(
        `SELECT tua.id, COALESCE(ct.template_name, lt.template_name) AS "templateName",
                tua.template_type AS "templateType",
                cu.full_name AS "assignedToName",
                tua.created_at AS "assignedAt"
         FROM template_user_assignments tua
         JOIN company_users cu ON tua.assigned_to = cu.id
         LEFT JOIN checklist_templates ct ON tua.template_type = 'checklist' AND tua.template_id = ct.id AND ct.asset_type = ?
         LEFT JOIN logsheet_templates lt ON tua.template_type = 'logsheet' AND tua.template_id = lt.id AND lt.asset_type = ?
         WHERE tua.company_id = ? AND (ct.id IS NOT NULL OR lt.id IS NOT NULL)
         ORDER BY tua.created_at DESC LIMIT 50`,
        [asset.assetType, asset.assetType, cid(req)]
      );
      assignments = rows;
    } catch (e) {
      console.error("[assets/:id] assignments query failed:", e.message);
    }

    res.json({ ...asset, metadata: meta, checklists, assignments });
  } catch (err) {
    next(err);
  }
});

router.get("/assets/:id/calibration-records", async (req, res, next) => {
  try {
    const { id } = req.params;
    const [[asset]] = await pool.query(
      "SELECT id FROM assets WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const [rows] = await pool.query(
      `SELECT cr.id,
              cr.calibration_date AS calibrationDate,
              cr.next_due_date AS nextDueDate,
              cr.certificate_number AS certificateNumber,
              cr.certificate_url AS certificateUrl,
              cr.remarks,
              cr.calibrated_by AS calibratedBy,
              cr.status,
              cv.vendor_name AS vendorName,
              cr.created_at AS createdAt
       FROM calibration_records cr
       LEFT JOIN calibration_vendors cv ON cv.id = cr.vendor_id
       WHERE cr.asset_id = ?
       ORDER BY cr.calibration_date DESC, cr.id DESC`,
      [id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/assets/:id/calibration-records", async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      calibrationDate,
      nextDueDate,
      vendorName,
      certificateNumber,
      certificateUrl,
      remarks,
      calibratedBy,
      status = 'Active',
    } = req.body;
    if (!calibrationDate) return res.status(400).json({ message: "calibrationDate is required" });
    const [[asset]] = await pool.query(
      "SELECT id FROM assets WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const vendorId = await resolveCalibrationVendorId(pool, vendorName || null);
    const [ins] = await pool.query(
      `INSERT INTO calibration_records
       (asset_id, calibration_date, next_due_date, vendor_id, certificate_number, certificate_url, remarks, calibrated_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, toDateOnly(calibrationDate), toDateOnly(nextDueDate), vendorId, certificateNumber || null, certificateUrl || null, remarks || null, calibratedBy || null, status]
    );
    await pool.query(
      `UPDATE assets
       SET calibration_required = 1,
           last_calibration_date = ?,
           next_calibration_due_date = ?,
           calibration_status = ?,
           calibration_vendor_id = COALESCE(?, calibration_vendor_id),
           updated_at = NOW()
       WHERE id = ?`,
      [toDateOnly(calibrationDate), toDateOnly(nextDueDate), status, vendorId, id]
    );
    res.status(201).json({ id: ins.insertId });
  } catch (err) { next(err); }
});

router.post("/assets", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { assetName, assetUniqueId, assetType, departmentId, building, floor, room, status = "Active", metadata = {} } = req.body;
    if (!assetName?.trim() || !assetType) return res.status(400).json({ message: "assetName and assetType are required" });

    const loc = await upsertLocationHierarchyForCompany(pool, {
      companyId: cid(req),
      buildingName: building,
      floorName: floor,
      roomName: room,
      createdBy: req.companyUser.id || null,
    });

    const uniqueIdToUse = assetUniqueId || (() => {
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      return `HC-${dateStr}-${rand}`;
    })();
    const generatedAssetId = await getNextGeneratedAssetId(pool, cid(req));

     const calibration = await deriveCalibrationFromInput(pool, req.body, metadata || {});

     const [result] = await pool.query(
      `INSERT INTO assets (company_id, department_id, asset_name, asset_unique_id, generated_asset_id, asset_type,
                    calibration_required, calibration_frequency, last_calibration_date, next_calibration_due_date,
                    calibration_status, calibration_vendor_id, alert_before_days,
                    building, floor, room, building_id, floor_id, room_id, location_id, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid(req), departmentId || null, assetName.trim(), uniqueIdToUse, generatedAssetId, assetType,
       calibration.required ? 1 : 0, calibration.frequency, calibration.lastCalibrationDate, calibration.nextCalibrationDueDate,
       calibration.status, calibration.vendorId, calibration.alertBeforeDays,
       loc.building, loc.floor, loc.room, loc.buildingId, loc.floorId, loc.roomId, loc.locationId, status,
       req.companyUser?.id || null]
    );
    const newId = result.insertId;
    const [[asset]] = await pool.query(
      `SELECT id, asset_name AS assetName, asset_unique_id AS assetUniqueId, generated_asset_id AS generatedAssetId,
              asset_type AS assetType, status, building, floor, room, department_id AS departmentId
       FROM assets WHERE id = ?`,
      [newId]
    );
    const docs = Array.isArray(metadata?.documents) ? metadata.documents : null;
    const metaClean = { ...metadata }; delete metaClean.documents;
    metaClean.calibration = {
      required: calibration.required,
      frequency: calibration.frequency,
      lastCalibrationDate: calibration.lastCalibrationDate,
      nextCalibrationDueDate: calibration.nextCalibrationDueDate,
      status: calibration.status,
      vendorId: calibration.vendorId,
      vendorName: calibration.vendorName,
      alertBeforeDays: calibration.alertBeforeDays,
      certificateNumber: calibration.certificateNumber,
    };
    await pool.query(
      `INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE metadata = VALUES(metadata), documents = VALUES(documents)`,
      [newId, JSON.stringify(metaClean), docs ? JSON.stringify(docs) : null]
    );
    if (calibration.required && calibration.lastCalibrationDate) {
      await pool.query(
        `INSERT INTO calibration_records
         (asset_id, calibration_date, next_due_date, vendor_id, certificate_number, status, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId, calibration.lastCalibrationDate, calibration.nextCalibrationDueDate, calibration.vendorId, calibration.certificateNumber, calibration.status || 'Pending', 'Auto-created during asset registration']
      );
    }
    res.status(201).json({ ...asset, metadata });
  } catch (err) { next(err); }
});

// ── POST /assets/manual  (engineer: add asset to ANY company) ────────────────
router.post("/assets/manual", async (req, res, next) => {
  try {
    const { companyId, departmentId, assetName, assetType = "healthcare",
            building, floor, room, workingStatus, criticality, metadata = {} } = req.body;
    if (!assetName?.trim()) return res.status(400).json({ message: "assetName is required" });
    if (!companyId)         return res.status(400).json({ message: "companyId is required" });

    const [[company]] = await pool.query("SELECT id FROM companies WHERE id = ?", [companyId]);
    if (!company) return res.status(404).json({ message: "Company not found" });

    const loc = await upsertLocationHierarchyForCompany(pool, {
      companyId,
      buildingName: building,
      floorName: floor,
      roomName: room,
      createdBy: req.companyUser?.id || null,
    });
    const generatedAssetId = await getNextGeneratedAssetId(pool, companyId);

     const calibration = await deriveCalibrationFromInput(pool, req.body, metadata || {});

     const [result] = await pool.query(
      `INSERT INTO assets (company_id, department_id, asset_name, generated_asset_id, asset_type,
                    calibration_required, calibration_frequency, last_calibration_date, next_calibration_due_date,
                    calibration_status, calibration_vendor_id, alert_before_days,
                           building, floor, room, building_id, floor_id, room_id, location_id,
                           working_status, criticality, status, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', 0)`,
      [companyId, departmentId || null, assetName.trim(), generatedAssetId, assetType,
       calibration.required ? 1 : 0, calibration.frequency, calibration.lastCalibrationDate, calibration.nextCalibrationDueDate,
       calibration.status, calibration.vendorId, calibration.alertBeforeDays,
       loc.building, loc.floor, loc.room, loc.buildingId, loc.floorId, loc.roomId, loc.locationId,
       workingStatus || null, criticality || metadata?.criticality || 'Non_Critical']
    );
    const newId = result.insertId;

    // Auto-generate barcode
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const barcodeNo = `HC-${dateStr}-${rand}`;
    await pool.query("UPDATE assets SET asset_unique_id = ? WHERE id = ?", [barcodeNo, newId]);

    const docs = Array.isArray(metadata?.documents) ? metadata.documents : null;
    const metaClean = { ...metadata }; delete metaClean.documents;
    if (workingStatus) metaClean.workingStatus = workingStatus;
    metaClean.calibration = {
      required: calibration.required,
      frequency: calibration.frequency,
      lastCalibrationDate: calibration.lastCalibrationDate,
      nextCalibrationDueDate: calibration.nextCalibrationDueDate,
      status: calibration.status,
      vendorId: calibration.vendorId,
      vendorName: calibration.vendorName,
      alertBeforeDays: calibration.alertBeforeDays,
      certificateNumber: calibration.certificateNumber,
    };
    await pool.query(
      `INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE metadata = VALUES(metadata), documents = VALUES(documents)`,
      [newId, JSON.stringify(metaClean), docs ? JSON.stringify(docs) : null]
    );
    if (calibration.required && calibration.lastCalibrationDate) {
      await pool.query(
        `INSERT INTO calibration_records
         (asset_id, calibration_date, next_due_date, vendor_id, certificate_number, status, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId, calibration.lastCalibrationDate, calibration.nextCalibrationDueDate, calibration.vendorId, calibration.certificateNumber, calibration.status || 'Pending', 'Auto-created during asset registration']
      );
    }

    const [[asset]] = await pool.query(
      `SELECT id, asset_name AS assetName, asset_unique_id AS assetUniqueId, generated_asset_id AS generatedAssetId, asset_type AS assetType,
              status, building, floor, room, department_id AS departmentId, is_verified AS isVerified
       FROM assets WHERE id = ?`,
      [newId]
    );
    res.status(201).json({ ...asset, metadata, assetId: newId });
  } catch (err) { next(err); }
});

// ── PATCH /assets/:id/verify  (admin: mark asset as verified) ────────────────
router.patch("/assets/:id/verify", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query(
      "SELECT id FROM assets WHERE id = ? AND company_id = ?", [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Asset not found" });
    await pool.query("UPDATE assets SET is_verified = 1, updated_at = NOW() WHERE id = ?", [id]);
    res.json({ message: "Asset verified successfully" });
  } catch (err) { next(err); }
});


// ── PATCH /assets/:id  (admin: update asset fields) ──────────────────────────
router.patch("/assets/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { assetName, assetUniqueId, assetType, departmentId, building, floor, room,
            buildingId, floorId, roomId, locationId,
            status, criticality, workingStatus, metadata = {} } = req.body;
    const [[check]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Asset not found" });
    const calibration = await deriveCalibrationFromInput(pool, req.body, metadata || {});

    // Merge workingStatus and criticality into metadata so they stay in sync with the DB column
    if (workingStatus !== undefined) metadata.workingStatus = workingStatus;
    if (criticality !== undefined) metadata.criticality = criticality;

    await pool.query(
      `UPDATE assets SET
         asset_name = COALESCE(?, asset_name),
         asset_unique_id = COALESCE(?, asset_unique_id),
         asset_type = COALESCE(?, asset_type),
         department_id = COALESCE(?, department_id),
         calibration_required = ?,
         calibration_frequency = ?,
         last_calibration_date = ?,
         next_calibration_due_date = ?,
         calibration_status = ?,
         calibration_vendor_id = ?,
         alert_before_days = ?,
         building = ?, floor = ?, room = ?,
         building_id = ?, floor_id = ?, room_id = ?, location_id = ?,
         status = COALESCE(?, status),
         criticality = COALESCE(?, criticality),
         working_status = COALESCE(?, working_status),
         updated_at = NOW()
       WHERE id = ?`,
      [
        assetName || null, assetUniqueId || null, assetType || null, departmentId || null,
        calibration.required ? 1 : 0, calibration.frequency, calibration.lastCalibrationDate,
        calibration.nextCalibrationDueDate, calibration.status, calibration.vendorId, calibration.alertBeforeDays,
        building || null, floor || null, room || null,
        buildingId || null, floorId || null, roomId || null, locationId || null,
        status || null, criticality || null,
        workingStatus || null, id,
      ]
    );
    const [[asset]] = await pool.query(
      `SELECT id, asset_name AS assetName, asset_unique_id AS assetUniqueId, asset_type AS assetType, status,
              building, floor, room, building_id AS buildingId, floor_id AS floorId, room_id AS roomId,
              department_id AS departmentId FROM assets WHERE id = ?`,
      [id]
    );
    const docs = Array.isArray(metadata?.documents) ? metadata.documents : null;
    const metaClean = { ...metadata }; delete metaClean.documents;
    metaClean.calibration = {
      required: calibration.required,
      frequency: calibration.frequency,
      lastCalibrationDate: calibration.lastCalibrationDate,
      nextCalibrationDueDate: calibration.nextCalibrationDueDate,
      status: calibration.status,
      vendorId: calibration.vendorId,
      vendorName: calibration.vendorName,
      alertBeforeDays: calibration.alertBeforeDays,
      certificateNumber: calibration.certificateNumber,
    };
    await pool.query(
      `INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE metadata = VALUES(metadata), documents = VALUES(documents)`,
      [id, JSON.stringify(metaClean), docs ? JSON.stringify(docs) : null]
    );
    if (calibration.required && calibration.lastCalibrationDate) {
      const [[latestCalibration]] = await pool.query(
        `SELECT id
         FROM calibration_records
         WHERE asset_id = ? AND calibration_date = ?
         ORDER BY id DESC
         LIMIT 1`,
        [id, calibration.lastCalibrationDate]
      );
      if (!latestCalibration) {
        await pool.query(
          `INSERT INTO calibration_records
           (asset_id, calibration_date, next_due_date, vendor_id, certificate_number, status, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [id, calibration.lastCalibrationDate, calibration.nextCalibrationDueDate, calibration.vendorId, calibration.certificateNumber, calibration.status || 'Pending', 'Auto-created during asset update']
        );
      }
    }
    res.json({ ...asset, metadata });
  } catch (err) { next(err); }
});

// DELETE /assets/delete-all — delete ALL assets for this company (no limit, admin only)
router.delete("/assets/delete-all", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    // Cascade: remove QR links first, then details, then assets
    await pool.query("DELETE FROM asset_pre_qr WHERE company_id = ?", [companyId]);
    await pool.query(
      "DELETE ad FROM asset_details ad JOIN assets a ON ad.asset_id = a.id WHERE a.company_id = ?",
      [companyId]
    );
    const [result] = await pool.query("DELETE FROM assets WHERE company_id = ?", [companyId]);
    res.json({ deleted: result.affectedRows, message: `${result.affectedRows} assets deleted` });
  } catch (err) { next(err); }
});

// DELETE /assets/bulk  — delete multiple assets at once (must be before /:id)
router.delete("/assets/bulk", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const ids = Array.isArray(req.body.ids)
      ? [...new Set(req.body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
      : [];
    if (ids.length === 0)
      return res.status(400).json({ message: "ids array is required" });

    const companyId = cid(req);
    let deleted = 0;
    const CHUNK_SIZE = 500;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      const placeholders = chunk.map(() => "?").join(",");
      await pool.query(
        `DELETE FROM asset_pre_qr WHERE asset_id IN (${placeholders}) AND company_id = ?`,
        [...chunk, companyId]
      );
      const [result] = await pool.query(
        `DELETE FROM assets WHERE id IN (${placeholders}) AND company_id = ?`,
        [...chunk, companyId]
      );
      deleted += Number(result.affectedRows || 0);
    }

    res.json({ deleted });
  } catch (err) { next(err); }
});

router.delete("/assets/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Asset not found" });
    // Cascade: delete linked QR code
    await pool.query("DELETE FROM asset_pre_qr WHERE asset_id = ? AND company_id = ?", [id, cid(req)]);
    await pool.query("DELETE FROM assets WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Asset assignment ────────────────────────────────────────────────────────── */
router.patch("/assets/:id/assign", async (req, res, next) => {
  try {
    if (!["admin", "supervisor"].includes(req.companyUser.role)) return res.status(403).json({ message: "Admin or supervisor only" });
    const { id } = req.params;
    const { userId } = req.body; // null to unassign
    const [[check]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Asset not found" });
    if (userId) {
      await pool.query(
        "UPDATE assets SET assigned_to = ?, assigned_by = ?, assigned_at = NOW(), updated_at = NOW() WHERE id = ?",
        [userId, req.companyUser.id, id]
      );
    } else {
      await pool.query(
        "UPDATE assets SET assigned_to = NULL, assigned_by = NULL, assigned_at = NULL, updated_at = NOW() WHERE id = ?",
        [id]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Asset lookup by barcode ─────────────────────────────────────────────────── */
router.get("/assets/by-barcode/:barcode", async (req, res, next) => {
  try {
    const { barcode } = req.params;
    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.generated_asset_id AS "generatedAssetId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              a.calibration_required AS "calibrationRequired",
              a.calibration_frequency AS "calibrationFrequency",
              a.last_calibration_date AS "lastCalibrationDate",
              a.next_calibration_due_date AS "nextCalibrationDueDate",
              a.calibration_status AS "calibrationStatus",
              a.calibration_vendor_id AS "calibrationVendorId",
              a.alert_before_days AS "alertBeforeDays",
              a.assigned_to AS "assignedTo",
              cu.full_name AS "assignedToName",
              d.name AS "departmentName",
              ad.metadata, ad.documents
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       LEFT JOIN company_users cu ON cu.id = a.assigned_to
       WHERE a.company_id = ? AND a.asset_unique_id = ?`,
      [cid(req), barcode]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    const meta = asset.metadata == null ? {} : (typeof asset.metadata === "string" ? JSON.parse(asset.metadata) : asset.metadata);
    const docs = asset.documents == null ? undefined : (typeof asset.documents === "string" ? JSON.parse(asset.documents) : asset.documents);
    res.json({ ...asset, metadata: docs ? { ...meta, documents: docs } : meta, documents: undefined });
  } catch (err) { next(err); }
});

/* ── Calibration Vendors ─────────────────────────────────────────────────────── */
router.get("/calibration/vendors", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, vendor_name AS vendorName, contact_person AS contactPerson,
              phone, email, address, status
       FROM calibration_vendors
       WHERE status != 'Inactive'
       ORDER BY vendor_name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/calibration/vendors", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { vendorName, contactPerson, phone, email, address, status = "Active" } = req.body;
    if (!vendorName?.trim()) return res.status(400).json({ message: "vendorName is required" });
    const [ins] = await pool.query(
      `INSERT INTO calibration_vendors (vendor_name, contact_person, phone, email, address, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [vendorName.trim(), contactPerson || null, phone || null, email || null, address || null, status]
    );
    res.status(201).json({ id: ins.insertId, vendorName: vendorName.trim(), contactPerson, phone, email, address, status });
  } catch (err) { next(err); }
});

/* ── Calibration Dashboard ───────────────────────────────────────────────────── */
router.get("/calibration/dashboard", async (req, res, next) => {
  try {
    const companyId = cid(req);

    await runCalibrationNotificationEngine(companyId).catch(() => null);

    const [[dueThisMonth]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM assets
       WHERE company_id = ? AND calibration_required = 1
         AND next_calibration_due_date IS NOT NULL
         AND YEAR(next_calibration_due_date) = YEAR(CURDATE())
         AND MONTH(next_calibration_due_date) = MONTH(CURDATE())`,
      [companyId]
    );
    const [[overdue]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM assets
       WHERE company_id = ? AND calibration_required = 1
         AND next_calibration_due_date IS NOT NULL
         AND next_calibration_due_date < CURDATE()`,
      [companyId]
    );
    const [[upcoming]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM assets
       WHERE company_id = ? AND calibration_required = 1
         AND next_calibration_due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)`,
      [companyId]
    );
    const [[completed]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM calibration_records cr
       JOIN assets a ON a.id = cr.asset_id
       WHERE a.company_id = ?
         AND YEAR(cr.calibration_date) = YEAR(CURDATE())
         AND MONTH(cr.calibration_date) = MONTH(CURDATE())
         AND LOWER(COALESCE(cr.status, '')) IN ('active', 'pass', 'completed')`,
      [companyId]
    );
    res.json({
      dueThisMonth: Number(dueThisMonth.total || 0),
      overdue: Number(overdue.total || 0),
      upcoming: Number(upcoming.total || 0),
      completedThisMonth: Number(completed.total || 0),
    });
  } catch (err) { next(err); }
});

/* ── Asset Queries (raised from barcode scan) ────────────────────────────────── */
router.get("/asset-queries", async (req, res, next) => {
  try {
    const { assetId, status, assignedTo, limit } = req.query;
    const params = [cid(req)];
    let where = "WHERE aq.company_id = ?";
    if (assetId)    { where += " AND aq.asset_id = ?";    params.push(Number(assetId)); }
    if (status) {
      const statuses = status.split(",").map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where += " AND aq.status = ?"; params.push(statuses[0]);
      } else if (statuses.length > 1) {
        where += ` AND aq.status IN (${statuses.map(() => "?").join(",")})`;
        params.push(...statuses);
      }
    }
    if (assignedTo) { where += " AND aq.assigned_to = ?"; params.push(Number(assignedTo)); }
    // Non-admin employees only see queries raised by them OR assigned to them
    const isAdmin = ["admin", "supervisor", "catalyst_admin"].includes(req.companyUser.role);
    if (!isAdmin) {
      where += " AND (aq.raised_by = ? OR aq.assigned_to = ?)";
      params.push(req.companyUser.id, req.companyUser.id);
    }
    const limitClause = limit ? ` LIMIT ${Math.min(Number(limit) || 100, 500)}` : "";
    const [rows] = await pool.query(
      `SELECT aq.id, aq.asset_id AS "assetId", a.asset_name AS "assetName",
              a.asset_unique_id AS "assetUniqueId",
              aq.raised_by AS "raisedBy", cu_r.full_name AS "raisedByName",
              aq.assigned_to AS "assignedTo", cu_a.full_name AS "assignedToName",
              aq.title, aq.description, aq.images, aq.status, aq.priority,
              aq.escalation_level AS "escalationLevel",
              aq.cutoff_hours AS "cutoffHours",
              aq.resolved_by AS "resolvedBy", cu_res.full_name AS "resolvedByName",
              aq.resolved_at AS "resolvedAt", aq.resolution_note AS "resolutionNote",
              aq.created_at AS "createdAt", aq.updated_at AS "updatedAt"
       FROM asset_queries aq
       JOIN assets a ON a.id = aq.asset_id
       LEFT JOIN company_users cu_r   ON cu_r.id  = aq.raised_by
       LEFT JOIN company_users cu_a   ON cu_a.id  = aq.assigned_to
       LEFT JOIN company_users cu_res ON cu_res.id = aq.resolved_by
       ${where}
       ORDER BY aq.created_at DESC${limitClause}`,
      params
    );
    const normalized = rows.map(r => ({
      ...r,
      images: r.images ? (typeof r.images === "string" ? JSON.parse(r.images) : r.images) : [],
    }));
    res.json(normalized);
  } catch (err) { next(err); }
});

router.post("/asset-queries", async (req, res, next) => {
  try {
    const { assetId, title, description, images, priority = "normal", cutoffHours = 24 } = req.body;
    if (!assetId || !title?.trim()) return res.status(400).json({ message: "assetId and title required" });
    // Find the asset and its current assigned_to (routes query to that person)
    const [[asset]] = await pool.query(
      "SELECT id, assigned_to FROM assets WHERE id = ? AND company_id = ?",
      [assetId, cid(req)]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    // Fetch requester's name for the requester_name column
    const [[requester]] = await pool.query(
      "SELECT full_name FROM company_users WHERE id = ?",
      [req.companyUser.id]
    );
    const requesterName = requester?.full_name || "";
    const [result] = await pool.query(
      `INSERT INTO asset_queries
         (company_id, asset_id, raised_by, assigned_to, title, description, images, priority, cutoff_hours, requester_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid(req), assetId, req.companyUser.id, asset.assigned_to || null,
       title.trim(), description || null,
       images?.length ? JSON.stringify(images) : null,
       priority, cutoffHours, requesterName]
    );
    const [[query]] = await pool.query(
      `SELECT aq.id, aq.asset_id AS "assetId", a.asset_name AS "assetName",
              aq.raised_by AS "raisedBy", cu_r.full_name AS "raisedByName",
              aq.assigned_to AS "assignedTo", cu_a.full_name AS "assignedToName",
              aq.title, aq.description, aq.images, aq.status, aq.priority,
              aq.created_at AS "createdAt"
       FROM asset_queries aq
       JOIN assets a ON a.id = aq.asset_id
       LEFT JOIN company_users cu_r ON cu_r.id = aq.raised_by
       LEFT JOIN company_users cu_a ON cu_a.id = aq.assigned_to
       WHERE aq.id = ?`,
      [result.insertId]
    );
    res.status(201).json({ ...query, images: query.images ? (typeof query.images === "string" ? JSON.parse(query.images) : query.images) : [] });
    // Notify all admin/portal clients watching this company's issue list
    emitToCompany(cid(req), 'issue:new', {
      id: result.insertId,
      title: title.trim(),
      status: 'open',
      priority,
      assetId,
      raisedByName: requesterName,
    });
  } catch (err) { next(err); }
});

router.patch("/asset-queries/:id/resolve", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { resolutionNote, partsReplaced, beforePhotos, afterPhotos } = req.body;
    const [[query]] = await pool.query(
      "SELECT id, raised_by, company_id, title FROM asset_queries WHERE id = ? AND company_id = ?", [id, cid(req)]
    );
    if (!query) return res.status(404).json({ message: "Query not found" });

    // Generate a 6-digit close code
    const closeCode = String(Math.floor(100000 + Math.random() * 900000));

    await pool.query(
      `UPDATE asset_queries SET status = 'resolved', resolved_by = ?, resolved_at = NOW(),
       resolution_note = ?, close_code = ?, parts_replaced = ?,
       before_photos = ?, after_photos = ?, updated_at = NOW() WHERE id = ?`,
      [
        req.companyUser.id,
        resolutionNote || null,
        closeCode,
        partsReplaced || null,
        beforePhotos ? JSON.stringify(beforePhotos) : null,
        afterPhotos  ? JSON.stringify(afterPhotos)  : null,
        id,
      ]
    );

    // Notify the requester with the close code
    if (query.raised_by) {
      try {
        const { createNotification } = await import("../utils/notificationsHelper.js");
        await createNotification({
          companyId: query.company_id || cid(req),
          recipientId: query.raised_by,
          type: "request_resolved",
          title: "Your request has been resolved",
          message: `Request "${query.title}" has been resolved. Your close code is: ${closeCode}. Enter this code to close the request.`,
        });
      } catch (notifErr) {
        console.warn("[asset-queries] notification failed:", notifErr.message);
      }
    }

    res.json({ success: true, closeCode });
    // Broadcast status change so dashboards update in real-time
    emitToCompany(query.company_id || cid(req), 'issue:updated', { id: Number(id), status: 'resolved' });
  } catch (err) { next(err); }
});

router.patch("/asset-queries/:id/escalate", async (req, res, next) => {
  try {
    if (!["admin", "supervisor"].includes(req.companyUser.role)) return res.status(403).json({ message: "Admin/supervisor only" });
    const { id } = req.params;
    const [[check]] = await pool.query(
      "SELECT id, escalation_level FROM asset_queries WHERE id = ? AND company_id = ?", [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Query not found" });
    await pool.query(
      "UPDATE asset_queries SET escalation_level = escalation_level + 1, updated_at = NOW() WHERE id = ?",
      [id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* DELETE /asset-queries/:id — admin/supervisor can permanently delete a request */
router.delete("/asset-queries/:id", async (req, res, next) => {
  try {
    if (!["admin", "supervisor"].includes(req.companyUser.role)) return res.status(403).json({ message: "Admin/supervisor only" });
    const { id } = req.params;
    const [[check]] = await pool.query(
      "SELECT id FROM asset_queries WHERE id = ? AND company_id = ?", [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Request not found" });
    await pool.query("DELETE FROM asset_queries WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Close a resolved request — close code is optional (pass it to verify, or omit to skip verification)
router.patch("/asset-queries/:id/close", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { closeCode } = req.body;
    const [[query]] = await pool.query(
      "SELECT id, raised_by, status, close_code FROM asset_queries WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!query) return res.status(404).json({ message: "Request not found" });
    if (query.status !== "resolved" && query.status !== "closed")
      return res.status(400).json({ message: "Request is not in a resolved state" });
    // If a code was supplied, validate it; if omitted, proceed without verification
    if (closeCode && String(query.close_code) !== String(closeCode).trim()) {
      return res.status(400).json({ message: "Invalid close code" });
    }
    await pool.query(
      "UPDATE asset_queries SET status = 'closed', updated_at = NOW() WHERE id = ?",
      [id]
    );
    emitToCompany(cid(req), 'issue:updated', { id: Number(id), status: 'closed' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Asset Queries — assign engineer ──────────────────────────────────── */
router.patch("/asset-queries/:id/assign", async (req, res, next) => {
  try {
    if (!["admin", "supervisor", "catalyst_admin"].includes(req.companyUser.role))
      return res.status(403).json({ message: "Admin/supervisor only" });
    const { id } = req.params;
    const { assignedTo } = req.body;
    const [[query]] = await pool.query(
      "SELECT id FROM asset_queries WHERE id = ? AND company_id = ?", [id, cid(req)]
    );
    if (!query) return res.status(404).json({ message: "Request not found" });
    await pool.query(
      "UPDATE asset_queries SET assigned_to = ?, updated_at = NOW() WHERE id = ?",
      [assignedTo ? Number(assignedTo) : null, id]
    );
    emitToCompany(cid(req), 'issue:updated', {
      id: Number(id),
      status: 'in_progress',
      assignedTo: assignedTo ? Number(assignedTo) : null,
    });
    // Notify the assigned engineer
    if (assignedTo) {
      try {
        const [[eng]] = await pool.query("SELECT full_name FROM company_users WHERE id = ?", [assignedTo]);
        const [[aq]] = await pool.query("SELECT title FROM asset_queries WHERE id = ?", [id]);
        const { createNotification } = await import("../utils/notificationsHelper.js");
        await createNotification({
          companyId: cid(req),
          recipientId: Number(assignedTo),
          type: "request_assigned",
          title: "New request assigned to you",
          message: `You have been assigned to resolve: "${aq?.title || `Request #${id}`}"`,
        });
      } catch { /* non-critical */ }
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Asset Queries — submit rating & review after closure ─────────────── */
router.post("/asset-queries/:id/review", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, reviewText } = req.body;
    if (!rating || rating < 1 || rating > 5) return res.status(400).json({ message: "rating must be 1–5" });
    const [[query]] = await pool.query(
      "SELECT id, status, raised_by FROM asset_queries WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!query) return res.status(404).json({ message: "Request not found" });
    if (query.status !== "closed") return res.status(400).json({ message: "Request must be closed before reviewing" });
    if (query.raised_by !== req.companyUser.id) return res.status(403).json({ message: "Only the requester can review" });
    await pool.query(
      "UPDATE asset_queries SET rating = ?, review_text = ?, reviewed_at = NOW() WHERE id = ?",
      [rating, reviewText || null, id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Asset Queries — reviews analytics ────────────────────────────────── */
router.get("/asset-queries/reviews", async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const off = (Number(page) - 1) * Number(limit);
    // Aggregated analytics
    const [[agg]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         ROUND(AVG(rating), 2) AS avgRating,
         SUM(rating = 5) AS r5, SUM(rating = 4) AS r4,
         SUM(rating = 3) AS r3, SUM(rating = 2) AS r2, SUM(rating = 1) AS r1
       FROM asset_queries
       WHERE company_id = ? AND rating IS NOT NULL`,
      [cid(req)]
    );
    // Monthly trend (last 6 months)
    const [trend] = await pool.query(
      `SELECT DATE_FORMAT(reviewed_at, '%Y-%m') AS month, ROUND(AVG(rating), 2) AS avg
       FROM asset_queries
       WHERE company_id = ? AND rating IS NOT NULL
         AND reviewed_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY month ORDER BY month ASC`,
      [cid(req)]
    );
    // Paginated reviews list
    const [[{ cnt }]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM asset_queries WHERE company_id = ? AND rating IS NOT NULL",
      [cid(req)]
    );
    const [reviews] = await pool.query(
      `SELECT aq.id, aq.title, aq.rating, aq.review_text AS "reviewText",
              aq.reviewed_at AS "reviewedAt",
              cu.full_name AS "reviewerName",
              a.asset_name AS "assetName"
       FROM asset_queries aq
       LEFT JOIN company_users cu ON cu.id = aq.raised_by
       LEFT JOIN assets a ON a.id = aq.asset_id
       WHERE aq.company_id = ? AND aq.rating IS NOT NULL
       ORDER BY aq.reviewed_at DESC
       LIMIT ? OFFSET ?`,
      [cid(req), Number(limit), off]
    );
    res.json({
      analytics: {
        total: Number(agg.total),
        avgRating: Number(agg.avgRating || 0),
        distribution: {
          5: Number(agg.r5), 4: Number(agg.r4), 3: Number(agg.r3),
          2: Number(agg.r2), 1: Number(agg.r1),
        },
        trend,
      },
      reviews,
      pagination: { page: Number(page), limit: Number(limit), total: Number(cnt), hasMore: off + reviews.length < Number(cnt) },
    });
  } catch (err) { next(err); }
});

/* ── Asset Queries — fetch queries assigned to me (for engineers) ──────── */
router.get("/assigned-queries", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT aq.id, aq.asset_id AS "assetId", a.asset_name AS "assetName",
              a.asset_unique_id AS "assetUniqueId",
              aq.raised_by AS "raisedBy", cu_r.full_name AS "raisedByName",
              aq.title, aq.description, aq.status, aq.priority,
              aq.escalation_level AS "escalationLevel",
              aq.resolution_note AS "resolutionNote",
              aq.parts_replaced AS "partsReplaced",
              aq.before_photos AS "beforePhotos",
              aq.after_photos AS "afterPhotos",
              aq.created_at AS "createdAt", aq.resolved_at AS "resolvedAt"
       FROM asset_queries aq
       JOIN assets a ON a.id = aq.asset_id
       LEFT JOIN company_users cu_r ON cu_r.id = aq.raised_by
       WHERE aq.company_id = ? AND aq.assigned_to = ?
       ORDER BY aq.created_at DESC`,
      [cid(req), req.companyUser.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── Asset Queries — fetch my raised queries (for mobile requester) ─── */
router.get("/my-queries", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT aq.id, aq.asset_id AS "assetId", a.asset_name AS "assetName",
              aq.title, aq.description, aq.status, aq.priority,
              aq.resolution_note AS "resolutionNote",
              aq.close_code IS NOT NULL AS "hasCloseCode",
              aq.assigned_to AS "assignedTo", cu_a.full_name AS "assignedToName",
              aq.rating, aq.review_text AS "reviewText",
              aq.created_at AS "createdAt", aq.resolved_at AS "resolvedAt"
       FROM asset_queries aq
       JOIN assets a ON a.id = aq.asset_id
       LEFT JOIN company_users cu_a ON cu_a.id = aq.assigned_to
       WHERE aq.company_id = ? AND aq.raised_by = ?
       ORDER BY aq.created_at DESC`,
      [cid(req), req.companyUser.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── Checklists ─────────────────────────────────────────────────────────────── */
router.get("/checklists", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT ct.id, ct.template_name AS "templateName", ct.asset_type AS "assetType",
              ct.asset_id AS "assetId",
              ct.category, ct.description, ct.frequency, ct.shift, ct.status,
              ct.shift_id AS "shiftId", s.name AS "shiftName",
              ct.questions, ct.created_at AS "createdAt"
       FROM checklist_templates ct
       LEFT JOIN shifts s ON s.id = ct.shift_id
       WHERE ct.company_id = ? AND ct.is_active = 1
       ORDER BY ct.template_name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/checklists", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { templateName, assetType, assetId, category, description, frequency = "Daily", shift, shiftId, status = "active", questions } = req.body;
    if (!templateName?.trim() || !assetType) return res.status(400).json({ message: "templateName and assetType are required" });
    const questionsJson = questions ? JSON.stringify(questions) : null;
    const [rows] = await pool.query(
      `INSERT INTO checklist_templates (company_id, template_name, asset_type, asset_id, category, description, frequency, shift, shift_id, status, is_active, created_by, questions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
       RETURNING id, template_name AS "templateName", asset_type AS "assetType", asset_id AS "assetId", category, description, frequency, shift, shift_id AS "shiftId", status, questions, created_at AS "createdAt"`,
      [cid(req), templateName.trim(), assetType, assetId || null, category || null, description || null, frequency, shift || null, shiftId || null, status, null, questionsJson]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.put("/checklists/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const { templateName, assetType, assetId, category, description, frequency, shift, shiftId, status, questions } = req.body;
    const [[check]] = await pool.query("SELECT id FROM checklist_templates WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Checklist not found" });
    const isActive = status === "active" ? 1 : 0;
    const questionsJson = questions !== undefined ? JSON.stringify(questions) : undefined;
    const [rows] = await pool.query(
      `UPDATE checklist_templates SET
         template_name = COALESCE(?, template_name),
         asset_type = COALESCE(?, asset_type),
         asset_id = ?,
         category = COALESCE(?, category),
         description = COALESCE(?, description),
         frequency = COALESCE(?, frequency),
         shift = COALESCE(?, shift),
         shift_id = COALESCE(?, shift_id),
         status = COALESCE(?, status),
         is_active = ?,
         questions = COALESCE(?, questions)
       WHERE id = ?
       RETURNING id, template_name AS "templateName", asset_type AS "assetType", asset_id AS "assetId", category, description, frequency, shift, shift_id AS "shiftId", status, questions, created_at AS "createdAt"`,
      [templateName || null, assetType || null, assetId || null, category || null, description || null, frequency || null, shift || null, shiftId ?? null, status || null, isActive, questionsJson ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete("/checklists/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM checklist_templates WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!check) return res.status(404).json({ message: "Checklist not found" });
    await pool.query("DELETE FROM checklist_templates WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── Create Logsheet Template ──────────────────────────────────────────────── */
router.post("/logsheet-templates", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can create logsheet templates" });
    }
    const { templateName, assetType, assetModel, frequency = "daily", assetId, description,
            headerConfig = {}, sections, layoutType = "standard", shiftId } = req.body;
    if (!templateName?.trim()) return res.status(400).json({ message: "templateName is required" });
    if (!assetType) return res.status(400).json({ message: "assetType is required" });
    // Standard templates require sections; tabular templates store config in headerConfig
    if (layoutType !== "tabular" && (!Array.isArray(sections) || !sections.length)) {
      return res.status(400).json({ message: "At least one section is required" });
    }

    const companyId = cid(req);
    // Merge layoutType into headerConfig so the frontend can detect it on fetch
    const mergedConfig = { ...headerConfig, layoutType };

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [tmplRows] = await conn.execute(
        `INSERT INTO logsheet_templates (company_id, asset_id, template_name, asset_type, asset_model, frequency, header_config, description, is_active, layout_type, shift_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         RETURNING id`,
        [companyId, assetId || null, templateName.trim(), assetType, assetModel || null, frequency,
         JSON.stringify(mergedConfig), description || null, layoutType, shiftId || null]
      );
      const templateId = tmplRows[0]?.id;

      // Persist sections + questions only for standard templates
      if (layoutType !== "tabular" && Array.isArray(sections)) {
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx];
          const [secRows] = await conn.execute(
            `INSERT INTO logsheet_sections (template_id, section_name, order_index) VALUES (?, ?, ?) RETURNING id`,
            [templateId, section.name, Number.isFinite(section.order) ? section.order : sIdx]
          );
          const sectionId = secRows[0]?.id;
          const questionValues = (section.questions || []).map((q, qIdx) => [
            sectionId, q.questionText, q.specification || null, q.answerType,
            (q.rule && Object.keys(q.rule).length) ? JSON.stringify(q.rule) : null,
            q.priority || "medium", q.mandatory ? 1 : 0,
            Number.isFinite(q.order) ? q.order : qIdx,
          ]);
          if (questionValues.length) {
            await conn.query(
              `INSERT INTO logsheet_questions (section_id, question_text, specification, answer_type, rule_json, priority, is_mandatory, order_index) VALUES ?`,
              [questionValues]
            );
          }
        }
      }

      // Auto-assign to asset if provided
      if (assetId) {
        await conn.execute(
          `INSERT INTO logsheet_template_assignments (template_id, asset_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
          [templateId, assetId]
        );
      }

      await conn.commit();
      res.status(201).json({ id: templateId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

/* ── Assign Logsheet Template to Asset ──────────────────────────────────────── */
router.post("/logsheet-templates/:templateId/assign", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId } = req.body;
    if (!assetId) return res.status(400).json({ message: "assetId is required" });
    const [[tmpl]] = await pool.query("SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?", [templateId, cid(req)]);
    if (!tmpl) return res.status(404).json({ message: "Template not found" });
    const [[asset]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ?", [assetId, cid(req)]);
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    await pool.query(
      `INSERT INTO logsheet_template_assignments (template_id, asset_id) VALUES (?, ?) ON CONFLICT (template_id, asset_id) DO NOTHING`,
      [templateId, assetId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/* ── Logsheet Templates ─────────────────────────────────────────────────────── */
router.get("/logsheet-templates", async (req, res, next) => {
  try {
    const [templates] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
              lt.asset_model AS "assetModel", lt.frequency, lt.asset_id AS "assetId",
              a.asset_name AS "assetName",
              lt.description, lt.header_config AS "headerConfig",
              lt.layout_type AS "layoutType",
              lt.shift_id AS "shiftId", sh.name AS "shiftName",
              lt.is_active AS "isActive", lt.created_at AS "createdAt"
       FROM logsheet_templates lt
       LEFT JOIN assets a ON a.id = lt.asset_id
       LEFT JOIN shifts sh ON sh.id = lt.shift_id
       WHERE lt.company_id = ?
       ORDER BY lt.template_name`,
      [cid(req)]
    );

    if (!templates.length) return res.json([]);

    const templateIds = templates.map((t) => t.id);
    const [sections] = await pool.query(
      `SELECT id, template_id AS "templateId", section_name AS "sectionName", order_index AS "orderIndex"
       FROM logsheet_sections WHERE template_id IN (${templateIds.map(() => "?").join(",")})
       ORDER BY order_index`,
      templateIds
    );
    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length) {
      const [qRows] = await pool.query(
        `SELECT id, section_id AS "sectionId", question_text AS "questionText", specification,
                answer_type AS "answerType", rule_json AS "ruleJson", priority,
                is_mandatory AS "isMandatory", order_index AS "orderIndex"
         FROM logsheet_questions WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
         ORDER BY order_index`,
        sectionIds
      );
      questions = qRows;
    }

    const result = templates.map((t) => ({
      ...t,
      headerConfig: safeParse(t.headerConfig) ?? {},
      sections: sections
        .filter((s) => s.templateId === t.id)
        .map((s) => ({
          ...s,
          questions: questions
            .filter((q) => q.sectionId === s.id)
            .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
        })),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ── Submit Logsheet Entry ──────────────────────────────────────────────────── */
router.post("/logsheet-templates/:templateId/entries", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId, month, year, shift, headerValues = {}, answers, tabularData } = req.body;

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required" });
    }

    // Verify template belongs to this company
    const [[tmplRow]] = await pool.query(
      `SELECT id, COALESCE(layout_type, 'standard') AS "layoutType" FROM logsheet_templates WHERE id = ? AND company_id = ?`,
      [templateId, cid(req)]
    );
    if (!tmplRow) return res.status(404).json({ message: "Template not found" });

    const isTabular = tmplRow.layoutType === "tabular" || !!tabularData;

    // ── Shift Enforcement ─────────────────────────────────────────────────
    // Tech users can only submit during their assigned shift window.
    if (req.companyUser.role !== 'admin' && req.companyUser.role !== 'supervisor') {
      const [[shiftInfo]] = await pool.query(
        `SELECT s.id, s.name AS "shiftName", s.start_time AS "startTime",
                s.end_time AS "endTime", s.status AS "shiftStatus",
                es.id AS "employeeShiftId"
         FROM logsheet_templates lt
         JOIN shifts s ON s.id = lt.shift_id
         LEFT JOIN employee_shifts es
           ON es.shift_id = s.id AND es.company_user_id = ?
         WHERE lt.id = ? AND lt.company_id = ?`,
        [req.companyUser.id, templateId, cid(req)]
      ).catch(() => [[null]]);

      if (shiftInfo) {
        if (!shiftInfo.employeeShiftId) {
          return res.status(403).json({
            message: `You are not assigned to the "${shiftInfo.shiftName}" shift.`,
            shiftLocked: true,
            shiftName: shiftInfo.shiftName,
          });
        }
        if (shiftInfo.shiftStatus !== 'active' || !isShiftActive(shiftInfo.startTime, shiftInfo.endTime)) {
          return res.status(403).json({
            message: `The "${shiftInfo.shiftName}" shift is not currently active (${shiftInfo.startTime}–${shiftInfo.endTime}).`,
            shiftLocked: true,
            shiftName: shiftInfo.shiftName,
          });
        }
      }
    }

    if (!isTabular && !answers?.length) {
      return res.status(400).json({ message: "answers are required for standard logsheet entries" });
    }
    if (!isTabular && !assetId) {
      return res.status(400).json({ message: "assetId is required for standard logsheet entries" });
    }

    // Verify asset belongs to this company (only when asset is provided)
    let assetRow = null;
    if (assetId) {
      const [[foundAsset]] = await pool.query(
        "SELECT id, asset_name, building, floor, room FROM assets WHERE id = ? AND company_id = ?",
        [assetId, cid(req)]
      );
      if (!foundAsset) return res.status(404).json({ message: "Asset not found" });
      assetRow = foundAsset;
    }

    const monthDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const dataJson = isTabular ? JSON.stringify(tabularData || {}) : "{}";

    const [entryRows] = await pool.query(
      `INSERT INTO logsheet_entries (template_id, asset_id, submitted_by, company_user_id, entry_date, month, year, shift, header_values, data, submitted_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, NOW())
       RETURNING id`,
      [templateId, assetId || null, req.companyUser.id, monthDate, month, year,
       shift || null, JSON.stringify(headerValues), dataJson]
    );
    const entryId = entryRows[0]?.id ?? entryRows.insertId;

    // Persist individual answers for standard (non-tabular) templates
    if (!isTabular && answers?.length) {
      for (const a of answers) {
        await pool.query(
          `INSERT INTO logsheet_answers (entry_id, question_id, date_column, answer_value, is_issue, issue_reason, issue_detail)
           VALUES (?, ?, ?, ?, 0, NULL, NULL)`,
          [entryId, a.questionId, a.dateColumn || null, a.answerValue != null ? String(a.answerValue) : null]
        ).catch(() => {});
      }
    }

    // ── Flag & Alert Engine ────────────────────────────────────────────────────
    let issueCount = 0;
    if (entryId && assetId && answers?.length && !isTabular) {
      try {
        const [ruleQuestions] = await pool.query(
          `SELECT lq.id, lq.question_text, lq.rule_json, lq.answer_type
           FROM logsheet_questions lq
           JOIN logsheet_sections ls ON lq.section_id = ls.id
           WHERE ls.template_id = ?`,
          [templateId]
        );

        const qRuleMap = {};
        for (const q of ruleQuestions) {
          const rule = q.rule_json
            ? (typeof q.rule_json === "string" ? JSON.parse(q.rule_json) : q.rule_json)
            : null;
          qRuleMap[q.id] = { rule, text: q.question_text, answerType: q.answer_type };
        }

        const lsLocation = [assetRow.building, assetRow.floor, assetRow.room]
          .filter(Boolean).join(", ");

        for (const a of answers) {
          const qInfo = qRuleMap[a.questionId];
          if (!qInfo?.rule) continue;

          const ruleEval = evaluateRule(qInfo.rule, a.answerValue);
          if (!ruleEval.violated) continue;

          issueCount++;
          const description = `Rule violation for "${qInfo.text}": entered=${a.answerValue}, ${ruleEval.expectedText}`;

          const flagId = await createFlag(
            {
              source:          "logsheet",
              companyId:       cid(req),
              assetId,
              logsheetEntryId: entryId,
              questionId:      a.questionId,
              raisedBy:        req.companyUser.id,
              description,
              severity:        ruleEval.severity,
              enteredValue:    String(a.answerValue ?? ""),
              expectedRule:    ruleEval.expectedText,
              forceWorkOrder:  !!qInfo.rule.autoWorkOrder,
            },
            { assetName: assetRow.asset_name, location: lsLocation }
          ).catch((e) => { console.error("[FlagSystem] logsheet flag error:", e.message); return null; });

          if (flagId) {
            await dispatchFlagNotifications({
              flagId,
              companyId:    cid(req),
              assetId,
              assetName:    assetRow.asset_name,
              location:     lsLocation,
              questionText: qInfo.text,
              enteredValue: String(a.answerValue ?? ""),
              expectedRange: ruleEval.expectedText,
              severity:     ruleEval.severity,
              raisedBy:     req.companyUser.id,
              ruleActions:  qInfo.rule,
            }).catch(() => {});
          }
        }
      } catch (flagErr) {
        console.error("[FlagSystem] logsheet portal detection failed:", flagErr.message);
      }
    }

    res.status(201).json({ id: entryId, issues: issueCount });
  } catch (err) {
    next(err);
  }
});

/* ── Logsheet Entries (read) ────────────────────────────────────────────────── */
router.get("/logsheet-templates/:templateId/entries", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId, month, year, limit = 100 } = req.query;

    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?",
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });

    const qParams = [templateId];
    let where = "WHERE le.template_id = ?";
    if (assetId) { where += " AND le.asset_id = ?"; qParams.push(assetId); }
    if (month) { where += " AND le.month = ?"; qParams.push(Number(month)); }
    if (year) { where += " AND le.year = ?"; qParams.push(Number(year)); }

    const [entries] = await pool.query(
      `SELECT le.id, le.asset_id AS "assetId", le.template_id AS "templateId",
              le.submitted_by AS "submittedBy", le.entry_date AS "entryDate",
              le.month, le.year, le.shift, le.header_values AS "headerValues",
              le.data,
              le.submitted_at AS "submittedAt",
              cu.full_name AS "submittedByName"
       FROM logsheet_entries le
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       ${where}
       ORDER BY le.submitted_at DESC
       LIMIT ?`,
      [...qParams, Number(limit)]
    );

    if (!entries.length) return res.json([]);

    const entryIds = entries.map((e) => e.id);
    const [answers] = await pool.query(
      `SELECT id, entry_id AS "entryId", question_id AS "questionId", date_column AS "dateColumn",
              answer_value AS "answerValue", is_issue AS "isIssue", issue_reason AS "issueReason"
       FROM logsheet_answers
       WHERE entry_id IN (${entryIds.map(() => "?").join(",")})
       ORDER BY entry_id ASC, question_id ASC, date_column ASC`,
      entryIds
    );

    const result = entries.map((e) => ({
      ...e,
      headerValues: safeParse(e.headerValues) ?? {},
      data: safeParse(e.data) ?? {},
      answers: answers.filter((a) => a.entryId === e.id),
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ── Logsheet Grid View (company portal) ────────────────────────────────────── */
router.get("/logsheet-templates/:templateId/grid", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const { assetId, month, year } = req.query;
    const now = new Date();
    const effectiveMonth = month ? Number(month) : now.getMonth() + 1;
    const effectiveYear = year ? Number(year) : now.getFullYear();
    const companyId = cid(req);

    // Verify template belongs to this company
    const [[tmplRow]] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
              lt.asset_model AS "assetModel", lt.frequency, lt.asset_id AS "defaultAssetId",
              lt.header_config AS "headerConfig", lt.description,
              COALESCE(lt.layout_type, 'standard') AS "layoutType"
       FROM logsheet_templates lt WHERE lt.id = ? AND lt.company_id = ?`,
      [templateId, companyId]
    );
    if (!tmplRow) return res.status(404).json({ message: "Template not found" });
    tmplRow.headerConfig = safeParse(tmplRow.headerConfig) ?? {};
    // Ensure layoutType is always reflected in headerConfig for the frontend check
    if (!tmplRow.headerConfig.layoutType) tmplRow.headerConfig.layoutType = tmplRow.layoutType;

    // Sections + Questions
    const [sections] = await pool.query(
      `SELECT id, section_name AS "sectionName", order_index AS "orderIndex"
       FROM logsheet_sections WHERE template_id = ? ORDER BY order_index ASC, id ASC`,
      [templateId]
    );
    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length) {
      const [qRows] = await pool.query(
        `SELECT id, section_id AS "sectionId", question_text AS "questionText", specification,
                answer_type AS "answerType", rule_json AS "ruleJson", priority,
                is_mandatory AS "isMandatory", order_index AS "orderIndex"
         FROM logsheet_questions
         WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
         ORDER BY order_index ASC, id ASC`,
        sectionIds
      );
      questions = qRows;
    }

    const structuredTemplate = {
      ...tmplRow,
      sections: sections.map((s) => ({
        ...s,
        questions: questions
          .filter((q) => q.sectionId === s.id)
          .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
      })),
    };

    // Asset info
    const effectiveAssetId = assetId ? Number(assetId) : tmplRow.defaultAssetId;
    let asset = null;
    if (effectiveAssetId) {
      const [[aRow]] = await pool.query(
        `SELECT id, asset_name AS "assetName", asset_type AS "assetType"
         FROM assets WHERE id = ? AND company_id = ?`,
        [effectiveAssetId, companyId]
      );
      asset = aRow || null;
    }

    // Fetch all entries for this template + month + year (supports date filter on frontend)
    const [entryRows] = await pool.query(
      `SELECT le.id, le.asset_id AS "assetId", le.shift,
              le.header_values AS "headerValues", le.data,
              le.submitted_at AS "submittedAt", le.status,
              cu.full_name AS "submittedByName"
       FROM logsheet_entries le
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       WHERE le.template_id = ? AND le.month = ? AND le.year = ?
       ORDER BY le.submitted_at DESC NULLS LAST`,
      [templateId, effectiveMonth, effectiveYear]
    );

    // Parse JSON columns for every entry
    const allEntries = entryRows.map((e) => ({
      ...e,
      headerValues: safeParse(e.headerValues) ?? {},
      data: safeParse(e.data) ?? {},
    }));

    const entry = allEntries[0] || null;
    let answerMap = {};

    // Build answer-map from logsheet_answers for standard (non-tabular) templates
    if (entry && tmplRow.layoutType !== "tabular") {
      const [ansRows] = await pool.query(
        `SELECT question_id AS "questionId", date_column AS "dateColumn",
                answer_value AS "answerValue", is_issue AS "isIssue", issue_reason AS "issueReason"
         FROM logsheet_answers WHERE entry_id = ?
         ORDER BY question_id ASC, date_column ASC`,
        [entry.id]
      );
      for (const a of ansRows) {
        if (!answerMap[a.questionId]) answerMap[a.questionId] = {};
        answerMap[a.questionId][a.dateColumn] = {
          value: a.answerValue,
          isIssue: !!a.isIssue,
          issueReason: a.issueReason,
        };
      }
    }

    const daysInMonth = new Date(effectiveYear, effectiveMonth, 0).getDate();

    res.json({ template: structuredTemplate, asset, entry, entries: allEntries, answerMap, daysInMonth });
  } catch (err) {
    next(err);
  }
});

/* ── Single Logsheet Template ───────────────────────────────────────────────── */
router.get("/logsheet-templates/:templateId", async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const [[tmpl]] = await pool.query(
      `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
              lt.asset_model AS "assetModel", lt.frequency, lt.asset_id AS "assetId",
              a.asset_name AS "assetName",
              lt.description, lt.header_config AS "headerConfig",
              lt.layout_type AS "layoutType",
              lt.is_active AS "isActive", lt.created_at AS "createdAt"
       FROM logsheet_templates lt
       LEFT JOIN assets a ON a.id = lt.asset_id
       WHERE lt.id = ? AND lt.company_id = ?`,
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });

    const [sections] = await pool.query(
      `SELECT id, section_name AS "sectionName", order_index AS "orderIndex"
       FROM logsheet_sections WHERE template_id = ? ORDER BY order_index`,
      [templateId]
    );
    const sectionIds = sections.map((s) => s.id);
    let questions = [];
    if (sectionIds.length) {
      const [qRows] = await pool.query(
        `SELECT id, section_id AS "sectionId", question_text AS "questionText", specification,
                answer_type AS "answerType", rule_json AS "ruleJson", priority,
                is_mandatory AS "isMandatory", order_index AS "orderIndex"
         FROM logsheet_questions WHERE section_id IN (${sectionIds.map(() => "?").join(",")})
         ORDER BY order_index`,
        sectionIds
      );
      questions = qRows;
    }

    res.json({
      ...tmpl,
      headerConfig: safeParse(tmpl.headerConfig) ?? {},
      sections: sections.map((s) => ({
        ...s,
        questions: questions
          .filter((q) => q.sectionId === s.id)
          .map((q) => ({ ...q, rule: safeParse(q.ruleJson) ?? undefined })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* ── Update Logsheet Template ───────────────────────────────────────────────── */
router.put("/logsheet-templates/:templateId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can edit logsheet templates" });
    }
    const { templateId } = req.params;
    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?",
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });

    const { templateName, assetType, assetModel, frequency, assetId, description, headerConfig, sections } = req.body;

    const setClauses = [];
    const setParams = [];
    if (templateName !== undefined) { setClauses.push("template_name = ?"); setParams.push(templateName.trim()); }
    if (assetType !== undefined) { setClauses.push("asset_type = ?"); setParams.push(assetType); }
    if (assetModel !== undefined) { setClauses.push("asset_model = ?"); setParams.push(assetModel || null); }
    if (frequency !== undefined) { setClauses.push("frequency = ?"); setParams.push(frequency); }
    if (assetId !== undefined) { setClauses.push("asset_id = ?"); setParams.push(assetId || null); }
    if (description !== undefined) { setClauses.push("description = ?"); setParams.push(description || null); }
    if (headerConfig !== undefined) { setClauses.push("header_config = ?"); setParams.push(JSON.stringify(headerConfig)); }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      if (setClauses.length) {
        await conn.execute(
          `UPDATE logsheet_templates SET ${setClauses.join(", ")} WHERE id = ?`,
          [...setParams, templateId]
        );
      }

      // Sync assignment if assetId changed
      if (assetId !== undefined) {
        await conn.execute("DELETE FROM logsheet_template_assignments WHERE template_id = ?", [templateId]);
        if (assetId) {
          await conn.execute(
            `INSERT INTO logsheet_template_assignments (template_id, asset_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
            [templateId, assetId]
          );
        }
      }

      if (Array.isArray(sections)) {
        await conn.execute("DELETE FROM logsheet_sections WHERE template_id = ?", [templateId]);
        for (let sIdx = 0; sIdx < sections.length; sIdx++) {
          const section = sections[sIdx];
          const [secRows] = await conn.execute(
            `INSERT INTO logsheet_sections (template_id, section_name, order_index) VALUES (?, ?, ?) RETURNING id`,
            [templateId, section.name, Number.isFinite(section.order) ? section.order : sIdx]
          );
          const sectionId = secRows[0]?.id;
          const questionValues = (section.questions || []).map((q, qIdx) => [
            sectionId, q.questionText, q.specification || null, q.answerType,
            (q.rule && Object.keys(q.rule).length) ? JSON.stringify(q.rule) : null,
            q.priority || "medium", q.mandatory ? 1 : 0,
            Number.isFinite(q.order) ? q.order : qIdx,
          ]);
          if (questionValues.length) {
            await conn.query(
              `INSERT INTO logsheet_questions (section_id, question_text, specification, answer_type, rule_json, priority, is_mandatory, order_index) VALUES ?`,
              [questionValues]
            );
          }
        }
      }

      await conn.commit();
      res.status(204).send();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

/* ── Delete Logsheet Template ───────────────────────────────────────────────── */
router.delete("/logsheet-templates/:templateId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can delete logsheet templates" });
    }
    const { templateId } = req.params;
    const [[tmpl]] = await pool.query(
      "SELECT id FROM logsheet_templates WHERE id = ? AND company_id = ?",
      [templateId, cid(req)]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found" });
    await pool.execute("DELETE FROM logsheet_templates WHERE id = ?", [templateId]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/* ── Employees ──────────────────────────────────────────────────────────────── */
router.get("/employees", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT cu.id, cu.company_id AS "companyId",
              cu.full_name AS "fullName", cu.email, cu.phone,
              cu.designation, cu.role, cu.shift, cu.status, cu.username,
              cu.supervisor_id AS "supervisorId",
              COALESCE(cu.service_domain, 'technical') AS "serviceDomain",
              s.full_name AS "supervisorName",
              s.role AS "supervisorRole",
              cu.created_at AS "createdAt"
       FROM company_users cu
       LEFT JOIN company_users s ON s.id = cu.supervisor_id
       WHERE cu.company_id = ?
       ORDER BY cu.role ASC, cu.full_name ASC`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Users by role list (for parent dropdowns) ─────────────────────────────── */
router.get("/employees/by-role", async (req, res, next) => {
  try {
    const { role } = req.query;  // single role or comma-separated list
    const roles = (role || "").split(",").map((r) => r.trim()).filter(Boolean);
    let where = "WHERE company_id = ?";
    const params = [cid(req)];
    if (roles.length) {
      where += ` AND role IN (${roles.map(() => "?").join(",")})`;
      params.push(...roles);
    }
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, role, shift, designation
       FROM company_users
       ${where}
       ORDER BY full_name`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Supervisors list (for dropdowns) ───────────────────────────────────────── */
router.get("/employees/supervisors", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, designation
       FROM company_users
       WHERE company_id = ? AND role = 'supervisor'
       ORDER BY full_name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET: My team members (for supervisors in mobile app)
router.get("/my-team", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, phone, role, designation, status
       FROM company_users
       WHERE supervisor_id = ? AND company_id = ?
       ORDER BY full_name`,
      [req.companyUser.id, cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post("/employees", async (req, res, next) => {
  try {
    const { fullName, email, phone, designation, role = "employee", status = "Active", password, username, supervisorId, shift, serviceDomain = "technical" } = req.body;
    if (!fullName || !email) return res.status(400).json({ message: "fullName and email are required" });

    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can add employees" });
    }

    const resolvedSupervisorId = req.companyUser.role === "supervisor"
      ? req.companyUser.id
      : (supervisorId || null);

    const validDomains = ['technical', 'soft', 'both'];
    const resolvedDomain = validDomains.includes(serviceDomain) ? serviceDomain : 'technical';

    let passwordHash = null;
    if (password) passwordHash = await bcrypt.hash(password, 10);

    const [rows] = await pool.query(
      `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, shift, status, password_hash, username, supervisor_id, service_domain)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id,
                 company_id     AS "companyId",
                 full_name      AS "fullName",
                 email, phone, designation, role, shift, status, username,
                 supervisor_id  AS "supervisorId",
                 service_domain AS "serviceDomain",
                 created_at     AS "createdAt"`,
      [cid(req), fullName, email, phone || null, designation || null, role, shift || null, status, passwordHash, username || null, resolvedSupervisorId, resolvedDomain]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505" || err.code === "ER_DUP_ENTRY") {
      if ((err.constraint || "").includes("username") || (err.message || "").includes("username")) {
        return res.status(409).json({ message: "Username already exists" });
      }
      return res.status(409).json({ message: "Email already exists" });
    }
    next(err);
  }
});

router.put("/employees/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, designation, role, status, password, username, supervisorId, shift, serviceDomain } = req.body;

    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const [[check]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Employee not found" });

    if (req.companyUser.role === "supervisor") {
      const [[emp]] = await pool.query(
        "SELECT supervisor_id FROM company_users WHERE id = ?", [id]
      );
      if (!emp || String(emp.supervisor_id) !== String(req.companyUser.id)) {
        return res.status(403).json({ message: "Not authorised to edit this employee" });
      }
    }

    const resolvedSupervisorId = req.companyUser.role === "supervisor"
      ? req.companyUser.id
      : (supervisorId !== undefined ? (supervisorId || null) : undefined);

    const validDomains = ['technical', 'soft', 'both'];
    let serviceDomainClause = "";

    let passwordClause = "";
    let usernameClause = username !== undefined ? ", username = ?" : "";
    let supervisorClause = resolvedSupervisorId !== undefined ? ", supervisor_id = ?" : "";
    let shiftClause = shift !== undefined ? ", shift = ?" : "";
    if (serviceDomain !== undefined && validDomains.includes(serviceDomain)) {
      serviceDomainClause = ", service_domain = ?";
    }
    const params = [fullName, email, phone || null, designation || null, role || "employee", status || "Active"];
    if (username !== undefined) params.push(username || null);
    if (resolvedSupervisorId !== undefined) params.push(resolvedSupervisorId);
    if (shift !== undefined) params.push(shift || null);
    if (serviceDomainClause) params.push(serviceDomain);
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      passwordClause = ", password_hash = ?";
      params.push(hash);
    }
    params.push(id);

    const [rows] = await pool.query(
      `UPDATE company_users
       SET full_name = ?, email = ?, phone = ?, designation = ?, role = ?, status = ?${usernameClause}${supervisorClause}${shiftClause}${serviceDomainClause}${passwordClause}, updated_at = NOW()
       WHERE id = ?
       RETURNING id,
                 full_name      AS "fullName",
                 email, phone, designation, role, shift, status, username,
                 supervisor_id  AS "supervisorId",
                 service_domain AS "serviceDomain"`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505" || err.code === "ER_DUP_ENTRY") {
      if ((err.constraint || "").includes("username") || (err.message || "").includes("username")) {
        return res.status(409).json({ message: "Username already exists" });
      }
      return res.status(409).json({ message: "Email already exists" });
    }
    next(err);
  }
});

router.delete("/employees/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") {
      return res.status(403).json({ message: "Only admin can delete employees" });
    }
    const { id } = req.params;
    const [[check]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!check) return res.status(404).json({ message: "Not found" });
    await pool.query("DELETE FROM company_users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* ── Bulk import employees ──────────────────────────────────────────────────── */
router.post("/employees/bulk", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }
    const { employees } = req.body; // array of { fullName, email, phone, designation, role, status, password }
    if (!Array.isArray(employees) || !employees.length) {
      return res.status(400).json({ message: "employees array is required" });
    }

    const results = { created: 0, skipped: 0, errors: [] };
    for (const emp of employees) {
      try {
        const { fullName, email, phone, designation, role = "employee", status = "Active", password } = emp;
        if (!fullName || !email) { results.errors.push({ email, reason: "Missing name or email" }); continue; }
        let passwordHash = null;
        if (password) passwordHash = await bcrypt.hash(password, 10);
        await pool.query(
          `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, status, password_hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (email) DO NOTHING`,
          [cid(req), fullName, email, phone || null, designation || null, role, status, passwordHash]
        );
        results.created++;
      } catch (err) {
        results.skipped++;
        results.errors.push({ email: emp.email, reason: err.message });
      }
    }
    res.json(results);
  } catch (err) {
    next(err);
  }
});

/* ── Current user profile ───────────────────────────────────────────────────── */
router.get("/me", async (req, res, next) => {
  try {
    // Use companyId from JWT (supports company switching — active company may differ from primary)
    const activeCompanyId = req.companyUser.companyId;
    const [[row]] = await pool.query(
      `SELECT cu.id, cu.full_name AS "fullName", cu.email, cu.phone, cu.designation, cu.role,
              cu.status, ? AS "companyId", c.company_name AS "companyName",
              cu.permissions, cu.module_access AS "moduleAccess",
              c.enabled_modules AS "enabledModules", c.logo_url AS "logoUrl",
              c.sector, c.sectors, c.public_token AS "publicToken",
              c.qr_card_label AS "qrCardLabel"
       FROM company_users cu
       JOIN companies c ON c.id = ?
       WHERE cu.id = ?`,
      [activeCompanyId, activeCompanyId, req.companyUser.id]
    );
    if (!row) return res.status(404).json({ message: "User not found" });

    const toObject = (value) => {
      if (!value) return {};
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        } catch {
          return {};
        }
      }
      return typeof value === "object" && !Array.isArray(value) ? value : {};
    };

    const toArray = (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === "string") {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };

    const [[rolePermRow]] = await pool.query(
      `SELECT permissions
       FROM role_permissions
       WHERE company_id = ? AND role = ?
       LIMIT 1`,
      [row.companyId, row.role]
    );

    const rolePerms = toObject(rolePermRow?.permissions);
    const userPerms = toObject(row.permissions);
    // Deep merge: user-level CRUD overrides role-level at the operation level, not the module level
    const merged = { ...rolePerms };
    Object.entries(userPerms).forEach(([moduleKey, ops]) => {
      if (!ops || typeof ops !== "object") return;
      merged[moduleKey] = { ...(merged[moduleKey] || {}), ...ops };
    });
    row.permissions = merged;
    row.moduleAccess = toArray(row.moduleAccess);
    if (!row.moduleAccess.length) {
      row.moduleAccess = Object.entries(row.permissions)
        .filter(([, ops]) => ops && typeof ops === "object" && (ops.r === true || ops.read === true || ops.view === true))
        .map(([moduleKey]) => moduleKey);
    }

    row.enabledModules = row.enabledModules
      ? (typeof row.enabledModules === "string" ? JSON.parse(row.enabledModules) : row.enabledModules)
      : null;
    row.sectors = row.sectors
      ? (typeof row.sectors === "string" ? JSON.parse(row.sectors) : row.sectors)
      : (row.sector ? [row.sector] : []);

    // Validate logo file exists on disk — clear it if not to avoid 404s
    if (row.logoUrl && String(row.logoUrl).startsWith("/uploads/logos/")) {
      const filename = path.basename(String(row.logoUrl));
      const absPath = path.join(logosDir, filename);
      if (!fs.existsSync(absPath)) row.logoUrl = null;
    }

    res.json(row);
  } catch (err) {
    next(err);
  }
});

/* GET /public-link – get public dashboard token for this company */
router.get("/public-link", async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      "SELECT public_token FROM companies WHERE id = ?", [cid(req)]
    );
    if (!row) return res.status(404).json({ message: "Company not found" });

    // Auto-generate token if missing
    if (!row.public_token) {
      const { randomUUID } = await import("crypto");
      const token = randomUUID().replace(/-/g, "");
      await pool.execute("UPDATE companies SET public_token = ? WHERE id = ?", [token, cid(req)]);
      row.public_token = token;
    }
    res.json({ publicToken: row.public_token });
  } catch (err) { next(err); }
});

/* POST /public-link/regenerate – regenerate the public token (admin only) */
router.post("/public-link/regenerate", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin")
      return res.status(403).json({ message: "Admin only" });
    const { randomUUID } = await import("crypto");
    const token = randomUUID().replace(/-/g, "");
    await pool.execute("UPDATE companies SET public_token = ? WHERE id = ?", [token, cid(req)]);
    res.json({ publicToken: token });
  } catch (err) { next(err); }
});

/* ── Recent filled logsheet entries (company portal) ───────────────────────── */
router.get("/logsheet-templates/entries/recent", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
            `SELECT le.id, le.month, le.year, le.shift,
              le.submitted_at AS "submittedAt",
              lt.template_name AS "templateName", lt.frequency, lt.id AS "templateId",
              a.asset_name AS "assetName", a.id AS "assetId",
              COALESCE(le.company_user_id, le.submitted_by) AS "submittedById",
              cu.full_name AS "submittedBy"
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN assets a ON a.id = le.asset_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       WHERE lt.company_id = ?
       ORDER BY le.submitted_at DESC NULLS LAST
       LIMIT 50`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Recent filled checklist submissions (company portal) ───────────────────── */
router.get("/checklist-submissions/recent", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
            `SELECT cs.id, cs.submitted_at AS "submittedAt",
              ct.template_name AS "templateName", ct.id AS "templateId",
              a.asset_name AS "assetName", a.id AS "assetId",
              cs.status, cs.completion_pct AS "completionPct",
              COALESCE(cs.company_user_id, cs.submitted_by) AS "submittedById",
              cu.full_name AS "submittedBy"
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN assets a ON a.id = cs.asset_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
       WHERE ct.company_id = ?
       ORDER BY cs.submitted_at DESC NULLS LAST
       LIMIT 50`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Template ↔ User Assignments ────────────────────────────────────────────── */

// Admin assigns a template to a supervisor; supervisor can assign to their helpers
router.post("/template-user-assignments", async (req, res, next) => {
  try {
    const { templateType, templateId, assignedTo, note } = req.body;
    const normalizedTemplateId = Number(templateId);
    const normalizedAssignedTo = Number(assignedTo);
    if (!templateType || !normalizedTemplateId || !normalizedAssignedTo) {
      return res.status(400).json({ message: "templateType, templateId and assignedTo are required" });
    }
    if (!["checklist", "logsheet"].includes(templateType)) {
      return res.status(400).json({ message: "templateType must be checklist or logsheet" });
    }

    const role = req.companyUser.role;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Only admin or supervisor can assign templates" });
    }

    // Supervisor can only assign to their own helpers
    if (role === "supervisor") {
      const [[target]] = await pool.query(
        "SELECT supervisor_id FROM company_users WHERE id = ? AND company_id = ?",
        [normalizedAssignedTo, cid(req)]
      );
      if (!target || String(target.supervisor_id) !== String(req.companyUser.id)) {
        return res.status(403).json({ message: "You can only assign to employees under you" });
      }
    }

    // Verify target belongs to this company
    const [[empCheck]] = await pool.query(
      "SELECT id FROM company_users WHERE id = ? AND company_id = ?",
      [normalizedAssignedTo, cid(req)]
    );
    if (!empCheck) return res.status(404).json({ message: "Assignee not found in this company" });

    // Verify template belongs to this company
    const templateTable = templateType === "checklist" ? "checklist_templates" : "logsheet_templates";
    const [[templateCheck]] = await pool.query(
      `SELECT id, asset_type FROM ${templateTable} WHERE id = ? AND company_id = ?`,
      [normalizedTemplateId, cid(req)]
    );
    if (!templateCheck) return res.status(404).json({ message: "Template not found in this company" });

    const [rows] = await pool.query(
      `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (template_type, template_id, assigned_to) DO UPDATE
         SET note = EXCLUDED.note, assigned_by = EXCLUDED.assigned_by, created_at = NOW()
       RETURNING id, template_type AS "templateType", template_id AS "templateId",
                 assigned_to AS "assignedTo", assigned_by AS "assignedBy", note, created_at AS "createdAt"`,
      [cid(req), templateType, normalizedTemplateId, normalizedAssignedTo, req.companyUser.id, note || null]
    );

    // For logsheet assignments: ensure logsheet_template_assignments exists
    // This links the logsheet template to specific assets so mobile queries work correctly
    if (templateType === "logsheet") {
      // Check if this logsheet already has asset assignments
      const [[existingAssignment]] = await pool.query(
        "SELECT id FROM logsheet_template_assignments WHERE template_id = ? LIMIT 1",
        [normalizedTemplateId]
      );

      if (!existingAssignment) {
        // No existing asset assignments, so create one for each asset of matching type
        // This ensures the /my-assignments query returns the logsheet with a valid assetId
        const [assets] = await pool.query(
          "SELECT id FROM assets WHERE company_id = ? AND asset_type = ? AND status = 'Active' LIMIT 1",
          [cid(req), templateCheck.asset_type]
        );

        if (assets.length > 0) {
          // Insert logsheet_template_assignments for the first available asset
          await pool.query(
            `INSERT INTO logsheet_template_assignments (template_id, asset_id, attached_by)
             VALUES (?, ?, ?)
             ON CONFLICT (template_id, asset_id) DO NOTHING`,
            [normalizedTemplateId, assets[0].id, req.companyUser.id]
          );
        }
      }
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Get all assignments for this company (admin sees all; supervisor sees only theirs)
router.get("/template-user-assignments", async (req, res, next) => {
  try {
    const role = req.companyUser.role;
    let rows;
    if (role === "admin") {
      [rows] = await pool.query(
        `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
                tua.assigned_to AS "assignedTo", tua.assigned_by AS "assignedBy",
                tua.note, tua.created_at AS "createdAt",
                cu.full_name AS "assignedToName", cu.role AS "assignedToRole",
                ab.full_name AS "assignedByName",
                COALESCE(ct.template_name, lt.template_name) AS "templateName"
         FROM template_user_assignments tua
         JOIN company_users cu  ON cu.id  = tua.assigned_to
         LEFT JOIN company_users ab ON ab.id = tua.assigned_by
         LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
         LEFT JOIN logsheet_templates  lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
         WHERE tua.company_id = ?
         ORDER BY tua.created_at DESC`,
        [cid(req)]
      );
    } else if (role === "supervisor") {
      // Supervisor sees assignments they made to their helpers
      [rows] = await pool.query(
        `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
                tua.assigned_to AS "assignedTo", tua.assigned_by AS "assignedBy",
                tua.note, tua.created_at AS "createdAt",
                cu.full_name AS "assignedToName", cu.role AS "assignedToRole",
                COALESCE(ct.template_name, lt.template_name) AS "templateName"
         FROM template_user_assignments tua
         JOIN company_users cu ON cu.id = tua.assigned_to
         LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
         LEFT JOIN logsheet_templates  lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
         WHERE tua.company_id = ? AND tua.assigned_by = ?
         ORDER BY tua.created_at DESC`,
        [cid(req), req.companyUser.id]
      );
    } else {
      return res.status(403).json({ message: "Not authorised" });
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Get assignments for the CURRENT logged-in user (employee/helper sees their assigned tasks)
router.get("/template-user-assignments/mine", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
              tua.note, tua.created_at AS "createdAt",
              ab.full_name AS "assignedByName",
              COALESCE(ct.template_name, lt.template_name) AS "templateName",
              lt.frequency, lt.asset_id AS "assetId",
              a.asset_name AS "assetName"
       FROM template_user_assignments tua
  LEFT JOIN company_users ab    ON ab.id = tua.assigned_by
       LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
       LEFT JOIN logsheet_templates  lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
       LEFT JOIN assets a             ON a.id = lt.asset_id
       WHERE tua.assigned_to = ? AND tua.company_id = ?
       ORDER BY tua.created_at DESC`,
      [req.companyUser.id, cid(req)]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WORK ORDERS
// ─────────────────────────────────────────────────────────────────────────────

const generateWONumber = () =>
  `WO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/* GET /work-orders/users  – list company users available for assignment */
router.get("/work-orders/users", async (req, res, next) => {
  try {
    const companyId = parseInt(cid(req), 10);
    if (!companyId || isNaN(companyId)) return res.status(400).json({ message: "Invalid company context" });
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, role, designation, status
       FROM company_users
       WHERE company_id = ? AND status = 'Active'
       ORDER BY full_name ASC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* GET /work-orders/:id/escalation-history  – escalation audit log for a work order */
router.get("/work-orders/:id/escalation-history", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const woId = Number(req.params.id);

    // Verify the WO belongs to this company
    const [[wo]] = await pool.query(
      "SELECT id FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const [rows] = await pool.query(
      `SELECT id, escalation_level AS "escalationLevel",
              escalated_at AS "escalatedAt",
              previous_assignee_id AS "previousAssigneeId",
              previous_assignee_name AS "previousAssigneeName",
              new_assignee_id AS "newAssigneeId",
              new_assignee_name AS "newAssigneeName",
              reason
       FROM work_order_escalation_history
       WHERE work_order_id = ?
       ORDER BY escalated_at ASC`,
      [woId]
    ).catch(() => [[]]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /work-orders/:id  – single work order with history */
router.get("/work-orders/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const woId = Number(req.params.id);

    const [[wo]] = await pool.query(
      `SELECT wo.id, wo.work_order_number AS "workOrderNumber",
              wo.asset_id AS "assetId", wo.asset_name AS "assetName",
              wo.location, wo.issue_source AS "issueSource",
              wo.issue_description AS "issueDescription",
              wo.priority, wo.status,
              wo.flag_id AS "flagId",
              wo.cp_assigned_to AS "assignedTo",
              wo.assigned_note AS "assignedNote",
              cu.full_name AS "assignedToName",
              cu.role AS "assignedToRole",
              wo.cp_created_by AS "createdBy",
              cb.full_name AS "createdByName",
              wo.created_at AS "createdAt",
              wo.closed_at AS "closedAt",
              wo.expected_completion_at AS "expectedCompletionAt",
              wo.escalation_interval_minutes AS "escalationIntervalMinutes",
              wo.escalation_level AS "escalationLevel",
              wo.escalation_note AS "escalationNote",
              f.severity AS "flagSeverity", f.source AS "flagSource"
       FROM work_orders wo
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       LEFT JOIN company_users cb ON cb.id = wo.cp_created_by
       LEFT JOIN flags f ON f.id = wo.flag_id
       WHERE wo.id = ? AND wo.company_id = ?`,
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const [history] = await pool.query(
      `SELECT woh.id, woh.status, woh.remarks, woh.event_at AS "timestamp",
              cu.full_name AS "updatedByName"
       FROM work_order_history woh
       LEFT JOIN company_users cu ON cu.id = woh.updated_by
       WHERE woh.work_order_id = ?
       ORDER BY woh.event_at ASC`,
      [woId]
    );

    // Escalation history (graceful – table may not exist pre-migration)
    const [escalationHistory] = await pool.query(
      `SELECT id, escalation_level AS "escalationLevel",
              escalated_at AS "escalatedAt",
              previous_assignee_name AS "previousAssigneeName",
              new_assignee_name AS "newAssigneeName",
              reason
       FROM work_order_escalation_history
       WHERE work_order_id = ?
       ORDER BY escalated_at ASC`,
      [woId]
    ).catch(() => [[]]);

    res.json({ ...wo, cutoffStatus: getCutoffStatus(wo.expectedCompletionAt, wo.status), history, escalationHistory });
  } catch (err) { next(err); }
});

/* GET /work-orders  – list all work orders for this company */
router.get("/work-orders", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { status, priority, assignedTo, assetId, limit = 200, offset = 0 } = req.query;

    let where = "WHERE wo.company_id = ?";
    const params = [companyId];

    if (status)     { where += " AND wo.status = ?";      params.push(status); }
    if (priority)   { where += " AND wo.priority = ?";    params.push(priority); }
    if (assignedTo) { where += " AND wo.cp_assigned_to = ?"; params.push(Number(assignedTo)); }
    if (assetId)    { where += " AND wo.asset_id = ?";    params.push(Number(assetId)); }

    const [rows] = await pool.query(
      `SELECT wo.id, wo.work_order_number AS "workOrderNumber",
              wo.asset_id AS "assetId", wo.asset_name AS "assetName",
              wo.location, wo.issue_source AS "issueSource",
              wo.issue_description AS "issueDescription",
              wo.priority, wo.status,
              wo.flag_id AS "flagId",
              wo.cp_assigned_to AS "assignedTo",
              wo.assigned_note AS "assignedNote",
              cu.full_name AS "assignedToName",
              wo.cp_created_by AS "createdBy",
              cb.full_name AS "createdByName",
              wo.created_at AS "createdAt",
              wo.expected_completion_at AS "expectedCompletionAt",
              wo.escalation_level AS "escalationLevel",
              f.severity AS "flagSeverity", f.source AS "flagSource",
              COALESCE(f.escalated, FALSE) AS "flagEscalated"
       FROM work_orders wo
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       LEFT JOIN company_users cb ON cb.id = wo.cp_created_by
       LEFT JOIN flags f ON f.id = wo.flag_id
       ${where}
       ORDER BY wo.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM work_orders wo ${where}`,
      params
    );

    res.json({
      total: Number(countRow?.total ?? 0),
      data: rows.map(wo => ({
        ...wo,
        cutoffStatus: getCutoffStatus(wo.expectedCompletionAt, wo.status),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* POST /work-orders  – create a work order (optionally linked to a flag) */
router.post("/work-orders", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role, id: userId } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const {
      assetId,
      issueDescription,
      priority = "medium",
      flagId,
      assignedTo,
      assignedNote,
      expectedCompletionAt,
      escalationIntervalMinutes,
    } = req.body;

    if (!issueDescription) {
      return res.status(400).json({ message: "issueDescription is required" });
    }

    // Validate escalation fields
    const resolvedInterval = escalationIntervalMinutes
      ? Math.max(1, Math.min(10080, Number(escalationIntervalMinutes))) // 1 min – 7 days
      : 120; // default 2 hours
    let resolvedDeadline = null;
    if (expectedCompletionAt) {
      const d = new Date(expectedCompletionAt);
      if (isNaN(d.getTime())) return res.status(400).json({ message: "expectedCompletionAt is not a valid date" });
      resolvedDeadline = d;
    }

    // Resolve asset
    let assetName = null;
    let location = null;
    if (assetId) {
      const [[asset]] = await pool.query(
        "SELECT asset_name AS \"assetName\", building, floor, room FROM assets WHERE id = ? AND company_id = ?",
        [assetId, companyId]
      );
      if (!asset) return res.status(404).json({ message: "Asset not found" });
      assetName = asset.assetName;
      location = [asset.building, asset.floor, asset.room].filter(Boolean).join(", ") || null;
    }

    const workOrderNumber = generateWONumber();
    const issueSource = flagId ? "flag" : "manual";

    const [result] = await pool.execute(
      `INSERT INTO work_orders
         (work_order_number, company_id, asset_id, asset_name, location,
          issue_source, issue_description, priority, status,
          flag_id, cp_assigned_to, assigned_note, cp_created_by,
          expected_completion_at, escalation_interval_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
      [
        workOrderNumber, companyId, assetId || null, assetName, location,
        issueSource, issueDescription, priority,
        flagId || null, assignedTo || null, assignedNote || null, userId,
        resolvedDeadline, resolvedInterval,
      ]
    );
    const woId = result.insertId;

    // Log history
    await pool.execute(
      `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks)
       VALUES (?, 'open', NULL, ?)`,
      [woId, `Work order created${flagId ? " from flag" : ""}`]
    );

    // If linked to a flag, update the flag's work_order_id
    if (flagId) {
      await pool.execute(
        "UPDATE flags SET work_order_id = ?, status = 'in_progress', updated_at = NOW() WHERE id = ? AND company_id = ?",
        [woId, flagId, companyId]
      );
    }

    res.status(201).json({ id: woId, workOrderNumber });
  } catch (err) {
    next(err);
  }
});

/* PUT /work-orders/:id/assign  – assign or re-assign a work order */
router.put("/work-orders/:id/assign", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role, id: userId } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const woId = Number(req.params.id);
    const { assignedTo, assignedNote } = req.body;

    if (!assignedTo) {
      return res.status(400).json({ message: "assignedTo (company user id) is required" });
    }

    // Verify WO belongs to this company
    const [[wo]] = await pool.query(
      "SELECT id FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    // Verify assignee belongs to this company
    const [[assignee]] = await pool.query(
      `SELECT id, full_name AS "fullName" FROM company_users WHERE id = ? AND company_id = ?`,
      [assignedTo, companyId]
    );
    if (!assignee) return res.status(404).json({ message: "Assignee not found in this company" });

    await pool.execute(
      "UPDATE work_orders SET cp_assigned_to = ?, assigned_note = ?, status = 'in_progress' WHERE id = ?",
      [assignedTo, assignedNote || null, woId]
    );

    await pool.execute(
      `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks)
       VALUES (?, 'in_progress', NULL, ?)`,
      [woId, `Assigned to ${assignee.fullName}`]
    );

    res.json({ success: true, assignedToName: assignee.fullName });
  } catch (err) {
    next(err);
  }
});

/* PATCH /asset-queries/:id/assign  – assign a QR-scan request to a company user */
router.patch("/asset-queries/:id/assign", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }
    const aqId = Number(req.params.id);
    const { assignedTo } = req.body;
    if (!assignedTo) return res.status(400).json({ message: "assignedTo is required" });

    const [[aq]] = await pool.query(
      "SELECT id FROM asset_queries WHERE id = ? AND company_id = ?",
      [aqId, companyId]
    );
    if (!aq) return res.status(404).json({ message: "Asset query not found" });

    const [[assignee]] = await pool.query(
      "SELECT id, full_name AS fullName FROM company_users WHERE id = ? AND company_id = ?",
      [assignedTo, companyId]
    );
    if (!assignee) return res.status(404).json({ message: "Assignee not found in this company" });

    await pool.execute(
      "UPDATE asset_queries SET assigned_to = ?, status = IF(status = 'open', 'in_progress', status) WHERE id = ?",
      [assignedTo, aqId]
    );
    res.json({ message: "Assigned", assignedTo: Number(assignedTo), assigneeName: assignee.fullName });
  } catch (err) { next(err); }
});

/* PATCH /asset-queries/:id/status  – update QR-scan request status */
router.patch("/asset-queries/:id/status", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }
    const aqId = Number(req.params.id);
    const { status } = req.body;
    const VALID_AQ = ["open", "in_progress", "resolved"];
    if (!VALID_AQ.includes(status)) return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_AQ.join(", ")}` });

    const [[aq]] = await pool.query(
      "SELECT id FROM asset_queries WHERE id = ? AND company_id = ?",
      [aqId, companyId]
    );
    if (!aq) return res.status(404).json({ message: "Asset query not found" });

    await pool.execute("UPDATE asset_queries SET status = ? WHERE id = ?", [status, aqId]);
    res.json({ message: "Status updated", status });
  } catch (err) { next(err); }
});

/* PATCH /asset-queries/:id/cutoff  – set cutoff datetime for a QR-scan request */
router.patch("/asset-queries/:id/cutoff", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }
    const aqId = Number(req.params.id);
    const { cutoffTime } = req.body;

    const [[aq]] = await pool.query(
      "SELECT id FROM asset_queries WHERE id = ? AND company_id = ?",
      [aqId, companyId]
    );
    if (!aq) return res.status(404).json({ message: "Asset query not found" });

    // Store cutoff as computed hours from now, or just track in a note
    // Since asset_queries has cutoff_hours (INT), compute hours from now
    let hoursFromNow = null;
    if (cutoffTime) {
      const diff = new Date(cutoffTime).getTime() - Date.now();
      hoursFromNow = Math.max(1, Math.round(diff / 3600000));
    }
    await pool.execute("UPDATE asset_queries SET cutoff_hours = ?, updated_at = NOW() WHERE id = ?", [hoursFromNow, aqId]);
    res.json({ message: "Cutoff updated", cutoffTime });
  } catch (err) { next(err); }
});

/* PUT /work-orders/:id/status  – update work order status */
router.put("/work-orders/:id/status", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role, id: userId } = req.companyUser;
    const woId = Number(req.params.id);

    if (role !== "admin" && role !== "supervisor") {
      // Technicians can only update their own assigned work orders
      const [[assigned]] = await pool.query(
        "SELECT id FROM work_orders WHERE id = ? AND company_id = ? AND cp_assigned_to = ?",
        [woId, companyId, userId]
      );
      if (!assigned) return res.status(403).json({ message: "Not authorised" });
    }

    const { status, remark } = req.body;

    const VALID = ["open", "in_progress", "completed", "closed"];
    if (!VALID.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const [[wo]] = await pool.query(
      "SELECT id, flag_id AS \"flagId\" FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const closedAt = (status === "completed" || status === "closed") ? new Date() : null;
    await pool.execute(
      `UPDATE work_orders SET status = ?, closed_at = ? WHERE id = ?`,
      [status, closedAt, woId]
    );

    await pool.execute(
      `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks) VALUES (?, ?, NULL, ?)`,
      [woId, status, remark || null]
    );

    // If the linked flag is still open and WO is completed, auto-resolve it
    if (wo.flagId && (status === "completed" || status === "closed")) {
      await pool.execute(
        "UPDATE flags SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = ? AND status IN ('open','in_progress')",
        [wo.flagId]
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/* PATCH /work-orders/:id/status – alias for PUT (same handler) */
router.patch("/work-orders/:id/status", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role, id: userId } = req.companyUser;
    const woId = Number(req.params.id);

    if (role !== "admin" && role !== "supervisor") {
      const [[assigned]] = await pool.query(
        "SELECT id FROM work_orders WHERE id = ? AND company_id = ? AND cp_assigned_to = ?",
        [woId, companyId, userId]
      );
      if (!assigned) return res.status(403).json({ message: "Not authorised" });
    }

    const { status, remark } = req.body;
    const VALID = ["open", "in_progress", "completed", "closed"];
    if (!VALID.includes(status)) return res.status(400).json({ message: "Invalid status" });

    const [[wo]] = await pool.query(
      "SELECT id, flag_id AS `flagId` FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    const closedAt = (status === "completed" || status === "closed") ? new Date() : null;
    await pool.execute(`UPDATE work_orders SET status = ?, closed_at = ? WHERE id = ?`, [status, closedAt, woId]);
    await pool.execute(
      `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks) VALUES (?, ?, NULL, ?)`,
      [woId, status, remark || null]
    );
    if (wo.flagId && (status === "completed" || status === "closed")) {
      await pool.execute(
        "UPDATE flags SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = ? AND status IN ('open','in_progress')",
        [wo.flagId]
      );
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* PATCH /work-orders/:id/priority – admin/supervisor can set priority */
router.patch("/work-orders/:id/priority", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role } = req.companyUser;
    if (role !== "admin" && role !== "supervisor")
      return res.status(403).json({ message: "Not authorised" });

    const woId = Number(req.params.id);
    const { priority } = req.body;
    if (!["low","medium","high","critical"].includes(priority))
      return res.status(400).json({ message: "Invalid priority" });

    const [[wo]] = await pool.query(
      "SELECT id FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    await pool.execute("UPDATE work_orders SET priority = ? WHERE id = ?", [priority, woId]);
    res.json({ success: true, priority });
  } catch (err) { next(err); }
});

/* PATCH /work-orders/:id/cutoff  – admin/supervisor can set or update the cutoff deadline */
router.patch("/work-orders/:id/cutoff", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { role } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const woId = Number(req.params.id);
    const { expectedCompletionAt } = req.body;

    // Allow null to clear the deadline
    let resolvedDeadline = null;
    if (expectedCompletionAt != null) {
      const d = new Date(expectedCompletionAt);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ message: "expectedCompletionAt is not a valid ISO date string" });
      }
      resolvedDeadline = d;
    }

    const [[wo]] = await pool.query(
      "SELECT id, status FROM work_orders WHERE id = ? AND company_id = ?",
      [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });

    await pool.execute(
      "UPDATE work_orders SET expected_completion_at = ?, cutoff_time = ? WHERE id = ?",
      [resolvedDeadline, resolvedDeadline, woId]
    );

    res.json({ success: true, cutoffTime: resolvedDeadline });
  } catch (err) {
    next(err);
  }
});

// Delete a work order (admin only)
router.delete("/work-orders/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.companyUser;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Admin or supervisor access required" });
    }
    const [[wo]] = await pool.query(
      "SELECT id FROM work_orders WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found" });
    await pool.query("DELETE FROM work_orders WHERE id = ?", [id]);
    res.json({ success: true, deleted: 1 });
  } catch (err) { next(err); }
});

// Delete an assignment (admin: any; supervisor: only ones they created)
router.delete("/template-user-assignments/:id", async (req, res, next) => {  try {
    const { id } = req.params;
    const role = req.companyUser.role;
    if (role !== "admin" && role !== "supervisor") {
      return res.status(403).json({ message: "Not authorised" });
    }

    const [[row]] = await pool.query(
      "SELECT id, assigned_by FROM template_user_assignments WHERE id = ? AND company_id = ?",
      [id, cid(req)]
    );
    if (!row) return res.status(404).json({ message: "Assignment not found" });

    if (role === "supervisor" && String(row.assigned_by) !== String(req.companyUser.id)) {
      return res.status(403).json({ message: "Not authorised to delete this assignment" });
    }

    await pool.query("DELETE FROM template_user_assignments WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// OJT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/* GET /ojt/trainings – list all trainings for this company (admin only) */
router.get("/ojt/trainings", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT ot.id, ot.title, ot.description, ot.status,
              ot.passing_percentage AS "passingPercentage",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.is_sequential AS "isSequential", ot.max_attempts AS "maxAttempts",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              ot.trainer_id AS "trainerId",
              tr.full_name AS "trainerName",
              ot.created_by AS "createdBy", ot.created_at AS "createdAt", ot.updated_at AS "updatedAt",
              (SELECT COUNT(*) FROM ojt_modules WHERE training_id = ot.id) AS "moduleCount",
              (SELECT COUNT(*) FROM ojt_tests WHERE training_id = ot.id) AS "hasTest",
              (SELECT COUNT(*) FROM ojt_user_progress WHERE training_id = ot.id) AS "enrolledCount",
              (SELECT COUNT(*) FROM ojt_user_progress WHERE training_id = ot.id AND status = 'completed') AS "completedCount",
              (SELECT ROUND(AVG(score)) FROM ojt_user_progress WHERE training_id = ot.id AND score IS NOT NULL) AS "avgScore"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
       LEFT JOIN company_users tr ON tr.id = ot.trainer_id
       WHERE ot.company_id = ?
       ORDER BY ot.created_at DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /ojt/trainings/:id – single training with modules and test */
router.get("/ojt/trainings/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query(
      `SELECT ot.id, ot.title, ot.description, ot.status,
              ot.passing_percentage AS "passingPercentage",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.is_sequential AS "isSequential", ot.max_attempts AS "maxAttempts",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              ot.trainer_id AS "trainerId", tr.full_name AS "trainerName",
              ot.created_by AS "createdBy", ot.created_at AS "createdAt", ot.updated_at AS "updatedAt"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
       LEFT JOIN company_users tr ON tr.id = ot.trainer_id
       WHERE ot.id = ? AND ot.company_id = ?`,
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });

    const [modules] = await pool.query(
      `SELECT om.id, om.title, om.description, om.order_number AS "orderNumber", om.created_at AS "createdAt"
       FROM ojt_modules om WHERE om.training_id = ? ORDER BY om.order_number ASC`,
      [id]
    );
    const moduleIds = modules.map(m => m.id);
    let contents = [];
    if (moduleIds.length) {
      const [cRows] = await pool.query(
        `SELECT id, module_id AS "moduleId", type, url, description FROM ojt_module_contents WHERE module_id IN (${moduleIds.map(() => "?").join(",")}) ORDER BY id`,
        moduleIds
      );
      contents = cRows;
    }

    const [[test]] = await pool.query(
      `SELECT id, total_marks AS "totalMarks" FROM ojt_tests WHERE training_id = ? LIMIT 1`,
      [id]
    );
    let questions = [];
    if (test) {
      const [qRows] = await pool.query(
        `SELECT id, question, options, correct_answer AS "correctAnswer", marks FROM ojt_questions WHERE test_id = ? ORDER BY id`,
        [test.id]
      );
      questions = qRows.map(q => ({ ...q, options: safeParse(q.options) || [] }));
    }

    res.json({
      ...training,
      modules: modules.map(m => ({ ...m, contents: contents.filter(c => c.moduleId === m.id) })),
      test: test ? { ...test, questions } : null,
    });
  } catch (err) { next(err); }
});

/* POST /ojt/trainings – create training (admin only) */
router.post("/ojt/trainings", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { title, description, assetId, passingPercentage = 70,
            category = "general", estimatedDurationMinutes = 60,
            isSequential = false, maxAttempts = 3, trainerId } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: "title is required" });
    const [rows] = await pool.query(
      `INSERT INTO ojt_trainings
         (company_id, asset_id, title, description, passing_percentage, created_by,
          category, estimated_duration_minutes, is_sequential, max_attempts, trainer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, title, description, status, passing_percentage AS "passingPercentage",
                 category, estimated_duration_minutes AS "estimatedDurationMinutes",
                 is_sequential AS "isSequential", max_attempts AS "maxAttempts",
                 asset_id AS "assetId", trainer_id AS "trainerId", created_at AS "createdAt"`,
      [companyId, assetId || null, title.trim(), description || null, passingPercentage,
       req.companyUser.id, category, estimatedDurationMinutes, isSequential, maxAttempts, trainerId || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /ojt/trainings/:id – update training (admin only) */
router.put("/ojt/trainings/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Training not found" });
    const { title, description, assetId, passingPercentage,
            category, estimatedDurationMinutes, isSequential, maxAttempts, trainerId } = req.body;
    const [rows] = await pool.query(
      `UPDATE ojt_trainings SET
         title                     = COALESCE(?, title),
         description               = COALESCE(?, description),
         asset_id                  = COALESCE(?, asset_id),
         passing_percentage        = COALESCE(?, passing_percentage),
         category                  = COALESCE(?, category),
         estimated_duration_minutes= COALESCE(?, estimated_duration_minutes),
         is_sequential             = COALESCE(?, is_sequential),
         max_attempts              = COALESCE(?, max_attempts),
         trainer_id                = COALESCE(?, trainer_id),
         updated_at = NOW()
       WHERE id = ?
       RETURNING id, title, description, status,
                 passing_percentage AS "passingPercentage",
                 category, estimated_duration_minutes AS "estimatedDurationMinutes",
                 is_sequential AS "isSequential", max_attempts AS "maxAttempts",
                 asset_id AS "assetId", trainer_id AS "trainerId", updated_at AS "updatedAt"`,
      [title || null, description ?? null, assetId || null, passingPercentage || null,
       category || null, estimatedDurationMinutes || null,
       isSequential != null ? isSequential : null,
       maxAttempts || null, trainerId != null ? (trainerId || null) : null,
       id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* PATCH /ojt/trainings/:id/publish – toggle published/draft (admin only) */
router.patch("/ojt/trainings/:id/publish", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id, status FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Training not found" });
    const newStatus = check.status === "published" ? "draft" : "published";
    await pool.query("UPDATE ojt_trainings SET status = ?, updated_at = NOW() WHERE id = ?", [newStatus, id]);
    res.json({ success: true, status: newStatus });
  } catch (err) { next(err); }
});

/* DELETE /ojt/trainings/:id – delete training (admin only) */
router.delete("/ojt/trainings/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Training not found" });
    await pool.query("DELETE FROM ojt_trainings WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* POST /ojt/trainings/:id/modules – add module (admin only) */
router.post("/ojt/trainings/:id/modules", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query("SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!training) return res.status(404).json({ message: "Training not found" });
    const { title, description, orderNumber = 0 } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: "title is required" });
    const [rows] = await pool.query(
      `INSERT INTO ojt_modules (training_id, title, description, order_number)
       VALUES (?, ?, ?, ?)
       RETURNING id, title, description, order_number AS "orderNumber", created_at AS "createdAt"`,
      [id, title.trim(), description || null, orderNumber]
    );
    res.status(201).json({ ...rows[0], contents: [] });
  } catch (err) { next(err); }
});

/* PUT /ojt/modules/:moduleId – update module (admin only) */
router.put("/ojt/modules/:moduleId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { moduleId } = req.params;
    const { title, description, orderNumber } = req.body;
    const [[mod]] = await pool.query(
      `SELECT om.id FROM ojt_modules om
       JOIN ojt_trainings ot ON ot.id = om.training_id
       WHERE om.id = ? AND ot.company_id = ?`,
      [moduleId, cid(req)]
    );
    if (!mod) return res.status(404).json({ message: "Module not found" });
    const [rows] = await pool.query(
      `UPDATE ojt_modules SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         order_number = COALESCE(?, order_number)
       WHERE id = ?
       RETURNING id, title, description, order_number AS "orderNumber"`,
      [title || null, description ?? null, orderNumber ?? null, moduleId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /ojt/modules/:moduleId (admin only) */
router.delete("/ojt/modules/:moduleId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { moduleId } = req.params;
    const [[mod]] = await pool.query(
      `SELECT om.id FROM ojt_modules om
       JOIN ojt_trainings ot ON ot.id = om.training_id
       WHERE om.id = ? AND ot.company_id = ?`,
      [moduleId, cid(req)]
    );
    if (!mod) return res.status(404).json({ message: "Module not found" });
    await pool.query("DELETE FROM ojt_modules WHERE id = ?", [moduleId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* POST /ojt/modules/:moduleId/content – add content to module */
router.post("/ojt/modules/:moduleId/content", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { moduleId } = req.params;
    const [[mod]] = await pool.query(
      `SELECT om.id FROM ojt_modules om
       JOIN ojt_trainings ot ON ot.id = om.training_id
       WHERE om.id = ? AND ot.company_id = ?`,
      [moduleId, cid(req)]
    );
    if (!mod) return res.status(404).json({ message: "Module not found" });
    const { type = "text", url, description } = req.body;
    const [rows] = await pool.query(
      `INSERT INTO ojt_module_contents (module_id, type, url, description)
       VALUES (?, ?, ?, ?)
       RETURNING id, module_id AS "moduleId", type, url, description`,
      [moduleId, type, url || null, description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /ojt/contents/:contentId */
router.delete("/ojt/contents/:contentId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { contentId } = req.params;
    const [[c]] = await pool.query(
      `SELECT oc.id FROM ojt_module_contents oc
       JOIN ojt_modules om ON om.id = oc.module_id
       JOIN ojt_trainings ot ON ot.id = om.training_id
       WHERE oc.id = ? AND ot.company_id = ?`,
      [contentId, cid(req)]
    );
    if (!c) return res.status(404).json({ message: "Content not found" });
    await pool.query("DELETE FROM ojt_module_contents WHERE id = ?", [contentId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* POST /ojt/trainings/:id/test – create or replace test */
router.post("/ojt/trainings/:id/test", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query("SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!training) return res.status(404).json({ message: "Training not found" });
    const { totalMarks = 100 } = req.body;
    await pool.query("DELETE FROM ojt_tests WHERE training_id = ?", [id]);
    const [rows] = await pool.query(
      `INSERT INTO ojt_tests (training_id, total_marks) VALUES (?, ?) RETURNING id, total_marks AS "totalMarks"`,
      [id, totalMarks]
    );
    res.status(201).json({ ...rows[0], questions: [] });
  } catch (err) { next(err); }
});

/* POST /ojt/tests/:testId/questions – add question */
router.post("/ojt/tests/:testId/questions", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { testId } = req.params;
    const [[test]] = await pool.query(
      `SELECT ot2.id FROM ojt_tests ot2
       JOIN ojt_trainings ot ON ot.id = ot2.training_id
       WHERE ot2.id = ? AND ot.company_id = ?`,
      [testId, cid(req)]
    );
    if (!test) return res.status(404).json({ message: "Test not found" });
    const { question, options, correctAnswer, marks = 1 } = req.body;
    if (!question?.trim()) return res.status(400).json({ message: "question is required" });
    const [rows] = await pool.query(
      `INSERT INTO ojt_questions (test_id, question, options, correct_answer, marks)
       VALUES (?, ?, ?, ?, ?)
       RETURNING id, question, options, correct_answer AS "correctAnswer", marks`,
      [testId, question.trim(), options ? JSON.stringify(options) : null, correctAnswer || null, marks]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /ojt/questions/:questionId */
router.put("/ojt/questions/:questionId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { questionId } = req.params;
    const [[q]] = await pool.query(
      `SELECT oq.id FROM ojt_questions oq
       JOIN ojt_tests ot2 ON ot2.id = oq.test_id
       JOIN ojt_trainings ot ON ot.id = ot2.training_id
       WHERE oq.id = ? AND ot.company_id = ?`,
      [questionId, cid(req)]
    );
    if (!q) return res.status(404).json({ message: "Question not found" });
    const { question, options, correctAnswer, marks } = req.body;
    const [rows] = await pool.query(
      `UPDATE ojt_questions SET
         question = COALESCE(?, question),
         options = COALESCE(?, options),
         correct_answer = COALESCE(?, correct_answer),
         marks = COALESCE(?, marks)
       WHERE id = ?
       RETURNING id, question, options, correct_answer AS "correctAnswer", marks`,
      [question || null, options ? JSON.stringify(options) : null, correctAnswer || null, marks ?? null, questionId]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /ojt/questions/:questionId */
router.delete("/ojt/questions/:questionId", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const { questionId } = req.params;
    const [[q]] = await pool.query(
      `SELECT oq.id FROM ojt_questions oq
       JOIN ojt_tests ot2 ON ot2.id = oq.test_id
       JOIN ojt_trainings ot ON ot.id = ot2.training_id
       WHERE oq.id = ? AND ot.company_id = ?`,
      [questionId, cid(req)]
    );
    if (!q) return res.status(404).json({ message: "Question not found" });
    await pool.query("DELETE FROM ojt_questions WHERE id = ?", [questionId]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* GET /ojt/trainings/:id/users – user progress tracking (admin only) */
router.get("/ojt/trainings/:id/users", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query(
      `SELECT id, passing_percentage AS "passingPercentage", max_attempts AS "maxAttempts"
       FROM ojt_trainings WHERE id = ? AND company_id = ?`,
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });
    const [rows] = await pool.query(
      `SELECT cup.id, cup.company_user_id AS "companyUserId",
              cu.full_name AS "userName", cu.email, cu.role, cu.designation,
              cup.score, cup.status, cup.certificate_url AS "certificateUrl",
              cup.started_at AS "startedAt", cup.completed_at AS "completedAt",
              cup.completed_modules AS "completedModules",
              cup.attempt_number AS "attemptNumber",
              cup.due_date AS "dueDate",
              ab.full_name AS "assignedByName",
              cup.assigned_at AS "assignedAt",
              cup.trainer_sign_off_at AS "trainerSignOffAt",
              cup.trainer_sign_off_notes AS "trainerSignOffNotes"
       FROM ojt_user_progress cup
       JOIN company_users cu ON cu.id = cup.company_user_id
       LEFT JOIN company_users ab ON ab.id = cup.assigned_by
       WHERE cup.training_id = ?
       ORDER BY cup.updated_at DESC`,
      [id]
    );
    const [[{ totalModules }]] = await pool.query(
      `SELECT COUNT(*) AS totalModules FROM ojt_modules WHERE training_id = ?`,
      [id]
    );
    res.json({ users: rows, passingPercentage: training.passingPercentage, maxAttempts: Number(training.maxAttempts), totalModules: Number(totalModules) });
  } catch (err) { next(err); }
});

/* POST /ojt/trainings/:id/assign – admin assigns training to a user with optional due date */
router.post("/ojt/trainings/:id/assign", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const { userId, dueDate } = req.body;
    if (!userId) return res.status(400).json({ message: "userId is required" });
    const [[training]] = await pool.query(
      "SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ? AND status = 'published'",
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found or not published" });
    // Upsert: if already assigned/started just update due_date and assigned_by
    const [[existing]] = await pool.query(
      "SELECT id FROM ojt_user_progress WHERE training_id = ? AND company_user_id = ?",
      [id, userId]
    );
    if (existing) {
      await pool.query(
        `UPDATE ojt_user_progress SET due_date = ?, assigned_by = ?, assigned_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [dueDate || null, req.companyUser.id, existing.id]
      );
      return res.json({ success: true, message: "Assignment updated" });
    }
    const [rows] = await pool.query(
      `INSERT INTO ojt_user_progress
         (training_id, company_user_id, status, completed_modules, due_date, assigned_by, assigned_at)
       VALUES (?, ?, 'not_started', '[]', ?, ?, NOW())
       RETURNING id, status, due_date AS "dueDate", assigned_at AS "assignedAt"`,
      [id, userId, dueDate || null, req.companyUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* POST /ojt/progress/:id/trainer-signoff – trainer/supervisor signs off practical skills */
router.post("/ojt/progress/:id/trainer-signoff", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;
    const { notes } = req.body;
    const [[progress]] = await pool.query(
      `SELECT oup.id, oup.status FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       WHERE oup.id = ? AND ot.company_id = ?`,
      [id, companyId]
    );
    if (!progress) return res.status(404).json({ message: "Progress record not found" });
    await pool.query(
      `UPDATE ojt_user_progress
         SET trainer_sign_off_at = NOW(), trainer_sign_off_notes = ?, trainer_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [notes || null, req.companyUser.id, id]
    );
    res.json({ success: true, trainerSignOffAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

/* POST /ojt/progress/:id/certificate – grant certificate to user */
router.post("/ojt/progress/:id/certificate", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[progress]] = await pool.query(
      `SELECT oup.id, oup.training_id, oup.company_user_id, oup.score
       FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       WHERE oup.id = ? AND ot.company_id = ?`,
      [id, companyId]
    );
    if (!progress) return res.status(404).json({ message: "Progress not found" });
    const certUrl = `/ojt/certificate/progress-${id}`;
    await pool.query("UPDATE ojt_user_progress SET certificate_url = ? WHERE id = ?", [certUrl, id]);
    res.json({ id, certificateUrl: certUrl });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// FLEET MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/* GET /fleet/submissions – recent checklist + logsheet submissions for fleet assets */
router.get("/fleet/submissions", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [fleetAssets] = await pool.query(
      `SELECT id FROM assets WHERE company_id = ? AND asset_type = 'fleet'`,
      [companyId]
    );
    if (fleetAssets.length === 0) return res.json([]);
    const fleetIds = fleetAssets.map(a => a.id);
    const ph = fleetIds.map(() => "?").join(",");

    const [chkRows] = await pool.query(
      `SELECT cs.id, 'checklist' AS type, ct.template_name AS name,
              cu.full_name AS "submittedBy", a.asset_name AS "assetName",
              COALESCE(cs.submitted_at, cs.created_at) AS "submittedAt",
              cs.gps_lat AS lat, cs.gps_lng AS lng, cs.shift, cs.status,
              cs.completion_pct AS "completionPct"
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
       LEFT JOIN assets a ON a.id = cs.asset_id
       WHERE cs.asset_id IN (${ph}) AND ct.company_id = ?
       ORDER BY COALESCE(cs.submitted_at, cs.created_at) DESC
       LIMIT 100`,
      [...fleetIds, companyId]
    );

    const [lsRows] = await pool.query(
      `SELECT le.id, 'logsheet' AS type, lt.template_name AS name,
              cu.full_name AS "submittedBy", a.asset_name AS "assetName",
              le.submitted_at AS "submittedAt",
              NULL AS lat, NULL AS lng, le.shift, 'submitted' AS status,
              100 AS "completionPct"
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
       LEFT JOIN assets a ON a.id = le.asset_id
       WHERE le.asset_id IN (${ph}) AND lt.company_id = ?
       ORDER BY le.submitted_at DESC
       LIMIT 100`,
      [...fleetIds, companyId]
    );

    const combined = [...chkRows, ...lsRows]
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .slice(0, 100);
    res.json(combined);
  } catch (err) { next(err); }
});

/* GET /fleet/submissions/detail/:type/:id – full submission detail with answers */
router.get("/fleet/submissions/detail/:type/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { type, id } = req.params;

    if (type === "checklist") {
      const [[sub]] = await pool.query(
        `SELECT cs.id, ct.template_name AS name,
                cu.full_name AS "submittedBy",
                a.asset_name AS "assetName",
                cs.gps_lat AS lat, cs.gps_lng AS lng,
                cs.shift, cs.status,
                cs.completion_pct AS "completionPct",
                COALESCE(cs.submitted_at, cs.created_at) AS "submittedAt"
         FROM checklist_submissions cs
         LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
         LEFT JOIN company_users cu ON cu.id = COALESCE(cs.company_user_id, cs.submitted_by)
         LEFT JOIN assets a ON a.id = cs.asset_id
         WHERE cs.id = ? AND ct.company_id = ?`,
        [id, companyId]
      );
      if (!sub) return res.status(404).json({ message: "Submission not found" });

      let answers = [];
      try {
        const [rows] = await pool.query(
          `SELECT question_text AS question, input_type AS "inputType",
                  answer_json AS "answerJson", option_selected AS answer
           FROM checklist_submission_answers WHERE submission_id = ? ORDER BY id`,
          [id]
        );
        answers = rows.map(a => ({
          question: a.question,
          type: a.inputType || a.input_type,
          answer: a.answer ||
            (a.answerJson  ? (typeof a.answerJson  === "object" ? JSON.stringify(a.answerJson)  : a.answerJson)  :
             a.answer_json ? (typeof a.answer_json === "object" ? JSON.stringify(a.answer_json) : a.answer_json) : "—")
        }));
      } catch (_) { /* answers table may be empty */ }

      return res.json({ ...sub, type: "checklist", answers });
    } else if (type === "logsheet") {
      const [[entry]] = await pool.query(
        `SELECT le.id, lt.template_name AS name,
                cu.full_name AS "submittedBy",
                a.asset_name AS "assetName",
                le.shift, le.entry_date AS "entryDate",
                le.submitted_at AS "submittedAt", le.data
         FROM logsheet_entries le
         LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
         LEFT JOIN company_users cu ON cu.id = COALESCE(le.company_user_id, le.submitted_by)
         LEFT JOIN assets a ON a.id = le.asset_id
         WHERE le.id = ? AND lt.company_id = ?`,
        [id, companyId]
      );
      if (!entry) return res.status(404).json({ message: "Entry not found" });

      const rawData = entry.data
        ? (typeof entry.data === "string" ? JSON.parse(entry.data) : entry.data)
        : {};
      const answers = Object.entries(rawData).map(([k, v]) => ({
        question: k, type: "text",
        answer: v != null ? String(v) : "—"
      }));
      const { data: _omit, ...entryClean } = entry;
      return res.json({ ...entryClean, type: "logsheet", lat: null, lng: null, answers });
    }
    return res.status(400).json({ message: "Invalid type" });
  } catch (err) { next(err); }
});

/* GET /fleet/submissions/export-csv – export fleet submissions as CSV */
router.get("/fleet/submissions/export-csv", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [fleetAssets] = await pool.query(
      `SELECT id FROM assets WHERE company_id = ? AND asset_type = 'fleet'`,
      [companyId]
    );
    if (fleetAssets.length === 0) {
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="fleet-submissions.csv"`);
      return res.send("Type,Template,Asset,Submitted By,Date,Status,Location\n");
    }
    const fleetIds = fleetAssets.map(a => a.id);
    const ph = fleetIds.map(() => "?").join(",");

    const [chkRows] = await pool.query(
      `SELECT 'checklist' AS type, ct.template_name AS name,
              a.asset_name AS asset, cu.full_name AS submittedBy,
              COALESCE(cs.submitted_at, cs.created_at) AS submittedAt,
              cs.status, cs.gps_lat AS lat, cs.gps_lng AS lng
       FROM checklist_submissions cs
       LEFT JOIN checklist_templates ct ON ct.id = cs.template_id
       LEFT JOIN company_users cu ON cu.id = cs.company_user_id
       LEFT JOIN assets a ON a.id = cs.asset_id
       WHERE cs.asset_id IN (${ph}) AND ct.company_id = ?
       ORDER BY COALESCE(cs.submitted_at, cs.created_at) DESC`,
      [...fleetIds, companyId]
    );

    const [lsRows] = await pool.query(
      `SELECT 'logsheet' AS type, lt.template_name AS name,
              a.asset_name AS asset, cu.full_name AS submittedBy,
              le.submitted_at AS submittedAt, 'submitted' AS status,
              NULL AS lat, NULL AS lng
       FROM logsheet_entries le
       LEFT JOIN logsheet_templates lt ON lt.id = le.template_id
       LEFT JOIN company_users cu ON cu.id = le.company_user_id
       LEFT JOIN assets a ON a.id = le.asset_id
       WHERE le.asset_id IN (${ph}) AND lt.company_id = ?
       ORDER BY le.submitted_at DESC`,
      [...fleetIds, companyId]
    );

    const rows = [...chkRows, ...lsRows].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = "Type,Template,Asset,Submitted By,Date & Time,Status,GPS Location\n";
    const body = rows.map(r => [
      esc(r.type),
      esc(r.name),
      esc(r.asset),
      esc(r.submittedBy),
      esc(r.submittedAt ? new Date(r.submittedAt).toLocaleString() : ""),
      esc(r.status),
      esc(r.lat && r.lng ? `${r.lat}, ${r.lng}` : ""),
    ].join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="fleet-submissions.csv"`);
    res.send(header + body);
  } catch (err) { next(err); }
});

/* GET /fleet/assets – fleet assets for this company */
router.get("/fleet/assets", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              d.name AS "departmentName", ad.metadata
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.company_id = ? AND a.asset_type = 'fleet'
       ORDER BY a.asset_name`,
      [companyId]
    );
    const normalized = rows.map(r => {
      const meta = r.metadata == null ? {} : (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata);
      return { ...r, metadata: meta };
    });
    res.json(normalized);
  } catch (err) { next(err); }
});

/* GET /fleet/assets/:id – detailed view with related data */
router.get("/fleet/assets/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;

    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status, a.building, a.floor, a.room,
              d.name AS "departmentName", ad.metadata, a.created_at AS "createdAt"
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ? AND a.company_id = ? AND a.asset_type = 'fleet'`,
      [id, companyId]
    );

    if (!asset) return res.status(404).json({ message: "Fleet asset not found" });
    const dt = { ...asset, metadata: asset.metadata == null ? {} : (typeof asset.metadata === "string" ? JSON.parse(asset.metadata) : asset.metadata) };

    const [inspections] = await pool.query(
      `SELECT fi.id, fi.inspection_date AS "inspectionDate", fi.status, fi.notes,
              cu.full_name AS "inspectedByName", fi.created_at AS "createdAt"
       FROM fleet_inspections fi
       LEFT JOIN company_users cu ON cu.id = fi.inspected_by
       WHERE fi.asset_id = ? AND fi.company_id = ?
       ORDER BY fi.inspection_date DESC`,
      [id, companyId]
    );

    const [fuelLogs] = await pool.query(
      `SELECT fl.id, fl.fuel_amount AS "fuelAmount", fl.cost, fl.odometer, fl.fuel_type AS "fuelType",
              fl.log_date AS "logDate", fl.notes, cu.full_name AS "addedByName", fl.created_at AS "createdAt"
       FROM fleet_fuel_logs fl
       LEFT JOIN company_users cu ON cu.id = fl.added_by
       WHERE fl.asset_id = ? AND fl.company_id = ?
       ORDER BY fl.log_date DESC`,
      [id, companyId]
    );

    const [maintenance] = await pool.query(
      `SELECT fm.id, fm.issue_title AS "issueTitle", fm.priority, fm.status, fm.cost,
              fm.scheduled_date AS "scheduledDate", fm.completed_date AS "completedDate",
              cu.full_name AS "assignedToName", fm.created_at AS "createdAt"
       FROM fleet_maintenance fm
       LEFT JOIN company_users cu ON cu.id = fm.assigned_to
       WHERE fm.asset_id = ? AND fm.company_id = ?
       ORDER BY fm.created_at DESC`,
      [id, companyId]
    );

    const [assignments] = await pool.query(
      `SELECT tua.id, tua.template_type AS "templateType", tua.template_id AS "templateId",
              COALESCE(ct.template_name, lt.template_name) AS "templateName",
              tua.created_at AS "createdAt", cu.full_name AS "assignedToName"
       FROM template_user_assignments tua
       LEFT JOIN checklist_templates ct ON ct.id = tua.template_id AND tua.template_type = 'checklist'
       LEFT JOIN logsheet_templates lt ON lt.id = tua.template_id AND tua.template_type = 'logsheet'
       LEFT JOIN company_users cu ON cu.id = tua.assigned_to
       WHERE tua.company_id = ? AND (
         (tua.template_type = 'checklist' AND ct.asset_id = ?) OR
         (tua.template_type = 'logsheet' AND lt.asset_id = ?)
       )`,
      [companyId, id, id]
    );

    res.json({
      ...dt,
      inspections,
      fuelLogs,
      maintenance,
      assignments,
      stats: {
        totalFuel: fuelLogs.reduce((sum, l) => sum + (parseFloat(l.fuelAmount) || 0), 0),
        totalFuelCost: fuelLogs.reduce((sum, l) => sum + (parseFloat(l.cost) || 0), 0),
        totalMaintenanceCost: maintenance.reduce((sum, m) => sum + (parseFloat(m.cost) || 0), 0),
        openIssues: maintenance.filter(m => m.status !== "completed" && m.status !== "closed").length
      }
    });
  } catch (err) { next(err); }
});

/* GET /fleet/inspections/:assetId – inspections for an asset */
router.get("/fleet/inspections/:assetId", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { assetId } = req.params;
    const [rows] = await pool.query(
      `SELECT fi.id, fi.asset_id AS "assetId", fi.inspection_date AS "inspectionDate",
              fi.checklist_items AS "checklistItems", fi.status, fi.notes,
              fi.inspected_by AS "inspectedBy", cu.full_name AS "inspectedByName",
              fi.created_at AS "createdAt"
       FROM fleet_inspections fi
       LEFT JOIN company_users cu ON cu.id = fi.inspected_by
       WHERE fi.company_id = ? AND fi.asset_id = ?
       ORDER BY fi.inspection_date DESC`,
      [companyId, assetId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /fleet/inspections – all inspections for company */
router.get("/fleet/inspections", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT fi.id, fi.asset_id AS "assetId", a.asset_name AS "assetName",
              fi.inspection_date AS "inspectionDate", fi.checklist_items AS "checklistItems",
              fi.status, fi.notes, fi.inspected_by AS "inspectedBy",
              cu.full_name AS "inspectedByName", fi.created_at AS "createdAt"
       FROM fleet_inspections fi
       JOIN assets a ON a.id = fi.asset_id
       LEFT JOIN company_users cu ON cu.id = fi.inspected_by
       WHERE fi.company_id = ?
       ORDER BY fi.inspection_date DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* POST /fleet/inspections */
router.post("/fleet/inspections", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { assetId, inspectionDate, checklistItems = [], status = "pending", notes } = req.body;
    if (!assetId) return res.status(400).json({ message: "assetId is required" });
    const [[asset]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ? AND asset_type = 'fleet'", [assetId, companyId]);
    if (!asset) return res.status(404).json({ message: "Fleet asset not found" });
    const [rows] = await pool.query(
      `INSERT INTO fleet_inspections (company_id, asset_id, inspection_date, checklist_items, status, notes, inspected_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING id, asset_id AS "assetId", inspection_date AS "inspectionDate",
                 checklist_items AS "checklistItems", status, notes, created_at AS "createdAt"`,
      [companyId, assetId, inspectionDate || null, JSON.stringify(checklistItems), status, notes || null, req.companyUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /fleet/inspections/:id */
router.put("/fleet/inspections/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_inspections WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Inspection not found" });
    const { inspectionDate, checklistItems, status, notes } = req.body;
    const [rows] = await pool.query(
      `UPDATE fleet_inspections SET
         inspection_date = COALESCE(?, inspection_date),
         checklist_items = COALESCE(?, checklist_items),
         status = COALESCE(?, status),
         notes = COALESCE(?, notes),
         updated_at = NOW()
       WHERE id = ?
       RETURNING id, asset_id AS "assetId", inspection_date AS "inspectionDate",
                 checklist_items AS "checklistItems", status, notes, updated_at AS "updatedAt"`,
      [inspectionDate || null, checklistItems ? JSON.stringify(checklistItems) : null, status || null, notes ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /fleet/inspections/:id */
router.delete("/fleet/inspections/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_inspections WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Inspection not found" });
    await pool.query("DELETE FROM fleet_inspections WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* GET /fleet/fuel – all fuel logs for company */
router.get("/fleet/fuel", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { assetId } = req.query;
    const params = [companyId];
    let where = "fl.company_id = ?";
    if (assetId) { where += " AND fl.asset_id = ?"; params.push(assetId); }
    const [rows] = await pool.query(
      `SELECT fl.id, fl.asset_id AS "assetId", a.asset_name AS "assetName",
              fl.fuel_amount AS "fuelAmount", fl.cost, fl.odometer, fl.fuel_type AS "fuelType",
              fl.log_date AS "logDate", fl.notes,
              fl.added_by AS "addedBy", cu.full_name AS "addedByName",
              fl.created_at AS "createdAt"
       FROM fleet_fuel_logs fl
       JOIN assets a ON a.id = fl.asset_id
       LEFT JOIN company_users cu ON cu.id = fl.added_by
       WHERE ${where}
       ORDER BY fl.log_date DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* POST /fleet/fuel */
router.post("/fleet/fuel", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { assetId, fuelAmount, cost, odometer, fuelType, logDate, notes } = req.body;
    if (!assetId) return res.status(400).json({ message: "assetId is required" });
    const [[asset]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ? AND asset_type = 'fleet'", [assetId, companyId]);
    if (!asset) return res.status(404).json({ message: "Fleet asset not found" });
    const [rows] = await pool.query(
      `INSERT INTO fleet_fuel_logs (company_id, asset_id, fuel_amount, cost, odometer, fuel_type, log_date, notes, added_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, asset_id AS "assetId", fuel_amount AS "fuelAmount", cost, odometer,
                 fuel_type AS "fuelType", log_date AS "logDate", notes, created_at AS "createdAt"`,
      [companyId, assetId, fuelAmount || null, cost || null, odometer || null, fuelType || null, logDate || null, notes || null, req.companyUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /fleet/fuel/:id */
router.put("/fleet/fuel/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_fuel_logs WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Fuel log not found" });
    const { fuelAmount, cost, odometer, fuelType, logDate, notes } = req.body;
    const [rows] = await pool.query(
      `UPDATE fleet_fuel_logs SET
         fuel_amount = COALESCE(?, fuel_amount), cost = COALESCE(?, cost),
         odometer = COALESCE(?, odometer), fuel_type = COALESCE(?, fuel_type),
         log_date = COALESCE(?, log_date), notes = COALESCE(?, notes)
       WHERE id = ?
       RETURNING id, asset_id AS "assetId", fuel_amount AS "fuelAmount", cost, odometer,
                 fuel_type AS "fuelType", log_date AS "logDate", notes`,
      [fuelAmount || null, cost || null, odometer || null, fuelType || null, logDate || null, notes ?? null, id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* DELETE /fleet/fuel/:id */
router.delete("/fleet/fuel/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_fuel_logs WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Fuel log not found" });
    await pool.query("DELETE FROM fleet_fuel_logs WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* GET /fleet/maintenance – all maintenance records */
router.get("/fleet/maintenance", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { assetId, status } = req.query;
    const params = [companyId];
    let where = "fm.company_id = ?";
    if (assetId) { where += " AND fm.asset_id = ?"; params.push(assetId); }
    if (status) { where += " AND fm.status = ?"; params.push(status); }
    const [rows] = await pool.query(
      `SELECT fm.id, fm.asset_id AS "assetId", a.asset_name AS "assetName",
              fm.issue_title AS "issueTitle", fm.description, fm.priority, fm.status,
              fm.assigned_to AS "assignedTo", cu.full_name AS "assignedToName",
              fm.scheduled_date AS "scheduledDate", fm.completed_date AS "completedDate",
              fm.cost, fm.created_at AS "createdAt", fm.updated_at AS "updatedAt"
       FROM fleet_maintenance fm
       JOIN assets a ON a.id = fm.asset_id
       LEFT JOIN company_users cu ON cu.id = fm.assigned_to
       WHERE ${where}
       ORDER BY fm.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* POST /fleet/maintenance */
router.post("/fleet/maintenance", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { assetId, issueTitle, description, priority = "medium", assignedTo, scheduledDate, cost } = req.body;
    if (!assetId || !issueTitle?.trim()) return res.status(400).json({ message: "assetId and issueTitle are required" });
    const [[asset]] = await pool.query("SELECT id FROM assets WHERE id = ? AND company_id = ? AND asset_type = 'fleet'", [assetId, companyId]);
    if (!asset) return res.status(404).json({ message: "Fleet asset not found" });
    const [rows] = await pool.query(
      `INSERT INTO fleet_maintenance (company_id, asset_id, issue_title, description, priority, assigned_to, scheduled_date, cost, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING id, asset_id AS "assetId", issue_title AS "issueTitle", description, priority, status,
                 assigned_to AS "assignedTo", scheduled_date AS "scheduledDate", cost, created_at AS "createdAt"`,
      [companyId, assetId, issueTitle.trim(), description || null, priority, assignedTo || null, scheduledDate || null, cost || null, req.companyUser.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* PUT /fleet/maintenance/:id */
router.put("/fleet/maintenance/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_maintenance WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Maintenance record not found" });
    const { issueTitle, description, priority, status, assignedTo, scheduledDate, completedDate, cost } = req.body;
    const [rows] = await pool.query(
      `UPDATE fleet_maintenance SET
         issue_title = COALESCE(?, issue_title),
         description = COALESCE(?, description),
         priority = COALESCE(?, priority),
         status = COALESCE(?, status),
         assigned_to = COALESCE(?, assigned_to),
         scheduled_date = COALESCE(?, scheduled_date),
         completed_date = COALESCE(?, completed_date),
         cost = COALESCE(?, cost),
         updated_at = NOW()
       WHERE id = ?
       RETURNING id, asset_id AS "assetId", issue_title AS "issueTitle", description, priority, status,
                 assigned_to AS "assignedTo", scheduled_date AS "scheduledDate",
                 completed_date AS "completedDate", cost, updated_at AS "updatedAt"`,
      [issueTitle || null, description ?? null, priority || null, status || null, assignedTo || null, scheduledDate || null, completedDate || null, cost || null, id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* PATCH /fleet/maintenance/:id/status */
router.patch("/fleet/maintenance/:id/status", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const { status } = req.body;
    const VALID = ["open", "in_progress", "completed", "closed"];
    if (!VALID.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const [[check]] = await pool.query("SELECT id FROM fleet_maintenance WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Maintenance record not found" });
    const completedDate = (status === "completed" || status === "closed") ? new Date().toISOString().split("T")[0] : null;
    await pool.query(
      "UPDATE fleet_maintenance SET status = ?, completed_date = COALESCE(?, completed_date), updated_at = NOW() WHERE id = ?",
      [status, completedDate, id]
    );
    res.json({ success: true, status });
  } catch (err) { next(err); }
});

/* DELETE /fleet/maintenance/:id */
router.delete("/fleet/maintenance/:id", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { id } = req.params;
    const [[check]] = await pool.query("SELECT id FROM fleet_maintenance WHERE id = ? AND company_id = ?", [id, companyId]);
    if (!check) return res.status(404).json({ message: "Maintenance record not found" });
    await pool.query("DELETE FROM fleet_maintenance WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* POST /upload-image – upload a reference image for checklist questions (admin only) */
router.post("/upload-image", (req, res, next) => {
  uploadImage.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message || "File too large" });
    } else if (err) {
      return res.status(400).json({ message: err.message || "Only image files are allowed" });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
  } catch (err) { next(err); }
});

/* POST /upload-query-image – upload an image attachment for a query/issue report */
const queryImageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, queryImagesDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    cb(null, `query_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const uploadQueryImage = multer({
  storage: queryImageStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});
router.post("/upload-query-image", (req, res, next) => {
  uploadQueryImage.single("image")(req, res, (err) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ message: err.message });
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image provided" });
    const url = `/uploads/query-images/${req.file.filename}`;
    res.json({ url });
  } catch (err) { next(err); }
});

/* POST /upload-logo – upload company client logo (admin only) */
router.post("/upload-logo", (req, res, next) => {
  uploadLogo.single("logo")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message || "File too large" });
    } else if (err) {
      return res.status(400).json({ message: err.message || "Only image files are allowed" });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const ext = path.extname(req.file.originalname).toLowerCase() || ".png";
    const url = `/uploads/logos/company-${req.companyUser.companyId}${ext}`;
    await pool.query("UPDATE companies SET logo_url = ? WHERE id = ?", [url, req.companyUser.companyId]);
    res.json({ url });
  } catch (err) { next(err); }
});

/* DELETE /logo – remove company client logo (admin only) */
router.delete("/logo", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const [[row]] = await pool.query("SELECT logo_url AS logoUrl FROM companies WHERE id = ?", [req.companyUser.companyId]);
    const logoUrl = row?.logoUrl || null;
    await pool.query("UPDATE companies SET logo_url = NULL WHERE id = ?", [req.companyUser.companyId]);

    if (logoUrl && String(logoUrl).startsWith("/uploads/logos/")) {
      const filename = path.basename(String(logoUrl));
      const absPath = path.join(logosDir, filename);
      try { if (fs.existsSync(absPath)) fs.unlinkSync(absPath); } catch {}
    }

    res.json({ message: "Logo removed" });
  } catch (err) { next(err); }
});

/* PATCH /me/qr-label – save admin-typed client label shown on QR cards */
router.patch("/me/qr-label", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const label = String(req.body.label || "").trim().substring(0, 120);
    await pool.query("UPDATE companies SET qr_card_label = ? WHERE id = ?", [label || null, req.companyUser.companyId]);
    res.json({ qrCardLabel: label });
  } catch (err) { next(err); }
});

/* POST /ojt/upload – upload a video or document file (admin only) */
router.post("/ojt/upload", (req, res, next) => {
  uploadOjt.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message || "File too large" });
    } else if (err) {
      return res.status(400).json({ message: err.message || "File type not allowed" });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    if (!req.file) return res.status(400).json({ message: "No file provided" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url, filename: req.file.filename, size: req.file.size, mimetype: req.file.mimetype });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// OJT MOBILE ENDPOINTS (accessible to technicians via company JWT)
// ─────────────────────────────────────────────────────────────────────────────

/* GET /ojt/mobile/trainings – published trainings for this company */
router.get("/ojt/mobile/trainings", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const [trainings] = await pool.query(
      `SELECT ot.id, ot.title, ot.description, ot.passing_percentage AS "passingPercentage",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.is_sequential AS "isSequential", ot.max_attempts AS "maxAttempts",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              (SELECT COUNT(*) FROM ojt_modules WHERE training_id = ot.id) AS "moduleCount",
              (SELECT COUNT(*) FROM ojt_tests WHERE training_id = ot.id) AS "hasTest"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
       WHERE ot.company_id = ? AND ot.status = 'published'
       ORDER BY ot.created_at DESC`,
      [companyId]
    );
    const [progress] = await pool.query(
      `SELECT training_id AS "trainingId", status, score, certificate_url AS "certificateUrl",
              completed_modules AS "completedModules", started_at AS "startedAt", completed_at AS "completedAt",
              due_date AS "dueDate", attempt_number AS "attemptNumber", assigned_by IS NOT NULL AS "isAssigned"
       FROM ojt_user_progress
       WHERE company_user_id = ? AND training_id IN (${trainings.length ? trainings.map(() => "?").join(",") : "NULL"})`,
      [userId, ...trainings.map(t => t.id)]
    );
    const progressMap = {};
    progress.forEach(p => { progressMap[p.trainingId] = p; });
    res.json(trainings.map(t => ({ ...t, myProgress: progressMap[t.id] || null })));
  } catch (err) { next(err); }
});

/* GET /ojt/mobile/trainings/:id – training detail with modules, contents, test */
router.get("/ojt/mobile/trainings/:id", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { id } = req.params;
    const [[training]] = await pool.query(
      `SELECT ot.id, ot.title, ot.description, ot.status, ot.passing_percentage AS "passingPercentage",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.is_sequential AS "isSequential", ot.max_attempts AS "maxAttempts",
              ot.asset_id AS "assetId", a.asset_name AS "assetName"
       FROM ojt_trainings ot
       LEFT JOIN assets a ON a.id = ot.asset_id
       WHERE ot.id = ? AND ot.company_id = ? AND ot.status = 'published'`,
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found or not published" });

    const [modules] = await pool.query(
      `SELECT id, title, description, order_number AS "orderNumber" FROM ojt_modules WHERE training_id = ? ORDER BY order_number ASC`,
      [id]
    );
    const moduleIds = modules.map(m => m.id);
    let contents = [];
    if (moduleIds.length) {
      const [cRows] = await pool.query(
        `SELECT id, module_id AS "moduleId", type, url, description FROM ojt_module_contents WHERE module_id IN (${moduleIds.map(() => "?").join(",")}) ORDER BY id`,
        moduleIds
      );
      contents = cRows;
    }

    const [[test]] = await pool.query(
      `SELECT id, total_marks AS "totalMarks" FROM ojt_tests WHERE training_id = ? LIMIT 1`, [id]
    );
    let questions = [];
    if (test) {
      const [qRows] = await pool.query(
        `SELECT id, question, options, marks FROM ojt_questions WHERE test_id = ? ORDER BY id`,
        [test.id]
      );
      questions = qRows.map(q => ({ ...q, options: safeParse(q.options) || [] }));
    }

    const userId = req.companyUser.id;
    const [[myProgress]] = await pool.query(
      `SELECT id, status, score, certificate_url AS "certificateUrl",
              completed_modules AS "completedModules", started_at AS "startedAt", completed_at AS "completedAt",
              due_date AS "dueDate", attempt_number AS "attemptNumber",
              trainer_sign_off_at AS "trainerSignOffAt", trainer_sign_off_notes AS "trainerSignOffNotes"
       FROM ojt_user_progress WHERE training_id = ? AND company_user_id = ?`,
      [id, userId]
    );

    res.json({
      ...training,
      modules: modules.map(m => ({ ...m, contents: contents.filter(c => c.moduleId === m.id) })),
      test: test ? { ...test, questions } : null,
      myProgress: myProgress || null,
    });
  } catch (err) { next(err); }
});

/* POST /ojt/mobile/trainings/:id/start – start training */
router.post("/ojt/mobile/trainings/:id/start", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { id } = req.params;
    const [[training]] = await pool.query(
      "SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ? AND status = 'published'",
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });
    const [[existing]] = await pool.query(
      "SELECT id, status FROM ojt_user_progress WHERE training_id = ? AND company_user_id = ?",
      [id, userId]
    );
    if (existing) {
      // Already has a record — just activate if it was a not_started assignment
      if (existing.status === "not_started") {
        await pool.query(
          "UPDATE ojt_user_progress SET status = 'in_progress', started_at = NOW(), updated_at = NOW() WHERE id = ?",
          [existing.id]
        );
      }
      return res.json({ id: existing.id, message: "Already started" });
    }
    const [rows] = await pool.query(
      `INSERT INTO ojt_user_progress (training_id, company_user_id, status, completed_modules, started_at)
       VALUES (?, ?, 'in_progress', '[]', NOW())
       RETURNING id, status, started_at AS "startedAt"`,
      [id, userId]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* POST /ojt/mobile/trainings/:id/complete-module – mark module as completed */
router.post("/ojt/mobile/trainings/:id/complete-module", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { id } = req.params;
    const { moduleId } = req.body;
    if (!moduleId) return res.status(400).json({ message: "moduleId is required" });

    const [[progress]] = await pool.query(
      `SELECT oup.id, oup.completed_modules AS "completedModules"
       FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       WHERE oup.training_id = ? AND oup.company_user_id = ? AND ot.company_id = ?`,
      [id, userId, companyId]
    );
    if (!progress) return res.status(404).json({ message: "Progress record not found. Start training first." });

    const completed = Array.isArray(progress.completedModules)
      ? progress.completedModules
      : (typeof progress.completedModules === "string" ? JSON.parse(progress.completedModules) : []);
    if (!completed.includes(Number(moduleId))) completed.push(Number(moduleId));

    await pool.query(
      "UPDATE ojt_user_progress SET completed_modules = ?, updated_at = NOW() WHERE id = ?",
      [JSON.stringify(completed), progress.id]
    );
    res.json({ completedModules: completed });
  } catch (err) { next(err); }
});

/* POST /ojt/mobile/trainings/:id/submit-test – submit test answers, calculate score, track attempts */
router.post("/ojt/mobile/trainings/:id/submit-test", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { id } = req.params;
    const { answers = {} } = req.body;

    const [[training]] = await pool.query(
      `SELECT id, passing_percentage AS pp, max_attempts AS ma FROM ojt_trainings
       WHERE id = ? AND company_id = ?`,
      [id, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });

    // Check attempt limit
    const [[progressRec]] = await pool.query(
      `SELECT id, attempt_number AS an, status FROM ojt_user_progress
       WHERE training_id = ? AND company_user_id = ?`,
      [id, userId]
    );
    if (!progressRec) return res.status(400).json({ message: "Start the training first" });
    const maxAttempts = Number(training.ma) || 3;
    const currentAttempt = Number(progressRec.an) || 1;
    if (progressRec.status === "completed") {
      return res.status(400).json({ message: "Training already completed" });
    }
    if (progressRec.status === "failed" && currentAttempt >= maxAttempts) {
      return res.status(400).json({ message: `Maximum attempts (${maxAttempts}) reached`, attemptsExhausted: true });
    }

    const [[test]] = await pool.query("SELECT id, total_marks AS tm FROM ojt_tests WHERE training_id = ?", [id]);
    if (!test) return res.status(400).json({ message: "No test found for this training" });

    const [questions] = await pool.query(
      "SELECT id, correct_answer AS ca, marks FROM ojt_questions WHERE test_id = ?",
      [test.id]
    );

    let earned = 0;
    const totalMarks = questions.reduce((s, q) => s + Number(q.marks || 1), 0);
    questions.forEach(q => {
      const userAnswer = (answers[q.id] || "").trim().toLowerCase();
      const correct = (q.ca || "").trim().toLowerCase();
      if (userAnswer === correct) earned += Number(q.marks || 1);
    });

    const passingPct = Number(training.pp) || 70;
    const scorePct = totalMarks > 0 ? Math.round((earned / totalMarks) * 100) : 0;
    const passed = scorePct >= passingPct;
    const newStatus = passed ? "completed" : "failed";
    const nextAttemptNumber = progressRec.status === "failed" ? currentAttempt + 1 : currentAttempt;

    // Record this attempt in history
    await pool.query(
      `INSERT INTO ojt_test_attempts (progress_id, training_id, company_user_id, attempt_number, score, earned_marks, total_marks, passed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [progressRec.id, id, userId, currentAttempt, scorePct, earned, totalMarks, passed]
    );

    await pool.query(
      `UPDATE ojt_user_progress
         SET status = ?, score = ?, completed_at = ?, attempt_number = ?, updated_at = NOW()
       WHERE id = ?`,
      [newStatus, scorePct, passed ? new Date().toISOString() : null, nextAttemptNumber, progressRec.id]
    );

    const attemptsRemaining = passed ? 0 : Math.max(0, maxAttempts - nextAttemptNumber);
    res.json({ score: scorePct, earned, totalMarks, passed, passingPct, status: newStatus,
               attemptNumber: currentAttempt, attemptsRemaining, maxAttempts });
  } catch (err) { next(err); }
});

/* GET /ojt/mobile/my-progress – all progress for the logged-in user */
router.get("/ojt/mobile/my-progress", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const [rows] = await pool.query(
      `SELECT oup.id, oup.training_id AS "trainingId", ot.title AS "trainingTitle",
              ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              oup.status, oup.score, oup.certificate_url AS "certificateUrl",
              oup.completed_modules AS "completedModules", oup.started_at AS "startedAt",
              oup.completed_at AS "completedAt", oup.due_date AS "dueDate",
              oup.attempt_number AS "attemptNumber", ot.max_attempts AS "maxAttempts",
              oup.trainer_sign_off_at AS "trainerSignOffAt",
              (SELECT COUNT(*) FROM ojt_modules WHERE training_id = ot.id) AS "totalModules"
       FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       WHERE oup.company_user_id = ? AND ot.company_id = ?
       ORDER BY oup.updated_at DESC`,
      [userId, companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /ojt/mobile/my-assignments – assigned trainings not yet started */
router.get("/ojt/mobile/my-assignments", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const [rows] = await pool.query(
      `SELECT oup.id, oup.training_id AS "trainingId", ot.title AS "trainingTitle",
              ot.description, ot.category, ot.estimated_duration_minutes AS "estimatedDurationMinutes",
              ot.passing_percentage AS "passingPercentage",
              ot.asset_id AS "assetId", a.asset_name AS "assetName",
              oup.status, oup.due_date AS "dueDate", oup.assigned_at AS "assignedAt",
              ab.full_name AS "assignedByName",
              (SELECT COUNT(*) FROM ojt_modules WHERE training_id = ot.id) AS "moduleCount",
              (SELECT COUNT(*) FROM ojt_tests WHERE training_id = ot.id) AS "hasTest"
       FROM ojt_user_progress oup
       JOIN ojt_trainings ot ON ot.id = oup.training_id
       LEFT JOIN assets a ON a.id = ot.asset_id
       LEFT JOIN company_users ab ON ab.id = oup.assigned_by
       WHERE oup.company_user_id = ? AND ot.company_id = ? AND oup.assigned_by IS NOT NULL
       ORDER BY oup.due_date ASC NULLS LAST, oup.assigned_at DESC`,
      [userId, companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* GET /ojt/mobile/test-attempts/:trainingId – attempt history for the logged-in user */
router.get("/ojt/mobile/test-attempts/:trainingId", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const userId = req.companyUser.id;
    const { trainingId } = req.params;
    const [[training]] = await pool.query(
      "SELECT id FROM ojt_trainings WHERE id = ? AND company_id = ?",
      [trainingId, companyId]
    );
    if (!training) return res.status(404).json({ message: "Training not found" });
    const [rows] = await pool.query(
      `SELECT id, attempt_number AS "attemptNumber", score, earned_marks AS "earnedMarks",
              total_marks AS "totalMarks", passed, submitted_at AS "submittedAt"
       FROM ojt_test_attempts
       WHERE training_id = ? AND company_user_id = ?
       ORDER BY attempt_number ASC`,
      [trainingId, userId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── Pre-generated QR Codes ───────────────────────────────────────────────────
 * Flow: Admin generates N QR codes → prints → pastes on machines.
 * Mobile user scans → if unlinked: register/link asset; if linked: view details & log query.
 */

// ── Location helpers for mobile app (company JWT) ────────────────────────────
// GET /locations/buildings  – buildings for the authenticated user's company
router.get("/locations/buildings", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const [rows] = await pool.query(
      `SELECT id, building_code AS buildingCode, building_name AS buildingName, description, status
       FROM buildings WHERE company_id = ? AND status != 'Deleted' ORDER BY building_name`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /locations/floors  – floors for a given building
router.get("/locations/floors", async (req, res, next) => {
  try {
    const { buildingId } = req.query;
    if (!buildingId) return res.status(400).json({ message: "buildingId required" });
    const [rows] = await pool.query(
      `SELECT f.id, f.floor_code AS floorCode, f.floor_name AS floorName, f.floor_number AS floorNumber
       FROM floors f
       JOIN buildings b ON b.id = f.building_id
       WHERE f.building_id = ? AND b.company_id = ? AND f.status != 'Deleted'
       ORDER BY f.floor_number, f.floor_name`,
      [buildingId, cid(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /locations/rooms  – rooms for a given floor
router.get("/locations/rooms", async (req, res, next) => {
  try {
    const { floorId } = req.query;
    if (!floorId) return res.status(400).json({ message: "floorId required" });
    const [rows] = await pool.query(
      `SELECT r.id, r.room_code AS roomCode, r.room_name AS roomName, r.room_type AS roomType
       FROM rooms r
       JOIN floors f ON f.id = r.floor_id
       JOIN buildings b ON b.id = f.building_id
       WHERE r.floor_id = ? AND b.company_id = ? AND r.status != 'Deleted'
       ORDER BY r.room_name`,
      [floorId, cid(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Helper: next QR UID — only looks at asset_pre_qr so deleting QRs restarts serial from 1.
async function nextQrUid(conn, companyId) {
  const prefix = await getAssetIdPrefix(conn, companyId);
  const serial = await getNextQrSerialForPrefix(conn, prefix);
  return `${prefix}-${String(serial).padStart(6, "0")}`;
}

// POST /pre-qr/generate  – generate N pre-QR codes
router.post("/pre-qr/generate", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin" && req.companyUser.role !== "supervisor")
      return res.status(403).json({ message: "Admin only" });
    const count = Math.max(Number(req.body.count) || 1, 1);
    const created = [];
    for (let i = 0; i < count; i++) {
      const uid = await nextQrUid(pool, cid(req));
      await pool.query(
        "INSERT INTO asset_pre_qr (company_id, qr_unique_id) VALUES (?, ?)",
        [cid(req), uid]
      );
      const [[row]] = await pool.query(
        `SELECT id, qr_unique_id AS qrUniqueId, asset_id AS assetId,
                NULL AS assetName, linked_at AS linkedAt, created_at AS createdAt
         FROM asset_pre_qr WHERE qr_unique_id = ?`, [uid]
      );
      created.push(row);
    }
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// GET /pre-qr  – list all pre-QR codes for this company
router.get("/pre-qr", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT q.id, q.qr_unique_id AS qrUniqueId, q.asset_id AS assetId,
              a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId,
              a.generated_asset_id AS generatedAssetId,
              q.linked_at AS linkedAt, q.created_at AS createdAt
       FROM asset_pre_qr q
       LEFT JOIN assets a ON a.id = q.asset_id
       WHERE q.company_id = ?
       ORDER BY q.id DESC`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /pre-qr/by-uid/:uid  – lookup by QR unique ID (used by mobile scanner, no auth required)
router.get("/pre-qr/by-uid/:uid", async (req, res, next) => {
  try {
    const [[qr]] = await pool.query(
      `SELECT q.id, q.qr_unique_id AS qrUniqueId, q.asset_id AS assetId,
              q.company_id AS companyId,
              a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId,
              a.generated_asset_id AS generatedAssetId,
              a.status, a.department_id AS departmentId,
              d.name AS departmentName, a.metadata,
              q.linked_at AS linkedAt
       FROM asset_pre_qr q
       LEFT JOIN assets a ON a.id = q.asset_id
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE q.qr_unique_id = ?`,
      [req.params.uid]
    );
    if (!qr) return res.status(404).json({ message: "QR code not found" });
    if (qr.metadata && typeof qr.metadata === "string") {
      try { qr.metadata = JSON.parse(qr.metadata); } catch {}
    }
    res.json(qr);
  } catch (err) { next(err); }
});

// PATCH /pre-qr/:id/link  – link a QR code to an existing asset
router.patch("/pre-qr/:id/link", async (req, res, next) => {
  try {
    const { assetId } = req.body;
    if (!assetId) return res.status(400).json({ message: "assetId required" });
    const [[qr]] = await pool.query(
      "SELECT id FROM asset_pre_qr WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!qr) return res.status(404).json({ message: "QR not found" });
    await pool.query(
      "UPDATE asset_pre_qr SET asset_id = ?, linked_at = NOW() WHERE id = ?",
      [assetId, req.params.id]
    );
    const [[updated]] = await pool.query(
      `SELECT q.id, q.qr_unique_id AS qrUniqueId, q.asset_id AS assetId,
              a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId,
              a.generated_asset_id AS generatedAssetId,
              q.linked_at AS linkedAt
       FROM asset_pre_qr q LEFT JOIN assets a ON a.id = q.asset_id WHERE q.id = ?`,
      [req.params.id]
    );
    res.json(updated);
  } catch (err) { next(err); }
});

// POST /pre-qr/:id/register-asset – mobile scan flow: create a brand-new asset and link this QR to it
router.post("/pre-qr/:id/register-asset", async (req, res, next) => {
  try {
    const {
      assetName, assetType = "healthcare", location, notes,
      // Department
      departmentId,
      // Working status
      workingStatus,
      // Healthcare / detailed fields
      make, manufacturerCompany, model, serialNo, accessories, dealer,
      mfgYear, installationDate, invoiceNo, purchaseDate, purchaseCost,
      maintenance, rber, remarks,
      floor, room,
      // New structured maintenance fields
      warranty, amc, cmc, inHouse, catalyst, highEnd,
      // Category / criticality
      criticality,
      // Explicit maintenanceTypes map (from mobile)
      maintenanceTypes,
      // Calibration
      calibrationRequired, calibrationFrequency, lastCalibrationDate, nextCalibrationDueDate,
      calibrationVendorName, calibrationCertificateNumber, calibrationStatus, alertBeforeDays,
      // Media
      hcImages, invoiceImages,
    } = req.body;
    if (!assetName?.trim()) return res.status(400).json({ message: "assetName is required" });

    const [[qr]] = await pool.query(
      "SELECT id, asset_id, qr_unique_id AS qrUniqueId FROM asset_pre_qr WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!qr) return res.status(404).json({ message: "QR not found" });
    if (qr.asset_id) return res.status(409).json({ message: "This QR code is already linked to an asset" });

    const loc = await upsertLocationHierarchyForCompany(pool, {
      companyId: cid(req),
      buildingName: location,
      floorName: floor,
      roomName: room,
      createdBy: req.companyUser?.id || null,
    });
    const generatedAssetId = /^([A-Z0-9]+)-([A-Z0-9]+)-([0-9]+)$/.test(qr.qrUniqueId || "")
      ? qr.qrUniqueId
      : await getNextGeneratedAssetId(pool, cid(req));

     const calibration = await deriveCalibrationFromInput(pool, {
      calibrationRequired,
      calibrationFrequency,
      lastCalibrationDate,
      nextCalibrationDueDate,
      calibrationVendorName,
      calibrationCertificateNumber,
      calibrationStatus,
      alertBeforeDays,
     }, req.body || {});

     // Create the new asset
    const [result] = await pool.query(
      `INSERT INTO assets
         (company_id, department_id, asset_name, asset_type, generated_asset_id,
         calibration_required, calibration_frequency, last_calibration_date, next_calibration_due_date,
         calibration_status, calibration_vendor_id, alert_before_days,
          building, floor, room, building_id, floor_id, room_id, location_id, working_status, criticality, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unverified')`,
      [cid(req), departmentId || null, assetName.trim(), assetType, generatedAssetId,
       calibration.required ? 1 : 0, calibration.frequency, calibration.lastCalibrationDate, calibration.nextCalibrationDueDate,
       calibration.status, calibration.vendorId, calibration.alertBeforeDays,
       loc.building, loc.floor, loc.room, loc.buildingId, loc.floorId, loc.roomId, loc.locationId,
       workingStatus || null, criticality || 'Non_Critical']
    );
    const newAssetId = result.insertId;

    // Keep assetUniqueId linked to the scanned QR UID when available
    const uniqueId = qr?.qrUniqueId ?? `ASSET-${String(newAssetId).padStart(6, "0")}`;
    await pool.query("UPDATE assets SET asset_unique_id = ? WHERE id = ?", [uniqueId, newAssetId]);

    // Store all detailed metadata in asset_details
    const metadata = {
      make: make || null, manufacturerCompany: manufacturerCompany || null,
      model: model || null, serialNo: serialNo || null,
      accessories: accessories || null, dealer: dealer || null,
      mfgYear: mfgYear || null, installationDate: installationDate || null,
      invoiceNo: invoiceNo || null, purchaseDate: purchaseDate || null,
      purchaseCost: purchaseCost || null,
      maintenance: Array.isArray(maintenance) ? maintenance : [],
      // Structured maintenance contracts
      warranty: warranty && warranty.enabled ? { enabled: true, startDate: warranty.startDate || null, endDate: warranty.endDate || null } : null,
      amc:      amc      && amc.enabled      ? { enabled: true, startDate: amc.startDate      || null, endDate: amc.endDate      || null } : null,
      cmc:      cmc      && cmc.enabled      ? { enabled: true, startDate: cmc.startDate      || null, endDate: cmc.endDate      || null } : null,
      inHouse: !!inHouse, catalyst: !!catalyst, highEnd: !!highEnd,
      // maintenanceTypes map used by dashboard snapshot SQL
      maintenanceTypes: maintenanceTypes || {
        warranty: !!(warranty && warranty.enabled),
        amc: !!(amc && amc.enabled),
        cmc: !!(cmc && cmc.enabled),
        inHouse: !!inHouse,
        catalyst: !!catalyst,
        highEnd: !!highEnd,
      },
      rber: !!rber, remarks: remarks || null, notes: notes || null,
      workingStatus: workingStatus || "Working",
      calibration: {
        required: calibration.required,
        frequency: calibration.frequency,
        lastCalibrationDate: calibration.lastCalibrationDate,
        nextCalibrationDueDate: calibration.nextCalibrationDueDate,
        status: calibration.status,
        vendorId: calibration.vendorId,
        vendorName: calibration.vendorName,
        alertBeforeDays: calibration.alertBeforeDays,
        certificateNumber: calibration.certificateNumber,
      },
      // Media uploaded by mobile
      hcImages:      Array.isArray(hcImages)      ? hcImages      : [],
      invoiceImages: Array.isArray(invoiceImages) ? invoiceImages : [],
    };
    await pool.query(
      `INSERT INTO asset_details (asset_id, metadata) VALUES (?, ?) ON DUPLICATE KEY UPDATE metadata = VALUES(metadata)`,
      [newAssetId, JSON.stringify(metadata)]
    );

    if (calibration.required && calibration.lastCalibrationDate) {
      await pool.query(
        `INSERT INTO calibration_records
         (asset_id, calibration_date, next_due_date, vendor_id, certificate_number, status, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newAssetId, calibration.lastCalibrationDate, calibration.nextCalibrationDueDate, calibration.vendorId, calibration.certificateNumber, calibration.status || 'Pending', 'Auto-created during QR asset registration']
      );
    }

    // Link QR to the new asset
    await pool.query(
      "UPDATE asset_pre_qr SET asset_id = ?, linked_at = NOW() WHERE id = ?",
      [newAssetId, req.params.id]
    );

    res.status(201).json({
      assetId: newAssetId,
      assetName: assetName.trim(),
      generatedAssetId,
      assetUniqueId: uniqueId,
    });
  } catch (err) { next(err); }
});

// DELETE /pre-qr/bulk – delete multiple pre-QR codes at once (must be before /:id)
router.delete("/pre-qr/bulk", async (req, res, next) => {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ message: "ids array is required" });
    const placeholders = ids.map(() => "?").join(",");
    // Cascade: also delete linked assets
    const [qrs] = await pool.query(
      `SELECT asset_id FROM asset_pre_qr WHERE id IN (${placeholders}) AND company_id = ? AND asset_id IS NOT NULL`,
      [...ids, cid(req)]
    );
    const linkedAssetIds = qrs.map(q => q.asset_id).filter(Boolean);
    if (linkedAssetIds.length > 0) {
      const ap = linkedAssetIds.map(() => "?").join(",");
      await pool.query(`DELETE FROM assets WHERE id IN (${ap}) AND company_id = ?`, [...linkedAssetIds, cid(req)]);
    }
    const [result] = await pool.query(
      `DELETE FROM asset_pre_qr WHERE id IN (${placeholders}) AND company_id = ?`,
      [...ids, cid(req)]
    );
    res.json({ deleted: result.affectedRows });
  } catch (err) { next(err); }
});

// DELETE /pre-qr/:id – remove a pre-generated QR code and its linked asset
router.delete("/pre-qr/:id", async (req, res, next) => {
  try {
    const [[qr]] = await pool.query(
      "SELECT id, asset_id FROM asset_pre_qr WHERE id = ? AND company_id = ?",
      [req.params.id, cid(req)]
    );
    if (!qr) return res.status(404).json({ message: "QR not found" });
    // Cascade: delete the linked asset if any
    if (qr.asset_id) {
      await pool.query("DELETE FROM assets WHERE id = ? AND company_id = ?", [qr.asset_id, cid(req)]);
    }
    await pool.query("DELETE FROM asset_pre_qr WHERE id = ?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

export default router;
