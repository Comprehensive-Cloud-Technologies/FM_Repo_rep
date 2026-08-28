/**
 * Asset Pro Intelligence — natural-language report generator (Phase A).
 * Prefix: /api/company-portal/asset-intelligence
 *
 * The user types a plain-English request; a rule-based parser maps it to a
 * VALIDATED report spec against a fixed catalog (no LLM, no raw SQL from user
 * input). Every query is parameterized and company-scoped, so nothing outside
 * the catalog — or another company's data — can ever be reached.
 *
 * Datasets: assets · requests · calibration · pms · sla
 */
import { Router } from "express";
import pool from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";
import { requirePermission } from "../middleware/requirePermission.js";

const router = Router();
router.use(requireCompanyAuth);

// ── Company scope ────────────────────────────────────────────────────────────
async function accessibleCompanyIds(userId, primaryId) {
  const [extra] = await pool.query(
    "SELECT company_id AS companyId FROM user_company_access WHERE user_id = ?", [userId]
  ).catch(() => [[]]);
  const ids = new Set([Number(primaryId)]);
  extra.forEach((r) => ids.add(Number(r.companyId)));
  return [...ids];
}
async function resolveCompanyIds(req) {
  const own = Number(req.companyUser.companyId);
  const all = await accessibleCompanyIds(req.companyUser.id, own);
  const requested = Number(req.query.companyId || req.body?.companyId);
  if (requested && all.includes(requested)) return [requested];
  return all; // default: everything the user may see
}

// ── Report catalog ───────────────────────────────────────────────────────────
// Every SQL fragment here is server-defined; user text never reaches the query.
const DEPTS = ["icu", "nicu", "picu", "ccu", "ot", "opd", "ipd", "ward", "lab",
  "pathology", "radiology", "emergency", "casualty", "dialysis", "pharmacy", "blood bank"];

const CATALOG = {
  assets: {
    label: "Assets",
    from: `assets a
           LEFT JOIN departments d ON d.id = a.department_id
           LEFT JOIN asset_details ad ON ad.asset_id = a.id
           LEFT JOIN companies co ON co.id = a.company_id`,
    companyCol: "a.company_id",
    dateCol: "a.created_at",
    cols: {
      hospital:    { label: "Hospital",    sql: "co.company_name" },
      name:        { label: "Asset",       sql: "a.asset_name" },
      code:        { label: "Code",        sql: "a.asset_unique_id" },
      make:        { label: "Make",        sql: "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.make')), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.manufacturer')))" },
      model:       { label: "Model",       sql: "JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.model'))" },
      serialNo:    { label: "Serial No",   sql: "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.serialNo')), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.srNo')))" },
      type:        { label: "Type",        sql: "a.asset_type" },
      category:    { label: "Category",    sql: "a.asset_category" },
      department:  { label: "Department",  sql: "d.name" },
      criticality: { label: "Criticality", sql: "a.criticality" },
      status:      { label: "Status",      sql: "a.working_status" },
      location:    { label: "Location",    sql: "CONCAT_WS(', ', a.building, a.floor, a.room)" },
      verified:    { label: "Verified",    sql: "CASE WHEN a.is_verified = 1 THEN 'Yes' ELSE 'No' END" },
    },
    defaultCols: ["hospital", "name", "code", "make", "model", "serialNo", "department", "category", "criticality", "status", "location"],
    deptCol: "d.name",
    filters: [
      { kw: ["critical"],                        where: "a.criticality = 'Critical'" },
      { kw: ["non critical", "non-critical"],    where: "a.criticality = 'Non_Critical'" },
      { kw: ["not working", "faulty", "down", "breakdown", "out of order"], where: "a.working_status IN ('Not_Working','HNF')" },
      { kw: ["working", "operational"],          where: "a.working_status = 'Working'" },
      { kw: ["under repair", "wip", "in repair"], where: "a.working_status = 'WIP'" },
      { kw: ["condemned"],                       where: "a.working_status = 'Condemned'" },
      { kw: ["rber"],                            where: "a.working_status = 'RBER'" },
      { kw: ["verified"],                        where: "a.is_verified = 1" },
      { kw: ["unverified", "not verified"],      where: "(a.is_verified = 0 OR a.is_verified IS NULL)" },
    ],
    groupBy: { department: "d.name", criticality: "a.criticality", status: "a.working_status", type: "a.asset_type", hospital: "co.company_name" },
    // Value-based column filters: maps user-typed keywords → SQL expression for LIKE matching
    valueFilters: {
      make:         { aliases: ["make", "manufacturer", "brand", "made by"], sql: "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.make')), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.manufacturer')), '')" },
      model:        { aliases: ["model"],                                   sql: "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.model')), '')" },
      serialNo:     { aliases: ["serial", "serial no", "serial number", "sr no", "srno"], sql: "COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.serialNo')), JSON_UNQUOTE(JSON_EXTRACT(ad.metadata,'$.srNo')), '')" },
      type:         { aliases: ["type", "asset type"],                      sql: "COALESCE(a.asset_type, '')" },
      category:     { aliases: ["category", "asset category"],              sql: "COALESCE(a.asset_category, '')" },
      name:         { aliases: ["name", "asset name", "named"],             sql: "COALESCE(a.asset_name, '')" },
      code:         { aliases: ["code", "asset code", "asset id", "unique id"], sql: "COALESCE(a.asset_unique_id, '')" },
      hospital:     { aliases: ["hospital", "company"],                     sql: "COALESCE(co.company_name, '')" },
      location:     { aliases: ["location", "building", "floor", "room"],   sql: "CONCAT_WS(', ', a.building, a.floor, a.room)" },
    },
  },

  requests: {
    label: "Requests",
    from: `asset_queries aq
           LEFT JOIN assets a ON a.id = aq.asset_id
           LEFT JOIN departments d ON d.id = a.department_id
           LEFT JOIN company_users cu ON cu.id = aq.assigned_to
           LEFT JOIN companies co ON co.id = aq.company_id`,
    companyCol: "aq.company_id",
    dateCol: "aq.created_at",
    cols: {
      hospital:   { label: "Hospital",    sql: "co.company_name" },
      ticket:     { label: "Ticket",      sql: "CONCAT('AQ-', aq.id)" },
      asset:      { label: "Asset",       sql: "a.asset_name" },
      department: { label: "Department",  sql: "d.name" },
      priority:   { label: "Priority",    sql: "aq.priority" },
      status:     { label: "Status",      sql: "aq.status" },
      assignedTo: { label: "Assigned to", sql: "cu.full_name" },
      raised:     { label: "Raised on",   sql: "DATE(aq.created_at)" },
    },
    defaultCols: ["hospital", "ticket", "asset", "priority", "status", "assignedTo"],
    deptCol: "d.name",
    filters: [
      { kw: ["open"],                      where: "aq.status = 'open'" },
      { kw: ["in progress", "in-progress", "ongoing"], where: "aq.status IN ('in_progress','wip')" },
      { kw: ["resolved"],                  where: "aq.status = 'resolved'" },
      { kw: ["closed"],                    where: "aq.status = 'closed'" },
      { kw: ["unassigned"],                where: "aq.assigned_to IS NULL" },
      { kw: ["overdue", "pending long", "aging"], where: "aq.status IN ('open','in_progress','wip') AND DATEDIFF(CURDATE(), DATE(aq.created_at)) >= 7" },
      { kw: ["high priority", "urgent", "critical priority"], where: "LOWER(aq.priority) IN ('high','p1','p2')" },
    ],
    groupBy: { status: "aq.status", priority: "aq.priority", department: "d.name", assignedto: "cu.full_name", hospital: "co.company_name" },
    valueFilters: {
      asset:      { aliases: ["asset", "asset name"],    sql: "COALESCE(a.asset_name, '')" },
      assignedTo: { aliases: ["assigned to", "assigned", "engineer"], sql: "COALESCE(cu.full_name, '')" },
    },
  },

  calibration: {
    label: "Calibration",
    from: `calibration_schedules cs
           JOIN calibration_schedule_assets csa ON csa.schedule_id = cs.id
           LEFT JOIN assets a ON a.id = csa.asset_id
           LEFT JOIN departments d ON d.id = a.department_id
           LEFT JOIN companies co ON co.id = cs.company_id`,
    companyCol: "cs.company_id",
    dateCol: "cs.calibration_date",
    cols: {
      hospital:    { label: "Hospital",         sql: "co.company_name" },
      asset:       { label: "Asset",            sql: "a.asset_name" },
      department:  { label: "Department",       sql: "d.name" },
      calibration: { label: "Calibration date", sql: "DATE(cs.calibration_date)" },
      status:      { label: "Status",           sql: "csa.status" },
    },
    defaultCols: ["hospital", "asset", "department", "calibration", "status"],
    deptCol: "d.name",
    filters: [
      { kw: ["due", "pending", "upcoming"],  where: "csa.status = 'pending'" },
      { kw: ["completed", "done"],           where: "csa.status = 'completed'" },
      { kw: ["overdue", "missed"],           where: "csa.status = 'pending' AND cs.calibration_date < CURDATE()" },
    ],
    groupBy: { status: "csa.status", department: "d.name", hospital: "co.company_name" },
    valueFilters: {
      asset: { aliases: ["asset", "asset name"], sql: "COALESCE(a.asset_name, '')" },
    },
  },

  pms: {
    label: "PMS",
    from: `pms_schedules ps
           JOIN pms_schedule_assets psa ON psa.schedule_id = ps.id
           LEFT JOIN assets a ON a.id = psa.asset_id
           LEFT JOIN departments d ON d.id = a.department_id
           LEFT JOIN companies co ON co.id = ps.company_id`,
    companyCol: "ps.company_id",
    dateCol: "ps.maintenance_date",
    cols: {
      hospital:    { label: "Hospital",         sql: "co.company_name" },
      asset:       { label: "Asset",            sql: "a.asset_name" },
      department:  { label: "Department",       sql: "d.name" },
      maintenance: { label: "Maintenance date", sql: "DATE(ps.maintenance_date)" },
      engineer:    { label: "Engineer",         sql: "ps.engineer_name" },
      status:      { label: "Status",           sql: "psa.status" },
    },
    defaultCols: ["hospital", "asset", "department", "maintenance", "engineer", "status"],
    deptCol: "d.name",
    filters: [
      { kw: ["due", "pending", "upcoming"], where: "psa.status = 'pending'" },
      { kw: ["completed", "done"],          where: "psa.status = 'completed'" },
      { kw: ["overdue", "missed"],          where: "psa.status = 'pending' AND ps.maintenance_date < CURDATE()" },
    ],
    groupBy: { status: "psa.status", department: "d.name", engineer: "ps.engineer_name", hospital: "co.company_name" },
    valueFilters: {
      asset:    { aliases: ["asset", "asset name"],    sql: "COALESCE(a.asset_name, '')" },
      engineer: { aliases: ["engineer", "assigned to"], sql: "COALESCE(ps.engineer_name, '')" },
    },
  },

  sla: {
    label: "SLA",
    from: `ticket_sla ts
           JOIN ticket_sla_clocks c ON c.ticket_sla_id = ts.id`,
    companyCol: "ts.snapshot_company_id",
    // Match the SLA dashboard: only SLA-eligible tickets count.
    base: "ts.is_sla_eligible = 1",
    dateCol: "ts.sla_start_time",
    cols: {
      hospital:   { label: "Hospital",   sql: "ts.snapshot_company_name" },
      ticket:     { label: "Ticket",     sql: "CONCAT('AQ-', ts.query_id)" },
      asset:      { label: "Asset",      sql: "ts.snapshot_asset_name" },
      department: { label: "Department", sql: "ts.snapshot_dept_name" },
      priority:   { label: "Priority",   sql: "ts.priority" },
      type:       { label: "SLA clock",  sql: "c.clock_type" },
      slaStatus:  { label: "SLA status", sql: "c.status" },
      breachMins: { label: "Breach mins", sql: "c.breach_mins" },
    },
    defaultCols: ["hospital", "ticket", "asset", "priority", "type", "slaStatus", "breachMins"],
    deptCol: "ts.snapshot_dept_name",
    filters: [
      { kw: ["breaches", "breach", "breached", "missed", "violation"], where: "c.status = 'breached'" },
      { kw: ["met", "on time", "within sla"],              where: "c.status = 'met'" },
      { kw: ["response"],                                  where: "c.clock_type = 'response'" },
      { kw: ["attendance", "attend"],                      where: "c.clock_type = 'attendance'" },
      { kw: ["resolution", "resolve"],                     where: "c.clock_type = 'resolution'" },
    ],
    groupBy: { department: "ts.snapshot_dept_name", priority: "ts.priority", type: "c.clock_type", status: "c.status", hospital: "ts.snapshot_company_name" },
    valueFilters: {
      asset: { aliases: ["asset", "asset name"], sql: "COALESCE(ts.snapshot_asset_name, '')" },
    },
  },
};

// Dataset detection — order matters (more specific first). Stems (no trailing
// boundary) so plurals like "requests"/"breaches" match.
function detectDataset(q) {
  if (/\b(sla|breach|violation)/.test(q)) return "sla";
  if (/\bcalibrat/.test(q)) return "calibration";
  if (/\b(pms|preventive|maintenance)/.test(q)) return "pms";
  if (/\b(request|complaint|ticket|issue|case ?log|breakdown call)/.test(q)) return "requests";
  return "assets";
}

function detectDateRange(q, dateCol) {
  if (/\btoday\b/.test(q))        return { where: `DATE(${dateCol}) = CURDATE()`, label: "today" };
  if (/\byesterday\b/.test(q))    return { where: `DATE(${dateCol}) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`, label: "yesterday" };
  if (/\bthis week\b/.test(q))    return { where: `YEARWEEK(${dateCol}, 1) = YEARWEEK(CURDATE(), 1)`, label: "this week" };
  if (/\bthis month\b/.test(q))   return { where: `YEAR(${dateCol}) = YEAR(CURDATE()) AND MONTH(${dateCol}) = MONTH(CURDATE())`, label: "this month" };
  if (/\blast month\b/.test(q))   return { where: `${dateCol} >= DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m-01') AND ${dateCol} < DATE_FORMAT(CURDATE(), '%Y-%m-01')`, label: "last month" };
  if (/\bthis year\b/.test(q))    return { where: `YEAR(${dateCol}) = YEAR(CURDATE())`, label: "this year" };
  const m = q.match(/\blast (\d{1,3}) days\b/) || q.match(/\bpast (\d{1,3}) days\b/);
  if (m)                          return { where: `${dateCol} >= DATE_SUB(CURDATE(), INTERVAL ${Number(m[1])} DAY)`, label: `last ${Number(m[1])} days` };
  return null;
}

/**
 * Detect value-based column filters in the user prompt.
 * Matches patterns like:
 *   "make RADIOMETER", "make is RADIOMETER", "with make RADIOMETER",
 *   "where make = RADIOMETER", "model ABL90", "type ventilator",
 *   "serial no 12345", "asset name defibrillator"
 *
 * Values are always parameterized (LIKE ?) — never interpolated into SQL.
 */
function detectValueFilters(q, ds) {
  const vf = ds.valueFilters;
  if (!vf) return { whereParts: [], params: [], matched: [] };

  const whereParts = [];
  const params = [];
  const matched = [];

  // Build a flat list: [ { alias, colKey, sql }, ... ] sorted longest-alias-first
  // so "serial number" matches before "serial", "asset name" before "name", etc.
  const entries = [];
  for (const [colKey, def] of Object.entries(vf)) {
    for (const alias of def.aliases) {
      entries.push({ alias, colKey, sql: def.sql });
    }
  }
  entries.sort((a, b) => b.alias.length - a.alias.length);

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  for (const { alias, colKey, sql } of entries) {
    // Already matched this column? Skip so we don't double-filter.
    if (matched.some((m) => m.colKey === colKey)) continue;

    // Match patterns:
    //   "<alias> <value>"
    //   "<alias> is <value>"
    //   "<alias> = <value>"
    //   "with <alias> <value>"
    //   "where <alias> is <value>"
    //   "having <alias> <value>"
    // The value is one or more non-whitespace tokens (stops at common stop-words
    // like "and", "or", "in", "by", "grouped", "with", "where", "that", "which").
    const aliasRe = esc(alias);
    const patterns = [
      new RegExp(`(?:with |where |having )?${aliasRe}\\s+(?:is |= |as )?([a-z0-9][a-z0-9 _/.-]{0,60}?)(?=\\s+(?:and|or|in|by|grouped|with|where|that|which|having|assets|per|from|for|this|last|today|yesterday|$)|\\s*$)`, "i"),
    ];

    for (const pat of patterns) {
      const match = q.match(pat);
      if (match) {
        const val = match[1].trim();
        if (val.length >= 1) {
          whereParts.push(`LOWER(${sql}) LIKE ?`);
          params.push(`%${val.toLowerCase()}%`);
          matched.push({ colKey, label: `${alias}: ${val}` });
          break;
        }
      }
    }
  }

  return { whereParts, params, matched };
}

function parse(prompt) {
  const q = " " + String(prompt || "").toLowerCase().trim() + " ";
  const dsKey = detectDataset(q);
  const ds = CATALOG[dsKey];

  const whereParts = [];
  const params = [];
  const matched = [];

  // Filter atoms. Word-boundary matching so "due" doesn't fire inside "overdue";
  // matched keywords are "consumed" so an overlapping word atom can't re-match
  // (e.g. "working" inside "not working").
  const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rx = (k) => new RegExp("\\b" + esc(k) + "\\b");
  let remaining = q;
  for (const f of ds.filters) {
    const hit = f.kw.find((k) => rx(k).test(remaining));
    if (hit) {
      whereParts.push(f.where);
      matched.push(f.kw[0]);
      for (const k of f.kw) remaining = remaining.replace(new RegExp("\\b" + esc(k) + "\\b", "g"), " ");
    }
  }

  // Department keyword (assets / requests / calibration / pms)
  if (ds.deptCol) {
    const dept = DEPTS.find((dp) => new RegExp(`\\b${dp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(q));
    if (dept) { whereParts.push(`LOWER(${ds.deptCol}) LIKE ?`); params.push(`%${dept}%`); matched.push(dept.toUpperCase()); }
  }

  // Value-based column filters (e.g. "make RADIOMETER", "model ABL90")
  const vf = detectValueFilters(q, ds);
  whereParts.push(...vf.whereParts);
  params.push(...vf.params);
  matched.push(...vf.matched.map((m) => m.label));

  // Date range
  const dr = detectDateRange(q, ds.dateCol);
  if (dr) { whereParts.push(dr.where); matched.push(dr.label); }

  // Group by ("by X" / "per X" / "group by X")
  let groupBy = null, groupLabel = null;
  const gm = q.match(/\b(?:group by|grouped by|by|per)\s+([a-z ]{2,20})/);
  if (gm) {
    const token = gm[1].trim().replace(/\s+/g, "");
    for (const [key, sql] of Object.entries(ds.groupBy)) {
      if (token.startsWith(key) || key.startsWith(token)) { groupBy = sql; groupLabel = key; break; }
    }
  }

  // Top / limit — default returns the full result set (reports are downloadable);
  // "top N" narrows it deliberately.
  let limit = 5000;
  const tm = q.match(/\btop (\d{1,3})\b/) || q.match(/\b(\d{1,3}) (?:results|rows|records)\b/);
  if (tm) limit = Math.min(5000, Math.max(1, Number(tm[1])));
  const wantsTop = /\b(top|most|highest|maximum)\b/.test(q);

  return { dsKey, ds, whereParts, params, matched, groupBy, groupLabel, limit, wantsTop };
}

/* POST /generate — { prompt } → { columns, rows, summary, interpreted } */
router.post("/generate", requirePermission("report:view"), async (req, res, next) => {
  try {
    const prompt = String(req.body?.prompt || "").slice(0, 500);
    if (!prompt.trim()) return res.status(400).json({ message: "Please type what report you want." });

    const p = parse(prompt);
    const companyIds = await resolveCompanyIds(req);
    const ph = companyIds.map(() => "?").join(",");

    const where = [`${p.ds.companyCol} IN (${ph})`, ...(p.ds.base ? [p.ds.base] : []), ...p.whereParts].join(" AND ");
    const baseParams = [...companyIds, ...p.params];

    let columns, rows, sql;
    if (p.groupBy) {
      sql = `SELECT ${p.groupBy} AS grp, COUNT(*) AS count
               FROM ${p.ds.from}
              WHERE ${where}
              GROUP BY ${p.groupBy}
              ORDER BY count DESC
              LIMIT ${p.wantsTop ? p.limit : 100}`;
      const [r] = await pool.query(sql, baseParams);
      columns = [{ key: "grp", label: p.groupLabel.charAt(0).toUpperCase() + p.groupLabel.slice(1) }, { key: "count", label: "Count" }];
      rows = r.map((x) => ({ grp: x.grp ?? "—", count: Number(x.count) }));
    } else {
      const selCols = p.ds.defaultCols;
      const selectSql = selCols.map((c) => `${p.ds.cols[c].sql} AS \`${c}\``).join(", ");
      const orderCol = p.wantsTop ? null : p.ds.dateCol;
      sql = `SELECT ${selectSql}
               FROM ${p.ds.from}
              WHERE ${where}
              ${orderCol ? `ORDER BY ${orderCol} DESC` : ""}
              LIMIT ${p.limit}`;
      const [r] = await pool.query(sql, baseParams);
      columns = selCols.map((c) => ({ key: c, label: p.ds.cols[c].label }));
      rows = r;
    }

    const interpreted = [p.ds.label, ...p.matched, p.groupLabel ? `grouped by ${p.groupLabel}` : null].filter(Boolean);
    const summary = `Found ${rows.length} ${p.groupBy ? p.groupLabel + " group" + (rows.length !== 1 ? "s" : "") : p.ds.label.toLowerCase() + " record" + (rows.length !== 1 ? "s" : "")}`
      + (p.matched.length ? ` matching: ${p.matched.join(", ")}.` : ".");

    res.json({
      ok: true,
      dataset: p.dsKey,
      interpreted,       // e.g. ["Assets","critical","not working","ICU"]
      summary,
      columns,
      rows,
      count: rows.length,
    });
  } catch (err) { next(err); }
});

export default router;
