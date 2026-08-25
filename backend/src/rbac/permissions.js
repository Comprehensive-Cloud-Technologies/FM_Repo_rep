/**
 * RBAC — single source of truth for permissions.
 *
 * Model: a permission is a `resource:action` string. A role is a named set of
 * permission keys. This file is the CATALOG (all valid keys) and the DEFAULT
 * role → permission bundles.
 *
 * Phase 1: bundles are derived in code from the role string so there is no data
 * migration and no lockout — the effective set for each existing role matches
 * (or safely widens to) what that role could already do. Later phases can load
 * per-company overrides from the DB inside getEffectivePermissions().
 */

// ─── Catalog: every valid permission key ────────────────────────────────────────
export const PERMISSIONS = Object.freeze([
  // Assets
  "asset:view", "asset:create", "asset:edit", "asset:delete", "asset:transfer",
  // Case logs (mobile QR issues + work orders)
  "case_log:view", "case_log:create", "case_log:assign", "case_log:start",
  "case_log:resolve", "case_log:close",
  // Work orders
  "work_order:view", "work_order:assign", "work_order:update_status", "work_order:delete",
  // PMS
  "pms:view", "pms:schedule", "pms:delete", "pms:assign_checklist",
  // Calibration
  "calibration:view", "calibration:schedule", "calibration:delete",
  // Training
  "training:view", "training:schedule", "training:delete", "training:mark_attendance",
  // Reports
  "report:view",
  // Administration
  "role:manage", "user:manage",
]);

const ALL = () => new Set(PERMISSIONS);

// ─── Default role → permission bundles ──────────────────────────────────────────
// Keys are lowercased role strings. Unknown roles fall back to EMPLOYEE_BASELINE.
const B = {
  admin: () => ALL(),
  catalyst_admin: () => ALL(),

  engineer: () => new Set([
    "asset:view", "asset:create", "asset:edit", "asset:transfer",
    "case_log:view", "case_log:assign", "case_log:start", "case_log:resolve", "case_log:close",
    "work_order:view", "work_order:assign", "work_order:update_status",
    "pms:view", "calibration:view", "training:view", "report:view",
  ]),

  supervisor: () => new Set([
    "asset:view", "asset:edit",
    "case_log:view", "case_log:assign",
    "work_order:view", "work_order:assign", "work_order:update_status",
    "pms:view", "pms:schedule", "pms:delete", "pms:assign_checklist",
    "calibration:view", "calibration:schedule", "calibration:delete",
    "training:view", "training:schedule", "training:delete",
    "report:view",
  ]),

  technical_lead: () => B.supervisor(),

  technician: () => new Set([
    "asset:view", "case_log:view", "work_order:view", "work_order:update_status",
    "training:view",
  ]),

  department_head: () => new Set([
    "asset:view", "case_log:view", "pms:view", "calibration:view",
    "training:view", "report:view",
  ]),

  doctor:   () => new Set(["case_log:create", "case_log:view", "case_log:close", "asset:view"]),
  nurse:    () => new Set(["case_log:create", "case_log:view", "case_log:close", "asset:view"]),
  ward_boy: () => new Set(["case_log:create", "case_log:view", "case_log:close", "asset:view"]),
};

const EMPLOYEE_BASELINE = () => new Set(["asset:view", "case_log:view", "case_log:create"]);

/**
 * Resolve the default permission set for a role string.
 * (Phase 2 will merge per-company role overrides + user grants/denies here.)
 */
export function resolvePermissionsForRole(role) {
  const key = String(role || "").toLowerCase();
  const build = B[key];
  return build ? build() : EMPLOYEE_BASELINE();
}

/**
 * Effective permission Set for the authenticated company user.
 * Kept async so Phase 2 can add DB-backed overrides without changing callers.
 */
export async function getEffectivePermissions(companyUser) {
  if (!companyUser) return new Set();
  return resolvePermissionsForRole(companyUser.role);
}

/** Convenience: resolved permissions as a sorted array (for API responses). */
export async function getEffectivePermissionList(companyUser) {
  return [...(await getEffectivePermissions(companyUser))].sort();
}
