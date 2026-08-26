/**
 * Role & Permissions matrix manager (company portal).
 *
 * One continuous flow: create a role (top), then configure its unified web +
 * mobile permissions in a module × action matrix. Each cell maps to a backend
 * RBAC permission key (resource:action); "Other" opens a modal of extended
 * actions (tagged Web / Mobile). Saving writes the flat permission set via the
 * existing dynamic-RBAC endpoints, so enforcement is unchanged.
 *
 * Phase-1 UX/security: a legend explains every cell state; each row (and the
 * whole grid) has a None / View / Full quick-set; modules carry Web/Mobile
 * tags; destructive/privileged permissions are flagged and require an explicit
 * confirm (with blast radius) before they can be granted. Bulk quick-sets never
 * grant a sensitive permission — those stay deliberate. New roles start empty
 * (least privilege); the backend also blocks granting a permission the editor
 * doesn't hold.
 */
import { useState, useEffect, useCallback } from "react";
import {
  getRbacRolePermissions, setRbacRolePermissions,
  getCompanyRoles, createCompanyRole, deleteCompanyRole,
} from "../api";

// Module × column → permission key. `scope` = where the module's actions live
// (surfaced as Web / Mobile tags). `other` = extended actions (per-module modal).
const MATRIX = [
  { module: "Assets", scope: ["Web", "Mobile"],
    cols: { view: "asset:view", create: "asset:create", update: "asset:edit", delete: "asset:delete" },
    other: [{ key: "asset:transfer", label: "Assign / transfer assets", tag: "Web/Mobile" }] },
  { module: "Requests", scope: ["Mobile"],
    cols: { view: "case_log:view", create: "case_log:create" },
    other: [
      { key: "case_log:assign",  label: "Assign requests",           tag: "Web" },
      { key: "case_log:start",   label: "Start (mark in progress)",  tag: "Mobile" },
      { key: "case_log:resolve", label: "Resolve requests",          tag: "Mobile" },
      { key: "case_log:close",   label: "Close requests",            tag: "Mobile" },
    ] },
  { module: "PMS", scope: ["Mobile"],
    cols: { view: "pms:view", create: "pms:schedule", delete: "pms:delete" },
    other: [
      { key: "pms:assign_checklist", label: "Assign checklists to assets",   tag: "Web" },
      { key: "pms:fill",             label: "Fill / complete PMS checklists", tag: "Mobile" },
    ] },
  { module: "Calibration", scope: ["Web"],
    cols: { view: "calibration:view", create: "calibration:schedule", delete: "calibration:delete" },
    other: [] },
  { module: "Training", scope: ["Web", "Mobile"],
    cols: { view: "training:view", create: "training:schedule", delete: "training:delete" },
    other: [{ key: "training:mark_attendance", label: "Mark attendance", tag: "Web/Mobile" }] },
  { module: "Reports", scope: ["Web"],
    cols: { view: "report:view" }, other: [] },
  { module: "Roles & Permissions", scope: ["Web"],
    cols: {}, other: [{ key: "role:manage", label: "Manage roles & permissions", tag: "Web" }] },
  { module: "Users", scope: ["Web"],
    cols: {}, other: [{ key: "user:manage", label: "Manage users", tag: "Web" }] },
];
const COLS = ["view", "create", "update", "delete"];
const COL_LABEL = { view: "Read", create: "Create", update: "Edit", delete: "Delete" };

// Destructive / privileged permissions — granting one needs an explicit confirm.
const SENSITIVE = new Set([
  "asset:delete", "asset:transfer", "pms:delete", "calibration:delete",
  "training:delete", "work_order:delete", "role:manage", "user:manage",
]);

const TAG_STYLE = {
  "Web":        { bg: "#eff6ff", color: "#1d4ed8" },
  "Mobile":     { bg: "#fef3c7", color: "#92400e" },
  "Web/Mobile": { bg: "#f0fdf4", color: "#15803d" },
};

const allKeys      = (m) => [...Object.values(m.cols), ...m.other.map((o) => o.key)];
const safeKeys     = (m) => allKeys(m).filter((k) => !SENSITIVE.has(k)); // grantable in bulk
const friendly     = (m, key) => {
  for (const c of COLS) if (m.cols[c] === key) return `${COL_LABEL[c].toLowerCase()} ${m.module}`;
  const o = m.other.find((x) => x.key === key);
  return o ? o.label.replace(/\s*\(.*\)/, "").toLowerCase() : key;
};

// Plain-language read-out of a permission set.
function summarize(draft) {
  const parts = [];
  for (const m of MATRIX) {
    const acts = [];
    for (const c of COLS) if (m.cols[c] && draft.has(m.cols[c])) acts.push(COL_LABEL[c].toLowerCase());
    for (const o of m.other) if (draft.has(o.key)) acts.push(o.label.replace(/\s*\(.*\)/, "").toLowerCase());
    if (acts.length) parts.push(`${acts.join(", ")} · ${m.module}`);
  }
  if (!parts.length) return "No permissions yet — this role can sign in but won't see or do anything until you grant access.";
  return parts.join("  ·  ");
}

// Salesforce-style checkmark cell. Sensitive permissions read as normal when
// off (no visual alarm) and turn red only once granted; the confirm dialog is
// what actually guards them.
function Check({ on, disabled, sensitive, onClick }) {
  if (disabled) return <span style={{ color: "#cbd5e1", fontSize: "14px" }}>–</span>;
  const onColor = sensitive ? "#dc2626" : "#2563eb";
  return (
    <button onClick={onClick} aria-pressed={on} title={sensitive ? "Sensitive — confirm required to grant" : (on ? "Granted — click to revoke" : "Click to grant")}
      style={{ width: "18px", height: "18px", borderRadius: "4px", cursor: "pointer", padding: 0,
        border: `1.5px solid ${on ? onColor : "#cbd5e1"}`, background: on ? onColor : "#fff",
        display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "all .12s" }}>
      {on && <span style={{ color: "#fff", fontSize: "11px", lineHeight: 1, fontWeight: 900 }}>✓</span>}
    </button>
  );
}

function Toggle({ on, disabled, onClick }) {
  if (disabled) return <span style={{ color: "#cbd5e1", fontSize: "16px" }}>—</span>;
  return (
    <button onClick={onClick} aria-pressed={on}
      style={{ width: "38px", height: "22px", borderRadius: "12px", border: "none", cursor: "pointer",
        background: on ? "#2563eb" : "#cbd5e1", position: "relative", transition: "background .15s", padding: 0 }}>
      <span style={{ position: "absolute", top: "2px", left: on ? "18px" : "2px", width: "18px", height: "18px",
        borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
    </button>
  );
}

// Green on/off switch (grid cells). Sensitive permissions turn amber and route
// through a confirm; an inapplicable action renders as a muted dash.
function Switch({ on, disabled, sensitive, onClick }) {
  if (disabled) return <span style={{ color: "#d1d5db", fontSize: "15px" }}>–</span>;
  const onColor = sensitive ? "#f59e0b" : "#22c55e";
  return (
    <button onClick={onClick} aria-pressed={on} title={sensitive ? "Sensitive — confirm required to turn on" : on ? "On — click to turn off" : "Off — click to turn on"}
      style={{ width: "40px", height: "22px", borderRadius: "12px", border: "none", cursor: "pointer", padding: 0,
        background: on ? onColor : "#cbd5e1", position: "relative", transition: "background .15s" }}>
      <span style={{ position: "absolute", top: "2px", left: on ? "20px" : "2px", width: "18px", height: "18px",
        borderRadius: "50%", background: "#fff", transition: "left .15s", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }} />
    </button>
  );
}

// None / View / Full segmented quick-set.
function Segmented({ level, onSet, disabled }) {
  const opts = [["none", "None"], ["view", "View"], ["full", "Full"]];
  return (
    <span style={{ display: "inline-flex", border: "1px solid #e2e8f0", borderRadius: "7px", overflow: "hidden", opacity: disabled ? 0.5 : 1 }}>
      {opts.map(([v, lab], i) => (
        <button key={v} disabled={disabled} onClick={() => onSet(v)}
          style={{ padding: "3px 9px", fontSize: "11px", fontWeight: 600, cursor: disabled ? "default" : "pointer", border: "none",
            borderLeft: i ? "1px solid #e2e8f0" : "none",
            background: level === v ? "#2563eb" : "#fff", color: level === v ? "#fff" : "#64748b" }}>
          {lab}
        </button>
      ))}
    </span>
  );
}

export default function RoleMatrixManager({ token, onRolesChanged }) {
  const [roles, setRoles]         = useState([]);
  const [customRoles, setCustom]  = useState([]);
  const [activeKey, setActiveKey] = useState(null);
  const [draft, setDraft]         = useState(new Set());
  const [dirty, setDirty]         = useState(false);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState("");
  const [err, setErr]             = useState("");
  const [modSearch, setModSearch] = useState("");
  const [confirmPerm, setConfirmPerm] = useState(null);  // { key, label }
  const [otherModal, setOtherModal] = useState(null);    // MATRIX row whose extended actions are shown in a popup

  const [label, setLabel]   = useState("");
  const [parent, setParent] = useState("");
  const [color, setColor]   = useState("#2563eb");
  const [adding, setAdding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);            // add-role modal
  const [pendingSelect, setPendingSelect] = useState(null); // roleKey to auto-open after add

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [rl, cr] = await Promise.all([getRbacRolePermissions(token), getCompanyRoles(token).catch(() => [])]);
      setRoles(rl.roles || []);
      const list = Array.isArray(cr) ? cr : [];
      setCustom(list);
      onRolesChanged?.(list);
    } catch (e) { setErr(e.message || "Failed to load"); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const active = roles.find((r) => r.roleKey === activeKey) || null;

  // Auto-open a freshly created role in editing mode (empty by default).
  useEffect(() => {
    if (pendingSelect && roles.some((r) => r.roleKey === pendingSelect)) {
      setActiveKey(pendingSelect); setDraft(new Set()); setDirty(false); setPendingSelect(null);
    }
  }, [roles, pendingSelect]);

  const selectRole = (r) => {
    if (dirty && !window.confirm("Discard unsaved permission changes?")) return;
    setActiveKey(r.roleKey);
    setDraft(new Set(r.permissions));
    setDirty(false); setMsg(""); setErr("");
  };

  const applyToggle = (key) => {
    setDraft((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
    setDirty(true);
  };
  // Enabling a sensitive permission routes through a confirm; revoking never does.
  const attemptToggle = (key, labelText) => {
    if (!active || active.locked) return;
    if (!draft.has(key) && SENSITIVE.has(key)) { setConfirmPerm({ key, label: labelText }); return; }
    applyToggle(key);
  };

  // Row / grid quick-set. `full` grants every non-sensitive action only.
  const setRowLevel = (m, level) => {
    if (!active || active.locked) return;
    setDraft((p) => {
      const n = new Set(p);
      allKeys(m).forEach((k) => n.delete(k));
      if (level === "view" && m.cols.view) n.add(m.cols.view);
      if (level === "full") safeKeys(m).forEach((k) => n.add(k));
      return n;
    });
    setDirty(true);
  };
  const setAllLevel = (level) => {
    if (!active || active.locked) return;
    setDraft((p) => {
      const n = new Set(p);
      MATRIX.forEach((m) => {
        allKeys(m).forEach((k) => n.delete(k));
        if (level === "view" && m.cols.view) n.add(m.cols.view);
        // "Full access" grants every permission, sensitive ones included.
        if (level === "full") allKeys(m).forEach((k) => n.add(k));
      });
      return n;
    });
    setDirty(true);
  };
  const rowLevel = (m) => {
    const keys = allKeys(m);
    const present = keys.filter((k) => draft.has(k));
    if (present.length === 0) return "none";
    if (present.length === 1 && present[0] === m.cols.view) return "view";
    if (safeKeys(m).length && safeKeys(m).every((k) => draft.has(k))) return "full";
    return "";
  };

  const parentLabel = (roleKey) => {
    const r = customRoles.find((x) => x.roleKey === roleKey);
    return r?.parentRoleKey
      ? `reports to ${customRoles.find((x) => x.roleKey === r.parentRoleKey)?.label || r.parentRoleKey}`
      : "top level";
  };

  const save = async () => {
    if (!active) return;
    setSaving(true); setErr(""); setMsg("");
    try {
      await setRbacRolePermissions(token, active.roleKey, [...draft]);
      setMsg("Permissions saved."); setDirty(false);
      await load();
    } catch (e) { setErr(e.message || "Save failed"); }
    finally { setSaving(false); }
  };

  const slugify = (s) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const addRole = async () => {
    if (!label.trim()) return;
    setAdding(true); setErr("");
    try {
      await createCompanyRole(token, { label: label.trim(), parentRoleKey: parent || null, color });
      setPendingSelect(slugify(label));
      setLabel(""); setParent(""); setColor("#2563eb"); setShowAdd(false);
      await load();
    } catch (e) { setErr(e.message || "Could not add role"); }
    finally { setAdding(false); }
  };

  const removeRole = async (r) => {
    const cr = customRoles.find((x) => x.roleKey === r.roleKey);
    if (!cr) return;
    if (!window.confirm(`Delete role "${r.label}"?`)) return;
    try {
      await deleteCompanyRole(token, cr.id);
      if (activeKey === r.roleKey) { setActiveKey(null); setDraft(new Set()); }
      await load();
    } catch (e) { setErr(e.message || "Delete failed"); }
  };

  const parentOptions = [...new Set(roles.map((r) => r.roleKey))]
    .map((k) => ({ roleKey: k, label: roles.find((r) => r.roleKey === k)?.label || k }));

  const otherCount = (m) => m.other.filter((o) => draft.has(o.key)).length;

  // Rows for the table (module-name search only — permissions apply to both web
  // and mobile, so there is no platform split).
  const visibleMatrix = MATRIX.filter((m) => !modSearch || m.module.toLowerCase().includes(modSearch.toLowerCase()));

  const card = { background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "18px", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: "21px", fontWeight: 800, color: "#0f172a", margin: 0 }}>Manage Roles</h1>
          <p style={{ color: "#94a3b8", fontSize: "12px", margin: "4px 0 0" }}>
            Define your organization's role hierarchy and configure unified web and mobile permissions in one continuous flow.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          style={{ padding: "9px 18px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "12.5px", cursor: "pointer", whiteSpace: "nowrap" }}>
          ＋ Add Role
        </button>
      </div>

      {err && <div style={alert("#fef2f2", "#dc2626")}>{err}</div>}
      {msg && <div style={alert("#f0fdf4", "#16a34a")}>{msg}</div>}

      {/* Permissions section — dropdown-driven, full width */}
      <div style={{ ...card, padding: "20px", width: "100%", boxSizing: "border-box" }}>
        <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>Permissions</h2>
        <p style={{ color: "#94a3b8", fontSize: "11.5px", margin: "0 0 16px" }}>Manage access permissions for each organizational role.</p>

        {/* Select Role */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
          <div style={{ minWidth: "280px" }}>
            <label style={lbl}>Select Role</label>
            <select value={activeKey || ""} onChange={(e) => { const r = roles.find((x) => x.roleKey === e.target.value); if (r) selectRole(r); }}
              style={{ ...inp, fontWeight: 600, fontSize: "13px", background: "#fff", cursor: "pointer" }}>
              <option value="" disabled>Choose a role…</option>
              {roles.map((r) => <option key={r.roleKey} value={r.roleKey}>{r.label}</option>)}
            </select>
            {active && (
              <div style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "6px" }}>
                <strong style={{ color: "#0f172a" }}>{active.label}</strong>
                {typeof active.userCount === "number" ? ` · ${active.userCount} assigned employee${active.userCount !== 1 ? "s" : ""}` : ""}
                {" · "}{active.roleKey === "admin" ? "Full-access role" : parentLabel(active.roleKey) === "top level" ? "Top-level role" : parentLabel(active.roleKey)}
              </div>
            )}
          </div>
          {active && customRoles.find((x) => x.roleKey === active.roleKey) && (
            <button onClick={() => removeRole(active)} title="Delete role"
              style={{ marginTop: "22px", padding: "9px 14px", borderRadius: "8px", border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>🗑 Delete role</button>
          )}
          {active && (
            <span style={{ marginTop: "24px", marginLeft: "auto", fontSize: "11px", fontWeight: 700, padding: "4px 10px", borderRadius: "10px",
              color: active.locked ? "#64748b" : "#b45309", background: active.locked ? "#e2e8f0" : "#fef3c7" }}>
              {active.locked ? "🔒 Full access — cannot edit" : "✎ Editing Mode"}
            </span>
          )}
        </div>

        {!active ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "13px", border: "1px dashed #e2e8f0", borderRadius: "10px" }}>
            Select a role above to view and edit its permissions.
          </div>
        ) : (
          <>
            {/* Toolbar: search + bulk actions */}
            {!active.locked && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" }}>
                <input value={modSearch} onChange={(e) => setModSearch(e.target.value)} placeholder="🔍  Search modules…" style={{ ...inp, maxWidth: "260px" }} />
                <select value="" onChange={(e) => { if (e.target.value) { setAllLevel(e.target.value); e.target.value = ""; } }}
                  style={{ ...inp, maxWidth: "170px", background: "#fff", cursor: "pointer", marginLeft: "auto", fontWeight: 600 }}>
                  <option value="">Bulk actions ▾</option>
                  <option value="none">No access (all)</option>
                  <option value="view">View only (all)</option>
                  <option value="full">Full access (all)</option>
                </select>
              </div>
            )}

            {/* Permission table (Module · Read/Create/Edit/Delete · More) */}
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <th style={{ ...hCell, textAlign: "left", paddingLeft: "14px" }}>Module</th>
                    {COLS.map((c) => <th key={c} style={hCell}>{COL_LABEL[c]}</th>)}
                    <th style={hCell}>More</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMatrix.length === 0 ? (
                    <tr><td colSpan={COLS.length + 2} style={{ padding: "28px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>No modules match your search.</td></tr>
                  ) : visibleMatrix.map((m, i) => {
                    const nOn = otherCount(m);
                    return (
                      <tr key={m.module} style={{ background: i % 2 ? "#f8fafc" : "#fff", borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: "12.5px", color: "#0f172a", whiteSpace: "nowrap" }}>{m.module}</td>
                        {COLS.map((c) => {
                          const key = m.cols[c];
                          return (
                            <td key={c} style={cCell}>
                              <Check on={key ? draft.has(key) : false} disabled={!key || active.locked}
                                sensitive={key ? SENSITIVE.has(key) : false}
                                onClick={() => key && attemptToggle(key, friendly(m, key))} />
                            </td>
                          );
                        })}
                        <td style={cCell}>
                          {m.other.length === 0 ? <span style={{ color: "#cbd5e1" }}>–</span> : (
                            <button onClick={() => setOtherModal(m)} title="Extended actions"
                              style={{ border: "1px solid #e2e8f0", background: nOn ? "#eff6ff" : "#fff", borderRadius: "6px", padding: "3px 10px", fontSize: "13px", fontWeight: 800, letterSpacing: "1px", lineHeight: 1, color: nOn ? "#2563eb" : "#64748b", cursor: "pointer" }}>
                              •••{nOn > 0 ? <span style={{ fontSize: "10px", letterSpacing: 0, marginLeft: "5px", fontWeight: 700 }}>{nOn}</span> : ""}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Plain-language summary */}
            <div style={{ marginTop: "12px", background: "#f8fafc", borderRadius: "10px", padding: "9px 12px", fontSize: "11.5px", color: "#64748b", lineHeight: 1.5 }}>
              <span style={{ fontWeight: 700, color: "#0f172a" }}>In plain words — </span>{summarize(draft)}
            </div>

            {/* Cancel / Save */}
            {!active.locked && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", gap: "10px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11.5px", color: dirty ? "#b45309" : "#94a3b8", fontWeight: 600 }}>
                  {dirty ? "● Unsaved changes" : `${draft.size} permission${draft.size !== 1 ? "s" : ""} enabled`}
                </span>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => { setDraft(new Set(active.permissions)); setDirty(false); setMsg(""); }} disabled={saving || !dirty}
                    style={{ padding: "8px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600, fontSize: "12.5px", cursor: !dirty ? "default" : "pointer", opacity: !dirty ? 0.5 : 1 }}>Cancel</button>
                  <button onClick={save} disabled={saving}
                    style={{ padding: "8px 22px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "12.5px", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1 }}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Extended-actions popup */}
      {otherModal && active && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1350, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOtherModal(null); }}>
          <div style={{ ...card, width: "100%", maxWidth: "420px", padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#0f172a" }}>{otherModal.module} · Extended actions</div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "1px" }}>{active.label}</div>
              </div>
              <button onClick={() => setOtherModal(null)} style={{ border: "none", background: "#f1f5f9", borderRadius: "6px", width: "26px", height: "26px", cursor: "pointer", color: "#64748b", fontSize: "13px" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
              {otherModal.other.map((o) => {
                const on = draft.has(o.key);
                const sensitive = SENSITIVE.has(o.key);
                return (
                  <label key={o.key} style={{ display: "flex", alignItems: "center", gap: "9px", padding: "8px 10px", borderRadius: "8px", border: `1px solid ${on ? "#bfdbfe" : "#e2e8f0"}`, background: on ? "#eff6ff" : "#fff", cursor: "pointer" }}>
                    <Check on={on} disabled={active.locked} sensitive={sensitive} onClick={() => attemptToggle(o.key, o.label.replace(/\s*\(.*\)/, "").toLowerCase())} />
                    <span style={{ flex: 1, fontSize: "12px", color: "#334155" }}>{o.label}</span>
                    <span style={{ fontSize: "9.5px", fontWeight: 700, padding: "1px 6px", borderRadius: "8px", background: TAG_STYLE[o.tag].bg, color: TAG_STYLE[o.tag].color }}>{o.tag}</span>
                    {sensitive && <span style={sensTag}>⚠</span>}
                  </label>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "14px" }}>
              <div style={{ fontSize: "11.5px" }}>
                <button onClick={() => { otherModal.other.filter((o) => !SENSITIVE.has(o.key)).forEach((o) => draft.add(o.key)); setDraft(new Set(draft)); setDirty(true); }}
                  style={{ border: "none", background: "none", color: "#2563eb", fontWeight: 700, cursor: "pointer", padding: 0 }}>Allow all (safe)</button>
                <span style={{ color: "#cbd5e1", margin: "0 7px" }}>•</span>
                <button onClick={() => { otherModal.other.forEach((o) => draft.delete(o.key)); setDraft(new Set(draft)); setDirty(true); }}
                  style={{ border: "none", background: "none", color: "#64748b", fontWeight: 700, cursor: "pointer", padding: 0 }}>Deny all</button>
              </div>
              <button onClick={() => setOtherModal(null)} style={{ padding: "7px 18px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Add-role modal */}
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1350, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div style={{ ...card, width: "100%", maxWidth: "440px", padding: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Add New Role</div>
              <button onClick={() => setShowAdd(false)} style={{ border: "none", background: "#f1f5f9", borderRadius: "7px", width: "28px", height: "28px", cursor: "pointer", color: "#64748b" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={lbl}>Role Label *</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Client Supervisor" style={inp} autoFocus />
              </div>
              <div>
                <label style={lbl}>Reports To (optional)</label>
                <select value={parent} onChange={(e) => setParent(e.target.value)} style={{ ...inp, background: "#fff" }}>
                  <option value="">— Top of hierarchy —</option>
                  {parentOptions.map((o) => <option key={o.roleKey} value={o.roleKey}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Color</label>
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ ...inp, height: "38px", padding: "2px", width: "80px" }} />
              </div>
              <p style={{ fontSize: "11.5px", color: "#94a3b8", margin: 0 }}>New roles start with no permissions — grant access in the matrix after creating.</p>
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "18px" }}>
              <button onClick={() => setShowAdd(false)} style={{ padding: "9px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Cancel</button>
              <button onClick={addRole} disabled={adding || !label.trim()}
                style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: adding || !label.trim() ? "default" : "pointer", opacity: adding || !label.trim() ? 0.6 : 1 }}>
                {adding ? "Adding…" : "＋ Add Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sensitive-permission confirm */}
      {confirmPerm && active && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1400, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmPerm(null); }}>
          <div style={{ ...card, width: "100%", maxWidth: "380px", padding: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
              <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fef2f2", color: "#dc2626", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>⚠</span>
              <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>Grant a sensitive permission</div>
            </div>
            <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: "0 0 12px" }}>
              You're about to let <strong style={{ color: "#0f172a" }}>{active.label}</strong> <strong style={{ color: "#dc2626" }}>{confirmPerm.label}</strong>. This is a destructive or privileged action.
            </p>
            <div style={{ background: "#fffbeb", color: "#92400e", borderRadius: "8px", padding: "8px 10px", fontSize: "12.5px", marginBottom: "16px" }}>
              👥 {typeof active.userCount === "number" && active.userCount > 0
                ? `Affects ${active.userCount} employee${active.userCount !== 1 ? "s" : ""} currently assigned to this role.`
                : "No employees are assigned to this role yet."}
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmPerm(null)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Cancel</button>
              <button onClick={() => { applyToggle(confirmPerm.key); setConfirmPerm(null); }}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 700 }}>Grant permission</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: "10.5px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "5px" };
const inp = { width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12.5px", outline: "none" };
const bandCell = { background: "#5b6b8c", color: "#fff", fontSize: "12px", fontWeight: 700, padding: "6px 10px", textAlign: "center", letterSpacing: "0.02em", borderLeft: "2px solid #fff" };
const subTh    = { background: "#eef2f7", color: "#334155", fontSize: "11.5px", fontWeight: 700, padding: "7px 10px", textAlign: "center", borderLeft: "1px solid #dbe2ec", borderBottom: "1px solid #cbd5e1", whiteSpace: "nowrap" };
const cellTd   = { padding: "9px 10px", textAlign: "center", verticalAlign: "middle", borderLeft: "1px solid #eef2f7" };
const alert = (bg, color) => ({ padding: "10px 14px", background: bg, color, borderRadius: "8px", fontSize: "13px", fontWeight: 600, margin: "0 0 14px" });
const sensTag = { fontSize: "10px", fontWeight: 700, color: "#dc2626" };
const hSwitch = { textAlign: "center", padding: "10px 8px", fontSize: "11px", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.03em", whiteSpace: "nowrap" };
const cSwitch = { textAlign: "center", padding: "13px 8px", verticalAlign: "middle" };
const hCell = { textAlign: "center", padding: "9px 8px", fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" };
const cCell = { textAlign: "center", padding: "9px 8px", verticalAlign: "middle" };
const legendBox = (c, on) => ({ width: "16px", height: "16px", borderRadius: "4px", border: `1.5px solid ${c}`, background: on ? c : "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: "10px", fontWeight: 900 });
