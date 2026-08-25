/**
 * Mobile Case Log API
 * All routes require a valid company_user JWT (requireCompanyAuth middleware).
 *
 * Case logs = work_orders table with source_label = 'Mobile Case Log'
 *
 * GET    /api/mobile/case-logs           — list (role-filtered)
 * GET    /api/mobile/case-logs/dashboard — summary counts (role-filtered)
 * POST   /api/mobile/case-logs           — create new case log
 * GET    /api/mobile/case-logs/:id       — single case log detail
 * PATCH  /api/mobile/case-logs/:id/status — update status
 * PATCH  /api/mobile/case-logs/:id/remarks — engineer adds remarks
 * GET    /api/mobile/case-logs/engineers — list engineers (admin: assign)
 * PATCH  /api/mobile/case-logs/:id/assign — admin assigns to engineer
 */

import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import { getEffectivePermissions } from "../rbac/permissions.js";
import { completeClock as slaCompleteClock } from "../utils/slaV2Engine.js";

// ── Expo Push helper ──────────────────────────────────────────────────────────
async function sendExpoPush(pushToken, title, body, data = {}) {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, data, sound: "default" }),
    });
  } catch { /* Non-fatal */ }
}

async function createInAppNotification(companyId, recipientId, title, message) {
  try {
    await pool.query(
      `INSERT INTO notifications (company_id, recipient_id, type, title, message, is_read, created_at)
       VALUES (?, ?, 'case_log', ?, ?, FALSE, NOW())`,
      [companyId, recipientId, title, message]
    );
  } catch { /* Non-fatal */ }
}

const router = Router();

// ─── Startup auto-migration ────────────────────────────────────────────────────
(async () => {
  const cols = [
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS source_label VARCHAR(80) NULL`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS company_user_id INT UNSIGNED NULL`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cp_assigned_to INT UNSIGNED NULL`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS completion_note TEXT NULL`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS escalation_level INT NOT NULL DEFAULT 0`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS escalation_interval_minutes INT NOT NULL DEFAULT 60`,
    `ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS escalation_note TEXT NULL`,
    // Make asset_id nullable so mobile case logs without an asset can be saved
    `ALTER TABLE work_orders MODIFY COLUMN asset_id INT NULL`,
    // Allow 'closed' status for asset_queries (staff can close resolved QR-scan requests)
    `ALTER TABLE asset_queries MODIFY COLUMN status ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open'`,
    // Ensure updated_at exists (old tables created before this column was in CREATE TABLE)
    `ALTER TABLE asset_queries ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT NOW()`,
  ];
  for (const sql of cols) {
    try { await pool.query(sql); } catch (_) { /* column already exists or other benign error */ }
  }
})();

router.use(requireCompanyAuth);

// ─── Role helpers ─────────────────────────────────────────────────────────────
const isHCStaff    = r => ['nurse','doctor','ward_boy'].includes((r||'').toLowerCase());
const isHCEngineer = r => (r||'').toLowerCase() === 'engineer';
const isHCAdmin    = r => (r||'').toLowerCase() === 'admin';

// ─── GET /dashboard ───────────────────────────────────────────────────────────
router.get("/dashboard", async (req, res, next) => {
  try {
    const { id: userId, companyId, role } = req.companyUser;

    // ── Work orders query ─────────────────────────────────────────────────────
    let woWhere = "WHERE wo.company_id = ?";
    const woParams = [companyId];

    if (isHCStaff(role)) {
      woWhere += " AND wo.company_user_id = ?"; woParams.push(userId);
    } else if (isHCEngineer(role)) {
      woWhere += " AND wo.cp_assigned_to = ?"; woParams.push(userId);
    }

    const [[woRow]] = await pool.query(
      `SELECT
         COUNT(*)                                                            AS total,
         SUM(CASE WHEN wo.status = 'open'        THEN 1 ELSE 0 END)        AS open,
         SUM(CASE WHEN wo.status = 'assigned'    THEN 1 ELSE 0 END)        AS assigned,
         SUM(CASE WHEN wo.status = 'in_progress' THEN 1 ELSE 0 END)        AS in_progress,
         SUM(CASE WHEN wo.status = 'resolved'    THEN 1 ELSE 0 END)        AS resolved,
         SUM(CASE WHEN wo.status = 'closed'      THEN 1 ELSE 0 END)        AS closed
       FROM work_orders wo ${woWhere}`,
      woParams
    );

    // ── Asset queries query (QR scan requests) ────────────────────────────────
    let aqWhere = "WHERE aq.company_id = ?";
    const aqParams = [companyId];

    if (isHCStaff(role)) {
      aqWhere += " AND aq.raised_by = ?"; aqParams.push(userId);
    } else if (isHCEngineer(role)) {
      aqWhere += " AND aq.assigned_to = ?"; aqParams.push(userId);
    }

    const [[aqRow]] = await pool.query(
      `SELECT
         COUNT(*)                                                                          AS total,
         SUM(CASE WHEN aq.status = 'open'        THEN 1 ELSE 0 END)                      AS open,
         SUM(CASE WHEN aq.status = 'in_progress' THEN 1 ELSE 0 END)                      AS in_progress,
         SUM(CASE WHEN aq.status = 'resolved'    THEN 1 ELSE 0 END)                      AS resolved,
         SUM(CASE WHEN aq.status = 'closed'      THEN 1 ELSE 0 END)                      AS closed
       FROM asset_queries aq ${aqWhere}`,
      aqParams
    );

    // Combine WO + AQ counts
    const total      = Number(woRow.total      || 0) + Number(aqRow.total     || 0);
    const open       = Number(woRow.open       || 0) + Number(aqRow.open      || 0);
    // For engineers: AQ 'open' items assigned to them are actionable (map to 'assigned' for display)
    const assigned   = Number(woRow.assigned   || 0) + (isHCEngineer(role) ? Number(aqRow.open || 0) : 0);
    const inProgress = Number(woRow.in_progress|| 0) + Number(aqRow.in_progress || 0);
    const resolved   = Number(woRow.resolved   || 0) + Number(aqRow.resolved  || 0);
    const closed     = Number(woRow.closed     || 0) + Number(aqRow.closed    || 0);

    // ── YTD Metrics ───────────────────────────────────────────────────────────
    const currentYear = new Date().getFullYear();
    const ytdMetrics = Array(12).fill(0);
    
    const [woMonthly] = await pool.query(
      `SELECT MONTH(created_at) as month, COUNT(*) as count 
       FROM work_orders wo ${woWhere} AND YEAR(created_at) = ?
       GROUP BY MONTH(created_at)`,
      [...woParams, currentYear]
    );
    const [aqMonthly] = await pool.query(
      `SELECT MONTH(created_at) as month, COUNT(*) as count 
       FROM asset_queries aq ${aqWhere} AND YEAR(created_at) = ?
       GROUP BY MONTH(created_at)`,
      [...aqParams, currentYear]
    );

    for (const r of woMonthly) { if (r.month >= 1 && r.month <= 12) ytdMetrics[r.month - 1] += Number(r.count); }
    for (const r of aqMonthly) { if (r.month >= 1 && r.month <= 12) ytdMetrics[r.month - 1] += Number(r.count); }

    // Admin: per-engineer breakdown (WO + AQ combined)
    let engineerStats = [];
    if (isHCAdmin(role)) {
      const [woEngRows] = await pool.query(
        `SELECT cu.full_name AS engineer_name,
                COUNT(*) AS total,
                SUM(CASE WHEN wo.status IN ('open','assigned') THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN wo.status = 'in_progress'        THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN wo.status = 'resolved'           THEN 1 ELSE 0 END) AS resolved
         FROM work_orders wo
         JOIN company_users cu ON cu.id = wo.cp_assigned_to
         WHERE wo.company_id = ? AND wo.cp_assigned_to IS NOT NULL
         GROUP BY wo.cp_assigned_to, cu.full_name`,
        [companyId]
      );
      const [aqEngRows] = await pool.query(
        `SELECT cu.full_name AS engineer_name,
                COUNT(*) AS total,
                SUM(CASE WHEN aq.status = 'open' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN aq.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
                SUM(CASE WHEN aq.status = 'resolved' THEN 1 ELSE 0 END) AS resolved
         FROM asset_queries aq
         JOIN company_users cu ON cu.id = aq.assigned_to
         WHERE aq.company_id = ? AND aq.assigned_to IS NOT NULL
         GROUP BY aq.assigned_to, cu.full_name`,
        [companyId]
      );
      // Merge by engineer name
      const engMap = new Map();
      for (const r of [...woEngRows, ...aqEngRows]) {
        const existing = engMap.get(r.engineer_name) || { engineer_name: r.engineer_name, total: 0, pending: 0, in_progress: 0, resolved: 0 };
        existing.total       += Number(r.total       || 0);
        existing.pending     += Number(r.pending     || 0);
        existing.in_progress += Number(r.in_progress || 0);
        existing.resolved    += Number(r.resolved    || 0);
        engMap.set(r.engineer_name, existing);
      }
      engineerStats = [...engMap.values()].sort((a, b) => b.total - a.total);
    }

    res.json({ total, open, assigned, inProgress, resolved, closed, engineerStats, ytdMetrics });
  } catch (err) { next(err); }
});
router.get("/engineers", async (req, res, next) => {
  try {
    const { companyId, role } = req.companyUser;
    if (!isHCAdmin(role)) return res.status(403).json({ message: "Admin only" });

    const [rows] = await pool.query(
      `SELECT id, full_name AS fullName, designation, phone
         FROM company_users
        WHERE company_id = ? AND role = 'engineer' AND status = 'Active'
        ORDER BY full_name`,
      [companyId]
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

// ─── GET / ─────────────────────────────────────────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const { id: userId, companyId, role } = req.companyUser;
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(100, Number(req.query.limit || 30));
    const offset = (page - 1) * limit;
    const status = req.query.status || "";

    // ── Work orders (Mobile Case Log) ─────────────────────────────────────────
    let woWhere = "WHERE wo.company_id = ? AND wo.source_label = 'Mobile Case Log'";
    const woParams = [companyId];
    if (isHCStaff(role))     { woWhere += " AND wo.company_user_id = ?"; woParams.push(userId); }
    else if (isHCEngineer(role)) { woWhere += " AND wo.cp_assigned_to = ?"; woParams.push(userId); }
    if (status && status !== "all") { woWhere += " AND wo.status = ?"; woParams.push(status); }

    // ── Asset queries (QR Scan requests) ──────────────────────────────────────
    let aqWhere = "WHERE aq.company_id = ?";
    const aqParams = [companyId];
    if (isHCStaff(role))     { aqWhere += " AND aq.raised_by = ?"; aqParams.push(userId); }
    else if (isHCEngineer(role)) { aqWhere += " AND aq.assigned_to = ?"; aqParams.push(userId); }
    // Map status filter: 'assigned' → 'in_progress' for AQ (no 'assigned' status in AQ)
    if (status && status !== "all") {
      const aqStatus = status === 'assigned' ? 'in_progress' : status;
      aqWhere += " AND aq.status = ?"; aqParams.push(aqStatus);
    }

    const [woRows] = await pool.query(
      `SELECT
         wo.id, wo.work_order_number, wo.asset_name, wo.location,
         wo.issue_description, wo.priority, wo.status, wo.completion_note AS remarks,
         'Mobile Case Log' AS source_label, 'work_order' AS source_type,
         wo.created_at,
         cu.full_name AS assigned_to_name,
         a.asset_unique_id,
         raised_by.full_name AS raised_by_name
       FROM work_orders wo
       LEFT JOIN company_users cu      ON cu.id = wo.cp_assigned_to
       LEFT JOIN assets a              ON a.id  = wo.asset_id
       LEFT JOIN departments d         ON d.id  = a.department_id
       LEFT JOIN company_users raised_by ON raised_by.id = wo.company_user_id
       ${woWhere}
       ORDER BY wo.created_at DESC`,
      woParams
    );

    const [aqRows] = await pool.query(
      `SELECT
         aq.id, CONCAT('AQ-', aq.id) AS work_order_number,
         a.asset_name AS asset_name,
         CONCAT_WS(', ', a.building, a.floor, a.room) AS location,
         COALESCE(NULLIF(aq.description, ''), aq.title) AS issue_description, aq.priority, aq.status,
         aq.resolution_note AS remarks,
         'QR Scan' AS source_label, 'asset_query' AS source_type,
         aq.created_at,
         cu.full_name AS assigned_to_name,
         a.asset_unique_id,
         raised_by.full_name AS raised_by_name
       FROM asset_queries aq
       LEFT JOIN assets a              ON a.id  = aq.asset_id
       LEFT JOIN company_users cu      ON cu.id = aq.assigned_to
       LEFT JOIN company_users raised_by ON raised_by.id = aq.raised_by
       ${aqWhere}
       ORDER BY aq.created_at DESC`,
      aqParams
    );

    // Merge and sort by created_at desc, then paginate
    const merged = [...woRows, ...aqRows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = merged.length;
    const rows = merged.slice(offset, offset + limit);

    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { next(err); }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const { id: userId, companyId, role } = req.companyUser;
    const { id } = req.params;
    const sourceType = req.query.source_type || 'work_order';

    // ── Asset query (QR scan) detail ──────────────────────────────────────────
    if (sourceType === 'asset_query') {
      const [[aq]] = await pool.query(
        `SELECT
           aq.id, CONCAT('AQ-', aq.id) AS work_order_number,
           a.asset_name AS asset_name,
           CONCAT_WS(', ', a.building, a.floor, a.room) AS location,
           COALESCE(NULLIF(aq.description, ''), aq.title) AS issue_description, aq.priority, aq.status,
           aq.resolution_note AS remarks,
           'QR Scan' AS source_label, 'asset_query' AS source_type,
           aq.created_at,
           cu.full_name AS assigned_to_name,
           cu.designation AS assigned_to_designation,
           d.name AS department_name,
           a.asset_unique_id, a.asset_type, a.asset_category,
           raised_by.full_name AS raised_by_name,
           raised_by.role AS raised_by_role
         FROM asset_queries aq
         LEFT JOIN assets a              ON a.id  = aq.asset_id
         LEFT JOIN departments d         ON d.id  = a.department_id
         LEFT JOIN company_users cu      ON cu.id = aq.assigned_to
         LEFT JOIN company_users raised_by ON raised_by.id = aq.raised_by
         WHERE aq.id = ? AND aq.company_id = ?`,
        [id, companyId]
      );
      if (!aq) return res.status(404).json({ message: "Request not found" });
      return res.json({ data: aq });
    }

    // ── Work order (Mobile Case Log) detail ───────────────────────────────────
    const [[wo]] = await pool.query(
      `SELECT
         wo.id, wo.work_order_number, wo.asset_name, wo.location,
         wo.issue_description, wo.priority, wo.status, wo.completion_note AS remarks,
         wo.source_label, wo.created_at,
         wo.cp_assigned_to, wo.asset_id,
         cu.full_name AS assigned_to_name,
         cu.designation AS assigned_to_designation,
         d.name AS department_name,
         a.asset_unique_id, a.asset_type, a.asset_category,
         raised_by.full_name AS raised_by_name,
         raised_by.role AS raised_by_role
       FROM work_orders wo
       LEFT JOIN company_users cu      ON cu.id = wo.cp_assigned_to
       LEFT JOIN assets a              ON a.id  = wo.asset_id
       LEFT JOIN departments d         ON d.id  = a.department_id
       LEFT JOIN company_users raised_by ON raised_by.id = wo.company_user_id
       WHERE wo.id = ? AND wo.company_id = ? AND wo.source_label = 'Mobile Case Log'`,
      [id, companyId]
    );

    if (!wo) return res.status(404).json({ message: "Case log not found" });
    res.json({ data: wo });
  } catch (err) { next(err); }
});

// ─── POST / — create case log ─────────────────────────────────────────────────
router.post("/", requirePermission("case_log:create"), async (req, res, next) => {
  try {
    const { id: userId, companyId, role } = req.companyUser;
    const { assetId, assetName, location, issueDescription, priority = "medium", departmentId } = req.body;

    if (!issueDescription) return res.status(400).json({ message: "Issue description is required" });

    // Generate work order number
    const [[{ cnt }]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM work_orders WHERE company_id = ?", [companyId]
    );
    const woNumber = `CL-${String(Number(cnt) + 1).padStart(4, '0')}`;

    // Build dynamic INSERT — omit asset_id column if not provided
    const safeName = assetName || (assetId ? null : "Manual Entry");
    if (assetId) {
      const [result] = await pool.query(
        `INSERT INTO work_orders
           (company_id, work_order_number, asset_id, asset_name, location,
            issue_description, priority, status, source_label,
            company_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'Mobile Case Log', ?, NOW())`,
        [companyId, woNumber, assetId, safeName, location || null, issueDescription, priority, userId]
      );
      return res.status(201).json({ message: "Case log created", id: result.insertId, workOrderNumber: woNumber });
    } else {
      const [result] = await pool.query(
        `INSERT INTO work_orders
           (company_id, work_order_number, asset_name, location,
            issue_description, priority, status, source_label,
            company_user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', 'Mobile Case Log', ?, NOW())`,
        [companyId, woNumber, safeName, location || null, issueDescription, priority, userId]
      );
      return res.status(201).json({ message: "Case log created", id: result.insertId, workOrderNumber: woNumber });
    }
  } catch (err) { next(err); }
});

// ─── PATCH /:id/status ────────────────────────────────────────────────────────
router.patch("/:id/status", async (req, res, next) => {
  try {
    const { id: userId, companyId, role } = req.companyUser;
    const { id } = req.params;
    const { status, remarks } = req.body;
    const sourceType = req.query.source_type || req.body.source_type || 'work_order';

    // RBAC: map the requested transition to a case-log permission (deny by default)
    const permForStatus = {
      in_progress: "case_log:start",
      resolved:    "case_log:resolve",
      closed:      "case_log:close",
      open:        "case_log:start",   // reopen counts as start
    }[status];
    if (permForStatus) {
      const perms = await getEffectivePermissions(req.companyUser);
      if (!perms.has(permForStatus)) {
        return res.status(403).json({ message: `Permission denied: ${permForStatus} required` });
      }
    }

    // ── Asset query status update ─────────────────────────────────────────────
    if (sourceType === 'asset_query') {
      const [[aq]] = await pool.query(
        "SELECT * FROM asset_queries WHERE id = ? AND company_id = ?",
        [id, companyId]
      );
      if (!aq) return res.status(404).json({ message: "Request not found" });

      const now = new Date();

      // Track in_progress_at (WIP) and resolved_at timestamps
      const aqExtras = [];
      if (status === 'in_progress') {
        aqExtras.push("in_progress_at = COALESCE(in_progress_at, NOW())");
      }
      if (status === 'resolved' || status === 'closed') {
        aqExtras.push("resolved_at = COALESCE(resolved_at, NOW())");
      }
      const aqExtra = aqExtras.length ? ', ' + aqExtras.join(', ') : '';
      await pool.query(
        `UPDATE asset_queries SET status = ?, resolution_note = COALESCE(?, resolution_note)${aqExtra} WHERE id = ?`,
        [status, remarks || null, id]
      );

      // Complete the appropriate SLA clock (fire-and-forget)
      // Only complete if the timestamp wasn't already set (COALESCE preserves existing value)
      if (status === 'in_progress' && !aq.in_progress_at) {
        slaCompleteClock(Number(id), 'attendance', userId, now)
          .catch(e => console.warn('[SLA] completeClock(attendance) failed for query', id, e?.message));
      } else if ((status === 'resolved' || status === 'closed') && !aq.resolved_at) {
        slaCompleteClock(Number(id), 'resolution', userId, now)
          .catch(e => console.warn('[SLA] completeClock(resolution) failed for query', id, e?.message));
      }

      return res.json({ message: "Status updated", status });
    }

    // ── Work order status update ──────────────────────────────────────────────
    const [[wo]] = await pool.query(
      "SELECT * FROM work_orders WHERE id = ? AND company_id = ? AND source_label = 'Mobile Case Log'",
      [id, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Case log not found" });

    // Permission rules
    const allowedTransitions = {
      nurse:    { resolved: ['closed'] },
      doctor:   { resolved: ['closed'] },
      ward_boy: { resolved: ['closed'] },
      engineer: { assigned: ['in_progress'], in_progress: ['resolved'] },
      admin:    { open: ['assigned','in_progress','resolved','closed'], assigned: ['in_progress','resolved','closed'], in_progress: ['resolved','closed'], resolved: ['closed'], closed: ['open'] },
    };
    const r = (role||'').toLowerCase();
    const allowed = allowedTransitions[r]?.[wo.status] || [];
    if (!isHCAdmin(role) && !allowed.includes(status)) {
      return res.status(403).json({ message: `Cannot transition from '${wo.status}' to '${status}'` });
    }

    const updates = { status, updated_at: new Date() };
    if (remarks) updates.remarks = remarks;

    await pool.query(
      `UPDATE work_orders SET
         status = ?,
         completion_note = COALESCE(?, completion_note),
         wip_at = CASE WHEN ? = 'in_progress' AND wip_at IS NULL THEN NOW() ELSE wip_at END,
         resolution_at = CASE WHEN ? IN ('resolved','completed','closed') AND resolution_at IS NULL THEN NOW() ELSE resolution_at END
       WHERE id = ?`,
      [status, remarks || null, status, status, id]
    );

    // If engineer resolves, notify the original raiser
    if (status === 'resolved' && wo.company_user_id) {
      const [[raiser]] = await pool.query(
        "SELECT full_name, push_token FROM company_users WHERE id = ? AND company_id = ?",
        [wo.company_user_id, companyId]
      );
      if (raiser) {
        const [[engineer]] = await pool.query(
          "SELECT full_name FROM company_users WHERE id = ?", [userId]
        );
        const engineerName = engineer?.full_name || "Engineer";
        const woNum = wo.work_order_number || `#${id}`;
        const noteText = remarks ? `: "${remarks}"` : "";
        const title = `✅ Case ${woNum} Resolved`;
        const body = `Resolved by ${engineerName}${noteText}`;

        await createInAppNotification(companyId, wo.company_user_id, title, body);
        if (raiser.push_token) {
          await sendExpoPush(raiser.push_token, title, body, {
            screen: '/(tabs)/home',
            workOrderId: Number(id),
          });
        }
      }
    }

    res.json({ message: "Status updated", status });
  } catch (err) { next(err); }
});

// ─── PATCH /:id/remarks ───────────────────────────────────────────────────────
router.patch("/:id/remarks", async (req, res, next) => {
  try {
    const { id: userId, companyId, role } = req.companyUser;
    const { id } = req.params;
    const { remarks } = req.body;
    const sourceType = req.query.source_type || req.body.source_type || "work_order";

    if (!remarks) return res.status(400).json({ message: "Remarks are required" });
    if (!isHCEngineer(role) && !isHCAdmin(role))
      return res.status(403).json({ message: "Only engineers can add remarks" });

    if (sourceType === "asset_query") {
      const [[aq]] = await pool.query(
        "SELECT id FROM asset_queries WHERE id = ? AND company_id = ?",
        [id, companyId]
      );
      if (!aq) return res.status(404).json({ message: "Case log not found" });
      await pool.query("UPDATE asset_queries SET resolution_note = ? WHERE id = ?", [remarks, id]);
    } else {
      const [[wo]] = await pool.query(
        "SELECT id FROM work_orders WHERE id = ? AND company_id = ? AND source_label = 'Mobile Case Log'",
        [id, companyId]
      );
      if (!wo) return res.status(404).json({ message: "Case log not found" });
      await pool.query("UPDATE work_orders SET completion_note = ? WHERE id = ?", [remarks, id]);
    }

    res.json({ message: "Remarks saved" });
  } catch (err) { next(err); }
});

// ─── PATCH /:id/assign ────────────────────────────────────────────────────────
router.patch("/:id/assign", requirePermission("case_log:assign"), async (req, res, next) => {
  try {
    const { companyId, role } = req.companyUser;
    if (!isHCAdmin(role)) return res.status(403).json({ message: "Admin only" });

    const { id } = req.params;
    const { engineerId } = req.body;
    if (!engineerId) return res.status(400).json({ message: "engineerId is required" });

    const [[wo]] = await pool.query(
      "SELECT id FROM work_orders WHERE id = ? AND company_id = ? AND source_label = 'Mobile Case Log'",
      [id, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Case log not found" });

    await pool.query(
      "UPDATE work_orders SET cp_assigned_to = ?, status = 'assigned', updated_at = NOW() WHERE id = ?",
      [engineerId, id]
    );
    res.json({ message: "Assigned successfully" });
  } catch (err) { next(err); }
});

export default router;
