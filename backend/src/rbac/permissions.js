/**
 * RBAC — single source of truth for permissions.
 *
 * Model: a permission is a `resource:action` string. A role is a named set of
 * permission keys. This file is the CATALOG (all valid keys), the DEFAULT
 * role → permission bundles, and the resolver.
 *
 * Phase 2: getEffectivePermissions() reads per-company role→permission grants
 * from the `role_permission_grants` table when present, and falls back to the
 * code defaults otherwise — so unconfigured companies keep working and admins
 * can customize any role's permissions from the Roles UI. A small in-memory
 * cache avoids a DB round-trip on every gated request; it is invalidated when
 * a role's grants change (invalidatePermissionCache).
 */
import pool from "../db.js";

// ─── Catalog: every valid permission key ────────────────────────────────────────
export const PERMISSIONS = Object.freeze([
  // Assets
  "asset:view", "asset:create", "asset:edit", "asset:delete", "asset:transfer",
  // Case logs (mobile QR issues + work orders)
  "case_log:view", "case_log:create", "case_log:assign", "case_log:start",
  "case_log:resolve", "case_log:close",
  // Work orders
  "work_order:view", "work_order:create", "work_order:assign", "work_order:update_status", "work_order:delete",
  // PMS
  "pms:view", "pms:schedule", "pms:delete", "pms:assign_checklist",
  // Calibration
  "calibration:view", "calibration:schedule", "calibration:delete",
  // Training
  "training:view", "training:schedule", "training:delete", "training:mark_attendance",
  // Reports
  "report:view",
  // Mobile app — which tabs a role sees on the mobile app (Home & Profile always shown)
  "mobile:assets", "mobile:requests", "mobile:reports",
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
    "work_order:view",
    "pms:view", "calibration:view", "training:view", "report:view",
    "mobile:assets", "mobile:requests", "mobile:reports",
  ]),

  supervisor: () => new Set([
    "asset:view", "asset:create", "asset:edit", "asset:transfer",
    "case_log:view", "case_log:assign",
    "work_order:view", "work_order:create", "work_order:assign", "work_order:update_status", "work_order:delete",
    "pms:view", "pms:schedule", "pms:delete", "pms:assign_checklist",
    "calibration:view", "calibration:schedule", "calibration:delete",
    "training:view", "training:schedule", "training:delete",
    "report:view",
    "mobile:assets", "mobile:requests", "mobile:reports",
  ]),

  technical_lead: () => B.supervisor(),

  technician: () => new Set([
    "asset:view", "case_log:view", "work_order:view", "work_order:update_status",
    "training:view",
    "mobile:assets", "mobile:requests",
  ]),

  department_head: () => new Set([
    "asset:view", "case_log:view", "pms:view", "calibration:view",
    "training:view", "report:view",
    "mobile:assets", "mobile:requests", "mobile:reports",
  ]),

  doctor:   () => new Set(["case_log:create", "case_log:view", "case_log:close", "asset:view", "mobile:assets", "mobile:requests"]),
  nurse:    () => new Set(["case_log:create", "case_log:view", "case_log:close", "asset:view", "mobile:assets", "mobile:requests"]),
  ward_boy: () => new Set(["case_log:create", "case_log:view", "case_log:close", "asset:view", "mobile:assets", "mobile:requests"]),
};

const EMPLOYEE_BASELINE = () => new Set(["asset:view", "case_log:view", "case_log:create", "mobile:requests"]);

// Roles the admin can manage permissions for in the Roles UI (admin is locked = all).
export const MANAGEABLE_ROLE_KEYS = [
  "admin", "engineer", "department_head", "doctor", "nurse", "ward_boy", "employee",
];

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
 * Reads per-company role grants from `role_permission_grants`; falls back to
 * the code defaults when a role has no custom grants for that company.
 */
export async function getEffectivePermissions(companyUser) {
  if (!companyUser) return new Set();
  const { companyId, role } = companyUser;
  const key = String(role || "").toLowerCase();
  if (!companyId) return resolvePermissionsForRole(key);

  const cacheKey = `${companyId}:${key}`;
  const cached = _cache.get(cacheKey);
  if (cached && cached.exp > Date.now()) return new Set(cached.set);

  let set;
  try {
    const [rows] = await pool.query(
      "SELECT permission_key FROM role_permission_grants WHERE company_id = ? AND role_key = ?",
      [companyId, key]
    );
    set = rows.length
      ? new Set(rows.map((r) => r.permission_key).filter((p) => PERMISSIONS.includes(p)))
      : resolvePermissionsForRole(key);
  } catch {
    // Table missing / DB error → safe fallback to code defaults
    set = resolvePermissionsForRole(key);
  }
  _cache.set(cacheKey, { set: [...set], exp: Date.now() + CACHE_TTL_MS });
  return set;
}

/** Convenience: resolved permissions as a sorted array (for API responses). */
export async function getEffectivePermissionList(companyUser) {
  return [...(await getEffectivePermissions(companyUser))].sort();
}

// ─── Cache (per company:role) ───────────────────────────────────────────────────
const _cache = new Map();
const CACHE_TTL_MS = 60 * 1000;

/** Invalidate cached permissions. Call after a role's grants change. */
export function invalidatePermissionCache(companyId, role) {
  if (companyId && role) _cache.delete(`${companyId}:${String(role).toLowerCase()}`);
  else if (companyId) {
    for (const k of _cache.keys()) if (k.startsWith(`${companyId}:`)) _cache.delete(k);
  } else _cache.clear();
}

// ─── Grouped catalog (for the Roles UI) ─────────────────────────────────────────
export const PERMISSION_LABELS = {
  "asset:view": "View assets", "asset:create": "Create assets", "asset:edit": "Edit assets",
  "asset:delete": "Delete assets", "asset:transfer": "Assign / transfer assets",
  "case_log:view": "View case logs", "case_log:create": "Raise case logs",
  "case_log:assign": "Assign case logs", "case_log:start": "Start (mark in progress)",
  "case_log:resolve": "Resolve case logs", "case_log:close": "Close case logs",
  "work_order:view": "View work orders", "work_order:create": "Create work orders",
  "work_order:assign": "Assign work orders", "work_order:update_status": "Update work-order status",
  "work_order:delete": "Delete work orders",
  "pms:view": "View PMS", "pms:schedule": "Create/edit PMS schedules & checklists",
  "pms:delete": "Delete PMS schedules", "pms:assign_checklist": "Assign checklists to assets",
  "calibration:view": "View calibration", "calibration:schedule": "Manage calibration schedules & vendors",
  "calibration:delete": "Delete calibration",
  "training:view": "View training", "training:schedule": "Create training sessions",
  "training:delete": "Delete training sessions", "training:mark_attendance": "Mark attendance",
  "report:view": "View reports",
  "mobile:assets": "Show Assets tab", "mobile:requests": "Show Requests tab", "mobile:reports": "Show Reports tab",
  "role:manage": "Manage roles & permissions", "user:manage": "Manage users",
};

const GROUP_LABELS = {
  asset: "Assets", case_log: "Case Logs", work_order: "Work Orders",
  pms: "PMS", calibration: "Calibration", training: "Training",
  report: "Reports", mobile: "Mobile App (tabs)", role: "Administration", user: "Administration",
};

/** Returns [{ group, permissions:[{key,label}] }] for rendering the Roles UI. */
export function getPermissionCatalog() {
  const byGroup = new Map();
  for (const key of PERMISSIONS) {
    const resource = key.split(":")[0];
    const group = GROUP_LABELS[resource] || resource;
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push({ key, label: PERMISSION_LABELS[key] || key });
  }
  return [...byGroup.entries()].map(([group, permissions]) => ({ group, permissions }));
}
