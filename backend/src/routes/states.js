import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// ── GET /api/states  (public — used in company forms) ────────────────────────
router.get("/", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, state_name, state_code, status FROM states WHERE status = 'Active' ORDER BY state_name"
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.use(requireAuth);

// ── POST /api/states ──────────────────────────────────────────────────────────
router.post("/", async (req, res, next) => {
  try {
    const { stateName, stateCode } = req.body;
    if (!stateName?.trim()) return res.status(400).json({ message: "State name is required" });
    if (!stateCode?.trim())  return res.status(400).json({ message: "State code is required" });
    const code = stateCode.trim().toUpperCase();
    const [result] = await pool.execute(
      "INSERT INTO states (state_name, state_code) VALUES (?, ?)",
      [stateName.trim(), code]
    );
    res.status(201).json({ id: result.insertId, stateName: stateName.trim(), stateCode: code, status: "Active" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "State name or code already exists" });
    next(err);
  }
});

// ── PUT /api/states/:id ───────────────────────────────────────────────────────
router.put("/:id", async (req, res, next) => {
  try {
    const { stateName, stateCode, status } = req.body;
    const sets = [];
    const vals = [];
    if (stateName !== undefined) { sets.push("state_name = ?"); vals.push(stateName.trim()); }
    if (stateCode !== undefined) { sets.push("state_code = ?"); vals.push(stateCode.trim().toUpperCase()); }
    if (status    !== undefined) { sets.push("status = ?");     vals.push(status); }
    if (!sets.length) return res.status(400).json({ message: "Nothing to update" });
    vals.push(req.params.id);
    await pool.execute(`UPDATE states SET ${sets.join(", ")} WHERE id = ?`, vals);
    res.json({ message: "State updated" });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "State name or code already exists" });
    next(err);
  }
});

// ── DELETE /api/states/:id ────────────────────────────────────────────────────
router.delete("/:id", async (req, res, next) => {
  try {
    // Check if any company is linked
    const [[usage]] = await pool.query("SELECT COUNT(*) as cnt FROM companies WHERE state_id = ?", [req.params.id]);
    if (usage.cnt > 0) return res.status(409).json({ message: "Cannot delete: state is linked to companies" });
    await pool.execute("DELETE FROM states WHERE id = ?", [req.params.id]);
    res.json({ message: "State deleted" });
  } catch (err) { next(err); }
});

export default router;
