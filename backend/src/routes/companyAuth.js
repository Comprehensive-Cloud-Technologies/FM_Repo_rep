import { Router } from "express";
import { body } from "express-validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { validate } from "../validators.js";

const router = Router();

function toObject(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return typeof value === "object" && !Array.isArray(value) ? value : {};
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mergeCrudPermissions(basePerms, userPerms) {
  const merged = { ...basePerms };
  Object.entries(userPerms || {}).forEach(([moduleKey, ops]) => {
    if (!ops || typeof ops !== "object") return;
    merged[moduleKey] = { ...(merged[moduleKey] || {}), ...ops };
  });
  return merged;
}

function readableModules(permissions) {
  return Object.entries(permissions || {})
    .filter(([, ops]) => ops && (ops.r === true || ops.read === true || ops.view === true))
    .map(([moduleKey]) => moduleKey);
}

// Note: company_users column migrations are handled by companyUsers.js to avoid concurrent ALTER TABLE deadlocks.

/**
 * POST /api/company-auth/login
 * Body: { email, password }
 * Returns: { token, user: { id, fullName, email, companyId, companyName, role } }
 */
router.post(
  "/login",
  validate([
    body("email").isEmail().withMessage("Valid email is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ]),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const [rows] = await pool.query(
        `SELECT cu.id,
                cu.full_name    AS "fullName",
                cu.email,
                cu.status,
                cu.role,
                cu.company_id   AS "companyId",
                cu.password_hash AS "passwordHash",
                cu.permissions,
                cu.module_access AS "moduleAccess",
                c.company_name  AS "companyName"
         FROM company_users cu
         JOIN companies c ON c.id = cu.company_id
         WHERE cu.email = ?
         LIMIT 1`,
        [email]
      );

      if (!rows.length) return res.status(401).json({ message: "Invalid credentials" });
      const user = rows[0];

      if (user.status?.toLowerCase() !== "active") return res.status(403).json({ message: "Account is inactive" });
      if (!user.passwordHash) return res.status(401).json({ message: "No password set for this account — contact your admin" });

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) return res.status(401).json({ message: "Invalid credentials" });

      const [[rolePermRow]] = await pool.query(
        `SELECT permissions
         FROM role_permissions
         WHERE company_id = ? AND role = ?
         LIMIT 1`,
        [user.companyId, user.role]
      );

      const mergedPermissions = mergeCrudPermissions(
        toObject(rolePermRow?.permissions),
        toObject(user.permissions)
      );

      const userModuleAccess = toArray(user.moduleAccess);
      const derivedRoleModules = readableModules(mergedPermissions);
      const effectiveModuleAccess = userModuleAccess.length ? userModuleAccess : derivedRoleModules;

      const token = jwt.sign(
        { sub: user.id, email: user.email, companyId: user.companyId, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "10h" }
      );

      return res.json({
        token,
        user: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          companyId: user.companyId,
          companyName: user.companyName,
          role: user.role,
          permissions: mergedPermissions,
          moduleAccess: effectiveModuleAccess,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
);

// ── GET /api/company-auth/my-companies ──────────────────────────────────────
// Returns all companies the currently-logged-in company user can access.
// Primary company (company_id on user row) + additional from user_company_access.
router.get("/my-companies", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ message: "No token" });

    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ message: "Invalid token" }); }

    const userId = decoded.sub;

    // Get primary company
    const [[cu]] = await pool.query(
      `SELECT cu.company_id AS companyId, c.company_name AS companyName
       FROM company_users cu JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [userId]
    );
    if (!cu) return res.status(404).json({ message: "User not found" });

    const companies = [{ companyId: cu.companyId, companyName: cu.companyName, primary: true }];

    // Get additional companies from user_company_access (table created in companyUsers.js)
    const [extra] = await pool.query(
      `SELECT uca.company_id AS companyId, c.company_name AS companyName
       FROM user_company_access uca JOIN companies c ON c.id = uca.company_id
       WHERE uca.user_id = ?`,
      [userId]
    ).catch(() => [[]]);

    for (const e of extra) {
      if (e.companyId !== cu.companyId) {
        companies.push({ companyId: e.companyId, companyName: e.companyName, primary: false });
      }
    }

    res.json({ companies });
  } catch (err) { next(err); }
});

// ── POST /api/company-auth/switch-company ────────────────────────────────────
// Issues a new JWT for a different company the user has access to.
router.post("/switch-company", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ message: "No token" });

    let decoded;
    try { decoded = jwt.verify(token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ message: "Invalid token" }); }

    const userId = decoded.sub;
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ message: "companyId is required" });

    // Verify user has access to the requested company
    const [[primary]] = await pool.query(
      `SELECT cu.company_id AS companyId FROM company_users cu WHERE cu.id = ? AND cu.company_id = ?`,
      [userId, companyId]
    );
    let hasAccess = !!primary;

    if (!hasAccess) {
      const [[extra]] = await pool.query(
        `SELECT uca.company_id FROM user_company_access uca WHERE uca.user_id = ? AND uca.company_id = ?`,
        [userId, companyId]
      ).catch(() => [[null]]);
      hasAccess = !!extra;
    }

    if (!hasAccess) return res.status(403).json({ message: "No access to this company" });

    // Load full user + company data for new JWT
    const [[cu]] = await pool.query(
      `SELECT cu.id, cu.full_name AS fullName, cu.email, cu.role, cu.status,
              cu.permissions, cu.module_access AS moduleAccess,
              c.company_name AS companyName
       FROM company_users cu JOIN companies c ON c.id = ?
       WHERE cu.id = ?`,
      [companyId, userId]
    );
    if (!cu) return res.status(404).json({ message: "User not found" });
    if (cu.status?.toLowerCase() !== "active") return res.status(403).json({ message: "Account inactive" });

    const [[rolePermRow]] = await pool.query(
      `SELECT permissions FROM role_permissions WHERE company_id = ? AND role = ? LIMIT 1`,
      [companyId, cu.role]
    ).catch(() => [[null]]);

    const mergedPermissions = mergeCrudPermissions(toObject(rolePermRow?.permissions), toObject(cu.permissions));
    const userModuleAccess = toArray(cu.moduleAccess);
    const derivedRoleModules = readableModules(mergedPermissions);
    const effectiveModuleAccess = userModuleAccess.length ? userModuleAccess : derivedRoleModules;

    const newToken = jwt.sign(
      { sub: userId, email: cu.email, companyId: Number(companyId), role: cu.role },
      process.env.JWT_SECRET,
      { expiresIn: "10h" }
    );

    return res.json({
      token: newToken,
      user: {
        id: userId,
        fullName: cu.fullName,
        email: cu.email,
        companyId: Number(companyId),
        companyName: cu.companyName,
        role: cu.role,
        permissions: mergedPermissions,
        moduleAccess: effectiveModuleAccess,
      },
    });
  } catch (err) { next(err); }
});

export default router;
