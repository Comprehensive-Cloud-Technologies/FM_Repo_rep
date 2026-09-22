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
import { isZohoEnabled, ensureVendor as zohoEnsureVendor, createPurchaseOrder as zohoCreatePO, createBill as zohoCreateBill } from "../utils/zohoBooks.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;
const actorName = (req) => req.companyUser.fullName || req.companyUser.email || null;
const isManager = (req) => ["admin", "supervisor", "catalyst_admin"].includes((req.companyUser.role || "").toLowerCase());

// Statuses. Phase 1: pending → approved → issued. Phase 2 adds the procurement
// branch (when stock must be bought): pending → in_procurement → quoted →
// pending_price_approval → po_created → dispatched → received → issued.
const STATUS = {
  PENDING: "pending_approval",
  APPROVED: "approved",
  ISSUED: "issued",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
  // procurement branch
  IN_PROCUREMENT: "in_procurement",
  QUOTED: "quoted",
  PENDING_PRICE: "pending_price_approval",
  PO_CREATED: "po_created",
  DISPATCHED: "dispatched",
  RECEIVED: "received",
};
const canProcure = (req) => ["admin", "supervisor", "catalyst_admin", "purchase", "procurement"].includes((req.companyUser.role || "").toLowerCase());
const canFinance = (req) => ["admin", "catalyst_admin", "finance", "accounts"].includes((req.companyUser.role || "").toLowerCase());

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
        item_status    VARCHAR(20) NOT NULL DEFAULT 'pending',
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
    // per-item approve/reject status
    try { await pool.query(`ALTER TABLE part_indent_items ADD COLUMN item_status VARCHAR(20) NOT NULL DEFAULT 'pending'`); } catch { /* exists */ }

    // ── Phase 2: procurement ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id  INT UNSIGNED NOT NULL,
        name        VARCHAR(200) NOT NULL,
        contact     VARCHAR(160) DEFAULT NULL,
        phone       VARCHAR(40) DEFAULT NULL,
        email       VARCHAR(160) DEFAULT NULL,
        gst         VARCHAR(40) DEFAULT NULL,
        address     TEXT DEFAULT NULL,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id), KEY idx_vendor_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id   INT UNSIGNED NOT NULL,
        po_number    VARCHAR(40) DEFAULT NULL,
        indent_id    INT UNSIGNED DEFAULT NULL,
        vendor_id    INT UNSIGNED DEFAULT NULL,
        vendor_name  VARCHAR(200) DEFAULT NULL,
        total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
        status       VARCHAR(30) NOT NULL DEFAULT 'open',
        created_by   INT UNSIGNED DEFAULT NULL,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id), KEY idx_po_company (company_id), KEY idx_po_indent (indent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS po_items (
        id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        po_id          INT UNSIGNED NOT NULL,
        indent_item_id INT UNSIGNED DEFAULT NULL,
        part_id        INT UNSIGNED DEFAULT NULL,
        part_name      VARCHAR(200) DEFAULT NULL,
        qty            INT NOT NULL DEFAULT 0,
        unit_price     DECIMAL(12,2) NOT NULL DEFAULT 0,
        received_qty   INT NOT NULL DEFAULT 0,
        PRIMARY KEY (id), KEY idx_poi_po (po_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS grn (
        id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id   INT UNSIGNED NOT NULL,
        po_id        INT UNSIGNED DEFAULT NULL,
        indent_id    INT UNSIGNED DEFAULT NULL,
        part_id      INT UNSIGNED DEFAULT NULL,
        received_qty INT NOT NULL DEFAULT 0,
        received_by  INT UNSIGNED DEFAULT NULL,
        received_by_name VARCHAR(160) DEFAULT NULL,
        notes        TEXT DEFAULT NULL,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id), KEY idx_grn_po (po_id), KEY idx_grn_indent (indent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // ── Phase 3: finance / books ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bills (
        id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id   INT UNSIGNED NOT NULL,
        po_id        INT UNSIGNED DEFAULT NULL,
        indent_id    INT UNSIGNED DEFAULT NULL,
        bill_number  VARCHAR(60) DEFAULT NULL,
        amount       DECIMAL(14,2) NOT NULL DEFAULT 0,
        status       VARCHAR(20) NOT NULL DEFAULT 'open',
        external_ref VARCHAR(120) DEFAULT NULL,
        created_by   INT UNSIGNED DEFAULT NULL,
        created_by_name VARCHAR(160) DEFAULT NULL,
        closed_by    INT UNSIGNED DEFAULT NULL,
        closed_by_name VARCHAR(160) DEFAULT NULL,
        closed_at    DATETIME DEFAULT NULL,
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id), KEY idx_bill_company (company_id), KEY idx_bill_indent (indent_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // indent items carry vendor + price during procurement (columns already exist).

    // ── Zoho Books sync columns (added when integration is enabled) ──
    for (const sql of [
      `ALTER TABLE vendors ADD COLUMN zoho_vendor_id VARCHAR(60) DEFAULT NULL`,
      `ALTER TABLE purchase_orders ADD COLUMN zoho_po_id VARCHAR(60) DEFAULT NULL`,
      `ALTER TABLE purchase_orders ADD COLUMN zoho_po_number VARCHAR(60) DEFAULT NULL`,
      `ALTER TABLE purchase_orders ADD COLUMN sync_status VARCHAR(20) DEFAULT NULL`,
      `ALTER TABLE purchase_orders ADD COLUMN sync_error VARCHAR(500) DEFAULT NULL`,
      `ALTER TABLE bills ADD COLUMN zoho_bill_id VARCHAR(60) DEFAULT NULL`,
      `ALTER TABLE bills ADD COLUMN zoho_bill_number VARCHAR(60) DEFAULT NULL`,
      `ALTER TABLE bills ADD COLUMN sync_status VARCHAR(20) DEFAULT NULL`,
      `ALTER TABLE bills ADD COLUMN sync_error VARCHAR(500) DEFAULT NULL`,
    ]) { try { await pool.query(sql); } catch { /* column exists */ } }
  } catch (err) { /* tables may already exist */ }
})();

/**
 * Best-effort push of a PO to Zoho Books. Never throws — records sync_status so
 * the FM workflow is never blocked by Books being down. Returns the zoho ids.
 */
async function syncPurchaseOrderToBooks(companyId, poId) {
  if (!isZohoEnabled()) return null;
  try {
    const [[po]] = await pool.query(`SELECT * FROM purchase_orders WHERE id = ? AND company_id = ?`, [poId, companyId]);
    if (!po || po.zoho_po_id) return po?.zoho_po_id ? { id: po.zoho_po_id } : null; // idempotent
    const [poItems] = await pool.query(`SELECT * FROM po_items WHERE po_id = ?`, [poId]);
    let vendorZohoId = null, vendorName = po.vendor_name;
    if (po.vendor_id) {
      const [[v]] = await pool.query(`SELECT * FROM vendors WHERE id = ? AND company_id = ?`, [po.vendor_id, companyId]);
      if (v) {
        vendorName = v.name;
        vendorZohoId = v.zoho_vendor_id || await zohoEnsureVendor({ name: v.name, gst: v.gst, email: v.email, phone: v.phone });
        if (!v.zoho_vendor_id) await pool.query(`UPDATE vendors SET zoho_vendor_id = ? WHERE id = ?`, [vendorZohoId, v.id]);
      }
    }
    if (!vendorZohoId) vendorZohoId = await zohoEnsureVendor({ name: vendorName || "Vendor" });
    const result = await zohoCreatePO({
      vendorId: vendorZohoId,
      referenceNumber: po.po_number,
      lineItems: poItems.map((i) => ({ name: i.part_name, rate: i.unit_price, quantity: i.qty })),
    });
    await pool.query(`UPDATE purchase_orders SET zoho_po_id = ?, zoho_po_number = ?, sync_status = 'synced', sync_error = NULL WHERE id = ?`,
      [result.id, result.number, poId]);
    return result;
  } catch (e) {
    await pool.query(`UPDATE purchase_orders SET sync_status = 'failed', sync_error = ? WHERE id = ?`, [String(e.message).slice(0, 500), poId]).catch(() => {});
    return null;
  }
}

/** Best-effort push of a bill to Zoho Books. Never throws. */
async function syncBillToBooks(companyId, billId) {
  if (!isZohoEnabled()) return null;
  try {
    const [[bill]] = await pool.query(`SELECT * FROM bills WHERE id = ? AND company_id = ?`, [billId, companyId]);
    if (!bill || bill.zoho_bill_id) return null; // idempotent
    const [[po]] = bill.po_id ? await pool.query(`SELECT * FROM purchase_orders WHERE id = ?`, [bill.po_id]) : [[]];
    const [poItems] = bill.po_id ? await pool.query(`SELECT * FROM po_items WHERE po_id = ?`, [bill.po_id]) : [[]];
    let vendorZohoId = null, vendorName = po?.vendor_name;
    if (po?.vendor_id) {
      const [[v]] = await pool.query(`SELECT * FROM vendors WHERE id = ?`, [po.vendor_id]);
      if (v) {
        vendorName = v.name;
        vendorZohoId = v.zoho_vendor_id || await zohoEnsureVendor({ name: v.name, gst: v.gst, email: v.email, phone: v.phone });
        if (!v.zoho_vendor_id) await pool.query(`UPDATE vendors SET zoho_vendor_id = ? WHERE id = ?`, [vendorZohoId, v.id]);
      }
    }
    if (!vendorZohoId) vendorZohoId = await zohoEnsureVendor({ name: vendorName || "Vendor" });
    const lineItems = (poItems && poItems.length)
      ? poItems.map((i) => ({ name: i.part_name, rate: i.unit_price, quantity: i.qty }))
      : [{ name: "Spare parts", rate: bill.amount, quantity: 1 }];
    const result = await zohoCreateBill({
      vendorId: vendorZohoId,
      billNumber: bill.bill_number || undefined,
      referenceNumber: po?.zoho_po_number || po?.po_number || undefined,
      lineItems,
    });
    await pool.query(`UPDATE bills SET zoho_bill_id = ?, zoho_bill_number = ?, sync_status = 'synced', sync_error = NULL WHERE id = ?`,
      [result.id, result.number, billId]);
    return result;
  } catch (e) {
    await pool.query(`UPDATE bills SET sync_status = 'failed', sync_error = ? WHERE id = ?`, [String(e.message).slice(0, 500), billId]).catch(() => {});
    return null;
  }
}

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
    const privileged = isManager(req) || canProcure(req) || canFinance(req);
    let where = "WHERE i.company_id = ?";
    const params = [cid(req)];
    if (scope === "mine") { where += " AND i.raised_by = ?"; params.push(req.companyUser.id); }
    else if (scope === "inbox") {
      // Approvals inbox: indents awaiting an approval decision.
      where += " AND i.status IN (?, ?)"; params.push(STATUS.PENDING, STATUS.PENDING_PRICE);
    } else if (scope === "procurement") {
      where += " AND i.status IN (?, ?, ?, ?)"; params.push(STATUS.IN_PROCUREMENT, STATUS.PENDING_PRICE, STATUS.PO_CREATED, STATUS.DISPATCHED);
    } else if (scope === "all" && !privileged) {
      where += " AND i.raised_by = ?"; params.push(req.companyUser.id);
    }
    if (status) { where += " AND i.status = ?"; params.push(status); }

    const [rows] = await pool.query(
      `SELECT i.id, i.indent_number AS indentNumber, i.ticket_id AS ticketId, i.asset_id AS assetId,
              i.status, i.priority, i.notes, i.raised_by_name AS raisedByName, i.created_at AS createdAt,
              a.asset_name AS assetName,
              COALESCE(a.generated_asset_id, a.asset_unique_id) AS assetCode,
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
// Numeric-constrained so it never shadows /vendors or /by-asset.
router.get("/:id(\\d+)", async (req, res, next) => {
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
    const [[po]] = await pool.query(`SELECT id, po_number AS poNumber, vendor_name AS vendorName, total_amount AS totalAmount, status, zoho_po_number AS zohoPoNumber, sync_status AS syncStatus FROM purchase_orders WHERE indent_id = ? AND company_id = ? ORDER BY id DESC LIMIT 1`, [ind.id, cid(req)]).catch(() => [[]]);
    const [[bill]] = await pool.query(`SELECT id, bill_number AS billNumber, amount, status, closed_by_name AS closedByName, closed_at AS closedAt, zoho_bill_number AS zohoBillNumber, sync_status AS syncStatus FROM bills WHERE indent_id = ? AND company_id = ? ORDER BY id DESC LIMIT 1`, [ind.id, cid(req)]).catch(() => [[]]);

    // Enrich with the linked asset's details (identity · location · make/model/serial).
    let asset = null;
    if (ind.asset_id) {
      const [[a]] = await pool.query(
        `SELECT a.id, a.asset_name AS name, COALESCE(a.generated_asset_id, a.asset_unique_id) AS code,
                a.asset_type AS category, a.building, a.floor, a.room,
                d.name AS department, ad.metadata
         FROM assets a
         LEFT JOIN departments d ON d.id = a.department_id
         LEFT JOIN asset_details ad ON ad.asset_id = a.id
         WHERE a.id = ? AND a.company_id = ?`,
        [ind.asset_id, cid(req)]
      ).catch(() => [[]]);
      if (a) {
        let meta = {};
        try { meta = typeof a.metadata === "string" ? JSON.parse(a.metadata) : (a.metadata || {}); } catch { meta = {}; }
        asset = {
          id: a.id, name: a.name, code: a.code, category: a.category,
          department: a.department,
          location: [a.building, a.floor, a.room].filter(Boolean).join(", ") || null,
          make: meta.make || null, model: meta.model || null, serialNo: meta.serialNo || meta.serial_no || null,
        };
      }
    }
    res.json({ ...ind, items, history, po: po || null, bill: bill || null, asset });
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
    // Per-item decisions from body:
    //   { decisions: { itemId: { action: 'approve'|'reject', qty } } }
    // Missing decision defaults to approving the full requested quantity.
    const decisions = req.body?.decisions || {};

    let approvedCount = 0, rejectedCount = 0;
    const approvedNames = [], rejectedNames = [];
    for (const it of items) {
      const d = decisions[it.id] || {};
      const action = d.action || "approve";
      if (action === "reject") {
        await conn.query(`UPDATE part_indent_items SET item_status = 'rejected', qty_approved = 0 WHERE id = ?`, [it.id]);
        rejectedCount++; rejectedNames.push(it.part_name || `#${it.part_id}`);
        continue;
      }
      const approveQty = Math.max(0, Math.trunc(Number(d.qty ?? it.qty_requested)));
      if (approveQty <= 0) {
        await conn.query(`UPDATE part_indent_items SET item_status = 'rejected', qty_approved = 0 WHERE id = ?`, [it.id]);
        rejectedCount++; rejectedNames.push(it.part_name || `#${it.part_id}`);
        continue;
      }
      const [[p]] = await conn.query(`SELECT available_quantity AS a FROM parts WHERE id = ? AND company_id = ? FOR UPDATE`, [it.part_id, cid(req)]);
      if (!p) { await conn.rollback(); return res.status(404).json({ message: `Part #${it.part_id} not found` }); }
      if (approveQty > Number(p.a)) {
        await conn.rollback();
        return res.status(409).json({ message: `Not enough stock for "${it.part_name || 'part'}" — available ${p.a}, approving ${approveQty}. Reduce the quantity, reject this item, or send the indent to procurement.` });
      }
      await conn.query(`UPDATE part_indent_items SET item_status = 'approved', qty_approved = ? WHERE id = ?`, [approveQty, it.id]);
      await applyStockMovement(conn, {
        companyId: cid(req), partId: it.part_id, reason: "reserve",
        deltaReserved: approveQty, qty: approveQty, refType: "indent", refId: ind.id, actorId: req.companyUser.id,
      });
      approvedCount++; approvedNames.push(it.part_name || `#${it.part_id}`);
    }

    // Roll-up: at least one approved → indent approved; all rejected → rejected.
    const newStatus = approvedCount > 0 ? STATUS.APPROVED : STATUS.REJECTED;
    const summary = [
      approvedCount ? `approved ${approvedNames.join(", ")}` : "",
      rejectedCount ? `rejected ${rejectedNames.join(", ")}` : "",
    ].filter(Boolean).join(" · ");
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [newStatus, ind.id]);
    await addHistory(conn, ind.id, ind.status, newStatus, req, approvedCount > 0 ? "approved (item-wise)" : "rejected", summary || req.body?.comments);
    await conn.commit();
    res.json({ ok: true, message: approvedCount > 0 ? `Approved ${approvedCount} item(s), reserved stock` : "All items rejected" });
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
    // Issue is valid both for in-stock approvals (Phase 1) and after goods are
    // received via procurement (Phase 2).
    if (![STATUS.APPROVED, STATUS.RECEIVED].includes(ind.status)) { await conn.rollback(); return res.status(409).json({ message: `Only an approved or received indent can be issued (this is '${ind.status}')` }); }

    const [items] = await conn.query(`SELECT * FROM part_indent_items WHERE indent_id = ?`, [ind.id]);
    for (const it of items) {
      if (it.item_status === "rejected") continue;
      const q = Number(it.qty_approved ?? it.qty_requested ?? 0);
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

/* ═══════════════════════════════════════════════════════════════════════════
   PHASE 2 — PROCUREMENT (vendor · quote · price approval · PO · dispatch · GRN)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Vendors ───────────────────────────────────────────────────────────────────
router.get("/vendors", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, contact, phone, email, gst, address FROM vendors WHERE company_id = ? ORDER BY name`,
      [cid(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
});
router.post("/vendors", async (req, res, next) => {
  try {
    if (!canProcure(req)) return res.status(403).json({ message: "Not allowed" });
    const { name, contact = null, phone = null, email = null, gst = null, address = null } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ message: "Vendor name is required" });
    const [r] = await pool.query(
      `INSERT INTO vendors (company_id, name, contact, phone, email, gst, address) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cid(req), String(name).trim(), contact, phone, email, gst, address]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { next(err); }
});

// ── Send an approved/pending indent into procurement (buy new stock) ──────────
router.patch("/:id/send-to-procurement", async (req, res, next) => {
  if (!isManager(req)) return res.status(403).json({ message: "Only an admin/supervisor can send to procurement" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ind]] = await conn.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ? FOR UPDATE`, [Number(req.params.id), cid(req)]);
    if (!ind) { await conn.rollback(); return res.status(404).json({ message: "Indent not found" }); }
    if (![STATUS.PENDING, STATUS.APPROVED].includes(ind.status)) { await conn.rollback(); return res.status(409).json({ message: `Cannot procure an indent that is '${ind.status}'` }); }
    // If it was approved (stock reserved), release reservations — these units are being bought, not taken from stock.
    if (ind.status === STATUS.APPROVED) await releaseReservations(conn, ind, req);
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.IN_PROCUREMENT, ind.id]);
    await addHistory(conn, ind.id, ind.status, STATUS.IN_PROCUREMENT, req, "sent to procurement", req.body?.comments);
    await conn.commit();
    res.json({ ok: true, message: "Sent to procurement" });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

// ── Purchase adds vendor + unit prices, submits quote for approval ────────────
router.patch("/:id/quote", async (req, res, next) => {
  if (!canProcure(req)) return res.status(403).json({ message: "Only the purchase team can quote" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ind]] = await conn.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ? FOR UPDATE`, [Number(req.params.id), cid(req)]);
    if (!ind) { await conn.rollback(); return res.status(404).json({ message: "Indent not found" }); }
    if (![STATUS.IN_PROCUREMENT, STATUS.QUOTED, STATUS.PENDING_PRICE].includes(ind.status)) { await conn.rollback(); return res.status(409).json({ message: `Cannot quote an indent that is '${ind.status}'` }); }
    const { vendorId = null, prices = {} } = req.body || {}; // prices: { itemId: unitPrice }
    const [items] = await conn.query(`SELECT * FROM part_indent_items WHERE indent_id = ?`, [ind.id]);
    for (const it of items) {
      const price = prices[it.id] != null ? Number(prices[it.id]) : it.unit_price;
      await conn.query(`UPDATE part_indent_items SET unit_price = ?, vendor_id = ? WHERE id = ?`, [price ?? null, vendorId || it.vendor_id || null, it.id]);
    }
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.PENDING_PRICE, ind.id]);
    await addHistory(conn, ind.id, ind.status, STATUS.PENDING_PRICE, req, "quoted", req.body?.comments);
    await conn.commit();
    res.json({ ok: true, message: "Quote submitted for approval" });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

// ── Admin approves the price → auto-generates a PO ────────────────────────────
router.patch("/:id/approve-price", async (req, res, next) => {
  if (!isManager(req) && !canFinance(req)) return res.status(403).json({ message: "Not allowed to approve pricing" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ind]] = await conn.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ? FOR UPDATE`, [Number(req.params.id), cid(req)]);
    if (!ind) { await conn.rollback(); return res.status(404).json({ message: "Indent not found" }); }
    if (ind.status !== STATUS.PENDING_PRICE) { await conn.rollback(); return res.status(409).json({ message: `No pending quote to approve (status '${ind.status}')` }); }
    const [items] = await conn.query(`SELECT * FROM part_indent_items WHERE indent_id = ?`, [ind.id]);
    const vendorId = items.find((i) => i.vendor_id)?.vendor_id || null;
    let vendorName = null;
    if (vendorId) { const [[v]] = await conn.query(`SELECT name FROM vendors WHERE id = ? AND company_id = ?`, [vendorId, cid(req)]); vendorName = v?.name || null; }
    const total = items.reduce((s, it) => s + Number(it.unit_price || 0) * Number(it.qty_approved ?? it.qty_requested), 0);
    const [poRes] = await conn.query(
      `INSERT INTO purchase_orders (company_id, indent_id, vendor_id, vendor_name, total_amount, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'open', ?)`,
      [cid(req), ind.id, vendorId, vendorName, total, req.companyUser.id]
    );
    const poId = poRes.insertId;
    await conn.query(`UPDATE purchase_orders SET po_number = CONCAT('PO-', YEAR(created_at), '-', LPAD(id,5,'0')) WHERE id = ?`, [poId]);
    for (const it of items) {
      const q = Number(it.qty_approved ?? it.qty_requested);
      await conn.query(
        `INSERT INTO po_items (po_id, indent_item_id, part_id, part_name, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?)`,
        [poId, it.id, it.part_id, it.part_name, q, Number(it.unit_price || 0)]
      );
    }
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.PO_CREATED, ind.id]);
    await addHistory(conn, ind.id, ind.status, STATUS.PO_CREATED, req, "price approved · PO created", req.body?.comments);
    await conn.commit();
    // Best-effort push to Zoho Books (no-op unless BOOKS_PROVIDER=zoho).
    const zpo = await syncPurchaseOrderToBooks(cid(req), poId);
    res.json({ ok: true, message: zpo ? "Price approved · PO created & synced to Zoho Books" : "Price approved and PO created", poId, zoho: zpo || undefined });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

// ── Reject the quote → back to procurement for re-quote ───────────────────────
router.patch("/:id/reject-price", async (req, res, next) => {
  if (!isManager(req) && !canFinance(req)) return res.status(403).json({ message: "Not allowed" });
  try {
    const [[ind]] = await pool.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ?`, [Number(req.params.id), cid(req)]);
    if (!ind) return res.status(404).json({ message: "Indent not found" });
    if (ind.status !== STATUS.PENDING_PRICE) return res.status(409).json({ message: `Nothing to reject (status '${ind.status}')` });
    await pool.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.IN_PROCUREMENT, ind.id]);
    const conn = await pool.getConnection();
    try { await addHistory(conn, ind.id, ind.status, STATUS.IN_PROCUREMENT, req, "price rejected", req.body?.comments); } finally { conn.release(); }
    res.json({ ok: true, message: "Quote rejected — re-quote required" });
  } catch (err) { next(err); }
});

// ── Dispatch (sent to site) ───────────────────────────────────────────────────
router.patch("/:id/dispatch", async (req, res, next) => {
  if (!canProcure(req)) return res.status(403).json({ message: "Only the purchase team can dispatch" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ind]] = await conn.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ? FOR UPDATE`, [Number(req.params.id), cid(req)]);
    if (!ind) { await conn.rollback(); return res.status(404).json({ message: "Indent not found" }); }
    if (ind.status !== STATUS.PO_CREATED) { await conn.rollback(); return res.status(409).json({ message: `Only a PO'd indent can be dispatched (status '${ind.status}')` }); }
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.DISPATCHED, ind.id]);
    await addHistory(conn, ind.id, ind.status, STATUS.DISPATCHED, req, "dispatched to site", req.body?.comments);
    await conn.commit();
    res.json({ ok: true, message: "Dispatched to site" });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

// ── GRN — goods received at site → adds stock via ledger ───────────────────────
router.patch("/:id/grn", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ind]] = await conn.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ? FOR UPDATE`, [Number(req.params.id), cid(req)]);
    if (!ind) { await conn.rollback(); return res.status(404).json({ message: "Indent not found" }); }
    if (![STATUS.DISPATCHED, STATUS.PO_CREATED].includes(ind.status)) { await conn.rollback(); return res.status(409).json({ message: `Cannot receive against an indent that is '${ind.status}'` }); }
    const [[po]] = await conn.query(`SELECT * FROM purchase_orders WHERE indent_id = ? AND company_id = ? ORDER BY id DESC LIMIT 1`, [ind.id, cid(req)]);
    const [items] = await conn.query(`SELECT * FROM part_indent_items WHERE indent_id = ?`, [ind.id]);
    const received = req.body?.received || {}; // { itemId: receivedQty } — defaults to approved/requested
    for (const it of items) {
      const q = Number(received[it.id] != null ? received[it.id] : (it.qty_approved ?? it.qty_requested));
      if (q > 0) {
        await applyStockMovement(conn, {
          companyId: cid(req), partId: it.part_id, reason: "grn",
          deltaTotal: q, qty: q, refType: "indent", refId: ind.id, actorId: req.companyUser.id,
        });
        await conn.query(
          `INSERT INTO grn (company_id, po_id, indent_id, part_id, received_qty, received_by, received_by_name, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [cid(req), po?.id || null, ind.id, it.part_id, q, req.companyUser.id, actorName(req), req.body?.notes || null]
        );
        if (po) await conn.query(`UPDATE po_items SET received_qty = ? WHERE po_id = ? AND indent_item_id = ?`, [q, po.id, it.id]);
      }
    }
    await conn.query(`UPDATE part_indents SET status = ? WHERE id = ?`, [STATUS.RECEIVED, ind.id]);
    await addHistory(conn, ind.id, ind.status, STATUS.RECEIVED, req, "goods received (GRN)", req.body?.notes);
    await conn.commit();
    res.json({ ok: true, message: "Goods received and stock updated" });
  } catch (err) { await conn.rollback().catch(() => {}); next(err); }
  finally { conn.release(); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   PHASE 3 — FINANCE / BOOKS (internal PO→bill; Zoho-ready via external_ref)
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Record a bill against the indent's PO ─────────────────────────────────────
router.post("/:id/bill", async (req, res, next) => {
  if (!canFinance(req) && !isManager(req)) return res.status(403).json({ message: "Only finance can record bills" });
  try {
    const [[ind]] = await pool.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ?`, [Number(req.params.id), cid(req)]);
    if (!ind) return res.status(404).json({ message: "Indent not found" });
    const [[po]] = await pool.query(`SELECT * FROM purchase_orders WHERE indent_id = ? AND company_id = ? ORDER BY id DESC LIMIT 1`, [ind.id, cid(req)]);
    const { billNumber = null, amount = null, externalRef = null } = req.body || {};
    const amt = amount != null ? Number(amount) : Number(po?.total_amount || 0);
    const [r] = await pool.query(
      `INSERT INTO bills (company_id, po_id, indent_id, bill_number, amount, status, external_ref, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      [cid(req), po?.id || null, ind.id, billNumber, amt, externalRef, req.companyUser.id, actorName(req)]
    );
    const billId = r.insertId;
    const conn = await pool.getConnection();
    try { await addHistory(conn, ind.id, ind.status, ind.status, req, "bill recorded", billNumber ? `Bill ${billNumber} · ₹${amt}` : `₹${amt}`); } finally { conn.release(); }
    const zbill = await syncBillToBooks(cid(req), billId);
    res.status(201).json({ id: billId, message: zbill ? "Bill recorded & synced to Zoho Books" : "Bill recorded" });
  } catch (err) { next(err); }
});

// ── Close a bill (finance) ────────────────────────────────────────────────────
router.patch("/:id/close-bill", async (req, res, next) => {
  if (!canFinance(req) && !isManager(req)) return res.status(403).json({ message: "Only finance can close bills" });
  try {
    const [[ind]] = await pool.query(`SELECT * FROM part_indents WHERE id = ? AND company_id = ?`, [Number(req.params.id), cid(req)]);
    if (!ind) return res.status(404).json({ message: "Indent not found" });
    const [[bill]] = await pool.query(`SELECT * FROM bills WHERE indent_id = ? AND company_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`, [ind.id, cid(req)]);
    if (!bill) return res.status(404).json({ message: "No open bill to close" });
    await pool.query(`UPDATE bills SET status = 'closed', closed_by = ?, closed_by_name = ?, closed_at = NOW() WHERE id = ?`, [req.companyUser.id, actorName(req), bill.id]);
    const conn = await pool.getConnection();
    try { await addHistory(conn, ind.id, ind.status, ind.status, req, "bill closed", bill.bill_number || `#${bill.id}`); } finally { conn.release(); }
    res.json({ ok: true, message: "Bill closed" });
  } catch (err) { next(err); }
});

// ── PATCH /:id/sync-books — retry a failed Zoho Books sync (PO + bill) ─────────
router.patch("/:id/sync-books", async (req, res, next) => {
  if (!canFinance(req) && !isManager(req) && !canProcure(req)) return res.status(403).json({ message: "Not allowed" });
  try {
    if (!isZohoEnabled()) return res.status(400).json({ message: "Zoho Books is not enabled (set BOOKS_PROVIDER=zoho and credentials)" });
    const id = Number(req.params.id);
    const [[po]] = await pool.query(`SELECT id FROM purchase_orders WHERE indent_id = ? AND company_id = ? ORDER BY id DESC LIMIT 1`, [id, cid(req)]);
    const [[bill]] = await pool.query(`SELECT id FROM bills WHERE indent_id = ? AND company_id = ? ORDER BY id DESC LIMIT 1`, [id, cid(req)]);
    const poRes = po ? await syncPurchaseOrderToBooks(cid(req), po.id) : null;
    const billRes = bill ? await syncBillToBooks(cid(req), bill.id) : null;
    res.json({ ok: true, po: poRes || null, bill: billRes || null });
  } catch (err) { next(err); }
});

// ── GET /:id/po — the PO (if any) for an indent ───────────────────────────────
router.get("/:id/po", async (req, res, next) => {
  try {
    const [[po]] = await pool.query(`SELECT * FROM purchase_orders WHERE indent_id = ? AND company_id = ? ORDER BY id DESC LIMIT 1`, [Number(req.params.id), cid(req)]);
    if (!po) return res.json(null);
    const [poItems] = await pool.query(`SELECT * FROM po_items WHERE po_id = ?`, [po.id]);
    res.json({ ...po, items: poItems });
  } catch (err) { next(err); }
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
