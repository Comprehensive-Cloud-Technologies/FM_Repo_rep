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
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { uploadToS3, S3_FOLDERS, presignIfS3 } from "../utils/s3.js";
import { isZohoEnabled, ensureItem as zohoEnsureItem } from "../utils/zohoBooks.js";

const router = Router();
router.use(requireCompanyAuth);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cid = (req) => req.companyUser.companyId;

// Turn a stored photo URL into something the client can load: pre-sign private
// S3 objects, and make local /uploads paths absolute against the current host.
const resolvePhotoUrl = async (req, url) => {
  if (!url) return url;
  const signed = await presignIfS3(url);
  if (signed && signed.startsWith("/")) return `${req.protocol}://${req.get("host")}${signed}`;
  return signed;
};

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
    "ADD COLUMN zoho_item_id VARCHAR(60) DEFAULT NULL",
    // Healthcare spare-part item fields (v1)
    "ADD COLUMN sku VARCHAR(80) DEFAULT NULL",
    "ADD COLUMN hsn VARCHAR(20) DEFAULT NULL",
    "ADD COLUMN gst_rate DECIMAL(5,2) DEFAULT NULL",
    "ADD COLUMN purchase_rate DECIMAL(12,2) DEFAULT NULL",
    "ADD COLUMN mpn VARCHAR(120) DEFAULT NULL",
    "ADD COLUMN compatible_equipment VARCHAR(200) DEFAULT NULL",
    "ADD COLUMN criticality VARCHAR(20) DEFAULT NULL",
  ]) {
    try { await pool.query(`ALTER TABLE parts ${col}`); } catch (err) { /* column exists */ }
  }
})();

// Build the Zoho Item payload from a part row (shared by single + bulk sync).
function zohoItemInputFromPart(p) {
  return {
    name: p.part_name,
    sku: p.sku || [p.make, p.model].filter(Boolean).join("-") || undefined,
    hsn: p.hsn || undefined,
    rate: p.purchase_rate != null ? Number(p.purchase_rate) : 0,
    taxRate: p.gst_rate != null ? Number(p.gst_rate) : undefined,
    unit: p.unit || undefined,
    // Healthcare traceability packed into the item description.
    description: [
      p.make && `Make: ${p.make}`, p.model && `Model: ${p.model}`,
      p.mpn && `MPN: ${p.mpn}`, p.compatible_equipment && `Fits: ${p.compatible_equipment}`,
      p.criticality && `Criticality: ${p.criticality}`,
    ].filter(Boolean).join(" · ") || undefined,
  };
}

/** Best-effort: upsert a part into Zoho Books Items and cache its id. Never throws. */
async function syncPartToZoho(companyId, partId) {
  if (!isZohoEnabled()) return;
  try {
    const [[p]] = await pool.query(
      `SELECT id, part_name, make, model, sku, hsn, gst_rate, purchase_rate, mpn, compatible_equipment, criticality, unit, zoho_item_id
       FROM parts WHERE id = ? AND company_id = ?`, [partId, companyId]);
    if (!p || p.zoho_item_id) return;
    const itemId = await zohoEnsureItem(zohoItemInputFromPart(p));
    if (itemId) await pool.query(`UPDATE parts SET zoho_item_id = ? WHERE id = ?`, [itemId, p.id]);
  } catch { /* leave unsynced; retried on next touch */ }
}

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
    let url;
    try {
      url = await uploadToS3({
        buffer:   req.file.buffer,
        mimetype: req.file.mimetype,
        folder:   S3_FOLDERS.parts,
        filename,
      });
    } catch (s3err) {
      // Fallback to local disk when S3 isn't configured (e.g. local dev without
      // AWS credentials). Served statically from /uploads. Production keeps S3.
      const dir = path.join(__dirname, "../../uploads/parts");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, filename), req.file.buffer);
      url = `/uploads/parts/${filename}`;
    }
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

// POST /sync-zoho — bulk-push all not-yet-synced parts to Zoho Books as items
router.post("/sync-zoho", async (req, res, next) => {
  try {
    const role = (req.companyUser.role || "").toLowerCase();
    if (!["admin", "catalyst_admin", "supervisor", "finance", "accounts", "purchase", "procurement"].includes(role)) {
      return res.status(403).json({ message: "Not allowed to synchronise" });
    }
    if (!isZohoEnabled()) return res.status(400).json({ message: "Zoho Books is not enabled (set BOOKS_PROVIDER=zoho and credentials)" });
    const [parts] = await pool.query(
      `SELECT id, part_name, make, model, sku, hsn, gst_rate, purchase_rate, mpn, compatible_equipment, criticality, unit, zoho_item_id
       FROM parts WHERE company_id = ? ORDER BY id`, [cid(req)]
    );
    let synced = 0, failed = 0, already = 0;
    const errors = [];
    for (const p of parts) {
      if (p.zoho_item_id) { already++; continue; }
      try {
        const itemId = await zohoEnsureItem(zohoItemInputFromPart(p));
        if (itemId) { await pool.query(`UPDATE parts SET zoho_item_id = ? WHERE id = ?`, [itemId, p.id]); synced++; }
        else failed++;
      } catch (e) { failed++; if (errors.length < 5) errors.push(`${p.part_name}: ${e.message}`); }
    }
    res.json({ ok: true, total: parts.length, synced, alreadySynced: already, failed, errors });
  } catch (err) { next(err); }
});

// POST / — create a part
router.post("/", async (req, res, next) => {
  try {
    const { partName, make = null, model = null, photoUrl = null,
            totalQuantity, availableQuantity, unit = null,
            sku = null, hsn = null, gstRate = null, purchaseRate = null,
            mpn = null, compatibleEquipment = null, criticality = null } = req.body || {};
    if (!partName || !String(partName).trim()) {
      return res.status(400).json({ message: "Part name is required" });
    }
    const total = toQty(totalQuantity) ?? 0;
    // Available defaults to total when not supplied, and never exceeds total.
    let avail = toQty(availableQuantity);
    if (avail === null) avail = total;
    if (avail > total) avail = total;
    const str = (v) => (v != null && String(v).trim() !== "" ? String(v).trim() : null);
    const num = (v) => (v != null && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
    const [result] = await pool.query(
      `INSERT INTO parts
         (company_id, part_name, make, model, photo_url, total_quantity, available_quantity, unit,
          sku, hsn, gst_rate, purchase_rate, mpn, compatible_equipment, criticality,
          created_by, created_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cid(req),
        String(partName).trim(),
        str(make), str(model), photoUrl || null, total, avail, str(unit),
        str(sku), str(hsn), num(gstRate), num(purchaseRate), str(mpn), str(compatibleEquipment), str(criticality),
        req.companyUser.id,
        req.companyUser.fullName || req.companyUser.email || null,
      ]
    );
    syncPartToZoho(cid(req), result.insertId); // fire-and-forget Zoho Items sync
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
    const s = (v) => (v != null && String(v).trim() !== "" ? String(v).trim() : null);
    const n = (v) => (v != null && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
    if (b.sku !== undefined) { sets.push("sku = ?"); params.push(s(b.sku)); }
    if (b.hsn !== undefined) { sets.push("hsn = ?"); params.push(s(b.hsn)); }
    if (b.gstRate !== undefined) { sets.push("gst_rate = ?"); params.push(n(b.gstRate)); }
    if (b.purchaseRate !== undefined) { sets.push("purchase_rate = ?"); params.push(n(b.purchaseRate)); }
    if (b.mpn !== undefined) { sets.push("mpn = ?"); params.push(s(b.mpn)); }
    if (b.compatibleEquipment !== undefined) { sets.push("compatible_equipment = ?"); params.push(s(b.compatibleEquipment)); }
    if (b.criticality !== undefined) { sets.push("criticality = ?"); params.push(s(b.criticality)); }

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
              sku, hsn, gst_rate AS gstRate, purchase_rate AS purchaseRate,
              mpn, compatible_equipment AS compatibleEquipment, criticality,
              created_by_name AS createdByName, created_at AS createdAt
       FROM parts ${where}
       ORDER BY created_at DESC
       LIMIT 500`,
      params
    );
    // Resolve photo URLs (pre-sign S3, absolutize local /uploads) so they render.
    const out = await Promise.all(rows.map(async (r) => ({
      ...r,
      photoUrl: await resolvePhotoUrl(req, r.photoUrl),
    })));
    res.json(out);
  } catch (err) { next(err); }
});

export default router;
