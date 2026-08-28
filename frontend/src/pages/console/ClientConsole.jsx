/**
 * Catalyst HTM Console — redesigned client portal (Phase 1: shell + live Dashboard).
 *
 * Non-destructive: mounted at /console; the legacy /client portal is untouched.
 * Scoped entirely under `.hcx` so its design system never leaks to other routes.
 * The Dashboard reads the same real aggregate endpoint the legacy portal uses
 * (GET /api/companies/stats). Remaining modules are styled placeholders that
 * will be wired to their live data in subsequent phases.
 */
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "../../utils/runtimeConfig";
import "./console.css";

const TOKEN_KEY = "company_portal_token";

/* ── icons ─────────────────────────────────────────────── */
const P = {
  dash:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  intel:'<path d="M12 3a5 5 0 0 0-5 5c0 1.6.8 3 2 3.9V14h6v-2.1c1.2-.9 2-2.3 2-3.9a5 5 0 0 0-5-5z"/><path d="M9 18h6M10 21h4"/>',
  cube:'<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5M12 22V12"/>',
  ticket:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  gauge:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chart:'<path d="M3 3v18h18"/><path d="m7 15 3-4 3 3 5-7"/>',
  report:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15l2 2 4-4"/>',
  doc:'<path d="M4 4a2 2 0 0 1 2-2h5l2 3h5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4z"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  alert:'<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  pulse:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  dollar:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  cal:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  export:'<path d="M12 15V3m0 12-4-4m4 4 4-4M2 17v3a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-3"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  chev:'<path d="M15 18l-6-6 6-6"/>',
  menu:'<path d="M3 12h18M3 6h18M3 18h18"/>',
};
const Ic = ({ n, w = 18, sw = 2 }) => (
  <svg viewBox="0 0 24 24" width={w} height={w} fill="none" stroke="currentColor" strokeWidth={sw}
    strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: P[n] || "" }} />
);

const NAV = [
  { g: "Overview" },
  { v: "dash", l: "Dashboard", i: "dash" },
  { v: "intel", l: "Modular Intelligence", i: "intel", pill: "AI" },
  { g: "Operations" },
  { v: "assets", l: "Assets", i: "cube" },
  { v: "requests", l: "Service Requests", i: "ticket", pill: "12" },
  { v: "pm", l: "Preventive Maint.", i: "wrench" },
  { v: "calibration", l: "Calibration", i: "gauge" },
  { g: "Analytics" },
  { v: "sla", l: "SLA & Performance", i: "chart" },
  { v: "reports", l: "Reports & Analytics", i: "report" },
  { v: "documents", l: "Documents", i: "doc" },
  { g: "Administration" },
  { v: "notifications", l: "Notifications", i: "bell", pill: "5" },
  { v: "users", l: "Users & Roles", i: "users" },
  { v: "settings", l: "Settings", i: "cog" },
];
const TITLE = {
  dash: ["Executive Dashboard", "Portfolio health across your hospitals"],
  intel: ["Modular Intelligence", "AI insights across your fleet"],
  assets: ["Assets", "Medical equipment inventory"],
  requests: ["Service Requests", "Complaints & work orders"],
  pm: ["Preventive Maintenance", "Fleet-wide PMS schedule"],
  calibration: ["Calibration", "Certificate & due tracking"],
  sla: ["SLA & Performance", "Compliance scorecard"],
  reports: ["Reports & Analytics", "Build & schedule reports"],
  documents: ["Documents", "Files & certificates"],
  notifications: ["Notifications", "Recent events"],
  users: ["Users & Roles", "Members & permissions"],
  settings: ["Settings", "Organization & preferences"],
};

/* ── donut ─────────────────────────────────────────────── */
function Donut({ segs, size = 150 }) {
  const tot = segs.reduce((s, x) => s + x.v, 0) || 1;
  const r = size / 2 - 13, c = 2 * Math.PI * r, cx = size / 2;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segs.map((s, i) => {
        const len = (s.v / tot) * c;
        const el = (
          <circle key={i} cx={cx} cy={cx} r={r} fill="none" stroke={s.color} strokeWidth="16"
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${cx} ${cx})`} />
        );
        off += len;
        return el;
      })}
    </svg>
  );
}
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-IN"));
const crore = (n) => (n == null ? "—" : `${(Number(n) / 1e7).toFixed(2)}Cr`);

/* ── dashboard ─────────────────────────────────────────── */
function Dashboard({ stats, loading }) {
  const a = stats?.assetProfile || {};
  const c = stats?.complaintProfile || {};
  const total = a.total ?? stats?.totalAssets ?? 0;
  const critical = a.critical ?? 0, non = a.nonCritical ?? 0;
  const kpis = [
    { t: "tint-indigo", i: "cube", l: "Total Assets", v: fmt(total) },
    { t: "tint-rose", i: "alert", l: "Critical", v: fmt(critical) },
    { t: "tint-green", i: "shield", l: "Non-Critical", v: fmt(non) },
    { t: "tint-blue", i: "check", l: "Verified", v: fmt(a.verified ?? 0) },
    { t: "tint-amber", i: "dollar", l: "Asset Value", v: crore(a.totalAssetValue) },
  ];
  const comp = [
    { l: "Total", v: c.total ?? 0, cl: "tint-indigo", i: "ticket" },
    { l: "In Progress", v: c.wip ?? 0, cl: "tint-amber", i: "wrench" },
    { l: "< 7 days", v: c.lt ?? 0, cl: "tint-blue", i: "cal" },
    { l: "> 7 days", v: c.gt ?? 0, cl: "tint-rose", i: "alert" },
    { l: "Resolved", v: c.resolved ?? 0, cl: "tint-green", i: "check" },
    { l: "Closed", v: c.closed ?? 0, cl: "tint-green", i: "shield" },
  ];
  if (loading) return <div className="grid kpis" style={kpiGrid}>{kpis.map((_, i) => <div key={i} className="card skl" style={{ height: 108 }} />)}</div>;
  return (
    <>
      <div className="grid kpis" style={{ ...kpiGrid, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div className="card kpi" key={k.l}>
            <div className="top"><div className={`ic ${k.t}`}><Ic n={k.i} w={17} /></div><span className="lab">{k.l}</span></div>
            <div className="val">{k.v}</div>
          </div>
        ))}
      </div>
      <div className="grid dash2" style={{ gridTemplateColumns: "1fr 1.6fr", marginBottom: 16 }}>
        <div className="card panel">
          <div className="panel-h"><h3>Asset Category</h3><span className="badge b-mut no-dot">{fmt(total)} total</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <div style={{ position: "relative" }}>
              <Donut segs={[{ v: critical, color: "#e11d48" }, { v: non, color: "#059669" }]} />
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
                <div><div className="mono" style={{ fontSize: 22, fontWeight: 800 }}>{fmt(total)}</div><div style={{ fontSize: 10.5, color: "var(--text-3)" }}>assets</div></div>
              </div>
            </div>
            <div className="legend" style={{ flex: 1, minWidth: 140 }}>
              <div className="li"><span className="dt" style={{ background: "#e11d48" }} /><span className="nm">Critical</span><span className="vl num">{fmt(critical)}</span><span className="pc">{total ? Math.round(critical / total * 100) : 0}%</span></div>
              <div className="li"><span className="dt" style={{ background: "#059669" }} /><span className="nm">Non-Critical</span><span className="vl num">{fmt(non)}</span><span className="pc">{total ? Math.round(non / total * 100) : 0}%</span></div>
              <div className="li"><span className="dt" style={{ background: "#7c3aed" }} /><span className="nm">RBER</span><span className="vl num">{fmt(a.rber ?? 0)}</span><span className="pc" /></div>
              <div className="li"><span className="dt" style={{ background: "#64748b" }} /><span className="nm">Condemned</span><span className="vl num">{fmt(a.condemned ?? 0)}</span><span className="pc" /></div>
            </div>
          </div>
        </div>
        <div className="card panel">
          <div className="panel-h"><h3>Complaint Profile</h3><span className="badge b-mut no-dot">{fmt(c.total ?? 0)} tickets</span></div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))" }}>
            {comp.map((x) => (
              <div key={x.l} style={{ padding: "12px 14px", borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <div className="top" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><div className={`ic ${x.cl}`} style={{ width: 28, height: 28, borderRadius: 8, display: "grid", placeItems: "center" }}><Ic n={x.i} w={14} /></div></div>
                <div className="mono" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{fmt(x.v)}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 4, fontWeight: 600 }}>{x.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card panel">
        <div className="panel-h"><h3>By hospital</h3><span className="mut">{(stats?.byCompany || []).length} companies</span></div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {(stats?.byCompany || []).slice(0, 6).map((co, i) => {
            const t = co.totalAssets ?? co.assets ?? 0, mx = Math.max(...(stats.byCompany.map((x) => x.totalAssets ?? x.assets ?? 0)), 1);
            return (
              <div className="prow" key={i}><span className="pn">{co.companyName || co.name || "—"}</span><div className="pbar"><i style={{ width: `${t / mx * 100}%`, background: "#4f46e5" }} /></div><span className="pv">{fmt(t)}</span></div>
            );
          })}
          {(!stats?.byCompany || !stats.byCompany.length) && <div style={{ color: "var(--text-3)", fontSize: 13 }}>No per-hospital breakdown available.</div>}
        </div>
      </div>
    </>
  );
}
const kpiGrid = { gridTemplateColumns: "repeat(5,1fr)" };

/* ── placeholder for not-yet-migrated modules ──────────── */
function Placeholder({ view }) {
  const [t] = TITLE[view] || ["Module", ""];
  const icon = (NAV.find((n) => n.v === view) || {}).i || "cube";
  return (
    <div className="card">
      <div className="empty">
        <div className="ic"><Ic n={icon} w={24} /></div>
        <h3>{t} — redesign in progress</h3>
        <p style={{ maxWidth: 420, margin: "0 auto" }}>This module is being migrated to the new console. Preview the full design in the interactive prototype; live data wiring lands in the next phase.</p>
      </div>
    </div>
  );
}

/* ── shell ─────────────────────────────────────────────── */
export default function ClientConsole() {
  const [view, setView] = useState(() => new URLSearchParams(location.search).get("tab") || "dash");
  const [collapsed, setCollapsed] = useState(false);
  const [mopen, setMopen] = useState(false);
  const [dark, setDark] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const token = useMemo(() => localStorage.getItem(TOKEN_KEY), []);

  // load Google Fonts once
  useEffect(() => {
    const id = "hcx-fonts";
    if (!document.getElementById(id)) {
      const l = document.createElement("link");
      l.id = id; l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap";
      document.head.appendChild(l);
    }
  }, []);

  // load real dashboard stats
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`${getApiBaseUrl()}/api/companies/stats`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => { if (alive) { setStats(d || {}); setLoading(false); } })
      .catch(() => { if (alive) { setStats({}); setLoading(false); } });
    return () => { alive = false; };
  }, [token]);

  const go = (v) => { setView(v); setMopen(false); const u = new URL(location.href); u.searchParams.set("tab", v); history.replaceState(null, "", u); window.scrollTo(0, 0); };
  const [tKey, tSub] = TITLE[view] || TITLE.dash;

  return (
    <div className="hcx" data-theme={dark ? "dark" : undefined}>
      <div className={`app${collapsed ? " collapsed" : ""}${mopen ? " mopen" : ""}`}>
        <div className="scrim" onClick={() => setMopen(false)} />
        <aside className="rail">
          <div className="brand">
            <div className="logo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l2 6 4-12 2 6h6" /></svg></div>
            <div className="bt"><b>Catalyst HTM</b><span>Healthcare Tech Mgmt</span></div>
          </div>
          <nav className="nav">
            {NAV.map((n, i) => n.g
              ? <div className="nav-grp" key={"g" + i}>{n.g}</div>
              : <a key={n.v} className={view === n.v ? "on" : ""} onClick={() => go(n.v)}>
                  <Ic n={n.i} /><span>{n.l}</span>{n.pill && <span className={`pill${n.pill === "AI" ? " ai" : ""}`}>{n.pill}</span>}
                </a>)}
          </nav>
          <div className="rail-foot"><div className="u"><div className="avatar">CP</div><div className="uinfo"><b>Client Admin</b><span>All hospitals</span></div></div></div>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="iconbtn menu-btn" onClick={() => setMopen(true)} aria-label="Menu"><Ic n="menu" /></button>
            <button className="iconbtn" onClick={() => (window.innerWidth <= 900 ? setMopen(true) : setCollapsed((c) => !c))} aria-label="Collapse"><Ic n="chev" /></button>
            <div className="pagetitle"><h1>{tKey}</h1><p>{tSub}</p></div>
            <div className="spacer" />
            <div className="search"><Ic n="search" w={16} /><input placeholder="Search assets, tickets, people…" /></div>
            <button className="chip-select">All Hospitals <Ic n="chev" w={14} /></button>
            <button className="iconbtn" onClick={() => setDark((d) => !d)} aria-label="Theme"><Ic n="moon" /></button>
            <button className="iconbtn rel" onClick={() => go("notifications")} aria-label="Notifications"><Ic n="bell" /><span className="dot" /></button>
          </header>

          <main className="content">
            <div className="pagehead">
              <div><h2>{tKey}</h2><p className="sub">{tSub}</p></div>
              <div className="acts">
                <button className="btn"><Ic n="export" w={16} />Export</button>
                {view === "dash" && <button className="btn pri"><Ic n="report" w={16} />New Report</button>}
              </div>
            </div>
            {view === "dash" ? <Dashboard stats={stats} loading={loading} /> : <Placeholder view={view} />}
          </main>
        </div>
      </div>
    </div>
  );
}
