/**
 * Company Custom Roles / Hierarchy
 * ──────────────────────────────────────────────────────────────────────────
 * Lets each company admin define their own roles + parent-child hierarchy.
 * Mounted at: /api/company-portal/roles
 *
 * Routes:
 *   GET    /                 – list this company's roles (ordered by sort_order)
 *   POST   /                 – create a role
 *   PUT    /:id              – update a role
 *   DELETE /:id              – delete a role
 *   PUT    /reorder          – bulk update sort_order via [{id, sortOrder}]
 */

import { Router } from "express";
import pool from "../db.js";
import { isMigrationSafeError } from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";
import {
  PERMISSIONS, getPermissionCatalog, getEffectivePermissions,
  resolvePermissionsForRole, invalidatePermissionCache, MANAGEABLE_ROLE_KEYS,
  CONFIGURED_SENTINEL,
} from "../rbac/permissions.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

// ── Auto-migration: role → permission grants (dynamic RBAC, Phase 2) ─────────
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permission_grants (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        company_id INT UNSIGNED NOT NULL,
        role_key VARCHAR(80) NOT NULL,
        permission_key VARCHAR(80) NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_role_perm (company_id, role_key, permission_key),
        KEY idx_company_role (company_id, role_key)
      )
    `);
  } catch (err) {
    if (!isMigrationSafeError(err)) console.error("[role-permission-grants] migration:", err.message);
  }
})();

const slugify = (s) =>
  String(s || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || `role_${Date.now()}`;

// ── Auto-migration: replace full UNIQUE constraint with partial index ────────
// Root cause: UNIQUE (company_id, role_key) blocks re-creating a soft-deleted
// role. Fix: drop the table constraint, add a partial unique index that only
// applies when is_active = TRUE so soft-deleted rows don't occupy the slot.
(async () => {
  try {
    await pool.query(`
      ALTER TABLE company_roles
        DROP CONSTRAINT IF EXISTS company_roles_company_id_role_key_key
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS company_roles_active_unique
        ON company_roles (company_id, role_key)
        WHERE is_active = TRUE
    `);
  } catch (err) {
    // eslint-disable-next-line no-console
    if (!isMigrationSafeError(err)) console.error("[company-roles] migration:", err.message);
  }
})();

// ─── RBAC: permission catalog + per-role grants (admin only) ─────────────────

const ROLE_LABELS = {
  admin: "Admin", engineer: "Engineer", department_head: "Department Head",
  doctor: "Doctor", nurse: "Nurse", ward_boy: "Ward Boy", employee: "Employee",
};

/* GET /permissions/catalog — grouped permission catalog for the Roles UI */
router.get("/permissions/catalog", requirePermission("role:manage"), (req, res) => {
  res.json({ catalog: getPermissionCatalog() });
});

/* GET /permissions/roles — every manageable role + its effective permissions */
router.get("/permissions/roles", requirePermission("role:manage"), async (req, res, next) => {
  try {
    const companyId = cid(req);
    // Custom company roles (if any) are manageable too
    let customKeys = [];
    try {
      const [rows] = await pool.query(
        "SELECT DISTINCT role_key FROM company_roles WHERE company_id = ? AND is_active = TRUE", [companyId]
      );
      customKeys = rows.map((r) => r.role_key);
    } catch { /* table shape varies; ignore */ }

    const roleKeys = [...new Set([...MANAGEABLE_ROLE_KEYS, ...customKeys])];
    const [grantRows] = await pool.query(
      "SELECT role_key, permission_key FROM role_permission_grants WHERE company_id = ?", [companyId]
    );
    const grantsByRole = {};
    for (const g of grantRows) (grantsByRole[g.role_key] ||= []).push(g.permission_key);

    // How many users are currently assigned to each role → blast-radius display
    const userCounts = {};
    try {
      const [cntRows] = await pool.query(
        "SELECT role, COUNT(*) AS n FROM company_users WHERE company_id = ? GROUP BY role", [companyId]
      );
      for (const r of cntRows) userCounts[String(r.role || "").toLowerCase()] = Number(r.n) || 0;
    } catch { /* table shape varies; counts optional */ }

    const roles = roleKeys.map((roleKey) => {
      const hasCustom = !!grantsByRole[roleKey];
      const permissions = hasCustom
        ? grantsByRole[roleKey].filter((p) => PERMISSIONS.includes(p))
        : [...resolvePermissionsForRole(roleKey)];
      return {
        roleKey,
        label: ROLE_LABELS[roleKey] || roleKey,
        permissions: permissions.sort(),
        isCustomized: hasCustom,
        userCount: userCounts[roleKey] || 0,
        locked: roleKey === "admin",   // admin always has all permissions
      };
    });
    res.json({ roles });
  } catch (err) { next(err); }
});

/* PUT /permissions/roles/:roleKey — replace a role's granted permissions */
router.put("/permissions/roles/:roleKey", requirePermission("role:manage"), async (req, res, next) => {
  try {
    const companyId = cid(req);
    const roleKey = String(req.params.roleKey || "").toLowerCase();
    if (roleKey === "admin") return res.status(400).json({ message: "The Admin role always has all permissions and cannot be edited." });

    const requested = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
    const valid = [...new Set(requested.filter((p) => PERMISSIONS.includes(p)))];

    // ── Anti-escalation guard ────────────────────────────────────────────────
    // An editor can only grant permissions they themselves hold. Admins hold
    // every permission, so they're unaffected; a non-admin with role:manage
    // cannot hand out powers (e.g. asset:delete, user:manage) they don't have.
    const editorPerms = await getEffectivePermissions(req.companyUser);
    const escalating = valid.filter((p) => !editorPerms.has(p));
    if (escalating.length > 0) {
      return res.status(403).json({
        message: "You can only grant permissions you already have. Blocked: " + escalating.join(", "),
        blocked: escalating,
      });
    }

    // Always write the sentinel so an explicitly-empty role stays empty
    // (instead of falling back to code defaults).
    const toInsert = [CONFIGURED_SENTINEL, ...valid];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("DELETE FROM role_permission_grants WHERE company_id = ? AND role_key = ?", [companyId, roleKey]);
      const values = toInsert.map(() => "(?, ?, ?)").join(", ");
      const params = toInsert.flatMap((p) => [companyId, roleKey, p]);
      await conn.query(
        `INSERT INTO role_permission_grants (company_id, role_key, permission_key) VALUES ${values}`,
        params
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback(); throw e;
    } finally {
      conn.release();
    }

    invalidatePermissionCache(companyId, roleKey);
    res.json({ ok: true, roleKey, permissions: valid.sort() });
  } catch (err) { next(err); }
});

/* ── List roles ───────────────────────────────────────────────────────────── */
router.get("/", async (req, res, next) => {
  try {
    let rows;
    try {
      [rows] = await pool.query(
        `SELECT id,
                company_id               AS "companyId",
                role_key                 AS "roleKey",
                label,
                parent_role_key          AS "parentRoleKey",
                sort_order               AS "sortOrder",
                color,
                bg_color                 AS "bgColor",
                is_active                AS "isActive",
                can_raise_soft_issue     AS "canRaiseSoftIssue",
                can_resolve_soft_issue   AS "canResolveSoftIssue",
                is_soft_manager          AS "isSoftManager",
                is_technical_supervisor  AS "isTechnicalSupervisor",
                is_technician            AS "isTechnician"
           FROM company_roles
          WHERE company_id = ?
            AND is_active = TRUE
          ORDER BY sort_order ASC, id ASC`,
        [cid(req)]
      );
    } catch (selectErr) {
      // Capability columns not migrated yet — select without them
      if (String(selectErr?.message).includes("does not exist") || selectErr?.code === '42703' || String(selectErr?.message).includes("Unknown column")) {
        [rows] = await pool.query(
          `SELECT id,
                  company_id      AS "companyId",
                  role_key        AS "roleKey",
                  label,
                  parent_role_key AS "parentRoleKey",
                  sort_order      AS "sortOrder",
                  color,
                  bg_color        AS "bgColor",
                  is_active       AS "isActive"
             FROM company_roles
            WHERE company_id = ?
              AND is_active = TRUE
            ORDER BY sort_order ASC, id ASC`,
          [cid(req)]
        );
      } else {
        throw selectErr;
      }
    }
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ── Create role ──────────────────────────────────────────────────────────── */
router.post("/", requirePermission("role:manage"), async (req, res, next) => {
  try {
    const { label, parentRoleKey, color, bgColor, sortOrder,
            canRaiseSoftIssue, canResolveSoftIssue, isSoftManager,
            isTechnicalSupervisor, isTechnician } = req.body || {};
    if (!label || !String(label).trim()) {
      return res.status(400).json({ message: "label is required" });
    }
    const key = req.body.roleKey ? slugify(req.body.roleKey) : slugify(label);

    // Block duplicate active roles
    const [activeExists] = await pool.query(
      `SELECT id FROM company_roles WHERE company_id = ? AND role_key = ?`,
      [cid(req), key]
    );
    if (activeExists.length) {
      return res.status(409).json({ message: "Role with that key already exists" });
    }

    const [[nextOrder]] = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS "next" FROM company_roles WHERE company_id = ?`,
      [cid(req)]
    );
    const order = Number.isFinite(sortOrder) ? sortOrder : nextOrder.next;

    const baseValues = [
      cid(req),
      key,
      String(label).trim().slice(0, 120),
      parentRoleKey ? slugify(parentRoleKey) : null,
      order,
      color || "#2563eb",
      bgColor || "#dbeafe",
    ];
    // Try INSERT with soft-service capability columns (requires migration).
    // Fall back to INSERT without them if the columns don't exist yet.
    try {
      await pool.query(
        `INSERT INTO company_roles
           (company_id, role_key, label, parent_role_key, sort_order, color, bg_color,
            can_raise_soft_issue, can_resolve_soft_issue, is_soft_manager,
            is_technical_supervisor, is_technician)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ...baseValues,
          // Soft Services removed — soft capabilities are always off.
          0,
          0,
          0,
          isTechnicalSupervisor ? 1 : 0,
          isTechnician          ? 1 : 0,
        ]
      );
    } catch (insertErr) {
      // Column doesn't exist yet (migration pending) — insert without it
      if (String(insertErr?.message).includes("does not exist") || insertErr?.code === '42703' || String(insertErr?.message).includes("Unknown column")) {
        await pool.query(
          `INSERT INTO company_roles
             (company_id, role_key, label, parent_role_key, sort_order, color, bg_color)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          baseValues
        );
      } else {
        throw insertErr;
      }
    }
    res.status(201).json({ ok: true, roleKey: key });
  } catch (err) {
    next(err);
  }
});

/* ── Update role ──────────────────────────────────────────────────────────── */
router.put("/:id", requirePermission("role:manage"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    const { label, parentRoleKey, color, bgColor, sortOrder,
            canRaiseSoftIssue, canResolveSoftIssue, isSoftManager,
            isTechnicalSupervisor, isTechnician } = req.body || {};
    const fields = [];
    const params = [];
    if (label !== undefined) {
      fields.push(`label = ?`);
      params.push(String(label).trim().slice(0, 120));
    }
    if (parentRoleKey !== undefined) {
      fields.push(`parent_role_key = ?`);
      params.push(parentRoleKey ? slugify(parentRoleKey) : null);
    }
    if (color !== undefined) {
      fields.push(`color = ?`);
      params.push(color);
    }
    if (bgColor !== undefined) {
      fields.push(`bg_color = ?`);
      params.push(bgColor);
    }
    if (sortOrder !== undefined && Number.isFinite(sortOrder)) {
      fields.push(`sort_order = ?`);
      params.push(sortOrder);
    }
    // Soft Services removed — these capabilities can no longer be enabled.
    void canRaiseSoftIssue; void canResolveSoftIssue; void isSoftManager;
    if (isTechnicalSupervisor !== undefined) {
      fields.push(`is_technical_supervisor = ?`);
      params.push(isTechnicalSupervisor ? 1 : 0);
    }
    if (isTechnician !== undefined) {
      fields.push(`is_technician = ?`);
      params.push(isTechnician ? 1 : 0);
    }
    if (!fields.length) return res.json({ ok: true });
    fields.push(`updated_at = NOW()`);
    params.push(cid(req), id);
    await pool.query(
      `UPDATE company_roles SET ${fields.join(", ")} WHERE company_id = ? AND id = ?`,
      params
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ── Delete role ──────────────────────────────────────────────────────────── */
router.delete("/:id", requirePermission("role:manage"), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });
    await pool.query(
      `DELETE FROM company_roles WHERE company_id = ? AND id = ?`,
      [cid(req), id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ── Bulk reorder ─────────────────────────────────────────────────────────── */
router.put("/reorder/bulk", requirePermission("role:manage"), async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const it of items) {
      const id = Number(it?.id);
      const order = Number(it?.sortOrder);
      if (!Number.isFinite(id) || !Number.isFinite(order)) continue;
      await pool.query(
        `UPDATE company_roles SET sort_order = ?, updated_at = NOW()
          WHERE company_id = ? AND id = ?`,
        [order, cid(req), id]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
