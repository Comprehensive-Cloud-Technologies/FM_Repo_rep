/**
 * CalibrationModule.jsx
 * Comprehensive Calibration Management Module
 *
 * Tabs: Scheduler | Calendar | Vendors | Reports
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();
const CAL_API = `${BASE}/api/company-portal/calibration`;

// ─── Style helpers ─────────────────────────────────────────────────────────────
const S = {
  card:  { background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  btn:   (v = "primary") => ({
    padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 700,
    ...(v === "primary"  ? { background: "#2563eb", color: "#fff" } :
        v === "success"  ? { background: "#16a34a", color: "#fff" } :
        v === "danger"   ? { background: "#dc2626", color: "#fff" } :
        v === "warning"  ? { background: "#d97706", color: "#fff" } :
        v === "ghost"    ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } : { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" }),
  }),
  input: { width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box" },
  label: { fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" },
  badge: (c) => ({ display: "inline-block", padding: "2px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, ...(c === "completed" ? { background: "#dcfce7", color: "#16a34a" } : c === "pending" ? { background: "#fef3c7", color: "#d97706" } : c === "overdue" ? { background: "#fee2e2", color: "#dc2626" } : { background: "#f1f5f9", color: "#64748b" }) }),
  th:    { padding: "10px 12px", fontSize: "12px", fontWeight: 700, color: "#475569", background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td:    { padding: "10px 12px", fontSize: "13px", color: "#0f172a", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
};

function authHdr(token) { return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }; }

async function apiFetch(url, opts = {}, token) {
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}`, ...( opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {} ) } });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `HTTP ${r.status}`); }
  return r.json();
}

const FREQ_OPTIONS = ["One Time", "Monthly", "Quarterly", "Half-Yearly", "Yearly"];
const STATUS_COLORS = { completed: "#16a34a", pending: "#d97706", scheduled: "#2563eb", overdue: "#dc2626" };

// ─── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type = "success", onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "12px 20px", borderRadius: "10px", background: type === "error" ? "#dc2626" : "#16a34a", color: "#fff", fontWeight: 600, fontSize: "14px", boxShadow: "0 4px 20px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", gap: 10 }}>
      {type === "error" ? "⚠ " : "✓ "}{msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "16px", lineHeight: 1 }}>×</button>
    </div>
  );
}

// ─── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onYes, onNo }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <p style={{ fontSize: "15px", color: "#0f172a", lineHeight: 1.6, marginBottom: 20 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button style={S.btn("ghost")} onClick={onNo}>No, Keep Existing</button>
          <button style={S.btn("warning")} onClick={onYes}>Yes, Replace Schedule</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VENDOR MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════
function VendorsTab({ token }) {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ vendorName: "", contactPerson: "", mobile: "", email: "", companyName: "", gstNumber: "", address: "", city: "", state: "", country: "India" });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setVendors(await apiFetch(`${CAL_API}/vendors?search=${encodeURIComponent(search)}`, {}, token)); }
    catch { setVendors([]); } finally { setLoading(false); }
  }, [token, search]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setForm({ vendorName: "", contactPerson: "", mobile: "", email: "", companyName: "", gstNumber: "", address: "", city: "", state: "", country: "India" }); setEditId(null); setShowForm(false); };

  const save = async () => {
    if (!form.vendorName.trim()) return setToast({ msg: "Vendor name is required", type: "error" });
    setSaving(true);
    try {
      if (editId) { await apiFetch(`${CAL_API}/vendors/${editId}`, { method: "PATCH", body: JSON.stringify(form) }, token); setToast({ msg: "Vendor updated!" }); }
      else { await apiFetch(`${CAL_API}/vendors`, { method: "POST", body: JSON.stringify(form) }, token); setToast({ msg: "Vendor created!" }); }
      reset(); load();
    } catch (e) { setToast({ msg: e.message, type: "error" }); } finally { setSaving(false); }
  };

  const del = async (id) => {
    if (!window.confirm("Delete this vendor? This cannot be undone.")) return;
    try { await apiFetch(`${CAL_API}/vendors/${id}`, { method: "DELETE" }, token); load(); setToast({ msg: "Vendor deleted" }); }
    catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const startEdit = (v) => {
    setForm({ vendorName: v.vendor_name||"", contactPerson: v.contact_person||"", mobile: v.mobile||"", email: v.email||"", companyName: v.company_name||"", gstNumber: v.gst_number||"", address: v.address||"", city: v.city||"", state: v.state||"", country: v.country||"India" });
    setEditId(v.id); setShowForm(true); window.scrollTo(0, 0);
  };

  const F = ({ label, field, type = "text", placeholder }) => (
    <div style={{ flex: 1, minWidth: 180 }}>
      <label style={S.label}>{label}</label>
      <input type={type} value={form[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} placeholder={placeholder} style={S.input} />
    </div>
  );

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Calibration Vendors</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Manage vendors responsible for equipment calibration</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…" style={{ ...S.input, width: 200 }} />
          <button style={S.btn("primary")} onClick={() => { reset(); setShowForm(true); }}>+ Add Vendor</button>
        </div>
      </div>

      {showForm && (
        <div style={{ ...S.card, marginBottom: 20, border: "2px solid #2563eb" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px", fontWeight: 700, color: "#1e40af" }}>{editId ? "Edit Vendor" : "New Vendor"}</h3>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <F label="Vendor Name *" field="vendorName" placeholder="e.g. Fluke Calibration Services" />
            <F label="Contact Person" field="contactPerson" placeholder="e.g. John Doe" />
            <F label="Mobile" field="mobile" placeholder="+91 98765 43210" />
            <F label="Email" field="email" type="email" placeholder="vendor@example.com" />
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
            <F label="Company Name" field="companyName" placeholder="e.g. Fluke India Pvt Ltd" />
            <F label="GST Number" field="gstNumber" placeholder="Optional" />
            <F label="City" field="city" placeholder="City" />
            <F label="State" field="state" placeholder="State" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>Address</label>
            <textarea value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Full address" rows={2} style={{ ...S.input, resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button style={S.btn("ghost")} onClick={reset}>Cancel</button>
            <button style={S.btn("primary")} onClick={save} disabled={saving}>{saving ? "Saving…" : editId ? "Update Vendor" : "Create Vendor"}</button>
          </div>
        </div>
      )}

      <div style={S.card}>
        {loading ? <p style={{ color: "#64748b", textAlign: "center", padding: 30 }}>Loading vendors…</p> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {["Code","Vendor Name","Contact Person","Mobile","Email","City","Status","Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {vendors.length === 0 && <tr><td colSpan={8} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 30 }}>No vendors found. Add your first vendor.</td></tr>}
                {vendors.map(v => (
                  <tr key={v.id} style={{ cursor: "pointer" }}>
                    <td style={S.td}><span style={{ fontFamily: "monospace", fontSize: "12px", background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>{v.vendor_code}</span></td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{v.vendor_name}</td>
                    <td style={S.td}>{v.contact_person || "—"}</td>
                    <td style={S.td}>{v.mobile || "—"}</td>
                    <td style={S.td}>{v.email || "—"}</td>
                    <td style={S.td}>{v.city || "—"}</td>
                    <td style={S.td}><span style={S.badge(v.status)}>{v.status}</span></td>
                    <td style={S.td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={{ ...S.btn(), padding: "4px 10px", fontSize: "12px" }} onClick={() => startEdit(v)}>Edit</button>
                        <button style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: "12px" }} onClick={() => del(v.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ASSET PICKER (used in Schedule wizard)
// ══════════════════════════════════════════════════════════════════════════════
function AssetPicker({ token, selected, onToggle, onSelectAll, onClearAll }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: "", department: "", category: "", assetType: "" });
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    fetch(`${BASE}/api/company-portal/departments`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setDepartments(Array.isArray(d) ? d : [])).catch(() => {});
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: 500, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) });
      const d = await apiFetch(`${BASE}/api/company-portal/assets?${params}`, {}, token);
      setAssets(Array.isArray(d) ? d : (d?.assets || []));
    } catch { setAssets([]); } finally { setLoading(false); }
  }, [token, filters]);

  useEffect(() => { load(); }, [load]);

  const categories = [...new Set(assets.map(a => a.asset_category).filter(Boolean))].sort();

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="Search asset name, ID, QR…" style={{ ...S.input, flex: 1, minWidth: 160 }} />
        <select value={filters.department} onChange={e => setFilters(p => ({ ...p, department: e.target.value }))} style={{ ...S.input, width: 160 }}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
        </select>
        <select value={filters.category} onChange={e => setFilters(p => ({ ...p, category: e.target.value }))} style={{ ...S.input, width: 150 }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
        <span style={{ fontSize: "13px", color: "#64748b" }}>{selected.size} selected</span>
        <button style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: "12px" }} onClick={() => onSelectAll(assets.map(a => a.id))}>Select All ({assets.length})</button>
        <button style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: "12px" }} onClick={onClearAll}>Clear</button>
      </div>
      <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
        {loading ? <p style={{ textAlign: "center", padding: 20, color: "#94a3b8" }}>Loading assets…</p> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0 }}>
              <tr>{["", "Asset ID", "Asset Name", "Category", "Department", "Manufacturer"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.id} onClick={() => onToggle(a.id)} style={{ cursor: "pointer", background: selected.has(a.id) ? "#eff6ff" : "transparent" }}>
                  <td style={{ ...S.td, width: 36, textAlign: "center" }}>
                    <input type="checkbox" readOnly checked={selected.has(a.id)} style={{ cursor: "pointer" }} />
                  </td>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{a.generated_asset_id || a.asset_code}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{a.asset_name}</td>
                  <td style={S.td}>{a.asset_category || "—"}</td>
                  <td style={S.td}>{a.department_name || a.departmentName || "—"}</td>
                  <td style={S.td}>{a.manufacturer || "—"}</td>
                </tr>
              ))}
              {assets.length === 0 && <tr><td colSpan={6} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 20 }}>No assets found</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE SCHEDULE WIZARD
// ══════════════════════════════════════════════════════════════════════════════
function CreateScheduleWizard({ token, onClose, onCreated }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ calibrationDate: "", frequency: "One Time", notes: "" });
  const [selectedAssets, setSelectedAssets] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [showConflict, setShowConflict] = useState(false);
  const [replaceConflicts, setReplaceConflicts] = useState(false);

  const toggleAsset = (id) => setSelectedAssets(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = (ids) => setSelectedAssets(new Set(ids));
  const clearAll = () => setSelectedAssets(new Set());

  const advanceToReview = async () => {
    if (!selectedAssets.size) return setToast({ msg: "Select at least one asset", type: "error" });
    try {
      const data = await apiFetch(`${CAL_API}/schedules/check-conflicts`, { method: "POST", body: JSON.stringify({ assetIds: [...selectedAssets] }) }, token);
      if (data.conflicts?.length) {
        setConflicts(data.conflicts);
        setShowConflict(true);
      } else {
        setStep(3);
      }
    } catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const save = async (replace = false) => {
    if (!form.calibrationDate) return setToast({ msg: "Calibration date is required", type: "error" });
    setSaving(true);
    try {
      const data = await apiFetch(`${CAL_API}/schedules`, {
        method: "POST",
        body: JSON.stringify({ ...form, assetIds: [...selectedAssets], replaceConflicts: replace }),
      }, token);
      setToast({ msg: `${data.occurrencesCreated} schedule(s) created for ${selectedAssets.size} assets` });
      setTimeout(() => { onCreated(); onClose(); }, 1500);
    } catch (e) { setToast({ msg: e.message, type: "error" }); setSaving(false); }
  };

  const STEPS = ["Schedule Details", "Select Assets", "Review & Confirm"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 8000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "min(860px, 95vw)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>Create Calibration Schedule</h2>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>Step {step} of 3 — {STEPS[step - 1]}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#94a3b8" }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ padding: "12px 24px", display: "flex", gap: 8, background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
          {STEPS.map((label, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: step > i + 1 ? "#16a34a" : step === i + 1 ? "#2563eb" : "#e2e8f0", color: step >= i + 1 ? "#fff" : "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700 }}>{step > i + 1 ? "✓" : i + 1}</div>
              <span style={{ fontSize: "12.5px", fontWeight: step === i + 1 ? 700 : 400, color: step === i + 1 ? "#1e40af" : "#64748b" }}>{label}</span>
              {i < 2 && <div style={{ width: 30, height: 1, background: "#e2e8f0", margin: "0 2px" }} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {toast && <div style={{ padding: "10px 14px", borderRadius: 8, background: toast.type === "error" ? "#fee2e2" : "#dcfce7", color: toast.type === "error" ? "#dc2626" : "#16a34a", fontSize: "13px", marginBottom: 16 }}>{toast.msg}</div>}

          {/* Step 1 */}
          {step === 1 && (
            <div style={{ maxWidth: 520 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Calibration Date *</label>
                <input type="date" value={form.calibrationDate} onChange={e => setForm(p => ({ ...p, calibrationDate: e.target.value }))} style={{ ...S.input, maxWidth: 220 }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Frequency *</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {FREQ_OPTIONS.map(f => (
                    <button key={f} onClick={() => setForm(p => ({ ...p, frequency: f }))}
                      style={{ ...S.btn(form.frequency === f ? "primary" : "ghost"), padding: "7px 14px", fontSize: "13px" }}>{f}</button>
                  ))}
                </div>
                {form.frequency !== "One Time" && (
                  <p style={{ fontSize: "12.5px", color: "#2563eb", marginTop: 8, background: "#eff6ff", padding: "8px 12px", borderRadius: 8 }}>
                    ℹ This will create independent calibration occurrences for 1 full year ({({ Monthly: 12, Quarterly: 4, "Half-Yearly": 2, Yearly: 1 }[form.frequency]} occurrences). Each asset receives its own separate record.
                  </p>
                )}
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={S.label}>Notes (Optional)</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ ...S.input, resize: "vertical" }} placeholder="Add notes or instructions…" />
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <AssetPicker token={token} selected={selectedAssets} onToggle={toggleAsset} onSelectAll={selectAll} onClearAll={clearAll} />
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div>
              <div style={{ ...S.card, marginBottom: 16, border: "1px solid #dbeafe", background: "#f0f9ff" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "14px", color: "#1e40af" }}>Schedule Summary</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: "13px" }}>
                  <div><span style={{ color: "#64748b" }}>Calibration Date:</span> <strong>{form.calibrationDate}</strong></div>
                  <div><span style={{ color: "#64748b" }}>Frequency:</span> <strong>{form.frequency}</strong></div>
                  <div><span style={{ color: "#64748b" }}>Assets Selected:</span> <strong>{selectedAssets.size}</strong></div>
                  <div><span style={{ color: "#64748b" }}>Occurrences:</span> <strong>{{ "One Time": 1, Monthly: 12, Quarterly: 4, "Half-Yearly": 2, Yearly: 1 }[form.frequency] || 1}</strong></div>
                </div>
                {form.notes && <p style={{ marginTop: 10, fontSize: "13px", color: "#475569" }}><strong>Notes:</strong> {form.notes}</p>}
              </div>
              <p style={{ fontSize: "12.5px", color: "#64748b", background: "#f8fafc", padding: "8px 12px", borderRadius: 8 }}>
                ℹ Each calibration occurrence is treated as an independent record. Certificates and vendor assignments are managed per occurrence.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between" }}>
          <button style={S.btn("ghost")} onClick={step === 1 ? onClose : () => setStep(s => s - 1)}>{step === 1 ? "Cancel" : "← Back"}</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step < 3 && (
              <button style={S.btn("primary")} onClick={() => {
                if (step === 1 && !form.calibrationDate) return setToast({ msg: "Select a date", type: "error" });
                if (step === 2) return advanceToReview();
                setStep(s => s + 1);
              }}>Next →</button>
            )}
            {step === 3 && (
              <button style={S.btn("success")} onClick={() => save(replaceConflicts)} disabled={saving}>{saving ? "Creating…" : "✓ Create Schedule"}</button>
            )}
          </div>
        </div>
      </div>

      {/* Conflict dialog */}
      {showConflict && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 24, maxWidth: 560, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.2)" }}>
            <h3 style={{ margin: "0 0 8px", color: "#dc2626", fontSize: "16px" }}>⚠ Scheduling Conflicts Detected</h3>
            <p style={{ fontSize: "13px", color: "#475569", marginBottom: 14 }}>{conflicts.length} asset(s) already have future calibration schedules pending:</p>
            <div style={{ maxHeight: 200, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr><th style={S.th}>Asset ID</th><th style={S.th}>Asset Name</th><th style={S.th}>Existing Date</th><th style={S.th}>Schedule</th></tr></thead>
                <tbody>
                  {conflicts.map((c, i) => (
                    <tr key={i}>
                      <td style={S.td}>{c.generated_asset_id}</td>
                      <td style={S.td}>{c.asset_name}</td>
                      <td style={S.td}>{c.calibration_date?.slice(0, 10)}</td>
                      <td style={S.td}>{c.schedule_number}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: "13px", color: "#475569", marginBottom: 16 }}>Would you like to replace the existing pending schedules for these assets with the new one?</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={S.btn("ghost")} onClick={() => { setShowConflict(false); setReplaceConflicts(false); setStep(3); }}>No, Keep Existing</button>
              <button style={{ ...S.btn("danger") }} onClick={() => { setShowConflict(false); setReplaceConflicts(true); setStep(3); }}>Yes, Replace</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULE DETAIL (assets table + cert upload)
// ══════════════════════════════════════════════════════════════════════════════
function ScheduleDetail({ scheduleId, token, onBack }) {
  const [schedule, setSchedule] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [bulkVendor, setBulkVendor] = useState("");
  const [uploadingId, setUploadingId] = useState(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef({});
  const bulkFileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, a, v] = await Promise.all([
        apiFetch(`${CAL_API}/schedules/${scheduleId}`, {}, token),
        apiFetch(`${CAL_API}/schedules/${scheduleId}/assets`, {}, token),
        apiFetch(`${CAL_API}/vendors?status=active`, {}, token),
      ]);
      setSchedule(s); setAssets(Array.isArray(a) ? a : []); setVendors(Array.isArray(v) ? v : []);
    } catch { } finally { setLoading(false); }
  }, [scheduleId, token]);

  useEffect(() => { load(); }, [load]);

  const assignVendor = async (saId, vendorId) => {
    try { await apiFetch(`${CAL_API}/schedule-assets/${saId}/vendor`, { method: "PATCH", body: JSON.stringify({ vendorId: vendorId || null }) }, token); load(); }
    catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const bulkAssignVendor = async () => {
    if (!selectedRows.size) return setToast({ msg: "Select assets first", type: "error" });
    try {
      await apiFetch(`${CAL_API}/schedule-assets/bulk-vendor`, { method: "PATCH", body: JSON.stringify({ assetRowIds: [...selectedRows], vendorId: bulkVendor || null }) }, token);
      setToast({ msg: "Vendor assigned to selected assets" }); setSelectedRows(new Set()); load();
    } catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const uploadCert = async (saId, file) => {
    if (!file) return;
    setUploadingId(saId);
    try {
      const fd = new FormData(); fd.append("certificate", file);
      await apiFetch(`${CAL_API}/schedule-assets/${saId}/certificate`, { method: "POST", body: fd }, token);
      setToast({ msg: "Certificate uploaded!" }); load();
    } catch (e) { setToast({ msg: e.message, type: "error" }); } finally { setUploadingId(null); }
  };

  const downloadCert = async (certId, fileName) => {
    try {
      const { url } = await apiFetch(`${CAL_API}/certificates/${certId}/download`, {}, token);
      const a = document.createElement("a"); a.href = url; a.download = fileName; a.target = "_blank"; a.click();
    } catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const bulkUpload = async (files) => {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of files) fd.append("certificates", f);
    fd.append("scheduleId", scheduleId);
    try {
      const r = await apiFetch(`${CAL_API}/certificates/bulk-upload`, { method: "POST", body: fd }, token);
      setToast({ msg: `Imported ${r.imported}/${r.total}. Unmatched: ${r.unmatched?.length || 0}` });
      load();
    } catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const toggleRow = (id) => setSelectedRows(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading…</div>;

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button style={S.btn("ghost")} onClick={onBack}>← Back to Calendar</button>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{schedule?.schedule_number} — Calibration Detail</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{schedule?.calibration_date?.slice(0, 10)} · {schedule?.frequency}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Assets", value: schedule?.total_assets || 0, color: "#2563eb" },
          { label: "Completed", value: schedule?.completed_assets || 0, color: "#16a34a" },
          { label: "Pending", value: (schedule?.total_assets || 0) - (schedule?.completed_assets || 0), color: "#d97706" },
          { label: "Status", value: schedule?.status || "scheduled", color: STATUS_COLORS[schedule?.status] || "#64748b" },
        ].map(c => (
          <div key={c.label} style={{ ...S.card, padding: "14px 16px", borderLeft: `4px solid ${c.color}` }}>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: "20px", fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Bulk actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14, alignItems: "center" }}>
        <span style={{ fontSize: "13px", color: "#64748b" }}>{selectedRows.size} selected</span>
        <select value={bulkVendor} onChange={e => setBulkVendor(e.target.value)} style={{ ...S.input, width: 200 }}>
          <option value="">Assign Vendor…</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
        </select>
        <button style={S.btn("primary")} onClick={bulkAssignVendor}>Assign to Selected</button>
        <button style={{ ...S.btn("ghost"), marginLeft: "auto" }} onClick={() => setShowBulkUpload(true)}>📁 Bulk Upload Certs</button>
      </div>

      {/* Bulk upload drop zone */}
      {showBulkUpload && (
        <div style={{ ...S.card, marginBottom: 16, border: "2px dashed #2563eb", background: "#f0f9ff" }}>
          <h4 style={{ margin: "0 0 8px", color: "#1e40af" }}>Bulk Certificate Upload</h4>
          <p style={{ fontSize: "13px", color: "#475569", marginBottom: 10 }}>Upload multiple PDFs. Each filename must exactly match the <strong>Asset ID</strong> (e.g., <code>MRI-1001.pdf</code>).</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input ref={bulkFileRef} type="file" multiple accept=".pdf" style={{ display: "none" }} onChange={e => { bulkUpload(e.target.files); setShowBulkUpload(false); }} />
            <button style={S.btn("primary")} onClick={() => bulkFileRef.current?.click()}>Select PDF Files</button>
            <button style={S.btn("ghost")} onClick={() => setShowBulkUpload(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Assets table */}
      <div style={{ ...S.card, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={S.th}><input type="checkbox" onChange={e => e.target.checked ? setSelectedRows(new Set(assets.map(a => a.id))) : setSelectedRows(new Set())} /></th>
            {["Asset ID", "Asset Name", "Category", "Department", "Vendor", "Status", "Certificate", "Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>
            {assets.length === 0 && <tr><td colSpan={9} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 30 }}>No assets in this schedule</td></tr>}
            {assets.map(a => (
              <tr key={a.id}>
                <td style={S.td}><input type="checkbox" checked={selectedRows.has(a.id)} onChange={() => toggleRow(a.id)} /></td>
                <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{a.generated_asset_id || a.asset_code}</td>
                <td style={{ ...S.td, fontWeight: 600 }}>{a.asset_name}</td>
                <td style={S.td}>{a.asset_category || "—"}</td>
                <td style={S.td}>{a.departmentName || "—"}</td>
                <td style={S.td}>
                  <select value={a.vendor_id || ""} onChange={e => assignVendor(a.id, e.target.value)} style={{ ...S.input, width: 160, padding: "4px 8px" }}>
                    <option value="">No Vendor</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
                  </select>
                </td>
                <td style={S.td}><span style={S.badge(a.status)}>{a.status}</span></td>
                <td style={S.td}>
                  {a.certificate_id
                    ? <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 600 }}>✓ {a.cert_file_name} v{a.cert_version}</span>
                    : <span style={{ fontSize: "12px", color: "#94a3b8" }}>Not uploaded</span>}
                </td>
                <td style={S.td}>
                  <div style={{ display: "flex", gap: 5, flexWrap: "nowrap" }}>
                    <input ref={el => fileInputRef.current[a.id] = el} type="file" accept=".pdf" style={{ display: "none" }} onChange={e => uploadCert(a.id, e.target.files?.[0])} />
                    <button style={{ ...S.btn(a.certificate_id ? "ghost" : "primary"), padding: "4px 8px", fontSize: "12px" }} onClick={() => fileInputRef.current[a.id]?.click()} disabled={uploadingId === a.id}>
                      {uploadingId === a.id ? "Uploading…" : a.certificate_id ? "Replace" : "Upload"}
                    </button>
                    {a.certificate_id && (
                      <button style={{ ...S.btn("ghost"), padding: "4px 8px", fontSize: "12px" }} onClick={() => downloadCert(a.certificate_id, a.cert_file_name)}>↓</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CALENDAR VIEW + SCHEDULER TAB
// ══════════════════════════════════════════════════════════════════════════════
function SchedulerTab({ token }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState("calendar"); // calendar | list
  const [showWizard, setShowWizard] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [filters, setFilters] = useState({ status: "", search: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const to = `${year}-${String(month + 1).padStart(2, "0")}-${lastDay}`;
      // For list we need wider range
      const allSchedules = await apiFetch(`${CAL_API}/schedules?from=${from}&to=${to}${filters.status ? `&status=${filters.status}` : ""}`, {}, token);
      setSchedules(Array.isArray(allSchedules) ? allSchedules : []);
    } catch { setSchedules([]); } finally { setLoading(false); }
  }, [token, currentDate, filters]);

  useEffect(() => { load(); }, [load]);

  if (detailId) return <ScheduleDetail scheduleId={detailId} token={token} onBack={() => { setDetailId(null); load(); }} />;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // Group schedules by date
  const byDate = {};
  for (const s of schedules) {
    const d = s.calibration_date?.slice(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(s);
  }

  return (
    <div>
      {showWizard && <CreateScheduleWizard token={token} onClose={() => setShowWizard(false)} onCreated={load} />}

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Calibration Scheduler</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Schedule and track calibrations for all assets</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ ...S.input, width: 140 }}>
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="overdue">Overdue</option>
          </select>
          <button style={S.btn(view === "calendar" ? "primary" : "ghost")} onClick={() => setView("calendar")}>📅 Calendar</button>
          <button style={S.btn(view === "list" ? "primary" : "ghost")} onClick={() => setView("list")}>☰ List</button>
          <button style={S.btn("success")} onClick={() => setShowWizard(true)}>+ New Schedule</button>
        </div>
      </div>

      {/* Calendar navigation */}
      {view === "calendar" && (
        <div style={{ ...S.card }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button style={S.btn("ghost")} onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>‹ Prev</button>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>{MONTH_NAMES[month]} {year}</h3>
            <button style={S.btn("ghost")} onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>Next ›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "#e2e8f0", borderRadius: 8, overflow: "hidden" }}>
            {DAY_NAMES.map(d => <div key={d} style={{ background: "#f8fafc", padding: "8px 0", textAlign: "center", fontSize: "12px", fontWeight: 700, color: "#475569" }}>{d}</div>)}
            {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} style={{ background: "#fff", minHeight: 90 }} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const daySchedules = byDate[dateStr] || [];
              const isToday = new Date().toISOString().slice(0, 10) === dateStr;
              return (
                <div key={day} style={{ background: "#fff", minHeight: 90, padding: "6px", position: "relative" }}>
                  <div style={{ fontSize: "13px", fontWeight: isToday ? 700 : 500, color: isToday ? "#2563eb" : "#0f172a", width: 24, height: 24, borderRadius: "50%", background: isToday ? "#eff6ff" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>{day}</div>
                  {daySchedules.map(s => (
                    <div key={s.id} onClick={() => setDetailId(s.id)}
                      style={{ background: s.status === "completed" ? "#dcfce7" : s.status === "overdue" ? "#fee2e2" : "#eff6ff", color: s.status === "completed" ? "#16a34a" : s.status === "overdue" ? "#dc2626" : "#1e40af", borderRadius: 4, padding: "3px 6px", fontSize: "11px", marginBottom: 2, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={`${s.schedule_number} — ${s.total_assets} assets`}>
                      {s.schedule_number} · {s.total_assets || 0} assets
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div style={S.card}>
          {loading ? <p style={{ textAlign: "center", color: "#94a3b8", padding: 30 }}>Loading…</p> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  {["Schedule #", "Date", "Frequency", "Total Assets", "Completed", "Pending", "Status", "Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {schedules.length === 0 && <tr><td colSpan={8} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 30 }}>No schedules found</td></tr>}
                  {schedules.map(s => (
                    <tr key={s.id}>
                      <td style={{ ...S.td, fontWeight: 700 }}>{s.schedule_number}</td>
                      <td style={S.td}>{s.calibration_date?.slice(0, 10)}</td>
                      <td style={S.td}><span style={S.badge("scheduled")}>{s.frequency}</span></td>
                      <td style={{ ...S.td, textAlign: "center" }}>{s.total_assets || 0}</td>
                      <td style={{ ...S.td, textAlign: "center", color: "#16a34a", fontWeight: 600 }}>{s.completed_assets || 0}</td>
                      <td style={{ ...S.td, textAlign: "center", color: "#d97706", fontWeight: 600 }}>{s.pending_assets || 0}</td>
                      <td style={S.td}><span style={S.badge(s.status)}>{s.status}</span></td>
                      <td style={S.td}><button style={{ ...S.btn("primary"), padding: "4px 10px", fontSize: "12px" }} onClick={() => setDetailId(s.id)}>View Details</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS TAB
// ══════════════════════════════════════════════════════════════════════════════
function ReportsTab({ token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", department: "", vendor: "", status: "" });
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, pageSize: 50, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) });
      const data = await apiFetch(`${CAL_API}/reports?${params}`, {}, token);
      setRows(data.rows || []); setTotal(data.total || 0);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [token, page, filters]);

  useEffect(() => { load(); }, [load]);

  const openHistory = async (asset) => {
    setSelectedAsset(asset); setHistoryLoading(true);
    try { const d = await apiFetch(`${CAL_API}/reports/${asset.assetId}`, {}, token); setHistory(d); }
    catch { setHistory(null); } finally { setHistoryLoading(false); }
  };

  const downloadCert = async (certId, fileName) => {
    try { const { url } = await apiFetch(`${CAL_API}/certificates/${certId}/download`, {}, token); const a = document.createElement("a"); a.href = url; a.download = fileName; a.target = "_blank"; a.click(); }
    catch (e) { alert(e.message); }
  };

  if (selectedAsset) return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button style={S.btn("ghost")} onClick={() => { setSelectedAsset(null); setHistory(null); }}>← Back to Reports</button>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{selectedAsset.assetName}</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Asset ID: {selectedAsset.assetId2} · {selectedAsset.departmentName}</p>
        </div>
      </div>
      {historyLoading ? <p style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>Loading history…</p> : history && (
        <>
          {/* Asset info */}
          <div style={{ ...S.card, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px 24px", fontSize: "13px" }}>
            {[["Asset Name", history.asset?.asset_name], ["Asset ID", history.asset?.generated_asset_id], ["Category", history.asset?.asset_category], ["Manufacturer", history.asset?.manufacturer], ["Model", history.asset?.model], ["Department", history.asset?.departmentName]].map(([k, v]) => (
              <div key={k}><span style={{ color: "#64748b", fontSize: "12px" }}>{k}</span><br /><strong>{v || "—"}</strong></div>
            ))}
          </div>
          {/* History */}
          <div style={S.card}>
            <h3 style={{ margin: "0 0 14px", fontSize: "15px", fontWeight: 700 }}>Calibration Timeline</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  {["Cal #", "Scheduled Date", "Completed Date", "Vendor", "Frequency", "Status", "Certificate", "Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {history.history?.length === 0 && <tr><td colSpan={8} style={{ ...S.td, textAlign: "center", color: "#94a3b8" }}>No calibration history</td></tr>}
                  {history.history?.map(h => (
                    <tr key={h.saId}>
                      <td style={{ ...S.td, fontWeight: 700 }}>{h.schedule_number}</td>
                      <td style={S.td}>{h.calibration_date?.slice(0, 10)}</td>
                      <td style={S.td}>{h.completed_at ? h.completed_at.slice(0, 10) : "—"}</td>
                      <td style={S.td}>{h.vendor_name || "—"}</td>
                      <td style={S.td}>{h.frequency}</td>
                      <td style={S.td}><span style={S.badge(h.status)}>{h.status}</span></td>
                      <td style={S.td}>
                        {h.certId
                          ? <span style={{ fontSize: "12px", color: "#16a34a" }}>✓ v{h.certVersion}</span>
                          : <span style={{ fontSize: "12px", color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={S.td}>
                        {h.certId && (
                          <button style={{ ...S.btn("ghost"), padding: "3px 8px", fontSize: "12px" }} onClick={() => downloadCert(h.certId, h.certFileName)}>↓ PDF</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Calibration Reports</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Asset-wise calibration summary and certificate tracking</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="Search assets…" style={{ ...S.input, width: 200 }} />
          <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ ...S.input, width: 150 }}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div style={S.card}>
        {loading ? <p style={{ textAlign: "center", color: "#94a3b8", padding: 30 }}>Loading reports…</p> : (
          <>
            <div style={{ fontSize: "12.5px", color: "#64748b", marginBottom: 12 }}>Showing {rows.length} of {total} calibrated assets</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  {["Asset ID", "Asset Name", "Department", "Vendor", "Last Calibration", "Next Calibration", "Frequency", "Cert Status", "Schedule Status", "Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={10} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 30 }}>No calibrated assets found. Create schedules to start tracking.</td></tr>}
                  {rows.map(r => {
                    const isOverdue = r.nextCalibrationDate && new Date(r.nextCalibrationDate) < new Date();
                    return (
                      <tr key={r.assetId} onClick={() => openHistory(r)} style={{ cursor: "pointer" }}>
                        <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{r.assetId2}</td>
                        <td style={{ ...S.td, fontWeight: 600 }}>{r.assetName}</td>
                        <td style={S.td}>{r.departmentName || "—"}</td>
                        <td style={S.td}>{r.lastVendor || "—"}</td>
                        <td style={S.td}>{r.lastCalibrationDate ? r.lastCalibrationDate.slice(0, 10) : "—"}</td>
                        <td style={{ ...S.td, color: isOverdue ? "#dc2626" : "#0f172a", fontWeight: isOverdue ? 700 : 400 }}>{r.nextCalibrationDate ? r.nextCalibrationDate.slice(0, 10) : "—"}{isOverdue && " ⚠"}</td>
                        <td style={S.td}>{r.frequency || "—"}</td>
                        <td style={S.td}><span style={S.badge(r.certStatus === "uploaded" ? "completed" : "pending")}>{r.certStatus === "uploaded" ? "✓ Uploaded" : "Missing"}</span></td>
                        <td style={S.td}><span style={S.badge(r.currentStatus)}>{r.currentStatus || "—"}</span></td>
                        <td style={S.td}><button style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: "12px" }} onClick={e => { e.stopPropagation(); openHistory(r); }}>History</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {total > 50 && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button style={S.btn("ghost")} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                <span style={{ fontSize: "13px", color: "#64748b", alignSelf: "center" }}>Page {page}</span>
                <button style={S.btn("ghost")} disabled={rows.length < 50} onClick={() => setPage(p => p + 1)}>Next ›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT MODULE
// ══════════════════════════════════════════════════════════════════════════════
export default function CalibrationModule({ token }) {
  const [tab, setTab] = useState("scheduler");

  const TABS = [
    { key: "scheduler", label: "📅 Scheduler" },
    { key: "vendors",   label: "🏢 Vendors"   },
    { key: "reports",   label: "📊 Reports"   },
  ];

  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Module header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><circle cx="12" cy="12" r="2"/><path d="M12 5v2M12 17v2M5 12H3M21 12h-2M7.05 7.05 5.64 5.64M18.36 18.36l-1.41-1.41M7.05 16.95l-1.41 1.41M18.36 5.64l-1.41 1.41"/></svg>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Calibration Management</h1>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Schedule, track, and certify equipment calibrations</p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, background: "#f1f5f9", borderRadius: 10, padding: 4, marginBottom: 24, width: "fit-content" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: "13.5px", fontWeight: tab === t.key ? 700 : 500, background: tab === t.key ? "#fff" : "transparent", color: tab === t.key ? "#1e40af" : "#64748b", boxShadow: tab === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "scheduler" && <SchedulerTab token={token} />}
      {tab === "vendors"   && <VendorsTab   token={token} />}
      {tab === "reports"   && <ReportsTab   token={token} />}
    </div>
  );
}
