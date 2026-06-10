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

export default router;
