/**
 * PMSChecklistModule.jsx
 * Full PMS (Preventive Maintenance System) module:
 *   Tab 1 – Checklists   (create, edit, delete, duplicate, search, filter)
 *   Tab 2 – Assign       (bulk-assign checklist to assets)
 *   Tab 3 – Schedules    (create schedules with engineer + asset selection)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();

const apiFetch = async (method, path, body, token) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
};

// ─── Style helpers ────────────────────────────────────────────────────────────
const S = {
  card:   { background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "20px" },
  input:  { width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box" },
  label:  { display: "block", marginBottom: "5px", fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em" },
  btn:    (v="primary") => ({ padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 700,
    ...(v==="primary"   ? { background: "#2563eb", color: "#fff" }   :
        v==="danger"    ? { background: "#dc2626", color: "#fff" }   :
        v==="ghost"     ? { background: "transparent", color: "#64748b", border: "1px solid #e2e8f0" } :
        v==="success"   ? { background: "#16a34a", color: "#fff" }   :
                          { background: "#f1f5f9", color: "#374151" }) }),
  badge:  (c="blue") => ({ display: "inline-block", padding: "2px 8px", borderRadius: "100px", fontSize: "11px", fontWeight: 700,
    ...(c==="green" ? { background: "#dcfce7", color: "#15803d" } :
        c==="red"   ? { background: "#fee2e2", color: "#dc2626" } :
        c==="gray"  ? { background: "#f1f5f9", color: "#64748b" } :
                      { background: "#dbeafe", color: "#1d4ed8" }) }),
  th: { padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" },
  td: { padding: "10px 14px", fontSize: "13px", color: "#374151", borderBottom: "1px solid #f1f5f9" },
};

const Field = ({ label, children, required }) => (
  <div style={{ marginBottom: "14px" }}>
    <label style={S.label}>{label}{required && <span style={{ color: "#dc2626" }}> *</span>}</label>
    {children}
  </div>
);

const Inp = (props) => <input {...props} style={{ ...S.input, ...props.style }} />;
const Sel = ({ options = [], placeholder, ...props }) => (
  <select {...props} style={{ ...S.input, background: "#fff", ...props.style }}>
    {placeholder && <option value="">{placeholder}</option>}
    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
);
const Txt = (props) => <textarea {...props} rows={3} style={{ ...S.input, resize: "vertical", ...props.style }} />;

const CHECK_TYPES = ["Visual Inspection","Functional Test","Cleaning","Calibration","Safety Test","Electrical Test","Lubrication","Measurement","Documentation","Other"];
const RESPONSE_TYPES = ["Pass/Fail","Yes/No","Numeric","Text","Dropdown","Image Upload","Signature"];
const FREQUENCIES = ["Monthly","Quarterly","Half-Yearly","Yearly","Custom"];
const ASSET_CATEGORIES = ["healthcare","general","fleet","technical","soft"];

// ─── Checklist Item Row ───────────────────────────────────────────────────────
function ItemRow({ item, idx, onChange, onRemove, onMoveUp, onMoveDown, isFirst, isLast }) {
  const up = (f, v) => onChange(idx, { ...item, [f]: v });
  return (
    <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 140px 120px 80px 80px 80px 64px 36px", gap: "6px", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ fontSize: "12px", fontWeight: 700, color: "#94a3b8", textAlign: "center" }}>{idx + 1}</div>
      <input value={item.inspectionPoint || ""} onChange={e => up("inspectionPoint", e.target.value)}
        placeholder="Inspection point…" style={{ ...S.input, fontSize: "12px" }} />
      <select value={item.checkType || "Visual Inspection"} onChange={e => up("checkType", e.target.value)}
        style={{ ...S.input, fontSize: "12px", background: "#fff" }}>
        {CHECK_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>
      <select value={item.responseType || "Pass/Fail"} onChange={e => up("responseType", e.target.value)}
        style={{ ...S.input, fontSize: "12px", background: "#fff" }}>
        {RESPONSE_TYPES.map(t => <option key={t}>{t}</option>)}
      </select>
      <label style={{ fontSize: "11px", color: "#475569", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
        <input type="checkbox" checked={!!item.isMandatory} onChange={e => up("isMandatory", e.target.checked ? 1 : 0)} /> Mandatory
      </label>
      <label style={{ fontSize: "11px", color: "#475569", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
        <input type="checkbox" checked={!!item.remarksRequired} onChange={e => up("remarksRequired", e.target.checked ? 1 : 0)} /> Remarks
      </label>
      <label style={{ fontSize: "11px", color: "#475569", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer" }}>
        <input type="checkbox" checked={!!item.photoRequired} onChange={e => up("photoRequired", e.target.checked ? 1 : 0)} /> Photo
      </label>
      <input value={item.toleranceValue || ""} onChange={e => up("toleranceValue", e.target.value)}
        placeholder="Tolerance" style={{ ...S.input, fontSize: "11px" }} />
      <button onClick={() => onRemove(idx)} style={{ ...S.btn("danger"), padding: "4px 8px", fontSize: "16px", lineHeight: 1 }}>×</button>
    </div>
  );
}

// ─── Checklist Form (full-page, no modal) ────────────────────────────────────
function ChecklistForm({ initial, onSave, onBack, token }) {
  const isEdit = !!initial?.id;
  const blank = { checklistName: "", assetCategory: "", assetType: "", manufacturer: "", model: "",
    version: "1.0", estimatedDuration: "", frequency: "Monthly", description: "", status: "active" };
  const [form, setForm] = useState(initial ? { ...blank, ...initial } : blank);
  const [items, setItems] = useState(initial?.items || []);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const up = (f, v) => setForm(p => ({ ...p, [f]: v }));
  const addItem = () => setItems(p => [...p, { inspectionPoint: "", checkType: "Visual Inspection", responseType: "Pass/Fail", isMandatory: 1, remarksRequired: 0, photoRequired: 0, toleranceValue: "" }]);
  const updateItem = (i, val) => setItems(p => p.map((x, idx) => idx === i ? val : x));
  const removeItem = (i) => setItems(p => p.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!form.checklistName.trim()) { setErr("Checklist name is required."); return; }
    setSaving(true); setErr("");
    try {
      const payload = { ...form, items: items.map((it, i) => ({ ...it, serialNo: i + 1 })) };
      const result = isEdit
        ? await apiFetch("PUT", `/api/company-portal/pms/checklists/${initial.id}`, payload, token)
        : await apiFetch("POST", "/api/company-portal/pms/checklists", payload, token);
      onSave(result);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      {/* Page header with back button */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
        <button onClick={onBack}
          style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#fff", border: "1px solid #e2e8f0",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#475569",
            flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#64748b", marginBottom: "2px" }}>
            <span style={{ cursor: "pointer", color: "#2563eb" }} onClick={onBack}>Checklists</span>
            <span>›</span>
            <span>{isEdit ? "Edit Checklist" : "New Checklist"}</span>
          </div>
          <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
            {isEdit ? `Edit: ${initial.checklist_name || initial.checklistName}` : "Create PMS Checklist"}
          </h1>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
          <button style={S.btn("ghost")} onClick={onBack}>Discard</button>
          <button style={S.btn("primary")} onClick={save} disabled={saving}>
            {saving ? "Saving…" : (isEdit ? "Save Changes" : "Create Checklist")}
          </button>
        </div>
      </div>

      {err && <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", marginBottom: "16px", fontSize: "13px", fontWeight: 600 }}>⚠ {err}</div>}

      {/* Form card */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "14px 14px 0 0" }}>
          <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Checklist Details</div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>Basic information about this PMS checklist</div>
        </div>
        <div style={{ padding: "20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div style={{ gridColumn: "span 2" }}>
              <Field label="Checklist Name" required>
                <Inp value={form.checklistName} onChange={e => up("checklistName", e.target.value)} placeholder="e.g. ECG Machine PMS Checklist" style={{ fontSize: "14px" }} />
              </Field>
            </div>
            <Field label="Asset Category">
              <Sel value={form.assetCategory} onChange={e => up("assetCategory", e.target.value)} placeholder="Select category"
                options={ASSET_CATEGORIES.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))} />
            </Field>
            <Field label="Asset Type">
              <Inp value={form.assetType} onChange={e => up("assetType", e.target.value)} placeholder="e.g. ECG Machine, Ventilator" />
            </Field>
            <Field label="Manufacturer">
              <Inp value={form.manufacturer} onChange={e => up("manufacturer", e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Model">
              <Inp value={form.model} onChange={e => up("model", e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Version">
              <Inp value={form.version} onChange={e => up("version", e.target.value)} placeholder="1.0" />
            </Field>
            <Field label="Estimated Duration (min)">
              <Inp type="number" value={form.estimatedDuration} onChange={e => up("estimatedDuration", e.target.value)} placeholder="e.g. 60" />
            </Field>
            <Field label="Frequency">
              <Sel value={form.frequency} onChange={e => up("frequency", e.target.value)}
                options={FREQUENCIES.map(f => ({ value: f, label: f }))} />
            </Field>
            <Field label="Status">
              <Sel value={form.status} onChange={e => up("status", e.target.value)}
                options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
            </Field>
          </div>
          <Field label="Description">
            <Txt value={form.description} onChange={e => up("description", e.target.value)} placeholder="Describe the scope and purpose of this checklist…" rows={2} />
          </Field>
        </div>
      </div>

      {/* Items card */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", marginBottom: "20px" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: "14px 14px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Checklist Items <span style={{ ...S.badge("blue"), fontSize: "12px" }}>{items.length}</span></div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>Add inspection points — each item is one step in the maintenance procedure</div>
          </div>
          <button style={S.btn("primary")} onClick={addItem}>+ Add Item</button>
        </div>
        <div style={{ padding: "8px 0" }}>
          {items.length > 0 ? (
            <div style={{ overflowX: "auto", padding: "0 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "36px 1fr 150px 130px 90px 80px 80px 80px 36px",
                gap: "6px", padding: "8px 0 6px", borderBottom: "2px solid #e2e8f0", marginBottom: "4px" }}>
                {["#","Inspection Point","Check Type","Response Type","Mandatory","Remarks","Photo","Tolerance",""].map((h,i) =>
                  <div key={i} style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", padding: "0 2px" }}>{h}</div>
                )}
              </div>
              {items.map((item, i) => (
                <ItemRow key={i} item={item} idx={i} onChange={updateItem} onRemove={removeItem}
                  isFirst={i === 0} isLast={i === items.length - 1} />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "48px 32px", color: "#94a3b8" }}>
              <div style={{ fontSize: "36px", marginBottom: "12px" }}>📋</div>
              <div style={{ fontWeight: 700, marginBottom: "6px", color: "#64748b" }}>No items yet</div>
              <div style={{ fontSize: "13px", marginBottom: "16px" }}>Add inspection points to build the checklist procedure.</div>
              <button style={S.btn("primary")} onClick={addItem}>+ Add First Item</button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom save bar */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0",
        padding: "16px 20px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
        <button style={S.btn("ghost")} onClick={onBack}>Discard changes</button>
        <button style={S.btn("primary")} onClick={save} disabled={saving}>
          {saving ? "Saving…" : (isEdit ? "Save Changes" : "Create Checklist")}
        </button>
      </div>
    </div>
  );
}

// ─── Generic Modal Wrapper (used by Schedules tab) ───────────────────────────
function Modal({ title, onClose, children, maxWidth = 900 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 400,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "24px 16px", overflowY: "auto" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", width: "100%",
        maxWidth, boxShadow: "0 24px 80px rgba(0,0,0,0.22)", marginTop: "24px" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "24px", lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Items View Modal (read-only) ─────────────────────────────────────────────
function ItemsViewModal({ checklist, onClose }) {
  if (!checklist) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 400,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}
      onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", width: "100%", maxWidth: 900,
        boxShadow: "0 24px 80px rgba(0,0,0,0.22)", marginTop: "24px" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{checklist.checklist_name}</h2>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
              <span style={S.badge("blue")}>{checklist.checklist_code}</span>
              <span style={S.badge("gray")}>{checklist.frequency}</span>
              {checklist.asset_type && <span style={S.badge("gray")}>{checklist.asset_type}</span>}
              {checklist.estimated_duration && <span style={S.badge("gray")}>~{checklist.estimated_duration} min</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "24px", lineHeight: 1 }}>×</button>
        </div>
        {checklist.description && <p style={{ fontSize: "13px", color: "#475569", marginBottom: "16px", padding: "12px 16px", background: "#f8fafc", borderRadius: "8px" }}>{checklist.description}</p>}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["#","Inspection Point","Check Type","Response","Mandatory","Remarks","Photo","Tolerance"].map(h =>
                  <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(checklist.items || []).map((item, i) => (
                <tr key={item.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  <td style={S.td}>{item.serial_no}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{item.inspection_point}</td>
                  <td style={S.td}>{item.check_type}</td>
                  <td style={S.td}><span style={S.badge("blue")}>{item.response_type}</span></td>
                  <td style={S.td}>{item.is_mandatory ? "✓" : "—"}</td>
                  <td style={S.td}>{item.remarks_required ? "✓" : "—"}</td>
                  <td style={S.td}>{item.photo_required ? "✓" : "—"}</td>
                  <td style={S.td}>{item.tolerance_value || "—"}</td>
                </tr>
              ))}
              {(!checklist.items || checklist.items.length === 0) && (
                <tr><td colSpan={8} style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No items in this checklist.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Checklists Tab ───────────────────────────────────────────────────────────
function ChecklistsTab({ token, companyId, onAssignClick }) {
  const [checklists, setChecklists] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // page: null = list, "create" = new form, {edit: cl} = edit form
  const [page, setPage]         = useState(null);
  const [viewItems, setViewItems] = useState(null);
  const [err, setErr]           = useState("");
  const [toast, setToast]       = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (search)     qs.append("search", search);
      if (catFilter)  qs.append("category", catFilter);
      if (statusFilter) qs.append("status", statusFilter);
      const data = await apiFetch("GET", `/api/company-portal/pms/checklists?${qs}`, null, token);
      setChecklists(data);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, [token, search, catFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    try {
      const data = await apiFetch("GET", `/api/company-portal/pms/checklists/${id}`, null, token);
      setViewItems(data);
    } catch (e) { setErr(e.message); }
  };

  const openEditPage = async (cl) => {
    try {
      const data = await apiFetch("GET", `/api/company-portal/pms/checklists/${cl.id}`, null, token);
      setPage({ edit: data });
    } catch (e) { setErr(e.message); }
  };

  const duplicate = async (id) => {
    try {
      await apiFetch("POST", `/api/company-portal/pms/checklists/${id}/duplicate`, {}, token);
      showToast("Checklist duplicated!"); load();
    } catch (e) { setErr(e.message); }
  };

  const toggleStatus = async (cl) => {
    try {
      await apiFetch("PUT", `/api/company-portal/pms/checklists/${cl.id}`, { status: cl.status === "active" ? "inactive" : "active" }, token);
      load();
    } catch (e) { setErr(e.message); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this checklist? This cannot be undone.")) return;
    try {
      await apiFetch("DELETE", `/api/company-portal/pms/checklists/${id}`, null, token);
      showToast("Deleted."); load();
    } catch (e) { setErr(e.message); }
  };

  // ── If on create/edit page, render full-page form ──────────────────────────
  if (page === "create") {
    return (
      <ChecklistForm
        token={token}
        onBack={() => setPage(null)}
        onSave={() => { setPage(null); showToast("Checklist created!"); load(); }}
      />
    );
  }
  if (page?.edit) {
    return (
      <ChecklistForm
        token={token}
        initial={page.edit}
        onBack={() => setPage(null)}
        onSave={() => { setPage(null); showToast("Checklist updated!"); load(); }}
      />
    );
  }

  return (
    <div>
      {toast && <div style={{ position: "fixed", bottom: "24px", right: "24px", background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, zIndex: 999 }}>{toast}</div>}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search checklists…"
          style={{ ...S.input, maxWidth: "220px" }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ ...S.input, maxWidth: "160px", background: "#fff" }}>
          <option value="">All Categories</option>
          {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ ...S.input, maxWidth: "130px", background: "#fff" }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button style={S.btn()} onClick={load}>Refresh</button>
        <div style={{ marginLeft: "auto" }}>
          <button style={S.btn("primary")} onClick={() => setPage("create")}>+ New Checklist</button>
        </div>
      </div>

      {err && <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", marginBottom: "12px", fontSize: "13px" }}>{err}</div>}

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>Loading…</div>
        ) : checklists.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📋</div>
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>No checklists yet</div>
            <div style={{ fontSize: "13px" }}>Click <strong>+ New Checklist</strong> to create your first PMS checklist.</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Code","Name","Category","Asset Type","Frequency","Items","Status","Actions"].map(h =>
                    <th key={h} style={S.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {checklists.map((cl, i) => (
                  <tr key={cl.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={S.td}><code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}>{cl.checklist_code}</code></td>
                    <td style={S.td}>
                      <button onClick={() => openDetail(cl.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontWeight: 700, fontSize: "13px", padding: 0 }}>
                        {cl.checklist_name}
                      </button>
                    </td>
                    <td style={S.td}>{cl.asset_category || "—"}</td>
                    <td style={S.td}>{cl.asset_type || "—"}</td>
                    <td style={S.td}><span style={S.badge("blue")}>{cl.frequency}</span></td>
                    <td style={S.td}><span style={{ fontWeight: 700 }}>{cl.itemCount}</span> items</td>
                    <td style={S.td}>
                      <span style={S.badge(cl.status === "active" ? "green" : "gray")}>
                        {cl.status}
                      </span>
                    </td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button title="Edit" style={{ ...S.btn(), padding: "4px 10px", fontSize: "12px" }}
                          onClick={() => openEditPage(cl)}>Edit</button>
                        <button title="Duplicate" style={{ ...S.btn(), padding: "4px 10px", fontSize: "12px" }}
                          onClick={() => duplicate(cl.id)}>Dup</button>
                        <button title="Assign to assets" style={{ ...S.btn("success"), padding: "4px 10px", fontSize: "12px" }}
                          onClick={() => onAssignClick(cl)}>Assign</button>
                        <button title={cl.status === "active" ? "Deactivate" : "Activate"}
                          style={{ ...S.btn(), padding: "4px 10px", fontSize: "12px", color: cl.status === "active" ? "#d97706" : "#16a34a" }}
                          onClick={() => toggleStatus(cl)}>{cl.status === "active" ? "Deact." : "Act."}</button>
                        <button title="Delete" style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: "12px" }}
                          onClick={() => del(cl.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Items view modal (read-only preview) */}
      {viewItems && <ItemsViewModal checklist={viewItems} onClose={() => setViewItems(null)} />}
    </div>
  );
}

// ─── Assign Tab ───────────────────────────────────────────────────────────────
function AssignTab({ token, initialChecklist, onDone }) {
  const [checklists, setChecklists] = useState([]);
  const [assets, setAssets]         = useState([]);
  const [selectedCL, setSelectedCL] = useState(initialChecklist?.id?.toString() || "");
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [filters, setFilters]       = useState({ search: "", departmentId: "", assetCategory: "", withChecklist: "" });
  const [departments, setDepartments] = useState([]);
  const [assigning, setAssigning]   = useState(false);
  const [result, setResult]         = useState(null);
  const [err, setErr]               = useState("");

  useEffect(() => {
    apiFetch("GET", "/api/company-portal/pms/checklists?status=active", null, token).then(setChecklists).catch(() => {});
    apiFetch("GET", "/api/company-portal/departments", null, token).then(d => setDepartments(d || [])).catch(() => {});
  }, [token]);

  useEffect(() => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && qs.append(k, v));
    apiFetch("GET", `/api/company-portal/pms/assets?${qs}`, null, token).then(setAssets).catch(() => {});
  }, [token, filters]);

  const toggleAll = () => {
    if (selectedAssets.size === assets.length) setSelectedAssets(new Set());
    else setSelectedAssets(new Set(assets.map(a => a.id)));
  };

  const assign = async () => {
    if (!selectedCL) { setErr("Select a checklist first."); return; }
    if (!selectedAssets.size) { setErr("Select at least one asset."); return; }
    setAssigning(true); setErr("");
    try {
      const r = await apiFetch("POST", "/api/company-portal/pms/assign", {
        checklistId: Number(selectedCL), assetIds: [...selectedAssets],
      }, token);
      setResult(r);
      setSelectedAssets(new Set());
    } catch (e) { setErr(e.message); }
    finally { setAssigning(false); }
  };

  return (
    <div>
      {result && (
        <div style={{ padding: "16px 20px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", marginBottom: "16px", display: "flex", gap: "24px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#15803d" }}>✓ Assignment complete</span>
          <span style={{ fontSize: "13px", color: "#166534" }}>✅ Success: <strong>{result.success}</strong></span>
          <span style={{ fontSize: "13px", color: "#92400e" }}>⚠️ Already assigned: <strong>{result.alreadyAssigned}</strong></span>
          <span style={{ fontSize: "13px", color: "#dc2626" }}>❌ Failed: <strong>{result.failed}</strong></span>
          <button style={{ ...S.btn("ghost"), marginLeft: "auto" }} onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: "20px" }}>
        {/* Left: select checklist */}
        <div style={S.card}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "12px" }}>1. Select Checklist</div>
          <select value={selectedCL} onChange={e => setSelectedCL(e.target.value)}
            style={{ ...S.input, background: "#fff" }}>
            <option value="">Choose checklist…</option>
            {checklists.map(cl => <option key={cl.id} value={cl.id}>{cl.checklist_name} ({cl.checklist_code})</option>)}
          </select>
          {selectedCL && (() => {
            const cl = checklists.find(c => c.id.toString() === selectedCL);
            if (!cl) return null;
            return (
              <div style={{ marginTop: "12px", padding: "10px 12px", background: "#f0fdf4", borderRadius: "8px", fontSize: "12px" }}>
                <div><strong>{cl.checklist_name}</strong></div>
                <div style={{ color: "#475569", marginTop: "4px" }}>{cl.checklist_code} • {cl.frequency} • {cl.itemCount} items</div>
              </div>
            );
          })()}

          <div style={{ marginTop: "20px", fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "12px" }}>2. Filter Assets</div>
          <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
            placeholder="Search assets…" style={{ ...S.input, marginBottom: "8px" }} />
          <select value={filters.departmentId} onChange={e => setFilters(p => ({ ...p, departmentId: e.target.value }))}
            style={{ ...S.input, background: "#fff", marginBottom: "8px" }}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={filters.assetCategory} onChange={e => setFilters(p => ({ ...p, assetCategory: e.target.value }))}
            style={{ ...S.input, background: "#fff", marginBottom: "8px" }}>
            <option value="">All Categories</option>
            {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <select value={filters.withChecklist} onChange={e => setFilters(p => ({ ...p, withChecklist: e.target.value }))}
            style={{ ...S.input, background: "#fff" }}>
            <option value="">All Assets</option>
            <option value="true">Already has checklist</option>
          </select>
        </div>

        {/* Right: assets table */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div style={{ fontSize: "13px", color: "#475569" }}>
              <strong>{assets.length}</strong> assets · <strong>{selectedAssets.size}</strong> selected
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <button style={S.btn()} onClick={toggleAll}>{selectedAssets.size === assets.length ? "Deselect All" : "Select All"}</button>
              <button style={{ ...S.btn("primary"), opacity: assigning || !selectedAssets.size || !selectedCL ? 0.6 : 1 }}
                onClick={assign} disabled={assigning || !selectedAssets.size || !selectedCL}>
                {assigning ? "Assigning…" : `Assign to ${selectedAssets.size} Asset${selectedAssets.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
          {err && <div style={{ padding: "10px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "13px", marginBottom: "10px" }}>{err}</div>}
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "480px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  <th style={S.th}><input type="checkbox" checked={assets.length > 0 && selectedAssets.size === assets.length} onChange={toggleAll} /></th>
                  {["Asset","ID","Dept","Location","Current Checklist","Last PMS"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {assets.map((a, i) => (
                  <tr key={a.id} style={{ background: selectedAssets.has(a.id) ? "#eff6ff" : (i % 2 === 0 ? "#fff" : "#fafafa"), cursor: "pointer" }}
                    onClick={() => setSelectedAssets(p => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}>
                    <td style={S.td}><input type="checkbox" checked={selectedAssets.has(a.id)} readOnly /></td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{a.assetName}</td>
                    <td style={S.td}><code style={{ fontSize: "11px", background: "#f1f5f9", padding: "1px 5px", borderRadius: "4px" }}>{a.assetUniqueId || "—"}</code></td>
                    <td style={S.td}>{a.departmentName || "—"}</td>
                    <td style={S.td}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                    <td style={S.td}>{a.checklistName ? <span style={S.badge("green")}>{a.checklistCode}</span> : <span style={S.badge("gray")}>None</span>}</td>
                    <td style={S.td}>{a.lastPmsDate || "—"}</td>
                  </tr>
                ))}
                {assets.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No assets found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Schedules Tab ────────────────────────────────────────────────────────────
function SchedulesTab({ token }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null); // null | "create" | {view: schedule}
  const [toast, setToast]         = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch("GET", "/api/company-portal/pms/schedules", null, token); setSchedules(d); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const del = async (id) => {
    if (!window.confirm("Delete this schedule?")) return;
    try { await apiFetch("DELETE", `/api/company-portal/pms/schedules/${id}`, null, token); showToast("Deleted."); load(); }
    catch (e) { alert(e.message); }
  };

  const statusColor = (s) => s === "scheduled" ? "blue" : s === "completed" ? "green" : s === "in_progress" ? "gray" : "red";

  return (
    <div>
      {toast && <div style={{ position: "fixed", bottom: "24px", right: "24px", background: "#0f172a", color: "#fff", padding: "12px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, zIndex: 999 }}>{toast}</div>}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
        <button style={S.btn("primary")} onClick={() => setModal("create")}>+ Create PMS Schedule</button>
      </div>

      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>Loading…</div>
        ) : schedules.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📅</div>
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>No schedules yet</div>
            <div style={{ fontSize: "13px" }}>Click <strong>+ Create PMS Schedule</strong> to schedule maintenance jobs.</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Schedule #","Date","Engineer","Assets","Progress","Status","Actions"].map(h =>
                  <th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, i) => {
                const pct = s.totalAssets > 0 ? Math.round((Number(s.completedAssets) / Number(s.totalAssets)) * 100) : 0;
                return (
                  <tr key={s.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={S.td}><code style={{ fontSize: "11px", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>{s.schedule_number}</code></td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{s.maintenance_date}</td>
                    <td style={S.td}>{s.engineer_name || "—"}</td>
                    <td style={S.td}><strong>{s.totalAssets}</strong> assets</td>
                    <td style={S.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, background: "#e2e8f0", borderRadius: "100px", height: "6px" }}>
                          <div style={{ width: `${pct}%`, background: "#16a34a", borderRadius: "100px", height: "6px" }} />
                        </div>
                        <span style={{ fontSize: "11px", color: "#64748b" }}>{pct}%</span>
                      </div>
                    </td>
                    <td style={S.td}><span style={S.badge(statusColor(s.status))}>{s.status}</span></td>
                    <td style={{ ...S.td, whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "12px" }}
                          onClick={() => setModal({ view: s })}>View</button>
                        <button style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: "12px" }}
                          onClick={() => del(s.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal === "create" && (
        <Modal title="Create PMS Schedule" onClose={() => setModal(null)} maxWidth={1000}>
          <CreateScheduleForm token={token} onSave={() => { setModal(null); showToast("Schedule created!"); load(); }} onCancel={() => setModal(null)} />
        </Modal>
      )}

      {modal?.view && (
        <Modal title={`Schedule ${modal.view.schedule_number}`} onClose={() => setModal(null)} maxWidth={900}>
          <ScheduleDetailView scheduleId={modal.view.id} token={token} />
        </Modal>
      )}
    </div>
  );
}

// ─── Create Schedule Form (4-step wizard) ────────────────────────────────────
function CreateScheduleForm({ token, onSave, onCancel }) {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState("");
  const [engineer, setEngineer] = useState({ id: "", name: "" });
  const [engineers, setEngineers] = useState([]);
  const [assets, setAssets] = useState([]);
  const [allAssets, setAllAssets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [assetFilters, setAssetFilters] = useState({ search: "", departmentId: "", assetCategory: "", building: "" });
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch("GET", "/api/company-portal/pms/engineers", null, token).then(setEngineers).catch(() => {});
    apiFetch("GET", "/api/company-portal/departments", null, token).then(d => setDepartments(d || [])).catch(() => {});
  }, [token]);

  useEffect(() => {
    const qs = new URLSearchParams();
    Object.entries(assetFilters).forEach(([k, v]) => v && qs.append(k, v));
    apiFetch("GET", `/api/company-portal/pms/assets?${qs}`, null, token).then(rows => { setAllAssets(rows); setAssets(rows); }).catch(() => {});
  }, [token, assetFilters]);

  const toggleAll = () => {
    if (selectedAssets.size === assets.length) setSelectedAssets(new Set());
    else setSelectedAssets(new Set(assets.map(a => a.id)));
  };

  const save = async () => {
    setSaving(true); setErr("");
    try {
      await apiFetch("POST", "/api/company-portal/pms/schedules", {
        maintenanceDate: date,
        engineerId: engineer.id || null,
        engineerName: engineer.name || null,
        notes,
        assetIds: [...selectedAssets],
      }, token);
      onSave();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const stepLabel = (n, label) => (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{ width: "28px", height: "28px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700,
        background: step === n ? "#2563eb" : step > n ? "#16a34a" : "#e2e8f0",
        color: step >= n ? "#fff" : "#64748b" }}>{step > n ? "✓" : n}</div>
      <span style={{ fontSize: "13px", fontWeight: step === n ? 700 : 500, color: step === n ? "#0f172a" : "#64748b" }}>{label}</span>
    </div>
  );

  return (
    <div>
      {/* Step indicators */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "28px", padding: "16px 20px", background: "#f8fafc", borderRadius: "10px", flexWrap: "wrap" }}>
        {stepLabel(1, "Maintenance Date")}
        <div style={{ color: "#e2e8f0", alignSelf: "center" }}>→</div>
        {stepLabel(2, "Select Engineer")}
        <div style={{ color: "#e2e8f0", alignSelf: "center" }}>→</div>
        {stepLabel(3, "Select Assets")}
        <div style={{ color: "#e2e8f0", alignSelf: "center" }}>→</div>
        {stepLabel(4, "Review & Assign")}
      </div>

      {err && <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}

      {/* Step 1 */}
      {step === 1 && (
        <div style={{ maxWidth: "420px" }}>
          <Field label="Maintenance Date" required>
            <Inp type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: "15px" }} />
          </Field>
          <Field label="Notes (optional)">
            <Txt value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for this schedule…" rows={2} />
          </Field>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div>
          <div style={{ marginBottom: "12px", fontSize: "13px", color: "#475569" }}>Select the engineer responsible for this PMS run.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px", maxHeight: "360px", overflowY: "auto" }}>
            {engineers.map(eng => (
              <div key={eng.id} onClick={() => setEngineer({ id: eng.id, name: eng.fullName })}
                style={{ padding: "14px 16px", borderRadius: "10px", border: `2px solid ${engineer.id === eng.id ? "#2563eb" : "#e2e8f0"}`, cursor: "pointer", background: engineer.id === eng.id ? "#eff6ff" : "#fff" }}>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>{eng.fullName}</div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>{eng.designation || eng.role} {eng.departmentName ? `• ${eng.departmentName}` : ""}</div>
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>Workload: {eng.currentWorkload} pending</div>
              </div>
            ))}
            {engineers.length === 0 && (
              <div style={{ padding: "32px", color: "#94a3b8", textAlign: "center", gridColumn: "1/-1" }}>No engineers found. You can proceed without selecting one.</div>
            )}
          </div>
          {engineer.id && <div style={{ marginTop: "12px", padding: "10px 14px", background: "#eff6ff", borderRadius: "8px", fontSize: "13px", color: "#1d4ed8" }}>Selected: <strong>{engineer.name}</strong></div>}
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" }}>
            <input value={assetFilters.search} onChange={e => setAssetFilters(p => ({ ...p, search: e.target.value }))}
              placeholder="Search assets…" style={{ ...S.input, maxWidth: "200px" }} />
            <select value={assetFilters.departmentId} onChange={e => setAssetFilters(p => ({ ...p, departmentId: e.target.value }))}
              style={{ ...S.input, maxWidth: "160px", background: "#fff" }}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <select value={assetFilters.assetCategory} onChange={e => setAssetFilters(p => ({ ...p, assetCategory: e.target.value }))}
              style={{ ...S.input, maxWidth: "150px", background: "#fff" }}>
              <option value="">All Categories</option>
              {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: "#475569" }}><strong>{selectedAssets.size}</strong> selected</span>
              <button style={S.btn()} onClick={toggleAll}>{selectedAssets.size === assets.length ? "Deselect All" : "Select All"}</button>
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "400px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  <th style={S.th}><input type="checkbox" checked={assets.length > 0 && selectedAssets.size === assets.length} onChange={toggleAll} /></th>
                  {["Asset","ID","Department","Location","Checklist","Last PMS","Next Due"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {assets.map((a, i) => (
                  <tr key={a.id} style={{ background: selectedAssets.has(a.id) ? "#eff6ff" : (i % 2 === 0 ? "#fff" : "#fafafa"), cursor: "pointer" }}
                    onClick={() => setSelectedAssets(p => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}>
                    <td style={S.td}><input type="checkbox" checked={selectedAssets.has(a.id)} readOnly /></td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{a.assetName}</td>
                    <td style={S.td}><code style={{ fontSize: "11px" }}>{a.assetUniqueId || "—"}</code></td>
                    <td style={S.td}>{a.departmentName || "—"}</td>
                    <td style={S.td}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                    <td style={S.td}>{a.checklistName ? <span style={S.badge("green")}>{a.checklistCode}</span> : <span style={S.badge("gray")}>None</span>}</td>
                    <td style={S.td}>{a.lastPmsDate || "—"}</td>
                    <td style={S.td}>{a.nextPmsDue || "—"}</td>
                  </tr>
                ))}
                {assets.length === 0 && <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No assets found.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div style={{ ...S.card, background: "#f0fdf4" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#15803d", textTransform: "uppercase", marginBottom: "6px" }}>Date</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{date || "—"}</div>
            </div>
            <div style={{ ...S.card, background: "#eff6ff" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", marginBottom: "6px" }}>Engineer</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{engineer.name || "Not assigned"}</div>
            </div>
            <div style={{ ...S.card, background: "#fef9c3" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#a16207", textTransform: "uppercase", marginBottom: "6px" }}>Assets Selected</div>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a" }}>{selectedAssets.size}</div>
            </div>
          </div>
          {notes && <div style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", fontSize: "13px", color: "#475569", marginBottom: "16px" }}><strong>Notes:</strong> {notes}</div>}
          <div style={{ padding: "12px 16px", background: "#fef9c3", borderRadius: "8px", fontSize: "13px", color: "#78350f" }}>
            ⚠️ This will create PMS jobs for <strong>{selectedAssets.size} assets</strong> scheduled for <strong>{date}</strong>. Assets without a linked checklist will also be included.
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
        <div>
          {step > 1 && <button style={S.btn("ghost")} onClick={() => setStep(s => s - 1)}>← Back</button>}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button style={S.btn("ghost")} onClick={onCancel}>Cancel</button>
          {step < 4 ? (
            <button style={S.btn("primary")} onClick={() => {
              if (step === 1 && !date) { setErr("Please select a maintenance date."); return; }
              setErr(""); setStep(s => s + 1);
            }}>Next →</button>
          ) : (
            <button style={{ ...S.btn("success"), opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>
              {saving ? "Creating…" : "✓ Create Schedule"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Detail View ─────────────────────────────────────────────────────
function ScheduleDetailView({ scheduleId, token }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch("GET", `/api/company-portal/pms/schedules/${scheduleId}`, null, token).then(setData).catch(() => {});
  }, [scheduleId, token]);

  if (!data) return <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</div>;

  const pct = data.assets?.length > 0
    ? Math.round((data.assets.filter(a => a.status === "completed").length / data.assets.length) * 100)
    : 0;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Date", value: data.maintenance_date, color: "#eff6ff", tc: "#1d4ed8" },
          { label: "Engineer", value: data.engineer_name || "—", color: "#f0fdf4", tc: "#15803d" },
          { label: "Total Assets", value: data.assets?.length || 0, color: "#fef9c3", tc: "#a16207" },
          { label: "Progress", value: `${pct}%`, color: "#f5f3ff", tc: "#7c3aed" },
        ].map(c => (
          <div key={c.label} style={{ ...S.card, background: c.color }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: c.tc, textTransform: "uppercase", marginBottom: "4px" }}>{c.label}</div>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{c.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "400px", overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
              {["Asset","ID","Dept","Location","Checklist","Status"].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(data.assets || []).map((a, i) => (
              <tr key={a.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                <td style={{ ...S.td, fontWeight: 600 }}>{a.assetName}</td>
                <td style={S.td}><code style={{ fontSize: "11px" }}>{a.assetUniqueId || "—"}</code></td>
                <td style={S.td}>{a.departmentName || "—"}</td>
                <td style={S.td}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                <td style={S.td}>{a.checklistName ? <span style={S.badge("green")}>{a.checklistCode}</span> : <span style={S.badge("gray")}>None</span>}</td>
                <td style={S.td}><span style={S.badge(a.status === "completed" ? "green" : a.status === "in_progress" ? "blue" : "gray")}>{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────
export default function PMSChecklistModule({ token, companyId }) {
  const [tab, setTab]             = useState("checklists");
  const [assignChecklist, setAssignChecklist] = useState(null);

  const tabBtn = (key, label) => (
    <button onClick={() => setTab(key)} style={{
      padding: "8px 18px", borderRadius: "8px", border: "none", cursor: "pointer",
      fontSize: "13px", fontWeight: 700,
      background: tab === key ? "#2563eb" : "#f1f5f9",
      color: tab === key ? "#fff" : "#475569",
    }}>{label}</button>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "4px" }}>Preventive Maintenance System</h1>
        <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Create reusable PMS checklists, assign them to assets, and schedule maintenance jobs.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px" }}>
        {tabBtn("checklists", "📋 Checklists")}
        {tabBtn("assign", "🔗 Assign to Assets")}
        {tabBtn("schedules", "📅 Schedules")}
      </div>

      {tab === "checklists" && (
        <ChecklistsTab token={token} companyId={companyId}
          onAssignClick={(cl) => { setAssignChecklist(cl); setTab("assign"); }} />
      )}
      {tab === "assign" && (
        <AssignTab token={token} initialChecklist={assignChecklist}
          onDone={() => setAssignChecklist(null)} />
      )}
      {tab === "schedules" && (
        <SchedulesTab token={token} />
      )}
    </div>
  );
}
