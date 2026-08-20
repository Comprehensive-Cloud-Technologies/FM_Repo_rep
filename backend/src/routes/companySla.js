/**
 * Company Portal SLA
 * Prefix: /api/company-portal/sla
 *
 * Requires company-user JWT (requireCompanyAuth).
 * Handles: ticket SLA actions, pause/resume, dashboard KPIs,
 *          at-risk alerts, trend, by-engineer, by-dept, by-asset.
 */

import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import {
  getTicketSlaStatus,
  completeClock,
  pauseClocks,
  resumeClocks,
} from "../utils/slaV2Engine.js";

const router = Router();
router.use(requireCompanyAuth);

const cid = (req) => req.companyUser.companyId;

async function getAccessibleCompanyIds(userId, primaryId) {
  const [extra] = await pool.query(
    `SELECT company_id AS companyId FROM user_company_access WHERE user_id = ?`, [userId]
  ).catch(() => [[]]);
  const ids = new Set([Number(primaryId)]);
  extra.forEach(r => ids.add(Number(r.companyId)));
  return [...ids];
}

const inFilter = (ids, col) =>
  ids.length === 1 ? `${col} = ?` : `${col} IN (${ids.map(() => "?").join(",")})`;

async function resolveCompanyIds(req) {
  if (req.query.allCompanies === "true") {
    return getAccessibleCompanyIds(req.companyUser.id, cid(req));
  }
  return [cid(req)];
}

/* ═══════════════════════════════════════════════════════════════════════════
   TICKET SLA ACTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

// GET /status/:queryId — live three-clock status
router.get("/status/:queryId", async (req, res, next) => {
  try {
    const status = await getTicketSlaStatus(Number(req.params.queryId));
    if (!status) return res.status(404).json({ message: "SLA record not found for this ticket" });
    res.json(status);
  } catch (err) { next(err); }
});

// POST /respond/:queryId — engineer acknowledges the complaint
router.post("/respond/:queryId", async (req, res, next) => {
  try {
    const queryId = Number(req.params.queryId);
    const actorId = req.companyUser.id;

    // Stamp engineer_responded_at on the query
    await pool.query(
      `UPDATE asset_queries SET engineer_responded_at = NOW(), updated_at = NOW()
       WHERE id = ? AND company_id = ? AND engineer_responded_at IS NULL`,
      [queryId, cid(req)]
    );

    const result = await completeClock(queryId, "response", actorId);
    if (!result) return res.json({ message: "Response already recorded or no SLA configured" });

    res.json({ message: "Response recorded", ...result });
  } catch (err) { next(err); }
});

// POST /attend/:queryId — engineer physically arrives at equipment
router.post("/attend/:queryId", async (req, res, next) => {
  try {
    const queryId = Number(req.params.queryId);
    const actorId = req.companyUser.id;

    await pool.query(
      `UPDATE asset_queries SET engineer_attended_at = NOW(), updated_at = NOW()
       WHERE id = ? AND company_id = ? AND engineer_attended_at IS NULL`,
      [queryId, cid(req)]
    );

    const result = await completeClock(queryId, "attendance", actorId);
    if (!result) return res.json({ message: "Attendance already recorded or no SLA configured" });

    res.json({ message: "Attendance recorded", ...result });
  } catch (err) { next(err); }
});

// POST /resolve/:queryId — equipment restored, all clocks finalised
router.post("/resolve/:queryId", async (req, res, next) => {
  try {
    const queryId = Number(req.params.queryId);
    const actorId = req.companyUser.id;
    const { notes } = req.body;

    // Update complaint status
    await pool.query(
      `UPDATE asset_queries
       SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = ? AND company_id = ?`,
      [queryId, cid(req)]
    );

    // Complete resolution clock (+ any still-running clocks if response/attend were skipped)
    const resolutionResult = await completeClock(queryId, "resolution", actorId);

    if (notes) {
      await pool.query(
        `UPDATE sla_breach_logs SET notes = ? WHERE clock_id IN (
           SELECT id FROM ticket_sla_clocks WHERE ticket_sla_id = (
             SELECT id FROM ticket_sla WHERE query_id = ?
           ) AND clock_type = 'resolution'
         )`,
        [notes, queryId]
      ).catch(() => {});
    }

    res.json({ message: "Complaint resolved", ...resolutionResult });
  } catch (err) { next(err); }
});

// POST /pause/:queryId — pause SLA clock
router.post("/pause/:queryId", async (req, res, next) => {
  try {
    const { reasonId, clockType } = req.body;
    const result = await pauseClocks(
      Number(req.params.queryId),
      reasonId || null,
      req.companyUser.id,
      clockType || null
    );
    if (!result) return res.status(400).json({ message: "No running clocks found" });
    res.json({ message: `${result.paused} clock(s) paused`, ...result });
  } catch (err) { next(err); }
});

// POST /resume/:queryId — resume paused clocks
router.post("/resume/:queryId", async (req, res, next) => {
  try {
    const { clockType } = req.body;
    const result = await resumeClocks(
      Number(req.params.queryId),
      req.companyUser.id,
      clockType || null
    );
    if (!result) return res.status(400).json({ message: "No paused clocks found" });
    res.json({ message: `${result.resumed} clock(s) resumed`, ...result });
  } catch (err) { next(err); }
});

// POST /breach-log/:queryId — log breach reason & responsibility
router.post("/breach-log/:queryId", async (req, res, next) => {
  try {
    const { reasonId, responsibility, notes, clockType } = req.body;
    const [[ts]] = await pool.query(
      `SELECT id FROM ticket_sla WHERE query_id = ?`, [Number(req.params.queryId)]
    );
    if (!ts) return res.status(404).json({ message: "SLA record not found" });

    const clockFilter = clockType ? "AND c.clock_type = ?" : "";
    const [clocks] = await pool.query(
      `SELECT c.id FROM ticket_sla_clocks c
       WHERE c.ticket_sla_id = ? AND c.status = 'breached' ${clockFilter}`,
      clockType ? [ts.id, clockType] : [ts.id]
    );

    for (const c of clocks) {
      await pool.query(
        `INSERT INTO sla_breach_logs (clock_id, breach_reason_id, responsibility, notes, logged_by, logged_at)
         VALUES (?,?,?,?,?,NOW())
         ON DUPLICATE KEY UPDATE
           breach_reason_id = VALUES(breach_reason_id),
           responsibility   = VALUES(responsibility),
           notes            = VALUES(notes),
           logged_by        = VALUES(logged_by)`,
        [c.id, reasonId || null, responsibility || null, notes || null, req.companyUser.id]
      );
    }

    res.json({ message: "Breach reason logged", clocksUpdated: clocks.length });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD KPIs
   ═══════════════════════════════════════════════════════════════════════════ */

// GET /dashboard?dateFrom=&dateTo=&priority=&slaStatus=&allCompanies=true
router.get("/dashboard", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const { dateFrom, dateTo, priority } = req.query;

    let where = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1`;
    const params = [...cids];

    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    if (priority && ["P1","P2","P3","P4"].includes(priority)) {
      where += " AND ts.priority = ?"; params.push(priority);
    }

    const [[stats]] = await pool.query(
      `SELECT
         COUNT(DISTINCT ts.id) AS total_tickets,

         -- ── Response SLA ───────────────────────────────────────────────────────
         -- Effective event time: assigned_at → in_progress_at → resolved_at
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
         -- Primary: in_progress_at. Fallback: resolved_at ONLY when it proves on-time
         -- (resolved_at <= att_due_at means engineer was on site within the window).
         -- Missing in_progress_at with late resolved_at = UNKNOWN, not breached.
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

         -- ── Overall (ticket-level compliance — ALL clocks met) ─────────────────
         -- Response: uses assigned_at → in_progress_at → resolved_at cascade
         -- Attendance: uses in_progress_at; resolved_at fallback only when within deadline;
         --   if attendance can't be evaluated (no in_progress_at, resolved_at > att_due),
         --   it does NOT block the overall count (non-measurable ≠ breached)
         -- Resolution: uses resolved_at directly
         COUNT(DISTINCT CASE
           WHEN
             -- Response met
             (rc.status = 'met'
              OR (rc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                  AND COALESCE(aq.assigned_at, aq.in_progress_at, aq.resolved_at) IS NOT NULL
                  AND COALESCE(aq.assigned_at, aq.in_progress_at, aq.resolved_at)
                      <= COALESCE(rc.adjusted_due_at, rc.due_at)))
             -- Attendance met or not measurable (don't penalise missing in_progress_at)
             AND (ac.status = 'met'
                  OR (ac.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                      AND (aq.in_progress_at IS NULL
                           OR aq.in_progress_at <= COALESCE(ac.adjusted_due_at, ac.due_at))))
             -- Resolution met
             AND (esc.status = 'met'
                  OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                      AND aq.resolved_at IS NOT NULL
                      AND aq.resolved_at <= COALESCE(esc.adjusted_due_at, esc.due_at)))
           THEN ts.id END) AS overall_met,

         -- ── sla_compliant_rt / sla_breached_rt (kept for backwards compat) ─────
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

         -- At risk: open tickets whose resolution clock expires in the next 2 hours
         COUNT(DISTINCT CASE
           WHEN esc.status = 'running' AND aq.status NOT IN ('resolved','closed')
             AND COALESCE(esc.adjusted_due_at, esc.due_at)
                 BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 120 MINUTE)
           THEN ts.id END) AS sla_at_risk,

         ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins END) / 60, 1) AS mttr_hours,
         COUNT(DISTINCT CASE WHEN aq.status NOT IN ('resolved','closed') THEN ts.id END) AS active_tickets

       FROM ticket_sla ts
       JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id  = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id  = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       ${where}`,
      params
    );

    const pct = (met, total) => total > 0 ? +((met / total) * 100).toFixed(1) : null;

    const totalTickets    = Number(stats.total_tickets    || 0);
    // slaCompliant = tickets where ALL 3 clocks (response+attendance+resolution) were met
    const slaCompliant    = Number(stats.overall_met      || 0);
    const slaBreached     = Number(stats.sla_breached_rt  || 0);
    const slaAtRisk       = Number(stats.sla_at_risk      || 0);
    // SLA Compliance % = (calls completed within SLA ÷ total eligible calls) × 100
    const slaScore = totalTickets > 0 ? +((slaCompliant / totalTickets) * 100).toFixed(1) : null;

    // ── PM Compliance (current calendar month) ────────────────────────────────
    // Completed preventive-maintenance schedules ÷ schedules due this month × 100
    const fmtDate = (d) => d.toISOString().slice(0, 10);
    const now = new Date();
    const monthStart = fmtDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const monthEnd   = fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    let pmCompliance = null, pmDue = 0, pmCompleted = 0, pmOverdue = 0;
    try {
      const [[pm]] = await pool.query(
        `SELECT
           COUNT(*)                                                       AS pm_due,
           SUM(status = 'completed')                                      AS pm_completed,
           SUM(maintenance_date < CURDATE() AND status NOT IN ('completed','cancelled')) AS pm_overdue
         FROM pms_schedules
         WHERE ${inFilter(cids, "company_id")} AND maintenance_date BETWEEN ? AND ?`,
        [...cids, monthStart, monthEnd]
      );
      pmDue       = Number(pm.pm_due       || 0);
      pmCompleted = Number(pm.pm_completed || 0);
      pmOverdue   = Number(pm.pm_overdue   || 0);
      pmCompliance = pmDue > 0 ? +((pmCompleted / pmDue) * 100).toFixed(1) : null;
    } catch { /* pms tables may not exist on older installs */ }

    // ── Repeat Breakdown % ────────────────────────────────────────────────────
    // Assets with more than one breakdown ticket ÷ assets with any breakdown × 100
    let repeatBreakdown = null, assetsWithBreakdown = 0, assetsRepeat = 0;
    try {
      let rbWhere = `WHERE ${inFilter(cids, "aq.company_id")} AND aq.asset_id IS NOT NULL`;
      const rbParams = [...cids];
      if (dateFrom) { rbWhere += " AND aq.created_at >= ?"; rbParams.push(dateFrom); }
      if (dateTo)   { rbWhere += " AND aq.created_at <= ?"; rbParams.push(dateTo + " 23:59:59"); }
      const [[rb]] = await pool.query(
        `SELECT
           COUNT(*)          AS assets_with_breakdown,
           SUM(cnt > 1)      AS assets_repeat
         FROM (
           SELECT aq.asset_id, COUNT(*) AS cnt
           FROM asset_queries aq
           ${rbWhere}
           GROUP BY aq.asset_id
         ) t`,
        rbParams
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

    // ── MTBF (Mean Time Between Failures), fleet approximation ────────────────
    // Standard fleet formula: total operating hours ÷ number of failures.
    // Operating hours assume 24×7 asset availability over the current month
    // (typical for hospital equipment). MTBF = (assetCount × elapsedHours) ÷ failures.
    let mtbfHours = null;
    try {
      const [[ac]] = await pool.query(
        `SELECT COUNT(*) AS asset_count FROM assets WHERE ${inFilter(cids, "company_id")}`,
        cids
      );
      const assetCount = Number(ac.asset_count || 0);
      const [[fc]] = await pool.query(
        `SELECT COUNT(*) AS failures FROM asset_queries
         WHERE ${inFilter(cids, "company_id")} AND created_at BETWEEN ? AND ?`,
        [...cids, monthStart + " 00:00:00", monthEnd + " 23:59:59"]
      );
      const failures = Number(fc.failures || 0);
      const elapsedHours = Math.max(1, (now - new Date(now.getFullYear(), now.getMonth(), 1)) / 3_600_000);
      if (assetCount > 0 && failures > 0) {
        mtbfHours = Math.round((assetCount * elapsedHours) / failures);
      }
    } catch { /* ignore */ }

    res.json({
      totalTickets,
      activeTickets:   Number(stats.active_tickets  || 0),
      // Overall SLA Score Card
      slaScore,
      slaCompliant,
      slaBreached,
      slaAtRisk,
      responseSla: {
        evaluated: Number(stats.resp_evaluated || 0),
        met:       Number(stats.resp_met       || 0),
        breached:  Number(stats.resp_breached  || 0),
        pct:       pct(stats.resp_met, stats.resp_evaluated),
      },
      attendanceSla: {
        evaluated: Number(stats.att_evaluated || 0),
        met:       Number(stats.att_met       || 0),
        breached:  Number(stats.att_breached  || 0),
        pct:       pct(stats.att_met, stats.att_evaluated),
      },
      resolutionSla: {
        evaluated: Number(stats.res_evaluated || 0),
        met:       Number(stats.res_met       || 0),
        breached:  Number(stats.res_breached  || 0),
        pct:       pct(stats.res_met, stats.res_evaluated),
      },
      overallSla: {
        met:  Number(stats.overall_met || 0),
        pct:  pct(stats.overall_met, stats.total_tickets),
      },
      mttrHours,
      // PM Compliance (current month)
      pmCompliance,
      pmDue,
      pmCompleted,
      pmOverdue,
      // Repeat Breakdown
      repeatBreakdown,
      assetsWithBreakdown,
      assetsRepeat,
      // MTBF (fleet approximation, hours)
      mtbfHours,
    });
  } catch (err) { next(err); }
});

// GET /at-risk?windowMins=30&allCompanies=true — tickets whose resolution SLA expires soon
router.get("/at-risk", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const windowMins = Math.min(Number(req.query.windowMins || 60), 480);

    const [rows] = await pool.query(
      `SELECT
         aq.id AS queryId, aq.status,
         ts.priority, ts.snapshot_asset_name AS assetName,
         ts.snapshot_dept_name AS deptName,
         c.clock_type AS clockType, c.status AS clockStatus,
         COALESCE(c.adjusted_due_at, c.due_at) AS dueAt,
         c.target_mins AS targetMins,
         TIMESTAMPDIFF(MINUTE, NOW(), COALESCE(c.adjusted_due_at, c.due_at)) AS minsRemaining
       FROM ticket_sla ts
       JOIN asset_queries aq ON aq.id = ts.query_id
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       WHERE ${inFilter(cids, "ts.snapshot_company_id")}
         AND ts.is_sla_eligible = 1
         AND c.status = 'running'
         AND aq.status NOT IN ('resolved','closed')
         AND COALESCE(c.adjusted_due_at, c.due_at) BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? MINUTE)
       ORDER BY dueAt ASC
       LIMIT 50`,
      [...cids, windowMins]
    );

    res.json(rows.map(r => ({
      ...r,
      risk: r.minsRemaining <= 0 ? "breached"
          : r.minsRemaining <= 30 ? "critical"
          : "warning",
    })));
  } catch (err) { next(err); }
});

// GET /trend?months=6&allCompanies=true — monthly SLA % per clock type
router.get("/trend", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const months = Math.min(Number(req.query.months || 6), 24);

    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(ts.sla_start_time, '%Y-%m') AS month,
         c.clock_type,
         COUNT(*)                                           AS evaluated,
         SUM(CASE WHEN c.status = 'met'     THEN 1 ELSE 0 END) AS met,
         SUM(CASE WHEN c.status = 'breached'THEN 1 ELSE 0 END) AS breached
       FROM ticket_sla ts
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       WHERE ${inFilter(cids, "ts.snapshot_company_id")}
         AND ts.is_sla_eligible = 1
         AND c.status IN ('met','breached')
         AND ts.sla_start_time >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month, c.clock_type
       ORDER BY month ASC, c.clock_type ASC`,
      [...cids, months]
    );

    // Pivot into { month, response, attendance, resolution, overall }
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

// GET /by-engineer?allCompanies=true
router.get("/by-engineer", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const { dateFrom, dateTo } = req.query;

    let where = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1`;
    const params = [...cids];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }

    const [rows] = await pool.query(
      `SELECT
         cu.id AS engineerId, cu.full_name AS engineerName,
         COUNT(DISTINCT ts.id) AS totalCalls,
         COUNT(DISTINCT CASE WHEN aq.status IN ('resolved','closed') THEN ts.id END) AS resolvedCount,
         COUNT(DISTINCT CASE WHEN rc.status='met' THEN ts.id END) AS responseMet,
         COUNT(DISTINCT CASE WHEN rc.status IN ('met','breached') THEN ts.id END) AS respEvaluated,
         -- Effective resolution: clock 'met', OR ticket resolved with clock still running
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
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id  = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id  = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       ${where}
       GROUP BY cu.id, cu.full_name
       ORDER BY totalCalls DESC`,
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

// GET /tile-records?tile=overall|response|attendance|resolution|mttr|repeat&page=1&limit=20
router.get("/tile-records", async (req, res, next) => {
  try {
    const cids  = await resolveCompanyIds(req);
    const tile  = req.query.tile || "overall";
    const page  = Math.max(1, Number(req.query.page  || 1));
    const lim   = Math.min(Number(req.query.limit || 20), 100);
    const off   = (page - 1) * lim;
    const { dateFrom, dateTo } = req.query;

    let baseWhere = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1`;
    const baseParams = [...cids];
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

    // overall — one row per ticket with effective SLA status
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

// GET /by-department?allCompanies=true&dateFrom=&dateTo=&serviceType=
router.get("/by-department", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const { dateFrom, dateTo, serviceType } = req.query;

    let where = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1`;
    const params = [...cids];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    if (serviceType && serviceType !== "all") { where += " AND ts.service_type = ?"; params.push(serviceType); }

    const [rows] = await pool.query(
      `SELECT
         ts.snapshot_department_id AS deptId,
         ts.snapshot_dept_name AS deptName,
         COUNT(DISTINCT ts.id) AS totalCalls,
         -- Effective overall-met: all three clocks met (including effectively-met stuck clocks)
         COUNT(DISTINCT CASE WHEN
           (rc.status = 'met'  OR (rc.status  IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(rc.adjusted_due_at,  rc.due_at)))
           AND
           (ac.status = 'met'  OR (ac.status  IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.engineer_attended_at, aq.resolved_at, aq.updated_at) <= COALESCE(ac.adjusted_due_at, ac.due_at)))
           AND
           (esc.status = 'met' OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(esc.adjusted_due_at, esc.due_at)))
         THEN ts.id END) AS overallMet,
         -- Effective evaluated: resolution clock completed or ticket resolved
         COUNT(DISTINCT CASE WHEN
           esc.status IN ('met','breached') OR
           (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed'))
         THEN ts.id END) AS resEvaluated,
         -- Effective breach count
         COUNT(DISTINCT CASE WHEN
           esc.status = 'breached' OR
           (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND
            COALESCE(aq.resolved_at, aq.updated_at) > COALESCE(esc.adjusted_due_at, esc.due_at))
         THEN ts.id END) AS breachedCount,
         ROUND(AVG(
           CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins
                WHEN esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, COALESCE(aq.resolved_at, aq.updated_at))
                ELSE NULL END
         ), 1) AS avgMttrMins
       FROM ticket_sla ts
       LEFT JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id  = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id  = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       ${where}
       GROUP BY ts.snapshot_department_id, ts.snapshot_dept_name
       ORDER BY totalCalls DESC`,
      params
    );

    res.json(rows.map(r => ({
      ...r,
      overallPct: r.resEvaluated > 0 ? +((r.overallMet / r.resEvaluated) * 100).toFixed(1) : null,
    })));
  } catch (err) { next(err); }
});

// GET /by-equipment?limit=20&allCompanies=true&dateFrom=&dateTo=&serviceType=
router.get("/by-equipment", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const { dateFrom, dateTo, serviceType } = req.query;

    let where = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1`;
    const params = [...cids];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    if (serviceType && serviceType !== "all") { where += " AND ts.service_type = ?"; params.push(serviceType); }

    const [rows] = await pool.query(
      `SELECT
         aq.asset_id AS assetDbId,
         COALESCE(a.generated_asset_id, a.asset_unique_id, ts.snapshot_asset_name) AS assetDisplayId,
         COALESCE(a.asset_name, ts.snapshot_asset_name) AS assetName,
         COUNT(DISTINCT ts.id) AS totalCalls,
         COUNT(DISTINCT CASE WHEN
           (rc.status = 'met'  OR (rc.status  IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(rc.adjusted_due_at,  rc.due_at)))
           AND
           (ac.status = 'met'  OR (ac.status  IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.engineer_attended_at, aq.resolved_at, aq.updated_at) <= COALESCE(ac.adjusted_due_at, ac.due_at)))
           AND
           (esc.status = 'met' OR (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND COALESCE(aq.resolved_at, aq.updated_at) <= COALESCE(esc.adjusted_due_at, esc.due_at)))
         THEN ts.id END) AS overallMet,
         COUNT(DISTINCT CASE WHEN
           esc.status IN ('met','breached') OR
           (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed'))
         THEN ts.id END) AS resEvaluated,
         COUNT(DISTINCT CASE WHEN
           esc.status = 'breached' OR
           (esc.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND
            COALESCE(aq.resolved_at, aq.updated_at) > COALESCE(esc.adjusted_due_at, esc.due_at))
         THEN ts.id END) AS totalBreaches,
         ROUND(AVG(
           CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins
                WHEN esc.status IN ('running','paused') AND aq.status IN ('resolved','closed')
                THEN TIMESTAMPDIFF(MINUTE, ts.sla_start_time, COALESCE(aq.resolved_at, aq.updated_at))
                ELSE NULL END
         ), 1) AS avgMttrMins
       FROM ticket_sla ts
       LEFT JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN assets a ON a.id = aq.asset_id
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id  = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id  = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       ${where}
       GROUP BY aq.asset_id, assetDisplayId, assetName
       ORDER BY totalBreaches DESC, totalCalls DESC
       LIMIT ?`,
      [...params, limit]
    );

    res.json(rows.map(r => ({
      ...r,
      overallPct: r.resEvaluated > 0 ? +((r.overallMet / r.resEvaluated) * 100).toFixed(1) : null,
    })));
  } catch (err) { next(err); }
});

// GET /breaches?page=1&limit=20&priority=&clockType=&allCompanies=true
router.get("/breaches", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(Number(req.query.limit || 20), 100);
    const offset = (page - 1) * limit;
    const { priority, clockType, dateFrom, dateTo } = req.query;

    // Breached = explicitly 'breached', OR open ticket past-due running clock, OR resolved ticket where resolved_at > due_at
    let where = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1
      AND (c.status = 'breached'
           OR (c.status IN ('running','paused') AND aq.status NOT IN ('resolved','closed') AND COALESCE(c.adjusted_due_at, c.due_at) < NOW())
           OR (c.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND aq.resolved_at > COALESCE(c.adjusted_due_at, c.due_at)))`;
    const params = [...cids];
    if (priority  && ["P1","P2","P3","P4"].includes(priority)) { where += " AND ts.priority = ?"; params.push(priority); }
    if (clockType && ["response","attendance","resolution"].includes(clockType)) { where += " AND c.clock_type = ?"; params.push(clockType); }
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM ticket_sla ts
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       JOIN asset_queries aq ON aq.id = ts.query_id ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT
         ts.query_id AS queryId,
         ts.priority, ts.snapshot_asset_name AS assetName,
         ts.snapshot_dept_name AS deptName, ts.sla_start_time AS callTime,
         c.clock_type AS clockType, c.target_mins AS targetMins,
         c.actual_mins AS actualMins, c.breach_mins AS breachMins,
         c.completed_at AS completedAt,
         bl.breach_reason_id AS breachReasonId, br.label AS breachReason,
         bl.responsibility,
         cu.full_name AS engineerName,
         aq.status AS ticketStatus
       FROM ticket_sla ts
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN sla_breach_logs bl ON bl.clock_id = c.id
       LEFT JOIN sla_breach_reasons br ON br.id = bl.breach_reason_id
       LEFT JOIN company_users cu ON cu.id = aq.assigned_to
       ${where}
       ORDER BY ts.sla_start_time DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({ rows, total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) });
  } catch (err) { next(err); }
});

// GET /breach-reasons — for pause/breach reason dropdown in UI
router.get("/breach-reasons", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, code, label, is_pause_reason, responsibility
       FROM sla_breach_reasons WHERE is_active = 1 ORDER BY label`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /breaches/:queryId/reason — classify a breach (reason + responsibility)
router.post("/breaches/:queryId/reason", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const queryId = Number(req.params.queryId);
    const { clockType, breachReasonId, responsibility, notes } = req.body;
    if (!clockType || !["response", "attendance", "resolution"].includes(clockType)) {
      return res.status(400).json({ message: "Valid clockType (response/attendance/resolution) is required" });
    }

    // Find the clock for this ticket, scoped to the caller's company
    const [[clock]] = await pool.query(
      `SELECT c.id AS clockId, c.breach_mins AS breachMins
       FROM ticket_sla ts
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id AND c.clock_type = ?
       WHERE ts.query_id = ? AND ts.snapshot_company_id = ?`,
      [clockType, queryId, companyId]
    );
    if (!clock) return res.status(404).json({ message: "SLA clock not found for this ticket" });

    // If responsibility not given explicitly, inherit it from the reason catalogue
    let resp = responsibility || null;
    if (!resp && breachReasonId) {
      const [[br]] = await pool.query(`SELECT responsibility FROM sla_breach_reasons WHERE id = ?`, [breachReasonId]);
      resp = br?.responsibility || null;
    }

    await pool.query(
      `INSERT INTO sla_breach_logs (clock_id, breach_reason_id, responsibility, breach_mins, notes, logged_by)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         breach_reason_id = VALUES(breach_reason_id),
         responsibility   = VALUES(responsibility),
         notes            = VALUES(notes),
         logged_by        = VALUES(logged_by),
         logged_at        = NOW()`,
      [clock.clockId, breachReasonId || null, resp, clock.breachMins || 0, notes || null, req.companyUser.id]
    );
    res.json({ message: "Breach reason recorded", responsibility: resp });
  } catch (err) { next(err); }
});

// GET /breach-summary?allCompanies=true — rollups for the Breach Analysis dashboard
router.get("/breach-summary", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const { dateFrom, dateTo } = req.query;
    // Breached = explicitly 'breached', OR open ticket past-due, OR resolved-after-deadline running clock
    let where = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1
      AND (c.status = 'breached'
           OR (c.status IN ('running','paused') AND aq.status NOT IN ('resolved','closed') AND COALESCE(c.adjusted_due_at, c.due_at) < NOW())
           OR (c.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND aq.resolved_at > COALESCE(c.adjusted_due_at, c.due_at)))`;
    const params = [...cids];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }

    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS totalBreaches,
              SUM(bl.id IS NOT NULL) AS classified,
              ROUND(AVG(c.breach_mins) / 60, 1) AS avgBreachHours
       FROM ticket_sla ts
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN sla_breach_logs bl ON bl.clock_id = c.id
       ${where}`,
      params
    );
    const [byResponsibility] = await pool.query(
      `SELECT COALESCE(bl.responsibility, 'Unclassified') AS responsibility, COUNT(*) AS count
       FROM ticket_sla ts
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN sla_breach_logs bl ON bl.clock_id = c.id
       ${where}
       GROUP BY COALESCE(bl.responsibility, 'Unclassified')
       ORDER BY count DESC`,
      params
    );
    const [byReason] = await pool.query(
      `SELECT COALESCE(br.label, 'Unclassified') AS reason, COUNT(*) AS count
       FROM ticket_sla ts
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
       JOIN asset_queries aq ON aq.id = ts.query_id
       LEFT JOIN sla_breach_logs bl ON bl.clock_id = c.id
       LEFT JOIN sla_breach_reasons br ON br.id = bl.breach_reason_id
       ${where}
       GROUP BY COALESCE(br.label, 'Unclassified')
       ORDER BY count DESC`,
      params
    );
    res.json({
      totalBreaches:  Number(totals.totalBreaches || 0),
      classified:     Number(totals.classified   || 0),
      avgBreachHours: totals.avgBreachHours != null ? Number(totals.avgBreachHours) : null,
      byResponsibility,
      byReason,
    });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   UNIFIED BREAKDOWN — across Issue Resolution, PMS, Calibration
   ═══════════════════════════════════════════════════════════════════════════ */

// GET /breakdown?dateFrom=&dateTo=&department=&serviceType=issue|pms|calibration|all&engineerId=&allCompanies=true
// Returns: overallCompliance (unified), bySourceType[], byStage[], bySourceStage[]
router.get("/breakdown", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const { dateFrom, dateTo, department, serviceType, engineerId } = req.query;
    const pct = (m, t) => (t > 0 ? +((m / t) * 100).toFixed(1) : null);
    const n = (v) => Number(v || 0);

    // ── Issue Resolution (ticket_sla_clocks) ───────────────────────────────────
    let issueWhere = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1 AND c.status IN ('met','breached')`;
    const issueParams = [...cids];
    if (dateFrom)   { issueWhere += " AND ts.sla_start_time >= ?";         issueParams.push(dateFrom); }
    if (dateTo)     { issueWhere += " AND ts.sla_start_time <= ?";         issueParams.push(dateTo + " 23:59:59"); }
    if (department) { issueWhere += " AND ts.snapshot_department_id = ?";  issueParams.push(department); }
    if (engineerId) { issueWhere += " AND aq.assigned_to = ?";             issueParams.push(engineerId); }

    let issueClocks = [];
    if (!serviceType || serviceType === "issue" || serviceType === "all") {
      [issueClocks] = await pool.query(
        `SELECT c.clock_type,
                COUNT(*) AS applicable,
                SUM(CASE WHEN c.status='met'     THEN 1 ELSE 0 END) AS compliant,
                SUM(CASE WHEN c.status='breached' THEN 1 ELSE 0 END) AS breached
         FROM ticket_sla ts
         JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id
         JOIN asset_queries aq ON aq.id = ts.query_id
         ${issueWhere}
         GROUP BY c.clock_type`,
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

    // ── PMS (pms_schedule_assets + pms_schedules) ──────────────────────────────
    let pmsApplicable = 0, pmsCompliant = 0, pmsBreached = 0;
    if (!serviceType || serviceType === "pms" || serviceType === "all") {
      try {
        let pmsWhere = `WHERE ${inFilter(cids, "ps.company_id")}
          AND (psa.status IN ('completed','cancelled') OR ps.maintenance_date < CURDATE())`;
        const pmsParams = [...cids];
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
           LEFT JOIN assets a ON a.id = psa.asset_id
           ${pmsWhere}`,
          pmsParams
        );
        pmsApplicable = n(pm.applicable);
        pmsCompliant  = n(pm.compliant);
        pmsBreached   = n(pm.breached);
      } catch { /* table may not exist on all installs */ }
    }

    // ── Calibration (calibration_schedule_assets + calibration_schedules) ──────
    let calApplicable = 0, calCompliant = 0, calBreached = 0;
    if (!serviceType || serviceType === "calibration" || serviceType === "all") {
      try {
        let calWhere = `WHERE ${inFilter(cids, "cs.company_id")}
          AND (csa.status='completed' OR cs.calibration_date < CURDATE())`;
        const calParams = [...cids];
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
           LEFT JOIN assets a ON a.id = csa.asset_id
           ${calWhere}`,
          calParams
        );
        calApplicable = n(cal.applicable);
        calCompliant  = n(cal.compliant);
        calBreached   = n(cal.breached);
      } catch { /* table may not exist */ }
    }

    // ── Ticket-level overall score (resolved issue tickets only) ──────────────
    // Score = resolved tickets with NO breached SLA clock ÷ total resolved tickets.
    // Only resolved tickets are scored — open/in-progress tickets are excluded.
    let ticketTotal = 0, ticketCompliant = 0, ticketBreached = 0;
    if (!serviceType || serviceType === "issue" || serviceType === "all") {
      let tixWhere = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1 AND aq.status = 'resolved'`;
      const tixParams = [...cids];
      if (dateFrom)   { tixWhere += " AND ts.sla_start_time >= ?";         tixParams.push(dateFrom); }
      if (dateTo)     { tixWhere += " AND ts.sla_start_time <= ?";         tixParams.push(dateTo + " 23:59:59"); }
      if (department) { tixWhere += " AND ts.snapshot_department_id = ?";  tixParams.push(department); }
      if (engineerId) { tixWhere += " AND aq.assigned_to = ?";             tixParams.push(engineerId); }
      const [[tix]] = await pool.query(
        `SELECT COUNT(DISTINCT ts.id) AS total,
           SUM(CASE WHEN EXISTS (
               -- Resolution met: explicitly met, OR running clock resolved before deadline
               SELECT 1 FROM ticket_sla_clocks c_res
               WHERE c_res.ticket_sla_id = ts.id AND c_res.clock_type = 'resolution'
                 AND (c_res.status = 'met'
                   OR (c_res.status IN ('running','paused')
                       AND aq.resolved_at IS NOT NULL
                       AND aq.resolved_at <= COALESCE(c_res.adjusted_due_at, c_res.due_at)))
             ) AND NOT EXISTS (
               -- No breached clock: neither explicitly breached nor resolved-after-deadline running clock
               SELECT 1 FROM ticket_sla_clocks c_any
               WHERE c_any.ticket_sla_id = ts.id
                 AND (c_any.status = 'breached'
                   OR (c_any.status IN ('running','paused')
                       AND aq.resolved_at IS NOT NULL
                       AND aq.resolved_at > COALESCE(c_any.adjusted_due_at, c_any.due_at)))
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

    // Clock totals across all sources (for breakdown tables — informational only)
    const clockGrandApplicable = issueTotalApplicable + pmsApplicable + calApplicable;
    const clockGrandCompliant  = issueTotalCompliant  + pmsCompliant  + calCompliant;
    const clockGrandBreached   = issueTotalBreached   + pmsBreached   + calBreached;

    // Resolution clock-level bucket (issue only per spec)
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

/* ═══════════════════════════════════════════════════════════════════════════
   BREACH DETAILS — drill-down for individual records
   ═══════════════════════════════════════════════════════════════════════════ */

// GET /breach-details?source=issue|pms|calibration&stage=&page=1&limit=20&dateFrom=&dateTo=&department=&priority=&engineerId=&allCompanies=true
router.get("/breach-details", async (req, res, next) => {
  try {
    const cids = await resolveCompanyIds(req);
    const { source = "issue", stage, dateFrom, dateTo, department, priority, engineerId } = req.query;
    const page   = Math.max(1, Number(req.query.page  || 1));
    const limit  = Math.min(Number(req.query.limit || 20), 100);
    const offset = (page - 1) * limit;

    if (source === "issue") {
      // Breached = explicitly 'breached', OR open ticket past-due, OR resolved-after-deadline running clock
      let where = `WHERE ${inFilter(cids, "ts.snapshot_company_id")} AND ts.is_sla_eligible = 1
        AND (c.status = 'breached'
             OR (c.status IN ('running','paused') AND aq.status NOT IN ('resolved','closed') AND COALESCE(c.adjusted_due_at, c.due_at) < NOW())
             OR (c.status IN ('running','paused') AND aq.status IN ('resolved','closed') AND aq.resolved_at > COALESCE(c.adjusted_due_at, c.due_at)))`;
      const params = [...cids];
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
      let where = `WHERE ${inFilter(cids, "ps.company_id")}
        AND ((psa.status='completed' AND DATE(psa.completed_at) > ps.maintenance_date)
          OR (psa.status NOT IN ('completed','cancelled') AND ps.maintenance_date < CURDATE()))`;
      const params = [...cids];
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
                TIMESTAMPDIFF(MINUTE, CONCAT(ps.maintenance_date,' 00:00:00'), CONCAT(ps.maintenance_date,' 23:59:59')) AS targetMins,
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
      let where = `WHERE ${inFilter(cids, "cs.company_id")}
        AND ((csa.status='completed' AND DATE(csa.completed_at) > cs.calibration_date)
          OR (csa.status != 'completed' AND cs.calibration_date < CURDATE()))`;
      const params = [...cids];
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
