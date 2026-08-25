import { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();
const TARGET_PCT = 95;

const RAG = {
  green: { dot: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", num: "#15803d" },
  amber: { dot: "#ea580c", bg: "#fff7ed", border: "#fed7aa", num: "#c2410c" },
  red:   { dot: "#dc2626", bg: "#fef2f2", border: "#fecaca", num: "#b91c1c" },
  grey:  { dot: "#94a3b8", bg: "#f8fafc", border: "#e2e8f0", num: "#64748b" },
};
const pctCol = (v) => v == null ? "#64748b" : v >= 95 ? "#16a34a" : v >= 90 ? "#ea580c" : "#dc2626";
// Round minutes to 2 decimals (drops trailing zeros): 35.40000000009 -> 35.4
const round2 = (n) => (n == null ? null : +Number(n).toFixed(2));
const fmtMins = (m) => m == null ? "—" : m < 60 ? `${round2(m)}m` : `${Math.floor(m / 60)}h ${round2(m % 60)}m`;
const fmtDate = (s) => s ? new Date(s).toLocaleString([], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Export an array-of-arrays (headers + rows) to a real .xlsx workbook.
function downloadXlsx(filename, headers, rows, sheetName = "Report") {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // Auto-size columns to their widest cell (cap at 60 chars)
  ws["!cols"] = headers.map((h, i) => {
    const w = Math.max(String(h).length, ...rows.map(r => String(r[i] ?? "").length));
    return { wch: Math.min(Math.max(w + 2, 10), 60) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : filename.replace(/\.csv$/i, "") + ".xlsx");
}

export default function SlaDashboard({ token, allCompaniesMode = false, externalRefreshKey = 0, apiBase: apiBaseProp, onNavigateToAsset }) {
  const [slaDash, setSlaDash]         = useState(null);
  const [slaTrend, setSlaTrend]       = useState([]);
  const [slaAtRisk, setSlaAtRisk]     = useState([]);
  const [slaByEng, setSlaByEng]       = useState([]);
  const [slaByDept, setSlaByDept]     = useState([]);
  const [slaByAsset, setSlaByAsset]   = useState([]);
  const [slaLoading, setSlaLoading]   = useState(false);
  const [breachSummary, setBreachSummary] = useState(null);
  const [breachRows, setBreachRows]   = useState([]);
  const [breachReasons, setBreachReasons] = useState([]);

  const [filters, setFilters]   = useState({ dateFrom: "", dateTo: "", serviceType: "all" });
  const [breakdown, setBreakdown]   = useState(null);
  const [bdLoading, setBdLoading]   = useState(false);

  // Tile records modal
  const [tileModal, setTileModal] = useState(null); // { tile, label, rows, total, pages, page, loading }

  // Export panel
  const [exportOpen, setExportOpen] = useState(false);

  // Filter panel toggle
  const [filtersOpen, setFiltersOpen] = useState(false);

  const bUrl = useCallback(() => apiBaseProp || `${BASE}/api/company-portal/sla`, [apiBaseProp]);
  const hdr  = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const aqStr = useCallback(() => allCompaniesMode ? "allCompanies=true&" : "", [allCompaniesMode]);
  const aqQs  = useCallback(() => allCompaniesMode ? "?allCompanies=true" : "", [allCompaniesMode]);

  // Build URLSearchParams that includes allCompanies + all active filters
  const buildQs = useCallback((f) => {
    const p = new URLSearchParams();
    if (allCompaniesMode) p.set("allCompanies", "true");
    if (f?.dateFrom) p.set("dateFrom", f.dateFrom);
    if (f?.dateTo)   p.set("dateTo",   f.dateTo);
    if (f?.serviceType && f.serviceType !== "all") p.set("serviceType", f.serviceType);
    return p.toString() ? `?${p}` : "";
  }, [allCompaniesMode]);

  const fetchBreakdown = useCallback((f) => {
    if (!token) return;
    const qs = buildQs(f);
    setBdLoading(true);
    fetch(`${bUrl()}/breakdown${qs}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(data => setBreakdown(data))
      .finally(() => setBdLoading(false));
  }, [token, buildQs, bUrl, hdr]);

  const load = useCallback((f) => {
    if (!token) return;
    setSlaLoading(true);
    const qs  = buildQs(f);
    const sep = qs ? "&" : "?";
    Promise.all([
      fetch(`${bUrl()}/dashboard${qs}`,                    { headers: hdr() }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${bUrl()}/trend${qs}${sep}months=6`,          { headers: hdr() }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${bUrl()}/at-risk${qs}${sep}windowMins=120`,  { headers: hdr() }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${bUrl()}/by-engineer${qs}`,                  { headers: hdr() }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${bUrl()}/by-department${qs}`,                { headers: hdr() }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${bUrl()}/by-equipment${qs}${sep}limit=50`,   { headers: hdr() }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${bUrl()}/breach-summary${qs}`,               { headers: hdr() }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${bUrl()}/breaches${qs}${sep}limit=20`,       { headers: hdr() }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${bUrl()}/breach-reasons`,                    { headers: hdr() }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([dash, trend, atRisk, byEng, byDept, byAsset, brSummary, brList, brReasons]) => {
      if (dash) setSlaDash(dash);
      setSlaTrend(Array.isArray(trend) ? trend : []);
      setSlaAtRisk(Array.isArray(atRisk) ? atRisk : []);
      setSlaByEng(Array.isArray(byEng) ? byEng : []);
      setSlaByDept(Array.isArray(byDept) ? byDept : []);
      setSlaByAsset(Array.isArray(byAsset) ? byAsset : []);
      setBreachSummary(brSummary || null);
      setBreachRows(Array.isArray(brList?.rows) ? brList.rows : []);
      setBreachReasons(Array.isArray(brReasons) ? brReasons : []);
    }).finally(() => setSlaLoading(false));
  }, [token, buildQs, bUrl, hdr]);

  useEffect(() => {
    load(filters);
    fetchBreakdown(filters);
  }, [load, fetchBreakdown, allCompaniesMode, externalRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilter = (key, val) => {
    const nf = { ...filters, [key]: val };
    setFilters(nf);
    load(nf);
    fetchBreakdown(nf);
  };

  const resetFilters = () => {
    const nf = { dateFrom: "", dateTo: "", serviceType: "all" };
    setFilters(nf);
    load(nf);
    fetchBreakdown(nf);
  };

  // ── Tile records modal ────────────────────────────────────────────────────
  const openTileModal = useCallback((tile, label) => {
    if (!token) return;
    setTileModal({ tile, label, rows: [], total: 0, pages: 1, page: 1, loading: true });
    const p = new URLSearchParams();
    if (allCompaniesMode) p.set("allCompanies", "true");
    p.set("tile", tile); p.set("page", "1"); p.set("limit", "20");
    if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
    if (filters.dateTo)   p.set("dateTo",   filters.dateTo);
    fetch(`${bUrl()}/tile-records?${p}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(data => setTileModal(prev => ({
        ...prev, loading: false,
        rows: data?.rows ?? [], total: data?.total ?? 0, pages: data?.pages ?? 1
      })));
  }, [token, allCompaniesMode, filters, bUrl, hdr]);

  const loadTilePage = (page) => {
    if (!tileModal || !token) return;
    setTileModal(prev => ({ ...prev, loading: true, page }));
    const p = new URLSearchParams();
    if (allCompaniesMode) p.set("allCompanies", "true");
    p.set("tile", tileModal.tile); p.set("page", String(page)); p.set("limit", "20");
    if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
    if (filters.dateTo)   p.set("dateTo",   filters.dateTo);
    fetch(`${bUrl()}/tile-records?${p}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : null).catch(() => null)
      .then(data => setTileModal(prev => ({
        ...prev, loading: false,
        rows: data?.rows ?? [], total: data?.total ?? 0, pages: data?.pages ?? 1
      })));
  };

  const classifyBreach = async (queryId, clockType, breachReasonId) => {
    const h = { ...hdr(), "Content-Type": "application/json" };
    try {
      await fetch(`${bUrl()}/breaches/${queryId}/reason`, { method: "POST", headers: h, body: JSON.stringify({ clockType, breachReasonId: Number(breachReasonId) }) });
      const [brSummary, brList] = await Promise.all([
        fetch(`${bUrl()}/breach-summary`, { headers: hdr() }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${bUrl()}/breaches?limit=20`, { headers: hdr() }).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      setBreachSummary(brSummary || null);
      setBreachRows(Array.isArray(brList?.rows) ? brList.rows : []);
    } catch { /* ignore */ }
  };

  // ── Export helpers ────────────────────────────────────────────────────────
  const exportEngineers = () => {
    downloadXlsx("engineer_performance_sla.xlsx",
      ["Engineer", "Total Assigned", "Resolved", "Within SLA", "Breached", "SLA %", "Response %", "Resolution %", "Avg MTTR", "Last Ticket"],
      slaByEng.map(r => [r.engineerName, r.totalCalls, r.resolvedCount ?? "—", r.overallMet, r.breachedCount ?? "—",
        r.overallPct != null ? r.overallPct + "%" : "—", r.responsePct != null ? r.responsePct + "%" : "—",
        r.resPct != null ? r.resPct + "%" : "—",
        r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : r.avgMttrHours != null ? r.avgMttrHours + "h" : "—",
        r.lastTicketAt ? new Date(r.lastTicketAt).toLocaleDateString() : "—"]),
      "Engineer Performance");
  };

  const exportAssets = () => {
    downloadXlsx("asset_breakdown_report.xlsx",
      ["Asset ID", "Asset Name", "Total Calls", "Total Breaches", "Overall SLA %", "Avg MTTR"],
      slaByAsset.map(r => [r.assetDisplayId ?? r.assetName, r.assetName, r.totalCalls, r.totalBreaches,
        r.overallPct != null ? r.overallPct + "%" : "—",
        r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : "—"]),
      "Asset Breakdown");
  };

  const exportDepartments = () => {
    downloadXlsx("department_sla_report.xlsx",
      ["Department", "Total Calls", "Within SLA", "Breached", "SLA %", "Avg MTTR"],
      slaByDept.map(r => [r.deptName, r.totalCalls, r.overallMet, r.breachedCount ?? "—",
        r.overallPct != null ? r.overallPct + "%" : "—",
        r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : "—"]),
      "By Department");
  };

  const exportBreaches = () => {
    downloadXlsx("breach_records.xlsx",
      ["Ticket #", "Priority", "Asset", "Department", "SLA Stage", "Target", "Overdue By", "Engineer", "Reason"],
      breachRows.map(r => [r.queryId, r.priority, r.assetName ?? "—", r.deptName ?? "—",
        r.clockType, fmtMins(r.targetMins), fmtMins(r.breachMins), r.engineerName ?? "Unassigned",
        r.breachReason ?? "Unclassified"]),
      "Breach Records");
  };

  // Export ALL records for the open tile modal (fetches full set, not just the page)
  const exportTileRecords = async () => {
    if (!tileModal) return;
    const p = new URLSearchParams();
    if (allCompaniesMode) p.set("allCompanies", "true");
    p.set("tile", tileModal.tile); p.set("page", "1"); p.set("limit", "10000");
    if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
    if (filters.dateTo)   p.set("dateTo",   filters.dateTo);
    const data = await fetch(`${bUrl()}/tile-records?${p}`, { headers: hdr() }).then(r => r.ok ? r.json() : null).catch(() => null);
    const rows = data?.rows ?? tileModal.rows ?? [];
    const isAsset = ["mttr", "repeat"].includes(tileModal.tile);
    const fname = `${tileModal.label.replace(/\s+/g, "_").toLowerCase()}_records.xlsx`;
    if (isAsset) {
      downloadXlsx(fname,
        ["Asset ID", "Asset Name", "Hospital", "Make", "Model", "Serial No", "Department",
          tileModal.tile === "repeat" ? "Total Breakdowns" : "Avg MTTR",
          tileModal.tile === "repeat" ? "Avg MTTR" : "Total Calls", "Total Breaches"],
        rows.map(r => [r.assetUniqueId || (r.assetId ? `#${r.assetId}` : "—"), r.assetName ?? "—",
          r.hospitalName ?? "—", r.make ?? "—", r.model ?? "—", r.serialNo ?? "—", r.deptName ?? "—",
          tileModal.tile === "repeat" ? r.totalBreakdowns : (r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : "—"),
          tileModal.tile === "repeat" ? (r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : "—") : r.totalCalls,
          r.totalBreaches ?? "—"]),
        tileModal.label);
    } else {
      downloadXlsx(fname,
        ["Ticket #", "Asset ID", "Asset Name", "Hospital", "Make", "Model", "Serial No", "Department",
          "Engineer", "Priority", "Status", "SLA Stage", "Clock Status", "Target", "Actual", "Date"],
        rows.map(r => [`#${r.queryId}`, r.assetUniqueId || (r.assetId ? `#${r.assetId}` : "—"), r.assetName ?? "—",
          r.hospitalName ?? "—", r.make ?? "—", r.model ?? "—", r.serialNo ?? "—", r.deptName ?? "—",
          r.engineerName ?? "Unassigned", r.priority ?? "—", r.status ?? "—", r.clockType || "all",
          r.clockStatus ?? "—", fmtMins(r.targetMins), fmtMins(r.actualMins), fmtDate(r.createdAt)]),
        tileModal.label);
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const d = slaDash || {};
  const bd = breakdown;
  const unifiedCompliance = bd?.overallCompliance;
  const ticketTotal     = bd?.ticketTotal     ?? 0;
  const ticketCompliant = bd?.ticketCompliant ?? 0;
  const ticketBreached  = bd?.ticketBreached  ?? 0;
  const delta = unifiedCompliance != null ? +(unifiedCompliance - TARGET_PCT).toFixed(1) : null;
  const hasFilters = filters.dateFrom || filters.dateTo || filters.serviceType !== "all";

  const statusChip = (s) => {
    if (s === "met")      return { bg: "#f0fdf4", color: "#16a34a", label: "Met" };
    if (s === "breached") return { bg: "#fef2f2", color: "#dc2626", label: "Breached" };
    return                       { bg: "#fff7ed", color: "#ea580c", label: s === "running" ? "In Progress" : s ?? "—" };
  };

  return (
    <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", background: "#f8fafc" }}>

      {/* ── HEADER ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", gap: "10px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: 0 }}>⏱ SLA Compliance Dashboard</h1>
          <p style={{ color: "#64748b", fontSize: "13px", margin: "4px 0 0" }}>Service performance against assigned SLA policy — all eligible activities</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Filters toggle */}
          <button onClick={() => setFiltersOpen(o => !o)}
            style={{ padding: "8px 14px", background: filtersOpen || hasFilters ? "#eff6ff" : "#fff", border: `1px solid ${filtersOpen || hasFilters ? "#bfdbfe" : "#e2e8f0"}`, borderRadius: "8px", fontSize: "13px", fontWeight: 600, color: filtersOpen || hasFilters ? "#2563eb" : "#475569", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>
            Filters{hasFilters ? ` (${[filters.dateFrom, filters.dateTo, filters.serviceType !== "all" && filters.serviceType].filter(Boolean).length})` : ""}
          </button>
          {/* Export button */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setExportOpen(o => !o)}
              style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", fontWeight: 600, color: "#2563eb", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}>
              📊 Export Report ▾
            </button>
            {exportOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200, minWidth: "220px", padding: "6px 0", overflow: "hidden" }}>
                {[
                  { icon: "👷", label: "Engineer Performance", fn: exportEngineers },
                  { icon: "🔧", label: "Asset Breakdown Report", fn: exportAssets },
                  { icon: "🏢", label: "Department SLA Report", fn: exportDepartments },
                  { icon: "⚠️", label: "Breach Records", fn: exportBreaches },
                ].map(({ icon, label, fn }) => (
                  <button key={label} onClick={() => { fn(); setExportOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "9px 16px", background: "none", border: "none", cursor: "pointer", fontSize: "13px", color: "#334155", textAlign: "left" }}
                    onMouseOver={e => e.currentTarget.style.background = "#f8fafc"}
                    onMouseOut={e => e.currentTarget.style.background = "none"}>
                    <span>{icon}</span> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => { load(filters); fetchBreakdown(filters); setExportOpen(false); }} disabled={slaLoading || bdLoading}
            style={{ padding: "8px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", fontWeight: 600, color: "#475569", cursor: (slaLoading || bdLoading) ? "wait" : "pointer" }}>
            {(slaLoading || bdLoading) ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {/* ── FILTER BAR (collapsible) ── */}
      {filtersOpen && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px 16px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>Filters</span>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#475569" }}>
            From
            <input type="date" value={filters.dateFrom} onChange={e => handleFilter("dateFrom", e.target.value)}
              style={{ border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 8px", fontSize: "12px", color: "#334155" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#475569" }}>
            To
            <input type="date" value={filters.dateTo} onChange={e => handleFilter("dateTo", e.target.value)}
              style={{ border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 8px", fontSize: "12px", color: "#334155" }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#475569" }}>
            Service Type
            <select value={filters.serviceType} onChange={e => handleFilter("serviceType", e.target.value)}
              style={{ border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 8px", fontSize: "12px", color: "#334155" }}>
              <option value="all">All</option>
              <option value="issue">Issue Resolution</option>
              <option value="pms">PMS</option>
              <option value="calibration">Calibration</option>
            </select>
          </label>
          {hasFilters && (
            <button onClick={() => { resetFilters(); setFiltersOpen(false); }}
              style={{ padding: "4px 10px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "12px", color: "#475569", cursor: "pointer" }}>
              ✕ Clear
            </button>
          )}
          {bdLoading && <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>Updating…</span>}
        </div>
      )}

      {/* ── KPI TILES — AssetPro Service Performance ── */}
      {(() => {
        const ragLevel = (value, target, higherIsBetter, band) => {
          if (value == null) return "grey";
          if (higherIsBetter) return value >= target ? "green" : value >= target - band ? "amber" : "red";
          return value <= target ? "green" : value <= target + band ? "amber" : "red";
        };
        const STYLE = {
          green: { bar: "#16a34a", badge: "#dcfce7", badgeText: "#15803d", num: "#15803d", label: "GOOD" },
          amber: { bar: "#f59e0b", badge: "#fef3c7", badgeText: "#92400e", num: "#b45309", label: "AT RISK" },
          red:   { bar: "#dc2626", badge: "#fee2e2", badgeText: "#991b1b", num: "#b91c1c", label: "BREACH" },
          grey:  { bar: "#cbd5e1", badge: "#f1f5f9", badgeText: "#64748b", num: "#64748b", label: "N/A" },
        };
        const tiles = [
          { id: "overall",    label: "Overall Compliance", icon: "◎",
            value: unifiedCompliance ?? d.slaScore, unit: "%", target: 95, higher: true, band: 5,
            targetText: "New ≥ 95% · Old ≥ 85%", barPct: unifiedCompliance ?? d.slaScore,
            detail: ticketTotal > 0 ? `${ticketCompliant} met · ${ticketBreached} breached · ${ticketTotal} total` : null },
          { id: "response",   label: "Response Time",      icon: "⚡",
            value: d.responseSla?.pct,   unit: "%", target: 95, higher: true, band: 5,
            targetText: "New ≥ 95% · Old ≥ 85%", barPct: d.responseSla?.pct,
            detail: d.responseSla ? `${d.responseSla.met ?? 0}/${d.responseSla.total ?? 0} tickets` : null },
          { id: "attendance", label: "Attendance",         icon: "👨‍🔧",
            value: d.attendanceSla?.pct, unit: "%", target: 95, higher: true, band: 5,
            targetText: "New ≥ 95% · Old ≥ 85%", barPct: d.attendanceSla?.pct,
            detail: d.attendanceSla ? `${d.attendanceSla.met ?? 0}/${d.attendanceSla.total ?? 0} tickets` : null },
          { id: "resolution", label: "Resolution",         icon: "✅",
            value: d.resolutionSla?.pct, unit: "%", target: 95, higher: true, band: 5,
            targetText: "New ≥ 95% · Old ≥ 85%", barPct: d.resolutionSla?.pct,
            detail: d.resolutionSla ? `${d.resolutionSla.met ?? 0}/${d.resolutionSla.total ?? 0} tickets` : null },
          { id: "pm",         label: "PM Compliance",      icon: "🗓",
            value: d.pmCompliance, unit: "%", target: 98, higher: true, band: 5,
            targetText: "≥ 98%", barPct: d.pmCompliance, noClick: true,
            detail: d.pmDue != null ? `${d.pmCompleted ?? 0}/${d.pmDue ?? 0} scheduled` : null },
          { id: "repeat",     label: "Repeat Breakdown",   icon: "🔁",
            value: d.repeatBreakdown, unit: "%", target: 5, higher: false, band: 3,
            targetText: "< 5%", barPct: d.repeatBreakdown == null ? null : Math.min(d.repeatBreakdown * 10, 100),
            detail: d.assetsWithBreakdown ? `${d.assetsRepeat ?? 0}/${d.assetsWithBreakdown} assets` : null },
          { id: "mttr",       label: "Mean Time to Repair", icon: "⏱",
            value: d.mttrHours, unit: " hrs", target: 4, higher: false, band: 1,
            targetText: "< 4 hrs", barPct: d.mttrHours == null ? null : Math.min((d.mttrHours / 8) * 100, 100),
            detail: d.mttrHours != null ? `Target 4h · Actual ${d.mttrHours}h` : null },
        ];
        const loading = slaLoading || bdLoading;
        return (
          <div style={{ marginBottom: "22px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "10px" }}>
              <div>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em" }}>AssetPro Service Performance</span>
                <span style={{ fontSize: "10.5px", color: "#94a3b8", marginLeft: "8px" }}>Click tile to drill into records</span>
              </div>
              {hasFilters && <span style={{ fontSize: "10.5px", color: "#2563eb", fontWeight: 600 }}>Filtered view active</span>}
            </div>

            {/* Row 1 — 4 SLA tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", marginBottom: "8px" }}>
              {tiles.slice(0, 4).map(t => {
                const lvl = ragLevel(t.value, t.target, t.higher, t.band);
                const s   = STYLE[lvl];
                const pct = t.barPct ?? 0;
                const displayVal = loading ? "…" : t.value != null ? `${t.value}${t.unit}` : "—";
                const d_local = t.id === "overall" && delta != null ? delta : null;
                return (
                  <button key={t.id}
                    onClick={() => !t.noClick && openTileModal(t.id, t.label)}
                    style={{ all: "unset", display: "block", background: "#fff", border: "1px solid #e2e8f0",
                      borderRadius: "10px", overflow: "hidden", cursor: t.noClick ? "default" : "pointer",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.05)", transition: "box-shadow 0.15s, transform 0.15s" }}
                    onMouseOver={e => { if (!t.noClick) { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; } }}
                    onMouseOut={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = ""; }}>
                    {/* Colored accent bar */}
                    <div style={{ height: "3px", background: s.bar }} />
                    <div style={{ padding: "12px 14px 11px" }}>
                      {/* Header row */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t.label}</span>
                        <span style={{ fontSize: "9.5px", fontWeight: 700, color: s.badgeText, background: s.badge,
                          padding: "1px 6px", borderRadius: "4px", letterSpacing: "0.04em" }}>{s.label}</span>
                      </div>
                      {/* Big metric */}
                      <div style={{ fontSize: "26px", fontWeight: 900, color: s.num, lineHeight: 1, letterSpacing: "-0.5px", marginBottom: "8px" }}>
                        {displayVal}
                      </div>
                      {/* Progress bar */}
                      <div style={{ height: "4px", background: "#f1f5f9", borderRadius: "2px", marginBottom: "6px" }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: s.bar, borderRadius: "2px", transition: "width 0.5s ease" }} />
                      </div>
                      {/* Bottom row */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "9.5px", color: "#94a3b8", fontWeight: 600 }}>Target {t.targetText}</span>
                        {d_local != null
                          ? <span style={{ fontSize: "9.5px", fontWeight: 700, color: d_local >= 0 ? "#16a34a" : "#dc2626" }}>
                              {d_local >= 0 ? "▲" : "▼"}{Math.abs(d_local)}%
                            </span>
                          : t.detail && <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>{t.detail}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Row 2 — PM, Repeat, MTTR (+ summary card) */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "8px" }}>
              {tiles.slice(4).map(t => {
                const lvl = ragLevel(t.value, t.target, t.higher, t.band);
                const s   = STYLE[lvl];
                const pct = t.barPct ?? 0;
                const displayVal = loading ? "…" : t.value != null ? `${t.value}${t.unit}` : "—";
                return (
                  <button key={t.id}
                    onClick={() => !t.noClick && openTileModal(t.id, t.label)}
                    style={{ all: "unset", display: "block", background: "#fff", border: "1px solid #e2e8f0",
                      borderRadius: "10px", overflow: "hidden", cursor: t.noClick ? "default" : "pointer",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.05)", transition: "box-shadow 0.15s, transform 0.15s" }}
                    onMouseOver={e => { if (!t.noClick) { e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-2px)"; } }}
                    onMouseOut={e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = ""; }}>
                    <div style={{ height: "3px", background: s.bar }} />
                    <div style={{ padding: "12px 14px 11px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.07em" }}>{t.label}</span>
                        <span style={{ fontSize: "9.5px", fontWeight: 700, color: s.badgeText, background: s.badge,
                          padding: "1px 6px", borderRadius: "4px" }}>{s.label}</span>
                      </div>
                      <div style={{ fontSize: "24px", fontWeight: 900, color: s.num, lineHeight: 1, letterSpacing: "-0.5px", marginBottom: "8px" }}>{displayVal}</div>
                      <div style={{ height: "4px", background: "#f1f5f9", borderRadius: "2px", marginBottom: "6px" }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: s.bar, borderRadius: "2px" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: "9.5px", color: "#94a3b8", fontWeight: 600 }}>Target {t.targetText}</span>
                        {t.detail && <span style={{ fontSize: "9.5px", color: "#94a3b8" }}>{t.detail}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
              {/* Summary mini-card */}
              <div style={{ background: "linear-gradient(135deg, #1e40af 0%, #2563eb 100%)", borderRadius: "10px", padding: "12px 14px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 1px 4px rgba(37,99,235,0.15)" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Period Summary</div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.75)" }}>Total Tickets</span>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#fff" }}>{loading ? "…" : ticketTotal || d.totalTickets || 0}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.75)" }}>Within SLA</span>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#86efac" }}>{loading ? "…" : ticketCompliant || d.slaCompliant || 0}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.75)" }}>Breached</span>
                    <span style={{ fontSize: "11px", fontWeight: 800, color: "#fca5a5" }}>{loading ? "…" : ticketBreached || d.slaBreached || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── AT-RISK QUEUE ── */}
      {slaAtRisk.length > 0 && (
        <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: "12px", padding: "14px 16px", marginBottom: "24px" }}>
          <div style={{ fontSize: "13px", fontWeight: 800, color: "#c2410c", marginBottom: "10px" }}>
            ⚠️ {slaAtRisk.length} Ticket{slaAtRisk.length > 1 ? "s" : ""} At Risk (SLA expiring &lt; 2h)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead>
                <tr style={{ background: "#fef3c7" }}>
                  {["Ticket #", "Asset", "Department", "Priority", "Clock", "Due At", "Time Left"].map(h => (
                    <th key={h} style={{ padding: "7px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slaAtRisk.slice(0, 10).map((r, i) => {
                  const riskColor = r.risk === "breached" ? "#dc2626" : r.risk === "critical" ? "#ea580c" : "#ca8a04";
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #fde68a", background: i % 2 === 0 ? "#fff" : "#fffbeb" }}>
                      <td style={{ padding: "7px 12px", fontFamily: "monospace", color: "#2563eb", fontWeight: 700 }}>#{r.queryId}</td>
                      <td style={{ padding: "7px 12px", fontWeight: 600, color: "#0f172a" }}>{r.assetName || "—"}</td>
                      <td style={{ padding: "7px 12px", color: "#475569" }}>{r.deptName || "—"}</td>
                      <td style={{ padding: "7px 12px" }}>
                        <span style={{ padding: "1px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: "#fef2f2", color: "#dc2626" }}>{r.priority}</span>
                      </td>
                      <td style={{ padding: "7px 12px", textTransform: "capitalize", color: "#475569" }}>{r.clockType}</td>
                      <td style={{ padding: "7px 12px", color: "#475569", whiteSpace: "nowrap" }}>
                        {r.dueAt ? new Date(r.dueAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                      <td style={{ padding: "7px 12px", fontWeight: 800, color: riskColor, whiteSpace: "nowrap" }}>
                        {r.minsRemaining <= 0 ? `Overdue ${Math.abs(r.minsRemaining)}m` : `${r.minsRemaining}m left`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TREND ── */}
      {slaTrend.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", marginBottom: "24px" }}>
          <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#475569", marginBottom: "12px" }}>SLA Compliance Trend (Last 6 Months)</div>
          <div style={{ display: "flex", gap: "0", alignItems: "flex-end", height: "80px", overflowX: "auto" }}>
            {slaTrend.map((row, i) => {
              const resp = row.responsePct ?? 0;
              const res  = row.resolutionPct ?? 0;
              return (
                <div key={i} style={{ flex: "1", minWidth: "60px", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                  <div style={{ width: "100%", display: "flex", gap: "3px", alignItems: "flex-end", height: "60px" }}>
                    <div title={`Response: ${resp}%`} style={{ flex: 1, background: "#3b82f6", height: `${resp * 0.6}px`, borderRadius: "3px 3px 0 0", minHeight: "2px" }} />
                    <div title={`Resolution: ${res}%`} style={{ flex: 1, background: "#16a34a", height: `${res * 0.6}px`, borderRadius: "3px 3px 0 0", minHeight: "2px" }} />
                  </div>
                  <span style={{ fontSize: "10px", color: "#64748b", whiteSpace: "nowrap" }}>{row.month?.slice(5)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "14px", marginTop: "8px" }}>
            {[["#3b82f6", "Response"], ["#16a34a", "Resolution"]].map(([c, l]) => (
              <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#475569" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "2px", background: c }} />{l}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── ENGINEER PERFORMANCE SLA ── */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>👷 Engineer Performance SLA</h2>
          {slaByEng.length > 0 && (
            <button onClick={exportEngineers}
              style={{ padding: "5px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, color: "#2563eb", cursor: "pointer" }}>
              ↓ Export Excel
            </button>
          )}
        </div>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
          {slaLoading ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>Loading…</div>
          ) : slaByEng.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8" }}>No engineer data available.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Engineer", "Assigned", "Resolved", "Within SLA", "Breached", "SLA %", "Response %", "Resolution %", "Avg MTTR", "Last Activity"].map((h, i) => (
                      <th key={h} style={{ padding: "9px 12px", textAlign: i === 0 ? "left" : "center", fontSize: "11px", fontWeight: 700, color: "#64748b", whiteSpace: "nowrap", borderBottom: "1.5px solid #e2e8f0" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slaByEng.map((r, i) => {
                    const slaColor = pctCol(r.overallPct);
                    const pctW = r.overallPct ?? 0;
                    return (
                      <tr key={r.engineerId || i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "13px" }}>{r.engineerName || "—"}</div>
                          <div style={{ marginTop: "4px", height: "4px", background: "#e2e8f0", borderRadius: "2px", overflow: "hidden", width: "80px" }}>
                            <div style={{ width: `${pctW}%`, height: "100%", background: slaColor, borderRadius: "2px" }} />
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontWeight: 600 }}>{r.totalCalls}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#16a34a", fontWeight: 700 }}>{r.resolvedCount ?? "—"}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#16a34a", fontWeight: 700 }}>{r.overallMet ?? 0}</td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {(r.breachedCount ?? 0) > 0
                            ? <span style={{ color: "#dc2626", fontWeight: 700 }}>{r.breachedCount}</span>
                            : <span style={{ color: "#94a3b8" }}>0</span>}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {r.overallPct != null
                            ? <span style={{ fontWeight: 800, color: slaColor, fontSize: "13px" }}>{r.overallPct}%</span>
                            : <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {r.responsePct != null ? <span style={{ fontWeight: 600, color: pctCol(r.responsePct) }}>{r.responsePct}%</span> : <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          {r.resPct != null ? <span style={{ fontWeight: 600, color: pctCol(r.resPct) }}>{r.resPct}%</span> : <span style={{ color: "#94a3b8" }}>—</span>}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#475569", fontFamily: "monospace" }}>
                          {r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : r.avgMttrHours != null ? `${r.avgMttrHours}h` : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#94a3b8", fontSize: "11.5px", whiteSpace: "nowrap" }}>
                          {r.lastTicketAt ? new Date(r.lastTicketAt).toLocaleDateString([], { day: "numeric", month: "short" }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── BY DEPARTMENT / EQUIPMENT ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
        {/* By Department */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", fontSize: "12px", fontWeight: 700, color: "#475569", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            By Department
            {slaByDept.length > 0 && <button onClick={exportDepartments} style={{ fontSize: "11px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>↓ Excel</button>}
          </div>
          <div style={{ overflowX: "auto", maxHeight: "280px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  {["Department", "Calls", "Breached", "SLA %", "MTTR"].map((c, ci) => (
                    <th key={c} style={{ padding: "6px 12px", textAlign: ci === 0 ? "left" : "right", fontWeight: 700, color: "#64748b", fontSize: "11px", whiteSpace: "nowrap" }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slaLoading ? (
                  <tr><td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
                ) : slaByDept.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>No data</td></tr>
                ) : slaByDept.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={{ padding: "7px 12px", fontWeight: 600, color: "#0f172a" }}>{r.deptName || "—"}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#475569" }}>{r.totalCalls}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: (r.breachedCount ?? 0) > 0 ? "#dc2626" : "#16a34a" }}>{r.breachedCount ?? 0}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: pctCol(r.overallPct) }}>
                      {r.overallPct != null ? `${r.overallPct}%` : "—"}
                    </td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#475569" }}>{r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* By Equipment */}
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", fontSize: "12px", fontWeight: 700, color: "#475569", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            Asset Breakdown (Highest → Lowest)
            {slaByAsset.length > 0 && <button onClick={exportAssets} style={{ fontSize: "11px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>↓ Excel</button>}
          </div>
          <div style={{ overflowX: "auto", maxHeight: "280px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  {["Asset", "Calls", "Breaches", "SLA %", "MTTR"].map((c, ci) => (
                    <th key={c} style={{ padding: "6px 12px", textAlign: ci === 0 ? "left" : "right", fontWeight: 700, color: "#64748b", fontSize: "11px" }}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slaLoading ? (
                  <tr><td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
                ) : slaByAsset.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "#94a3b8" }}>No data</td></tr>
                ) : slaByAsset.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                    <td style={{ padding: "7px 12px" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{r.assetName || "—"}</div>
                      {r.assetDisplayId && (
                        <span style={{ fontSize: "10px", color: r.assetDbId && onNavigateToAsset ? "#2563eb" : "#94a3b8", fontFamily: "monospace", fontWeight: 600,
                          cursor: r.assetDbId && onNavigateToAsset ? "pointer" : "default", textDecoration: r.assetDbId && onNavigateToAsset ? "underline" : "none" }}
                          onClick={() => r.assetDbId && onNavigateToAsset && onNavigateToAsset(r.assetDbId)}>
                          {r.assetDisplayId}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#475569" }}>{r.totalCalls}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: r.totalBreaches > 0 ? "#dc2626" : "#16a34a" }}>{r.totalBreaches}</td>
                    <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: pctCol(r.overallPct) }}>
                      {r.overallPct != null ? `${r.overallPct}%` : "—"}
                    </td>
                    <td style={{ padding: "7px 12px", textAlign: "right", color: "#475569" }}>{r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── BREACH ANALYSIS ── */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Breach Analysis</h2>
          {breachRows.length > 0 && <button onClick={exportBreaches} style={{ padding: "5px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "11.5px", fontWeight: 600, color: "#2563eb", cursor: "pointer" }}>↓ Export Excel</button>}
        </div>
        {(() => {
          const bs = breachSummary;
          const total = bs?.totalBreaches ?? 0;
          if (!slaLoading && total === 0) {
            return <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: "12px", padding: "16px 18px", fontSize: "13px", color: "#15803d", fontWeight: 600 }}>✓ No SLA breaches in the selected period.</div>;
          }
          const RESP_COLOR = { OEM: "#dc2626", Hospital: "#ea580c", Catalyst: "#7c3aed", Other: "#64748b", Unclassified: "#94a3b8" };
          return (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px", marginBottom: "14px" }}>
                <div style={{ background: "#fef2f2", border: "1.5px solid #fecaca", borderRadius: "12px", padding: "13px 15px" }}>
                  <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Total Breaches</div>
                  <div style={{ fontSize: "26px", fontWeight: 900, color: "#b91c1c", lineHeight: 1.1 }}>{slaLoading ? "…" : total}</div>
                </div>
                <div style={{ background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: "12px", padding: "13px 15px" }}>
                  <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Avg Breach Time</div>
                  <div style={{ fontSize: "26px", fontWeight: 900, color: "#c2410c", lineHeight: 1.1 }}>{bs?.avgBreachHours != null ? `${bs.avgBreachHours}h` : "—"}</div>
                </div>
                <div style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: "12px", padding: "13px 15px" }}>
                  <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>Classified</div>
                  <div style={{ fontSize: "26px", fontWeight: 900, color: "#0f172a", lineHeight: 1.1 }}>{bs?.classified ?? 0}<span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 600 }}> / {total}</span></div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "10px" }}>By Responsibility</div>
                  {(bs?.byResponsibility || []).length === 0 ? <span style={{ fontSize: "12px", color: "#94a3b8" }}>No data</span> : bs.byResponsibility.map(r => {
                    const pctW = total > 0 ? Math.round((r.count / total) * 100) : 0;
                    const col = RESP_COLOR[r.responsibility] || "#64748b";
                    return (
                      <div key={r.responsibility} style={{ marginBottom: "8px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "3px" }}>
                          <span style={{ fontWeight: 600, color: "#334155" }}>{r.responsibility}</span>
                          <span style={{ color: "#64748b" }}>{r.count} ({pctW}%)</span>
                        </div>
                        <div style={{ height: "6px", background: "#f1f5f9", borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${pctW}%`, height: "100%", background: col, borderRadius: "3px" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 16px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "10px" }}>By Reason</div>
                  {(bs?.byReason || []).length === 0 ? <span style={{ fontSize: "12px", color: "#94a3b8" }}>No data</span> : bs.byReason.map(r => (
                    <div key={r.reason} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", padding: "4px 0", borderBottom: "1px solid #f8fafc" }}>
                      <span style={{ color: "#334155" }}>{r.reason}</span>
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                      <tr style={{ background: "#fef2f2" }}>
                        {["Ticket", "Priority", "Equipment", "Department", "Clock", "Target", "Overdue By", "Engineer", "Reason / Responsibility"].map(hh => (
                          <th key={hh} style={{ padding: "9px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#991b1b", textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap" }}>{hh}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {breachRows.length === 0 ? (
                        <tr><td colSpan={9} style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>{slaLoading ? "Loading…" : "No breach records."}</td></tr>
                      ) : breachRows.map((r, i) => (
                        <tr key={`${r.queryId}-${r.clockType}-${i}`} style={{ borderBottom: "1px solid #f8fafc" }}>
                          <td style={{ padding: "9px 12px", fontWeight: 700, color: "#2563eb", whiteSpace: "nowrap" }}>#{r.queryId}</td>
                          <td style={{ padding: "9px 12px" }}><span style={{ padding: "1px 7px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: "#fee2e2", color: "#991b1b" }}>{r.priority}</span></td>
                          <td style={{ padding: "9px 12px", color: "#0f172a", fontWeight: 600 }}>{r.assetName || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#475569" }}>{r.deptName || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#475569", textTransform: "capitalize" }}>{r.clockType}</td>
                          <td style={{ padding: "9px 12px", color: "#64748b", fontFamily: "monospace" }}>{fmtMins(r.targetMins)}</td>
                          <td style={{ padding: "9px 12px", color: "#dc2626", fontWeight: 700, fontFamily: "monospace" }}>{fmtMins(r.breachMins)}</td>
                          <td style={{ padding: "9px 12px", color: "#475569" }}>{r.engineerName || <span style={{ color: "#cbd5e1" }}>Unassigned</span>}</td>
                          <td style={{ padding: "9px 12px" }}>
                            <select value={r.breachReasonId || ""} onChange={e => classifyBreach(r.queryId, r.clockType, e.target.value)}
                              style={{ fontSize: "11.5px", padding: "3px 6px", borderRadius: "6px", border: `1px solid ${r.responsibility ? "#86efac" : "#fca5a5"}`, background: r.responsibility ? "#f0fdf4" : "#fff", color: "#334155", maxWidth: "190px" }}>
                              <option value="">⚠ Classify…</option>
                              {breachReasons.map(br => (
                                <option key={br.id} value={br.id}>{br.label}{br.responsibility ? ` (${br.responsibility})` : ""}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        })()}
      </div>

      {/* ── TILE RECORDS MODAL ── */}
      {tileModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={e => { if (e.target === e.currentTarget) setTileModal(null); }}>
          <div style={{ background: "#fff", borderRadius: "16px", width: "min(94vw, 1150px)", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.25)" }}>
            {/* Modal header */}
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>{tileModal.label} — Records</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
                  {tileModal.loading ? "Loading…" : `${tileModal.total} record${tileModal.total !== 1 ? "s" : ""}`}
                  {onNavigateToAsset && <span style={{ marginLeft: "8px", color: "#94a3b8" }}>· Click Asset ID to view asset details</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {!tileModal.loading && tileModal.rows.length > 0 && (
                  <button onClick={exportTileRecords} style={{ background: "#fff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", cursor: "pointer", color: "#2563eb", fontWeight: 600 }}>↓ Export Excel</button>
                )}
                <button onClick={() => setTileModal(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", cursor: "pointer", color: "#475569", fontWeight: 600 }}>✕ Close</button>
              </div>
            </div>

            {/* Modal body */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {tileModal.loading ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading records…</div>
              ) : tileModal.rows.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No records found for this metric.</div>
              ) : (["mttr", "repeat"].includes(tileModal.tile) ? (
                // Asset-level table (MTTR, Repeat Breakdown)
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                  <thead style={{ position: "sticky", top: 0 }}>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Asset ID", "Asset Name", "Hospital", "Make", "Model", "Serial No", "Department",
                        tileModal.tile === "repeat" ? "Total Breakdowns" : "Avg MTTR (hrs)",
                        tileModal.tile === "repeat" ? "Avg MTTR (hrs)" : "Total Calls",
                        "Total Breaches"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tileModal.rows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "9px 12px" }}>
                          {r.assetId && onNavigateToAsset ? (
                            <button onClick={() => { onNavigateToAsset(r.assetId); setTileModal(null); }}
                              style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "2px 8px", color: "#1d4ed8", fontWeight: 700, fontSize: "12px", cursor: "pointer", fontFamily: "monospace" }}>
                              {r.assetUniqueId || `#${r.assetId}`}
                            </button>
                          ) : (
                            <span style={{ fontFamily: "monospace", color: "#64748b" }}>{r.assetUniqueId || `#${r.assetId}` || "—"}</span>
                          )}
                        </td>
                        <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a" }}>{r.assetName || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#475569" }}>{r.hospitalName || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#475569" }}>{r.make || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#475569" }}>{r.model || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#475569", fontFamily: "monospace", fontSize: "11.5px" }}>{r.serialNo || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#475569" }}>{r.deptName || "—"}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: tileModal.tile === "repeat" ? "#dc2626" : "#2563eb" }}>
                          {tileModal.tile === "repeat" ? r.totalBreakdowns : (r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : "—")}
                        </td>
                        <td style={{ padding: "9px 12px", color: "#475569" }}>
                          {tileModal.tile === "repeat" ? (r.avgMttrMins != null ? fmtMins(r.avgMttrMins) : "—") : r.totalCalls}
                        </td>
                        <td style={{ padding: "9px 12px", fontWeight: 700, color: (r.totalBreaches ?? 0) > 0 ? "#dc2626" : "#16a34a" }}>
                          {r.totalBreaches ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                // Ticket-level table (overall, response, attendance, resolution)
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                  <thead style={{ position: "sticky", top: 0 }}>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Ticket #", "Asset ID", "Asset Name", "Hospital", "Make", "Model", "Serial No", "Department", "Engineer", "Priority", "Status", "SLA Stage", "Clock Status", "Target", "Actual", "Date"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#475569", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tileModal.rows.map((r, i) => {
                      const chip = statusChip(r.clockStatus);
                      return (
                        <tr key={`${r.queryId}-${i}`} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <td style={{ padding: "9px 12px", fontWeight: 700, color: "#2563eb", fontFamily: "monospace", whiteSpace: "nowrap" }}>#{r.queryId}</td>
                          <td style={{ padding: "9px 12px" }}>
                            {r.assetId && onNavigateToAsset ? (
                              <button onClick={() => { onNavigateToAsset(r.assetId); setTileModal(null); }}
                                style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "2px 8px", color: "#1d4ed8", fontWeight: 700, fontSize: "12px", cursor: "pointer", fontFamily: "monospace" }}>
                                {r.assetUniqueId || `#${r.assetId}`}
                              </button>
                            ) : (
                              <span style={{ fontFamily: "monospace", color: "#64748b", fontSize: "12px" }}>{r.assetUniqueId || `#${r.assetId}` || "—"}</span>
                            )}
                          </td>
                          <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.assetName || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#475569" }}>{r.hospitalName || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#475569" }}>{r.make || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#475569" }}>{r.model || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#475569", fontFamily: "monospace", fontSize: "11.5px" }}>{r.serialNo || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#475569" }}>{r.deptName || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#475569" }}>{r.engineerName || <span style={{ color: "#cbd5e1" }}>Unassigned</span>}</td>
                          <td style={{ padding: "9px 12px" }}>
                            {r.priority ? <span style={{ padding: "1px 7px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: "#fee2e2", color: "#991b1b" }}>{r.priority}</span> : <span style={{ color: "#94a3b8" }}>—</span>}
                          </td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{ padding: "2px 7px", borderRadius: "6px", fontSize: "11px", fontWeight: 600, background: "#f1f5f9", color: "#475569", textTransform: "capitalize" }}>{r.status || "—"}</span>
                          </td>
                          <td style={{ padding: "9px 12px", textTransform: "capitalize", color: "#475569" }}>{r.clockType || "all"}</td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{ padding: "2px 8px", borderRadius: "8px", fontSize: "11.5px", fontWeight: 700, background: chip.bg, color: chip.color }}>{chip.label}</span>
                          </td>
                          <td style={{ padding: "9px 12px", color: "#64748b", fontFamily: "monospace" }}>{fmtMins(r.targetMins)}</td>
                          <td style={{ padding: "9px 12px", fontFamily: "monospace", fontWeight: 600, color: r.clockStatus === "breached" ? "#dc2626" : "#475569" }}>
                            {fmtMins(r.actualMins)}
                          </td>
                          <td style={{ padding: "9px 12px", color: "#94a3b8", whiteSpace: "nowrap", fontSize: "11.5px" }}>{fmtDate(r.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ))}
            </div>

            {/* Pagination */}
            {tileModal.pages > 1 && (
              <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px", justifyContent: "center", flexShrink: 0 }}>
                <button onClick={() => loadTilePage(tileModal.page - 1)} disabled={tileModal.page <= 1 || tileModal.loading}
                  style={{ padding: "5px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", color: "#475569", cursor: tileModal.page <= 1 ? "default" : "pointer", opacity: tileModal.page <= 1 ? 0.4 : 1 }}>← Prev</button>
                <span style={{ fontSize: "12.5px", color: "#475569" }}>Page {tileModal.page} / {tileModal.pages}</span>
                <button onClick={() => loadTilePage(tileModal.page + 1)} disabled={tileModal.page >= tileModal.pages || tileModal.loading}
                  style={{ padding: "5px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", color: "#475569", cursor: tileModal.page >= tileModal.pages ? "default" : "pointer", opacity: tileModal.page >= tileModal.pages ? 0.4 : 1 }}>Next →</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Close export panel when clicking outside */}
      {exportOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100 }} onClick={() => setExportOpen(false)} />
      )}
    </div>
  );
}
