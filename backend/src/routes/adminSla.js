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
    ADD COLUMN IF NOT EXISTS priority     ENUM('P1','P2','P3','P4') NULL AFTER status,
    ADD COLUMN IF NOT EXISTS ticket_type  VARCHAR(40) NOT NULL DEFAULT 'breakdown' AFTER priority,
    ADD COLUMN IF NOT EXISTS engineer_responded_at  DATETIME NULL,
    ADD COLUMN IF NOT EXISTS engineer_attended_at   DATETIME NULL`);

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
       calendar_id = COALESCE(?, calendar_id), is_active = COALESCE(?, is_active),
       version = version + 1, updated_at = NOW()
       WHERE id = ?`,
      [name || null, description || null, calendarId || null, isActive != null ? (isActive ? 1 : 0) : null, id]
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
    const [rows] = await pool.query(`SELECT * FROM sla_calendars ORDER BY name`);
    res.json(rows);
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
       LEFT JOIN sla_assignments sa ON sa.scope = 'company' AND sa.company_id = co.id AND sa.is_active = 1
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
       LEFT JOIN sla_assignments sa ON sa.scope = 'company' AND sa.company_id = co.id AND sa.is_active = 1
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

    if (!policyId) {
      // Remove existing assignment
      await pool.query(`UPDATE sla_assignments SET is_active = 0 WHERE scope = 'company' AND company_id = ?`, [companyId]);
      return res.json({ message: "SLA policy removed from company" });
    }

    // Verify policy exists
    const [[pol]] = await pool.query(`SELECT id, name FROM sla_policies WHERE id = ? AND is_active = 1`, [Number(policyId)]);
    if (!pol) return res.status(404).json({ message: "SLA policy not found" });

    // Upsert assignment
    await pool.query(`UPDATE sla_assignments SET is_active = 0 WHERE scope = 'company' AND company_id = ?`, [companyId]);
    await pool.query(
      `INSERT INTO sla_assignments (scope, company_id, policy_id, is_active, assigned_by, assigned_at)
       VALUES ('company', ?, ?, 1, ?, NOW())
       ON DUPLICATE KEY UPDATE policy_id = VALUES(policy_id), is_active = 1, assigned_by = VALUES(assigned_by), assigned_at = NOW()`,
      [companyId, Number(policyId), req.user?.id || null]
    );

    res.json({ message: "SLA policy assigned", companyId, policyId: Number(policyId), policyName: pol.name });
  } catch (err) { next(err); }
});

export default router;
