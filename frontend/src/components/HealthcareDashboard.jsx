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
function PieChart({ data, size = 200 }) {
  const filtered = (data || []).filter(d => d.value > 0);
  const total = filtered.reduce((s, d) => s + d.value, 0);
  if (!total || filtered.length === 0) return <EmptyState small />;

  const PIE_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6", "#14b8a6"];
  const r = size / 2 - 14;
  const cx = size / 2, cy = size / 2;

  // Build slices; if single slice, draw full circle
  let slices = [];
  if (filtered.length === 1) {
    slices = [{ path: null, fullCircle: true, color: PIE_COLORS[0], label: filtered[0].name, value: filtered[0].value, pct: 1 }];
  } else {
    let cumulative = 0;
    slices = filtered.map((d, i) => {
      const pct = d.value / total;
      const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
      cumulative += pct;
      const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
      const x1 = cx + r * Math.cos(startAngle), y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle),   y2 = cy + r * Math.sin(endAngle);
      const large = pct > 0.5 ? 1 : 0;
      return { path: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`, color: PIE_COLORS[i % PIE_COLORS.length], label: d.name, value: d.value, pct };
    });
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

function BarChart({ data, height = 200, onBarClick }) {
  if (!data || data.length === 0) return <EmptyState small />;
  const maxVal = Math.max(...data.flatMap(d => [d.critical, d.nonCritical]), 1);

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", minWidth: `${data.length * 70}px`, height: `${height}px`, padding: "8px 0" }}>
        {data.map((d, i) => {
          const critH = (d.critical / maxVal) * (height - 50);
          const nonCritH = (d.nonCritical / maxVal) * (height - 50);
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flex: 1, minWidth: "56px" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: `${height - 50}px` }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  {d.critical > 0 && <span style={{ fontSize: "9px", fontWeight: 700, color: "#ef4444", marginBottom: "2px" }}>{d.critical}</span>}
                  <div
                    title={`Critical: ${d.critical} — click to view assets`}
                    onClick={() => onBarClick && d.critical > 0 && onBarClick(d.dept, "Critical", d.deptId)}
                    style={{ width: "14px", background: "linear-gradient(180deg,#f87171,#ef4444)", borderRadius: "3px 3px 0 0", height: `${critH}px`, minHeight: d.critical ? "3px" : "0", cursor: onBarClick && d.critical > 0 ? "pointer" : "default", transition: "opacity 0.12s" }}
                    onMouseEnter={e => { if (onBarClick && d.critical > 0) e.target.style.opacity = "0.7"; }}
                    onMouseLeave={e => { e.target.style.opacity = "1"; }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  {d.nonCritical > 0 && <span style={{ fontSize: "9px", fontWeight: 700, color: "#3b82f6", marginBottom: "2px" }}>{d.nonCritical}</span>}
                  <div
                    title={`Non-Critical: ${d.nonCritical} — click to view assets`}
                    onClick={() => onBarClick && d.nonCritical > 0 && onBarClick(d.dept, "Non_Critical", d.deptId)}
                    style={{ width: "14px", background: "linear-gradient(180deg,#60a5fa,#3b82f6)", borderRadius: "3px 3px 0 0", height: `${nonCritH}px`, minHeight: d.nonCritical ? "3px" : "0", cursor: onBarClick && d.nonCritical > 0 ? "pointer" : "default", transition: "opacity 0.12s" }}
                    onMouseEnter={e => { if (onBarClick && d.nonCritical > 0) e.target.style.opacity = "0.7"; }}
                    onMouseLeave={e => { e.target.style.opacity = "1"; }}
                  />
                </div>
              </div>
              <div style={{ fontSize: "10px", color: "#64748b", textAlign: "center", wordBreak: "break-all", lineHeight: 1.2, maxWidth: "56px" }}>{d.dept}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "8px" }}>
        {[["linear-gradient(180deg,#f87171,#ef4444)","Critical (click to drill down)"],["linear-gradient(180deg,#60a5fa,#3b82f6)","Non-Critical (click to drill down)"]].map(([grad, lbl]) => (
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
        gap: "5px",
        minHeight: "80px",
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
        <div style={{ width: "22px", height: "22px", background: c.bg, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", color: c.icon, flexShrink: 0 }}>
          <IconComp />
        </div>
        <p style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0, lineHeight: 1.2, textAlign: "left" }}>{label}</p>
      </div>
      <div>
        {loading ? (
          <div style={{ width: "40px", height: "22px", background: "#f1f5f9", borderRadius: "4px", animation: "pulse 1.4s ease-in-out infinite", margin: "0 auto" }} />
        ) : (
          <p style={{ fontSize: "22px", fontWeight: 900, color: isActive ? c.icon : numColor, margin: 0, lineHeight: 1, letterSpacing: "-0.3px" }}>{value ?? "—"}</p>
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
  Total:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 11.63 19a19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 15.92z"/></svg>,
  Wip:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Lt7:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  Gt7:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Resolved: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Closed:   () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
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
  const innerFilters = ["dateFrom","dateTo","assetCategory","location","status","criticality"];
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
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
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
/* ─── Dashboard Asset Table (table format with View button) ─────────────── */
function DashboardAssetTable({ token, filters, tileLabel, onClearTile, onOpenAsset }) {
  const [assets, setAssets]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [page, setPage]           = useState(1);
  const [total, setTotal]         = useState(0);
  const [viewAsset, setViewAsset] = useState(null); // asset whose images are shown
  const PER_PAGE = 20;

  // Map kpiKey → backend filter params understood by /assets endpoint
  const kpiKeyToFilters = (key) => {
    const map = {
      totalAssets:      {},
      criticalAssets:   { criticality: "Critical" },
      nonCriticalAssets:{ criticality: "Non_Critical" },
      rberAssets:       { rber: "true" },
      condemnedAssets:  { workingStatus: "Condemned" },
      verifiedAssets:   { verified: "true" },
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
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token, JSON.stringify(filters), page]);

  const getImages = (a) => {
    const meta = typeof a.metadata === "string" ? JSON.parse(a.metadata || "{}") : (a.metadata || {});
    const imgs = meta.hcImages || meta.images || meta.imageUrls || [];
    if (Array.isArray(imgs) && imgs.length > 0)
      return imgs.map(u => u.startsWith("http") ? u : `${BASE}${u}`);
    if (meta.imageUrl) return [meta.imageUrl.startsWith("http") ? meta.imageUrl : `${BASE}${meta.imageUrl}`];
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
                  const wsColor = { Working: { bg: "#dcfce7", c: "#16a34a" }, WIP: { bg: "#fef9c3", c: "#854d0e" }, Not_Working: { bg: "#fee2e2", c: "#dc2626" } }[a.working_status] || { bg: "#f1f5f9", c: "#64748b" };
                  const critColor = a.criticality === "Critical" ? { bg: "#fee2e2", c: "#dc2626" } : { bg: "#f0fdfa", c: "#0d9488" };
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ padding: "9px 14px", color: "#94a3b8", fontSize: "12px" }}>{(page - 1) * PER_PAGE + i + 1}</td>
                      <td style={{ padding: "9px 14px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }}>{a.asset_name || "—"}</td>
                      <td style={{ padding: "9px 14px" }}>
                        {onOpenAsset
                          ? <button onClick={() => onOpenAsset(a)} style={{ background: "none", border: "none", color: "#1e40af", fontFamily: "monospace", fontSize: "12px", cursor: "pointer", textDecoration: "underline", padding: 0, whiteSpace: "nowrap", fontWeight: 600 }}>{a.asset_unique_id || "—"}</button>
                          : <span style={{ color: "#1e40af", fontFamily: "monospace", fontSize: "12px" }}>{a.asset_unique_id || "—"}</span>}
                      </td>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{a.asset_category || "—"}</td>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{a.department_name || "—"}</td>
                      <td style={{ padding: "9px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: critColor.bg, color: critColor.c, whiteSpace: "nowrap" }}>{a.criticality || "—"}</span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: wsColor.bg, color: wsColor.c, whiteSpace: "nowrap" }}>{(a.working_status || "—").replace("_", " ")}</span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <button
                          onClick={() => setViewAsset(a)}
                          title={imgs.length ? `View ${imgs.length} image(s)` : "No images uploaded"}
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: imgs.length ? "#eff6ff" : "#f8fafc", color: imgs.length ? "#2563eb" : "#94a3b8", cursor: "pointer", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
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
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: "block", margin: "0 auto 12px", color: "#cbd5e1" }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
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

export default function HealthcareDashboard({ token, onOpenAsset }) {
  const EMPTY_FILTERS = { dateFrom: "", dateTo: "", departmentId: "", assetCategory: "", location: "", status: "", criticality: "", search: "" };

  const [filters, setFilters]       = useState(EMPTY_FILTERS);
  const [appliedFilters, setApplied]= useState(EMPTY_FILTERS);
  const [snapshot, setSnapshot]     = useState(null);
  const [charts, setCharts]         = useState(null);
  const [snapLoading, setSnapL]     = useState(false);
  const [chartLoading, setChartL]   = useState(false);
  const [snapError, setSnapE]       = useState(null);
  const [activeRecord, setActiveRec]= useState("call-logs");
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeKpiKey, setActiveKpiKey] = useState(null);   // which tile is highlighted
  const [chartDrilldown, setChartDrilldown] = useState(null); // { dept, criticality, data, loading }
  const [activeComplaintKey, setActiveComplaintKey] = useState(null); // complaint tile clicked
  const [complaintRequests, setComplaintRequests] = useState([]);
  const [complaintLoading, setComplaintLoading] = useState(false);
  const [exportDDOpen, setExportDDOpen] = useState(false);
  const complaintPanelRef = useRef(null);

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

  // Auto-apply search filter as user types (debounced 300ms)
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
    } else {
      setActiveKpiKey(k.key);
    }
  };

  const doExport = (extraFilters, type) => {
    const qs = buildQS({ ...appliedFilters, ...extraFilters, type });
    hcDownload(`/export${qs}`, token, `healthcare-export-${type}-${new Date().toISOString().slice(0,10)}.xlsx`)
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
      let url = `${BASE}/api/company-portal/asset-queries?limit=100`;
      if (key === "wipComplaints" || key === "wipLt7" || key === "wipGt7") url += "&status=open,wip,in_progress";
      else if (key === "resolvedComplaints") url += "&status=resolved";
      else if (key === "closedComplaints") url += "&status=closed";
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

  // Open drilldown panel when clicking a bar in the Criticality by Department chart
  const openChartDrilldown = async (dept, criticality, deptId) => {
    const key = `${dept}-${criticality}`;
    if (chartDrilldown && chartDrilldown.key === key) { setChartDrilldown(null); return; }
    setChartDrilldown({ key, dept, criticality, data: null, loading: true });
    try {
      const f = { ...appliedFilters, criticality, limit: 200 };
      if (deptId) f.departmentId = deptId;
      const qs = buildQS(f);
      const res = await hcFetch(`/assets${qs}`, token);
      setChartDrilldown({ key, dept, criticality, data: res.data || [], loading: false });
    } catch (e) {
      setChartDrilldown(prev => prev ? { ...prev, loading: false, error: e.message } : null);
    }
  };

  const KPI_LIST = [
    { key: "total",       label: "Total Assets",       icon: Icon.Total,       color: "blue",   filterData: {} },
    { key: "critical",    label: "Critical",           icon: Icon.Critical,    color: "red",    filterData: { criticality: "Critical" } },
    { key: "nonCritical", label: "Non-Critical",       icon: Icon.NonCritical, color: "teal",   filterData: { criticality: "Non_Critical" } },
    { key: "verified",    label: "Verified",          icon: Icon.Working,     color: "green",  filterData: { verified: "1" } },
    { key: "totalAssetValue", label: "Total Asset Value", icon: Icon.NotWorking, color: "indigo", filterData: {}, isValue: true },
    { key: "rber",        label: "RBER",               icon: Icon.Rber,        color: "orange", filterData: { rber: "1" } },
  ];

  return (
    <div style={{ padding: "6px 0 24px", maxWidth: "1400px", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Error state */}
      {snapError && <ErrorState message={snapError} onRetry={loadSnapshot} />}

      {/* ── ASSET SNAPSHOT KPI CARDS ── */}
      <section style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 8px" }}>
          Asset Profile
          <span style={{ fontSize: "11px", fontWeight: 400, color: "#94a3b8", marginLeft: "8px", textTransform: "none", letterSpacing: 0 }}>Live count from database</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
          {KPI_LIST.map(k => {
            let displayValue = snapshot?.[k.key];
            if (k.isValue && displayValue != null) {
              const v = Number(displayValue);
              if (v >= 10000000) displayValue = `₹${(v / 10000000).toFixed(2)}Cr`;
              else if (v >= 100000) displayValue = `₹${(v / 100000).toFixed(2)}L`;
              else if (v >= 1000) displayValue = `₹${(v / 1000).toFixed(1)}K`;
              else displayValue = `₹${v.toFixed(0)}`;
            }
            return (
              <KpiCard
                key={k.key}
                label={k.label}
                value={displayValue}
                icon={k.icon}
                color={k.color}
                loading={snapLoading}
                isActive={!k.isValue && activeKpiKey === k.key}
                onClick={k.isValue ? undefined : () => handleTileClick(k)}
              />
            );
          })}
        </div>

        {/* Complaint Profile row */}
        <div style={{ marginTop: "14px" }}>
          <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>Complaint Profile</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
            {[
              { key: "totalComplaints",    label: "Total Complaint",  icon: ComplaintIcon.Total,    color: "blue",   value: snapshot?.totalComplaints },
              { key: "wipComplaints",      label: "Work in Progress", icon: ComplaintIcon.Wip,      color: "yellow", value: snapshot?.wipComplaints },
              { key: "wipLt7",             label: "< 7 Days",         icon: ComplaintIcon.Lt7,      color: "green",  value: snapshot?.wipLt7 },
              { key: "wipGt7",             label: "> 7 Days",         icon: ComplaintIcon.Gt7,      color: "red",    value: snapshot?.wipGt7 },
              { key: "resolvedComplaints", label: "Resolved",         icon: ComplaintIcon.Resolved, color: "teal",   value: snapshot?.resolvedComplaints },
              { key: "closedComplaints",   label: "Closed",           icon: ComplaintIcon.Closed,   color: "purple", value: snapshot?.closedComplaints },
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
                {{totalComplaints:"All Complaints",wipComplaints:"Work In Progress",wipLt7:"WIP < 7 Days",wipGt7:"WIP ≥ 7 Days",resolvedComplaints:"Resolved Complaints",closedComplaints:"Closed Complaints"}[activeComplaintKey]}
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
                      {["#","Asset","Request Title","Status","Priority","Department","Raised By","Date"].map(h => (
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
                          <td style={{ padding: "8px 12px", color: "#0f172a", fontWeight: 600 }}>{r.assetName || r.asset_name || "—"}</td>
                          <td style={{ padding: "8px 12px", color: "#334155" }}>{r.title || r.description || "—"}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{ background: statusColors[st] || "#f1f5f9", color: statusText[st] || "#475569", padding: "2px 8px", borderRadius: "12px", fontSize: "11.5px", fontWeight: 700 }}>
                              {st.replace("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
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
      </section>

      {/* ── CHARTS ROW ── */}
      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Analytics & Charts</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>

          {/* Pie: Working Status */}
          <ChartCard title="Working Status Distribution" subtitle="Working vs WIP">
            {chartLoading ? <Spinner /> : charts?.statusDistribution ?
              <PieChart data={charts.statusDistribution.filter(d => d.name !== "Not_Working").map(d => ({ name: d.name, value: d.value }))} /> :
              <EmptyState small />
            }
          </ChartCard>

          {/* Bar: Criticality by Dept */}
          <ChartCard title="Criticality by Department" subtitle="Click a bar to view those assets">
            {chartLoading ? <Spinner /> : charts?.criticalityByDept ?
              <BarChart data={charts.criticalityByDept} onBarClick={openChartDrilldown} /> :
              <EmptyState small />
            }
          </ChartCard>
        </div>
      </section>

      {/* ── CALIBRATION PROFILE ── */}
      <section style={{ marginBottom: "28px" }}>
        <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 10px" }}>Calibration Profile</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          {[
            { key: "calibrationDueThisMonth", label: "Due This Month", icon: Icon.Calibration, color: "orange", value: snapshot?.calibrationDueThisMonth },
            { key: "calibrationOverdue", label: "Overdue", icon: Icon.Calibration, color: "red", value: snapshot?.calibrationOverdue },
            { key: "calibrationUpcoming", label: "Upcoming (30D)", icon: Icon.Calibration, color: "blue", value: snapshot?.calibrationUpcoming },
            { key: "calibrationCompletedThisMonth", label: "Completed This Month", icon: Icon.Calibration, color: "green", value: snapshot?.calibrationCompletedThisMonth },
          ].map(k => (
            <KpiCard
              key={k.key}
              label={k.label}
              value={k.value}
              icon={k.icon}
              color={k.color}
              loading={snapLoading}
              isActive={false}
            />
          ))}
        </div>
      </section>

      {/* ── CHART DRILLDOWN PANEL ── */}
      {chartDrilldown && (
        <div style={{ marginBottom: "28px", background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
              {chartDrilldown.criticality === "Critical" ? "🔴" : "🔵"} {chartDrilldown.criticality.replace("_", " ")} Assets — {chartDrilldown.dept}
            </span>
            <button onClick={() => setChartDrilldown(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#94a3b8", lineHeight: 1 }}>×</button>
          </div>
          {chartDrilldown.loading ? (
            <div style={{ padding: "30px", textAlign: "center" }}><Spinner /></div>
          ) : chartDrilldown.error ? (
            <div style={{ padding: "20px", color: "#dc2626", textAlign: "center" }}>{chartDrilldown.error}</div>
          ) : (!chartDrilldown.data || chartDrilldown.data.length === 0) ? (
            <div style={{ padding: "30px", textAlign: "center", color: "#94a3b8" }}>No assets found</div>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: "340px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    {["#", "QR Code", "Equipment Name", "Department", "Make", "Model", "Status"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chartDrilldown.data.map((a, i) => {
                    const meta = typeof a.metadata === "string" ? JSON.parse(a.metadata || "{}") : (a.metadata || {});
                    return (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{i + 1}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "12px", color: "#2563eb", fontWeight: 600 }}>{a.asset_unique_id || "—"}</td>
                        <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a" }}>{a.asset_name || "—"}</td>
                        <td style={{ padding: "10px 14px", color: "#64748b" }}>{a.department_name || "—"}</td>
                        <td style={{ padding: "10px 14px", color: "#64748b" }}>{meta.make || meta.manufacturer || "—"}</td>
                        <td style={{ padding: "10px 14px", color: "#64748b" }}>{meta.model || "—"}</td>
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700,
                            background: a.working_status === "Not_Working" ? "#fef2f2" : a.working_status === "WIP" ? "#fef9c3" : "#f0fdf4",
                            color: a.working_status === "Not_Working" ? "#dc2626" : a.working_status === "WIP" ? "#92400e" : "#16a34a" }}>
                            {(a.working_status || "Working").replace("_", " ")}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
