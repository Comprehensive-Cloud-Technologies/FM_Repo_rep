/**
 * /api/locations  –  Location Management API
 *
 * Endpoints:
 *   Buildings
 *     GET    /api/locations/buildings?companyId=
 *     POST   /api/locations/buildings
 *     PUT    /api/locations/buildings/:id
 *     DELETE /api/locations/buildings/:id
 *
 *   Floors
 *     GET    /api/locations/floors?buildingId=
 *     POST   /api/locations/floors
 *     PUT    /api/locations/floors/:id
 *     DELETE /api/locations/floors/:id
 *
 *   Departments (location_departments)
 *     GET    /api/locations/departments?floorId=
 *     POST   /api/locations/departments
 *     PUT    /api/locations/departments/:id
 *     DELETE /api/locations/departments/:id
 *
 *   Rooms
 *     GET    /api/locations/rooms?departmentId=
 *     POST   /api/locations/rooms
 *     PUT    /api/locations/rooms/:id
 *     DELETE /api/locations/rooms/:id
 *
 *   Hierarchy
 *     GET    /api/locations/hierarchy?companyId=   (full tree)
 *     GET    /api/locations/tree?companyId=         (alias)
 *
 *   Asset Cascading Dropdowns
 *     GET    /api/locations/buildings?companyId=X   (reuse building endpoint)
 *     GET    /api/locations/floors?buildingId=X
 *     GET    /api/locations/departments?floorId=X
 *     GET    /api/locations/rooms?departmentId=X
 */

import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// ─────────────────────────────────────────────────────────────
// Helper: insert into locations master table
// ─────────────────────────────────────────────────────────────
async function insertLocation(conn, {
  companyId, locationType, referenceId, parentLocationId,
  locationCode, locationName, createdBy,
}) {
  const [r] = await conn.execute(
    `INSERT INTO locations
       (company_id, location_type, reference_id, parent_location_id,
        location_code, location_name, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'Active', ?)`,
    [companyId, locationType, referenceId, parentLocationId ?? null,
     locationCode ?? null, locationName, createdBy ?? null],
  );
  return r.insertId;
}

// ─────────────────────────────────────────────────────────────
// BUILDINGS
// ─────────────────────────────────────────────────────────────

// GET /api/locations/buildings?companyId=
router.get("/buildings", async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [rows] = await pool.query(
      `SELECT b.id, b.company_id AS companyId, b.building_code AS buildingCode,
              b.building_name AS buildingName, b.description, b.status,
              b.created_at AS createdAt,
              l.id AS locationId
         FROM buildings b
         LEFT JOIN locations l ON l.location_type = 'Building' AND l.reference_id = b.id
        WHERE b.company_id = ? AND b.status != 'Deleted'
        ORDER BY b.building_name`,
      [companyId],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/locations/buildings
router.post("/buildings", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { companyId, buildingCode, buildingName, description } = req.body;
    if (!companyId || !buildingName?.trim())
      return res.status(400).json({ message: "companyId and buildingName are required" });

    // Duplicate check
    const [[dup]] = await conn.execute(
      `SELECT id FROM buildings WHERE company_id = ? AND LOWER(building_name) = LOWER(?) AND status != 'Deleted'`,
      [companyId, buildingName.trim()],
    );
    if (dup) return res.status(409).json({ message: "Building already exists in this company." });

    const [ins] = await conn.execute(
      `INSERT INTO buildings (company_id, building_code, building_name, description, status, created_by)
       VALUES (?, ?, ?, ?, 'Active', ?)`,
      [companyId, buildingCode ?? null, buildingName.trim(), description ?? null, req.user.id],
    );
    const buildingId = ins.insertId;

    const locationId = await insertLocation(conn, {
      companyId, locationType: "Building", referenceId: buildingId,
      parentLocationId: null, locationCode: buildingCode,
      locationName: buildingName.trim(), createdBy: req.user.id,
    });

    await conn.commit();
    res.status(201).json({ id: buildingId, locationId, buildingName: buildingName.trim() });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Building already exists in this company." });
    next(err);
  } finally { conn.release(); }
});

// PUT /api/locations/buildings/:id
router.put("/buildings/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { buildingCode, buildingName, description, status } = req.body;

    await conn.execute(
      `UPDATE buildings SET building_code = COALESCE(?, building_code),
         building_name = COALESCE(?, building_name),
         description   = COALESCE(?, description),
         status        = COALESCE(?, status)
       WHERE id = ?`,
      [buildingCode ?? null, buildingName ?? null, description ?? null, status ?? null, id],
    );
    if (buildingName) {
      await conn.execute(
        `UPDATE locations SET location_name = ?, location_code = ?
          WHERE location_type = 'Building' AND reference_id = ?`,
        [buildingName, buildingCode ?? null, id],
      );
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Building name already exists." });
    next(err);
  } finally { conn.release(); }
});

// DELETE /api/locations/buildings/:id  (soft delete)
router.delete("/buildings/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    await conn.execute(`UPDATE buildings SET status = 'Deleted' WHERE id = ?`, [id]);
    await conn.execute(`UPDATE locations SET status = 'Deleted' WHERE location_type = 'Building' AND reference_id = ?`, [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); } finally { conn.release(); }
});

// ─────────────────────────────────────────────────────────────
// FLOORS
// ─────────────────────────────────────────────────────────────

// GET /api/locations/floors?buildingId=
router.get("/floors", async (req, res, next) => {
  try {
    const { buildingId } = req.query;
    if (!buildingId) return res.status(400).json({ message: "buildingId required" });
    const [rows] = await pool.query(
      `SELECT f.id, f.building_id AS buildingId, f.floor_code AS floorCode,
              f.floor_name AS floorName, f.floor_number AS floorNumber,
              f.status, f.created_at AS createdAt,
              l.id AS locationId, l.parent_location_id AS parentLocationId,
              b.building_name AS buildingName
         FROM floors f
         LEFT JOIN buildings b ON b.id = f.building_id
         LEFT JOIN locations l ON l.location_type = 'Floor' AND l.reference_id = f.id
        WHERE f.building_id = ? AND f.status != 'Deleted'
        ORDER BY f.floor_number, f.floor_name`,
      [buildingId],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/locations/floors
router.post("/floors", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { buildingId, floorCode, floorName, floorNumber } = req.body;
    if (!buildingId || !floorName?.trim())
      return res.status(400).json({ message: "buildingId and floorName are required" });

    // Duplicate check
    const [[dup]] = await conn.execute(
      `SELECT id FROM floors WHERE building_id = ? AND LOWER(floor_name) = LOWER(?) AND status != 'Deleted'`,
      [buildingId, floorName.trim()],
    );
    if (dup) return res.status(409).json({ message: "Floor already exists in this building." });

    // Get building's company_id and locationId for parent
    const [[building]] = await conn.execute(
      `SELECT b.company_id, l.id AS locationId
         FROM buildings b
         LEFT JOIN locations l ON l.location_type = 'Building' AND l.reference_id = b.id
        WHERE b.id = ?`,
      [buildingId],
    );
    if (!building) return res.status(404).json({ message: "Building not found" });

    const [ins] = await conn.execute(
      `INSERT INTO floors (building_id, floor_code, floor_name, floor_number, status, created_by)
       VALUES (?, ?, ?, ?, 'Active', ?)`,
      [buildingId, floorCode || null, floorName.trim(), floorNumber !== undefined && floorNumber !== '' ? Number(floorNumber) : null, req.user.id],
    );
    const floorId = ins.insertId;

    const locationId = await insertLocation(conn, {
      companyId: building.company_id,
      locationType: "Floor",
      referenceId: floorId,
      parentLocationId: building.locationId,
      locationCode: floorCode,
      locationName: floorName.trim(),
      createdBy: req.user.id,
    });

    await conn.commit();
    res.status(201).json({ id: floorId, locationId, floorName: floorName.trim() });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Floor already exists in this building." });
    next(err);
  } finally { conn.release(); }
});

// PUT /api/locations/floors/:id
router.put("/floors/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { floorCode, floorName, floorNumber, status } = req.body;
    await conn.execute(
      `UPDATE floors SET floor_code = COALESCE(?, floor_code),
         floor_name   = COALESCE(?, floor_name),
         floor_number = COALESCE(?, floor_number),
         status       = COALESCE(?, status)
       WHERE id = ?`,
      [floorCode ?? null, floorName ?? null, floorNumber ?? null, status ?? null, id],
    );
    if (floorName) {
      await conn.execute(
        `UPDATE locations SET location_name = ?, location_code = ?
          WHERE location_type = 'Floor' AND reference_id = ?`,
        [floorName, floorCode ?? null, id],
      );
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Floor name already exists." });
    next(err);
  } finally { conn.release(); }
});

// DELETE /api/locations/floors/:id
router.delete("/floors/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    await conn.execute(`UPDATE floors SET status = 'Deleted' WHERE id = ?`, [id]);
    await conn.execute(`UPDATE locations SET status = 'Deleted' WHERE location_type = 'Floor' AND reference_id = ?`, [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); } finally { conn.release(); }
});

// ─────────────────────────────────────────────────────────────
// DEPARTMENTS (location_departments)
// ─────────────────────────────────────────────────────────────

// GET /api/locations/departments?floorId=
router.get("/departments", async (req, res, next) => {
  try {
    const { floorId } = req.query;
    if (!floorId) return res.status(400).json({ message: "floorId required" });
    const [rows] = await pool.query(
      `SELECT d.id, d.floor_id AS floorId, d.department_code AS departmentCode,
              d.department_name AS departmentName, d.description, d.status,
              d.created_at AS createdAt,
              l.id AS locationId, l.parent_location_id AS parentLocationId,
              f.floor_name AS floorName
         FROM location_departments d
         LEFT JOIN floors f ON f.id = d.floor_id
         LEFT JOIN locations l ON l.location_type = 'Department' AND l.reference_id = d.id
        WHERE d.floor_id = ? AND d.status != 'Deleted'
        ORDER BY d.department_name`,
      [floorId],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/locations/departments
router.post("/departments", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { floorId, departmentCode, departmentName, description } = req.body;
    if (!floorId || !departmentName?.trim())
      return res.status(400).json({ message: "floorId and departmentName are required" });

    const [[dup]] = await conn.execute(
      `SELECT id FROM location_departments WHERE floor_id = ? AND LOWER(department_name) = LOWER(?) AND status != 'Deleted'`,
      [floorId, departmentName.trim()],
    );
    if (dup) return res.status(409).json({ message: "Department already exists on this floor." });

    // Get floor's company (via building) and floor locationId
    const [[floor]] = await conn.execute(
      `SELECT b.company_id, l.id AS locationId
         FROM floors f
         JOIN buildings b ON b.id = f.building_id
         LEFT JOIN locations l ON l.location_type = 'Floor' AND l.reference_id = f.id
        WHERE f.id = ?`,
      [floorId],
    );
    if (!floor) return res.status(404).json({ message: "Floor not found" });

    const [ins] = await conn.execute(
      `INSERT INTO location_departments (floor_id, department_code, department_name, description, status, created_by)
       VALUES (?, ?, ?, ?, 'Active', ?)`,
      [floorId, departmentCode ?? null, departmentName.trim(), description ?? null, req.user.id],
    );
    const deptId = ins.insertId;

    const locationId = await insertLocation(conn, {
      companyId: floor.company_id,
      locationType: "Department",
      referenceId: deptId,
      parentLocationId: floor.locationId,
      locationCode: departmentCode,
      locationName: departmentName.trim(),
      createdBy: req.user.id,
    });

    await conn.commit();
    res.status(201).json({ id: deptId, locationId, departmentName: departmentName.trim() });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Department already exists on this floor." });
    next(err);
  } finally { conn.release(); }
});

// PUT /api/locations/departments/:id
router.put("/departments/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { departmentCode, departmentName, description, status } = req.body;
    await conn.execute(
      `UPDATE location_departments SET
         department_code = COALESCE(?, department_code),
         department_name = COALESCE(?, department_name),
         description     = COALESCE(?, description),
         status          = COALESCE(?, status)
       WHERE id = ?`,
      [departmentCode ?? null, departmentName ?? null, description ?? null, status ?? null, id],
    );
    if (departmentName) {
      await conn.execute(
        `UPDATE locations SET location_name = ?, location_code = ?
          WHERE location_type = 'Department' AND reference_id = ?`,
        [departmentName, departmentCode ?? null, id],
      );
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Department name already exists." });
    next(err);
  } finally { conn.release(); }
});

// DELETE /api/locations/departments/:id
router.delete("/departments/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    await conn.execute(`UPDATE location_departments SET status = 'Deleted' WHERE id = ?`, [id]);
    await conn.execute(`UPDATE locations SET status = 'Deleted' WHERE location_type = 'Department' AND reference_id = ?`, [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); } finally { conn.release(); }
});

// ─────────────────────────────────────────────────────────────
// ROOMS
// ─────────────────────────────────────────────────────────────

// GET /api/locations/rooms?departmentId=
router.get("/rooms", async (req, res, next) => {
  try {
    const { departmentId } = req.query;
    if (!departmentId) return res.status(400).json({ message: "departmentId required" });
    const [rows] = await pool.query(
      `SELECT r.id, r.department_id AS departmentId, r.room_code AS roomCode,
              r.room_name AS roomName, r.room_type AS roomType, r.capacity,
              r.status, r.created_at AS createdAt,
              l.id AS locationId, l.parent_location_id AS parentLocationId,
              d.department_name AS departmentName
         FROM rooms r
         LEFT JOIN location_departments d ON d.id = r.department_id
         LEFT JOIN locations l ON l.location_type = 'Room' AND l.reference_id = r.id
        WHERE r.department_id = ? AND r.status != 'Deleted'
        ORDER BY r.room_name`,
      [departmentId],
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/locations/rooms
router.post("/rooms", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { departmentId, roomCode, roomName, roomType, capacity } = req.body;
    if (!departmentId || !roomName?.trim())
      return res.status(400).json({ message: "departmentId and roomName are required" });

    // Duplicate check (name or code)
    const [[dup]] = await conn.execute(
      `SELECT id FROM rooms
        WHERE department_id = ?
          AND (LOWER(room_name) = LOWER(?) OR (room_code IS NOT NULL AND room_code != '' AND LOWER(room_code) = LOWER(?)))
          AND status != 'Deleted'`,
      [departmentId, roomName.trim(), roomCode ?? ""],
    );
    if (dup) return res.status(409).json({ message: "Room already exists in this department." });

    // Get company_id and dept locationId
    const [[dept]] = await conn.execute(
      `SELECT b.company_id, l.id AS locationId
         FROM location_departments d
         JOIN floors f ON f.id = d.floor_id
         JOIN buildings b ON b.id = f.building_id
         LEFT JOIN locations l ON l.location_type = 'Department' AND l.reference_id = d.id
        WHERE d.id = ?`,
      [departmentId],
    );
    if (!dept) return res.status(404).json({ message: "Department not found" });

    const [ins] = await conn.execute(
      `INSERT INTO rooms (department_id, room_code, room_name, room_type, capacity, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'Active', ?)`,
      [departmentId, roomCode || null, roomName.trim(), roomType || null, capacity !== undefined && capacity !== '' ? Number(capacity) : null, req.user.id],
    );
    const roomId = ins.insertId;

    const locationId = await insertLocation(conn, {
      companyId: dept.company_id,
      locationType: "Room",
      referenceId: roomId,
      parentLocationId: dept.locationId,
      locationCode: roomCode,
      locationName: roomName.trim(),
      createdBy: req.user.id,
    });

    await conn.commit();
    res.status(201).json({ id: roomId, locationId, roomName: roomName.trim() });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Room already exists in this department." });
    next(err);
  } finally { conn.release(); }
});

// PUT /api/locations/rooms/:id
router.put("/rooms/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { roomCode, roomName, roomType, capacity, status } = req.body;
    await conn.execute(
      `UPDATE rooms SET
         room_code = COALESCE(?, room_code),
         room_name = COALESCE(?, room_name),
         room_type = COALESCE(?, room_type),
         capacity  = COALESCE(?, capacity),
         status    = COALESCE(?, status)
       WHERE id = ?`,
      [roomCode ?? null, roomName ?? null, roomType ?? null, capacity ?? null, status ?? null, id],
    );
    if (roomName) {
      await conn.execute(
        `UPDATE locations SET location_name = ?, location_code = ?
          WHERE location_type = 'Room' AND reference_id = ?`,
        [roomName, roomCode ?? null, id],
      );
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Room name/code already exists." });
    next(err);
  } finally { conn.release(); }
});

// DELETE /api/locations/rooms/:id
router.delete("/rooms/:id", async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    await conn.execute(`UPDATE rooms SET status = 'Deleted' WHERE id = ?`, [id]);
    await conn.execute(`UPDATE locations SET status = 'Deleted' WHERE location_type = 'Room' AND reference_id = ?`, [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) { await conn.rollback(); next(err); } finally { conn.release(); }
});

// ─────────────────────────────────────────────────────────────
// HIERARCHY TREE
// GET /api/locations/hierarchy?companyId=
// ─────────────────────────────────────────────────────────────
router.get("/hierarchy", async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId required" });

    const [buildings] = await pool.query(
      `SELECT id, building_code AS code, building_name AS name, status FROM buildings WHERE company_id = ? AND status != 'Deleted' ORDER BY building_name`,
      [companyId],
    );

    const [floors] = await pool.query(
      `SELECT f.id, f.building_id AS buildingId, f.floor_code AS code, f.floor_name AS name, f.floor_number AS floorNumber, f.status
         FROM floors f
         JOIN buildings b ON b.id = f.building_id
        WHERE b.company_id = ? AND f.status != 'Deleted'
        ORDER BY f.floor_number, f.floor_name`,
      [companyId],
    );

    const [depts] = await pool.query(
      `SELECT d.id, d.floor_id AS floorId, d.department_code AS code, d.department_name AS name, d.status
         FROM location_departments d
         JOIN floors f ON f.id = d.floor_id
         JOIN buildings b ON b.id = f.building_id
        WHERE b.company_id = ? AND d.status != 'Deleted'
        ORDER BY d.department_name`,
      [companyId],
    );

    const [rooms] = await pool.query(
      `SELECT r.id, r.department_id AS departmentId, r.room_code AS code, r.room_name AS name, r.room_type AS roomType, r.capacity, r.status
         FROM rooms r
         JOIN location_departments d ON d.id = r.department_id
         JOIN floors f ON f.id = d.floor_id
         JOIN buildings b ON b.id = f.building_id
        WHERE b.company_id = ? AND r.status != 'Deleted'
        ORDER BY r.room_name`,
      [companyId],
    );

    // Assemble tree
    const tree = buildings.map((b) => ({
      ...b,
      type: "Building",
      floors: floors
        .filter((f) => f.buildingId === b.id)
        .map((f) => ({
          ...f,
          type: "Floor",
          departments: depts
            .filter((d) => d.floorId === f.id)
            .map((d) => ({
              ...d,
              type: "Department",
              rooms: rooms.filter((r) => r.departmentId === d.id).map((r) => ({ ...r, type: "Room" })),
            })),
        })),
    }));

    res.json(tree);
  } catch (err) { next(err); }
});

// Alias
router.get("/tree", (req, res, next) => {
  req.url = "/hierarchy" + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  router.handle(req, res, next);
});

export default router;
