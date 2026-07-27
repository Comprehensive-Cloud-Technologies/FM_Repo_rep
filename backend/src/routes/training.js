/**
 * Training Management API
 * Prefix: /api/company-portal/training
 *
 * 1. Session Management (create, edit, delete, calendar)
 * 2. Attendance Management (mark, bulk import)
 * 3. Document Upload (attendance sheet, images, supporting docs)
 * 4. Reports (session-wise + employee-wise)
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
const TRAIN_LOCAL_DIR = path.join(__dirname, "../../uploads/training");

async function saveTrainingFile({ buffer, mimetype, filename }) {
  if (S3_READY) return uploadToS3({ buffer, mimetype, folder: "training", filename });
  fs.mkdirSync(TRAIN_LOCAL_DIR, { recursive: true });
  const safeName = path.basename(filename);
  fs.writeFileSync(path.join(TRAIN_LOCAL_DIR, safeName), buffer);
  return `/uploads/training/${safeName}`;
}

const router = Router();
router.use(requireCompanyAuth);
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = [".pdf", ".xlsx", ".xls", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".ppt", ".pptx"];
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("File type not allowed"), false);
  },
});

// ── Auto-migration ─────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => {
    try { await pool.query(sql); }
    catch (e) { if (!isMigrationSafeError(e)) console.warn("[training] migration:", e.message); }
  };

  await safe(`CREATE TABLE IF NOT EXISTS training_sessions (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id INT UNSIGNED NOT NULL,
    session_number VARCHAR(60) NULL,
    title VARCHAR(300) NOT NULL,
    description TEXT NULL,
    trainer_name VARCHAR(200) NULL,
    training_date DATE NOT NULL,
    start_time VARCHAR(10) NULL,
    end_time VARCHAR(10) NULL,
    duration_minutes INT UNSIGNED NULL,
    venue VARCHAR(300) NULL,
    category VARCHAR(100) NULL,
    department_id INT UNSIGNED NULL,
    department_name VARCHAR(200) NULL,
    status ENUM('draft','scheduled','ongoing','completed','cancelled') NOT NULL DEFAULT 'scheduled',
    total_registered INT UNSIGNED NOT NULL DEFAULT 0,
    total_present INT UNSIGNED NOT NULL DEFAULT 0,
    total_absent INT UNSIGNED NOT NULL DEFAULT 0,
    notes TEXT NULL,
    created_by INT UNSIGNED NULL,
    created_by_name VARCHAR(160) NULL,
    updated_by INT UNSIGNED NULL,
    updated_by_name VARCHAR(160) NULL,
    completed_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_train_sess_company (company_id),
    KEY idx_train_sess_date (training_date),
    KEY idx_train_sess_status (status),
    CONSTRAINT fk_train_sess_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS training_attendance (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id INT UNSIGNED NOT NULL,
    company_id INT UNSIGNED NOT NULL,
    employee_id INT UNSIGNED NOT NULL,
    employee_name VARCHAR(200) NULL,
    employee_code VARCHAR(60) NULL,
    department_id INT UNSIGNED NULL,
    department_name VARCHAR(200) NULL,
    designation VARCHAR(200) NULL,
    attendance_status ENUM('present','absent','excused') NOT NULL DEFAULT 'absent',
    remarks TEXT NULL,
    recorded_by INT UNSIGNED NULL,
    recorded_by_name VARCHAR(160) NULL,
    recorded_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_train_att_sess_emp (session_id, employee_id),
    KEY idx_train_att_session (session_id),
    KEY idx_train_att_employee (employee_id),
    KEY idx_train_att_company (company_id),
    CONSTRAINT fk_train_att_session FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS training_documents (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id INT UNSIGNED NOT NULL,
    company_id INT UNSIGNED NOT NULL,
    document_type ENUM('attendance_sheet','image','presentation','supporting') NOT NULL DEFAULT 'supporting',
    file_url VARCHAR(1000) NOT NULL,
    file_name VARCHAR(300) NOT NULL,
    file_size INT UNSIGNED NULL,
    mimetype VARCHAR(120) NULL,
    version INT NOT NULL DEFAULT 1,
    is_current TINYINT(1) NOT NULL DEFAULT 1,
    uploaded_by INT UNSIGNED NULL,
    uploaded_by_name VARCHAR(160) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_train_doc_session (session_id),
    KEY idx_train_doc_company (company_id),
    CONSTRAINT fk_train_doc_session FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`CREATE TABLE IF NOT EXISTS training_audit_log (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id INT UNSIGNED NOT NULL,
    action VARCHAR(100) NOT NULL,
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
    KEY idx_train_audit_company (company_id),
    KEY idx_train_audit_target (target_type, target_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await safe(`ALTER TABLE training_attendance ADD COLUMN IF NOT EXISTS is_manual TINYINT(1) NOT NULL DEFAULT 0`);
  await safe(`ALTER TABLE training_attendance MODIFY COLUMN employee_id INT UNSIGNED NULL`);
  await safe(`ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS venue VARCHAR(300) NULL`);
  await safe(`ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS category VARCHAR(100) NULL`);
  await safe(`ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS duration_minutes INT UNSIGNED NULL`);
  await safe(`ALTER TABLE training_sessions ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL`);
  await safe(`ALTER TABLE training_attendance ADD COLUMN IF NOT EXISTS remarks TEXT NULL`);
  await safe(`ALTER TABLE training_documents ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1`);
  await safe(`ALTER TABLE training_documents ADD COLUMN IF NOT EXISTS is_current TINYINT(1) NOT NULL DEFAULT 1`);
})();

// ─── Helpers ──────────────────────────────────────────────────────────────────
const cid = (req) => req.companyUser.companyId;
const uid = (req) => req.companyUser.id;
const uname = (req) => req.companyUser.name || req.companyUser.fullName || req.companyUser.email || "Unknown";
const urole = (req) => req.companyUser.role || "unknown";

function sanitize(val) { return val === undefined ? undefined : (val === "" ? null : val); }

async function nextSessionNumber(companyId) {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM training_sessions WHERE company_id = ?", [companyId]);
  return `TRN-${String(Number(n) + 1).padStart(5, "0")}`;
}

async function auditLog(companyId, action, actorId, actorName, actorRole, targetType, targetId, details, req) {
  const ip = req?.ip || req?.headers?.["x-forwarded-for"] || null;
  const ua = req?.headers?.["user-agent"] || null;
  try {
    await pool.query(
      `INSERT INTO training_audit_log (company_id, action, actor_id, actor_name, actor_role, target_type, target_id, details, ip_address, device_info)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [companyId, action, actorId, actorName, actorRole, targetType, targetId, details ? JSON.stringify(details) : null, ip, ua]
    );
  } catch { /* non-critical */ }
}

async function refreshAttendanceCounts(sessionId) {
  await pool.query(`
    UPDATE training_sessions ts SET
      total_registered = (SELECT COUNT(*) FROM training_attendance WHERE session_id = ?),
      total_present    = (SELECT COUNT(*) FROM training_attendance WHERE session_id = ? AND attendance_status = 'present'),
      total_absent     = (SELECT COUNT(*) FROM training_attendance WHERE session_id = ? AND attendance_status IN ('absent','excused'))
    WHERE id = ?
  `, [sessionId, sessionId, sessionId, sessionId]);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// GET /sessions — list with optional filters
router.get("/sessions", async (req, res, next) => {
  try {
    const { from, to, status, department, category, search, calendarView } = req.query;
    let sql = `SELECT ts.*, ts.total_present, ts.total_absent, ts.total_registered
               FROM training_sessions ts
               WHERE ts.company_id = ?`;
    const params = [cid(req)];
    if (from) { sql += ` AND ts.training_date >= ?`; params.push(from); }
    if (to)   { sql += ` AND ts.training_date <= ?`; params.push(to); }
    if (status)     { sql += ` AND ts.status = ?`; params.push(status); }
    if (department) { sql += ` AND ts.department_id = ?`; params.push(department); }
    if (category)   { sql += ` AND ts.category = ?`; params.push(category); }
    if (search)     { sql += ` AND (ts.title LIKE ? OR ts.trainer_name LIKE ? OR ts.session_number LIKE ?)`; const s = `%${search}%`; params.push(s, s, s); }
    sql += ` ORDER BY ts.training_date DESC, ts.start_time ASC`;
    if (!calendarView) { sql += ` LIMIT 200`; }
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /sessions — create
router.post("/sessions", async (req, res, next) => {
  try {
    const { title, description, trainerName, trainingDate, startTime, endTime, durationMinutes, venue, category, departmentId, departmentName, status, notes } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: "Training title is required" });
    if (!trainingDate)  return res.status(400).json({ message: "Training date is required" });
    const sessionNumber = await nextSessionNumber(cid(req));
    const [r] = await pool.query(
      `INSERT INTO training_sessions (company_id, session_number, title, description, trainer_name, training_date, start_time, end_time, duration_minutes, venue, category, department_id, department_name, status, notes, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid(req), sessionNumber, title.trim(), sanitize(description), sanitize(trainerName), trainingDate, sanitize(startTime), sanitize(endTime), sanitize(durationMinutes) || null, sanitize(venue), sanitize(category), sanitize(departmentId) || null, sanitize(departmentName), status || "scheduled", sanitize(notes), uid(req), uname(req)]
    );
    await auditLog(cid(req), "SESSION_CREATED", uid(req), uname(req), urole(req), "session", r.insertId, { title, sessionNumber }, req);
    const [[created]] = await pool.query("SELECT * FROM training_sessions WHERE id = ?", [r.insertId]);
    res.status(201).json(created);
  } catch (e) { next(e); }
});

// GET /sessions/:id — detail
router.get("/sessions/:id", async (req, res, next) => {
  try {
    const [[session]] = await pool.query("SELECT * FROM training_sessions WHERE id = ? AND company_id = ?", [req.params.id, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    res.json(session);
  } catch (e) { next(e); }
});

// PATCH /sessions/:id — update
router.patch("/sessions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const { title, description, trainerName, trainingDate, startTime, endTime, durationMinutes, venue, category, departmentId, departmentName, status, notes } = req.body;
    const fields = [], vals = [];
    if (title !== undefined)           { fields.push("title = ?");            vals.push(title?.trim() || null); }
    if (description !== undefined)     { fields.push("description = ?");      vals.push(sanitize(description)); }
    if (trainerName !== undefined)     { fields.push("trainer_name = ?");     vals.push(sanitize(trainerName)); }
    if (trainingDate !== undefined)    { fields.push("training_date = ?");    vals.push(trainingDate); }
    if (startTime !== undefined)       { fields.push("start_time = ?");       vals.push(sanitize(startTime)); }
    if (endTime !== undefined)         { fields.push("end_time = ?");         vals.push(sanitize(endTime)); }
    if (durationMinutes !== undefined) { fields.push("duration_minutes = ?"); vals.push(durationMinutes || null); }
    if (venue !== undefined)           { fields.push("venue = ?");            vals.push(sanitize(venue)); }
    if (category !== undefined)        { fields.push("category = ?");         vals.push(sanitize(category)); }
    if (departmentId !== undefined)    { fields.push("department_id = ?");    vals.push(departmentId || null); }
    if (departmentName !== undefined)  { fields.push("department_name = ?");  vals.push(sanitize(departmentName)); }
    if (status !== undefined)          { fields.push("status = ?");           vals.push(status); if (status === "completed") { fields.push("completed_at = ?"); vals.push(new Date()); } }
    if (notes !== undefined)           { fields.push("notes = ?");            vals.push(sanitize(notes)); }
    fields.push("updated_by = ?", "updated_by_name = ?");
    vals.push(uid(req), uname(req), id, cid(req));
    if (fields.length > 2) await pool.query(`UPDATE training_sessions SET ${fields.join(", ")} WHERE id = ? AND company_id = ?`, vals);
    await auditLog(cid(req), "SESSION_UPDATED", uid(req), uname(req), urole(req), "session", id, { fields: Object.keys(req.body) }, req);
    const [[updated]] = await pool.query("SELECT * FROM training_sessions WHERE id = ?", [id]);
    res.json(updated);
  } catch (e) { next(e); }
});

// DELETE /sessions/:id
router.delete("/sessions/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[session]] = await pool.query("SELECT id, title FROM training_sessions WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    await pool.query("DELETE FROM training_sessions WHERE id = ?", [id]);
    await auditLog(cid(req), "SESSION_DELETED", uid(req), uname(req), urole(req), "session", id, { title: session.title }, req);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// GET /sessions/:id/attendance — list attendance for a session
router.get("/sessions/:id/attendance", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const [rows] = await pool.query(
      `SELECT ta.*, cu.full_name AS emp_name_live, cu.username AS emp_code_live, cu.designation AS designation_live
       FROM training_attendance ta
       LEFT JOIN company_users cu ON cu.id = ta.employee_id AND cu.company_id = ?
       WHERE ta.session_id = ?
       ORDER BY ta.employee_name ASC`,

      [cid(req), id]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /sessions/:id/attendance — mark/update single employee attendance
router.post("/sessions/:id/attendance", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [sessionId, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const { employeeId, attendanceStatus, remarks } = req.body;
    if (!employeeId) return res.status(400).json({ message: "Employee ID is required" });
    const [[emp]] = await pool.query("SELECT id, full_name, username AS emp_code, designation, department_id FROM company_users WHERE id = ? AND company_id = ?", [employeeId, cid(req)]);
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    let deptName = null;
    if (emp.department_id) { const [[d]] = await pool.query("SELECT name AS department_name FROM departments WHERE id = ?", [emp.department_id]); deptName = d?.department_name || null; }
    await pool.query(
      `INSERT INTO training_attendance (session_id, company_id, employee_id, employee_name, employee_code, department_id, department_name, designation, attendance_status, remarks, recorded_by, recorded_by_name, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE attendance_status = VALUES(attendance_status), remarks = VALUES(remarks), recorded_by = VALUES(recorded_by), recorded_by_name = VALUES(recorded_by_name), recorded_at = NOW()`,
      [sessionId, cid(req), emp.id, emp.full_name, emp.emp_code, emp.department_id || null, deptName, emp.designation || null, attendanceStatus || "present", sanitize(remarks), uid(req), uname(req)]
    );
    await refreshAttendanceCounts(sessionId);
    await auditLog(cid(req), "ATTENDANCE_RECORDED", uid(req), uname(req), urole(req), "session", sessionId, { employeeId, attendanceStatus }, req);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// POST /sessions/:id/attendance/bulk — mark multiple employees at once
router.post("/sessions/:id/attendance/bulk", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [sessionId, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const { records } = req.body; // [{employeeId, attendanceStatus, remarks}]
    if (!Array.isArray(records) || !records.length) return res.status(400).json({ message: "records array is required" });
    let saved = 0;
    for (const rec of records) {
      if (!rec.employeeId) continue;
      const [[emp]] = await pool.query("SELECT id, full_name, username AS emp_code, designation, department_id FROM company_users WHERE id = ? AND company_id = ?", [rec.employeeId, cid(req)]);
      if (!emp) continue;
      let deptName = null;
      if (emp.department_id) { const [[d]] = await pool.query("SELECT name AS department_name FROM departments WHERE id = ?", [emp.department_id]); deptName = d?.department_name || null; }
      await pool.query(
        `INSERT INTO training_attendance (session_id, company_id, employee_id, employee_name, employee_code, department_id, department_name, designation, attendance_status, remarks, recorded_by, recorded_by_name, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE attendance_status = VALUES(attendance_status), remarks = VALUES(remarks), recorded_by = VALUES(recorded_by), recorded_by_name = VALUES(recorded_by_name), recorded_at = NOW()`,
        [sessionId, cid(req), emp.id, emp.full_name, emp.emp_code, emp.department_id || null, deptName, emp.designation || null, rec.attendanceStatus || "present", sanitize(rec.remarks), uid(req), uname(req)]
      );
      saved++;
    }
    await refreshAttendanceCounts(sessionId);
    await auditLog(cid(req), "BULK_ATTENDANCE_RECORDED", uid(req), uname(req), urole(req), "session", sessionId, { count: saved }, req);
    res.json({ saved, total: records.length });
  } catch (e) { next(e); }
});

// POST /sessions/:id/attendance/import — bulk import from Excel data
router.post("/sessions/:id/attendance/import", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [sessionId, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const { records } = req.body; // [{employeeCode, attendanceStatus, remarks}]
    if (!Array.isArray(records) || !records.length) return res.status(400).json({ message: "records array is required" });
    const results = { total: records.length, saved: 0, invalid: [], duplicates: 0 };
    const seenCodes = new Set();
    for (const rec of records) {
      const code = String(rec.employeeCode || "").trim();
      if (!code) { results.invalid.push({ code, reason: "Missing employee code" }); continue; }
      if (seenCodes.has(code.toLowerCase())) { results.duplicates++; continue; }
      seenCodes.add(code.toLowerCase());
      const [[emp]] = await pool.query("SELECT id, full_name, username AS emp_code, designation, department_id FROM company_users WHERE (username = ? OR LOWER(username) = LOWER(?)) AND company_id = ?", [code, code, cid(req)]);
      if (!emp) { results.invalid.push({ code, reason: "Employee not found" }); continue; }
      let deptName = null;
      if (emp.department_id) { const [[d]] = await pool.query("SELECT name AS department_name FROM departments WHERE id = ?", [emp.department_id]); deptName = d?.department_name || null; }
      const status = ["present","absent","excused"].includes(String(rec.attendanceStatus || "").toLowerCase()) ? rec.attendanceStatus.toLowerCase() : "absent";
      await pool.query(
        `INSERT INTO training_attendance (session_id, company_id, employee_id, employee_name, employee_code, department_id, department_name, designation, attendance_status, remarks, recorded_by, recorded_by_name, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE attendance_status = VALUES(attendance_status), remarks = VALUES(remarks), recorded_by = VALUES(recorded_by), recorded_by_name = VALUES(recorded_by_name), recorded_at = NOW()`,
        [sessionId, cid(req), emp.id, emp.full_name, emp.emp_code, emp.department_id || null, deptName, emp.designation || null, status, sanitize(rec.remarks), uid(req), uname(req)]
      );
      results.saved++;
    }
    await refreshAttendanceCounts(sessionId);
    await auditLog(cid(req), "BULK_ATTENDANCE_IMPORTED", uid(req), uname(req), urole(req), "session", sessionId, { saved: results.saved, invalid: results.invalid.length }, req);
    res.json(results);
  } catch (e) { next(e); }
});

// POST /sessions/:id/attendance/manual — add external/manual attendee by name
router.post("/sessions/:id/attendance/manual", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [sessionId, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const { name, code, designation, departmentName, attendanceStatus } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "Name is required for manual entry" });
    const status = ["present", "absent", "excused"].includes(attendanceStatus) ? attendanceStatus : "present";
    await pool.query(
      `INSERT INTO training_attendance (session_id, company_id, employee_id, employee_name, employee_code, designation, department_name, attendance_status, is_manual, recorded_by, recorded_by_name, recorded_at)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, 1, ?, ?, NOW())`,
      [sessionId, cid(req), name.trim(), sanitize(code) || null, sanitize(designation) || null, sanitize(departmentName) || null, status, uid(req), uname(req)]
    );
    await refreshAttendanceCounts(sessionId);
    await auditLog(cid(req), "MANUAL_ATTENDANCE_ADDED", uid(req), uname(req), urole(req), "session", sessionId, { name, status }, req);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// DELETE /sessions/:id/attendance/:empId — remove attendance record by employee_id
router.delete("/sessions/:id/attendance/:empId", async (req, res, next) => {  try {
    const sessionId = Number(req.params.id);
    const empId = Number(req.params.empId);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [sessionId, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    await pool.query("DELETE FROM training_attendance WHERE session_id = ? AND employee_id = ?", [sessionId, empId]);
    await refreshAttendanceCounts(sessionId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// DELETE /sessions/:id/attendance/record/:recordId — remove manual/any attendance record by row id
router.delete("/sessions/:id/attendance/record/:recordId", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const recordId = Number(req.params.recordId);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [sessionId, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    await pool.query("DELETE FROM training_attendance WHERE id = ? AND session_id = ?", [recordId, sessionId]);
    await refreshAttendanceCounts(sessionId);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// GET /sessions/:id/documents
router.get("/sessions/:id/documents", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const { type } = req.query;
    let sql = "SELECT * FROM training_documents WHERE session_id = ?";
    const params = [id];
    if (type) { sql += " AND document_type = ?"; params.push(type); }
    sql += " ORDER BY document_type, created_at DESC";
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /sessions/:id/documents — upload a document
router.post("/sessions/:id/documents", upload.single("file"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [id, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const { documentType } = req.body;
    const docType = ["attendance_sheet","image","presentation","supporting"].includes(documentType) ? documentType : "supporting";

    // For attendance_sheet: mark previous as not current and version-up
    let version = 1;
    if (docType === "attendance_sheet") {
      const [[prev]] = await pool.query("SELECT MAX(version) AS v FROM training_documents WHERE session_id = ? AND document_type = 'attendance_sheet'", [id]);
      version = (prev?.v || 0) + 1;
      await pool.query("UPDATE training_documents SET is_current = 0 WHERE session_id = ? AND document_type = 'attendance_sheet'", [id]);
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const safeName = `training-${id}-${docType}-${Date.now()}${ext}`;
    const fileUrl = await saveTrainingFile({ buffer: req.file.buffer, mimetype: req.file.mimetype, filename: safeName });
    const [r] = await pool.query(
      `INSERT INTO training_documents (session_id, company_id, document_type, file_url, file_name, file_size, mimetype, version, is_current, uploaded_by, uploaded_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [id, cid(req), docType, fileUrl, req.file.originalname, req.file.size, req.file.mimetype, version, uid(req), uname(req)]
    );
    await auditLog(cid(req), "DOCUMENT_UPLOADED", uid(req), uname(req), urole(req), "session", id, { documentType: docType, fileName: req.file.originalname }, req);
    const [[doc]] = await pool.query("SELECT * FROM training_documents WHERE id = ?", [r.insertId]);
    res.status(201).json(doc);
  } catch (e) { next(e); }
});

// DELETE /sessions/:id/documents/:docId
router.delete("/sessions/:id/documents/:docId", async (req, res, next) => {
  try {
    const sessionId = Number(req.params.id);
    const docId = Number(req.params.docId);
    const [[doc]] = await pool.query("SELECT * FROM training_documents WHERE id = ? AND session_id = ?", [docId, sessionId]);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    const [[session]] = await pool.query("SELECT id FROM training_sessions WHERE id = ? AND company_id = ?", [sessionId, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    await pool.query("DELETE FROM training_documents WHERE id = ?", [docId]);
    await auditLog(cid(req), "DOCUMENT_DELETED", uid(req), uname(req), urole(req), "session", sessionId, { fileName: doc.file_name }, req);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// GET /documents/:docId/download — get download URL
router.get("/documents/:docId/download", async (req, res, next) => {
  try {
    const [[doc]] = await pool.query(
      `SELECT td.* FROM training_documents td
       JOIN training_sessions ts ON ts.id = td.session_id
       WHERE td.id = ? AND ts.company_id = ?`,
      [req.params.docId, cid(req)]
    );
    if (!doc) return res.status(404).json({ message: "Document not found" });
    if (S3_READY && doc.file_url.startsWith("https://")) {
      const key = keyFromS3Url(doc.file_url);
      const url = await getPresignedUrl(key, 3600);
      return res.json({ url, fileName: doc.file_name });
    }
    res.json({ url: doc.file_url, fileName: doc.file_name });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE TRAINING HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

// GET /employees — employee list with training stats
router.get("/employees", async (req, res, next) => {
  try {
    const { department, designation, search, page = 1, pageSize = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    let where = "cu.company_id = ?";
    const params = [cid(req)];
    if (department)   { where += " AND cu.department_id = ?"; params.push(department); }
    if (designation)  { where += " AND cu.designation LIKE ?"; params.push(`%${designation}%`); }
    if (search)       { where += " AND (cu.full_name LIKE ? OR cu.username LIKE ?)"; const s = `%${search}%`; params.push(s, s); }

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM company_users cu WHERE ${where}`, params);
    const [rows] = await pool.query(`
      SELECT cu.id, cu.full_name, cu.username AS employee_code, cu.designation, cu.department_id,
             d.name AS department_name,
             COUNT(ta.id) AS total_trainings,
             SUM(CASE WHEN ta.attendance_status = 'present' THEN 1 ELSE 0 END) AS trainings_attended,
             SUM(CASE WHEN ta.attendance_status IN ('absent','excused') THEN 1 ELSE 0 END) AS trainings_missed,
             ROUND(100.0 * SUM(CASE WHEN ta.attendance_status = 'present' THEN 1 ELSE 0 END) / NULLIF(COUNT(ta.id), 0), 1) AS attendance_pct,
             MAX(ts.training_date) AS last_training_date
      FROM company_users cu
      LEFT JOIN departments d ON d.id = cu.department_id
      LEFT JOIN training_attendance ta ON ta.employee_id = cu.id
      LEFT JOIN training_sessions ts ON ts.id = ta.session_id AND ts.company_id = ?
      WHERE ${where}
      GROUP BY cu.id
      ORDER BY cu.full_name
      LIMIT ? OFFSET ?
    `, [cid(req), ...params, Number(pageSize), offset]);
    res.json({ total, rows });
  } catch (e) { next(e); }
});

// GET /employees/:empId — employee training history detail
router.get("/employees/:empId", async (req, res, next) => {
  try {
    const [[emp]] = await pool.query(
      `SELECT cu.*, d.name AS department_name FROM company_users cu LEFT JOIN departments d ON d.id = cu.department_id WHERE cu.id = ? AND cu.company_id = ?`,
      [req.params.empId, cid(req)]
    );
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    const [history] = await pool.query(`
      SELECT ts.id AS session_id, ts.session_number, ts.title, ts.training_date, ts.start_time, ts.end_time,
             ts.trainer_name, ts.venue, ts.category, ts.status AS session_status,
             ta.attendance_status, ta.remarks, ta.recorded_at,
             (SELECT COUNT(*) FROM training_documents td WHERE td.session_id = ts.id) AS doc_count
      FROM training_attendance ta
      JOIN training_sessions ts ON ts.id = ta.session_id AND ts.company_id = ?
      WHERE ta.employee_id = ?
      ORDER BY ts.training_date DESC
    `, [cid(req), req.params.empId]);
    res.json({ employee: emp, history });
  } catch (e) { next(e); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /reports — session list with attendance stats
router.get("/reports", async (req, res, next) => {
  try {
    const { from, to, department, trainer, category, status, search, page = 1, pageSize = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(pageSize);
    let where = "ts.company_id = ?";
    const params = [cid(req)];
    if (from) { where += " AND ts.training_date >= ?"; params.push(from); }
    if (to)   { where += " AND ts.training_date <= ?"; params.push(to); }
    if (department) { where += " AND ts.department_id = ?"; params.push(department); }
    if (trainer)    { where += " AND ts.trainer_name LIKE ?"; params.push(`%${trainer}%`); }
    if (category)   { where += " AND ts.category = ?"; params.push(category); }
    if (status)     { where += " AND ts.status = ?"; params.push(status); }
    if (search)     { where += " AND (ts.title LIKE ? OR ts.trainer_name LIKE ?)"; const s = `%${search}%`; params.push(s, s); }
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM training_sessions ts WHERE ${where}`, params);
    const [rows] = await pool.query(`
      SELECT ts.*,
             ROUND(100.0 * ts.total_present / NULLIF(ts.total_registered, 0), 1) AS attendance_pct,
             (SELECT COUNT(*) FROM training_documents td WHERE td.session_id = ts.id) AS doc_count
      FROM training_sessions ts
      WHERE ${where}
      ORDER BY ts.training_date DESC
      LIMIT ? OFFSET ?
    `, [...params, Number(pageSize), offset]);
    res.json({ total, rows });
  } catch (e) { next(e); }
});

// GET /reports/:sessionId — session detail report
router.get("/reports/:sessionId", async (req, res, next) => {
  try {
    const [[session]] = await pool.query("SELECT * FROM training_sessions WHERE id = ? AND company_id = ?", [req.params.sessionId, cid(req)]);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const [attendance] = await pool.query(
      `SELECT ta.*, cu.email, cu.phone AS mobile FROM training_attendance ta LEFT JOIN company_users cu ON cu.id = ta.employee_id WHERE ta.session_id = ? ORDER BY ta.employee_name`,
      [session.id]
    );
    const [documents] = await pool.query("SELECT * FROM training_documents WHERE session_id = ? ORDER BY document_type, created_at DESC", [session.id]);
    const [auditLogs] = await pool.query("SELECT * FROM training_audit_log WHERE target_id = ? AND target_type = 'session' AND company_id = ? ORDER BY created_at DESC LIMIT 20", [session.id, cid(req)]);
    res.json({ session, attendance, documents, auditLogs });
  } catch (e) { next(e); }
});

// GET /audit-logs
router.get("/audit-logs", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM training_audit_log WHERE company_id = ? ORDER BY created_at DESC LIMIT 100",
      [cid(req)]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// GET /categories — distinct categories for filter dropdowns
router.get("/categories", async (req, res, next) => {
  try {
    const [rows] = await pool.query("SELECT DISTINCT category FROM training_sessions WHERE company_id = ? AND category IS NOT NULL ORDER BY category", [cid(req)]);
    res.json(rows.map(r => r.category));
  } catch (e) { next(e); }
});

export default router;
