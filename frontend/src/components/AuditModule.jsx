/**
 * Asset Audit module (web) — physical existence stock-take.
 * Create an audit for a department / location, monitor progress as field users
 * verify assets on mobile (or mark here), and view the reconciliation report.
 */
import { useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { getApiBaseUrl } from "../utils/runtimeConfig";
import {
  getAudits, getAudit, getAuditItems, getAuditScopePreview, createAudit,
  startAudit, completeAudit, cancelAudit, markAuditItem, getAuditReport,
  getCompanyPortalDepartments,
} from "../api";

const STATUS_CFG = {
  draft:       { label: "Draft",       bg: "#f1f5f9", color: "#475569" },
  in_progress: { label: "In Progress", bg: "#fff7ed", color: "#c2410c" },
  completed:   { label: "Completed",   bg: "#ecfdf5", color: "#059669" },
  cancelled:   { label: "Cancelled",   bg: "#fef2f2", color: "#b91c1c" },
};
const ITEM_CFG = {
  pending:   { label: "Pending",   bg: "#f1f5f9", color: "#64748b" },
  found:     { label: "Found",     bg: "#ecfdf5", color: "#059669" },
  not_found: { label: "Not Found", bg: "#fef2f2", color: "#dc2626" },
};
const card = { background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" };
const btn = (bg, color, border) => ({ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${border || bg}`, background: bg, color, fontWeight: 700, fontSize: "13px", cursor: "pointer" });
const Chip = ({ cfg }) => <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>{cfg.label}</span>;

export default function AuditModule({ token, companyId, allCompaniesMode = false, canManage = false, canConduct = false }) {
  const [view, setView] = useState("list");
  const [selId, setSelId] = useState(null);
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [wizard, setWizard] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true); setErr("");
    try { setAudits(await getAudits(token, { allCompanies: allCompaniesMode })); }
    catch (e) { setErr(e.message || "Failed to load audits"); }
    finally { setLoading(false); }
  }, [token, allCompaniesMode]);

  useEffect(() => { if (view === "list") loadList(); }, [view, loadList]);

  if (view === "detail" && selId) {
    return <AuditDetail token={token} auditId={selId} canManage={canManage} canConduct={canConduct}
      onBack={() => { setSelId(null); setView("list"); }} />;
  }

  return (
    <div style={{ ...card, padding: "20px", marginBottom: "20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", marginBottom: "16px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Asset Audits</h3>
          <p style={{ margin: "3px 0 0", fontSize: "12.5px", color: "#64748b" }}>Verify assets physically exist — scan on mobile or mark here, then reconcile.</p>
        </div>
        {canManage && <button onClick={() => setWizard(true)} style={btn("#2563eb", "#fff")}>+ New Audit</button>}
      </div>

      {err && <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>{err}</div>}

      {loading ? <p style={{ color: "#94a3b8", fontSize: "13px" }}>Loading…</p>
        : audits.length === 0 ? (
          <div style={{ padding: "36px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "10px", fontSize: "13.5px" }}>
            No audits yet.{canManage ? " Click “+ New Audit” to start a stock-take." : ""}
          </div>
        ) : (
          <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "640px" }}>
              <thead><tr style={{ background: "#f8fafc" }}>
                {["Audit", "Scope", "Status", "Progress", "Found / Missing", "Created", ""].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {audits.map(a => (
                  <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }} onClick={() => { setSelId(a.id); setView("detail"); }}
                    onMouseEnter={e => e.currentTarget.style.background = "#fafafa"} onMouseLeave={e => e.currentTarget.style.background = ""}>
                    <td style={{ padding: "11px 12px", fontWeight: 700, color: "#0f172a" }}>{a.title}</td>
                    <td style={{ padding: "11px 12px", color: "#475569" }}>{a.scopeLabel || a.scopeType}</td>
                    <td style={{ padding: "11px 12px" }}><Chip cfg={STATUS_CFG[a.status] || STATUS_CFG.draft} /></td>
                    <td style={{ padding: "11px 12px", minWidth: "120px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, height: "7px", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden", minWidth: "60px" }}>
                          <div style={{ width: `${a.verifiedPct}%`, height: "100%", background: "#059669" }} /></div>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>{a.verifiedPct}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "11px 12px", color: "#475569", whiteSpace: "nowrap" }}>
                      <span style={{ color: "#059669", fontWeight: 700 }}>{a.foundCount}</span> / <span style={{ color: "#dc2626", fontWeight: 700 }}>{a.notFoundCount}</span>
                      <span style={{ color: "#94a3b8" }}> of {a.expectedCount}</span>
                    </td>
                    <td style={{ padding: "11px 12px", color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap" }}>{a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "—"}</td>
                    <td style={{ padding: "11px 12px", color: "#2563eb", fontSize: "12px", fontWeight: 700 }}>Open →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {wizard && <CreateAuditModal token={token} companyId={companyId} allCompaniesMode={allCompaniesMode}
        onClose={() => setWizard(false)} onCreated={(id) => { setWizard(false); setSelId(id); setView("detail"); }} />}
    </div>
  );
}

/* ─── Create wizard ─────────────────────────────────────────────────────────── */
function CreateAuditModal({ token, companyId, allCompaniesMode, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [scopeType, setScopeType] = useState("department");
  const [scopeRef, setScopeRef] = useState("");
  const [depts, setDepts] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    getCompanyPortalDepartments(token, allCompaniesMode).then(d => setDepts(Array.isArray(d) ? d : [])).catch(() => {});
    if (companyId) {
      fetch(`${getApiBaseUrl()}/api/locations/buildings?companyId=${companyId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : []).then(d => setBuildings(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [token, companyId, allCompaniesMode]);

  const scopeOptions = scopeType === "department"
    ? depts.map(d => ({ value: d.id, label: d.name }))
    : scopeType === "building" ? buildings.map(b => ({ value: b.id, label: b.buildingName || b.name })) : [];
  const scopeLabel = scopeType === "company" ? "All assets"
    : (scopeOptions.find(o => String(o.value) === String(scopeRef))?.label || "");

  // live count preview
  useEffect(() => {
    setPreview(null);
    if (scopeType !== "company" && !scopeRef) return;
    let alive = true;
    getAuditScopePreview(token, { scopeType, scopeRef: scopeType === "company" ? "" : scopeRef, allCompanies: allCompaniesMode })
      .then(r => { if (alive) setPreview(r.count); }).catch(() => {});
    return () => { alive = false; };
  }, [token, scopeType, scopeRef, allCompaniesMode]);

  const submit = async () => {
    if (!title.trim()) return setErr("Give the audit a title.");
    if (scopeType !== "company" && !scopeRef) return setErr("Pick a department or location.");
    setSaving(true); setErr("");
    try {
      const r = await createAudit(token, { title: title.trim(), scopeType, scopeRef: scopeType === "company" ? null : Number(scopeRef), scopeLabel, allCompanies: allCompaniesMode });
      onCreated(r.id);
    } catch (e) { setErr(e.message || "Could not create audit"); setSaving(false); }
  };

  const inp = { width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", background: "#fff", boxSizing: "border-box" };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }} onClick={onClose}>
      <div style={{ ...card, width: "100%", maxWidth: "480px", padding: "22px" }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 4px", fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>New Asset Audit</h3>
        <p style={{ margin: "0 0 16px", fontSize: "12.5px", color: "#64748b" }}>Snapshot the assets in an area, then verify each one exists.</p>
        {err && <div style={{ padding: "9px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "12.5px", marginBottom: "12px" }}>{err}</div>}

        <label style={lbl}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. NICU quarterly stock-take" style={{ ...inp, marginBottom: "12px" }} />

        <label style={lbl}>Scope</label>
        <select value={scopeType} onChange={e => { setScopeType(e.target.value); setScopeRef(""); }} style={{ ...inp, marginBottom: "10px" }}>
          <option value="department">By department</option>
          <option value="building">By location (building)</option>
          <option value="company">Whole company</option>
        </select>

        {scopeType !== "company" && (
          <select value={scopeRef} onChange={e => setScopeRef(e.target.value)} style={{ ...inp, marginBottom: "12px" }}>
            <option value="">Select {scopeType === "department" ? "department" : "building"}…</option>
            {scopeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        {preview != null && (
          <div style={{ padding: "10px 13px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", fontSize: "13px", color: "#1e40af", marginBottom: "14px" }}>
            <strong>{preview}</strong> active asset{preview !== 1 ? "s" : ""} will be included in this audit.
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button onClick={onClose} style={btn("#fff", "#475569", "#e2e8f0")}>Cancel</button>
          <button onClick={submit} disabled={saving || preview === 0} style={btn(saving || preview === 0 ? "#93c5fd" : "#2563eb", "#fff")}>{saving ? "Creating…" : "Create audit"}</button>
        </div>
      </div>
    </div>
  );
}
const lbl = { display: "block", fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "5px" };

/* ─── Detail view ───────────────────────────────────────────────────────────── */
function AuditDetail({ token, auditId, canManage, canConduct, onBack }) {
  const [audit, setAudit] = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const [a, its] = await Promise.all([
        getAudit(token, auditId),
        getAuditItems(token, auditId, { status: filter === "all" ? "" : filter, search }),
      ]);
      setAudit(a); setItems(Array.isArray(its) ? its : []);
    } catch (e) { setErr(e.message || "Failed to load audit"); }
  }, [token, auditId, filter, search]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => { setBusy(true); setErr(""); try { await fn(); await load(); } catch (e) { setErr(e.message || "Action failed"); } finally { setBusy(false); } };
  const mark = (item, status) => act(() => markAuditItem(token, auditId, item.id, { status }));

  const exportReport = async () => {
    const rep = await getAuditReport(token, auditId);
    const rows = [["Section", "Name", "Code", "Department", "Location"]];
    rows.push(["SUMMARY", `Expected ${rep.stats.total}`, `Found ${rep.stats.found}`, `Missing ${rep.stats.notFound}`, `${rep.stats.verifiedPct}% verified`]);
    (rep.missing || []).forEach(m => rows.push(["MISSING", m.name, m.code || "", m.department || "", m.location || ""]));
    const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit"); XLSX.writeFile(wb, `audit-${auditId}-${Date.now()}.xlsx`);
  };

  if (!audit) return <div style={{ ...card, padding: "20px" }}>{err || "Loading…"}</div>;
  const s = audit.stats; const inProgress = audit.status === "in_progress";
  const st = STATUS_CFG[audit.status] || STATUS_CFG.draft;

  return (
    <div style={{ ...card, padding: "20px", marginBottom: "20px" }}>
      <button onClick={onBack} style={{ ...btn("#f8fafc", "#475569", "#e2e8f0"), marginBottom: "14px" }}>← All audits</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{audit.title}</h3><Chip cfg={st} />
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "#64748b" }}>Scope: <strong>{audit.scopeLabel || audit.scopeType}</strong>{audit.createdByName ? ` · by ${audit.createdByName}` : ""}</p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {canManage && audit.status === "draft" && <button disabled={busy} onClick={() => act(() => startAudit(token, auditId))} style={btn("#2563eb", "#fff")}>Start audit</button>}
          {canManage && inProgress && <button disabled={busy} onClick={() => { if (window.confirm("Complete this audit? Any assets still pending will be marked Not Found.")) act(() => completeAudit(token, auditId)); }} style={btn("#059669", "#fff")}>Complete</button>}
          {canManage && (audit.status === "draft" || inProgress) && <button disabled={busy} onClick={() => { if (window.confirm("Cancel this audit?")) act(() => cancelAudit(token, auditId)); }} style={btn("#fff", "#b91c1c", "#fecaca")}>Cancel</button>}
          <button onClick={exportReport} style={btn("#f0fdf4", "#15803d", "#bbf7d0")}>⬇ Excel</button>
        </div>
      </div>

      {err && <div style={{ padding: "9px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "12.5px", margin: "12px 0" }}>{err}</div>}

      {/* stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: "10px", margin: "16px 0" }}>
        {[["Expected", s.total, "#0f172a"], ["Found", s.found, "#059669"], ["Missing", s.notFound, "#dc2626"], ["Pending", s.pending, "#c2410c"], ["Verified", `${s.verifiedPct}%`, "#2563eb"]].map(([k, v, c]) => (
          <div key={k} style={{ background: "#f8fafc", border: "1px solid #eef1f6", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>{k}</div>
          </div>
        ))}
      </div>

      {inProgress && canConduct && <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>Field users can scan QR codes on the mobile app to verify — or mark items manually below.</div>}
      {audit.status === "draft" && <div style={{ padding: "10px 13px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px", fontSize: "12.5px", color: "#9a3412", marginBottom: "10px" }}>This audit is in <strong>draft</strong>. Start it to begin recording results.</div>}

      {/* filter + search */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", margin: "6px 0 10px" }}>
        {["all", "pending", "found", "not_found"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 12px", borderRadius: "20px", border: `1px solid ${filter === f ? "#2563eb" : "#e2e8f0"}`, background: filter === f ? "#eff6ff" : "#fff", color: filter === f ? "#2563eb" : "#475569", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            {f === "all" ? "All" : ITEM_CFG[f].label}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search asset / code…" style={{ marginLeft: "auto", padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12.5px", minWidth: "200px" }} />
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px", maxHeight: "460px", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "560px" }}>
          <thead><tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
            {["Asset", "Code", "Department", "Location", "Status", inProgress && canConduct ? "Action" : "Verified by"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "9px 12px", fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: "22px", textAlign: "center", color: "#94a3b8" }}>No items.</td></tr>
            ) : items.map(it => (
              <tr key={it.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ padding: "8px 12px", fontWeight: 600, color: "#0f172a" }}>{it.name || `Asset #${it.assetId}`}</td>
                <td style={{ padding: "8px 12px", color: "#64748b", fontFamily: "monospace", fontSize: "11.5px" }}>{it.code || "—"}</td>
                <td style={{ padding: "8px 12px", color: "#475569" }}>{it.department || "—"}</td>
                <td style={{ padding: "8px 12px", color: "#475569" }}>{it.location || "—"}</td>
                <td style={{ padding: "8px 12px" }}><Chip cfg={ITEM_CFG[it.status] || ITEM_CFG.pending} /></td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                  {inProgress && canConduct ? (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button disabled={busy} onClick={() => mark(it, "found")} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #6ee7b7", background: it.status === "found" ? "#059669" : "#ecfdf5", color: it.status === "found" ? "#fff" : "#059669", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>Found</button>
                      <button disabled={busy} onClick={() => mark(it, "not_found")} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #fca5a5", background: it.status === "not_found" ? "#dc2626" : "#fef2f2", color: it.status === "not_found" ? "#fff" : "#dc2626", fontSize: "11.5px", fontWeight: 700, cursor: "pointer" }}>Not found</button>
                    </div>
                  ) : (
                    <span style={{ color: "#94a3b8", fontSize: "11.5px" }}>{it.auditedByName ? `${it.auditedByName}${it.auditedAt ? " · " + new Date(it.auditedAt).toLocaleDateString() : ""}` : "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
