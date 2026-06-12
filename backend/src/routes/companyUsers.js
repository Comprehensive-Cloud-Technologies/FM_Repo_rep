import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { isMigrationSafeError } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Auto-create table on first load (idempotent)
(async () => {
  const safeAlter = async (sql) => {
    try { await pool.query(sql); } catch (e) { if (!isMigrationSafeError(e)) console.error("[company-users] migration:", e.message); }
  };
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS company_users (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        full_name     VARCHAR(160) NOT NULL,
        email         VARCHAR(160) NOT NULL,
        phone         VARCHAR(32),
        designation   VARCHAR(120),
        role          VARCHAR(60) NOT NULL DEFAULT 'employee',
        status        VARCHAR(20) NOT NULL DEFAULT 'Active',
        password_hash VARCHAR(255),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (err) {
    if (!isMigrationSafeError(err)) console.error("[company-users] migration error:", err.message);
  }
  // Patch existing tables — each ALTER is wrapped individually (MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS)
  await safeAlter(`ALTER TABLE company_users ADD COLUMN role VARCHAR(60) NOT NULL DEFAULT 'employee'`);
  await safeAlter(`ALTER TABLE company_users ADD COLUMN username VARCHAR(100) NULL`);
  await safeAlter(`ALTER TABLE company_users ADD COLUMN department_id INT UNSIGNED NULL`);
  await safeAlter(`ALTER TABLE company_users ADD COLUMN permissions JSON NULL`);
  await safeAlter(`ALTER TABLE company_users ADD COLUMN module_access JSON NULL`);
  await safeAlter(`ALTER TABLE company_users ADD COLUMN service_domain VARCHAR(20) NOT NULL DEFAULT 'technical'`);
  await safeAlter(`CREATE UNIQUE INDEX uq_company_users_email ON company_users(email)`);
  await safeAlter(`CREATE UNIQUE INDEX uq_company_users_username ON company_users(username)`);
  await safeAlter(`CREATE INDEX idx_company_users_company ON company_users(company_id)`);

  // Keep admin work-order endpoints compatible with older MySQL schemas.
  await safeAlter(`ALTER TABLE work_orders ADD COLUMN updated_at DATETIME NULL DEFAULT NULL`);
  await safeAlter(`ALTER TABLE work_orders ADD COLUMN closed_at DATETIME NULL DEFAULT NULL`);
  await safeAlter(`ALTER TABLE work_orders ADD COLUMN company_id INT UNSIGNED NULL`);
  await safeAlter(`ALTER TABLE work_orders ADD COLUMN cp_assigned_to INT UNSIGNED NULL`);
  await safeAlter(`ALTER TABLE work_orders ADD COLUMN cp_created_by INT UNSIGNED NULL`);
  await safeAlter(`ALTER TABLE work_orders ADD COLUMN assigned_note TEXT NULL`);
  await safeAlter(`ALTER TABLE work_orders ADD COLUMN expected_completion_at DATETIME NULL`);
  await safeAlter(`ALTER TABLE work_orders ADD COLUMN escalation_level INT NOT NULL DEFAULT 0`);
  await safeAlter(`ALTER TABLE work_orders MODIFY COLUMN status ENUM('open','assigned','in_progress','on_hold','completed','closed','escalated') NOT NULL DEFAULT 'open'`);

  // ── Multi-company access table ───────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_company_access (
      id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id    BIGINT UNSIGNED NOT NULL,
      company_id INT UNSIGNED    NOT NULL,
      created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_uca (user_id, company_id)
    )
  `).catch(() => {});
})();

router.use(requireAuth);

// Verify company exists and the authenticated admin has access to it.
// All platform admins have equal access to all companies.
const verifyCompanyOwner = async (companyId) => {
  const [rows] = await pool.query(
    "SELECT id FROM companies WHERE id = ?",
    [companyId]
  );
  return rows.length > 0;
};

// ── GET /api/company-users?companyId=:id ──────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });

    const ok = await verifyCompanyOwner(companyId);
    if (!ok) return res.status(403).json({ message: "Access denied" });

    const [rows] = await pool.query(
      `SELECT id,
              company_id   AS "companyId",
              full_name    AS "fullName",
              email,
              phone,
              designation,
              role,
              status,
              username,
              permissions,
              module_access AS "moduleAccess",
              created_at   AS "createdAt"
       FROM company_users
       WHERE company_id = ?
       ORDER BY created_at DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/company-users ───────────────────────────────────────────────────
router.post("/", async (req, res, next) => {
  try {
    const { companyId, fullName, email, phone, designation, role = "employee", status = "Active", password, username, permissions, moduleAccess } = req.body;

    if (!companyId || !fullName || !email) {
      return res.status(400).json({ message: "companyId, fullName and email are required" });
    }

    const ok = await verifyCompanyOwner(Number(companyId));
    if (!ok) return res.status(403).json({ message: "Access denied" });

    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    const permJson = JSON.stringify(permissions && typeof permissions === "object" ? permissions : {});
    const modJson  = JSON.stringify(Array.isArray(moduleAccess) ? moduleAccess : []);

    const [result] = await pool.execute(
      `INSERT INTO company_users (company_id, full_name, email, phone, designation, role, status, password_hash, username, permissions, module_access)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [Number(companyId), fullName, email, phone || null, designation || null, role, status, passwordHash, username || null, permJson, modJson]
    );

    res.status(201).json({
      id: result.insertId,
      companyId: Number(companyId),
      fullName,
      email,
      phone: phone || null,
      designation: designation || null,
      role,
      status,
      username: username || null,
      permissions: permissions && typeof permissions === "object" ? permissions : {},
      moduleAccess: Array.isArray(moduleAccess) ? moduleAccess : [],
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err.code === "23505" || err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
      const msg = String(err.message || "");
      if (msg.includes("username") || (err.constraint && err.constraint.includes("username"))) {
        return res.status(409).json({ message: "A user with this username already exists" });
      }
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    next(err);
  }
});

// ── PUT /api/company-users/:id ────────────────────────────────────────────────
router.put("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { fullName, email, phone, designation, role, status, password, username, permissions, moduleAccess } = req.body;

    if (!fullName || !email) {
      return res.status(400).json({ message: "fullName and email are required" });
    }

    // Ensure user belongs to a valid company
    const [check] = await pool.query(
      `SELECT cu.id
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [id]
    );
    if (!check.length) return res.status(403).json({ message: "Access denied" });

    const setClauses = ["full_name = ?", "email = ?", "phone = ?", "designation = ?", "role = ?", "status = ?", "username = ?"];
    const params = [fullName, email, phone || null, designation || null, role || "employee", status || "Active", username || null];
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      setClauses.push("password_hash = ?");
      params.push(passwordHash);
    }
    if (permissions !== undefined) {
      setClauses.push("permissions = ?");
      params.push(JSON.stringify(permissions || {}));
    }
    if (moduleAccess !== undefined) {
      setClauses.push("module_access = ?");
      params.push(JSON.stringify(Array.isArray(moduleAccess) ? moduleAccess : []));
    }
    setClauses.push("updated_at = NOW()");
    params.push(id);

    await pool.execute(
      `UPDATE company_users SET ${setClauses.join(", ")} WHERE id = ?`,
      params
    );
    const [[updated]] = await pool.query(
      `SELECT id, company_id AS "companyId", full_name AS "fullName", email, phone,
              designation, role, status, username, permissions,
              module_access AS "moduleAccess" FROM company_users WHERE id = ?`,
      [id]
    );
    res.json(updated || { id: Number(id) });
  } catch (err) {
    if (err.code === "23505" || err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
      const msg = String(err.message || "");
      if (msg.includes("username") || (err.constraint && err.constraint.includes("username"))) {
        return res.status(409).json({ message: "A user with this username already exists" });
      }
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    next(err);
  }
});

// ── DELETE /api/company-users/:id ─────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    const [check] = await pool.query(
      `SELECT cu.id
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [id]
    );
    if (!check.length) return res.status(403).json({ message: "Access denied" });

    await pool.query("DELETE FROM company_users WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Admin-level template-user assignment (for client portal) ──────
// POST /api/company-users/template-assignments
// Accepts the master admin JWT and a companyId in the body.
router.post("/template-assignments", requireAuth, async (req, res, next) => {
  try {
    const { companyId, templateType, templateId, assignedTo, note } = req.body;
    if (!companyId || !templateType || !templateId || !assignedTo) {
      return res.status(400).json({ message: "companyId, templateType, templateId and assignedTo are required" });
    }
    if (!["checklist", "logsheet"].includes(templateType)) {
      return res.status(400).json({ message: "templateType must be checklist or logsheet" });
    }
    const templateTable = templateType === "checklist" ? "checklist_templates" : "logsheet_templates";
    const [[tmpl]] = await pool.query(
      `SELECT id FROM ${templateTable} WHERE id = ? AND company_id = ?`,
      [templateId, companyId]
    );
    if (!tmpl) return res.status(404).json({ message: "Template not found in this company" });
    const [[user]] = await pool.query(
      `SELECT id FROM company_users WHERE id = ? AND company_id = ?`,
      [assignedTo, companyId]
    );
    if (!user) return res.status(404).json({ message: "User not found in this company" });
    const [rows] = await pool.query(
      `INSERT INTO template_user_assignments (company_id, template_type, template_id, assigned_to, assigned_by, note)
       VALUES (?, ?, ?, ?, NULL, ?)
       ON CONFLICT (template_type, template_id, assigned_to) DO UPDATE
         SET note = EXCLUDED.note, created_at = NOW()
       RETURNING id, template_type AS "templateType", template_id AS "templateId",
                 assigned_to AS "assignedTo", note, created_at AS "createdAt"`,
      [companyId, templateType, templateId, assignedTo, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── Admin: list OJT trainings by company ─────────────────────────
// GET /api/company-users/ojt-trainings?companyId=X
router.get("/ojt-trainings", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [rows] = await pool.query(
      `SELECT t.id, t.title, t.description, t.status, t.passing_percentage AS "passingPercentage",
              t.created_at AS "createdAt",
              COUNT(DISTINCT p.id) AS "enrolledCount",
              COUNT(DISTINCT CASE WHEN p.status = 'completed' THEN p.id END) AS "completedCount"
       FROM ojt_trainings t
       LEFT JOIN ojt_user_progress p ON p.training_id = t.id
       WHERE t.company_id = ?
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── Admin: get OJT training user progress by company ─────────────
// GET /api/company-users/ojt-progress?companyId=X
router.get("/ojt-progress", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [rows] = await pool.query(
      `SELECT p.id, p.status, p.score, p.certificate_url AS "certificateUrl",
              t.title AS "trainingTitle",
              u.full_name AS "userName", u.email
       FROM ojt_user_progress p
       JOIN ojt_trainings t ON t.id = p.training_id
       JOIN company_users u ON u.id = p.user_id
       WHERE t.company_id = ?
       ORDER BY p.created_at DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── Admin: work orders by company ─────────────────────────────────────────
// GET /api/company-users/work-orders?[companyId=X][&status=open]
router.get("/work-orders", requireAuth, async (req, res, next) => {
  try {
    const { companyId, status, limit = 200, offset = 0 } = req.query;
    let where = "WHERE 1=1";
    const params = [];
    if (companyId) { where += " AND wo.company_id = ?"; params.push(companyId); }
    if (status) { where += " AND wo.status = ?"; params.push(status); }
    const [rows] = await pool.query(
      `SELECT wo.id, wo.work_order_number AS "workOrderNumber",
              wo.company_id AS "companyId",
              c.company_name AS "companyName",
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
       LEFT JOIN companies c ON c.id = wo.company_id
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       LEFT JOIN company_users cb ON cb.id = wo.cp_created_by
       LEFT JOIN flags f ON f.id = wo.flag_id
       ${where}
       ORDER BY wo.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM work_orders wo LEFT JOIN companies c ON c.id = wo.company_id ${where}`, params
    );
    res.json({ total: Number(countRow?.total ?? 0), data: rows });
  } catch (err) { next(err); }
});
// POST /api/company-users/work-orders  – create work order (admin)
router.post("/work-orders", requireAuth, async (req, res, next) => {
  try {
    const { companyId, issueDescription, assetId, assetName, priority = "medium", assignedTo, assignedNote, expectedCompletionAt } = req.body;
    if (!companyId || !issueDescription) return res.status(400).json({ message: "companyId and issueDescription are required" });
    const woNum = `WO-${Date.now().toString(36).toUpperCase()}`;
    const [result] = await pool.query(
      `INSERT INTO work_orders (work_order_number, company_id, asset_id, asset_name, issue_description, priority, status, cp_assigned_to, assigned_note, expected_completion_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, NOW(), NOW()) RETURNING id`,
      [woNum, companyId, assetId || null, assetName || null, issueDescription, priority, assignedTo || null, assignedNote || null, expectedCompletionAt || null]
    );
    res.status(201).json({ id: result.insertId, workOrderNumber: woNum, status: "open" });
  } catch (err) { next(err); }
});

// PUT /api/company-users/work-orders/:id/status  – update WO status (admin)
router.put("/work-orders/:id/status", requireAuth, async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ["open", "assigned", "in_progress", "on_hold", "completed", "closed", "escalated"];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: "Invalid status" });
    await pool.query("UPDATE work_orders SET status = ?, updated_at = NOW() WHERE id = ?", [status, req.params.id]);
    res.json({ message: "Updated" });
  } catch (err) { next(err); }
});

// PUT /api/company-users/work-orders/:id/assign  – assign WO (admin)
router.put("/work-orders/:id/assign", requireAuth, async (req, res, next) => {
  try {
    const { assignedTo, assignedNote } = req.body;
    await pool.query("UPDATE work_orders SET cp_assigned_to = ?, assigned_note = ?, updated_at = NOW() WHERE id = ?", [assignedTo || null, assignedNote || null, req.params.id]);
    res.json({ message: "Assigned" });
  } catch (err) { next(err); }
});

// ── Admin: shifts by company ──────────────────────────────────────────────
// GET /api/company-users/shifts?companyId=X
router.get("/shifts", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [rows] = await pool.query(
      `SELECT s.id, s.name, s.start_time AS "startTime", s.end_time AS "endTime",
              s.description, s.status, s.created_at AS "createdAt",
              COUNT(DISTINCT es.company_user_id)::int AS "employeeCount"
       FROM shifts s
       LEFT JOIN employee_shifts es ON es.shift_id = s.id
       WHERE s.company_id = ?
       GROUP BY s.id ORDER BY s.start_time`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/company-users/shifts  – create shift (admin)
router.post("/shifts", requireAuth, async (req, res, next) => {
  try {
    const { companyId, name, startTime, endTime, description, status = "active" } = req.body;
    if (!companyId || !name || !startTime || !endTime) return res.status(400).json({ message: "companyId, name, startTime, endTime required" });
    const [result] = await pool.query(
      "INSERT INTO shifts (company_id, name, start_time, end_time, description, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id",
      [companyId, name, startTime, endTime, description || null, status]
    );
    res.status(201).json({ id: result.insertId, name, startTime, endTime, status });
  } catch (err) { next(err); }
});

// PUT /api/company-users/shifts/:id  – update shift (admin)
router.put("/shifts/:id", requireAuth, async (req, res, next) => {
  try {
    const { name, startTime, endTime, description, status } = req.body;
    const fields = []; const params = [];
    if (name !== undefined)        { fields.push("name = ?");        params.push(name); }
    if (startTime !== undefined)   { fields.push("start_time = ?");  params.push(startTime); }
    if (endTime !== undefined)     { fields.push("end_time = ?");    params.push(endTime); }
    if (description !== undefined) { fields.push("description = ?"); params.push(description); }
    if (status !== undefined)      { fields.push("status = ?");      params.push(status); }
    if (!fields.length) return res.status(400).json({ message: "No fields to update" });
    params.push(req.params.id);
    await pool.query(`UPDATE shifts SET ${fields.join(", ")} WHERE id = ?`, params);
    res.json({ message: "Updated" });
  } catch (err) { next(err); }
});

// DELETE /api/company-users/shifts/:id
router.delete("/shifts/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM shifts WHERE id = ?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// ── Admin: employees by company (CRUD) ────────────────────────────────────
// GET /api/company-users/employees?companyId=X
router.get("/employees", requireAuth, async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    const [rows] = await pool.query(
      `SELECT id, full_name AS "fullName", email, phone, role, designation,
              COALESCE(department_id, NULL) AS "departmentId", status,
              COALESCE(permissions, '{}') AS "permissions",
              COALESCE(module_access, '[]') AS "moduleAccess", created_at AS "createdAt"
       FROM company_users WHERE company_id = ? ORDER BY full_name`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/company-users/employees – create employee (admin)
router.post("/employees", requireAuth, async (req, res, next) => {
  try {
    const { companyId, fullName, email, phone, role = "technician", designation, departmentId, password, permissions, moduleAccess } = req.body;
    if (!companyId || !fullName || !email) return res.status(400).json({ message: "companyId, fullName, email required" });
    const bcrypt = (await import("bcryptjs")).default;
    const hashedPw = password ? await bcrypt.hash(password, 10) : await bcrypt.hash("changeme123", 10);
    const permJson = JSON.stringify(permissions && typeof permissions === "object" ? permissions : {});
    const modJson  = JSON.stringify(Array.isArray(moduleAccess) ? moduleAccess : []);
    const [result] = await pool.execute(
      `INSERT INTO company_users (company_id, full_name, email, phone, role, designation, department_id, password_hash, status, permissions, module_access)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      [companyId, fullName, email, phone || null, role, designation || null, departmentId || null, hashedPw, permJson, modJson]
    );
    res.status(201).json({ id: result.insertId, fullName, email, role, status: "active", permissions: JSON.parse(permJson), moduleAccess: JSON.parse(modJson) });
  } catch (err) { next(err); }
});

// PUT /api/company-users/employees/:id – update employee (admin)
router.put("/employees/:id", requireAuth, async (req, res, next) => {
  try {
    const { fullName, email, phone, role, designation, departmentId, status, permissions, moduleAccess } = req.body;
    const fields = []; const params = [];
    if (fullName !== undefined)    { fields.push("full_name = ?");    params.push(fullName); }
    if (email !== undefined)       { fields.push("email = ?");        params.push(email); }
    if (phone !== undefined)       { fields.push("phone = ?");        params.push(phone); }
    if (role !== undefined)        { fields.push("role = ?");         params.push(role); }
    if (designation !== undefined) { fields.push("designation = ?");  params.push(designation); }
    if (departmentId !== undefined){ fields.push("department_id = ?");params.push(departmentId); }
    if (status !== undefined)      { fields.push("status = ?");       params.push(status); }
    if (permissions !== undefined) { fields.push("permissions = ?"); params.push(JSON.stringify(permissions || {})); }
    if (moduleAccess !== undefined){ fields.push("module_access = ?"); params.push(JSON.stringify(Array.isArray(moduleAccess) ? moduleAccess : [])); }
    if (!fields.length) return res.status(400).json({ message: "No fields" });
    params.push(req.params.id);
    await pool.query(`UPDATE company_users SET ${fields.join(", ")} WHERE id = ?`, params);
    res.json({ message: "Updated" });
  } catch (err) { next(err); }
});

// DELETE /api/company-users/employees/:id
router.delete("/employees/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM company_users WHERE id = ?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// ── Admin QR Code management ────────────────────────────────────────────────

// GET /api/company-users/qr-codes?companyId=X  – list QR codes for a company
router.get("/qr-codes", requireAuth, async (req, res, next) => {
  try {
    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [rows] = await pool.query(
      `SELECT q.id, q.qr_unique_id AS qrUniqueId, q.asset_id AS assetId,
              a.asset_name AS assetName, a.asset_unique_id AS assetUniqueId,
              q.linked_at AS linkedAt, q.created_at AS createdAt
       FROM asset_pre_qr q
       LEFT JOIN assets a ON a.id = q.asset_id
       WHERE q.company_id = ?
       ORDER BY q.id DESC`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/company-users/qr-codes/generate  – generate N QR codes for a company
router.post("/qr-codes/generate", requireAuth, async (req, res, next) => {
  try {
    const { companyId, count = 1 } = req.body;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const n = Math.max(Number(count) || 1, 1);
    const created = [];
    for (let i = 0; i < n; i++) {
      const uid = `QR-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      await pool.query("INSERT INTO asset_pre_qr (company_id, qr_unique_id) VALUES (?, ?)", [companyId, uid]);
      const [[row]] = await pool.query(
        `SELECT id, qr_unique_id AS qrUniqueId, asset_id AS assetId, NULL AS assetName, linked_at AS linkedAt, created_at AS createdAt FROM asset_pre_qr WHERE qr_unique_id = ?`,
        [uid]
      );
      created.push(row);
    }
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// DELETE /api/company-users/qr-codes/bulk  – delete multiple QR codes
router.delete("/qr-codes/bulk", requireAuth, async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ message: "ids required" });
    await pool.query(`DELETE FROM asset_pre_qr WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// DELETE /api/company-users/qr-codes/:id  – delete single QR code
router.delete("/qr-codes/:id", requireAuth, async (req, res, next) => {
  try {
    await pool.query("DELETE FROM asset_pre_qr WHERE id = ?", [req.params.id]);
    res.json({ message: "Deleted" });
  } catch (err) { next(err); }
});

// ── GET /api/company-users/:userId/companies ─────────────────────────────────
// Admin: get all companies a user has access to (primary + additional)
router.get("/:userId/companies", async (req, res, next) => {
  try {
    const { userId } = req.params;
    const [[cu]] = await pool.query(
      `SELECT company_id AS companyId FROM company_users WHERE id = ?`, [userId]
    );
    if (!cu) return res.status(404).json({ message: "User not found" });

    const [extra] = await pool.query(
      `SELECT company_id AS companyId FROM user_company_access WHERE user_id = ?`, [userId]
    ).catch(() => [[]]);

    const all = [cu.companyId, ...extra.map(e => e.companyId).filter(id => id !== cu.companyId)];
    res.json({ companyIds: all });
  } catch (err) { next(err); }
});

// ── PUT /api/company-users/:userId/companies ─────────────────────────────────
// Admin: set additional companies for a user (replaces existing extra assignments).
// The primary company_id stays unchanged; this manages the user_company_access rows.
router.put("/:userId/companies", async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { additionalCompanyIds = [] } = req.body; // array of company IDs (excluding primary)

    const [[cu]] = await pool.query(
      `SELECT company_id AS companyId FROM company_users WHERE id = ?`, [userId]
    );
    if (!cu) return res.status(404).json({ message: "User not found" });

    // Replace all additional access rows
    await pool.query(`DELETE FROM user_company_access WHERE user_id = ?`, [userId]);

    const toInsert = additionalCompanyIds.filter(id => Number(id) !== Number(cu.companyId));
    for (const cid of toInsert) {
      await pool.query(
        `INSERT IGNORE INTO user_company_access (user_id, company_id) VALUES (?, ?)`,
        [userId, cid]
      );
    }

    res.json({ success: true, additionalCompanyIds: toInsert });
  } catch (err) { next(err); }
});

export default router;
