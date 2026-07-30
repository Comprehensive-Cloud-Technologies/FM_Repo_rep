/**
 * assetTransfer.js — Enhanced Asset Transfer Module
 * Prefix: /api/company-portal/assets  (registered in app.js BEFORE companyPortalRouter)
 *
 * POST  /:id/transfer           — execute transfer (admin only)
 * GET   /:id/transfer-history   — full transfer timeline with audit trail
 * GET   /:id/full-history       — work orders + queries across ALL companies
 * GET   /:id/calibration-records— calibration history across ALL companies
 * GET   /transfer/companies     — list all active companies for destination picker
 * GET   /transfer/departments   — departments for a given company
 */

import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();
router.use(requireCompanyAuth);

// ── Auto-migration ────────────────────────────────────────────────────────────
(async () => {
  const safe = async (sql) => {
    try { await pool.query(sql); }
    catch (e) {
      if (!e.message?.includes("Duplicate") && !e.message?.includes("already exists")) {
        console.warn("[assetTransfer] migration:", e.message);
      }
    }
  };

  await safe(`CREATE TABLE IF NOT EXISTS asset_transfers (
    id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    transfer_reference    VARCHAR(20) NULL,
    asset_id              INT UNSIGNED NOT NULL,
    from_company_id       INT UNSIGNED NOT NULL,
    to_company_id         INT UNSIGNED NOT NULL,
    from_company_name     VARCHAR(200) NULL,
    to_company_name       VARCHAR(200) NULL,
    from_department_id    INT UNSIGNED NULL,
    from_department_name  VARCHAR(200) NULL,
    to_department_id      INT UNSIGNED NULL,
    to_department_name    VARCHAR(200) NULL,
    from_assigned_to      INT UNSIGNED NULL,
    transferred_by        INT UNSIGNED NOT NULL,
    transferred_by_name   VARCHAR(160) NULL,
    transferred_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reason                TEXT NULL,
    remarks               TEXT NULL,
    notes                 TEXT NULL,
    status                ENUM("completed","pending","cancelled") NOT NULL DEFAULT "completed",
    asset_snapshot        JSON NULL,
    PRIMARY KEY (id),
    KEY idx_at_asset     (asset_id),
    KEY idx_at_from_co   (from_company_id),
    KEY idx_at_to_co     (to_company_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // Extend if old schema
  await safe(`ALTER TABLE asset_transfers ADD COLUMN transfer_reference VARCHAR(20) NULL AFTER id`);
  await safe(`ALTER TABLE asset_transfers ADD COLUMN from_department_name VARCHAR(200) NULL AFTER from_department_id`);
  await safe(`ALTER TABLE asset_transfers ADD COLUMN to_department_id INT UNSIGNED NULL AFTER from_department_name`);
  await safe(`ALTER TABLE asset_transfers ADD COLUMN to_department_name VARCHAR(200) NULL AFTER to_department_id`);
  await safe(`ALTER TABLE asset_transfers ADD COLUMN reason TEXT NULL AFTER transferred_at`);
  await safe(`ALTER TABLE asset_transfers ADD COLUMN remarks TEXT NULL AFTER reason`);
  await safe(`ALTER TABLE asset_transfers ADD COLUMN status ENUM("completed","pending","cancelled") NOT NULL DEFAULT "completed" AFTER remarks`);
  await safe(`ALTER TABLE asset_transfers ADD COLUMN notes TEXT NULL`);

  // Assets table extensions
  await safe(`ALTER TABLE assets ADD COLUMN transfer_count INT NOT NULL DEFAULT 0`);
  await safe(`ALTER TABLE assets ADD COLUMN original_company_id INT UNSIGNED NULL`);
  await safe(`ALTER TABLE assets ADD COLUMN last_transferred_at DATETIME NULL`);
  await safe(`ALTER TABLE assets ADD COLUMN last_transferred_from_name VARCHAR(200) NULL`);
  await safe(`ALTER TABLE assets ADD COLUMN last_transferred_to_name   VARCHAR(200) NULL`);
  await safe(`ALTER TABLE assets ADD COLUMN last_transferred_dept_name VARCHAR(200) NULL`);
})();

// ── Helpers ───────────────────────────────────────────────────────────────────
const cid   = (req) => req.companyUser.companyId;
const uid   = (req) => req.companyUser.id;
const uname = (req) => req.companyUser.fullName || req.companyUser.name || req.companyUser.email || "Unknown";

async function getAccessibleCompanyIds(userId, primaryId) {
  const [extra] = await pool.query(
    `SELECT company_id AS companyId FROM user_company_access WHERE user_id = ?`, [userId]
  ).catch(() => [[]]);
  const ids = new Set([Number(primaryId)]);
  extra.forEach(r => ids.add(Number(r.companyId)));
  return [...ids];
}

async function nextTransferReference() {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM asset_transfers");
  return `TRF-${String(Number(n) + 1).padStart(5, "0")}`;
}

// ── GET /transfer/companies ───────────────────────────────────────────────────
// Returns only companies accessible to the current user (primary + user_company_access rows)
router.get("/transfer/companies", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const accessibleIds = await getAccessibleCompanyIds(uid(req), cid(req));
    if (!accessibleIds.length) return res.json([]);
    const placeholders = accessibleIds.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT id, company_name AS companyName, status
       FROM companies WHERE id IN (${placeholders}) AND status = "Active" ORDER BY company_name`,
      accessibleIds
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /transfer/departments?companyId=X ─────────────────────────────────────
router.get("/transfer/departments", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    // Verify the requested company is accessible to this user
    const accessibleIds = await getAccessibleCompanyIds(uid(req), cid(req));
    if (!accessibleIds.includes(companyId)) return res.status(403).json({ message: "Access denied to this company" });
    const [rows] = await pool.query(
      `SELECT id, name AS departmentName FROM departments WHERE company_id = ? ORDER BY name`,
      [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /transfer/company-history — all transfers in/out of this company ──────
router.get("/transfer/company-history", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin") return res.status(403).json({ message: "Admin only" });
    const companyId = cid(req);
    const { page = 1, limit = 50, search = "" } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = `WHERE (at.from_company_id = ? OR at.to_company_id = ?)`;
    const params = [companyId, companyId];

    if (search) {
      where += ` AND (a.asset_name LIKE ? OR a.generated_asset_id LIKE ? OR at.transfer_reference LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM asset_transfers at
       JOIN assets a ON a.id = at.asset_id
       ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT at.id, at.transfer_reference, at.asset_id,
              a.asset_name AS assetName, a.generated_asset_id AS assetCode,
              at.from_company_id, at.to_company_id,
              at.from_company_name, at.to_company_name,
              at.from_department_name, at.to_department_name,
              at.transferred_by_name, at.transferred_at,
              at.reason, at.remarks, at.status,
              CASE WHEN at.to_company_id = ? THEN 'in' ELSE 'out' END AS direction
       FROM asset_transfers at
       JOIN assets a ON a.id = at.asset_id
       ${where}
       ORDER BY at.transferred_at DESC
       LIMIT ? OFFSET ?`,
      [companyId, ...params, Number(limit), offset]
    );

    res.json({ total: Number(total), page: Number(page), rows });
  } catch (err) { next(err); }
});

// ── POST /bulk-transfer — transfer multiple assets at once ────────────────────
router.post("/bulk-transfer", async (req, res, next) => {
  try {
    if (req.companyUser.role !== "admin")
      return res.status(403).json({ message: "Only admin users can transfer assets" });

    const { assetIds = [], toCompanyId, toDepartmentId, reason = "", remarks = "" } = req.body;
    if (!assetIds.length) return res.status(400).json({ message: "assetIds required" });
    if (!toCompanyId)    return res.status(400).json({ message: "toCompanyId required" });

    const toId    = Number(toCompanyId);
    const fromId  = cid(req);
    const toDeptId = toDepartmentId ? Number(toDepartmentId) : null;

    const [[toCo]]   = await pool.query("SELECT company_name FROM companies WHERE id = ?", [toId]);
    const [[fromCo]] = await pool.query("SELECT company_name FROM companies WHERE id = ?", [fromId]);
    if (!toCo) return res.status(404).json({ message: "Target company not found" });

    const fromName = fromCo?.company_name || `Company ${fromId}`;
    const toName   = toCo.company_name;

    let toDeptName = null;
    if (toDeptId) {
      const [[dept]] = await pool.query(
        "SELECT name FROM departments WHERE id = ? AND company_id = ?", [toDeptId, toId]
      );
      if (!dept) return res.status(404).json({ message: "Target department not found" });
      toDeptName = dept.name;
    }

    const results = [];
    for (const rawId of assetIds) {
      const assetId = Number(rawId);
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [[asset]] = await conn.query(
          `SELECT a.id, a.asset_name, a.department_id, a.assigned_to,
                  a.generated_asset_id, a.transfer_count, a.original_company_id,
                  d.name AS deptName
           FROM assets a
           LEFT JOIN departments d ON d.id = a.department_id
           WHERE a.id = ? AND a.company_id = ?`,
          [assetId, fromId]
        );
        if (!asset) { results.push({ assetId, ok: false, message: "Not found in your company" }); await conn.rollback(); conn.release(); continue; }

        if (toId === fromId && (!toDeptId || toDeptId === asset.department_id)) {
          results.push({ assetId, ok: false, message: "Already in this company/department" });
          await conn.rollback(); conn.release(); continue;
        }

        const transferRef = await nextTransferReference();
        const snapshot = { assetId: asset.id, assetName: asset.asset_name, companyId: fromId, companyName: fromName, departmentId: asset.department_id, departmentName: asset.deptName, snapshotAt: new Date().toISOString() };

        await conn.query(
          `INSERT INTO asset_transfers
             (transfer_reference, asset_id, from_company_id, to_company_id,
              from_company_name, to_company_name,
              from_department_id, from_department_name, to_department_id, to_department_name,
              from_assigned_to, transferred_by, transferred_by_name,
              reason, remarks, status, asset_snapshot)
           VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,"completed",?)`,
          [transferRef, assetId, fromId, toId, fromName, toName,
           asset.department_id || null, asset.deptName || null, toDeptId, toDeptName,
           asset.assigned_to || null, uid(req), uname(req),
           reason.trim() || null, remarks.trim() || null, JSON.stringify(snapshot)]
        );

        const newCount = (asset.transfer_count || 0) + 1;
        const origCoId = asset.original_company_id || fromId;

        await conn.query(
          `UPDATE assets
           SET company_id = ?, department_id = ?,
               assigned_to = NULL, assigned_by = NULL, assigned_at = NULL,
               transfer_count = ?, original_company_id = ?,
               last_transferred_at = NOW(),
               last_transferred_from_name = ?,
               last_transferred_to_name = ?,
               last_transferred_dept_name = ?
           WHERE id = ?`,
          [toId, toDeptId, newCount, origCoId, fromName, toName, toDeptName, assetId]
        );

        await conn.query("UPDATE asset_pre_qr SET company_id = ? WHERE asset_id = ?", [toId, assetId]).catch(() => {});
        await conn.commit();
        results.push({ assetId, ok: true, transferReference: transferRef, assetName: asset.asset_name });
      } catch (e) {
        await conn.rollback();
        results.push({ assetId, ok: false, message: e.message });
      } finally { conn.release(); }
    }

    const succeeded = results.filter(r => r.ok).length;
    const failed    = results.filter(r => !r.ok).length;
    res.json({
      ok: failed === 0,
      succeeded, failed, total: assetIds.length,
      message: `${succeeded} asset(s) transferred to ${toName}${toDeptName ? ` / ${toDeptName}` : ""}. ${failed > 0 ? `${failed} failed.` : ""}`,
      results,
    });
  } catch (err) { next(err); }
});

// ── POST /:id/transfer ────────────────────────────────────────────────────────
router.post("/:id/transfer", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (req.companyUser.role !== "admin")
      return res.status(403).json({ message: "Only admin users can transfer assets" });

    const assetId    = Number(req.params.id);
    const { toCompanyId, toDepartmentId, reason = "", remarks = "" } = req.body;

    if (!toCompanyId || isNaN(Number(toCompanyId)))
      return res.status(400).json({ message: "toCompanyId is required" });

    const toId    = Number(toCompanyId);
    const fromId  = cid(req);
    const toDeptId = toDepartmentId ? Number(toDepartmentId) : null;

    // Fetch asset
    const [[asset]] = await conn.query(
      `SELECT a.id, a.asset_name, a.company_id, a.department_id, a.assigned_to,
              a.generated_asset_id, a.asset_unique_id,
              a.transfer_count, a.original_company_id,
              d.name AS deptName, ad.metadata
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ? AND a.company_id = ?`,
      [assetId, fromId]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found in your company" });

    // Prevent no-op transfers
    if (toId === fromId && (!toDeptId || toDeptId === asset.department_id))
      return res.status(400).json({ message: "Asset is already in this company and department" });

    // Block if pending
    const [[pending]] = await conn.query(
      `SELECT id FROM asset_transfers WHERE asset_id = ? AND status = "pending" LIMIT 1`,
      [assetId]
    );
    if (pending) return res.status(409).json({ message: "A pending transfer for this asset already exists" });

    // Company names
    const [[toCo]]   = await conn.query("SELECT company_name FROM companies WHERE id = ?", [toId]);
    const [[fromCo]] = await conn.query("SELECT company_name FROM companies WHERE id = ?", [fromId]);
    if (!toCo) return res.status(404).json({ message: "Target company not found" });

    const fromName = fromCo?.company_name || `Company ${fromId}`;
    const toName   = toCo.company_name    || `Company ${toId}`;

    // Department name for destination
    let toDeptName = null;
    if (toDeptId) {
      const [[dept]] = await conn.query(
        "SELECT name FROM departments WHERE id = ? AND company_id = ?", [toDeptId, toId]
      );
      if (!dept) return res.status(404).json({ message: "Target department not found in destination company" });
      toDeptName = dept.name;
    }
    const fromDeptName = asset.deptName || null;

    // Snapshot + reference
    const transferRef = await nextTransferReference();
    let metaSnapshot = {};
    try { metaSnapshot = typeof asset.metadata === "string" ? JSON.parse(asset.metadata) : (asset.metadata || {}); } catch {}

    const snapshot = {
      assetId: asset.id, assetName: asset.asset_name, generatedAssetId: asset.generated_asset_id,
      companyId: fromId, companyName: fromName,
      departmentId: asset.department_id, departmentName: fromDeptName,
      assignedTo: asset.assigned_to, snapshotAt: new Date().toISOString(),
    };

    // 1. Insert transfer record
    await conn.query(
      `INSERT INTO asset_transfers
         (transfer_reference, asset_id,
          from_company_id, to_company_id, from_company_name, to_company_name,
          from_department_id, from_department_name, to_department_id, to_department_name,
          from_assigned_to, transferred_by, transferred_by_name,
          reason, remarks, status, asset_snapshot)
       VALUES (?,?, ?,?,?,?, ?,?,?,?, ?,?,?, ?,?,"completed",?)`,
      [
        transferRef, assetId,
        fromId, toId, fromName, toName,
        asset.department_id || null, fromDeptName, toDeptId, toDeptName,
        asset.assigned_to || null, uid(req), uname(req),
        reason.trim() || null, remarks.trim() || null,
        JSON.stringify(snapshot),
      ]
    );

    // 2. Update asset
    const newCount = (asset.transfer_count || 0) + 1;
    const origCoId = asset.original_company_id || fromId;

    await conn.query(
      `UPDATE assets
       SET company_id = ?, department_id = ?,
           assigned_to = NULL, assigned_by = NULL, assigned_at = NULL,
           transfer_count = ?, original_company_id = ?,
           last_transferred_at = NOW(),
           last_transferred_from_name = ?,
           last_transferred_to_name = ?,
           last_transferred_dept_name = ?
       WHERE id = ?`,
      [toId, toDeptId, newCount, origCoId, fromName, toName, toDeptName, assetId]
    );

    // 3. Update QR lookup
    await conn.query("UPDATE asset_pre_qr SET company_id = ? WHERE asset_id = ?", [toId, assetId]).catch(() => {});

    await conn.commit();
    res.json({
      ok: true, transferReference: transferRef,
      message: `Transferred from ${fromName}${fromDeptName ? ` / ${fromDeptName}` : ""} → ${toName}${toDeptName ? ` / ${toDeptName}` : ""}`,
      assetId, fromCompany: fromName, fromDepartment: fromDeptName,
      toCompany: toName, toDepartment: toDeptName, transferCount: newCount,
    });
  } catch (err) { await conn.rollback(); next(err); }
  finally { conn.release(); }
});

// ── GET /:id/transfer-history ─────────────────────────────────────────────────
router.get("/:id/transfer-history", async (req, res, next) => {
  try {
    const assetId = Number(req.params.id);
    const ids = await getAccessibleCompanyIds(uid(req), cid(req));

    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_name, a.generated_asset_id, a.asset_unique_id,
              a.company_id, a.department_id, a.transfer_count, a.original_company_id,
              a.last_transferred_at, a.last_transferred_from_name,
              a.last_transferred_to_name, a.last_transferred_dept_name,
              d.name AS currentDepartmentName, co.company_name AS currentCompanyName
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN companies co ON co.id = a.company_id
       WHERE a.id = ? AND a.company_id IN (${ids.map(() => "?").join(",")})`,
      [assetId, ...ids]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const [transfers] = await pool.query(
      `SELECT id, transfer_reference, asset_id,
              from_company_id, to_company_id, from_company_name, to_company_name,
              from_department_id, from_department_name, to_department_id, to_department_name,
              from_assigned_to, transferred_by, transferred_by_name,
              transferred_at, reason, remarks, notes, status
       FROM asset_transfers WHERE asset_id = ? ORDER BY transferred_at ASC`,
      [assetId]
    );

    res.json({
      asset: {
        id: asset.id, assetName: asset.asset_name,
        generatedAssetId: asset.generated_asset_id,
        currentCompanyId: asset.company_id,
        currentCompanyName: asset.currentCompanyName,
        currentDepartmentName: asset.currentDepartmentName,
        transferCount: asset.transfer_count || 0,
        originalCompanyId: asset.original_company_id,
        lastTransferredAt: asset.last_transferred_at,
        lastTransferredFromName: asset.last_transferred_from_name,
        lastTransferredToName: asset.last_transferred_to_name,
        lastTransferredDeptName: asset.last_transferred_dept_name,
      },
      transfers,
    });
  } catch (err) { next(err); }
});

// ── GET /:id/full-history — cross-company history ─────────────────────────────
router.get("/:id/full-history", async (req, res, next) => {
  try {
    const assetId = Number(req.params.id);
    const ids = await getAccessibleCompanyIds(uid(req), cid(req));
    const [[asset]] = await pool.query(
      `SELECT id FROM assets WHERE id = ? AND company_id IN (${ids.map(() => "?").join(",")})`,
      [assetId, ...ids]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const [workOrders] = await pool.query(
      `SELECT wo.id, wo.work_order_number AS workOrderNumber,
              wo.issue_description AS issueDescription,
              wo.priority, wo.status, wo.company_id AS companyId,
              co.company_name AS companyName,
              wo.wip_at AS wipAt, wo.resolution_at AS resolutionAt,
              wo.closed_at AS closedAt, wo.created_at AS createdAt,
              cu.full_name AS assignedToName, wo.resolution_note AS resolutionNote
       FROM work_orders wo
       LEFT JOIN companies co ON co.id = wo.company_id
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       WHERE wo.asset_id = ? ORDER BY wo.created_at DESC LIMIT 500`,
      [assetId]
    );

    const [assetQueries] = await pool.query(
      `SELECT aq.id, aq.company_id AS companyId, co.company_name AS companyName,
              aq.status, aq.description,
              aq.in_progress_at AS wipAt, aq.resolved_at AS resolutionAt,
              aq.resolved_at AS closedAt, aq.created_at AS createdAt,
              cu.full_name AS assignedToName
       FROM asset_queries aq
       LEFT JOIN companies co ON co.id = aq.company_id
       LEFT JOIN company_users cu ON cu.id = aq.assigned_to
       WHERE aq.asset_id = ? ORDER BY aq.created_at DESC LIMIT 500`,
      [assetId]
    );

    const [pmsHistory] = await pool.query(
      `SELECT psa.id AS psaId, psa.status AS psaStatus,
              psa.completed_at AS completedAt, psa.submitted_at AS submittedAt,
              psa.engineer_name AS engineerName,
              ps.schedule_number AS scheduleNumber,
              ps.maintenance_date AS maintenanceDate, ps.frequency,
              ps.company_id AS companyId, co.company_name AS companyName,
              pc.checklist_name AS checklistName
       FROM pms_schedule_assets psa
       JOIN pms_schedules ps ON ps.id = psa.schedule_id
       LEFT JOIN companies co ON co.id = ps.company_id
       LEFT JOIN pms_checklists pc ON pc.id = psa.checklist_id
       WHERE psa.asset_id = ? ORDER BY ps.maintenance_date DESC LIMIT 200`,
      [assetId]
    );

    res.json({
      workOrders: workOrders.map(wo => ({ ...wo, _source: "work_order" })),
      assetQueries: assetQueries.map(aq => ({ ...aq, _source: "asset_query" })),
      pmsHistory,
    });
  } catch (err) { next(err); }
});

// ── GET /:id/calibration-records ──────────────────────────────────────────────
router.get("/:id/calibration-records", async (req, res, next) => {
  try {
    const assetId = Number(req.params.id);
    const ids = await getAccessibleCompanyIds(uid(req), cid(req));
    const [[asset]] = await pool.query(
      `SELECT id FROM assets WHERE id = ? AND company_id IN (${ids.map(() => "?").join(",")})`,
      [assetId, ...ids]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const [rows] = await pool.query(
      `SELECT csa.id, csa.status, csa.completed_at AS completedAt,
              csa.vendor_name AS vendorName, csa.notes,
              cs.schedule_number AS scheduleNumber,
              cs.calibration_date AS calibrationDate, cs.frequency,
              cs.company_id AS companyId, co.company_name AS companyName
       FROM calibration_schedule_assets csa
       JOIN calibration_schedules cs ON cs.id = csa.schedule_id
       LEFT JOIN companies co ON co.id = cs.company_id
       WHERE csa.asset_id = ?
       ORDER BY cs.calibration_date DESC LIMIT 200`,
      [assetId]
    ).catch(() => [[]]);

    res.json(rows || []);
  } catch (err) { next(err); }
});

export default router;
