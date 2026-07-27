/**
 * TrainingModule.jsx
 * Comprehensive Training Management Module
 *
 * Tabs: Scheduler (Calendar) | Employees | Reports
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();
const TRN_API = `${BASE}/api/company-portal/training`;

// ─── Style helpers ─────────────────────────────────────────────────────────────
const S = {
  card:  { background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  btn:   (v = "primary") => ({
    padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 700,
    ...(v === "primary"  ? { background: "#7c3aed", color: "#fff" } :
        v === "success"  ? { background: "#16a34a", color: "#fff" } :
        v === "danger"   ? { background: "#dc2626", color: "#fff" } :
        v === "warning"  ? { background: "#d97706", color: "#fff" } :
        v === "info"     ? { background: "#0891b2", color: "#fff" } :
        v === "ghost"    ? { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" } :
                           { background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0" }),
  }),
  input: { width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box" },
  label: { fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" },
  th:    { padding: "10px 12px", fontSize: "12px", fontWeight: 700, color: "#475569", background: "#f8fafc", textAlign: "left", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" },
  td:    { padding: "10px 12px", fontSize: "13px", color: "#0f172a", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  badge: (c) => ({
    display: "inline-block", padding: "2px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700,
    ...(c === "completed" ? { background: "#dcfce7", color: "#16a34a" } :
        c === "present"   ? { background: "#dcfce7", color: "#16a34a" } :
        c === "scheduled" ? { background: "#ede9fe", color: "#7c3aed" } :
        c === "ongoing"   ? { background: "#dbeafe", color: "#2563eb" } :
        c === "absent"    ? { background: "#fee2e2", color: "#dc2626" } :
        c === "excused"   ? { background: "#fef3c7", color: "#d97706" } :
        c === "cancelled" ? { background: "#f1f5f9", color: "#94a3b8" } :
        c === "draft"     ? { background: "#f1f5f9", color: "#64748b" } :
                            { background: "#f1f5f9", color: "#64748b" }),
  }),
};

const ACCENT = "#7c3aed";
const ACCENT_BG = "#ede9fe";

async function apiFetch(url, opts = {}, token) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(opts.body && !(opts.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || `HTTP ${r.status}`); }
  return r.json();
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const CATEGORIES = ["Biomedical Equipment","Electrical Safety","Fire Safety","Infection Control","Patient Handling","Radiation Safety","Software & IT","Quality Management","Other"];
const STATUS_OPTS = ["scheduled","ongoing","completed","cancelled","draft"];

// ─── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type = "success", onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 9999, padding: "12px 20px", borderRadius: "10px", background: type === "error" ? "#dc2626" : "#16a34a", color: "#fff", fontWeight: 600, fontSize: "14px", boxShadow: "0 4px 20px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", gap: 10 }}>
      {type === "error" ? "⚠ " : "✓ "}{msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "16px" }}>×</button>
    </div>
  );
}

// ─── Field helper ──────────────────────────────────────────────────────────────
function Field({ label, children, style }) {
  return (
    <div style={{ flex: 1, minWidth: 180, ...style }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <div style={{ ...S.card, padding: "14px 16px", borderLeft: `4px solid ${color}`, minWidth: 120 }}>
      <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, color }}>{value ?? "—"}</div>
    </div>
  );
}

// ─── Empty ─────────────────────────────────────────────────────────────────────
function Empty({ msg }) {
  return <p style={{ textAlign: "center", color: "#94a3b8", padding: 40, fontSize: "14px" }}>{msg}</p>;
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE / EDIT SESSION MODAL
// ══════════════════════════════════════════════════════════════════════════════
function SessionModal({ token, session, departments, onClose, onSaved }) {
  const isEdit = Boolean(session?.id);
  const [form, setForm] = useState({
    title: session?.title || "",
    description: session?.description || "",
    trainerName: session?.trainer_name || "",
    trainingDate: session?.training_date?.slice(0, 10) || "",
    startTime: session?.start_time || "",
    endTime: session?.end_time || "",
    departmentId: session?.department_id || "",
    departmentName: session?.department_name || "",
    status: session?.status || "scheduled",
    notes: session?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const calcDuration = () => {
    if (!form.startTime || !form.endTime) return null;
    const [sh, sm] = form.startTime.split(":").map(Number);
    const [eh, em] = form.endTime.split(":").map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    return mins > 0 ? mins : null;
  };

  const fld = (key) => (e) => {
    const val = e.target.value;
    setForm(p => {
      const next = { ...p, [key]: val };
      if (key === "departmentId") {
        const d = departments.find(d => String(d.id) === String(val));
        next.departmentName = d?.departmentName || d?.name || "";
      }
      return next;
    });
  };

  const save = async () => {
    if (!form.title.trim()) return setErr("Training title is required");
    if (!form.trainingDate)  return setErr("Training date is required");
    setErr(""); setSaving(true);
    try {
      const body = { ...form, durationMinutes: calcDuration() };
      if (isEdit) await apiFetch(`${TRN_API}/sessions/${session.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
      else await apiFetch(`${TRN_API}/sessions`, { method: "POST", body: JSON.stringify(body) }, token);
      onSaved();
      onClose();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 8000, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "min(740px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>{isEdit ? "Edit Training Session" : "New Training Session"}</h2>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>{isEdit ? `Session: ${session.session_number}` : "Fill in the details to schedule a training"}</p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#94a3b8" }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          {err && <div style={{ padding: "10px 14px", borderRadius: 8, background: "#fee2e2", color: "#dc2626", fontSize: "13px", marginBottom: 16 }}>{err}</div>}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Field label="Training Title *" style={{ flex: "100%" }}>
              <input value={form.title} onChange={fld("title")} placeholder="e.g. Biomedical Equipment Safety Training" style={S.input} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Field label="Trainer Name">
              <input value={form.trainerName} onChange={fld("trainerName")} placeholder="e.g. Dr. Priya Sharma" style={S.input} />
            </Field>
            <Field label="Training Date *">
              <input type="date" value={form.trainingDate} onChange={fld("trainingDate")} style={S.input} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Field label="Start Time">
              <input type="time" value={form.startTime} onChange={fld("startTime")} style={S.input} />
            </Field>
            <Field label="End Time">
              <input type="time" value={form.endTime} onChange={fld("endTime")} style={S.input} />
            </Field>
            <Field label="Duration">
              <input readOnly value={calcDuration() ? `${calcDuration()} min` : ""} placeholder="Auto-calculated" style={{ ...S.input, background: "#f8fafc", color: "#64748b" }} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <Field label="Department (Optional)">
              <select value={form.departmentId} onChange={fld("departmentId")} style={S.input}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={fld("status")} style={S.input}>
                {STATUS_OPTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Description</label>
            <textarea value={form.description} onChange={fld("description")} rows={3} placeholder="Training objectives, topics covered…" style={{ ...S.input, resize: "vertical" }} />
          </div>
          <div>
            <label style={S.label}>Notes</label>
            <textarea value={form.notes} onChange={fld("notes")} rows={2} placeholder="Internal notes…" style={{ ...S.input, resize: "vertical" }} />
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between" }}>
          <button style={S.btn("ghost")} onClick={onClose}>Cancel</button>
          <button style={S.btn("primary")} onClick={save} disabled={saving}>{saving ? "Saving…" : isEdit ? "Update Session" : "Create Session"}</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTENDANCE PANEL (inside session detail)
// ══════════════════════════════════════════════════════════════════════════════
function AttendancePanel({ token, sessionId, onUpdate }) {
  const [attendance, setAttendance] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [empSearch, setEmpSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [departments, setDepartments] = useState([]);
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualForm, setManualForm] = useState({ name: "", code: "", designation: "", departmentName: "", status: "present" });
  const [submittingManual, setSubmittingManual] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [att, emps, depts] = await Promise.all([
        apiFetch(`${TRN_API}/sessions/${sessionId}/attendance`, {}, token),
        fetch(`${BASE}/api/company-portal/employees?limit=500`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
        fetch(`${BASE}/api/company-portal/departments`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      setAttendance(Array.isArray(att) ? att : []);
      setEmployees(Array.isArray(emps) ? emps : (emps?.employees || []));
      setDepartments(Array.isArray(depts) ? depts : []);
    } catch { setAttendance([]); } finally { setLoading(false); }
  }, [token, sessionId]);

  useEffect(() => { load(); }, [load]);

  const attMap = useMemo(() => {
    const m = new Map();
    attendance.forEach(a => { if (a.employee_id) m.set(Number(a.employee_id), a); });
    return m;
  }, [attendance]);

  const markSingle = async (empId, status) => {
    setSaving(empId);
    try {
      await apiFetch(`${TRN_API}/sessions/${sessionId}/attendance`, { method: "POST", body: JSON.stringify({ employeeId: empId, attendanceStatus: status }) }, token);
      await load(); onUpdate();
    } catch (e) { setToast({ msg: e.message, type: "error" }); } finally { setSaving(null); }
  };

  const removeAtt = async (empId, recordId) => {
    if (!window.confirm("Remove this attendance record?")) return;
    try {
      if (recordId && !empId) {
        await apiFetch(`${TRN_API}/sessions/${sessionId}/attendance/record/${recordId}`, { method: "DELETE" }, token);
      } else {
        await apiFetch(`${TRN_API}/sessions/${sessionId}/attendance/${empId}`, { method: "DELETE" }, token);
      }
      await load(); onUpdate();
    } catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const markAll = async (status) => {
    setSaving("bulk");
    try {
      const records = employees.map(e => ({ employeeId: e.id, attendanceStatus: status }));
      if (!records.length) return;
      const r = await apiFetch(`${TRN_API}/sessions/${sessionId}/attendance/bulk`, { method: "POST", body: JSON.stringify({ records }) }, token);
      setToast({ msg: `${r.saved} records saved` });
      await load(); onUpdate();
    } catch (e) { setToast({ msg: e.message, type: "error" }); } finally { setSaving(null); }
  };

  const submitManual = async () => {
    if (!manualForm.name.trim()) return setToast({ msg: "Name is required", type: "error" });
    setSubmittingManual(true);
    try {
      await apiFetch(`${TRN_API}/sessions/${sessionId}/attendance/manual`, { method: "POST", body: JSON.stringify({ name: manualForm.name, code: manualForm.code, designation: manualForm.designation, departmentName: manualForm.departmentName, attendanceStatus: manualForm.status }) }, token);
      setToast({ msg: "Manual entry added!" }); setShowManualForm(false); setManualForm({ name: "", code: "", designation: "", departmentName: "", status: "present" });
      await load(); onUpdate();
    } catch (e) { setToast({ msg: e.message, type: "error" }); } finally { setSubmittingManual(false); }
  };

  const filteredEmps = employees.filter(e =>
    (!deptFilter || String(e.departmentId || e.department_id) === String(deptFilter)) &&
    (!empSearch || (e.fullName || e.full_name || "").toLowerCase().includes(empSearch.toLowerCase()) || (e.username || "").toLowerCase().includes(empSearch.toLowerCase()))
  );
  const manualEntries = attendance.filter(a => a.is_manual || !a.employee_id);

  const present  = attendance.filter(a => a.attendance_status === "present").length;
  const absent   = attendance.filter(a => a.attendance_status === "absent").length;
  const excused  = attendance.filter(a => a.attendance_status === "excused").length;
  const pct      = attendance.length ? Math.round(100 * present / attendance.length) : 0;

  const statusColor = { present: "#16a34a", absent: "#dc2626", excused: "#d97706" };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 18 }}>
        <StatCard label="Total Employees" value={employees.length} color={ACCENT} />
        <StatCard label="Present" value={present} color="#16a34a" />
        <StatCard label="Absent" value={absent} color="#dc2626" />
        <StatCard label="Excused" value={excused} color="#d97706" />
        <StatCard label="Attendance %" value={`${pct}%`} color="#0891b2" />
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <input value={empSearch} onChange={e => setEmpSearch(e.target.value)} placeholder="Search employee…" style={{ ...S.input, flex: 1, minWidth: 160 }} />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={{ ...S.input, width: 170 }}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
        </select>
        <button style={S.btn("success")} disabled={saving === "bulk"} onClick={() => markAll("present")}>✔ Mark All Present</button>
        <button style={S.btn("danger")} disabled={saving === "bulk"} onClick={() => markAll("absent")}>✘ Mark All Absent</button>
        <button style={{ ...S.btn("primary"), background: "#7c3aed" }} onClick={() => setShowManualForm(v => !v)}>+ Add Manual</button>
      </div>

      {/* Manual entry form */}
      {showManualForm && (
        <div style={{ background: "#faf5ff", border: "1px solid #d8b4fe", borderRadius: 10, padding: "16px", marginBottom: 14 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: "14px", color: "#7c3aed" }}>Add External / Manual Attendee</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
            <input placeholder="Full Name *" value={manualForm.name} onChange={e => setManualForm(p => ({ ...p, name: e.target.value }))} style={S.input} />
            <input placeholder="Employee Code" value={manualForm.code} onChange={e => setManualForm(p => ({ ...p, code: e.target.value }))} style={S.input} />
            <input placeholder="Designation" value={manualForm.designation} onChange={e => setManualForm(p => ({ ...p, designation: e.target.value }))} style={S.input} />
            <input placeholder="Department" value={manualForm.departmentName} onChange={e => setManualForm(p => ({ ...p, departmentName: e.target.value }))} style={S.input} />
            <select value={manualForm.status} onChange={e => setManualForm(p => ({ ...p, status: e.target.value }))} style={S.input}>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="excused">Excused</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={S.btn("primary")} onClick={submitManual} disabled={submittingManual}>{submittingManual ? "Saving…" : "Save Manual Entry"}</button>
            <button style={S.btn("ghost")} onClick={() => setShowManualForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? <Empty msg="Loading…" /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Employee", "Code", "Department", "Designation", "Status", "Recorded", "Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filteredEmps.map(e => {
                const empId = e.id;
                const rec = attMap.get(Number(empId));
                return (
                  <tr key={empId} style={{ background: rec ? (rec.attendance_status === "present" ? "#f0fdf4" : rec.attendance_status === "absent" ? "#fef2f2" : "#fffbeb") : "transparent" }}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{e.fullName || e.full_name}</td>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{e.username || "—"}</td>
                    <td style={S.td}>{e.departmentName || e.department_name || "—"}</td>
                    <td style={S.td}>{e.designation || "—"}</td>
                    <td style={S.td}>
                      <select
                        value={rec?.attendance_status || ""}
                        onChange={e2 => markSingle(empId, e2.target.value)}
                        disabled={saving === empId}
                        style={{ ...S.input, width: 110, padding: "4px 6px", borderColor: rec ? statusColor[rec.attendance_status] : "#e2e8f0", color: rec ? statusColor[rec.attendance_status] : "#94a3b8", fontWeight: rec ? 700 : 400 }}
                      >
                        <option value="" disabled>Not Marked</option>
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="excused">Excused</option>
                      </select>
                    </td>
                    <td style={{ ...S.td, fontSize: "12px", color: "#64748b" }}>{rec?.recorded_at ? new Date(rec.recorded_at).toLocaleString() : "—"}</td>
                    <td style={S.td}>{rec && <button style={{ ...S.btn("danger"), padding: "3px 8px", fontSize: "11px" }} onClick={() => removeAtt(empId, null)}>Remove</button>}</td>
                  </tr>
                );
              })}
              {/* Manual entries inline in same table */}
              {manualEntries.map(a => (
                <tr key={`manual-${a.id}`} style={{ background: a.attendance_status === "present" ? "#f0fdf4" : a.attendance_status === "absent" ? "#fef2f2" : "#fffbeb" }}>
                  <td style={{ ...S.td, fontWeight: 600 }}>
                    {a.employee_name}
                    <span style={{ fontSize: "10px", color: "#7c3aed", background: "#ede9fe", padding: "1px 5px", borderRadius: 4, marginLeft: 6, verticalAlign: "middle" }}>ext</span>
                  </td>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{a.employee_code || "—"}</td>
                  <td style={S.td}>{a.department_name || "—"}</td>
                  <td style={S.td}>{a.designation || "—"}</td>
                  <td style={S.td}>
                    <span style={{ ...S.input, width: 110, padding: "4px 6px", display: "inline-block", borderColor: statusColor[a.attendance_status], color: statusColor[a.attendance_status], fontWeight: 700, textTransform: "capitalize", fontSize: "13px" }}>
                      {a.attendance_status}
                    </span>
                  </td>
                  <td style={{ ...S.td, fontSize: "12px", color: "#64748b" }}>{a.recorded_at ? new Date(a.recorded_at).toLocaleString() : "—"}</td>
                  <td style={S.td}><button style={{ ...S.btn("danger"), padding: "3px 8px", fontSize: "11px" }} onClick={() => removeAtt(null, a.id)}>Remove</button></td>
                </tr>
              ))}
              {filteredEmps.length === 0 && manualEntries.length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: "center", color: "#94a3b8", padding: 24 }}>No employees found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENTS PANEL (inside session detail)
// ══════════════════════════════════════════════════════════════════════════════
function DocumentsPanel({ token, sessionId }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);
  const [toast, setToast] = useState(null);
  const fileRefs = useRef({});

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch(`${TRN_API}/sessions/${sessionId}/documents`, {}, token); setDocs(Array.isArray(d) ? d : []); }
    catch { setDocs([]); } finally { setLoading(false); }
  }, [token, sessionId]);

  useEffect(() => { load(); }, [load]);

  const uploadDoc = async (type, file) => {
    if (!file) return;
    setUploading(type);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("documentType", type);
      await apiFetch(`${TRN_API}/sessions/${sessionId}/documents`, { method: "POST", body: fd }, token);
      setToast({ msg: "Document uploaded!" }); load();
    } catch (e) { setToast({ msg: e.message, type: "error" }); } finally { setUploading(null); }
  };

  const deleteDoc = async (docId, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    try { await apiFetch(`${TRN_API}/sessions/${sessionId}/documents/${docId}`, { method: "DELETE" }, token); setToast({ msg: "Document deleted" }); load(); }
    catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const downloadDoc = async (docId, fileName) => {
    try { const { url } = await apiFetch(`${TRN_API}/documents/${docId}/download`, {}, token); const a = document.createElement("a"); a.href = url; a.download = fileName; a.target = "_blank"; a.click(); }
    catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const SECTIONS = [
    { type: "attendance_sheet", label: "📄 Attendance Sheet", accept: ".pdf,.xlsx,.xls,.jpg,.jpeg,.png", multi: false },
    { type: "image",            label: "🖼 Training Images",   accept: ".jpg,.jpeg,.png",                 multi: true  },
  ];

  const isImage = (mimetype) => mimetype?.startsWith("image/");

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {SECTIONS.map(sec => {
        const secDocs = docs.filter(d => d.document_type === sec.type);
        const latestDocs = sec.type === "attendance_sheet" ? secDocs.filter(d => d.is_current) : secDocs;
        const versions = sec.type === "attendance_sheet" ? secDocs.filter(d => !d.is_current) : [];
        return (
          <div key={sec.type} style={{ ...S.card, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700 }}>{sec.label}</h4>
              <div>
                <input ref={el => fileRefs.current[sec.type] = el} type="file" accept={sec.accept} multiple={sec.multi} style={{ display: "none" }} onChange={e => { const files = e.target.files; if (files) for (const f of files) uploadDoc(sec.type, f); e.target.value = ""; }} />
                <button style={{ ...S.btn("primary"), padding: "6px 14px", fontSize: "12px" }} onClick={() => fileRefs.current[sec.type]?.click()} disabled={uploading === sec.type}>{uploading === sec.type ? "Uploading…" : sec.type === "attendance_sheet" && latestDocs.length > 0 ? "Replace" : "Upload"}</button>
              </div>
            </div>

            {loading ? <p style={{ color: "#94a3b8", fontSize: "13px" }}>Loading…</p> : (
              <>
                {/* Images: grid preview */}
                {sec.type === "image" && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {latestDocs.length === 0 && <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>No images uploaded yet</p>}
                    {latestDocs.map(d => (
                      <div key={d.id} style={{ width: 120, position: "relative" }}>
                        {isImage(d.mimetype)
                          ? <img src={d.file_url?.startsWith('http') ? d.file_url : `${BASE}${d.file_url}`} alt={d.file_name} style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0", cursor: "pointer" }} onClick={() => window.open(d.file_url, "_blank")} />
                          : <div style={{ width: "100%", height: 90, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#64748b", textAlign: "center", padding: 4 }}>{d.file_name}</div>}
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.file_name}</div>
                        <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
                          <button style={{ ...S.btn("ghost"), padding: "2px 6px", fontSize: "10px" }} onClick={() => downloadDoc(d.id, d.file_name)}>↓</button>
                          <button style={{ ...S.btn("danger"), padding: "2px 6px", fontSize: "10px" }} onClick={() => deleteDoc(d.id, d.file_name)}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Other: list view */}
                {sec.type !== "image" && (
                  <>
                    {latestDocs.length === 0 && <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>No documents uploaded yet</p>}
                    {latestDocs.map(d => (
                      <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8, marginBottom: 6 }}>
                        <div>
                          <span style={{ fontWeight: 600, fontSize: "13px" }}>{d.file_name}</span>
                          <span style={{ fontSize: "11px", color: "#64748b", marginLeft: 8 }}>v{d.version} · {d.uploaded_by_name} · {new Date(d.created_at).toLocaleDateString()}</span>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: "12px" }} onClick={() => downloadDoc(d.id, d.file_name)}>↓ Download</button>
                          <button style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: "12px" }} onClick={() => deleteDoc(d.id, d.file_name)}>Delete</button>
                        </div>
                      </div>
                    ))}
                    {/* Version history for attendance sheet */}
                    {sec.type === "attendance_sheet" && versions.length > 0 && (
                      <details style={{ marginTop: 8 }}>
                        <summary style={{ fontSize: "12px", color: "#64748b", cursor: "pointer" }}>Version History ({versions.length} older version{versions.length > 1 ? "s" : ""})</summary>
                        {versions.map(d => (
                          <div key={d.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: "#f1f5f9", borderRadius: 6, marginTop: 4, fontSize: "12px", color: "#64748b" }}>
                            <span>{d.file_name} · v{d.version} · {new Date(d.created_at).toLocaleDateString()}</span>
                            <button style={{ ...S.btn("ghost"), padding: "3px 8px", fontSize: "11px" }} onClick={() => downloadDoc(d.id, d.file_name)}>↓</button>
                          </div>
                        ))}
                      </details>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SESSION DETAIL
// ══════════════════════════════════════════════════════════════════════════════
function SessionDetail({ sessionId, token, onBack }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [editing, setEditing] = useState(false);
  const [departments, setDepartments] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, depts] = await Promise.all([
        apiFetch(`${TRN_API}/sessions/${sessionId}`, {}, token),
        fetch(`${BASE}/api/company-portal/departments`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      ]);
      setSession(s); setDepartments(Array.isArray(depts) ? depts : []);
    } catch { } finally { setLoading(false); }
  }, [sessionId, token]);

  useEffect(() => { load(); }, [load]);

  const markComplete = async () => {
    if (!window.confirm("Mark this training as Completed? You can then upload attendance sheet and images.")) return;
    try {
      await apiFetch(`${TRN_API}/sessions/${sessionId}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) }, token);
      setToast({ msg: "Training marked as completed!" }); load();
    } catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading session…</div>;

  const present  = session?.total_present || 0;
  const pct      = session?.total_registered ? Math.round(100 * present / session.total_registered) : 0;

  const SectionHead = ({ label }) => (
    <div style={{ padding: "10px 0 8px", margin: "24px 0 14px", borderBottom: "2px solid #e2e8f0" }}>
      <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{label}</span>
    </div>
  );

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {editing && <SessionModal token={token} session={session} departments={departments} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button style={S.btn("ghost")} onClick={onBack}>← Back</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{session?.title}</h2>
            <span style={S.badge(session?.status)}>{session?.status}</span>
          </div>
          <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#64748b" }}>{session?.session_number} · {session?.training_date?.slice(0, 10)} · {session?.trainer_name || "No trainer"}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={S.btn("ghost")} onClick={() => setEditing(true)}>Edit</button>
          {session?.status !== "completed" && session?.status !== "cancelled" && (
            <button style={S.btn("success")} onClick={markComplete}>✓ Mark Complete</button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 18 }}>
        <StatCard label="Registered" value={session?.total_registered || 0} color={ACCENT} />
        <StatCard label="Present" value={present} color="#16a34a" />
        <StatCard label="Absent" value={session?.total_absent || 0} color="#dc2626" />
        <StatCard label="Attendance %" value={`${pct}%`} color="#0891b2" />
      </div>

      {/* Tabs */}
      <div>

      {/* Info section */}
      <div style={{ ...S.card, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "14px 24px", fontSize: "13px" }}>
            {[
              ["Session Number", session?.session_number],
              ["Title", session?.title],
              ["Trainer", session?.trainer_name || "—"],
              ["Date", session?.training_date?.slice(0, 10)],
              ["Time", session?.start_time && session?.end_time ? `${session.start_time} – ${session.end_time}` : session?.start_time || "—"],
              ["Duration", session?.duration_minutes ? `${session.duration_minutes} min` : "—"],
              ["Department", session?.department_name || "All Departments"],
              ["Status", session?.status],
              ["Created By", session?.created_by_name || "—"],
              ["Completed At", session?.completed_at ? new Date(session.completed_at).toLocaleString() : "—"],
            ].map(([k, v]) => (
              <div key={k}><span style={{ color: "#64748b", fontSize: "12px", fontWeight: 600 }}>{k}</span><br /><span style={{ fontWeight: 500 }}>{v || "—"}</span></div>
            ))}
          </div>
          {session?.description && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
              <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 600 }}>Description</span>
              <p style={{ margin: "6px 0 0", fontSize: "13px", lineHeight: 1.6, color: "#374151" }}>{session.description}</p>
            </div>
          )}
          {session?.notes && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9" }}>
              <span style={{ color: "#64748b", fontSize: "12px", fontWeight: 600 }}>Notes</span>
              <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#374151" }}>{session.notes}</p>
            </div>
          )}
        </div>

      <SectionHead label="✅ Attendance" />
      <AttendancePanel token={token} sessionId={sessionId} onUpdate={load} />

      <SectionHead label="📁 Documents" />
      <DocumentsPanel token={token} sessionId={sessionId} />

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCHEDULER TAB (Calendar + Session List)
// ══════════════════════════════════════════════════════════════════════════════
function SchedulerTab({ token }) {
  const [sessions, setSessions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calView, setCalView] = useState("month"); // month | week | day
  const [listView, setListView] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [filters, setFilters] = useState({ status: "", search: "", department: "" });
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      // For month view, load entire month; for list view load wider
      const from = listView ? `${year - 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const to   = listView ? `${year + 1}-12-31` : `${year}-${String(month + 1).padStart(2, "0")}-${new Date(year, month + 1, 0).getDate()}`;
      const params = new URLSearchParams({ from, to, calendarView: "1" });
      if (filters.status)     params.set("status",     filters.status);
      if (filters.department) params.set("department", filters.department);
      if (filters.search)     params.set("search",     filters.search);
      const [s, depts] = await Promise.all([
        apiFetch(`${TRN_API}/sessions?${params}`, {}, token),
        fetch(`${BASE}/api/company-portal/departments`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => []),
      ]);
      setSessions(Array.isArray(s) ? s : []);
      setDepartments(Array.isArray(depts) ? depts : []);
    } catch { setSessions([]); } finally { setLoading(false); }
  }, [token, currentDate, filters, listView]);

  useEffect(() => { load(); }, [load]);

  const deleteSession = async (id, title) => {
    if (!window.confirm(`Delete "${title}"? This will remove all attendance records.`)) return;
    try { await apiFetch(`${TRN_API}/sessions/${id}`, { method: "DELETE" }, token); setToast({ msg: "Session deleted" }); load(); }
    catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  if (detailId) return <SessionDetail sessionId={detailId} token={token} onBack={() => { setDetailId(null); load(); }} />;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Group by date
  const byDate = {};
  for (const s of sessions) {
    const d = s.training_date?.slice(0, 10);
    if (d) { if (!byDate[d]) byDate[d] = []; byDate[d].push(s); }
  }

  const STATUS_COLOR = { completed: "#16a34a", scheduled: ACCENT, ongoing: "#2563eb", cancelled: "#94a3b8", draft: "#94a3b8" };

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {showCreate && <SessionModal token={token} departments={departments} onClose={() => setShowCreate(false)} onSaved={load} />}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Training Scheduler</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Schedule and manage all training sessions</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="Search sessions…" style={{ ...S.input, width: 180 }} />
          <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ ...S.input, width: 140 }}>
            <option value="">All Statuses</option>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select value={filters.department} onChange={e => setFilters(p => ({ ...p, department: e.target.value }))} style={{ ...S.input, width: 160 }}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
          </select>
          <button style={S.btn(!listView ? "primary" : "ghost")} onClick={() => setListView(false)}>📅 Calendar</button>
          <button style={S.btn(listView ? "primary" : "ghost")} onClick={() => setListView(true)}>☰ List</button>
          <button style={S.btn("success")} onClick={() => setShowCreate(true)}>+ New Session</button>
        </div>
      </div>

      {/* Calendar View */}
      {!listView && (
        <div style={S.card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <button style={S.btn("ghost")} onClick={() => setCurrentDate(new Date(year, month - 1, 1))}>‹ Prev</button>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>{MONTHS[month]} {year}</h3>
              <button style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: "12px" }} onClick={() => setCurrentDate(new Date())}>Today</button>
            </div>
            <button style={S.btn("ghost")} onClick={() => setCurrentDate(new Date(year, month + 1, 1))}>Next ›</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "#e2e8f0", borderRadius: 10, overflow: "hidden" }}>
            {DAYS.map(d => <div key={d} style={{ background: "#f8fafc", padding: "8px 0", textAlign: "center", fontSize: "12px", fontWeight: 700, color: "#475569" }}>{d}</div>)}
            {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} style={{ background: "#fff", minHeight: 100 }} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const daySessions = byDate[dateStr] || [];
              const isToday = new Date().toISOString().slice(0, 10) === dateStr;
              return (
                <div key={day} style={{ background: "#fff", minHeight: 100, padding: 6 }}>
                  <div style={{ fontSize: "13px", fontWeight: isToday ? 700 : 500, color: isToday ? ACCENT : "#0f172a", width: 26, height: 26, borderRadius: "50%", background: isToday ? ACCENT_BG : "transparent", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>{day}</div>
                  {daySessions.slice(0, 3).map(s => (
                    <div key={s.id} onClick={() => setDetailId(s.id)}
                      style={{ background: ACCENT_BG, color: STATUS_COLOR[s.status] || ACCENT, borderLeft: `3px solid ${STATUS_COLOR[s.status] || ACCENT}`, borderRadius: "0 4px 4px 0", padding: "3px 6px", fontSize: "11px", marginBottom: 2, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      title={`${s.title} — ${s.total_registered || 0} registered`}>
                      {s.start_time ? `${s.start_time} ` : ""}{s.title}
                    </div>
                  ))}
                  {daySessions.length > 3 && (
                    <div style={{ fontSize: "11px", color: ACCENT, fontWeight: 600, cursor: "pointer" }} onClick={() => setFilters(p => ({ ...p, search: "" }))}>+{daySessions.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
            {Object.entries(STATUS_COLOR).map(([s, c]) => (
              <div key={s} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "12px", color: "#64748b" }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* List View */}
      {listView && (
        <div style={S.card}>
          {loading ? <Empty msg="Loading sessions…" /> : sessions.length === 0 ? <Empty msg="No training sessions found. Click + New Session to create one." /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  {["Session #","Title","Trainer","Date","Time","Department","Registered","Present","Att %","Status","Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {sessions.map(s => {
                    const pct = s.total_registered ? Math.round(100 * s.total_present / s.total_registered) : 0;
                    return (
                      <tr key={s.id} onClick={() => setDetailId(s.id)} style={{ cursor: "pointer" }}>
                        <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{s.session_number}</td>
                        <td style={{ ...S.td, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</td>
                        <td style={S.td}>{s.trainer_name || "—"}</td>
                        <td style={S.td}>{s.training_date?.slice(0, 10)}</td>
                        <td style={{ ...S.td, fontSize: "12px" }}>{s.start_time && s.end_time ? `${s.start_time}–${s.end_time}` : s.start_time || "—"}</td>
                        <td style={S.td}>{s.department_name || "All"}</td>
                        <td style={{ ...S.td, textAlign: "center" }}>{s.total_registered || 0}</td>
                        <td style={{ ...S.td, textAlign: "center", color: "#16a34a", fontWeight: 600 }}>{s.total_present || 0}</td>
                        <td style={{ ...S.td, textAlign: "center", color: pct >= 75 ? "#16a34a" : "#dc2626", fontWeight: 600 }}>{s.total_registered ? `${pct}%` : "—"}</td>
                        <td style={S.td}><span style={S.badge(s.status)}>{s.status}</span></td>
                        <td style={S.td} onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 5 }}>
                            <button style={{ ...S.btn("primary"), padding: "4px 10px", fontSize: "12px" }} onClick={() => setDetailId(s.id)}>View</button>
                            <button style={{ ...S.btn("danger"), padding: "4px 10px", fontSize: "12px" }} onClick={() => deleteSession(s.id, s.title)}>Del</button>
                          </div>
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
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BULK IMPORT (Excel) — used in Employees tab
// ══════════════════════════════════════════════════════════════════════════════
function BulkImportPanel({ token, sessions, onClose, onImported }) {
  const [sessionId, setSessionId] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Employee ID", "Employee Name (Optional)", "Attendance Status (present/absent/excused)", "Remarks (Optional)"],
      ["EMP-0001", "John Doe", "present", ""],
      ["EMP-0002", "Jane Smith", "absent", "On leave"],
    ]);
    ws["!cols"] = [{ wch: 18 }, { wch: 28 }, { wch: 36 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, "attendance_template.xlsx");
  };

  const handleFile = async (file) => {
    if (!sessionId) return setToast({ msg: "Select a training session first", type: "error" });
    if (!file) return;
    setImporting(true); setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (rows.length < 2) throw new Error("No data rows found in the file");
      const records = rows.slice(1).filter(r => r[0]).map(r => ({
        employeeCode: String(r[0] || "").trim(),
        attendanceStatus: String(r[2] || "absent").trim().toLowerCase(),
        remarks: String(r[3] || "").trim() || null,
      }));
      if (!records.length) throw new Error("No valid rows found");
      const res = await apiFetch(`${TRN_API}/sessions/${sessionId}/attendance/import`, { method: "POST", body: JSON.stringify({ records }) }, token);
      setResult(res);
      onImported();
    } catch (e) { setToast({ msg: e.message, type: "error" }); } finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const downloadErrors = () => {
    if (!result?.invalid?.length) return;
    const ws = XLSX.utils.aoa_to_sheet([["Employee Code", "Reason"], ...result.invalid.map(r => [r.code, r.reason])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Errors");
    XLSX.writeFile(wb, "import_errors.xlsx");
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 8500, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "min(580px, 96vw)", boxShadow: "0 16px 48px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden" }}>
        {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>Bulk Attendance Import</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#94a3b8" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={S.label}>Select Training Session *</label>
            <select value={sessionId} onChange={e => setSessionId(e.target.value)} style={S.input}>
              <option value="">Choose session…</option>
              {sessions.map(s => <option key={s.id} value={s.id}>{s.session_number} — {s.title} ({s.training_date?.slice(0, 10)})</option>)}
            </select>
          </div>

          <div style={{ ...S.card, background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "13px" }}>Step 1 — Download Template</p>
            <p style={{ margin: "0 0 10px", fontSize: "13px", color: "#374151" }}>Use the Excel template with columns: Employee ID, Employee Name, Attendance Status, Remarks</p>
            <button style={S.btn("success")} onClick={downloadTemplate}>⬇ Download Template</button>
          </div>

          <div style={{ ...S.card, background: "#eff6ff", border: "1px solid #bfdbfe", marginBottom: 16 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700, fontSize: "13px" }}>Step 2 — Upload Filled Template</p>
            <p style={{ margin: "0 0 10px", fontSize: "13px", color: "#374151" }}>Valid Employee IDs will be matched against your employee directory. Duplicates are handled automatically.</p>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => handleFile(e.target.files?.[0])} />
            <button style={S.btn("primary")} onClick={() => fileRef.current?.click()} disabled={importing || !sessionId}>{importing ? "Importing…" : "📂 Select Excel File"}</button>
          </div>

          {result && (
            <div style={{ ...S.card, border: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: "0 0 12px", fontSize: "14px" }}>Import Results</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", fontSize: "13px", marginBottom: 12 }}>
                <div><span style={{ color: "#64748b" }}>Total Records:</span> <strong>{result.total}</strong></div>
                <div><span style={{ color: "#64748b" }}>Successfully Imported:</span> <strong style={{ color: "#16a34a" }}>{result.saved}</strong></div>
                <div><span style={{ color: "#64748b" }}>Invalid Employee IDs:</span> <strong style={{ color: result.invalid?.length ? "#dc2626" : "#16a34a" }}>{result.invalid?.length || 0}</strong></div>
                <div><span style={{ color: "#64748b" }}>Duplicate Entries:</span> <strong style={{ color: "#d97706" }}>{result.duplicates || 0}</strong></div>
              </div>
              {result.invalid?.length > 0 && (
                <button style={S.btn("warning")} onClick={downloadErrors}>⬇ Download Error Report</button>
              )}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0" }}>
          <button style={S.btn("ghost")} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE HISTORY DETAIL
// ══════════════════════════════════════════════════════════════════════════════
function EmployeeHistoryDetail({ empId, token, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiFetch(`${TRN_API}/employees/${empId}`, {}, token)
      .then(d => setData(d)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [empId, token]);

  const downloadDoc = async (sessionId, label) => {
    try {
      const docs = await apiFetch(`${TRN_API}/sessions/${sessionId}/documents?type=attendance_sheet`, {}, token);
      const current = docs.find(d => d.is_current);
      if (!current) { setToast({ msg: "No attendance sheet found", type: "error" }); return; }
      const { url } = await apiFetch(`${TRN_API}/documents/${current.id}/download`, {}, token);
      const a = document.createElement("a"); a.href = url; a.download = current.file_name; a.target = "_blank"; a.click();
    } catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Loading history…</div>;
  if (!data)   return <div style={{ textAlign: "center", padding: 60, color: "#dc2626" }}>Employee not found</div>;

  const { employee: emp, history } = data;
  const attended = history.filter(h => h.attendance_status === "present").length;
  const pct      = history.length ? Math.round(100 * attended / history.length) : 0;

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button style={S.btn("ghost")} onClick={onBack}>← Back</button>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{emp.full_name}</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{emp.employee_id} · {emp.designation} · {emp.department_name}</p>
        </div>
      </div>

      {/* Employee card */}
      <div style={{ ...S.card, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px 24px", fontSize: "13px" }}>
        {[["Full Name", emp.full_name], ["Employee ID", emp.employee_id || "—"], ["Department", emp.department_name || "—"], ["Designation", emp.designation || "—"], ["Email", emp.email || "—"], ["Mobile", emp.mobile || emp.phone || "—"]].map(([k, v]) => (
          <div key={k}><span style={{ color: "#64748b", fontSize: "12px" }}>{k}</span><br /><strong>{v}</strong></div>
        ))}
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 18 }}>
        <StatCard label="Total Trainings" value={history.length} color={ACCENT} />
        <StatCard label="Attended" value={attended} color="#16a34a" />
        <StatCard label="Missed" value={history.length - attended} color="#dc2626" />
        <StatCard label="Attendance %" value={`${pct}%`} color="#0891b2" />
      </div>

      {/* Timeline */}
      <div style={S.card}>
        <h3 style={{ margin: "0 0 14px", fontSize: "15px", fontWeight: 700 }}>Training Timeline</h3>
        {history.length === 0 ? <Empty msg="No training history found" /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>
                {["Session #","Title","Category","Trainer","Date","Status","Remarks","Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.session_id}>
                    <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{h.session_number}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{h.title}</td>
                    <td style={S.td}>{h.category || "—"}</td>
                    <td style={S.td}>{h.trainer_name || "—"}</td>
                    <td style={S.td}>{h.training_date?.slice(0, 10)}</td>
                    <td style={S.td}><span style={S.badge(h.attendance_status)}>{h.attendance_status}</span></td>
                    <td style={{ ...S.td, fontSize: "12px", color: "#64748b" }}>{h.remarks || "—"}</td>
                    <td style={S.td}>
                      {h.doc_count > 0 && (
                        <button style={{ ...S.btn("ghost"), padding: "3px 8px", fontSize: "11px" }} onClick={() => downloadDoc(h.session_id, h.title)}>↓ Sheet</button>
                      )}
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
// EMPLOYEES TAB
// ══════════════════════════════════════════════════════════════════════════════
function EmployeesTab({ token }) {
  const [employees, setEmployees] = useState([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [sessions, setSessions]       = useState([]);
  const [filters, setFilters] = useState({ search: "", department: "", designation: "" });
  const [detailEmpId, setDetailEmpId] = useState(null);
  const [showImport, setShowImport]   = useState(false);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, pageSize: PAGE_SIZE, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) });
      const [d, depts, sess] = await Promise.all([
        apiFetch(`${TRN_API}/employees?${params}`, {}, token),
        fetch(`${BASE}/api/company-portal/departments`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => []),
        apiFetch(`${TRN_API}/sessions?from=2020-01-01&to=2030-12-31`, {}, token).catch(() => []),
      ]);
      setEmployees(d.rows || []); setTotal(d.total || 0);
      setDepartments(Array.isArray(depts) ? depts : []);
      setSessions(Array.isArray(sess) ? sess : []);
    } catch { setEmployees([]); } finally { setLoading(false); }
  }, [token, page, filters]);

  useEffect(() => { load(); }, [load]);

  if (detailEmpId) return <EmployeeHistoryDetail empId={detailEmpId} token={token} onBack={() => { setDetailEmpId(null); load(); }} />;

  return (
    <div>
      {showImport && <BulkImportPanel token={token} sessions={sessions} onClose={() => setShowImport(false)} onImported={load} />}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Employee Training History</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Complete training attendance record for every employee</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="Search name or ID…" style={{ ...S.input, width: 180 }} />
          <select value={filters.department} onChange={e => setFilters(p => ({ ...p, department: e.target.value }))} style={{ ...S.input, width: 160 }}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
          </select>
          <button style={S.btn("info")} onClick={() => setShowImport(true)}>⬆ Bulk Import</button>
        </div>
      </div>

      <div style={S.card}>
        {loading ? <Empty msg="Loading employees…" /> : employees.length === 0 ? <Empty msg="No employees found" /> : (
          <>
            <div style={{ fontSize: "12.5px", color: "#64748b", marginBottom: 10 }}>Showing {employees.length} of {total} employees</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  {["Employee ID","Name","Department","Designation","Total","Attended","Missed","Att %","Last Training","Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {employees.map(e => (
                    <tr key={e.id} onClick={() => setDetailEmpId(e.id)} style={{ cursor: "pointer" }}>
                      <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{e.employee_code || "—"}</td>
                      <td style={{ ...S.td, fontWeight: 600 }}>{e.full_name}</td>
                      <td style={S.td}>{e.department_name || "—"}</td>
                      <td style={S.td}>{e.designation || "—"}</td>
                      <td style={{ ...S.td, textAlign: "center" }}>{e.total_trainings || 0}</td>
                      <td style={{ ...S.td, textAlign: "center", color: "#16a34a", fontWeight: 600 }}>{e.trainings_attended || 0}</td>
                      <td style={{ ...S.td, textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{e.trainings_missed || 0}</td>
                      <td style={{ ...S.td, textAlign: "center", fontWeight: 700, color: Number(e.attendance_pct) >= 75 ? "#16a34a" : Number(e.attendance_pct) >= 50 ? "#d97706" : "#dc2626" }}>
                        {e.attendance_pct != null ? `${e.attendance_pct}%` : "—"}
                      </td>
                      <td style={{ ...S.td, fontSize: "12px" }}>{e.last_training_date ? e.last_training_date.slice(0, 10) : "—"}</td>
                      <td style={S.td} onClick={ev => ev.stopPropagation()}>
                        <button style={{ ...S.btn("primary"), padding: "4px 10px", fontSize: "12px" }} onClick={() => setDetailEmpId(e.id)}>History</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > PAGE_SIZE && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button style={S.btn("ghost")} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                <span style={{ fontSize: "13px", color: "#64748b", alignSelf: "center" }}>Page {page} of {Math.ceil(total / PAGE_SIZE)}</span>
                <button style={S.btn("ghost")} disabled={employees.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>Next ›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS TAB
// ══════════════════════════════════════════════════════════════════════════════
function ReportsTab({ token }) {
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories]   = useState([]);
  const [filters, setFilters] = useState({ from: "", to: "", department: "", trainer: "", category: "", status: "", search: "" });
  const [detailReport, setDetailReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const PAGE_SIZE = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, pageSize: PAGE_SIZE, ...Object.fromEntries(Object.entries(filters).filter(([,v]) => v)) });
      const [d, depts, cats] = await Promise.all([
        apiFetch(`${TRN_API}/reports?${params}`, {}, token),
        fetch(`${BASE}/api/company-portal/departments`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => []),
        apiFetch(`${TRN_API}/categories`, {}, token).catch(() => []),
      ]);
      setRows(d.rows || []); setTotal(d.total || 0);
      setDepartments(Array.isArray(depts) ? depts : []);
      setCategories(Array.isArray(cats) ? cats : []);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [token, page, filters]);

  useEffect(() => { load(); }, [load]);

  const openReport = async (id) => {
    setReportLoading(true);
    try { const d = await apiFetch(`${TRN_API}/reports/${id}`, {}, token); setDetailReport(d); }
    catch (e) { setToast({ msg: e.message, type: "error" }); } finally { setReportLoading(false); }
  };

  const downloadDoc = async (docId, fileName) => {
    try { const { url } = await apiFetch(`${TRN_API}/documents/${docId}/download`, {}, token); const a = document.createElement("a"); a.href = url; a.download = fileName; a.target = "_blank"; a.click(); }
    catch (e) { setToast({ msg: e.message, type: "error" }); }
  };

  const exportExcel = () => {
    if (!detailReport) return;
    const { session, attendance } = detailReport;
    const wb = XLSX.utils.book_new();
    // Session info
    const infoWs = XLSX.utils.aoa_to_sheet([
      ["Training Report"], [],
      ["Session Number", session.session_number],
      ["Title", session.title],
      ["Trainer", session.trainer_name || ""],
      ["Date", session.training_date?.slice(0, 10)],
      ["Department", session.department_name || "All"],
      ["Status", session.status],
      ["Total Registered", session.total_registered],
      ["Total Present", session.total_present],
      ["Total Absent", session.total_absent],
      ["Attendance %", session.total_registered ? `${Math.round(100 * session.total_present / session.total_registered)}%` : "—"],
    ]);
    XLSX.utils.book_append_sheet(wb, infoWs, "Session Info");
    // Attendance
    const attWs = XLSX.utils.aoa_to_sheet([
      ["Employee ID", "Employee Name", "Department", "Designation", "Attendance Status", "Remarks", "Recorded At"],
      ...attendance.map(a => [a.employee_code, a.employee_name, a.department_name, a.designation, a.attendance_status, a.remarks || "", a.recorded_at ? new Date(a.recorded_at).toLocaleString() : ""]),
    ]);
    XLSX.utils.book_append_sheet(wb, attWs, "Attendance");
    XLSX.writeFile(wb, `training_report_${session.session_number}.xlsx`);
  };

  if (detailReport) return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button style={S.btn("ghost")} onClick={() => setDetailReport(null)}>← Back to Reports</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>{detailReport.session.title}</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{detailReport.session.session_number} · {detailReport.session.training_date?.slice(0, 10)}</p>
        </div>
        <button style={S.btn("success")} onClick={exportExcel}>⬇ Export Excel</button>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10, marginBottom: 18 }}>
        <StatCard label="Registered" value={detailReport.session.total_registered || 0} color={ACCENT} />
        <StatCard label="Present"    value={detailReport.session.total_present || 0}    color="#16a34a" />
        <StatCard label="Absent"     value={detailReport.session.total_absent || 0}     color="#dc2626" />
        <StatCard label="Attendance %" value={detailReport.session.total_registered ? `${Math.round(100 * detailReport.session.total_present / detailReport.session.total_registered)}%` : "—"} color="#0891b2" />
      </div>

      {/* Session info */}
      <div style={{ ...S.card, marginBottom: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px 24px", fontSize: "13px" }}>
        {[["Trainer", detailReport.session.trainer_name], ["Date", detailReport.session.training_date?.slice(0, 10)], ["Department", detailReport.session.department_name || "All"], ["Category", detailReport.session.category || "—"], ["Status", detailReport.session.status], ["Created By", detailReport.session.created_by_name || "—"]].map(([k, v]) => (
          <div key={k}><span style={{ color: "#64748b", fontSize: "12px" }}>{k}</span><br /><strong>{v || "—"}</strong></div>
        ))}
      </div>

      {/* Attendance list */}
      <div style={{ ...S.card, marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 700 }}>Employee Attendance</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Employee ID","Name","Department","Designation","Status","Recorded At","Remarks"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {detailReport.attendance.length === 0 && <tr><td colSpan={7} style={{ ...S.td, textAlign: "center", color: "#94a3b8" }}>No attendance records</td></tr>}
              {detailReport.attendance.map(a => (
                <tr key={a.id}>
                  <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{a.employee_code || "—"}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{a.employee_name || "—"}</td>
                  <td style={S.td}>{a.department_name || "—"}</td>
                  <td style={S.td}>{a.designation || "—"}</td>
                  <td style={S.td}><span style={S.badge(a.attendance_status)}>{a.attendance_status}</span></td>
                  <td style={{ ...S.td, fontSize: "12px" }}>{a.recorded_at ? new Date(a.recorded_at).toLocaleString() : "—"}</td>
                  <td style={{ ...S.td, fontSize: "12px" }}>{a.remarks || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Documents */}
      {detailReport.documents.length > 0 && (
        <div style={{ ...S.card, marginBottom: 14 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 700 }}>Documents</h3>
          {detailReport.documents.map(d => {
            const isImg = d.mimetype?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(d.file_name);
            const src = d.file_url?.startsWith('http') ? d.file_url : `${BASE}${d.file_url}`;
            return (
              <div key={d.id} style={{ marginBottom: 8 }}>
                {isImg && (
                  <div style={{ marginBottom: 4 }}>
                    <img src={src} alt={d.file_name} style={{ maxWidth: 280, maxHeight: 160, objectFit: 'contain', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer' }} onClick={() => window.open(src, '_blank')} />
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#f8fafc", borderRadius: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "13px" }}>{d.file_name}</span>
                    <span style={{ marginLeft: 8, fontSize: "11px", padding: "1px 8px", borderRadius: 10, background: "#ede9fe", color: ACCENT }}>{d.document_type.replace("_", " ")}</span>
                    <span style={{ fontSize: "11px", color: "#64748b", marginLeft: 8 }}>v{d.version} · {d.uploaded_by_name} · {new Date(d.created_at).toLocaleDateString()}</span>
                  </div>
                  <button style={{ ...S.btn("ghost"), padding: "4px 10px", fontSize: "12px" }} onClick={() => downloadDoc(d.id, d.file_name)}>↓ Download</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Audit log */}
      {detailReport.auditLogs.length > 0 && (
        <div style={S.card}>
          <h3 style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 700 }}>Audit Log</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Action","User","Role","Date & Time"].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {detailReport.auditLogs.map(l => (
                  <tr key={l.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{l.action.replace(/_/g, " ")}</td>
                    <td style={S.td}>{l.actor_name || "—"}</td>
                    <td style={S.td}>{l.actor_role || "—"}</td>
                    <td style={{ ...S.td, fontSize: "12px" }}>{new Date(l.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {reportLoading && <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ background: "#fff", padding: 20, borderRadius: 12, fontWeight: 600 }}>Loading report…</div></div>}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Training Reports</h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>Session-wise training and attendance reports</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ ...S.card, marginBottom: 16, padding: "14px 18px" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} placeholder="Search title or trainer…" style={{ ...S.input, flex: 1, minWidth: 160 }} />
          <input type="date" value={filters.from} onChange={e => setFilters(p => ({ ...p, from: e.target.value }))} style={{ ...S.input, width: 150 }} title="From" />
          <input type="date" value={filters.to} onChange={e => setFilters(p => ({ ...p, to: e.target.value }))} style={{ ...S.input, width: 150 }} title="To" />
          <select value={filters.department} onChange={e => setFilters(p => ({ ...p, department: e.target.value }))} style={{ ...S.input, width: 160 }}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
          </select>
          <select value={filters.category} onChange={e => setFilters(p => ({ ...p, category: e.target.value }))} style={{ ...S.input, width: 160 }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.status} onChange={e => setFilters(p => ({ ...p, status: e.target.value }))} style={{ ...S.input, width: 140 }}>
            <option value="">All Statuses</option>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <button style={S.btn("ghost")} onClick={() => setFilters({ from: "", to: "", department: "", trainer: "", category: "", status: "", search: "" })}>Clear</button>
        </div>
      </div>

      <div style={S.card}>
        {loading ? <Empty msg="Loading reports…" /> : rows.length === 0 ? <Empty msg="No training sessions found" /> : (
          <>
            <div style={{ fontSize: "12.5px", color: "#64748b", marginBottom: 10 }}>Showing {rows.length} of {total} sessions</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  {["Session #","Title","Trainer","Date","Department","Registered","Present","Absent","Att %","Status","Actions"].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const pct = r.total_registered ? Math.round(100 * r.total_present / r.total_registered) : null;
                    return (
                      <tr key={r.id} onClick={() => openReport(r.id)} style={{ cursor: "pointer" }}>
                        <td style={{ ...S.td, fontFamily: "monospace", fontSize: "12px" }}>{r.session_number}</td>
                        <td style={{ ...S.td, fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</td>
                        <td style={S.td}>{r.trainer_name || "—"}</td>
                        <td style={S.td}>{r.training_date?.slice(0, 10)}</td>
                        <td style={S.td}>{r.department_name || "All"}</td>
                        <td style={{ ...S.td, textAlign: "center" }}>{r.total_registered || 0}</td>
                        <td style={{ ...S.td, textAlign: "center", color: "#16a34a", fontWeight: 600 }}>{r.total_present || 0}</td>
                        <td style={{ ...S.td, textAlign: "center", color: "#dc2626", fontWeight: 600 }}>{r.total_absent || 0}</td>
                        <td style={{ ...S.td, textAlign: "center", fontWeight: 700, color: pct == null ? "#94a3b8" : pct >= 75 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626" }}>{pct != null ? `${pct}%` : "—"}</td>
                        <td style={S.td}><span style={S.badge(r.status)}>{r.status}</span></td>
                        <td style={S.td} onClick={ev => ev.stopPropagation()}>
                          <button style={{ ...S.btn("primary"), padding: "4px 10px", fontSize: "12px" }} onClick={() => openReport(r.id)}>View</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {total > PAGE_SIZE && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button style={S.btn("ghost")} disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</button>
                <span style={{ fontSize: "13px", color: "#64748b", alignSelf: "center" }}>Page {page}</span>
                <button style={S.btn("ghost")} disabled={rows.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>Next ›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN MODULE
// ══════════════════════════════════════════════════════════════════════════════
export default function TrainingModule({ token, initialTab }) {
  const [tab, setTab] = useState(initialTab || "scheduler");

  const TABS = [
    { key: "scheduler",  label: "📅 Scheduler"  },
    { key: "employees",  label: "👥 Employees"  },
    { key: "reports",    label: "📊 Reports"    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      {/* Module header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 20, paddingBottom: 0, flexWrap: "wrap", gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>Training Management</h1>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>Schedule training sessions, track attendance, and generate reports</p>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginTop: 14 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "12px 22px", background: "none", border: "none", borderBottom: tab === t.key ? `3px solid ${ACCENT}` : "3px solid transparent", marginBottom: "-1px", fontSize: "14px", fontWeight: tab === t.key ? 700 : 500, color: tab === t.key ? ACCENT : "#64748b", cursor: "pointer", whiteSpace: "nowrap" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: "28px" }}>
        {tab === "scheduler" && <SchedulerTab token={token} />}
        {tab === "employees" && <EmployeesTab token={token} />}
        {tab === "reports"   && <ReportsTab   token={token} />}
      </div>
    </div>
  );
}
