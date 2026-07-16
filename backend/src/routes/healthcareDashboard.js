/**
 * Healthcare Asset Management Dashboard API
 * Prefix: /api/company-portal/healthcare
 *
 * All routes require company-portal JWT (requireCompanyAuth).
 * All data is scoped to the authenticated company.
 */

import { Router } from "express";
import { query, body, param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();
router.use(requireCompanyAuth);

/* ─── helpers ─────────────────────────────────────────────────────────────── */

// Returns all company IDs accessible to a user (primary + user_company_access rows)
async function getAccessibleCompanyIds(userId, primaryCompanyId) {
  const [extra] = await pool.query(
    `SELECT company_id AS companyId FROM user_company_access WHERE user_id = ?`,
    [userId]
  ).catch(() => [[]]);
  const ids = new Set([Number(primaryCompanyId)]);
  extra.forEach((r) => ids.add(Number(r.companyId)));
  return [...ids];
}
const paginationParams = [
  query("page").optional().isInt({ min: 1 }),
  query("limit").optional().isInt({ min: 1, max: 500 }),
];

const filterParams = [
  ...paginationParams,
  query("dateFrom").optional().isDate(),
  query("dateTo").optional().isDate(),
  query("departmentId").optional().isInt({ min: 1 }),
  query("assetCategory").optional().isString().trim(),
  query("location").optional().isString().trim(),
  query("status").optional().isString().trim(),
  query("criticality").optional().isString().trim(),
  query("search").optional().isString().trim(),
  query("rber").optional(),
  query("condemned").optional(),
  query("isVerified").optional(),
  query("workingStatus").optional().isString().trim(),
  query("verified").optional(),
];

function buildAssetWhere(companyId, q) {
  let where = "WHERE a.company_id = ?";
  const p = [companyId];

  if (q.departmentId) { where += " AND a.department_id = ?"; p.push(Number(q.departmentId)); }
  if (q.location)     { where += " AND (a.building LIKE ? OR a.floor LIKE ? OR a.room LIKE ? OR a.location_detail LIKE ?)";
    const loc = `%${q.location}%`; p.push(loc, loc, loc, loc); }
  if (q.assetCategory){ where += " AND a.asset_category = ?"; p.push(q.assetCategory); }
  if (q.criticality)  { where += " AND a.criticality = ?";    p.push(q.criticality); }
  if (q.workingStatus){ where += " AND a.working_status = ?"; p.push(q.workingStatus); }
  if (q.status) {
    if (q.status === 'verified') {
      where += " AND a.is_verified = 1";
    } else if (q.status === 'unverified') {
      where += " AND (a.is_verified = 0 OR a.is_verified IS NULL)";
    } else {
      where += " AND a.status = ?"; p.push(q.status);
    }
  }
  if (q.verified === "true" || q.verified === "1") { where += " AND a.is_verified = 1"; }
  if (q.verified === "false" || q.verified === "0") { where += " AND (a.is_verified = 0 OR a.is_verified IS NULL)"; }
  if (q.isVerified !== undefined && q.isVerified !== "") {
    where += " AND a.is_verified = ?";
    p.push(q.isVerified === "true" || q.isVerified === "1" ? 1 : 0);
  }
  if (q.rber)      { where += " AND (a.working_status = 'RBER' OR EXISTS (SELECT 1 FROM asset_details ad2 WHERE ad2.asset_id = a.id AND (JSON_EXTRACT(ad2.metadata,'$.rber') = true OR JSON_EXTRACT(ad2.metadata,'$.rber') = 1)))"; }
  if (q.condemned) { where += " AND (a.working_status = 'Condemned' OR EXISTS (SELECT 1 FROM asset_details ad2 WHERE ad2.asset_id = a.id AND (JSON_EXTRACT(ad2.metadata,'$.condemned') = true OR JSON_EXTRACT(ad2.metadata,'$.condemned') = 1)))"; }
  if (q.search)    { where += " AND (a.asset_name LIKE ? OR a.asset_unique_id LIKE ?)";
    const s = `%${q.search}%`; p.push(s, s); }

  return { where, p };
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. ASSET SNAPSHOT — KPI cards
   GET /api/company-portal/healthcare/snapshot
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/snapshot", validate(filterParams), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const { where, p } = buildAssetWhere(companyId, req.query);

    const [[assetRow], [[reqStats]], [[calibrationStats]]] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                                    AS total,
           SUM(CASE WHEN a.is_verified = 1 THEN 1 ELSE 0 END)         AS verified,
           SUM(CASE WHEN a.is_verified = 0 OR a.is_verified IS NULL THEN 1 ELSE 0 END) AS unverified,
           SUM(CASE WHEN a.criticality = 'Critical' THEN 1 ELSE 0 END) AS critical,
           SUM(CASE WHEN a.criticality = 'Non_Critical' THEN 1 ELSE 0 END) AS non_critical,
           SUM(CASE WHEN a.working_status = 'HNF' THEN 1 ELSE 0 END)         AS hnf,
           SUM(CASE WHEN a.working_status = 'Working' THEN 1 ELSE 0 END)   AS working,
           SUM(CASE WHEN a.working_status = 'WIP' THEN 1 ELSE 0 END)       AS wip,
           SUM(CASE WHEN a.working_status = 'Not_Working' THEN 1 ELSE 0 END) AS not_working,
           SUM(CASE WHEN a.working_status = 'RBER'
                      OR JSON_EXTRACT(ad.metadata, '$.rber') = true
                      OR JSON_EXTRACT(ad.metadata, '$.rber') = 1 THEN 1 ELSE 0 END) AS rber,
           SUM(CASE WHEN a.working_status = 'Condemned'
                      OR JSON_EXTRACT(ad.metadata, '$.condemned') = true
                      OR JSON_EXTRACT(ad.metadata, '$.condemned') = 1 THEN 1 ELSE 0 END) AS condemned,
           SUM(CASE WHEN a.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS new_addition,
           COALESCE(SUM(
             CASE WHEN REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\\.[0-9]+)?$'
                  THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2))
                  ELSE 0 END
           ), 0) AS total_asset_value,
           /* Per maintenance-type costs: attribute purchaseCost to each selected type */
           COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = 1)
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS high_end_cost,
           COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.catalyst') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.catalyst') = 1)
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS catalyst_cost,
           COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.warranty') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.warranty') = 1)
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS warranty_cost,
           COALESCE(SUM(CASE WHEN ((JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.amc') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.amc') = 1))
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS amc_cost,
           COALESCE(SUM(CASE WHEN ((JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.cmc') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.cmc') = 1))
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS cmc_cost,
           COALESCE(SUM(CASE WHEN ((JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.client') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.client') = 1))
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS client_cost
         FROM assets a
         LEFT JOIN asset_details ad ON ad.asset_id = a.id
         ${where}`,
        p
      ),
      pool.query(
        `SELECT
           COUNT(*)                                                                                   AS total_requests,
           SUM(CASE WHEN status IN ('open','wip','in_progress') THEN 1 ELSE 0 END)                   AS wip_requests,
           SUM(CASE WHEN status IN ('open','wip','in_progress') AND DATEDIFF(CURDATE(), DATE(created_at)) < 7  THEN 1 ELSE 0 END) AS wip_lt7,
           SUM(CASE WHEN status IN ('open','wip','in_progress') AND DATEDIFF(CURDATE(), DATE(created_at)) >= 7 THEN 1 ELSE 0 END) AS wip_gt7,
           SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END)                                      AS resolved_requests,
           SUM(CASE WHEN status = 'closed'   THEN 1 ELSE 0 END)                                      AS closed_requests
         FROM asset_queries
         WHERE company_id = ?`,
        [companyId]
      ),
      pool.query(
        `SELECT
           SUM(CASE WHEN a.calibration_required = 1
                     AND a.next_calibration_due_date IS NOT NULL
                     AND YEAR(a.next_calibration_due_date) = YEAR(CURDATE())
                     AND MONTH(a.next_calibration_due_date) = MONTH(CURDATE())
                    THEN 1 ELSE 0 END) AS due_this_month,
           SUM(CASE WHEN a.calibration_required = 1
                     AND a.next_calibration_due_date IS NOT NULL
                     AND a.next_calibration_due_date < CURDATE()
                    THEN 1 ELSE 0 END) AS overdue,
           SUM(CASE WHEN a.calibration_required = 1
                     AND a.next_calibration_due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
                    THEN 1 ELSE 0 END) AS upcoming,
           (
             SELECT COUNT(*)
             FROM calibration_records cr
             JOIN assets ax ON ax.id = cr.asset_id
             WHERE ax.company_id = ?
               AND YEAR(cr.calibration_date) = YEAR(CURDATE())
               AND MONTH(cr.calibration_date) = MONTH(CURDATE())
               AND LOWER(COALESCE(cr.status, '')) IN ('active', 'pass', 'completed')
           ) AS completed_this_month
         FROM assets a
         WHERE a.company_id = ?`,
        [companyId, companyId]
      ),
    ]);

    const snap = assetRow[0];
    res.json({
      total:        Number(snap.total        || 0),
      verified:     Number(snap.verified     || 0),
      unverified:   Number(snap.unverified   || 0),
      critical:     Number(snap.critical     || 0),
      nonCritical:  Number(snap.non_critical || 0),
      hnf:          Number(snap.hnf          || 0),
      working:      Number(snap.working      || 0),
      wip:          Number(snap.wip          || 0),
      notWorking:   Number(snap.not_working  || 0),
      rber:         Number(snap.rber         || 0),
      condemned:    Number(snap.condemned    || 0),
      newAddition:  Number(snap.new_addition || 0),
      totalAssetValue: Number(snap.total_asset_value || 0),
      // Per-maintenance-type cost breakdown
      highEndCost:    Number(snap.high_end_cost   || 0),
      catalystCost:   Number(snap.catalyst_cost   || 0),
      warrantyCost:   Number(snap.warranty_cost   || 0),
      amcCost:        Number(snap.amc_cost       || 0),
      cmcCost:        Number(snap.cmc_cost       || 0),
      clientCost:     Number(snap.client_cost    || 0),
      // Complaint / Request Profile
      totalComplaints:  Number(reqStats.total_requests    || 0),
      wipComplaints:    Number(reqStats.wip_requests      || 0),
      wipLt7:           Number(reqStats.wip_lt7           || 0),
      wipGt7:           Number(reqStats.wip_gt7           || 0),
      resolvedComplaints: Number(reqStats.resolved_requests || 0),
      closedComplaints:   Number(reqStats.closed_requests   || 0),
      calibrationDueThisMonth: Number(calibrationStats.due_this_month || 0),
      calibrationOverdue: Number(calibrationStats.overdue || 0),
      calibrationUpcoming: Number(calibrationStats.upcoming || 0),
      calibrationCompletedThisMonth: Number(calibrationStats.completed_this_month || 0),
    });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   1b. AGGREGATE SNAPSHOT — all companies the user has access to
   GET /api/company-portal/healthcare/aggregate-snapshot
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/aggregate-snapshot", async (req, res, next) => {
  try {
    const userId    = req.companyUser.id;
    const primaryId = req.companyUser.companyId;

    // Collect all accessible company IDs
    const [extra] = await pool.query(
      `SELECT company_id FROM user_company_access WHERE user_id = ?`,
      [userId]
    ).catch(() => [[]]);
    const companyIds = [...new Set([primaryId, ...extra.map(r => r.company_id)])];
    const placeholders = companyIds.map(() => '?').join(',');

    const [[assetRow], [[reqStats]], [[calibStats]], [deptRows]] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)                                                             AS total,
           SUM(CASE WHEN a.is_verified = 1 THEN 1 ELSE 0 END)                 AS verified,
           SUM(CASE WHEN a.criticality = 'Critical' THEN 1 ELSE 0 END)        AS critical,
           SUM(CASE WHEN a.criticality = 'Non_Critical' THEN 1 ELSE 0 END)    AS non_critical,
           SUM(CASE WHEN a.working_status = 'HNF' THEN 1 ELSE 0 END)         AS hnf,
           SUM(CASE WHEN a.working_status = 'Working' THEN 1 ELSE 0 END)      AS working,
           SUM(CASE WHEN a.working_status = 'WIP' THEN 1 ELSE 0 END)          AS wip,
           SUM(CASE WHEN a.working_status = 'Not_Working' THEN 1 ELSE 0 END)  AS not_working,
           SUM(CASE WHEN a.working_status = 'RBER'
                      OR JSON_EXTRACT(ad.metadata,'$.rber') = true
                      OR JSON_EXTRACT(ad.metadata,'$.rber') = 1 THEN 1 ELSE 0 END) AS rber,
           SUM(CASE WHEN a.working_status = 'Condemned' OR JSON_EXTRACT(ad.metadata,'$.condemned') = true OR JSON_EXTRACT(ad.metadata,'$.condemned') = 1 THEN 1 ELSE 0 END) AS condemned,
           COALESCE(SUM(
             CASE WHEN REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') AS DECIMAL(15,2))
             ELSE 0 END
           ), 0) AS total_asset_value,
           COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.highEnd') = true OR JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.highEnd') = 1)
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') AS DECIMAL(15,2)) ELSE 0 END), 0) AS high_end_cost,
           COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.catalyst') = true OR JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.catalyst') = 1)
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') AS DECIMAL(15,2)) ELSE 0 END), 0) AS catalyst_cost,
           COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.warranty') = true OR JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.warranty') = 1)
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') AS DECIMAL(15,2)) ELSE 0 END), 0) AS warranty_cost,
           COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.amc') = true OR JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.amc') = 1)
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') AS DECIMAL(15,2)) ELSE 0 END), 0) AS amc_cost,
           COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.cmc') = true OR JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.cmc') = 1)
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') AS DECIMAL(15,2)) ELSE 0 END), 0) AS cmc_cost,
           COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.client') = true OR JSON_EXTRACT(ad.metadata,'$.maintenanceTypes.client') = 1)
             AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') REGEXP '^[0-9]+(\\.[0-9]+)?$'
             THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')),''),',',''),' ','') AS DECIMAL(15,2)) ELSE 0 END), 0) AS client_cost
         FROM assets a LEFT JOIN asset_details ad ON ad.asset_id = a.id
         WHERE a.company_id IN (${placeholders})`,
        companyIds
      ),
      pool.query(
        `SELECT
           COUNT(*) AS total_requests,
           SUM(CASE WHEN status IN ('open','wip','in_progress') THEN 1 ELSE 0 END) AS wip_requests,
           SUM(CASE WHEN status IN ('open','wip','in_progress') AND DATEDIFF(CURDATE(), DATE(created_at)) < 7  THEN 1 ELSE 0 END) AS wip_lt7,
           SUM(CASE WHEN status IN ('open','wip','in_progress') AND DATEDIFF(CURDATE(), DATE(created_at)) >= 7 THEN 1 ELSE 0 END) AS wip_gt7,
           SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved_requests,
           SUM(CASE WHEN status = 'closed'   THEN 1 ELSE 0 END) AS closed_requests
         FROM asset_queries WHERE company_id IN (${placeholders})`,
        companyIds
      ),
      pool.query(
        `SELECT
           SUM(CASE WHEN a.calibration_required = 1 AND a.next_calibration_due_date IS NOT NULL
             AND YEAR(a.next_calibration_due_date) = YEAR(CURDATE())
             AND MONTH(a.next_calibration_due_date) = MONTH(CURDATE()) THEN 1 ELSE 0 END) AS due_this_month,
           SUM(CASE WHEN a.calibration_required = 1 AND a.next_calibration_due_date IS NOT NULL
             AND a.next_calibration_due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue,
           SUM(CASE WHEN a.calibration_required = 1
             AND a.next_calibration_due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS upcoming,
           (SELECT COUNT(*) FROM calibration_records cr JOIN assets ax ON ax.id = cr.asset_id
            WHERE ax.company_id IN (${placeholders})
              AND YEAR(cr.calibration_date) = YEAR(CURDATE())
              AND MONTH(cr.calibration_date) = MONTH(CURDATE())
              AND LOWER(COALESCE(cr.status, '')) IN ('active', 'pass', 'completed')) AS completed_this_month
         FROM assets a WHERE a.company_id IN (${placeholders})`,
        [...companyIds, ...companyIds]
      ),
      pool.query(
        `SELECT c.id AS company_id, COALESCE(c.company_name,'Unknown Hospital') AS hospital,
                d.id AS dept_id, COALESCE(d.name,'Unknown') AS dept,
                SUM(CASE WHEN a.criticality='Critical' THEN 1 ELSE 0 END)     AS critical,
                SUM(CASE WHEN a.criticality='Non_Critical' THEN 1 ELSE 0 END) AS non_critical
         FROM assets a
         LEFT JOIN departments d ON d.id = a.department_id
         LEFT JOIN companies c ON c.id = a.company_id
         WHERE a.company_id IN (${placeholders})
         GROUP BY c.id, c.company_name, d.id, d.name
         ORDER BY c.company_name, (SUM(CASE WHEN a.criticality='Critical' THEN 1 ELSE 0 END) + SUM(CASE WHEN a.criticality='Non_Critical' THEN 1 ELSE 0 END)) DESC`,
        companyIds
      ),
    ]);

    const snap = assetRow[0];
    res.json({
      total:        Number(snap.total        || 0),
      verified:     Number(snap.verified     || 0),
      critical:     Number(snap.critical     || 0),
      nonCritical:  Number(snap.non_critical || 0),
      hnf:          Number(snap.hnf          || 0),
      working:      Number(snap.working      || 0),
      wip:          Number(snap.wip          || 0),
      notWorking:   Number(snap.not_working  || 0),
      rber:         Number(snap.rber         || 0),
      condemned:    Number(snap.condemned    || 0),
      totalAssetValue:  Number(snap.total_asset_value || 0),
      highEndCost:      Number(snap.high_end_cost     || 0),
      catalystCost:     Number(snap.catalyst_cost     || 0),
      warrantyCost:     Number(snap.warranty_cost     || 0),
      amcCost:          Number(snap.amc_cost          || 0),
      cmcCost:          Number(snap.cmc_cost          || 0),
      clientCost:       Number(snap.client_cost       || 0),
      totalComplaints:    Number(reqStats.total_requests    || 0),
      wipComplaints:      Number(reqStats.wip_requests      || 0),
      wipLt7:             Number(reqStats.wip_lt7           || 0),
      wipGt7:             Number(reqStats.wip_gt7           || 0),
      resolvedComplaints: Number(reqStats.resolved_requests || 0),
      closedComplaints:   Number(reqStats.closed_requests   || 0),
      calibrationDueThisMonth:       Number(calibStats.due_this_month       || 0),
      calibrationOverdue:            Number(calibStats.overdue              || 0),
      calibrationUpcoming:           Number(calibStats.upcoming             || 0),
      calibrationCompletedThisMonth: Number(calibStats.completed_this_month || 0),
      criticalityByDept: deptRows.map(r => ({
        deptId:      r.dept_id,
        dept:        r.dept,
        companyId:   r.company_id,
        hospital:    r.hospital,
        critical:    Number(r.critical    || 0),
        nonCritical: Number(r.non_critical || 0),
      })),
      companies: companyIds,
    });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   2. CHART DATA
   GET /api/company-portal/healthcare/charts
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/charts", validate([
  query("months").optional().isInt({ min: 1, max: 36 }),
  ...filterParams,
]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const months    = Math.min(Number(req.query.months || 12), 36);
    const { where, p } = buildAssetWhere(companyId, req.query);

    // Pie: Working vs WIP vs Not_Working
    const [statusDist] = await pool.query(
      `SELECT COALESCE(a.working_status, 'Working') AS name, COUNT(*) AS value
       FROM assets a ${where}
       GROUP BY COALESCE(a.working_status, 'Working')`,
      p
    );

    // Bar: Critical vs Non_Critical by department — all departments, no limit
    const [critByDept] = await pool.query(
      `SELECT d.id AS dept_id, COALESCE(d.name,'Unknown') AS dept,
              SUM(CASE WHEN a.criticality='Critical' THEN 1 ELSE 0 END)     AS critical,
              SUM(CASE WHEN a.criticality='Non_Critical' THEN 1 ELSE 0 END) AS non_critical
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       ${where}
       GROUP BY d.id, d.name
       ORDER BY (critical + non_critical) DESC`,
      p
    );

    // Line: monthly maintenance / PMS trends
    const [monthlyTrend] = await pool.query(
      `SELECT DATE_FORMAT(scheduled_date,'%Y-%m') AS month,
              COUNT(*) AS pms_count
       FROM hc_pms_records
       WHERE company_id = ?
         AND scheduled_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month
       ORDER BY month`,
      [companyId, months]
    );

    // Line: monthly call logs
    const [callTrend] = await pool.query(
      `SELECT DATE_FORMAT(call_date,'%Y-%m') AS month,
              COUNT(*) AS call_count
       FROM hc_call_logs
       WHERE company_id = ?
         AND call_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
       GROUP BY month
       ORDER BY month`,
      [companyId, months]
    );

    // Merge monthly trends by month key
    const trendMap = {};
    monthlyTrend.forEach(r => { trendMap[r.month] = { month: r.month, pms: Number(r.pms_count), calls: 0 }; });
    callTrend.forEach(r => {
      if (!trendMap[r.month]) trendMap[r.month] = { month: r.month, pms: 0, calls: 0 };
      trendMap[r.month].calls = Number(r.call_count);
    });
    const trend = Object.values(trendMap).sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      statusDistribution: statusDist.map(r => ({ name: r.name || 'Unknown', value: Number(r.value) })),
      criticalityByDept:  critByDept.map(r => ({ deptId: r.dept_id, dept: r.dept, critical: Number(r.critical), nonCritical: Number(r.non_critical) })),
      monthlyTrend:       trend,
    });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   3. ASSET LIST (for snapshots/downloads)
   GET /api/company-portal/healthcare/assets
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/assets", validate(filterParams), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(500, Number(req.query.limit || 50));
    const offset = (page - 1) * limit;
    const { where, p } = buildAssetWhere(companyId, req.query);

    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name, a.asset_unique_id, a.generated_asset_id,
              a.asset_type, a.asset_category,
              a.building, a.floor, a.room, a.location_detail, a.status,
              a.is_verified, a.criticality, a.working_status, a.health_status, a.risk_level,
              a.created_at, d.name AS department_name,
              ad.metadata
       FROM assets a
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       ${where}
       ORDER BY a.asset_name
       LIMIT ? OFFSET ?`,
      [...p, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM assets a ${where}`, p
    );

    const parsed = rows.map(r => ({
      ...r,
      metadata: r.metadata ? (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata) : {},
    }));

    res.json({
      data:       parsed,
      pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
    });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   4. CALL LOG RECORDS
   GET  /api/company-portal/healthcare/records/call-logs
   POST /api/company-portal/healthcare/records/call-logs
   ═══════════════════════════════════════════════════════════════════════════ */
const recordFilter = [
  ...filterParams,
  query("dateFrom").optional().isDate(),
  query("dateTo").optional().isDate(),
];

router.get("/records/call-logs", validate(recordFilter), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(500, Number(req.query.limit || 50));
    const offset = (page - 1) * limit;

    let where = "WHERE cl.company_id = ?";
    const p = [companyId];

    if (req.query.dateFrom)    { where += " AND cl.call_date >= ?";   p.push(req.query.dateFrom); }
    if (req.query.dateTo)      { where += " AND cl.call_date <= ?";   p.push(req.query.dateTo); }
    if (req.query.departmentId){ where += " AND cl.department_id = ?";p.push(Number(req.query.departmentId)); }
    if (req.query.status)      { where += " AND cl.status = ?";       p.push(req.query.status); }
    if (req.query.priority)    { where += " AND cl.priority = ?";     p.push(req.query.priority); }
    if (req.query.search)      {
      where += " AND (cl.asset_name LIKE ? OR cl.caller_name LIKE ? OR cl.issue_reported LIKE ?)";
      const s = `%${req.query.search}%`; p.push(s, s, s);
    }

    const [rows] = await pool.query(
      `SELECT cl.*, d.name AS department_name
       FROM hc_call_logs cl
       LEFT JOIN departments d ON d.id = cl.department_id
       ${where}
       ORDER BY cl.call_date DESC, cl.created_at DESC
       LIMIT ? OFFSET ?`,
      [...p, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM hc_call_logs cl ${where}`, p
    );
    res.json({ data: rows, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
  } catch (err) { next(err); }
});

router.post("/records/call-logs", validate([
  body("callDate").notEmpty().isDate(),
  body("assetName").optional().isString().trim(),
  body("callerName").optional().isString().trim(),
  body("issueReported").optional().isString().trim(),
  body("priority").optional().isIn(["low","medium","high","critical"]),
]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const userId    = req.companyUser.id;
    const { callDate, callTime, assetId, assetName, departmentId, location,
            callerName, callerContact, issueReported, callType, priority } = req.body;

    const [result] = await pool.query(
      `INSERT INTO hc_call_logs
       (company_id, asset_id, asset_name, department_id, location, call_date, call_time,
        caller_name, caller_contact, issue_reported, call_type, priority, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [companyId, assetId || null, assetName || null, departmentId || null, location || null,
       callDate, callTime || null, callerName || null, callerContact || null,
       issueReported || null, callType || null, priority || "medium", userId]
    );
    res.status(201).json({ id: result.insertId, message: "Call log created." });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   5. PMS RECORDS
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/records/pms", validate(recordFilter), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(500, Number(req.query.limit || 50));
    const offset = (page - 1) * limit;

    let where = "WHERE p.company_id = ?";
    const params = [companyId];

    if (req.query.dateFrom)    { where += " AND p.scheduled_date >= ?"; params.push(req.query.dateFrom); }
    if (req.query.dateTo)      { where += " AND p.scheduled_date <= ?"; params.push(req.query.dateTo); }
    if (req.query.departmentId){ where += " AND p.department_id = ?";   params.push(Number(req.query.departmentId)); }
    if (req.query.status)      { where += " AND p.status = ?";          params.push(req.query.status); }
    if (req.query.search)      {
      where += " AND (p.asset_name LIKE ? OR p.technician_name LIKE ? OR p.maintenance_type LIKE ?)";
      const s = `%${req.query.search}%`; params.push(s, s, s);
    }

    const [rows] = await pool.query(
      `SELECT p.*, d.name AS department_name
       FROM hc_pms_records p
       LEFT JOIN departments d ON d.id = p.department_id
       ${where}
       ORDER BY p.scheduled_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM hc_pms_records p ${where}`, params
    );
    res.json({ data: rows, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
  } catch (err) { next(err); }
});

router.post("/records/pms", validate([
  body("scheduledDate").notEmpty().isDate(),
  body("assetName").optional().isString().trim(),
]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const userId    = req.companyUser.id;
    const { scheduledDate, completedDate, assetId, assetName, departmentId, location,
            maintenanceType, frequency, technicianName, technicianId, checklistUsed,
            findings, actionTaken, nextDueDate, status, cost, remarks } = req.body;

    const [result] = await pool.query(
      `INSERT INTO hc_pms_records
       (company_id, asset_id, asset_name, department_id, location, scheduled_date, completed_date,
        maintenance_type, frequency, technician_name, technician_id, checklist_used,
        findings, action_taken, next_due_date, status, cost, remarks, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [companyId, assetId || null, assetName || null, departmentId || null, location || null,
       scheduledDate, completedDate || null, maintenanceType || null, frequency || null,
       technicianName || null, technicianId || null, checklistUsed || null,
       findings || null, actionTaken || null, nextDueDate || null,
       status || "scheduled", cost || null, remarks || null, userId]
    );
    res.status(201).json({ id: result.insertId, message: "PMS record created." });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   6. CALIBRATION RECORDS
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/records/calibration", validate(recordFilter), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(500, Number(req.query.limit || 50));
    const offset = (page - 1) * limit;

    let where = "WHERE c.company_id = ?";
    const params = [companyId];

    if (req.query.dateFrom)    { where += " AND c.calibration_date >= ?"; params.push(req.query.dateFrom); }
    if (req.query.dateTo)      { where += " AND c.calibration_date <= ?"; params.push(req.query.dateTo); }
    if (req.query.departmentId){ where += " AND c.department_id = ?";     params.push(Number(req.query.departmentId)); }
    if (req.query.status)      { where += " AND c.status = ?";            params.push(req.query.status); }
    if (req.query.search)      {
      where += " AND (c.asset_name LIKE ? OR c.calibrated_by LIKE ? OR c.certificate_no LIKE ?)";
      const s = `%${req.query.search}%`; params.push(s, s, s);
    }

    const [rows] = await pool.query(
      `SELECT c.*, d.name AS department_name
       FROM hc_calibration_records c
       LEFT JOIN departments d ON d.id = c.department_id
       ${where}
       ORDER BY c.calibration_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM hc_calibration_records c ${where}`, params
    );
    res.json({ data: rows, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
  } catch (err) { next(err); }
});

router.post("/records/calibration", validate([
  body("calibrationDate").notEmpty().isDate(),
]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const userId    = req.companyUser.id;
    const { calibrationDate, nextDueDate, assetId, assetName, departmentId, location,
            calibratedBy, labName, certificateNo, calibrationResult,
            deviation, standardUsed, remarks, status } = req.body;

    const [result] = await pool.query(
      `INSERT INTO hc_calibration_records
       (company_id, asset_id, asset_name, department_id, location, calibration_date, next_due_date,
        calibrated_by, lab_name, certificate_no, calibration_result, deviation, standard_used, remarks, status, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [companyId, assetId || null, assetName || null, departmentId || null, location || null,
       calibrationDate, nextDueDate || null, calibratedBy || null, labName || null,
       certificateNo || null, calibrationResult || "Pass", deviation || null,
       standardUsed || null, remarks || null, status || "valid", userId]
    );
    res.status(201).json({ id: result.insertId, message: "Calibration record created." });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   7. TRAINING RECORDS
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/records/training", validate(recordFilter), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(500, Number(req.query.limit || 50));
    const offset = (page - 1) * limit;

    let where = "WHERE t.company_id = ?";
    const params = [companyId];

    if (req.query.dateFrom)    { where += " AND t.training_date >= ?";  params.push(req.query.dateFrom); }
    if (req.query.dateTo)      { where += " AND t.training_date <= ?";  params.push(req.query.dateTo); }
    if (req.query.departmentId){ where += " AND t.department_id = ?";   params.push(Number(req.query.departmentId)); }
    if (req.query.status)      { where += " AND t.result = ?";          params.push(req.query.status); }
    if (req.query.search)      {
      where += " AND (t.training_title LIKE ? OR t.employee_name LIKE ? OR t.trainer_name LIKE ?)";
      const s = `%${req.query.search}%`; params.push(s, s, s);
    }

    const [rows] = await pool.query(
      `SELECT t.*, d.name AS department_name
       FROM hc_training_records t
       LEFT JOIN departments d ON d.id = t.department_id
       ${where}
       ORDER BY t.training_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM hc_training_records t ${where}`, params
    );
    res.json({ data: rows, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
  } catch (err) { next(err); }
});

router.post("/records/training", validate([
  body("trainingDate").notEmpty().isDate(),
  body("trainingTitle").notEmpty().isString().trim(),
]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const userId    = req.companyUser.id;
    const { trainingDate, expiryDate, assetId, assetName, departmentId, employeeId, employeeName,
            trainingTitle, trainingType, trainerName, score, result, certificateNo, remarks } = req.body;

    const [r] = await pool.query(
      `INSERT INTO hc_training_records
       (company_id, asset_id, asset_name, department_id, employee_id, employee_name,
        training_title, training_type, trainer_name, training_date, expiry_date,
        score, result, certificate_no, remarks, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [companyId, assetId || null, assetName || null, departmentId || null,
       employeeId || null, employeeName || null, trainingTitle, trainingType || null,
       trainerName || null, trainingDate, expiryDate || null,
       score || null, result || "Pass", certificateNo || null, remarks || null, userId]
    );
    res.status(201).json({ id: r.insertId, message: "Training record created." });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   8. RBER RECORDS
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/records/rber", validate(recordFilter), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(500, Number(req.query.limit || 50));
    const offset = (page - 1) * limit;

    let where = "WHERE r.company_id = ?";
    const params = [companyId];

    if (req.query.dateFrom)    { where += " AND r.review_date >= ?";    params.push(req.query.dateFrom); }
    if (req.query.dateTo)      { where += " AND r.review_date <= ?";    params.push(req.query.dateTo); }
    if (req.query.departmentId){ where += " AND r.department_id = ?";   params.push(Number(req.query.departmentId)); }
    if (req.query.status)      { where += " AND r.status = ?";          params.push(req.query.status); }
    if (req.query.search)      {
      where += " AND (r.asset_name LIKE ? OR r.reviewer_name LIKE ? OR r.equipment_function LIKE ?)";
      const s = `%${req.query.search}%`; params.push(s, s, s);
    }

    const [rows] = await pool.query(
      `SELECT r.*, d.name AS department_name
       FROM hc_rber_records r
       LEFT JOIN departments d ON d.id = r.department_id
       ${where}
       ORDER BY r.review_date DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM hc_rber_records r ${where}`, params
    );
    res.json({ data: rows, pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) } });
  } catch (err) { next(err); }
});

router.post("/records/rber", validate([
  body("reviewDate").notEmpty().isDate(),
  body("assetName").optional().isString().trim(),
]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const userId    = req.companyUser.id;
    const { reviewDate, nextReviewDate, assetId, assetName, departmentId, location,
            reviewerName, reviewerId, riskScore, riskLevel, equipmentFunction,
            failureConsequences, maintenanceStrategy, recommendedInterval,
            actionRequired, status, remarks } = req.body;

    const [r] = await pool.query(
      `INSERT INTO hc_rber_records
       (company_id, asset_id, asset_name, department_id, location, review_date, next_review_date,
        reviewer_name, reviewer_id, risk_score, risk_level, equipment_function, failure_consequences,
        maintenance_strategy, recommended_interval, action_required, status, remarks, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [companyId, assetId || null, assetName || null, departmentId || null, location || null,
       reviewDate, nextReviewDate || null, reviewerName || null, reviewerId || null,
       riskScore || null, riskLevel || "Medium", equipmentFunction || null,
       failureConsequences || null, maintenanceStrategy || null, recommendedInterval || null,
       actionRequired || null, status || "pending", remarks || null, userId]
    );
    res.status(201).json({ id: r.insertId, message: "RBER record created." });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   9. UPDATE ASSET HEALTHCARE FIELDS (PATCH)
   PATCH /api/company-portal/healthcare/assets/:id
   ═══════════════════════════════════════════════════════════════════════════ */
router.patch("/assets/:id", validate([
  param("id").isInt({ min: 1 }),
  body("isVerified").optional().isBoolean(),
  body("status").optional().isIn(["Active","Inactive","Unverified"]),
  body("criticality").optional().isIn(["Critical","Non_Critical"]),
  body("workingStatus").optional({ nullable: true }).isIn(["Working","HNF","Active","Inactive","WIP","Not_Working","RBER","Condemned"]).if(body("workingStatus").notEmpty()),
  body("assetCategory").optional().isString().trim(),
  body("locationDetail").optional().isString().trim(),
  body("rber").optional().isBoolean(),
]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const assetId   = Number(req.params.id);
    const { isVerified, status, criticality, workingStatus, assetCategory, locationDetail, rber } = req.body;

    // Verify asset belongs to this company
    const [[asset]] = await pool.query(
      "SELECT id FROM assets WHERE id = ? AND company_id = ?",
      [assetId, companyId]
    );
    if (!asset) return res.status(404).json({ message: "Asset not found." });

    const sets = [];
    const vals = [];
    if (isVerified    !== undefined) { sets.push("is_verified = ?");    vals.push(isVerified ? 1 : 0); }
    if (status        !== undefined) { sets.push("status = ?");         vals.push(status); }
    if (criticality   !== undefined) { sets.push("criticality = ?");    vals.push(criticality); }
    if (workingStatus !== undefined) { sets.push("working_status = ?"); vals.push(workingStatus); }
    if (assetCategory !== undefined) { sets.push("asset_category = ?"); vals.push(assetCategory); }
    if (locationDetail !== undefined){ sets.push("location_detail = ?");vals.push(locationDetail); }

    if (sets.length > 0) {
      await pool.query(
        `UPDATE assets SET ${sets.join(", ")} WHERE id = ?`,
        [...vals, assetId]
      );
    }

    // Sync metadata fields so detail page and list are consistent after refresh
    const metaUpdates = [];
    if (workingStatus !== undefined) metaUpdates.push(`'$.workingStatus', '${workingStatus}'`);
    if (rber !== undefined)          metaUpdates.push(`'$.rber', ${rber ? 1 : 0}`);

    if (metaUpdates.length > 0) {
      const jsonSetArgs = metaUpdates.join(", ");
      await pool.query(
        `INSERT INTO asset_details (asset_id, metadata)
         VALUES (?, JSON_OBJECT())
         ON DUPLICATE KEY UPDATE metadata = JSON_SET(COALESCE(metadata, '{}'), ${jsonSetArgs})`,
        [assetId]
      );
    }

    if (sets.length === 0 && metaUpdates.length === 0) return res.json({ message: "No fields to update." });
    res.json({ message: "Asset updated." });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   10. FILTERS: departments & asset categories
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/filter-options", async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const [departments] = await pool.query(
      "SELECT id, name FROM departments WHERE company_id = ? ORDER BY name", [companyId]
    );
    const [categories] = await pool.query(
      `SELECT DISTINCT asset_category AS category
       FROM assets WHERE company_id = ? AND asset_category IS NOT NULL
       ORDER BY asset_category`,
      [companyId]
    );
    const [locations] = await pool.query(
      `SELECT DISTINCT building AS location FROM assets
       WHERE company_id = ? AND building IS NOT NULL
       ORDER BY building`,
      [companyId]
    );
    res.json({
      departments: departments,
      categories:  categories.map(r => r.category),
      locations:   locations.map(r => r.location),
    });
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   11. EXCEL EXPORT (streams XLSX)
   GET /api/company-portal/healthcare/export?type=assets|call-logs|pms|calibration|training|rber
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/export", validate([
  query("type").isIn(["assets","call-logs","pms","calibration","training","rber","all","requests"]),
  ...filterParams,
]), async (req, res, next) => {
  try {
    const XLSX      = await import("xlsx");
    const companyId = req.companyUser.companyId;
    const type      = req.query.type;
    const wb        = XLSX.utils.book_new();

    const addSheet = (name, rows) => {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
    };

    if (type === "assets" || type === "all") {
      const { where, p } = buildAssetWhere(companyId, req.query);
      const [rows] = await pool.query(
        `SELECT a.asset_name AS "Asset Name", a.asset_unique_id AS "Asset ID",
                a.asset_type AS "Type", a.asset_category AS "Category",
                d.name AS "Department",
                CONCAT(COALESCE(a.building,''),IF(a.floor,' / ',''),COALESCE(a.floor,''),IF(a.room,' / ',''),COALESCE(a.room,'')) AS "Location",
                IF(a.is_verified,'Yes','No') AS "Verified",
                a.criticality AS "Criticality",
                a.working_status AS "Working Status",
                a.status AS "Status",
                a.health_status AS "Health Status",
                a.created_at AS "Created At"
         FROM assets a
         LEFT JOIN departments d ON d.id = a.department_id
         ${where} ORDER BY a.asset_name`,
        p
      );
      addSheet("Assets", rows);
    }
    if (type === "call-logs" || type === "all") {
      const [rows] = await pool.query(
        `SELECT cl.call_date AS "Date", cl.call_time AS "Time",
                cl.asset_name AS "Asset", d.name AS "Department",
                cl.location AS "Location", cl.caller_name AS "Caller",
                cl.issue_reported AS "Issue", cl.call_type AS "Type",
                cl.priority AS "Priority", cl.status AS "Status",
                cl.resolution_note AS "Resolution"
         FROM hc_call_logs cl
         LEFT JOIN departments d ON d.id = cl.department_id
         WHERE cl.company_id = ?
         ORDER BY cl.call_date DESC`,
        [companyId]
      );
      addSheet("Call Logs", rows);
    }
    if (type === "pms" || type === "all") {
      const [rows] = await pool.query(
        `SELECT p.scheduled_date AS "Scheduled", p.completed_date AS "Completed",
                p.asset_name AS "Asset", d.name AS "Department",
                p.maintenance_type AS "Type", p.frequency AS "Frequency",
                p.technician_name AS "Technician", p.status AS "Status",
                p.findings AS "Findings", p.action_taken AS "Action Taken",
                p.next_due_date AS "Next Due", p.cost AS "Cost"
         FROM hc_pms_records p
         LEFT JOIN departments d ON d.id = p.department_id
         WHERE p.company_id = ?
         ORDER BY p.scheduled_date DESC`,
        [companyId]
      );
      addSheet("PMS Records", rows);
    }
    if (type === "calibration" || type === "all") {
      const [rows] = await pool.query(
        `SELECT c.calibration_date AS "Date", c.asset_name AS "Asset",
                d.name AS "Department", c.calibrated_by AS "Calibrated By",
                c.lab_name AS "Lab", c.certificate_no AS "Certificate No.",
                c.calibration_result AS "Result", c.deviation AS "Deviation",
                c.standard_used AS "Standard", c.next_due_date AS "Next Due",
                c.status AS "Status"
         FROM hc_calibration_records c
         LEFT JOIN departments d ON d.id = c.department_id
         WHERE c.company_id = ?
         ORDER BY c.calibration_date DESC`,
        [companyId]
      );
      addSheet("Calibration", rows);
    }
    if (type === "training" || type === "all") {
      const [rows] = await pool.query(
        `SELECT t.training_date AS "Date", t.training_title AS "Title",
                t.employee_name AS "Employee", d.name AS "Department",
                t.training_type AS "Type", t.trainer_name AS "Trainer",
                t.score AS "Score", t.result AS "Result",
                t.certificate_no AS "Certificate No.", t.expiry_date AS "Expiry"
         FROM hc_training_records t
         LEFT JOIN departments d ON d.id = t.department_id
         WHERE t.company_id = ?
         ORDER BY t.training_date DESC`,
        [companyId]
      );
      addSheet("Training", rows);
    }
    if (type === "rber" || type === "all") {
      const [rows] = await pool.query(
        `SELECT r.review_date AS "Date", r.asset_name AS "Asset",
                d.name AS "Department", r.reviewer_name AS "Reviewer",
                r.risk_score AS "Risk Score", r.risk_level AS "Risk Level",
                r.equipment_function AS "Function",
                r.maintenance_strategy AS "Strategy",
                r.recommended_interval AS "Interval",
                r.status AS "Status", r.next_review_date AS "Next Review"
         FROM hc_rber_records r
         LEFT JOIN departments d ON d.id = r.department_id
         WHERE r.company_id = ?
         ORDER BY r.review_date DESC`,
        [companyId]
      );
      addSheet("RBER Records", rows);
    }

    // ── Ticket Master / Requests export ───────────────────────────────────────
    if (type === "requests") {
      let companyIds;
      if (req.query.allCompanies === "true") {
        companyIds = await getAccessibleCompanyIds(req.companyUser.id, companyId);
      } else {
        companyIds = [companyId];
      }
      const inClause = companyIds.map(() => "?").join(",");
      const [woRows] = await pool.query(
        `SELECT
           wo.work_order_number        AS "Request #",
           c.company_name              AS "Hospital / Site",
           wo.asset_name               AS "Asset",
           wo.location                 AS "Location",
           wo.issue_description        AS "Description",
           wo.priority                 AS "Priority",
           COALESCE(wo.source_label,'Manual') AS "Source",
           cb.full_name                AS "Raised By",
           cu.full_name                AS "Assigned To",
           wo.status                   AS "Status",
           wo.created_at               AS "Created At",
           wo.wip_at                   AS "WIP (In Progress) Date",
           wo.resolution_at            AS "Resolution Date",
           CASE
             WHEN wo.wip_at IS NOT NULL AND wo.resolution_at IS NOT NULL
             THEN ROUND(TIMESTAMPDIFF(MINUTE, wo.wip_at, wo.resolution_at))
             ELSE NULL
           END                         AS "Downtime (Minutes)",
           wo.escalation_level         AS "Escalation Level",
           wo.cutoff_time              AS "Cutoff Time"
         FROM work_orders wo
         LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
         LEFT JOIN company_users cb ON cb.id = wo.cp_created_by
         LEFT JOIN companies c      ON c.id  = wo.company_id
         WHERE wo.company_id IN (${inClause})
         ORDER BY wo.created_at DESC`,
        companyIds
      );
      const [aqRows] = await pool.query(
        `SELECT
           CONCAT('AQ-', aq.id)        AS "Request #",
           c.company_name              AS "Hospital / Site",
           COALESCE(a.asset_name,'Unknown Asset') AS "Asset",
           COALESCE(a.building,'')     AS "Location",
           COALESCE(aq.description, aq.title, aq.message, '') AS "Description",
           'normal'                    AS "Priority",
           'QR Scan'                   AS "Source",
           aq.requester_name           AS "Raised By",
           cu.full_name                AS "Assigned To",
           aq.status                   AS "Status",
           aq.created_at               AS "Created At",
           NULL                        AS "WIP (In Progress) Date",
           aq.resolved_at              AS "Resolution Date",
           NULL                        AS "Downtime (Minutes)",
           0                           AS "Escalation Level",
           aq.cutoff_time              AS "Cutoff Time"
         FROM asset_queries aq
         LEFT JOIN assets a  ON a.id  = aq.asset_id
         LEFT JOIN company_users cu ON cu.id = aq.assigned_to
         LEFT JOIN companies c  ON c.id = aq.company_id
         WHERE aq.company_id IN (${inClause})
         ORDER BY aq.created_at DESC`,
        companyIds
      );
      const allReqs = [...woRows, ...aqRows].sort((a, b) => new Date(b["Created At"]) - new Date(a["Created At"]));
      // Set column widths for readability
      const ws = XLSX.utils.json_to_sheet(allReqs);
      const colWidths = [12,20,22,18,40,10,12,18,18,14,20,22,22,18,12,20];
      ws['!cols'] = colWidths.map(w => ({ wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, "Ticket Master");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = `ticket-master-export-${new Date().toISOString().slice(0,10)}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   12. WORK ORDER ENHANCEMENTS — Remarks & Assignment History
   ═══════════════════════════════════════════════════════════════════════════ */
router.get("/work-orders/:id/remarks", validate([param("id").isInt({ min: 1 })]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const [rows] = await pool.query(
      `SELECT r.* FROM work_order_remarks r
       JOIN work_orders wo ON wo.id = r.work_order_id
       WHERE r.work_order_id = ? AND wo.company_id = ?
       ORDER BY r.created_at DESC`,
      [Number(req.params.id), companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/work-orders/:id/remarks", validate([
  param("id").isInt({ min: 1 }),
  body("remark").notEmpty().isString().trim(),
]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const userId    = req.companyUser.id;
    const userName  = req.companyUser.fullName || req.companyUser.full_name || "";
    const [[wo]] = await pool.query(
      "SELECT id FROM work_orders WHERE id = ? AND company_id = ?",
      [Number(req.params.id), companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found." });

    const [result] = await pool.query(
      "INSERT INTO work_order_remarks (work_order_id, remark, added_by, added_by_name) VALUES (?,?,?,?)",
      [Number(req.params.id), req.body.remark, userId, userName]
    );

    // Log to history
    await pool.query(
      `INSERT INTO work_order_history (work_order_id, status, updated_by, remarks)
       SELECT wo.status, ?, ?
       FROM work_orders wo WHERE wo.id = ?`,
      [userId, `Remark: ${req.body.remark}`, Number(req.params.id)]
    ).catch(() => {});

    res.status(201).json({ id: result.insertId, message: "Remark added." });
  } catch (err) { next(err); }
});

router.get("/work-orders/:id/assignment-history", validate([param("id").isInt({ min: 1 })]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const [rows] = await pool.query(
      `SELECT ah.* FROM work_order_assignment_history ah
       JOIN work_orders wo ON wo.id = ah.work_order_id
       WHERE ah.work_order_id = ? AND wo.company_id = ?
       ORDER BY ah.created_at DESC`,
      [Number(req.params.id), companyId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get("/work-orders/:id/activity", validate([param("id").isInt({ min: 1 })]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const woId      = Number(req.params.id);

    const [[wo]] = await pool.query(
      "SELECT id FROM work_orders WHERE id = ? AND company_id = ?", [woId, companyId]
    );
    if (!wo) return res.status(404).json({ message: "Work order not found." });

    const [history]  = await pool.query(
      "SELECT 'status_change' AS type, status, updated_by, remarks, timestamp AS created_at FROM work_order_history WHERE work_order_id = ? ORDER BY timestamp DESC",
      [woId]
    );
    const [remarks]  = await pool.query(
      "SELECT 'remark' AS type, remark AS note, added_by AS updated_by, added_by_name, created_at FROM work_order_remarks WHERE work_order_id = ? ORDER BY created_at DESC",
      [woId]
    );
    const [assigns]  = await pool.query(
      "SELECT 'assignment' AS type, assigned_name, assigned_by_name, note, created_at FROM work_order_assignment_history WHERE work_order_id = ? ORDER BY created_at DESC",
      [woId]
    );

    const timeline = [...history, ...remarks, ...assigns]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(timeline);
  } catch (err) { next(err); }
});

/* ── Work order requests with full filters (includes QR-submitted asset queries) ── */
router.get("/requests", validate([
  ...paginationParams,
  query("status").optional().isString(),
  query("priority").optional().isString(),
  query("assignedTo").optional().isInt({ min: 1 }),
  query("departmentId").optional().isInt({ min: 1 }),
  query("dateFrom").optional().isDate(),
  query("dateTo").optional().isDate(),
  query("escalated").optional().isBoolean(),
  query("overdue").optional().isBoolean(),
  query("search").optional().isString().trim(),
]), async (req, res, next) => {
  try {
    const companyId = req.companyUser.companyId;
    const page  = Math.max(1, Number(req.query.page  || 1));
    const limit = Math.min(500, Number(req.query.limit || 50));
    const offset = (page - 1) * limit;

    // Determine company filter (single vs all accessible)
    let companyIds;
    if (req.query.allCompanies === "true") {
      companyIds = await getAccessibleCompanyIds(req.companyUser.id, companyId);
    } else {
      companyIds = [companyId];
    }
    const inClause = companyIds.map(() => "?").join(",");

    // ── Work orders query ──────────────────────────────────────────────────────
    let woWhere = `WHERE wo.company_id IN (${inClause})`;
    const woP = [...companyIds];
    if (req.query.status && req.query.status !== "all") { woWhere += " AND wo.status = ?"; woP.push(req.query.status); }
    if (req.query.priority)   { woWhere += " AND wo.priority = ?";       woP.push(req.query.priority); }
    if (req.query.assignedTo) { woWhere += " AND wo.cp_assigned_to = ?"; woP.push(Number(req.query.assignedTo)); }
    if (req.query.dateFrom)   { woWhere += " AND wo.created_at >= ?";    woP.push(req.query.dateFrom); }
    if (req.query.dateTo)     { woWhere += " AND DATE(wo.created_at) <= ?"; woP.push(req.query.dateTo); }
    if (req.query.escalated === "true") { woWhere += " AND wo.escalation_level > 0"; }
    if (req.query.overdue === "true")   { woWhere += " AND wo.is_overdue = 1"; }
    if (req.query.search) {
      woWhere += " AND (wo.work_order_number LIKE ? OR wo.asset_name LIKE ? OR wo.issue_description LIKE ?)";
      const s = `%${req.query.search}%`; woP.push(s, s, s);
    }

    // ── Asset queries query (QR scan submissions) ─────────────────────────────
    let aqWhere = `WHERE aq.company_id IN (${inClause})`;
    const aqP = [...companyIds];
    // Map WO status values to their AQ equivalents (AQ statuses: open, in_progress, resolved, closed)
    const AQ_STATUS_MAP = { open: "open", in_progress: "in_progress", completed: "resolved", closed: "closed" };
    const forceSkipAQStatus = req.query.status && req.query.status !== "all" && !AQ_STATUS_MAP[req.query.status];
    if (req.query.status && req.query.status !== "all") {
      const aqSt = AQ_STATUS_MAP[req.query.status];
      if (aqSt) { aqWhere += " AND aq.status = ?"; aqP.push(aqSt); }
    }
    if (req.query.dateFrom) { aqWhere += " AND aq.created_at >= ?"; aqP.push(req.query.dateFrom); }
    if (req.query.dateTo)   { aqWhere += " AND DATE(aq.created_at) <= ?"; aqP.push(req.query.dateTo); }
    if (req.query.search) {
      aqWhere += " AND (a.asset_name LIKE ? OR aq.query_type LIKE ? OR aq.message LIKE ? OR aq.requester_name LIKE ?)";
      const s = `%${req.query.search}%`; aqP.push(s, s, s, s);
    }
    // Skip asset_queries for escalated/overdue/priority/assignedTo filters, or when status has no AQ equivalent
    const skipAQ = forceSkipAQStatus || req.query.escalated === "true" || req.query.overdue === "true" || req.query.priority || req.query.assignedTo;

    const [woRows] = await pool.query(
      `SELECT
         wo.id,
         wo.work_order_number,
         wo.asset_name,
         wo.location,
         wo.issue_description,
         wo.priority,
         wo.status,
         wo.cp_assigned_to,
         wo.escalation_level,
         wo.is_overdue,
         wo.cutoff_time,
         wo.source_label,
         wo.created_at,
         wo.created_at AS updated_at,
         wo.wip_at,
         wo.resolution_at,
         wo.closed_at,
         wo.asset_name,
         wo.asset_id,
         a.generated_asset_id,
         cu.full_name AS assigned_to_name,
         cu.designation AS assigned_to_designation,
         cb.full_name AS created_by_name,
         d.name AS department_name,
         c.company_name,
         'work_order' AS source_type
       FROM work_orders wo
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       LEFT JOIN company_users cb ON cb.id = wo.cp_created_by
       LEFT JOIN assets a         ON a.id  = wo.asset_id
       LEFT JOIN departments d    ON d.id  = a.department_id
       LEFT JOIN companies c      ON c.id  = wo.company_id
       ${woWhere}`,
      woP
    );

    let aqRows = [];
    if (!skipAQ) {
      [aqRows] = await pool.query(
        `SELECT
           aq.id,
           CONCAT('AQ-', aq.id) AS work_order_number,
           COALESCE(a.asset_name, 'Unknown Asset') AS asset_name,
           COALESCE(a.building, '') AS location,
           aq.asset_id,
           a.asset_unique_id AS generated_asset_id,
           COALESCE(aq.description, aq.title, aq.message, aq.query_type, '') AS issue_description,
           'normal' AS priority,
           CASE aq.status WHEN 'resolved' THEN 'completed' ELSE aq.status END AS status,
           aq.assigned_to AS cp_assigned_to,
           0 AS escalation_level,
           0 AS is_overdue,
           aq.cutoff_time,
           'QR Scan' AS source_label,
           aq.created_at,
           aq.updated_at,
           aq.in_progress_at AS wip_at,
           COALESCE(aq.resolved_at, CASE WHEN aq.status IN ('resolved','closed') THEN aq.updated_at ELSE NULL END) AS resolution_at,
           CASE WHEN aq.status = 'closed' THEN COALESCE(aq.resolved_at, aq.updated_at) ELSE NULL END AS closed_at,
           cu.full_name AS assigned_to_name,
           cu.designation AS assigned_to_designation,
           d.name AS department_name,
           c.company_name,
           'asset_query' AS source_type,
           aq.requester_name,
           aq.requester_phone,
           aq.requester_email,
           aq.requester_name AS created_by_name,
           aq.images
         FROM asset_queries aq
         LEFT JOIN assets a ON a.id = aq.asset_id
         LEFT JOIN company_users cu ON cu.id = aq.assigned_to
         LEFT JOIN departments d    ON d.id  = a.department_id
         LEFT JOIN companies c      ON c.id  = aq.company_id
         ${aqWhere}`,
        aqP
      );
    }

    // Merge and sort by created_at desc
    const allRows = [...woRows, ...aqRows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = allRows.length;
    const rows  = allRows.slice(offset, offset + limit).map(r => ({
      ...r,
      images: r.images ? (typeof r.images === 'string' ? JSON.parse(r.images) : r.images) : [],
    }));

    // Summary counts (work orders + asset queries combined)
    const [woCounts] = await pool.query(
      `SELECT
         SUM(CASE WHEN wo.status = 'open'        THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN wo.status = 'assigned'    THEN 1 ELSE 0 END) AS assigned,
         SUM(CASE WHEN wo.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN wo.status = 'on_hold'     THEN 1 ELSE 0 END) AS on_hold,
         SUM(CASE WHEN wo.status = 'completed'   THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN wo.status = 'closed'      THEN 1 ELSE 0 END) AS closed,
         SUM(CASE WHEN wo.escalation_level > 0   THEN 1 ELSE 0 END) AS escalated,
         SUM(CASE WHEN wo.is_overdue = 1         THEN 1 ELSE 0 END) AS overdue
       FROM work_orders wo WHERE wo.company_id = ?`,
      [companyId]
    );
    const [aqCounts] = await pool.query(
      `SELECT
         SUM(CASE WHEN status = 'open'        THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
         SUM(CASE WHEN status = 'resolved'    THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'closed'      THEN 1 ELSE 0 END) AS closed
       FROM asset_queries WHERE company_id = ?`,
      [companyId]
    );

    res.json({
      data: rows,
      summary: {
        open:       Number(woCounts[0].open       || 0) + Number(aqCounts[0].open       || 0),
        assigned:   Number(woCounts[0].assigned   || 0),
        inProgress: Number(woCounts[0].in_progress|| 0) + Number(aqCounts[0].in_progress|| 0),
        onHold:     Number(woCounts[0].on_hold    || 0),
        completed:  Number(woCounts[0].completed  || 0) + Number(aqCounts[0].completed  || 0),
        closed:     Number(woCounts[0].closed     || 0) + Number(aqCounts[0].closed     || 0),
        escalated:  Number(woCounts[0].escalated  || 0),
        overdue:    Number(woCounts[0].overdue    || 0),
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

export default router;

