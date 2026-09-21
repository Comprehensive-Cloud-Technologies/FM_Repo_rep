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
})();

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

// POST / — create a part
router.post("/", async (req, res, next) => {
  try {
    const { partName, make = null, model = null, photoUrl = null } = req.body || {};
    if (!partName || !String(partName).trim()) {
      return res.status(400).json({ message: "Part name is required" });
    }
    const [result] = await pool.query(
      `INSERT INTO parts (company_id, part_name, make, model, photo_url, created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        cid(req),
        String(partName).trim(),
        make ? String(make).trim() : null,
        model ? String(model).trim() : null,
        photoUrl || null,
        req.companyUser.id,
        req.companyUser.fullName || req.companyUser.email || null,
      ]
    );
    res.status(201).json({ id: result.insertId, message: "Part added" });
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
              created_by_name AS createdByName, created_at AS createdAt
       FROM parts ${where}
       ORDER BY created_at DESC
       LIMIT 200`,
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
