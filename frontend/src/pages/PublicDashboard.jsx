import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();

/* ── Colour palette (matches HealthcareDashboard) ── */
const COLORS = {
  blue:   { bg: "#eff6ff", border: "#bfdbfe", icon: "#2563eb" },
  green:  { bg: "#f0fdf4", border: "#bbf7d0", icon: "#16a34a" },
  red:    { bg: "#fef2f2", border: "#fecaca", icon: "#dc2626" },
  teal:   { bg: "#f0fdfa", border: "#99f6e4", icon: "#0d9488" },
  yellow: { bg: "#fefce8", border: "#fde68a", icon: "#ca8a04" },
  purple: { bg: "#faf5ff", border: "#e9d5ff", icon: "#7c3aed" },
};

/* ── Mini charts (copied from HealthcareDashboard) ── */
function PieChart({ data, size = 160 }) {
  if (!data || data.length === 0) return <p style={{ textAlign: "center", color: "#94a3b8", padding: "24px 0" }}>No data</p>;
  const PAL = ["#3b82f6","#10b981","#ef4444","#f59e0b","#8b5cf6","#ec4899"];
  const total = data.reduce((s, d) => s + d.value, 0) || 1;

  // Handle single-slice (100%) case — draw a full circle
  if (data.length === 1 || data.every(d => d.value === 0 || d === data[0])) {
    const nonZero = data.filter(d => d.value > 0);
    if (nonZero.length <= 1) {
      const d = nonZero[0] || data[0];
      const col = PAL[0];
      return (
        <div style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
            <circle cx={size/2} cy={size/2} r={size/2-4} fill={col} />
            <circle cx={size/2} cy={size/2} r={size/4} fill="#fff" />
            <text x={size/2} y={size/2-6} textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">{total}</text>
            <text x={size/2} y={size/2+10} textAnchor="middle" fontSize="9" fill="#64748b">Total</text>
          </svg>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: col, flexShrink: 0 }} />
              <span style={{ color: "#374151" }}>{d?.name}</span>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>{d?.value}</span>
              <span style={{ color: "#94a3b8", fontSize: "11px" }}>(100%)</span>
            </div>
          </div>
        </div>
      );
    }
  }

  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const pct = d.value / total;
    const a1 = angle, a2 = angle + pct * 2 * Math.PI;
    angle = a2;
    const r = size / 2 - 4;
    const cx = size / 2, cy = size / 2;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const large = pct > 0.5 ? 1 : 0;
    return { path: `M${cx},${cy} L${x1},${y1} A${r},${r},0,${large},1,${x2},${y2} Z`, color: PAL[i % PAL.length], label: d.name, value: d.value, pct };
  });
  return (
    <div style={{ display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {slices.map((s, i) => <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2"><title>{s.label}: {s.value}</title></path>)}
        <circle cx={size/2} cy={size/2} r={size/4} fill="#fff" />
        <text x={size/2} y={size/2-6} textAnchor="middle" fontSize="14" fontWeight="700" fill="#0f172a">{total}</text>
        <text x={size/2} y={size/2+10} textAnchor="middle" fontSize="9" fill="#64748b">Total</text>
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
  if (!data || data.length === 0) return <p style={{ textAlign: "center", color: "#94a3b8", padding: "24px 0" }}>No data</p>;
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
            <div style={{ width: "12px", height: "12px", background: col, borderRadius: "2px" }} />{lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ data, height = 200 }) {
  if (!data || data.length === 0) return <p style={{ textAlign: "center", color: "#94a3b8", padding: "24px 0" }}>No data</p>;
  const maxVal = Math.max(...data.flatMap(d => [d.pms || 0, d.calls || 0]), 1);
  const w = 480, h = height - 40;
  const toPoint = (i, val) => ({ x: data.length === 1 ? w/2 : (i / (data.length-1)) * w, y: h - (val/maxVal)*h });
  const pmsPoints = data.map((d, i) => toPoint(i, d.pms || 0));
  const callsPoints = data.map((d, i) => toPoint(i, d.calls || 0));
  const toPath = pts => pts.map((p, i) => `${i===0?"M":"L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const toArea = pts => `${toPath(pts)} L${pts[pts.length-1].x.toFixed(1)},${h} L0,${h} Z`;
  return (
    <div style={{ overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ display: "block", minWidth: "300px" }}>
        <defs>
          <linearGradient id="pubPmsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25"/><stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/></linearGradient>
          <linearGradient id="pubCallGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.25"/><stop offset="100%" stopColor="#10b981" stopOpacity="0"/></linearGradient>
        </defs>
        {[0,0.25,0.5,0.75,1].map((t,i) => <line key={i} x1="0" y1={h*(1-t)} x2={w} y2={h*(1-t)} stroke="#f1f5f9" strokeWidth="1"/>)}
        <path d={toArea(pmsPoints)} fill="url(#pubPmsGrad)"/>
        <path d={toArea(callsPoints)} fill="url(#pubCallGrad)"/>
        <path d={toPath(pmsPoints)} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round"/>
        <path d={toPath(callsPoints)} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round"/>
        {pmsPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="#3b82f6" stroke="#fff" strokeWidth="2"><title>{data[i].month}: PMS {data[i].pms}</title></circle>)}
        {callsPoints.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="4" fill="#10b981" stroke="#fff" strokeWidth="2"><title>{data[i].month}: Calls {data[i].calls}</title></circle>)}
        {data.map((d, i) => { const pt = toPoint(i, 0); return <text key={i} x={pt.x} y={h+15} textAnchor="middle" fontSize="9" fill="#94a3b8">{d.month.slice(5)}</text>; })}
      </svg>
      <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "8px" }}>
        {[["#3b82f6","PMS"],["#10b981","Call Logs"]].map(([col, lbl]) => (
          <div key={lbl} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#374151" }}>
            <div style={{ width: "24px", height: "3px", background: col, borderRadius: "2px" }}/>{lbl}
          </div>
        ))}
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }) {
  const c = COLORS[color] || COLORS.blue;
  return (
    <div style={{ background: "#fff", borderRadius: "10px", border: `1px solid ${c.border}`, padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.icon} strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
      </div>
      <div>
        <p style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>{label}</p>
        <p style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: 0, lineHeight: 1, letterSpacing: "-0.5px" }}>{value ?? "—"}</p>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9" }}>
        <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>{title}</p>
        {subtitle && <p style={{ fontSize: "12px", color: "#94a3b8", margin: "2px 0 0" }}>{subtitle}</p>}
      </div>
      <div style={{ padding: "20px" }}>{children}</div>
    </div>
  );
}

/* ── Main component ── */
export default function PublicDashboard() {
  const { token } = useParams();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    fetch(`${BASE}/api/public/${token}/dashboard`)
      .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.message || "Not found")))
      .then(setData)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: "48px", height: "48px", border: "4px solid #e2e8f0", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <p style={{ color: "#64748b" }}>Loading dashboard…</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc" }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "48px", textAlign: "center", maxWidth: "420px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <h2 style={{ color: "#0f172a", marginBottom: "8px" }}>Dashboard Not Found</h2>
        <p style={{ color: "#64748b", fontSize: "14px" }}>This link may be invalid or the company dashboard is not available.</p>
      </div>
    </div>
  );

  const { company, snapshot, charts } = data;

  const KPI_LIST = [
    { label: "Total Assets",      value: snapshot.total,       color: "blue"   },
    { label: "Verified Assets",   value: snapshot.verified,    color: "green"  },
    { label: "Critical Assets",   value: snapshot.critical,    color: "red"    },
    { label: "Non-Critical",      value: snapshot.nonCritical, color: "teal"   },
    { label: "Working",           value: snapshot.working,     color: "green"  },
    { label: "WIP",               value: snapshot.wip,         color: "yellow" },
    { label: "Not Working",       value: snapshot.notWorking,  color: "red"    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "16px 32px", display: "flex", alignItems: "center", gap: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
        {company.logoUrl && (
          <img src={company.logoUrl} alt="logo" style={{ height: "44px", objectFit: "contain", borderRadius: "8px" }} />
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{company.name}</h1>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Healthcare Asset Dashboard — Public View</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ background: "#f0fdf4", color: "#16a34a", padding: "5px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, border: "1px solid #bbf7d0" }}>
            🟢 Live
          </span>
          <span style={{ color: "#94a3b8", fontSize: "12px" }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
          </span>
        </div>
      </div>

      <div style={{ maxWidth: "1400px", margin: "0 auto", padding: "28px 24px" }}>

        {/* KPI Cards */}
        <section style={{ marginBottom: "28px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>
            Asset Snapshot
            <span style={{ fontSize: "12px", fontWeight: 400, color: "#94a3b8", marginLeft: "8px" }}>Live count from database</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "10px" }}>
            {KPI_LIST.map(k => <KpiCard key={k.label} {...k} />)}
          </div>
        </section>

        {/* Charts */}
        <section style={{ marginBottom: "28px" }}>
          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Analytics &amp; Charts</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "16px" }}>
            <ChartCard title="Working Status Distribution" subtitle="Working vs WIP vs Not Working">
              <PieChart data={charts.statusDistribution} />
            </ChartCard>
            <ChartCard title="Criticality by Department" subtitle="Critical vs Non-Critical asset count">
              <BarChart data={charts.criticalityByDept} />
            </ChartCard>
            <ChartCard title="Monthly Maintenance Trends" subtitle="PMS & Call Log activity">
              <LineChart data={charts.monthlyTrend} />
            </ChartCard>
          </div>
        </section>

        <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "12px", marginTop: "16px" }}>
          Read-only public dashboard · Data refreshes on page load · Contact the facility manager for full access.
        </p>
      </div>
    </div>
  );
}
