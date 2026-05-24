/**
 * publicDashboard.js
 * Public (no-auth) endpoints accessible via company public_token.
 * GET /api/public/:token/dashboard  – asset & request summary
 */
import { Router } from "express";
import pool from "../db.js";

const router = Router();

router.get("/:token/dashboard", async (req, res, next) => {
  try {
    const { token } = req.params;

    // Look up the company by public token
    const [[company]] = await pool.query(
      `SELECT id, company_name, logo_url, sectors, sector
       FROM companies WHERE public_token = ? AND status = 'Active' LIMIT 1`,
      [token]
    );
    if (!company) return res.status(404).json({ message: "Dashboard not found." });

    const cid = company.id;

    // Asset snapshot (same shape as HC /snapshot endpoint)
    const [[snap]] = await pool.query(
      `SELECT
         COUNT(*)                                                       AS total,
         SUM(CASE WHEN is_verified = 1 THEN 1 ELSE 0 END)             AS verified,
         SUM(CASE WHEN criticality = 'Critical' THEN 1 ELSE 0 END)    AS critical,
         SUM(CASE WHEN criticality = 'Non_Critical' THEN 1 ELSE 0 END) AS non_critical,
         SUM(CASE WHEN working_status = 'Working' THEN 1 ELSE 0 END)  AS working,
         SUM(CASE WHEN working_status = 'WIP' THEN 1 ELSE 0 END)      AS wip,
         SUM(CASE WHEN working_status = 'Not_Working' THEN 1 ELSE 0 END) AS not_working,
         SUM(status = 'Active') AS active,
         SUM(status = 'Inactive') AS inactive
       FROM assets WHERE company_id = ?`,
      [cid]
    );

    // Pie: Working status distribution
    const [statusDist] = await pool.query(
      `SELECT working_status AS name, COUNT(*) AS value
       FROM assets WHERE company_id = ?
       GROUP BY working_status`,
      [cid]
    );

    // Bar: Criticality by department (top 10)
    const [critByDept] = await pool.query(
      `SELECT COALESCE(d.name,'Unknown') AS dept,
              SUM(CASE WHEN a.criticality='Critical' THEN 1 ELSE 0 END)     AS critical,
              SUM(CASE WHEN a.criticality='Non_Critical' THEN 1 ELSE 0 END) AS non_critical
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       WHERE a.company_id = ?
       GROUP BY d.id, d.name
       ORDER BY (critical + non_critical) DESC
       LIMIT 10`,
      [cid]
    );

    // Line: monthly PMS + call log trends (12 months)
    const [monthlyPms] = await pool.query(
      `SELECT DATE_FORMAT(scheduled_date,'%Y-%m') AS month, COUNT(*) AS pms_count
       FROM hc_pms_records
       WHERE company_id = ? AND scheduled_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY month ORDER BY month`,
      [cid]
    );
    const [monthlyCalls] = await pool.query(
      `SELECT DATE_FORMAT(call_date,'%Y-%m') AS month, COUNT(*) AS call_count
       FROM hc_call_logs
       WHERE company_id = ? AND call_date >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
       GROUP BY month ORDER BY month`,
      [cid]
    );
    const trendMap = {};
    monthlyPms.forEach(r => { trendMap[r.month] = { month: r.month, pms: Number(r.pms_count), calls: 0 }; });
    monthlyCalls.forEach(r => {
      if (!trendMap[r.month]) trendMap[r.month] = { month: r.month, pms: 0, calls: 0 };
      trendMap[r.month].calls = Number(r.call_count);
    });
    const monthlyTrend = Object.values(trendMap).sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      company: {
        name: company.company_name,
        logoUrl: company.logo_url,
      },
      snapshot: {
        total:       Number(snap.total       || 0),
        verified:    Number(snap.verified    || 0),
        critical:    Number(snap.critical    || 0),
        nonCritical: Number(snap.non_critical|| 0),
        working:     Number(snap.working     || 0),
        wip:         Number(snap.wip         || 0),
        notWorking:  Number(snap.not_working || 0),
      },
      charts: {
        statusDistribution: statusDist.map(r => ({ name: r.name || 'Unknown', value: Number(r.value) })),
        criticalityByDept:  critByDept.map(r => ({ dept: r.dept, critical: Number(r.critical), nonCritical: Number(r.non_critical) })),
        monthlyTrend,
      },
    });
  } catch (err) { next(err); }
});

export default router;
