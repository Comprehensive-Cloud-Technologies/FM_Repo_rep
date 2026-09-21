/**
 * Parts — spare-part register (mobile "Part Generation").
 * Prefix: /api/company-portal/parts
 *
 * A lightweight catalogue of spare parts a field user can create from the app:
 * part name, make, model and a photo (stored in S3). Company-scoped, uses the
 * same company-user auth as the rest of the portal.
 */
import { Router } from "express";
import crypto from "crypto";
import path from "path";
import multer from "multer";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { uploadToS3, S3_FOLDERS, presignIfS3 } from "../utils/s3.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

// ── Auto-migration ──────────────────────────────────────────────────────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS parts (
        id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
        company_id     INT UNSIGNED NOT NULL,
        part_name      VARCHAR(200) NOT NULL,
        make           VARCHAR(160) DEFAULT NULL,
        model          VARCHAR(160) DEFAULT NULL,
        photo_url      VARCHAR(1024) DEFAULT NULL,
        total_quantity     INT NOT NULL DEFAULT 0,
        available_quantity INT NOT NULL DEFAULT 0,
        unit           VARCHAR(40) DEFAULT NULL,
        created_by     INT UNSIGNED DEFAULT NULL,
        created_by_name VARCHAR(160) DEFAULT NULL,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_parts_company (company_id),
        KEY idx_parts_name (part_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) { /* table may already exist */ }
  // Add inventory columns for installs created before they existed.
  for (const col of [
    "ADD COLUMN total_quantity INT NOT NULL DEFAULT 0",
    "ADD COLUMN available_quantity INT NOT NULL DEFAULT 0",
    "ADD COLUMN unit VARCHAR(40) DEFAULT NULL",
  ]) {
    try { await pool.query(`ALTER TABLE parts ${col}`); } catch (err) { /* column exists */ }
  }
})();

// Clamp a value to a non-negative integer (or null when not provided).
const toQty = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

// ── Photo upload → S3 ─────────────────────────────────────────────────────────
const uploadPartPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// POST /upload-photo — multipart field "image" → returns { url }
router.post("/upload-photo", (req, res, next) => {
  uploadPartPhoto.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image provided" });
    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const filename = `part_${Date.now()}_${crypto.randomBytes(8).toString("hex")}${ext}`;
    const url = await uploadToS3({
      buffer:   req.file.buffer,
      mimetype: req.file.mimetype,
      folder:   S3_FOLDERS.parts,
      filename,
    });
    res.json({ url });
  } catch (err) { next(err); }
});

// GET /summary — inventory totals for the dashboard
router.get("/summary", async (req, res, next) => {
  try {
    const [[s]] = await pool.query(
      `SELECT COUNT(*) AS totalParts,
              COALESCE(SUM(total_quantity), 0)     AS totalUnits,
              COALESCE(SUM(available_quantity), 0) AS availableUnits,
              SUM(available_quantity <= 0)         AS outOfStock
       FROM parts WHERE company_id = ?`,
      [cid(req)]
    );
    res.json({
      totalParts:     Number(s.totalParts || 0),
      totalUnits:     Number(s.totalUnits || 0),
      availableUnits: Number(s.availableUnits || 0),
      outOfStock:     Number(s.outOfStock || 0),
    });
  } catch (err) { next(err); }
});

// POST / — create a part
router.post("/", async (req, res, next) => {
  try {
    const { partName, make = null, model = null, photoUrl = null,
            totalQuantity, availableQuantity, unit = null } = req.body || {};
    if (!partName || !String(partName).trim()) {
      return res.status(400).json({ message: "Part name is required" });
    }
    const total = toQty(totalQuantity) ?? 0;
    // Available defaults to total when not supplied, and never exceeds total.
    let avail = toQty(availableQuantity);
    if (avail === null) avail = total;
    if (avail > total) avail = total;
    const [result] = await pool.query(
      `INSERT INTO parts
         (company_id, part_name, make, model, photo_url, total_quantity, available_quantity, unit, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cid(req),
        String(partName).trim(),
        make ? String(make).trim() : null,
        model ? String(model).trim() : null,
        photoUrl || null,
        total,
        avail,
        unit ? String(unit).trim() : null,
        req.companyUser.id,
        req.companyUser.fullName || req.companyUser.email || null,
      ]
    );
    res.status(201).json({ id: result.insertId, message: "Part added" });
  } catch (err) { next(err); }
});

// PATCH /:id — edit a part / adjust inventory
router.patch("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [[existing]] = await pool.query(
      `SELECT id, total_quantity, available_quantity FROM parts WHERE id = ? AND company_id = ?`,
      [id, cid(req)]
    );
    if (!existing) return res.status(404).json({ message: "Part not found" });

    const b = req.body || {};
    const sets = [];
    const params = [];
    if (b.partName !== undefined) { sets.push("part_name = ?"); params.push(String(b.partName).trim()); }
    if (b.make    !== undefined) { sets.push("make = ?");  params.push(b.make ? String(b.make).trim() : null); }
    if (b.model   !== undefined) { sets.push("model = ?"); params.push(b.model ? String(b.model).trim() : null); }
    if (b.unit    !== undefined) { sets.push("unit = ?");  params.push(b.unit ? String(b.unit).trim() : null); }
    if (b.photoUrl !== undefined) { sets.push("photo_url = ?"); params.push(b.photoUrl || null); }

    // Resolve final quantities, keeping available ≤ total.
    let total = existing.total_quantity, avail = existing.available_quantity;
    if (b.totalQuantity !== undefined)     total = toQty(b.totalQuantity) ?? 0;
    if (b.availableQuantity !== undefined) avail = toQty(b.availableQuantity) ?? 0;
    if (avail > total) avail = total;
    if (b.totalQuantity !== undefined)     { sets.push("total_quantity = ?");     params.push(total); }
    if (b.availableQuantity !== undefined || b.totalQuantity !== undefined) { sets.push("available_quantity = ?"); params.push(avail); }

    if (!sets.length) return res.json({ ok: true });
    params.push(id, cid(req));
    await pool.query(`UPDATE parts SET ${sets.join(", ")} WHERE id = ? AND company_id = ?`, params);
    res.json({ ok: true, message: "Part updated" });
  } catch (err) { next(err); }
});

// DELETE /:id — remove a part
router.delete("/:id", async (req, res, next) => {
  try {
    await pool.query(`DELETE FROM parts WHERE id = ? AND company_id = ?`, [Number(req.params.id), cid(req)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET / — list parts for the company (most recent first)
router.get("/", async (req, res, next) => {
  try {
    const q = (req.query.q || "").toString().trim();
    let where = "WHERE company_id = ?";
    const params = [cid(req)];
    if (q) {
      where += " AND (part_name LIKE ? OR make LIKE ? OR model LIKE ?)";
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const [rows] = await pool.query(
      `SELECT id, part_name AS partName, make, model, photo_url AS photoUrl,
              total_quantity AS totalQuantity, available_quantity AS availableQuantity, unit,
              created_by_name AS createdByName, created_at AS createdAt
       FROM parts ${where}
       ORDER BY created_at DESC
       LIMIT 500`,
      params
    );
    // Pre-sign photo URLs so private S3 objects render in the app.
    const out = await Promise.all(rows.map(async (r) => ({
      ...r,
      photoUrl: await presignIfS3(r.photoUrl),
    })));
    res.json(out);
  } catch (err) { next(err); }
});

export default router;
