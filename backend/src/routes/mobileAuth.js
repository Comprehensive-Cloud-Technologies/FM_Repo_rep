/**
 * Mobile App Authentication
 * 
 * POST /api/mobile-auth/login
 *   Login for company employees using username + password
 *   Returns: { token, user: { id, fullName, email, role, companyId, companyName } }
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { getEffectivePermissionList } from "../rbac/permissions.js";

const router = Router();
// M-8: Do NOT cache JWT_SECRET at module load time — read from process.env inline at each call
// site so the value is always current and undefined is caught before jwt.sign/verify.

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

/* ── Verify Company Code ──────────────────────────────────────────────────── */
router.post("/verify-company", async (req, res, next) => {
  try {
    const { companyCode } = req.body;

    if (!companyCode) {
      return res.status(400).json({ message: "Company code is required" });
    }

    // Find company by code
    const [[company]] = await pool.query(
      `SELECT id, company_name AS "companyName", company_code AS "companyCode", status
       FROM companies
       WHERE company_code = ?`,
      [companyCode]
    );

    if (!company) {
      return res.status(404).json({ message: "Invalid company code" });
    }

    if (company.status !== "Active") {
      return res.status(403).json({ message: "Company is inactive. Contact support." });
    }

    res.json({
      companyId: company.id,
      companyName: company.companyName,
      companyCode: company.companyCode
    });
  } catch (err) {
    next(err);
  }
});

/* ── Search Companies by Name (public) ────────────────────────────────────── */
router.get("/search-company", async (req, res, next) => {
  try {
    const { name } = req.query;
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ message: "Provide at least 2 characters to search" });
    }
    const q = `%${String(name).trim()}%`;
    const [rows] = await pool.query(
      `SELECT id AS companyId, company_name AS companyName, company_code AS companyCode
       FROM companies
       WHERE company_name LIKE ? AND status = 'Active'
       ORDER BY company_name
       LIMIT 10`,
      [q]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Helper: fetch role capabilities from company_roles table ─────────────── */
async function getRoleCapabilities(companyId, roleKey) {
  const empty = {
    canRaiseSoftIssue: false, canResolveSoftIssue: false, isSoftManager: false,
    isTechnicalSupervisor: false, isTechnician: false,
    isHCStaff: false, isHCEngineer: false, isHCAdmin: false,
  };
  if (!roleKey) return empty;

  const legacyRole = roleKey.toLowerCase();

  // ── Healthcare roles ─────────────────────────────────────────────────────
  if (['nurse', 'doctor', 'ward_boy'].includes(legacyRole))
    return { ...empty, isHCStaff: true, canRaiseSoftIssue: true };
  if (legacyRole === 'engineer')
    return { ...empty, isHCEngineer: true, isTechnician: true };
  if (legacyRole === 'admin')
    return { ...empty, isHCAdmin: true, isTechnicalSupervisor: true };

  // ── Legacy built-in role keys ────────────────────────────────────────────
  if (legacyRole === 'supervisor') return { ...empty, isTechnicalSupervisor: true };
  if (legacyRole === 'technician') return { ...empty, isTechnician: true };
  if (legacyRole === 'technical_lead') return { ...empty, isTechnicalSupervisor: true };

  // Custom role — look up in company_roles
  let row;
  try {
    [[row]] = await pool.query(
      `SELECT can_raise_soft_issue       AS "canRaiseSoftIssue",
              can_resolve_soft_issue     AS "canResolveSoftIssue",
              is_soft_manager            AS "isSoftManager",
              is_technical_supervisor    AS "isTechnicalSupervisor",
              is_technician              AS "isTechnician"
         FROM company_roles
        WHERE company_id = ? AND role_key = ? AND is_active = TRUE
        LIMIT 1`,
      [companyId, roleKey]
    );
  } catch {
    [[row]] = await pool.query(
      `SELECT can_raise_soft_issue   AS "canRaiseSoftIssue",
              can_resolve_soft_issue AS "canResolveSoftIssue",
              is_soft_manager        AS "isSoftManager"
         FROM company_roles
        WHERE company_id = ? AND role_key = ? AND is_active = TRUE
        LIMIT 1`,
      [companyId, roleKey]
    ).catch(() => [[null]]);
  }

  if (!row) return empty;
  return {
    canRaiseSoftIssue:     Boolean(row.canRaiseSoftIssue),
    canResolveSoftIssue:   Boolean(row.canResolveSoftIssue),
    isSoftManager:         Boolean(row.isSoftManager),
    isTechnicalSupervisor: Boolean(row.isTechnicalSupervisor),
    isTechnician:          Boolean(row.isTechnician),
    isHCStaff:             false,
    isHCEngineer:          false,
    isHCAdmin:             false,
  };
}

/* ── Build the login response (token + user) from a company_users row ──────── */
async function buildSession(user) {
  const [[rolePermRow]] = await pool.query(
    `SELECT permissions FROM role_permissions WHERE company_id = ? AND role = ? LIMIT 1`,
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
    { sub: user.id, email: user.email, companyId: user.companyId, role: user.role, type: "company_user" },
    process.env.JWT_SECRET,
    { expiresIn: "90d" }
  );
  const roleCapabilities = await getRoleCapabilities(user.companyId, user.role);
  const rbacPermissions = await getEffectivePermissionList({ id: user.id, companyId: user.companyId, role: user.role });

  return {
    token,
    user: {
      id: user.id, fullName: user.fullName, email: user.email, phone: user.phone,
      designation: user.designation, role: user.role, companyId: user.companyId,
      companyName: user.companyName, supervisorId: user.supervisorId,
      permissions: mergedPermissions, moduleAccess: effectiveModuleAccess,
      roleCapabilities, rbacPermissions,
    },
  };
}

/* ── Mobile Login (username + password) ──────────────────────────────────────── */
router.post("/login", async (req, res, next) => {
  try {
    const rawUsername = req.body.username;
    const rawPassword = req.body.password;
    const companyId = req.body.companyId;

    if (!rawUsername || !rawPassword) {
      return res.status(400).json({ message: "Username and password are required" });
    }

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const username = String(rawUsername).trim().slice(0, 64);
    const password = String(rawPassword).slice(0, 128);

    if (!username) {
      return res.status(400).json({ message: "Username cannot be blank" });
    }

    // Find user by username OR email within the company (case-insensitive).
    // Admins are often created with an email but no username, so allow either.
    const [[user]] = await pool.query(
      `SELECT cu.id, cu.company_id AS "companyId", cu.full_name AS "fullName",
              cu.email, cu.phone, cu.designation, cu.role, cu.status,
              cu.password_hash AS "passwordHash", cu.supervisor_id AS "supervisorId",
              cu.permissions, cu.module_access AS "moduleAccess",
              c.company_name AS "companyName"
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE (LOWER(cu.username) = LOWER(?) OR LOWER(cu.email) = LOWER(?))
         AND cu.company_id = ?`,
      [username, username, companyId]
    );

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    // Case-insensitive status check ('Active' / 'active' both allowed)
    if (String(user.status || "").toLowerCase() !== "active") {
      return res.status(403).json({ message: "Account is inactive. Contact your administrator." });
    }

    if (!user.passwordHash) {
      return res.status(401).json({ message: "No password set. Contact your administrator to set up mobile access." });
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    delete user.passwordHash;
    res.json(await buildSession(user));
  } catch (err) {
    next(err);
  }
});

/* ── Mobile Login by EMAIL (no company code) ─────────────────────────────────
 * For users assigned to multiple companies (and admins): sign in with just
 * email + password. Company code is not required. Returns the same session
 * plus the list of companies the user may access. */
router.post("/login-email", async (req, res, next) => {
  try {
    const rawEmail = req.body.email || req.body.username;
    const rawPassword = req.body.password;
    if (!rawEmail || !rawPassword) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const email = String(rawEmail).trim().slice(0, 128);
    const password = String(rawPassword).slice(0, 128);

    // Candidate rows across every company that carry this email.
    const [rows] = await pool.query(
      `SELECT cu.id, cu.company_id AS "companyId", cu.full_name AS "fullName",
              cu.email, cu.phone, cu.designation, cu.role, cu.status,
              cu.password_hash AS "passwordHash", cu.supervisor_id AS "supervisorId",
              cu.permissions, cu.module_access AS "moduleAccess",
              c.company_name AS "companyName"
         FROM company_users cu
         JOIN companies c ON c.id = cu.company_id
        WHERE LOWER(cu.email) = LOWER(?)`,
      [email]
    );
    if (!rows.length) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Pick the active row whose password verifies. Prefer an admin row so a
    // multi-company admin lands on their admin home company.
    rows.sort((a, b) => (b.role === "admin") - (a.role === "admin"));
    let user = null;
    for (const r of rows) {
      if (String(r.status || "").toLowerCase() !== "active") continue;
      if (!r.passwordHash) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await bcrypt.compare(password, r.passwordHash)) { user = r; break; }
    }
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Companies this user may access = primary + user_company_access rows.
    let companies = [];
    try {
      const [accessRows] = await pool.query(
        `SELECT c.id, c.company_name AS "companyName"
           FROM companies c
          WHERE c.id = ?
             OR c.id IN (SELECT company_id FROM user_company_access WHERE user_id = ?)
          ORDER BY (c.id = ?) DESC, c.company_name ASC`,
        [user.companyId, user.id, user.companyId]
      );
      companies = accessRows;
    } catch { companies = [{ id: user.companyId, companyName: user.companyName }]; }

    delete user.passwordHash;
    res.json({ ...(await buildSession(user)), companies });
  } catch (err) {
    next(err);
  }
});

/* ── Verify Token (for auto-login / persistent sessions) ────────────────────── */
router.get("/verify", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== "company_user") {
      return res.status(401).json({ message: "Invalid token type" });
    }

    // Fetch fresh user data
    const [[user]] = await pool.query(
      `SELECT cu.id, cu.company_id AS "companyId", cu.full_name AS "fullName",
              cu.email, cu.phone, cu.designation, cu.role, cu.status,
              cu.supervisor_id AS "supervisorId",
              c.company_name AS "companyName"
       FROM company_users cu
       JOIN companies c ON c.id = cu.company_id
       WHERE cu.id = ?`,
      [decoded.sub || decoded.userId]
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (String(user.status || "").toLowerCase() !== "active") {
      return res.status(403).json({ message: "Account is inactive" });
    }

    const roleCapabilities = await getRoleCapabilities(user.companyId, user.role);
    const rbacPermissions = await getEffectivePermissionList({ id: user.id, companyId: user.companyId, role: user.role });
    res.json({ user: { ...user, roleCapabilities, rbacPermissions } });
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    next(err);
  }
});

/* ── Register / update push token ───────────────────────────────────────────── */
router.post("/push-token", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }
    const decoded = jwt.verify(authHeader.substring(7), process.env.JWT_SECRET);
    if (decoded.type !== "company_user") {
      return res.status(401).json({ message: "Invalid token type" });
    }

    const { token: pushToken, platform } = req.body || {};
    if (!pushToken) return res.status(400).json({ message: "token is required" });

    await pool.query(
      `UPDATE company_users SET push_token = ?, push_token_platform = ? WHERE id = ?`,
      [pushToken, platform || null, decoded.sub || decoded.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    next(err);
  }
});

export default router;
