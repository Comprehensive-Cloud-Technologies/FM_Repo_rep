/**
 * Admin SLA Management
 * Prefix: /api/admin/sla
 *
 * Requires main-platform JWT (requireAuth).
 * Handles: SLA policy CRUD, versioning, calendar management,
 *          breach reasons catalogue, eligibility rules, assignments.
 */

import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

/* ─── Auto-migration: create all SLA tables ────────────────────────────── */
const safe = (sql) => pool.query(sql).catch(() => {});

(async () => {
  // ── Policy core ──────────────────────────────────────────────────────────
  await safe(`CREATE TABLE IF NOT EXISTS sla_policies (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name         VARCHAR(120) NOT NULL,
    description  TEXT,
    version      INT NOT NULL DEFAULT 1,
    is_active    TINYINT(1) NOT NULL DEFAULT 1,
    calendar_id  INT UNSIGNED NULL,
    created_by   INT UNSIGNED NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`CREATE TABLE IF NOT EXISTS sla_policy_rules (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_id          INT UNSIGNED NOT NULL,
    priority           ENUM('P1','P2','P3','P4') NOT NULL,
    label              VARCHAR(60) NULL,
    criticality_match  VARCHAR(40) NULL,
    response_mins      INT NOT NULL DEFAULT 30,
    attendance_mins    INT NOT NULL DEFAULT 120,
    resolution_mins    INT NOT NULL DEFAULT 240,
    pause_allowed      TINYINT(1) NOT NULL DEFAULT 1,
    allowed_pause_reasons JSON NULL,
    extends_due_at     TINYINT(1) NOT NULL DEFAULT 1,
    color_code         VARCHAR(10) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_policy_priority (policy_id, priority)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`CREATE TABLE IF NOT EXISTS sla_policy_versions (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_id      INT UNSIGNED NOT NULL,
    version        INT NOT NULL,
    rules_snapshot JSON NOT NULL,
    created_by     INT UNSIGNED NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_policy_ver (policy_id, version)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // ── Calendar ─────────────────────────────────────────────────────────────
  await safe(`CREATE TABLE IF NOT EXISTS sla_calendars (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name          VARCHAR(100) NOT NULL,
    calendar_type ENUM('24x7','business_hours','custom') NOT NULL DEFAULT '24x7',
    biz_start     TIME NULL,
    biz_end       TIME NULL,
    include_sat   TINYINT(1) NOT NULL DEFAULT 0,
    include_sun   TINYINT(1) NOT NULL DEFAULT 0,
    created_by    INT UNSIGNED NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`CREATE TABLE IF NOT EXISTS sla_calendar_hours (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
    calendar_id  INT UNSIGNED NOT NULL,
    day_of_week  TINYINT UNSIGNED NOT NULL,
    open_time    TIME NOT NULL,
    close_time   TIME NOT NULL,
    is_closed    TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`CREATE TABLE IF NOT EXISTS sla_calendar_holidays (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    calendar_id   INT UNSIGNED NOT NULL,
    company_id    INT UNSIGNED NULL,
    holiday_date  DATE NOT NULL,
    name          VARCHAR(100) NULL,
    PRIMARY KEY (id),
    KEY idx_cal_date (calendar_id, holiday_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // ── Assignment ───────────────────────────────────────────────────────────
  await safe(`CREATE TABLE IF NOT EXISTS sla_assignments (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    policy_id      INT UNSIGNED NOT NULL,
    scope_type     ENUM('company','department','category','asset','contract') NOT NULL,
    scope_id       INT UNSIGNED NULL,
    scope_ref      VARCHAR(120) NULL,
    contract_number VARCHAR(100) NULL,
    effective_from DATE NOT NULL,
    effective_to   DATE NULL,
    is_active      TINYINT(1) NOT NULL DEFAULT 1,
    notes          TEXT NULL,
    assigned_by    INT UNSIGNED NULL,
    assigned_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_scope (scope_type, scope_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // ── Breach reasons catalogue ─────────────────────────────────────────────
  await safe(`CREATE TABLE IF NOT EXISTS sla_breach_reasons (
    id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
    code               VARCHAR(60) NOT NULL UNIQUE,
    label              VARCHAR(120) NOT NULL,
    is_pause_reason    TINYINT(1) NOT NULL DEFAULT 1,
    excludes_from_sla  TINYINT(1) NOT NULL DEFAULT 0,
    responsibility     ENUM('OEM','Hospital','Catalyst','Other') NULL,
    is_active          TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // Seed default breach/pause reasons
  await safe(`INSERT IGNORE INTO sla_breach_reasons (code, label, is_pause_reason, responsibility) VALUES
    ('WAITING_SPARE',    'Waiting for spare part',          1, 'OEM'),
    ('WAITING_OEM',      'Waiting for OEM',                 1, 'OEM'),
    ('WAITING_APPROVAL', 'Waiting for hospital approval',   1, 'Hospital'),
    ('WAITING_USER',     'Waiting for user/patient',        1, 'Hospital'),
    ('INACCESSIBLE',     'Equipment inaccessible',          1, 'Hospital'),
    ('EXTERNAL_DEP',     'External dependency',             1, 'Other'),
    ('SCHEDULED_DOWN',   'Scheduled shutdown',              1, 'Hospital'),
    ('OTHER',            'Other',                           1, 'Other')`);

  // ── Eligibility rules ────────────────────────────────────────────────────
  await safe(`CREATE TABLE IF NOT EXISTS sla_eligibility_rules (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_id    INT UNSIGNED NOT NULL,
    exclude_type  VARCHAR(60) NOT NULL,
    is_excluded   TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_company_type (company_id, exclude_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // ── Ticket SLA tracking ──────────────────────────────────────────────────
  await safe(`CREATE TABLE IF NOT EXISTS ticket_sla (
    id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    query_id                INT UNSIGNED NOT NULL,
    snapshot_company_id     INT UNSIGNED NULL,
    snapshot_department_id  INT UNSIGNED NULL,
    snapshot_asset_id       INT UNSIGNED NULL,
    snapshot_company_name   VARCHAR(120) NULL,
    snapshot_dept_name      VARCHAR(120) NULL,
    snapshot_asset_name     VARCHAR(220) NULL,
    policy_id               INT UNSIGNED NULL,
    policy_version          INT NOT NULL DEFAULT 1,
    policy_level            VARCHAR(20) NULL,
    priority                ENUM('P1','P2','P3','P4') NOT NULL DEFAULT 'P3',
    sla_response_mins       INT NOT NULL DEFAULT 240,
    sla_attendance_mins     INT NOT NULL DEFAULT 480,
    sla_resolution_mins     INT NOT NULL DEFAULT 1440,
    sla_start_time          DATETIME NOT NULL,
    response_due_at         DATETIME NULL,
    attendance_due_at       DATETIME NULL,
    resolution_due_at       DATETIME NULL,
    is_sla_eligible         TINYINT(1) NOT NULL DEFAULT 1,
    ineligible_reason       VARCHAR(200) NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_query (query_id),
    KEY idx_company (snapshot_company_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`CREATE TABLE IF NOT EXISTS ticket_sla_clocks (
    id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ticket_sla_id    INT UNSIGNED NOT NULL,
    clock_type       ENUM('response','attendance','resolution') NOT NULL,
    target_mins      INT NOT NULL,
    due_at           DATETIME NOT NULL,
    adjusted_due_at  DATETIME NULL,
    completed_at     DATETIME NULL,
    actual_mins      INT NULL,
    status           ENUM('running','paused','met','breached') NOT NULL DEFAULT 'running',
    breach_mins      INT NULL DEFAULT 0,
    total_paused_mins INT NOT NULL DEFAULT 0,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sla_type (ticket_sla_id, clock_type),
    KEY idx_status_due (status, due_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`CREATE TABLE IF NOT EXISTS ticket_sla_pauses (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    clock_id    INT UNSIGNED NOT NULL,
    paused_at   DATETIME NOT NULL,
    resumed_at  DATETIME NULL,
    reason_id   INT UNSIGNED NULL,
    paused_mins INT NULL,
    extends_due TINYINT(1) NOT NULL DEFAULT 1,
    paused_by   INT UNSIGNED NULL,
    PRIMARY KEY (id),
    KEY idx_clock (clock_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`CREATE TABLE IF NOT EXISTS ticket_sla_events (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ticket_sla_id  INT UNSIGNED NOT NULL,
    event_type     ENUM('created','responded','attended','resolved','paused','resumed','breached','reopened') NOT NULL,
    occurred_at    DATETIME NOT NULL,
    actor_id       INT UNSIGNED NULL,
    notes          TEXT NULL,
    PRIMARY KEY (id),
    KEY idx_sla (ticket_sla_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await safe(`CREATE TABLE IF NOT EXISTS sla_breach_logs (
    id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
    clock_id             INT UNSIGNED NOT NULL,
    breach_reason_id     INT UNSIGNED NULL,
    responsibility       ENUM('OEM','Hospital','Catalyst','Other') NULL,
    breach_mins          INT NOT NULL DEFAULT 0,
    notes                TEXT NULL,
    logged_by            INT UNSIGNED NULL,
    logged_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_clock (clock_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // ── Alter asset_queries to add priority + ticket_type ────────────────────
  await safe(`ALTER TABLE asset_queries
    ADD COLUMN IF NOT EXISTS priority     VARCHAR(40) NULL AFTER status,
    ADD COLUMN IF NOT EXISTS ticket_type  VARCHAR(40) NOT NULL DEFAULT 'breakdown' AFTER priority,
    ADD COLUMN IF NOT EXISTS engineer_responded_at  DATETIME NULL,
    ADD COLUMN IF NOT EXISTS engineer_attended_at   DATETIME NULL`);
  // Ensure priority column is VARCHAR so it accepts both SLA codes (P1-P4) and mobile values ("normal","high",etc.)
  await safe(`ALTER TABLE asset_queries MODIFY COLUMN priority VARCHAR(40) NULL`);

  console.log("[SLA] All SLA tables ready");
})();

/* ═══════════════════════════════════════════════════════════════════════════
   POLICIES
   ═══════════════════════════════════════════════════════════════════════════ */

// GET /api/admin/sla/policies
router.get("/policies", async (req, res, next) => {
  try {
    const [policies] = await pool.query(
      `SELECT sp.*, sc.name AS calendar_name, sc.calendar_type,
              COUNT(spr.id) AS rule_count
       FROM sla_policies sp
       LEFT JOIN sla_calendars sc ON sc.id = sp.calendar_id
       LEFT JOIN sla_policy_rules spr ON spr.policy_id = sp.id
       GROUP BY sp.id
       ORDER BY sp.created_at DESC`
    );

    // Fetch rules for each policy
    const policyIds = policies.map(p => p.id);
    const rules = policyIds.length ? await pool.query(
      `SELECT * FROM sla_policy_rules WHERE policy_id IN (?) ORDER BY priority`,
      [policyIds]
    ).then(([r]) => r) : [];

    const ruleMap = {};
    rules.forEach(r => {
      if (!ruleMap[r.policy_id]) ruleMap[r.policy_id] = [];
      ruleMap[r.policy_id].push(r);
    });

    res.json(policies.map(p => ({ ...p, rules: ruleMap[p.id] || [] })));
  } catch (err) { next(err); }
});

// POST /api/admin/sla/policies — create policy with rules
router.post("/policies", async (req, res, next) => {
  try {
    const { name, description, calendarId, rules = [] } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });
    if (!rules.length) return res.status(400).json({ message: "At least one rule (P1–P4) is required" });

    const [result] = await pool.query(
      `INSERT INTO sla_policies (name, description, calendar_id, created_by)
       VALUES (?, ?, ?, ?)`,
      [name, description || null, calendarId || null, req.user.id]
    );
    const policyId = result.insertId;

    // Insert rules
    for (const r of rules) {
      if (!["P1","P2","P3","P4"].includes(r.priority)) continue;
      await pool.query(
        `INSERT INTO sla_policy_rules
           (policy_id, priority, label, criticality_match,
            response_mins, attendance_mins, resolution_mins,
            pause_allowed, extends_due_at, color_code)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          policyId, r.priority, r.label || r.priority,
          r.criticalityMatch || null,
          Number(r.responseMins || 30),
          Number(r.attendanceMins || 120),
          Number(r.resolutionMins || 240),
          r.pauseAllowed !== false ? 1 : 0,
          r.extendsDueAt !== false ? 1 : 0,
          r.colorCode || null,
        ]
      );
    }

    // Snapshot version 1
    const [allRules] = await pool.query(
      `SELECT * FROM sla_policy_rules WHERE policy_id = ?`, [policyId]
    );
    await pool.query(
      `INSERT INTO sla_policy_versions (policy_id, version, rules_snapshot, created_by)
       VALUES (?, 1, ?, ?)`,
      [policyId, JSON.stringify(allRules), req.user.id]
    );

    res.status(201).json({ id: policyId, message: "Policy created" });
  } catch (err) { next(err); }
});

// PUT /api/admin/sla/policies/:id — edit (auto-increment version)
router.put("/policies/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, calendarId, isActive, rules = [] } = req.body;

    await pool.query(
      `UPDATE sla_policies SET name = COALESCE(?, name), description = COALESCE(?, description),
       calendar_id = ?, is_active = COALESCE(?, is_active),
       version = version + 1, updated_at = NOW()
       WHERE id = ?`,
      [name || null, description || null, calendarId != null ? calendarId : null, isActive != null ? (isActive ? 1 : 0) : null, id]
    );

    // Update rules if provided
    if (rules.length) {
      for (const r of rules) {
        if (!["P1","P2","P3","P4"].includes(r.priority)) continue;
        await pool.query(
          `INSERT INTO sla_policy_rules
             (policy_id, priority, label, criticality_match,
              response_mins, attendance_mins, resolution_mins,
              pause_allowed, extends_due_at, color_code)
           VALUES (?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE
             label             = VALUES(label),
             criticality_match = VALUES(criticality_match),
             response_mins     = VALUES(response_mins),
             attendance_mins   = VALUES(attendance_mins),
             resolution_mins   = VALUES(resolution_mins),
             pause_allowed     = VALUES(pause_allowed),
             extends_due_at    = VALUES(extends_due_at),
             color_code        = VALUES(color_code)`,
          [
            id, r.priority, r.label || r.priority,
            r.criticalityMatch || null,
            Number(r.responseMins || 30),
            Number(r.attendanceMins || 120),
            Number(r.resolutionMins || 240),
            r.pauseAllowed !== false ? 1 : 0,
            r.extendsDueAt !== false ? 1 : 0,
            r.colorCode || null,
          ]
        );
      }
    }

    // Snapshot new version
    const [[policy]] = await pool.query(`SELECT version FROM sla_policies WHERE id = ?`, [id]);
    const [allRules] = await pool.query(`SELECT * FROM sla_policy_rules WHERE policy_id = ?`, [id]);
    await pool.query(
      `INSERT IGNORE INTO sla_policy_versions (policy_id, version, rules_snapshot, created_by)
       VALUES (?, ?, ?, ?)`,
      [id, policy.version, JSON.stringify(allRules), req.user.id]
    );

    res.json({ message: "Policy updated", version: policy.version });
  } catch (err) { next(err); }
});

// GET /api/admin/sla/policies/:id/versions
router.get("/policies/:id/versions", async (req, res, next) => {
  try {
    const [versions] = await pool.query(
      `SELECT id, policy_id, version, created_at, created_by FROM sla_policy_versions
       WHERE policy_id = ? ORDER BY version DESC`,
      [req.params.id]
    );
    res.json(versions);
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   ASSIGNMENTS
   ═══════════════════════════════════════════════════════════════════════════ */

// POST /api/admin/sla/assign
router.post("/assign", async (req, res, next) => {
  try {
    const { policyId, scopeType, scopeId, scopeRef, contractNumber, effectiveFrom, effectiveTo, notes } = req.body;
    if (!policyId || !scopeType || !effectiveFrom) {
      return res.status(400).json({ message: "policyId, scopeType, effectiveFrom are required" });
    }
    if (!["company","department","category","asset","contract"].includes(scopeType)) {
      return res.status(400).json({ message: "Invalid scopeType" });
    }

    // Deactivate existing assignment for this scope
    if (scopeId) {
      await pool.query(
        `UPDATE sla_assignments SET is_active = 0 WHERE scope_type = ? AND scope_id = ?`,
        [scopeType, scopeId]
      );
    }

    const [result] = await pool.query(
      `INSERT INTO sla_assignments
         (policy_id, scope_type, scope_id, scope_ref, contract_number,
          effective_from, effective_to, notes, assigned_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [policyId, scopeType, scopeId || null, scopeRef || null, contractNumber || null,
       effectiveFrom, effectiveTo || null, notes || null, req.user.id]
    );

    res.status(201).json({ id: result.insertId, message: "SLA assigned" });
  } catch (err) { next(err); }
});

// GET /api/admin/sla/assignments?companyId=&scopeType=
router.get("/assignments", async (req, res, next) => {
  try {
    const { companyId, scopeType } = req.query;
    let where = "WHERE sa.is_active = 1";
    const params = [];
    if (companyId) { where += " AND sa.scope_id = ?"; params.push(companyId); }
    if (scopeType) { where += " AND sa.scope_type = ?"; params.push(scopeType); }

    const [rows] = await pool.query(
      `SELECT sa.*, sp.name AS policy_name, sp.version AS policy_version
       FROM sla_assignments sa
       JOIN sla_policies sp ON sp.id = sa.policy_id
       ${where} ORDER BY sa.assigned_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   CALENDARS
   ═══════════════════════════════════════════════════════════════════════════ */

router.get("/calendars", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT sc.*, COUNT(h.id) AS holiday_count
       FROM sla_calendars sc
       LEFT JOIN sla_calendar_holidays h ON h.calendar_id = sc.id
       GROUP BY sc.id
       ORDER BY sc.name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /calendars/:id — single calendar with its holidays
router.get("/calendars/:id", async (req, res, next) => {
  try {
    const [[cal]] = await pool.query(`SELECT * FROM sla_calendars WHERE id = ?`, [req.params.id]);
    if (!cal) return res.status(404).json({ message: "Calendar not found" });
    const [holidays] = await pool.query(
      `SELECT id, DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date, name
       FROM sla_calendar_holidays WHERE calendar_id = ? ORDER BY holiday_date`,
      [req.params.id]
    );
    res.json({ ...cal, holidays });
  } catch (err) { next(err); }
});

router.post("/calendars", async (req, res, next) => {
  try {
    const { name, calendarType, bizStart, bizEnd, includeSat, includeSun } = req.body;
    if (!name) return res.status(400).json({ message: "name is required" });
    const [r] = await pool.query(
      `INSERT INTO sla_calendars (name, calendar_type, biz_start, biz_end, include_sat, include_sun, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [name, calendarType || "24x7", bizStart || null, bizEnd || null,
       includeSat ? 1 : 0, includeSun ? 1 : 0, req.user.id]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { next(err); }
});

// PUT /calendars/:id — update calendar settings
router.put("/calendars/:id", async (req, res, next) => {
  try {
    const { name, calendarType, bizStart, bizEnd, includeSat, includeSun } = req.body;
    await pool.query(
      `UPDATE sla_calendars SET
         name = COALESCE(?, name),
         calendar_type = COALESCE(?, calendar_type),
         biz_start = ?, biz_end = ?,
         include_sat = COALESCE(?, include_sat),
         include_sun = COALESCE(?, include_sun)
       WHERE id = ?`,
      [name || null, calendarType || null, bizStart || null, bizEnd || null,
       includeSat != null ? (includeSat ? 1 : 0) : null,
       includeSun != null ? (includeSun ? 1 : 0) : null,
       req.params.id]
    );
    res.json({ message: "Calendar updated" });
  } catch (err) { next(err); }
});

// DELETE /calendars/:id
router.delete("/calendars/:id", async (req, res, next) => {
  try {
    // Guard: don't delete a calendar still attached to a policy
    const [[inUse]] = await pool.query(
      `SELECT COUNT(*) AS n FROM sla_policies WHERE calendar_id = ?`, [req.params.id]
    );
    if (inUse.n > 0) return res.status(409).json({ message: `Calendar is used by ${inUse.n} policy(ies)` });
    await pool.query(`DELETE FROM sla_calendar_holidays WHERE calendar_id = ?`, [req.params.id]);
    await pool.query(`DELETE FROM sla_calendars WHERE id = ?`, [req.params.id]);
    res.json({ message: "Calendar deleted" });
  } catch (err) { next(err); }
});

// POST /calendars/:id/holidays — add a public holiday
router.post("/calendars/:id/holidays", async (req, res, next) => {
  try {
    const { holidayDate, name } = req.body;
    if (!holidayDate) return res.status(400).json({ message: "holidayDate is required" });
    const [r] = await pool.query(
      `INSERT INTO sla_calendar_holidays (calendar_id, holiday_date, name) VALUES (?,?,?)`,
      [req.params.id, holidayDate, name || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { next(err); }
});

// DELETE /calendars/:id/holidays/:holidayId
router.delete("/calendars/:id/holidays/:holidayId", async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM sla_calendar_holidays WHERE id = ? AND calendar_id = ?`,
      [req.params.holidayId, req.params.id]
    );
    res.json({ message: "Holiday removed" });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   BREACH REASONS
   ═══════════════════════════════════════════════════════════════════════════ */

router.get("/breach-reasons", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM sla_breach_reasons ORDER BY label`);
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/breach-reasons", async (req, res, next) => {
  try {
    const { code, label, isPauseReason, excludesFromSla, responsibility } = req.body;
    if (!code || !label) return res.status(400).json({ message: "code and label are required" });
    const [r] = await pool.query(
      `INSERT INTO sla_breach_reasons (code, label, is_pause_reason, excludes_from_sla, responsibility)
       VALUES (?,?,?,?,?)`,
      [code, label, isPauseReason ? 1 : 0, excludesFromSla ? 1 : 0, responsibility || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   ELIGIBILITY RULES
   ═══════════════════════════════════════════════════════════════════════════ */

// GET /api/admin/sla/eligibility-rules?companyId=
router.get("/eligibility-rules", async (req, res, next) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ message: "companyId required" });
    const [rows] = await pool.query(
      `SELECT * FROM sla_eligibility_rules WHERE company_id = ?`, [companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/admin/sla/eligibility-rules — upsert rules for a company
router.post("/eligibility-rules", async (req, res, next) => {
  try {
    const { companyId, excludeTypes = [] } = req.body;
    if (!companyId) return res.status(400).json({ message: "companyId required" });

    const VALID = ["test","duplicate","cancelled","pm_ticket","warranty_oem","training","planned_maintenance","non_contract_asset"];
    for (const t of excludeTypes) {
      if (!VALID.includes(t)) return res.status(400).json({ message: `Invalid type: ${t}` });
      await pool.query(
        `INSERT INTO sla_eligibility_rules (company_id, exclude_type, is_excluded)
         VALUES (?,?,1) ON DUPLICATE KEY UPDATE is_excluded = 1`,
        [companyId, t]
      );
    }
    // Remove types not in the new list
    if (excludeTypes.length) {
      await pool.query(
        `UPDATE sla_eligibility_rules SET is_excluded = 0
         WHERE company_id = ? AND exclude_type NOT IN (?)`,
        [companyId, excludeTypes]
      );
    } else {
      await pool.query(`UPDATE sla_eligibility_rules SET is_excluded = 0 WHERE company_id = ?`, [companyId]);
    }

    res.json({ message: "Eligibility rules saved" });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   COMPANY-LEVEL SLA SCORES  (used by Client Portal dashboard)
   ═══════════════════════════════════════════════════════════════════════════ */

// GET /api/admin/sla/company-scores — SLA compliance % per company
router.get("/company-scores", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         co.id AS companyId, co.company_name AS companyName, co.company_code AS companyCode,
         co.status,
         -- policy assigned (company-scope only for now)
         sa.policy_id AS policyId, sp.name AS policyName,
         -- response SLA
         COUNT(DISTINCT CASE WHEN rc.status IN ('met','breached') THEN ts.id END)    AS respEvaluated,
         COUNT(DISTINCT CASE WHEN rc.status = 'met'              THEN ts.id END)     AS respMet,
         -- attendance SLA
         COUNT(DISTINCT CASE WHEN ac.status IN ('met','breached') THEN ts.id END)    AS attEvaluated,
         COUNT(DISTINCT CASE WHEN ac.status = 'met'              THEN ts.id END)     AS attMet,
         -- resolution SLA
         COUNT(DISTINCT CASE WHEN esc.status IN ('met','breached') THEN ts.id END)   AS resEvaluated,
         COUNT(DISTINCT CASE WHEN esc.status = 'met'              THEN ts.id END)    AS resMet,
         -- overall (all 3 clocks met)
         COUNT(DISTINCT CASE WHEN rc.status='met' AND ac.status='met' AND esc.status='met' THEN ts.id END) AS overallMet,
         -- totals
         COUNT(DISTINCT ts.id)                                                        AS totalTickets,
         COUNT(DISTINCT CASE WHEN aq.status NOT IN ('resolved','closed') THEN ts.id END) AS activeTickets,
         ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins END)/60,1) AS mttrHours
       FROM companies co
       LEFT JOIN sla_assignments sa ON sa.scope_type = 'company' AND sa.scope_id = co.id AND sa.is_active = 1
       LEFT JOIN sla_policies sp ON sp.id = sa.policy_id
       LEFT JOIN ticket_sla ts ON ts.snapshot_company_id = co.id AND ts.is_sla_eligible = 1
       LEFT JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id  = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id  = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       GROUP BY co.id, co.company_name, co.company_code, co.status, sa.policy_id, sp.name
       ORDER BY co.company_name`
    );

    const pct = (met, total) => total > 0 ? +((met / total) * 100).toFixed(1) : null;

    res.json(rows.map(r => ({
      companyId:   Number(r.companyId),
      companyName: r.companyName,
      companyCode: r.companyCode,
      status:      r.status,
      policyId:    r.policyId   ? Number(r.policyId)  : null,
      policyName:  r.policyName || null,
      totalTickets:  Number(r.totalTickets  || 0),
      activeTickets: Number(r.activeTickets || 0),
      mttrHours:     r.mttrHours != null ? Number(r.mttrHours) : null,
      responseSla:   { evaluated: Number(r.respEvaluated||0), met: Number(r.respMet||0), pct: pct(r.respMet, r.respEvaluated) },
      attendanceSla: { evaluated: Number(r.attEvaluated ||0), met: Number(r.attMet ||0), pct: pct(r.attMet,  r.attEvaluated)  },
      resolutionSla: { evaluated: Number(r.resEvaluated ||0), met: Number(r.resMet ||0), pct: pct(r.resMet,  r.resEvaluated)  },
      overallSla:    { met: Number(r.overallMet||0), pct: pct(r.overallMet, r.resEvaluated) },
    })));
  } catch (err) { next(err); }
});

// GET /api/admin/sla/company-scores/:companyId
router.get("/company-scores/:companyId", async (req, res, next) => {
  try {
    const [all] = await pool.query(
      `/* same query as above but filtered */
       SELECT
         co.id AS companyId, co.company_name AS companyName, co.company_code AS companyCode,
         sa.policy_id AS policyId, sp.name AS policyName,
         COUNT(DISTINCT CASE WHEN rc.status IN ('met','breached') THEN ts.id END)    AS respEvaluated,
         COUNT(DISTINCT CASE WHEN rc.status = 'met'              THEN ts.id END)     AS respMet,
         COUNT(DISTINCT CASE WHEN ac.status IN ('met','breached') THEN ts.id END)    AS attEvaluated,
         COUNT(DISTINCT CASE WHEN ac.status = 'met'              THEN ts.id END)     AS attMet,
         COUNT(DISTINCT CASE WHEN esc.status IN ('met','breached') THEN ts.id END)   AS resEvaluated,
         COUNT(DISTINCT CASE WHEN esc.status = 'met'              THEN ts.id END)    AS resMet,
         COUNT(DISTINCT CASE WHEN rc.status='met' AND ac.status='met' AND esc.status='met' THEN ts.id END) AS overallMet,
         COUNT(DISTINCT ts.id) AS totalTickets,
         ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins END)/60,1) AS mttrHours
       FROM companies co
       LEFT JOIN sla_assignments sa ON sa.scope_type = 'company' AND sa.scope_id = co.id AND sa.is_active = 1
       LEFT JOIN sla_policies sp ON sp.id = sa.policy_id
       LEFT JOIN ticket_sla ts ON ts.snapshot_company_id = co.id AND ts.is_sla_eligible = 1
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id  = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id  = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       WHERE co.id = ?
       GROUP BY co.id, co.company_name, co.company_code, sa.policy_id, sp.name`,
      [Number(req.params.companyId)]
    );
    if (!all.length) return res.status(404).json({ message: "Company not found" });
    const r = all[0];
    const pct = (met, total) => total > 0 ? +((met / total) * 100).toFixed(1) : null;
    res.json({
      companyId:    Number(r.companyId), companyName: r.companyName, companyCode: r.companyCode,
      policyId:     r.policyId ? Number(r.policyId) : null, policyName: r.policyName || null,
      totalTickets: Number(r.totalTickets || 0), mttrHours: r.mttrHours != null ? Number(r.mttrHours) : null,
      responseSla:   { evaluated: Number(r.respEvaluated||0), met: Number(r.respMet||0), pct: pct(r.respMet, r.respEvaluated) },
      attendanceSla: { evaluated: Number(r.attEvaluated ||0), met: Number(r.attMet ||0), pct: pct(r.attMet,  r.attEvaluated)  },
      resolutionSla: { evaluated: Number(r.resEvaluated ||0), met: Number(r.resMet ||0), pct: pct(r.resMet,  r.resEvaluated)  },
      overallSla:    { met: Number(r.overallMet||0), pct: pct(r.overallMet, r.resEvaluated) },
    });
  } catch (err) { next(err); }
});

// PATCH /api/admin/sla/company-policy/:companyId — assign/change company-level SLA policy
router.patch("/company-policy/:companyId", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const { policyId } = req.body;

    // Always deactivate any existing company-scope assignment first so the
    // engine's resolvePolicy() (which reads scope_type='company' AND scope_id,
    // is_active=1, LIMIT 1) resolves a single active policy per hospital.
    await pool.query(
      `UPDATE sla_assignments SET is_active = 0 WHERE scope_type = 'company' AND scope_id = ?`,
      [companyId]
    );

    if (!policyId) {
      return res.json({ message: "SLA policy removed from company" });
    }

    // Verify policy exists and is active
    const [[pol]] = await pool.query(`SELECT id, name FROM sla_policies WHERE id = ? AND is_active = 1`, [Number(policyId)]);
    if (!pol) return res.status(404).json({ message: "SLA policy not found" });

    await pool.query(
      `INSERT INTO sla_assignments
         (policy_id, scope_type, scope_id, effective_from, is_active, assigned_by)
       VALUES (?, 'company', ?, CURDATE(), 1, ?)`,
      [Number(policyId), companyId, req.user?.id || null]
    );

    res.json({ message: "SLA policy assigned", companyId, policyId: Number(policyId), policyName: pol.name });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN: COMPANY SLA PERFORMANCE DASHBOARD
   Prefix: /api/admin/sla/performance/company/:companyId/…
   Mirrors companySla.js endpoints but accessible with admin JWT.
   ═══════════════════════════════════════════════════════════════════════════ */

const pctFn = (met, total) => total > 0 ? +((met / total) * 100).toFixed(1) : null;

// GET /performance/breach-reasons — global catalogue (no companyId needed)
router.get("/performance/breach-reasons", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, label, is_pause_reason, responsibility FROM sla_breach_reasons WHERE is_active = 1 ORDER BY label`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/dashboard
router.get("/performance/company/:companyId/dashboard", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const { dateFrom, dateTo, priority } = req.query;

    let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1";
    const params = [companyId];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    if (priority && ["P1","P2","P3","P4"].includes(priority)) { where += " AND ts.priority = ?"; params.push(priority); }

    const [[stats]] = await pool.query(
      `SELECT
         COUNT(DISTINCT ts.id) AS total_tickets,

         -- ── Response SLA ───────────────────────────────────────────────────────
         COUNT(DISTINCT CASE WHEN rc.status IN ('met','breached')
           OR (rc.status IN ('running','paused') AND aq.status IN ('resolved','closed'))
           THEN ts.id END) AS resp_evaluated,

         COUNT(DISTINCT CASE WHEN rc.status = 'met'
           OR (rc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
               AND COALESCE(aq.assigned_at, aq.in_progress_at, aq.resolved_at) IS NOT NULL
               AND COALESCE(aq.assigned_at, aq.in_progress_at, aq.resolved_at)
                   <= COALESCE(rc.adjusted_due_at, rc.due_at))
           THEN ts.id END) AS resp_met,

         COUNT(DISTINCT CASE WHEN rc.status = 'breached'
           OR (rc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
               AND COALESCE(aq.assigned_at, aq.in_progress_at) IS NULL
               AND (aq.resolved_at IS NULL
                    OR aq.resolved_at > COALESCE(rc.adjusted_due_at, rc.due_at)))
           THEN ts.id END) AS resp_breached,

         -- ── Attendance SLA ─────────────────────────────────────────────────────
         COUNT(DISTINCT CASE WHEN ac.status IN ('met','breached')
           OR (ac.status IN ('running','paused') AND aq.status IN ('resolved','closed')
               AND (aq.in_progress_at IS NOT NULL
                    OR aq.resolved_at <= COALESCE(ac.adjusted_due_at, ac.due_at)))
           THEN ts.id END) AS att_evaluated,

         COUNT(DISTINCT CASE WHEN ac.status = 'met'
           OR (ac.status IN ('running','paused') AND aq.status IN ('resolved','closed')
               AND (
                 (aq.in_progress_at IS NOT NULL
                  AND aq.in_progress_at <= COALESCE(ac.adjusted_due_at, ac.due_at))
                 OR (aq.in_progress_at IS NULL AND aq.resolved_at IS NOT NULL
                     AND aq.resolved_at <= COALESCE(ac.adjusted_due_at, ac.due_at))
               ))
           THEN ts.id END) AS att_met,

         COUNT(DISTINCT CASE WHEN ac.status = 'breached'
           OR (ac.status IN ('running','paused') AND aq.status IN ('resolved','closed')
               AND aq.in_progress_at IS NOT NULL
               AND aq.in_progress_at > COALESCE(ac.adjusted_due_at, ac.due_at))
           THEN ts.id END) AS att_breached,

         -- ── Resolution SLA ─────────────────────────────────────────────────────
         COUNT(DISTINCT CASE WHEN esc.status IN ('met','breached')
           OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed'))
           THEN ts.id END) AS res_evaluated,

         COUNT(DISTINCT CASE WHEN esc.status = 'met'
           OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
               AND aq.resolved_at IS NOT NULL
               AND aq.resolved_at <= COALESCE(esc.adjusted_due_at, esc.due_at))
           THEN ts.id END) AS res_met,

         COUNT(DISTINCT CASE WHEN esc.status = 'breached'
           OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
               AND (aq.resolved_at IS NULL
                    OR aq.resolved_at > COALESCE(esc.adjusted_due_at, esc.due_at)))
           THEN ts.id END) AS res_breached,

         -- ── Overall (ticket-level: all clocks met) ─────────────────────────────
         COUNT(DISTINCT CASE
           WHEN
             (rc.status = 'met'
              OR (rc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                  AND COALESCE(aq.assigned_at, aq.in_progress_at, aq.resolved_at) IS NOT NULL
                  AND COALESCE(aq.assigned_at, aq.in_progress_at, aq.resolved_at)
                      <= COALESCE(rc.adjusted_due_at, rc.due_at)))
             AND (ac.status = 'met'
                  OR (ac.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                      AND (aq.in_progress_at IS NULL
                           OR aq.in_progress_at <= COALESCE(ac.adjusted_due_at, ac.due_at))))
             AND (esc.status = 'met'
                  OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                      AND aq.resolved_at IS NOT NULL
                      AND aq.resolved_at <= COALESCE(esc.adjusted_due_at, esc.due_at)))
           THEN ts.id END) AS overall_met,

         COUNT(DISTINCT CASE
           WHEN esc.status = 'met'
             OR (esc.status IN ('running','paused') AND aq.status NOT IN ('resolved','closed')
                 AND COALESCE(esc.adjusted_due_at, esc.due_at) >= NOW())
             OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                 AND aq.resolved_at IS NOT NULL
                 AND aq.resolved_at <= COALESCE(esc.adjusted_due_at, esc.due_at))
           THEN ts.id END) AS sla_compliant_rt,

         COUNT(DISTINCT CASE
           WHEN esc.status = 'breached'
             OR (esc.status = 'running' AND aq.status NOT IN ('resolved','closed')
                 AND COALESCE(esc.adjusted_due_at, esc.due_at) < NOW())
             OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                 AND (aq.resolved_at IS NULL
                      OR aq.resolved_at > COALESCE(esc.adjusted_due_at, esc.due_at)))
           THEN ts.id END) AS sla_breached_rt,

         COUNT(DISTINCT CASE
           WHEN esc.status = 'running' AND aq.status NOT IN ('resolved','closed')
             AND COALESCE(esc.adjusted_due_at, esc.due_at)
                 BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 120 MINUTE)
           THEN ts.id END) AS sla_at_risk,

         ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins END)/60,1) AS mttr_hours,
         COUNT(DISTINCT CASE WHEN aq.status NOT IN ('resolved','closed') THEN ts.id END) AS active_tickets

       FROM ticket_sla ts
       JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id  = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id  = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       ${where}`,
      params
    );

    const totalTickets = Number(stats.total_tickets || 0);
    // slaCompliant = tickets where ALL 3 clocks (response+attendance+resolution) were met
    const slaCompliant = Number(stats.overall_met     || 0);
    const slaBreached  = Number(stats.sla_breached_rt || 0);
    const slaAtRisk    = Number(stats.sla_at_risk     || 0);
    // SLA Compliance % = (calls completed within SLA ÷ total eligible calls) × 100
    const slaScore     = totalTickets > 0 ? +((slaCompliant / totalTickets) * 100).toFixed(1) : null;

    const fmtDate = (d) => d.toISOString().slice(0, 10);
    const now = new Date();
    const monthStart = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd   = fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

    let pmCompliance = null, pmDue = 0, pmCompleted = 0, pmOverdue = 0;
    try {
      const [[pm]] = await pool.query(
        `SELECT COUNT(*) AS pm_due, SUM(status='completed') AS pm_completed,
                SUM(maintenance_date < CURDATE() AND status NOT IN ('completed','cancelled')) AS pm_overdue
         FROM pms_schedules WHERE company_id = ? AND maintenance_date BETWEEN ? AND ?`,
        [companyId, monthStart, monthEnd]
      );
      pmDue = Number(pm.pm_due || 0); pmCompleted = Number(pm.pm_completed || 0);
      pmOverdue = Number(pm.pm_overdue || 0);
      pmCompliance = pmDue > 0 ? +((pmCompleted / pmDue) * 100).toFixed(1) : null;
    } catch { /* pms table may not exist */ }

    let repeatBreakdown = null, assetsWithBreakdown = 0, assetsRepeat = 0;
    try {
      const [[rb]] = await pool.query(
        `SELECT COUNT(*) AS assets_with_breakdown, SUM(cnt > 1) AS assets_repeat
         FROM (SELECT aq.asset_id, COUNT(*) AS cnt FROM asset_queries aq
               WHERE aq.company_id = ? AND aq.asset_id IS NOT NULL GROUP BY aq.asset_id) t`,
        [companyId]
      );
      assetsWithBreakdown = Number(rb.assets_with_breakdown || 0);
      assetsRepeat        = Number(rb.assets_repeat         || 0);
      repeatBreakdown = assetsWithBreakdown > 0 ? +((assetsRepeat / assetsWithBreakdown) * 100).toFixed(1) : null;
    } catch { /* ignore */ }

    // ── MTTR (SLA Dashboard: average of per-asset MTTRs) ─────────────────────
    let mttrHours = null;
    try {
      const [[mttrRow]] = await pool.query(
        `SELECT ROUND(AVG(asset_avg) / 60, 1) AS mttr_hours
         FROM (
           SELECT ts.snapshot_asset_id, AVG(esc.actual_mins) AS asset_avg
           FROM ticket_sla ts
           JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id
             AND esc.clock_type = 'resolution' AND esc.status IN ('met','breached')
           ${where}
           GROUP BY ts.snapshot_asset_id
         ) t`,
        params
      );
      mttrHours = mttrRow?.mttr_hours != null ? Number(mttrRow.mttr_hours) : null;
    } catch { /* null fallback */ }

    let mtbfHours = null;
    try {
      const [[ac]] = await pool.query(`SELECT COUNT(*) AS asset_count FROM assets WHERE company_id = ?`, [companyId]);
      const [[fc]] = await pool.query(
        `SELECT COUNT(*) AS failures FROM asset_queries WHERE company_id = ? AND created_at BETWEEN ? AND ?`,
        [companyId, monthStart + " 00:00:00", monthEnd + " 23:59:59"]
      );
      const assetCount = Number(ac.asset_count || 0);
      const failures   = Number(fc.failures    || 0);
      const elapsedHrs = Math.max(1, (now - new Date(now.getFullYear(), now.getMonth(), 1)) / 3_600_000);
      if (assetCount > 0 && failures > 0) mtbfHours = Math.round((assetCount * elapsedHrs) / failures);
    } catch { /* ignore */ }

    res.json({
      totalTickets, activeTickets: Number(stats.active_tickets || 0),
      slaScore, slaCompliant, slaBreached, slaAtRisk,
      responseSla: { evaluated: Number(stats.resp_evaluated||0), met: Number(stats.resp_met||0), breached: Number(stats.resp_breached||0), pct: pctFn(Number(stats.resp_met||0), Number(stats.resp_evaluated||0)) },
      attendanceSla: { evaluated: Number(stats.att_evaluated||0), met: Number(stats.att_met||0), breached: Number(stats.att_breached||0), pct: pctFn(Number(stats.att_met||0), Number(stats.att_evaluated||0)) },
      resolutionSla: { evaluated: Number(stats.res_evaluated||0), met: Number(stats.res_met||0), breached: Number(stats.res_breached||0), pct: pctFn(Number(stats.res_met||0), Number(stats.res_evaluated||0)) },
      overallMet: Number(stats.overall_met||0),
      mttrHours,
      pmCompliance, pmDue, pmCompleted, pmOverdue,
      repeatBreakdown, assetsWithBreakdown, assetsRepeat, mtbfHours,
    });
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/at-risk
router.get("/performance/company/:companyId/at-risk", async (req, res, next) => {
  try {
    const companyId  = Number(req.params.companyId);
    const windowMins = Math.min(Number(req.query.windowMins || 60), 480);
    const [rows] = await pool.query(
      `SELECT aq.id AS queryId, aq.status, ts.priority,
              ts.snapshot_asset_name AS assetName, ts.snapshot_dept_name AS deptName,
              c.clock_type AS clockType, c.status AS clockStatus,
              COALESCE(c.adjusted_due_at, c.due_at) AS dueAt, c.target_mins AS targetMins,
              TIMESTAMPDIFF(MINUTE, NOW(), COALESCE(c.adjusted_due_at, c.due_at)) AS minsRemaining
       FROM ticket_sla ts
       JOIN asset_queries aq ON aq.id = ts.query_id
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1
         AND c.status = 'running' AND aq.status NOT IN ('resolved','closed')
         AND COALESCE(c.adjusted_due_at, c.due_at) BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? MINUTE)
       ORDER BY dueAt ASC LIMIT 50`,
      [companyId, windowMins]
    );
    res.json(rows.map(r => ({ ...r, risk: r.minsRemaining <= 0 ? "breached" : r.minsRemaining <= 30 ? "critical" : "warning" })));
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/trend
router.get("/performance/company/:companyId/trend", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const months = Math.min(Number(req.query.months || 6), 24);
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(ts.sla_start_time,'%Y-%m') AS month, c.clock_type,
              COUNT(*) AS evaluated,
              SUM(CASE WHEN c.status='met' THEN 1 ELSE 0 END) AS met,
              SUM(CASE WHEN c.status='breached' THEN 1 ELSE 0 END) AS breached
       FROM ticket_sla ts JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1
         AND c.status IN ('met','breached')
         AND ts.sla_start_time >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month, c.clock_type ORDER BY month ASC, c.clock_type ASC`,
      [companyId, months]
    );
    const pivot = {};
    rows.forEach(r => {
      if (!pivot[r.month]) pivot[r.month] = { month: r.month };
      const pct = r.evaluated > 0 ? +((r.met / r.evaluated) * 100).toFixed(1) : null;
      pivot[r.month][r.clock_type + "Pct"] = pct;
      pivot[r.month][r.clock_type + "Met"] = Number(r.met);
      pivot[r.month][r.clock_type + "Total"] = Number(r.evaluated);
    });
    res.json(Object.values(pivot));
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/by-engineer
router.get("/performance/company/:companyId/by-engineer", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const { dateFrom, dateTo } = req.query;
    let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1";
    const params = [companyId];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    const [rows] = await pool.query(
      `SELECT cu.id AS engineerId, cu.full_name AS engineerName,
              COUNT(DISTINCT ts.id) AS totalCalls,
              COUNT(DISTINCT CASE WHEN aq.status IN ('resolved','closed') THEN ts.id END) AS resolvedCount,
              COUNT(DISTINCT CASE WHEN rc.status='met' THEN ts.id END) AS responseMet,
              COUNT(DISTINCT CASE WHEN rc.status IN ('met','breached') THEN ts.id END) AS respEvaluated,
              COUNT(DISTINCT CASE WHEN
                esc.status = 'met' OR
                (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND
                 COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(esc.adjusted_due_at, esc.due_at))
              THEN ts.id END) AS resMet,
              COUNT(DISTINCT CASE WHEN
                esc.status IN ('met','breached') OR
                (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed'))
              THEN ts.id END) AS resEvaluated,
              COUNT(DISTINCT CASE WHEN
                esc.status = 'met' OR
                (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND
                 COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(esc.adjusted_due_at, esc.due_at))
              THEN ts.id END) AS overallMet,
              COUNT(DISTINCT CASE WHEN
                rc.status = 'breached' OR ac.status = 'breached' OR esc.status = 'breached' OR
                (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND
                 COALESCE(aq.resolved_at, aq.updated_at) > COALESCE(esc.adjusted_due_at, esc.due_at))
              THEN ts.id END) AS breachedCount,
              ROUND(AVG(
                CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins
                     WHEN esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                     THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, COALESCE(aq.resolved_at, aq.updated_at))
                     ELSE NULL END
              ), 1) AS avgMttrMins,
              MAX(ts.sla_start_time) AS lastTicketAt
       FROM ticket_sla ts
       JOIN asset_queries aq ON aq.id = ts.query_id
       JOIN company_users cu ON cu.id = aq.assigned_to
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       ${where} GROUP BY cu.id, cu.full_name ORDER BY totalCalls DESC`,
      params
    );
    res.json(rows.map(r => ({
      ...r,
      overallPct:  r.resEvaluated  > 0 ? +((r.overallMet  / r.resEvaluated)  * 100).toFixed(1) : null,
      responsePct: r.respEvaluated > 0 ? +((r.responseMet / r.respEvaluated) * 100).toFixed(1) : null,
      resPct:      r.resEvaluated  > 0 ? +((r.resMet      / r.resEvaluated)  * 100).toFixed(1) : null,
    })));
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/tile-records
router.get("/performance/company/:companyId/tile-records", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const tile  = req.query.tile || "overall";
    const page  = Math.max(1, Number(req.query.page  || 1));
    const lim   = Math.min(Number(req.query.limit || 20), 100);
    const off   = (page - 1) * lim;
    const { dateFrom, dateTo } = req.query;

    let baseWhere = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1";
    const baseParams = [companyId];
    if (dateFrom) { baseWhere += " AND ts.sla_start_time >= ?"; baseParams.push(dateFrom); }
    if (dateTo)   { baseWhere += " AND ts.sla_start_time <= ?"; baseParams.push(dateTo + " 23:59:59"); }

    if (tile === "mttr") {
      const [rows] = await pool.query(
        `SELECT aq.asset_id AS assetId, COALESCE(a.generated_asset_id, a.asset_unique_id) AS assetUniqueId,
                COALESCE(a.asset_name, ts.snapshot_asset_name) AS assetName,
                ts.snapshot_dept_name AS deptName,
                COUNT(DISTINCT ts.id) AS totalCalls,
                SUM(CASE WHEN esc.status='breached' OR
                         (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND
                          COALESCE(aq.resolved_at, aq.updated_at) > COALESCE(esc.adjusted_due_at, esc.due_at))
                    THEN 1 ELSE 0 END) AS totalBreaches,
                ROUND(AVG(
                  CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins
                       WHEN esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                       THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, COALESCE(aq.resolved_at, aq.updated_at))
                       ELSE NULL END
                ), 1) AS avgMttrMins
         FROM ticket_sla ts
         LEFT JOIN asset_queries aq ON aq.id = ts.query_id
         LEFT JOIN assets a ON a.id = aq.asset_id
         LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
         ${baseWhere}
         GROUP BY aq.asset_id, a.asset_unique_id, a.asset_name, ts.snapshot_asset_name, ts.snapshot_dept_name
         HAVING AVG(CASE WHEN esc.status IN ('met','breached') OR aq.status IN ('resolved','closed') THEN esc.actual_mins END) IS NOT NULL
            OR SUM(CASE WHEN aq.status IN ('resolved','closed') THEN 1 ELSE 0 END) > 0
         ORDER BY avgMttrMins DESC LIMIT ? OFFSET ?`,
        [...baseParams, lim, off]
      );
      return res.json({ rows, total: rows.length, page, pages: 1 });
    }

    if (tile === "repeat") {
      const [rows] = await pool.query(
        `SELECT aq.asset_id AS assetId, COALESCE(a.generated_asset_id, a.asset_unique_id) AS assetUniqueId,
                COALESCE(a.asset_name, ts.snapshot_asset_name) AS assetName,
                ts.snapshot_dept_name AS deptName,
                COUNT(DISTINCT ts.id) AS totalBreakdowns,
                ROUND(AVG(
                  CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins
                       WHEN esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                       THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, COALESCE(aq.resolved_at, aq.updated_at))
                       ELSE NULL END
                ), 1) AS avgMttrMins
         FROM ticket_sla ts
         LEFT JOIN asset_queries aq ON aq.id = ts.query_id
         LEFT JOIN assets a ON a.id = aq.asset_id
         LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
         ${baseWhere}
         GROUP BY aq.asset_id, a.asset_unique_id, a.asset_name, ts.snapshot_asset_name, ts.snapshot_dept_name
         HAVING COUNT(DISTINCT ts.id) > 1
         ORDER BY totalBreakdowns DESC LIMIT ? OFFSET ?`,
        [...baseParams, lim, off]
      );
      return res.json({ rows, total: rows.length, page, pages: 1 });
    }

    const clockType = ["response","attendance","resolution"].includes(tile) ? tile : null;

    if (clockType) {
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(DISTINCT ts.id) AS total
         FROM ticket_sla ts
         JOIN ticket_sla_clocks tsc ON tsc.ticket_sla_id = ts.id AND tsc.clock_type = ?
         ${baseWhere}`,
        [clockType, ...baseParams]
      );
      const [rows] = await pool.query(
        `SELECT ts.query_id AS queryId, aq.asset_id AS assetId,
                COALESCE(a.generated_asset_id, a.asset_unique_id) AS assetUniqueId,
                COALESCE(a.asset_name, ts.snapshot_asset_name) AS assetName,
                ts.snapshot_dept_name AS deptName, cu.full_name AS engineerName,
                ts.priority, aq.status, ts.sla_start_time AS createdAt,
                tsc.clock_type AS clockType,
                CASE
                  WHEN tsc.status IN ('met','breached') THEN tsc.status
                  WHEN tsc.status IN ('running','paused') THEN
                    CASE tsc.clock_type
                      WHEN 'resolution' THEN
                        CASE WHEN aq.status IN ('resolved','closed') THEN
                          CASE WHEN COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(tsc.adjusted_due_at, tsc.due_at) THEN 'met' ELSE 'breached' END
                        ELSE 'running' END
                      WHEN 'attendance' THEN
                        CASE WHEN aq.in_progress_at IS NOT NULL THEN
                          CASE WHEN aq.in_progress_at <= COALESCE(tsc.adjusted_due_at, tsc.due_at) THEN 'met' ELSE 'breached' END
                        ELSE 'running' END
                      WHEN 'response' THEN
                        CASE WHEN aq.assigned_at IS NOT NULL THEN
                          CASE WHEN aq.assigned_at <= COALESCE(tsc.adjusted_due_at, tsc.due_at) THEN 'met' ELSE 'breached' END
                        ELSE 'running' END
                      ELSE 'running'
                    END
                  ELSE tsc.status
                END AS clockStatus,
                tsc.target_mins AS targetMins,
                COALESCE(tsc.actual_mins,
                  CASE
                    WHEN tsc.clock_type = 'resolution' AND aq.status IN ('resolved','closed')
                    THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, COALESCE(aq.resolved_at, aq.updated_at))
                    WHEN tsc.clock_type = 'attendance' AND aq.in_progress_at IS NOT NULL
                    THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, aq.in_progress_at)
                    ELSE NULL
                  END) AS actualMins,
                tsc.breach_mins AS breachMins,
                COALESCE(tsc.adjusted_due_at, tsc.due_at) AS dueAt
         FROM ticket_sla ts
         JOIN ticket_sla_clocks tsc ON tsc.ticket_sla_id = ts.id AND tsc.clock_type = ?
         LEFT JOIN asset_queries aq ON aq.id = ts.query_id
         LEFT JOIN assets a ON a.id = aq.asset_id
         LEFT JOIN company_users cu ON cu.id = aq.assigned_to
         ${baseWhere}
         ORDER BY ts.sla_start_time DESC LIMIT ? OFFSET ?`,
        [clockType, ...baseParams, lim, off]
      );
      return res.json({ rows, total: Number(total), page, pages: Math.ceil(Number(total) / lim) });
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(DISTINCT ts.id) AS total FROM ticket_sla ts ${baseWhere}`, baseParams
    );
    const [rows] = await pool.query(
      `SELECT ts.query_id AS queryId, aq.asset_id AS assetId,
              COALESCE(a.generated_asset_id, a.asset_unique_id) AS assetUniqueId,
              COALESCE(a.asset_name, ts.snapshot_asset_name) AS assetName,
              ts.snapshot_dept_name AS deptName, cu.full_name AS engineerName,
              ts.priority, aq.status, ts.sla_start_time AS createdAt,
              CASE
                WHEN esc.status = 'met' OR
                     (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND
                      COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(esc.adjusted_due_at, esc.due_at))
                THEN 'met'
                WHEN esc.status = 'breached' OR rc.status = 'breached' OR ac.status = 'breached' OR
                     (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND
                      COALESCE(aq.resolved_at, aq.updated_at) > COALESCE(esc.adjusted_due_at, esc.due_at))
                THEN 'breached'
                ELSE COALESCE(esc.status, 'running')
              END AS clockStatus,
              esc.target_mins AS targetMins,
              COALESCE(esc.actual_mins,
                CASE WHEN aq.status IN ('resolved','closed')
                THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, COALESCE(aq.resolved_at, aq.updated_at))
                ELSE NULL END) AS actualMins,
              esc.breach_mins AS breachMins,
              COALESCE(esc.adjusted_due_at, esc.due_at) AS dueAt
       FROM ticket_sla ts
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id  = ts.id AND rc.clock_type  = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id  = ts.id AND ac.clock_type  = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       LEFT JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN assets a ON a.id = aq.asset_id
       LEFT JOIN company_users cu ON cu.id = aq.assigned_to
       ${baseWhere}
       ORDER BY ts.sla_start_time DESC LIMIT ? OFFSET ?`,
      [...baseParams, lim, off]
    );
    return res.json({ rows, total: Number(total), page, pages: Math.ceil(Number(total) / lim) });
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/by-department
router.get("/performance/company/:companyId/by-department", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const { dateFrom, dateTo, serviceType } = req.query;
    let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1";
    const params = [companyId];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    if (serviceType && serviceType !== "all") { where += " AND ts.service_type = ?"; params.push(serviceType); }
    const [rows] = await pool.query(
      `SELECT ts.snapshot_department_id AS deptId, ts.snapshot_dept_name AS deptName,
              COUNT(DISTINCT ts.id) AS totalCalls,
              COUNT(DISTINCT CASE WHEN
                (rc.status='met'  OR (rc.status  IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(rc.adjusted_due_at,  rc.due_at)))
                AND
                (ac.status='met'  OR (ac.status  IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.engineer_attended_at, aq.resolved_at, aq.updated_at) <= COALESCE(ac.adjusted_due_at, ac.due_at)))
                AND
                (esc.status='met' OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(esc.adjusted_due_at, esc.due_at)))
              THEN ts.id END) AS overallMet,
              COUNT(DISTINCT CASE WHEN
                esc.status IN ('met','breached') OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed'))
              THEN ts.id END) AS resEvaluated,
              COUNT(DISTINCT CASE WHEN
                esc.status = 'breached' OR
                (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) > COALESCE(esc.adjusted_due_at, esc.due_at))
              THEN ts.id END) AS breachedCount,
              ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins
                             WHEN esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                             THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, COALESCE(aq.resolved_at, aq.updated_at))
                             ELSE NULL END), 1) AS avgMttrMins
       FROM ticket_sla ts
       LEFT JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       ${where} GROUP BY ts.snapshot_department_id, ts.snapshot_dept_name ORDER BY totalCalls DESC`,
      params
    );
    res.json(rows.map(r => ({ ...r, overallPct: r.resEvaluated > 0 ? +((r.overallMet / r.resEvaluated) * 100).toFixed(1) : null })));
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/by-equipment
router.get("/performance/company/:companyId/by-equipment", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const { dateFrom, dateTo, serviceType } = req.query;
    let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1";
    const params = [companyId];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    if (serviceType && serviceType !== "all") { where += " AND ts.service_type = ?"; params.push(serviceType); }
    const [rows] = await pool.query(
      `SELECT aq.asset_id AS assetDbId,
              COALESCE(a.generated_asset_id, a.asset_unique_id, ts.snapshot_asset_name) AS assetDisplayId,
              COALESCE(a.asset_name, ts.snapshot_asset_name) AS assetName,
              COUNT(DISTINCT ts.id) AS totalCalls,
              COUNT(DISTINCT CASE WHEN
                (rc.status='met'  OR (rc.status  IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(rc.adjusted_due_at,  rc.due_at)))
                AND
                (ac.status='met'  OR (ac.status  IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.engineer_attended_at, aq.resolved_at, aq.updated_at) <= COALESCE(ac.adjusted_due_at, ac.due_at)))
                AND
                (esc.status='met' OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(esc.adjusted_due_at, esc.due_at)))
              THEN ts.id END) AS overallMet,
              COUNT(DISTINCT CASE WHEN
                esc.status IN ('met','breached') OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed'))
              THEN ts.id END) AS resEvaluated,
              COUNT(DISTINCT CASE WHEN
                esc.status = 'breached' OR
                (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) > COALESCE(esc.adjusted_due_at, esc.due_at))
              THEN ts.id END) AS totalBreaches,
              ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins
                             WHEN esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                             THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, COALESCE(aq.resolved_at, aq.updated_at))
                             ELSE NULL END), 1) AS avgMttrMins
       FROM ticket_sla ts
       LEFT JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN assets a ON a.id = aq.asset_id
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       ${where}
       GROUP BY aq.asset_id, assetDisplayId, assetName
       ORDER BY totalBreaches DESC, totalCalls DESC LIMIT ?`,
      [...params, limit]
    );
    res.json(rows.map(r => ({ ...r, overallPct: r.resEvaluated > 0 ? +((r.overallMet / r.resEvaluated) * 100).toFixed(1) : null })));
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/breaches
router.get("/performance/company/:companyId/breaches", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const offset = (page - 1) * limit;
    const { priority, clockType, dateFrom, dateTo } = req.query;
    let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1 AND c.status = 'breached'";
    const params = [companyId];
    if (priority  && ["P1","P2","P3","P4"].includes(priority)) { where += " AND ts.priority = ?"; params.push(priority); }
    if (clockType && ["response","attendance","resolution"].includes(clockType)) { where += " AND c.clock_type = ?"; params.push(clockType); }
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM ticket_sla ts JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT ts.query_id AS queryId, ts.priority,
              ts.snapshot_asset_name AS assetName, ts.snapshot_dept_name AS deptName,
              ts.sla_start_time AS callTime,
              c.clock_type AS clockType, c.target_mins AS targetMins,
              c.actual_mins AS actualMins, c.breach_mins AS breachMins, c.completed_at AS completedAt,
              bl.breach_reason_id AS breachReasonId, br.label AS breachReason, bl.responsibility,
              cu.full_name AS engineerName, aq.status AS ticketStatus
       FROM ticket_sla ts
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN sla_breach_logs bl ON bl.clock_id = c.id
       LEFT JOIN sla_breach_reasons br ON br.id = bl.breach_reason_id
       LEFT JOIN company_users cu ON cu.id = aq.assigned_to
       ${where} ORDER BY ts.sla_start_time DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ rows, total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) });
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/breach-summary
router.get("/performance/company/:companyId/breach-summary", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const { dateFrom, dateTo } = req.query;
    let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1 AND c.status = 'breached'";
    const params = [companyId];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS totalBreaches, SUM(bl.id IS NOT NULL) AS classified,
              ROUND(AVG(c.breach_mins)/60,1) AS avgBreachHours
       FROM ticket_sla ts JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       LEFT JOIN sla_breach_logs bl ON bl.clock_id = c.id ${where}`,
      params
    );
    const [byResponsibility] = await pool.query(
      `SELECT COALESCE(bl.responsibility,'Unclassified') AS responsibility, COUNT(*) AS count
       FROM ticket_sla ts JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       LEFT JOIN sla_breach_logs bl ON bl.clock_id = c.id ${where}
       GROUP BY COALESCE(bl.responsibility,'Unclassified') ORDER BY count DESC`,
      params
    );
    const [byReason] = await pool.query(
      `SELECT COALESCE(br.label,'Unclassified') AS reason, COUNT(*) AS count
       FROM ticket_sla ts JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       LEFT JOIN sla_breach_logs bl ON bl.clock_id = c.id
       LEFT JOIN sla_breach_reasons br ON br.id = bl.breach_reason_id ${where}
       GROUP BY COALESCE(br.label,'Unclassified') ORDER BY count DESC`,
      params
    );
    res.json({
      totalBreaches:  Number(totals.totalBreaches || 0),
      classified:     Number(totals.classified    || 0),
      avgBreachHours: totals.avgBreachHours != null ? Number(totals.avgBreachHours) : null,
      byResponsibility, byReason,
    });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   ADMIN: UNIFIED BREAKDOWN + BREACH DETAILS (per company)
   ═══════════════════════════════════════════════════════════════════════════ */

// GET /performance/company/:companyId/breakdown
router.get("/performance/company/:companyId/breakdown", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const { dateFrom, dateTo, department, serviceType, engineerId } = req.query;
    const pct = (m, t) => (t > 0 ? +((m / t) * 100).toFixed(1) : null);
    const n = (v) => Number(v || 0);

    // ── Issue clocks ─────────────────────────────────────────────────────────
    let issueWhere = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1 AND c.status IN ('met','breached')";
    const issueParams = [companyId];
    if (dateFrom)   { issueWhere += " AND ts.sla_start_time >= ?";         issueParams.push(dateFrom); }
    if (dateTo)     { issueWhere += " AND ts.sla_start_time <= ?";         issueParams.push(dateTo + " 23:59:59"); }
    if (department) { issueWhere += " AND ts.snapshot_department_id = ?";  issueParams.push(department); }
    if (engineerId) { issueWhere += " AND aq.assigned_to = ?";             issueParams.push(engineerId); }

    let issueClocks = [];
    if (!serviceType || serviceType === "issue" || serviceType === "all") {
      [issueClocks] = await pool.query(
        `SELECT c.clock_type,
                COUNT(*) AS applicable,
                SUM(CASE WHEN c.status='met'      THEN 1 ELSE 0 END) AS compliant,
                SUM(CASE WHEN c.status='breached' THEN 1 ELSE 0 END) AS breached
         FROM ticket_sla ts
         JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
         JOIN asset_queries aq ON aq.id = ts.query_id
         ${issueWhere} GROUP BY c.clock_type`,
        issueParams
      );
    }

    const findClock = (type) => issueClocks.find(r => r.clock_type === type) || { applicable: 0, compliant: 0, breached: 0 };
    const resp = findClock("response");
    const att  = findClock("attendance");
    const resC = findClock("resolution");
    const issueTotalApplicable = n(resp.applicable) + n(att.applicable) + n(resC.applicable);
    const issueTotalCompliant  = n(resp.compliant)  + n(att.compliant)  + n(resC.compliant);
    const issueTotalBreached   = n(resp.breached)   + n(att.breached)   + n(resC.breached);

    // ── PMS ──────────────────────────────────────────────────────────────────
    let pmsApplicable = 0, pmsCompliant = 0, pmsBreached = 0;
    if (!serviceType || serviceType === "pms" || serviceType === "all") {
      try {
        let pmsWhere = `WHERE ps.company_id = ?
          AND (psa.status IN ('completed','cancelled') OR ps.maintenance_date < CURDATE())`;
        const pmsParams = [companyId];
        if (dateFrom)   { pmsWhere += " AND ps.maintenance_date >= ?"; pmsParams.push(dateFrom.slice(0, 10)); }
        if (dateTo)     { pmsWhere += " AND ps.maintenance_date <= ?"; pmsParams.push(dateTo.slice(0, 10)); }
        if (department) { pmsWhere += " AND a.department_id = ?";      pmsParams.push(department); }

        const [[pm]] = await pool.query(
          `SELECT COUNT(*) AS applicable,
                  SUM(CASE WHEN psa.status='completed' AND DATE(psa.completed_at) <= ps.maintenance_date THEN 1 ELSE 0 END) AS compliant,
                  SUM(CASE WHEN (psa.status='completed' AND DATE(psa.completed_at) > ps.maintenance_date)
                               OR (psa.status NOT IN ('completed','cancelled') AND ps.maintenance_date < CURDATE())
                           THEN 1 ELSE 0 END) AS breached
           FROM pms_schedule_assets psa
           JOIN pms_schedules ps ON ps.id = psa.schedule_id
           LEFT JOIN assets a ON a.id = psa.asset_id ${pmsWhere}`,
          pmsParams
        );
        pmsApplicable = n(pm.applicable); pmsCompliant = n(pm.compliant); pmsBreached = n(pm.breached);
      } catch { /* optional table */ }
    }

    // ── Calibration ──────────────────────────────────────────────────────────
    let calApplicable = 0, calCompliant = 0, calBreached = 0;
    if (!serviceType || serviceType === "calibration" || serviceType === "all") {
      try {
        let calWhere = `WHERE cs.company_id = ?
          AND (csa.status='completed' OR cs.calibration_date < CURDATE())`;
        const calParams = [companyId];
        if (dateFrom)   { calWhere += " AND cs.calibration_date >= ?"; calParams.push(dateFrom.slice(0, 10)); }
        if (dateTo)     { calWhere += " AND cs.calibration_date <= ?"; calParams.push(dateTo.slice(0, 10)); }
        if (department) { calWhere += " AND a.department_id = ?";      calParams.push(department); }

        const [[cal]] = await pool.query(
          `SELECT COUNT(*) AS applicable,
                  SUM(CASE WHEN csa.status='completed' AND DATE(csa.completed_at) <= cs.calibration_date THEN 1 ELSE 0 END) AS compliant,
                  SUM(CASE WHEN (csa.status='completed' AND DATE(csa.completed_at) > cs.calibration_date)
                               OR (csa.status != 'completed' AND cs.calibration_date < CURDATE())
                           THEN 1 ELSE 0 END) AS breached
           FROM calibration_schedule_assets csa
           JOIN calibration_schedules cs ON cs.id = csa.schedule_id
           LEFT JOIN assets a ON a.id = csa.asset_id ${calWhere}`,
          calParams
        );
        calApplicable = n(cal.applicable); calCompliant = n(cal.compliant); calBreached = n(cal.breached);
      } catch { /* optional table */ }
    }

    // ── Ticket-level overall score (resolved issue tickets only) ──────────────
    let ticketTotal = 0, ticketCompliant = 0, ticketBreached = 0;
    if (!serviceType || serviceType === "issue" || serviceType === "all") {
      let tixWhere = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1 AND aq.status = 'resolved'";
      const tixParams = [companyId];
      if (dateFrom)   { tixWhere += " AND ts.sla_start_time >= ?";         tixParams.push(dateFrom); }
      if (dateTo)     { tixWhere += " AND ts.sla_start_time <= ?";         tixParams.push(dateTo + " 23:59:59"); }
      if (department) { tixWhere += " AND ts.snapshot_department_id = ?";  tixParams.push(department); }
      if (engineerId) { tixWhere += " AND aq.assigned_to = ?";             tixParams.push(engineerId); }
      const [[tix]] = await pool.query(
        `SELECT COUNT(DISTINCT ts.id) AS total,
           SUM(CASE WHEN EXISTS (
               SELECT 1 FROM ticket_sla_clocks c_res
               WHERE c_res.ticket_sla_id = ts.id AND c_res.clock_type = 'resolution' AND c_res.status = 'met'
             ) AND NOT EXISTS (
               SELECT 1 FROM ticket_sla_clocks c_any
               WHERE c_any.ticket_sla_id = ts.id AND c_any.status = 'breached'
             ) THEN 1 ELSE 0 END) AS compliant
         FROM ticket_sla ts
         JOIN asset_queries aq ON aq.id = ts.query_id ${tixWhere}`,
        tixParams
      );
      ticketTotal = n(tix.total);
      ticketCompliant = n(tix.compliant);
      ticketBreached = ticketTotal - ticketCompliant;
    }
    const overallCompliance = pct(ticketCompliant, ticketTotal);

    const clockGrandApplicable = issueTotalApplicable + pmsApplicable + calApplicable;
    const clockGrandCompliant  = issueTotalCompliant  + pmsCompliant  + calCompliant;
    const clockGrandBreached   = issueTotalBreached   + pmsBreached   + calBreached;
    const resApplicable = n(resC.applicable);
    const resCompliant  = n(resC.compliant);
    const resBreached   = n(resC.breached);

    res.json({
      overallCompliance,
      ticketTotal, ticketCompliant, ticketBreached,
      bySourceType: [
        { source: "Issue Resolution", applicable: issueTotalApplicable, compliant: issueTotalCompliant, breached: issueTotalBreached, compliance: pct(issueTotalCompliant, issueTotalApplicable) },
        { source: "PMS",              applicable: pmsApplicable,        compliant: pmsCompliant,        breached: pmsBreached,        compliance: pct(pmsCompliant, pmsApplicable) },
        { source: "Calibration",      applicable: calApplicable,        compliant: calCompliant,        breached: calBreached,        compliance: pct(calCompliant, calApplicable) },
        { source: "Total",            applicable: clockGrandApplicable, compliant: clockGrandCompliant, breached: clockGrandBreached, compliance: pct(clockGrandCompliant, clockGrandApplicable), isTotal: true },
      ],
      byStage: [
        { stage: "Response",   applicable: n(resp.applicable), compliant: n(resp.compliant), breached: n(resp.breached), compliance: pct(n(resp.compliant), n(resp.applicable)) },
        { stage: "Attendance", applicable: n(att.applicable),  compliant: n(att.compliant),  breached: n(att.breached),  compliance: pct(n(att.compliant),  n(att.applicable)) },
        { stage: "Resolution", applicable: resApplicable,      compliant: resCompliant,      breached: resBreached,      compliance: pct(resCompliant, resApplicable) },
      ],
      bySourceStage: [
        {
          source: "Issue Resolution",
          response:   { applicable: n(resp.applicable), compliant: n(resp.compliant), breached: n(resp.breached), pct: pct(n(resp.compliant), n(resp.applicable)) },
          attendance: { applicable: n(att.applicable),  compliant: n(att.compliant),  breached: n(att.breached),  pct: pct(n(att.compliant),  n(att.applicable)) },
          resolution: { applicable: n(resC.applicable), compliant: n(resC.compliant), breached: n(resC.breached), pct: pct(n(resC.compliant), n(resC.applicable)) },
          overallPct: pct(issueTotalCompliant, issueTotalApplicable),
        },
        {
          source: "PMS",
          response:   { applicable: 0, compliant: 0, breached: 0, pct: null },
          attendance: { applicable: 0, compliant: 0, breached: 0, pct: null },
          resolution: { applicable: pmsApplicable, compliant: pmsCompliant, breached: pmsBreached, pct: pct(pmsCompliant, pmsApplicable) },
          overallPct: pct(pmsCompliant, pmsApplicable),
        },
        {
          source: "Calibration",
          response:   { applicable: 0, compliant: 0, breached: 0, pct: null },
          attendance: { applicable: 0, compliant: 0, breached: 0, pct: null },
          resolution: { applicable: calApplicable, compliant: calCompliant, breached: calBreached, pct: pct(calCompliant, calApplicable) },
          overallPct: pct(calCompliant, calApplicable),
        },
      ],
    });
  } catch (err) { next(err); }
});

// GET /performance/company/:companyId/breach-details
router.get("/performance/company/:companyId/breach-details", async (req, res, next) => {
  try {
    const companyId = Number(req.params.companyId);
    const { source = "issue", stage, dateFrom, dateTo, department, priority, engineerId } = req.query;
    const page   = Math.max(1, Number(req.query.page  || 1));
    const limit  = Math.min(Number(req.query.limit || 20), 100);
    const offset = (page - 1) * limit;

    if (source === "issue") {
      let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1 AND c.status = 'breached'";
      const params = [companyId];
      if (stage && ["response","attendance","resolution"].includes(stage)) { where += " AND c.clock_type = ?"; params.push(stage); }
      if (dateFrom)   { where += " AND ts.sla_start_time >= ?";         params.push(dateFrom); }
      if (dateTo)     { where += " AND ts.sla_start_time <= ?";         params.push(dateTo + " 23:59:59"); }
      if (department) { where += " AND ts.snapshot_department_id = ?";  params.push(department); }
      if (priority && ["P1","P2","P3","P4"].includes(priority)) { where += " AND ts.priority = ?"; params.push(priority); }
      if (engineerId) { where += " AND aq.assigned_to = ?";             params.push(engineerId); }

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM ticket_sla ts
         JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
         JOIN asset_queries aq ON aq.id = ts.query_id ${where}`, params
      );
      const [rows] = await pool.query(
        `SELECT ts.query_id AS ticketId, 'Issue Resolution' AS serviceType,
                ts.priority, ts.snapshot_asset_name AS assetName, ts.snapshot_asset_id AS assetId,
                ts.snapshot_dept_name AS deptName, ts.sla_start_time AS createdAt,
                c.clock_type AS slaStage, c.target_mins AS targetMins,
                c.actual_mins AS actualMins, c.breach_mins AS breachMins,
                c.completed_at AS resolvedAt, c.status AS clockStatus,
                cu.full_name AS engineerName, aq.status AS ticketStatus,
                sp.name AS policyName,
                aq.engineer_responded_at AS responseAt,
                aq.engineer_attended_at AS attendanceAt,
                aq.resolved_at AS resolutionAt
         FROM ticket_sla ts
         JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
         JOIN asset_queries aq ON aq.id = ts.query_id
         LEFT JOIN company_users cu ON cu.id = aq.assigned_to
         LEFT JOIN sla_policies sp ON sp.id = ts.policy_id
         ${where}
         ORDER BY ts.sla_start_time DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return res.json({ rows, total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) });
    }

    if (source === "pms") {
      let where = `WHERE ps.company_id = ?
        AND ((psa.status='completed' AND DATE(psa.completed_at) > ps.maintenance_date)
          OR (psa.status NOT IN ('completed','cancelled') AND ps.maintenance_date < CURDATE()))`;
      const params = [companyId];
      if (dateFrom)   { where += " AND ps.maintenance_date >= ?"; params.push(dateFrom.slice(0, 10)); }
      if (dateTo)     { where += " AND ps.maintenance_date <= ?"; params.push(dateTo.slice(0, 10)); }
      if (department) { where += " AND a.department_id = ?";      params.push(department); }

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM pms_schedule_assets psa
         JOIN pms_schedules ps ON ps.id = psa.schedule_id
         LEFT JOIN assets a ON a.id = psa.asset_id ${where}`, params
      );
      const [rows] = await pool.query(
        `SELECT CONCAT('PMS-', psa.id) AS ticketId, 'PMS' AS serviceType,
                'N/A' AS priority, a.asset_name AS assetName, a.id AS assetId,
                d.name AS deptName, ps.maintenance_date AS createdAt,
                'Resolution' AS slaStage,
                1440 AS targetMins,
                CASE WHEN psa.completed_at IS NOT NULL
                     THEN TIMESTAMPDIFF(MINUTE, CONCAT(ps.maintenance_date,' 00:00:00'), psa.completed_at)
                     ELSE TIMESTAMPDIFF(MINUTE, CONCAT(ps.maintenance_date,' 00:00:00'), NOW()) END AS actualMins,
                CASE WHEN psa.completed_at IS NOT NULL
                     THEN GREATEST(0, TIMESTAMPDIFF(MINUTE, CONCAT(ps.maintenance_date,' 23:59:59'), psa.completed_at))
                     ELSE GREATEST(0, TIMESTAMPDIFF(MINUTE, CONCAT(ps.maintenance_date,' 23:59:59'), NOW())) END AS breachMins,
                psa.completed_at AS resolvedAt, 'breached' AS clockStatus,
                COALESCE(psa.engineer_name, 'Unassigned') AS engineerName,
                psa.status AS ticketStatus, NULL AS policyName,
                NULL AS responseAt, NULL AS attendanceAt, psa.completed_at AS resolutionAt
         FROM pms_schedule_assets psa
         JOIN pms_schedules ps ON ps.id = psa.schedule_id
         LEFT JOIN assets a ON a.id = psa.asset_id
         LEFT JOIN departments d ON d.id = a.department_id
         ${where} ORDER BY ps.maintenance_date DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return res.json({ rows, total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) });
    }

    if (source === "calibration") {
      let where = `WHERE cs.company_id = ?
        AND ((csa.status='completed' AND DATE(csa.completed_at) > cs.calibration_date)
          OR (csa.status != 'completed' AND cs.calibration_date < CURDATE()))`;
      const params = [companyId];
      if (dateFrom)   { where += " AND cs.calibration_date >= ?"; params.push(dateFrom.slice(0, 10)); }
      if (dateTo)     { where += " AND cs.calibration_date <= ?"; params.push(dateTo.slice(0, 10)); }
      if (department) { where += " AND a.department_id = ?";      params.push(department); }

      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM calibration_schedule_assets csa
         JOIN calibration_schedules cs ON cs.id = csa.schedule_id
         LEFT JOIN assets a ON a.id = csa.asset_id ${where}`, params
      );
      const [rows] = await pool.query(
        `SELECT CONCAT('CAL-', csa.id) AS ticketId, 'Calibration' AS serviceType,
                'N/A' AS priority, a.asset_name AS assetName, a.id AS assetId,
                d.name AS deptName, cs.calibration_date AS createdAt,
                'Resolution' AS slaStage,
                1440 AS targetMins,
                CASE WHEN csa.completed_at IS NOT NULL
                     THEN TIMESTAMPDIFF(MINUTE, CONCAT(cs.calibration_date,' 00:00:00'), csa.completed_at)
                     ELSE TIMESTAMPDIFF(MINUTE, CONCAT(cs.calibration_date,' 00:00:00'), NOW()) END AS actualMins,
                CASE WHEN csa.completed_at IS NOT NULL
                     THEN GREATEST(0, TIMESTAMPDIFF(MINUTE, CONCAT(cs.calibration_date,' 23:59:59'), csa.completed_at))
                     ELSE GREATEST(0, TIMESTAMPDIFF(MINUTE, CONCAT(cs.calibration_date,' 23:59:59'), NOW())) END AS breachMins,
                csa.completed_at AS resolvedAt, 'breached' AS clockStatus,
                NULL AS engineerName, csa.status AS ticketStatus, NULL AS policyName,
                NULL AS responseAt, NULL AS attendanceAt, csa.completed_at AS resolutionAt
         FROM calibration_schedule_assets csa
         JOIN calibration_schedules cs ON cs.id = csa.schedule_id
         LEFT JOIN assets a ON a.id = csa.asset_id
         LEFT JOIN departments d ON d.id = a.department_id
         ${where} ORDER BY cs.calibration_date DESC LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );
      return res.json({ rows, total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) });
    }

    res.status(400).json({ message: "source must be issue, pms, or calibration" });
  } catch (err) { next(err); }
});

export default router;
