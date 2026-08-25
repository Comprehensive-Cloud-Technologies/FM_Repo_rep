/**
 * requirePermission — server-side RBAC gate.
 *
 * Usage (after requireCompanyAuth so req.companyUser is set):
 *   router.post("/schedules", requirePermission("pms:schedule"), handler);
 *
 * Deny by default: if the user's effective set lacks the permission → 403.
 */
import { getEffectivePermissions } from "../rbac/permissions.js";

export function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      if (!req.companyUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const perms = await getEffectivePermissions(req.companyUser);
      if (!perms.has(permission)) {
        return res.status(403).json({ message: `Permission denied: ${permission} required` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Passes if the user has ANY of the listed permissions. */
export function requireAnyPermission(...permissions) {
  return async (req, res, next) => {
    try {
      if (!req.companyUser) {
        return res.status(401).json({ message: "Authentication required" });
      }
      const perms = await getEffectivePermissions(req.companyUser);
      if (!permissions.some((p) => perms.has(p))) {
        return res.status(403).json({ message: `Permission denied: one of [${permissions.join(", ")}] required` });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
