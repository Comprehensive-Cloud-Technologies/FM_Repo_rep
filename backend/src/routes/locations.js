/**
 * /api/locations  -  Location Management API (v2)
 *
 * Location hierarchy (pure):  Building -> Floor -> Room
 * Departments are independent, linked to a Building, Floor, or Room
 *
 *   Buildings:    GET/POST/PUT/DELETE /api/locations/buildings
 *   Floors:       GET/POST/PUT/DELETE /api/locations/floors
 *   Rooms:        GET/POST/PUT/DELETE /api/locations/rooms   (?floorId= | ?buildingId=)
 *   Departments:  GET/POST/PUT/DELETE /api/locations/departments (?companyId= | ?buildingId= | ?floorId= | ?roomId=)
 *   Hierarchy:    GET /api/locations/hierarchy?companyId=   (Building->Floor->Room tree)
 */

import { Router } from "express";
import multer from "multer";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const locationImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls|csv)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error("Only Excel (.xlsx, .xls) or CSV files are allowed"));
  },
});

async function insertLocation(conn, {
  companyId, locationType, referenceId, parentLocationId,
  locationCode, locationName, createdBy,
}) {
  const [r] = await conn.execute(
    `INSERT INTO locations (company_id, location_type, reference_id, parent_location_id, location_code, location_name, status, created_by) VALUES (?, ?, ?, ?, ?, ?, 'Active', ?)`,
    [companyId, locationType, referenceId, parentLocationId ?? null, locationCode ?? null, locationName, createdBy ?? null],
  );
  return r.insertId;
}

const firstCell = (row, keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

router.get("/import/template", async (_req, res, next) => {
  try {
    const { default: XLSX } = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const headers = ["Building", "Floor", "Floor Number", "Room", "Room Type", "Capacity"];
    const sample1 = ["Main Building", "Ground Floor", "0", "Reception", "Lobby", "8"];
    const sample2 = ["Main Building", "1st Floor", "1", "ICU-1", "ICU", "12"];
    const sample3 = ["Annex Block", "2nd Floor", "2", "OT-2", "OT", "6"];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample1, sample2, sample3]);
    XLSX.utils.book_append_sheet(wb, ws, "Locations");

    const notes = [
      ["Notes"],
      ["1. Building is required for every row."],
      ["2. Floor is optional, but Room requires a Floor in the same row."],
      ["3. Duplicate names are auto-merged by company/building/floor context."],
      ["4. This upload creates Building -> Floor -> Room hierarchy in one go."],
    ];
    const wsNotes = XLSX.utils.aoa_to_sheet(notes);
    XLSX.utils.book_append_sheet(wb, wsNotes, "Instructions");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="location-import-template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

router.post("/import", locationImportUpload.single("file"), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const companyId = Number(req.body?.companyId || req.query?.companyId);
    if (!companyId) return res.status(400).json({ message: "companyId is required" });
    if (!req.file?.buffer) return res.status(400).json({ message: "file is required" });

    const { default: XLSX } = await import("xlsx");
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "No rows found in uploaded file" });
    }

    await conn.beginTransaction();

    let createdBuildings = 0;
    let createdFloors = 0;
    let createdRooms = 0;
    let skipped = 0;

    for (const row of rows) {
      const buildingName = firstCell(row, ["Building", "building", "Building Name", "building_name"]);
      const floorNameTemplate = firstCell(row, ["Floor", "floor", "Floor Name", "floor_name"]);
      const floorNumberRaw = firstCell(row, ["Floor Number", "floor_number", "Floor No", "floor_no"]);
      const roomName = firstCell(row, ["Room", "room", "Room Name", "room_name", "Room / Area"]);
      const roomType = firstCell(row, ["Room Type", "room_type", "Type"]);
      const capacityRaw = firstCell(row, ["Capacity", "capacity"]);

      if (!buildingName) { skipped += 1; continue; }

      let buildingId;
      let buildingLocId;
      const [[bExisting]] = await conn.execute(
        `SELECT id FROM buildings WHERE company_id = ? AND LOWER(building_name) = LOWER(?) AND status != 'Deleted' LIMIT 1`,
        [companyId, buildingName]
      );
      if (bExisting?.id) {
        buildingId = bExisting.id;
      } else {
        const [[{ cnt: bCount }]] = await conn.query("SELECT COUNT(*) AS cnt FROM buildings WHERE company_id = ?", [companyId]);
        const bCode = `BLD-${String(Number(bCount || 0) + 1).padStart(3, "0")}`;
        const [insB] = await conn.execute(
          `INSERT INTO buildings (company_id, building_code, building_name, status, created_by) VALUES (?, ?, ?, 'Active', ?)`,
          [companyId, bCode, buildingName, req.user.id]
        );
        buildingId = insB.insertId;
        createdBuildings += 1;
      }

      const [[bLoc]] = await conn.execute(
        `SELECT id FROM locations WHERE location_type = 'Building' AND reference_id = ? LIMIT 1`,
        [buildingId]
      );
      buildingLocId = bLoc?.id || await insertLocation(conn, {
        companyId,
        locationType: "Building",
        referenceId: buildingId,
        parentLocationId: null,
        locationCode: null,
        locationName: buildingName,
        createdBy: req.user.id,
      });

      // Parse floor count: if floor_number > 1, create that many floors; else create 1
      const floorCount = (floorNumberRaw !== "" && Number(floorNumberRaw) > 1) ? Number(floorNumberRaw) : 1;
      const shouldMultiplyFloors = floorCount > 1 && floorNameTemplate;

      // Loop to create N floors (usually 1, unless floor_number > 1)
      for (let fIdx = 0; fIdx < floorCount; fIdx++) {
        const floorName = shouldMultiplyFloors ? `${floorNameTemplate} ${fIdx + 1}` : floorNameTemplate;
        const floorNum = fIdx;

        let floorId = null;
        let floorLocId = null;
        if (floorName) {
          const [[fExisting]] = await conn.execute(
            `SELECT id FROM floors WHERE building_id = ? AND LOWER(floor_name) = LOWER(?) AND status != 'Deleted' LIMIT 1`,
            [buildingId, floorName]
          );
          if (fExisting?.id) {
            floorId = fExisting.id;
          } else {
            const [[{ cnt: fCount }]] = await conn.query("SELECT COUNT(*) AS cnt FROM floors WHERE building_id = ?", [buildingId]);
            const fCode = `FLR-${String(Number(fCount || 0) + 1).padStart(3, "0")}`;
            const [insF] = await conn.execute(
              `INSERT INTO floors (building_id, floor_code, floor_name, floor_number, status, created_by)
               VALUES (?, ?, ?, ?, 'Active', ?)`,
              [buildingId, fCode, floorName, floorNum, req.user.id]
            );
            floorId = insF.insertId;
            createdFloors += 1;
          }

          const [[fLoc]] = await conn.execute(
            `SELECT id FROM locations WHERE location_type = 'Floor' AND reference_id = ? LIMIT 1`,
            [floorId]
          );
          floorLocId = fLoc?.id || await insertLocation(conn, {
            companyId,
            locationType: "Floor",
            referenceId: floorId,
            parentLocationId: buildingLocId,
            locationCode: null,
            locationName: floorName,
            createdBy: req.user.id,
          });
        }

        if (roomName) {
          if (!floorId) { skipped += 1; continue; }
          const [[rExisting]] = await conn.execute(
            `SELECT id FROM rooms WHERE floor_id = ? AND LOWER(room_name) = LOWER(?) AND status != 'Deleted' LIMIT 1`,
            [floorId, roomName]
          );
          let roomId;
          if (rExisting?.id) {
            roomId = rExisting.id;
          } else {
            const [[{ cnt: rCount }]] = await conn.query("SELECT COUNT(*) AS cnt FROM rooms WHERE floor_id = ?", [floorId]);
            const rCode = `RM-${String(Number(rCount || 0) + 1).padStart(3, "0")}`;
            const cap = capacityRaw !== "" ? Number(capacityRaw) : null;
            const [insR] = await conn.execute(
              `INSERT INTO rooms (floor_id, room_code, room_name, room_type, capacity, status, created_by)
               VALUES (?, ?, ?, ?, ?, 'Active', ?)`,
              [floorId, rCode, roomName, roomType || null, Number.isFinite(cap) ? cap : null, req.user.id]
            );
            roomId = insR.insertId;
            createdRooms += 1;
          }

          const [[rLoc]] = await conn.execute(
            `SELECT id FROM locations WHERE location_type = 'Room' AND reference_id = ? LIMIT 1`,
            [roomId]
          );
          if (!rLoc?.id) {
            await insertLocation(conn, {
              companyId,
              locationType: "Room",
              referenceId: roomId,
              parentLocationId: floorLocId,
              locationCode: null,
              locationName: roomName,
              createdBy: req.user.id,
            });
          }
        }
      }
    }

    await conn.commit();
    res.json({
      success: true,
      createdBuildings,
      createdFloors,
      createdRooms,
      skipped,
      processedRows: rows.length,
    });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// BUILDINGS
router.get("/buildings", async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [rows] = await pool.query(
      `SELECT b.id, b.company_id AS companyId, b.building_code AS buildingCode, b.building_name AS buildingName, b.description, b.status, b.created_at AS createdAt, l.id AS locationId FROM buildings b LEFT JOIN locations l ON l.location_type = 'Building' AND l.reference_id = b.id WHERE b.company_id = ? AND b.status != 'Deleted' ORDER BY b.building_name`,
      [companyId],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/buildings", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { companyId, buildingName, description } = req.body;
    if (!companyId || !buildingName?.trim()) return res.status(400).json({ message: "companyId and buildingName are required" });
    const [[dup]] = await conn.execute(`SELECT id FROM buildings WHERE company_id = ? AND LOWER(building_name) = LOWER(?) AND status != 'Deleted'`, [companyId, buildingName.trim()]);
    if (dup) return res.status(409).json({ message: "Building already exists in this company." });
    const [[{ cnt: bCount }]] = await conn.query("SELECT COUNT(*) as cnt FROM buildings WHERE company_id = ?", [companyId]);
    const autoCode = `BLD-${String(bCount + 1).padStart(3, '0')}`;
    const [ins] = await conn.execute(`INSERT INTO buildings (company_id, building_code, building_name, description, status, created_by) VALUES (?, ?, ?, ?, 'Active', ?)`, [companyId, autoCode, buildingName.trim(), description ?? null, req.user.id]);
    const buildingId = ins.insertId;
    const locationId = await insertLocation(conn, { companyId, locationType: "Building", referenceId: buildingId, parentLocationId: null, locationCode: autoCode, locationName: buildingName.trim(), createdBy: req.user.id });
    await conn.commit();
    res.status(201).json({ id: buildingId, locationId, buildingName: buildingName.trim() });
  } catch (err) { await conn.rollback(); if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Building already exists." }); next(err); } finally { conn.release(); }
});

router.put("/buildings/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { buildingCode, buildingName, description, status } = req.body;
    await conn.execute(`UPDATE buildings SET building_code = COALESCE(?, building_code), building_name = COALESCE(?, building_name), description = COALESCE(?, description), status = COALESCE(?, status) WHERE id = ?`, [buildingCode ?? null, buildingName ?? null, description ?? null, status ?? null, id]);
    if (buildingName) await conn.execute(`UPDATE locations SET location_name = ?, location_code = ? WHERE location_type = 'Building' AND reference_id = ?`, [buildingName, buildingCode ?? null, id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) { await conn.rollback(); if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Building name already exists." }); next(err); } finally { conn.release(); }
});

router.delete("/buildings/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    await conn.execute(`UPDATE buildings SET status = 'Deleted' WHERE id = ?`, [id]);
    await conn.execute(`UPDATE locations SET status = 'Deleted' WHERE location_type = 'Building' AND reference_id = ?`, [id]);
    await conn.commit(); res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); } finally { conn.release(); }
});

// FLOORS
router.get("/floors", async (req, res, next) => {
  try {
    const { buildingId, companyId } = req.query;
    if (!buildingId && !companyId) return res.status(400).json({ message: "buildingId or companyId required" });
    let q;
    let p;
    if (buildingId) {
      q = `SELECT f.id, f.building_id AS buildingId, f.floor_code AS floorCode, f.floor_name AS floorName, f.floor_number AS floorNumber, f.status, f.created_at AS createdAt, l.id AS locationId, b.building_name AS buildingName
           FROM floors f
           LEFT JOIN buildings b ON b.id = f.building_id
           LEFT JOIN locations l ON l.location_type = 'Floor' AND l.reference_id = f.id
           WHERE f.building_id = ? AND f.status != 'Deleted'
           ORDER BY f.floor_number, f.floor_name`;
      p = [buildingId];
    } else {
      q = `SELECT f.id, f.building_id AS buildingId, f.floor_code AS floorCode, f.floor_name AS floorName, f.floor_number AS floorNumber, f.status, f.created_at AS createdAt, l.id AS locationId, b.building_name AS buildingName
           FROM floors f
           JOIN buildings b ON b.id = f.building_id
           LEFT JOIN locations l ON l.location_type = 'Floor' AND l.reference_id = f.id
           WHERE b.company_id = ? AND f.status != 'Deleted' AND b.status != 'Deleted'
           ORDER BY b.building_name, f.floor_number, f.floor_name`;
      p = [companyId];
    }
    const [rows] = await pool.query(q, p);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/floors", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { buildingId, floorName, floorNumber } = req.body;
    if (!buildingId || !floorName?.trim()) return res.status(400).json({ message: "buildingId and floorName are required" });
    const [[dup]] = await conn.execute(`SELECT id FROM floors WHERE building_id = ? AND LOWER(floor_name) = LOWER(?) AND status != 'Deleted'`, [buildingId, floorName.trim()]);
    if (dup) return res.status(409).json({ message: "Floor already exists in this building." });
    const [[building]] = await conn.execute(`SELECT b.company_id, l.id AS locationId FROM buildings b LEFT JOIN locations l ON l.location_type = 'Building' AND l.reference_id = b.id WHERE b.id = ?`, [buildingId]);
    if (!building) return res.status(404).json({ message: "Building not found" });
    const [[{ cnt: fCount }]] = await conn.query("SELECT COUNT(*) as cnt FROM floors WHERE building_id = ?", [buildingId]);
    const autoCode = `FLR-${String(fCount + 1).padStart(3, '0')}`;
    const [ins] = await conn.execute(`INSERT INTO floors (building_id, floor_code, floor_name, floor_number, status, created_by) VALUES (?, ?, ?, ?, 'Active', ?)`, [buildingId, autoCode, floorName.trim(), floorNumber !== undefined && floorNumber !== '' ? Number(floorNumber) : null, req.user.id]);
    const floorId = ins.insertId;
    const locationId = await insertLocation(conn, { companyId: building.company_id, locationType: "Floor", referenceId: floorId, parentLocationId: building.locationId, locationCode: autoCode, locationName: floorName.trim(), createdBy: req.user.id });
    await conn.commit();
    res.status(201).json({ id: floorId, locationId, floorName: floorName.trim() });
  } catch (err) { await conn.rollback(); if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Floor already exists." }); next(err); } finally { conn.release(); }
});

router.put("/floors/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { floorCode, floorName, floorNumber, status } = req.body;
    await conn.execute(`UPDATE floors SET floor_code = COALESCE(?, floor_code), floor_name = COALESCE(?, floor_name), floor_number = COALESCE(?, floor_number), status = COALESCE(?, status) WHERE id = ?`, [floorCode ?? null, floorName ?? null, floorNumber ?? null, status ?? null, id]);
    if (floorName) await conn.execute(`UPDATE locations SET location_name = ?, location_code = ? WHERE location_type = 'Floor' AND reference_id = ?`, [floorName, floorCode ?? null, id]);
    await conn.commit(); res.json({ success: true });
  } catch (err) { await conn.rollback(); if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Floor name already exists." }); next(err); } finally { conn.release(); }
});

router.delete("/floors/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    await conn.execute(`UPDATE floors SET status = 'Deleted' WHERE id = ?`, [id]);
    await conn.execute(`UPDATE locations SET status = 'Deleted' WHERE location_type = 'Floor' AND reference_id = ?`, [id]);
    await conn.commit(); res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); } finally { conn.release(); }
});

// ROOMS (now directly under Floors: Building -> Floor -> Room)
router.get("/rooms", async (req, res, next) => {
  try {
    const { floorId, buildingId, companyId } = req.query;
    if (!floorId && !buildingId && !companyId) return res.status(400).json({ message: "floorId, buildingId, or companyId required" });
    let q, p;
    if (floorId) {
      q = `SELECT r.id, r.floor_id AS floorId, r.room_code AS roomCode, r.room_name AS roomName, r.room_type AS roomType, r.capacity, r.status, r.created_at AS createdAt, l.id AS locationId, f.floor_name AS floorName, b.building_name AS buildingName FROM rooms r LEFT JOIN floors f ON f.id = r.floor_id LEFT JOIN buildings b ON b.id = f.building_id LEFT JOIN locations l ON l.location_type = 'Room' AND l.reference_id = r.id WHERE r.floor_id = ? AND r.status != 'Deleted' ORDER BY r.room_name`;
      p = [floorId];
    } else if (buildingId) {
      q = `SELECT r.id, r.floor_id AS floorId, r.room_code AS roomCode, r.room_name AS roomName, r.room_type AS roomType, r.capacity, r.status, r.created_at AS createdAt, l.id AS locationId, f.floor_name AS floorName, b.building_name AS buildingName FROM rooms r LEFT JOIN floors f ON f.id = r.floor_id LEFT JOIN buildings b ON b.id = f.building_id LEFT JOIN locations l ON l.location_type = 'Room' AND l.reference_id = r.id WHERE f.building_id = ? AND r.status != 'Deleted' ORDER BY f.floor_name, r.room_name`;
      p = [buildingId];
    } else {
      q = `SELECT r.id, r.floor_id AS floorId, r.room_code AS roomCode, r.room_name AS roomName, r.room_type AS roomType, r.capacity, r.status, r.created_at AS createdAt, l.id AS locationId, f.floor_name AS floorName, b.building_name AS buildingName
           FROM rooms r
           JOIN floors f ON f.id = r.floor_id
           JOIN buildings b ON b.id = f.building_id
           LEFT JOIN locations l ON l.location_type = 'Room' AND l.reference_id = r.id
           WHERE b.company_id = ? AND r.status != 'Deleted' AND f.status != 'Deleted' AND b.status != 'Deleted'
           ORDER BY b.building_name, f.floor_name, r.room_name`;
      p = [companyId];
    }
    const [rows] = await pool.query(q, p);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/rooms", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { floorId, roomName, roomType, capacity } = req.body;
    if (!floorId || !roomName?.trim()) return res.status(400).json({ message: "floorId and roomName are required" });
    const [[dup]] = await conn.execute(`SELECT id FROM rooms WHERE floor_id = ? AND LOWER(room_name) = LOWER(?) AND status != 'Deleted'`, [floorId, roomName.trim()]);
    if (dup) return res.status(409).json({ message: "Room already exists on this floor." });
    const [[floor]] = await conn.execute(`SELECT b.company_id, l.id AS locationId FROM floors f JOIN buildings b ON b.id = f.building_id LEFT JOIN locations l ON l.location_type = 'Floor' AND l.reference_id = f.id WHERE f.id = ?`, [floorId]);
    if (!floor) return res.status(404).json({ message: "Floor not found" });
    const [[{ cnt: rCount }]] = await conn.query("SELECT COUNT(*) as cnt FROM rooms WHERE floor_id = ?", [floorId]);
    const autoCode = `RM-${String(rCount + 1).padStart(3, '0')}`;
    const [ins] = await conn.execute(`INSERT INTO rooms (floor_id, room_code, room_name, room_type, capacity, status, created_by) VALUES (?, ?, ?, ?, ?, 'Active', ?)`, [floorId, autoCode, roomName.trim(), roomType || null, capacity !== undefined && capacity !== '' ? Number(capacity) : null, req.user.id]);
    const roomId = ins.insertId;
    const locationId = await insertLocation(conn, { companyId: floor.company_id, locationType: "Room", referenceId: roomId, parentLocationId: floor.locationId, locationCode: autoCode, locationName: roomName.trim(), createdBy: req.user.id });
    await conn.commit();
    res.status(201).json({ id: roomId, locationId, roomName: roomName.trim() });
  } catch (err) { await conn.rollback(); if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Room already exists." }); next(err); } finally { conn.release(); }
});

router.put("/rooms/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { roomCode, roomName, roomType, capacity, status } = req.body;
    await conn.execute(`UPDATE rooms SET room_code = COALESCE(?, room_code), room_name = COALESCE(?, room_name), room_type = COALESCE(?, room_type), capacity = COALESCE(?, capacity), status = COALESCE(?, status) WHERE id = ?`, [roomCode ?? null, roomName ?? null, roomType ?? null, capacity ?? null, status ?? null, id]);
    if (roomName) await conn.execute(`UPDATE locations SET location_name = ?, location_code = ? WHERE location_type = 'Room' AND reference_id = ?`, [roomName, roomCode ?? null, id]);
    await conn.commit(); res.json({ success: true });
  } catch (err) { await conn.rollback(); if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Room name already exists." }); next(err); } finally { conn.release(); }
});

router.delete("/rooms/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    await conn.execute(`UPDATE rooms SET status = 'Deleted' WHERE id = ?`, [id]);
    await conn.execute(`UPDATE locations SET status = 'Deleted' WHERE location_type = 'Room' AND reference_id = ?`, [id]);
    await conn.commit(); res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); } finally { conn.release(); }
});

// DEPARTMENTS (flexible: linked to Building, Floor, or Room)
router.get("/departments", async (req, res, next) => {
  try {
    const { companyId, buildingId, floorId, roomId } = req.query;
    if (!companyId && !buildingId && !floorId && !roomId) return res.status(400).json({ message: "companyId, buildingId, floorId, or roomId required" });
    let where = "WHERE d.status != 'Deleted'";
    const params = [];
    if (roomId)          { where += " AND d.room_id = ?";     params.push(roomId); }
    else if (floorId)    { where += " AND d.floor_id = ?";    params.push(floorId); }
    else if (buildingId) { where += " AND d.building_id = ?"; params.push(buildingId); }
    else                 { where += " AND d.company_id = ?";  params.push(companyId); }
    const [rows] = await pool.query(
      `SELECT d.id, d.company_id AS companyId, d.building_id AS buildingId, d.floor_id AS floorId, d.room_id AS roomId, d.department_code AS departmentCode, d.department_name AS departmentName, d.description, d.status, d.created_at AS createdAt, b.building_name AS buildingName, f.floor_name AS floorName, r.room_name AS roomName FROM location_departments d LEFT JOIN buildings b ON b.id = d.building_id LEFT JOIN floors f ON f.id = d.floor_id LEFT JOIN rooms r ON r.id = d.room_id ${where} ORDER BY d.department_name`,
      params,
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/departments", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { companyId, buildingId, floorId, roomId, departmentCode, departmentName, description } = req.body;
    if (!companyId || !departmentName?.trim()) return res.status(400).json({ message: "companyId and departmentName are required" });
    const [[dup]] = await conn.execute(`SELECT id FROM location_departments WHERE company_id = ? AND LOWER(department_name) = LOWER(?) AND status != 'Deleted'`, [companyId, departmentName.trim()]);
    if (dup) return res.status(409).json({ message: "Department already exists in this company." });
    const [ins] = await conn.execute(
      `INSERT INTO location_departments (company_id, building_id, floor_id, room_id, department_code, department_name, description, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
      [companyId, buildingId || null, floorId || null, roomId || null, departmentCode ?? null, departmentName.trim(), description ?? null, req.user.id],
    );
    const deptId = ins.insertId;
    let parentLocationId = null;
    if (roomId) { const [[r]] = await conn.execute(`SELECT l.id FROM locations l WHERE l.location_type = 'Room' AND l.reference_id = ?`, [roomId]); parentLocationId = r?.id ?? null; }
    else if (floorId) { const [[f]] = await conn.execute(`SELECT l.id FROM locations l WHERE l.location_type = 'Floor' AND l.reference_id = ?`, [floorId]); parentLocationId = f?.id ?? null; }
    else if (buildingId) { const [[b]] = await conn.execute(`SELECT l.id FROM locations l WHERE l.location_type = 'Building' AND l.reference_id = ?`, [buildingId]); parentLocationId = b?.id ?? null; }
    await insertLocation(conn, { companyId, locationType: "Department", referenceId: deptId, parentLocationId, locationCode: departmentCode, locationName: departmentName.trim(), createdBy: req.user.id });
    await conn.commit();
    res.status(201).json({ id: deptId, departmentName: departmentName.trim() });
  } catch (err) { await conn.rollback(); if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Department already exists." }); next(err); } finally { conn.release(); }
});

router.put("/departments/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { departmentCode, departmentName, description, buildingId, floorId, roomId, status } = req.body;
    await conn.execute(
      `UPDATE location_departments SET department_code = COALESCE(?, department_code), department_name = COALESCE(?, department_name), description = COALESCE(?, description), building_id = CASE WHEN ? IS NOT NULL THEN ? ELSE building_id END, floor_id = CASE WHEN ? IS NOT NULL THEN ? ELSE floor_id END, room_id = CASE WHEN ? IS NOT NULL THEN ? ELSE room_id END, status = COALESCE(?, status) WHERE id = ?`,
      [departmentCode ?? null, departmentName ?? null, description ?? null, buildingId ?? null, buildingId ?? null, floorId ?? null, floorId ?? null, roomId ?? null, roomId ?? null, status ?? null, id],
    );
    if (departmentName) await conn.execute(`UPDATE locations SET location_name = ?, location_code = ? WHERE location_type = 'Department' AND reference_id = ?`, [departmentName, departmentCode ?? null, id]);
    await conn.commit(); res.json({ success: true });
  } catch (err) { await conn.rollback(); if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Department name already exists." }); next(err); } finally { conn.release(); }
});

router.delete("/departments/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    await conn.execute(`UPDATE location_departments SET status = 'Deleted' WHERE id = ?`, [id]);
    await conn.execute(`UPDATE locations SET status = 'Deleted' WHERE location_type = 'Department' AND reference_id = ?`, [id]);
    await conn.commit(); res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); } finally { conn.release(); }
});

// HIERARCHY TREE (Building -> Floor -> Room)
router.get("/hierarchy", async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [buildings] = await pool.query(`SELECT id, building_code AS code, building_name AS name, status FROM buildings WHERE company_id = ? AND status != 'Deleted' ORDER BY building_name`, [companyId]);
    const [floors] = await pool.query(`SELECT f.id, f.building_id AS buildingId, f.floor_code AS code, f.floor_name AS name, f.floor_number AS floorNumber, f.status FROM floors f JOIN buildings b ON b.id = f.building_id WHERE b.company_id = ? AND f.status != 'Deleted' ORDER BY f.floor_number, f.floor_name`, [companyId]);
    const [rooms] = await pool.query(`SELECT r.id, r.floor_id AS floorId, r.room_code AS code, r.room_name AS name, r.room_type AS roomType, r.capacity, r.status FROM rooms r JOIN floors f ON f.id = r.floor_id JOIN buildings b ON b.id = f.building_id WHERE b.company_id = ? AND r.status != 'Deleted' ORDER BY r.room_name`, [companyId]);
    const tree = buildings.map((b) => ({
      ...b, type: "Building",
      floors: floors.filter((f) => f.buildingId === b.id).map((f) => ({
        ...f, type: "Floor",
        rooms: rooms.filter((r) => r.floorId === f.id).map((r) => ({ ...r, type: "Room" })),
      })),
    }));
    res.json(tree);
  } catch (err) { next(err); }
});

router.get("/tree", (req, res, next) => {
  req.url = "/hierarchy" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  router.handle(req, res, next);
});

export default router;
