import { Router } from "express";
import { body, param, query } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

(async () => {
  try {
    await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS building_id INT UNSIGNED NULL`);
    await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS floor_id INT UNSIGNED NULL`);
    await pool.query(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS room_id INT UNSIGNED NULL`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[departments] migration error:", err.message);
  }
})();

const createRules = [
  body("companyId").isInt({ min: 1 }).withMessage("companyId is required"),
  body("name").trim().notEmpty().isLength({ max: 160 }).withMessage("Department name is required"),
  body("description").optional({ checkFalsy: true }).isString().isLength({ max: 255 }),
  body("buildingId").optional({ checkFalsy: true }).isInt({ min: 1 }),
  body("floorId").optional({ checkFalsy: true }).isInt({ min: 1 }),
  body("roomId").optional({ checkFalsy: true }).isInt({ min: 1 }),
];

router.get(
  "/",
  validate([query("companyId").optional().isInt({ min: 1 })]),
  async (req, res, next) => {
    try {
      const { companyId } = req.query;
      const params = [req.user.id];
      let where = "WHERE c.user_id = ?";

      if (companyId) {
        where += " AND c.id = ?";
        params.push(companyId);
      }

      const [rows] = await pool.query(
        `SELECT d.id, d.company_id AS "companyId", c.company_name AS "companyName",
                d.name, d.description,
                d.building_id AS "buildingId", d.floor_id AS "floorId", d.room_id AS "roomId",
                b.building_name AS "buildingName", f.floor_name AS "floorName", r.room_name AS "roomName",
                d.created_at AS "createdAt"
         FROM departments d
         JOIN companies c ON d.company_id = c.id
         LEFT JOIN buildings b ON b.id = d.building_id
         LEFT JOIN floors f ON f.id = d.floor_id
         LEFT JOIN rooms r ON r.id = d.room_id
         ${where}
         ORDER BY d.created_at DESC`,
        params
      );

      res.json(rows);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  "/",
  validate(createRules),
  async (req, res, next) => {
    try {
      const { companyId, name, description, buildingId, floorId, roomId } = req.body;

      const [companyRows] = await pool.query(
        "SELECT id FROM companies WHERE id = ? AND user_id = ?",
        [companyId, req.user.id]
      );
      if (companyRows.length === 0) {
        return res.status(404).json({ message: "Company not found for user" });
      }

      const [result] = await pool.execute(
        `INSERT INTO departments (company_id, name, description, building_id, floor_id, room_id) VALUES (?, ?, ?, ?, ?, ?)
         RETURNING id` ,
        [companyId, name, description || null, buildingId || null, floorId || null, roomId || null]
      );

      res.status(201).json({
        id: result.insertId,
        companyId,
        name,
        description: description || "",
        buildingId: buildingId || null,
        floorId: floorId || null,
        roomId: roomId || null,
      });
    } catch (err) {
      if (err?.code === "23505") {
        return res.status(400).json({ message: "Department name already exists for this company" });
      }
      next(err);
    }
  }
);

router.delete(
  "/:id",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const [rows] = await pool.query(
        `SELECT d.company_id
         FROM departments d
         JOIN companies c ON d.company_id = c.id
         WHERE d.id = ? AND c.user_id = ?`,
        [id, req.user.id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ message: "Department not found" });
      }

      await pool.execute("DELETE FROM departments WHERE id = ?", [id]);
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
