/**
 * Asset Query / Chat System
 * Public endpoint to submit queries from QR scan page.
 * Authenticated endpoints for admins to view/manage queries.
 */
import { Router } from "express";
import { body, param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── Auto-migration ─────────────────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS asset_queries (
        id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
        asset_id          INT UNSIGNED NOT NULL,
        company_id        INT UNSIGNED NOT NULL,
        requester_name    VARCHAR(160) NOT NULL,
        requester_phone   VARCHAR(32) DEFAULT NULL,
        requester_email   VARCHAR(160) DEFAULT NULL,
        query_type        VARCHAR(120) DEFAULT NULL,
        message           TEXT DEFAULT NULL,
        status            ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
        assigned_to       INT UNSIGNED DEFAULT NULL,
        resolved_at       DATETIME DEFAULT NULL,
        created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_asset (asset_id),
        KEY idx_company (company_id),
        KEY idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) { /* table may exist */ }
})();

// ── Default quick-query questions per asset category ──────────────────────────
export const DEFAULT_QUERIES = {
  healthcare: [
    "Equipment not powering on",
    "Calibration required",
    "Accessories/parts missing",
    "Physical damage observed",
    "Error code / alarm triggered",
    "Scheduled maintenance due",
    "Software/firmware update needed",
    "Request for training on device",
  ],
  general: [
    "Equipment not working",
    "Maintenance required",
    "Physical damage",
    "Parts missing",
    "Scheduled service due",
    "Other",
  ],
};

// ── PUBLIC: Submit a query from QR scan page ──────────────────────────────────
const submitRules = [
  body("requesterName").trim().notEmpty().withMessage("Name is required"),
  body("requesterPhone").optional().isString().isLength({ max: 32 }),
  body("requesterEmail").optional().isEmail().withMessage("Invalid email"),
  body("queryType").optional().isString().isLength({ max: 120 }),
  body("message").optional().isString().isLength({ max: 2000 }),
];

router.post(
  "/asset-qr/:assetId/query",
  validate(submitRules),
  async (req, res, next) => {
    try {
      const { assetId } = req.params;
      const { requesterName, requesterPhone, requesterEmail, queryType, message } = req.body;

      // Get asset + company info
      const [[asset]] = await pool.query(
        `SELECT a.id, a.company_id, a.asset_name, cu.id AS assigned_user_id
         FROM assets a
         LEFT JOIN company_users cu ON cu.company_id = a.company_id AND cu.role IN ('admin','supervisor','technician')
         WHERE a.id = ?
         ORDER BY cu.role ASC
         LIMIT 1`,
        [assetId]
      );

      if (!asset) {
        return res.status(404).json({ message: "Asset not found" });
      }

      const [result] = await pool.execute(
        `INSERT INTO asset_queries
           (asset_id, company_id, requester_name, requester_phone, requester_email, query_type, message, assigned_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assetId,
          asset.company_id,
          requesterName,
          requesterPhone || null,
          requesterEmail || null,
          queryType || null,
          message || null,
          asset.assigned_user_id || null,
        ]
      );

      return res.status(201).json({
        id: result.insertId,
        assetName: asset.asset_name,
        status: "open",
        message: "Query submitted successfully. Our team will reach out to you.",
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── PUBLIC: Get default questions for asset ───────────────────────────────────
router.get("/asset-qr/:assetId/queries/defaults", async (req, res, next) => {
  try {
    const { assetId } = req.params;
    const [[asset]] = await pool.query(
      `SELECT a.id, a.asset_type, c.sector, c.sectors
       FROM assets a JOIN companies c ON a.company_id = c.id
       WHERE a.id = ?`,
      [assetId]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });

    const sectors = asset.sectors
      ? (typeof asset.sectors === "string" ? JSON.parse(asset.sectors) : asset.sectors)
      : (asset.sector ? [asset.sector] : []);

    const questions = sectors.includes("healthcare") || asset.asset_type === "healthcare"
      ? DEFAULT_QUERIES.healthcare
      : DEFAULT_QUERIES.general;

    return res.json({ questions });
  } catch (err) {
    return next(err);
  }
});

// ── AUTHENTICATED: List queries for a company's assets ────────────────────────
router.get("/asset-queries", requireAuth, async (req, res, next) => {
  try {
    const { companyId, status } = req.query;
    let where = "WHERE c.user_id = ?";
    const params = [req.user.id];

    if (companyId) {
      where += " AND aq.company_id = ?";
      params.push(companyId);
    }
    if (status && ["open", "in_progress", "resolved"].includes(status)) {
      where += " AND aq.status = ?";
      params.push(status);
    }

    const [rows] = await pool.query(
      `SELECT aq.id, aq.asset_id AS assetId, a.asset_name AS assetName,
              a.asset_unique_id AS barcodeNumber,
              aq.company_id AS companyId, co.company_name AS companyName,
              aq.requester_name AS requesterName,
              aq.requester_phone AS requesterPhone,
              aq.requester_email AS requesterEmail,
              aq.query_type AS queryType, aq.message,
              aq.status, aq.assigned_to AS assignedTo,
              cu.full_name AS assignedToName,
              aq.created_at AS createdAt, aq.resolved_at AS resolvedAt
       FROM asset_queries aq
       JOIN assets a ON aq.asset_id = a.id
       JOIN companies co ON aq.company_id = co.id AND co.user_id = ?
       LEFT JOIN company_users cu ON aq.assigned_to = cu.id
       ${where.replace("WHERE c.user_id = ?", "WHERE co.user_id = ?")}
       ORDER BY aq.created_at DESC`,
      [req.user.id, ...params.slice(1)]
    );

    return res.json(rows);
  } catch (err) {
    return next(err);
  }
});

// ── AUTHENTICATED: Update query status / assignment ───────────────────────────
router.patch(
  "/asset-queries/:id",
  requireAuth,
  validate([
    param("id").isInt().withMessage("id must be numeric"),
    body("status").optional().isIn(["open", "in_progress", "resolved"]),
    body("assignedTo").optional().isInt({ min: 1 }),
  ]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, assignedTo } = req.body;

      // Verify query belongs to user's company
      const [[q]] = await pool.query(
        `SELECT aq.id FROM asset_queries aq
         JOIN companies c ON aq.company_id = c.id
         WHERE aq.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (!q) return res.status(404).json({ message: "Query not found" });

      const resolvedAt = status === "resolved" ? new Date() : null;
      const updates = [];
      const vals = [];

      if (status !== undefined) { updates.push("status = ?"); vals.push(status); }
      if (assignedTo !== undefined) { updates.push("assigned_to = ?"); vals.push(assignedTo); }
      if (resolvedAt !== null) { updates.push("resolved_at = ?"); vals.push(resolvedAt); }

      if (updates.length === 0) return res.status(400).json({ message: "Nothing to update" });

      vals.push(id);
      await pool.execute(`UPDATE asset_queries SET ${updates.join(", ")} WHERE id = ?`, vals);
      return res.json({ id: Number(id), status, assignedTo });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
