/**
 * HealthcareDashboard.jsx
 * Professional FM Healthcare Asset Management Dashboard
 * Features: KPI cards, Charts (Pie/Bar/Line), Advanced Filters, Excel export, Records tables
 */

import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();

// Module-level cache: survives tab-switch remounts
let _hcLastFetch = 0;
let _hcReqId = 0; // incremented on every fetch; stale responses are discarded
const HC_STALE_MS = 60_000;

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
  Total: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg>,
  Verified: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>,
  Critical: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  NonCritical: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
  Working: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  Unverified: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>,
  Wip: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  NotWorking: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>,
  Download: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
  Filter: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>,
  Search: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
  Refresh: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-3.5" /></svg>,
  CallLog: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.18h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 15.42z" /></svg>,
  Pms: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>,
  Calibration: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" /><path d="M4.93 19.07a10 10 0 0 1 0-14.14" /></svg>,
  Training: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
  Rber: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
};

/* ─── Colour palette ─────────────────────────────────────────────────────── */
const COLORS = {
  blue: { bg: "#eff6ff", icon: "#2563eb", border: "#bfdbfe" },
  green: { bg: "#f0fdf4", icon: "#16a34a", border: "#bbf7d0" },
  red: { bg: "#fef2f2", icon: "#dc2626", border: "#fecaca" },
  orange: { bg: "#fff7ed", icon: "#ea580c", border: "#fed7aa" },
  purple: { bg: "#faf5ff", icon: "#7c3aed", border: "#e9d5ff" },
  yellow: { bg: "#fefce8", icon: "#ca8a04", border: "#fde68a" },
  teal: { bg: "#f0fdfa", icon: "#0d9488", border: "#99f6e4" },
};

/* ─── Simple chart components (no external library needed) ───────────────── */
function PieChart({ data, size = 200, compact = false }) {
  const filtered = (data || []).filter(d => d.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);
  if (!total || filtered.length === 0) return <EmptyState small />;

  const PIE_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#14b8a6"];
  const r = size / 2 - 14;
  const cx = size / 2, cy = size / 2;

  // Build slices; if single slice, draw full circle
  let slices = [];
  if (filtered.length === 1) {
    slices = [{ path: null, fullCircle: true, color: filtered[0].color || PIE_COLORS[0], label: filtered[0].name, value: filtered[0].value, pct: 1 }];
  } else {
    let cumulative = 0;
    slices = filtered.map((d, i) => {
      const pct = d.value / total;
      const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
      cumulative += pct;
      const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle), y2 = cy + r * Math.sin(endAngle);
      const large = pct > 0.5 ? 1 : 0;
      return { path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`, color: d.color || PIE_COLORS[i % PIE_COLORS.length], label: d.name, value: d.value, pct };
    });
  }

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {slices.map((s, i) =>
            s.fullCircle
              ? <circle key={i} cx={cx} cy={cy} r={r} fill={s.color} stroke="#fff" strokeWidth="2"><title>{s.label}: {s.value} (100%)</title></circle>
              : <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2"><title>{s.label}: {s.value} ({(s.pct * 100).toFixed(1)}%)</title></path>
          )}
          <circle cx={cx} cy={cy} r={r * 0.52} fill="#fff" />
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="13" fontWeight="800" fill="#0f172a">{total.toLocaleString()}</text>
          <text x={cx} y={cy + 8} textAnchor="middle" fontSize="8" fill="#94a3b8">Total</text>
        </svg>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px", width: "100%" }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
              <span style={{ fontWeight: 700, color: "#0f172a", marginLeft: "auto" }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {slices.map((s, i) =>
          s.fullCircle
            ? <circle key={i} cx={cx} cy={cy} r={r} fill={s.color} stroke="#fff" strokeWidth="2"><title>{s.label}: {s.value} (100%)</title></circle>
            : <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2"><title>{s.label}: {s.value} ({(s.pct * 100).toFixed(1)}%)</title></path>
        )}
        {/* Donut hole */}
        <circle cx={cx} cy={cy} r={r * 0.52} fill="#fff" />
        <text x={cx} y={cy - 7} textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f172a">{total.toLocaleString()}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" fontSize="9" fill="#94a3b8">Total</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12px" }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            <span style={{ color: "#475569", fontWeight: 500 }}>{s.label}</span>
            <span style={{ fontWeight: 800, color: "#0f172a" }}>{s.value.toLocaleString()}</span>
            <span style={{ color: "#94a3b8", fontSize: "10px" }}>({(s.pct * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Equipment Health Status — rich donut with right-side % legend ─────────── */
function EquipmentHealthChart({ statuses }) {
  const total = statuses.reduce((s, x) => s + (Number(x.value) || 0), 0);
  const visible = statuses.filter(s => Number(s.value) > 0);

  const size = 100, stroke = 14, r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;

  // Fit the centre number regardless of magnitude
  const totalStr = total.toLocaleString("en-IN");
  const numFont = totalStr.length >= 9 ? 13 : totalStr.length >= 7 ? 16 : totalStr.length >= 5 ? 19 : 22;

  let offset = 0;
  return (
    /* flexWrap NEVER wraps — legend is always to the right of the donut */
    <div style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", flexWrap: "nowrap", overflow: "hidden" }}>
      {/* Donut — fixed size, never shrinks */}
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ filter: "drop-shadow(0 3px 8px rgba(15,23,42,0.10))" }}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#eef2f6" strokeWidth={stroke} />
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {total > 0 && visible.map((s, i) => {
              const frac = (Number(s.value) || 0) / total;
              const len = frac * circ;
              const el = (
                <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
                  strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset}>
                  <title>{s.name}: {Number(s.value).toLocaleString("en-IN")} ({(frac * 100).toFixed(1)}%)</title>
                </circle>
              );
              offset += len;
              return el;
            })}
          </g>
          <circle cx={cx} cy={cy} r={r - stroke / 2} fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: `${numFont}px`, fontWeight: 800, color: "#0f172a", lineHeight: 1, letterSpacing: "-0.02em" }}>{totalStr}</div>
          <div style={{ fontSize: "8px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "3px" }}>Total</div>
        </div>
      </div>

      {/* Legend — shrinks into remaining space, text truncates before wrapping */}
      <div style={{ display: "flex", flexDirection: "column", gap: "5px", flex: 1, minWidth: 0, overflow: "hidden" }}>
        {visible.length === 0 ? (
          <span style={{ fontSize: "11px", color: "#94a3b8" }}>No data</span>
        ) : visible.map((s, i) => {
          const pct = total ? (Number(s.value) / total) * 100 : 0;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0 }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: "10px", color: "#334155", fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{s.name}</span>
              <span style={{ fontSize: "11px", fontWeight: 800, color: s.color, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BarChart({ data, height = 200, onBarClick, groupByHospital = false }) {
  if (!data || data.length === 0) return <EmptyState small />;
  const maxVal = Math.max(...data.map(d => (d.critical || 0) + (d.nonCritical || 0)), 1);

  // Group data by hospital when requested
  const groups = groupByHospital
    ? data.reduce((acc, d) => {
      const key = d.hospital || 'Unknown Hospital';
      if (!acc[key]) acc[key] = [];
      acc[key].push(d);
      return acc;
    }, {})
    : null;

  const renderBar = (d, i) => {
    const total = (d.critical || 0) + (d.nonCritical || 0);
    const totalH = (total / maxVal) * (height - 50);
    const critH = ((d.critical || 0) / maxVal) * (height - 50);
    return (
      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flex: 1, minWidth: "56px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: `${height - 50}px` }}>
          {/* Bar 1: Total Qty */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            {total > 0 && <span style={{ fontSize: "9px", fontWeight: 700, color: "#2563eb", marginBottom: "2px" }}>{total}</span>}
            <div
              title={`Total: ${total}`}
              style={{ width: "14px", background: "linear-gradient(180deg,#60a5fa,#2563eb)", borderRadius: "3px 3px 0 0", height: `${totalH}px`, minHeight: total ? "3px" : "0", cursor: "default" }}
            />
          </div>
          {/* Bar 2: Critical */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            {(d.critical || 0) > 0 && <span style={{ fontSize: "9px", fontWeight: 700, color: "#ef4444", marginBottom: "2px" }}>{d.critical}</span>}
            <div
              title={`Critical: ${d.critical || 0} — click to view assets`}
              onClick={() => onBarClick && (d.critical || 0) > 0 && onBarClick(d.dept, "Critical", d.deptId)}
              style={{ width: "14px", background: "linear-gradient(180deg,#f87171,#ef4444)", borderRadius: "3px 3px 0 0", height: `${critH}px`, minHeight: (d.critical || 0) ? "3px" : "0", cursor: onBarClick && (d.critical || 0) > 0 ? "pointer" : "default", transition: "opacity 0.12s" }}
              onMouseEnter={e => { if (onBarClick && (d.critical || 0) > 0) e.target.style.opacity = "0.7"; }}
              onMouseLeave={e => { e.target.style.opacity = "1"; }}
            />
          </div>
        </div>
        <div style={{ fontSize: "10px", color: "#64748b", textAlign: "center", wordBreak: "break-all", lineHeight: 1.2, maxWidth: "56px" }}>{d.dept}</div>
      </div>
    );
  };

  return (
    <div style={{ overflowX: "auto" }}>
      {groupByHospital && groups ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {Object.entries(groups).map(([hospital, depts]) => (
            <div key={hospital}>
              {/* Hospital header band */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px", padding: "5px 10px", background: "linear-gradient(90deg,#eff6ff,#f8fafc)", borderRadius: "6px", borderLeft: "3px solid #2563eb" }}>
                <span style={{ fontSize: "11px", fontWeight: 800, color: "#1e40af", textTransform: "uppercase", letterSpacing: "0.05em" }}>🏥 {hospital}</span>
                <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 500 }}>
                  {depts.reduce((s, d) => s + (d.critical || 0) + (d.nonCritical || 0), 0)} assets · {depts.reduce((s, d) => s + (d.critical || 0), 0)} critical
                </span>
              </div>
              {/* Bars for this hospital */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", minWidth: `${depts.length * 70}px`, height: `${height}px`, padding: "8px 0" }}>
                {depts.map((d, i) => renderBar(d, i))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", minWidth: `${data.length * 70}px`, height: `${height}px`, padding: "8px 0" }}>
          {data.map((d, i) => renderBar(d, i))}
        </div>
      )}
      <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "8px" }}>
        {[["linear-gradient(180deg,#60a5fa,#2563eb)", "Total Assets"], ["linear-gradient(180deg,#f87171,#ef4444)", "Critical (click to drill down)"]].map(([grad, lbl]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#374151" }}>
            <div style={{ width: "12px", height: "12px", background: grad, borderRadius: "2px" }} />
            {lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, height = 200 }) {
  if (!data || data.length === 0) return <EmptyState small />;
  const maxPms = Math.max(...data.map(d => d.pms || 0), 1);
  const maxCalls = Math.max(...data.map(d => d.calls || 0), 1);
  const maxVal = Math.max(maxPms, maxCalls, 1);
  const w = 480, h = height - 40;

  const toPoint = (i, val) => {
    const x = data.length === 1 ? w / 2 : (i / (data.length - 1)) * w;
    const y = h - (val / maxVal) * h;
    return { x, y };
  };

  const pmsPoints = data.map((d, i) => toPoint(i, d.pms || 0));
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
        {[["#3b82f6", "PMS"], ["#10b981", "Call Logs"]].map(([col, lbl]) => (
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

function KpiCard({ label, value, icon: IconComp, color, loading, onClick, isActive }) {
  const c = COLORS[color] || COLORS.blue;
  const numColor = { red: "#dc2626", teal: "#0d9488", green: "#16a34a", orange: "#ea580c", purple: "#7c3aed", yellow: "#ca8a04", blue: "#2563eb" }[color] || "#0f172a";
  return (
    <div
      onClick={onClick}
      style={{
        background: isActive ? c.bg : "#fff",
        borderRadius: "10px",
        border: isActive ? `2px solid ${c.icon}` : `1px solid ${c.border}`,
        padding: "10px 10px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "4px",
        minHeight: "68px",
        boxShadow: isActive ? `0 2px 10px ${c.border}` : "0 1px 3px rgba(0,0,0,0.04)",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.15s ease",
        position: "relative",
        textAlign: "center",
      }}
      onMouseEnter={onClick ? e => { e.currentTarget.style.boxShadow = `0 4px 14px ${c.border}`; e.currentTarget.style.transform = "translateY(-1px)"; } : undefined}
      onMouseLeave={onClick ? e => { e.currentTarget.style.boxShadow = isActive ? `0 2px 10px ${c.border}` : "0 1px 3px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "none"; } : undefined}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
        <div style={{ width: "14px", height: "14px", background: c.bg, borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center", color: c.icon, flexShrink: 0 }}>
          <IconComp />
        </div>
        <p style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0, lineHeight: 1.3, textAlign: "center" }}>{label}</p>
      </div>
      <div>
        {loading ? (
          <div style={{ width: "40px", height: "22px", background: "#f1f5f9", borderRadius: "4px", animation: "pulse 1.4s ease-in-out infinite", margin: "0 auto" }} />
        ) : (
          <p style={{ fontSize: "20px", fontWeight: 900, color: isActive ? c.icon : numColor, margin: 0, lineHeight: 1, letterSpacing: "-0.5px" }}>{value ?? "—"}</p>
        )}
      </div>
      {isActive && (
        <div style={{ position: "absolute", top: "6px", left: "6px", width: "6px", height: "6px", borderRadius: "50%", background: c.icon }} />
      )}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

/* Icons for complaint tiles */
const ComplaintIcon = {
  Total: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.63 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 15.92z" /></svg>,
  Wip: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
  Lt7: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>,
  Gt7: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>,
  Resolved: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>,
  Closed: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg>,
};

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

  // Active count excluding dept + search (those are always visible)
  const innerFilters = ["dateFrom", "dateTo", "assetCategory", "location", "status", "criticality"];
  const innerActiveCount = innerFilters.filter(k => filters[k] !== "").length;

  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "20px", overflow: "hidden" }}>
      {/* Header row: toggle + dept dropdown + search input */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {/* Toggle button */}
        <div
          onClick={() => setOpen(o => !o)}
          style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", userSelect: "none", flexShrink: 0 }}
        >
          <Icon.Filter />
          <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a", whiteSpace: "nowrap" }}>Advanced Filters</span>
          {innerActiveCount > 0 && (
            <span style={{ background: "#2563eb", color: "#fff", borderRadius: "9px", padding: "1px 8px", fontSize: "11px", fontWeight: 700 }}>
              {innerActiveCount} active
            </span>
          )}
          <div style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
          </div>
        </div>

        {/* Department — always visible */}
        <div style={{ flex: "0 0 190px", minWidth: "140px" }}>
          <select value={filters.departmentId} onChange={e => setFilters(f => ({ ...f, departmentId: e.target.value }))}
            style={{ width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", background: "#fff", outline: "none" }}>
            <option value="">All Departments</option>
            {(filterOptions.departments || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>

        {/* Search Asset — always visible */}
        <div style={{ flex: "1 1 180px", position: "relative", minWidth: "140px" }}>
          <input
            placeholder="Search asset name or ID…"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            style={{ width: "100%", boxSizing: "border-box", padding: "7px 11px 7px 32px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", background: "#fff", outline: "none" }}
          />
          <div style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }}><Icon.Search /></div>
        </div>
      </div>

      {/* Expandable section — remaining filters */}
      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #f1f5f9" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "12px", paddingTop: "14px" }}>
            {/* Date range */}
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Date From</label>
              <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Date To</label>
              <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} style={inputStyle} />
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
      { key: "id", label: "Req. ID", link: "calllog" },
      { key: "call_date", label: "Date" },
      { key: "asset_name", label: "Asset" },
      { key: "asset_unique_id", label: "Asset ID", link: "asset", idKey: "asset_id" },
      { key: "department_name", label: "Department" },
      { key: "caller_name", label: "Caller" },
      { key: "issue_reported", label: "Issue", wrap: true },
      { key: "priority", label: "Priority", badge: true },
      { key: "status", label: "Status", badge: true },
    ],
  },
  pms: {
    label: "PMS History", icon: Icon.Pms, color: "teal",
    columns: [
      { key: "scheduled_date", label: "Scheduled" },
      { key: "asset_name", label: "Asset" },
      { key: "asset_unique_id", label: "Asset ID", link: "asset", idKey: "asset_id" },
      { key: "department_name", label: "Department" },
      { key: "maintenance_type", label: "Type" },
      { key: "technician_name", label: "Technician" },
      { key: "status", label: "Status", badge: true },
      { key: "next_due_date", label: "Next Due" },
    ],
  },
  calibration: {
    label: "Calibration Records", icon: Icon.Calibration, color: "purple",
    columns: [
      { key: "calibration_date", label: "Date" },
      { key: "asset_name", label: "Asset" },
      { key: "asset_unique_id", label: "Asset ID", link: "asset", idKey: "asset_id" },
      { key: "department_name", label: "Department" },
      { key: "calibrated_by", label: "Calibrated By" },
      { key: "certificate_no", label: "Certificate No." },
      { key: "calibration_result", label: "Result", badge: true },
      { key: "next_due_date", label: "Next Due" },
    ],
  },
  training: {
    label: "Training Records", icon: Icon.Training, color: "orange",
    columns: [
      { key: "training_date", label: "Date" },
      { key: "training_title", label: "Title", wrap: true },
      { key: "employee_name", label: "Employee" },
      { key: "department_name", label: "Department" },
      { key: "trainer_name", label: "Trainer" },
      { key: "result", label: "Result", badge: true },
      { key: "expiry_date", label: "Expiry" },
    ],
  },
  rber: {
    label: "RBER Records", icon: Icon.Rber, color: "red",
    columns: [
      { key: "review_date", label: "Date" },
      { key: "asset_name", label: "Asset" },
      { key: "asset_unique_id", label: "Asset ID", link: "asset", idKey: "asset_id" },
      { key: "department_name", label: "Department" },
      { key: "reviewer_name", label: "Reviewer" },
      { key: "risk_score", label: "Score" },
      { key: "risk_level", label: "Risk Level", badge: true },
      { key: "status", label: "Status", badge: true },
      { key: "next_review_date", label: "Next Review" },
    ],
  },
};

const BADGE_STYLES = {
  // status
  open: { bg: "#fee2e2", color: "#dc2626" },
  closed: { bg: "#f1f5f9", color: "#475569" },
  resolved: { bg: "#dcfce7", color: "#16a34a" },
  scheduled: { bg: "#dbeafe", color: "#1d4ed8" },
  completed: { bg: "#dcfce7", color: "#16a34a" },
  valid: { bg: "#dcfce7", color: "#16a34a" },
  expired: { bg: "#fee2e2", color: "#dc2626" },
  pending: { bg: "#fef9c3", color: "#854d0e" },
  pass: { bg: "#dcfce7", color: "#16a34a" },
  fail: { bg: "#fee2e2", color: "#dc2626" },
  // priority
  critical: { bg: "#fee2e2", color: "#991b1b" },
  high: { bg: "#ffedd5", color: "#9a3412" },
  medium: { bg: "#fef9c3", color: "#854d0e" },
  low: { bg: "#dcfce7", color: "#166534" },
  // risk
  High: { bg: "#fee2e2", color: "#991b1b" },
  Medium: { bg: "#fef9c3", color: "#854d0e" },
  Low: { bg: "#dcfce7", color: "#166534" },
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

/* ─── Call-Log detail modal ──────────────────────────────────────────────── */
function CallLogDetailModal({ id, token, onClose }) {
  const [rec, setRec] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    hcFetch(`/records/call-logs/${id}`, token)
      .then(d => setRec(d))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [id, token]);

  const exportExcel = () => {
    if (!rec) return;
    const rows = [
      ["Field", "Value"],
      ["Request ID", `REQ-${rec.id}`],
      ["Date", rec.call_date || ""],
      ["Asset Name", rec.asset_name || ""],
      ["Asset ID", rec.asset_unique_id || rec.generated_asset_id || ""],
      ["Department", rec.department_name || ""],
      ["Location", rec.location || ""],
      ["Caller Name", rec.caller_name || ""],
      ["Caller Contact", rec.caller_contact || ""],
      ["Issue Reported", rec.issue_reported || ""],
      ["Call Type", rec.call_type || ""],
      ["Priority", rec.priority || ""],
      ["Status", rec.status || ""],
      ["Assigned To", rec.assigned_to_name || ""],
      ["Resolution", rec.resolution_notes || ""],
      ["Resolution Date", rec.resolution_date || ""],
      ["Created At", rec.created_at ? String(rec.created_at).slice(0, 19) : ""],
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `call-log-REQ-${rec.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };

  const Field = ({ label, value }) => value ? (
    <div style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9", display: "flex", gap: "12px" }}>
      <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", width: "130px", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "13px", color: "#0f172a", flex: 1, wordBreak: "break-word" }}>{value}</span>
    </div>
  ) : null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "min(620px,95vw)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <p style={{ fontWeight: 800, fontSize: "16px", color: "#0f172a", margin: 0 }}>
              {rec ? `REQ-${rec.id} — ${rec.asset_name || "Call Log"}` : "Call Log Detail"}
            </p>
            {rec && <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>{rec.call_date}</p>}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={exportExcel} disabled={!rec}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#2563eb", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
              <Icon.Download /> Export CSV
            </button>
            <button onClick={onClose}
              style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "18px", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>
              ×
            </button>
          </div>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {loading ? <Spinner /> : !rec ? <ErrorState message="Record not found" onRetry={() => { }} /> : (
            <>
              <Field label="Request ID" value={`REQ-${rec.id}`} />
              <Field label="Date" value={rec.call_date} />
              <Field label="Asset Name" value={rec.asset_name} />
              <Field label="Asset ID" value={rec.asset_unique_id || rec.generated_asset_id} />
              <Field label="Department" value={rec.department_name} />
              <Field label="Location" value={rec.location} />
              <Field label="Caller" value={rec.caller_name} />
              <Field label="Contact" value={rec.caller_contact} />
              <Field label="Issue Reported" value={rec.issue_reported} />
              <Field label="Call Type" value={rec.call_type} />
              <Field label="Priority" value={rec.priority} />
              <Field label="Status" value={rec.status} />
              <Field label="Assigned To" value={rec.assigned_to_name} />
              <Field label="Resolution" value={rec.resolution_notes} />
              <Field label="Resolved On" value={rec.resolution_date} />
              <Field label="Created At" value={rec.created_at ? String(rec.created_at).slice(0, 19) : null} />
              {rec.remarks && <Field label="Remarks" value={rec.remarks} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordsTable({ type, token, globalFilters, kpiFilter, kpiFilterLabel }) {
  const cfg = RECORD_CONFIGS[type];
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [detailId, setDetailId] = useState(null); // call-log detail modal
  const LIMIT = 20;
  const c = COLORS[cfg.color] || COLORS.blue;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = buildQS({ ...globalFilters, search, page, limit: LIMIT, ...(kpiFilter ? { kpiFilter } : {}) });
      const res = await hcFetch(`/records/${type}${qs}`, token);
      setData(res.data || []);
      setTotal(res.pagination?.total || 0);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [type, token, globalFilters, search, page, kpiFilter]);

  useEffect(() => { load(); }, [load]);

  const handleExport = () => {
    const qs = buildQS({ ...globalFilters, search, type, ...(kpiFilter ? { kpiFilter } : {}) });
    hcDownload(`/export${qs}`, token, `healthcare-export-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      .catch(e => alert(`Export failed: ${e.message}`));
  };

  const renderCell = (col, row) => {
    const val = row[col.key];
    if (col.link === "calllog") {
      return (
        <button onClick={() => setDetailId(row.id)}
          style={{ background: "none", border: "none", color: "#2563eb", fontFamily: "monospace", fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: 0, fontWeight: 700, whiteSpace: "nowrap" }}>
          REQ-{val || row.id}
        </button>
      );
    }
    if (col.link === "asset") {
      const assetId = col.idKey ? row[col.idKey] : null;
      const display = val || row.generated_asset_id;
      if (!display) return <span style={{ color: "#94a3b8" }}>—</span>;
      return (
        <button onClick={() => assetId && window.open(`/company/asset/${assetId}`, "_blank")}
          style={{ background: "none", border: "none", color: assetId ? "#1e40af" : "#64748b", fontFamily: "monospace", fontSize: "12px", cursor: assetId ? "pointer" : "default", textDecoration: assetId ? "underline" : "none", padding: 0, fontWeight: 600, whiteSpace: "nowrap" }}>
          {display}
        </button>
      );
    }
    if (col.badge) return <BadgeCell val={val} />;
    return val || "—";
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
        {/* Active KPI filter chip */}
        {kpiFilterLabel && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: c.bg, border: `1px solid ${c.icon}`, borderRadius: "20px", padding: "3px 10px", fontSize: "12px", fontWeight: 700, color: c.icon }}>
            🔍 {kpiFilterLabel}
          </span>
        )}
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
                      {renderCell(col, row)}
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

      {/* Call-log detail modal */}
      {detailId && <CallLogDetailModal id={detailId} token={token} onClose={() => setDetailId(null)} />}
    </div>
  );
}

/* ─── KPI drilldown: asset-wise report table (PMS / Calibration / Training) ───
   Uses the real report endpoints (/pms|/calibration|/training/reports) which hold
   the actual scheduled data, instead of the separate (often empty) healthcare
   /records/:type tables. Columns per the operational report format. */
function KpiReportTable({ type, token, kpiFilter, allCompaniesMode = false }) {
  const cfg = RECORD_CONFIGS[type] || RECORD_CONFIGS.pms;
  const c = COLORS[cfg.color] || COLORS.blue;
  const IconComp = cfg.icon;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const qp = new URLSearchParams();
    if (search) qp.set("search", search);
    if (allCompaniesMode) qp.set("allCompanies", "true");
    qp.set("pageSize", "5000"); // fetch all records for the drilldown modal
    const qs = qp.toString() ? `?${qp.toString()}` : "";
    const url =
      type === "calibration" ? `${BASE}/api/company-portal/calibration/reports${qs}` :
        type === "training" ? `${BASE}/api/company-portal/training/reports${qs}` :
          `${BASE}/api/company-portal/pms/reports${qs}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (alive) setRows(Array.isArray(d) ? d : (d.rows || [])); })
      .catch(e => { if (alive) setError(e.message || "Failed to load"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [type, token, search, reload, allCompaniesMode]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const past = (d) => d && new Date(d) < today;

  // Training has a real status field, so we can filter it precisely. PMS/Calibration
  // reports expose only a FUTURE next-due date, so date-bucket filtering here would
  // wrongly hide overdue/due-this-month rows and show an empty table — instead show
  // the full hospital-scoped list (the KPI tile already carries the exact count).
  let data = rows;
  if (kpiFilter && type === "training") {
    const st = (r) => (r.status || "").toLowerCase();
    if (kpiFilter === "scheduled") data = rows.filter(r => st(r) === "scheduled");
    else if (kpiFilter === "completed") data = rows.filter(r => st(r) === "completed");
    else if (kpiFilter === "overdue") data = rows.filter(r => st(r) !== "completed" && past(r.training_date));
  }

  const fmt = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  const assetCell = (name, id) => (
    <div>
      <div style={{ fontWeight: 700, color: "#0f172a" }}>{name || "—"}</div>
      {id ? <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{id}</div> : null}
    </div>
  );
  const pendingChip = (n) => (Number(n) || 0) > 0
    ? <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#f3e8ff", color: "#7c3aed" }}>{n} pending</span>
    : <span style={{ color: "#94a3b8" }}>—</span>;

  const hospitalCol = { label: "Hospital", cell: r => <span style={{ fontSize: 12, color: "#475569" }}>{r.hospitalName || "—"}</span> };
  const columns =
    type === "pms" ? [
      ...(allCompaniesMode ? [hospitalCol] : []),
      { label: "Asset", cell: r => assetCell(r.assetName, r.generatedAssetId || r.assetUniqueId) },
      { label: "Department", cell: r => r.departmentName || "—" },
      { label: "Last PMS", cell: r => fmt(r.lastPmsDate) },
      { label: "Next PMS", cell: r => <span style={{ color: past(r.nextPmsDate) ? "#dc2626" : "#374151" }}>{fmt(r.nextPmsDate)}</span> },
      { label: "Total", cell: r => <b style={{ color: "#0f172a" }}>{r.totalPms ?? 0}</b> },
      { label: "Closed", cell: r => <b style={{ color: "#0891b2" }}>{r.closedPms ?? 0}</b> },
      { label: "Pending", cell: r => pendingChip(r.pendingApproval) },
    ] :
      type === "calibration" ? [
        ...(allCompaniesMode ? [hospitalCol] : []),
        { label: "Asset", cell: r => assetCell(r.assetName, r.assetId2) },
        { label: "Department", cell: r => r.departmentName || "—" },
        { label: "Last Calibration", cell: r => fmt(r.lastCalibrationDate) },
        { label: "Next Calibration", cell: r => <span style={{ color: past(r.nextCalibrationDate) ? "#dc2626" : "#374151" }}>{fmt(r.nextCalibrationDate)}</span> },
        { label: "Total", cell: r => <b style={{ color: "#0f172a" }}>{r.totalSchedules ?? 0}</b> },
        { label: "Completed", cell: r => <b style={{ color: "#16a34a" }}>{r.completedSchedules ?? 0}</b> },
        { label: "Pending", cell: r => pendingChip(r.pendingSchedules) },
      ] : [
        ...(allCompaniesMode ? [hospitalCol] : []),
        { label: "Date", cell: r => fmt(r.training_date) },
        { label: "Title", cell: r => r.title || "—" },
        { label: "Trainer", cell: r => r.trainer_name || "—" },
        { label: "Status", cell: r => <BadgeCell val={r.status} /> },
        { label: "Registered", cell: r => r.total_registered ?? 0 },
        { label: "Present", cell: r => r.total_present ?? 0 },
      ];

  const exportToExcel = () => {
    const fmt = (d) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
    const exportRows = data.map(r => {
      if (type === "pms") return {
        Hospital: r.hospitalName || "",
        Asset: r.assetName || "",
        "Asset ID": r.generatedAssetId || r.assetUniqueId || "",
        Department: r.departmentName || "",
        "Last PMS": fmt(r.lastPmsDate),
        "Next PMS": fmt(r.nextPmsDate),
        Total: r.totalPms ?? 0,
        Closed: r.closedPms ?? 0,
        "Pending Approval": r.pendingApproval ?? 0,
      };
      if (type === "calibration") return {
        Hospital: r.hospitalName || "",
        Asset: r.assetName || "",
        "Asset ID": r.assetId2 || "",
        Department: r.departmentName || "",
        "Last Calibration": fmt(r.lastCalibrationDate),
        "Next Calibration": fmt(r.nextCalibrationDate),
        Total: r.totalSchedules ?? 0,
        Completed: r.completedSchedules ?? 0,
        Pending: r.pendingSchedules ?? 0,
      };
      return {
        Date: fmt(r.training_date),
        Title: r.title || "",
        Trainer: r.trainer_name || "",
        Status: r.status || "",
        Registered: r.total_registered ?? 0,
        Present: r.total_present ?? 0,
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cfg.label.slice(0, 31));
    XLSX.writeFile(wb, `${cfg.label.replace(/\s+/g, "_")}_Report.xlsx`);
  };

  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: `1px solid ${c.border}`, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ padding: "14px 18px", background: c.bg, borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div style={{ color: c.icon }}><IconComp /></div>
        <div style={{ flex: 1 }}>
          <p style={{ fontWeight: 700, fontSize: "14.5px", color: "#0f172a", margin: 0 }}>{cfg.label}</p>
          <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{data.length} records</p>
        </div>
        <div style={{ position: "relative" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            style={{ padding: "7px 10px 7px 30px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", width: "180px" }} />
          <div style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}><Icon.Search /></div>
        </div>
        {data.length > 0 && (
          <button onClick={exportToExcel}
            style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 13px", borderRadius: "8px", border: "1px solid #16a34a", background: "#f0fdf4", color: "#15803d", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Excel
          </button>
        )}
      </div>
      {loading ? <Spinner /> : error ? <ErrorState message={error} onRetry={() => setReload(x => x + 1)} /> : data.length === 0 ? <EmptyState /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {columns.map(col => (
                  <th key={col.label} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  {columns.map(col => (
                    <td key={col.label} style={{ padding: "10px 14px", color: "#374151", whiteSpace: "nowrap" }}>{col.cell(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Modal that wraps the KPI report table for drilldown ─────────────────── */
function KpiRecordsModal({ meta, token, globalFilters, allCompaniesMode = false, onClose }) {
  if (!meta) return null;
  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: "#f8fafc", borderRadius: "16px", width: "min(1100px,100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        {/* Header bar */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: "15px", color: "#0f172a" }}>{meta.label}</p>
          <button onClick={onClose}
            style={{ width: 32, height: 32, borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "18px", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ×
          </button>
        </div>
        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
          <KpiReportTable
            key={`${meta.tab}-${meta.kpiFilter}`}
            type={meta.tab}
            token={token}
            kpiFilter={meta.kpiFilter}
            allCompaniesMode={allCompaniesMode}
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
/* ─── Dashboard Asset Table (table format with View button) ─────────────── */
function DashboardAssetTable({ token, filters, tileLabel, onClearTile, onOpenAsset }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewAsset, setViewAsset] = useState(null); // asset whose images are shown
  const PER_PAGE = 20;

  // Map kpiKey → backend filter params understood by /assets endpoint
  const kpiKeyToFilters = (key) => {
    const map = {
      totalAssets: {},
      criticalAssets: { criticality: "Critical" },
      nonCriticalAssets: { criticality: "Non_Critical" },
      rberAssets: { rber: "true" },
      condemnedAssets: { workingStatus: "Condemned" },
      verifiedAssets: { verified: "true" },
    };
    return map[key] || {};
  };

  useEffect(() => { setPage(1); }, [JSON.stringify(filters)]);

  useEffect(() => {
    setLoading(true);
    const { kpiKey, ...restFilters } = filters;
    const extraParams = kpiKey ? kpiKeyToFilters(kpiKey) : {};
    const qs = buildQS({ ...restFilters, ...extraParams, limit: PER_PAGE, page });
    hcFetch(`/assets${qs}`, token)
      .then(d => { setAssets(d.data || []); setTotal(d.pagination?.total || 0); })
      .catch(() => { })
      .finally(() => setLoading(false));
  }, [token, JSON.stringify(filters), page]);

  const getImages = (a) => {
    const meta = typeof a.metadata === "string" ? JSON.parse(a.metadata || "{}") : (a.metadata || {});
    const imgs = meta.hcImages || meta.images || meta.imageUrls || [];
    const toStr = (u) => {
      const v = typeof u === "string" ? u : (u?.url || u?.src || u?.path || "");
      return typeof v === "string" ? v : "";
    };
    if (Array.isArray(imgs) && imgs.length > 0)
      return imgs.map(u => { const s = toStr(u); return s && (s.startsWith("http") || s.startsWith("/")) ? s : s ? `${BASE}${s}` : null; }).filter(Boolean);
    if (meta.imageUrl) { const s = toStr(meta.imageUrl); return s ? [s.startsWith("http") || s.startsWith("/") ? s : `${BASE}${s}`] : []; }
    return [];
  };

  const pages = Math.ceil(total / PER_PAGE);

  return (
    <section style={{ marginBottom: "28px" }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", flexWrap: "wrap", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
            Asset Report
            <span style={{ fontSize: "12px", fontWeight: 400, color: "#94a3b8", marginLeft: "8px" }}>{total} assets</span>
          </h2>
          {/* Active tile filter chip */}
          {tileLabel && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "20px", padding: "3px 10px", fontSize: "12px", fontWeight: 600, color: "#2563eb" }}>
              <span>Filtered: {tileLabel}</span>
              <button onClick={onClearTile} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "14px", lineHeight: 1, padding: 0 }}>×</button>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading assets…</div>
        ) : assets.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No assets found</div>
        ) : (
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "55vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "900px" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                <tr>
                  {["#", "Asset Name", "Asset ID", "Category", "Department", "Location", "Criticality", "Working Status", "View"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", background: "#f1f5f9", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map((a, i) => {
                  const imgs = getImages(a);
                  const isRber = !!(a.metadata?.rber);
                  const wsColor = isRber
                    ? { bg: "#fef3c7", c: "#d97706" }
                    : ({ Working: { bg: "#dcfce7", c: "#16a34a" }, WIP: { bg: "#fef9c3", c: "#854d0e" }, Not_Working: { bg: "#fee2e2", c: "#dc2626" } }[a.working_status] || { bg: "#f1f5f9", c: "#64748b" });
                  const critColor = a.criticality === "Critical" ? { bg: "#fee2e2", c: "#dc2626" } : { bg: "#f0fdfa", c: "#0d9488" };
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ padding: "9px 14px", color: "#94a3b8", fontSize: "12px" }}>{(page - 1) * PER_PAGE + i + 1}</td>
                      <td style={{ padding: "9px 14px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }}>{a.asset_name || "—"}</td>
                      <td style={{ padding: "9px 14px" }}>
                        <button onClick={() => window.open(`/company/asset/${a.id}`, '_blank')} style={{ background: "none", border: "none", color: "#1e40af", fontFamily: "monospace", fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: 0, whiteSpace: "nowrap", fontWeight: 600 }}>{a.asset_unique_id || "—"}</button>
                      </td>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{a.asset_category || "—"}</td>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{a.department_name || "—"}</td>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: critColor.bg, color: critColor.c, whiteSpace: "nowrap" }}>{a.criticality || "—"}</span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: wsColor.bg, color: wsColor.c, whiteSpace: "nowrap" }}>{isRber ? "RBER" : (a.working_status || "—").replace("_", " ")}</span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <button
                          onClick={() => setViewAsset(a)}
                          title={imgs.length ? `View ${imgs.length} image(s)` : "No images uploaded"}
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: imgs.length ? "#eff6ff" : "#f8fafc", color: imgs.length ? "#2563eb" : "#94a3b8", cursor: "pointer", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          {imgs.length ? `View (${imgs.length})` : "No Images"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "6px", padding: "12px 16px", borderTop: "1px solid #f1f5f9" }}>
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              style={{ padding: "5px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", background: page === 1 ? "#f8fafc" : "#fff", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: "12px", color: "#475569" }}>
              ← Prev
            </button>
            {Array.from({ length: Math.min(pages, 7) }, (_, i) => {
              const pg = pages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= pages - 3 ? pages - 6 + i : page - 3 + i;
              return (
                <button key={pg} onClick={() => setPage(pg)}
                  style={{ padding: "5px 10px", borderRadius: "7px", border: `1px solid ${pg === page ? "#2563eb" : "#e2e8f0"}`, background: pg === page ? "#2563eb" : "#fff", color: pg === page ? "#fff" : "#374151", cursor: "pointer", fontSize: "12px", fontWeight: pg === page ? 700 : 400 }}>
                  {pg}
                </button>
              );
            })}
            <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
              style={{ padding: "5px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", background: page >= pages ? "#f8fafc" : "#fff", cursor: page >= pages ? "not-allowed" : "pointer", fontSize: "12px", color: "#475569" }}>
              Next →
            </button>
          </div>
        )}
      </div>

      {/* Image viewer modal */}
      {viewAsset && (() => {
        const imgs = getImages(viewAsset);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
            onClick={() => setViewAsset(null)}>
            <div style={{ background: "#fff", borderRadius: "16px", maxWidth: "700px", width: "100%", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }} onClick={e => e.stopPropagation()}>
              {/* Modal header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>{viewAsset.asset_name || "Asset Images"}</p>
                  <p style={{ fontSize: "12px", color: "#94a3b8", margin: "2px 0 0", fontFamily: "monospace" }}>{viewAsset.asset_unique_id}</p>
                </div>
                <button onClick={() => setViewAsset(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#94a3b8", lineHeight: 1 }}>×</button>
              </div>
              {/* Images */}
              <div style={{ padding: "16px 20px" }}>
                {imgs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: "block", margin: "0 auto 12px", color: "#cbd5e1" }}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    <p style={{ margin: 0, fontSize: "14px" }}>No images uploaded for this asset</p>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
                    {imgs.map((src, idx) => (
                      <a key={idx} href={src} target="_blank" rel="noreferrer" style={{ display: "block", borderRadius: "8px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
                        <img src={src} alt={`Image ${idx + 1}`}
                          style={{ width: "100%", height: "160px", objectFit: "cover", display: "block" }}
                          onError={e => { e.target.parentElement.style.display = "none"; }} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}

/* ─── Reviews & Ratings section ──────────────────────────────────────────── */
const RR_STAR_COLORS = {
  5: { text: '#15803D', bg: '#DCFCE7', border: '#86EFAC', fill: '#22C55E', label: 'Excellent' },
  4: { text: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD', fill: '#3B82F6', label: 'Very Good' },
  3: { text: '#D97706', bg: '#FEF3C7', border: '#FCD34D', fill: '#EAB308', label: 'Good' },
  2: { text: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5', fill: '#F97316', label: 'Average' },
  1: { text: '#9F1239', bg: '#FFE4E6', border: '#FDA4AF', fill: '#EF4444', label: 'Poor' },
};

function StarDisplay({ rating, size = 16 }) {
  const r = Math.round(rating) || 1;
  const fillColor = RR_STAR_COLORS[r]?.fill || '#F59E0B';
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <svg key={s} className="rr-star-animated" width={size} height={size} viewBox="0 0 24 24"
          fill={s <= Math.round(rating) ? fillColor : '#E5E7EB'}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  );
}

function RatingBadge({ rating }) {
  const r = Math.min(5, Math.max(1, Math.round(rating)));
  const cfg = RR_STAR_COLORS[r];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 8px', borderRadius: 20,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      fontSize: 10, fontWeight: 700, color: cfg.text, whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <svg width={8} height={8} viewBox="0 0 24 24" fill={cfg.text}>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
      {cfg.label}
    </span>
  );
}

function SkeletonBlock({ width = '100%', height = 16, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: 6,
      background: 'linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%)',
      backgroundSize: '400% 100%',
      animation: 'rr-shimmer 1.4s ease-in-out infinite',
      ...style,
    }} />
  );
}

function ReviewCardSkeleton() {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SkeletonBlock width={30} height={30} style={{ borderRadius: '50%' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <SkeletonBlock width={100} height={11} />
            <SkeletonBlock width={70} height={9} />
          </div>
        </div>
        <SkeletonBlock width={50} height={9} />
      </div>
      <SkeletonBlock width="90%" height={9} />
    </div>
  );
}

function UserAvatar({ name }) {
  const initials = (name || 'U').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const palettes = [
    { bg: '#DBEAFE', text: '#1D4ED8' }, { bg: '#DCFCE7', text: '#15803D' },
    { bg: '#FEF3C7', text: '#D97706' }, { bg: '#F3E8FF', text: '#7C3AED' },
    { bg: '#FCE7F3', text: '#BE185D' }, { bg: '#FFEDD5', text: '#C2410C' },
    { bg: '#E0F2FE', text: '#0369A1' }, { bg: '#F0FDF4', text: '#166534' },
  ];
  const { bg, text } = palettes[(name || '').charCodeAt(0) % palettes.length];
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 800, color: text, flexShrink: 0, letterSpacing: '-0.3px',
    }}>{initials}</div>
  );
}

function ReviewCard({ r }) {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const text = (r.reviewText || '').trim();

  const dateStr = r.reviewedAt
    ? new Date(r.reviewedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        border: `1px solid ${hovered ? '#BFDBFE' : '#E2E8F0'}`,
        borderRadius: 10,
        padding: '10px 14px',
        boxShadow: hovered ? '0 4px 16px rgba(37,99,235,0.09)' : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Header row: Avatar + name/meta + badge + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <UserAvatar name={r.reviewerName} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>{r.reviewerName || 'User'}</span>
              <StarDisplay rating={r.rating} size={12} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, flexWrap: 'wrap' }}>
              {r.hospitalName && <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 700 }}>{r.hospitalName}</span>}
              {r.hospitalName && (r.role || r.departmentName) && <span style={{ fontSize: 9, color: '#CBD5E1' }}>·</span>}
              {r.role && <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600 }}>{r.role}</span>}
              {r.role && r.departmentName && <span style={{ fontSize: 9, color: '#CBD5E1' }}>·</span>}
              {r.departmentName && <span style={{ fontSize: 10, color: '#64748B' }}>{r.departmentName}</span>}
              {r.assignedToName && (
                <>
                  <span style={{ fontSize: 9, color: '#CBD5E1' }}>·</span>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>
                    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }}>
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx={12} cy={7} r={4} />
                    </svg>
                    {r.assignedToName}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
          <RatingBadge rating={r.rating} />
          {dateStr && <span style={{ fontSize: 10, color: '#94A3B8', whiteSpace: 'nowrap' }}>{dateStr}</span>}
        </div>
      </div>

      {/* Review text with expand/collapse */}
      {text && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            fontSize: 12, color: '#475569', lineHeight: 1.6,
            borderLeft: `2px solid ${RR_STAR_COLORS[Math.round(r.rating)]?.border || '#E2E8F0'}`,
            paddingLeft: 8,
            display: '-webkit-box',
            WebkitLineClamp: expanded ? 'unset' : 2,
            WebkitBoxOrient: 'vertical',
            overflow: expanded ? 'visible' : 'hidden',
            transition: 'all 0.25s ease',
          }}>
            {text}
          </div>
          {text.length > 120 && (
            <button onClick={() => setExpanded((e) => !e)} style={{
              marginTop: 4, background: 'none', border: 'none', padding: 0,
              fontSize: 11, fontWeight: 600, color: '#3B82F6', cursor: 'pointer',
            }}>
              {expanded ? 'View Less ↑' : 'View More ↓'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewsSection({ token, compact = false, allCompaniesMode = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [allReviews, setAllReviews] = useState([]);
  const [expanded, setExpanded] = useState(false); // true once user clicks Load More
  const INITIAL_LIMIT = 3;
  const MORE_LIMIT = 6;

  const fetchData = useCallback(async (p = 1, reset = true) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const acParam = allCompaniesMode ? "&allCompanies=true" : "";
      const res = await fetch(
        `${BASE}/api/company-portal/asset-queries/reviews?page=${p}&limit=${p === 1 ? INITIAL_LIMIT : MORE_LIMIT}${acParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData({
        totalReviews: Number(json.analytics?.total || 0),
        avgRating: Number(json.analytics?.avgRating || 0),
        distribution: json.analytics?.distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      });
      // Only keep reviews that have actual text
      const withText = (json.reviews || []).filter((r) => (r.reviewText || '').trim());
      setAllReviews((prev) => reset ? withText : [...prev, ...withText]);
    } catch { /* silent */ } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  }, [token, allCompaniesMode]);

  useEffect(() => { fetchData(1, true); setPage(1); }, [fetchData]);

  const loadMore = () => { setExpanded(true); const next = page + 1; setPage(next); fetchData(next, false); };
  const collapse = () => { setExpanded(false); setPage(1); fetchData(1, true); };

  const dist = data?.distribution || {};
  const totalRatings = data?.totalReviews || 0;   // all ratings (with or without text)
  const avgRating = data?.avgRating || 0;
  const posPct = totalRatings > 0 ? Math.round(((Number(dist[5] || 0) + Number(dist[4] || 0)) / totalRatings) * 100) : 0;
  const maxDistVal = Math.max(...[5, 4, 3, 2, 1].map((s) => Number(dist[s] || 0)), 1);
  const reviewCount = allReviews.length;           // only reviews with text
  const hasMore = data ? allReviews.length < totalRatings : false; // approximate upper bound

  // ── Compact mode: just rating summary card ──────────────────────────────
  if (compact) {
    return (
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Ratings &amp; Reviews</p>
        {loading && <div style={{ color: '#94a3b8', fontSize: '12px' }}>Loading…</div>}
        {!loading && (!data || totalRatings === 0) && (
          <>
            {[{ s: 5, w: '75%', filled: true }, { s: 4, w: '50%', filled: true }, { s: 3, w: '0%', filled: false }, { s: 2, w: '0%', filled: false }, { s: 1, w: '0%', filled: false }].map(({ s, w, filled }) => {
              const cfg = RR_STAR_COLORS[s];
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px', opacity: filled ? 0.55 : 0.25 }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', width: 7, textAlign: 'right' }}>{s}</span>
                  <svg width={9} height={9} viewBox="0 0 24 24" fill={filled ? cfg.fill : '#cbd5e1'} style={{ flexShrink: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                    {filled && <div style={{ height: '100%', width: w, background: cfg.fill, borderRadius: 4 }} />}
                  </div>
                </div>
              );
            })}
          </>
        )}
        {!loading && data && totalRatings > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '30px', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{avgRating.toFixed(1)}</span>
              <div>
                <StarDisplay rating={avgRating} size={13} />
                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{totalRatings} ratings · {posPct}% positive</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {[5, 4, 3, 2, 1].map(star => {
                const count = Number(dist[star] || 0);
                const pct = Math.round((count / maxDistVal) * 100);
                const cfg = RR_STAR_COLORS[star];
                return (
                  <div key={star} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', width: 7, textAlign: 'right' }}>{star}</span>
                    <svg width={9} height={9} viewBox="0 0 24 24" fill={cfg.fill} style={{ flexShrink: 0 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                    <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cfg.fill, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: '9px', color: '#94a3b8', width: 16, textAlign: 'right' }}>{count}</span>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#64748b', width: 26, textAlign: 'right', flexShrink: 0 }}>{totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0}%</span>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {/* Recent reviews in compact mode */}
        {!loading && data && totalRatings > 0 && allReviews.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px solid #f1f5f9', paddingTop: 8 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              Recent Reviews
            </div>
            {allReviews.slice(0, 3).map((r) => {
              const text = (r.reviewText || '').trim();
              const cfg = RR_STAR_COLORS[Math.min(5, Math.max(1, Math.round(r.rating)))];
              return (
                <div key={r.id} style={{ padding: '7px 8px', marginBottom: 5, borderRadius: 7, background: '#f8fafc', border: `1px solid ${cfg.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <UserAvatar name={r.reviewerName} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reviewerName || 'User'}</div>
                      <StarDisplay rating={r.rating} size={9} />
                      {allCompaniesMode && r.hospitalName && <div style={{ fontSize: '9px', color: '#6366f1', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.hospitalName}</div>}
                    </div>
                    <span style={{ fontSize: '9px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}</span>
                  </div>
                  {text && <div style={{ fontSize: '10.5px', color: '#475569', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', paddingLeft: 4, borderLeft: `2px solid ${cfg.border}` }}>{text}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <section style={{ margin: '20px 0 0' }}>
      <style>{`
        @keyframes rr-shimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}
        @keyframes rr-star-pop{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
        .rr-star-animated:hover{animation:rr-star-pop .25s ease}
        .rr-load-more-btn{transition:all .2s ease}
        .rr-load-more-btn:hover{background:#1D4ED8!important;transform:translateY(-2px);box-shadow:0 6px 20px rgba(37,99,235,.30)!important}
        .rr-load-more-btn:active{transform:translateY(0)}
        @media(max-width:860px){.rr-main-grid{grid-template-columns:1fr!important}.rr-summary-panel{position:static!important}}
        @media(max-width:600px){.rr-main-grid{grid-template-columns:1fr!important}}
      `}</style>

      {/* Section header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.3px' }}>Ratings &amp; Reviews</h2>
          <p style={{ fontSize: 11, color: '#94A3B8', margin: '2px 0 0', fontWeight: 500 }}>Customer satisfaction for closed service requests</p>
        </div>
        {!loading && totalRatings > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 20 }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="#16A34A"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#15803D' }}>{avgRating.toFixed(1)} · {totalRatings} ratings · {reviewCount} reviews · {posPct}% satisfied</span>
          </div>
        )}
      </div>

      {/* Skeleton */}
      {loading && (
        <div className="rr-main-grid" style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 14 }}>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SkeletonBlock width="55%" height={38} style={{ margin: '0 auto', borderRadius: 8 }} />
            <SkeletonBlock width="60%" height={12} style={{ margin: '0 auto' }} />
            {[1, 2, 3, 4, 5].map((i) => <SkeletonBlock key={i} height={7} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map((i) => <ReviewCardSkeleton key={i} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && (!data || totalRatings === 0) && (
        <div style={{ background: '#F8FAFC', borderRadius: 12, padding: '32px 20px', textAlign: 'center', border: '1px solid #E2E8F0' }}>
          <svg width={52} height={52} viewBox="0 0 80 80" fill="none" style={{ marginBottom: 10, opacity: 0.45 }}>
            <circle cx={40} cy={40} r={39} fill="#F1F5F9" stroke="#E2E8F0" strokeWidth={1.5} />
            <path d="M40 20l4.5 9.1 10.1 1.47-7.3 7.1 1.72 10.04L40 43.1l-9.02 4.73 1.72-10.04L25.4 30.57l10.1-1.47z" fill="#CBD5E1" />
          </svg>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#334155', marginBottom: 4 }}>No Reviews Yet</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>Reviews appear after users rate closed service requests.</div>
        </div>
      )}

      {/* Main grid */}
      {!loading && data && totalRatings > 0 && (
        <div className="rr-main-grid" style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 14, alignItems: 'start' }}>

          {/* ── Compact summary panel ── */}
          <div className="rr-summary-panel" style={{ background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.05)', position: 'sticky', top: 16 }}>

            {/* Score + stars + badge inline */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: 38, fontWeight: 900, color: '#0F172A', lineHeight: 1, letterSpacing: '-1px' }}>{avgRating.toFixed(1)}</div>
                <StarDisplay rating={avgRating} size={14} />
              </div>
              <div>
                <RatingBadge rating={avgRating} />
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4 }}>{totalRatings.toLocaleString()} ratings · {reviewCount} reviews</div>
                <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginTop: 2 }}>{posPct}% positive</div>
              </div>
            </div>

            {/* Star distribution — ultra compact */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = Number(dist[star] || 0);
                const pct = Math.round((count / maxDistVal) * 100);
                const cfg = RR_STAR_COLORS[star];
                return (
                  <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#64748B', width: 7, textAlign: 'right', flexShrink: 0 }}>{star}</span>
                    <svg width={10} height={10} viewBox="0 0 24 24" fill={cfg.fill} style={{ flexShrink: 0 }}>
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                    <div style={{ flex: 1, background: '#F1F5F9', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: cfg.fill, borderRadius: 4, transition: 'width 0.6s ease', opacity: 0.85 }} />
                    </div>
                    <span style={{ fontSize: 9, color: '#94A3B8', width: 18, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#64748B', width: 28, textAlign: 'right', flexShrink: 0 }}>{totalRatings > 0 ? Math.round((count / totalRatings) * 100) : 0}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Reviews list ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Subheader */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#64748B' }}>
                <strong style={{ color: '#0F172A' }}>{reviewCount}</strong> written {reviewCount === 1 ? 'review' : 'reviews'}
                <span style={{ color: '#CBD5E1' }}> · </span>
                <span style={{ color: '#94A3B8' }}>{totalRatings} total ratings</span>
              </span>
              <span style={{ fontSize: 10, color: '#94A3B8' }}>Most recent first</span>
            </div>

            {/* Review cards (text-only) */}
            {allReviews.length === 0 && (
              <div style={{ padding: '18px 14px', background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
                No written reviews yet — ratings are counted above.
              </div>
            )}
            {allReviews.map((r) => <ReviewCard key={r.id} r={r} />)}

            {/* Loading-more skeletons */}
            {loadingMore && [1, 2, 3].map((i) => <ReviewCardSkeleton key={`sk-more-${i}`} />)}

            {/* Load More / Show Less */}
            {!loadingMore && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {hasMore && (
                  <button className="rr-load-more-btn" onClick={loadMore} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 22px', borderRadius: 50,
                    background: '#2563EB', color: '#fff', border: 'none',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(37,99,235,0.22)',
                  }}>
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}><polyline points="6 9 12 15 18 9" /></svg>
                    Load More Reviews
                  </button>
                )}
                {expanded && (
                  <button onClick={collapse} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 22px', borderRadius: 50,
                    background: '#fff', color: '#64748B',
                    border: '1px solid #E2E8F0',
                    fontWeight: 700, fontSize: 12, cursor: 'pointer',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    transition: 'all .2s ease',
                  }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#94A3B8'; e.currentTarget.style.color = '#0F172A'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B'; }}
                  >
                    <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><polyline points="18 15 12 9 6 15" /></svg>
                    Show Less
                  </button>
                )}
              </div>
            )}

            {/* All loaded divider (only if not expanded / no more to load) */}
            {!hasMore && !expanded && allReviews.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
                <span style={{ fontSize: 10, color: '#94A3B8', whiteSpace: 'nowrap' }}>All {reviewCount} reviews shown</span>
                <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export default function HealthcareDashboard({ token, onOpenAsset, onTileNavigate, externalRefreshKey, allCompaniesMode = false }) {
  const EMPTY_FILTERS = { dateFrom: "", dateTo: "", departmentId: "", assetCategory: "", location: "", status: "", criticality: "", search: "" };

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setApplied] = useState(EMPTY_FILTERS);
  const [snapshot, setSnapshot] = useState(null);
  const [charts, setCharts] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ departments: [], categories: [], locations: [] });
  const [snapLoading, setSnapL] = useState(false);
  const [showCostPopup, setShowCostPopup] = useState(false);  // cost breakdown popup
  const [snapError, setSnapE] = useState(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [activeKpiKey, setActiveKpiKey] = useState(null);   // which tile is highlighted
  const [activeComplaintKey, setActiveComplaintKey] = useState(null); // complaint tile clicked
  const [complaintRequests, setComplaintRequests] = useState([]);
  const [complaintLoading, setComplaintLoading] = useState(false);
  const [exportDDOpen, setExportDDOpen] = useState(false);
  const [pmsStats, setPmsStats] = useState(null);
  const [pmsLoading, setPmsLoading] = useState(false);
  const [pmsOverdueItems, setPmsOverdue] = useState([]);
  const [overdueExpanded, setOverdueExp] = useState(false);
  const [ojtStats, setOjtStats] = useState(null);
  const [ojtLoading, setOjtLoading] = useState(false);
  const [activeProfileKpi, setActiveProfileKpi] = useState(null);
  const [activeCalibrationKpi, setActiveCalibrationKpi] = useState(null);
  const [activeTrainingKpi, setActiveTrainingKpi] = useState(null);
  const complaintPanelRef = useRef(null); // scroll target for complaint drilldown panel
  // Map KPI key → { tab, kpiFilter, label }
  const KPI_FILTER_MAP = {
    pmsTotalAssets: { tab: "pms", kpiFilter: null, label: "All PMS" },
    pmsOverdueAssets: { tab: "pms", kpiFilter: "overdue", label: "PMS Overdue" },
    pmsUpcomingAssets: { tab: "pms", kpiFilter: "upcoming", label: "PMS Upcoming (30D)" },
    pmsCompletedAssets: { tab: "pms", kpiFilter: "completed", label: "PMS Completed" },
    calibrationDueThisMonth: { tab: "calibration", kpiFilter: "due_this_month", label: "Calibration Due This Month" },
    calibrationOverdue: { tab: "calibration", kpiFilter: "overdue", label: "Calibration Overdue" },
    calibrationUpcoming: { tab: "calibration", kpiFilter: "upcoming", label: "Calibration Upcoming (30D)" },
    calibrationCompletedThisMonth: { tab: "calibration", kpiFilter: "completed_this_month", label: "Calibration Completed This Month" },
    tTotal: { tab: "training", kpiFilter: null, label: "All Training" },
    tScheduled: { tab: "training", kpiFilter: "scheduled", label: "Training Scheduled" },
    tCompleted: { tab: "training", kpiFilter: "completed", label: "Training Completed" },
    tOverdue: { tab: "training", kpiFilter: "overdue", label: "Training Overdue" },
  };
  const [activeKpiMeta, setActiveKpiMeta] = useState(null);
  const [perfKpis, setPerfKpis] = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);
  // SLA metrics moved to the dedicated SLA Dashboard (SlaDashboard.jsx)

  /* Load snapshot KPIs */
  const loadSnapshot = useCallback(async (force = false) => {
    // Skip if data is fresh (< 60 s) unless forced or no data yet
    if (!force && snapshot && Date.now() - _hcLastFetch < HC_STALE_MS) return;
    // Claim this request slot — any older in-flight fetch will see its reqId !== _hcReqId and bail out
    const reqId = ++_hcReqId;
    _hcLastFetch = Date.now();
    // Clear stale data immediately so old company's numbers never linger
    setSnapshot(null); setCharts(null); setSnapL(true); setSnapE(null);
    try {
      if (allCompaniesMode) {
        const snap = await hcFetch('/aggregate-snapshot', token);
        if (reqId !== _hcReqId) return; // superseded — discard
        setSnapshot(snap);
        // Populate charts with dept criticality from the aggregate response
        setCharts(snap.criticalityByDept?.length ? { criticalityByDept: snap.criticalityByDept } : null);
      } else {
        const qs = buildQS(appliedFilters);
        const [snap, ch] = await Promise.all([
          hcFetch(`/snapshot${qs}`, token),
          hcFetch(`/charts${qs}`, token),
        ]);
        if (reqId !== _hcReqId) return; // superseded — discard
        setSnapshot(snap);
        setCharts(ch);
      }
    } catch (e) {
      if (reqId !== _hcReqId) return;
      setSnapE(e.message);
    }
    setSnapL(false);
  }, [token, appliedFilters, allCompaniesMode]);

  useEffect(() => { loadSnapshot(true); }, [loadSnapshot, refreshKey, externalRefreshKey, allCompaniesMode]);

  // When company scope changes, reset all filters, drilldowns and active tile states
  useEffect(() => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setActiveKpiKey(null);
    setActiveComplaintKey(null);
    setComplaintRequests([]);
    _hcLastFetch = 0; // force fresh fetch regardless of cache age
    // NOTE: do NOT reset _hcReqId here — resetting would allow the old in-flight fetch
    // to share the same reqId as the new one, defeating the stale-response guard.
    // The counter must only ever increment so old reqIds are always < current.
  }, [allCompaniesMode, token]);

  // Load PMS dashboard stats + overdue details
  useEffect(() => {
    if (!token) return;
    setPmsLoading(true);
    // Only aggregate across all hospitals in All-Hospitals mode; otherwise scope
    // to the currently-selected hospital so counts don't leak between hospitals.
    const scope = allCompaniesMode ? "?allCompanies=true" : "";
    Promise.all([
      fetch(`${BASE}/api/company-portal/pms/dashboard-stats${scope}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${BASE}/api/company-portal/pms/overdue-details${scope}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([stats, overdue]) => {
      if (stats) setPmsStats(stats);
      setPmsOverdue(Array.isArray(overdue) ? overdue : []);
    }).finally(() => setPmsLoading(false));
  }, [token, allCompaniesMode, refreshKey]);

  // Load Training session stats
  useEffect(() => {
    if (!token) return;
    setOjtLoading(true);
    fetch(`${BASE}/api/company-portal/training/sessions?from=2020-01-01&to=2030-12-31`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(rows => {
        if (!rows) return;
        const data = Array.isArray(rows.data) ? rows.data : (Array.isArray(rows) ? rows : []);
        const today = new Date().toISOString().slice(0, 10);
        const total = data.length;
        const scheduled = data.filter(t => t.status === "scheduled").length;
        const completed = data.filter(t => t.status === "completed").length;
        const overdue = data.filter(t => t.status === "overdue" || (t.status === "scheduled" && (t.training_date || "").slice(0, 10) < today)).length;
        setOjtStats({ total, scheduled, completed, overdue });
      })
      .catch(() => { })
      .finally(() => setOjtLoading(false));
  }, [token, refreshKey]);

  // Load Performance KPIs
  useEffect(() => {
    if (!token) return;
    setPerfLoading(true);
    const scope = allCompaniesMode ? "?allCompanies=true" : "";
    fetch(`${BASE}/api/company-portal/healthcare/performance-kpis${scope}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPerfKpis(d); })
      .catch(() => { })
      .finally(() => setPerfLoading(false));
  }, [token, allCompaniesMode, refreshKey]);

  // SLA dashboard data now lives in the dedicated SLA Dashboard (SlaDashboard.jsx)

  // Load filter options (departments, categories, locations) for the filter panel
  useEffect(() => {
    if (!token || allCompaniesMode) return;
    hcFetch('/filter-options', token)
      .then(d => { if (d) setFilterOptions(d); })
      .catch(() => { });
  }, [token, allCompaniesMode]);
  const handleReset = () => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); };

  const handleApply = () => { setApplied({ ...filters }); };
  useEffect(() => {
    const timer = setTimeout(() => {
      setApplied(prev => ({ ...prev, search: filters.search }));
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  // Click a KPI tile: keep only active visual state.
  const handleTileClick = (k) => {
    if (activeKpiKey === k.key) {
      setActiveKpiKey(null);
      onTileNavigate?.(null, {});
    } else {
      setActiveKpiKey(k.key);
      onTileNavigate?.(k.key, k.filterData || {});
    }
  };

  const doExport = (extraFilters, type) => {
    const qs = buildQS({ ...appliedFilters, ...extraFilters, type });
    hcDownload(`/export${qs}`, token, `healthcare-export-${type}-${new Date().toISOString().slice(0, 10)}.xlsx`)
      .catch(e => alert(`Export failed: ${e.message}`));
  };

  // Complaint tile click: load matching requests from company portal API
  const handleComplaintTileClick = async (key) => {
    if (activeComplaintKey === key) {
      setActiveComplaintKey(null);
      setComplaintRequests([]);
      return;
    }
    setActiveComplaintKey(key);
    setComplaintLoading(true);
    setComplaintRequests([]);
    try {
      let url = `${BASE}/api/company-portal/asset-queries?limit=500`;
      if (key === "wipComplaints" || key === "wipLt7" || key === "wipGt7") url += "&status=wip,in_progress";
      else if (key === "resolvedComplaints") url += "&status=resolved";
      else if (key === "closedComplaints") url += "&status=closed";
      if (allCompaniesMode) url += "&allCompanies=true";
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      let rows = Array.isArray(data) ? data : (Array.isArray(data.data) ? data.data : []);
      // Apply day filter for wipLt7/wipGt7
      if (key === "wipLt7") rows = rows.filter(r => { const d = Math.floor((Date.now() - new Date(r.createdAt || r.created_at).getTime()) / 86400000); return d < 7; });
      if (key === "wipGt7") rows = rows.filter(r => { const d = Math.floor((Date.now() - new Date(r.createdAt || r.created_at).getTime()) / 86400000); return d >= 7; });
      setComplaintRequests(rows);
    } catch (e) {
      setComplaintRequests([]);
    }
    setComplaintLoading(false);
    setTimeout(() => complaintPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  const KPI_LIST = [
    { key: "total", label: "Total Assets", icon: Icon.Total, color: "blue", filterData: {}, animation: "blink-dot 1s ease-in-out infinite" },
    { key: "critical", label: "Critical", icon: Icon.Critical, color: "red", filterData: { criticality: "Critical" } },
    { key: "nonCritical", label: "Non-Critical", icon: Icon.NonCritical, color: "teal", filterData: { criticality: "Non_Critical" } },
    { key: "verified", label: "Verified", icon: Icon.Working, color: "green", filterData: { verified: "1" } },
    { key: "rber", label: "RBER", icon: Icon.Rber, color: "orange", filterData: { rber: "1" } },
  ];

  // Helper to format currency amounts
  const fmtCurrency = (v) => {
    const n = Number(v || 0);
    if (n >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
    if (n >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
    if (n >= 1000) return `₹${n.toLocaleString('en-IN')}`;
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  return (
    <div style={{ padding: "6px 0 24px", maxWidth: "1400px", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Error state */}
      {snapError && <ErrorState message={snapError} onRetry={loadSnapshot} />}

      {/* All Companies banner */}
      {allCompaniesMode && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", background: "#ede9fe", border: "1px solid #ddd6fe", borderRadius: "10px", marginBottom: "12px" }}>
          <span style={{ fontSize: "15px" }}>🌐</span>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#3730a3" }}>All Hospitals View</span>
          <span style={{ fontSize: "11px", color: "#6d28d9", marginLeft: "4px" }}>— aggregated data across all your accessible hospitals</span>
        </div>
      )}

      {/* Advanced Filters — only shown in single-hospital mode */}
      {false && !allCompaniesMode && (
        <FiltersPanel
          filters={filters}
          setFilters={setFilters}
          filterOptions={filterOptions}
          onApply={handleApply}
          onReset={handleReset}
        />
      )}

      {/* ── ASSET SNAPSHOT KPI CARDS ── */}
      <section style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 8px" }}>
          Asset Profile
          <span style={{ fontSize: "11px", fontWeight: 400, color: "#94a3b8", marginLeft: "8px", textTransform: "none", letterSpacing: 0 }}>Live count from database</span>
        </h2>
        {/* Same 2fr 1fr structure as Complaint Profile → Equipment Health = same width as Ratings & Reviews */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px", alignItems: "stretch" }}>

          {/* LEFT: 6 KPI tiles in 3×2 nested grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
            {KPI_LIST.slice(0, 3).map(k => (
              <KpiCard
                key={k.key}
                label={k.label}
                value={snapshot?.[k.key]}
                icon={k.icon}
                color={k.color}
                loading={snapLoading}
                isActive={activeKpiKey === k.key}
                onClick={() => handleTileClick(k)}
              />
            ))}
            {/* Total Asset Value tile — 4th position, opens cost breakdown popup */}
            <div
              onClick={() => setShowCostPopup(true)}
              style={{
                background: "#fff", borderRadius: "10px", border: "1px solid #ddd6fe",
                padding: "4px 6px 3px", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: "2px",
                minHeight: "44px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", textAlign: "center",
                cursor: "pointer", transition: "all 0.15s ease", position: "relative",
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 14px #ddd6fe"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                <div style={{ width: "14px", height: "14px", background: "#ede9fe", borderRadius: "3px", display: "flex", alignItems: "center", justifyContent: "center", color: "#7c3aed", flexShrink: 0 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </div>
                <p style={{ fontSize: "9px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0, lineHeight: 1.2, textAlign: "left" }}>Total Asset Value</p>
              </div>
              <p style={{ fontSize: "14px", fontWeight: 900, color: "#7c3aed", margin: 0, lineHeight: 1, letterSpacing: "-0.3px" }}>
                {snapLoading ? "—" : fmtCurrency(snapshot?.totalAssetValue)}
              </p>
              <span style={{ fontSize: "8px", color: "#a78bfa", marginTop: "1px" }}>tap for breakdown ▼</span>
            </div>
            {KPI_LIST.slice(3).map(k => (
              <KpiCard
                key={k.key}
                label={k.label}
                value={snapshot?.[k.key]}
                icon={k.icon}
                color={k.color}
                loading={snapLoading}
                isActive={activeKpiKey === k.key}
                onClick={() => handleTileClick(k)}
              />
            ))}
          </div>

          {/* RIGHT: Equipment Health card — same column width as Ratings & Reviews */}
          <div style={{
            background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
            padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            display: "flex", flexDirection: "column", justifyContent: "center",
          }}>
            <p style={{ fontSize: "11px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 12px", textAlign: "center" }}>Equipment Health Status</p>
            <EquipmentHealthChart statuses={[
              { name: "Working", value: snapshot?.working || 0, color: "#16a34a" },
              { name: "WIP", value: snapshot?.wip || 0, color: "#ca8a04" },
              { name: "Not Working", value: snapshot?.notWorking || 0, color: "#dc2626" },
              { name: "HNF", value: snapshot?.hnf || 0, color: "#0d9488" },
              { name: "RBER", value: snapshot?.rber || 0, color: "#ea580c" },
              { name: "Condemned", value: snapshot?.condemned || 0, color: "#7c3aed" },
            ]} />
          </div>
        </div>

        {/* Cost Breakdown Popup */}
        {showCostPopup && (
          <div
            onClick={() => setShowCostPopup(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: "14px", padding: "20px 24px", minWidth: "300px", maxWidth: "380px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#3730a3", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total Asset Value</div>
                  <div style={{ fontSize: "22px", fontWeight: 900, color: "#7c3aed", marginTop: "2px" }}>{snapLoading ? "—" : `₹${Number(snapshot?.totalAssetValue || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}</div>
                </div>
                <button onClick={() => setShowCostPopup(false)} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "10px" }}>Purchase cost by maintenance type</div>
              {[
                { label: "High End Equipment", value: snapshot?.highEndCost, color: "#7c3aed", bg: "#ede9fe" },
                { label: "Under Catalyst", value: snapshot?.catalystCost, color: "#0891b2", bg: "#e0f2fe" },
                { label: "Under Warranty", value: snapshot?.warrantyCost, color: "#16a34a", bg: "#dcfce7" },
                { label: "Under AMC", value: snapshot?.amcCost, color: "#dc2626", bg: "#fee2e2" },
                { label: "Under CMC", value: snapshot?.cmcCost, color: "#ea580c", bg: "#fff7ed" },
                { label: "Under Client", value: snapshot?.clientCost, color: "#6366f1", bg: "#eef2ff" },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #f1f5f9" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: row.color, display: "inline-block" }} />
                    <span style={{ fontSize: "13px", color: "#475569" }}>{row.label}</span>
                  </span>
                  <span style={{ fontWeight: 800, fontSize: "14px", color: row.color }}>{snapLoading ? "—" : `₹${Number(row.value || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Complaint Profile row — 2-col with compact reviews panel */}
        <div style={{ marginTop: "14px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>Complaint Profile</h2>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "8px", alignItems: "stretch" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
              {[
                { key: "totalComplaints", label: "Total Complaint", icon: ComplaintIcon.Total, color: "blue", value: snapshot?.totalComplaints },
                { key: "wipComplaints", label: "Work in Progress", icon: ComplaintIcon.Wip, color: "yellow", value: snapshot?.wipComplaints },
                { key: "wipLt7", label: "< 7 Days", icon: ComplaintIcon.Lt7, color: "green", value: snapshot?.wipLt7 },
                { key: "wipGt7", label: "> 7 Days", icon: ComplaintIcon.Gt7, color: "red", value: snapshot?.wipGt7 },
                { key: "resolvedComplaints", label: "Resolved", icon: ComplaintIcon.Resolved, color: "teal", value: snapshot?.resolvedComplaints },
                { key: "closedComplaints", label: "Closed", icon: ComplaintIcon.Closed, color: "purple", value: snapshot?.closedComplaints },
              ].map(k => (
                <KpiCard
                  key={k.key}
                  label={k.label}
                  value={k.value}
                  icon={k.icon}
                  color={k.color}
                  loading={snapLoading}
                  isActive={activeComplaintKey === k.key}
                  onClick={() => handleComplaintTileClick(k.key)}
                />
              ))}
            </div>
            {/* Compact Ratings & Reviews panel */}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <ReviewsSection token={token} compact allCompaniesMode={allCompaniesMode} />
            </div>
          </div>
        </div>

        {/* Asset tile drill-down — shown when an asset KPI tile is clicked */}
        {activeKpiKey && (
          <div style={{ marginTop: "14px" }}>
            <DashboardAssetTable
              token={token}
              filters={{ ...filters, kpiKey: activeKpiKey }}
              tileLabel={KPI_LIST.find(k => k.key === activeKpiKey)?.label || activeKpiKey}
              onClearTile={() => setActiveKpiKey(null)}
              onOpenAsset={onOpenAsset}
            />
          </div>
        )}

        {/* Complaint requests panel — shown when a complaint tile is clicked */}
        {activeComplaintKey && (
          <div ref={complaintPanelRef} style={{ marginTop: "14px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: "13.5px", color: "#0f172a" }}>
                {{ totalComplaints: "All Complaints", wipComplaints: "Work In Progress", wipLt7: "WIP < 7 Days", wipGt7: "WIP ≥ 7 Days", resolvedComplaints: "Resolved Complaints", closedComplaints: "Closed Complaints" }[activeComplaintKey]}
                {!complaintLoading && <span style={{ marginLeft: "8px", fontWeight: 400, color: "#64748b", fontSize: "12px" }}>({complaintRequests.length} records)</span>}
              </span>
              <button onClick={() => { setActiveComplaintKey(null); setComplaintRequests([]); }}
                style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "12px", color: "#64748b" }}>✕ Close</button>
            </div>
            {complaintLoading ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>Loading…</div>
            ) : complaintRequests.length === 0 ? (
              <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No complaints found for this category.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["#", ...(allCompaniesMode ? ["Hospital"] : []), "Asset", "Asset ID", "Request ID", "Request Title", "Status", "Priority", "Department", "Raised By", "Date"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#475569", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {complaintRequests.map((r, i) => {
                      const statusColors = { open: "#fee2e2", resolved: "#dcfce7", closed: "#f1f5f9", wip: "#dbeafe", in_progress: "#dbeafe" };
                      const statusText = { open: "#dc2626", resolved: "#16a34a", closed: "#475569", wip: "#1d4ed8", in_progress: "#1d4ed8" };
                      const st = (r.status || "open").toLowerCase();
                      return (
                        <tr key={r.id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 12px", color: "#94a3b8" }}>{i + 1}</td>
                          {allCompaniesMode && <td style={{ padding: "8px 12px", fontSize: "11px", color: "#6366f1", fontWeight: 600 }}>{r.companyName || "—"}</td>}
                          <td style={{ padding: "8px 12px", color: "#0f172a", fontWeight: 600 }}>{r.assetName || r.asset_name || "—"}</td>
                          <td style={{ padding: "8px 12px" }}>
                            {(r.assetUniqueId || r.asset_unique_id) ? (
                              <button onClick={() => r.assetId && onOpenAsset && onOpenAsset({ id: r.assetId })}
                                style={{ fontFamily: "monospace", fontSize: "11.5px", color: "#2563eb", background: "#eff6ff", border: "none", padding: "1px 7px", borderRadius: "4px", cursor: r.assetId ? "pointer" : "default", textDecoration: r.assetId ? "underline" : "none", fontWeight: 700 }}>
                                {r.assetUniqueId || r.asset_unique_id}
                              </button>
                            ) : <span style={{ color: "#94a3b8" }}>—</span>}
                          </td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ fontFamily: "monospace", fontSize: "11.5px", color: "#7c3aed", background: "#faf5ff", padding: "1px 7px", borderRadius: "4px", fontWeight: 700 }}>
                              AQ-{r.id}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", color: "#334155" }}>{r.title || r.description || "—"}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ background: statusColors[st] || "#f1f5f9", color: statusText[st] || "#475569", padding: "2px 8px", borderRadius: "12px", fontSize: "11.5px", fontWeight: 700 }}>
                              {st.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{r.priority || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{r.departmentName || r.department_name || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{r.raisedByName || r.raised_by_name || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{r.createdAt || r.created_at ? new Date(r.createdAt || r.created_at).toLocaleDateString("en-IN") : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── KPI Asset Panel — removed; replaced by always-visible table below filters ── */}

        {/* ── KPI & PERFORMANCE ── */}
        <div style={{ marginTop: "20px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>KPI &amp; Performance Meter</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {[
              { label: "Equipment Up Time", value: perfKpis?.equipmentUpTime != null ? `${perfKpis.equipmentUpTime}%` : null, color: "green", icon: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg> },
              { label: "PM Compliance", value: perfKpis?.pmCompliance != null ? `${perfKpis.pmCompliance}%` : null, color: "blue", icon: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg> },
              { label: "Equipment Availability", value: perfKpis?.equipmentAvail != null ? `${perfKpis.equipmentAvail}%` : null, color: "teal", icon: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg> },
              { label: "SLA Compliance", value: perfKpis?.slaCompliance != null ? `${perfKpis.slaCompliance}%` : null, color: "purple", icon: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> },
              { label: "MTTR", value: perfKpis?.mttrHours != null ? `${perfKpis.mttrHours} Hrs` : null, color: "orange", icon: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> },
              { label: "MTBF", value: perfKpis?.mtbfDays != null ? `${perfKpis.mtbfDays} days` : null, color: "yellow", icon: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> },
            ].map(k => (
              <KpiCard
                key={k.label}
                label={k.label}
                value={k.value ?? "—"}
                icon={k.icon}
                color={k.color}
                loading={perfLoading}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── PMS OVERDUE ALERT BANNER ── */}
      {pmsOverdueItems.length > 0 && (
        <section style={{ marginBottom: "16px" }}>
          <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: "14px", overflow: "hidden" }}>
            {/* Banner header */}
            <button
              onClick={() => setOverdueExp(p => !p)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px",
                background: "none", border: "none", cursor: "pointer", textAlign: "left"
              }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: "32px", height: "32px", borderRadius: "50%", background: "#dc2626", flexShrink: 0
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "14px", fontWeight: 800, color: "#991b1b" }}>
                  {pmsOverdueItems.length} Overdue PMS {pmsOverdueItems.length === 1 ? "Task" : "Tasks"} Require Attention
                </div>
                <div style={{ fontSize: "12px", color: "#b91c1c", marginTop: "1px" }}>
                  Preventive maintenance was not completed on the scheduled date.{" "}
                  {!overdueExpanded ? "Click to view details." : ""}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5"
                style={{ transform: overdueExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {/* Expandable detail table */}
            {overdueExpanded && (
              <div style={{ borderTop: "1px solid #fca5a5", overflowX: "auto", maxHeight: "300px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#fee2e2", position: "sticky", top: 0 }}>
                      {["Asset", "Department", "Hospital", "Schedule", "Due Date", "Days Overdue", "Engineer"].map(h => (
                        <th key={h} style={{
                          padding: "9px 14px", textAlign: "left", fontSize: "11px",
                          fontWeight: 700, color: "#991b1b", textTransform: "uppercase", whiteSpace: "nowrap"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pmsOverdueItems.map((item, i) => (
                      <tr key={item.psaId || i}
                        style={{ background: i % 2 === 0 ? "#fff" : "#fff7f7", borderBottom: "1px solid #fee2e2" }}>
                        <td style={{ padding: "9px 14px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>
                          {item.assetName}
                          {item.assetCode && <span style={{
                            marginLeft: "6px", fontSize: "11px",
                            background: "#fef2f2", color: "#dc2626", padding: "1px 6px", borderRadius: "4px", fontFamily: "monospace"
                          }}>
                            {item.assetCode}
                          </span>}
                        </td>
                        <td style={{ padding: "9px 14px", color: "#475569" }}>{item.departmentName || "—"}</td>
                        <td style={{ padding: "9px 14px", color: "#475569" }}>{item.companyName || "—"}</td>
                        <td style={{ padding: "9px 14px", fontFamily: "monospace", fontSize: "12px", color: "#64748b" }}>
                          {item.scheduleNumber || "—"}
                        </td>
                        <td style={{ padding: "9px 14px", color: "#dc2626", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {item.maintenanceDate ? String(item.maintenanceDate).slice(0, 10) : "—"}
                        </td>
                        <td style={{ padding: "9px 14px", textAlign: "center" }}>
                          <span style={{
                            display: "inline-block", background: "#dc2626", color: "#fff",
                            padding: "2px 10px", borderRadius: "100px", fontSize: "12px", fontWeight: 700
                          }}>
                            {item.daysOverdue}d
                          </span>
                        </td>
                        <td style={{ padding: "9px 14px", color: "#475569" }}>{item.engineerName || <em style={{ color: "#94a3b8" }}>Unassigned</em>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── PMS PROFILE ── */}
      <section style={{ marginBottom: "20px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>PMS Scheduler</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {[
            { key: "pmsTotalAssets", label: "Total PMS Assets", icon: Icon.Pms, color: "orange", value: pmsStats?.totalAssetsInPms, kpiFilter: null },
            { key: "pmsOverdueAssets", label: "Assets Overdue", icon: Icon.Pms, color: "red", value: pmsStats?.overdueAssets, kpiFilter: "overdue" },
            { key: "pmsUpcomingAssets", label: "Assets Upcoming (30D)", icon: Icon.Pms, color: "blue", value: pmsStats?.upcoming30dAssets, kpiFilter: "upcoming" },
            { key: "pmsCompletedAssets", label: "Total Completed", icon: Icon.Pms, color: "green", value: pmsStats?.totalCompletedAssets, kpiFilter: "completed" },
          ].map(k => (
            <KpiCard
              key={k.key}
              label={k.label}
              value={k.value}
              icon={k.icon}
              color={k.color}
              loading={pmsLoading}
              isActive={activeProfileKpi === k.key}
              onClick={() => {
                const next = activeProfileKpi === k.key ? null : k.key;
                setActiveProfileKpi(next);
                if (next) {
                  setActiveKpiMeta({ tab: "pms", kpiFilter: k.kpiFilter, label: KPI_FILTER_MAP[k.key]?.label || k.label });
                } else {
                  setActiveKpiMeta(null);
                }
              }}
            />
          ))}
        </div>
      </section>

      {/* ── CALIBRATION PROFILE ── */}
      <section style={{ marginBottom: "20px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>Calibration Planner</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {[
            { key: "calibrationDueThisMonth", label: "Assets Due This Month", icon: Icon.Calibration, color: "orange", value: snapshot?.calibrationDueThisMonth, kpiFilter: "due_this_month" },
            { key: "calibrationOverdue", label: "Assets Overdue", icon: Icon.Calibration, color: "red", value: snapshot?.calibrationOverdue, kpiFilter: "overdue" },
            { key: "calibrationUpcoming", label: "Assets Upcoming (30D)", icon: Icon.Calibration, color: "blue", value: snapshot?.calibrationUpcoming, kpiFilter: "upcoming" },
            { key: "calibrationCompletedThisMonth", label: "Assets Completed This Month", icon: Icon.Calibration, color: "green", value: snapshot?.calibrationCompletedThisMonth, kpiFilter: "completed_this_month" },
          ].map(k => (
            <KpiCard
              key={k.key}
              label={k.label}
              value={k.value}
              icon={k.icon}
              color={k.color}
              loading={snapLoading}
              isActive={activeCalibrationKpi === k.key}
              onClick={() => {
                const next = activeCalibrationKpi === k.key ? null : k.key;
                setActiveCalibrationKpi(next);
                if (next) {
                  setActiveKpiMeta({ tab: "calibration", kpiFilter: k.kpiFilter, label: KPI_FILTER_MAP[k.key]?.label || k.label });
                } else {
                  setActiveKpiMeta(null);
                }
              }}
            />
          ))}
        </div>
      </section>

      {/* ── TRAINING RECORDS ── */}
      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>Training Records</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {[
            { key: "tTotal", label: "Total Sessions", icon: Icon.Training, color: "blue", value: ojtStats?.total, kpiFilter: null },
            { key: "tScheduled", label: "Scheduled", icon: Icon.Training, color: "teal", value: ojtStats?.scheduled, kpiFilter: "scheduled" },
            { key: "tCompleted", label: "Completed", icon: Icon.Training, color: "green", value: ojtStats?.completed, kpiFilter: "completed" },
            { key: "tOverdue", label: "Overdue", icon: Icon.Training, color: "red", value: ojtStats?.overdue, kpiFilter: "overdue" },
          ].map(k => (
            <KpiCard
              key={k.key}
              label={k.label}
              value={k.value}
              icon={k.icon}
              color={k.color}
              loading={ojtLoading}
              isActive={activeTrainingKpi === k.key}
              onClick={() => {
                const next = activeTrainingKpi === k.key ? null : k.key;
                setActiveTrainingKpi(next);
                if (next) {
                  setActiveKpiMeta({ tab: "training", kpiFilter: k.kpiFilter, label: KPI_FILTER_MAP[k.key]?.label || k.label });
                } else {
                  setActiveKpiMeta(null);
                }
              }}
            />
          ))}
        </div>
      </section>


      {/* ── KPI Records drilldown modal (PMS / Calibration / Training) ── */}
      {activeKpiMeta && (
        <KpiRecordsModal
          meta={activeKpiMeta}
          token={token}
          globalFilters={appliedFilters}
          allCompaniesMode={allCompaniesMode}
          onClose={() => {
            setActiveKpiMeta(null);
            setActiveProfileKpi(null);
            setActiveCalibrationKpi(null);
            setActiveTrainingKpi(null);
          }}
        />
      )}
    </div>
  );
}