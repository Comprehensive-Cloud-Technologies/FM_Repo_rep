/**
 * slaV2Engine.js
 * ─────────────────────────────────────────────────────────────────
 * Full-featured SLA engine for asset complaint tickets.
 *
 * Features:
 *   • 6-level policy hierarchy (asset → contract → dept → category → company → system)
 *   • Policy versioning / snapshotting (old tickets never re-compute)
 *   • Three independent SLA clocks: response / attendance / resolution
 *   • Pause / resume with configurable reasons
 *   • Business-hours calendar support
 *   • Eligibility rules (exclude test/warranty/duplicate tickets)
 *   • Organisational snapshot (company/dept/asset name at ticket creation time)
 */

import pool from "../db.js";

/* ─── System-level fallback SLA (when no policy is assigned) ────────────── */
const SYSTEM_DEFAULT = {
  P1: { response_mins: 30,  attendance_mins: 120, resolution_mins: 240 },
  P2: { response_mins: 60,  attendance_mins: 240, resolution_mins: 480 },
  P3: { response_mins: 240, attendance_mins: 480, resolution_mins: 1440 },
  P4: { response_mins: 480, attendance_mins: 960, resolution_mins: 2880 },
};

/* ─── Map asset criticality to priority ─────────────────────────────────── */
function criticalityToPriority(criticality) {
  const map = {
    Critical:    "P1",
    High:        "P2",
    Medium:      "P3",
    Non_Critical:"P4",
    Low:         "P4",
  };
  return map[criticality] || "P3";
}

/* ─── Compute effective SLA minutes excluding off-hours ─────────────────── */
/**
 * For 24×7 calendars: simple diff.
 * For business-hours calendars: count only minutes that fall within working
 * hours. Uses a minute-stepping approach suitable for the SLA duration range
 * (minutes to a few hundred hours). For very large ranges (>10 days) this
 * is replaced with a faster segment-based calculation.
 */
export function computeSlaMinutes(startDate, endDate, calendar) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end <= start) return 0;

  if (!calendar || calendar.calendar_type === "24x7") {
    return Math.round((end - start) / 60_000);
  }

  // Parse business hours
  const [sh, sm] = (calendar.biz_start || "08:00").split(":").map(Number);
  const [eh, em] = (calendar.biz_end   || "18:00").split(":").map(Number);
  const bizStartMins = sh * 60 + sm;
  const bizEndMins   = eh * 60 + em;
  const bizDayMins   = bizEndMins - bizStartMins;

  if (bizDayMins <= 0) {
    // Misconfigured calendar — fall back to 24×7
    return Math.round((end - start) / 60_000);
  }

  let total = 0;
  const cur = new Date(start);

  // For large gaps jump whole business days
  while (cur < end) {
    const dayOfWeek = cur.getDay(); // 0=Sun, 6=Sat
    const isWorkday = ((dayOfWeek > 0 && dayOfWeek < 6)
      || (dayOfWeek === 6 && calendar.include_sat)
      || (dayOfWeek === 0 && calendar.include_sun))
      && !(calendar.holidaySet && calendar.holidaySet.has(ymdKey(cur)));

    if (!isWorkday) {
      // Skip entire day
      cur.setDate(cur.getDate() + 1);
      cur.setHours(0, 0, 0, 0);
      continue;
    }

    // Business window for this day
    const dayStart = new Date(cur);
    dayStart.setHours(sh, sm, 0, 0);
    const dayEnd = new Date(cur);
    dayEnd.setHours(eh, em, 0, 0);

    // Clamp to [dayStart, dayEnd] ∩ [cur, end]
    const winStart = cur < dayStart ? dayStart : cur;
    const winEnd   = end < dayEnd   ? end      : dayEnd;

    if (winEnd > winStart) {
      total += Math.round((winEnd - winStart) / 60_000);
    }

    // Move to next day
    cur.setDate(cur.getDate() + 1);
    cur.setHours(0, 0, 0, 0);
  }

  return total;
}

/**
 * Add SLA minutes to a start date, respecting business hours.
 * Returns the Date when the SLA deadline falls.
 */
export function addSlaMinutes(startDate, minutes, calendar) {
  if (!calendar || calendar.calendar_type === "24x7") {
    return new Date(new Date(startDate).getTime() + minutes * 60_000);
  }

  const [sh, sm] = (calendar.biz_start || "08:00").split(":").map(Number);
  const [eh, em] = (calendar.biz_end   || "18:00").split(":").map(Number);

  let remaining = minutes;
  const cur = new Date(startDate);

  while (remaining > 0) {
    const dayOfWeek = cur.getDay();
    const isWorkday = ((dayOfWeek > 0 && dayOfWeek < 6)
      || (dayOfWeek === 6 && calendar.include_sat)
      || (dayOfWeek === 0 && calendar.include_sun))
      && !(calendar.holidaySet && calendar.holidaySet.has(ymdKey(cur)));

    if (!isWorkday) {
      cur.setDate(cur.getDate() + 1);
      cur.setHours(sh, sm, 0, 0);
      continue;
    }

    const dayEnd = new Date(cur);
    dayEnd.setHours(eh, em, 0, 0);

    if (cur >= dayEnd) {
      // Already past business hours today — jump to next business day
      cur.setDate(cur.getDate() + 1);
      cur.setHours(sh, sm, 0, 0);
      continue;
    }

    // Start of business on this day
    const dayStart = new Date(cur);
    dayStart.setHours(sh, sm, 0, 0);
    if (cur < dayStart) cur.setHours(sh, sm, 0, 0);

    const minsToEOD = Math.round((dayEnd - cur) / 60_000);

    if (remaining <= minsToEOD) {
      cur.setTime(cur.getTime() + remaining * 60_000);
      remaining = 0;
    } else {
      remaining -= minsToEOD;
      cur.setDate(cur.getDate() + 1);
      cur.setHours(sh, sm, 0, 0);
    }
  }

  return cur;
}

/* ─── Policy hierarchy resolver ─────────────────────────────────────────── */
async function resolvePolicy(assetId, deptId, companyId, assetCategory) {
  // Level 1: Asset-specific
  const [[assetPolicy]] = await pool.query(
    `SELECT sa.policy_id, sp.calendar_id
     FROM sla_assignments sa
     JOIN sla_policies sp ON sp.id = sa.policy_id
     WHERE sa.scope_type = 'asset' AND sa.scope_id = ? AND sa.is_active = 1
       AND (sa.effective_to IS NULL OR sa.effective_to >= CURDATE())
     LIMIT 1`,
    [assetId]
  ).catch(() => [[]]);
  if (assetPolicy) return { policyId: assetPolicy.policy_id, level: "asset" };

  // Level 2: Contract / client SLA (company-level contract scope)
  const [[contractPolicy]] = await pool.query(
    `SELECT sa.policy_id
     FROM sla_assignments sa
     WHERE sa.scope_type = 'contract' AND sa.scope_id = ? AND sa.is_active = 1
       AND (sa.effective_to IS NULL OR sa.effective_to >= CURDATE())
     LIMIT 1`,
    [companyId]
  ).catch(() => [[]]);
  if (contractPolicy) return { policyId: contractPolicy.policy_id, level: "contract" };

  // Level 3: Department SLA
  if (deptId) {
    const [[deptPolicy]] = await pool.query(
      `SELECT sa.policy_id
       FROM sla_assignments sa
       WHERE sa.scope_type = 'department' AND sa.scope_id = ? AND sa.is_active = 1
         AND (sa.effective_to IS NULL OR sa.effective_to >= CURDATE())
       LIMIT 1`,
      [deptId]
    ).catch(() => [[]]);
    if (deptPolicy) return { policyId: deptPolicy.policy_id, level: "department" };
  }

  // Level 4: Asset category SLA
  if (assetCategory) {
    const [[catPolicy]] = await pool.query(
      `SELECT sa.policy_id
       FROM sla_assignments sa
       WHERE sa.scope_type = 'category' AND sa.scope_ref = ? AND sa.is_active = 1
         AND (sa.effective_to IS NULL OR sa.effective_to >= CURDATE())
       LIMIT 1`,
      [assetCategory]
    ).catch(() => [[]]);
    if (catPolicy) return { policyId: catPolicy.policy_id, level: "category" };
  }

  // Level 5: Company default SLA
  const [[companyPolicy]] = await pool.query(
    `SELECT sa.policy_id
     FROM sla_assignments sa
     WHERE sa.scope_type = 'company' AND sa.scope_id = ? AND sa.is_active = 1
       AND (sa.effective_to IS NULL OR sa.effective_to >= CURDATE())
     LIMIT 1`,
    [companyId]
  ).catch(() => [[]]);
  if (companyPolicy) return { policyId: companyPolicy.policy_id, level: "company" };

  // Level 6: System default (no DB record — use hardcoded SYSTEM_DEFAULT)
  return { policyId: null, level: "system" };
}

/* ─── Get the current policy rules for a given priority ─────────────────── */
async function getPolicyRules(policyId, priority) {
  if (!policyId) return { rules: SYSTEM_DEFAULT[priority] || SYSTEM_DEFAULT.P3, version: 0, calendarId: null };

  const [[policy]] = await pool.query(
    `SELECT sp.version, sp.calendar_id
     FROM sla_policies sp
     WHERE sp.id = ? AND sp.is_active = 1`,
    [policyId]
  ).catch(() => [[]]);

  const [[rule]] = await pool.query(
    `SELECT response_mins, attendance_mins, resolution_mins, pause_allowed
     FROM sla_policy_rules
     WHERE policy_id = ? AND priority = ?
     LIMIT 1`,
    [policyId, priority]
  ).catch(() => [[]]);

  return {
    rules:      rule || SYSTEM_DEFAULT[priority] || SYSTEM_DEFAULT.P3,
    version:    policy?.version || 1,
    calendarId: policy?.calendar_id || null,
  };
}

/* ─── Check eligibility ──────────────────────────────────────────────────── */
async function checkEligibility(companyId, ticketType) {
  const [excls] = await pool.query(
    `SELECT exclude_type FROM sla_eligibility_rules
     WHERE company_id = ? AND is_excluded = 1`,
    [companyId]
  ).catch(() => [[]]);

  const excluded = excls.map(r => r.exclude_type);
  if (excluded.includes(ticketType)) {
    return { eligible: false, reason: `Ticket type '${ticketType}' is excluded by SLA eligibility rules` };
  }
  return { eligible: true, reason: null };
}

/* ─── Get calendar config ────────────────────────────────────────────────── */
async function getCalendar(calendarId) {
  if (!calendarId) return null;
  const [[cal]] = await pool.query(
    `SELECT * FROM sla_calendars WHERE id = ?`,
    [calendarId]
  ).catch(() => [[]]);
  if (!cal) return null;
  // Load holiday dates so business-hours math can skip them
  const [hols] = await pool.query(
    `SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS d FROM sla_calendar_holidays WHERE calendar_id = ?`,
    [calendarId]
  ).catch(() => [[]]);
  cal.holidaySet = new Set((hols || []).map(h => h.d));
  return cal;
}

/* ─── Local date key (YYYY-MM-DD) for holiday lookup ─────────────────────── */
function ymdKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIC API
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Called when a new complaint (asset_query) is created.
 * Creates ticket_sla snapshot + 3 ticket_sla_clocks rows.
 *
 * @param {object} opts
 *   queryId, assetId, companyId, deptId, assetCategory, criticality,
 *   ticketType, assetName, deptName, companyName
 */
export async function initTicketSla(opts) {
  const {
    queryId, assetId, companyId, deptId, assetCategory,
    criticality, uiPriority, ticketType = "breakdown",
    assetName = "", deptName = "", companyName = "",
  } = opts;

  try {
    // Eligibility check
    const { eligible, reason } = await checkEligibility(companyId, ticketType);

    // Priority: the priority chosen by whoever raised the issue (mobile/UI) wins.
    // Only when no explicit priority is supplied do we fall back to asset criticality.
    const priority = uiPriority
      ? uiPriorityToSlaPriority(uiPriority)
      : criticalityToPriority(criticality);

    // Resolve policy
    const { policyId, level } = await resolvePolicy(assetId, deptId, companyId, assetCategory);

    // Get rules + version
    const { rules, version, calendarId } = await getPolicyRules(policyId, priority);

    // Load calendar
    const calendar = await getCalendar(calendarId);

    const now = new Date();
    const responseDue   = addSlaMinutes(now, rules.response_mins,   calendar);
    const attendanceDue = addSlaMinutes(now, rules.attendance_mins, calendar);
    const resolutionDue = addSlaMinutes(now, rules.resolution_mins, calendar);

    console.log(
      `[SLA-INIT] ticket=${queryId} company=${companyId}` +
      ` | policy=${policyId||'system-default'} level=${level} priority=${priority}` +
      ` | calendar=${calendarId||'24x7'} eligible=${eligible}` +
      ` | response=${rules.response_mins}m(due ${responseDue.toISOString()})` +
      ` attendance=${rules.attendance_mins}m(due ${attendanceDue.toISOString()})` +
      ` resolution=${rules.resolution_mins}m(due ${resolutionDue.toISOString()})`
    );

    // Snapshot version in sla_policy_versions if it doesn't exist yet
    if (policyId) {
      await pool.query(
        `INSERT IGNORE INTO sla_policy_versions (policy_id, version, rules_snapshot, created_at)
         SELECT id, version, JSON_OBJECT(
           'priority', ?, 'response_mins', ?, 'attendance_mins', ?, 'resolution_mins', ?
         ), NOW()
         FROM sla_policies WHERE id = ? AND version = ?`,
        [priority, rules.response_mins, rules.attendance_mins, rules.resolution_mins, policyId, version]
      ).catch(() => {});
    }

    // Insert ticket_sla
    const [tsResult] = await pool.query(
      `INSERT INTO ticket_sla
         (query_id, snapshot_company_id, snapshot_department_id, snapshot_asset_id,
          snapshot_company_name, snapshot_dept_name, snapshot_asset_name,
          policy_id, policy_version, priority,
          sla_response_mins, sla_attendance_mins, sla_resolution_mins,
          sla_start_time, response_due_at, attendance_due_at, resolution_due_at,
          is_sla_eligible, ineligible_reason, policy_level, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
      [
        queryId, companyId, deptId || null, assetId,
        companyName, deptName, assetName,
        policyId || null, version, priority,
        rules.response_mins, rules.attendance_mins, rules.resolution_mins,
        now, responseDue, attendanceDue, resolutionDue,
        eligible ? 1 : 0, reason,
        level,
      ]
    );

    const ticketSlaId = tsResult.insertId;

    if (eligible) {
      // Insert 3 independent clocks
      const clocks = [
        { type: "response",   target: rules.response_mins,   due: responseDue },
        { type: "attendance", target: rules.attendance_mins, due: attendanceDue },
        { type: "resolution", target: rules.resolution_mins, due: resolutionDue },
      ];
      for (const c of clocks) {
        await pool.query(
          `INSERT INTO ticket_sla_clocks
             (ticket_sla_id, clock_type, target_mins, due_at, status)
           VALUES (?, ?, ?, ?, 'running')`,
          [ticketSlaId, c.type, c.target, c.due]
        );
      }

      // Log creation event
      await pool.query(
        `INSERT INTO ticket_sla_events (ticket_sla_id, event_type, occurred_at)
         VALUES (?, 'created', NOW())`,
        [ticketSlaId]
      ).catch(() => {});
    }

    return { ticketSlaId, priority, policyId, level, eligible };
  } catch (err) {
    console.error("[SlaV2Engine] initTicketSla error:", err.message);
    return null;
  }
}

/**
 * Complete one SLA clock (respond / attend / resolve).
 * Computes actual elapsed minutes (excluding paused time), marks met/breached.
 *
 * @param {number} queryId
 * @param {'response'|'attendance'|'resolution'} clockType
 * @param {number} actorId  — company_user id who triggered the event
 * @param {Date|string|null} resolvedAt  — actual completion timestamp (uses NOW() if omitted)
 */
export async function completeClock(queryId, clockType, actorId, resolvedAt = null) {
  try {
    const [[ts]] = await pool.query(
      `SELECT ts.id AS ticketSlaId, ts.policy_id, ts.sla_start_time, ts.is_sla_eligible
       FROM ticket_sla ts WHERE ts.query_id = ?`,
      [queryId]
    );
    if (!ts || !ts.is_sla_eligible) return null;

    const [[clock]] = await pool.query(
      `SELECT * FROM ticket_sla_clocks
       WHERE ticket_sla_id = ? AND clock_type = ? AND status IN ('running','paused','breached')`,
      [ts.ticketSlaId, clockType]
    );
    // 'met' clocks are already final — nothing to do; null means no clock exists
    if (!clock) return null;

    const now          = resolvedAt ? new Date(resolvedAt) : new Date();
    const totalPaused  = Number(clock.total_paused_mins || 0);

    // Get calendar
    const [[policy]]   = await pool.query(
      `SELECT calendar_id FROM sla_policies WHERE id = ?`, [ts.policy_id]
    ).catch(() => [[]]);
    const calendar     = policy?.calendar_id ? await getCalendar(policy.calendar_id) : null;

    // Compute elapsed SLA minutes (wall time minus paused time)
    const wallMins     = computeSlaMinutes(ts.sla_start_time, now, calendar);
    const actualMins   = Math.max(0, wallMins - totalPaused);
    const met          = actualMins <= clock.target_mins;
    const breachMins   = met ? 0 : actualMins - clock.target_mins;

    console.log(
      `[SLA-CLOCK] ticket=${queryId} clock=${clockType}` +
      ` | policy=${ts.policy_id||'system'} calendar=${calendar?.calendar_type||'24x7'}` +
      ` | start=${new Date(ts.sla_start_time).toISOString()} event=${now.toISOString()}` +
      ` | wall=${wallMins}m paused=${totalPaused}m actual=${actualMins}m target=${clock.target_mins}m` +
      ` | due=${new Date(clock.adjusted_due_at || clock.due_at).toISOString()}` +
      ` | result=${met ? 'MET' : 'BREACHED'} breach=${breachMins}m`
    );

    await pool.query(
      `UPDATE ticket_sla_clocks
       SET completed_at = ?, actual_mins = ?, status = ?,
           breach_mins = ?, updated_at = NOW()
       WHERE id = ?`,
      [now, actualMins, met ? "met" : "breached", breachMins, clock.id]
    );

    // Log event
    await pool.query(
      `INSERT INTO ticket_sla_events (ticket_sla_id, event_type, occurred_at, actor_id)
       VALUES (?, ?, NOW(), ?)`,
      [ts.ticketSlaId, clockType === "resolution" ? "resolved" : clockType === "response" ? "responded" : "attended", actorId]
    ).catch(() => {});

    // If breached and not already logged — create breach log entry
    if (!met) {
      await pool.query(
        `INSERT IGNORE INTO sla_breach_logs (clock_id, breach_mins, logged_at)
         VALUES (?, ?, NOW())`,
        [clock.id, breachMins]
      ).catch(() => {});
    }

    return { clockId: clock.id, actualMins, met, breachMins };
  } catch (err) {
    console.error("[SlaV2Engine] completeClock error:", err.message);
    return null;
  }
}

/**
 * Pause a specific clock (or all running clocks if clockType = null).
 */
export async function pauseClocks(queryId, reasonId, actorId, clockType = null) {
  try {
    const [[ts]] = await pool.query(
      `SELECT id AS ticketSlaId FROM ticket_sla WHERE query_id = ?`, [queryId]
    );
    if (!ts) return null;

    const typeFilter = clockType ? "AND clock_type = ?" : "";
    const typeParams = clockType ? [clockType] : [];

    const [clocks] = await pool.query(
      `SELECT * FROM ticket_sla_clocks
       WHERE ticket_sla_id = ? AND status = 'running' ${typeFilter}`,
      [ts.ticketSlaId, ...typeParams]
    );

    for (const c of clocks) {
      await pool.query(
        `UPDATE ticket_sla_clocks SET status = 'paused', updated_at = NOW() WHERE id = ?`,
        [c.id]
      );
      await pool.query(
        `INSERT INTO ticket_sla_pauses (clock_id, paused_at, reason_id, paused_by)
         VALUES (?, NOW(), ?, ?)`,
        [c.id, reasonId || null, actorId]
      );
    }

    await pool.query(
      `INSERT INTO ticket_sla_events (ticket_sla_id, event_type, occurred_at, actor_id, notes)
       VALUES (?, 'paused', NOW(), ?, ?)`,
      [ts.ticketSlaId, actorId, `Clocks paused (reason_id: ${reasonId})`]
    ).catch(() => {});

    return { paused: clocks.length };
  } catch (err) {
    console.error("[SlaV2Engine] pauseClocks error:", err.message);
    return null;
  }
}

/**
 * Resume paused clocks. Calculates paused_mins; optionally extends due_at.
 */
export async function resumeClocks(queryId, actorId, clockType = null) {
  try {
    const [[ts]] = await pool.query(
      `SELECT ts.id AS ticketSlaId, ts.policy_id
       FROM ticket_sla ts WHERE ts.query_id = ?`, [queryId]
    );
    if (!ts) return null;

    const [[policy]] = await pool.query(
      `SELECT calendar_id FROM sla_policies WHERE id = ?`, [ts.policy_id]
    ).catch(() => [[]]);
    const calendar = policy?.calendar_id ? await getCalendar(policy.calendar_id) : null;

    const typeFilter = clockType ? "AND c.clock_type = ?" : "";
    const typeParams = clockType ? [clockType] : [];

    const [clocks] = await pool.query(
      `SELECT c.id, c.due_at, c.total_paused_mins
       FROM ticket_sla_clocks c
       WHERE c.ticket_sla_id = ? AND c.status = 'paused' ${typeFilter}`,
      [ts.ticketSlaId, ...typeParams]
    );

    for (const c of clocks) {
      // Find the open pause record
      const [[pause]] = await pool.query(
        `SELECT id, paused_at, extends_due FROM ticket_sla_pauses
         WHERE clock_id = ? AND resumed_at IS NULL ORDER BY paused_at DESC LIMIT 1`,
        [c.id]
      );
      if (!pause) continue;

      const pausedMins = computeSlaMinutes(pause.paused_at, new Date(), calendar);
      const totalPaused = Number(c.total_paused_mins || 0) + pausedMins;

      // Optionally extend due_at
      let newDue = c.due_at;
      if (pause.extends_due) {
        newDue = addSlaMinutes(new Date(c.due_at), pausedMins, calendar);
      }

      await pool.query(
        `UPDATE ticket_sla_pauses SET resumed_at = NOW(), paused_mins = ? WHERE id = ?`,
        [pausedMins, pause.id]
      );
      await pool.query(
        `UPDATE ticket_sla_clocks
         SET status = 'running', total_paused_mins = ?, adjusted_due_at = ?, updated_at = NOW()
         WHERE id = ?`,
        [totalPaused, newDue, c.id]
      );
    }

    await pool.query(
      `INSERT INTO ticket_sla_events (ticket_sla_id, event_type, occurred_at, actor_id)
       VALUES (?, 'resumed', NOW(), ?)`,
      [ts.ticketSlaId, actorId]
    ).catch(() => {});

    return { resumed: clocks.length };
  } catch (err) {
    console.error("[SlaV2Engine] resumeClocks error:", err.message);
    return null;
  }
}

/**
 * Get live SLA status for a ticket (all 3 clocks + overall).
 */
export async function getTicketSlaStatus(queryId) {
  try {
    const [[ts]] = await pool.query(
      `SELECT ts.*, sp.name AS policy_name
       FROM ticket_sla ts
       LEFT JOIN sla_policies sp ON sp.id = ts.policy_id
       WHERE ts.query_id = ?`,
      [queryId]
    );
    if (!ts) return null;

    const [clocks] = await pool.query(
      `SELECT c.*,
              p.paused_at AS last_paused_at,
              br.label    AS pause_reason_label
       FROM ticket_sla_clocks c
       LEFT JOIN ticket_sla_pauses p ON p.clock_id = c.id AND p.resumed_at IS NULL
       LEFT JOIN sla_breach_reasons br ON br.id = p.reason_id
       WHERE c.ticket_sla_id = ?
       ORDER BY FIELD(c.clock_type,'response','attendance','resolution')`,
      [ts.id]
    );

    const now = Date.now();
    const clocksWithRisk = clocks.map(c => {
      const dueMs = new Date(c.adjusted_due_at || c.due_at).getTime();
      const remainingMins = Math.round((dueMs - now) / 60_000);
      const elapsedPct = c.target_mins > 0
        ? Math.min(200, ((c.target_mins + (c.total_paused_mins || 0) - remainingMins) / c.target_mins) * 100)
        : 0;
      const risk = elapsedPct >= 100 ? "breached"
        : elapsedPct >= 90 ? "critical"
        : elapsedPct >= 70 ? "warning"
        : "safe";

      return {
        clockType:       c.clock_type,
        status:          c.status,
        targetMins:      c.target_mins,
        dueAt:           c.adjusted_due_at || c.due_at,
        completedAt:     c.completed_at,
        actualMins:      c.actual_mins,
        totalPausedMins: c.total_paused_mins,
        breachMins:      c.breach_mins,
        remainingMins:   c.status === "running" ? remainingMins : null,
        elapsedPct:      Math.round(elapsedPct),
        risk,
        isPaused:        c.status === "paused",
        lastPausedAt:    c.last_paused_at,
        pauseReason:     c.pause_reason_label,
      };
    });

    // Overall SLA: met only if ALL completed clocks are met
    const completedClocks = clocksWithRisk.filter(c => ["met","breached"].includes(c.status));
    const allMet = completedClocks.length > 0 && completedClocks.every(c => c.status === "met");
    const anyBreached = completedClocks.some(c => c.status === "breached");
    const overallStatus = anyBreached ? "breached" : allMet ? "met" : "active";

    return {
      queryId,
      policyName:    ts.policy_name || "System Default",
      policyLevel:   ts.policy_level,
      priority:      ts.priority,
      isEligible:    Boolean(ts.is_sla_eligible),
      ineligibleReason: ts.ineligible_reason,
      slaStartTime:  ts.sla_start_time,
      clocks:        clocksWithRisk,
      overallStatus,
    };
  } catch (err) {
    console.error("[SlaV2Engine] getTicketSlaStatus error:", err.message);
    return null;
  }
}

/**
 * Map a UI priority string (low/medium/high/critical/normal) to SLA priority (P1-P4).
 * P1 = Critical, P2 = High, P3 = Medium/Normal, P4 = Low
 */
export function uiPriorityToSlaPriority(uiPriority) {
  const v = (uiPriority || "").toString().trim();
  // Already a P-level (mobile app may send "P1".."P4" directly)
  if (/^P[1-4]$/i.test(v)) return v.toUpperCase();
  const map = {
    critical: "P1",
    high:     "P2",
    medium:   "P3",
    normal:   "P3",
    low:      "P4",
  };
  return map[v.toLowerCase()] || "P3";
}

/**
 * Recalculate SLA clocks after an issue priority change.
 * Preserves the original sla_start_time; only the target due times change.
 *
 * @param {number} queryId
 * @param {string} newUiPriority  — 'low'|'medium'|'high'|'critical'|'normal'
 */
export async function recalculateTicketSla(queryId, newUiPriority) {
  try {
    const [[ts]] = await pool.query(
      `SELECT ts.id, ts.policy_id, ts.sla_start_time, ts.is_sla_eligible
       FROM ticket_sla ts WHERE ts.query_id = ?`,
      [queryId]
    );
    if (!ts || !ts.is_sla_eligible) return null;

    const newPriority = uiPriorityToSlaPriority(newUiPriority);
    const { rules, calendarId } = await getPolicyRules(ts.policy_id, newPriority);
    const calendar = await getCalendar(calendarId);

    const slaStart    = new Date(ts.sla_start_time);
    const responseDue   = addSlaMinutes(slaStart, rules.response_mins,   calendar);
    const attendanceDue = addSlaMinutes(slaStart, rules.attendance_mins, calendar);
    const resolutionDue = addSlaMinutes(slaStart, rules.resolution_mins, calendar);

    await pool.query(
      `UPDATE ticket_sla
       SET priority = ?, sla_response_mins = ?, sla_attendance_mins = ?, sla_resolution_mins = ?,
           response_due_at = ?, attendance_due_at = ?, resolution_due_at = ?
       WHERE id = ?`,
      [newPriority, rules.response_mins, rules.attendance_mins, rules.resolution_mins,
       responseDue, attendanceDue, resolutionDue, ts.id]
    );

    // Update only clocks that are still running or paused
    const [clocks] = await pool.query(
      `SELECT id, clock_type FROM ticket_sla_clocks
       WHERE ticket_sla_id = ? AND status IN ('running','paused')`,
      [ts.id]
    );
    for (const c of clocks) {
      const newDue = c.clock_type === "response"   ? responseDue
                   : c.clock_type === "attendance" ? attendanceDue
                   : resolutionDue;
      await pool.query(
        `UPDATE ticket_sla_clocks
         SET due_at = ?, adjusted_due_at = NULL, target_mins = ?, updated_at = NOW()
         WHERE id = ?`,
        [newDue,
         c.clock_type === "response"   ? rules.response_mins
         : c.clock_type === "attendance" ? rules.attendance_mins
         : rules.resolution_mins,
         c.id]
      );
    }

    await pool.query(
      `INSERT INTO ticket_sla_events (ticket_sla_id, event_type, occurred_at, notes)
       VALUES (?, 'created', NOW(), ?)`,
      [ts.id, `Priority changed to ${newPriority} (from UI: ${newUiPriority})`]
    ).catch(() => {});

    return { priority: newPriority, responseDue, attendanceDue, resolutionDue };
  } catch (err) {
    console.error("[SlaV2Engine] recalculateTicketSla error:", err.message);
    return null;
  }
}

/**
 * Scan all open tickets and auto-mark breached clocks.
 * Called by a scheduled job every 5 minutes.
 */
export async function scanBreaches() {
  try {
    // Join asset_queries to get resolved_at so we don't falsely breach
    // clocks on tickets that were already resolved within their SLA window.
    const [overdueClocks] = await pool.query(
      `SELECT c.id AS clockId, c.ticket_sla_id, c.clock_type,
              c.target_mins, c.total_paused_mins,
              COALESCE(c.adjusted_due_at, c.due_at) AS effective_due_at,
              ts.sla_start_time, ts.policy_id, ts.query_id,
              aq.resolved_at, aq.in_progress_at, aq.assigned_at,
              aq.status AS ticket_status
       FROM ticket_sla_clocks c
       JOIN ticket_sla ts ON ts.id = c.ticket_sla_id
       LEFT JOIN asset_queries aq ON aq.id = ts.query_id
       WHERE c.status = 'running'`
    );

    let breachedCount = 0;
    for (const c of overdueClocks) {
      const effectiveDue = c.effective_due_at ? new Date(c.effective_due_at) : null;
      if (!effectiveDue) continue;

      // Determine the relevant event time for this clock type:
      // Response → when engineer was assigned (assigned_at)
      // Attendance → when engineer marked in_progress (in_progress_at); fall back to resolved_at
      // Resolution → when ticket was resolved (resolved_at)
      let eventTime = null;
      const resolvedAt   = c.resolved_at    ? new Date(c.resolved_at)    : null;
      const inProgressAt = c.in_progress_at ? new Date(c.in_progress_at) : null;
      const assignedAt   = c.assigned_at    ? new Date(c.assigned_at)    : null;

      if (c.clock_type === 'response') {
        eventTime = assignedAt || inProgressAt || resolvedAt;
      } else if (c.clock_type === 'attendance') {
        eventTime = inProgressAt || resolvedAt;
      } else if (c.clock_type === 'resolution') {
        eventTime = resolvedAt;
      }

      const now = new Date();
      // Use the event time if available, otherwise use NOW() for open tickets
      const compareTime = eventTime || now;

      // Clock is not actually overdue yet
      if (compareTime <= effectiveDue) continue;

      // For resolved tickets: measure elapsed time to resolved_at, not NOW()
      // This prevents marking tickets as breached when they were resolved on time
      // but the scanner ran later.
      const [[policy]] = await pool.query(
        `SELECT calendar_id FROM sla_policies WHERE id = ?`, [c.policy_id]
      ).catch(() => [[]]);
      const calendar = policy?.calendar_id ? await getCalendar(policy.calendar_id) : null;

      const wallMins   = computeSlaMinutes(c.sla_start_time, compareTime, calendar);
      const actualMins = Math.max(0, wallMins - Number(c.total_paused_mins || 0));
      const breachMins = Math.max(0, actualMins - c.target_mins);
      const isMet      = actualMins <= c.target_mins;

      await pool.query(
        `UPDATE ticket_sla_clocks
         SET status = ?, actual_mins = ?, breach_mins = ?, completed_at = ?, updated_at = NOW()
         WHERE id = ?`,
        [isMet ? 'met' : 'breached', actualMins, breachMins, compareTime, c.clockId]
      );

      if (!isMet) {
        await pool.query(
          `INSERT IGNORE INTO sla_breach_logs (clock_id, breach_mins, logged_at)
           VALUES (?, ?, NOW())`,
          [c.clockId, breachMins]
        ).catch(() => {});
      }
      breachedCount++;
    }

    return breachedCount;
  } catch (err) {
    console.error("[SlaV2Engine] scanBreaches error:", err.message);
    return 0;
  }
}
