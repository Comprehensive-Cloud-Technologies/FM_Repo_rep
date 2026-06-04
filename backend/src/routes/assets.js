import { Router } from "express";
import { body, param, query } from "express-validator";
import multer from "multer";
import * as XLSX from "xlsx";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── GET /api/assets/bulk-import/template  (public — no auth needed) ──────────
router.get("/bulk-import/template", (_req, res) => {
  const wb = XLSX.utils.book_new();
  const headers = [
    "assetName*", "assetType", "departmentName",
    "building", "floor", "room", "assetUniqueId", "status",
  ];
  const example  = ["Machine A",   "general",    "ICU",   "Block A", "1", "101", "", "Active"];
  const example2 = ["Ventilator B", "healthcare", "OPD",   "Block B", "2", "202", "", "Active"];
  const ws = XLSX.utils.aoa_to_sheet([headers, example, example2]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 20) }));
  XLSX.utils.book_append_sheet(wb, ws, "Assets");

  const notes = [
    ["Column",         "Required?", "Notes"],
    ["assetName",      "Yes",       "Name / Equipment Name / Item Name"],
    ["assetType",      "No",        "e.g. general, healthcare, fleet — defaults to 'general'"],
    ["departmentName", "No",        "Exact department name. Leave blank if unknown."],
    ["building",       "No",        "Building / Location label"],
    ["floor",          "No",        "Floor number or label"],
    ["room",           "No",        "Room / Ward number"],
    ["assetUniqueId",  "No",        "Leave blank to auto-generate a unique QR code ID"],
    ["status",         "No",        "Active or Inactive — defaults to Active"],
  ];
  const wsNotes = XLSX.utils.aoa_to_sheet(notes);
  wsNotes["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", 'attachment; filename="asset-import-template.xlsx"');
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
});

router.use(requireAuth);

// ── Multer: memory storage for Excel uploads (no disk writes needed) ──────────
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls|csv)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("Only Excel (.xlsx, .xls) or CSV files are allowed"));
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const getAssetType = async (code) => {
  const [rows] = await pool.query(
    "SELECT code, label, category FROM asset_types WHERE code = ? AND status = 'Active'",
    [code]
  );
  return rows[0] || null;
};

const logHistory = async (conn, assetId, action, details, userId) => {
  await conn.execute(
    "INSERT INTO asset_history (asset_id, action, details, created_by) VALUES (?, ?, ?, ?)",
    [assetId, action, JSON.stringify(details || {}), userId || null]
  );
};

/** Verify company belongs to the authenticated user. Returns company row or null. */
const verifyCompanyOwnership = async (conn, companyId, userId) => {
  const [[co]] = await conn.query(
    "SELECT id, sector, sectors FROM companies WHERE id = ? AND user_id = ?",
    [companyId, userId]
  );
  return co || null;
};

/** Verify department belongs to company + user. Returns dept row or null. */
const verifyDepartment = async (conn, departmentId, companyId, userId) => {
  const [[dept]] = await conn.query(
    `SELECT d.id, d.name FROM departments d
     JOIN companies c ON d.company_id = c.id
     WHERE d.id = ? AND d.company_id = ? AND c.user_id = ?`,
    [departmentId, companyId, userId]
  );
  return dept || null;
};

/** Generate a unique asset ID: HC-prefixed for healthcare sectors, AST- otherwise. */
const generateAssetUniqueId = (sectors, singleSector) => {
  const sectorList = Array.isArray(sectors) ? sectors : (singleSector ? [singleSector] : []);
  const isHC = sectorList.includes("healthcare");
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return isHC ? `HC-${dateStr}-${rand}` : `AST-${Date.now().toString(36).toUpperCase()}-${rand}`;
};

/** Parse JSON/string metadata safely. */
const safeMeta = (v) => {
  if (v == null) return {};
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return {}; } }
  return v;
};

/** Split metadata.documents out for separate storage column. */
const splitMeta = (metadata = {}) => {
  const docs = Array.isArray(metadata?.documents) ? metadata.documents : undefined;
  const meta = { ...metadata };
  delete meta.documents;
  return { meta, docs };
};

const upsertLocationHierarchy = async (conn, {
  companyId,
  buildingName,
  floorName,
  roomName,
  createdBy,
}) => {
  const norm = (v) => (v || "").trim();
  const bName = norm(buildingName);
  const fName = norm(floorName);
  const rName = norm(roomName);

  let buildingId = null;
  let floorId = null;
  let roomId = null;
  let locationId = null;
  let buildingLocId = null;
  let floorLocId = null;

  if (bName) {
    const [[b]] = await conn.query(
      `SELECT id, building_name AS buildingName FROM buildings
       WHERE company_id = ? AND LOWER(building_name) = LOWER(?) AND status != 'Deleted' LIMIT 1`,
      [companyId, bName]
    );
    if (b) {
      buildingId = b.id;
    } else {
      const [[{ cnt: bCount }]] = await conn.query("SELECT COUNT(*) AS cnt FROM buildings WHERE company_id = ?", [companyId]);
      const bCode = `BLD-${String(bCount + 1).padStart(3, "0")}`;
      const [insB] = await conn.execute(
        `INSERT INTO buildings (company_id, building_code, building_name, status, created_by)
         VALUES (?, ?, ?, 'Active', ?)`,
        [companyId, bCode, bName, createdBy || null]
      );
      buildingId = insB.insertId;
      const [locB] = await conn.execute(
        `INSERT INTO locations (company_id, location_type, reference_id, parent_location_id, location_code, location_name, status, created_by)
         VALUES (?, 'Building', ?, NULL, ?, ?, 'Active', ?)`,
        [companyId, buildingId, bCode, bName, createdBy || null]
      );
      buildingLocId = locB.insertId;
    }

    if (!buildingLocId) {
      const [[bLoc]] = await conn.query(
        `SELECT id FROM locations WHERE location_type = 'Building' AND reference_id = ? LIMIT 1`,
        [buildingId]
      );
      buildingLocId = bLoc?.id || null;
    }
  }

  if (buildingId && fName) {
    const [[f]] = await conn.query(
      `SELECT id, floor_name AS floorName FROM floors
       WHERE building_id = ? AND LOWER(floor_name) = LOWER(?) AND status != 'Deleted' LIMIT 1`,
      [buildingId, fName]
    );
    if (f) {
      floorId = f.id;
    } else {
      const [[{ cnt: fCount }]] = await conn.query("SELECT COUNT(*) AS cnt FROM floors WHERE building_id = ?", [buildingId]);
      const fCode = `FLR-${String(fCount + 1).padStart(3, "0")}`;
      const parsedFloorNum = /^\d+$/.test(fName) ? Number(fName) : null;
      const [insF] = await conn.execute(
        `INSERT INTO floors (building_id, floor_code, floor_name, floor_number, status, created_by)
         VALUES (?, ?, ?, ?, 'Active', ?)`,
        [buildingId, fCode, fName, parsedFloorNum, createdBy || null]
      );
      floorId = insF.insertId;
      const [locF] = await conn.execute(
        `INSERT INTO locations (company_id, location_type, reference_id, parent_location_id, location_code, location_name, status, created_by)
         VALUES (?, 'Floor', ?, ?, ?, ?, 'Active', ?)`,
        [companyId, floorId, buildingLocId, fCode, fName, createdBy || null]
      );
      floorLocId = locF.insertId;
    }

    if (!floorLocId) {
      const [[fLoc]] = await conn.query(
        `SELECT id FROM locations WHERE location_type = 'Floor' AND reference_id = ? LIMIT 1`,
        [floorId]
      );
      floorLocId = fLoc?.id || null;
    }
  }

  if (floorId && rName) {
    const [[r]] = await conn.query(
      `SELECT id, room_name AS roomName FROM rooms
       WHERE floor_id = ? AND LOWER(room_name) = LOWER(?) AND status != 'Deleted' LIMIT 1`,
      [floorId, rName]
    );
    if (r) {
      roomId = r.id;
    } else {
      const [[{ cnt: rCount }]] = await conn.query("SELECT COUNT(*) AS cnt FROM rooms WHERE floor_id = ?", [floorId]);
      const rCode = `RM-${String(rCount + 1).padStart(3, "0")}`;
      const [insR] = await conn.execute(
        `INSERT INTO rooms (floor_id, room_code, room_name, status, created_by)
         VALUES (?, ?, ?, 'Active', ?)`,
        [floorId, rCode, rName, createdBy || null]
      );
      roomId = insR.insertId;
      const [locR] = await conn.execute(
        `INSERT INTO locations (company_id, location_type, reference_id, parent_location_id, location_code, location_name, status, created_by)
         VALUES (?, 'Room', ?, ?, ?, ?, 'Active', ?)`,
        [companyId, roomId, floorLocId, rCode, rName, createdBy || null]
      );
      locationId = locR.insertId;
    }

    if (!locationId) {
      const [[rLoc]] = await conn.query(
        `SELECT id FROM locations WHERE location_type = 'Room' AND reference_id = ? LIMIT 1`,
        [roomId]
      );
      locationId = rLoc?.id || null;
    }
  }

  return {
    buildingId,
    floorId,
    roomId,
    locationId,
    building: bName || null,
    floor: fName || null,
    room: rName || null,
  };
};

const createRules = [
  body("companyId").isInt({ min: 1 }).withMessage("companyId is required"),
  body("departmentId").isInt({ min: 1 }).withMessage("departmentId is required"),
  body("assetName").trim().notEmpty().withMessage("Asset name is required"),
  body("assetType").trim().notEmpty().withMessage("Invalid asset type"),
  body("status").optional().isIn(["Active", "Inactive"]),
  body("assetUniqueId").optional().isString().isLength({ max: 120 }),
  body("building").optional().isString().isLength({ max: 160 }),
  body("floor").optional().isString().isLength({ max: 80 }),
  body("room").optional().isString().isLength({ max: 160 }),
  body("qrCode").optional().isString().isLength({ max: 255 }),
  body("metadata").optional().isObject(),
];

const updateRules = [
  param("id").isInt().withMessage("id must be numeric"),
  body("departmentId").optional().isInt({ min: 1 }),
  body("assetName").optional().isString().notEmpty(),
  body("assetType").optional().isString().trim(),
  body("status").optional().isIn(["Active", "Inactive"]),
  body("assetUniqueId").optional().isString().isLength({ max: 120 }),
  body("building").optional().isString().isLength({ max: 160 }),
  body("floor").optional().isString().isLength({ max: 80 }),
  body("room").optional().isString().isLength({ max: 160 }),
  body("qrCode").optional().isString().isLength({ max: 255 }),
  body("metadata").optional().isObject(),
];

// ── GET /api/assets ────────────────────────────────────────────────────────────
router.get(
  "/",
  validate([
    query("companyId").optional().isInt({ min: 1 }),
    query("departmentId").optional().isInt({ min: 1 }),
    query("type").optional().isString().trim(),
    query("status").optional().isIn(["Active", "Inactive"]),
    query("search").optional().isString(),
    query("page").optional().isInt({ min: 1 }),
    query("limit").optional().isInt({ min: 1, max: 500 }),
  ]),
  async (req, res, next) => {
    try {
      const { companyId, departmentId, type, status, search } = req.query;
      const page   = Math.max(1, parseInt(req.query.page  || "1", 10));
      const limit  = Math.min(500, Math.max(1, parseInt(req.query.limit || "200", 10)));
      const offset = (page - 1) * limit;

      const params = [req.user.id];
      let where = "WHERE c.user_id = ?";

      if (companyId)    { where += " AND c.id = ?";            params.push(companyId); }
      if (departmentId) { where += " AND a.department_id = ?"; params.push(departmentId); }
      if (type)         { where += " AND a.asset_type = ?";    params.push(type); }
      if (status)       { where += " AND a.status = ?";        params.push(status); }
      if (search) {
        const like = `%${search}%`;
        where += " AND (a.asset_name LIKE ? OR a.asset_unique_id LIKE ? OR a.qr_code LIKE ? OR CAST(a.id AS CHAR) LIKE ? OR a.generated_asset_id LIKE ? OR a.building LIKE ? OR a.room LIKE ?)";
        params.push(like, like, like, like, like, like, like);
      }

      const [rows] = await pool.query(
        `SELECT a.id,
                a.company_id      AS companyId,
                c.company_name    AS companyName,
                a.asset_name      AS assetName,
                a.asset_unique_id AS assetUniqueId,
                a.generated_asset_id AS generatedAssetId,
                a.asset_type      AS assetType,
                a.building, a.floor, a.room,
                a.status,
                a.is_verified     AS verified,
                a.qr_code         AS qrCode,
                a.department_id   AS departmentId,
                d.name            AS departmentName,
                a.created_by      AS createdBy,
                a.created_at      AS createdAt,
                ad.metadata, ad.documents
         FROM assets a
         JOIN  companies c   ON a.company_id = c.id
         LEFT JOIN departments d    ON a.department_id = d.id
         LEFT JOIN asset_details ad ON ad.asset_id = a.id
         ${where}
         ORDER BY a.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const normalized = rows.map((r) => {
        const meta = safeMeta(r.metadata);
        const docs = r.documents != null
          ? (typeof r.documents === "string" ? JSON.parse(r.documents) : r.documents)
          : undefined;
        return { ...r, metadata: docs ? { ...meta, documents: docs } : meta, documents: undefined };
      });

      res.json(normalized);
    } catch (err) {
      next(err);
    }
  }
);

// ── POST /api/assets/bulk-import ──────────────────────────────────────────────
// Upload an Excel/CSV file to register multiple assets (up to 1000) at once.
// Query params: companyId (required)
// File field: "file"  (.xlsx / .xls / .csv)
// Required Excel column: assetName  (case-insensitive, asterisk stripped)
// Optional columns: assetType, departmentName, building, floor, room, assetUniqueId, status
// Auto-generates assetUniqueId + links a QR entry for every created asset.
router.post(
  "/bulk-import",
  excelUpload.single("file"),
  validate([
    query("companyId").isInt({ min: 1 }).withMessage("companyId is required"),
  ]),
  async (req, res, next) => {
    if (!req.file) return res.status(400).json({ message: "Excel file is required" });

    const companyId = parseInt(req.query.companyId, 10);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const co = await verifyCompanyOwnership(conn, companyId, req.user.id);
      if (!co) { await conn.rollback(); return res.status(404).json({ message: "Company not found for user" }); }

      // Cache all departments for this company to resolve names without N+1 queries
      const [allDepts] = await conn.query(
        "SELECT id, name FROM departments WHERE company_id = ?", [companyId]
      );
      const deptByName = new Map(allDepts.map((d) => [d.name.toLowerCase().trim(), d.id]));

      const sectors = Array.isArray(co.sectors)
        ? co.sectors
        : (co.sectors ? safeMeta(co.sectors) : (co.sector ? [co.sector] : []));

      // Parse Excel / CSV
      const wb      = XLSX.read(req.file.buffer, { type: "buffer" });
      const ws      = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rawRows.length) { await conn.rollback(); return res.status(400).json({ message: "The file has no data rows" }); }
      if (rawRows.length > 1000) { await conn.rollback(); return res.status(400).json({ message: "Maximum 1000 assets per import" }); }

      // Normalise column keys: strip *, spaces, lowercase
      const normaliseRow = (row) => {
        const n = {};
        for (const [k, v] of Object.entries(row))
          n[k.replace(/[*\s]/g, "").toLowerCase()] = String(v ?? "").trim();
        return n;
      };

      // Pick first non-empty value from candidate keys
      const pick = (row, ...keys) => {
        for (const k of keys) { const v = row[k]; if (v) return v; }
        return "";
      };

      const created = [];
      const skipped = [];

      // Fetch company code and state code for generating asset IDs
      const [[compInfo]] = await conn.query(
        `SELECT c.company_code, s.state_code FROM companies c LEFT JOIN states s ON c.state_id = s.id WHERE c.id = ?`,
        [companyId]
      );
      const [[{ cnt: initialCount }]] = await conn.query(
        "SELECT COUNT(*) as cnt FROM assets WHERE company_id = ?", [companyId]
      );
      const bulkCCode = (compInfo?.company_code || "CO").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const bulkSCode = (compInfo?.state_code  || "NA").toUpperCase().replace(/[^A-Z0-9]/g, "");
      let assetSeqCounter = initialCount;

      for (let i = 0; i < rawRows.length; i++) {
        const row    = normaliseRow(rawRows[i]);
        const rowNum = i + 2; // Excel row number (header = row 1)

        const assetName = pick(row,
          "assetname", "asset_name", "name", "equipmentname", "equipment_name",
          "itemname", "item_name", "description", "equipmentdescription",
          "assetdescription", "machinename", "devicename"
        );
        if (!assetName) { skipped.push({ row: rowNum, reason: "Asset name column is empty" }); continue; }

        const assetType = pick(row,
          "assettype", "asset_type", "type", "category", "equipmenttype",
          "equipment_type", "itemtype", "assetcategory"
        ) || "general";

        const building = pick(row, "building", "block", "location", "site", "campus", "area") || null;
        const floor    = pick(row, "floor", "level", "storey") || null;
        const room     = pick(row, "room", "ward", "unit", "roomno", "roomnumber", "bed", "station") || null;

        const rawStatus = pick(row, "status", "condition", "state");
        const status = rawStatus && rawStatus.toLowerCase().includes("inact") ? "Inactive" : "Active";

        const providedUniqueId = pick(row,
          "assetuniqueid", "asset_unique_id", "uniqueid", "qrcode", "qr_code",
          "barcode", "assetcode", "asset_code", "assetid", "equipmentid",
          "equipmentno", "tagno", "tagnumber", "assettag"
        );
        const uniqueIdToUse = providedUniqueId || generateAssetUniqueId(sectors, co.sector);

        const deptNameRaw = pick(row,
          "departmentname", "department_name", "department", "dept",
          "ward", "unit", "section", "division"
        );
        const departmentId = deptNameRaw ? (deptByName.get(deptNameRaw.toLowerCase()) ?? null) : null;

        try {
          const loc = await upsertLocationHierarchy(conn, {
            companyId,
            buildingName: building,
            floorName: floor,
            roomName: room,
            createdBy: req.user.id,
          });

          assetSeqCounter++;
          const bulkGeneratedId = `${bulkCCode}-${bulkSCode}-${String(assetSeqCounter).padStart(6, "0")}`;
          const [result] = await conn.execute(
            `INSERT INTO assets
               (company_id, department_id, asset_name, asset_unique_id, generated_asset_id, asset_type,
                building, floor, room, building_id, floor_id, room_id, location_id,
                status, qr_code, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [companyId, departmentId, assetName, uniqueIdToUse, bulkGeneratedId, assetType,
             loc.building, loc.floor, loc.room, loc.buildingId, loc.floorId, loc.roomId, loc.locationId,
             status, uniqueIdToUse, req.user.id]
          );
          const assetId = result.insertId;

          await conn.execute(
            "INSERT INTO asset_details (asset_id, metadata) VALUES (?, '{}')",
            [assetId]
          );

          // Auto-link a QR entry (already-generated unique ID acts as the QR code)
          await conn.execute(
            `INSERT INTO asset_pre_qr (company_id, qr_unique_id, asset_id, linked_at)
             VALUES (?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE asset_id = VALUES(asset_id), linked_at = NOW()`,
            [companyId, uniqueIdToUse, assetId]
          );

          await logHistory(conn, assetId, "created",
            { assetName, assetType, departmentId, status, source: "bulk-import" }, req.user.id);

          created.push({ row: rowNum, id: assetId, assetName, assetUniqueId: uniqueIdToUse,
            generatedAssetId: bulkGeneratedId,
            assetType, qrCode: uniqueIdToUse,
            building: loc.building, floor: loc.floor, room: loc.room,
            buildingId: loc.buildingId, floorId: loc.floorId, roomId: loc.roomId,
            status, departmentName: deptNameRaw || null });
        } catch (rowErr) {
          skipped.push({ row: rowNum, assetName, reason: rowErr.message });
        }
      }

      await conn.commit();
      res.status(201).json({
        total: rawRows.length, created: created.length, skipped: skipped.length,
        assets: created, errors: skipped,
      });
    } catch (err) {
      await conn.rollback();
      next(err);
    } finally {
      conn.release();
    }
  }
);

// ── POST /api/assets ──────────────────────────────────────────────────────────
router.post(
  "/",
  validate(createRules),
  async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const {
        companyId, departmentId, assetName, assetType,
        assetUniqueId, building, floor, room,
        buildingId, floorId, locDeptId, roomId, locationId,
        status = "Active", qrCode, metadata = {},
      } = req.body;

      const assetTypeRecord = await getAssetType(assetType);
      if (!assetTypeRecord) { await conn.rollback(); return res.status(400).json({ message: "Asset type does not exist or is inactive" }); }

      const co = await verifyCompanyOwnership(conn, companyId, req.user.id);
      if (!co) { await conn.rollback(); return res.status(404).json({ message: "Company not found for user" }); }

      const dept = await verifyDepartment(conn, departmentId, companyId, req.user.id);
      if (!dept) { await conn.rollback(); return res.status(404).json({ message: "Department not found for company" }); }

      const sectors = Array.isArray(co.sectors) ? co.sectors : safeMeta(co.sectors);
      const uniqueIdToUse = assetUniqueId || generateAssetUniqueId(sectors, co.sector);

      // ── Generate formatted Asset ID: COMPANY_CODE-STATE_CODE-000001 ──────────
      const [[compInfo]] = await conn.query(
        `SELECT c.company_code, s.state_code FROM companies c
         LEFT JOIN states s ON c.state_id = s.id WHERE c.id = ?`,
        [companyId]
      );
      const [[{ cnt: assetSeq }]] = await conn.query(
        "SELECT COUNT(*) as cnt FROM assets WHERE company_id = ?", [companyId]
      );
      const cCode = (compInfo?.company_code || "CO").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const sCode = (compInfo?.state_code  || "NA").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const generatedAssetId = `${cCode}-${sCode}-${String(assetSeq + 1).padStart(6, "0")}`;

      const loc = await upsertLocationHierarchy(conn, {
        companyId,
        buildingName: building,
        floorName: floor,
        roomName: room,
        createdBy: req.user.id,
      });

      const [result] = await conn.execute(
        `INSERT INTO assets
           (company_id, department_id, asset_name, asset_unique_id, generated_asset_id, asset_type,
            building, floor, room, building_id, floor_id, loc_dept_id, room_id, location_id,
            status, qr_code, created_by, verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [companyId, departmentId, assetName, uniqueIdToUse, generatedAssetId, assetTypeRecord.code,
        loc.building, loc.floor, loc.room,
        buildingId || loc.buildingId || null,
        floorId || loc.floorId || null,
        locDeptId || null,
        roomId || loc.roomId || null,
        locationId || loc.locationId || null,
         status, qrCode || null, req.user.id]
      );

      const assetId = result.insertId;
      const { meta, docs } = splitMeta(metadata);

      await conn.execute(
        "INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)",
        [assetId, JSON.stringify(meta), docs ? JSON.stringify(docs) : null]
      );

      await logHistory(conn, assetId, "created", {
        assetName, assetType: assetTypeRecord.code, departmentId, status, building, floor, room,
      }, req.user.id);

      await conn.commit();

      res.status(201).json({
        id: assetId, companyId, assetName,
        assetUniqueId: uniqueIdToUse, generatedAssetId,
        assetType: assetTypeRecord.code,
        departmentId, departmentName: dept.name,
        building: building || null, floor: floor || null, room: room || null,
        status, qrCode: qrCode || null, metadata, createdBy: req.user.id,
      });
    } catch (err) {
      await conn.rollback();
      next(err);
    } finally {
      conn.release();
    }
  }
);

// ── PUT /api/assets/:id ────────────────────────────────────────────────────────
router.put(
  "/:id",
  validate(updateRules),
  async (req, res, next) => {
    const { id } = req.params;
    const {
      assetName, assetType, departmentId, assetUniqueId,
      building, floor, room, status, qrCode, metadata,
    } = req.body;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[asset]] = await conn.query(
        `SELECT a.id, a.company_id
         FROM assets a
         JOIN companies c ON a.company_id = c.id
         WHERE a.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (!asset) { await conn.rollback(); return res.status(404).json({ message: "Asset not found" }); }

      if (assetType !== undefined) {
        const atRec = await getAssetType(assetType);
        if (!atRec) { await conn.rollback(); return res.status(400).json({ message: "Asset type does not exist or is inactive" }); }
      }

      if (departmentId !== undefined) {
        const dept = await verifyDepartment(conn, departmentId, asset.company_id, req.user.id);
        if (!dept) { await conn.rollback(); return res.status(404).json({ message: "Department not found for company" }); }
      }

      await conn.execute(
        `UPDATE assets
         SET asset_name      = COALESCE(?, asset_name),
             asset_unique_id = COALESCE(?, asset_unique_id),
             asset_type      = COALESCE(?, asset_type),
             department_id   = COALESCE(?, department_id),
             building        = COALESCE(?, building),
             floor           = COALESCE(?, floor),
             room            = COALESCE(?, room),
             status          = COALESCE(?, status),
             qr_code         = COALESCE(?, qr_code)
         WHERE id = ?`,
        [assetName || null, assetUniqueId || null, assetType || null,
         departmentId || null, building || null, floor || null,
         room || null, status || null, qrCode || null, id]
      );

      if (metadata !== undefined) {
        const { meta, docs } = splitMeta(metadata);
        const [[det]] = await conn.query("SELECT id FROM asset_details WHERE asset_id = ?", [id]);
        if (det) {
          await conn.execute(
            "UPDATE asset_details SET metadata = ?, documents = ? WHERE asset_id = ?",
            [JSON.stringify(meta), docs ? JSON.stringify(docs) : null, id]
          );
        } else {
          await conn.execute(
            "INSERT INTO asset_details (asset_id, metadata, documents) VALUES (?, ?, ?)",
            [id, JSON.stringify(meta), docs ? JSON.stringify(docs) : null]
          );
        }
      }

      await logHistory(conn, id, "updated",
        { assetName, assetType, departmentId, status, building, floor, room }, req.user.id);

      await conn.commit();
      res.json({ message: "Asset updated" });
    } catch (err) {
      await conn.rollback();
      next(err);
    } finally {
      conn.release();
    }
  }
);

// ── PUT /api/assets/bulk-verify ──────────────────────────────────────────────
// Mark one or more assets as verified (verified = 1) by the admin.
// Body: { ids: [1,2,3], verified: 1|0 }
router.put("/bulk-verify", async (req, res, next) => {
  const { ids, verified = 1 } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "ids array is required" });
  }
  const safeIds = ids.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (!safeIds.length) return res.status(400).json({ message: "No valid ids provided" });

  try {
    const placeholders = safeIds.map(() => "?").join(",");
    // Verify ownership: all assets must belong to this user's companies
    const [owned] = await pool.query(
      `SELECT a.id FROM assets a
       JOIN companies c ON a.company_id = c.id
       WHERE a.id IN (${placeholders}) AND c.user_id = ?`,
      [...safeIds, req.user.id]
    );
    const ownedIds = owned.map(r => r.id);
    if (!ownedIds.length) return res.status(404).json({ message: "No assets found" });

    const ph = ownedIds.map(() => "?").join(",");
    await pool.query(
      `UPDATE assets SET verified = ? WHERE id IN (${ph})`,
      [verified ? 1 : 0, ...ownedIds]
    );
    res.json({ updated: ownedIds.length, message: `${ownedIds.length} asset(s) updated` });
  } catch (err) { next(err); }
});

// ── PUT /api/assets/:id/verify ────────────────────────────────────────────────
router.put("/:id/verify", async (req, res, next) => {
  const { verified = 1 } = req.body;
  try {
    const [[asset]] = await pool.query(
      `SELECT a.id FROM assets a JOIN companies c ON a.company_id = c.id
       WHERE a.id = ? AND c.user_id = ?`, [req.params.id, req.user.id]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found" });
    await pool.query("UPDATE assets SET verified = ? WHERE id = ?", [verified ? 1 : 0, req.params.id]);
    res.json({ message: "Asset verification updated" });
  } catch (err) { next(err); }
});

// ── DELETE /api/assets/delete-all ────────────────────────────────────────────
// Permanently deletes ALL assets for a company (no limit). Admin-only.
// Query param: companyId (required)
router.delete(
  "/delete-all",
  validate([query("companyId").isInt({ min: 1 }).withMessage("companyId is required")]),
  async (req, res, next) => {
    const companyId = parseInt(req.query.companyId, 10);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const co = await verifyCompanyOwnership(conn, companyId, req.user.id);
      if (!co) {
        await conn.rollback();
        return res.status(404).json({ message: "Company not found for user" });
      }

      // Delete related QR entries first
      await conn.execute("DELETE FROM asset_pre_qr WHERE company_id = ?", [companyId]);
      // Delete asset details (cascade may handle this, but be explicit)
      await conn.execute(
        "DELETE ad FROM asset_details ad JOIN assets a ON ad.asset_id = a.id WHERE a.company_id = ?",
        [companyId]
      );
      // Delete asset history
      await conn.execute(
        "DELETE ah FROM asset_history ah JOIN assets a ON ah.asset_id = a.id WHERE a.company_id = ?",
        [companyId]
      );
      // Delete all assets
      const [result] = await conn.execute(
        "DELETE FROM assets WHERE company_id = ?",
        [companyId]
      );

      await conn.commit();
      res.json({ deleted: result.affectedRows, message: `${result.affectedRows} assets deleted` });
    } catch (err) {
      await conn.rollback();
      next(err);
    } finally {
      conn.release();
    }
  }
);

// ── DELETE /api/assets/bulk ─────────────────────────────────────────────────
// Permanently deletes selected assets for a company (no hard count limit).
// Body: { ids: number[] }, Query: companyId
router.delete(
  "/bulk",
  validate([query("companyId").isInt({ min: 1 }).withMessage("companyId is required")]),
  async (req, res, next) => {
    const companyId = parseInt(req.query.companyId, 10);
    const ids = Array.isArray(req.body?.ids)
      ? [...new Set(req.body.ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
      : [];

    if (!ids.length) return res.status(400).json({ message: "ids array is required" });

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const co = await verifyCompanyOwnership(conn, companyId, req.user.id);
      if (!co) {
        await conn.rollback();
        return res.status(404).json({ message: "Company not found for user" });
      }

      let deleted = 0;
      const CHUNK_SIZE = 500;

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => "?").join(",");

        await conn.execute(
          `DELETE FROM asset_pre_qr WHERE company_id = ? AND asset_id IN (${placeholders})`,
          [companyId, ...chunk]
        );
        await conn.execute(
          `DELETE FROM asset_details WHERE asset_id IN (${placeholders})`,
          chunk
        );
        await conn.execute(
          `DELETE FROM asset_history WHERE asset_id IN (${placeholders})`,
          chunk
        );
        const [result] = await conn.execute(
          `DELETE FROM assets WHERE company_id = ? AND id IN (${placeholders})`,
          [companyId, ...chunk]
        );
        deleted += Number(result.affectedRows || 0);
      }

      await conn.commit();
      res.json({ deleted, message: `${deleted} asset(s) deleted` });
    } catch (err) {
      await conn.rollback();
      next(err);
    } finally {
      conn.release();
    }
  }
);

// ── DELETE /api/assets/:id ────────────────────────────────────────────────────
router.delete(
  "/:id",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [[asset]] = await conn.query(
        `SELECT a.id FROM assets a
         JOIN companies c ON a.company_id = c.id
         WHERE a.id = ? AND c.user_id = ?`,
        [req.params.id, req.user.id]
      );
      if (!asset) { await conn.rollback(); return res.status(404).json({ message: "Asset not found" }); }

      await logHistory(conn, req.params.id, "deleted", {}, req.user.id);
      await conn.execute("DELETE FROM assets WHERE id = ?", [req.params.id]);

      await conn.commit();
      res.status(204).send();
    } catch (err) {
      await conn.rollback();
      next(err);
    } finally {
      conn.release();
    }
  }
);

export default router;
