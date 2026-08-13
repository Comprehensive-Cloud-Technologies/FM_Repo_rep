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

// GET /dashboard?dateFrom=&dateTo=&priority=
router.get("/dashboard", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { dateFrom, dateTo, priority } = req.query;

    let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1";
    const params = [companyId];

    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }
    if (priority && ["P1","P2","P3","P4"].includes(priority)) {
      where += " AND ts.priority = ?"; params.push(priority);
    }

    const [[stats]] = await pool.query(
      `SELECT
         COUNT(DISTINCT ts.id)                                                        AS total_tickets,
         -- Response SLA
         COUNT(DISTINCT CASE WHEN rc.status IN ('met','breached') THEN ts.id END)    AS resp_evaluated,
         COUNT(DISTINCT CASE WHEN rc.status = 'met'              THEN ts.id END)     AS resp_met,
         COUNT(DISTINCT CASE WHEN rc.status = 'breached'         THEN ts.id END)     AS resp_breached,
         -- Attendance SLA
         COUNT(DISTINCT CASE WHEN ac.status IN ('met','breached') THEN ts.id END)    AS att_evaluated,
         COUNT(DISTINCT CASE WHEN ac.status = 'met'              THEN ts.id END)     AS att_met,
         COUNT(DISTINCT CASE WHEN ac.status = 'breached'         THEN ts.id END)     AS att_breached,
         -- Resolution SLA
         COUNT(DISTINCT CASE WHEN esc.status IN ('met','breached') THEN ts.id END)   AS res_evaluated,
         COUNT(DISTINCT CASE WHEN esc.status = 'met'              THEN ts.id END)    AS res_met,
         COUNT(DISTINCT CASE WHEN esc.status = 'breached'         THEN ts.id END)    AS res_breached,
         -- Overall (all clocks met)
         COUNT(DISTINCT CASE
           WHEN rc.status IS NOT NULL AND ac.status IS NOT NULL AND esc.status IS NOT NULL
                AND rc.status = 'met' AND ac.status = 'met' AND esc.status = 'met'
           THEN ts.id END)                                                           AS overall_met,
         -- MTTR: avg actual resolution minutes
         ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins END) / 60, 1) AS mttr_hours,
         -- Active (open) ticket count
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

    const totalEligible = Number(stats.resp_evaluated || 0) ||
                          Number(stats.att_evaluated  || 0) ||
                          Number(stats.res_evaluated  || 0);

    res.json({
      totalTickets:    Number(stats.total_tickets   || 0),
      activeTickets:   Number(stats.active_tickets  || 0),
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
        pct:  pct(stats.overall_met, stats.res_evaluated),
      },
      mttrHours: stats.mttr_hours != null ? Number(stats.mttr_hours) : null,
    });
  } catch (err) { next(err); }
});

// GET /at-risk?windowMins=30 — tickets whose resolution SLA expires soon
router.get("/at-risk", async (req, res, next) => {
  try {
    const companyId = cid(req);
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
       WHERE ts.snapshot_company_id = ?
         AND ts.is_sla_eligible = 1
         AND c.status = 'running'
         AND aq.status NOT IN ('resolved','closed')
         AND COALESCE(c.adjusted_due_at, c.due_at) BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL ? MINUTE)
       ORDER BY dueAt ASC
       LIMIT 50`,
      [companyId, windowMins]
    );

    res.json(rows.map(r => ({
      ...r,
      risk: r.minsRemaining <= 0 ? "breached"
          : r.minsRemaining <= 30 ? "critical"
          : "warning",
    })));
  } catch (err) { next(err); }
});

// GET /trend?months=6 — monthly SLA % per clock type
router.get("/trend", async (req, res, next) => {
  try {
    const companyId = cid(req);
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
       WHERE ts.snapshot_company_id = ?
         AND ts.is_sla_eligible = 1
         AND c.status IN ('met','breached')
         AND ts.sla_start_time >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month, c.clock_type
       ORDER BY month ASC, c.clock_type ASC`,
      [companyId, months]
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

// GET /by-engineer
router.get("/by-engineer", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { dateFrom, dateTo } = req.query;

    let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1";
    const params = [companyId];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }

    const [rows] = await pool.query(
      `SELECT
         cu.id AS engineerId, cu.full_name AS engineerName,
         COUNT(DISTINCT ts.id)                                                   AS totalCalls,
         COUNT(DISTINCT CASE WHEN rc.status = 'met' AND ac.status = 'met' AND esc.status = 'met'
                             THEN ts.id END)                                     AS overallMet,
         COUNT(DISTINCT CASE WHEN rc.status = 'met'  THEN ts.id END)            AS responseMet,
         COUNT(DISTINCT CASE WHEN rc.status IN ('met','breached') THEN ts.id END) AS respEvaluated,
         COUNT(DISTINCT CASE WHEN esc.status = 'met' THEN ts.id END)            AS resMet,
         COUNT(DISTINCT CASE WHEN esc.status IN ('met','breached') THEN ts.id END) AS resEvaluated,
         ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins END)/60,1) AS avgMttrHours
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
      overallPct:  r.resEvaluated > 0 ? +((r.overallMet  / r.resEvaluated) * 100).toFixed(1) : null,
      responsePct: r.respEvaluated> 0 ? +((r.responseMet / r.respEvaluated)* 100).toFixed(1) : null,
      resPct:      r.resEvaluated > 0 ? +((r.resMet      / r.resEvaluated) * 100).toFixed(1) : null,
    })));
  } catch (err) { next(err); }
});

// GET /by-department
router.get("/by-department", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const { dateFrom, dateTo } = req.query;

    let where = "WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1";
    const params = [companyId];
    if (dateFrom) { where += " AND ts.sla_start_time >= ?"; params.push(dateFrom); }
    if (dateTo)   { where += " AND ts.sla_start_time <= ?"; params.push(dateTo + " 23:59:59"); }

    const [rows] = await pool.query(
      `SELECT
         ts.snapshot_department_id AS deptId,
         ts.snapshot_dept_name AS deptName,
         COUNT(DISTINCT ts.id) AS totalCalls,
         COUNT(DISTINCT CASE WHEN rc.status='met' AND ac.status='met' AND esc.status='met' THEN ts.id END) AS overallMet,
         COUNT(DISTINCT CASE WHEN esc.status IN ('met','breached') THEN ts.id END) AS resEvaluated,
         ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins END)/60,1) AS avgMttrHours
       FROM ticket_sla ts
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

// GET /by-equipment?limit=20
router.get("/by-equipment", async (req, res, next) => {
  try {
    const companyId = cid(req);
    const limit = Math.min(Number(req.query.limit || 20), 100);

    const [rows] = await pool.query(
      `SELECT
         ts.snapshot_asset_id AS assetId,
         ts.snapshot_asset_name AS assetName,
         COUNT(DISTINCT ts.id) AS totalCalls,
         COUNT(DISTINCT CASE WHEN rc.status='met' AND ac.status='met' AND esc.status='met' THEN ts.id END) AS overallMet,
         COUNT(DISTINCT CASE WHEN esc.status IN ('met','breached') THEN ts.id END) AS resEvaluated,
         SUM(CASE WHEN esc.status = 'breached' THEN 1 ELSE 0 END) AS totalBreaches,
         ROUND(AVG(CASE WHEN esc.status IN ('met','breached') THEN esc.actual_mins END)/60,1) AS avgMttrHours,
         ROUND(365.0 * COUNT(DISTINCT ts.snapshot_asset_id)
               / NULLIF(COUNT(DISTINCT ts.id), 0), 0) AS mtbfDays
       FROM ticket_sla ts
       LEFT JOIN ticket_sla_clocks rc  ON rc.ticket_sla_id  = ts.id AND rc.clock_type = 'response'
       LEFT JOIN ticket_sla_clocks ac  ON ac.ticket_sla_id  = ts.id AND ac.clock_type = 'attendance'
       LEFT JOIN ticket_sla_clocks esc ON esc.ticket_sla_id = ts.id AND esc.clock_type = 'resolution'
       WHERE ts.snapshot_company_id = ? AND ts.is_sla_eligible = 1
       GROUP BY ts.snapshot_asset_id, ts.snapshot_asset_name
       ORDER BY totalBreaches DESC, totalCalls DESC
       LIMIT ?`,
      [companyId, limit]
    );

    res.json(rows.map(r => ({
      ...r,
      overallPct: r.resEvaluated > 0 ? +((r.overallMet / r.resEvaluated) * 100).toFixed(1) : null,
    })));
  } catch (err) { next(err); }
});

// GET /breaches?page=1&limit=20&priority=&clockType=
router.get("/breaches", async (req, res, next) => {
  try {
    const companyId = cid(req);
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
      `SELECT COUNT(*) AS total FROM ticket_sla ts
       JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id ${where}`,
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

export default router;
