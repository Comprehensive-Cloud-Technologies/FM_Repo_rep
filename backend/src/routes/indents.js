/**
 * Part Indents — spare-part request, approval & inventory movement.
 * Prefix: /api/company-portal/indents
 *
 * PHASE 1: engineer raises an indent (from a ticket), admin approves/rejects,
 * stock is reserved on approval and consumed on issue. All stock changes go
 * through a ledger (part_stock_ledger) so quantities are auditable and never
 * drift. Later phases add procurement (vendor/PO/GRN) and finance (bills).
 *
 * Inventory model (parts table):
 *   total_quantity     = physical on-hand
 *   reserved_quantity  = held by approved-but-not-issued indents
 *   available_quantity = total - reserved  (kept denormalised for fast reads)
 *
 * Movements:
 *   reserve  (approve)         reserved += q
 *   issue    (dispatch/consume) total -= q, reserved -= q
 *   release  (reject/cancel)   reserved -= q
 *   grn      (procurement)     total += q                 [phase 2]
 */
import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;
const actorName = (req) => req.companyUser.fullName || req.companyUser.email || null;
const isManager = (req) => ["admin", "supervisor", "catalyst_admin"].includes((req.companyUser.role || "").toLowerCase());

// Statuses (phase 1 terminal state is "issued")
const STATUS = {
  PENDING: "pending_approval",
  APPROVED: "approved",
  ISSUED: "issued",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
};

// ── Auto-migration ──────────────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS part_indents (
        id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id     INT UNSIGNED NOT NULL,
        indent_number  VARCHAR(40) DEFAULT NULL,
        ticket_id      INT UNSIGNED DEFAULT NULL,
        asset_id       INT UNSIGNED DEFAULT NULL,
        raised_by      INT UNSIGNED DEFAULT NULL,
        raised_by_name VARCHAR(160) DEFAULT NULL,
        status         VARCHAR(40) NOT NULL DEFAULT 'pending_approval',
        priority       VARCHAR(20) DEFAULT 'normal',
        notes          TEXT DEFAULT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ind_company (company_id),
        KEY idx_ind_status (status),
        KEY idx_ind_asset (asset_id),
        KEY idx_ind_ticket (ticket_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS part_indent_items (
        id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        indent_id      INT UNSIGNED NOT NULL,
        part_id        INT UNSIGNED NOT NULL,
        part_name      VARCHAR(200) DEFAULT NULL,
        qty_requested  INT NOT NULL DEFAULT 1,
        qty_approved   INT DEFAULT NULL,
        qty_issued     INT NOT NULL DEFAULT 0,
        unit_price     DECIMAL(12,2) DEFAULT NULL,
        vendor_id      INT UNSIGNED DEFAULT NULL,
        PRIMARY KEY (id),
        KEY idx_ii_indent (indent_id),
        KEY idx_ii_part (part_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS part_indent_history (
        id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
        indent_id    INT UNSIGNED NOT NULL,
        from_status  VARCHAR(40) DEFAULT NULL,
        to_status    VARCHAR(40) DEFAULT NULL,
        actor_id     INT UNSIGNED DEFAULT NULL,
        actor_name   VARCHAR(160) DEFAULT NULL,
        action       VARCHAR(60) DEFAULT NULL,
        comments     TEXT DEFAULT NULL,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_ih_indent (indent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS part_stock_ledger (
        id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id     INT UNSIGNED NOT NULL,
        part_id        INT UNSIGNED NOT NULL,
        reason         VARCHAR(30) NOT NULL,
        qty            INT NOT NULL,
        delta_total    INT NOT NULL DEFAULT 0,
        delta_reserved INT NOT NULL DEFAULT 0,
        total_after    INT DEFAULT NULL,
        reserved_after INT DEFAULT NULL,
        ref_type       VARCHAR(30) DEFAULT NULL,
        ref_id         INT UNSIGNED DEFAULT NULL,
        actor_id       INT UNSIGNED DEFAULT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_sl_part (part_id),
        KEY idx_sl_ref (ref_type, ref_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // parts needs a reserved_quantity column for the reserve/issue model.
    try { await pool.query(`ALTER TABLE parts ADD COLUMN reserved_quantity INT NOT NULL DEFAULT 0`); } catch { /* exists */ }
  } catch (err) { /* tables may already exist */ }
})();

/**
 * Apply a stock movement inside an open transaction connection.
 * Locks the part row, updates total/reserved/available, and writes a ledger row.
 */
async function applyStockMovement(conn, { companyId, partId, reason, deltaTotal = 0, deltaReserved = 0, qty, refType, refId, actorId }) {
  const [[p]] = await conn.query(
    `SELECT total_quantity AS t, reserved_quantity AS r FROM parts WHERE id = ? AND company_id = ? FOR UPDATE`,
    [partId, companyId]
  );
  if (!p) throw Object.assign(new Error("Part not found"), { status: 404 });
  const newTotal = Math.max(0, Number(p.t) + deltaTotal);
  const newReserved = Math.max(0, Number(p.r) + deltaReserved);
  const newAvail = Math.max(0, newTotal - newReserved);
  await conn.query(
    `UPDATE parts SET total_quantity = ?, reserved_quantity = ?, available_quantity = ? WHERE id = ? AND company_id = ?`,
    [newTotal, newReserved, newAvail, partId, companyId]
  );
  await conn.query(
    `INSERT INTO part_stock_ledger
       (company_id, part_id, reason, qty, delta_total, delta_reserved, total_after, reserved_after, ref_type, ref_id, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [companyId, partId, reason, qty ?? Math.abs(deltaTotal || deltaReserved), deltaTotal, deltaReserved, newTotal, newReserved, refType, refId, actorId]
  );
}

async function addHistory(conn, indentId, fromStatus, toStatus, req, action, comments) {
  await conn.query(
    `INSERT INTO part_indent_history (indent_id, from_status, to_status, actor_id, actor_name, action, comments)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [indentId, fromStatus, toStatus, req.companyUser.id, actorName(req), action, comments || null]
  );
}

// ── POST / — engineer raises an indent ────────────────────────────────────────
router.post("/", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { ticketId = null, assetId = null, priority = "normal", notes = null, items = [] } = req.body || {};
    const clean = (Array.isArray(items) ? items : [])
      .map((it) => ({ partId: Number(it.partId), qty: Math.max(1, Math.trunc(Number(it.qty) || 0)) }))
      .filter((it) => it.partId && it.qty > 0);
    if (!clean.length) return res.status(400).json({ message: "Add at least one part with a quantity" });

    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO part_indents (company_id, ticket_id, asset_id, raised_by, raised_by_name, status, priority, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [cid(req), ticketId || null, assetId || null, req.companyUser.id, actorName(req), STATUS.PENDING, priority, notes]
    );
    const indentId = result.insertId;
    await conn.query(
      `UPDATE part_indents SET indent_number = CONCAT('IND-', YEAR(created_at), '-', LPAD(id, 5, '0')) WHERE id = ?`,
      [indentId]
    );
    // Snapshot part names so the indent reads correctly even if a part is renamed.
    for (const it of clean) {
      const [[pt]] = await conn.query(`SELECT part_name FROM parts WHERE id = ? AND company_id = ?`, [it.partId, cid(req)]);
      await conn.query(
        `INSERT INTO part_indent_items (indent_id, part_id, part_name, qty_requested) VALUES (?, ?, ?, ?)`,
        [indentId, it.partId, pt?.part_name || null, it.qty]
      );
    }
    await addHistory(conn, indentId, null, STATUS.PENDING, req, "created", notes);
    await conn.commit();
    res.status(201).json({ id: indentId, message: "Indent submitted for approval" });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

// ── GET / — list (scope=mine | inbox | all) ───────────────────────────────────
router.get("/", async (req, res, next) => {
  try {
    const { scope = "mine", status } = req.query;
    let where = "WHERE i.company_id = ?";
    const params = [cid(req)];
    if (scope === "mine") { where += " AND i.raised_by = ?"; params.push(req.companyUser.id); }
    else if (scope === "inbox") { where += " AND i.status = ?"; params.push(STATUS.PENDING); }
    // scope=all → managers only
    if (scope === "all" && !isManager(req)) { where += " AND i.raised_by = ?"; params.push(req.companyUser.id); }
    if (status) { where += " AND i.status = ?"; params.push(status); }

    const [rows] = await pool.query(
      `SELECT i.id, i.indent_number AS indentNumber, i.ticket_id AS ticketId, i.asset_id AS assetId,
              i.status, i.priority, i.notes, i.raised_by_name AS raisedByName, i.created_at AS createdAt,
              a.asset_name AS assetName,
              (SELECT COUNT(*) FROM part_indent_items x WHERE x.indent_id = i.id) AS itemCount,
              (SELECT COALESCE(SUM(x.qty_requested),0) FROM part_indent_items x WHERE x.indent_id = i.id) AS totalQty
       FROM part_indents i
       LEFT JOIN assets a ON a.id = i.asset_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT 300`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── GET /:id — full detail (items + history) ──────────────────────────────────
router.get("/:id", async (req, res, next) => {
  try {
    const [[ind]] = await pool.query(
      `SELECT i.*, a.asset_name AS assetName
       FROM part_indents i LEFT JOIN assets a ON a.id = i.asset_id
       WHERE i.id = ? AND i.company_id = ?`,
      [Number(req.params.id), cid(req)]
    );
    if (!ind) return res.status(404).json({ message: "Indent not found" });
    const [items] = await pool.query(
      `SELECT ii.*, p.available_quantity AS partAvailable, p.total_quantity AS partTotal, p.photo_url AS photoUrl
       FROM part_indent_items ii LEFT JOIN parts p ON p.id = ii.part_id
       WHERE ii.indent_id = ? ORDER BY ii.id`,
      [ind.id]
    );
    const [history] = await pool.query(
      `SELECT from_status AS fromStatus, to_status AS toStatus, actor_name AS actorName, action, comments, created_at AS createdAt
       FROM part_indent_history WHERE indent_id = ? ORDER BY id`,
      [ind.id]
    );
    res.json({ ...ind, items, history });
  } catch (err) { next(err); }
});

// ── PATCH /:id/approve — admin approves; reserve stock ────────────────────────
router.patch("/:id/approve", async (req, res, next) => {
  if (!isManager(req)) return res.status(403).json({ message: "Only an admin/supervisor can approve" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ind]] = await conn.query(
      `SELECT * FROM part_indents WHERE id = ? AND company_id = ? FOR UPDATE`,
      [Number(req.params.id), cid(req)]
    );
    if (!ind) { await conn.rollback(); return res.status(404).json({ message: "Indent not found" }); }
    if (ind.status !== STATUS.PENDING) { await conn.rollback(); return res.status(409).json({ message: `Cannot approve an indent that is '${ind.status}'` }); }

    const [items] = await conn.query(`SELECT * FROM part_indent_items WHERE indent_id = ?`, [ind.id]);
    // Optional per-item approved quantities from body { approvals: { itemId: qty } }
    const approvals = req.body?.approvals || {};

    for (const it of items) {
      const approveQty = Math.max(0, Math.trunc(Number(approvals[it.id] ?? it.qty_requested)));
      const [[p]] = await conn.query(`SELECT available_quantity AS a FROM parts WHERE id = ? AND company_id = ? FOR UPDATE`, [it.part_id, cid(req)]);
      if (!p) { await conn.rollback(); return res.status(404).json({ message: `Part #${it.part_id} not found` }); }
      if (approveQty > Number(p.a)) {
        await conn.rollback();
        return res.status(409).json({ message: `Not enough stock for "${it.part_name || 'part'}" — available ${p.a}, requested ${approveQty}. (Procurement for shortfalls arrives in Phase 2.)` });
      }
      await conn.query(`UPDATE part_indent_items SET qty_approved = ? WHERE id = ?`, [approveQty, it.id]);
      if (approveQty > 0) {
        await applyStockMovement(conn, {
          companyId: cid(req), partId: it.part_id, reason: "reserve",
          deltaReserved: approveQty, qty: approveQty, refType: "indent", refId: ind.id, actorId: req.companyUser.id,
        });
      }
    }
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.APPROVED, ind.id]);
    await addHistory(conn, ind.id, ind.status, STATUS.APPROVED, req, "approved", req.body?.comments);
    await conn.commit();
    res.json({ ok: true, message: "Indent approved and stock reserved" });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

// ── PATCH /:id/reject ─────────────────────────────────────────────────────────
router.patch("/:id/reject", async (req, res, next) => {
  if (!isManager(req)) return res.status(403).json({ message: "Only an admin/supervisor can reject" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ind]] = await conn.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ? FOR UPDATE`, [Number(req.params.id), cid(req)]);
    if (!ind) { await conn.rollback(); return res.status(404).json({ message: "Indent not found" }); }
    if (![STATUS.PENDING, STATUS.APPROVED].includes(ind.status)) { await conn.rollback(); return res.status(409).json({ message: `Cannot reject an indent that is '${ind.status}'` }); }
    // Release any reservations made at approval.
    if (ind.status === STATUS.APPROVED) await releaseReservations(conn, ind, req);
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.REJECTED, ind.id]);
    await addHistory(conn, ind.id, ind.status, STATUS.REJECTED, req, "rejected", req.body?.comments);
    await conn.commit();
    res.json({ ok: true, message: "Indent rejected" });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

// ── PATCH /:id/cancel — raiser or manager, before issue ───────────────────────
router.patch("/:id/cancel", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ind]] = await conn.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ? FOR UPDATE`, [Number(req.params.id), cid(req)]);
    if (!ind) { await conn.rollback(); return res.status(404).json({ message: "Indent not found" }); }
    if (ind.raised_by !== req.companyUser.id && !isManager(req)) { await conn.rollback(); return res.status(403).json({ message: "Not allowed" }); }
    if ([STATUS.ISSUED, STATUS.CANCELLED, STATUS.REJECTED].includes(ind.status)) { await conn.rollback(); return res.status(409).json({ message: `Cannot cancel an indent that is '${ind.status}'` }); }
    if (ind.status === STATUS.APPROVED) await releaseReservations(conn, ind, req);
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.CANCELLED, ind.id]);
    await addHistory(conn, ind.id, ind.status, STATUS.CANCELLED, req, "cancelled", req.body?.comments);
    await conn.commit();
    res.json({ ok: true, message: "Indent cancelled" });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

// ── PATCH /:id/issue — consume reserved stock to the asset ─────────────────────
router.patch("/:id/issue", async (req, res, next) => {
  if (!isManager(req)) return res.status(403).json({ message: "Only an admin/supervisor can issue parts" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ind]] = await conn.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ? FOR UPDATE`, [Number(req.params.id), cid(req)]);
    if (!ind) { await conn.rollback(); return res.status(404).json({ message: "Indent not found" }); }
    if (ind.status !== STATUS.APPROVED) { await conn.rollback(); return res.status(409).json({ message: `Only an approved indent can be issued (this is '${ind.status}')` }); }

    const [items] = await conn.query(`SELECT * FROM part_indent_items WHERE indent_id = ?`, [ind.id]);
    for (const it of items) {
      const q = Number(it.qty_approved || 0);
      if (q > 0) {
        await applyStockMovement(conn, {
          companyId: cid(req), partId: it.part_id, reason: "issue",
          deltaTotal: -q, deltaReserved: -q, qty: q, refType: "indent", refId: ind.id, actorId: req.companyUser.id,
        });
        await conn.query(`UPDATE part_indent_items SET qty_issued = ? WHERE id = ?`, [q, it.id]);
      }
    }
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.ISSUED, ind.id]);
    await addHistory(conn, ind.id, ind.status, STATUS.ISSUED, req, "issued", req.body?.comments);
    await conn.commit();
    res.json({ ok: true, message: "Parts issued and stock updated" });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

// ── GET /by-asset/:assetId — indent/order history for the asset detail page ───
router.get("/by-asset/:assetId", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT i.id, i.indent_number AS indentNumber, i.status, i.priority, i.created_at AS createdAt,
              i.raised_by_name AS raisedByName,
              GROUP_CONCAT(CONCAT(ii.part_name, ' ×', COALESCE(ii.qty_approved, ii.qty_requested)) SEPARATOR ', ') AS partsSummary,
              COALESCE(SUM(ii.unit_price * COALESCE(ii.qty_approved, ii.qty_requested)), 0) AS estCost
       FROM part_indents i
       LEFT JOIN part_indent_items ii ON ii.indent_id = i.id
       WHERE i.company_id = ? AND i.asset_id = ?
       GROUP BY i.id
       ORDER BY i.created_at DESC
       LIMIT 100`,
      [cid(req), Number(req.params.assetId)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Release reservations held by an approved indent (used by reject/cancel).
async function releaseReservations(conn, ind, req) {
  const [items] = await conn.query(`SELECT * FROM part_indent_items WHERE indent_id = ?`, [ind.id]);
  for (const it of items) {
    const q = Number(it.qty_approved || 0);
    if (q > 0) {
      await applyStockMovement(conn, {
        companyId: ind.company_id, partId: it.part_id, reason: "release",
        deltaReserved: -q, qty: q, refType: "indent", refId: ind.id, actorId: req.companyUser.id,
      });
    }
  }
}

export default router;
