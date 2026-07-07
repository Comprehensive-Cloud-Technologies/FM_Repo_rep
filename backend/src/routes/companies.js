import { Router } from "express";
import { param } from "express-validator";
import pool from "../db.js";
import { validate } from "../validators.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

// Auto-migrations
(async () => {
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_modules TEXT DEFAULT NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS sector VARCHAR(80) DEFAULT NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80) DEFAULT NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS facility_type VARCHAR(80) DEFAULT NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_person_name VARCHAR(160) DEFAULT NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_person_phone VARCHAR(32) DEFAULT NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email VARCHAR(160) DEFAULT NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS sectors TEXT DEFAULT NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS state_id INT UNSIGNED NULL`);
  } catch (err) { /* ignore */ }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id            SERIAL PRIMARY KEY,
        company_id    INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        role          VARCHAR(60) NOT NULL,
        permissions   TEXT NOT NULL DEFAULT '{}',
        UNIQUE(company_id, role)
      )`);
  } catch (err) { /* ignore */ }
})();

const companyRules = [];

const toNullableInt = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const resolveStateRef = async (stateId, stateText) => {
  if (stateId !== undefined && stateId !== null && stateId !== "") {
    const [[byId]] = await pool.query(
      `SELECT id, state_name AS stateName, state_code AS stateCode
       FROM states WHERE id = ? LIMIT 1`,
      [Number(stateId)]
    );
    return byId || null;
  }

  const value = String(stateText || "").trim();
  if (!value) return null;
  const [[byText]] = await pool.query(
    `SELECT id, state_name AS stateName, state_code AS stateCode
     FROM states
     WHERE LOWER(state_name) = LOWER(?) OR UPPER(state_code) = UPPER(?)
     LIMIT 1`,
    [value, value]
  );
  return byText || null;
};

// Aggregate stats for client portal dashboard
router.get("/stats", async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Support single companyId OR multiple companyIds (comma-separated)
    const rawIds = req.query.companyIds || req.query.companyId || "";
    const companyIds = rawIds
      ? String(rawIds).split(",").map(Number).filter(n => n > 0)
      : [];
    const companyIdFilter = companyIds.length === 1 ? companyIds[0] : null;
    const multiFilter = companyIds.length > 1;

    // Helper: base company WHERE clause
    let compBase, compArgs;
    if (companyIds.length === 0) {
      compBase = "FROM companies c WHERE c.user_id = ?";
      compArgs = [userId];
    } else if (companyIds.length === 1) {
      compBase = "FROM companies c WHERE c.user_id = ? AND c.id = ?";
      compArgs = [userId, companyIds[0]];
    } else {
      const placeholders = companyIds.map(() => "?").join(",");
      compBase = `FROM companies c WHERE c.user_id = ? AND c.id IN (${placeholders})`;
      compArgs = [userId, ...companyIds];
    }

    // Build asset + work-order JOIN clauses
    let assetJoin, woJoin;
    if (companyIds.length === 0) {
      assetJoin = "FROM assets a JOIN companies c ON c.id = a.company_id LEFT JOIN asset_details ad ON ad.asset_id = a.id WHERE c.user_id = ?";
      woJoin    = "FROM work_orders wo JOIN companies c ON c.id = wo.company_id WHERE c.user_id = ?";
    } else if (companyIds.length === 1) {
      assetJoin = "FROM assets a JOIN companies c ON c.id = a.company_id LEFT JOIN asset_details ad ON ad.asset_id = a.id WHERE c.user_id = ? AND c.id = ?";
      woJoin    = "FROM work_orders wo JOIN companies c ON c.id = wo.company_id WHERE c.user_id = ? AND c.id = ?";
    } else {
      const ph = companyIds.map(() => "?").join(",");
      assetJoin = `FROM assets a JOIN companies c ON c.id = a.company_id LEFT JOIN asset_details ad ON ad.asset_id = a.id WHERE c.user_id = ? AND c.id IN (${ph})`;
      woJoin    = `FROM work_orders wo JOIN companies c ON c.id = wo.company_id WHERE c.user_id = ? AND c.id IN (${ph})`;
    }

    // Batch 1: company counts (2 → 1 query)
    const [[{ totalCompanies, activeCompanies }]] = await pool.query(
      `SELECT COUNT(*) AS totalCompanies,
              SUM(CASE WHEN c.status = 'Active' THEN 1 ELSE 0 END) AS activeCompanies
       ${compBase}`, compArgs
    );

    // Batch 2: asset profile + calibration metrics (9 separate queries → 1)
    const [[assetRow]] = await pool.query(
      `SELECT
         COUNT(*) AS totalAssets,
         SUM(CASE WHEN LOWER(COALESCE(NULLIF(a.criticality,''), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.criticality')),'non_critical')) = 'critical' THEN 1 ELSE 0 END) AS criticalAssets,
         SUM(CASE WHEN LOWER(COALESCE(NULLIF(a.criticality,''), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.criticality')),'non_critical')) IN ('non_critical','non-critical','noncritical') THEN 1 ELSE 0 END) AS nonCriticalAssets,
         SUM(CASE WHEN LOWER(COALESCE(NULLIF(a.working_status,''), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.workingStatus')),'')) = 'condemned' OR LOWER(a.status) = 'condemned' THEN 1 ELSE 0 END) AS condemnedAssets,
         SUM(CASE WHEN LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.rber')),'false')) IN ('1','true','yes') OR LOWER(a.status) = 'rber' THEN 1 ELSE 0 END) AS rberAssets,
         SUM(CASE WHEN COALESCE(a.is_verified, 0) = 1 THEN 1 ELSE 0 END) AS verifiedAssets,
         COALESCE(SUM(
           CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')) REGEXP '^[0-9]+(\.[0-9]+)?$'
                THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.purchaseCost')) AS DECIMAL(15,2))
                ELSE 0 END
         ), 0) AS totalAssetValue,
         SUM(CASE WHEN a.calibration_required = 1 THEN 1 ELSE 0 END) AS calTotal,
         SUM(CASE WHEN a.calibration_required = 1 AND a.next_calibration_due_date BETWEEN CURDATE() AND LAST_DAY(CURDATE()) THEN 1 ELSE 0 END) AS calDueThisMonth,
         SUM(CASE WHEN a.calibration_required = 1 AND a.next_calibration_due_date < CURDATE() THEN 1 ELSE 0 END) AS calOverdue,
         SUM(CASE WHEN a.calibration_required = 1 AND a.next_calibration_due_date BETWEEN DATE_ADD(CURDATE(), INTERVAL 1 DAY) AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS calUpcoming30d,
         SUM(CASE WHEN a.calibration_required = 1 AND a.last_calibration_date BETWEEN DATE_FORMAT(CURDATE(),'%Y-%m-01') AND CURDATE() THEN 1 ELSE 0 END) AS calCompletedThisMonth
       ${assetJoin}`, compArgs
    );
    const { totalAssets, criticalAssets, nonCriticalAssets, condemnedAssets, rberAssets, verifiedAssets, totalAssetValue,
            calTotal, calDueThisMonth, calOverdue, calUpcoming30d, calCompletedThisMonth } = assetRow;

    // Batch 3: work order / complaint profile (6 separate queries → 1)
    const [[woRow]] = await pool.query(
      `SELECT
         COUNT(*) AS totalComplaints,
         SUM(CASE WHEN wo.status = 'in_progress' THEN 1 ELSE 0 END) AS wipComplaints,
         SUM(CASE WHEN wo.status = 'completed'   THEN 1 ELSE 0 END) AS resolvedComplaints,
         SUM(CASE WHEN wo.status = 'closed'       THEN 1 ELSE 0 END) AS closedComplaints,
         SUM(CASE WHEN wo.status IN ('open','in_progress') AND wo.created_at >= NOW() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS lt7dComplaints,
         SUM(CASE WHEN wo.status IN ('open','in_progress') AND wo.created_at < NOW()  - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS gt7dComplaints
       ${woJoin}`, compArgs
    ).catch(() => [[{ totalComplaints: 0, wipComplaints: 0, resolvedComplaints: 0, closedComplaints: 0, lt7dComplaints: 0, gt7dComplaints: 0 }]]);
    const { totalComplaints, wipComplaints, resolvedComplaints, closedComplaints, lt7dComplaints, gt7dComplaints } = woRow;

    const [[{ totalEmployees }]] = await pool.query(
      `SELECT COUNT(*) AS totalEmployees ${compBase.replace("FROM companies c", "FROM company_users u JOIN companies c ON c.id = u.company_id")}`,
      compArgs
    );
    const [byCompany] = await pool.query(
      `SELECT c.id, c.company_name AS companyName,
              COUNT(DISTINCT a.id)  AS assetCount,
              COUNT(DISTINCT u.id)  AS employeeCount
       FROM companies c
       LEFT JOIN assets a       ON a.company_id = c.id
       LEFT JOIN company_users u ON u.company_id = c.id
       WHERE c.user_id = ?
       GROUP BY c.id`, [userId]
    );

    // User-wise breakdown (employees + their created asset/complaint count)
    let byUserWhere = "WHERE c.user_id = ?";
    const byUserArgs = [userId, ...companyIds];
    if (companyIds.length === 1) byUserWhere += " AND c.id = ?";
    else if (companyIds.length > 1) {
      const ph = companyIds.map(() => "?").join(",");
      byUserWhere += ` AND c.id IN (${ph})`;
    } else {
      byUserArgs.length = 1; // just userId
    }
    const [byUser] = await pool.query(
      `SELECT u.id, u.full_name AS userName, u.email, u.role,
              c.id AS companyId, c.company_name AS companyName,
              COUNT(DISTINCT a.id) AS createdAssets,
              COUNT(DISTINCT wo.id) AS createdComplaints
       FROM company_users u
       JOIN (
         SELECT id AS user_id, company_id FROM company_users
         UNION
         SELECT user_id, company_id FROM user_company_access
       ) AS uca ON uca.user_id = u.id
       JOIN companies c ON c.id = uca.company_id
       LEFT JOIN assets a ON a.created_by = u.id
       LEFT JOIN work_orders wo ON wo.created_by = u.id
       ${byUserWhere}
       GROUP BY u.id, u.full_name, u.email, u.role, c.id, c.company_name
       HAVING u.id = (
         SELECT MAX(u2.id) FROM company_users u2
         WHERE u2.full_name = u.full_name AND u2.company_id = c.id
       )
       ORDER BY c.company_name, u.full_name`,
      byUserArgs
    ).catch(() => [[]]);

    res.json({
      totalCompanies, activeCompanies, totalAssets, totalEmployees,
      assetProfile: { total: totalAssets, critical: criticalAssets, nonCritical: nonCriticalAssets, condemned: condemnedAssets, rber: rberAssets, verifiedAssets, totalAssetValue: Number(totalAssetValue || 0) },
      complaintProfile: { total: totalComplaints, wip: wipComplaints, lt7d: lt7dComplaints, gt7d: gt7dComplaints, resolved: resolvedComplaints, closed: closedComplaints },
      calibrationProfile: { total: calTotal, dueThisMonth: calDueThisMonth, overdue: calOverdue, upcoming30d: calUpcoming30d, completedThisMonth: calCompletedThisMonth },
      byCompany, byUser,
    });
  } catch (err) { next(err); }
});

// GET /api/companies/assets/:id — single asset detail for admin
router.get("/assets/:id", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const assetId = Number(req.params.id);
    const [[row]] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.generated_asset_id AS "generatedAssetId",
              a.asset_type AS "assetType", a.status, a.criticality, a.working_status,
              a.is_verified AS "isVerified",
              a.building, a.floor, a.room,
              a.building_id AS "buildingId", a.floor_id AS "floorId", a.room_id AS "roomId",
              a.location_id AS "locationId", a.department_id AS "departmentId",
              a.assigned_to AS "assignedTo",
              a.created_at AS "createdAt",
              c.id AS "companyId", c.company_name AS "companyName",
              d.name AS "departmentName",
              ad.metadata
       FROM assets a
       JOIN companies c ON c.id = a.company_id AND c.user_id = ?
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       WHERE a.id = ?`,
      
      [userId, assetId]
    );
    if (!row) return res.status(404).json({ message: "Asset not found" });
    if (row.metadata && typeof row.metadata === "string") {
      try { row.metadata = JSON.parse(row.metadata); } catch {}
    }
    res.json(row);
  } catch (err) { next(err); }
});

// GET /api/companies/work-orders — work orders for a specific asset (used by asset detail overview)
router.get("/work-orders", async (req, res, next) => {
  try {
    const { assetId, limit = 200 } = req.query;
    if (!assetId) return res.status(400).json({ message: "assetId required" });
    const [rows] = await pool.query(
      `SELECT wo.id,
              wo.work_order_number  AS "workOrderNumber",
              wo.asset_name         AS "assetName",
              wo.location,
              wo.issue_description  AS "issueDescription",
              wo.priority, wo.status,
              wo.created_at         AS "createdAt",
              wo.wip_at             AS "wipAt",
              wo.resolution_at      AS "resolutionAt",
              wo.closed_at          AS "closedAt",
              cu.full_name          AS "assignedToName"
       FROM work_orders wo
       JOIN companies c ON c.id = wo.company_id AND c.user_id = ?
       LEFT JOIN company_users cu ON cu.id = wo.cp_assigned_to
       WHERE wo.asset_id = ?
       ORDER BY wo.created_at DESC
       LIMIT ?`,
      [req.user.id, Number(assetId), Number(limit)]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { next(err); }
});

// GET /api/companies/assets — full asset list for all companies managed by this user
router.get("/assets", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { status, companyId } = req.query;
    let where = "WHERE c.user_id = ?";
    const params = [userId];
    if (companyId) { where += " AND c.id = ?"; params.push(Number(companyId)); }
    if (status) {
      if (status === "critical") {
        where += " AND LOWER(COALESCE(NULLIF(a.criticality, ''), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.criticality')), 'non_critical')) = 'critical'";
      } else if (status === "non_critical") {
        where += " AND LOWER(COALESCE(NULLIF(a.criticality, ''), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.criticality')), 'non_critical')) IN ('non_critical','non-critical','noncritical')";
      } else if (status === "condemned") {
        where += " AND (LOWER(COALESCE(NULLIF(a.working_status, ''), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.workingStatus')), '')) = 'condemned' OR LOWER(a.status) = 'condemned' OR LOWER(COALESCE(a.condemned, '0')) = '1')";
      } else if (status === "rber") {
        where += " AND (LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.rber')), 'false')) IN ('1','true','yes') OR LOWER(a.status) = 'rber' OR LOWER(COALESCE(a.rber, '0')) = '1')";
      } else if (status === "verified") {
        where += " AND COALESCE(a.is_verified, a.verified, 0) = 1";
      }
    }
    const [rows] = await pool.query(
      `SELECT a.id, a.asset_name AS "assetName", a.asset_unique_id AS "assetUniqueId",
              a.asset_type AS "assetType", a.status,
              COALESCE(a.criticality, '') AS "criticality",
              a.building, a.floor, a.room,
              a.created_at AS "createdAt", a.updated_at AS "updatedAt",
              c.company_name AS "companyName",
              d.name AS "departmentName",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.equipmentName')), a.asset_name) AS "equipmentName",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.make')), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.manufacturer')), '') AS "make",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.model')), '') AS "model",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.serialNo')), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.srNo')), '') AS "serialNo",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.accessories')), '') AS "accessories",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.dealer')), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.distributor')), '') AS "dealer",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.mfgYear')), '') AS "mfgYear",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), '') AS "purchaseCost",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseDate')), '') AS "purchaseDate",
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.maintenanceType')), '') AS "maintenanceType",
              ad.metadata
       FROM assets a
       JOIN companies c ON c.id = a.company_id
       LEFT JOIN departments d ON d.id = a.department_id
       LEFT JOIN asset_details ad ON ad.asset_id = a.id
       ${where}
       ORDER BY c.company_name, a.asset_name`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.get("/", async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.id,
              c.company_name        AS "companyName",
              c.company_code        AS "companyCode",
              c.description,
              c.address_line1       AS "addressLine1",
              c.address_line2       AS "addressLine2",
              c.city,
              c.state_name          AS "state",
              c.state_id            AS "stateId",
              st.state_code         AS "stateCode",
              c.country,
              c.pincode,
              c.gst_number          AS "gstNumber",
              c.pan_number          AS "panNumber",
              c.cin_number          AS "cinNumber",
              c.contract_start_date AS "contractStartDate",
              c.contract_end_date   AS "contractEndDate",
              c.billing_cycle       AS "billingCycle",
              c.payment_terms_days  AS "paymentTermsDays",
              c.max_employees       AS "maxEmployees",
              c.qsr_module          AS "qsrModule",
              c.premeal_module      AS "premealModule",
              c.delivery_module     AS "deliveryModule",
              c.allow_guest_booking AS "allowGuestBooking",
              c.enabled_modules     AS "enabledModules",
              c.sector,
              c.entity_type         AS "entityType",
              c.facility_type       AS "facilityType",
              c.contact_person_name AS "contactPersonName",
              c.contact_person_phone AS "contactPersonPhone",
              c.contact_email       AS "contactEmail",
              c.sectors,
              c.status,
              c.created_at          AS "createdAt",
              COALESCE(cu.employee_count, 0) AS "employeeCount"
       FROM companies c
       LEFT JOIN (
         SELECT company_id, COUNT(*) AS employee_count
         FROM company_users
         GROUP BY company_id
       ) cu ON cu.company_id = c.id
       LEFT JOIN states st ON st.id = c.state_id
       WHERE c.user_id = ?
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    const parsed = rows.map((r) => ({
      ...r,
      enabledModules: r.enabledModules ? (typeof r.enabledModules === "string" ? JSON.parse(r.enabledModules) : r.enabledModules) : null,
      sectors: r.sectors ? (typeof r.sectors === "string" ? JSON.parse(r.sectors) : r.sectors) : (r.sector ? [r.sector] : []),
    }));
    res.json(parsed);
  } catch (err) {
    next(err);
  }
});

router.post(
  "/",
  validate(companyRules),
  async (req, res, next) => {
    try {
      const {
        companyName,
        companyCode,
        description,
        addressLine1,
        addressLine2,
        city,
        state,
        stateId,
        country,
        pincode,
        gstNumber,
        panNumber,
        cinNumber,
        contractStartDate,
        contractEndDate,
        billingCycle,
        paymentTermsDays,
        maxEmployees,
        qsrModule = true,
        premealModule = true,
        deliveryModule = true,
        allowGuestBooking = false,
        status = "Active",
        enabledModules,
        sector,
        sectors,
        entityType,
        facilityType,
        contactPersonName,
        contactPersonPhone,
        contactEmail,
      } = req.body;

      const safeCompanyName = companyName?.trim() || "Untitled Company";
      const safeCompanyCode = (companyCode?.trim() || "").toUpperCase();
      if (!safeCompanyCode) return res.status(400).json({ message: "Company code is required" });

      const stateRef = await resolveStateRef(stateId, state);
      const safeStateId = stateRef?.id ?? null;
      const safeStateName = stateRef?.stateName ?? (state || null);
      const safePaymentTerms = toNullableInt(paymentTermsDays);
      const safeMaxEmployees = toNullableInt(maxEmployees);
      const safeBillingCycle = billingCycle?.trim() || null;
      const safeContractStart = contractStartDate || null;
      const safeContractEnd = contractEndDate || null;
      const safeEnabledModules = enabledModules ? JSON.stringify(enabledModules) : null;
      const safeSectors = Array.isArray(sectors) && sectors.length > 0 ? JSON.stringify(sectors) : null;

      const [result] = await pool.execute(
        `INSERT INTO companies (
            company_name, company_code, description,
            address_line1, address_line2, city, state_name, state_id, country, pincode,
            gst_number, pan_number, cin_number,
            contract_start_date, contract_end_date, billing_cycle,
            payment_terms_days, max_employees,
            qsr_module, premeal_module, delivery_module, allow_guest_booking,
            enabled_modules, sector, entity_type, facility_type,
            contact_person_name, contact_person_phone, contact_email,
            sectors, status, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id` ,
        [
          safeCompanyName, safeCompanyCode, description,
          addressLine1, addressLine2, city, safeStateName, safeStateId, country, pincode,
          gstNumber, panNumber, cinNumber,
          safeContractStart, safeContractEnd, safeBillingCycle,
          safePaymentTerms, safeMaxEmployees,
          qsrModule ? 1 : 0, premealModule ? 1 : 0, deliveryModule ? 1 : 0, allowGuestBooking ? 1 : 0,
          safeEnabledModules, sector || null, entityType || null, facilityType || null,
          contactPersonName || null, contactPersonPhone || null, contactEmail || null,
          safeSectors, status, req.user.id,
        ]
      );

      res.status(201).json({
        id: result.insertId,
        companyName: safeCompanyName,
        companyCode: safeCompanyCode,
        description,
        addressLine1, addressLine2, city, state: safeStateName, stateId: safeStateId, stateCode: stateRef?.stateCode || null, country, pincode,
        gstNumber, panNumber, cinNumber,
        contractStartDate, contractEndDate, billingCycle, paymentTermsDays, maxEmployees,
        qsrModule: !!qsrModule, premealModule: !!premealModule,
        deliveryModule: !!deliveryModule, allowGuestBooking: !!allowGuestBooking,
        enabledModules: enabledModules || null,
        sector: sector || null,
        entityType: entityType || null,
        facilityType: facilityType || null,
        contactPersonName: contactPersonName || null,
        contactPersonPhone: contactPersonPhone || null,
        contactEmail: contactEmail || null,
        sectors: Array.isArray(sectors) ? sectors : (sector ? [sector] : null),
        status,
      });
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY" || err?.errno === 1062) {
        return res.status(400).json({ message: "Company code already exists" });
      }
      next(err);
    }
  }
);

router.put(
  "/:id",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const {
        companyName, companyCode, description,
        addressLine1, addressLine2, city, state, stateId, country, pincode,
        gstNumber, panNumber, cinNumber,
        contractStartDate, contractEndDate, billingCycle,
        paymentTermsDays, maxEmployees,
        qsrModule, premealModule, deliveryModule, allowGuestBooking,
        status, enabledModules,
        sector, entityType, facilityType,
        contactPersonName, contactPersonPhone, contactEmail,
        sectors,
      } = req.body;

      const safeCompanyName = companyName?.trim() || "Untitled Company";
      const safeCompanyCode = (companyCode?.trim() || "").toUpperCase();
  if (!safeCompanyCode) return res.status(400).json({ message: "Company code is required" });

  const stateRef = await resolveStateRef(stateId, state);
  const safeStateId = stateRef?.id ?? null;
  const safeStateName = stateRef?.stateName ?? (state || null);
      const safeEnabledModules = enabledModules !== undefined ? JSON.stringify(enabledModules) : undefined;
      const safeSectors = Array.isArray(sectors) && sectors.length > 0 ? JSON.stringify(sectors) : null;

      const [result] = await pool.execute(
        `UPDATE companies SET
            company_name = ?, company_code = ?, description = ?,
          address_line1 = ?, address_line2 = ?, city = ?, state_name = ?, state_id = ?, country = ?, pincode = ?,
            gst_number = ?, pan_number = ?, cin_number = ?,
            contract_start_date = ?, contract_end_date = ?, billing_cycle = ?,
            payment_terms_days = ?, max_employees = ?,
            qsr_module = ?, premeal_module = ?, delivery_module = ?, allow_guest_booking = ?,
            enabled_modules = ?,
            sector = ?, entity_type = ?, facility_type = ?,
            contact_person_name = ?, contact_person_phone = ?, contact_email = ?,
            sectors = ?,
            status = ?
         WHERE id = ? AND user_id = ?`,
        [
          safeCompanyName, safeCompanyCode, description,
          addressLine1, addressLine2, city, safeStateName, safeStateId, country, pincode,
          gstNumber, panNumber, cinNumber,
          contractStartDate || null, contractEndDate || null, billingCycle || null,
          toNullableInt(paymentTermsDays), toNullableInt(maxEmployees),
          qsrModule ? 1 : 0, premealModule ? 1 : 0, deliveryModule ? 1 : 0, allowGuestBooking ? 1 : 0,
          safeEnabledModules !== undefined ? safeEnabledModules : null,
          sector || null, entityType || null, facilityType || null,
          contactPersonName || null, contactPersonPhone || null, contactEmail || null,
          safeSectors,
          status || "Active",
          id, req.user.id,
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Company not found" });
      }

      return res.json({
        id: Number(id), companyName: safeCompanyName, companyCode: safeCompanyCode,
        description, addressLine1, addressLine2, city, state: safeStateName, stateId: safeStateId, stateCode: stateRef?.stateCode || null, country, pincode,
        gstNumber, panNumber, cinNumber, contractStartDate, contractEndDate, billingCycle,
        paymentTermsDays, maxEmployees,
        qsrModule: !!qsrModule, premealModule: !!premealModule,
        deliveryModule: !!deliveryModule, allowGuestBooking: !!allowGuestBooking,
        enabledModules: enabledModules || null,
        sector: sector || null,
        entityType: entityType || null,
        facilityType: facilityType || null,
        contactPersonName: contactPersonName || null,
        contactPersonPhone: contactPersonPhone || null,
        contactEmail: contactEmail || null,
        sectors: Array.isArray(sectors) ? sectors : (sector ? [sector] : null),
        status: status || "Active",
      });
    } catch (err) {
      if (err?.code === "ER_DUP_ENTRY" || err?.errno === 1062) {
        return res.status(400).json({ message: "Company code already exists" });
      }
      return next(err);
    }
  }
);

router.delete(
  "/:id",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const [result] = await pool.execute(
        `DELETE FROM companies WHERE id = ? AND user_id = ?`,
        [id, req.user.id]
      );
      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "Company not found" });
      }
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

/* ── Company Overview (admin sees company data from employee portal) ─────────── */
router.get(
  "/:id/overview",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const companyId = Number(req.params.id);

      // Verify company belongs to this admin
      const [[company]] = await pool.query(
        `SELECT id, company_name AS "companyName", company_code AS "companyCode", status FROM companies WHERE id = ? AND user_id = ?`,
        [companyId, req.user.id]
      );
      if (!company) return res.status(404).json({ message: "Company not found" });

      const [assets, checklists, logsheets, departments] = await Promise.all([
        pool.query(
          `SELECT a.id, a.asset_name AS "assetName", a.asset_type AS "assetType",
                  a.asset_unique_id AS "assetUniqueId", a.status, a.building, a.floor, a.room,
                  d.name AS "departmentName", a.created_at AS "createdAt"
           FROM assets a
           LEFT JOIN departments d ON d.id = a.department_id
           WHERE a.company_id = ? ORDER BY a.asset_name`,
          [companyId]
        ),
        pool.query(
          `SELECT ct.id, ct.template_name AS "templateName", ct.asset_type AS "assetType",
                  ct.category, ct.frequency, ct.status, ct.created_at AS "createdAt",
                  COUNT(ctq.id) AS "questionCount"
           FROM checklist_templates ct
           LEFT JOIN checklist_template_questions ctq ON ctq.template_id = ct.id
           WHERE ct.company_id = ?
           GROUP BY ct.id
           ORDER BY ct.template_name`,
          [companyId]
        ),
        pool.query(
          `SELECT lt.id, lt.template_name AS "templateName", lt.asset_type AS "assetType",
                  lt.asset_model AS "assetModel", lt.frequency, lt.is_active AS "isActive",
                  a.asset_name AS "assetName", lt.created_at AS "createdAt",
                  (SELECT COUNT(*) FROM logsheet_entries le WHERE le.template_id = lt.id) AS "entryCount"
           FROM logsheet_templates lt
           LEFT JOIN assets a ON a.id = lt.asset_id
           WHERE lt.company_id = ?
           ORDER BY lt.template_name`,
          [companyId]
        ),
        pool.query(
          `SELECT id, name, description FROM departments WHERE company_id = ? ORDER BY name`,
          [companyId]
        ),
      ]);

      res.json({
        company,
        assets: assets[0],
        checklists: checklists[0],
        logsheets: logsheets[0],
        departments: departments[0],
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ── Role Permissions ──────────────────────────────────────────────────────── */
router.get(
  "/:id/role-permissions",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const companyId = Number(req.params.id);
      const [[co]] = await pool.query(`SELECT 1 FROM companies WHERE id = ? AND user_id = ?`, [companyId, req.user.id]);
      if (!co) return res.status(404).json({ message: "Company not found" });
      const [rows] = await pool.query(`SELECT role, permissions FROM role_permissions WHERE company_id = ?`, [companyId]);
      const result = {};
      rows.forEach((r) => {
        result[r.role] = typeof r.permissions === "string" ? JSON.parse(r.permissions) : r.permissions;
      });
      res.json(result);
    } catch (err) { next(err); }
  }
);

router.put(
  "/:id/role-permissions",
  validate([param("id").isInt().withMessage("id must be numeric")]),
  async (req, res, next) => {
    try {
      const companyId = Number(req.params.id);
      const [[co]] = await pool.query(`SELECT 1 FROM companies WHERE id = ? AND user_id = ?`, [companyId, req.user.id]);
      if (!co) return res.status(404).json({ message: "Company not found" });
      // req.body: { admin: { assets: {c,r,u,d}, ... }, supervisor: {...}, ... }
      for (const [role, perms] of Object.entries(req.body)) {
        const permJson = JSON.stringify(perms);
        const [updateResult] = await pool.query(
          `UPDATE role_permissions
           SET permissions = ?
           WHERE company_id = ? AND role = ?`,
          [permJson, companyId, role]
        );
        if (!updateResult?.affectedRows) {
          await pool.query(
            `INSERT INTO role_permissions (company_id, role, permissions)
             VALUES (?, ?, ?)`,
            [companyId, role, permJson]
          );
        }
      }
      res.json({ ok: true });
    } catch (err) { next(err); }
  }
);

export default router;
