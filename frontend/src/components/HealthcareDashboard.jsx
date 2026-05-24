/**
 * HealthcareDashboard.jsx
 * Professional FM Healthcare Asset Management Dashboard
 * Features: KPI cards, Charts (Pie/Bar/Line), Advanced Filters, Excel export, Records tables
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();

/* ─── API helpers ─────────────────────────────────────────────────────────── */
async function hcFetch(path, token) {
  const res = await fetch(`${BASE}/api/company-portal/healthcare${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function hcDownload(path, token, filename) {
  const res = await fetch(`${BASE}/api/company-portal/healthcare${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`); }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename || "export.xlsx";
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function buildQS(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v !== "" && v != null) params.append(k, v); });
  return params.toString() ? `?${params}` : "";
}

/* ─── Icon set ────────────────────────────────────────────────────────────── */
const Icon = {
  Total:       () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>,
  Verified:    () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>,
  Critical:    () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  NonCritical: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Working:     () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Wip:         () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  NotWorking:  () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  Download:    () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  Filter:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  Search:      () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Refresh:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>,
  CallLog:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 15.42z"/></svg>,
  Pms:         () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
  Calibration: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>,
  Training:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  Rber:        () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
};

/* ─── Colour palette ─────────────────────────────────────────────────────── */
const COLORS = {
  blue:   { bg: "#eff6ff", icon: "#2563eb", border: "#bfdbfe" },
  green:  { bg: "#f0fdf4", icon: "#16a34a", border: "#bbf7d0" },
  red:    { bg: "#fef2f2", icon: "#dc2626", border: "#fecaca" },
  orange: { bg: "#fff7ed", icon: "#ea580c", border: "#fed7aa" },
  purple: { bg: "#faf5ff", icon: "#7c3aed", border: "#e9d5ff" },
  yellow: { bg: "#fefce8", icon: "#ca8a04", border: "#fde68a" },
  teal:   { bg: "#f0fdfa", icon: "#0d9488", border: "#99f6e4" },
};

/* ─── Simple chart components (no external library needed) ───────────────── */
function PieChart({ data, size = 180 }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState small />;

  const PIE_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6"];
  let cumulative = 0;
  const slices = data.map((d, i) => {
    const pct = d.value / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const r = size / 2 - 10;
    const cx = size / 2, cy = size / 2;
    const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
    const large = pct > 0.5 ? 1 : 0;
    const path = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`;
    return { path, color: PIE_COLORS[i % PIE_COLORS.length], label: d.name, value: d.value, pct };
  });

  return (
    <div style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2">
            <title>{s.label}: {s.value} ({(s.pct * 100).toFixed(1)}%)</title>
          </path>
        ))}
        <circle cx={size / 2} cy={size / 2} r={size / 4} fill="#fff" />
        <text x={size / 2} y={size / 2 - 6} textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">{total}</text>
        <text x={size / 2} y={size / 2 + 10} textAnchor="middle" fontSize="9" fill="#64748b">Total</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
            <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#374151" }}>{s.label}</span>
            <span style={{ fontWeight: 700, color: "#0f172a" }}>{s.value}</span>
            <span style={{ color: "#94a3b8", fontSize: "11px" }}>({(s.pct * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data, height = 200 }) {
  if (!data || data.length === 0) return <EmptyState small />;
  const maxVal = Math.max(...data.flatMap(d => [d.critical, d.nonCritical]), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", minWidth: `${data.length * 70}px`, height: `${height}px`, padding: "8px 0" }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flex: 1, minWidth: "56px" }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: `${height - 40}px` }}>
              <div title={`Critical: ${d.critical}`} style={{ width: "14px", background: "#ef4444", borderRadius: "3px 3px 0 0", height: `${(d.critical / maxVal) * (height - 40)}px`, minHeight: d.critical ? "3px" : "0" }} />
              <div title={`Non-Critical: ${d.nonCritical}`} style={{ width: "14px", background: "#3b82f6", borderRadius: "3px 3px 0 0", height: `${(d.nonCritical / maxVal) * (height - 40)}px`, minHeight: d.nonCritical ? "3px" : "0" }} />
            </div>
            <div style={{ fontSize: "10px", color: "#64748b", textAlign: "center", wordBreak: "break-all", lineHeight: 1.2, maxWidth: "56px" }}>{d.dept}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "8px" }}>
        {[["#ef4444","Critical"],["#3b82f6","Non-Critical"]].map(([col, lbl]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#374151" }}>
            <div style={{ width: "12px", height: "12px", background: col, borderRadius: "2px" }} />
            {lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, height = 200 }) {
  if (!data || data.length === 0) return <EmptyState small />;
  const maxPms   = Math.max(...data.map(d => d.pms   || 0), 1);
  const maxCalls = Math.max(...data.map(d => d.calls || 0), 1);
  const maxVal   = Math.max(maxPms, maxCalls, 1);
  const w = 480, h = height - 40;

  const toPoint = (i, val) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
    const y = h - (val / maxVal) * h;
    return { x, y };
  };

  const pmsPoints   = data.map((d, i) => toPoint(i, d.pms   || 0));
  const callsPoints = data.map((d, i) => toPoint(i, d.calls || 0));

  const toPath = (pts) => pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const toArea = (pts) => `${toPath(pts)} L${pts[pts.length - 1].x.toFixed(1)},${h} L0,${h} Z`;

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ display: "block", minWidth: "300px" }}>
        <defs>
          <linearGradient id="pmsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="callGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line key={i} x1="0" y1={h * (1 - t)} x2={w} y2={h * (1 - t)} stroke="#f1f5f9" strokeWidth="1" />
        ))}
        {/* Area fills */}
        <path d={toArea(pmsPoints)} fill="url(#pmsGrad)" />
        <path d={toArea(callsPoints)} fill="url(#callGrad)" />
        {/* Lines */}
        <path d={toPath(pmsPoints)} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        <path d={toPath(callsPoints)} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
        {/* Points */}
        {pmsPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#3b82f6" stroke="#fff" strokeWidth="2">
            <title>{data[i].month}: PMS {data[i].pms}</title>
          </circle>
        ))}
        {callsPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#10b981" stroke="#fff" strokeWidth="2">
            <title>{data[i].month}: Calls {data[i].calls}</title>
          </circle>
        ))}
        {/* X-axis labels */}
        {data.map((d, i) => {
          const pt = toPoint(i, 0);
          return (
            <text key={i} x={pt.x} y={h + 15} textAnchor="middle" fontSize="9" fill="#94a3b8">
              {d.month.slice(5)}
            </text>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "8px" }}>
        {[["#3b82f6","PMS"],["#10b981","Call Logs"]].map(([col, lbl]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#374151" }}>
            <div style={{ width: "24px", height: "3px", background: col, borderRadius: "2px" }} />
            {lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Shared UI atoms ─────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px" }}>
      <div style={{ width: "36px", height: "36px", border: "3px solid #e2e8f0", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState({ small, message = "No data available" }) {
  return (
    <div style={{ textAlign: "center", padding: small ? "24px" : "48px", color: "#94a3b8" }}>
      <div style={{ fontSize: small ? "28px" : "40px", marginBottom: "8px" }}>📭</div>
      <p style={{ margin: 0, fontSize: small ? "13px" : "15px" }}>{message}</p>
    </div>
  );
}

function ErrorState({ message, onRetry }) {
  return (
    <div style={{ textAlign: "center", padding: "48px", color: "#dc2626" }}>
      <div style={{ fontSize: "36px", marginBottom: "8px" }}>⚠️</div>
      <p style={{ margin: "0 0 16px", fontSize: "14px" }}>{message}</p>
      {onRetry && (
        <button onClick={onRetry} style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid #dc2626", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontSize: "13px" }}>
          Retry
        </button>
      )}
    </div>
  );
}

function KpiCard({ label, value, icon: IconComp, color, onDownload, loading, onClick }) {
  const c = COLORS[color] || COLORS.blue;
  return (
    <div
      onClick={onClick}
      style={{ background: "#fff", borderRadius: "14px", border: `1px solid ${c.border}`, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", cursor: onClick ? "pointer" : "default", transition: "box-shadow 0.15s, transform 0.1s" }}
      onMouseEnter={onClick ? e => { e.currentTarget.style.boxShadow = `0 4px 16px ${c.border}`; e.currentTarget.style.transform = "translateY(-1px)"; } : undefined}
      onMouseLeave={onClick ? e => { e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; e.currentTarget.style.transform = "none"; } : undefined}
    >
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: "12px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>{label}</p>
        {loading ? (
          <div style={{ width: "48px", height: "32px", background: "#f1f5f9", borderRadius: "6px", animation: "pulse 1.4s ease-in-out infinite" }} />
        ) : (
          <p style={{ fontSize: "36px", fontWeight: 800, color: "#0f172a", margin: "0 0 12px", lineHeight: 1, letterSpacing: "-1.5px" }}>{value ?? "—"}</p>
        )}
        {onDownload && (
          <button
            onClick={onDownload}
            style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11.5px", color: c.icon, background: c.bg, border: `1px solid ${c.border}`, borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontWeight: 600 }}
          >
            <Icon.Download /> Export
          </button>
        )}
      </div>
      <div style={{ width: "44px", height: "44px", background: c.bg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: c.icon, flexShrink: 0, marginLeft: "12px" }}>
        <IconComp />
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

function ChartCard({ title, subtitle, children, action }) {
  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>{title}</p>
          {subtitle && <p style={{ fontSize: "12px", color: "#94a3b8", margin: "2px 0 0" }}>{subtitle}</p>}
        </div>
        {action && action}
      </div>
      <div style={{ padding: "20px" }}>{children}</div>
    </div>
  );
}

/* ─── Advanced Filters Panel ─────────────────────────────────────────────── */
function FiltersPanel({ filters, setFilters, filterOptions, onApply, onReset }) {
  const [open, setOpen] = useState(false);

  const inputStyle = {
    width: "100%", boxSizing: "border-box", padding: "8px 11px",
    border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px",
    background: "#fff", outline: "none",
  };

  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "20px", overflow: "hidden" }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{ padding: "12px 18px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}
      >
        <Icon.Filter />
        <span style={{ fontWeight: 700, fontSize: "13.5px", color: "#0f172a" }}>Advanced Filters</span>
        {Object.values(filters).some(v => v !== "") && (
          <span style={{ background: "#2563eb", color: "#fff", borderRadius: "9px", padding: "1px 8px", fontSize: "11px", fontWeight: 700 }}>
            {Object.values(filters).filter(v => v !== "").length} active
          </span>
        )}
        <div style={{ marginLeft: "auto", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
      </div>

      {open && (
        <div style={{ padding: "0 18px 18px", borderTop: "1px solid #f1f5f9" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "12px", paddingTop: "14px" }}>
            {/* Date range */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Date From</label>
              <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Date To</label>
              <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} style={inputStyle} />
            </div>
            {/* Department */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Department</label>
              <select value={filters.departmentId} onChange={e => setFilters(f => ({ ...f, departmentId: e.target.value }))} style={inputStyle}>
                <option value="">All Departments</option>
                {(filterOptions.departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            {/* Asset Category */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Asset Category</label>
              <select value={filters.assetCategory} onChange={e => setFilters(f => ({ ...f, assetCategory: e.target.value }))} style={inputStyle}>
                <option value="">All Categories</option>
                {(filterOptions.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {/* Location */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Location / Building</label>
              <select value={filters.location} onChange={e => setFilters(f => ({ ...f, location: e.target.value }))} style={inputStyle}>
                <option value="">All Locations</option>
                {(filterOptions.locations || []).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            {/* Working Status */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Working Status</label>
              <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                <option value="">All Statuses</option>
                <option value="Working">Working</option>
                <option value="WIP">WIP</option>
                <option value="Not_Working">Not Working</option>
                <option value="verified">Verified</option>
              </select>
            </div>
            {/* Criticality */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Criticality</label>
              <select value={filters.criticality} onChange={e => setFilters(f => ({ ...f, criticality: e.target.value }))} style={inputStyle}>
                <option value="">All</option>
                <option value="Critical">Critical</option>
                <option value="Non_Critical">Non-Critical</option>
              </select>
            </div>
            {/* Search */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Search Asset</label>
              <div style={{ position: "relative" }}>
                <input placeholder="Name or ID…" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} style={{ ...inputStyle, paddingLeft: "32px" }} />
                <div style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}><Icon.Search /></div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "14px", justifyContent: "flex-end" }}>
            <button onClick={onReset} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#475569" }}>
              Reset Filters
            </button>
            <button onClick={onApply} style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Records Table ───────────────────────────────────────────────────────── */
const RECORD_CONFIGS = {
  "call-logs": {
    label: "Call Log History", icon: Icon.CallLog, color: "blue",
    columns: [
      { key: "call_date",      label: "Date" },
      { key: "asset_name",     label: "Asset" },
      { key: "department_name",label: "Department" },
      { key: "caller_name",    label: "Caller" },
      { key: "issue_reported", label: "Issue", wrap: true },
      { key: "priority",       label: "Priority", badge: true },
      { key: "status",         label: "Status", badge: true },
    ],
  },
  pms: {
    label: "PMS History", icon: Icon.Pms, color: "teal",
    columns: [
      { key: "scheduled_date",    label: "Scheduled" },
      { key: "asset_name",        label: "Asset" },
      { key: "department_name",   label: "Department" },
      { key: "maintenance_type",  label: "Type" },
      { key: "technician_name",   label: "Technician" },
      { key: "status",            label: "Status", badge: true },
      { key: "next_due_date",     label: "Next Due" },
    ],
  },
  calibration: {
    label: "Calibration Records", icon: Icon.Calibration, color: "purple",
    columns: [
      { key: "calibration_date",   label: "Date" },
      { key: "asset_name",         label: "Asset" },
      { key: "department_name",    label: "Department" },
      { key: "calibrated_by",      label: "Calibrated By" },
      { key: "certificate_no",     label: "Certificate No." },
      { key: "calibration_result", label: "Result", badge: true },
      { key: "next_due_date",      label: "Next Due" },
    ],
  },
  training: {
    label: "Training Records", icon: Icon.Training, color: "orange",
    columns: [
      { key: "training_date",  label: "Date" },
      { key: "training_title", label: "Title", wrap: true },
      { key: "employee_name",  label: "Employee" },
      { key: "department_name",label: "Department" },
      { key: "trainer_name",   label: "Trainer" },
      { key: "result",         label: "Result", badge: true },
      { key: "expiry_date",    label: "Expiry" },
    ],
  },
  rber: {
    label: "RBER Records", icon: Icon.Rber, color: "red",
    columns: [
      { key: "review_date",      label: "Date" },
      { key: "asset_name",       label: "Asset" },
      { key: "department_name",  label: "Department" },
      { key: "reviewer_name",    label: "Reviewer" },
      { key: "risk_score",       label: "Score" },
      { key: "risk_level",       label: "Risk Level", badge: true },
      { key: "status",           label: "Status", badge: true },
      { key: "next_review_date", label: "Next Review" },
    ],
  },
};

const BADGE_STYLES = {
  // status
  open:        { bg: "#fee2e2", color: "#dc2626" },
  closed:      { bg: "#f1f5f9", color: "#475569" },
  resolved:    { bg: "#dcfce7", color: "#16a34a" },
  scheduled:   { bg: "#dbeafe", color: "#1d4ed8" },
  completed:   { bg: "#dcfce7", color: "#16a34a" },
  valid:       { bg: "#dcfce7", color: "#16a34a" },
  expired:     { bg: "#fee2e2", color: "#dc2626" },
  pending:     { bg: "#fef9c3", color: "#854d0e" },
  pass:        { bg: "#dcfce7", color: "#16a34a" },
  fail:        { bg: "#fee2e2", color: "#dc2626" },
  // priority
  critical:    { bg: "#fee2e2", color: "#991b1b" },
  high:        { bg: "#ffedd5", color: "#9a3412" },
  medium:      { bg: "#fef9c3", color: "#854d0e" },
  low:         { bg: "#dcfce7", color: "#166534" },
  // risk
  High:        { bg: "#fee2e2", color: "#991b1b" },
  Medium:      { bg: "#fef9c3", color: "#854d0e" },
  Low:         { bg: "#dcfce7", color: "#166534" },
};

function BadgeCell({ val }) {
  const key = (val || "").toLowerCase();
  const s = BADGE_STYLES[key] || BADGE_STYLES[(val || "")] || { bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 700, background: s.bg, color: s.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>
      {val || "—"}
    </span>
  );
}

function RecordsTable({ type, token, globalFilters }) {
  const cfg = RECORD_CONFIGS[type];
  const [data, setData]       = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const LIMIT = 20;
  const c = COLORS[cfg.color] || COLORS.blue;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = buildQS({ ...globalFilters, search, page, limit: LIMIT });
      const res = await hcFetch(`/records/${type}${qs}`, token);
      setData(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [type, token, globalFilters, search, page]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    const qs = buildQS({ ...globalFilters, search, type });
    hcDownload(`/export${qs}`, token, `healthcare-export-${type}-${new Date().toISOString().slice(0,10)}.xlsx`)
      .catch(e => alert(`Export failed: ${e.message}`));
  };

  const IconComp = cfg.icon;
  const pages = Math.ceil(total / LIMIT);

  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: `1px solid ${c.border}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      {/* Header */}
      <div style={{ padding: "14px 18px", background: c.bg, borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div style={{ color: c.icon }}><IconComp /></div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: "14.5px", color: "#0f172a", margin: 0 }}>{cfg.label}</p>
          <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{total} records</p>
        </div>
        {/* Search */}
        <div style={{ position: "relative" }}>
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search…"
            style={{ padding: "7px 10px 7px 30px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", width: "180px" }}
          />
          <div style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}><Icon.Search /></div>
        </div>
        <button onClick={handleExport} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", border: `1px solid ${c.border}`, background: "#fff", color: c.icon, fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}>
          <Icon.Download /> Export Excel
        </button>
      </div>

      {/* Table */}
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={load} /> : data.length === 0 ? <EmptyState /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {cfg.columns.map(col => (
                  <th key={col.key} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                >
                  {cfg.columns.map(col => (
                    <td key={col.key} style={{ padding: "10px 14px", color: "#374151", maxWidth: col.wrap ? "200px" : undefined, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: col.wrap ? "normal" : "nowrap" }}>
                      {col.badge ? <BadgeCell val={row[col.key]} /> : (row[col.key] || "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div style={{ padding: "12px 18px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontSize: "12.5px", color: "#64748b", margin: 0 }}>
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of {total}
          </p>
          <div style={{ display: "flex", gap: "6px" }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              style={{ padding: "6px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", background: page <= 1 ? "#f8fafc" : "#fff", cursor: page <= 1 ? "default" : "pointer", fontSize: "12px", color: page <= 1 ? "#94a3b8" : "#374151" }}>
              ← Prev
            </button>
            {Array.from({ length: Math.min(pages, 5) }, (_, i) => {
              const pg = Math.max(1, page - 2) + i;
              if (pg > pages) return null;
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  style={{ padding: "6px 11px", borderRadius: "7px", border: `1px solid ${pg === page ? "#2563eb" : "#e2e8f0"}`, background: pg === page ? "#2563eb" : "#fff", color: pg === page ? "#fff" : "#374151", cursor: "pointer", fontSize: "12px", fontWeight: pg === page ? 700 : 400 }}>
                  {pg}
                </button>
              );
            })}
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
              style={{ padding: "6px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", background: page >= pages ? "#f8fafc" : "#fff", cursor: page >= pages ? "default" : "pointer", fontSize: "12px", color: page >= pages ? "#94a3b8" : "#374151" }}>
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function HealthcareDashboard({ token }) {
  const EMPTY_FILTERS = { dateFrom: "", dateTo: "", departmentId: "", assetCategory: "", location: "", status: "", criticality: "", search: "" };

  const [filters, setFilters]       = useState(EMPTY_FILTERS);
  const [appliedFilters, setApplied]= useState(EMPTY_FILTERS);
  const [snapshot, setSnapshot]     = useState(null);
  const [charts, setCharts]         = useState(null);
  const [filterOptions, setFOpts]   = useState({ departments: [], categories: [], locations: [] });
  const [snapLoading, setSnapL]     = useState(false);
  const [chartLoading, setChartL]   = useState(false);
  const [snapError, setSnapE]       = useState(null);
  const [activeRecord, setActiveRec]= useState("call-logs");
  const [refreshKey, setRefreshKey] = useState(0);
  const [kpiAssets, setKpiAssets]   = useState(null);   // { label, filters, data, loading }
  const [kpiAssetErr, setKpiAssetErr] = useState(null);

  /* Load filter options once */
  useEffect(() => {
    hcFetch("/filter-options", token)
      .then(setFOpts)
      .catch(() => {});
  }, [token]);

  /* Load snapshot KPIs */
  const loadSnapshot = useCallback(async () => {
    setSnapL(true); setSnapE(null);
    try {
      const qs = buildQS(appliedFilters);
      const [snap, ch] = await Promise.all([
        hcFetch(`/snapshot${qs}`, token),
        hcFetch(`/charts${qs}`, token),
      ]);
      setSnapshot(snap);
      setCharts(ch);
    } catch (e) { setSnapE(e.message); }
    setSnapL(false);
    setChartL(false);
  }, [token, appliedFilters]);

  useEffect(() => { loadSnapshot(); }, [loadSnapshot, refreshKey]);

  const handleApply = () => { setApplied({ ...filters }); };
  const handleReset = () => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); };

  const doExport = (extraFilters, type) => {
    const qs = buildQS({ ...appliedFilters, ...extraFilters, type });
    hcDownload(`/export${qs}`, token, `healthcare-export-${type}-${new Date().toISOString().slice(0,10)}.xlsx`)
      .catch(e => alert(`Export failed: ${e.message}`));
  };

  const openKpiAssets = async (label, kpiFilters) => {
    setKpiAssets({ label, filters: kpiFilters, data: null, loading: true });
    setKpiAssetErr(null);
    try {
      const qs = buildQS({ ...kpiFilters, limit: 200 });
      const res = await hcFetch(`/assets${qs}`, token);
      setKpiAssets({ label, filters: kpiFilters, data: res.data || [], loading: false });
    } catch (e) {
      setKpiAssetErr(e.message);
      setKpiAssets(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const KPI_LIST = [
    { key: "total",       label: "Total Assets",      icon: Icon.Total,       color: "blue",   dlType: "assets", filterData: {} },
    { key: "verified",    label: "Verified Assets",    icon: Icon.Verified,    color: "green",  dlType: "assets", filterData: { isVerified: "1" } },
    { key: "critical",    label: "Critical Assets",    icon: Icon.Critical,    color: "red",    dlType: "assets", filterData: { criticality: "Critical" } },
    { key: "nonCritical", label: "Non-Critical Assets",icon: Icon.NonCritical, color: "teal",   dlType: "assets", filterData: { criticality: "Non_Critical" } },
    { key: "working",     label: "Working Assets",     icon: Icon.Working,     color: "green",  dlType: "assets", filterData: { status: "Working" } },
    { key: "wip",         label: "WIP Assets",         icon: Icon.Wip,         color: "yellow", dlType: "assets", filterData: { status: "WIP" } },
  ];

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
            <div style={{ width: "36px", height: "36px", background: "#eff6ff", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: 0 }}>Healthcare Asset Dashboard</h1>
          </div>
          <p style={{ color: "#64748b", fontSize: "13.5px", margin: 0 }}>Complete visibility into your healthcare facility's asset lifecycle</p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button onClick={() => setRefreshKey(k => k + 1)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 16px", borderRadius: "9px", border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#475569" }}>
            <Icon.Refresh /> Refresh
          </button>
          <button onClick={() => doExport({}, "all")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "9px 18px", borderRadius: "9px", border: "none", background: "#2563eb", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            <Icon.Download /> Export All
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <FiltersPanel
        filters={filters}
        setFilters={setFilters}
        filterOptions={filterOptions}
        onApply={handleApply}
        onReset={handleReset}
      />

      {/* Error state */}
      {snapError && <ErrorState message={snapError} onRetry={loadSnapshot} />}

      {/* ── ASSET SNAPSHOT KPI CARDS ── */}
      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>
          Asset Snapshot
          <span style={{ fontSize: "12px", fontWeight: 400, color: "#94a3b8", marginLeft: "8px" }}>Live count from database</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px" }}>
          {KPI_LIST.map(k => (
            <KpiCard
              key={k.key}
              label={k.label}
              value={snapshot?.[k.key]}
              icon={k.icon}
              color={k.color}
              loading={snapLoading}
              onDownload={() => doExport(k.filterData, k.dlType)}
              onClick={() => openKpiAssets(k.label, { ...appliedFilters, ...k.filterData })}
            />
          ))}
        </div>

        {/* ── KPI Asset Panel ── */}
        {kpiAssets && (
          <div style={{ marginTop: "20px", background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>{kpiAssets.label} — Asset List</span>
              <button onClick={() => setKpiAssets(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#94a3b8", lineHeight: 1 }}>×</button>
            </div>
            {kpiAssets.loading ? <Spinner /> : kpiAssetErr ? <ErrorState message={kpiAssetErr} /> : (
              <div style={{ overflowX: "auto" }}>
                {(!kpiAssets.data || kpiAssets.data.length === 0) ? <EmptyState /> : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["Asset Name","Asset ID","Type","Category","Department","Location","Status","Criticality","Working Status"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {kpiAssets.data.map((a, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                          onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a" }}>{a.asset_name || "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#64748b" }}>{a.asset_unique_id || "—"}</td>
                          <td style={{ padding: "10px 14px" }}>{a.asset_type || "—"}</td>
                          <td style={{ padding: "10px 14px" }}>{a.asset_category || "—"}</td>
                          <td style={{ padding: "10px 14px" }}>{a.department_name || "—"}</td>
                          <td style={{ padding: "10px 14px" }}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: a.status === "Active" ? "#dcfce7" : "#f1f5f9", color: a.status === "Active" ? "#16a34a" : "#64748b" }}>{a.status || "—"}</span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: a.criticality === "Critical" ? "#fee2e2" : "#f0fdfa", color: a.criticality === "Critical" ? "#dc2626" : "#0d9488" }}>{a.criticality || "—"}</span>
                          </td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: a.working_status === "Working" ? "#dcfce7" : a.working_status === "WIP" ? "#fef9c3" : "#fee2e2", color: a.working_status === "Working" ? "#16a34a" : a.working_status === "WIP" ? "#854d0e" : "#dc2626" }}>{a.working_status || "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── CHARTS ROW ── */}
      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Analytics & Charts</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>

          {/* Pie: Working Status */}
          <ChartCard title="Working Status Distribution" subtitle="Working vs WIP vs Not Working">
            {chartLoading ? <Spinner /> : charts?.statusDistribution ?
              <PieChart data={charts.statusDistribution.map(d => ({ name: d.name, value: d.value }))} /> :
              <EmptyState small />
            }
          </ChartCard>

          {/* Bar: Criticality by Dept */}
          <ChartCard title="Criticality by Department" subtitle="Critical vs Non-Critical asset count">
            {chartLoading ? <Spinner /> : charts?.criticalityByDept ?
              <BarChart data={charts.criticalityByDept} /> :
              <EmptyState small />
            }
          </ChartCard>

          {/* Line: Monthly Trends */}
          <ChartCard title="Monthly Maintenance Trends" subtitle="PMS & Call Log activity over 12 months">
            {chartLoading ? <Spinner /> : charts?.monthlyTrend ?
              <LineChart data={charts.monthlyTrend} /> :
              <EmptyState small />
            }
          </ChartCard>
        </div>
      </section>

      {/* ── RECORDS TABS ── */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Records</h2>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #e2e8f0", marginBottom: "18px", overflowX: "auto" }}>
          {Object.entries(RECORD_CONFIGS).map(([key, cfg]) => {
            const IconComp = cfg.icon;
            const c = COLORS[cfg.color] || COLORS.blue;
            const active = activeRecord === key;
            return (
              <button
                key={key}
                onClick={() => setActiveRec(key)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "7px",
                  padding: "10px 18px", background: "none", border: "none",
                  borderBottom: active ? `2.5px solid ${c.icon}` : "2.5px solid transparent",
                  marginBottom: "-2px", cursor: "pointer", whiteSpace: "nowrap",
                  color: active ? c.icon : "#64748b",
                  fontWeight: active ? 700 : 500, fontSize: "13px",
                }}
              >
                <div style={{ color: active ? c.icon : "#94a3b8" }}><IconComp /></div>
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Active record table */}
        <RecordsTable key={`${activeRecord}-${JSON.stringify(appliedFilters)}`} type={activeRecord} token={token} globalFilters={appliedFilters} />
      </section>
    </div>
  );
}
