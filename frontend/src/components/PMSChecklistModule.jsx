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
  const blank = { checklistName: "", description: "", status: "active" };

  // Normalize API snake_case → form camelCase
  const normalize = (data) => ({
    ...blank,
    ...data,
    checklistName: data?.checklistName || data?.checklist_name || "",
    description:   data?.description || "",
    status:        data?.status || "active",
  });
  const normalizeItems = (arr) =>
    Array.isArray(arr) ? arr.map(it => ({
      inspectionPoint: it.inspectionPoint || it.inspection_point || "",
      checkType:       it.checkType       || it.check_type        || "Visual Inspection",
      responseType:    it.responseType    || it.response_type     || "Pass/Fail",
      isMandatory:     it.isMandatory     != null ? it.isMandatory     : (it.is_mandatory     ?? 1),
      remarksRequired: it.remarksRequired != null ? it.remarksRequired : (it.remarks_required ?? 0),
      photoRequired:   it.photoRequired   != null ? it.photoRequired   : (it.photo_required   ?? 0),
      toleranceValue:  it.toleranceValue  || it.tolerance_value  || "",
    })) : [];

  const [form, setForm] = useState(normalize(initial));
  const [items, setItems] = useState(normalizeItems(initial?.items));
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div style={{ gridColumn: "span 2" }}>
              <Field label="Checklist Name" required>
                <Inp value={form.checklistName} onChange={e => up("checklistName", e.target.value)} placeholder="e.g. ECG Machine PMS Checklist" style={{ fontSize: "14px" }} />
              </Field>
            </div>
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
            <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Checklist Questions <span style={{ ...S.badge("blue"), fontSize: "12px" }}>{items.length}</span></div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>Add inspection questions — each question is one step in the maintenance procedure</div>
          </div>
          <button style={S.btn("primary")} onClick={addItem}>+ Add Question</button>
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
              <div style={{ fontWeight: 700, marginBottom: "6px", color: "#64748b" }}>No questions yet</div>
              <div style={{ fontSize: "13px", marginBottom: "16px" }}>Add inspection questions to build the checklist procedure.</div>
              <button style={S.btn("primary")} onClick={addItem}>+ Add First Question</button>
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
                  {["Code","Name","Frequency","Questions","Status","Actions"].map(h =>
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
                    <td style={S.td}><span style={S.badge("blue")}>{cl.frequency}</span></td>
                    <td style={S.td}><span style={{ fontWeight: 700 }}>{cl.itemCount}</span> questions</td>
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
            {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
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
                {assets.map((a, i) => {
                  const hasChecklist = !!a.checklistName;
                  return (
                    <tr key={a.id} style={{ background: selectedAssets.has(a.id) ? "#eff6ff" : hasChecklist ? "#f0fdf4" : (i % 2 === 0 ? "#fff" : "#fafafa"), cursor: "pointer" }}
                      onClick={() => setSelectedAssets(p => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}>
                      <td style={S.td}><input type="checkbox" checked={selectedAssets.has(a.id)} readOnly /></td>
                      <td style={{ ...S.td, fontWeight: 600 }}>{a.assetName}</td>
                      <td style={S.td}><code style={{ fontSize: "11px", background: "#f1f5f9", padding: "1px 5px", borderRadius: "4px" }}>{a.generatedAssetId || a.assetUniqueId || "—"}</code></td>
                      <td style={S.td}>{a.departmentName || "—"}</td>
                      <td style={S.td}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                      <td style={S.td}>
                        {hasChecklist
                          ? <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><span style={S.badge("green")}>{a.checklistCode}</span><span style={{ fontSize: "10px", color: "#15803d", fontWeight: 700 }}>✓ Assigned</span></span>
                          : <span style={S.badge("gray")}>None</span>}
                      </td>
                      <td style={S.td}>{a.lastPmsDate || "—"}</td>
                    </tr>
                  );
                })}
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

// ─── Schedules Tab (Calendar View) ───────────────────────────────────────────
const STATUS_COLORS = {
  scheduled:   { bg: "#dbeafe", text: "#1d4ed8", border: "#bfdbfe", dot: "#2563eb",  label: "Scheduled"   },
  in_progress: { bg: "#ffedd5", text: "#c2410c", border: "#fed7aa", dot: "#ea580c",  label: "In Progress" },
  completed:   { bg: "#dcfce7", text: "#15803d", border: "#bbf7d0", dot: "#16a34a",  label: "Completed"   },
  overdue:     { bg: "#fee2e2", text: "#dc2626", border: "#fecaca", dot: "#dc2626",  label: "Overdue"     },
  cancelled:   { bg: "#f1f5f9", text: "#64748b", border: "#e2e8f0", dot: "#94a3b8",  label: "Cancelled"   },
  missed:      { bg: "#fce7f3", text: "#be123c", border: "#fbcfe8", dot: "#e11d48",  label: "Missed"      },
};
const getStatusColor = (status) => STATUS_COLORS[status] || STATUS_COLORS.scheduled;

// Returns all occurrence dates of a recurring schedule within [windowStart, windowEnd]
function getOccurrencesInWindow(origDateStr, frequency, windowStart, windowEnd) {
  const dates = [];
  const [y, m, d] = origDateStr.split('-').map(Number);
  let cur = new Date(y, m - 1, d);
  // Use local-time formatting to avoid UTC offset shifting the date back a day
  const pad = n => String(n).padStart(2, '0');
  const fmtLocal = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  while (fmtLocal(cur) <= windowEnd) {
    const iso = fmtLocal(cur);
    if (iso >= windowStart) dates.push(iso);
    if (frequency === 'Monthly')      cur = new Date(cur.getFullYear(), cur.getMonth() + 1,  d);
    else if (frequency === 'Quarterly')    cur = new Date(cur.getFullYear(), cur.getMonth() + 3,  d);
    else if (frequency === 'Half-Yearly')  cur = new Date(cur.getFullYear(), cur.getMonth() + 6,  d);
    else if (frequency === 'Yearly')       cur = new Date(cur.getFullYear() + 1, cur.getMonth(), d);
    else break; // Custom / unknown — show once
  }
  return dates;
}

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function fmtDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonthCells(viewDate) {
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev  = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({ date: new Date(year, month - 1, daysInPrev - i), current: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: new Date(year, month, d), current: true });
  const rem = 42 - cells.length;
  for (let d = 1; d <= rem; d++)
    cells.push({ date: new Date(year, month + 1, d), current: false });
  return cells;
}

function getWeekCells(viewDate) {
  const day = viewDate.getDay();
  const cells = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(viewDate);
    d.setDate(viewDate.getDate() - day + i);
    cells.push({ date: d, current: true });
  }
  return cells;
}

function CalEventCard({ ev, onClick }) {
  const sc = getStatusColor(ev.status);
  return (
    <div
      onClick={() => onClick(ev.id)}
      style={{
        marginBottom: "3px", padding: "4px 7px", borderRadius: "6px",
        background: sc.bg, border: `1px solid ${sc.border}`,
        cursor: "pointer", transition: "transform 0.12s, box-shadow 0.12s",
        opacity: ev._isRecurring ? 0.82 : 1,
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.02)"; e.currentTarget.style.boxShadow = "0 3px 10px rgba(0,0,0,0.13)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
        <div style={{ fontSize: "11px", fontWeight: 700, color: sc.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {ev.schedule_number}
        </div>
        {ev._isRecurring && <span title="Recurring" style={{ fontSize: "10px", color: sc.text, opacity: 0.7 }}>↻</span>}
      </div>
      <div style={{ display: "flex", gap: "5px", paddingLeft: "10px", alignItems: "center" }}>
        {ev.engineer_name ? (
          <div style={{ fontSize: "10px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {ev.engineer_name}
          </div>
        ) : (
          <div style={{ fontSize: "10px", color: "#cbd5e1", fontStyle: "italic", flex: 1 }}>Unassigned</div>
        )}
        {ev.totalAssets > 0 && (
          <div style={{ fontSize: "10px", fontWeight: 700, color: sc.text, whiteSpace: "nowrap",
            background: "rgba(255,255,255,0.7)", padding: "0 4px", borderRadius: "3px" }}>
            {ev.totalAssets} assets
          </div>
        )}
      </div>
    </div>
  );
}

function SchedulesTab({ token }) {
  const [schedules,      setSchedules]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [viewDate,       setViewDate]       = useState(new Date());
  const [calView,        setCalView]        = useState("month");
  const [modal,          setModal]          = useState(null);
  const [drawerSchId,    setDrawerSchId]    = useState(null);
  const [drawerData,     setDrawerData]     = useState(null);
  const [drawerLoading,  setDrawerLoading]  = useState(false);
  const [drawerEngineers,setDrawerEngineers]= useState([]);
  const [selEngineer,    setSelEngineer]    = useState({ id: "", name: "" });
  const [savingEng,      setSavingEng]      = useState(false);
  const [assetEngMap,    setAssetEngMap]    = useState({});
  const [savingAssetEng, setSavingAssetEng] = useState({});
  const [selectedPsaIds, setSelectedPsaIds] = useState(new Set());
  const [bulkEngId,      setBulkEngId]      = useState("");
  const [bulkSaving,     setBulkSaving]     = useState(false);
  const [dayPopup,       setDayPopup]       = useState(null);
  const [toast,          setToast]          = useState("");
  const [filters,        setFilters]        = useState({ search: "", engineer: "", status: "" });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch("GET", "/api/company-portal/pms/schedules", null, token);
      setSchedules(d);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!drawerSchId) { setDrawerData(null); setDrawerEngineers([]); return; }
    setDrawerLoading(true);
    Promise.all([
      apiFetch("GET", `/api/company-portal/pms/schedules/${drawerSchId}`, null, token),
      apiFetch("GET", "/api/company-portal/pms/engineers", null, token),
    ]).then(([schData, engs]) => {
      setDrawerData(schData);
      setDrawerEngineers(engs || []);
      setSelEngineer({ id: schData.engineer_id || "", name: schData.engineer_name || "" });
      // Build per-asset engineer map
      const engMap = {};
      (schData.assets || []).forEach(a => {
        engMap[a.id] = { id: a.engineer_id || "", name: a.engineer_name || "" };
      });
      setAssetEngMap(engMap);
      setSelectedPsaIds(new Set());
      setBulkEngId("");
    }).catch(() => {}).finally(() => setDrawerLoading(false));
  }, [drawerSchId, token]);

  const assignEngineer = async () => {
    setSavingEng(true);
    try {
      await apiFetch("PUT", `/api/company-portal/pms/schedules/${drawerSchId}`, {
        engineerId: selEngineer.id || null,
        engineerName: selEngineer.name || null,
      }, token);
      setDrawerData(p => ({ ...p, engineer_id: selEngineer.id, engineer_name: selEngineer.name }));
      showToast("Engineer assigned!");
      load();
    } catch (e) { alert(e.message); }
    finally { setSavingEng(false); }
  };

  const saveAssetEngineer = async (psaId) => {
    setSavingAssetEng(p => ({ ...p, [psaId]: true }));
    try {
      const eng = assetEngMap[psaId] || {};
      await apiFetch("PATCH", `/api/company-portal/pms/schedule-assets/${psaId}`, {
        engineerId: eng.id || null,
        engineerName: eng.name || null,
      }, token);
      showToast("Engineer assigned to asset!");
    } catch (e) { alert(e.message); }
    finally { setSavingAssetEng(p => ({ ...p, [psaId]: false })); }
  };

  const bulkSaveAssetEngineers = async () => {
    if (!bulkEngId && bulkEngId !== "0") return;
    const ids = [...selectedPsaIds];
    if (ids.length === 0) return;
    const eng = drawerEngineers.find(e => String(e.id) === String(bulkEngId));
    const engineerId = bulkEngId || null;
    const engineerName = eng?.fullName || null;
    setBulkSaving(true);
    try {
      await Promise.all(ids.map(psaId =>
        apiFetch("PATCH", `/api/company-portal/pms/schedule-assets/${psaId}`, { engineerId, engineerName }, token)
      ));
      // Update local assetEngMap for all selected IDs
      setAssetEngMap(p => {
        const next = { ...p };
        ids.forEach(id => { next[id] = { id: engineerId || "", name: engineerName || "" }; });
        return next;
      });
      setSelectedPsaIds(new Set());
      setBulkEngId("");
      showToast(`Engineer assigned to ${ids.length} asset(s)!`);
    } catch (e) { alert(e.message); }
    finally { setBulkSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this schedule?")) return;
    try {
      await apiFetch("DELETE", `/api/company-portal/pms/schedules/${id}`, null, token);
      showToast("Schedule deleted.");
      if (drawerSchId === id) setDrawerSchId(null);
      load();
    } catch (e) { alert(e.message); }
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const todayStr = fmtDateKey(new Date());

  const filtered = schedules.filter(s => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!s.schedule_number?.toLowerCase().includes(q) && !s.engineer_name?.toLowerCase().includes(q)) return false;
    }
    if (filters.engineer && s.engineer_name !== filters.engineer) return false;
    if (filters.status   && s.status !== filters.status)          return false;
    return true;
  });

  const engineers = [...new Set(schedules.map(s => s.engineer_name).filter(Boolean))];

  const stats = {
    total:     schedules.length,
    todayCount:schedules.filter(s => (s.maintenance_date || "").startsWith(todayStr)).length,
    completed: schedules.filter(s => s.status === "completed").length,
    pending:   schedules.filter(s => s.status === "scheduled").length,
    overdue:   schedules.filter(s => s.status === "overdue" ||
               (s.status === "scheduled" && (s.maintenance_date || "").split("T")[0] < todayStr)).length,
    pct: schedules.length > 0 ? Math.round(schedules.filter(s => s.status === "completed").length / schedules.length * 100) : 0,
  };

  // Build date → events map
  // Real recurring occurrence rows are now created in DB, so no virtual projection needed
  const calMap = {};
  filtered.forEach(s => {
    const key = (s.maintenance_date || "").split("T")[0];
    if (!key) return;
    if (!calMap[key]) calMap[key] = [];
    // Mark as "generated recurring" if it has a recurring_group_id and occurrence_index > 0
    const isGenerated = s.recurring_group_id && s.occurrence_index > 0;
    calMap[key].push({ ...s, _displayDate: key, _isRecurring: isGenerated });
  });

  // ── Calendar cells ────────────────────────────────────────────────────────
  const monthCells = getMonthCells(viewDate);
  const weekCells  = getWeekCells(viewDate);

  const prevPeriod = () => {
    if (calView === "month") setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    else if (calView === "week") setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
    else setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  };
  const nextPeriod = () => {
    if (calView === "month") setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    else if (calView === "week") setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
    else setViewDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  };
  const goToday = () => setViewDate(new Date());

  const periodLabel = () => {
    if (calView === "month") return `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
    if (calView === "week") {
      const wc = getWeekCells(viewDate);
      return `${MONTH_NAMES[wc[0].date.getMonth()]} ${wc[0].date.getDate()} – ${wc[6].date.getDate()}, ${wc[6].date.getFullYear()}`;
    }
    return `${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getDate()}, ${viewDate.getFullYear()}`;
  };

  const VISIBLE_EVENTS = 2;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative" }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", background: "#0f172a", color: "#fff",
          padding: "12px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
          {toast}
        </div>
      )}

      {/* ── KPI Stats ──────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: "12px", marginBottom: "20px" }}>
        {[
          { label: "Total PMS",   value: stats.total,      icon: "📋", bg: "#eff6ff", tc: "#1d4ed8" },
          { label: "Today",       value: stats.todayCount, icon: "📅", bg: "#f0fdf4", tc: "#15803d" },
          { label: "Completed",   value: stats.completed,  icon: "✅", bg: "#dcfce7", tc: "#15803d" },
          { label: "Pending",     value: stats.pending,    icon: "⏳", bg: "#fef9c3", tc: "#a16207" },
          { label: "Overdue",     value: stats.overdue,    icon: "🚨", bg: "#fee2e2", tc: "#dc2626" },
          { label: "Completion",  value: `${stats.pct}%`,  icon: "📊", bg: "#f5f3ff", tc: "#7c3aed" },
        ].map(c => (
          <div key={c.label} style={{ background: c.bg, borderRadius: "14px", padding: "14px 16px", border: `1px solid ${c.bg}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px" }}>
              <span style={{ fontSize: "16px" }}>{c.icon}</span>
              <span style={{ fontSize: "10px", fontWeight: 700, color: c.tc, textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</span>
            </div>
            <div style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "12px 16px",
        marginBottom: "14px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        <input value={filters.search}
          onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
          placeholder="🔍  Search schedule or engineer…"
          style={{ ...S.input, maxWidth: "230px" }} />
        <select value={filters.engineer}
          onChange={e => setFilters(p => ({ ...p, engineer: e.target.value }))}
          style={{ ...S.input, maxWidth: "180px", background: "#fff" }}>
          <option value="">All Engineers</option>
          {engineers.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={filters.status}
          onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
          style={{ ...S.input, maxWidth: "160px", background: "#fff" }}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_COLORS).map(([k, v]) =>
            <option key={k} value={k}>{v.label}</option>)}
        </select>
        {(filters.search || filters.engineer || filters.status) && (
          <button style={S.btn("ghost")} onClick={() => setFilters({ search: "", engineer: "", status: "" })}>✕ Reset</button>
        )}
        <div style={{ marginLeft: "auto" }}>
          <button style={S.btn("primary")} onClick={() => setModal("create")}>+ Create PMS Schedule</button>
        </div>
      </div>

      {/* ── Legend ─────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "14px", flexWrap: "wrap", alignItems: "center" }}>
        {Object.entries(STATUS_COLORS).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "#64748b" }}>
            <div style={{ width: "9px", height: "9px", borderRadius: "50%", background: v.dot }} />
            {v.label}
          </div>
        ))}
      </div>

      {/* ── Calendar Container ──────────────────────────────────────────────── */}
      <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #e2e8f0",
        overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>

        {/* Calendar Header Nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button onClick={prevPeriod}
              style={{ width: "34px", height: "34px", borderRadius: "8px", border: "1px solid #e2e8f0",
                background: "#fff", cursor: "pointer", fontSize: "18px", display: "flex", alignItems: "center",
                justifyContent: "center", color: "#374151" }}>‹</button>
            <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", minWidth: "230px", textAlign: "center" }}>
              {periodLabel()}
            </div>
            <button onClick={nextPeriod}
              style={{ width: "34px", height: "34px", borderRadius: "8px", border: "1px solid #e2e8f0",
                background: "#fff", cursor: "pointer", fontSize: "18px", display: "flex", alignItems: "center",
                justifyContent: "center", color: "#374151" }}>›</button>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button onClick={goToday} style={{ ...S.btn("ghost"), fontWeight: 700 }}>Today</button>
            <div style={{ display: "flex", background: "#e2e8f0", borderRadius: "8px", padding: "2px" }}>
              {["month","week","day"].map(v => (
                <button key={v} onClick={() => setCalView(v)}
                  style={{ padding: "5px 14px", borderRadius: "6px", border: "none", cursor: "pointer",
                    fontSize: "12px", fontWeight: 700, textTransform: "capitalize",
                    background: calView === v ? "#fff" : "transparent",
                    color: calView === v ? "#0f172a" : "#64748b",
                    boxShadow: calView === v ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                    transition: "all 0.15s" }}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "80px", textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📅</div>
            <div style={{ fontWeight: 600 }}>Loading schedules…</div>
          </div>
        ) : (
          <>
            {/* ── Month View ──────────────────────────────────────────────── */}
            {calView === "month" && (
              <>
                {/* Day name headers */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid #e2e8f0" }}>
                  {DAY_NAMES.map(d => (
                    <div key={d} style={{ padding: "10px 8px", textAlign: "center",
                      fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em",
                      background: d === "Sun" || d === "Sat" ? "#fafbfc" : "#fff",
                      borderRight: "1px solid #f1f5f9" }}>
                      {d}
                    </div>
                  ))}
                </div>
                {/* Date cells */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
                  {monthCells.map((cell, idx) => {
                    const dateStr = fmtDateKey(cell.date);
                    const events  = calMap[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    const isWeekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
                    const visible = events.slice(0, VISIBLE_EVENTS);
                    const overflow = events.length - VISIBLE_EVENTS;
                    return (
                      <div key={idx} style={{
                        minHeight: "120px", padding: "8px 7px",
                        borderRight: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9",
                        background: !cell.current ? "#fafafa" : isToday ? "#fffbeb" : isWeekend ? "#fdfdfd" : "#fff",
                        opacity: cell.current ? 1 : 0.45,
                        transition: "background 0.15s",
                      }}>
                        <div style={{ marginBottom: "5px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: "26px", height: "26px", borderRadius: "50%", fontSize: "13px",
                            fontWeight: isToday ? 800 : 600,
                            background: isToday ? "#2563eb" : "transparent",
                            color: isToday ? "#fff" : cell.current ? "#0f172a" : "#cbd5e1",
                            boxShadow: isToday ? "0 2px 8px rgba(37,99,235,0.35)" : "none",
                          }}>
                            {cell.date.getDate()}
                          </span>
                          {events.length > 0 && (
                            <span style={{ fontSize: "10px", color: "#94a3b8", marginLeft: "4px" }}>
                              {events.length} job{events.length > 1 ? "s" : ""} · {events.reduce((s, e) => s + (Number(e.totalAssets) || 0), 0)} assets
                            </span>
                          )}
                        </div>
                        {visible.map(ev => (
                          <CalEventCard key={ev.id} ev={ev} onClick={setDrawerSchId} />
                        ))}
                        {overflow > 0 && (
                          <div onClick={() => setDayPopup({ date: dateStr, events })}
                            style={{ fontSize: "11px", fontWeight: 700, color: "#2563eb", cursor: "pointer",
                              padding: "2px 6px", borderRadius: "4px", display: "inline-block",
                              transition: "background 0.12s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = "#eff6ff"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                            +{overflow} more
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── Week View ──────────────────────────────────────────────── */}
            {calView === "week" && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid #e2e8f0" }}>
                  {weekCells.map((cell, idx) => {
                    const dateStr = fmtDateKey(cell.date);
                    const isToday = dateStr === todayStr;
                    return (
                      <div key={idx} style={{ padding: "12px 8px", textAlign: "center",
                        borderRight: "1px solid #f1f5f9",
                        background: isToday ? "#eff6ff" : cell.date.getDay() === 0 || cell.date.getDay() === 6 ? "#fafbfc" : "#fff" }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {DAY_NAMES[cell.date.getDay()]}
                        </div>
                        <div style={{ marginTop: "4px" }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: "30px", height: "30px", borderRadius: "50%", fontSize: "15px", fontWeight: 700,
                            background: isToday ? "#2563eb" : "transparent",
                            color: isToday ? "#fff" : "#0f172a",
                            boxShadow: isToday ? "0 2px 8px rgba(37,99,235,0.35)" : "none",
                          }}>{cell.date.getDate()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", minHeight: "400px" }}>
                  {weekCells.map((cell, idx) => {
                    const dateStr = fmtDateKey(cell.date);
                    const events  = calMap[dateStr] || [];
                    const isToday = dateStr === todayStr;
                    return (
                      <div key={idx} style={{
                        padding: "10px 8px", borderRight: "1px solid #f1f5f9",
                        background: isToday ? "#fffbeb" : cell.date.getDay() === 0 || cell.date.getDay() === 6 ? "#fdfdfd" : "#fff",
                        minHeight: "300px",
                      }}>
                        {events.map(ev => <CalEventCard key={ev.id} ev={ev} onClick={setDrawerSchId} />)}
                        {events.length === 0 && (
                          <div style={{ fontSize: "11px", color: "#e2e8f0", textAlign: "center", marginTop: "24px" }}>—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── Day View ──────────────────────────────────────────────── */}
            {calView === "day" && (() => {
              const dateStr = fmtDateKey(viewDate);
              const events  = calMap[dateStr] || [];
              const isToday = dateStr === todayStr;
              return (
                <div style={{ padding: "24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "48px", height: "48px", borderRadius: "50%", fontSize: "22px", fontWeight: 800,
                      background: isToday ? "#2563eb" : "#f1f5f9",
                      color: isToday ? "#fff" : "#0f172a",
                      boxShadow: isToday ? "0 4px 14px rgba(37,99,235,0.35)" : "none",
                    }}>{viewDate.getDate()}</span>
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>
                        {DAY_NAMES[viewDate.getDay()]}, {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getDate()}, {viewDate.getFullYear()}
                      </div>
                      <div style={{ fontSize: "13px", color: "#64748b" }}>{events.length} maintenance job{events.length !== 1 ? "s" : ""} scheduled</div>
                    </div>
                  </div>
                  {events.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
                      <div style={{ fontSize: "40px", marginBottom: "10px" }}>🗓️</div>
                      <div style={{ fontWeight: 600 }}>No maintenance jobs scheduled for this day</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "720px" }}>
                      {events.map(ev => {
                        const sc = getStatusColor(ev.status);
                        const pct = ev.totalAssets > 0 ? Math.round(Number(ev.completedAssets) / Number(ev.totalAssets) * 100) : 0;
                        return (
                          <div key={ev.id} onClick={() => setDrawerSchId(ev.id)}
                            style={{ padding: "16px 20px", borderRadius: "12px", background: sc.bg, border: `1px solid ${sc.border}`,
                              cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", transition: "transform 0.12s, box-shadow 0.12s" }}
                            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.06)"; }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <code style={{ fontSize: "13px", fontWeight: 700, color: sc.text }}>{ev.schedule_number}</code>
                                <div style={{ fontSize: "13px", color: "#374151", marginTop: "4px" }}>👷 {ev.engineer_name || "No engineer"}</div>
                                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>📦 {ev.totalAssets} asset{ev.totalAssets !== 1 ? "s" : ""}</div>
                              </div>
                              <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "100px", fontSize: "11px", fontWeight: 700, background: "#fff", color: sc.text, border: `1px solid ${sc.border}` }}>
                                {sc.label}
                              </span>
                            </div>
                            <div style={{ marginTop: "12px" }}>
                              <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: "100px", height: "6px" }}>
                                <div style={{ width: `${pct}%`, background: sc.dot, borderRadius: "100px", height: "6px", transition: "width 0.6s ease" }} />
                              </div>
                              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px" }}>{pct}% complete</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* ── Day Popup ("+N more") ──────────────────────────────────────────── */}
      {dayPopup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 9000,
          display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setDayPopup(null)}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "24px", minWidth: "360px", maxWidth: "500px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.22)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>
                📅 {dayPopup.date} — {dayPopup.events.length} jobs
              </div>
              <button onClick={() => setDayPopup(null)} style={{ ...S.btn("ghost"), padding: "4px 8px", fontSize: "16px" }}>✕</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" }}>
              {dayPopup.events.map(ev => {
                const sc = getStatusColor(ev.status);
                return (
                  <div key={ev.id} onClick={() => { setDrawerSchId(ev.id); setDayPopup(null); }}
                    style={{ padding: "12px 14px", borderRadius: "10px", background: sc.bg, border: `1px solid ${sc.border}`, cursor: "pointer",
                      transition: "transform 0.1s" }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.01)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <code style={{ fontSize: "13px", fontWeight: 700, color: sc.text }}>{ev.schedule_number}</code>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: sc.text }}>{sc.label}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>
                      👷 {ev.engineer_name || "No engineer"} &nbsp;·&nbsp; 📦 {ev.totalAssets} assets
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Right-Side Drawer ─────────────────────────────────────────────── */}
      {/* Drawer backdrop */}
      {drawerSchId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.25)", zIndex: 7999 }}
          onClick={() => setDrawerSchId(null)} />
      )}
      <div style={{ position: "fixed", top: 0, right: drawerSchId ? 0 : "-500px", width: "480px",
        height: "100vh", background: "#fff", zIndex: 8000, transition: "right 0.3s cubic-bezier(0.4,0,0.2,1)",
        boxShadow: drawerSchId ? "-6px 0 40px rgba(0,0,0,0.15)" : "none",
        display: "flex", flexDirection: "column" }}>
        {drawerSchId && (
          <>
            {/* Drawer header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e2e8f0",
              background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase",
                  letterSpacing: "0.06em", marginBottom: "3px" }}>Schedule Details</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>
                  {drawerData?.schedule_number || "…"}
                </div>
                {drawerData && (() => {
                  const sc = getStatusColor(drawerData.status);
                  return (
                    <span style={{ display: "inline-block", marginTop: "6px", padding: "3px 10px", borderRadius: "100px",
                      fontSize: "11px", fontWeight: 700, background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}>
                      {sc.label}
                    </span>
                  );
                })()}
              </div>
              <button onClick={() => setDrawerSchId(null)}
                style={{ width: "32px", height: "32px", borderRadius: "8px", border: "1px solid #e2e8f0",
                  background: "#fff", cursor: "pointer", fontSize: "18px", color: "#94a3b8",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Drawer body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
              {drawerLoading ? (
                <div style={{ padding: "60px 0", textAlign: "center", color: "#94a3b8" }}>
                  <div style={{ fontSize: "32px", marginBottom: "10px" }}>⏳</div>Loading…
                </div>
              ) : drawerData ? (
                <>
                  {/* KPI mini cards */}
                  {(() => {
                    const pct = drawerData.assets?.length > 0
                      ? Math.round(drawerData.assets.filter(a => a.status === "completed").length / drawerData.assets.length * 100) : 0;
                    return (
                      <>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "18px" }}>
                          {[
                            { label: "Date",         value: (drawerData.maintenance_date || "—").split("T")[0], bg: "#eff6ff", tc: "#1d4ed8" },
                            { label: "Engineer",     value: drawerData.engineer_name || "—",                   bg: "#f0fdf4", tc: "#15803d" },
                            { label: "Total Assets", value: drawerData.assets?.length || 0,                    bg: "#fef9c3", tc: "#a16207" },
                            { label: "Progress",     value: `${pct}%`,                                         bg: "#f5f3ff", tc: "#7c3aed" },
                          ].map(c => (
                            <div key={c.label} style={{ background: c.bg, borderRadius: "10px", padding: "12px 14px" }}>
                              <div style={{ fontSize: "10px", fontWeight: 700, color: c.tc, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "3px" }}>{c.label}</div>
                              <div style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>{c.value}</div>
                            </div>
                          ))}
                        </div>
                        {/* Progress bar */}
                        <div style={{ marginBottom: "18px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#64748b", marginBottom: "5px" }}>
                            <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>Completion Progress</span>
                            <span>{pct}%</span>
                          </div>
                          <div style={{ background: "#e2e8f0", borderRadius: "100px", height: "8px" }}>
                            <div style={{ width: `${pct}%`, borderRadius: "100px", height: "8px", transition: "width 0.6s ease",
                              background: pct === 100 ? "#16a34a" : pct > 50 ? "#2563eb" : "#f59e0b" }} />
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                            {drawerData.assets?.filter(a => a.status === "completed").length || 0} of {drawerData.assets?.length || 0} assets completed
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* Assign Engineer */}
                  <div style={{ marginBottom: "18px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase",
                      letterSpacing: "0.04em", marginBottom: "8px" }}>Assign Engineer</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "5px", maxHeight: "190px", overflowY: "auto", marginBottom: "8px",
                      border: "1px solid #e2e8f0", borderRadius: "8px", padding: "6px" }}>
                      <div onClick={() => setSelEngineer({ id: "", name: "" })}
                        style={{ padding: "8px 10px", borderRadius: "6px", cursor: "pointer",
                          border: `2px solid ${!selEngineer.id ? "#2563eb" : "transparent"}`,
                          background: !selEngineer.id ? "#eff6ff" : "#f8fafc" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: !selEngineer.id ? "#1d4ed8" : "#64748b" }}>— No Engineer —</div>
                      </div>
                      {drawerEngineers.map(eng => (
                        <div key={eng.id} onClick={() => setSelEngineer({ id: eng.id, name: eng.fullName })}
                          style={{ padding: "8px 10px", borderRadius: "6px", cursor: "pointer",
                            border: `2px solid ${selEngineer.id === eng.id ? "#2563eb" : "transparent"}`,
                            background: selEngineer.id === eng.id ? "#eff6ff" : "#fff" }}>
                          <div style={{ fontWeight: 700, fontSize: "12px", color: "#0f172a" }}>{eng.fullName}</div>
                          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "1px" }}>
                            {eng.designation || eng.role}{eng.departmentName ? ` · ${eng.departmentName}` : ""} · {eng.currentWorkload} pending
                          </div>
                        </div>
                      ))}
                      {drawerEngineers.length === 0 && (
                        <div style={{ textAlign: "center", padding: "12px", color: "#94a3b8", fontSize: "12px" }}>No engineers found.</div>
                      )}
                    </div>
                    <button style={{ ...S.btn("primary"), width: "100%", padding: "9px", fontSize: "12px", opacity: savingEng ? 0.6 : 1 }}
                      onClick={assignEngineer} disabled={savingEng}>
                      {savingEng ? "Saving…" : "✓ Save Engineer Assignment"}
                    </button>
                  </div>

                  {/* Notes */}
                  {drawerData.notes && (
                    <div style={{ marginBottom: "18px", padding: "12px 14px", background: "#f8fafc",
                      borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase",
                        letterSpacing: "0.04em", marginBottom: "5px" }}>Notes</div>
                      <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.5 }}>{drawerData.notes}</div>
                    </div>
                  )}

                  {/* Assets list with per-asset engineer assignment */}
                  <div style={{ marginBottom: "20px" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase",
                      letterSpacing: "0.04em", marginBottom: "10px" }}>
                      Assets ({drawerData.assets?.length || 0}) — assign engineer per asset
                    </div>

                    {/* ── Bulk assign bar ── */}
                    {(drawerData.assets?.length || 0) > 1 && (
                      <div style={{ background: selectedPsaIds.size > 0 ? "#eff6ff" : "#f8fafc",
                        border: `1px solid ${selectedPsaIds.size > 0 ? "#bfdbfe" : "#e2e8f0"}`,
                        borderRadius: "8px", padding: "8px 10px", marginBottom: "8px",
                        display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        {/* Select-all checkbox */}
                        <label style={{ display: "flex", alignItems: "center", gap: "5px", cursor: "pointer",
                          fontSize: "11px", fontWeight: 600, color: "#374151", flexShrink: 0 }}>
                          <input type="checkbox"
                            checked={(drawerData.assets?.length || 0) > 0 && selectedPsaIds.size === drawerData.assets.length}
                            onChange={e => setSelectedPsaIds(e.target.checked ? new Set(drawerData.assets.map(a => a.id)) : new Set())}
                          />
                          {selectedPsaIds.size > 0 ? `${selectedPsaIds.size} selected` : "Select all"}
                        </label>
                        {/* Engineer picker + assign button — shown when at least 1 selected */}
                        {selectedPsaIds.size > 0 && (
                          <>
                            <select value={bulkEngId} onChange={e => setBulkEngId(e.target.value)}
                              style={{ flex: 1, minWidth: "120px", fontSize: "11px", padding: "5px 7px",
                                border: "1px solid #93c5fd", borderRadius: "6px", background: "#fff", color: "#374151" }}>
                              <option value="">— Select Engineer —</option>
                              {drawerEngineers.map(eng => (
                                <option key={eng.id} value={eng.id}>{eng.fullName}{eng.departmentName ? ` (${eng.departmentName})` : ""}</option>
                              ))}
                            </select>
                            <button onClick={bulkSaveAssetEngineers}
                              disabled={bulkSaving || !bulkEngId}
                              style={{ ...S.btn("primary"), padding: "5px 12px", fontSize: "11px", flexShrink: 0,
                                opacity: (!bulkEngId || bulkSaving) ? 0.5 : 1 }}>
                              {bulkSaving ? "Saving…" : `Assign to ${selectedPsaIds.size}`}
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
                      {(drawerData.assets || []).map(a => {
                        const asc = getStatusColor(a.status);
                        const ae  = assetEngMap[a.id] || { id: "", name: "" };
                        const isSelected = selectedPsaIds.has(a.id);
                        return (
                          <div key={a.id} style={{ padding: "10px 12px", borderRadius: "8px",
                            background: isSelected ? "#eff6ff" : "#f8fafc",
                            border: `1px solid ${isSelected ? "#93c5fd" : "#e2e8f0"}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
                              {/* Checkbox + asset info */}
                              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                                <input type="checkbox" checked={isSelected} style={{ marginTop: "3px", cursor: "pointer" }}
                                  onChange={e => setSelectedPsaIds(p => {
                                    const n = new Set(p); e.target.checked ? n.add(a.id) : n.delete(a.id); return n;
                                  })} />
                                <div>
                                  <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>{a.assetName}</div>
                                  <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                                    {[a.generatedAssetId || a.assetUniqueId, a.departmentName].filter(Boolean).join(" · ")}
                                  </div>
                                </div>
                              </div>
                              <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "100px",
                                fontSize: "10px", fontWeight: 700, background: asc.bg, color: asc.text, border: `1px solid ${asc.border}` }}>
                                {asc.label}
                              </span>
                            </div>
                            {/* Per-asset engineer selector */}
                            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                              <select value={ae.id || ""}
                                onChange={e => {
                                  const eng = drawerEngineers.find(en => String(en.id) === e.target.value);
                                  setAssetEngMap(p => ({ ...p, [a.id]: { id: e.target.value, name: eng?.fullName || "" } }));
                                }}
                                style={{ flex: 1, fontSize: "11px", padding: "5px 7px", border: "1px solid #e2e8f0",
                                  borderRadius: "6px", background: "#fff", color: "#374151" }}>
                                <option value="">— No Engineer —</option>
                                {drawerEngineers.map(eng => (
                                  <option key={eng.id} value={eng.id}>{eng.fullName}{eng.departmentName ? ` (${eng.departmentName})` : ""}</option>
                                ))}
                              </select>
                              <button onClick={() => saveAssetEngineer(a.id)} disabled={!!savingAssetEng[a.id]}
                                style={{ ...S.btn("primary"), padding: "5px 12px", fontSize: "11px", flexShrink: 0 }}>
                                {savingAssetEng[a.id] ? "…" : "Assign"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {(!drawerData.assets || drawerData.assets.length === 0) && (
                        <div style={{ textAlign: "center", padding: "24px", color: "#94a3b8", fontSize: "13px" }}>No assets.</div>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <button style={{ ...S.btn("primary"), padding: "11px", fontSize: "13px", gridColumn: "1 / -1" }}
                      onClick={() => setModal({ view: drawerData })}>📋 View Full Details</button>
                    <button style={{ ...S.btn(), padding: "10px", fontSize: "13px" }}
                      onClick={() => setModal({ editAssets: drawerData })}>✏️ Edit Assets</button>
                    <button style={{ ...S.btn("danger"), padding: "10px", fontSize: "13px" }}
                      onClick={() => del(drawerData.id)}>🗑 Delete</button>
                  </div>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {modal === "create" && (
        <Modal title="Create PMS Schedule" onClose={() => setModal(null)} maxWidth={1000}>
          <CreateScheduleForm token={token}
            onSave={() => { setModal(null); showToast("Schedule created!"); load(); }}
            onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal?.view && (
        <Modal title={`Schedule ${modal.view.schedule_number}`} onClose={() => setModal(null)} maxWidth={900}>
          <ScheduleDetailView scheduleId={modal.view.id} token={token} />
        </Modal>
      )}
      {modal?.editAssets && (
        <EditScheduleAssetsModal
          schedule={modal.editAssets}
          token={token}
          onClose={() => setModal(null)}
          onUpdate={() => {
            load();
            // Reload drawer data
            if (drawerSchId) {
              apiFetch("GET", `/api/company-portal/pms/schedules/${drawerSchId}`, null, token)
                .then(d => { setDrawerData(d); setSelEngineer({ id: d.engineer_id || "", name: d.engineer_name || "" }); }).catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Create Schedule Form (3-step wizard) ────────────────────────────────────
function CreateScheduleForm({ token, onSave, onCancel }) {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState("");
  const [frequency, setFrequency] = useState("Monthly");
  const [assets, setAssets] = useState([]);
  const [allAssets, setAllAssets] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [assetFilters, setAssetFilters] = useState({ search: "", departmentId: "", assetCategory: "", building: "" });
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [conflicts, setConflicts] = useState([]);    // assets that already have a future schedule
  const [showConflict, setShowConflict] = useState(false);
  const [replaceConflicts, setReplaceConflicts] = useState(false);

  useEffect(() => {
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

  // Step 2→3 advance: check for conflicts first
  const advanceToReview = async () => {
    if (!selectedAssets.size) return;
    try {
      const { conflicts: found } = await apiFetch("POST", "/api/company-portal/pms/schedules/check-conflicts",
        { assetIds: [...selectedAssets] }, token);
      if (found.length > 0) { setConflicts(found); setShowConflict(true); }
      else { setStep(3); }
    } catch { setStep(3); }
  };

  const save = async (replace = false) => {
    setSaving(true); setErr("");
    try {
      const occurrenceCount = { Monthly: 12, Quarterly: 4, 'Half-Yearly': 2, Yearly: 2, Once: 1 }[frequency] ?? 1;
      await apiFetch("POST", "/api/company-portal/pms/schedules", {
        maintenanceDate: date,
        frequency,
        notes,
        assetIds: [...selectedAssets],
        replaceConflicts: replace,
      }, token);
      onSave();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  // Conflict dialog
  if (showConflict) {
    return (
      <div>
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "12px", padding: "20px", marginBottom: "16px" }}>
          <h3 style={{ margin: "0 0 8px", color: "#c2410c", fontSize: "16px", fontWeight: 700 }}>⚠️ PMS Already Scheduled</h3>
          <p style={{ margin: "0 0 14px", color: "#7c2d12", fontSize: "13.5px" }}>
            The following {conflicts.length} asset{conflicts.length !== 1 ? "s" : ""} already have an active future PMS schedule.
            Proceeding will cancel those future occurrences and create new ones starting <strong>{date}</strong>.
          </p>
          <div style={{ background: "#fff", borderRadius: "8px", border: "1px solid #fed7aa", maxHeight: "200px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
              <thead><tr style={{ background: "#fff7ed" }}>
                {["Asset", "Current Schedule", "Next Date", "Frequency"].map(h =>
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: "#92400e" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {conflicts.map(c => (
                  <tr key={c.assetId} style={{ borderTop: "1px solid #fed7aa" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{c.assetName}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace", fontSize: "11px" }}>{c.scheduleNumber}</td>
                    <td style={{ padding: "8px 12px" }}>{c.maintenanceDate?.split("T")[0]}</td>
                    <td style={{ padding: "8px 12px" }}>{c.frequency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button style={S.btn("ghost")} onClick={() => setShowConflict(false)}>No, Keep Existing</button>
          <button style={{ ...S.btn("danger"), background: "#dc2626" }}
            onClick={() => { setShowConflict(false); setReplaceConflicts(true); setStep(3); }}>
            Yes, Replace Schedule
          </button>
        </div>
      </div>
    );
  }

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
        {stepLabel(2, "Select Assets")}
        <div style={{ color: "#e2e8f0", alignSelf: "center" }}>→</div>
        {stepLabel(3, "Review & Assign")}
      </div>

      {err && <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}

      {/* Step 1 */}
      {step === 1 && (
        <div style={{ maxWidth: "440px" }}>
          <Field label="Maintenance Date" required>
            <Inp type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: "15px" }} />
          </Field>
          <Field label="Frequency">
            <Sel value={frequency} onChange={e => setFrequency(e.target.value)}
              options={FREQUENCIES.map(f => ({ value: f, label: f }))} />
          </Field>
          <Field label="Notes (optional)">
            <Txt value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for this schedule…" rows={2} />
          </Field>
        </div>
      )}

      {/* Step 2: Select Assets */}
      {step === 2 && (
        <div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px", alignItems: "center" }}>
            <input value={assetFilters.search} onChange={e => setAssetFilters(p => ({ ...p, search: e.target.value }))}
              placeholder="Search assets…" style={{ ...S.input, maxWidth: "200px" }} />
            <select value={assetFilters.departmentId} onChange={e => setAssetFilters(p => ({ ...p, departmentId: e.target.value }))}
              style={{ ...S.input, maxWidth: "160px", background: "#fff" }}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
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
                    <td style={S.td}><code style={{ fontSize: "11px" }}>{a.generatedAssetId || a.assetUniqueId || "—"}</code></td>
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

      {/* Step 3: Review */}
      {step === 3 && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "20px" }}>
            <div style={{ ...S.card, background: "#f0fdf4" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#15803d", textTransform: "uppercase", marginBottom: "6px" }}>Date</div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{date || "—"}</div>
            </div>
            <div style={{ ...S.card, background: "#eff6ff" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", marginBottom: "6px" }}>Frequency</div>
              <div style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{frequency}</div>
            </div>
            <div style={{ ...S.card, background: "#fef9c3" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#a16207", textTransform: "uppercase", marginBottom: "6px" }}>Assets Selected</div>
              <div style={{ fontSize: "32px", fontWeight: 800, color: "#0f172a" }}>{selectedAssets.size}</div>
            </div>
          </div>
          {notes && <div style={{ padding: "12px 16px", background: "#f8fafc", borderRadius: "8px", fontSize: "13px", color: "#475569", marginBottom: "16px" }}><strong>Notes:</strong> {notes}</div>}
          <div style={{ padding: "12px 16px", background: "#fef9c3", borderRadius: "8px", fontSize: "13px", color: "#78350f" }}>
            ⚠️ This will create <strong>{frequency === "Once" ? "1 occurrence" : `recurring PMS occurrences`}</strong> for <strong>{selectedAssets.size} assets</strong> starting <strong>{date}</strong>.
            {frequency !== "Once" && <span> Future occurrences will be generated automatically. Engineer assignment applies only to the first occurrence.</span>}
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
          {step < 3 ? (
            <button style={S.btn("primary")} onClick={() => {
              if (step === 1 && !date) { setErr("Please select a maintenance date."); return; }
              setErr("");
              if (step === 2) { advanceToReview(); return; }
              setStep(s => s + 1);
            }}>Next →</button>
          ) : (
            <button style={{ ...S.btn("success"), opacity: saving ? 0.6 : 1 }} onClick={() => save(replaceConflicts)} disabled={saving}>
              {saving ? "Creating…" : "✓ Create Schedule"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Edit Schedule Assets Modal ───────────────────────────────────────────────
function EditScheduleAssetsModal({ schedule, token, onClose, onUpdate }) {
  const [assets,      setAssets]      = useState(schedule.assets || []);
  const [allAssets,   setAllAssets]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [filters,     setFilters]     = useState({ search: "", departmentId: "" });
  const [selectedNew, setSelectedNew] = useState(new Set());
  const [adding,      setAdding]      = useState(false);
  const [removing,    setRemoving]    = useState(new Set());
  const [err,         setErr]         = useState("");

  useEffect(() => {
    apiFetch("GET", "/api/company-portal/pms/assets", null, token).then(setAllAssets).catch(() => {});
    apiFetch("GET", "/api/company-portal/departments", null, token).then(d => setDepartments(d || [])).catch(() => {});
  }, [token]);

  const currentIds = new Set(assets.map(a => a.asset_id || a.id));

  const available = allAssets.filter(a => {
    if (currentIds.has(a.id)) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!a.assetName?.toLowerCase().includes(q) && !(a.generatedAssetId || a.assetUniqueId || '').toLowerCase().includes(q)) return false;
    }
    if (filters.departmentId && String(a.departmentId) !== String(filters.departmentId)) return false;
    return true;
  });

  const removeAsset = async (assetId) => {
    setRemoving(p => new Set(p).add(assetId));
    try {
      await apiFetch("DELETE", `/api/company-portal/pms/schedules/${schedule.id}/assets/${assetId}`, null, token);
      setAssets(p => p.filter(a => (a.asset_id || a.id) !== assetId));
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setRemoving(p => { const n = new Set(p); n.delete(assetId); return n; }); }
  };

  const addAssets = async () => {
    if (!selectedNew.size) return;
    setAdding(true); setErr("");
    try {
      await apiFetch("POST", `/api/company-portal/pms/schedules/${schedule.id}/assets`,
        { assetIds: [...selectedNew] }, token);
      const data = await apiFetch("GET", `/api/company-portal/pms/schedules/${schedule.id}`, null, token);
      setAssets(data.assets || []);
      setSelectedNew(new Set());
      onUpdate();
    } catch (e) { setErr(e.message); }
    finally { setAdding(false); }
  };

  const toggleSelectAll = () => {
    if (selectedNew.size === available.length) setSelectedNew(new Set());
    else setSelectedNew(new Set(available.map(a => a.id)));
  };

  return (
    <Modal title={`Edit Assets — ${schedule.schedule_number}`} onClose={onClose} maxWidth={1020}>
      <div>
        {err && <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", marginBottom: "12px", fontSize: "13px" }}>{err}</div>}

        {/* ── Current Assets ── */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "10px" }}>
            Current Assets <span style={{ ...S.badge("blue"), marginLeft: "6px" }}>{assets.length}</span>
          </div>
          {assets.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
              No assets assigned to this schedule.
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "240px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    {["Asset", "ID", "Department", "Checklist", "Status", "Action"].map(h => <th key={h} style={S.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a, i) => {
                    const assetId = a.asset_id || a.id;
                    const isRemoving = removing.has(assetId);
                    return (
                      <tr key={assetId} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa", opacity: isRemoving ? 0.5 : 1 }}>
                        <td style={{ ...S.td, fontWeight: 600 }}>{a.assetName}</td>
                        <td style={S.td}><code style={{ fontSize: "11px" }}>{a.generatedAssetId || a.assetUniqueId || "—"}</code></td>
                        <td style={S.td}>{a.departmentName || "—"}</td>
                        <td style={S.td}>{a.checklistName ? <span style={S.badge("green")}>{a.checklistCode}</span> : <span style={S.badge("gray")}>None</span>}</td>
                        <td style={S.td}><span style={S.badge(a.status === "completed" ? "green" : a.status === "in_progress" ? "blue" : "gray")}>{a.status}</span></td>
                        <td style={S.td}>
                          <button style={{ ...S.btn("danger"), padding: "3px 10px", fontSize: "11px" }}
                            onClick={() => removeAsset(assetId)} disabled={isRemoving}>
                            {isRemoving ? "…" : "✕ Remove"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Add New Assets ── */}
        <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
              Add Assets <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}>({available.length} available)</span>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {selectedNew.size > 0 && <span style={{ fontSize: "13px", color: "#475569" }}><strong>{selectedNew.size}</strong> selected</span>}
              <button style={{ ...S.btn("primary"), opacity: adding || !selectedNew.size ? 0.6 : 1 }}
                onClick={addAssets} disabled={adding || !selectedNew.size}>
                {adding ? "Adding…" : `+ Add ${selectedNew.size || ""} Asset${selectedNew.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
            <input value={filters.search}
              onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
              placeholder="🔍 Search assets…" style={{ ...S.input, maxWidth: "220px" }} />
            <select value={filters.departmentId}
              onChange={e => setFilters(p => ({ ...p, departmentId: e.target.value }))}
              style={{ ...S.input, maxWidth: "180px", background: "#fff" }}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
            </select>
          </div>

          <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden", maxHeight: "300px", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  <th style={S.th}>
                    <input type="checkbox"
                      checked={available.length > 0 && selectedNew.size === available.length}
                      onChange={toggleSelectAll} />
                  </th>
                  {["Asset", "ID", "Department", "Location", "Checklist"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {available.map((a, i) => (
                  <tr key={a.id}
                    style={{ background: selectedNew.has(a.id) ? "#eff6ff" : (i % 2 === 0 ? "#fff" : "#fafafa"), cursor: "pointer" }}
                    onClick={() => setSelectedNew(p => { const n = new Set(p); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n; })}>
                    <td style={S.td}><input type="checkbox" checked={selectedNew.has(a.id)} readOnly /></td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{a.assetName}</td>
                    <td style={S.td}><code style={{ fontSize: "11px" }}>{a.generatedAssetId || a.assetUniqueId || "—"}</code></td>
                    <td style={S.td}>{a.departmentName || "—"}</td>
                    <td style={S.td}>{[a.building, a.floor, a.room].filter(Boolean).join(" / ") || "—"}</td>
                    <td style={S.td}>{a.checklistName ? <span style={S.badge("green")}>{a.checklistCode}</span> : <span style={S.badge("gray")}>None</span>}</td>
                  </tr>
                ))}
                {available.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>
                    All assets already assigned, or none match the filter.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
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
                <td style={S.td}><code style={{ fontSize: "11px" }}>{a.generatedAssetId || a.assetUniqueId || "—"}</code></td>
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
export default function PMSChecklistModule({ token, companyId, extraTabs = [], extraTabContent = {}, initialTab }) {
  const [tab, setTab]             = useState(initialTab || "checklists");
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
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" }}>
        {tabBtn("checklists", "📋 Checklists")}
        {tabBtn("assign", "🔗 Assign to Assets")}
        {tabBtn("schedules", "📅 Schedules")}
        {extraTabs.map(t => tabBtn(t.key, t.label))}
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
      {extraTabs.map(t => tab === t.key ? <div key={t.key}>{extraTabContent[t.key]}</div> : null)}
    </div>
  );
}
