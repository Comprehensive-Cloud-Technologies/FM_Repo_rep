import { getPublicAppUrl, getApiBaseUrl } from "../utils/runtimeConfig";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import logo from "../images/image.png";
import "./qr-card.css";
import LogsheetModule from "../components/LogsheetModule.jsx";
import ChecklistQuestionRow from "../components/ChecklistQuestionRow.jsx";
import ChecklistTemplateModule from "../components/ChecklistTemplateModule.jsx";
import SubmissionsPanel from "../components/SubmissionsPanel.jsx";
import WarningsPanel from "../components/WarningsPanel.jsx";
import WorkOrdersPanel from "../components/WorkOrdersPanel.jsx";
import HealthcareDashboard from "../components/HealthcareDashboard.jsx";
import RequestTrackingPanel from "../components/RequestTrackingPanel.jsx";
import AssetDashboard from "../components/AssetDashboard.jsx";
import OjtTrainingBuilder, { TrainingPreviewModal, TrainingQRModal } from "../components/OjtTrainingBuilder.jsx";
import { useAlertSound } from "../hooks/useAlertSound";
import {
  getCompanyPortalMe,
  getCompanyPortalDashboard,
  getCompanyPortalChartStats,
  getCompanyPortalLogsheetGrid,
  getCompanyPortalDepartments,
  createCompanyPortalDepartment,
  updateCompanyPortalDepartment,
  deleteCompanyPortalDepartment,
  getCompanyPortalAssetTypes,
  getCompanyPortalAssets,
  createCompanyPortalAsset,
  updateCompanyPortalAsset,
  deleteCompanyPortalAsset,
  bulkDeleteCompanyPortalAssets,
  bulkDeleteCompanyPortalPreQr,
  assignCompanyPortalAsset,
  getAssetQueries,
  createAssetQuery,
  resolveAssetQuery,
  escalateAssetQuery,
  deleteAssetQuery,
  getCompanyPortalChecklists,
  createCompanyPortalChecklist,
  updateCompanyPortalChecklist,
  deleteCompanyPortalChecklist,
  getCompanyPortalEmployees,
  createCompanyPortalEmployee,
  updateCompanyPortalEmployee,
  deleteCompanyPortalEmployee,
  bulkImportCompanyEmployees,
  getCompanyPortalLogsheetTemplates,
  getCompanyPortalLogsheetTemplate,
  updateCompanyPortalLogsheetTemplate,
  deleteCompanyPortalLogsheetTemplate,
  getCompanyPortalLogsheetEntries,
  submitCompanyPortalLogsheetEntry,
  createCompanyPortalLogsheetTemplate,
  assignCompanyPortalLogsheetTemplate,
  getCompanyPortalRecentLogsheetEntries,
  getCompanyPortalRecentChecklistSubmissions,
  getCompanyPortalSupervisors,
  getCompanyRoles,
  createCompanyRole,
  updateCompanyRole,
  deleteCompanyRole,
  createTemplateUserAssignment,
  getTemplateUserAssignments,
  getMyTemplateAssignments,
  deleteTemplateUserAssignment,
  getCompanyPortalAdminFlags,
  getCompanyPortalWorkOrders,
  getCompanyPortalWOUsers,
  assignCompanyPortalWorkOrder,
  getShifts,
  getActiveShifts,
  createShift,
  updateShift,
  deleteShift,
  getShiftEmployees,
  assignShiftEmployees,
  removeShiftEmployee,
  // OJT
  getOjtTrainings, getOjtTraining, createOjtTraining, updateOjtTraining, deleteOjtTraining, publishOjtTraining,
  createOjtModule, updateOjtModule, deleteOjtModule, addOjtModuleContent, deleteOjtContent,
  createOjtTest, addOjtQuestion, updateOjtQuestion, deleteOjtQuestion, getOjtTrainingUsers, grantOjtCertificate, uploadOjtFile, assignOjtTraining,
  // Fleet
  getFleetAssets, getFleetAssetDetails, getFleetInspections, createFleetInspection, updateFleetInspection, deleteFleetInspection,
  getFleetFuelLogs, createFleetFuelLog, updateFleetFuelLog, deleteFleetFuelLog,
  getFleetMaintenance, createFleetMaintenance, updateFleetMaintenance, updateFleetMaintenanceStatus, deleteFleetMaintenance,
  getFleetSubmissions, getFleetSubmissionDetail, downloadFleetSubmissionsCSV,
  getSoftServiceRequestsAll, getSoftServiceRequestsMy,
  // Pre-generated QR codes
  getPreQrCodes, generatePreQrCodes, linkPreQrCode, registerPreQrAsset, deletePreQrCode,
  bulkImportCompanyPortalAssets,
  getCompanyPortalImportTemplateUrl,
} from "../api.js";

const Card = ({ children, style = {} }) => (
  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", ...style }}>{children}</div>
);
const CardHeader = ({ title, subtitle, action }) => (
  <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
    <div>
      <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", lineHeight: 1.3 }}>{title}</p>
      {subtitle && <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>{subtitle}</p>}
    </div>
    {action && <div style={{ flexShrink: 0 }}>{action}</div>}
  </div>
);
const StatCard = ({ label, value, sub, subCol, iconBg, iconCol, icon, onClick }) => (
  <div onClick={onClick} style={{ background: "#fff", borderRadius: "12px", padding: "20px 24px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", cursor: onClick ? "pointer" : "default", transition: "box-shadow 0.15s", ...(onClick ? { boxShadow: "0 0 0 0 transparent" } : {}) }}
    onMouseEnter={onClick ? e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(37,99,235,0.10)" : undefined}
    onMouseLeave={onClick ? e => e.currentTarget.style.boxShadow = "none" : undefined}>
    <div>
      <p style={{ color: "#64748b", fontSize: "13.5px", marginBottom: "8px", fontWeight: 500 }}>{label}</p>
      <p style={{ fontSize: "34px", fontWeight: 800, color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{value}</p>
      {sub && <p style={{ color: subCol || "#64748b", fontSize: "12.5px", marginTop: "8px", fontWeight: 500 }}>{sub}</p>}
    </div>
    {icon && <div style={{ width: "48px", height: "48px", background: iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: iconCol, flexShrink: 0 }}>{icon}</div>}
  </div>
);
const Btn = ({ children, onClick, outline, color = "#2563eb", bg, disabled, style = {} }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer", border: outline ? `1.5px solid ${color}` : "none", background: bg || (outline ? "#fff" : color), color: outline ? color : "#fff", opacity: disabled ? 0.6 : 1, whiteSpace: "nowrap", ...style }}>
    {children}
  </button>
);

/* ─── Role Definitions & Hierarchy ─────────────────────────────── */
const ROLES = [
  { value: "admin",     label: "Admin",    color: "#7c3aed", bg: "#f3e8ff" },
  { value: "engineer",  label: "Engineer", color: "#1d4ed8", bg: "#dbeafe" },
  { value: "doctor",    label: "Doctor",   color: "#0e7490", bg: "#cffafe" },
  { value: "nurse",     label: "Nurse",    color: "#059669", bg: "#d1fae5" },
  { value: "ward_boy",  label: "Ward Boy", color: "#ca8a04", bg: "#fefce8" },
];
const roleInfo = (r) => ROLES.find((x) => x.value === r) || ROLES[ROLES.length - 1];

// Default hierarchy for healthcare org
const DEFAULT_HIERARCHY_CHAIN = [
  { role: "admin",    label: "Admin",    parentRole: null,      color: "#7c3aed", bg: "#f3e8ff", border: "#d8b4fe" },
  { role: "engineer", label: "Engineer", parentRole: "admin",   color: "#1d4ed8", bg: "#dbeafe", border: "#bfdbfe" },
  { role: "doctor",   label: "Doctor",   parentRole: "admin",   color: "#0e7490", bg: "#cffafe", border: "#a5f3fc" },
  { role: "nurse",    label: "Nurse",    parentRole: "doctor",  color: "#059669", bg: "#d1fae5", border: "#6ee7b7" },
  { role: "ward_boy", label: "Ward Boy", parentRole: "nurse",   color: "#ca8a04", bg: "#fefce8", border: "#fde68a" },
];

// Runtime-mutable hierarchy — can be replaced by admin-defined custom roles.
let HIERARCHY_CHAIN  = [...DEFAULT_HIERARCHY_CHAIN];
let PARENT_ROLE      = Object.fromEntries(HIERARCHY_CHAIN.map((h) => [h.role, h.parentRole]));
let HIERARCHY_ROLES  = new Set(HIERARCHY_CHAIN.map((h) => h.role));

const lightenHex = (hex) => {
  // Produce a pale background from any hex color; fallback if parsing fails.
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const mix = (c) => Math.round(c + (255 - c) * 0.85);
    return `#${mix(r).toString(16).padStart(2, "0")}${mix(g).toString(16).padStart(2, "0")}${mix(b).toString(16).padStart(2, "0")}`;
  } catch {
    return "#dbeafe";
  }
};

const applyCustomRoles = (rolesFromServer) => {
  const mapped = Array.isArray(rolesFromServer)
    ? rolesFromServer.map((r) => ({
        role:       r.roleKey,
        label:      r.label,
        parentRole: r.parentRoleKey || null,
        color:      r.color    || "#2563eb",
        bg:         r.bgColor  || lightenHex(r.color || "#2563eb"),
        border:     r.color    || "#bfdbfe",
      }))
    : [];
  HIERARCHY_CHAIN.splice(0, HIERARCHY_CHAIN.length, ...mapped);
  PARENT_ROLE = Object.fromEntries(HIERARCHY_CHAIN.map((h) => [h.role, h.parentRole]));
  HIERARCHY_ROLES = new Set(HIERARCHY_CHAIN.map((h) => h.role));
};

const Badge = ({ val }) => { const r = roleInfo(val); return <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: r.bg, color: r.color }}>{r.label}</span>; };
const Alert = ({ children, type = "error" }) => {
  const s = type === "error" ? { bg: "#fef2f2", col: "#dc2626", border: "#fecaca" } : { bg: "#f0fdf4", col: "#16a34a", border: "#bbf7d0" };
  return <div style={{ background: s.bg, color: s.col, padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${s.border}`, marginBottom: "14px" }}>{children}</div>;
};

const FInput = ({ label, required, error, ...props }) => (
  <div>
    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
      {label}{required && <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>}
    </label>
    <input {...props} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: `1px solid ${error ? "#ef4444" : "#e2e8f0"}`, borderRadius: "7px", fontSize: "13.5px", outline: "none" }} />
    {error && <p style={{ fontSize: "11.5px", color: "#ef4444", marginTop: "3px", marginBottom: 0 }}>{error}</p>}
  </div>
);
const FSelect = ({ label, required, error, children, ...props }) => (
  <div>
    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
      {label}{required && <span style={{ color: "#ef4444", marginLeft: "3px" }}>*</span>}
    </label>
    <select {...props} style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: `1px solid ${error ? "#ef4444" : "#e2e8f0"}`, borderRadius: "7px", fontSize: "13.5px", background: "#fff", outline: "none" }}>{children}</select>
    {error && <p style={{ fontSize: "11.5px", color: "#ef4444", marginTop: "3px", marginBottom: 0 }}>{error}</p>}
  </div>
);

/* ─── CSV helper ─────────────────────────────────────────────────── */
const parseCSV = (text) => {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""));
  return lines.slice(1).map((row) => {
    const vals = row.split(",");
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim().replace(/^"|"$/g, ""); });
    return obj;
  });
};

const downloadCSVTemplate = () => {
  const csv = "full_name,email,phone,designation,role,status,password\nJohn Doe,john@company.com,+91-99999-00000,Facilities Technician,technician,Active,changeme123\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "employee_import_template.csv";
  a.click();
};

/* ─── Employee Modal ─────────────────────────────────────────────── */
const DEFAULT_PERMS = {
  checklists: { view: true, create: false, fill: true, edit: false, delete: false },
  logsheets:  { view: true, create: false, fill: true, edit: false, delete: false },
};
const ALL_MODULES = [
  { key: "dashboard",  label: "Dashboard" },
  { key: "checklists", label: "Checklists" },
  { key: "logsheets",  label: "Logsheets" },
  { key: "workorders", label: "Requests" },
  { key: "warnings",   label: "Warnings" },
  { key: "assets",     label: "Assets" },
  { key: "mytasks",    label: "My Tasks" },
  { key: "ojt",        label: "OJT Training" },
  { key: "shifts",     label: "Shifts" },
];

function normalizePerms(p) {
  const src = p && typeof p === "object" ? p : {};
  return {
    checklists: { ...DEFAULT_PERMS.checklists, ...(src.checklists || {}) },
    logsheets:  { ...DEFAULT_PERMS.logsheets,  ...(src.logsheets  || {}) },
  };
}

function EmployeeModal({ existing, token, employees = [], customRoles = [], currentUserRole = "admin", onClose, onSaved }) {
  const isEdit = !!existing;

  // Use the saved service_domain from the DB directly.
  // Falls back to role-capability derivation only when the field is absent.
  const deriveServiceDomain = () => {
    if (isEdit && existing?.serviceDomain) {
      const sd = existing.serviceDomain.toLowerCase();
      if (["soft", "technical", "both"].includes(sd)) return sd;
    }
    if (!isEdit || !existing?.role) return "technical";
    const matched = customRoles.find((r) => r.roleKey === existing.role);
    if (matched) {
      const hasSoft = matched.canRaiseSoftIssue || matched.isSoftManager;
      const hasTech = matched.isTechnician || matched.isTechnicalSupervisor;
      if (hasSoft && hasTech) return "both";
      if (hasSoft) return "soft";
    }
    return "technical";
  };

  const def = {
    fullName: "", email: "", phone: "", designation: "", role: "technician",
    shift: "", status: "Active", password: "", username: "", supervisorId: "",
    permissions: normalizePerms(null),
    moduleAccess: ["dashboard", "checklists", "logsheets", "mytasks"],
  };
  const [form, setForm] = useState(isEdit ? {
    ...def, ...existing, password: "",
    username: existing.username || "",
    supervisorId: existing.supervisorId ? String(existing.supervisorId) : "",
    shift: existing.shift || "",
    permissions: normalizePerms(existing.permissions),
    moduleAccess: Array.isArray(existing.moduleAccess) ? existing.moduleAccess : def.moduleAccess,
  } : def);
  const [serviceDomain, setServiceDomain] = useState(deriveServiceDomain);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const change = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // When role changes, clear supervisorId if parent role changes
  const changeRole = (newRole) => {
    setForm((p) => ({ ...p, role: newRole, supervisorId: "", shift: "" }));
  };

  // Determine what parent role this role should report to
  const parentRole = PARENT_ROLE[form.role] ?? null;
  // Filter employees list to parent role options
  const parentOptions = parentRole
    ? employees.filter((e) => e.role === parentRole && (!isEdit || e.id !== existing?.id))
    : [];

  const parentRoleInfo = parentRole ? HIERARCHY_CHAIN.find((h) => h.role === parentRole) : null;
  const isHierarchyRole = HIERARCHY_ROLES.has(form.role);
  const showShift = form.role === "assistant_manager";
  // Admin-only parent picker; supervisors are auto-assigned to themselves
  const showParentField = currentUserRole === "admin" && parentRole !== null;
  // Legacy: supervisors (old role) picking a supervisor parent
  const showLegacySupervisor = currentUserRole === "admin" && !isHierarchyRole && form.role !== "admin";

  const handleSave = async () => {
    if (!form.fullName.trim() || !form.email.trim()) return setError("Name and email are required");
    if (!isEdit && !form.password.trim()) return setError("Password is required for new employees");
    if (!isEdit && !form.username.trim()) return setError("Username is required for mobile app access");
    if (isHierarchyRole && parentRole && !form.supervisorId && currentUserRole === "admin") {
      // Warning but not blocking — allow saving without parent
    }
    setSaving(true); setError(null);
    try {
      const payload = {
        ...form,
        serviceDomain: "both",
        supervisorId: form.supervisorId ? Number(form.supervisorId) : null,
        shift: form.shift || null,
      };
      if (!payload.password) delete payload.password;
      if (!payload.username) delete payload.username;
      const saved = isEdit
        ? await updateCompanyPortalEmployee(token, existing.id, payload)
        : await createCompanyPortalEmployee(token, payload);
      onSaved(saved, isEdit);
    } catch (err) {
      setError(err.message || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "580px", maxHeight: "92vh", overflowY: "auto" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc", borderRadius: "14px 14px 0 0" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>{isEdit ? "Edit Employee" : "Add New Employee"}</p>
            <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>Fill in staff details and hierarchy placement</p>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#e2e8f0", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ padding: "20px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {error && <div style={{ gridColumn: "span 2" }}><Alert>{error}</Alert></div>}

          {/* Basic info */}
          <div style={{ gridColumn: "span 2" }}>
            <FInput label="Full Name" required value={form.fullName} onChange={(e) => change("fullName", e.target.value)} placeholder="e.g. Ahmed Hassan" />
          </div>
          <FInput label="Email Address" required type="email" value={form.email} onChange={(e) => change("email", e.target.value)} placeholder="ahmed@company.com" />
          <FInput label="Phone" value={form.phone} onChange={(e) => change("phone", e.target.value)} placeholder="+971 50 000 0000" />
          <FInput label="Designation / Job Title" value={form.designation} onChange={(e) => change("designation", e.target.value)} placeholder="e.g. Senior Technician" />
          <FSelect label="Status" value={form.status} onChange={(e) => change("status", e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </FSelect>

          {/* Role */}
          <div style={{ gridColumn: "span 2" }}>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>
              Role <span style={{ color: "#ef4444" }}>*</span>
            </label>
            {/* Hierarchy roles visual selector */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "10px", marginBottom: "10px" }}>
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Hierarchy Roles</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {HIERARCHY_CHAIN.map((h, i) => (
                  <button key={h.role} type="button" onClick={() => changeRole(h.role)}
                    style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: `1.5px solid ${form.role === h.role ? h.color : h.border}`, background: form.role === h.role ? h.bg : "#fff", color: form.role === h.role ? h.color : "#64748b", display: "flex", alignItems: "center", gap: "5px", transition: "all 0.12s" }}>
                    <span style={{ fontSize: "10px", color: "#94a3b8" }}>{i + 1}.</span>
                    {h.label}
                  </button>
                ))}
              </div>
            </div>
            {/* Other roles */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {ROLES.filter((r) => !HIERARCHY_ROLES.has(r.value) && r.value !== "admin").map((r) => (
                <button key={r.value} type="button" onClick={() => changeRole(r.value)}
                  style={{ padding: "5px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: `1.5px solid ${form.role === r.value ? r.color : "#e2e8f0"}`, background: form.role === r.value ? r.bg : "#fff", color: form.role === r.value ? r.color : "#64748b" }}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* Custom company roles */}
            {customRoles.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Custom Roles</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {customRoles
                    .map((r) => {
                      const selected = form.role === r.roleKey;
                      const domainTag = (r.canRaiseSoftIssue || r.isSoftManager)
                        ? "🧹 Soft"
                        : (r.isTechnician || r.isTechnicalSupervisor)
                          ? "🔧 Tech"
                          : null;
                      return (
                        <button key={r.roleKey} type="button" onClick={() => changeRole(r.roleKey)}
                          style={{ padding: "6px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: `1.5px solid ${selected ? (r.color || "#6366f1") : "#e2e8f0"}`, background: selected ? (r.bgColor || "#eef2ff") : "#fff", color: selected ? (r.color || "#6366f1") : "#64748b", display: "flex", alignItems: "center", gap: "5px" }}>
                          {r.label}
                          {domainTag && <span style={{ fontSize: "10px", opacity: 0.65 }}>{domainTag}</span>}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Shift — only for Assistant Manager */}
          {showShift && (
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
                Shift <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 400 }}>(required for Asst. Managers)</span>
              </label>
              <div style={{ display: "flex", gap: "8px" }}>
                {SHIFTS.map((s) => (
                  <button key={s} type="button" onClick={() => change("shift", s)}
                    style={{ flex: 1, padding: "8px 0", borderRadius: "8px", border: `1.5px solid ${form.shift === s ? "#5b21b6" : "#e2e8f0"}`, background: form.shift === s ? "#ede9fe" : "#fff", color: form.shift === s ? "#5b21b6" : "#64748b", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Hierarchy parent picker */}
          {/* ── Reports To (universal hierarchy) ── */}
          {currentUserRole === "admin" && (
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px" }}>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 700, color: "#15803d", marginBottom: "8px" }}>
                  Reports To <span style={{ fontWeight: 400, color: "#64748b", fontSize: "11.5px" }}>(Sets escalation chain)</span>
                </label>
                <select value={form.supervisorId} onChange={(e) => change("supervisorId", e.target.value)}
                  style={{ width: "100%", padding: "9px 11px", border: "1px solid #bbf7d0", borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}>
                  <option value="">— None (Top of hierarchy) —</option>
                  {employees
                    .filter((e) => !isEdit || e.id !== existing?.id)
                    .map((emp) => (
                      <option key={emp.id} value={String(emp.id)}>
                        {emp.fullName}{emp.designation ? ` — ${emp.designation}` : ""}
                        {emp.role ? ` (${emp.role})` : ""}
                      </option>
                    ))}
                </select>
                {form.supervisorId && (
                  <p style={{ fontSize: "11.5px", color: "#15803d", marginTop: "6px" }}>
                    Escalation: This employee → {employees.find((e) => String(e.id) === String(form.supervisorId))?.fullName || "Selected"} → ...
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Mobile App Access */}
          <div style={{ gridColumn: "span 2", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              <p style={{ fontWeight: 700, fontSize: "13.5px", color: "#0f172a", margin: 0 }}>Mobile App Access</p>
            </div>
            <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "12px" }}>Username &amp; password for the employee mobile app login</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <FInput label="Username" required={!isEdit} value={form.username} onChange={(e) => change("username", e.target.value)} placeholder="e.g. ahmed.hassan" />
              <FInput label={isEdit ? "New Password (leave blank to keep)" : "Password"} type="password" required={!isEdit} value={form.password} onChange={(e) => change("password", e.target.value)} placeholder={isEdit ? "••••••" : "Set a password"} />
            </div>
            {isEdit && form.username && (
              <p style={{ fontSize: "11.5px", color: "#16a34a", marginTop: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                Mobile access active — username: <strong>{form.username}</strong>
              </p>
            )}
          </div>
        </div>

        <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Employee"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Forward Template Modal (Supervisor → Team Member) ─────────── */
function ForwardTemplateModal({ assignment, token, teamMembers = [], existingForwards = [], onClose, onForwarded, onRemoved }) {
  const [selectedUserId, setSelectedUserId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const alreadyForwardedTo = (userId) =>
    existingForwards.some((f) => String(f.assignedTo) === String(userId));

  const handleForward = async () => {
    if (!selectedUserId) return setError("Please select a team member");
    setSaving(true); setError(null);
    try {
      const res = await createTemplateUserAssignment(token, {
        templateType: assignment.templateType,
        templateId: assignment.templateId,
        assignedTo: Number(selectedUserId),
        note: note.trim() || null,
      });
      onForwarded(res);
      setSelectedUserId(""); setNote("");
    } catch (err) { setError(err.message || "Failed to assign"); }
    finally { setSaving(false); }
  };

  const handleRemove = async (forwardId) => {
    try {
      await deleteTemplateUserAssignment(token, forwardId);
      onRemoved(forwardId);
    } catch (err) { alert(err.message); }
  };

  const available = teamMembers.filter((m) => !alreadyForwardedTo(m.id));
  const forwarded = teamMembers.filter((m) => alreadyForwardedTo(m.id));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "520px", maxHeight: "88vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "4px" }}>Forward to Team Member</p>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: assignment.templateType === "checklist" ? "#f0fdf4" : "#eff6ff", color: assignment.templateType === "checklist" ? "#16a34a" : "#2563eb" }}>{assignment.templateType}</span>
              <span style={{ fontWeight: 600, fontSize: "13px", color: "#374151" }}>{assignment.templateName}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Assign form */}
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {error && <Alert>{error}</Alert>}
          {teamMembers.length === 0 ? (
            <p style={{ color: "#94a3b8", textAlign: "center", padding: "24px 0" }}>No team members under you yet.<br/>Add members from the My Team tab first.</p>
          ) : (
            <>
              <FSelect label="Assign to" required value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                <option value="">— Select team member —</option>
                {available.map((m) => (
                  <option key={m.id} value={String(m.id)}>{m.fullName}{m.designation ? ` · ${m.designation}` : ""}</option>
                ))}
              </FSelect>
              {available.length === 0 && (
                <p style={{ fontSize: "13px", color: "#94a3b8", marginTop: "-6px" }}>All team members already have this assignment.</p>
              )}
              <div>
                <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add instructions for this team member…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }}/>
              </div>
              <Btn onClick={handleForward} disabled={saving || !selectedUserId}>{saving ? "Assigning…" : "Assign to Team Member"}</Btn>
            </>
          )}

          {/* Already forwarded */}
          {forwarded.length > 0 && (
            <div style={{ marginTop: "4px" }}>
              <p style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>Already assigned to:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {forwarded.map((m) => {
                  const fwd = existingForwards.find((f) => String(f.assignedTo) === String(m.id));
                  return (
                    <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        <span style={{ fontSize: "13.5px", fontWeight: 600, color: "#166534" }}>{m.fullName}</span>
                        <span style={{ fontSize: "12px", color: "#16a34a" }}>{m.designation || ""}</span>
                      </div>
                      <button onClick={() => fwd && handleRemove(fwd.id)}
                        style={{ fontSize: "11.5px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "5px", padding: "3px 8px", cursor: "pointer", fontWeight: 600 }}>
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: "12px 22px", borderTop: "1px solid #e2e8f0", textAlign: "right" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Done</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Assign Template Modal ──────────────────────────────────────── */
function AssignTemplateModal({ employee, token, checklists = [], logsheetTemplates = [], existingAssignments = [], onClose, onAssigned, onRemoved }) {
  const [tab, setTab] = useState("checklist");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const isAssigned = (type, id) =>
    existingAssignments.some((a) => a.templateType === type && String(a.templateId) === String(id));

  const handleToggle = async (type, templateId) => {
    setSaving(true); setError(null);
    try {
      const existing = existingAssignments.find((a) => a.templateType === type && String(a.templateId) === String(templateId));
      if (existing) {
        await deleteTemplateUserAssignment(token, existing.id);
        onRemoved(existing.id);
      } else {
        const res = await createTemplateUserAssignment(token, { templateType: type, templateId, assignedTo: employee.id });
        onAssigned(res);
      }
    } catch (err) { setError(err.message || "Failed"); }
    finally { setSaving(false); }
  };

  const templates = tab === "checklist" ? checklists : logsheetTemplates;
  const empAssignedHere = existingAssignments.filter((a) => a.templateType === tab);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "600px", maxHeight: "88vh", overflowY: "auto" }}>
        {/* Header */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Assign Templates to {employee.fullName}</p>
            <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>{empAssignedHere.length} templates currently assigned ({tab})</p>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ padding: "12px 24px 0", display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0" }}>
          {[{ key: "checklist", label: "Checklists" }, { key: "logsheet", label: "Logsheet Templates" }].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "8px 20px", borderRadius: "8px 8px 0 0", border: "1px solid #e2e8f0", borderBottom: tab === t.key ? "2px solid #2563eb" : "1px solid #e2e8f0", background: tab === t.key ? "#eff6ff" : "#f8fafc", color: tab === t.key ? "#2563eb" : "#64748b", fontWeight: tab === t.key ? 700 : 500, fontSize: "13.5px", cursor: "pointer" }}>
              {t.label}
              <span style={{ marginLeft: "6px", padding: "1px 7px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: "#e0e7ff", color: "#4338ca" }}>
                {existingAssignments.filter((a) => a.templateType === t.key).length}
              </span>
            </button>
          ))}
        </div>

        {/* Template list */}
        <div style={{ padding: "16px 24px" }}>
          {error && <Alert style={{ marginBottom: "12px" }}>{error}</Alert>}
          {templates.length === 0 ? (
            <p style={{ color: "#94a3b8", textAlign: "center", padding: "32px 0" }}>No {tab} templates available</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {templates.map((t) => {
                const assigned = isAssigned(tab, t.id);
                return (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: "10px", border: assigned ? "1.5px solid #bfdbfe" : "1px solid #e2e8f0", background: assigned ? "#eff6ff" : "#fafafa" }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>{t.template_name || t.templateName}</p>
                      {tab === "logsheet" && t.frequency && (
                        <span style={{ fontSize: "11px", color: "#64748b" }}>{t.frequency}</span>
                      )}
                    </div>
                    <button onClick={() => handleToggle(tab, t.id)} disabled={saving}
                      style={{ padding: "6px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px", background: assigned ? "#fee2e2" : "#2563eb", color: assigned ? "#dc2626" : "#fff", transition: "opacity 0.15s", opacity: saving ? 0.6 : 1 }}>
                      {assigned ? "Remove" : "Assign"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ padding: "12px 24px", borderTop: "1px solid #e2e8f0", textAlign: "right" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Done</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Department Modal ───────────────────────────────────────────── */
function DeptModal({ existing, token, companyId, onClose, onSaved }) {
  const isEdit = !!existing;
  const [form, setForm] = useState({
    name: existing?.departmentName || "",
    description: existing?.description || "",
    buildingId: existing?.buildingId ? String(existing.buildingId) : "",
    floorId: existing?.floorId ? String(existing.floorId) : "",
    roomId: existing?.roomId ? String(existing.roomId) : "",
  });
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!companyId || !token) { setBuildings([]); return; }
    fetch(`/api/locations/buildings?companyId=${companyId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setBuildings(Array.isArray(d) ? d : []))
      .catch(() => setBuildings([]));
  }, [companyId, token]);

  useEffect(() => {
    if (!form.buildingId || !token) {
      setFloors([]);
      setRooms([]);
      return;
    }
    fetch(`/api/locations/floors?buildingId=${form.buildingId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setFloors(Array.isArray(d) ? d : []))
      .catch(() => setFloors([]));
  }, [form.buildingId, token]);

  useEffect(() => {
    if (!form.floorId || !token) { setRooms([]); return; }
    fetch(`/api/locations/rooms?floorId=${form.floorId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setRooms(Array.isArray(d) ? d : []))
      .catch(() => setRooms([]));
  }, [form.floorId, token]);

  const handleSave = async () => {
    if (!form.name.trim()) return setError("Department name is required");
    setSaving(true); setError(null);
    try {
      const payload = {
        ...form,
        buildingId: form.buildingId ? Number(form.buildingId) : null,
        floorId: form.floorId ? Number(form.floorId) : null,
        roomId: form.roomId ? Number(form.roomId) : null,
      };
      const saved = isEdit
        ? await updateCompanyPortalDepartment(token, existing.id, payload)
        : await createCompanyPortalDepartment(token, payload);
      onSaved(saved, isEdit);
    } catch (err) { setError(err.message || "Could not save"); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "420px" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{isEdit ? "Edit Department" : "Add Department"}</p>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          {error && <Alert>{error}</Alert>}
          <FInput label="Department Name" required value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Facilities" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Building</label>
              <select
                value={form.buildingId}
                onChange={(e) => setForm((p) => ({ ...p, buildingId: e.target.value, floorId: "", roomId: "" }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", background: "#fff" }}>
                <option value="">Optional</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Floor</label>
              <select
                value={form.floorId}
                onChange={(e) => setForm((p) => ({ ...p, floorId: e.target.value, roomId: "" }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", background: "#fff" }}>
                <option value="">Optional</option>
                {floors.map((f) => <option key={f.id} value={f.id}>{f.floorName}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Room</label>
              <select
                value={form.roomId}
                onChange={(e) => setForm((p) => ({ ...p, roomId: e.target.value }))}
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", background: "#fff" }}>
                <option value="">Optional</option>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.roomName}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
            <textarea value={form.description} onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }} />
          </div>
        </div>
        <div style={{ padding: "14px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Department"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Asset Modal ─────────────────────────────────────────────── */
function AssetModal({ existing, token, companyId, departments, employees = [], assetTypesList = [], companySectors = [], onClose, onSaved }) {
  const API_BASE = import.meta.env.VITE_API_BASE || "";
  const isEdit = !!existing;

  // Known hardcoded metadata keys (not custom)
  const KNOWN_META_KEYS = new Set([
    "description","purchaseValue","usefulLifeYears","assignedToId","assignedToName",
    "serviceArea","frequency","shift","supervisor","staffRequired","specialInstructions",
    "machineName","brand","modelNumber","serialNumber","installationDate","warrantyExpiry",
    "maintenanceFrequency","lastServiceDate","nextServiceDate","technician",
    "vehicleNumber","vehicleType","fuelType","driver","rcNumber",
    "insuranceExpiry","pucExpiry","serviceDueDate","purchaseDate","vendor","dailyKmTracking",
    "calibration","calibrationRequired","calibrationFrequency","lastCalibrationDate","nextCalibrationDueDate",
    "calibrationVendorName","calibrationCertificateNumber","calibrationStatus","alertBeforeDays",
  ]);

  const buildForm = (src) => {
    const meta = typeof src?.metadata === "string"
      ? (() => { try { return JSON.parse(src.metadata || "{}"); } catch { return {}; } })()
      : (src?.metadata || {});
    // Populate any unknown meta keys as _custom_ fields (for editing dynamic-type assets)
    const customFromMeta = {};
    for (const [k, v] of Object.entries(meta)) {
      if (!KNOWN_META_KEYS.has(k)) customFromMeta[`_custom_${k}`] = String(v ?? "");
    }
    const hcMt = meta.maintenanceTypes || {};
    const hcLegacyMt = meta.maintenanceType || "";
    const hcCalibration = meta.calibration || {};
    return {
      assetName:    src?.assetName    || "",
      assetUniqueId: src?.assetUniqueId || "",
      assetType:    src?.assetType    || "",
      departmentId: src?.departmentId != null ? String(src.departmentId) : "",
      building:     src?.building     || "",
      floor:        src?.floor        || "",
      room:         src?.room         || "",
      status:       src?.status       || "Active",
      description:  meta.description  || "",
      // Soft legacy
      serviceArea:         meta.serviceArea         || "",
      frequency:           meta.frequency           || "Daily",
      shift:               meta.shift               || "Morning",
      supervisor:          meta.supervisor          || "",
      staffRequired:       meta.staffRequired       || "",
      specialInstructions: meta.specialInstructions || "",
      // Technical legacy
      machineName:          meta.machineName          || "",
      brand:                meta.brand                || "",
      modelNumber:          meta.modelNumber          || "",
      serialNumber:         meta.serialNumber         || "",
      installationDate:     meta.installationDate     || "",
      warrantyExpiry:       meta.warrantyExpiry       || "",
      maintenanceFrequency: meta.maintenanceFrequency || "",
      lastServiceDate:      meta.lastServiceDate      || "",
      nextServiceDate:      meta.nextServiceDate      || "",
      technician:           meta.technician           || "",
      // Healthcare
      hcEquipmentName:     meta.equipmentName     || meta.hcEquipmentName || src?.assetName || "",
      hcMake:              meta.make              || "",
      hcManufacturer:      meta.manufacturer      || "",
      hcModel:             meta.model             || "",
      hcSerialNo:          meta.serialNo          || "",
      hcAccessories:       meta.accessories       || "",
      hcDealer:            meta.dealer            || "",
      hcManufacturingYear: meta.manufacturingYear || "",
      hcInstallationDate:  meta.installationDate  || "",
      hcInvoiceNo:         meta.invoiceNo         || "",
      hcInvoiceDate:       meta.invoiceDate       || "",
      hcPurchaseCost:      meta.purchaseCost      || "",
      hcWarranty:  !!(hcMt.warranty || hcLegacyMt === "Warranty" || hcLegacyMt === "AMC+CMC" || meta.warranty?.enabled),
      hcAmc:       !!(hcMt.amc      || hcLegacyMt === "AMC"      || hcLegacyMt === "AMC+CMC" || meta.amc?.enabled),
      hcCmc:       !!(hcMt.cmc      || hcLegacyMt === "CMC"      || hcLegacyMt === "AMC+CMC" || meta.cmc?.enabled),
      hcInHouse:   !!(hcMt.inHouse  || meta.inHouse),
      hcCatalyst:  !!(hcMt.catalyst || meta.catalyst),
      hcHighEnd:   !!(hcMt.highEnd || meta.highEnd || meta.maintenanceTypes?.highEnd),
      hcWarrantyCost: meta.maintenanceCosts?.warranty || "",
      hcAmcCost:      meta.maintenanceCosts?.amc      || "",
      hcCmcCost:      meta.maintenanceCosts?.cmc      || "",
      hcCatalystCost: meta.maintenanceCosts?.catalyst || "",
      hcHighEndCost:  meta.maintenanceCosts?.highEnd  || "",
      hcCategory:  src?.criticality || meta.criticality || "Non_Critical",
      hcWorkingStatus: meta.workingStatus || src?.working_status || "Working",
      hcWarrantyStart:     meta.warrantyStart     || meta.warranty?.startDate || "",
      hcWarrantyEnd:       meta.warrantyEnd       || meta.warranty?.endDate   || "",
      hcAmcStart:          meta.amcStart          || meta.amc?.startDate      || "",
      hcAmcEnd:            meta.amcEnd            || meta.amc?.endDate        || "",
      hcCmcStart:          meta.cmcStart          || meta.cmc?.startDate      || "",
      hcCmcEnd:            meta.cmcEnd            || meta.cmc?.endDate        || "",
      hcRber:              !!(meta.rber),
      hcRemarks:           meta.remarks           || "",
      hcCalibrationRequired: !!(hcCalibration.required || meta.calibrationRequired),
      hcCalibrationFrequency: hcCalibration.frequency || meta.calibrationFrequency || "",
      hcLastCalibrationDate: hcCalibration.lastCalibrationDate || meta.lastCalibrationDate || "",
      hcNextCalibrationDueDate: hcCalibration.nextCalibrationDueDate || meta.nextCalibrationDueDate || "",
      hcCalibrationVendorName: hcCalibration.vendorName || meta.calibrationVendorName || "",
      hcCalibrationCertificateNumber: hcCalibration.certificateNumber || meta.calibrationCertificateNumber || "",
      hcCalibrationStatus: hcCalibration.status || meta.calibrationStatus || "Pending",
      hcCalibrationAlertBeforeDays: hcCalibration.alertBeforeDays || meta.alertBeforeDays || 30,
      hcImages:            [
        ...(Array.isArray(meta.hcImages) ? meta.hcImages : []),
        ...(Array.isArray(meta.images) ? meta.images : []),
      ]
        .filter(Boolean)
        .map((img) => {
          if (typeof img === "string") return { url: img, name: img.split("/").pop() || "photo" };
          if (img && typeof img === "object") {
            const url = img.url || img.src || img.path || "";
            const name = img.name || (typeof url === "string" ? (url.split("/").pop() || "photo") : "photo");
            return { ...img, url, name };
          }
          return null;
        })
        .filter((img) => img && typeof img.url === "string" && img.url),
      hcInvoiceUrl:        meta.hcInvoiceUrl || (Array.isArray(meta.invoiceImages) && meta.invoiceImages.length ? meta.invoiceImages[0] : "") || "",
      // Valuation
      purchaseValue:    meta.purchaseValue    || "",
      usefulLifeYears:  meta.usefulLifeYears  || "",
      assignedToId:    meta.assignedToId    != null ? String(meta.assignedToId) : "",
      // Fleet legacy
      vehicleNumber:   meta.vehicleNumber   || "",
      vehicleType:     meta.vehicleType     || "",
      fuelType:        meta.fuelType        || "",
      driver:          meta.driver          || "",
      rcNumber:        meta.rcNumber        || "",
      insuranceExpiry: meta.insuranceExpiry || "",
      pucExpiry:       meta.pucExpiry       || "",
      serviceDueDate:  meta.serviceDueDate  || "",
      purchaseDate:    meta.purchaseDate    || "",
      vendor:          meta.vendor          || "",
      dailyKmTracking: !!meta.dailyKmTracking,
      ...customFromMeta,
    };
  };

  const [form, setForm] = useState(() => buildForm(existing));
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [locBuildings, setLocBuildings] = useState([]);
  const [locFloors, setLocFloors] = useState([]);
  const [locRooms, setLocRooms] = useState([]);
  const [locBuildingId, setLocBuildingId] = useState("");
  const [locFloorId, setLocFloorId] = useState("");
  const [calibrationVendors, setCalibrationVendors] = useState([]);

  useEffect(() => {
    if (!companyId || !token) {
      setLocBuildings([]);
      setLocFloors([]);
      setLocRooms([]);
      setLocBuildingId("");
      setLocFloorId("");
      return;
    }
    fetch(`/api/locations/buildings?companyId=${companyId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setLocBuildings(Array.isArray(d) ? d : []))
      .catch(() => setLocBuildings([]));
  }, [companyId, token]);

  useEffect(() => {
    if (!token) {
      setCalibrationVendors([]);
      return;
    }
    fetch(`/api/company-portal/calibration/vendors`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setCalibrationVendors(Array.isArray(d) ? d : []))
      .catch(() => setCalibrationVendors([]));
  }, [token]);

  // Auto-set assetType to "healthcare" for HC companies when adding new asset
  useEffect(() => {
    if (companySectors.includes("healthcare") && !existing && !form.assetType) {
      setForm(p => ({ ...p, assetType: "healthcare" }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companySectors]);

  const ch = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    ch(name, type === "checkbox" ? checked : value);
    if (fieldErrors[name]) setFieldErrors(p => { const n = { ...p }; delete n[name]; return n; });
  };

  const handleTypeChange = (e) => {
    const newType = e.target.value;
    // Clear all _custom_ keys and legacy type-specific fields
    setForm(p => {
      const cleared = {};
      for (const k of Object.keys(p)) { if (k.startsWith("_custom_")) cleared[k] = ""; }
      return {
        ...p, ...cleared, assetType: newType,
        serviceArea: "", frequency: "Daily", shift: "Morning", supervisor: "", staffRequired: "", specialInstructions: "",
        machineName: "", brand: "", modelNumber: "", serialNumber: "", installationDate: "", warrantyExpiry: "",
        maintenanceFrequency: "", lastServiceDate: "", nextServiceDate: "", technician: "",
        vehicleNumber: "", vehicleType: "", fuelType: "", driver: "", rcNumber: "",
        insuranceExpiry: "", pucExpiry: "", serviceDueDate: "", purchaseDate: "", vendor: "", dailyKmTracking: false,
      };
    });
  };

  // Derive selected asset type object + its custom fields
  const selectedTypeDef = assetTypesList.find(t => t.code === form.assetType);
  const customFields = selectedTypeDef?.fieldLayout?.fields || [];
  const hasCustomLayout = customFields.length > 0;
  const workflowType = selectedTypeDef?.workflowType || form.assetType;
  // Healthcare: company sector is healthcare OR asset type code is healthcare
  const isHCCompany = companySectors.includes("healthcare");
  const isHealthcareLegacy = !hasCustomLayout && (form.assetType === "healthcare" || (isHCCompany && form.assetType !== "soft" && form.assetType !== "fleet" && form.assetType !== "technical" && !hasCustomLayout));
  // Only the three built-in type codes use legacy form layouts; custom types always get the generic form
  const isSoftLegacy = !hasCustomLayout && form.assetType === "soft";
  const isFleetLegacy = !hasCustomLayout && form.assetType === "fleet";
  const isTechnicalLegacy = !hasCustomLayout && !isHealthcareLegacy && form.assetType === "technical";

  const buildMetadata = () => {
    const assignedEmployee = employees.find(e => String(e.id) === String(form.assignedToId));
    const base = {
      description: form.description,
      purchaseValue: form.purchaseValue ? parseFloat(form.purchaseValue) : null,
      usefulLifeYears: form.usefulLifeYears ? parseFloat(form.usefulLifeYears) : null,
      assignedToId: form.assignedToId || null,
      assignedToName: assignedEmployee?.fullName || null,
    };
    if (hasCustomLayout) {
      // Collect dynamic custom field values
      const customData = {};
      for (const f of customFields) customData[f.key] = form[`_custom_${f.key}`] || "";
      return { ...base, ...customData };
    }
    if (isHealthcareLegacy) return {
      equipmentName: form.hcEquipmentName,
      make: form.hcMake, manufacturer: form.hcManufacturer, model: form.hcModel,
      serialNo: form.hcSerialNo, accessories: form.hcAccessories, dealer: form.hcDealer,
      manufacturingYear: form.hcManufacturingYear, installationDate: form.hcInstallationDate,
      invoiceNo: form.hcInvoiceNo, invoiceDate: form.hcInvoiceDate, purchaseCost: form.hcPurchaseCost,
      maintenanceTypes: {
        warranty: !!form.hcWarranty, amc: !!form.hcAmc, cmc: !!form.hcCmc,
        inHouse: !!form.hcInHouse, catalyst: !!form.hcCatalyst, highEnd: !!form.hcHighEnd,
      },
      maintenanceCosts: {
        warranty: form.hcWarrantyCost || "", amc: form.hcAmcCost || "", cmc: form.hcCmcCost || "",
        catalyst: form.hcCatalystCost || "", highEnd: form.hcHighEndCost || "",
      },
      warrantyStart: form.hcWarrantyStart, warrantyEnd: form.hcWarrantyEnd,
      amcStart: form.hcAmcStart, amcEnd: form.hcAmcEnd,
      cmcStart: form.hcCmcStart, cmcEnd: form.hcCmcEnd,
      rber: !!form.hcRber, remarks: form.hcRemarks,
      criticality: form.hcCategory || "Non_Critical",
      workingStatus: form.hcWorkingStatus || "Working",
      calibration: {
        required: !!form.hcCalibrationRequired,
        frequency: form.hcCalibrationFrequency || null,
        lastCalibrationDate: form.hcLastCalibrationDate || null,
        nextCalibrationDueDate: form.hcNextCalibrationDueDate || null,
        vendorName: form.hcCalibrationVendorName || null,
        certificateNumber: form.hcCalibrationCertificateNumber || null,
        status: form.hcCalibrationStatus || null,
        alertBeforeDays: form.hcCalibrationAlertBeforeDays ? Number(form.hcCalibrationAlertBeforeDays) : null,
      },
      calibrationRequired: !!form.hcCalibrationRequired,
      calibrationFrequency: form.hcCalibrationFrequency || null,
      lastCalibrationDate: form.hcLastCalibrationDate || null,
      nextCalibrationDueDate: form.hcNextCalibrationDueDate || null,
      calibrationVendorName: form.hcCalibrationVendorName || null,
      calibrationCertificateNumber: form.hcCalibrationCertificateNumber || null,
      calibrationStatus: form.hcCalibrationStatus || null,
      alertBeforeDays: form.hcCalibrationAlertBeforeDays ? Number(form.hcCalibrationAlertBeforeDays) : null,
      hcImages: form.hcImages || [], hcInvoiceUrl: form.hcInvoiceUrl || "",
    };
    if (isSoftLegacy) return { ...base, serviceArea: form.serviceArea, frequency: form.frequency, shift: form.shift, supervisor: form.supervisor, staffRequired: form.staffRequired, specialInstructions: form.specialInstructions };
    if (isTechnicalLegacy) return { ...base, machineName: form.machineName, brand: form.brand, modelNumber: form.modelNumber, serialNumber: form.serialNumber, installationDate: form.installationDate, warrantyExpiry: form.warrantyExpiry, maintenanceFrequency: form.maintenanceFrequency, lastServiceDate: form.lastServiceDate, nextServiceDate: form.nextServiceDate, technician: form.technician };
    if (isFleetLegacy) return { ...base, vehicleNumber: form.vehicleNumber, vehicleType: form.vehicleType, fuelType: form.fuelType, driver: form.driver, rcNumber: form.rcNumber, insuranceExpiry: form.insuranceExpiry, pucExpiry: form.pucExpiry, serviceDueDate: form.serviceDueDate, purchaseDate: form.purchaseDate, vendor: form.vendor, dailyKmTracking: form.dailyKmTracking };
    return base;
  };

  const handleSave = async () => {
    const effectiveAssetType = form.assetType || (companySectors.includes("healthcare") ? "healthcare" : "");
    if (!effectiveAssetType) return setError("Please select an asset type");
    let assetNameToUse = form.assetName.trim();
    if (isSoftLegacy) {
      assetNameToUse = (form.room || "").trim();
      if (!assetNameToUse) return setError("Room / Area is required for Soft Services");
    } else if ((isHealthcareLegacy || (isHCCompany && hasCustomLayout)) && !assetNameToUse) {
      // For healthcare, auto-derive asset name from equipment name, make + model, or type label
      assetNameToUse = form.hcEquipmentName.trim() ||
        [form.hcMake, form.hcModel].filter(Boolean).join(" ") ||
        selectedTypeDef?.label || "Healthcare Equipment";
    } else if (!assetNameToUse) {
      return setError("Asset name is required");
    }
    // Validate HC date ranges
    if (isHealthcareLegacy) {
      const dateErrs = {};
      if (form.hcWarranty && form.hcWarrantyStart && form.hcWarrantyEnd && form.hcWarrantyEnd < form.hcWarrantyStart)
        dateErrs.hcWarrantyEnd = "Warranty end date must be after start date";
      if (form.hcAmc && form.hcAmcStart && form.hcAmcEnd && form.hcAmcEnd < form.hcAmcStart)
        dateErrs.hcAmcEnd = "AMC end date must be after start date";
      if (form.hcCmc && form.hcCmcStart && form.hcCmcEnd && form.hcCmcEnd < form.hcCmcStart)
        dateErrs.hcCmcEnd = "CMC end date must be after start date";
      if (form.hcCalibrationRequired && form.hcLastCalibrationDate && form.hcNextCalibrationDueDate && form.hcNextCalibrationDueDate < form.hcLastCalibrationDate)
        dateErrs.hcNextCalibrationDueDate = "Next calibration due date must be after last calibration date";
      if (Object.keys(dateErrs).length) { setFieldErrors(dateErrs); return; }
    }
    setSaving(true); setError(null); setFieldErrors({});
    try {
      const payload = {
        assetName:     assetNameToUse,
        assetUniqueId: form.assetUniqueId || null,
        assetType:     effectiveAssetType,
        departmentId:  form.departmentId || null,
        building:      form.building || null,
        floor:         form.floor    || null,
        room:          form.room     || null,
        status:        form.status,
        ...(isHealthcareLegacy ? { criticality: form.hcCategory || "Non_Critical", workingStatus: form.hcWorkingStatus || "Working" } : {}),
        metadata:      buildMetadata(),
      };
      const saved = isEdit
        ? await updateCompanyPortalAsset(token, existing.id, payload)
        : await createCompanyPortalAsset(token, payload);
      onSaved(saved, isEdit);
    } catch (err) { setError(err.message || "Could not save asset"); }
    finally { setSaving(false); }
  };

  /* ─── tiny helpers ─── */
  const FSec = ({ title }) => (
    <div style={{ gridColumn: "span 2", paddingTop: "8px", marginTop: "4px", borderTop: "1px solid #f1f5f9" }}>
      <p style={{ fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>{title}</p>
    </div>
  );

  // Render a single dynamic field from fieldLayout
  const renderCustomField = (f) => {
    const name = `_custom_${f.key}`;
    const value = form[name] || "";
    const isWide = f.type === "textarea" || f.wide;
    return (
      <div key={f.key} style={isWide ? { gridColumn: "span 2" } : {}}>
        {f.type === "textarea" ? (
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>{f.label}{f.required && <span style={{ color: "#ef4444" }}> *</span>}</label>
            <textarea name={name} value={value} onChange={handleChange} rows={2} placeholder={f.placeholder || ""}
              style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }} />
          </div>
        ) : f.type === "select" && f.options?.length ? (
          <FSelect label={f.label} name={name} value={value} onChange={handleChange}>
            <option value="">— Select —</option>
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </FSelect>
        ) : f.type === "checkbox" ? (
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginTop: "18px" }}>
            <input type="checkbox" id={`chk_${f.key}`} name={name} checked={!!form[name]} onChange={e => ch(name, e.target.checked)} style={{ width: "15px", height: "15px", cursor: "pointer" }} />
            <label htmlFor={`chk_${f.key}`} style={{ fontSize: "13.5px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>{f.label}</label>
          </div>
        ) : (
          <FInput label={f.label} required={f.required} name={name} type={f.type || "text"} value={value} onChange={handleChange} placeholder={f.placeholder || ""} />
        )}
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "720px" }} onClick={e => e.stopPropagation()}>
        {/* header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>{isEdit ? "Edit Asset" : "Add Asset"}</p>
            <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>Fill in details based on the selected asset type.</p>
          </div>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* body */}
        <div style={{ padding: "18px 22px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
          {error && <div style={{ gridColumn: "span 2" }}><Alert>{error}</Alert></div>}

          {/* ── Asset Type dropdown — drives which fields appear ── */}
          {/* ── Asset Type dropdown — drives which fields appear ── */}
          <div style={{ gridColumn: "span 2" }}>
            {isHCCompany ? (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px" }}>
                <span style={{ fontSize: "18px" }}>🏥</span>
                <div>
                  <div style={{ fontWeight: 700, color: "#9a3412", fontSize: "13px" }}>Healthcare Equipment Registration</div>
                  <div style={{ color: "#c2410c", fontSize: "12px" }}>All required fields for medical equipment — QR-ready ID generated on save</div>
                </div>
              </div>
            ) : (
              <FSelect label="Asset Type" required name="assetType" value={form.assetType} onChange={handleTypeChange}>
                <option value="" disabled>Select type</option>
                {assetTypesList.length > 0
                  ? assetTypesList.map(t => <option key={t.code} value={t.code}>{t.label}</option>)
                  : <>
                      <option value="soft">Soft Services</option>
                      <option value="technical">Technical</option>
                      <option value="fleet">Fleet</option>
                    </>
                }
              </FSelect>
            )}
          </div>

          {/* ── Healthcare workflow: full medical equipment form ── */}
          {form.assetType && isHealthcareLegacy && !hasCustomLayout && <>
            <div style={{ gridColumn: "span 2", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px", padding: "8px 14px", display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#9a3412" }}>
              <span>🏥</span> Healthcare equipment — QR-ready ID generated on save.
            </div>

            {/* Equipment Photos */}
            <div style={{ gridColumn: "span 2", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 14px" }}>
              <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#374151", marginBottom: "10px", display: "block" }}>Equipment Photos <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: "11px" }}>(up to 5 images)</span></label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-start" }}>
                {(form.hcImages || []).map((img, i) => (
                  <div key={i} style={{ position: "relative", width: "72px", height: "72px" }}>
                    <img src={img.url} alt={img.name || "photo"} style={{ width: "72px", height: "72px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e2e8f0" }} />
                    <button type="button" onClick={() => setForm(p => ({ ...p, hcImages: p.hcImages.filter((_, j) => j !== i) }))}
                      style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "50%", width: "18px", height: "18px", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                ))}
                {(form.hcImages || []).length < 5 && (
                  <label style={{ width: "72px", height: "72px", border: "2px dashed #cbd5e1", borderRadius: "6px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#94a3b8", fontSize: "11px", gap: "3px", flexShrink: 0 }}>
                    <span style={{ fontSize: "20px" }}>+</span><span>Add Photo</span>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                      const file = e.target.files[0]; if (!file) return;
                      const fd = new FormData(); fd.append("file", file);
                      try {
                        const r = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
                        const d = await r.json();
                        setForm(p => ({ ...p, hcImages: [...(p.hcImages || []), { url: d.url, name: file.name }] }));
                      } catch { /* silent */ }
                      e.target.value = "";
                    }} />
                  </label>
                )}
              </div>
            </div>

            {/* Equipment Details */}
            <FSec title="Equipment Details" />
            <div style={{ gridColumn: "span 2" }}>
              <FInput label="Equipment Name" name="hcEquipmentName" value={form.hcEquipmentName} onChange={handleChange} placeholder="e.g. Ultrasound Machine" error={fieldErrors.hcEquipmentName} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Category</label>
              <select name="hcCategory" value={form.hcCategory || "Non_Critical"} onChange={handleChange} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
                <option value="Non_Critical">Non-Critical</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <FInput label="Make / Manufacturer" name="hcMake" value={form.hcMake} onChange={handleChange} placeholder="e.g. Philips" error={fieldErrors.hcMake} />
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Working Status</label>
              <select name="hcWorkingStatus" value={form.hcWorkingStatus || "Working"} onChange={handleChange} style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
                <option value="Working">Working</option>
                <option value="WIP">WIP</option>
                <option value="Not_Working">Not Working</option>
                <option value="Condemned">Condemned</option>
              </select>
            </div>
            <FInput label="Model" name="hcModel" value={form.hcModel} onChange={handleChange} placeholder="e.g. EPIQ 7G" error={fieldErrors.hcModel} />
            <FInput label="Serial No." name="hcSerialNo" value={form.hcSerialNo} onChange={handleChange} placeholder="Serial number" error={fieldErrors.hcSerialNo} />
            <FInput label="Accessories Included" name="hcAccessories" value={form.hcAccessories} onChange={handleChange} placeholder="e.g. Transducer, cables" error={fieldErrors.hcAccessories} />
            <FInput label="Dealer / Distributor" name="hcDealer" value={form.hcDealer} onChange={handleChange} placeholder="Supplier name" error={fieldErrors.hcDealer} />
            <FInput label="Manufacturing Year" name="hcManufacturingYear" type="number" value={form.hcManufacturingYear} onChange={handleChange} placeholder="e.g. 2022" error={fieldErrors.hcManufacturingYear} />
            <FInput label="Installation Date" name="hcInstallationDate" type="date" value={form.hcInstallationDate} onChange={handleChange} error={fieldErrors.hcInstallationDate} />

            {/* Invoice */}
            <FSec title="Invoice No. / Purchase Date" />
            <FInput label="Invoice No." name="hcInvoiceNo" value={form.hcInvoiceNo} onChange={handleChange} placeholder="INV-XXXX" error={fieldErrors.hcInvoiceNo} />
            <FInput label="Purchase Date" name="hcInvoiceDate" type="date" value={form.hcInvoiceDate} onChange={handleChange} error={fieldErrors.hcInvoiceDate} />
            <FInput label="Purchase Cost (₹)" name="hcPurchaseCost" type="number" value={form.hcPurchaseCost} onChange={handleChange} placeholder="e.g. 500000" error={fieldErrors.hcPurchaseCost} />
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Invoice File</label>
              {form.hcInvoiceUrl
                ? <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px" }}>
                    <a href={form.hcInvoiceUrl} target="_blank" rel="noreferrer" style={{ color: "#3b82f6" }}>📄 View Invoice</a>
                    <button type="button" onClick={() => setForm(p => ({ ...p, hcInvoiceUrl: "" }))} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "12px" }}>✕ Remove</button>
                  </div>
                : <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "6px", cursor: "pointer", fontSize: "12.5px", color: "#475569" }}>
                    📎 Upload Invoice
                    <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={async (e) => {
                      const file = e.target.files[0]; if (!file) return;
                      const fd = new FormData(); fd.append("file", file);
                      try {
                        const r = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
                        const d = await r.json();
                        setForm(p => ({ ...p, hcInvoiceUrl: d.url }));
                      } catch { /* silent */ }
                      e.target.value = "";
                    }} />
                  </label>
              }
            </div>

            {/* Maintenance */}
            <FSec title="Maintenance Under" />
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px" }}>
                {[
                  { key: "hcWarranty", label: "a. Warranty" },
                  { key: "hcAmc",      label: "b. AMC (Annual Maintenance Contract)" },
                  { key: "hcCmc",      label: "c. CMC (Comprehensive Maintenance Contract)" },
                  { key: "hcInHouse",  label: "d. In House" },
                  { key: "hcCatalyst", label: "e. Catalyst" },
                  { key: "hcHighEnd",  label: "f. High End Equipment" },
                ].map(({ key, label }) => (
                  <label key={key} style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "13.5px", color: "#374151", fontWeight: 500 }}>
                    <input type="checkbox" checked={!!form[key]} onChange={e => {
                      if (e.target.checked) {
                        setForm(p => ({ ...p, hcWarranty: false, hcAmc: false, hcCmc: false, hcInHouse: false, hcCatalyst: false, hcHighEnd: false, [key]: true }));
                      } else {
                        setForm(p => ({ ...p, [key]: false }));
                      }
                    }}
                      style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {/* Per-type purchase cost inputs */}
            
            {form.hcWarranty && <>
              <FInput label="Warranty Start" name="hcWarrantyStart" type="date" value={form.hcWarrantyStart} onChange={handleChange} error={fieldErrors.hcWarrantyStart} />
              <FInput label="Warranty End" name="hcWarrantyEnd" type="date" value={form.hcWarrantyEnd} onChange={handleChange} error={fieldErrors.hcWarrantyEnd} />
            </>}
            {form.hcAmc && <>
              <FInput label="AMC Start" name="hcAmcStart" type="date" value={form.hcAmcStart} onChange={handleChange} error={fieldErrors.hcAmcStart} />
              <FInput label="AMC End" name="hcAmcEnd" type="date" value={form.hcAmcEnd} onChange={handleChange} error={fieldErrors.hcAmcEnd} />
            </>}
            {form.hcCmc && <>
              <FInput label="CMC Start" name="hcCmcStart" type="date" value={form.hcCmcStart} onChange={handleChange} error={fieldErrors.hcCmcStart} />
              <FInput label="CMC End" name="hcCmcEnd" type="date" value={form.hcCmcEnd} onChange={handleChange} error={fieldErrors.hcCmcEnd} />
            </>}

            {/* Calibration */}
            <FSec title="Calibration Information" />
            <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: "9px" }}>
              <input type="checkbox" id="hcCalibrationRequired" checked={!!form.hcCalibrationRequired} onChange={e => setForm(p => ({ ...p, hcCalibrationRequired: e.target.checked }))} style={{ width: "15px", height: "15px", cursor: "pointer" }} />
              <label htmlFor="hcCalibrationRequired" style={{ fontSize: "13.5px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>Calibration Required</label>
            </div>
            {form.hcCalibrationRequired && <>
              <FSelect label="Calibration Frequency" name="hcCalibrationFrequency" value={form.hcCalibrationFrequency} onChange={handleChange}>
                <option value="">— Select Frequency —</option>
                <option value="Monthly">Monthly</option>
                <option value="Quarterly">Quarterly</option>
                <option value="Half Yearly">Half Yearly</option>
                <option value="Yearly">Yearly</option>
              </FSelect>
              <FSelect label="Calibration Status" name="hcCalibrationStatus" value={form.hcCalibrationStatus} onChange={handleChange}>
                <option value="Pending">Pending</option>
                <option value="Active">Active</option>
                <option value="Expired">Expired</option>
              </FSelect>
              <FInput label="Last Calibration Date" name="hcLastCalibrationDate" type="date" value={form.hcLastCalibrationDate} onChange={handleChange} error={fieldErrors.hcLastCalibrationDate} />
              <FInput label="Next Calibration Due Date" name="hcNextCalibrationDueDate" type="date" value={form.hcNextCalibrationDueDate} onChange={handleChange} error={fieldErrors.hcNextCalibrationDueDate} />
              <FSelect label="Calibration Vendor" name="hcCalibrationVendorName" value={form.hcCalibrationVendorName} onChange={handleChange}>
                <option value="">— Select Vendor —</option>
                {calibrationVendors.map((v) => (
                  <option key={v.id} value={v.vendorName}>{v.vendorName}</option>
                ))}
              </FSelect>
              <FInput label="Calibration Certificate Number" name="hcCalibrationCertificateNumber" value={form.hcCalibrationCertificateNumber} onChange={handleChange} placeholder="Certificate number" error={fieldErrors.hcCalibrationCertificateNumber} />
              <FInput label="Alert Before Due (Days)" name="hcCalibrationAlertBeforeDays" type="number" value={form.hcCalibrationAlertBeforeDays} onChange={handleChange} placeholder="e.g. 30" error={fieldErrors.hcCalibrationAlertBeforeDays} />
              <div style={{ gridColumn: "span 2", fontSize: "12px", color: "#64748b", marginTop: "-6px" }}>
                These details are used for due/overdue dashboard counts and automatic alerts.
              </div>
            </>}

            {/* RBER + Remarks */}
            <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: "9px", marginTop: "4px" }}>
              <input type="checkbox" id="hcRber" name="hcRber" checked={!!form.hcRber} onChange={e => setForm(p => ({ ...p, hcRber: e.target.checked }))} style={{ width: "15px", height: "15px", cursor: "pointer" }} />
              <label htmlFor="hcRber" style={{ fontSize: "13.5px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>RBER (Recommended Beyond Economic Repair)</label>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Remarks</label>
              <textarea name="hcRemarks" value={form.hcRemarks} onChange={handleChange} rows={2} placeholder="Additional notes..."
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }} />
            </div>

            {/* Location */}
            <FSec title="Location & Department" />
            <FSelect label="Department" name="departmentId" value={form.departmentId} onChange={handleChange}>
              <option value="">— Select Department —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
            </FSelect>
            <FSelect label="Building" name="locBuildingId" value={locBuildingId} onChange={async (e) => {
              const bid = e.target.value;
              setLocBuildingId(bid);
              setLocFloorId("");
              setLocRooms([]);
              const selected = locBuildings.find((b) => String(b.id) === String(bid));
              ch("building", selected?.buildingName || "");
              ch("floor", "");
              ch("room", "");
              if (!bid) { setLocFloors([]); return; }
              const r = await fetch(`/api/locations/floors?buildingId=${bid}`, { headers: { Authorization: `Bearer ${token}` } });
              const d = await r.json();
              setLocFloors(Array.isArray(d) ? d : []);
            }}>
              <option value="">— Select Building —</option>
              {locBuildings.map((b) => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
            </FSelect>
            <FSelect label="Floor" name="locFloorId" value={locFloorId} onChange={async (e) => {
              const fid = e.target.value;
              setLocFloorId(fid);
              const selected = locFloors.find((f) => String(f.id) === String(fid));
              ch("floor", selected?.floorName || "");
              ch("room", "");
              if (!fid) { setLocRooms([]); return; }
              const r = await fetch(`/api/locations/rooms?floorId=${fid}`, { headers: { Authorization: `Bearer ${token}` } });
              const d = await r.json();
              setLocRooms(Array.isArray(d) ? d : []);
            }}>
              <option value="">— Select Floor —</option>
              {locFloors.map((f) => <option key={f.id} value={f.id}>{f.floorName}</option>)}
            </FSelect>
            <div style={{ gridColumn: "span 2" }}>
              <FSelect label="Room / Area" name="room" value={form.room} onChange={(e) => {
                const roomName = e.target.value;
                ch("room", roomName);
              }}>
                <option value="">— Select Room —</option>
                {locRooms.map((r) => <option key={r.id} value={r.roomName}>{r.roomName}</option>)}
              </FSelect>
            </div>
          </>}

          {/* ── Dynamic layout: asset type has a custom field layout ── */}
          {form.assetType && hasCustomLayout && <>
            {/* Asset Name + core fields — hidden for healthcare (equipment name auto-derived) */}
            {!isHCCompany && <>
              <div style={{ gridColumn: "span 2" }}>
                <FInput label="Asset Name" required name="assetName" value={form.assetName} onChange={handleChange} placeholder="e.g. Block A - Level 2" />
              </div>
              <FInput label="Asset Unique ID" name="assetUniqueId" value={form.assetUniqueId} onChange={handleChange} placeholder="Auto or manual" />
              <FSelect label="Department" name="departmentId" value={form.departmentId} onChange={handleChange}>
                <option value="">— None —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
              </FSelect>
              <FSelect label="Status" name="status" value={form.status} onChange={handleChange}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </FSelect>
              <FSelect label="Assign To (Employee)" name="assignedToId" value={form.assignedToId} onChange={handleChange}>
                <option value="">— None —</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ""}</option>)}
              </FSelect>
            </>}

            {/* Dynamic custom fields from fieldLayout */}
            <FSec title={selectedTypeDef?.label || "Asset Details"} />
            {customFields.map(renderCustomField)}

            {/* Location always included */}
            <FSec title="Location" />
            <FSelect label="Building" name="locBuildingId" value={locBuildingId} onChange={async (e) => {
              const bid = e.target.value;
              setLocBuildingId(bid);
              setLocFloorId("");
              setLocRooms([]);
              const selected = locBuildings.find((b) => String(b.id) === String(bid));
              ch("building", selected?.buildingName || "");
              ch("floor", "");
              ch("room", "");
              if (!bid) { setLocFloors([]); return; }
              const r = await fetch(`/api/locations/floors?buildingId=${bid}`, { headers: { Authorization: `Bearer ${token}` } });
              const d = await r.json();
              setLocFloors(Array.isArray(d) ? d : []);
            }}>
              <option value="">— Select Building —</option>
              {locBuildings.map((b) => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
            </FSelect>
            <FSelect label="Floor" name="locFloorId" value={locFloorId} onChange={async (e) => {
              const fid = e.target.value;
              setLocFloorId(fid);
              const selected = locFloors.find((f) => String(f.id) === String(fid));
              ch("floor", selected?.floorName || "");
              ch("room", "");
              if (!fid) { setLocRooms([]); return; }
              const r = await fetch(`/api/locations/rooms?floorId=${fid}`, { headers: { Authorization: `Bearer ${token}` } });
              const d = await r.json();
              setLocRooms(Array.isArray(d) ? d : []);
            }}>
              <option value="">— Select Floor —</option>
              {locFloors.map((f) => <option key={f.id} value={f.id}>{f.floorName}</option>)}
            </FSelect>
            <div style={{ gridColumn: "span 2" }}>
              <FSelect label="Room / Area" name="room" value={form.room} onChange={(e) => ch("room", e.target.value)}>
                <option value="">— Select Room —</option>
                {locRooms.map((r) => <option key={r.id} value={r.roomName}>{r.roomName}</option>)}
              </FSelect>
            </div>

            {/* Valuation */}
            <FSec title="Asset Valuation" />
            <FInput label="Purchase Value (₹)" name="purchaseValue" type="number" value={form.purchaseValue} onChange={handleChange} placeholder="e.g. 250000" />
            <FInput label="Useful Life (Years)" name="usefulLifeYears" type="number" value={form.usefulLifeYears} onChange={handleChange} placeholder="e.g. 10" />

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={2} placeholder="Notes, instructions, etc."
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }} />
            </div>
          </>}

          {/* ── Legacy Soft Services: Location only ── */}
          {form.assetType && isSoftLegacy && <>
            <FSec title="Location" />
            <FSelect label="Building" name="locBuildingId" value={locBuildingId} onChange={async (e) => {
              const bid = e.target.value;
              setLocBuildingId(bid);
              setLocFloorId("");
              setLocRooms([]);
              const selected = locBuildings.find((b) => String(b.id) === String(bid));
              ch("building", selected?.buildingName || "");
              ch("floor", "");
              ch("room", "");
              if (!bid) { setLocFloors([]); return; }
              const r = await fetch(`/api/locations/floors?buildingId=${bid}`, { headers: { Authorization: `Bearer ${token}` } });
              const d = await r.json();
              setLocFloors(Array.isArray(d) ? d : []);
            }}>
              <option value="">— Select Building —</option>
              {locBuildings.map((b) => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
            </FSelect>
            <FSelect label="Floor" name="locFloorId" value={locFloorId} onChange={async (e) => {
              const fid = e.target.value;
              setLocFloorId(fid);
              const selected = locFloors.find((f) => String(f.id) === String(fid));
              ch("floor", selected?.floorName || "");
              ch("room", "");
              if (!fid) { setLocRooms([]); return; }
              const r = await fetch(`/api/locations/rooms?floorId=${fid}`, { headers: { Authorization: `Bearer ${token}` } });
              const d = await r.json();
              setLocRooms(Array.isArray(d) ? d : []);
            }}>
              <option value="">— Select Floor —</option>
              {locFloors.map((f) => <option key={f.id} value={f.id}>{f.floorName}</option>)}
            </FSelect>
            <div style={{ gridColumn: "span 2" }}>
              <FSelect label="Room / Area (used as Asset Name)" name="room" value={form.room} onChange={(e) => ch("room", e.target.value)}>
                <option value="">— Select Room —</option>
                {locRooms.map((r) => <option key={r.id} value={r.roomName}>{r.roomName}</option>)}
              </FSelect>
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={2} placeholder="Notes, instructions, etc."
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }} />
            </div>
          </>}

          {/* ── Legacy Non-soft without custom layout: show core + valuation + location ── */}
          {form.assetType && !hasCustomLayout && !isSoftLegacy && !isHealthcareLegacy && <>
            <div style={{ gridColumn: "span 2" }}>
              <FInput label="Asset Name" required name="assetName" value={form.assetName} onChange={handleChange} placeholder="e.g. HVAC Unit 1" />
            </div>
            <FInput label="Asset Unique ID" name="assetUniqueId" value={form.assetUniqueId} onChange={handleChange} placeholder="Auto or manual" />
            <FSelect label="Department" name="departmentId" value={form.departmentId} onChange={handleChange}>
              <option value="">— None —</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
            </FSelect>
            <FSelect label="Status" name="status" value={form.status} onChange={handleChange}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </FSelect>
            <FSelect label="Assign To (Employee)" name="assignedToId" value={form.assignedToId} onChange={handleChange}>
              <option value="">— None —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}{e.designation ? ` · ${e.designation}` : ""}</option>)}
            </FSelect>

            <FSec title="Asset Valuation" />
            <FInput label="Purchase Value (₹)" name="purchaseValue" type="number" value={form.purchaseValue} onChange={handleChange} placeholder="e.g. 250000" />
            <FInput label="Useful Life (Years)" name="usefulLifeYears" type="number" value={form.usefulLifeYears} onChange={handleChange} placeholder="e.g. 10" />

            {!isFleetLegacy && <>
              <FSec title="Location" />
              <FSelect label="Building" name="locBuildingId" value={locBuildingId} onChange={async (e) => {
                const bid = e.target.value;
                setLocBuildingId(bid);
                setLocFloorId("");
                setLocRooms([]);
                const selected = locBuildings.find((b) => String(b.id) === String(bid));
                ch("building", selected?.buildingName || "");
                ch("floor", "");
                ch("room", "");
                if (!bid) { setLocFloors([]); return; }
                const r = await fetch(`/api/locations/floors?buildingId=${bid}`, { headers: { Authorization: `Bearer ${token}` } });
                const d = await r.json();
                setLocFloors(Array.isArray(d) ? d : []);
              }}>
                <option value="">— Select Building —</option>
                {locBuildings.map((b) => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
              </FSelect>
              <FSelect label="Floor" name="locFloorId" value={locFloorId} onChange={async (e) => {
                const fid = e.target.value;
                setLocFloorId(fid);
                const selected = locFloors.find((f) => String(f.id) === String(fid));
                ch("floor", selected?.floorName || "");
                ch("room", "");
                if (!fid) { setLocRooms([]); return; }
                const r = await fetch(`/api/locations/rooms?floorId=${fid}`, { headers: { Authorization: `Bearer ${token}` } });
                const d = await r.json();
                setLocRooms(Array.isArray(d) ? d : []);
              }}>
                <option value="">— Select Floor —</option>
                {locFloors.map((f) => <option key={f.id} value={f.id}>{f.floorName}</option>)}
              </FSelect>
              <div style={{ gridColumn: "span 2" }}>
                <FSelect label="Room / Area" name="room" value={form.room} onChange={(e) => ch("room", e.target.value)}>
                  <option value="">— Select Room —</option>
                  {locRooms.map((r) => <option key={r.id} value={r.roomName}>{r.roomName}</option>)}
                </FSelect>
              </div>
            </>}

            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={2} placeholder="Notes, instructions, etc."
                style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical", fontFamily: "inherit", outline: "none" }} />
            </div>
          </>}

          {/* ── Legacy Technical fields ── */}
          {isTechnicalLegacy && <>
            <FSec title="Technical Asset" />
            <FInput label="Machine Name" name="machineName" value={form.machineName} onChange={handleChange} />
            <FInput label="Brand / Manufacturer" name="brand" value={form.brand} onChange={handleChange} />
            <FInput label="Model Number" name="modelNumber" value={form.modelNumber} onChange={handleChange} />
            <FInput label="Serial Number" name="serialNumber" value={form.serialNumber} onChange={handleChange} />
            <FInput label="Installation Date" name="installationDate" type="date" value={form.installationDate} onChange={handleChange} />
            <FInput label="Warranty Expiry" name="warrantyExpiry" type="date" value={form.warrantyExpiry} onChange={handleChange} />
            <FInput label="Maintenance Frequency" name="maintenanceFrequency" value={form.maintenanceFrequency} onChange={handleChange} placeholder="e.g. Monthly" />
            <FInput label="Last Service Date" name="lastServiceDate" type="date" value={form.lastServiceDate} onChange={handleChange} />
            <FInput label="Next Service Date" name="nextServiceDate" type="date" value={form.nextServiceDate} onChange={handleChange} />
            <FInput label="Technician Assigned" name="technician" value={form.technician} onChange={handleChange} />
          </>}

          {/* ── Legacy Fleet fields ── */}
          {isFleetLegacy && <>
            <FSec title="Fleet Asset" />
            <FInput label="Vehicle Number" required name="vehicleNumber" value={form.vehicleNumber} onChange={handleChange} />
            <FInput label="Vehicle Type" name="vehicleType" value={form.vehicleType} onChange={handleChange} />
            <FInput label="Fuel Type" name="fuelType" value={form.fuelType} onChange={handleChange} />
            <FInput label="Driver Assigned" name="driver" value={form.driver} onChange={handleChange} />
            <FInput label="RC Number" name="rcNumber" value={form.rcNumber} onChange={handleChange} />
            <FInput label="Insurance Expiry" name="insuranceExpiry" type="date" value={form.insuranceExpiry} onChange={handleChange} />
            <FInput label="PUC Expiry" name="pucExpiry" type="date" value={form.pucExpiry} onChange={handleChange} />
            <FInput label="Service Due Date" name="serviceDueDate" type="date" value={form.serviceDueDate} onChange={handleChange} />
            <FInput label="Purchase Date" name="purchaseDate" type="date" value={form.purchaseDate} onChange={handleChange} />
            <FInput label="Vendor" name="vendor" value={form.vendor} onChange={handleChange} />
            <div style={{ gridColumn: "span 2", display: "flex", alignItems: "center", gap: "9px", marginTop: "2px" }}>
              <input type="checkbox" name="dailyKmTracking" checked={form.dailyKmTracking} onChange={handleChange} id="dkmtrack" style={{ width: "15px", height: "15px", cursor: "pointer" }} />
              <label htmlFor="dkmtrack" style={{ fontSize: "13.5px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>Daily KM Tracking</label>
            </div>
          </>}
        </div>

        {/* footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Asset"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Checklist Modal ──────────────────────────────────────────── */
const clCategories = [
  { value: "soft",      label: "Soft Services"    },
  { value: "technical", label: "Technical Assets"  },
  { value: "fleet",     label: "Fleet Assets"      },
];
const mkQ = () => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: "", answerType: "yes_no", isMandatory: false, config: null });

function ChecklistModal({ existing, assets = [], shifts = [], token, onClose, onSaved }) {
  const isEdit = !!existing;

  // Normalise questions stored on existing record (items saved as {title,answerType,isRequired,...})
  const parseExistingQ = (qs) => {
    if (!Array.isArray(qs) || !qs.length) return [mkQ()];
    return qs.map((q) => ({
      id: q.id || mkQ().id,
      text: q.title || q.text || "",
      answerType: q.answerType || "yes_no",
      isMandatory: q.isRequired ?? q.isMandatory ?? false,
      config: q.config || null,
    }));
  };

  const [category,       setCategory]       = useState(existing?.assetType || "soft");
  const [assetId,        setAssetId]         = useState(existing?.assetId ? String(existing.assetId) : "");
  const [checklistName,  setChecklistName]   = useState(existing?.templateName || "");
  const [description,    setDescription]     = useState(existing?.description || "");
  const [shiftId,        setShiftId]         = useState(existing?.shiftId ? String(existing.shiftId) : "");
  const [questions,      setQuestions]       = useState(() => parseExistingQ(existing?.questions));
  const [saving,         setSaving]          = useState(false);
  const [error,          setError]           = useState(null);
  const [draggingId,     setDraggingId]      = useState(null);

  const filteredAssets = useMemo(() => assets.filter((a) => a.assetType === category), [assets, category]);

  const handleAddQuestion    = ()           => setQuestions((p) => [...p, mkQ()]);
  const handleUpdateQuestion = (id, patch)  => setQuestions((p) => p.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const handleRemoveQuestion = (id)         => setQuestions((p) => p.length === 1 ? p : p.filter((q) => q.id !== id));

  const reorder = (dragId, targetId) => {
    if (!dragId || dragId === targetId) return;
    setQuestions((prev) => {
      const next = [...prev];
      const from = next.findIndex((q) => q.id === dragId);
      const to   = next.findIndex((q) => q.id === targetId);
      if (from === -1 || to === -1) return prev;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleSave = async () => {
    const name = checklistName.trim();
    if (!name) return setError("Checklist name is required");
    const validQuestions = questions.filter((q) => q.text.trim());
    if (!validQuestions.length) return setError("Add at least one question with text");
    setSaving(true); setError(null);
    try {
      const payload = {
        templateName: name,
        assetType:    category,
        category,
        description:  description.trim() || undefined,
        assetId:      assetId ? Number(assetId) : undefined,
        shiftId:      shiftId ? Number(shiftId) : undefined,
        questions:    validQuestions.map((q, idx) => ({
          id:         q.id,
          title:      q.text.trim(),
          answerType: q.answerType,
          isRequired: !!q.isMandatory,
          order:      idx,
          config:     q.config,
        })),
      };
      const saved = isEdit
        ? await updateCompanyPortalChecklist(token, existing.id, payload)
        : await createCompanyPortalChecklist(token, payload);
      onSaved(saved, isEdit);
    } catch (err) { setError(err.message || "Could not save"); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "20px", overflowY: "auto" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "900px", marginTop: "20px", marginBottom: "20px" }}>
        {/* header */}
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{isEdit ? "Edit Checklist" : "Add Checklist"}</p>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* body */}
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {error && <Alert>{error}</Alert>}

          {/* ── Asset / Name row ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Asset Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-select" style={{ width: "100%" }}>
                {clCategories.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Asset (optional)</label>
              <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="form-select" style={{ width: "100%" }}>
                <option value="">{filteredAssets.length ? "— Any asset —" : "No assets for this category"}</option>
                {filteredAssets.map((a) => <option key={a.id} value={a.id}>{a.assetName}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Checklist Name *</label>
              <input value={checklistName} onChange={(e) => setChecklistName(e.target.value)} className="form-input" placeholder="e.g. Daily HVAC Checklist" style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="form-input" placeholder="Purpose or scope" style={{ width: "100%", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Shift (optional)</label>
              <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="form-select" style={{ width: "100%" }}>
                <option value="">— Any shift —</option>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {/* ── Questions ── */}
          <div style={{ border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc" }}>
              <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>Questions</span>
              <button type="button" onClick={handleAddQuestion}
                style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "7px", padding: "6px 13px", fontWeight: 600, fontSize: "12.5px", cursor: "pointer" }}>
                + Add Question
              </button>
            </div>
            <div>
              {questions.map((q) => (
                <ChecklistQuestionRow
                  key={q.id}
                  question={q}
                  onChange={handleUpdateQuestion}
                  onRemove={handleRemoveQuestion}
                  onDragStart={(dragId) => setDraggingId(dragId)}
                  onDragOver={() => {}}
                  onDrop={() => { reorder(draggingId, q.id); setDraggingId(null); }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Save Changes" : "Add Checklist"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Import Modal ───────────────────────────────────────────────── */
function ImportModal({ token, onClose, onDone }) {
  const [allRows, setAllRows] = useState([]);   // full parsed data — used for actual import
  const [preview, setPreview] = useState([]);   // first 5 rows — used for display only
  const [fileName, setFileName] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result || "");
      setAllRows(rows);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!allRows.length) return setError("Upload a CSV file first");
    setImporting(true);
    setError(null);
    try {
      const employees = allRows.map((r) => ({
        fullName: r.full_name || r.fullname || r.name,
        email: r.email,
        phone: r.phone,
        designation: r.designation,
        role: r.role || "employee",
        status: r.status || "Active",
        password: r.password || "changeme123",
      }));
      const res = await bulkImportCompanyEmployees(token, employees);
      setResult(res);
      onDone();
    } catch (err) {
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "640px" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Import Employees from CSV</p>
            <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>Upload a .csv file with employee data</p>
          </div>
          <button onClick={onClose} style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {error && <Alert>{error}</Alert>}
          {result && <Alert type="success">✓ Imported {result.created} employee(s). {result.skipped > 0 && `${result.skipped} skipped (duplicates).`}</Alert>}

          <div style={{ marginBottom: "16px", background: "#f8fafc", borderRadius: "10px", padding: "14px 16px", border: "1px solid #e2e8f0" }}>
            <p style={{ fontWeight: 600, fontSize: "13px", color: "#374151", marginBottom: "8px" }}>Required CSV Columns:</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {["full_name", "email", "phone", "designation", "role", "status", "password"].map((c) => (
                <span key={c} style={{ padding: "3px 9px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "5px", fontSize: "12px", fontFamily: "monospace", color: "#374151" }}>{c}</span>
              ))}
            </div>
            <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "8px" }}>Role values: admin, supervisor, technician, cleaner, security, driver, fleet_operator, employee</p>
          </div>

          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <Btn onClick={downloadCSVTemplate} outline color="#64748b" bg="#fff">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download Template
            </Btn>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: "pointer", background: "#2563eb", color: "#fff", border: "none" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              {fileName ? "Change File" : "Upload CSV"}
              <input type="file" accept=".csv" onChange={handleFile} style={{ display: "none" }} />
            </label>
          </div>

          {fileName && <p style={{ fontSize: "12.5px", color: "#16a34a", marginBottom: "10px" }}>📎 {fileName}</p>}

          {preview.length > 0 && (
            <div>
              <p style={{ fontWeight: 600, fontSize: "13px", color: "#374151", marginBottom: "8px" }}>
                Preview (first {preview.length} of <span style={{ color: "#2563eb" }}>{allRows.length}</span> rows)
              </p>
              <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Name", "Email", "Phone", "Designation", "Role", "Status"].map((h) => (
                        <th key={h} style={{ padding: "8px 10px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "7px 10px" }}>{r.full_name || r.fullname || r.name}</td>
                        <td style={{ padding: "7px 10px" }}>{r.email}</td>
                        <td style={{ padding: "7px 10px" }}>{r.phone}</td>
                        <td style={{ padding: "7px 10px" }}>{r.designation}</td>
                        <td style={{ padding: "7px 10px" }}><Badge val={r.role || "employee"} /></td>
                        <td style={{ padding: "7px 10px" }}>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Close</Btn>
          {allRows.length > 0 && !result && (
            <Btn onClick={handleImport} disabled={importing}>{importing ? `Importing ${allRows.length} employees…` : `Import ${allRows.length} Employee${allRows.length !== 1 ? "s" : ""}`}</Btn>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── OJT Training Detail View ────────────────────────────────────── */
function OjtTrainingDetailView({ training, token, onBack, onUpdated }) {
  const [activeTab, setActiveTab] = useState("details"); // details, modules, test, tracking
  const [data, setData] = useState(training);
  const [loading, setLoading] = useState(false);

  // Re-fetch helper
  const refresh = async () => {
    try {
      setLoading(true);
      const updated = await getOjtTraining(token, data.id);
      setData(updated);
      onUpdated(updated);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  if (!data) return <div style={{ padding: "40px", textAlign: "center" }}>Loading...</div>;

  return (
    <Card style={{ borderTop: "4px solid #2563eb" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={onBack} style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#fff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748b", transition: "all 0.2s" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{data.title}</h2>
              <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: data.status === "published" ? "#dcfce7" : "#f1f5f9", color: data.status === "published" ? "#166534" : "#475569" }}>
                {data.status === "published" ? "Published" : "Draft"}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13.5px" }}>{data.description || "No description provided."}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Btn outline color="#2563eb" bg="#fff" onClick={refresh}>Refresh</Btn>
          {data.status !== "published" && (
            <Btn onClick={async () => {
              if (!window.confirm("Publish this training? It will become visible to technicians.")) return;
              try { await publishOjtTraining(token, data.id); refresh(); } catch (e) { alert("Failed to publish"); }
            }} style={{ background: "#16a34a" }}>
              Publish Course
            </Btn>
          )}
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff", padding: "0 24px" }}>
        {[
          { id: "details", label: "Overview" },
          { id: "modules", label: `Modules (${data.modules?.length || 0})` },
          { id: "test", label: "Test Builder" },
          { id: "tracking", label: "User Progress" }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: "16px 20px", background: "none", border: "none", borderBottom: activeTab === tab.id ? "3px solid #2563eb" : "3px solid transparent", color: activeTab === tab.id ? "#2563eb" : "#64748b", fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "24px", background: "#f8fafc", minHeight: "400px" }}>
        {activeTab === "details" && (
          <div style={{ maxWidth: "600px", background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "20px" }}>Course Settings</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Passing Percentage</label>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a" }}>{data.passingPercentage}% Required</div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Associated Asset</label>
                <div style={{ fontSize: "15px", color: data.assetName ? "#0f172a" : "#94a3b8" }}>{data.assetName || "None - General Training"}</div>
              </div>
              <div style={{ marginTop: "10px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", fontSize: "13px", color: "#64748b" }}>
                Created on {new Date(data.createdAt).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {activeTab === "modules" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>Course Modules</h3>
              <Btn onClick={async () => {
                const title = window.prompt("Enter Module Title:");
                if (!title) return;
                try { await createOjtModule(token, data.id, { title, orderNumber: data.modules?.length || 0 }); refresh(); }
                catch (e) { alert("Failed to add module"); }
              }}>+ Add Module</Btn>
            </div>

            {loading ? <p style={{ color: "#64748b" }}>Loading...</p> : data.modules?.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", background: "#fff", borderRadius: "12px", border: "1px dashed #cbd5e1", color: "#94a3b8" }}>
                No modules added yet. Click "+ Add Module" to start building curriculum.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {data.modules.map((m, idx) => (
                  <div key={m.id} style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#334155" }}>{idx + 1}. {m.title}</h4>
                      <button onClick={async () => {
                        if (!window.confirm("Delete this module and all its content?")) return;
                        try { await deleteOjtModule(token, m.id); refresh(); } catch (e) { alert("Failed to delete"); }
                      }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Remove</button>
                    </div>
                    <div style={{ padding: "16px 20px" }}>
                      {m.contents?.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                          {m.contents.map(c => (
                            <div key={c.id} style={{ padding: "12px", background: "#f1f5f9", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <span style={{ display: "inline-block", padding: "2px 8px", background: "#e2e8f0", borderRadius: "12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#475569", marginRight: "10px" }}>{c.type}</span>
                                <span style={{ fontSize: "14px", color: "#334155" }}>{c.description || c.url || "Content block"}</span>
                              </div>
                              <button onClick={async () => {
                                try { await deleteOjtContent(token, c.id); refresh(); } catch (e) { }
                              }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer" }}>✕</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ margin: "0 0 16px", color: "#94a3b8", fontSize: "13px" }}>No content in this module.</p>
                      )}

                      <div style={{ display: "flex", gap: "10px" }}>
                        <Btn outline color="#2563eb" bg="#fff" onClick={async () => {
                          const url = window.prompt("Enter Video/Document URL:");
                          if (!url) return;
                          const desc = window.prompt("Enter short description:");
                          try { await addOjtModuleContent(token, m.id, { type: "url", url, description: desc }); refresh(); } catch (e) { }
                        }}>+ Add Link / Video</Btn>
                        <Btn outline color="#2563eb" bg="#fff" onClick={async () => {
                          const desc = window.prompt("Enter Text Content:");
                          if (!desc) return;
                          try { await addOjtModuleContent(token, m.id, { type: "text", description: desc }); refresh(); } catch (e) { }
                        }}>+ Add Text</Btn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "test" && (
          <div>
            {!data.test ? (
              <div style={{ padding: "40px", textAlign: "center", background: "#fff", borderRadius: "12px", border: "1px dashed #cbd5e1", color: "#64748b" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: "16px", display: "inline-block" }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                <h3 style={{ fontSize: "16px", color: "#334155", marginBottom: "8px" }}>No Test Configured</h3>
                <p style={{ fontSize: "14px", maxWidth: "400px", margin: "0 auto", marginBottom: "20px" }}>Initialize an assessment to add verification questions for this training.</p>
                <Btn onClick={async () => {
                  try { await createOjtTest(token, data.id, { totalMarks: 100 }); refresh(); } catch (e) { alert("Failed"); }
                }}>Initialize Test Assessment</Btn>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                  <div>
                    <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>Test Questions</h3>
                    <p style={{ color: "#64748b", fontSize: "13px", margin: "4px 0 0" }}>Total Marks: {data.test.totalMarks} — Add questions to assess knowledge.</p>
                  </div>
                  <Btn onClick={() => {
                    const qType = window.prompt("Type of question? (mcq / descriptive / multiselect)", "mcq");
                    if (!qType || !["mcq", "descriptive", "multiselect"].includes(qType.toLowerCase())) return;
                    const text = window.prompt("Enter the question:");
                    if (!text) return;
                    let opts = null, ans = "";
                    if (qType.toLowerCase() === "mcq") {
                      opts = ["Option A", "Option B", "Option C", "Option D"];
                      ans = "Option A";
                    }
                    if (qType.toLowerCase() === "multiselect") {
                      opts = ["Option 1", "Option 2", "Option 3"];
                      ans = "Option 1,Option 2";
                    }
                    try {
                      addOjtQuestion(token, data.test.id, { question: text, options: opts, correctAnswer: ans, marks: 10 }).then(refresh);
                    } catch (e) { alert("Failed"); }
                  }}>+ Add Question</Btn>
                </div>

                {data.test.questions?.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {data.test.questions.map((q, i) => (
                      <div key={q.id} style={{ background: "#fff", borderRadius: "10px", padding: "20px", border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                          <h4 style={{ margin: 0, fontSize: "15px", color: "#0f172a", fontWeight: 600 }}>{i + 1}. {q.question}</h4>
                          <span style={{ fontSize: "12px", fontWeight: 700, color: "#2563eb", background: "#eff6ff", padding: "3px 8px", borderRadius: "12px" }}>{q.marks} Marks</span>
                        </div>

                        {q.options && Array.isArray(q.options) && q.options.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
                            {q.options.map((opt, oIdx) => (
                              <div key={oIdx} style={{ padding: "8px 12px", borderRadius: "6px", background: q.correctAnswer?.includes(opt) ? "#dcfce7" : "#f8fafc", border: q.correctAnswer?.includes(opt) ? "1px solid #86efac" : "1px solid #e2e8f0", fontSize: "13.5px", color: q.correctAnswer?.includes(opt) ? "#166534" : "#475569" }}>
                                {opt} {q.correctAnswer?.includes(opt) && <strong style={{ marginLeft: "8px" }}>(Correct)</strong>}
                              </div>
                            ))}
                          </div>
                        )}
                        {!q.options && (
                          <p style={{ margin: "0 0 12px", fontSize: "13px", color: "#64748b", fontStyle: "italic" }}>Descriptive answer expected.</p>
                        )}

                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <button onClick={async () => {
                            if (!window.confirm("Delete this question?")) return;
                            try { await deleteOjtQuestion(token, q.id); refresh(); } catch (e) { }
                          }} style={{ background: "none", border: "none", color: "#ef4444", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Delete Question</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "30px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", color: "#94a3b8" }}>
                    No questions added yet.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "tracking" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>Enrollment & Progress</h3>
            </div>

            {loading ? <p style={{ color: "#64748b" }}>Loading...</p> : !data.users || data.users.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", color: "#94a3b8" }}>
                No technicians are currently enrolled in this training.
              </div>
            ) : (
              <div style={{ overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Technician", "Status", "Score", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map(u => (
                      <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{u.userName}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: u.status === "completed" ? "#dcfce7" : u.status === "in_progress" ? "#fef9c3" : "#f1f5f9", color: u.status === "completed" ? "#166534" : u.status === "in_progress" ? "#854d0e" : "#475569" }}>
                            {u.status.replace("_", " ").toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: u.score >= data.passingPercentage ? "#16a34a" : "#dc2626", fontWeight: 600 }}>
                          {u.score != null ? `${u.score}%` : "—"}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          {u.status === "completed" && u.score >= data.passingPercentage && !u.certificateUrl && (
                            <Btn outline color="#16a34a" bg="#fff" onClick={async () => {
                              try { await grantOjtCertificate(token, u.id); refresh(); } catch (e) { alert("Failed to grant"); }
                            }}>Grant Certificate</Btn>
                          )}
                          {u.certificateUrl && (
                            <a href={u.certificateUrl} target="_blank" rel="noreferrer" style={{ fontSize: "13px", color: "#2563eb", fontWeight: 600, textDecoration: "none" }}>View Certificate</a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── OJT Enrollment Section ──────────────────────────────────── */
function OjtEnrollmentSection({ token, ojtTrainings = [] }) {
  const [selectedId, setSelectedId] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [enrolled, setEnrolled] = useState([]);
  const [allEnrolled, setAllEnrolled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [msg, setMsg] = useState(null);

  // Load all enrolled from all trainings on mount
  useEffect(() => {
    if (!ojtTrainings.length) return;
    setLoadingAll(true);
    Promise.all(ojtTrainings.map(t => getOjtTrainingUsers(token, t.id).then(d => {
      const users = Array.isArray(d.users) ? d.users : [];
      return users.map(u => ({ ...u, trainingTitle: t.title, trainingId: t.id }));
    }).catch(() => []))).then(results => {
      setAllEnrolled(results.flat());
    }).finally(() => setLoadingAll(false));
  }, [token, ojtTrainings]);

  const loadData = async (id) => {
    if (!id) { setEnrolled([]); setAllUsers([]); return; }
    setLoading(true);
    try {
      const [users, enrollData] = await Promise.all([
        getCompanyPortalWOUsers(token),
        getOjtTrainingUsers(token, id),
      ]);
      setAllUsers(Array.isArray(users) ? users : []);
      setEnrolled(Array.isArray(enrollData.users) ? enrollData.users : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSelect = (id) => { setSelectedId(id); setMsg(null); loadData(id); };

  const handleAssign = async () => {
    if (!selectedUserId || !selectedId) return;
    setAssigning(true); setMsg(null);
    try {
      await assignOjtTraining(token, selectedId, { userId: Number(selectedUserId), dueDate: dueDate || null });
      const fresh = await getOjtTrainingUsers(token, selectedId);
      const freshUsers = Array.isArray(fresh.users) ? fresh.users : [];
      setEnrolled(freshUsers);
      // Update allEnrolled for the "all" view
      setAllEnrolled(prev => {
        const kept = prev.filter(u => u.trainingId !== Number(selectedId));
        const training = ojtTrainings.find(t => String(t.id) === selectedId);
        return [...kept, ...freshUsers.map(u => ({ ...u, trainingTitle: training?.title || "", trainingId: Number(selectedId) }))];
      });
      setMsg({ type: "success", text: "Assigned successfully." });
      setSelectedUserId(""); setDueDate("");
    } catch (e) { setMsg({ type: "error", text: e.message || "Failed to assign training" }); }
    finally { setAssigning(false); }
  };

  const enrolledIds = new Set(enrolled.map(e => e.companyUserId));
  const unassigned = allUsers.filter(u => !enrolledIds.has(u.id));
  const selectedTraining = ojtTrainings.find(t => String(t.id) === selectedId);

  // Data to display in table: if training selected, show that training's enrolled; else show all
  const tableData = selectedId ? enrolled.map(u => ({ ...u, trainingTitle: selectedTraining?.title })) : allEnrolled;
  const tableLoading = selectedId ? loading : loadingAll;

  return (
    <div>
      <Card style={{ marginBottom: "16px", padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: "12.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Select Training</label>
            <select value={selectedId} onChange={e => handleSelect(e.target.value)}
              style={{ width: "340px", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", outline: "none" }}>
              <option value="">— Choose a training —</option>
              {ojtTrainings.map(t => (
                <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
              ))}
            </select>
          </div>
          {selectedId && !loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", flex: 1, paddingTop: "18px" }}>
              <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
                style={{ minWidth: "220px", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13.5px", outline: "none" }}>
                <option value="">— Choose employee —</option>
                {unassigned.map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.role || "employee"})</option>)}
                {unassigned.length === 0 && <option disabled>All employees assigned</option>}
              </select>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                style={{ padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13.5px", outline: "none" }}
                placeholder="Due date (optional)" />
              <Btn onClick={handleAssign} disabled={assigning || !selectedUserId} style={{ background: "#16a34a", whiteSpace: "nowrap" }}>
                {assigning ? "Assigning…" : "Assign Employee"}
              </Btn>
            </div>
          )}
        </div>
        {msg && <div style={{ marginTop: "10px", padding: "8px 12px", borderRadius: "6px", fontSize: "13px", background: msg.type === "success" ? "#f0fdf4" : "#fef2f2", color: msg.type === "success" ? "#16a34a" : "#dc2626", border: `1px solid ${msg.type === "success" ? "#bbf7d0" : "#fecaca"}` }}>{msg.text}</div>}
      </Card>

      {tableLoading ? (
        <Card style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading enrollment data…</Card>
      ) : tableData.length === 0 ? (
        <Card style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>
          <p style={{ margin: 0, fontSize: "14px" }}>{selectedId ? "No employees enrolled in this training yet." : "No enrollments found."}</p>
        </Card>
      ) : (
        <Card style={{ padding: "0" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
              {selectedId ? `${selectedTraining?.title} — Enrolled Employees (${enrolled.length})` : `All Enrollments (${allEnrolled.length})`}
            </h3>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Employee", "Role", ...(selectedId ? [] : ["Training"]), "Status", "Due Date", "Score"].map(h => (
                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableData.map((u, idx) => {
                  const isOverdue = u.dueDate && new Date(u.dueDate) < new Date() && u.status !== "completed";
                  return (
                    <tr key={`${u.id}-${idx}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>{u.userName}</div>
                        <div style={{ fontSize: "11px", color: "#94a3b8" }}>{u.email}</div>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "12px", color: "#64748b" }}>{u.role || "—"}</td>
                      {!selectedId && <td style={{ padding: "12px 16px", fontSize: "12.5px", color: "#2563eb", fontWeight: 600 }}>{u.trainingTitle || "—"}</td>}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600,
                          background: u.status === "completed" ? "#dcfce7" : u.status === "in_progress" ? "#fef9c3" : u.status === "failed" ? "#fee2e2" : "#f1f5f9",
                          color: u.status === "completed" ? "#166534" : u.status === "in_progress" ? "#854d0e" : u.status === "failed" ? "#991b1b" : "#475569" }}>
                          {(u.status || "not_started").replace("_", " ").toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", fontSize: "13px", color: isOverdue ? "#dc2626" : "#475569", fontWeight: isOverdue ? 700 : 400 }}>
                        {u.dueDate ? `${isOverdue ? "⚠ Overdue — " : ""}${new Date(u.dueDate).toLocaleDateString()}` : "—"}
                      </td>
                      <td style={{ padding: "12px 16px", fontWeight: 600, color: u.score != null ? (u.score >= (selectedTraining?.passingPercentage || 70) ? "#16a34a" : "#dc2626") : "#94a3b8" }}>
                        {u.score != null ? `${u.score}%` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ─── OJT Progress Tracking Section ──────────────────────────────── */
function TrackingSection({ token, ojtTrainings = [] }) {
  const [selectedId, setSelectedId] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [passingPct, setPassingPct] = useState(0);
  const [totalModules, setTotalModules] = useState(0);

  const loadUsers = async (id) => {
    if (!id) { setUsers([]); return; }
    setLoading(true);
    try {
      const data = await getOjtTrainingUsers(token, id);
      if (Array.isArray(data)) {
        setUsers(data);
        setPassingPct(0);
        setTotalModules(0);
      } else {
        setUsers(data.users || []);
        setPassingPct(data.passingPercentage ?? 0);
        setTotalModules(data.totalModules ?? 0);
      }
    } catch (e) { setUsers([]); }
    setLoading(false);
  };

  const handleSelect = (id) => { setSelectedId(id); loadUsers(id); };

  const handleGrant = async (progressId) => {
    try {
      await grantOjtCertificate(token, progressId);
      setUsers(p => p.map(u => u.id === progressId ? { ...u, certificateUrl: "granted" } : u));
    } catch (e) { alert("Failed to grant certificate"); }
  };

  return (
    <Card style={{ padding: "0" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 12px" }}>Employee Training Progress</h3>
        <select value={selectedId} onChange={e => handleSelect(e.target.value)}
          style={{ width: "320px", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", outline: "none" }}>
          <option value="">— Select a training to view progress —</option>
          {ojtTrainings.map(t => (
            <option key={t.id} value={t.id}>{t.title} ({t.status})</option>
          ))}
        </select>
      </div>
      {!selectedId ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: "12px", display: "inline-block" }}><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          <p style={{ margin: 0, fontSize: "14px" }}>Select a training above to see employee progress and issue certificates.</p>
        </div>
      ) : loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading progress…</div>
      ) : users.length === 0 ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No employees enrolled in this training yet.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Employee", "Status", "Progress", "Score", "Certificate", "Actions"].map(h => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const completedCount = (() => {
                  try { return Array.isArray(u.completedModules) ? u.completedModules.length : JSON.parse(u.completedModules || "[]").length; }
                  catch { return 0; }
                })();
                const effectiveTotal = totalModules > 0 ? totalModules : completedCount;
                const modulePct = effectiveTotal > 0 ? Math.round((completedCount / effectiveTotal) * 100) : 0;
                const testPassed = u.score != null && u.score >= passingPct;
                const canGrantCert = u.status === "completed" && !u.certificateUrl;
                return (
                  <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{u.userName || u.fullName || "Employee"}</div>
                      {u.email && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>{u.email}</div>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600,
                        background: u.status === "completed" ? "#dcfce7" : u.status === "in_progress" ? "#fef9c3" : u.status === "failed" ? "#fee2e2" : "#f1f5f9",
                        color: u.status === "completed" ? "#166534" : u.status === "in_progress" ? "#854d0e" : u.status === "failed" ? "#991b1b" : "#475569" }}>
                        {(u.status || "not_started").replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", minWidth: "140px" }}>
                      <div style={{ fontSize: "12px", color: "#475569", marginBottom: "5px", fontWeight: 600 }}>
                        {completedCount}/{effectiveTotal} modules
                      </div>
                      <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${modulePct}%`, background: modulePct === 100 ? "#16a34a" : "#2563eb", borderRadius: "3px", transition: "width 0.3s" }} />
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>{modulePct}%</div>
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 600, color: testPassed ? "#16a34a" : "#dc2626" }}>
                      {u.score != null ? `${u.score}%` : "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {u.certificateUrl ? (
                        <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, background: "#dcfce7", color: "#166534" }}>🏅 Issued</span>
                      ) : <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {canGrantCert ? (
                        <button onClick={() => handleGrant(u.id)} style={{ padding: "5px 12px", borderRadius: "6px", background: "#dcfce7", color: "#166534", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                          Grant Certificate
                        </button>
                      ) : u.status !== "completed" && !u.certificateUrl ? (
                        <span style={{ fontSize: "11px", color: "#94a3b8" }}>Awaiting test completion</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ─── Fleet Asset Detail View ─────────────────────────────────────── */
function FleetAssetDetailView({ assetId, token, onBack }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setLoading(true);
      const res = await getFleetAssetDetails(token, assetId);
      setData(res);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [assetId]);

  if (loading && !data) return <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>Loading Asset Details
  
  
  ...</div>;
  if (!data) return <div style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>Failed to load asset.</div>;

  return (
    <Card style={{ borderTop: "4px solid #10b981", padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={onBack} style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#fff", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#64748b", transition: "all 0.2s" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
          </button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{data.assetName}</h2>
              <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: data.status === "Active" ? "#dcfce7" : "#f1f5f9", color: data.status === "Active" ? "#166534" : "#475569" }}>
                {data.status || "Unknown"}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "13.5px" }}>ID: {data.assetUniqueId} | Dept: {data.departmentName || "N/A"}</p>
          </div>
        </div>
        <div>
          <Btn outline color="#10b981" bg="#fff" onClick={refresh}>Refresh Data</Btn>
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff", padding: "0 24px", overflowX: "auto" }}>
        {[
          { id: "overview", label: "Overview" },
          { id: "inspections", label: `Inspections (${data.inspections?.length || 0})` },
          { id: "fuel", label: `Fuel Logs (${data.fuelLogs?.length || 0})` },
          { id: "maintenance", label: `Maintenance (${data.maintenance?.length || 0})` },
          { id: "assignments", label: `Checklists & Logs (${data.assignments?.length || 0})` }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{ padding: "16px 20px", background: "none", border: "none", borderBottom: activeTab === tab.id ? "3px solid #10b981" : "3px solid transparent", color: activeTab === tab.id ? "#10b981" : "#64748b", fontSize: "14px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "24px", background: "#f8fafc", minHeight: "400px" }}>
        {activeTab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
            <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 20px 0" }}>Asset Details</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13.5px" }}>Make/Model:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>{data.metadata?.make || "—"} / {data.metadata?.model || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13.5px" }}>License Plate:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>{data.metadata?.license_plate || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13.5px" }}>VIN Number:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px", fontFamily: "monospace" }}>{data.metadata?.vin || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #f1f5f9", paddingBottom: "8px" }}>
                  <span style={{ color: "#64748b", fontSize: "13.5px" }}>Year:</span>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "13.5px" }}>{data.metadata?.year || "—"}</span>
                </div>
              </div>
            </div>

            <div style={{ background: "#fff", padding: "24px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 20px 0" }}>Cost Overview</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div style={{ background: "#f0fdf4", padding: "16px", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#166534", textTransform: "uppercase", marginBottom: "4px" }}>Total Fuel Cost</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#14532d" }}>${data.stats?.totalFuelCost?.toFixed(2) || "0.00"}</div>
                </div>
                <div style={{ background: "#fef2f2", padding: "16px", borderRadius: "10px", border: "1px solid #fecaca" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "#991b1b", textTransform: "uppercase", marginBottom: "4px" }}>Total Maintenance</div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#7f1d1d" }}>${data.stats?.totalMaintenanceCost?.toFixed(2) || "0.00"}</div>
                </div>
                <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", gridColumn: "span 2", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", textTransform: "uppercase", marginBottom: "4px" }}>Open Maintenance Issues</div>
                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a" }}>{data.stats?.openIssues || 0}</div>
                  </div>
                  {data.stats?.openIssues > 0 && (
                    <button onClick={() => setActiveTab("maintenance")} style={{ background: "#0f172a", color: "#fff", border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>View Issues</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "inspections" && (
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", marginTop: 0 }}>Inspection History</h3>
            {!data.inspections?.length ? <p style={{ color: "#64748b" }}>No inspections recorded.</p> : (
              <div style={{ overflowX: "auto", background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                  <thead><tr style={{ background: "#f8fafc" }}>{["Date", "Status", "Inspector", "Notes"].map(h => <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.inspections.map(i => (
                      <tr key={i.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontWeight: 500 }}>{new Date(i.inspectionDate || i.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", background: i.status === "passed" ? "#dcfce7" : i.status === "failed" ? "#fee2e2" : "#f1f5f9", color: i.status === "passed" ? "#16a34a" : i.status === "failed" ? "#dc2626" : "#475569" }}>{i.status}</span></td>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{i.inspectedByName || "Unknown"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", maxWidth: "200px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "fuel" && (
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", marginTop: 0 }}>Fuel Logs</h3>
            {!data.fuelLogs?.length ? <p style={{ color: "#64748b" }}>No fuel logs recorded.</p> : (
              <div style={{ overflowX: "auto", background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                  <thead><tr style={{ background: "#f8fafc" }}>{["Date", "Amount", "Cost", "Odometer", "Logged By"].map(h => <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.fuelLogs.map(l => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontWeight: 500 }}>{new Date(l.logDate || l.createdAt).toLocaleDateString()}</td>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{l.fuelAmount} {l.fuelType && `(${l.fuelType})`}</td>
                        <td style={{ padding: "12px 16px", color: "#16a34a", fontWeight: 600 }}>${l.cost}</td>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{l.odometer || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{l.addedByName || "Unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "maintenance" && (
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", marginTop: 0 }}>Maintenance Work Orders</h3>
            {!data.maintenance?.length ? <p style={{ color: "#64748b" }}>No maintenance records found.</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {data.maintenance.map(m => (
                  <div key={m.id} style={{ background: "#fff", padding: "16px", borderRadius: "10px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <span style={{ fontWeight: 700, color: "#0f172a", fontSize: "15px" }}>{m.issueTitle}</span>
                        <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", background: m.status === "completed" || m.status === "closed" ? "#dcfce7" : m.status === "in_progress" ? "#fef9c3" : "#f1f5f9", color: m.status === "completed" || m.status === "closed" ? "#166534" : m.status === "in_progress" ? "#854d0e" : "#475569" }}>{m.status.replace("_", " ")}</span>
                        <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", border: "1px solid #e2e8f0", color: "#64748b" }}>Pri: {m.priority}</span>
                      </div>
                      <div style={{ fontSize: "13px", color: "#64748b" }}>
                        Scheduled: {m.scheduledDate ? new Date(m.scheduledDate).toLocaleDateString() : "Not set"} | Assigned To: {m.assignedToName || "Unassigned"} | Cost: ${m.cost || "0.00"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "assignments" && (
          <div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", marginBottom: "16px", marginTop: 0 }}>Associated Checklists & Logsheets</h3>
            <p style={{ fontSize: "13.5px", color: "#64748b", marginBottom: "20px" }}>Templates explicitly bound to this asset that have been assigned to technicians.</p>
            {!data.assignments?.length ? <p style={{ color: "#64748b" }}>No templates currently assigned.</p> : (
              <div style={{ overflowX: "auto", background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                  <thead><tr style={{ background: "#f8fafc" }}>{["Type", "Template Name", "Assigned To", "Assigned On"].map(h => <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.assignments.map(a => (
                      <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px" }}><span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", background: a.templateType === "checklist" ? "#f0fdf4" : "#eff6ff", color: a.templateType === "checklist" ? "#16a34a" : "#2563eb" }}>{a.templateType}</span></td>
                        <td style={{ padding: "12px 16px", color: "#0f172a", fontWeight: 500 }}>{a.templateName || "Unknown"}</td>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{a.assignedToName || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ─── Fleet Inspection Modal ──────────────────────────────────────── */
function FleetInspectionModal({ token, fleetAssets, onClose, onSaved }) {
  const [form, setForm] = useState({ asset_id: "", inspection_date: new Date().toISOString().slice(0, 10), status: "pass", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleSave = async () => {
    if (!form.asset_id) return setError("Vehicle is required");
    setSaving(true); setError(null);
    try {
      const saved = await createFleetInspection(token, { ...form, assetId: form.asset_id });
      onSaved(saved);
    } catch (err) { setError(err.message || "Failed to save"); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "500px" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Record Inspection</p>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && <Alert>{error}</Alert>}
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Vehicle *</label>
            <select value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} className="form-select" style={{ width: "100%" }}>
              <option value="">Select vehicle...</option>
              {fleetAssets.map((a) => <option key={a.id} value={a.id}>{a.assetName || a.vehicle_number}</option>)}
            </select>
          </div>
          <FInput label="Inspection Date" type="date" value={form.inspection_date} onChange={(e) => setForm({ ...form, inspection_date: e.target.value })} />
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="form-select" style={{ width: "100%" }}>
              <option value="pass">Pass</option>
              <option value="fail">Fail</option>
              <option value="needs_attention">Needs Attention</option>
            </select>
          </div>
          <FInput label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div style={{ padding: "16px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Fleet Fuel Modal ────────────────────────────────────────────── */
function FleetFuelModal({ token, fleetAssets, onClose, onSaved }) {
  const [form, setForm] = useState({ asset_id: "", log_date: new Date().toISOString().slice(0, 10), litres: "", total_cost: "", odometer_reading: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleSave = async () => {
    if (!form.asset_id || !form.litres) return setError("Vehicle and Litres are required");
    setSaving(true); setError(null);
    try {
      const saved = await createFleetFuelLog(token, { ...form, assetId: form.asset_id });
      onSaved(saved);
    } catch (err) { setError(err.message || "Failed to save"); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "500px" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Add Fuel Log</p>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && <Alert>{error}</Alert>}
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Vehicle *</label>
            <select value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} className="form-select" style={{ width: "100%" }}>
              <option value="">Select vehicle...</option>
              {fleetAssets.map((a) => <option key={a.id} value={a.id}>{a.assetName || a.vehicle_number}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FInput label="Date" type="date" value={form.log_date} onChange={(e) => setForm({ ...form, log_date: e.target.value })} />
            <FInput label="Odometer" type="number" value={form.odometer_reading} onChange={(e) => setForm({ ...form, odometer_reading: e.target.value })} />
            <FInput label="Litres *" type="number" step="0.01" value={form.litres} onChange={(e) => setForm({ ...form, litres: e.target.value })} />
            <FInput label="Total Cost ($)" type="number" step="0.01" value={form.total_cost} onChange={(e) => setForm({ ...form, total_cost: e.target.value })} />
          </div>
        </div>
        <div style={{ padding: "16px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Fleet Maintenance Modal ─────────────────────────────────────── */
function FleetMaintModal({ token, fleetAssets, onClose, onSaved }) {
  const [form, setForm] = useState({ asset_id: "", scheduled_date: new Date().toISOString().slice(0, 10), service_type: "Routine Check", description: "", cost: "", status: "in_progress" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const handleSave = async () => {
    if (!form.asset_id || !form.service_type) return setError("Vehicle and Service Type are required");
    setSaving(true); setError(null);
    try {
      const saved = await createFleetMaintenance(token, { ...form, assetId: form.asset_id });
      onSaved(saved);
    } catch (err) { setError(err.message || "Failed to save"); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "500px" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Schedule Maintenance</p>
          <button onClick={onClose} style={{ width: "28px", height: "28px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {error && <Alert>{error}</Alert>}
          <div>
            <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Vehicle *</label>
            <select value={form.asset_id} onChange={(e) => setForm({ ...form, asset_id: e.target.value })} className="form-select" style={{ width: "100%" }}>
              <option value="">Select vehicle...</option>
              {fleetAssets.map((a) => <option key={a.id} value={a.id}>{a.assetName || a.vehicle_number}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <FInput label="Scheduled Date" type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
            <FInput label="Service Type *" value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })} />
            <FInput label="Est. Cost ($)" type="number" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            <div>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Status</label>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="form-select" style={{ width: "100%" }}>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <FInput label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div style={{ padding: "16px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={onClose} outline color="#64748b" bg="#fff">Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Role Management Modal (custom hierarchy) ───────────────────────── */
function RolesModal({ token, initialRoles, onClose, onSaved, inline = false }) {
  const [roles, setRoles] = useState(initialRoles || []);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftParent, setDraftParent] = useState("");
  const [draftColor, setDraftColor] = useState("#2563eb");
  const [draftCanRaise, setDraftCanRaise]   = useState(false);
  const [draftCanResolve, setDraftCanResolve] = useState(false);
  const [draftIsManager, setDraftIsManager]   = useState(false);
  const [draftIsTechSupervisor, setDraftIsTechSupervisor] = useState(false);
  const [draftIsTechnician, setDraftIsTechnician]         = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm]   = useState({});

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditForm({
      label:                r.label,
      color:                r.color || "#2563eb",
      parentRoleKey:        r.parentRoleKey || "",
      canRaiseSoftIssue:    !!r.canRaiseSoftIssue,
      canResolveSoftIssue:  !!r.canResolveSoftIssue,
      isSoftManager:        !!r.isSoftManager,
      isTechnicalSupervisor:!!r.isTechnicalSupervisor,
      isTechnician:         !!r.isTechnician,
    });
  };

  const saveEdit = async () => {
    if (!editForm.label?.trim()) return setError("Label required");
    setSaving(true); setError(null);
    try {
      await updateCompanyRole(token, editingId, {
        label:                editForm.label.trim(),
        color:                editForm.color,
        bgColor:              lightenHex(editForm.color),
        parentRoleKey:        editForm.parentRoleKey || null,
        canRaiseSoftIssue:    editForm.canRaiseSoftIssue,
        canResolveSoftIssue:  editForm.canResolveSoftIssue,
        isSoftManager:        editForm.isSoftManager,
        isTechnicalSupervisor:editForm.isTechnicalSupervisor,
        isTechnician:         editForm.isTechnician,
      });
      const list = await getCompanyRoles(token);
      setRoles(list || []);
      setEditingId(null);
    } catch (err) { setError(err.message || "Update failed"); }
    finally { setSaving(false); }
  };

  const cancelEdit = () => { setEditingId(null); setEditForm({}); };

  const addRole = async () => {
    if (!draftLabel.trim()) return setError("Role label required");
    setSaving(true); setError(null);
    try {
      await createCompanyRole(token, {
        label: draftLabel.trim(),
        parentRoleKey: draftParent || null,
        color: draftColor,
        bgColor: lightenHex(draftColor),
        canRaiseSoftIssue:   draftCanRaise,
        canResolveSoftIssue: draftCanResolve,
        isSoftManager:       draftIsManager,
        isTechnicalSupervisor: draftIsTechSupervisor,
        isTechnician:          draftIsTechnician,
      });
      const list = await getCompanyRoles(token);
      setRoles(list || []);
      setDraftLabel(""); setDraftParent(""); setDraftColor("#2563eb");
      setDraftCanRaise(false); setDraftCanResolve(false); setDraftIsManager(false);
      setDraftIsTechSupervisor(false); setDraftIsTechnician(false);
    } catch (err) { setError(err.message || "Create failed"); }
    finally { setSaving(false); }
  };

  const removeRole = async (id) => {
    if (!window.confirm("Delete this role? Existing employees keep their role string.")) return;
    setSaving(true);
    try {
      await deleteCompanyRole(token, id);
      const list = await getCompanyRoles(token);
      setRoles(list || []);
    } catch (err) { setError(err.message || "Delete failed"); }
    finally { setSaving(false); }
  };

  const moveRole = async (id, dir) => {
    const idx = roles.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= roles.length) return;
    const a = roles[idx], b = roles[swap];
    setSaving(true);
    try {
      await updateCompanyRole(token, a.id, { sortOrder: b.sortOrder });
      await updateCompanyRole(token, b.id, { sortOrder: a.sortOrder });
      const list = await getCompanyRoles(token);
      setRoles(list || []);
    } catch (err) { setError(err.message || "Reorder failed"); }
    finally { setSaving(false); }
  };

  const handleClose = () => { onSaved(roles); onClose(); };

  const PermCheckboxes = ({ form, setForm }) => (
    <>
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "10px" }}>
        <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Soft Services Mobile Permissions</p>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {[
            { key: "canRaiseSoftIssue",   label: "Can raise issues (Client Supervisor)" },
            { key: "canResolveSoftIssue", label: "Can resolve issues (Catalyst Supervisor)" },
            { key: "isSoftManager",       label: "Manager view only (Client Manager)" },
          ].map(({ key, label }) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#475569", cursor: "pointer" }}>
              <input type="checkbox" checked={!!form[key]} onChange={(e) => {
                const v = e.target.checked;
                const reset = key === "canRaiseSoftIssue" || key === "canResolveSoftIssue" || key === "isSoftManager"
                  ? { canRaiseSoftIssue: false, canResolveSoftIssue: false, isSoftManager: false }
                  : {};
                setForm((p) => ({ ...p, ...reset, [key]: v }));
              }} />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "10px", marginTop: "6px" }}>
        <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Technical Asset Mobile Permissions</p>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          {[
            { key: "isTechnicalSupervisor", label: "Technical Supervisor (assign checklists, manage team)" },
            { key: "isTechnician",          label: "Technician (fill assigned checklists)" },
          ].map(({ key, label }) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#475569", cursor: "pointer" }}>
              <input type="checkbox" checked={!!form[key]} onChange={(e) => {
                const v = e.target.checked;
                const other = key === "isTechnicalSupervisor" ? "isTechnician" : "isTechnicalSupervisor";
                setForm((p) => ({ ...p, [other]: v ? false : p[other], [key]: v }));
              }} />
              {label}
            </label>
          ))}
        </div>
        <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>A role can have both Technical and Soft Service permissions simultaneously.</p>
      </div>
    </>
  );

  const content = (
    <div style={{ padding: "18px 22px", overflowY: "auto", flex: 1 }}>
      {error && <Alert>{error}</Alert>}

      {/* Existing roles */}
      <div style={{ marginBottom: "16px" }}>
        {roles.length === 0 && (
          <p style={{ color: "#94a3b8", fontSize: "13px", padding: "16px", textAlign: "center", background: "#f8fafc", borderRadius: "8px" }}>
            No roles defined yet. Add roles below to build your hierarchy.
          </p>
        )}
        {roles.map((r, i) => (
          <div key={r.id} style={{ borderRadius: "8px", border: `1px solid ${editingId === r.id ? "#6366f1" : "#e2e8f0"}`, marginBottom: "8px", background: editingId === r.id ? "#fafbff" : "#fff", overflow: "hidden" }}>
            {/* Row header */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <button onClick={() => moveRole(r.id, -1)} disabled={saving || i === 0} style={{ padding: "0 4px", border: "none", background: "transparent", cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "#cbd5e1" : "#64748b" }}>▲</button>
                <button onClick={() => moveRole(r.id, 1)} disabled={saving || i === roles.length - 1} style={{ padding: "0 4px", border: "none", background: "transparent", cursor: i === roles.length - 1 ? "default" : "pointer", color: i === roles.length - 1 ? "#cbd5e1" : "#64748b" }}>▼</button>
              </div>
              <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: r.bgColor || "#dbeafe", color: r.color || "#2563eb" }}>{r.label}</span>
              <span style={{ fontSize: "11.5px", color: "#94a3b8" }}>{r.parentRoleKey ? `reports to ${roles.find((x) => x.roleKey === r.parentRoleKey)?.label || r.parentRoleKey}` : "top level"}</span>
              {r.canRaiseSoftIssue    && <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "10.5px", fontWeight: 600, background: "#fef9c3", color: "#854d0e" }}>Raises Issues</span>}
              {r.canResolveSoftIssue  && <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "10.5px", fontWeight: 600, background: "#dcfce7", color: "#166534" }}>Resolves Issues</span>}
              {r.isSoftManager        && <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "10.5px", fontWeight: 600, background: "#e0f2fe", color: "#0369a1" }}>Manager View</span>}
              {r.isTechnicalSupervisor && <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "10.5px", fontWeight: 600, background: "#eff6ff", color: "#1d4ed8" }}>Tech Supervisor</span>}
              {r.isTechnician         && <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "10.5px", fontWeight: 600, background: "#f5f3ff", color: "#6d28d9" }}>Technician</span>}
              <span style={{ marginLeft: "auto", fontSize: "11px", color: "#94a3b8" }}>{r.roleKey}</span>
              <button onClick={() => editingId === r.id ? cancelEdit() : startEdit(r)} disabled={saving}
                style={{ padding: "4px 10px", border: `1px solid ${editingId === r.id ? "#c7d2fe" : "#e2e8f0"}`, background: editingId === r.id ? "#eef2ff" : "#f8fafc", color: editingId === r.id ? "#4f46e5" : "#475569", borderRadius: "6px", cursor: "pointer", fontSize: "11.5px", fontWeight: 600 }}>
                {editingId === r.id ? "Cancel" : "Edit"}
              </button>
              <button onClick={() => removeRole(r.id)} disabled={saving}
                style={{ padding: "4px 8px", border: "1px solid #fecaca", background: "#fff0f0", color: "#dc2626", borderRadius: "6px", cursor: "pointer", fontSize: "11.5px", fontWeight: 600 }}>Delete</button>
            </div>

            {/* Inline edit form */}
            {editingId === r.id && (
              <div style={{ padding: "14px 16px", borderTop: "1px solid #e0e7ff", background: "#f5f7ff" }}>
                <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 80px", gap: "10px", marginBottom: "12px", alignItems: "end" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Role Label *</label>
                    <input value={editForm.label || ""} onChange={(e) => setEditForm((p) => ({ ...p, label: e.target.value }))}
                      style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid #c7d2fe", borderRadius: "6px", fontSize: "13px" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Reports To</label>
                    <select value={editForm.parentRoleKey || ""} onChange={(e) => setEditForm((p) => ({ ...p, parentRoleKey: e.target.value }))}
                      style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid #c7d2fe", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
                      <option value="">— Top of hierarchy —</option>
                      {roles.filter((x) => x.id !== r.id).map((x) => <option key={x.roleKey} value={x.roleKey}>{x.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Color</label>
                    <input type="color" value={editForm.color || "#2563eb"} onChange={(e) => setEditForm((p) => ({ ...p, color: e.target.value }))}
                      style={{ width: "100%", height: "34px", padding: "2px", border: "1px solid #c7d2fe", borderRadius: "6px" }} />
                  </div>
                </div>
                <PermCheckboxes form={editForm} setForm={setEditForm} />
                <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                  <Btn onClick={cancelEdit} outline color="#64748b" bg="#fff">Cancel</Btn>
                  <Btn onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Btn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new role */}
      <div style={{ background: "#f8fafc", borderRadius: "10px", padding: "14px 16px", border: "1px solid #e2e8f0" }}>
        <p style={{ fontSize: "12.5px", fontWeight: 700, color: "#475569", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Add New Role</p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr auto", gap: "10px", alignItems: "end", marginBottom: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Role Label *</label>
            <input value={draftLabel} onChange={(e) => setDraftLabel(e.target.value)} placeholder="e.g. Jabil Client Supervisor" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Reports To (optional)</label>
            <select value={draftParent} onChange={(e) => setDraftParent(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "13px", background: "#fff" }}>
              <option value="">— Top of hierarchy —</option>
              {roles.map((r) => <option key={r.roleKey} value={r.roleKey}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Color</label>
            <input type="color" value={draftColor} onChange={(e) => setDraftColor(e.target.value)} style={{ width: "100%", height: "34px", padding: "2px", border: "1px solid #e2e8f0", borderRadius: "6px", cursor: "pointer" }} />
          </div>
          <Btn onClick={addRole} disabled={saving || !draftLabel.trim()}>Add</Btn>
        </div>
        <PermCheckboxes
          form={{ canRaiseSoftIssue: draftCanRaise, canResolveSoftIssue: draftCanResolve, isSoftManager: draftIsManager, isTechnicalSupervisor: draftIsTechSupervisor, isTechnician: draftIsTechnician }}
          setForm={(updater) => {
            const next = typeof updater === "function"
              ? updater({ canRaiseSoftIssue: draftCanRaise, canResolveSoftIssue: draftCanResolve, isSoftManager: draftIsManager, isTechnicalSupervisor: draftIsTechSupervisor, isTechnician: draftIsTechnician })
              : updater;
            setDraftCanRaise(next.canRaiseSoftIssue); setDraftCanResolve(next.canResolveSoftIssue);
            setDraftIsManager(next.isSoftManager); setDraftIsTechSupervisor(next.isTechnicalSupervisor);
            setDraftIsTechnician(next.isTechnician);
          }}
        />
      </div>
    </div>
  );

  if (inline) return (
    <div>
      <div style={{ marginBottom: "22px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Manage Roles</h1>
        <p style={{ color: "#64748b", fontSize: "13.5px" }}>Define your organization's role hierarchy and mobile app permissions. Top of list = top of chain.</p>
      </div>
      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
        {content}
      </div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
      <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "720px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontWeight: 700, fontSize: "16px", color: "#0f172a" }}>Manage Custom Roles & Hierarchy</p>
            <p style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>Define your organization's role hierarchy. Top of list = top of chain.</p>
          </div>
          <button onClick={handleClose} style={{ width: "28px", height: "28px", borderRadius: "7px", background: "#f1f5f9", border: "none", cursor: "pointer", color: "#64748b" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {content}
        <div style={{ padding: "14px 22px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <Btn onClick={handleClose}>Done</Btn>
        </div>
      </div>
    </div>
  );
}

/* ─── Asset Types Panel ──────────────────────────────────────────── */
function AssetTypesPanel({ token, onLayoutSaved }) {
  const API = import.meta.env.VITE_API_BASE || "";
  const [tab, setTab] = useState("types"); // "types" | "layout"
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  /* ── Tab 1 state ── */
  const emptyDraft = { code: "", label: "", category: "", workflowType: "standard" };
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  /* ── Tab 2 state ── */
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [layoutFields, setLayoutFields] = useState([]);
  const [savingLayout, setSavingLayout] = useState(false);

  const loadTypes = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API}/api/company-portal/asset-types`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Failed to load asset types");
      setTypes(await r.json());
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadTypes(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync layout fields when selected type changes
  useEffect(() => {
    const t = types.find(t => String(t.id) === String(selectedTypeId));
    if (t?.fieldLayout?.fields) {
      setLayoutFields(JSON.parse(JSON.stringify(t.fieldLayout.fields)));
    } else {
      setLayoutFields([]);
    }
  }, [selectedTypeId, types]);

  /* ─── Tab 1: Asset Type CRUD ─── */
  const startEdit = (t) => {
    setEditingId(t.id);
    setDraft({ code: t.code, label: t.label, category: t.category || "", workflowType: t.workflowType || "standard" });
  };
  const cancelEdit = () => { setEditingId(null); setDraft(emptyDraft); };

  const handleSaveType = async () => {
    if (!draft.code.trim() || !draft.label.trim()) return alert("Code and label are required");
    setSaving(true);
    try {
      const url = editingId ? `${API}/api/company-portal/asset-types/${editingId}` : `${API}/api/company-portal/asset-types`;
      const body = editingId
        ? { label: draft.label.trim(), category: draft.category.trim() || undefined, workflowType: draft.workflowType }
        : { code: draft.code.trim().toLowerCase(), label: draft.label.trim(), category: draft.category.trim() || undefined, workflowType: draft.workflowType };
      const r = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Save failed"); }
      setEditingId(null); setDraft(emptyDraft);
      loadTypes();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  };

  const handleDeleteType = async (id) => {
    if (!window.confirm("Delete this asset type?")) return;
    setDeleteId(id);
    try {
      const r = await fetch(`${API}/api/company-portal/asset-types/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Delete failed");
      if (String(selectedTypeId) === String(id)) setSelectedTypeId("");
      loadTypes();
    } catch (e) { alert(e.message); }
    finally { setDeleteId(null); }
  };

  /* ─── Tab 2: Field Layout Builder ─── */
  const addLayoutField = () => setLayoutFields(p => [...p, { key: "", label: "", type: "text", required: false, placeholder: "", wide: false }]);
  const updateLayoutField = (idx, changes) => setLayoutFields(p => {
    const next = [...p];
    next[idx] = { ...next[idx], ...changes };
    if (changes.label !== undefined) next[idx].key = changes.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "");
    return next;
  });
  const removeLayoutField = (idx) => setLayoutFields(p => p.filter((_, i) => i !== idx));
  const moveField = (idx, dir) => setLayoutFields(p => {
    const next = [...p];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return p;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    return next;
  });

  const handleSaveLayout = async () => {
    if (!selectedTypeId) return alert("Please select an asset type first");
    setSavingLayout(true);
    try {
      const fieldLayout = layoutFields.length ? { fields: layoutFields } : undefined;
      const r = await fetch(`${API}/api/company-portal/asset-types/${selectedTypeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: types.find(t => String(t.id) === String(selectedTypeId))?.label, workflowType: types.find(t => String(t.id) === String(selectedTypeId))?.workflowType || "standard", fieldLayout }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || "Save failed"); }
      await loadTypes();
      onLayoutSaved?.();
      alert("Field layout saved!");
    } catch (e) { alert(e.message); }
    finally { setSavingLayout(false); }
  };

  const wfColor = (w) => ({ soft: "#d1fae5", technical: "#dbeafe", fleet: "#ede9fe", standard: "#f1f5f9" }[w] || "#f1f5f9");
  const wfTextColor = (w) => ({ soft: "#065f46", technical: "#1e40af", fleet: "#5b21b6", standard: "#374151" }[w] || "#374151");

  const TabBtn = ({ id, label }) => (
    <button onClick={() => setTab(id)} style={{
      padding: "9px 22px", borderRadius: "8px", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer", border: "none", transition: "all 0.15s",
      background: tab === id ? "#2563eb" : "transparent",
      color: tab === id ? "#fff" : "#64748b",
    }}>{label}</button>
  );

  return (
    <div style={{ padding: "24px", maxWidth: "960px", margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: "20px" }}>
        <h2 style={{ margin: "0 0 4px", fontSize: "1.4rem", fontWeight: 800, color: "#0f172a" }}>Asset Types Manager</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.875rem" }}>
          Define asset types and configure custom field layouts for each type.
        </p>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", borderRadius: "10px", padding: "4px", marginBottom: "24px", width: "fit-content" }}>
        <TabBtn id="types" label="📋  Asset Types" />
        <TabBtn id="layout" label="🔧  Field Layout" />
      </div>

      {loading && <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading…</div>}
      {error && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "16px", color: "#dc2626", marginBottom: "16px" }}>{error}</div>}

      {/* ═══════════════════ TAB 1: ASSET TYPES ═══════════════════ */}
      {tab === "types" && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* List of existing types */}
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#374151" }}>Existing Asset Types ({types.length})</span>
            </div>
            {types.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📭</div>
                <p style={{ margin: 0 }}>No asset types yet. Create one below.</p>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Code", "Label", "Category", "Workflow", "Fields", "Actions"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #f1f5f9" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      {editingId === t.id ? (
                        <td colSpan={6} style={{ padding: "14px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto auto", gap: "10px", alignItems: "end" }}>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>Code (read-only)</label>
                              <input value={draft.code} disabled style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "0.85rem", background: "#f8fafc" }} />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>Label *</label>
                              <input value={draft.label} onChange={(e) => setDraft(p => ({ ...p, label: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.85rem" }} />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>Category</label>
                              <input value={draft.category} onChange={(e) => setDraft(p => ({ ...p, category: e.target.value }))} placeholder="Optional" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.85rem" }} />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>Workflow</label>
                              <select value={draft.workflowType} onChange={(e) => setDraft(p => ({ ...p, workflowType: e.target.value }))} style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.85rem", background: "#fff" }}>
                                <option value="standard">Standard</option>
                                <option value="soft">Soft Services</option>
                                <option value="technical">Technical</option>
                                <option value="fleet">Fleet</option>
                              </select>
                            </div>
                            <button onClick={handleSaveType} disabled={saving} style={{ padding: "7px 14px", background: saving ? "#93c5fd" : "#2563eb", color: "#fff", border: "none", borderRadius: "6px", cursor: saving ? "default" : "pointer", fontWeight: 600, fontSize: "0.85rem" }}>{saving ? "…" : "Save"}</button>
                            <button onClick={cancelEdit} style={{ padding: "7px 14px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", borderRadius: "6px", cursor: "pointer", fontSize: "0.85rem" }}>Cancel</button>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td style={{ padding: "12px 14px", fontSize: "0.85rem", fontFamily: "monospace", color: "#475569" }}>{t.code}</td>
                          <td style={{ padding: "12px 14px", fontWeight: 600, color: "#1e293b" }}>{t.label}</td>
                          <td style={{ padding: "12px 14px", fontSize: "0.85rem", color: "#64748b" }}>{t.category || "—"}</td>
                          <td style={{ padding: "12px 14px" }}>
                            <span style={{ background: wfColor(t.workflowType), color: wfTextColor(t.workflowType), fontSize: "0.75rem", fontWeight: 600, borderRadius: "999px", padding: "3px 10px" }}>{t.workflowType || "standard"}</span>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            {t.fieldLayout?.fields?.length > 0
                              ? <span style={{ background: "#fffbeb", color: "#92400e", fontSize: "0.75rem", fontWeight: 600, borderRadius: "999px", padding: "3px 10px" }}>{t.fieldLayout.fields.length} fields</span>
                              : <span style={{ color: "#cbd5e1", fontSize: "0.8rem" }}>None</span>}
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button onClick={() => startEdit(t)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "5px", padding: "4px 10px", cursor: "pointer", fontWeight: 500, color: "#374151", fontSize: "0.8rem" }}>Edit</button>
                              <button onClick={() => { setSelectedTypeId(String(t.id)); setTab("layout"); }} style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "5px", padding: "4px 10px", cursor: "pointer", fontWeight: 500, color: "#2563eb", fontSize: "0.8rem" }}>Fields</button>
                              <button onClick={() => handleDeleteType(t.id)} disabled={deleteId === t.id} style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "5px", padding: "4px 10px", cursor: "pointer", fontWeight: 500, color: "#dc2626", fontSize: "0.8rem" }}>{deleteId === t.id ? "…" : "Delete"}</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Add new type form */}
          {editingId === null && (
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "20px" }}>
              <p style={{ margin: "0 0 14px", fontWeight: 700, fontSize: "0.95rem", color: "#374151" }}>+ Create New Asset Type</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: "12px", alignItems: "end" }}>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Type Code *</label>
                  <input value={draft.code} onChange={(e) => setDraft(p => ({ ...p, code: e.target.value }))} placeholder="e.g. kitchen"
                    style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: "7px", fontSize: "0.9rem" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Label *</label>
                  <input value={draft.label} onChange={(e) => setDraft(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Kitchen Equipment"
                    style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: "7px", fontSize: "0.9rem" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Category</label>
                  <input value={draft.category} onChange={(e) => setDraft(p => ({ ...p, category: e.target.value }))} placeholder="Optional grouping"
                    style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: "7px", fontSize: "0.9rem" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#64748b", marginBottom: "4px" }}>Workflow Type</label>
                  <select value={draft.workflowType} onChange={(e) => setDraft(p => ({ ...p, workflowType: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: "7px", fontSize: "0.9rem", background: "#fff" }}>
                    <option value="standard">Standard</option>
                    <option value="soft">Soft Services</option>
                    <option value="technical">Technical</option>
                    <option value="fleet">Fleet</option>
                  </select>
                </div>
                <button onClick={handleSaveType} disabled={saving || !draft.code.trim() || !draft.label.trim()}
                  style={{ padding: "9px 20px", borderRadius: "7px", border: "none", background: (saving || !draft.code.trim() || !draft.label.trim()) ? "#93c5fd" : "#2563eb", color: "#fff", cursor: (saving || !draft.code.trim() || !draft.label.trim()) ? "default" : "pointer", fontWeight: 700, whiteSpace: "nowrap", fontSize: "0.9rem" }}>
                  {saving ? "Saving…" : "Create Type"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════ TAB 2: FIELD LAYOUT ═══════════════════ */}
      {tab === "layout" && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Asset type selector */}
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "18px 20px" }}>
            <label style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "#374151", marginBottom: "8px" }}>
              Select Asset Type to configure its fields:
            </label>
            {types.length === 0 ? (
              <p style={{ color: "#94a3b8", margin: 0 }}>No asset types found. Create some in the Asset Types tab first.</p>
            ) : (
              <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)}
                style={{ padding: "9px 14px", border: "1px solid #d1d5db", borderRadius: "8px", fontSize: "0.95rem", background: "#fff", minWidth: "260px", color: selectedTypeId ? "#1e293b" : "#94a3b8" }}>
                <option value="">— Choose an asset type —</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.label} ({t.code})</option>)}
              </select>
            )}
          </div>

          {/* Field builder — only when a type is selected */}
          {selectedTypeId && (
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.95rem" }}>
                    Fields for: <span style={{ color: "#2563eb" }}>{types.find(t => String(t.id) === String(selectedTypeId))?.label}</span>
                  </span>
                  <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                    These fields will appear in the Add Asset form when this type is selected.
                  </p>
                </div>
                <button onClick={addLayoutField}
                  style={{ padding: "8px 18px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: "7px", fontWeight: 700, cursor: "pointer", fontSize: "0.875rem" }}>
                  + Add Field
                </button>
              </div>

              <div style={{ padding: "16px 20px" }}>
                {layoutFields.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🔧</div>
                    <p style={{ margin: 0 }}>No custom fields yet. Click "+ Add Field" to start building the layout.</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {/* Header row */}
                    <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 110px 90px 80px 60px", gap: "8px", alignItems: "center", padding: "0 8px" }}>
                      {["#", "Field Label *", "Placeholder", "Type", "Required", "Full Width", ""].map(h => (
                        <span key={h} style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</span>
                      ))}
                    </div>
                    {layoutFields.map((f, idx) => (
                      <div key={idx} style={{ display: "grid", gridTemplateColumns: "32px 1fr 1fr 110px 90px 80px 60px", gap: "8px", alignItems: "center", background: "#f8fafc", padding: "10px 8px", borderRadius: "8px", border: "1px solid #f1f5f9" }}>
                        {/* Order buttons */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <button onClick={() => moveField(idx, -1)} disabled={idx === 0} style={{ width: "24px", height: "17px", background: "none", border: "1px solid #e2e8f0", borderRadius: "3px", cursor: "pointer", fontSize: "9px", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>▲</button>
                          <button onClick={() => moveField(idx, 1)} disabled={idx === layoutFields.length - 1} style={{ width: "24px", height: "17px", background: "none", border: "1px solid #e2e8f0", borderRadius: "3px", cursor: "pointer", fontSize: "9px", color: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>▼</button>
                        </div>
                        {/* Label */}
                        <input value={f.label} onChange={(e) => updateLayoutField(idx, { label: e.target.value })} placeholder="e.g. Machine Name"
                          style={{ padding: "7px 9px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.85rem", width: "100%", boxSizing: "border-box" }} />
                        {/* Placeholder */}
                        <input value={f.placeholder || ""} onChange={(e) => updateLayoutField(idx, { placeholder: e.target.value })} placeholder="Hint text..."
                          style={{ padding: "7px 9px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.85rem", width: "100%", boxSizing: "border-box" }} />
                        {/* Type */}
                        <select value={f.type || "text"} onChange={(e) => updateLayoutField(idx, { type: e.target.value })}
                          style={{ padding: "7px 9px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.85rem", background: "#fff" }}>
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="textarea">Text Area</option>
                          <option value="select">Dropdown</option>
                          <option value="checkbox">Checkbox</option>
                        </select>
                        {/* Required */}
                        <select value={f.required ? "yes" : "no"} onChange={(e) => updateLayoutField(idx, { required: e.target.value === "yes" })}
                          style={{ padding: "7px 9px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.85rem", background: "#fff" }}>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                        {/* Wide (full row) */}
                        <select value={f.wide ? "yes" : "no"} onChange={(e) => updateLayoutField(idx, { wide: e.target.value === "yes" })}
                          style={{ padding: "7px 9px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "0.85rem", background: "#fff" }}>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                        {/* Remove */}
                        <button onClick={() => removeLayoutField(idx)}
                          style={{ padding: "7px 10px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "6px", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem" }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Dropdown options helper (only for select-type fields) */}
                {layoutFields.some(f => f.type === "select") && (
                  <div style={{ marginTop: "16px", padding: "14px", background: "#fffbeb", borderRadius: "8px", border: "1px solid #fde68a" }}>
                    <p style={{ margin: "0 0 10px", fontSize: "12px", fontWeight: 700, color: "#92400e" }}>📋 Dropdown Options — enter comma-separated options below each select field:</p>
                    {layoutFields.filter(f => f.type === "select").map((f, rawIdx) => {
                      const actualIdx = layoutFields.findIndex(x => x === f);
                      return (
                        <div key={rawIdx} style={{ marginBottom: "8px" }}>
                          <label style={{ fontSize: "12px", fontWeight: 600, color: "#78350f", marginBottom: "4px", display: "block" }}>{f.label || "(unnamed field)"} options:</label>
                          <input value={(f.options || []).join(", ")} onChange={(e) => updateLayoutField(actualIdx, { options: e.target.value.split(",").map(o => o.trim()).filter(Boolean) })}
                            placeholder="e.g. Option A, Option B, Option C"
                            style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px", border: "1px solid #fcd34d", borderRadius: "6px", fontSize: "0.85rem" }} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Save button */}
              <div style={{ padding: "14px 20px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button onClick={() => {
                  const t = types.find(t => String(t.id) === String(selectedTypeId));
                  setLayoutFields(t?.fieldLayout?.fields ? JSON.parse(JSON.stringify(t.fieldLayout.fields)) : []);
                }} style={{ padding: "9px 20px", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", cursor: "pointer", fontWeight: 600 }}>
                  Reset
                </button>
                <button onClick={handleSaveLayout} disabled={savingLayout}
                  style={{ padding: "9px 24px", borderRadius: "7px", border: "none", background: savingLayout ? "#93c5fd" : "#2563eb", color: "#fff", cursor: savingLayout ? "default" : "pointer", fontWeight: 700, fontSize: "0.9rem" }}>
                  {savingLayout ? "Saving…" : "💾  Save Field Layout"}
                </button>
              </div>
            </div>
          )}

          {!selectedTypeId && types.length > 0 && (
            <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px dashed #e2e8f0" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "10px" }}>👆</div>
              <p style={{ margin: 0, fontWeight: 600 }}>Select an asset type above to configure its field layout.</p>
              <p style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>Or go to the Asset Types tab and click "Fields" next to any type.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Module-scope UI helpers for AdminLocationsSection ─────────── */
function EmpLocBtn({ onClick, children, style = {} }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer",
        background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "13px",
        display: "inline-flex", alignItems: "center", gap: "6px", ...style }}>
      {children}
    </button>
  );
}
function EmpLocDelBtn({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
        background: "#fef2f2", color: "#dc2626", fontSize: "11px", fontWeight: 600 }}>
      Delete
    </button>
  );
}
function EmpLocEditBtn({ onClick }) {
  return (
    <button type="button" onClick={onClick}
      style={{ padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
        background: "#eff6ff", color: "#2563eb", fontSize: "11px", fontWeight: 600 }}>
      Edit
    </button>
  );
}
function EmpLocInp({ label, name, value, onChange, placeholder = "", required = false, type = "text" }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <input name={name} type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ width: "100%", padding: "8px 12px", borderRadius: "7px", border: "1px solid #e2e8f0",
          fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}
function EmpLocSel({ label, name, value, onChange, options = [], required = false, placeholder = "Select…" }) {
  const listId = `emp-loc-sel-${name}`;
  const selected = options.find((o) => String(o.value) === String(value ?? ""));
  const [search, setSearch] = useState(selected?.label || "");

  useEffect(() => {
    const next = options.find((o) => String(o.value) === String(value ?? ""));
    setSearch(next?.label || "");
  }, [value, options]);

  const handleSearch = (e) => {
    const typed = e.target.value;
    setSearch(typed);
    const match = options.find((o) => o.label === typed);
    const nextValue = match ? String(match.value) : "";
    onChange?.({ target: { name, value: nextValue } });
  };

  return (
    <div style={{ marginBottom: "12px" }}>
      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      <input
        list={listId}
        name={`${name}Label`}
        value={search}
        onChange={handleSearch}
        required={required}
        placeholder={placeholder}
        style={{ width: "100%", padding: "8px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box", background: "#fff" }}
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o.value} value={o.label} />)}
      </datalist>
    </div>
  );
}
function EmpLocTreeNode({ node }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: "4px" }}>
      <div onClick={() => setOpen(p => !p)}
        style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "6px",
          cursor: "pointer", background: "#f8fafc", fontWeight: 600, fontSize: "13px" }}>
        <span style={{ fontSize: "10px", color: "#94a3b8" }}>{open ? "▼" : "▶"}</span>
        🏢 {node.buildingName}
        <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto" }}>{node.buildingCode || ""}</span>
      </div>
      {open && node.floors?.map((f, fi) => (
        <div key={fi} style={{ marginLeft: "20px" }}>
          <div onClick={() => {}}
            style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 10px", borderRadius: "6px",
              background: "#f1f5f9", fontSize: "12px", fontWeight: 600, marginBottom: "2px" }}>
            🏗️ {f.floorName}
            <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto" }}>{f.floorCode || ""}</span>
          </div>
          {f.rooms?.map((r, ri) => (
            <div key={ri} style={{ marginLeft: "20px", display: "flex", alignItems: "center", gap: "6px",
              padding: "4px 10px", fontSize: "12px", color: "#475569" }}>
              🚪 {r.roomName}
              <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto" }}>{r.roomCode || ""}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ─── AdminLocationsSection ──────────────────────────────────────── */
function AdminLocationsSection({ token, companies = [] }) {
  const [companyId, setCompanyId] = useState(() => companies[0]?.id ? String(companies[0].id) : "");
  const [tab, setTab] = useState("buildings");
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [buildings, setBuildings] = useState([]);
  const [floors, setFloors] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterBld, setFilterBld] = useState("");
  const [filterFlr, setFilterFlr] = useState("");
  const [bldFloors, setBldFloors] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [importingLocations, setImportingLocations] = useState(false);
  const locationImportInputRef = useRef(null);

  const API = "/api/locations";
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const flash = (text, type = "success") => { setMsg({ text, type }); setTimeout(() => setMsg({ text: "", type: "" }), 3500); };

  const loadTree = async (cId) => { if (!cId) return; setLoading(true); try { const r = await fetch(`${API}/hierarchy?companyId=${cId}`, { headers: H }); const d = await r.json(); setTree(Array.isArray(d) ? d : []); } catch { setTree([]); } finally { setLoading(false); } };
  const loadBuildings = async (cId) => { if (!cId) return; try { const r = await fetch(`${API}/buildings?companyId=${cId}`, { headers: H }); const d = await r.json(); setBuildings(Array.isArray(d) ? d : []); } catch { setBuildings([]); } };
  const loadFloors = async (bId) => { if (!bId && !companyId) { setFloors([]); return; } const q = bId ? `buildingId=${bId}` : `companyId=${companyId}`; try { const r = await fetch(`${API}/floors?${q}`, { headers: H }); const d = await r.json(); setFloors(Array.isArray(d) ? d : []); } catch { setFloors([]); } };
  const loadRooms = async ({ floorId, buildingId } = {}) => {
    if (!floorId && !buildingId && !companyId) { setRooms([]); return; }
    const q = floorId ? `floorId=${floorId}` : (buildingId ? `buildingId=${buildingId}` : `companyId=${companyId}`);
    try { const r = await fetch(`${API}/rooms?${q}`, { headers: H }); const d = await r.json(); setRooms(Array.isArray(d) ? d : []); } catch { setRooms([]); }
  };

  useEffect(() => {
    if (!companyId) { setBuildings([]); setFloors([]); setRooms([]); setTree([]); return; }
    loadBuildings(companyId);
    setFilterBld(""); setFilterFlr("");
    setFloors([]); setRooms([]);
  }, [companyId]);

  useEffect(() => { loadFloors(filterBld); setFilterFlr(""); setRooms([]); }, [filterBld]);
  useEffect(() => {
    if (tab === "rooms") {
      loadRooms({ buildingId: filterBld });
      return;
    }
    loadRooms({ floorId: filterFlr });
  }, [tab, filterBld, filterFlr]);

  useEffect(() => {
    if (!modal) return;
    if (modal.type === "floor" || modal.type === "room") {
      if (form.buildingId) {
        fetch(`${API}/floors?buildingId=${form.buildingId}`, { headers: H })
          .then((r) => r.json())
          .then((d) => setBldFloors(Array.isArray(d) ? d : []))
          .catch(() => setBldFloors([]));
      }
    }
  }, [modal?.type, form.buildingId]);

  const openModal = (type, mode = "add", data = {}) => {
    const defaults = {
      building: { buildingCode: "", buildingName: "", description: "" },
      floor: { buildingId: filterBld || "", floorCode: "", floorName: "", floorNumber: "" },
      room: { buildingId: filterBld || "", floorId: filterFlr || "", roomCode: "", roomName: "", roomType: "", capacity: "" },
    };
    setForm(mode === "edit" ? { ...data } : { ...defaults[type] });
    setModal({ type, mode, data });
    setBldFloors([]);
  };
  const closeModal = () => { setModal(null); setForm({}); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { type, mode } = modal;
      let url = `${API}/${type}s`;
      let body = { ...form };
      if (type === "building") body.companyId = companyId;
      const method = mode === "edit" ? "PUT" : "POST";
      if (mode === "edit") url += `/${form.id}`;
      const r = await fetch(url, { method, headers: H, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) { flash(d.message || "Error saving", "error"); return; }
      flash(`${type.charAt(0).toUpperCase() + type.slice(1)} ${mode === "edit" ? "updated" : "created"}!`);
      closeModal();
      if (type === "building") { loadBuildings(companyId); }
      if (type === "floor") { loadFloors(form.buildingId || filterBld); }
      if (type === "room") { loadRooms({ floorId: form.floorId || filterFlr, buildingId: form.buildingId || filterBld }); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm(`Delete this ${type}?`)) return;
    const r = await fetch(`${API}/${type}s/${id}`, { method: "DELETE", headers: H });
    if (r.ok) { flash(`${type} deleted`); if (type === "building") loadBuildings(companyId); if (type === "floor") loadFloors(filterBld); if (type === "room") loadRooms({ floorId: filterFlr, buildingId: filterBld }); }
    else { const d = await r.json(); flash(d.message || "Delete failed", "error"); }
  };

  const downloadTemplate = async () => {
    try {
      const r = await fetch(`${API}/import/template`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("Template download failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "location-import-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      flash(err.message || "Template download failed", "error");
    }
  };

  const importLocations = async (file) => {
    if (!file || !companyId) return;
    setImportingLocations(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("companyId", companyId);
      const r = await fetch(`${API}/import`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.message || "Import failed");
      flash(`Imported locations: Buildings ${d.createdBuildings || 0}, Floors ${d.createdFloors || 0}, Rooms ${d.createdRooms || 0}${d.skipped ? `, Skipped ${d.skipped}` : ""}`);
      loadBuildings(companyId);
      if (filterBld) loadFloors(filterBld);
      if (filterFlr || filterBld) loadRooms({ floorId: filterFlr, buildingId: filterBld });
    } catch (err) {
      flash(err.message || "Import failed", "error");
    } finally {
      setImportingLocations(false);
      if (locationImportInputRef.current) locationImportInputRef.current.value = "";
    }
  };

  const tabBtn = (key) => ({ padding: "7px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600, background: tab === key ? "#2563eb" : "#f1f5f9", color: tab === key ? "#fff" : "#475569" });

  const renderTable = (rows, type, cols) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    return (
    <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
      {safeRows.length === 0
        ? <p style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No {type}s found.</p>
        : <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead><tr style={{ background: "#f8fafc" }}>{cols.map(c => <th key={c.key} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{c.label}</th>)}<th style={{ padding: "10px 14px", color: "#64748b", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Actions</th></tr></thead>
            <tbody>{safeRows.map((row, i) => <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>{cols.map(c => <td key={c.key} style={{ padding: "10px 14px", color: "#374151" }}>{row[c.key] ?? "—"}</td>)}<td style={{ padding: "10px 14px", display: "flex", gap: "6px" }}><EmpLocEditBtn onClick={() => openModal(type, "edit", row)} /><EmpLocDelBtn onClick={() => handleDelete(type, row.id)} /></td></tr>)}</tbody>
          </table></div>
      }
    </div>
    );
  };

  return (
    <div>
      {msg.text && <div style={{ marginBottom: "12px", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: msg.type === "error" ? "#fef2f2" : "#f0fdf4", color: msg.type === "error" ? "#dc2626" : "#16a34a", border: `1px solid ${msg.type === "error" ? "#fecaca" : "#bbf7d0"}` }}>{msg.text}</div>}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "2px" }}>Location Management</h1>
        <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Register locations: Building → Floor → Room. Departments are managed separately.</p>
      </div>
      {!companyId ? (
        <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>🏢</div>
          <div style={{ fontWeight: 700 }}>No company available</div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button style={tabBtn("buildings")} onClick={() => setTab("buildings")}>🏢 Buildings</button>
              <button style={tabBtn("floors")} onClick={() => setTab("floors")}>📐 Floors</button>
              <button style={tabBtn("rooms")} onClick={() => setTab("rooms")}>🚪 Rooms</button>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={downloadTemplate} style={{ padding: "7px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Download Template</button>
              <button onClick={() => locationImportInputRef.current?.click()} disabled={importingLocations}
                style={{ padding: "7px 12px", borderRadius: "7px", border: "none", background: "#2563eb", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: importingLocations ? "not-allowed" : "pointer", opacity: importingLocations ? 0.7 : 1 }}>
                {importingLocations ? "Importing..." : "Import Excel"}
              </button>
              <input
                ref={locationImportInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: "none" }}
                onChange={(e) => importLocations(e.target.files?.[0])}
              />
            </div>
          </div>
          {tab === "buildings" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>Buildings ({buildings.length})</h2>
                <EmpLocBtn onClick={() => openModal("building")}>+ Add Building</EmpLocBtn>
              </div>
              {renderTable(buildings, "building", [{ key: "buildingName", label: "Building Name" }, { key: "description", label: "Description" }, { key: "status", label: "Status" }])}
            </div>
          )}
          {tab === "floors" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>Floors</h2>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <select value={filterBld} onChange={e => setFilterBld(e.target.value)} style={{ padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff" }}>
                    <option value="">All Buildings</option>
                    {buildings.map(b => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
                  </select>
                  <EmpLocBtn onClick={() => openModal("floor")}>+ Add Floor</EmpLocBtn>
                </div>
              </div>
              {renderTable(floors, "floor", [{ key: "floorName", label: "Floor Name" }, { key: "floorNumber", label: "Floor No." }, { key: "buildingName", label: "Building" }, { key: "status", label: "Status" }])}
            </div>
          )}
          {tab === "rooms" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>Rooms</h2>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <select value={filterBld} onChange={e => setFilterBld(e.target.value)} style={{ padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff" }}><option value="">All Buildings</option>{buildings.map(b => <option key={b.id} value={b.id}>{b.buildingName}</option>)}</select>
                  <EmpLocBtn onClick={() => openModal("room")}>+ Add Room</EmpLocBtn>
                </div>
              </div>
              {renderTable(rooms, "room", [{ key: "roomName", label: "Room Name" }, { key: "roomType", label: "Type" }, { key: "capacity", label: "Capacity" }, { key: "floorName", label: "Floor" }, { key: "status", label: "Status" }])}
            </div>
          )}
        </>
      )}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={closeModal}>
          <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: 0 }}>{modal.mode === "edit" ? "Edit" : "Add"} {modal.type.charAt(0).toUpperCase() + modal.type.slice(1)}</h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px" }}>×</button>
            </div>
            {modal.type === "building" && (<><EmpLocInp label="Building Name" name="buildingName" value={form.buildingName} onChange={e => setForm(p => ({ ...p, buildingName: e.target.value }))} required /><EmpLocInp label="Description" name="description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />{modal.mode === "edit" && <EmpLocSel label="Status" name="status" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />}</>)}
            {modal.type === "floor" && (<><EmpLocSel label="Building" name="buildingId" value={form.buildingId} onChange={e => setForm(p => ({ ...p, buildingId: e.target.value }))} required options={buildings.map(b => ({ value: b.id, label: b.buildingName }))} /><EmpLocInp label="Floor Name" name="floorName" value={form.floorName} onChange={e => setForm(p => ({ ...p, floorName: e.target.value }))} required /><EmpLocInp label="Floor Number" name="floorNumber" value={form.floorNumber} onChange={e => setForm(p => ({ ...p, floorNumber: e.target.value }))} type="number" />{modal.mode === "edit" && <EmpLocSel label="Status" name="status" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />}</>)}
            {modal.type === "room" && (<><EmpLocSel label="Building" name="buildingId" value={form.buildingId} onChange={async e => { const bid = e.target.value; setForm(p => ({ ...p, buildingId: bid, floorId: "" })); const r = await fetch(`${API}/floors?buildingId=${bid}`, { headers: H }); setBldFloors(await r.json()); }} required options={buildings.map(b => ({ value: b.id, label: b.buildingName }))} /><EmpLocSel label="Floor" name="floorId" value={form.floorId} onChange={e => setForm(p => ({ ...p, floorId: e.target.value }))} required options={bldFloors.map(f => ({ value: f.id, label: f.floorName }))} placeholder="Select Floor" /><EmpLocInp label="Room Name" name="roomName" value={form.roomName} onChange={e => setForm(p => ({ ...p, roomName: e.target.value }))} required /><EmpLocInp label="Room Type" name="roomType" value={form.roomType} onChange={e => setForm(p => ({ ...p, roomType: e.target.value }))} placeholder="e.g. Ward, OT, ICU" /><EmpLocInp label="Capacity" name="capacity" value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} type="number" />{modal.mode === "edit" && <EmpLocSel label="Status" name="status" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />}</>)}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button onClick={closeModal} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "14px" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "14px", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : (modal.mode === "edit" ? "Update" : "Create")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sidebar Navigation Definition ─────────────────────────────── */
const NAV_ALL = [
  { key: "dashboard",   label: "Dashboard",   roles: ["admin","supervisor","*"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> },
  { key: "locations",   label: "Locations",   roles: ["admin"],                  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> },
  { key: "departments", label: "Departments", roles: ["admin"],                  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  { key: "assets",      label: "Assets",      roles: ["admin","supervisor","*"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg> },
  { key: "requests",    label: "Requests",    roles: ["admin","supervisor","*"], icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
  { key: "employees",   label: "Employees",   roles: ["admin","supervisor"],     icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
  { key: "qrcodes",     label: "QR Codes",    roles: ["admin","supervisor"],     icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="19" y="19" width="2" height="2"/><rect x="17" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/></svg> },
  { key: "settings",    label: "Settings",    roles: ["admin"],                  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
];

const getNav = (role) => NAV_ALL.filter((n) => n.roles.includes(role) || n.roles.includes("*"));

/* ─── Status Master Section ──────────────────────────────────────── */
function StatusMasterSection({ token }) {
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", color: "#2563eb" });
  const [msg, setMsg] = useState("");
  const base = `${getApiBaseUrl()}`;

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${base}/api/company-portal/asset-statuses`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setStatuses(Array.isArray(d) ? d : []);
    } catch { setStatuses([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token]);

  const handleSave = async () => {
    if (!form.name.trim()) return setMsg("Status name is required");
    setSaving(true);
    try {
      const url = editId ? `${base}/api/company-portal/asset-statuses/${editId}` : `${base}/api/company-portal/asset-statuses`;
      const method = editId ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message || "Save failed"); }
      setMsg(editId ? "Updated!" : "Status added!");
      setForm({ name: "", color: "#2563eb" }); setEditId(null); load();
    } catch (e) { setMsg(e.message); } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this status?")) return;
    try {
      await fetch(`${base}/api/company-portal/asset-statuses/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setMsg("Deleted"); load();
    } catch { setMsg("Delete failed"); }
  };

  const PRESET_COLORS = ["#2563eb","#dc2626","#16a34a","#ca8a04","#7c3aed","#ea580c","#0891b2","#475569","#be185d"];

  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "24px", marginTop: "20px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "18px" }}>
        <div style={{ width: "40px", height: "40px", background: "#faf5ff", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Status Master</h2>
          <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>Manage custom asset working statuses for this company</p>
        </div>
      </div>

      {msg && <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "13px", color: "#16a34a", marginBottom: "14px" }}>{msg} <button onClick={() => setMsg("")} style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}>×</button></div>}

      {/* Add / Edit form */}
      <div style={{ display: "flex", gap: "10px", alignItems: "flex-end", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "180px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Status Name *</label>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Under Maintenance" style={{ width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Color</label>
          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            {PRESET_COLORS.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, color: c }))}
                style={{ width: "24px", height: "24px", borderRadius: "50%", background: c, border: form.color === c ? "3px solid #0f172a" : "2px solid transparent", cursor: "pointer", flexShrink: 0 }} />
            ))}
            <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} title="Custom color" style={{ width: "28px", height: "28px", borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", background: "none" }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {editId && <button onClick={() => { setEditId(null); setForm({ name: "", color: "#2563eb" }); }} style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>}
          <button onClick={handleSave} disabled={saving} style={{ padding: "8px 18px", borderRadius: "8px", border: "none", background: "#7c3aed", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Saving…" : editId ? "Update" : "+ Add Status"}
          </button>
        </div>
      </div>

      {/* Status list */}
      {loading ? <div style={{ color: "#94a3b8", fontSize: "13px", padding: "12px 0" }}>Loading…</div> : statuses.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px", color: "#94a3b8", fontSize: "13px", background: "#f8fafc", borderRadius: "10px", border: "1px dashed #e2e8f0" }}>
          No custom statuses yet. Add one above to override the default list in the mobile app.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {statuses.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "10px", border: "1px solid #f1f5f9", background: "#fafafa" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "50%", background: s.color, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: "14px", fontWeight: 600, color: "#0f172a" }}>{s.name}</span>
              <button onClick={() => { setEditId(s.id); setForm({ name: s.name, color: s.color || "#2563eb" }); }} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#fff", color: "#374151", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Edit</button>
              <button onClick={() => handleDelete(s.id)} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Delete</button>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: "11.5px", color: "#94a3b8", marginTop: "14px", marginBottom: 0 }}>
        These statuses appear in the mobile app when registering assets. If none are configured, the default statuses (Working, Not_Working, WIP…) are used.
      </p>
    </div>
  );
}

/* ─── Main Portal ────────────────────────────────────────────────── */
export default function CompanyEmployeePortal() {
  const navigate = useNavigate();
  const params = useParams();
  const token = sessionStorage.getItem("cp_token");
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("cp_user") || "null"); } catch { return null; }
  });
  const [companyDisplayName, setCompanyDisplayName] = useState(() => currentUser?.companyName || "");
  const [qrCardLabel, setQrCardLabel] = useState(() => currentUser?.companyName || "");
  const [savingQrLabel, setSavingQrLabel] = useState(false);
  const [accessibleCompanies, setAccessibleCompanies] = useState([]); // multi-company list
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [companySwitcherOpen, setCompanySwitcherOpen] = useState(false);
  const [companySwitcherSearch, setCompanySwitcherSearch] = useState("");

  // URL-driven navigation: /company/portal/dashboard — enables browser back/forward
  const [nav, setNavState] = useState(() => {
    const urlNav = params["*"]?.split("/")[0];
    return urlNav || sessionStorage.getItem("cp_nav") || "dashboard";
  });
  const setNav = useCallback((key) => {
    setNavState(key);
    navigate(`/company/portal/${key}`, { replace: false });
  }, [navigate]);
  // Sync nav state with URL when user presses browser back/forward
  useEffect(() => {
    const urlNav = params["*"]?.split("/")[0];
    if (urlNav && urlNav !== nav) setNavState(urlNav);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const [enabledModules, setEnabledModules] = useState(null);
  const hasTruthyPermission = useCallback((permNode) => {
    if (permNode === true) return true;
    if (!permNode || typeof permNode !== "object") return false;
    return Object.values(permNode).some((v) => (typeof v === "object" ? hasTruthyPermission(v) : v === true));
  }, []);

  const canAccessModuleByPermission = useCallback((navKey) => {
    if (currentUser?.role === "admin") return true;
    const rolePerms = currentUser?.permissions;
    if (!rolePerms || typeof rolePerms !== "object") return true;

    const nonEmptyPermKeys = Object.keys(rolePerms).filter((k) => rolePerms[k] !== undefined && rolePerms[k] !== null);
    if (nonEmptyPermKeys.length === 0) return true;

    const keyMap = {
      dashboard: ["dashboard"],
      locations: ["locations"],
      departments: ["departments"],
      assets: ["assets"],
      requests: ["requests", "workorders", "work_orders", "workOrders"],
      employees: ["employees", "users", "team"],
      qrcodes: ["qrcodes", "qr", "qrcode", "qrCodes"],
      settings: ["settings"],
      warnings: ["warnings"],
      checklists: ["checklists"],
      logsheets: ["logsheets"],
      mytasks: ["mytasks", "tasks"],
      ojt: ["ojt"],
      shifts: ["shifts"],
    };

    const candidates = keyMap[navKey] || [navKey];
    const hit = candidates.find((k) => Object.prototype.hasOwnProperty.call(rolePerms, k));
    if (!hit) return false;
    return hasTruthyPermission(rolePerms[hit]);
  }, [currentUser?.permissions, currentUser?.role, hasTruthyPermission]);

  const visibleNav = useMemo(() => {
    const normalizeModuleKey = (value) => {
      const key = String(value || "").trim().toLowerCase();
      if (!key) return "";
      if (["workorders", "work-order", "work_orders", "work order"].includes(key)) return "requests";
      if (["qr", "qrcode", "qr-code", "qr_codes", "qr code"].includes(key)) return "qrcodes";
      return key;
    };
    const base = getNav(currentUser?.role || "employee");
    const enabledSet = Array.isArray(enabledModules)
      ? new Set(enabledModules.map(normalizeModuleKey).filter(Boolean))
      : null;
    const ALWAYS_VISIBLE = new Set(["dashboard"]);

    const byCompany = !enabledSet
      ? base
      : base.filter((n) => ALWAYS_VISIBLE.has(n.key) || enabledSet.has(n.key));

    return byCompany.filter((n) => ALWAYS_VISIBLE.has(n.key) || canAccessModuleByPermission(n.key));
  }, [enabledModules, currentUser?.role, canAccessModuleByPermission]);
  const [dashboard, setDashboard] = useState(null);

  // ── Alert sound / toast / bell notification state ───────────────
  const [warnOpenCount, setWarnOpenCount] = useState(0);
  const [bellOpen,      setBellOpen]      = useState(false);
  const [bellRinging,   setBellRinging]   = useState(false);
  const [recentAlerts,  setRecentAlerts]  = useState([]);
  const [toasts,        setToasts]        = useState([]);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const prevWarnCount   = useRef(0);
  const toastId         = useRef(0);
  const prevWOCount     = useRef(null);   // null = not yet initialised (suppress first-load sound)
  const prevAssignCount = useRef(null);   // null = not yet initialised

  // Modular alert sound hook — single shared AudioContext, throttled, localStorage preference
  const {
    play: playAlertSound,
    preview: previewAlertSound,
    enabled: soundEnabled,
    toggle: toggleSound,
    volume: alarmVolume,
    updateVolume: updateAlarmVolume,
    severityConfig: alarmSevConfig,
    updateSeverityConfig: updateAlarmSevConfig,
  } = useAlertSound();

  const [alarmSettingsOpen, setAlarmSettingsOpen] = useState(false);

  /** Trigger bell ring animation (auto-clears after 650 ms). */
  const ringBell = useCallback(() => {
    setBellRinging(true);
    setTimeout(() => setBellRinging(false), 650);
  }, []);

  const pushToast = useCallback((text, severity = "high") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, severity }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  }, []);

  // Persist active tab so page refresh returns to the same section
  useEffect(() => { sessionStorage.setItem("cp_nav", nav); }, [nav]);
  const [chartStats, setChartStats] = useState(null);
  const [chartFilter, setChartFilter] = useState("month"); // day|week|month|year
  const [chartCustomStart, setChartCustomStart] = useState("");
  const [chartCustomEnd, setChartCustomEnd] = useState("");
  const [chartError, setChartError] = useState(null);
  const [recentEntries, setRecentEntries] = useState([]);
  const [recentEntriesLoading, setRecentEntriesLoading] = useState(false);
  const [recentChecklists, setRecentChecklists] = useState([]);
  const [recentChecklistsLoading, setRecentChecklistsLoading] = useState(false);
  const [dashboardRecentTab, setDashboardRecentTab] = useState("logsheets");
  const [logsheetShowAll, setLogsheetShowAll] = useState(false);
  const [checklistShowAll, setChecklistShowAll] = useState(false);
  // Dashboard quick-view: latest alerts + work orders (admin only)
  const [dashboardAlerts, setDashboardAlerts]           = useState([]);
  const [dashboardAlertsLoading, setDashboardAlertsLoading] = useState(false);
  const [dashboardWorkOrders, setDashboardWorkOrders]   = useState([]);
  const [dashboardWOLoading, setDashboardWOLoading]     = useState(false);
  const [dashboardWOUsers, setDashboardWOUsers]         = useState([]);
  const [dashWOAssign, setDashWOAssign]                 = useState(null);
  const [dashWOAssignUser, setDashWOAssignUser]         = useState("");
  const [dashWOAssignNote, setDashWOAssignNote]         = useState("");
  const [dashWOAssignSaving, setDashWOAssignSaving]     = useState(false);
  const [dashWOAssignErr, setDashWOAssignErr]           = useState(null);
  // Dashboard soft requests (visible to all roles that can raise soft requests)
  const [dashboardSoftRequests, setDashboardSoftRequests] = useState([]);
  const [dashboardSoftLoading, setDashboardSoftLoading]   = useState(false);
  const [departments, setDepartments] = useState([]);
  const [assetTypesList, setAssetTypesList] = useState([]);
  const [assets, setAssets] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [supervisors, setSupervisors] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [showRolesModal, setShowRolesModal] = useState(false);
  const [roleRefreshKey, setRoleRefreshKey] = useState(0);
  const [assignments, setAssignments] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [activeShifts, setActiveShifts] = useState([]);
  const [shiftSearch, setShiftSearch] = useState("");
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [editShift, setEditShift] = useState(null);
  const [expandedShiftId, setExpandedShiftId] = useState(null);
  const [shiftEmployees, setShiftEmployees] = useState({});
  const [shiftEmpError, setShiftEmpError] = useState({});
  const [addEmpInput, setAddEmpInput] = useState({});
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftForm, setShiftForm] = useState({ name: "", startTime: "", endTime: "", description: "", status: "active" });
  const [shiftFormError, setShiftFormError] = useState(null);
  const [directFillLogsheet, setDirectFillLogsheet] = useState(null);
  const [logsheetTemplatesList, setLogsheetTemplatesList] = useState([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardTarget, setForwardTarget] = useState(null); // an assignment object to forward
  const [empView, setEmpView] = useState("hierarchy"); // "hierarchy" | "list"
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [empSearch, setEmpSearch] = useState("");
  const [empRoleFilter, setEmpRoleFilter] = useState("");
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("");
  const [assetStatusFilter, setAssetStatusFilter] = useState("");
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);
  const [advFilterDept, setAdvFilterDept] = useState("");
  const [advFilterBuilding, setAdvFilterBuilding] = useState("");
  const [advFilterCategory, setAdvFilterCategory] = useState("");
  const [advFilterMaint, setAdvFilterMaint] = useState("");
  const [advFilterRber, setAdvFilterRber] = useState("");
  const [advFilterDateFrom, setAdvFilterDateFrom] = useState("");
  const [advFilterDateTo, setAdvFilterDateTo] = useState("");
  const [deptSearch, setDeptSearch] = useState("");
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editDept, setEditDept] = useState(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  // Bulk asset import
  const [showBulkAssetImport, setShowBulkAssetImport] = useState(false);
  const [bulkAssetFile, setBulkAssetFile] = useState(null);
  const [bulkAssetDeptId, setBulkAssetDeptId] = useState("");
  const [bulkAssetImporting, setBulkAssetImporting] = useState(false);
  const [bulkAssetResult, setBulkAssetResult] = useState(null);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [editChecklist, setEditChecklist] = useState(null);
  const [checklistSubNav, setChecklistSubNav] = useState("templates");
  const [logsheetSubNav, setLogsheetSubNav] = useState("templates");
  const [assetSubNav, setAssetSubNav] = useState("manage");
  const [dashboardSubNav, setDashboardSubNav] = useState("healthcare");
  // OJT State
  const [ojtTrainings, setOjtTrainings] = useState([]);
  const [ojtSubNav, setOjtSubNav] = useState("trainings");
  const [showOjtModal, setShowOjtModal] = useState(false);
  const [editOjt, setEditOjt] = useState(null);
  const [viewingOjtTraining, setViewingOjtTraining] = useState(null);
  const [showOjtBuilder, setShowOjtBuilder] = useState(false);
  const [buildingOjtTrainingId, setBuildingOjtTrainingId] = useState(null);
  const [ojtPreviewTraining, setOjtPreviewTraining] = useState(null);
  const [ojtQrTraining, setOjtQrTraining] = useState(null);
  const [ojtQrDataUrl, setOjtQrDataUrl] = useState("");
  const [assetViewQrModal, setAssetViewQrModal] = useState(null);   // asset for QR card view
  const [assetViewQrCardHtml, setAssetViewQrCardHtml] = useState(null);
  const [viewRawQrDataUrl, setViewRawQrDataUrl] = useState(null);  // raw QR PNG for download
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [companySectors, setCompanySectors] = useState([]);
  const [selectedQrIds, setSelectedQrIds] = useState(new Set());
  const [bulkQrPrinting, setBulkQrPrinting] = useState(false);
  const [cachedLogoDataUrls, setCachedLogoDataUrls] = useState({ catalyst: null, client: null });
  // Asset queries / requests
  const [assetQueries, setAssetQueries] = useState([]);
  const [assetQueriesLoading, setAssetQueriesLoading] = useState(false);
  const [requestSearch, setRequestSearch] = useState("");
  // Asset detail view
  const [assetDetailModal, setAssetDetailModal] = useState(null); // asset object or null
  const [assetDetailTab, setAssetDetailTab] = useState("overview");
  const [assetDetailCallLogs, setAssetDetailCallLogs] = useState(null);
  const [assetDetailCalibration, setAssetDetailCalibration] = useState(null);

  // Eagerly load call logs when asset detail modal opens (needed for MTBF/MTTR in overview)
  useEffect(() => {
    if (!assetDetailModal) { setAssetDetailCallLogs(null); setAssetDetailCalibration(null); return; }
    const id = assetDetailModal.id;
    if (!id || !token) return;
    fetch(`${getApiBaseUrl()}/api/company-portal/work-orders?assetId=${id}&limit=200`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setAssetDetailCallLogs(Array.isArray(d?.data) ? d.data : []))
      .catch(() => setAssetDetailCallLogs([]));
  }, [assetDetailModal?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Pre-generated QR codes
  const [preQrCodes, setPreQrCodes] = useState([]);
  const [preQrLoading, setPreQrLoading] = useState(false);
  const [preQrGenerating, setPreQrGenerating] = useState(false);
  const [preQrCount, setPreQrCount] = useState(0);
  const [preQrLinkModal, setPreQrLinkModal] = useState(null);
  const [viewQrCardHtml, setViewQrCardHtml] = useState(null);
  const [preQrRegisterModal, setPreQrRegisterModal] = useState(null);
  const qrStopRef = useRef(false);
  const [qrAlert, setQrAlert] = useState(null);
  const [selectedPreQrIds, setSelectedPreQrIds] = useState(new Set());
  const [qrFilter, setQrFilter] = useState("all");
  const [qrSearch, setQrSearch] = useState("");
  const [expandedQueryId, setExpandedQueryId] = useState(null); // expanded request card
  // Fleet State
  const [fleetAssets, setFleetAssets] = useState([]);
  const [fleetInspections, setFleetInspections] = useState([]);
  const [fleetFuelLogs, setFleetFuelLogs] = useState([]);
  const [fleetMaintenance, setFleetMaintenance] = useState([]);
  const [fleetSubNav, setFleetSubNav] = useState("assets");
  const [fleetDetailTab, setFleetDetailTab] = useState("fuel");
  const [fleetHistory, setFleetHistory] = useState([]);
  const [fleetSubmissionDetail, setFleetSubmissionDetail] = useState(null);
  const [fleetSubmissionDetailLoading, setFleetSubmissionDetailLoading] = useState(false);
  const [assignFleetLogsheet, setAssignFleetLogsheet] = useState(null);
  const [assignFleetChecklist, setAssignFleetChecklist] = useState(null);
  const [settingsPublicToken, setSettingsPublicToken] = useState(null);
  const [settingsCopied, setSettingsCopied] = useState(false);
  const [settingsRegen, setSettingsRegen] = useState(false);
  const [showFleetAssetModal, setShowFleetAssetModal] = useState(false);
  const [editFleetAsset, setEditFleetAsset] = useState(null);
  const [viewingFleetAsset, setViewingFleetAsset] = useState(null);
  const [showFleetInspectionModal, setShowFleetInspectionModal] = useState(false);
  const [editFleetInspection, setEditFleetInspection] = useState(null);
  const [showFleetFuelModal, setShowFleetFuelModal] = useState(false);
  const [editFleetFuel, setEditFleetFuel] = useState(null);
  const [showFleetMaintModal, setShowFleetMaintModal] = useState(false);
  const [editFleetMaint, setEditFleetMaint] = useState(null);

  useEffect(() => {
    if (!token || !currentUser) {
      navigate("/company");
    }
  }, [token, currentUser, navigate]);

  const load = useCallback(async (key, fn) => {
    setLoading((p) => ({ ...p, [key]: true }));
    setErrors((p) => ({ ...p, [key]: null }));
    try {
      const data = await fn();
      return data;
    } catch (err) {
      setErrors((p) => ({ ...p, [key]: err.message }));
      return null;
    } finally {
      setLoading((p) => ({ ...p, [key]: false }));
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    load("dashboard", () => getCompanyPortalDashboard(token)).then((d) => d && setDashboard(d));
    getCompanyPortalMe(token).then((me) => {
      // Always update enabledModules (null means no restriction = show all)
      setEnabledModules(Array.isArray(me?.enabledModules) ? me.enabledModules : null);
      if (me?.logoUrl) setCompanyLogoUrl(me.logoUrl);
      if (Array.isArray(me?.sectors)) setCompanySectors(me.sectors);
      if (me?.companyName) setCompanyDisplayName(me.companyName);
      setQrCardLabel(me?.qrCardLabel || me?.companyName || "");
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const merged = {
          ...prev,
          companyName: me?.companyName || prev.companyName,
          permissions: me?.permissions && typeof me.permissions === "object" ? me.permissions : prev.permissions,
          moduleAccess: Array.isArray(me?.moduleAccess) ? me.moduleAccess : prev.moduleAccess,
        };
        sessionStorage.setItem("cp_user", JSON.stringify(merged));
        return merged;
      });
    }).catch(() => {});
    // Load all companies this user has access to (for company switcher)
    fetch(`/api/company-auth/my-companies`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.companies?.length > 1) setAccessibleCompanies(d.companies); })
      .catch(() => {});
    setRecentEntriesLoading(true);
    getCompanyPortalRecentLogsheetEntries(token)
      .then((d) => d && setRecentEntries(d))
      .catch(() => {})
      .finally(() => setRecentEntriesLoading(false));
    setRecentChecklistsLoading(true);
    getCompanyPortalRecentChecklistSubmissions(token)
      .then((d) => d && setRecentChecklists(d))
      .catch(() => {})
      .finally(() => setRecentChecklistsLoading(false));
    // Preload role-specific data on login so dashboard is immediately useful
    if (currentUser?.role === "admin") {
      // Admin: preload departments and employees; assets load lazily when needed
      getCompanyPortalDepartments(token).then((d) => d && setDepartments(d)).catch(() => {});
      getCompanyPortalEmployees(token).then((d) => d && setEmployees(d)).catch(() => {});
      // Load dynamic asset types for Add Asset modal
      getCompanyPortalAssetTypes(token).then(d => d && setAssetTypesList(d)).catch(() => {}); 
      getTemplateUserAssignments(token).then((d) => d && setAssignments(d)).catch(() => {});
      getShifts(token).then((d) => d && setShifts(d)).catch(() => {});
      getActiveShifts(token).then((d) => d && setActiveShifts(d)).catch(() => {});
      // Dashboard quick-view: latest open alerts + open work orders
      setDashboardAlertsLoading(true);
      getCompanyPortalAdminFlags(token, "status=open&limit=5")
        .then((d) => d && setDashboardAlerts(d.data ?? []))
        .catch(() => {})
        .finally(() => setDashboardAlertsLoading(false));
      setDashboardWOLoading(true);
      Promise.all([
        getCompanyPortalWorkOrders(token, "status=open&limit=5"),
        getCompanyPortalWOUsers(token),
      ])
        .then(([woRes, usersRes]) => {
          setDashboardWorkOrders(woRes?.data ?? []);
          setDashboardWOUsers(usersRes ?? []);
        })
        .catch(() => {})
        .finally(() => setDashboardWOLoading(false));
    } else if (currentUser?.role === "supervisor") {
      getMyTemplateAssignments(token).then((d) => d && setMyAssignments(d)).catch(() => {});
      getTemplateUserAssignments(token).then((d) => d && setAssignments(d)).catch(() => {});
      getCompanyPortalEmployees(token).then((d) => d && setEmployees(d)).catch(() => {});
      getCompanyPortalDepartments(token).then((d) => d && setDepartments(d)).catch(() => {});
      // Assets load lazily when needed
      getCompanyPortalAssetTypes(token).then(d => d && setAssetTypesList(d)).catch(() => {});
      // Load soft requests raised by this supervisor
      setDashboardSoftLoading(true);
      getSoftServiceRequestsMy(token, "status=open")
        .then((d) => setDashboardSoftRequests(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setDashboardSoftLoading(false));
    } else {
      // Employee: preload assigned tasks for dashboard stat card
      getMyTemplateAssignments(token).then((d) => d && setMyAssignments(d)).catch(() => {});
    }
  }, [token, load]);

  // Pre-cache logo data URLs so QR print functions are instant
  useEffect(() => {
    let cancelled = false;
    const prefetch = async () => {
      const catalystUrl = `${window.location.origin}/catalyst-logo.png`;
      const clientUrl = companyLogoUrl
        ? `${window.location.origin}${companyLogoUrl.startsWith("/") ? "" : "/"}${companyLogoUrl}`
        : null;
      const toDataUrl = async (url) => {
        if (!url) return null;
        try {
          const resp = await fetch(url);
          if (!resp.ok) return null;
          const blob = await resp.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          });
        } catch { return null; }
      };
      const [catalyst, client] = await Promise.all([toDataUrl(catalystUrl), toDataUrl(clientUrl)]);
      if (!cancelled) setCachedLogoDataUrls({ catalyst, client });
    };
    prefetch();
    return () => { cancelled = true; };
  }, [companyLogoUrl]);

  useEffect(() => {
    if (!token || currentUser?.role !== "admin") return;
    setChartStats(null);
    setChartError(null);
    const params = chartCustomStart && chartCustomEnd
      ? { period: "custom", startDate: chartCustomStart, endDate: chartCustomEnd }
      : { period: chartFilter };
    getCompanyPortalChartStats(token, params)
      .then((d) => { if (d) { setChartStats(d); setChartError(null); } })
      .catch((e) => { setChartError(e?.message || "Failed to load chart data"); setChartStats(null); });
  }, [token, chartFilter, chartCustomStart, chartCustomEnd]);

  // Re-fetch dashboard data whenever the user navigates back to the dashboard tab
  // (ensures newly submitted logsheets/checklists appear without a full page reload)
  useEffect(() => {
    if (!token || nav !== "dashboard") return;
    load("dashboard", () => getCompanyPortalDashboard(token)).then((d) => d && setDashboard(d));
    setRecentEntriesLoading(true);
    getCompanyPortalRecentLogsheetEntries(token)
      .then((d) => d && setRecentEntries(d))
      .catch(() => {})
      .finally(() => setRecentEntriesLoading(false));
    setRecentChecklistsLoading(true);
    getCompanyPortalRecentChecklistSubmissions(token)
      .then((d) => d && setRecentChecklists(d))
      .catch(() => {})
      .finally(() => setRecentChecklistsLoading(false));
    // Refresh dashboard quick-view (admin only)
    if (currentUser?.role === "admin") {
      setDashboardAlertsLoading(true);
      getCompanyPortalAdminFlags(token, "status=open&limit=5")
        .then((d) => d && setDashboardAlerts(d.data ?? []))
        .catch(() => {})
        .finally(() => setDashboardAlertsLoading(false));
      setDashboardWOLoading(true);
      Promise.all([
        getCompanyPortalWorkOrders(token, "status=open&limit=5"),
        getCompanyPortalWOUsers(token),
      ])
        .then(([woRes, usersRes]) => {
          setDashboardWorkOrders(woRes?.data ?? []);
          setDashboardWOUsers(usersRes ?? []);
        })
        .catch(() => {})
        .finally(() => setDashboardWOLoading(false));
      // Admin sees all open soft requests
      setDashboardSoftLoading(true);
      getSoftServiceRequestsAll(token, "status=open")
        .then((d) => setDashboardSoftRequests(Array.isArray(d) ? d.slice(0, 5) : []))
        .catch(() => {})
        .finally(() => setDashboardSoftLoading(false));
    } else if (currentUser?.role === "supervisor") {
      // Supervisor sees their own open soft requests
      setDashboardSoftLoading(true);
      getSoftServiceRequestsMy(token, "status=open")
        .then((d) => setDashboardSoftRequests(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setDashboardSoftLoading(false));
    }
  }, [nav, token]);

  // ── Poll for new flags / work orders / assignments every 15 s ───────────
  useEffect(() => {
    if (!token || (currentUser?.role !== "admin" && currentUser?.role !== "supervisor")) return;
    const isAdmin = currentUser?.role === "admin";

    const poll = async () => {
      // 1. Flags (admin + supervisor)
      try {
        const res = await getCompanyPortalAdminFlags(token, "status=open&limit=5");
        if (!res) return;
        const newCount = res.total ?? 0;
        const prev     = prevWarnCount.current;
        prevWarnCount.current = newCount;
        setWarnOpenCount(newCount);
        if (res.data?.length) setRecentAlerts(res.data.slice(0, 5));
        setDashboardAlerts(res.data ?? []);
        if (newCount > prev) {
          const diff   = newCount - prev;
          const newest = res.data?.[0];
          const sev    = newest?.severity || "high";
          const msg    = newest
            ? `${diff} new alert${diff > 1 ? "s" : ""}: ${sev.toUpperCase()} – ${newest.assetName || "unknown asset"}`
            : `${diff} new alert${diff > 1 ? "s" : ""} raised`;
          pushToast(msg, sev);
          playAlertSound(sev);
          ringBell();
        }
      } catch (_) { /* silent */ }

      // 2. Work orders (admin only)
      if (isAdmin) {
        try {
          const woRes = await getCompanyPortalWorkOrders(token, "status=open&limit=5");
          const newWOCount = woRes?.total ?? woRes?.data?.length ?? 0;
          if (prevWOCount.current !== null && newWOCount > prevWOCount.current) {
            const diff = newWOCount - prevWOCount.current;
            pushToast(`${diff} new work order${diff > 1 ? "s" : ""} opened`, "medium");
            playAlertSound("medium");
          }
          prevWOCount.current = newWOCount;
          setDashboardWorkOrders(woRes?.data ?? []);
        } catch (_) { /* silent */ }
      }
    };

    // Initial sync — seed counts without playing sound
    Promise.all([
      getCompanyPortalAdminFlags(token, "status=open&limit=5"),
      isAdmin ? getCompanyPortalWorkOrders(token, "status=open&limit=5") : Promise.resolve(null),
    ]).then(([flagRes, woRes]) => {
      if (flagRes) {
        prevWarnCount.current = flagRes.total ?? 0;
        setWarnOpenCount(flagRes.total ?? 0);
        if (flagRes.data?.length) setRecentAlerts(flagRes.data.slice(0, 5));
        setDashboardAlerts(flagRes.data ?? []);
      }
      if (woRes) {
        prevWOCount.current = woRes?.total ?? woRes?.data?.length ?? 0;
        setDashboardWorkOrders(woRes?.data ?? []);
      }
    }).catch(() => {});

    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [token, currentUser?.role, pushToast, playAlertSound, ringBell]);

  // ── Poll for new checklist/logsheet assignments every 15 s (all roles) ──
  useEffect(() => {
    if (!token) return;
    const pollAssignments = async () => {
      try {
        const data = await getMyTemplateAssignments(token);
        const newCount = Array.isArray(data) ? data.length : 0;
        if (prevAssignCount.current !== null && newCount > prevAssignCount.current) {
          const diff = newCount - prevAssignCount.current;
          pushToast(`${diff} new assignment${diff > 1 ? "s" : ""} received`, "low");
          playAlertSound("low");
        }
        prevAssignCount.current = newCount;
        setMyAssignments(data ?? []);
      } catch (_) { /* silent */ }
    };

    // Seed count on mount
    getMyTemplateAssignments(token).then((data) => {
      prevAssignCount.current = Array.isArray(data) ? data.length : 0;
      setMyAssignments(data ?? []);
    }).catch(() => {});

    const id = setInterval(pollAssignments, 15000);
    return () => clearInterval(id);
  }, [token, pushToast, playAlertSound]);

  useEffect(() => {
    if (!token || nav === "dashboard") return;
    if (nav === "departments") load("departments", () => getCompanyPortalDepartments(token)).then((d) => d && setDepartments(d));
    if (nav === "assets") {
      load("assets", () => getCompanyPortalAssets(token)).then((d) => d && setAssets(d));
      if (!departments.length) getCompanyPortalDepartments(token).then((d) => d && setDepartments(d)).catch(() => {});
      // Load employees for assignment dropdown
      if (!employees.length) getCompanyPortalEmployees(token).then((d) => d && setEmployees(d)).catch(() => {});
      // Load asset queries for the requests sub-tab
      setAssetQueriesLoading(true);
      getAssetQueries(token).then((d) => { setAssetQueries(d || []); setAssetQueriesLoading(false); }).catch((e) => { setAssetQueriesLoading(false); console.warn("asset-queries:", e?.message); });
    }
    if (nav === "requests") {
      setAssetQueriesLoading(true);
      getAssetQueries(token).then((d) => { setAssetQueries(d || []); setAssetQueriesLoading(false); }).catch((e) => { setAssetQueriesLoading(false); console.warn("asset-queries:", e?.message); });
    }
    if (nav === "qrcodes") {
      setPreQrLoading(true);
      getPreQrCodes(token).then((d) => { setPreQrCodes(d || []); setPreQrLoading(false); }).catch(() => setPreQrLoading(false));
      if (!assets.length) getCompanyPortalAssets(token).then((d) => d && setAssets(d)).catch(() => {});
    }
    if (nav === "checklists") {
      load("checklists", () => getCompanyPortalChecklists(token)).then((d) => d && setChecklists(d));
      if (!assets.length) getCompanyPortalAssets(token).then((d) => d && setAssets(d)).catch(() => {});
    }
    if (nav === "employees") {
      load("employees", () => getCompanyPortalEmployees(token)).then((d) => d && setEmployees(d));
      getCompanyRoles(token)
        .then((d) => {
          const list = Array.isArray(d) ? d : [];
          setCustomRoles(list);
          applyCustomRoles(list);
          setRoleRefreshKey((k) => k + 1);
        })
        .catch(() => {});
      if (currentUser?.role === "admin" || currentUser?.role === "supervisor") {
        getCompanyPortalSupervisors(token).then((d) => d && setSupervisors(d)).catch(() => {});
        getTemplateUserAssignments(token).then((d) => d && setAssignments(d)).catch(() => {});
        getCompanyPortalChecklists(token).then((d) => d && setChecklists(d)).catch(() => {});
        getCompanyPortalLogsheetTemplates(token).then((d) => d && setLogsheetTemplatesList(d)).catch(() => {});
      }
    }
    if (nav === "mytasks") {
      load("mytasks", () => getMyTemplateAssignments(token)).then((d) => d && setMyAssignments(d));
      // Supervisors also see what they've assigned to their team
      if (currentUser?.role === "supervisor") {
        getTemplateUserAssignments(token).then((d) => d && setAssignments(d)).catch(() => {});
      }
    }
    if (nav === "logsheets" && !assets.length) load("assets", () => getCompanyPortalAssets(token)).then((d) => d && setAssets(d));
    if (nav === "ojt") {
      load("ojt", () => getOjtTrainings(token)).then((d) => d && setOjtTrainings(d));
      if (!assets.length) getCompanyPortalAssets(token).then((d) => d && setAssets(d)).catch(() => {});
    }
    if (nav === "fleet") {
      if (!assets.length) load("assets", () => getCompanyPortalAssets(token)).then((d) => d && setAssets(d));
      load("fleet_history", () => getFleetSubmissions(token)).then((d) => d && setFleetHistory(d));
      if (!checklists.length) getCompanyPortalChecklists(token).then((d) => d && setChecklists(d)).catch(() => {});
      if (!logsheetTemplatesList.length) getCompanyPortalLogsheetTemplates(token).then((d) => d && setLogsheetTemplatesList(d)).catch(() => {});
      if (!employees.length) getCompanyPortalEmployees(token).then((d) => d && setEmployees(d)).catch(() => {});
    }
    if (nav === "settings") {
      setSettingsPublicToken(null);
      fetch(`${getApiBaseUrl()}/api/company-portal/public-link`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json()).then(d => setSettingsPublicToken(d.publicToken || "")).catch(() => setSettingsPublicToken(""));
    }
  }, [nav, token, load, assets.length]);

  const handleLogout = () => {
    sessionStorage.removeItem("cp_token");
    sessionStorage.removeItem("cp_user");
    navigate("/company");
  };

  // Employee filtered
  const filteredEmployees = useMemo(() =>
    employees.filter((e) => {
      const term = empSearch.toLowerCase();
      const matchSearch = !term || (e.fullName || "").toLowerCase().includes(term) || (e.email || "").toLowerCase().includes(term) || (e.designation || "").toLowerCase().includes(term);
      const matchRole = !empRoleFilter || e.role === empRoleFilter;
      return matchSearch && matchRole;
    }),
    [employees, empSearch, empRoleFilter]
  );

  // Asset filtered
  const filteredAssets = useMemo(() =>
    assets.filter((a) => {
      const term = assetSearch.toLowerCase().trim();
      const m = a.metadata || {};
      const maintStr = [m.warranty ? "Warranty" : "", m.amc ? "AMC" : "", m.cmc ? "CMC" : "", m.inHouse ? "In House" : "", m.catalyst ? "Catalyst" : ""].filter(Boolean).join(" ").toLowerCase();
      const matchSearch = !term || [
        a.assetName, a.assetUniqueId, a.asset_unique_id, a.generatedAssetId,
        m.equipmentName, m.make, m.manufacturer, m.model, m.serialNo,
        m.dealer, m.distributor, m.mfgYear, m.manufacturingYear,
        m.installationDate, m.invoiceNo, m.purchaseDate, m.purchaseCost,
        m.accessories, m.remarks, m.workingStatus,
        a.departmentName, a.building, a.floor, a.room,
        a.assetType, a.status, a.assignedToName, a.createdByName,
        a.isVerified ? "Verified" : "",
        m.rber ? "RBER" : "", m.criticality, a.criticality,
        maintStr,
      ].some(v => v && String(v).toLowerCase().includes(term));

      const matchStatus = (() => {
        if (!assetStatusFilter) return true;
        const isVerified = Number(a.isVerified) === 1 || a.isVerified === true;
        if (assetStatusFilter === "Verified") return isVerified;
        if (assetStatusFilter === "Unverified") return !isVerified && (a.status === "Unverified" || !a.status || a.status === "Active");
        if (assetStatusFilter === "WIP") return (m.workingStatus || "").toLowerCase() === "wip";
        if (assetStatusFilter === "Not Working") return (m.workingStatus || "").toLowerCase().replace(/[_ ]/g, "") === "notworking";
        if (assetStatusFilter === "RBER") return !!m.rber;
        if (assetStatusFilter === "Condemned") return (m.workingStatus || "").toLowerCase() === "condemned";
        if (assetStatusFilter === "Critical") return (a.criticality || m.criticality || "").toLowerCase() === "critical";
        if (assetStatusFilter === "Non_Critical") return (a.criticality || m.criticality || "non_critical").toLowerCase() !== "critical";
        return (a.status || "").toLowerCase() === assetStatusFilter.toLowerCase();
      })();

      const matchAdvDept = !advFilterDept || String(a.departmentId) === String(advFilterDept);
      const matchAdvBuilding = !advFilterBuilding || (a.building || "").toLowerCase().includes(advFilterBuilding.toLowerCase());
      const matchAdvCategory = !advFilterCategory || (m.criticality || a.criticality || "").toLowerCase() === advFilterCategory.toLowerCase();
      const matchAdvMaint = !advFilterMaint || maintStr.includes(advFilterMaint.toLowerCase());
      const matchAdvRber = !advFilterRber || (advFilterRber === "yes" ? !!m.rber : !m.rber);
      const matchAdvDateFrom = !advFilterDateFrom || (a.createdAt && new Date(a.createdAt) >= new Date(advFilterDateFrom));
      const matchAdvDateTo = !advFilterDateTo || (a.createdAt && new Date(a.createdAt) <= new Date(advFilterDateTo + "T23:59:59"));

      return matchSearch && matchStatus && matchAdvDept && matchAdvBuilding && matchAdvCategory && matchAdvMaint && matchAdvRber && matchAdvDateFrom && matchAdvDateTo;
    }),
    [assets, assetSearch, assetStatusFilter, advFilterDept, advFilterBuilding, advFilterCategory, advFilterMaint, advFilterRber, advFilterDateFrom, advFilterDateTo]
  );

  // Dept filtered
  const filteredDepts = useMemo(() =>
    departments.filter((d) => !deptSearch || (d.departmentName || "").toLowerCase().includes(deptSearch.toLowerCase())),
    [departments, deptSearch]
  );

  const handleDeptSaved = (saved, isEdit) => {
    const norm = { ...saved, departmentName: saved.departmentName || saved.name };
    if (isEdit) setDepartments(p => p.map(d => d.id === norm.id ? norm : d));
    else setDepartments(p => [norm, ...p]);
    setShowDeptModal(false); setEditDept(null);
  };
  const handleDeleteDept = async (id) => {
    if (!window.confirm("Delete this department?")) return;
    try { await deleteCompanyPortalDepartment(token, id); setDepartments(p => p.filter(d => d.id !== id)); }
    catch (err) { alert(err.message || "Delete failed"); }
  };
  const handleAssetSaved = (saved, isEdit) => {
    const dept = departments.find(d => String(d.id) === String(saved.departmentId));
    const norm = { ...saved, departmentName: dept?.departmentName || saved.departmentName || "—" };
    if (isEdit) setAssets(p => p.map(a => a.id === norm.id ? norm : a));
    else setAssets(p => [norm, ...p]);
    setShowAssetModal(false); setEditAsset(null);
    // Auto-open QR card (not barcode image) for new healthcare asset registrations
    if (!isEdit && (norm.assetType === "healthcare" || companySectors.includes("healthcare"))) {
      setAssetViewQrModal(norm);
    }
  };
  const handleDeleteAsset = async (id) => {
    if (!window.confirm("Delete this asset?")) return;
    try { await deleteCompanyPortalAsset(token, id); setAssets(p => p.filter(a => a.id !== id)); }
    catch (err) { alert(err.message || "Delete failed"); }
  };

  const handleBulkDeleteAssets = async () => {
    const ids = Array.from(selectedQrIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected asset(s)? This cannot be undone.`)) return;
    try {
      const res = await bulkDeleteCompanyPortalAssets(token, ids);
      setAssets(p => p.filter(a => !selectedQrIds.has(a.id)));
      setSelectedQrIds(new Set());
      alert(`Deleted ${res.deleted ?? ids.length} asset(s).`);
    } catch (err) { alert(err.message || "Bulk delete failed"); }
  };

  const handleBulkDeletePreQr = async () => {
    const ids = Array.from(selectedPreQrIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected QR code(s)? This cannot be undone.`)) return;
    try {
      const res = await bulkDeleteCompanyPortalPreQr(token, ids);
      setPreQrCodes(p => p.filter(q => !selectedPreQrIds.has(q.id)));
      setSelectedPreQrIds(new Set());
      alert(`Deleted ${res.deleted ?? ids.length} QR code(s).`);
    } catch (err) { alert(err.message || "Bulk QR delete failed"); }
  };

  const handleAssignAsset = async (assetId, userId) => {
    try {
      await assignCompanyPortalAsset(token, assetId, userId || null);
      const userName = employees.find(e => String(e.id) === String(userId))?.fullName || null;
      setAssets(p => p.map(a => a.id === assetId ? { ...a, assignedTo: userId || null, assignedToName: userName } : a));
    } catch (err) { alert(err.message || "Assignment failed"); }
  };

  const handleHCStatusUpdate = async (assetId, payload) => {
    try {
      const BASE = getApiBaseUrl();
      const res = await fetch(`${BASE}/api/company-portal/healthcare/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Failed to update asset status");
      }
      // Merge all payload fields into local asset state
      setAssets(p => p.map(a => a.id === assetId ? {
        ...a, ...payload,
        isVerified: payload.isVerified ?? a.isVerified,
        working_status: payload.workingStatus ?? a.working_status,
        workingStatus: payload.workingStatus ?? a.workingStatus,
        metadata: {
          ...(a.metadata || {}),
          ...(payload.workingStatus !== undefined ? { workingStatus: payload.workingStatus } : {}),
          ...(payload.criticality  !== undefined ? { criticality:  payload.criticality  } : {}),
          ...(payload.rber         !== undefined ? { rber:         payload.rber         } : {}),
        },
      } : a));
    } catch (err) { alert(err.message || "Failed to update asset status"); }
  };

  const handleResolveQuery = async (queryId) => {
    const note = window.prompt("Resolution note (optional):");
    if (note === null) return; // cancelled
    try {
      const result = await resolveAssetQuery(token, queryId, note);
      setAssetQueries(p => p.map(q => q.id === queryId ? { ...q, status: "resolved", resolutionNote: note, resolvedAt: new Date().toISOString() } : q));
      if (result?.closeCode) {
        alert(`✅ Request resolved!\n\nA close code has been sent to the requester.\nClose code: ${result.closeCode}\n\nShare this code with the requester if needed.`);
      }
    } catch (err) { alert(err.message || "Failed to resolve"); }
  };

  const handleDownloadAssetQR = async (assetId, assetName) => {
    try {
      const url = `${window.location.origin}/asset-scan/${assetId}`;
      const canvas = document.createElement("canvas");
      await QRCode.toCanvas(canvas, url, { width: 400, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } });
      const link = document.createElement("a");
      link.download = `QR-${assetName.replace(/[^a-zA-Z0-9]/g, "_")}-${assetId}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      alert("QR generation failed: " + err.message);
    }
  };

  // Generate a QR code data URL from any string using the `qrcode` library
  const generateQRDataUrl = (content) => QRCode.toDataURL(content, { width: 280, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } });

  // Stable QR card generation — runs only when the selected QR changes, avoiding modal remount loops
  useEffect(() => {
    if (!preQrLinkModal) { setViewQrCardHtml(null); return; }
    setViewQrCardHtml(null);
    (async () => {
      try {
        const qrDataUrl = await generateQRDataUrl(preQrLinkModal.qrUniqueId);
        const catalystLogo = await urlToDataUrl(`${window.location.origin}/catalyst-logo.png`).catch(() => null);
        const clientLogo = companyLogoUrl
          ? await urlToDataUrl(`${window.location.origin}${companyLogoUrl.startsWith("/") ? "" : "/"}${companyLogoUrl}`).catch(() => null)
          : null;
        const displayId = preQrLinkModal.generatedAssetId || preQrLinkModal.generated_asset_id || preQrLinkModal.qrUniqueId;
        setViewQrCardHtml(buildQrCardHtml(qrDataUrl, displayId, preQrLinkModal.assetName || "", qrCardLabel));
      } catch (e) { console.error(e); }
    })();
  }, [preQrLinkModal?.id, qrCardLabel]);

  // Generate QR card for asset View QR modal in Manage Assets tab
  useEffect(() => {
    if (!assetViewQrModal) { setAssetViewQrCardHtml(null); setViewRawQrDataUrl(null); return; }
    setAssetViewQrCardHtml(null); setViewRawQrDataUrl(null);
    (async () => {
      try {
        const uid = assetViewQrModal.assetUniqueId || assetViewQrModal.asset_unique_id || `ASSET-${assetViewQrModal.id}`;
        const displayId = assetViewQrModal.generatedAssetId || assetViewQrModal.generated_asset_id || uid;
        const qrDataUrl = await generateQRDataUrl(uid);
        setViewRawQrDataUrl(qrDataUrl);
        setAssetViewQrCardHtml(buildQrCardHtml(qrDataUrl, displayId, assetViewQrModal.assetName || "", qrCardLabel));
      } catch (e) { console.error(e); }
    })();
  }, [assetViewQrModal?.id, qrCardLabel]);

  // Convert a URL to a base64 data URL for embedding in print windows
  const urlToDataUrl = async (url) => {
    if (!url) return null;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  };

  const loadImage = (src) => new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

  const drawContainImage = (ctx, img, x, y, w, h) => {
    if (!img) return;
    const scale = Math.min(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
  };

  const drawWrappedText = (ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) => {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
      }
      if (lines.length >= maxLines) break;
    }
    if (lines.length < maxLines && line) lines.push(line);
    lines.slice(0, maxLines).forEach((ln, idx) => ctx.fillText(ln, x, y + idx * lineHeight));
  };

  const downloadAssetQrCard = async (asset) => {
    try {
      const uid = asset?.assetUniqueId || asset?.asset_unique_id || `ASSET-${asset?.id || "X"}`;
      const displayId = asset?.generatedAssetId || asset?.generated_asset_id || uid;
      const assetName = asset?.assetName || asset?.asset_name || "";
      const clientLabel = qrCardLabel || companyDisplayName || "CLIENT";
      const qrDataUrl = viewRawQrDataUrl || await generateQRDataUrl(uid);
      const qrImg = await loadImage(qrDataUrl);

      const pxPerMm = 8;
      const cardW = 50 * pxPerMm;
      const cardH = 25 * pxPerMm;
      const canvas = document.createElement("canvas");
      canvas.width = cardW;
      canvas.height = cardH;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cardW, cardH);

      const pad = 2 * pxPerMm;
      const headerH = 7 * pxPerMm;
      const headerFont = `900 ${4 * pxPerMm / 2.8}px "Calibri Black", Calibri, "Arial Black", Arial, sans-serif`;
      ctx.font = headerFont;
      ctx.fillStyle = "#000000";
      ctx.textBaseline = "middle";
      ctx.fillText(clientLabel.toUpperCase(), pad, headerH / 2);
      const catText = "CATALYST";
      const catW = ctx.measureText(catText).width;
      ctx.fillText(catText, cardW - pad - catW, headerH / 2);

      const bodyTop = headerH + 0.5 * pxPerMm;
      const qrWrapSize = 16 * pxPerMm;
      const qrSize = 15 * pxPerMm;
      drawContainImage(ctx, qrImg, pad + (qrWrapSize - qrSize) / 2, bodyTop + (qrWrapSize - qrSize) / 2, qrSize, qrSize);

      const detailsX = pad + qrWrapSize + 2 * pxPerMm;
      const detailsW = cardW - detailsX - pad;
      ctx.textBaseline = "alphabetic";

      const uidY = bodyTop + 4 * pxPerMm;
      ctx.fillStyle = "#000000";
      ctx.font = `900 ${3.8 * pxPerMm / 2.8}px "Calibri Black", Calibri, "Arial Black", Arial, sans-serif`;
      ctx.fillText(displayId, detailsX, uidY);

      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `qr-card-${displayId.replace(/[^a-zA-Z0-9-_]/g, "_")}.png`;
      a.click();
    } catch (err) {
      alert("Card download failed: " + (err?.message || "Unknown error"));
    }
  };

  // Build QR sticker: company name top-center, QR left / ID right, Catalyst footer bottom-center
  const buildQrCardHtml = (qrDataUrl, uid, assetName, clientText) => {
    const companyLabel = (clientText || "CLIENT").toUpperCase().substring(0, 40);
    return `
    <div class="cotainer">
      <div class="qr-card-sticker">
        <div class="qr-card-header">
          <span class="qr-card-client-fallback">${companyLabel}</span>
        </div>
        <div class="qr-card-body">
          <div class="qr-card-qr-box">
            <img src="${qrDataUrl}" class="qr-card-qr-img" />
          </div>
          <div class="qr-card-details">
            <div class="qr-card-uid">${uid}</div>
          </div>
        </div>
        <div class="qr-card-footer">Catalyst Service Solutions</div>
      </div>
    </div>`;
  };

  const handleShowAssetQR = (asset) => {
    setAssetViewQrModal(asset);
  };

  // Print QR code cards (instead of barcodes) for a list of assets — dark card design
  const openQrCodePrintWindow = async (assetsToPrint) => {
    if (!assetsToPrint.length) return;
    setBulkQrPrinting(true);
    try {
      const catalystLogoDataUrl = cachedLogoDataUrls.catalyst || await urlToDataUrl(`${window.location.origin}/catalyst-logo.png`);
      const clientLogoDataUrl = cachedLogoDataUrls.client || (companyLogoUrl
        ? await urlToDataUrl(`${window.location.origin}${companyLogoUrl.startsWith("/") ? "" : "/"}${companyLogoUrl}`)
        : null);
      const cardHtmls = await Promise.all(assetsToPrint.map(async (asset) => {
        const barcodeStr = asset.assetUniqueId || asset.asset_unique_id || `ASSET-${asset.id}`;
        const cardId = asset.generatedAssetId || asset.generated_asset_id || barcodeStr;
        const qrUrl = await generateQRDataUrl(barcodeStr);
        const name = asset.assetName || asset.asset_name || "";
        return buildQrCardHtml(qrUrl, cardId, name, qrCardLabel);
      }));
      const win = window.open("", "_blank");
      if (!win) { alert("Popup blocked. Allow popups to print."); setBulkQrPrinting(false); return; }
      win.document.write(`<!DOCTYPE html><html><head><title>Asset QR Codes</title><link rel="stylesheet" href="${window.location.origin}/qr-card-print.css" /><style>
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#fff;width:100%;}
        .grid{display:block;}
        .cell{display:block;width:100%!important;height:25mm;overflow:hidden;page-break-after:always;break-after:page;}
        .cell:last-child{page-break-after:avoid;break-after:avoid;}
        @media print{
          html,body{padding:0;margin:0;}
          .cell{display:block;width:100%!important;height:25mm;overflow:hidden;page-break-after:always;break-after:page;}
          .cell:last-child{page-break-after:avoid;break-after:avoid;}
          @page{size:100% 25mm;margin:0;}
        }
      </style></head><body>
        <div class="grid">
          ${cardHtmls.map(h => `<div class="cell">${h}</div>`).join("")}
        </div>
      <script>window.onload=()=>{window.print();}<\/script></body></html>`);
      win.document.close();
    } catch (err) { alert("Print failed: " + err.message); }
    setBulkQrPrinting(false);
  };

  // Print pre-generated QR code cards (from the QR Codes tab)
  const openPreQrPrintWindow = async (qrList) => {
    if (!qrList.length) return;
    try {
      const catalystLogoDataUrl = cachedLogoDataUrls.catalyst || await urlToDataUrl(`${window.location.origin}/catalyst-logo.png`);
      const clientLogoDataUrl = cachedLogoDataUrls.client || (companyLogoUrl
        ? await urlToDataUrl(`${window.location.origin}${companyLogoUrl.startsWith("/") ? "" : "/"}${companyLogoUrl}`)
        : null);
      const cardHtmls = await Promise.all(qrList.map(async (qr) => {
        const qrUrl = await generateQRDataUrl(qr.qrUniqueId);
        const cardId = qr.generatedAssetId || qr.generated_asset_id || qr.qrUniqueId;
        return buildQrCardHtml(qrUrl, cardId, qr.assetName || "", qrCardLabel);
      }));
      const win = window.open("", "_blank");
      if (!win) { alert("Popup blocked. Allow popups to print."); return; }
      win.document.write(`<!DOCTYPE html><html><head><title>QR Codes</title><link rel="stylesheet" href="${window.location.origin}/qr-card-print.css" /><style>
        *{box-sizing:border-box;margin:0;padding:0}
        html,body{background:#fff;width:100%;}
        .grid{display:block;}
        .cell{display:block;width:100%;height:25mm;overflow:hidden;page-break-after:always;break-after:page;}
        .cell:last-child{page-break-after:avoid;break-after:avoid;}
        @media print{
          html,body{padding:0;margin:0;}
          .cell{display:block;width:100%!important;height:25mm;overflow:hidden;page-break-after:always;break-after:page;}
          .cell:last-child{page-break-after:avoid;break-after:avoid;}
          @page{size:100% 25mm;margin:0;}
        }
      </style></head><body>
        <div class="grid">
          ${cardHtmls.map(h => `<div class="cell">${h}</div>`).join("")}
        </div>
      <script>window.onload=()=>{window.print();}<\/script></body></html>`);
      win.document.close();
    } catch (err) { alert("Print failed: " + err.message); }
  };

  const handleChecklistSaved = (saved, isEdit) => {
    if (isEdit) setChecklists(p => p.map(c => c.id === saved.id ? saved : c));
    else setChecklists(p => [saved, ...p]);
    setShowChecklistModal(false); setEditChecklist(null);
  };
  const handleDeleteChecklist = async (id) => {
    if (!window.confirm("Delete this checklist template?")) return;
    try { await deleteCompanyPortalChecklist(token, id); setChecklists(p => p.filter(c => c.id !== id)); }
    catch (err) { alert(err.message || "Delete failed"); }
  };

  const handleEmpSaved = (saved, isEdit) => {
    if (isEdit) {
      setEmployees((prev) => prev.map((e) => (e.id === saved.id ? { ...e, ...saved } : e)));
      // Update supervisors list if role changed
      setSupervisors((prev) => {
        if (saved.role === "supervisor") {
          const exists = prev.find(s => s.id === saved.id);
          if (exists) return prev.map(s => s.id === saved.id ? { ...s, ...saved } : s);
          return [...prev, saved];
        }
        return prev.filter(s => s.id !== saved.id);
      });
    } else {
      setEmployees((prev) => [saved, ...prev]);
      if (saved.role === "supervisor") setSupervisors((prev) => [saved, ...prev]);
    }
    setShowEmpModal(false);
    setEditEmp(null);
  };

  const handleAssigned = (newAssignment) => {
    setAssignments((prev) => [...prev.filter((a) => a.id !== newAssignment.id), newAssignment]);
  };

  const handleAssignmentRemoved = (id) => {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  const handleDeleteEmp = async (id) => {
    if (!window.confirm("Delete this employee?")) return;
    try {
      await deleteCompanyPortalEmployee(token, id);
      setEmployees((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      alert(err.message || "Delete failed");
    }
  };

  const initials = (name = "") => name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2) || "?";

  if (!token || !currentUser) return null;

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9" }}>
      {/* Sidebar */}
      <aside style={{ width: "240px", background: "#fff", borderRight: "1px solid #e2e8f0", display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 10, overflow: "hidden" }}>
        {/* Brand */}
        <div style={{ padding: "18px 12px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: sidebarHovered ? "center" : "center", overflow: "hidden" }}>
          <img src={logo} alt="Logo" style={{ maxWidth: "150px", height: "40px", objectFit: "contain", transition: "max-width 0.22s" }} />
        </div>

        {/* Company name label only (no switcher here) */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
          <p style={{ fontSize: "14px", fontWeight: 700, color: "#334155", margin: 0 }}>
            {companyDisplayName || currentUser.companyName || "Client"}
          </p>
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "10px 10px", overflowY: "auto" }}>
          {visibleNav.map((item) => (
            <button key={item.key} onClick={() => setNav(item.key)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", border: "none", cursor: "pointer", background: nav === item.key ? "#eff6ff" : "transparent", color: nav === item.key ? "#2563eb" : "#475569", fontWeight: nav === item.key ? 700 : 500, fontSize: "13px", textAlign: "left", marginBottom: "2px", transition: "background 0.15s", overflow: "hidden", whiteSpace: "nowrap" }}
              title={item.label}>
              <span style={{ flexShrink: 0, display: "flex" }}>{item.icon}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User section */}
        <div style={{ padding: "14px 16px", borderTop: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#2563eb", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>
              {initials(currentUser.fullName)}
            </div>
            <div style={{ overflow: "hidden", whiteSpace: "nowrap" }}>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentUser.fullName}</p>
              <Badge val={currentUser.role} />
            </div>
          </div>
          {/* Bell button — admin & supervisor only */}
          {(currentUser?.role === "admin" || currentUser?.role === "supervisor") && (
            <div style={{ position: "relative", marginBottom: "8px" }}>
              <button
                onClick={() => setBellOpen((v) => !v)}
                style={{ width: "100%", padding: "8px", borderRadius: "7px", background: bellOpen ? "#eff6ff" : "#f8fafc", color: warnOpenCount > 0 ? "#ea580c" : "#475569", border: "1px solid #e2e8f0", cursor: "pointer", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", position: "relative" }}
              >
                <span className={bellRinging ? "fm-bell-ringing" : ""} style={{ display: "inline-flex", alignItems: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                </span>
                Alerts
                {warnOpenCount > 0 && (
                  <span style={{ background: "#dc2626", color: "#fff", borderRadius: "50%", fontSize: "9px", fontWeight: 800, width: "16px", height: "16px", display: "inline-flex", alignItems: "center", justifyContent: "center", marginLeft: "2px" }}>
                    {warnOpenCount > 99 ? "99+" : warnOpenCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 -10px 30px rgba(0,0,0,0.12)", zIndex: 9999, overflow: "hidden", minWidth: "220px" }}>
                  <div style={{ padding: "10px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontWeight: 700, fontSize: "12px", color: "#0f172a" }}>⚠️ Active Warnings</span>
                    <button onClick={() => { setBellOpen(false); setNav("warnings"); }} style={{ background: "none", border: "none", color: "#2563eb", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>View all →</button>
                  </div>
                  {recentAlerts.length === 0 && (
                    <div style={{ padding: "16px", textAlign: "center", color: "#94a3b8", fontSize: "12px" }}>No open warnings</div>
                  )}
                  {recentAlerts.map((a) => {
                    const sevColor = { critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#16a34a" }[a.severity] || "#475569";
                    const sevBg    = { critical: "#fee2e2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4"  }[a.severity] || "#f8fafc";
                    return (
                      <div key={a.id} style={{ padding: "9px 14px", borderBottom: "1px solid #f8fafc", cursor: "pointer" }}
                        onClick={() => { setBellOpen(false); setNav("warnings"); }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ background: sevBg, color: sevColor, fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "8px", textTransform: "uppercase" }}>{a.severity}</span>
                          <span style={{ fontWeight: 600, fontSize: "11px", color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.assetName || "Unknown asset"}</span>
                        </div>
                        <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description || "No description"}</div>
                      </div>
                    );
                  })}
                  {/* Sound toggle + settings footer */}
                  <div style={{ borderTop: "1px solid #f1f5f9" }}>
                    <div style={{ padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "10px", color: "#94a3b8" }}>Alert sounds</span>
                      <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                        <button
                          className={`fm-alarm-gear${alarmSettingsOpen ? " fm-open" : ""}`}
                          onClick={() => setAlarmSettingsOpen((v) => !v)}
                          title="Alarm settings"
                        >⚙</button>
                        <button className={`fm-sound-toggle ${soundEnabled ? "fm-enabled" : "fm-muted"}`} onClick={toggleSound}>
                          {soundEnabled ? "🔊 On" : "🔇 Off"}
                        </button>
                      </div>
                    </div>
                    {alarmSettingsOpen && (
                      <div className="fm-alarm-settings">
                        <h4>Alarm Settings</h4>
                        {/* Volume */}
                        <div className="fm-alarm-vol-row">
                          <span>Volume</span>
                          <strong>{Math.round(alarmVolume * 100)}%</strong>
                        </div>
                        <input
                          type="range" min="0" max="1" step="0.05"
                          value={alarmVolume}
                          onChange={(e) => updateAlarmVolume(parseFloat(e.target.value))}
                          className="fm-vol-slider"
                        />
                        {/* Per-severity toggles */}
                        <div className="fm-sev-section-label">Sound per severity</div>
                        {[
                          { key: "critical", label: "Critical", color: "#dc2626", bg: "#fee2e2" },
                          { key: "high",     label: "High",     color: "#ea580c", bg: "#fff7ed" },
                          { key: "medium",   label: "Medium",   color: "#d97706", bg: "#fefce8" },
                          { key: "low",      label: "Low",      color: "#16a34a", bg: "#f0fdf4" },
                          { key: "info",     label: "Info",     color: "#2563eb", bg: "#eff6ff" },
                        ].map(({ key, label, color, bg }) => {
                          const isOn = alarmSevConfig[key] !== false;
                          return (
                            <div key={key} className="fm-sev-row">
                              <span className="fm-sev-badge" style={{ background: bg, color }}>{label}</span>
                              <div className="fm-sev-actions">
                                <button className="fm-preview-btn" title={`Preview ${label} sound`} onClick={() => previewAlertSound(key)}>▶ Test</button>
                                <button className={`fm-sev-toggle ${isOn ? "on" : "off"}`} onClick={() => updateAlarmSevConfig(key, !isOn)}>
                                  {isOn ? "ON" : "OFF"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <button onClick={handleLogout}
            style={{ width: "100%", padding: "8px", borderRadius: "7px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer", fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ marginLeft: "240px", flex: 1, padding: "16px 32px 28px", minHeight: "100vh", minWidth: 0, overflowX: "hidden" }}>

        {/* Top-right company switcher bar */}
        {accessibleCompanies.length > 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
            <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Company:</span>
            <div style={{ position: "relative" }}>
              <button
                disabled={switchingCompany}
                onClick={() => { setCompanySwitcherSearch(""); setCompanySwitcherOpen(o => !o); }}
                style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "13px", padding: "7px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#0f172a", cursor: switchingCompany ? "wait" : "pointer", fontWeight: 700, minWidth: "200px", justifyContent: "space-between", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {accessibleCompanies.find(c => c.companyId === currentUser?.companyId)?.companyName || "Select Company"}
                  {accessibleCompanies.find(c => c.companyId === currentUser?.companyId)?.primary ? " ★" : ""}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {companySwitcherOpen && !switchingCompany && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 500, minWidth: "240px", overflow: "hidden" }}>
                  <div style={{ padding: "8px" }}>
                    <input
                      autoFocus
                      value={companySwitcherSearch}
                      onChange={e => setCompanySwitcherSearch(e.target.value)}
                      placeholder="Search companies..."
                      style={{ width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", boxSizing: "border-box", outline: "none" }}
                    />
                  </div>
                  <div style={{ maxHeight: "260px", overflowY: "auto", padding: "4px 6px 8px" }}>
                    {accessibleCompanies
                      .filter(c => {
                        const q = (companySwitcherSearch || "").toLowerCase().trim();
                        if (!q) return true;
                        return (c.companyName || "").toLowerCase().includes(q);
                      })
                      .map(c => {
                        const isActive = c.companyId === currentUser?.companyId;
                        return (
                          <button key={c.companyId}
                            onClick={async () => {
                              setCompanySwitcherOpen(false);
                              if (c.companyId === currentUser?.companyId) return;
                              const selected = accessibleCompanies.find(x => x.companyId === c.companyId);
                              if (selected) setCompanyDisplayName(selected.companyName);
                              setSwitchingCompany(true);
                              try {
                                const r = await fetch(`/api/company-auth/switch-company`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ companyId: c.companyId }),
                                });
                                if (!r.ok) throw new Error("Switch failed");
                                const data = await r.json();
                                sessionStorage.setItem("cp_token", data.token);
                                sessionStorage.setItem("cp_user", JSON.stringify(data.user));
                                window.location.reload();
                              } catch {
                                alert("Could not switch company. Please try again.");
                              } finally {
                                setSwitchingCompany(false);
                              }
                            }}
                            style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "9px 10px", borderRadius: "7px", border: "none", background: isActive ? "#eff6ff" : "transparent", color: isActive ? "#2563eb" : "#374151", cursor: "pointer", textAlign: "left", fontSize: "13px", fontWeight: isActive ? 700 : 500 }}
                            onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#f8fafc"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = isActive ? "#eff6ff" : "transparent"; }}>
                            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: isActive ? "#2563eb" : "#e2e8f0", flexShrink: 0 }} />
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {c.companyName}{c.primary ? " ★" : ""}
                            </span>
                            {isActive && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
            {switchingCompany && <span style={{ fontSize: "12px", color: "#7c3aed" }}>Switching...</span>}
          </div>
        )}

        {/* ── Dashboard ──────────────────────────────────────────── */}
        {nav === "dashboard" && (() => {

          /* ── Always show Healthcare Dashboard ─────────────────── */
          const openAssetFromDash = (dashAsset) => {
            window.open(`/company/asset/${dashAsset.id}`, '_blank');
          };
          return <HealthcareDashboard token={token} onOpenAsset={openAssetFromDash} />;

          const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-Yearly", yearly: "Yearly" };
          const FREQ_COLORS = { daily: ["#dcfce7","#16a34a"], weekly: ["#dbeafe","#1d4ed8"], monthly: ["#fef9c3","#ca8a04"], quarterly: ["#ede9fe","#7c3aed"], half_yearly: ["#fce7f3","#be185d"], yearly: ["#ffedd5","#c2410c"] };
          const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const visibleLogsheets = logsheetShowAll ? recentEntries : recentEntries.slice(0, 5);
          const visibleChecklists = checklistShowAll ? recentChecklists : recentChecklists.slice(0, 5);
          const recentTable = (
            <div style={{ marginTop: "28px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Recent Submissions</h2>
                </div>
                <div style={{ display: "flex", gap: "4px" }}>
                  {[{ key: "logsheets", label: "Logsheets" }, { key: "checklists", label: "Checklists" }].map((tab) => (
                    <button key={tab.key} onClick={() => setDashboardRecentTab(tab.key)}
                      style={{ padding: "5px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: "none",
                        background: dashboardRecentTab === tab.key ? "#7c3aed" : "#f1f5f9",
                        color: dashboardRecentTab === tab.key ? "#fff" : "#64748b" }}>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                {dashboardRecentTab === "logsheets" ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["#","Template","Asset","Period","Frequency","Filled By","Submitted"].map((h) => (
                          <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentEntriesLoading ? (
                        <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
                      ) : recentEntries.length === 0 ? (
                        <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                          No logsheets filled yet.{" "}
                          <button onClick={() => setNav("logsheets")} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>Fill one now →</button>
                        </td></tr>
                      ) : visibleLogsheets.map((e, i) => {
                        const freq = e.frequency || "daily";
                        const [fbg, ftx] = FREQ_COLORS[freq] || ["#f1f5f9","#475569"];
                        return (
                          <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px 16px", color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{e.templateName}</td>
                            <td style={{ padding: "12px 16px", color: "#475569" }}>{e.assetName || "—"}</td>
                            <td style={{ padding: "12px 16px", color: "#475569", whiteSpace: "nowrap" }}>{MONTH_NAMES[(e.month || 1) - 1]} {e.year}{e.shift ? ` · Shift ${e.shift}` : ""}</td>
                            <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: fbg, color: ftx }}>{FREQ_LABELS[freq] || freq}</span></td>
                            <td style={{ padding: "12px 16px", color: "#475569", fontSize: "13px" }}>{e.submittedBy || "—"}</td>
                            <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap" }}>{e.submittedAt ? new Date(e.submittedAt).toLocaleString() : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["#","Template","Asset","Status","Filled By","Submitted"].map((h) => (
                          <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentChecklistsLoading ? (
                        <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</td></tr>
                      ) : recentChecklists.length === 0 ? (
                        <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                          No checklists filled yet.{" "}
                          <button onClick={() => setNav("checklists")} style={{ color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>View Checklists →</button>
                        </td></tr>
                      ) : visibleChecklists.map((c, i) => {
                        const statusColors = { completed: ["#f0fdf4","#16a34a"], partial: ["#fffbeb","#ca8a04"], pending: ["#f1f5f9","#64748b"] };
                        const [sbg, stx] = statusColors[c.status] || ["#f1f5f9","#64748b"];
                        return (
                          <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "12px 16px", color: "#94a3b8", fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{c.templateName}</td>
                            <td style={{ padding: "12px 16px", color: "#475569" }}>{c.assetName || "—"}</td>
                            <td style={{ padding: "12px 16px" }}><span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: sbg, color: stx, textTransform: "capitalize" }}>{c.status || "submitted"}</span></td>
                            <td style={{ padding: "12px 16px", color: "#475569", fontSize: "13px" }}>{c.submittedBy || "—"}</td>
                            <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap" }}>{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {/* Load More */}
              {dashboardRecentTab === "logsheets" && !logsheetShowAll && recentEntries.length > 5 && (
                <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
                  <button onClick={() => setLogsheetShowAll(true)}
                    style={{ padding: "8px 24px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                    Load More ({recentEntries.length - 5} more)
                  </button>
                </div>
              )}
              {dashboardRecentTab === "checklists" && !checklistShowAll && recentChecklists.length > 5 && (
                <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", textAlign: "center" }}>
                  <button onClick={() => setChecklistShowAll(true)}
                    style={{ padding: "8px 24px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                    Load More ({recentChecklists.length - 5} more)
                  </button>
                </div>
              )}
            </div>
          );

          /* ── SUPERVISOR DASHBOARD ── */
          if (currentUser.role === "supervisor") {
            const myTeam = employees.filter((e) => String(e.supervisorId) === String(currentUser.id));
            const forwardedByMe = assignments.filter((a) => String(a.assignedBy) === String(currentUser.id));
            return (
              <div>
                <div style={{ marginBottom: "24px" }}>
                  <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>
                    Welcome back, {(currentUser.fullName || "").split(" ")[0]} 👋
                  </h1>
                  <p style={{ color: "#64748b", fontSize: "14px" }}>Supervisor Portal &nbsp;·&nbsp; {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                </div>

                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "28px" }}>
                  <StatCard label="Assigned to Me" value={myAssignments.length} sub="From admin" subCol="#2563eb" iconBg="#eff6ff" iconCol="#2563eb"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
                  <StatCard label="My Team Size" value={myTeam.length} sub="Helpers under you" subCol="#7c3aed" iconBg="#f3e8ff" iconCol="#7c3aed"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
                  <StatCard label="Forwarded" value={forwardedByMe.length} sub="Tasks given to team" subCol="#16a34a" iconBg="#f0fdf4" iconCol="#16a34a"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 10 20 15 15 20"/><path d="M4 4v7a4 4 0 0 0 4 4h12"/></svg>} />
                  <StatCard label="Recent Activity" value={recentEntries.length} sub="Filled logsheets" subCol="#ca8a04" iconBg="#fef9c3" iconCol="#ca8a04"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
                </div>

                {/* Assigned to Me by Admin */}
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "20px" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Assigned to Me by Admin</h2>
                    <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>{myAssignments.length} task{myAssignments.length !== 1 ? "s" : ""}</span>
                  </div>
                  {myAssignments.length === 0 ? (
                    <p style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No templates assigned to you yet.</p>
                  ) : (
                    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {myAssignments.map((a) => {
                        const alreadyForwarded = assignments.filter(
                          (fw) => String(fw.assignedBy) === String(currentUser.id) &&
                            fw.templateType === a.templateType &&
                            String(fw.templateId) === String(a.templateId)
                        );
                        return (
                          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                            <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: a.templateType === "checklist" ? "#dbeafe" : "#ede9fe", color: a.templateType === "checklist" ? "#1d4ed8" : "#7c3aed", flexShrink: 0 }}>
                              {a.templateType === "checklist" ? "Checklist" : "Logsheet"}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "2px" }}>{a.templateName || `Template #${a.templateId}`}</p>
                              {a.note && <p style={{ fontSize: "12px", color: "#64748b" }}>Note: {a.note}</p>}
                            </div>
                            {alreadyForwarded.length > 0 && (
                              <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 600, flexShrink: 0 }}>
                                ✓ {alreadyForwarded.length} forwarded
                              </span>
                            )}

                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* My Team quick view */}
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "20px" }}>
                  <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>My Team</h2>
                    </div>
                    <button onClick={() => setNav("employees")} style={{ fontSize: "13px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Manage Team →</button>
                  </div>
                  {myTeam.length === 0 ? (
                    <p style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No team members yet. Add employees and assign yourself as their supervisor.</p>
                  ) : (
                    <div style={{ padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
                      {myTeam.map((m) => {
                        const taskCount = assignments.filter((a) => String(a.assignedTo) === String(m.id)).length;
                        return (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", minWidth: "200px" }}>
                            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#7c3aed", fontSize: "14px", flexShrink: 0 }}>
                              {(m.fullName || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <p style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a", marginBottom: "1px" }}>{m.fullName}</p>
                              <p style={{ fontSize: "11px", color: "#94a3b8" }}>{taskCount} task{taskCount !== 1 ? "s" : ""} assigned</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recent Logsheets */}
                {recentTable}
              </div>
            );
          }

          /* ── EMPLOYEE DASHBOARD ── */
          if (currentUser.role !== "admin") {
            const myTaskCount = myAssignments.length;
            return (
              <div>
                <div style={{ marginBottom: "24px" }}>
                  <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>
                    Welcome back, {(currentUser.fullName || "").split(" ")[0]} 👋
                  </h1>
                  <p style={{ color: "#64748b", fontSize: "14px" }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                </div>

                {/* Stat cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "28px" }}>
                  <StatCard label="My Tasks" value={myTaskCount} sub="Assigned to you" subCol="#2563eb" iconBg="#eff6ff" iconCol="#2563eb"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
                  <StatCard label="Filled Logsheets" value={recentEntries.length} sub="Recent submissions" subCol="#16a34a" iconBg="#f0fdf4" iconCol="#16a34a"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
                  <StatCard label="Checklists" value={checklists.length} sub="Available templates" subCol="#7c3aed" iconBg="#f3e8ff" iconCol="#7c3aed"
                    icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>} />
                </div>

                {/* Quick nav */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                  {visibleNav.filter((n) => n.key !== "dashboard").map((item) => (
                    <button key={item.key + item.label} onClick={() => setNav(item.key)}
                      style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", cursor: "pointer", textAlign: "left", transition: "box-shadow 0.15s", display: "flex", alignItems: "center", gap: "14px" }}
                      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)")}
                      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}>
                      <div style={{ width: "44px", height: "44px", background: "#eff6ff", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", flexShrink: 0 }}>{item.icon}</div>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "2px" }}>{item.label}</p>
                        <p style={{ fontSize: "12px", color: "#94a3b8" }}>View &amp; manage →</p>
                      </div>
                    </button>
                  ))}
                </div>

                {recentTable}
              </div>
            );
          }

          /* ── ADMIN DASHBOARD ── */
          return (() => {
            const isAdmin = currentUser.role === "admin";
            // SVG Donut Chart helper
            const DonutChart = ({ data, size = 200, thickness = 38 }) => {
              const vals = data.map((d) => Math.max(0, d.value || 0));
              const total = vals.reduce((s, v) => s + v, 0);
              const r = (size - thickness) / 2;
              const cx = size / 2, cy = size / 2;
              const circ = 2 * Math.PI * r;
              if (total === 0) {
                return (
                  <svg width={size} height={size}>
                    <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
                    <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fill="#94a3b8">No data</text>
                  </svg>
                );
              }
              let cumDash = 0;
              const slices = data.map((d, i) => {
                const v = Math.max(0, d.value || 0);
                const dash = (v / total) * circ;
                const offset = circ - cumDash;
                cumDash += dash;
                return { ...d, dash, offset, v };
              });
              return (
                <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                  <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={thickness} />
                  {slices.map((s, i) => s.v > 0 && (
                    <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                      stroke={s.color} strokeWidth={thickness}
                      strokeDasharray={`${s.dash} ${circ - s.dash}`}
                      strokeDashoffset={s.offset}
                    />
                  ))}
                  <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                    style={{ transform: "rotate(90deg)", transformOrigin: `${cx}px ${cy}px`, fontSize: "22px", fontWeight: 800 }}
                    fill="#0f172a">{total}</text>
                </svg>
              );
            };

            const PERIOD_LABELS = { day: "Today", week: "This Week", month: "This Month", year: "This Year" };
            const cs = chartStats;
            const chartData = cs ? [
              { label: "Filled Logsheets",   value: cs.filledLogsheets,   color: "#2563eb" },
              { label: "Pending Logsheets",  value: cs.pendingLogsheets,  color: "#93c5fd" },
              { label: "Filled Checklists",  value: cs.filledChecklists,  color: "#16a34a" },
              { label: "Pending Checklists", value: cs.pendingChecklists, color: "#86efac" },
            ] : [];
            const chartSubtitle = chartError
              ? `⚠ ${chartError}`
              : cs ? `${cs.dateFrom} — ${cs.dateTo}`
              : "Loading…";
            const totalSubmissions = cs
              ? (cs.filledLogsheets || 0) + (cs.pendingLogsheets || 0) + (cs.filledChecklists || 0) + (cs.pendingChecklists || 0)
              : 0;
            const filledSubmissions = cs ? (cs.filledLogsheets || 0) + (cs.filledChecklists || 0) : 0;
            const completionRate = totalSubmissions > 0 ? Math.round((filledSubmissions / totalSubmissions) * 100) : 0;
            const openAlertsCount = dashboardAlerts.length;
            const criticalAlertsCount = dashboardAlerts.filter((f) => f.severity === "critical").length;
            const unassignedOpenWorkOrders = dashboardWorkOrders.filter((wo) => !wo.assignedTo).length;

            return (
              <div>
                {/* ── Dashboard Sub-tab bar ─────────────────────────── */}
                <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
                  {[
                    { k: "overview",   label: "📊 Overview" },
                    { k: "healthcare", label: "🏥 Healthcare" },
                  ].map(({ k, label }) => (
                    <button key={k} type="button" onClick={() => setDashboardSubNav(k)}
                      style={{ padding: "10px 22px", background: "none", border: "none",
                        borderBottom: dashboardSubNav === k ? "3px solid #059669" : "3px solid transparent",
                        marginBottom: "-2px", fontSize: "14px", fontWeight: 700,
                        color: dashboardSubNav === k ? "#059669" : "#64748b", cursor: "pointer" }}>
                      {label}
                    </button>
                  ))}
                </div>
                {dashboardSubNav === "healthcare" ? <HealthcareDashboard token={token} onOpenAsset={(dashAsset) => {
                  window.open(`/company/asset/${dashAsset.id}`, '_blank');
                }} /> : null}
                {dashboardSubNav !== "healthcare" && <div>
                {/* Header */}
                <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
                  <div>
                    <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>
                      Welcome back, {(currentUser.fullName || "").split(" ")[0]} 👋
                    </h1>
                    <p style={{ color: "#64748b", fontSize: "14px" }}>{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</p>
                  </div>
                  {isAdmin && (
                    <button onClick={() => { setNav("assets"); setAssetSubNav("manage"); setEditAsset(null); setShowAssetModal(true); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "10px 18px", borderRadius: "10px", background: "#0f172a", color: "#fff", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 700, whiteSpace: "nowrap" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Register Asset
                    </button>
                  )}
                </div>

                {loading.dashboard && <p style={{ color: "#94a3b8" }}>Loading dashboard…</p>}

                {/* 3 Key stat cards */}
                {dashboard && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "16px" }}>
                    <StatCard label="Active Assets" value={dashboard.activeAssets} sub={`${dashboard.totalAssets} total`} subCol="#22c55e"
                      iconBg="#eff6ff" iconCol="#2563eb" onClick={() => setNav("assets")}
                      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>} />
                    <StatCard label="Open Requests" value={dashboard.openIssues}
                      sub={dashboard.openIssues > 0 ? "Needs attention" : "All clear"}
                      subCol={dashboard.openIssues > 0 ? "#dc2626" : "#22c55e"}
                      iconBg={dashboard.openIssues > 0 ? "#fef2f2" : "#f0fdf4"}
                      iconCol={dashboard.openIssues > 0 ? "#dc2626" : "#22c55e"}
                      onClick={() => setNav("workorders")}
                      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>} />
                    <StatCard label="Total Warnings" value={dashboard.flags?.open || 0}
                      sub={`${dashboard.flags?.critical || 0} critical`}
                      subCol={(dashboard.flags?.critical || 0) > 0 ? "#dc2626" : "#64748b"}
                      iconBg={(dashboard.flags?.open || 0) > 0 ? "#fff7ed" : "#f0fdf4"}
                      iconCol={(dashboard.flags?.open || 0) > 0 ? "#ea580c" : "#22c55e"}
                      onClick={() => setNav("warnings")}
                      icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>} />
                  </div>
                )}

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "12px",
                  marginBottom: "20px",
                }}>
                  <div style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)", border: "1px solid #bfdbfe", borderRadius: "12px", padding: "12px 14px" }}>
                    <p style={{ margin: 0, fontSize: "11px", fontWeight: 700, color: "#1d4ed8", letterSpacing: "0.03em", textTransform: "uppercase" }}>Period Health</p>
                    <p style={{ margin: "6px 0 2px", fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>{completionRate}%</p>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>Completion rate for {PERIOD_LABELS[chartFilter]?.toLowerCase() || "current period"}</p>
                  </div>
                  <div style={{ background: "linear-gradient(135deg, #f0fdf4 0%, #f8fafc 100%)", border: "1px solid #bbf7d0", borderRadius: "12px", padding: "12px 14px" }}>
                    <p style={{ margin: 0, fontSize: "11px", fontWeight: 700, color: "#15803d", letterSpacing: "0.03em", textTransform: "uppercase" }}>Execution Volume</p>
                    <p style={{ margin: "6px 0 2px", fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>{totalSubmissions}</p>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>Total checklist/logsheet outcomes tracked</p>
                  </div>
                  <div style={{ background: "linear-gradient(135deg, #fff7ed 0%, #f8fafc 100%)", border: "1px solid #fed7aa", borderRadius: "12px", padding: "12px 14px" }}>
                    <p style={{ margin: 0, fontSize: "11px", fontWeight: 700, color: "#c2410c", letterSpacing: "0.03em", textTransform: "uppercase" }}>Risk Snapshot</p>
                    <p style={{ margin: "6px 0 2px", fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>{openAlertsCount}</p>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>{criticalAlertsCount} critical alert{criticalAlertsCount !== 1 ? "s" : ""} open</p>
                  </div>
                  <div style={{ background: "linear-gradient(135deg, #fef2f2 0%, #f8fafc 100%)", border: "1px solid #fecaca", borderRadius: "12px", padding: "12px 14px" }}>
                    <p style={{ margin: 0, fontSize: "11px", fontWeight: 700, color: "#b91c1c", letterSpacing: "0.03em", textTransform: "uppercase" }}>Request Coverage</p>
                    <p style={{ margin: "6px 0 2px", fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>{unassignedOpenWorkOrders}</p>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>Open requests without an assignee</p>
                  </div>
                </div>

                {/* Submission Overview */}
                {/* ── Shift summary banner ── */}
                {shifts.length > 0 && (() => {
                  const now = new Date();
                  const nowMins = now.getHours() * 60 + now.getMinutes();
                  const activeShiftList = shifts.filter((s) => {
                    if (s.status !== "active") return false;
                    const [sh, sm] = s.startTime.split(":").map(Number);
                    const [eh, em] = s.endTime.split(":").map(Number);
                    const startMins = sh * 60 + sm;
                    const endMins = eh * 60 + em;
                    if (startMins <= endMins) return nowMins >= startMins && nowMins <= endMins;
                    return nowMins >= startMins || nowMins <= endMins;
                  });
                  const fmt12 = (t) => { if (!t) return ""; const [h, m] = t.split(":"); const hr = parseInt(h, 10); return `${hr % 12 || 12}:${m} ${hr < 12 ? "AM" : "PM"}`; };
                  return (
                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
                      {activeShiftList.length === 0 ? (
                        <div style={{ padding: "12px 18px", background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "13.5px", color: "#64748b" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ marginRight: "6px", verticalAlign: "middle" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          No shifts are currently active — <button onClick={() => setNav("shifts")} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600, fontSize: "13.5px", padding: 0 }}>manage shifts</button>
                        </div>
                      ) : activeShiftList.map((s) => (
                        <div key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: "10px", padding: "10px 16px", background: "#f0fdf4", borderRadius: "10px", border: "1px solid #bbf7d0" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#16a34a", display: "inline-block", animation: "pulse-dot 1.4s ease-in-out infinite" }} />
                          <div>
                            <span style={{ fontWeight: 700, fontSize: "13.5px", color: "#15803d" }}>{s.name}</span>
                            <span style={{ fontSize: "12.5px", color: "#4ade80", marginLeft: "8px" }}>{fmt12(s.startTime)} – {fmt12(s.endTime)}</span>
                          </div>
                          <span style={{ fontSize: "12px", color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: "20px", fontWeight: 600 }}>
                            {s.employeeCount ?? 0} emp
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* ── Main 2-col grid: Submission Overview (left) | Alerts + WO (right) ── */}
                <style>{`@keyframes blink-dot{0%,100%{opacity:1}50%{opacity:0.12}} @keyframes pulse-dot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.55);opacity:0.65}}`}</style>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "24px", alignItems: "start" }}>

                  {/* ── Left: Submission Overview ── */}
                  <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "20px" }}>
                    {/* Title + Period Filter */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>Submission Overview</p>
                        <p style={{ fontSize: "12px", color: chartError ? "#dc2626" : "#94a3b8", margin: 0, marginTop: "2px" }}>
                          {chartSubtitle}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
                        {["day","week","month","year"].map((p) => (
                          <button key={p} onClick={() => { setChartFilter(p); setChartCustomStart(""); setChartCustomEnd(""); }}
                            style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: `1px solid ${chartFilter === p && !chartCustomStart ? "#2563eb" : "#e2e8f0"}`, background: chartFilter === p && !chartCustomStart ? "#eff6ff" : "#f8fafc", color: chartFilter === p && !chartCustomStart ? "#2563eb" : "#64748b" }}>
                            {PERIOD_LABELS[p]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom date range */}
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "20px", background: "#f8fafc", borderRadius: "8px", padding: "8px 12px" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <input type="date" value={chartCustomStart} onChange={(e) => setChartCustomStart(e.target.value)}
                        style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 8px", fontSize: "12.5px", outline: "none", minWidth: 0 }} />
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>to</span>
                      <input type="date" value={chartCustomEnd} onChange={(e) => setChartCustomEnd(e.target.value)}
                        style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 8px", fontSize: "12.5px", outline: "none", minWidth: 0 }} />
                      {(chartCustomStart || chartCustomEnd) && (
                        <button onClick={() => { setChartCustomStart(""); setChartCustomEnd(""); }}
                          style={{ padding: "3px 8px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", fontSize: "11.5px", fontWeight: 600, flexShrink: 0 }}>Clear</button>
                      )}
                    </div>

                    {/* Donut + Legend */}
                    <div style={{ display: "flex", alignItems: "center", gap: "24px", justifyContent: "center" }}>
                      <div style={{ flexShrink: 0 }}>
                        <DonutChart data={chartData} size={190} thickness={38} />
                      </div>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px" }}>
                        {(() => {
                          const chartTotal = chartData.reduce((s, d) => s + (d.value || 0), 0);
                          return chartData.map((d) => {
                            const pct = chartTotal > 0 ? Math.round(((d.value || 0) / chartTotal) * 100) : 0;
                            return (
                              <div key={d.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: d.color, flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                  <p style={{ fontSize: "12.5px", color: "#475569", margin: 0 }}>{d.label}</p>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", display: "block" }}>{d.value}</span>
                                  <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600 }}>{pct}%</span>
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* ── Right column: Latest Alerts + Work Orders stacked ── */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                  {/* Latest Alerts */}
                  <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>Latest Alerts</p>
                        <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, marginTop: "2px" }}>Open warnings &amp; flags</p>
                      </div>
                      <button onClick={() => setNav("warnings")}
                        style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b" }}>
                        View All →
                      </button>
                    </div>
                    {dashboardAlertsLoading ? (
                      <p style={{ color: "#94a3b8", fontSize: "13px", padding: "8px 0" }}>Loading…</p>
                    ) : dashboardAlerts.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
                        ✅ No open alerts
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {dashboardAlerts.map((f) => {
                          const sevCols = { critical: { bg: "#fee2e2", color: "#991b1b" }, high: { bg: "#ffedd5", color: "#9a3412" }, medium: { bg: "#fef9c3", color: "#854d0e" }, low: { bg: "#dcfce7", color: "#166534" } };
                          const sc = sevCols[f.severity] || { bg: "#f1f5f9", color: "#475569" };
                          const dotCfg = ({ open: { color: "#dc2626", animation: "blink-dot 1s ease-in-out infinite" }, in_progress: { color: "#f97316", animation: "pulse-dot 1.5s ease-in-out infinite" }, resolved: { color: "#16a34a", animation: "none" }, closed: { color: "#94a3b8", animation: "none" } })[f.status || "open"] || { color: "#94a3b8", animation: "none" };
                          return (
                            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", border: `1px solid ${f.status === "open" ? "#fecaca" : "#f1f5f9"}`, background: f.status === "open" ? "#fff8f8" : "#fafafa" }}>
                              <span title={f.status || "open"} style={{ flexShrink: 0, width: "9px", height: "9px", borderRadius: "50%", display: "inline-block", background: dotCfg.color, animation: dotCfg.animation }} />
                              <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: 700, background: sc.bg, color: sc.color, textTransform: "capitalize" }}>
                                {f.severity || "—"}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: "12.5px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {f.assetName || "Unknown asset"}
                                </p>
                                <p style={{ margin: 0, fontSize: "11.5px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {f.description || "No description"}
                                </p>
                              </div>
                              <span style={{ flexShrink: 0, fontSize: "10.5px", color: "#94a3b8", whiteSpace: "nowrap" }}>
                                {f.createdAt ? new Date(f.createdAt).toLocaleDateString() : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Work Orders */}
                  <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>Requests</p>
                        <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, marginTop: "2px" }}>Open • Assign to team members</p>
                      </div>
                      <button onClick={() => setNav("workorders")}
                        style={{ padding: "5px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b" }}>
                        View All →
                      </button>
                    </div>
                    {dashboardWOLoading ? (
                      <p style={{ color: "#94a3b8", fontSize: "13px", padding: "8px 0" }}>Loading…</p>
                    ) : dashboardWorkOrders.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
                        ✅ No open work orders
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {dashboardWorkOrders.map((wo) => {
                          const priCols = { critical: { bg: "#fee2e2", color: "#991b1b" }, high: { bg: "#ffedd5", color: "#9a3412" }, medium: { bg: "#fef9c3", color: "#854d0e" }, low: { bg: "#dcfce7", color: "#166534" } };
                          const pc = priCols[wo.priority] || { bg: "#f1f5f9", color: "#475569" };
                          const assignedUser = dashboardWOUsers.find((u) => Number(u.id) === Number(wo.assignedTo));
                          return (
                            <div key={wo.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", borderRadius: "8px", border: "1px solid #f1f5f9", background: "#fafafa" }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                                  <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: 700, background: pc.bg, color: pc.color, textTransform: "capitalize" }}>
                                    {wo.priority || "—"}
                                  </span>
                                  <p style={{ margin: 0, fontWeight: 700, fontSize: "12.5px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {wo.workOrderNumber || `WO-${wo.id}`}
                                  </p>
                                </div>
                                <p style={{ margin: 0, fontSize: "11.5px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {wo.assetName || "No asset"}{wo.description ? ` — ${wo.description}` : ""}
                                </p>
                                {assignedUser ? (
                                  <p style={{ margin: "3px 0 0", fontSize: "10.5px", color: "#2563eb", fontWeight: 600 }}>
                                    Assigned: {assignedUser.fullName}
                                  </p>
                                ) : (
                                  <p style={{ margin: "3px 0 0", fontSize: "10.5px", color: "#f97316", fontWeight: 600 }}>Unassigned</p>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setDashWOAssign(wo);
                                  setDashWOAssignUser(wo.assignedTo ? String(wo.assignedTo) : "");
                                  setDashWOAssignNote("");
                                  setDashWOAssignErr(null);
                                }}
                                style={{ flexShrink: 0, padding: "4px 10px", borderRadius: "6px", border: "1px solid #2563eb", background: "#eff6ff", color: "#2563eb", fontSize: "11.5px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                {wo.assignedTo ? "Re-assign" : "Assign"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Soft Service Requests */}
                  {(currentUser?.role === "admin" || currentUser?.role === "supervisor") && (
                  <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                      <div>
                        <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0 }}>Soft Service Requests</p>
                        <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0, marginTop: "2px" }}>Open requests raised by supervisors</p>
                      </div>
                    </div>
                    {dashboardSoftLoading ? (
                      <p style={{ color: "#94a3b8", fontSize: "13px", padding: "8px 0" }}>Loading…</p>
                    ) : dashboardSoftRequests.length === 0 ? (
                      <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "8px", fontSize: "13px" }}>
                        ✅ No open soft service requests
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {dashboardSoftRequests.map((sr) => (
                          <div key={sr.id} style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 12px", borderRadius: "8px", border: "1px solid #f1f5f9", background: "#fafafa" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
                                <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: "20px", fontSize: "10.5px", fontWeight: 700, background: "#dcfce7", color: "#166534", textTransform: "capitalize" }}>
                                  SOFT SERVICE
                                </span>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: "12.5px", color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {sr.assetName || `Asset #${sr.assetId}`}
                                </p>
                              </div>
                              <p style={{ margin: 0, fontSize: "11.5px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {sr.templateName || "Soft checklist"}{sr.raisedByName ? ` — by ${sr.raisedByName}` : ""}
                              </p>
                              <p style={{ margin: "3px 0 0", fontSize: "10.5px", color: "#94a3b8" }}>
                                {sr.raisedAt ? new Date(sr.raisedAt).toLocaleString() : ""}
                              </p>
                            </div>
                            <span style={{ flexShrink: 0, padding: "4px 10px", borderRadius: "6px", border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: "11.5px", fontWeight: 600 }}>
                              Open
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  )}

                  </div>{/* end right column */}
                </div>{/* end 2-col grid */}

                {/* Assign Work Order Modal */}
                {dashWOAssign && (
                  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "480px", maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
                      <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 700, color: "#0f172a", marginBottom: "6px" }}>Assign Work Order</h3>
                      <p style={{ margin: "0 0 18px", fontSize: "13px", color: "#64748b" }}>
                        {dashWOAssign.workOrderNumber || `WO-${dashWOAssign.id}`} — {dashWOAssign.assetName || "No asset"}
                      </p>
                      {dashWOAssignErr && (
                        <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>
                          {dashWOAssignErr}
                        </div>
                      )}
                      <div style={{ marginBottom: "14px" }}>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>
                          Assign To <span style={{ color: "#ef4444" }}>*</span>
                        </label>
                        <select value={dashWOAssignUser} onChange={(e) => setDashWOAssignUser(e.target.value)}
                          style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", background: "#fff" }}>
                          <option value="">— Select employee —</option>
                          {dashboardWOUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.fullName} ({u.role}{u.designation ? ` · ${u.designation}` : ""})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div style={{ marginBottom: "20px" }}>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Note (optional)</label>
                        <textarea value={dashWOAssignNote} onChange={(e) => setDashWOAssignNote(e.target.value)}
                          placeholder="Instructions for assignee…" rows={3}
                          style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", resize: "vertical" }} />
                      </div>
                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                        <button onClick={() => setDashWOAssign(null)}
                          style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                          Cancel
                        </button>
                        <button
                          disabled={dashWOAssignSaving}
                          onClick={async () => {
                            if (!dashWOAssignUser) { setDashWOAssignErr("Please select a user."); return; }
                            setDashWOAssignSaving(true);
                            setDashWOAssignErr(null);
                            try {
                              await assignCompanyPortalWorkOrder(token, dashWOAssign.id, {
                                assignedTo: Number(dashWOAssignUser),
                                assignedNote: dashWOAssignNote || undefined,
                              });
                              setDashboardWorkOrders((prev) =>
                                prev.map((w) => w.id === dashWOAssign.id ? { ...w, assignedTo: Number(dashWOAssignUser) } : w)
                              );
                              setDashWOAssign(null);
                            } catch (e) {
                              setDashWOAssignErr(e.message || "Assignment failed");
                            } finally {
                              setDashWOAssignSaving(false);
                            }
                          }}
                          style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: dashWOAssignSaving ? "not-allowed" : "pointer", opacity: dashWOAssignSaving ? 0.7 : 1 }}>
                          {dashWOAssignSaving ? "Saving…" : "Assign"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {recentTable}
              </div>}
            </div>
            );
          })()
        })()}

        {/* ── Departments ────────────────────────────────────────── */}
        {nav === "departments" && (() => {
          const isAdmin = currentUser.role === "admin";
          return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Departments</h1>
                <p style={{ color: "#64748b", fontSize: "13.5px" }}>Operational departments within {currentUser.companyName}</p>
              </div>
              {isAdmin && (
                <Btn onClick={() => { setEditDept(null); setShowDeptModal(true); }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Department
                </Btn>
              )}
            </div>
            {errors.departments && <Alert>{errors.departments}</Alert>}
            <Card>
              <CardHeader title="All Departments" subtitle={`${filteredDepts.length} departments`} action={
                <input value={deptSearch} onChange={(e) => setDeptSearch(e.target.value)} placeholder="Search…"
                  style={{ padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", outline: "none", width: "180px" }} />
              } />
              {loading.departments
                ? <p style={{ padding: "24px", color: "#94a3b8", textAlign: "center" }}>Loading…</p>
                : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <thead>
                      <tr>
                        {["#", "Department Name", "Description", "Created", ...(isAdmin ? ["Actions"] : [])].map((h) => (
                          <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDepts.length === 0
                        ? <tr><td colSpan={isAdmin ? 5 : 4} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No departments found</td></tr>
                        : filteredDepts.map((d, i) => (
                          <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: 600 }}>{i + 1}</td>
                            <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>{d.departmentName}</td>
                            <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>{d.description || "—"}</td>
                            <td style={{ padding: "14px 16px", color: "#94a3b8", fontSize: "12px" }}>{d.createdAt ? new Date(d.createdAt).toLocaleDateString() : "—"}</td>
                            {isAdmin && (
                              <td style={{ padding: "12px 16px" }}>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button title="Edit" onClick={() => { setEditDept(d); setShowDeptModal(true); }}
                                    style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button title="Delete" onClick={() => handleDeleteDept(d.id)}
                                    style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
            </Card>

          </div>
          );
        })()}

        {/* ── Assets ────────────────────────────────────────────── */}
        {nav === "assets" && (() => {
          const isAdmin = currentUser.role === "admin";
          const assetPerms = currentUser?.permissions?.assets || {};
          const canAssetCreate = isAdmin || assetPerms.c === true || assetPerms.create === true;
          const canAssetRead = isAdmin || assetPerms.r === true || assetPerms.read === true || assetPerms.view === true;
          const canAssetUpdate = isAdmin || assetPerms.u === true || assetPerms.update === true || assetPerms.edit === true;
          const canAssetDelete = isAdmin || assetPerms.d === true || assetPerms.delete === true || assetPerms.remove === true;
          const canAssetAction = canAssetRead || canAssetUpdate || canAssetDelete;
          return (
          <div style={{ maxWidth: "100%" }}>
            {/* Sub-tab navigation — Analytics tab hidden; only Manage Assets is visible */}

            {/* Analytics Dashboard */}
            {assetSubNav === "dashboard" && (
              <AssetDashboard
                endpointPrefix="/api/company-portal/asset-dashboard"
                token={token}
                companyId={currentUser.companyId}
                assetList={assets}
                onAddAsset={canAssetCreate ? () => { setEditAsset(null); setShowAssetModal(true); setAssetSubNav("manage"); } : undefined}
                onEditAsset={canAssetUpdate ? (a) => { setEditAsset(a); setShowAssetModal(true); } : undefined}
                onDeleteAsset={canAssetDelete ? handleDeleteAsset : undefined}
              />
            )}

            {/* Manage Assets */}
            {assetSubNav === "manage" && (<div style={{ paddingTop: "0" }}>

            {/* Sticky header: title + combined filter+buttons row */}
            {/* Page header: title + action buttons */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Assets</h1>
                <p style={{ color: "#64748b", fontSize: "13.5px", margin: 0 }}>All registered assets · {filteredAssets.length} total</p>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                {isAdmin && (<>
                  {/* Print selected */}
                  {selectedQrIds.size > 0 && (
                    <button disabled={bulkQrPrinting} onClick={() => { const toPrint = filteredAssets.filter(a => selectedQrIds.has(a.id)); openQrCodePrintWindow(toPrint); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 12px", borderRadius: "8px", background: "#f3e8ff", color: "#7c3aed", border: "1px solid #e9d5ff", cursor: "pointer", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/></svg>
                      QR ({selectedQrIds.size})
                    </button>
                  )}
                  {/* Bulk delete */}
                  {selectedQrIds.size > 0 && (
                    <button onClick={handleBulkDeleteAssets}
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 12px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      Delete ({selectedQrIds.size})
                    </button>
                  )}
                  {/* Print All QR */}
                  <button disabled={bulkQrPrinting || filteredAssets.length === 0} onClick={() => openQrCodePrintWindow(filteredAssets)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 13px", borderRadius: "8px", background: "#fdf4ff", color: "#9333ea", border: "1px solid #f0abfc", cursor: "pointer", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/></svg>
                    {bulkQrPrinting ? "Generating…" : "Print All QR"}
                  </button>
                  {/* Add Asset */}
                  {canAssetCreate && (
                    <button onClick={() => { setEditAsset(null); setShowAssetModal(true); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 13px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "none", background: "#2563eb", color: "#fff" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Asset
                    </button>
                  )}
                  {/* Import Excel */}
                  <button onClick={() => { setBulkAssetFile(null); setBulkAssetDeptId(""); setBulkAssetResult(null); setShowBulkAssetImport(true); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 13px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: "pointer", border: "1.5px solid #2563eb", background: "#eff6ff", color: "#2563eb", whiteSpace: "nowrap" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Import Excel
                  </button>
                </>)}
              </div>
            </div>
            {errors.assets && <div style={{ marginBottom: "10px", padding: "10px 14px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", fontSize: "13px" }}>{errors.assets}</div>}

            {/* White card: "Asset List" header + filters row + table */}
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", margin: 0, lineHeight: 1.3 }}>Asset List</p>
                  <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px", marginBottom: 0 }}>{filteredAssets.length} assets</p>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                  <select value={assetStatusFilter} onChange={(e) => setAssetStatusFilter(e.target.value)}
                    style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12.5px", background: "#fff", outline: "none" }}>
                    <option value="">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Working">Working</option>
                    <option value="Verified">Verified</option>
                    <option value="Unverified">Unverified</option>
                    <option value="Inactive">Inactive</option>
                    <option value="WIP">WIP</option>
                    <option value="Not Working">Not Working</option>
                    <option value="RBER">RBER</option>
                    <option value="Condemned">Condemned</option>
                    <option value="Critical">Critical</option>
                    <option value="Non_Critical">Non-Critical</option>
                  </select>
                  <input value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Search anything..."
                    style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12.5px", outline: "none", width: "160px" }} />
                  <button onClick={() => setShowAdvancedFilter(v => !v)}
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 11px", borderRadius: "7px", background: showAdvancedFilter ? "#eff6ff" : "#f8fafc", color: showAdvancedFilter ? "#2563eb" : "#475569", border: `1px solid ${showAdvancedFilter ? "#93c5fd" : "#e2e8f0"}`, cursor: "pointer", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    Advanced Filter
                  </button>
                  {isAdmin && (
                    <button onClick={() => {
                      const headers = ["SN","Asset ID","Equipment Name","Category","Make","Model","Serial No","Accessories","Department","Building","Floor","Room","Mfg. Year","Installation Date","Invoice No","Purchase Date","Purchase Cost","Maintenance","RBER","Remarks","Working Status","Verified Status","Tagged By","Tagged At","Created At"];
                      const rows = filteredAssets.map((a, i) => {
                        const m = a.metadata || {};
                        const maint = [m.warranty?"Warranty":"", m.amc?"AMC":"", m.cmc?"CMC":"", m.inHouse?"In House":"", m.catalyst?"Catalyst":""].filter(Boolean).join("; ");
                        const isVerified = Number(a.isVerified) === 1 || a.isVerified === true;
                        const workingStatus = m.workingStatus || "";
                        const verifiedStatus = isVerified ? "Verified" : workingStatus === "Condemned" ? "Condemned" : m.rber ? "RBER" : workingStatus || a.status || "Active";
                        return [
                          i+1,
                          a.generatedAssetId||a.assetUniqueId||a.asset_unique_id||"",
                          m.equipmentName||a.assetName||a.asset_name||"",
                          (m.criticality||a.criticality||"Non-Critical"),
                          m.make||m.manufacturer||"", m.model||"", m.serialNo||"",
                          m.accessories||"", a.departmentName||"",
                          a.building||"", a.floor||"", a.room||"",
                          m.mfgYear||m.manufacturingYear||"", m.installationDate||"",
                          m.invoiceNo||"", m.purchaseDate||"", m.purchaseCost||"",
                          maint, m.rber?"Yes":"No", m.remarks||"",
                          workingStatus||"Working", verifiedStatus,
                          a.createdByName||"",
                          a.createdAt ? new Date(a.createdAt).toLocaleString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : "",
                          a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-IN") : "",
                        ].map(v => `"${String(v==null?"":v).replace(/"/g,'""')}"`).join(",");
                      });
                      const csv = [headers.join(","), ...rows].join("\n");
                      const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const el = document.createElement("a"); el.href = url; el.download = "assets.csv"; el.click(); URL.revokeObjectURL(url);
                    }} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "7px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      Export Excel
                    </button>
                  )}
                </div>
              </div>
              {/* Advanced Filter Panel */}
              {showAdvancedFilter && (
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Department</label>
                    <select value={advFilterDept} onChange={e => setAdvFilterDept(e.target.value)}
                      style={{ padding: "5px 9px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", background: "#fff", outline: "none", minWidth: "140px" }}>
                      <option value="">All Departments</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.departmentName || d.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Building</label>
                    <input value={advFilterBuilding} onChange={e => setAdvFilterBuilding(e.target.value)} placeholder="Building name..."
                      style={{ padding: "5px 9px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", outline: "none", width: "130px" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Category</label>
                    <select value={advFilterCategory} onChange={e => setAdvFilterCategory(e.target.value)}
                      style={{ padding: "5px 9px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", background: "#fff", outline: "none" }}>
                      <option value="">All Categories</option>
                      <option value="critical">Critical</option>
                      <option value="non_critical">Non-Critical</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Maintenance</label>
                    <select value={advFilterMaint} onChange={e => setAdvFilterMaint(e.target.value)}
                      style={{ padding: "5px 9px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", background: "#fff", outline: "none" }}>
                      <option value="">All</option>
                      <option value="warranty">Warranty</option>
                      <option value="amc">AMC</option>
                      <option value="cmc">CMC</option>
                      <option value="in house">In House</option>
                      <option value="catalyst">Catalyst</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>RBER</label>
                    <select value={advFilterRber} onChange={e => setAdvFilterRber(e.target.value)}
                      style={{ padding: "5px 9px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", background: "#fff", outline: "none" }}>
                      <option value="">All</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Tagged From</label>
                    <input type="date" value={advFilterDateFrom} onChange={e => setAdvFilterDateFrom(e.target.value)}
                      style={{ padding: "5px 9px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", outline: "none" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <label style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>Tagged To</label>
                    <input type="date" value={advFilterDateTo} onChange={e => setAdvFilterDateTo(e.target.value)}
                      style={{ padding: "5px 9px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", outline: "none" }} />
                  </div>
                  <button onClick={() => { setAdvFilterDept(""); setAdvFilterBuilding(""); setAdvFilterCategory(""); setAdvFilterMaint(""); setAdvFilterRber(""); setAdvFilterDateFrom(""); setAdvFilterDateTo(""); }}
                    style={{ padding: "5px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer", fontSize: "12px", fontWeight: 600, alignSelf: "flex-end" }}>
                    Clear
                  </button>
                </div>
              )}
              {loading.assets
                ? <p style={{ padding: "24px", color: "#94a3b8", textAlign: "center" }}>Loading…</p>
                : (
                  <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "65vh" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "1600px" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr>
                        {isAdmin && (
                          <th style={{ padding: "12px 16px", textAlign: "center", color: "#475569", fontWeight: 600, fontSize: "12px", background: "#f1f5f9", borderBottom: "2px solid #e2e8f0", width: "40px" }}>
                            <input type="checkbox" checked={filteredAssets.length > 0 && filteredAssets.every(a => selectedQrIds.has(a.id))}
                              onChange={(e) => setSelectedQrIds(e.target.checked ? new Set(filteredAssets.map(a => a.id)) : new Set())}
                              title="Select all" style={{ cursor: "pointer" }} />
                          </th>
                        )}
                        {["SN", "Asset ID", "Equipment Name", "Category", "Make", "Model", "Sr. No.", "Accessories", "Department", "Maintenance", "Dealer/Distributor", "Mfg. Year", "Installation Date", "Invoice No.", "Purchase Date", "Purchase Cost", "RBER", "Remarks", "Tagged By", "Tagged At", "Assigned To", "Status", ...(canAssetAction ? ["Actions"] : [])].map((h) => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", background: "#f1f5f9", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssets.length === 0
                        ? <tr><td colSpan={isAdmin ? 23 : (canAssetAction ? 22 : 21)} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No assets found</td></tr>
                        : filteredAssets.map((a, i) => {
                          const m = a.metadata || {};
                          const mt = m.maintenanceTypes || { warranty: !!(m.warranty?.enabled), amc: !!(m.amc?.enabled), cmc: !!(m.cmc?.enabled), inHouse: !!(m.inHouse), catalyst: !!(m.catalyst), highEnd: !!(m.highEnd) };
                          const maint = [mt.warranty && "Warranty", mt.amc && "AMC", mt.cmc && "CMC", mt.inHouse && "In House", mt.catalyst && "Catalyst", mt.highEnd && "High End"].filter(Boolean).join(", ") || m.maintenanceType || "—";
                          return (
                          <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9", background: selectedQrIds.has(a.id) ? "#f0fdf4" : undefined }}>
                            {isAdmin && (
                              <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                <input type="checkbox" checked={selectedQrIds.has(a.id)}
                                  onChange={(e) => setSelectedQrIds(prev => { const n = new Set(prev); e.target.checked ? n.add(a.id) : n.delete(a.id); return n; })}
                                  style={{ cursor: "pointer" }} />
                              </td>
                            )}
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{i + 1}</td>
                            <td style={{ padding: "10px 14px", color: (a.isVerified || Number(a.verified) === 1) ? "#16a34a" : "#dc2626", fontFamily: "monospace", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", textDecoration: "underline" }}
                              title="Click to open asset details in new window"
                              onClick={() => window.open(`/company/asset/${a.id}`, '_blank')}>{a.generatedAssetId || a.assetUniqueId || "—"}</td>
                            <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}
                              title="Click to view asset details"
                              onClick={() => setAssetDetailModal(a)}>{m.equipmentName || a.assetName || "—"}</td>
                            <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}><span style={{ padding: "2px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: (a.criticality || m.criticality) === "Critical" ? "#fce7f3" : "#f0fdf4", color: (a.criticality || m.criticality) === "Critical" ? "#9d174d" : "#16a34a" }}>{(a.criticality || m.criticality) === "Critical" ? "Critical" : "Non-Critical"}</span></td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.make || m.manufacturer || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.model || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{m.serialNo || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>{m.accessories || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{a.departmentName || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{maint}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.dealer || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{m.manufacturingYear || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.installationDate || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{m.invoiceNo || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.purchaseDate || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.purchaseCost ? `₹ ${m.purchaseCost}` : "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{m.rber || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>{m.remarks || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#475569", fontSize: "12px", whiteSpace: "nowrap" }}>{a.createdByName || "—"}</td>
                            <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{a.createdAt ? new Date(a.createdAt).toLocaleString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }) : "—"}</td>
                            <td style={{ padding: "10px 14px" }}>
                              {isAdmin ? (
                                <select
                                  value={a.assignedTo || ""}
                                  onChange={e => handleAssignAsset(a.id, e.target.value)}
                                  style={{ padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", background: "#fff", maxWidth: "160px", outline: "none" }}>
                                  <option value="">— Unassigned —</option>
                                  {employees.map(e => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                                </select>
                              ) : (
                                <span style={{ fontSize: "12px", color: a.assignedToName ? "#0f172a" : "#94a3b8" }}>{a.assignedToName || "Unassigned"}</span>
                              )}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              {(() => {
                                const meta = a.metadata || {};
                                const ws = a.workingStatus || a.working_status || meta.workingStatus || "Working";
                                const crit = a.criticality || meta.criticality || "Non_Critical";
                                const st = a.status || "Active";
                                // Derive combined display value
                                const combined = st === "Inactive" ? "Inactive"
                                  : st === "Unverified" ? "Unverified"
                                  : (a.isVerified || st === "Verified") ? "Verified"
                                  : ws === "Condemned" ? "Condemned"
                                  : meta.rber ? "RBER"
                                  : ws === "Not_Working" ? "Not_Working"
                                  : ws === "WIP" ? "WIP"
                                  : crit === "Critical" ? "Critical"
                                  : ws === "Working" ? "Working"
                                  : "Active";
                                const COLOR_MAP = {
                                  Active:       { bg: "#f0fdf4", color: "#16a34a" },
                                  Working:      { bg: "#f0fdf4", color: "#16a34a" },
                                  Unverified:   { bg: "#fff7ed", color: "#ea580c" },
                                  Inactive:     { bg: "#f8fafc", color: "#94a3b8" },
                                  Verified:     { bg: "#dbeafe", color: "#1d4ed8" },
                                  WIP:          { bg: "#fef9c3", color: "#92400e" },
                                  Not_Working:  { bg: "#fef2f2", color: "#dc2626" },
                                  Critical:     { bg: "#fce7f3", color: "#9d174d" },
                                  RBER:         { bg: "#fff7ed", color: "#ea580c" },
                                  Condemned:    { bg: "#f5f3ff", color: "#7c3aed" },
                                };
                                const cm = COLOR_MAP[combined] || COLOR_MAP.Active;
                                if (!canAssetUpdate) return <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: cm.bg, color: cm.color }}>{combined.replace(/_/g, " ")}</span>;
                                return (
                                  <select
                                    value={combined}
                                    onChange={e => {
                                      const v = e.target.value;
                                      if (v === "Unverified")       handleHCStatusUpdate(a.id, { status: "Unverified", isVerified: false });
                                      else if (v === "Working")     handleHCStatusUpdate(a.id, { status: "Active", workingStatus: "Working", isVerified: false });
                                      else if (v === "Inactive")    handleHCStatusUpdate(a.id, { status: "Inactive", isVerified: false });
                                      else if (v === "Verified")    handleHCStatusUpdate(a.id, { status: "Active", isVerified: true, workingStatus: "Working" });
                                      else if (v === "WIP")         handleHCStatusUpdate(a.id, { workingStatus: "WIP", status: "Active", isVerified: false });
                                      else if (v === "Not_Working") handleHCStatusUpdate(a.id, { workingStatus: "Not_Working", status: "Active", isVerified: false });
                                      else if (v === "RBER")        handleHCStatusUpdate(a.id, { workingStatus: "Not_Working", status: "Active", isVerified: false, rber: true });
                                      else if (v === "Condemned")   handleHCStatusUpdate(a.id, { workingStatus: "Condemned", status: "Active", isVerified: false });
                                      else                           handleHCStatusUpdate(a.id, { status: "Active", workingStatus: "Working", isVerified: false });
                                    }}
                                    style={{ padding: "4px 8px", border: `1px solid ${cm.color}40`, borderRadius: "8px", fontSize: "12px", fontWeight: 700, background: cm.bg, color: cm.color, cursor: "pointer", outline: "none" }}>
                                    <option value="Unverified">⚠ Unverified</option>
                                    <option value="Working">Working</option>
                                    <option value="Active">Active</option>
                                    <option value="Verified">Verified</option>
                                    <option value="Inactive">Inactive</option>
                                    <option value="WIP">WIP</option>
                                    <option value="Not_Working">Not Working</option>
                                    <option value="RBER">RBER</option>
                                    <option value="Condemned">Condemned</option>
                                  </select>
                                );
                              })()}
                            </td>
                            {canAssetAction && (
                              <td style={{ padding: "10px 14px" }}>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  {canAssetRead && (
                                    <button title="View QR Code" onClick={() => setAssetViewQrModal(a)}
                                      style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#fdf4ff", color: "#9333ea", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/></svg>
                                    </button>
                                  )}
                                  {canAssetUpdate && (
                                    <button title="Edit" onClick={() => { setEditAsset(a); setShowAssetModal(true); }}
                                      style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                  )}
                                  {canAssetDelete && (
                                    <button title="Delete" onClick={() => handleDeleteAsset(a.id)}
                                      style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                        })}
                    </tbody>
                  </table>
                  </div>
                )}
            </div>{/* end white card */}
            </div>)}
          </div>
          );
        })()}

        {/* ── Checklists ────────────────────────────────────────── */}
        {nav === "checklists" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {/* Sub-navigation tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
              {[{ k: "templates", label: "Templates" }, { k: "submissions", label: "Submissions & Reports" }].map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setChecklistSubNav(k)}
                  style={{ padding: "10px 20px", background: "none", border: "none",
                    borderBottom: checklistSubNav === k ? "3px solid #2563eb" : "3px solid transparent",
                    marginBottom: "-2px", fontSize: "14px", fontWeight: 600,
                    color: checklistSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            {checklistSubNav === "templates" && (
              <ChecklistTemplateModule
                token={token}
                companies={[{ id: currentUser.companyId, companyName: currentUser.companyName }]}
                shifts={shifts}
                fetchTemplates={getCompanyPortalChecklists}
                createTemplate={createCompanyPortalChecklist}
                fetchTemplate={null}
                updateTemplate={updateCompanyPortalChecklist}
                deleteTemplate={deleteCompanyPortalChecklist}
                canBuild={currentUser.role === "admin" || currentUser.role === "supervisor"}
                companyId={currentUser.companyId}
                companyPortalMode={true}
              />
            )}
            {checklistSubNav === "submissions" && (
              <SubmissionsPanel token={token} type="checklists" />
            )}
          </div>
        )}

        {/* ── Logsheets ─────────────────────────────────────────── */}
        {nav === "logsheets" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            {/* Sub-navigation tabs */}
            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>
              {[{ k: "templates", label: "Templates" }, { k: "submissions", label: "Submissions & Reports" }].map(({ k, label }) => (
                <button key={k} type="button" onClick={() => setLogsheetSubNav(k)}
                  style={{ padding: "10px 20px", background: "none", border: "none",
                    borderBottom: logsheetSubNav === k ? "3px solid #2563eb" : "3px solid transparent",
                    marginBottom: "-2px", fontSize: "14px", fontWeight: 600,
                    color: logsheetSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>
            {logsheetSubNav === "templates" && (
              <LogsheetModule
                token={token}
                assets={assets.length ? assets : []}
                shifts={shifts}
                companies={[{ id: currentUser.companyId, companyName: currentUser.companyName }]}
                fetchTemplates={getCompanyPortalLogsheetTemplates}
                fetchTemplate={getCompanyPortalLogsheetTemplate}
                fetchEntries={getCompanyPortalLogsheetEntries}
                submitEntry={submitCompanyPortalLogsheetEntry}
                createTemplate={createCompanyPortalLogsheetTemplate}
                updateTemplate={updateCompanyPortalLogsheetTemplate}
                deleteTemplate={deleteCompanyPortalLogsheetTemplate}
                assignTemplate={assignCompanyPortalLogsheetTemplate}
                fetchGrid={getCompanyPortalLogsheetGrid}
                canBuild={currentUser.role === "admin" || currentUser.role === "supervisor"}
                companyPortalMode={true}
                directFill={directFillLogsheet}
                onDirectFillConsumed={() => setDirectFillLogsheet(null)}
              />
            )}
            {logsheetSubNav === "submissions" && (
              <SubmissionsPanel token={token} type="logsheets" />
            )}
          </div>
        )}

        {/* ── Warnings ──────────────────────────────────────── */}
        {nav === "warnings" && (
          <WarningsPanel
            token={token}
            companyId={currentUser.companyId}
            companies={[{ id: currentUser.companyId, companyName: currentUser.companyName }]}
          />
        )}

        {/* ── Requests ──────────────────────────────────────────── */}
        {nav === "requests" && (() => {
          const isAdmin = currentUser.role === "admin";
          const reqPerms = currentUser?.permissions?.requests || currentUser?.permissions?.workorders || {};
          const canRequestRead = isAdmin || reqPerms.r === true || reqPerms.read === true || reqPerms.view === true;
          const canRequestManage = isAdmin || reqPerms.c === true || reqPerms.create === true || reqPerms.u === true || reqPerms.update === true || reqPerms.edit === true || reqPerms.d === true || reqPerms.delete === true || reqPerms.resolve === true;

          if (!canRequestRead) {
            return (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", color: "#64748b" }}>
                You do not have permission to view requests.
              </div>
            );
          }

          return (
            <RequestTrackingPanel
              token={token}
              companyPortalToken={token}
              companyId={currentUser.companyId}
              employees={employees}
              departments={departments}
              isAdmin={isAdmin && canRequestManage}
              isSupervisor={currentUser.role === "supervisor" && canRequestManage}
            />
          );
        })()}

        {/* ── Asset Queries (QR scan requests) ─────────────── */}
        {nav === "asset-queries" && (() => {
          const isAdmin = currentUser.role === "admin" || currentUser.role === "supervisor";
          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>
                <div>
                  <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Asset Requests</h1>
                  <p style={{ color: "#64748b", fontSize: "13.5px" }}>Queries raised by employees via QR scan</p>
                </div>
                <button onClick={() => { setAssetQueriesLoading(true); getAssetQueries(token).then((d) => { setAssetQueries(d || []); setAssetQueriesLoading(false); }).catch(() => setAssetQueriesLoading(false)); }}
                  style={{ padding: "9px 18px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                  ↻ Refresh
                </button>
              </div>
              {/* Search bar */}
              <div style={{ marginBottom: "16px", position: "relative", maxWidth: "400px" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={requestSearch} onChange={e => setRequestSearch(e.target.value)} placeholder="Search by request ID, asset name, QR code, title…"
                  style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 34px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff" }} />
              </div>
              {assetQueriesLoading
                ? <p style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading…</p>
                : assetQueries.length === 0
                  ? <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>No requests yet</div>
                  : (() => {
                    const term = requestSearch.toLowerCase().trim();
                    const displayed = term ? assetQueries.filter(q =>
                      String(q.id).includes(term) ||
                      (q.assetName || "").toLowerCase().includes(term) ||
                      (q.assetUniqueId || "").toLowerCase().includes(term) ||
                      (q.title || "").toLowerCase().includes(term) ||
                      (q.description || "").toLowerCase().includes(term)
                    ) : assetQueries;
                    return (
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      {displayed.length === 0 && <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>No requests match your search.</div>}
                      {displayed.map(q => {
                        const isOverdue = q.status === "open" && q.createdAt && ((Date.now() - new Date(q.createdAt).getTime()) / 36e5) > (q.cutoffHours || 24);
                        const isExpanded = expandedQueryId === q.id;
                        const imgs = (() => { try { return Array.isArray(q.images) ? q.images : (q.images ? JSON.parse(q.images) : []); } catch { return []; } })();
                        return (
                          <div key={q.id} style={{ background: "#fff", border: `1.5px solid ${isOverdue ? "#fca5a5" : q.escalationLevel > 0 ? "#fbbf24" : "#e2e8f0"}`, borderRadius: "12px", overflow: "hidden" }}>
                            {/* Clickable header row */}
                            <div style={{ padding: "16px 20px", cursor: "pointer" }} onClick={() => setExpandedQueryId(isExpanded ? null : q.id)}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px", flexWrap: "wrap" }}>
                                    {isOverdue && <span style={{ background: "#fef2f2", color: "#dc2626", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px" }}>OVERDUE</span>}
                                    {q.escalationLevel > 0 && <span style={{ background: "#fffbeb", color: "#d97706", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px" }}>ESCALATED L{q.escalationLevel}</span>}
                                    <span style={{ background: q.status === "resolved" ? "#f0fdf4" : "#eff6ff", color: q.status === "resolved" ? "#16a34a" : "#2563eb", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "20px" }}>{(q.status || "open").toUpperCase()}</span>
                                    {q.priority && <span style={{ background: "#f1f5f9", color: "#475569", fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "20px" }}>{q.priority}</span>}
                                  </div>
                                  <div style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", marginBottom: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.title || q.message || "(no title)"}</div>
                                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                                    <span style={{ fontFamily: "monospace", background: "#f1f5f9", padding: "1px 6px", borderRadius: "4px", marginRight: "6px" }}>{q.assetUniqueId || `Asset #${q.assetId}`}</span>
                                    {q.assetName} · {q.createdAt ? new Date(q.createdAt).toLocaleString() : ""}
                                  </div>
                                </div>
                                <span style={{ color: "#94a3b8", fontSize: "18px", flexShrink: 0 }}>{isExpanded ? "▲" : "▼"}</span>
                              </div>
                            </div>

                            {/* Expanded detail panel */}
                            {isExpanded && (
                              <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px 20px", background: "#f8fafc" }}>
                                {/* Detail rows */}
                                {[
                                  ["Asset QR Code", q.assetUniqueId || `Asset #${q.assetId}`],
                                  ["Asset Name", q.assetName],
                                  ["Issue Title", q.title || q.message],
                                  ["Description", q.description],
                                  ["Priority", q.priority],
                                  ["Status", (q.status || "open").toUpperCase()],
                                  ["Raised By", q.raisedByName || q.requesterName],
                                  ["Assigned To", q.assignedToName],
                                  ["Date Raised", q.createdAt ? new Date(q.createdAt).toLocaleString() : null],
                                  ["Date Resolved", q.resolvedAt ? new Date(q.resolvedAt).toLocaleString() : null],
                                  ["Cutoff Hours", q.cutoffHours ? `${q.cutoffHours} hrs` : null],
                                  ["Escalation Level", q.escalationLevel > 0 ? `Level ${q.escalationLevel}` : null],
                                ].filter(([, v]) => v).map(([label, value]) => (
                                  <div key={label} style={{ display: "flex", gap: "12px", paddingBottom: "8px", borderBottom: "1px solid #e2e8f0", marginBottom: "8px" }}>
                                    <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, minWidth: "130px", flexShrink: 0 }}>{label}</span>
                                    <span style={{ fontSize: "13px", color: "#0f172a", flex: 1, wordBreak: "break-word" }}>{value}</span>
                                  </div>
                                ))}

                                {/* Images */}
                                {imgs.length > 0 && (
                                  <div style={{ marginTop: "8px" }}>
                                    <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, marginBottom: "8px" }}>ATTACHED IMAGES ({imgs.length})</div>
                                    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                      {imgs.map((img, i) => {
                                        const raw = typeof img === "string"
                                          ? img
                                          : (img && typeof img === "object" ? (img.url || img.src || img.path || "") : "");
                                        if (!raw || typeof raw !== "string") return null;
                                        const src = raw.startsWith("http") || raw.startsWith("/") ? raw : `${window.location.origin}${raw}`;
                                        return (
                                          <a key={i} href={src} target="_blank" rel="noreferrer" style={{ display: "block", flexShrink: 0 }}>
                                            <img src={src} alt={`img-${i+1}`}
                                              style={{ width: "90px", height: "90px", objectFit: "cover", borderRadius: "10px", border: "1.5px solid #e2e8f0", cursor: "pointer" }}
                                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                                            />
                                          </a>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}

                                  <div style={{ display: "flex", gap: "8px", marginTop: "14px", flexWrap: "wrap" }}>
                                    {q.status === "open" && (<>
                                    <button onClick={(e) => { e.stopPropagation(); handleResolveQuery(q.id); }}
                                      style={{ padding: "8px 18px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                                      ✓ Mark Resolved
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); escalateAssetQuery(token, q.id).then(() => setAssetQueries(p => p.map(x => x.id === q.id ? { ...x, escalationLevel: (x.escalationLevel || 0) + 1 } : x))); }}
                                      style={{ padding: "8px 18px", background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
                                      ↑ Escalate
                                    </button>
                                    </>)}
                                    {isAdmin && (
                                      <button onClick={async (e) => { e.stopPropagation(); if (!window.confirm("Delete this request permanently?")) return; try { await deleteAssetQuery(token, q.id); setAssetQueries(p => p.filter(x => x.id !== q.id)); } catch (err) { alert(err.message || "Delete failed"); } }}
                                        style={{ padding: "8px 18px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}>
                                        🗑 Delete
                                      </button>
                                    )}
                                  </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    );
                  })()
              }
            </div>
          );
        })()}


        {/* ── Locations ─────────────────────────────────────────── */}
        {nav === "locations" && currentUser?.role === "admin" && (
          <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px", background: "#f8fafc" }}>
            <AdminLocationsSection token={token} companies={[{ id: currentUser.companyId, companyName: currentUser.companyName }]} />
          </main>
        )}

        {/* ── QR Codes ──────────────────────────────────────────── */}
        {nav === "qrcodes" && (() => {
          const linked = preQrCodes.filter((q) => q.assetId);
          const unlinked = preQrCodes.filter((q) => !q.assetId);
          const filteredQrCodes = (qrFilter === "linked" ? linked : qrFilter === "unlinked" ? unlinked : preQrCodes)
            .filter(q => !qrSearch || (q.qrUniqueId || "").toLowerCase().includes(qrSearch.toLowerCase()) || (q.assetName || "").toLowerCase().includes(qrSearch.toLowerCase()) || (q.assetUniqueId || "").toLowerCase().includes(qrSearch.toLowerCase()));

          const handleGenerate = async () => {
            if (!preQrCount || preQrCount < 1) return;
            setPreQrGenerating(true);
            qrStopRef.current = false;
            let generated = 0;
            try {
              const res = await generatePreQrCodes(token, preQrCount);
              if (!qrStopRef.current && res && !res.message) {
                const arr = Array.isArray(res) ? res : [res];
                generated = arr.length;
                setPreQrCodes((prev) => [...arr, ...prev]);
              }
            } catch (e) { console.error(e); }
            setPreQrGenerating(false);
            qrStopRef.current = false;
            if (generated > 0) {
              setQrAlert({ count: generated });
              setTimeout(() => setQrAlert(null), 5000);
            }
          };
          const handleStopGenerate = () => { qrStopRef.current = true; setPreQrGenerating(false); };

          const handlePrintSelected = (qrList) => openPreQrPrintWindow(qrList);

          // ── View QR modal ─────────────────────────────────────────
          // ViewQrModal uses pre-generated HTML from parent state to avoid remount reload loops
          const ViewQrModal = ({ qr, onClose }) => (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={onClose}>
              <div style={{ background: "transparent", textAlign: "center", transform: "scale(0.7)", transformOrigin: "center center" }} onClick={(e) => e.stopPropagation()}>
                {viewQrCardHtml
                  ? <div dangerouslySetInnerHTML={{ __html: viewQrCardHtml }} style={{ display: "inline-block" }} />
                  : <div style={{ width: "300px", height: "380px", background: "#fff", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "14px" }}>Generating card…</div>
                }
                <div style={{ display: "flex", gap: "10px", marginTop: "16px", justifyContent: "center" }}>
                  <button onClick={() => handlePrintSelected([qr])} style={{ padding: "9px 22px", borderRadius: "9px", border: "none", background: "#0f172a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "13px" }}>Print</button>
                  <button onClick={onClose} style={{ padding: "9px 22px", borderRadius: "9px", border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Close</button>
                </div>
              </div>
            </div>
          );

          // ── Register Asset modal (create new asset and link to QR) ─
          const MAINT_OPTIONS = ["warranty","amc","cmc","inHouse","catalyst"];
          const RegisterAssetModal = ({ qr, onClose }) => {
            const [assetName,           setAssetName]           = useState("");
            const [make,                setMake]                = useState("");
            const [manufacturerCompany, setManufacturerCompany] = useState("");
            const [model,               setModel]               = useState("");
            const [serialNo,            setSerialNo]            = useState("");
            const [accessories,         setAccessories]         = useState("");
            const [dealer,              setDealer]              = useState("");
            const [mfgYear,             setMfgYear]             = useState("");
            const [installationDate,    setInstallationDate]    = useState("");
            const [invoiceNo,           setInvoiceNo]           = useState("");
            const [purchaseDate,        setPurchaseDate]        = useState("");
            const [purchaseCost,        setPurchaseCost]        = useState("");
            const [maintenance,         setMaintenance]         = useState([]);
            const [rber,                setRber]                = useState(false);
            const [remarks,             setRemarks]             = useState("");
            const [building,            setBuilding]            = useState("");
            const [floor,               setFloor]               = useState("");
            const [room,                setRoom]                = useState("");
            const [saving, setSaving] = useState(false);

            const toggleMaint = (k) => setMaintenance(prev => prev.includes(k) ? prev.filter(x=>x!==k) : [...prev, k]);

            const inpSt = { width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1.5px solid #e2e8f0", fontSize: "13px", boxSizing: "border-box" };
            const lblSt = { fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: "5px" };
            const secSt = { background: "#1e3a8a", color: "#fff", fontWeight: 700, fontSize: "11px", letterSpacing: "0.8px", textTransform: "uppercase", padding: "7px 14px", borderRadius: "7px", marginTop: "18px", marginBottom: "10px" };

            const handleSubmit = async () => {
              if (!assetName.trim()) return alert("Equipment Name is required.");
              setSaving(true);
              try {
                const result = await registerPreQrAsset(token, qr.id, {
                  assetName: assetName.trim(), assetType: "healthcare",
                  location: building.trim() || undefined, floor: floor.trim() || undefined, room: room.trim() || undefined,
                  make: make.trim() || undefined, manufacturerCompany: manufacturerCompany.trim() || undefined,
                  model: model.trim() || undefined, serialNo: serialNo.trim() || undefined,
                  accessories: accessories.trim() || undefined, dealer: dealer.trim() || undefined,
                  mfgYear: mfgYear.trim() || undefined, installationDate: installationDate.trim() || undefined,
                  invoiceNo: invoiceNo.trim() || undefined, purchaseDate: purchaseDate.trim() || undefined,
                  purchaseCost: purchaseCost.trim() || undefined,
                  maintenance, rber, remarks: remarks.trim() || undefined,
                });
                setPreQrCodes((prev) => prev.map((q) =>
                  q.id === qr.id ? { ...q, assetId: result.assetId, assetName: result.assetName, linkedAt: new Date().toISOString() } : q
                ));
                onClose();
                alert(`Asset "${result.assetName}" registered and linked to ${qr.qrUniqueId}.`);
              } catch (e) { alert("Failed: " + (e.message || "Unknown error")); }
              finally { setSaving(false); }
            };

            const Row2 = ({ children }) => <div style={{ display: "flex", gap: "12px" }}>{children}</div>;
            const Half = ({ children }) => <div style={{ flex: 1 }}>{children}</div>;

            return (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={onClose}>
                <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", width: "560px", boxShadow: "0 12px 48px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
                  <div style={{ fontWeight: 700, fontSize: "17px", color: "#0f172a", marginBottom: "2px" }}>Register Healthcare Equipment</div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>QR: <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#0ea5e9" }}>{qr.qrUniqueId}</span></div>

                  {/* Equipment Details */}
                  <div style={secSt}>Equipment Details</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div><label style={lblSt}>Equipment Name *</label><input style={inpSt} placeholder="e.g. ECG Machine, Ventilator…" value={assetName} onChange={e=>setAssetName(e.target.value)} /></div>
                    <div><label style={lblSt}>Make / Manufacturer</label><input style={inpSt} placeholder="e.g. GE, Philips…" value={make} onChange={e=>setMake(e.target.value)} /></div>
                    <Row2>
                      <Half><label style={lblSt}>Model</label><input style={inpSt} placeholder="Model number" value={model} onChange={e=>setModel(e.target.value)} /></Half>
                      <Half><label style={lblSt}>Serial No.</label><input style={inpSt} placeholder="Serial number" value={serialNo} onChange={e=>setSerialNo(e.target.value)} /></Half>
                    </Row2>
                    <div><label style={lblSt}>Accessories Included</label><input style={inpSt} placeholder="e.g. leads, probe, cables…" value={accessories} onChange={e=>setAccessories(e.target.value)} /></div>
                    <div><label style={lblSt}>Dealer / Distributor</label><input style={inpSt} placeholder="Dealer or supplier name" value={dealer} onChange={e=>setDealer(e.target.value)} /></div>
                    <Row2>
                      <Half><label style={lblSt}>Manufacturing Year</label><input style={inpSt} placeholder="e.g. 2023" value={mfgYear} onChange={e=>setMfgYear(e.target.value)} /></Half>
                      <Half><label style={lblSt}>Installation Date</label><input style={inpSt} placeholder="DD/MM/YYYY" value={installationDate} onChange={e=>setInstallationDate(e.target.value)} /></Half>
                    </Row2>
                  </div>

                  {/* Invoice / Purchase */}
                  <div style={secSt}>Invoice No. / Purchase Details</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div><label style={lblSt}>Invoice No.</label><input style={inpSt} placeholder="Invoice number" value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} /></div>
                    <Row2>
                      <Half><label style={lblSt}>Purchase Date</label><input style={inpSt} placeholder="DD/MM/YYYY" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)} /></Half>
                      <Half><label style={lblSt}>Purchase Cost (₹)</label><input style={inpSt} type="number" placeholder="Amount" value={purchaseCost} onChange={e=>setPurchaseCost(e.target.value)} /></Half>
                    </Row2>
                  </div>

                  {/* Maintenance Under */}
                  <div style={secSt}>Maintenance Under</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", marginBottom: "12px" }}>
                    {[...MAINT_OPTIONS.map(k=>({ key:k, label:k.charAt(0).toUpperCase()+k.slice(1) })), { key:"rber", label:"RBER" }].map(o => {
                      const checked = o.key === "rber" ? rber : maintenance.includes(o.key);
                      const toggle  = o.key === "rber" ? () => setRber(v=>!v) : () => toggleMaint(o.key);
                      return (
                        <label key={o.key} style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "13px", color: "#0f172a", userSelect: "none" }}>
                          <input type="checkbox" checked={checked} onChange={toggle} style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#1e3a8a" }} />
                          {o.label}
                        </label>
                      );
                    })}
                  </div>
                  <div><label style={lblSt}>Remarks</label><textarea rows={2} style={{ ...inpSt, resize: "vertical" }} placeholder="Additional notes…" value={remarks} onChange={e=>setRemarks(e.target.value)} /></div>

                  {/* Location */}
                  <div style={secSt}>Location</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <div><label style={lblSt}>Building / Block</label><input style={inpSt} placeholder="e.g. OPD Block, Block B…" value={building} onChange={e=>setBuilding(e.target.value)} /></div>
                    <Row2>
                      <Half><label style={lblSt}>Floor</label><input style={inpSt} placeholder="e.g. Ground, 1st…" value={floor} onChange={e=>setFloor(e.target.value)} /></Half>
                      <Half><label style={lblSt}>Room / Area</label><input style={inpSt} placeholder="e.g. ICU, Ward 3…" value={room} onChange={e=>setRoom(e.target.value)} /></Half>
                    </Row2>
                  </div>

                  <div style={{ display: "flex", gap: "10px", marginTop: "22px", justifyContent: "flex-end" }}>
                    <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: "13px" }}>Cancel</button>
                    <button onClick={handleSubmit} disabled={!assetName.trim() || saving}
                      style={{ padding: "9px 22px", borderRadius: "8px", border: "none", background: assetName.trim() ? "#1e3a8a" : "#cbd5e1", color: "#fff", fontWeight: 700, cursor: assetName.trim() ? "pointer" : "not-allowed", fontSize: "13px", opacity: saving ? 0.75 : 1 }}>
                      {saving ? "Registering…" : "Register Equipment"}
                    </button>
                  </div>
                </div>
              </div>
            );
          };
          return (
            <div style={{ maxWidth: "1100px" }}>
              {preQrLinkModal && <ViewQrModal qr={preQrLinkModal} onClose={() => setPreQrLinkModal(null)} />}
              {preQrRegisterModal && <RegisterAssetModal qr={preQrRegisterModal} onClose={() => setPreQrRegisterModal(null)} />}
              {qrAlert && (
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 20px", borderRadius: "12px", background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", marginBottom: "16px", boxShadow: "0 4px 18px rgba(34,197,94,0.28)", fontSize: "14px", fontWeight: 600, animation: "slideInDown 0.35s ease" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>
                  <span>{qrAlert.count} QR code{qrAlert.count !== 1 ? "s" : ""} generated successfully!</span>
                  <button onClick={() => setQrAlert(null)} style={{ marginLeft: "auto", background: "rgba(255,255,255,0.22)", border: "none", borderRadius: "6px", color: "#fff", padding: "3px 9px", cursor: "pointer", fontWeight: 700, fontSize: "16px", lineHeight: 1 }}>×</button>
                </div>
              )}
              <div style={{ fontWeight: 700, fontSize: "22px", color: "#0f172a", marginBottom: "6px" }}>QR Code Management</div>
              <div style={{ color: "#64748b", fontSize: "13px", marginBottom: "24px" }}>Generate QR codes to paste on machines. Scan on mobile to register or look up assets.</div>

              {/* Stats */}
              <div style={{ display: "flex", gap: "14px", marginBottom: "24px", flexWrap: "wrap" }}>
                {[
                  { label: "Total Generated", value: preQrCodes.length, color: "#0ea5e9", filter: "all" },
                  { label: "Linked to Assets", value: linked.length, color: "#22c55e", filter: "linked" },
                  { label: "Unlinked", value: unlinked.length, color: "#f59e0b", filter: "unlinked" },
                ].map((s) => (
                  <div key={s.label} onClick={() => setQrFilter(s.filter)} style={{ flex: "1 1 160px", background: qrFilter === s.filter ? "#f0f9ff" : "#fff", border: `2px solid ${qrFilter === s.filter ? s.color : "#e2e8f0"}`, borderRadius: "12px", padding: "16px 20px", cursor: "pointer", transition: "all 0.15s" }}>
                    <div style={{ fontSize: "28px", fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Generate row */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "16px 20px", flexWrap: "wrap" }}>
                {/* QR card client label */}
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  setSavingQrLabel(true);
                  try {
                    const r = await fetch("/api/company-portal/me/qr-label", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ label: qrCardLabel }) });
                    if (!r.ok) throw new Error((await r.json()).message || "Save failed");
                  } catch (err) { alert(err.message); }
                  setSavingQrLabel(false);
                }} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <label style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a", whiteSpace: "nowrap" }}>Client Label</label>
                  <input value={qrCardLabel} onChange={(e) => setQrCardLabel(e.target.value)} placeholder="Text shown on QR card header" maxLength={20}
                    style={{ padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", width: "200px" }} />
                  <button type="submit" disabled={savingQrLabel} style={{ padding: "8px 16px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: "13px", cursor: "pointer", opacity: savingQrLabel ? 0.7 : 1 }}>{savingQrLabel ? "Saving…" : "Save"}</button>
                </form>
                <div style={{ width: "1px", height: "32px", background: "#e2e8f0" }} />
                <label style={{ fontWeight: 600, fontSize: "14px", color: "#0f172a" }}>Generate</label>
                <input type="number" min="0" value={preQrCount} onChange={(e) => {
                  const raw = Number(e.target.value);
                  setPreQrCount(Number.isFinite(raw) && raw >= 0 ? raw : 0);
                }}
                  style={{ width: "80px", padding: "8px 10px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px" }} />
                <label style={{ fontSize: "14px", color: "#64748b" }}>QR codes</label>
                <button onClick={handleGenerate} disabled={preQrGenerating} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#0ea5e9", color: "#fff", fontWeight: 600, cursor: preQrGenerating ? "not-allowed" : "pointer", opacity: preQrGenerating ? 0.7 : 1 }}>
                  {preQrGenerating ? "Generating…" : "Generate"}
                </button>
                {preQrGenerating && (
                  <button onClick={handleStopGenerate} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #dc2626", background: "#fff", color: "#dc2626", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#dc2626"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
                    Stop
                  </button>
                )}
                {unlinked.length > 0 && (
                  <button onClick={() => handlePrintSelected(unlinked)} style={{ padding: "8px 20px", borderRadius: "8px", border: "1px solid #0ea5e9", background: "#fff", color: "#0ea5e9", fontWeight: 600, cursor: "pointer", marginLeft: "auto" }}>
                    Print All Unlinked ({unlinked.length})
                  </button>
                )}
                {preQrCodes.length > 0 && (
                  <button onClick={() => handlePrintSelected(preQrCodes)} style={{ padding: "8px 20px", borderRadius: "8px", border: "1px solid #0f172a", background: "#fff", color: "#0f172a", fontWeight: 600, cursor: "pointer" }}>
                    Print All ({preQrCodes.length})
                  </button>
                )}
                {selectedPreQrIds.size > 0 && (
                  <>
                    <button onClick={() => handlePrintSelected(preQrCodes.filter(q => selectedPreQrIds.has(q.id)))}
                      style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e9d5ff", background: "#f3e8ff", color: "#7c3aed", fontWeight: 600, cursor: "pointer", fontSize: "13px" }}>
                      Print ({selectedPreQrIds.size})
                    </button>
                    <button onClick={handleBulkDeletePreQr}
                      style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontWeight: 600, cursor: "pointer", fontSize: "13px" }}>
                      Delete ({selectedPreQrIds.size})
                    </button>
                  </>
                )}
                {selectedPreQrIds.size === 0 && qrFilter !== "all" && filteredQrCodes.length > 0 && (
                  <button onClick={async () => {
                    if (!window.confirm("Delete all " + filteredQrCodes.length + " " + qrFilter + " QR codes?")) return;
                    const ids = filteredQrCodes.map(q => q.id);
                    try {
                      await bulkDeleteCompanyPortalPreQr(token, ids);
                      setPreQrCodes(prev => prev.filter(q => !ids.includes(q.id)));
                      setQrFilter("all");
                    } catch(e) { alert("Delete failed"); }
                  }} style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontWeight: 600, cursor: "pointer", fontSize: "13px" }}>
                    Delete All {qrFilter} ({filteredQrCodes.length})
                  </button>
                )}
              </div>

              {/* Search */}
              <div style={{ marginBottom: "12px" }}>
                <input
                  type="text"
                  placeholder="Search by QR ID, asset name or asset ID…"
                  value={qrSearch}
                  onChange={e => setQrSearch(e.target.value)}
                  style={{ width: "100%", padding: "9px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13.5px", outline: "none", boxSizing: "border-box" }}
                />
              </div>

              {/* Table */}
              {preQrLoading ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>Loading…</div>
              ) : preQrCodes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
                  No QR codes generated yet. Use the form above to generate some.
                </div>
              ) : (
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                        <th style={{ padding: "10px 14px", width: "40px" }}>
                          <input type="checkbox"
                            checked={filteredQrCodes.length > 0 && filteredQrCodes.every(q => selectedPreQrIds.has(q.id))}
                            onChange={(e) => setSelectedPreQrIds(e.target.checked ? new Set(filteredQrCodes.map(q => q.id)) : new Set())}
                            style={{ cursor: "pointer" }} />
                        </th>
                        {["QR Unique ID", "Status", "Linked Asset", "Linked At", "Actions"].map((h) => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQrCodes.map((qr) => (
                        <tr key={qr.id} style={{ borderBottom: "1px solid #f1f5f9", background: selectedPreQrIds.has(qr.id) ? "#fef2f2" : undefined }}>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            <input type="checkbox" checked={selectedPreQrIds.has(qr.id)}
                              onChange={(e) => setSelectedPreQrIds(prev => { const n = new Set(prev); e.target.checked ? n.add(qr.id) : n.delete(qr.id); return n; })}
                              style={{ cursor: "pointer" }} />
                          </td>
                          <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a", fontFamily: "monospace" }}>{qr.qrUniqueId}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: qr.assetId ? "#dcfce7" : "#fef3c7", color: qr.assetId ? "#16a34a" : "#b45309" }}>
                              {qr.assetId ? "Linked" : "Unlinked"}
                            </span>
                          </td>
                          <td style={{ padding: "10px 14px", color: "#64748b" }}>{qr.assetName || "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: "12px" }}>{qr.linkedAt ? new Date(qr.linkedAt).toLocaleDateString() : "—"}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                              <button onClick={() => handlePrintSelected([qr])} style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #e2e8f0", background: "#f8fafc", fontSize: "12px", cursor: "pointer" }}>Print</button>
                              <button onClick={() => setPreQrLinkModal(qr)} style={{ padding: "4px 10px", borderRadius: "6px", border: "none", background: "#0ea5e9", color: "#fff", fontSize: "12px", cursor: "pointer" }}>View QR</button>
                              {!qr.assetId && (
                                <button onClick={() => setPreQrRegisterModal(qr)} style={{ padding: "4px 10px", borderRadius: "6px", border: "none", background: "#7c3aed", color: "#fff", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Register Asset</button>
                              )}
                              <button onClick={async () => {
                                if (!window.confirm(`Delete QR code ${qr.qrUniqueId}?${qr.assetId ? " This QR is linked to an asset — unlinking it may affect scans." : ""}`)) return;
                                try {
                                  await deletePreQrCode(token, qr.id);
                                  setPreQrCodes(prev => prev.filter(q => q.id !== qr.id));
                                } catch (e) { alert("Delete failed: " + (e.message || "Unknown error")); }
                              }} style={{ padding: "4px 10px", borderRadius: "6px", border: "none", background: "#fee2e2", color: "#dc2626", fontSize: "12px", cursor: "pointer", fontWeight: 600 }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Employees ─────────────────────────────────────────── */}
        {nav === "employees" && (() => {
          const isAdmin = currentUser.role === "admin";
          const empPerms = currentUser?.permissions?.employees || currentUser?.permissions?.users || currentUser?.permissions?.team || {};
          const canEmpRead = isAdmin || empPerms.r === true || empPerms.read === true || empPerms.view === true;
          const canEmpCreate = isAdmin || empPerms.c === true || empPerms.create === true;
          const canEmpUpdate = isAdmin || empPerms.u === true || empPerms.update === true || empPerms.edit === true;
          const canEmpDelete = isAdmin || empPerms.d === true || empPerms.delete === true || empPerms.remove === true;
          const canManage = canEmpCreate || canEmpUpdate || canEmpDelete;
          const isSupervisor = currentUser.role === "supervisor";

          if (!canEmpRead) {
            return (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "24px", color: "#64748b" }}>
                You do not have permission to view employees.
              </div>
            );
          }

          const EmpRow = ({ e, showAssign }) => (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "8px", background: "#fafafa", border: "1px solid #f1f5f9" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e0e7ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>
                {initials(e.fullName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: "13px", color: "#0f172a", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.fullName}</p>
                <p style={{ fontSize: "11.5px", color: "#94a3b8", margin: 0 }}>{e.designation || e.email}</p>
                <div style={{ display: "flex", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
                  {e.email && <span style={{ fontSize: "10.5px", background: "#eff6ff", color: "#2563eb", padding: "1px 7px", borderRadius: "10px" }}>🌐 {e.email}</span>}
                  {e.username && <span style={{ fontSize: "10.5px", background: "#f3e8ff", color: "#7c3aed", padding: "1px 7px", borderRadius: "10px" }}>📱 {e.username}</span>}
                </div>
              </div>
              <Badge val={e.role} />
              <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, background: e.status === "Active" ? "#f0fdf4" : "#fef2f2", color: e.status === "Active" ? "#16a34a" : "#dc2626" }}>{e.status}</span>
              {canManage && (
                <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
                  {showAssign && (
                    <button title="Assign Templates" onClick={() => { setAssignTarget(e); setShowAssignModal(true); }}
                      style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", cursor: "pointer", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      Assign
                    </button>
                  )}
                  {canEmpUpdate && <button title="Edit" onClick={() => { setEditEmp(e); setShowEmpModal(true); }}
                    style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>}
                  {canEmpDelete && isAdmin && e.id !== currentUser.id && (
                    <button title="Delete" onClick={() => handleDeleteEmp(e.id)}
                      style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          );

          return (
            <div>
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>
                <div>
                  <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Team Management</h1>
                  <p style={{ color: "#64748b", fontSize: "13.5px" }}>Manage staff hierarchy of {currentUser.companyName}</p>
                </div>
                {canManage && (
                  <div style={{ display: "flex", gap: "8px" }}>
                    {isAdmin && canEmpUpdate && (
                      <Btn onClick={() => setShowRolesModal(true)} outline color="#7c3aed" bg="#fff">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18M3 12h18M3 17h18"/></svg>
                        Manage Roles
                      </Btn>
                    )}
                    <Btn onClick={() => setShowImport(true)} outline color="#64748b" bg="#fff">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                      Import CSV
                    </Btn>
                    {canEmpCreate && <Btn onClick={() => { setEditEmp(null); setShowEmpModal(true); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Employee
                    </Btn>}
                  </div>
                )}
              </div>

              {/* Stat row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "22px" }}>
                <StatCard label="Total Staff" value={employees.length} sub="All employees" iconBg="#eff6ff" iconCol="#2563eb" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>} />
                <StatCard label="Tech Leads" value={employees.filter((e) => e.role === "technical_lead").length} iconBg="#dbeafe" iconCol="#1d4ed8" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>} />
                <StatCard label="Active" value={employees.filter((e) => e.status === "Active").length} subCol="#22c55e" sub="✓ Active" iconBg="#f0fdf4" iconCol="#22c55e" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>} />
                <StatCard label="Assignments" value={assignments.length} sub="Template tasks" iconBg="#fff7ed" iconCol="#ea580c" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
              </div>

              {errors.employees && <Alert>{errors.employees}</Alert>}

              {/* View switcher */}
              <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
                {[{ k: "hierarchy", label: "Team Hierarchy" }, { k: "list", label: "All Employees" }].map((v) => (
                  <button key={v.k} onClick={() => setEmpView(v.k)}
                    style={{ padding: "7px 18px", borderRadius: "8px", border: "1px solid #e2e8f0", background: empView === v.k ? "#2563eb" : "#fff", color: empView === v.k ? "#fff" : "#475569", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                    {v.label}
                  </button>
                ))}
              </div>

              {loading.employees
                ? <p style={{ color: "#94a3b8", textAlign: "center", padding: "40px" }}>Loading…</p>
                : empView === "hierarchy"
                  ? (() => {
                    /* ─── 5-Level Hierarchy View ─────────────────────── */
                    const childrenOf = (parentId) =>
                      employees.filter((e) => e.supervisorId && String(e.supervisorId) === String(parentId));

                    const renderNode = (emp, depth) => {
                      const info = roleInfo(emp.role);
                      const chainInfo = HIERARCHY_CHAIN.find((h) => h.role === emp.role);
                      const children = childrenOf(emp.id);
                      const empAssignments = assignments.filter((a) => String(a.assignedTo) === String(emp.id));
                      const indent = depth * 28;
                      return (
                        <div key={emp.id} style={{ marginLeft: `${indent}px`, marginBottom: "8px" }}>
                          <div style={{
                            background: "#fff", borderRadius: "10px",
                            border: `1px solid ${chainInfo?.border || "#e2e8f0"}`,
                            borderLeft: depth > 0 ? `3px solid ${chainInfo?.color || "#94a3b8"}` : `1px solid ${chainInfo?.border || "#e2e8f0"}`,
                            overflow: "hidden",
                          }}>
                            <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: "10px", background: depth === 0 ? (chainInfo?.bg || "#f8fafc") : "#fff" }}>
                              {/* Avatar */}
                              <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: chainInfo?.color || info.color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, flexShrink: 0 }}>
                                {initials(emp.fullName)}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                                  <p style={{ fontWeight: 700, fontSize: "13.5px", color: "#0f172a", margin: 0 }}>{emp.fullName}</p>
                                  <Badge val={emp.role} />
                                  {emp.shift && (
                                    <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, background: "#ede9fe", color: "#5b21b6" }}>{emp.shift} Shift</span>
                                  )}
                                  {empAssignments.length > 0 && (
                                    <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "11px", fontWeight: 600, background: "#eff6ff", color: "#2563eb" }}>{empAssignments.length} template{empAssignments.length !== 1 ? "s" : ""}</span>
                                  )}
                                </div>
                                <p style={{ fontSize: "12px", color: "#64748b", margin: 0, marginTop: "1px" }}>
                                  {emp.designation || emp.email}
                                  {children.length > 0 && <span style={{ marginLeft: "6px", color: "#94a3b8" }}>· {children.length} direct report{children.length !== 1 ? "s" : ""}</span>}
                                </p>
                              </div>
                              {/* Actions */}
                              <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
                                {isAdmin && (
                                  <button title="Assign Templates" onClick={() => { setAssignTarget(emp); setShowAssignModal(true); }}
                                    style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", cursor: "pointer", fontSize: "11.5px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/></svg>
                                    Assign
                                  </button>
                                )}
                                {canEmpUpdate && (
                                  <button title="Edit" onClick={() => { setEditEmp(emp); setShowEmpModal(true); }}
                                    style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Recurse into children */}
                          {children.length > 0 && (
                            <div style={{ marginTop: "6px" }}>
                              {children.map((child) => renderNode(child, depth + 1))}
                            </div>
                          )}
                        </div>
                      );
                    };

                    // Roots: Technical Leads with no supervisor, or any hierarchy role at depth 0
                    const roots = employees.filter((e) => e.role === "technical_lead");
                    const adminRoots = employees.filter((e) => e.role === "admin");
                    const nonHierarchyStaff = employees.filter((e) => !HIERARCHY_ROLES.has(e.role) && e.role !== "admin");
                    const unassignedHierarchy = employees.filter((e) =>
                      HIERARCHY_ROLES.has(e.role) && e.role !== "technical_lead" &&
                      (!e.supervisorId || !employees.find((p) => String(p.id) === String(e.supervisorId)))
                    );

                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {employees.length === 0 && (
                          <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>
                            <p style={{ fontSize: "16px", marginBottom: "8px" }}>No employees yet.</p>
                            {canManage && <Btn onClick={() => setShowEmpModal(true)}>Add First Employee</Btn>}
                          </div>
                        )}

                        {/* Hierarchy legend */}
                        {employees.length > 0 && (
                          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b", marginRight: "6px" }}>HIERARCHY:</span>
                            {HIERARCHY_CHAIN.map((h, i) => (
                              <span key={h.role} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                {i > 0 && <span style={{ color: "#94a3b8", fontSize: "13px" }}>›</span>}
                                <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 600, background: h.bg, color: h.color, border: `1px solid ${h.border}` }}>{h.label}</span>
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Admin cards */}
                        {adminRoots.length > 0 && (
                          <div>
                            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: "8px" }}>Administrators</p>
                            {adminRoots.map((e) => renderNode(e, 0))}
                          </div>
                        )}

                        {/* Technical Lead trees */}
                        {roots.length > 0 && (
                          <div>
                            <p style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", letterSpacing: "0.06em", marginBottom: "8px" }}>Technical Lead Hierarchy</p>
                            {roots.map((root) => renderNode(root, 0))}
                          </div>
                        )}

                        {/* Unassigned hierarchy members */}
                        {unassignedHierarchy.length > 0 && (
                          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #fde68a", overflow: "hidden" }}>
                            <div style={{ padding: "10px 16px", background: "#fffbeb", borderBottom: "1px solid #fde68a", display: "flex", alignItems: "center", gap: "8px" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                              <p style={{ fontWeight: 700, fontSize: "13px", color: "#92400e", margin: 0 }}>Unassigned Hierarchy Staff ({unassignedHierarchy.length})</p>
                              <p style={{ fontSize: "12px", color: "#a16207", margin: 0 }}>— Missing parent assignment</p>
                            </div>
                            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
                              {unassignedHierarchy.map((e) => renderNode(e, 0))}
                            </div>
                          </div>
                        )}

                        {/* Non-hierarchy staff */}
                        {nonHierarchyStaff.length > 0 && (
                          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                            <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                              <p style={{ fontWeight: 700, fontSize: "13px", color: "#475569", margin: 0 }}>Other Staff ({nonHierarchyStaff.length})</p>
                              <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>— Cleaners, drivers, security, etc.</p>
                            </div>
                            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                              {nonHierarchyStaff.map((e) => <EmpRow key={e.id} e={e} showAssign={false} />)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()
                  : (
                    /* ─── List View ──────────────────────────────────── */
                    <Card>
                      <CardHeader
                        title="All Employees"
                        subtitle={`${filteredEmployees.length} of ${employees.length} employees`}
                        action={
                          <div style={{ display: "flex", gap: "8px" }}>
                            <select value={empRoleFilter} onChange={(e) => setEmpRoleFilter(e.target.value)}
                              style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", background: "#fff", outline: "none" }}>
                              <option value="">All Roles</option>
                              {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <input value={empSearch} onChange={(e) => setEmpSearch(e.target.value)} placeholder="Search name / email…"
                              style={{ padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", outline: "none", width: "180px" }} />
                          </div>
                        }
                      />
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                        <thead>
                          <tr>
                            {["Employee", "Supervisor", "Email", "Designation", "Role", "Status", ...(canManage ? ["Actions"] : [])].map((h) => (
                              <th key={h} style={{ padding: "11px 14px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEmployees.length === 0
                            ? <tr><td colSpan={canManage ? 7 : 6} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No employees found{empSearch ? ` for "${empSearch}"` : ""}</td></tr>
                            : filteredEmployees.map((e) => (
                              <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "11px 14px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#e0e7ff", color: "#4338ca", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "12px", fontWeight: 700, flexShrink: 0 }}>{initials(e.fullName)}</div>
                                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{e.fullName}</span>
                                  </div>
                                </td>
                                <td style={{ padding: "11px 14px", color: "#64748b", fontSize: "13px" }}>{e.supervisorName || <span style={{ color: "#cbd5e1" }}>—</span>}</td>
                                <td style={{ padding: "11px 14px", color: "#64748b", fontSize: "13px" }}>{e.email}</td>
                                <td style={{ padding: "11px 14px", color: "#475569", fontSize: "13px" }}>{e.designation || "—"}</td>
                                <td style={{ padding: "11px 14px" }}><Badge val={e.role} /></td>
                                <td style={{ padding: "11px 14px" }}>
                                  <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: e.status === "Active" ? "#f0fdf4" : "#fef2f2", color: e.status === "Active" ? "#16a34a" : "#dc2626" }}>{e.status}</span>
                                </td>
                                {canManage && (
                                  <td style={{ padding: "11px 14px" }}>
                                    <div style={{ display: "flex", gap: "5px" }}>
                                      {(isAdmin || (isSupervisor && String(e.supervisorId) === String(currentUser.id))) && (
                                        <button title="Assign Templates" onClick={() => { setAssignTarget(e); setShowAssignModal(true); }}
                                          style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                                          Assign
                                        </button>
                                      )}
                                      {canEmpUpdate && <button title="Edit" onClick={() => { setEditEmp(e); setShowEmpModal(true); }}
                                        style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                      </button>}
                                      {canEmpDelete && isAdmin && e.id !== currentUser.id && (
                                        <button title="Delete" onClick={() => handleDeleteEmp(e.id)}
                                          style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </Card>
                  )
              }

              {/* Assignments summary moved to admin dashboard */}
            </div>
          );
        })()}

        {/* ── Manage Roles (inline tab) ─────────────────────── */}
        {nav === "roles" && (
          <RolesModal
            token={token}
            initialRoles={customRoles}
            inline={true}
            onClose={() => {}}
            onSaved={(list) => {
              setCustomRoles(list);
              applyCustomRoles(list);
              setRoleRefreshKey((k) => k + 1);
            }}
          />
        )}

        {/* ── Asset Types ────────────────────────────────────────── */}
        {nav === "asset-types" && (
          <AssetTypesPanel token={token} onLayoutSaved={() => getCompanyPortalAssetTypes(token).then(d => d && setAssetTypesList(d)).catch(() => {})} />
        )}

        {/* ── Shifts ────────────────────────────────────────────── */}
        {nav === "shifts" && (() => {
          const fmt12 = (t) => {
            if (!t) return "";
            const [h, m] = t.split(":");
            const hr = parseInt(h, 10);
            return `${hr % 12 || 12}:${m} ${hr < 12 ? "AM" : "PM"}`;
          };

          const isActiveNow = (s) => {
            if (s.status !== "active") return false;
            const now = new Date();
            const [nh, nm] = [now.getHours(), now.getMinutes()];
            const nowMins = nh * 60 + nm;
            const [sh, sm] = s.startTime.split(":").map(Number);
            const [eh, em] = s.endTime.split(":").map(Number);
            const startMins = sh * 60 + sm;
            const endMins = eh * 60 + em;
            if (startMins <= endMins) return nowMins >= startMins && nowMins <= endMins;
            return nowMins >= startMins || nowMins <= endMins;
          };

          const loadShiftEmployees = async (sid) => {
            try {
              const data = await getShiftEmployees(token, sid);
              setShiftEmployees((p) => ({ ...p, [sid]: Array.isArray(data) ? data : [] }));
            } catch { setShiftEmpError((p) => ({ ...p, [sid]: "Failed to load employees" })); }
          };

          const handleExpandShift = (sid) => {
            if (expandedShiftId === sid) { setExpandedShiftId(null); return; }
            setExpandedShiftId(sid);
            if (!shiftEmployees[sid]) loadShiftEmployees(sid);
          };

          const handleOpenCreate = () => {
            setEditShift(null);
            setShiftForm({ name: "", startTime: "", endTime: "", description: "", status: "active" });
            setShiftFormError(null);
            setShowShiftModal(true);
          };

          const handleOpenEdit = (s) => {
            setEditShift(s);
            setShiftForm({ name: s.name, startTime: s.startTime, endTime: s.endTime, description: s.description || "", status: s.status });
            setShiftFormError(null);
            setShowShiftModal(true);
          };

          const handleSaveShift = async () => {
            const { name, startTime, endTime, status } = shiftForm;
            if (!name.trim()) return setShiftFormError("Shift name is required");
            if (!startTime) return setShiftFormError("Start time is required");
            if (!endTime) return setShiftFormError("End time is required");
            setShiftSaving(true); setShiftFormError(null);
            try {
              const payload = { name: name.trim(), startTime, endTime, description: shiftForm.description.trim() || undefined, status };
              if (editShift) {
                const updated = await updateShift(token, editShift.id, payload);
                setShifts((p) => p.map((s) => s.id === editShift.id ? updated : s));
              } else {
                const created = await createShift(token, payload);
                setShifts((p) => [created, ...p]);
              }
              setShowShiftModal(false);
            } catch (err) { setShiftFormError(err.message || "Could not save shift"); }
            finally { setShiftSaving(false); }
          };

          const handleDeleteShift = async (id) => {
            if (!window.confirm("Delete this shift? This will unlink it from all templates.")) return;
            try {
              await deleteShift(token, id);
              setShifts((p) => p.filter((s) => s.id !== id));
            } catch (err) { alert(err.message || "Delete failed"); }
          };

          const handleAssignEmployees = async (sid) => {
            const input = (addEmpInput[sid] || "").trim();
            if (!input) return;
            const ids = input.split(",").map((v) => parseInt(v.trim(), 10)).filter(Boolean);
            if (!ids.length) return;
            try {
              await assignShiftEmployees(token, sid, ids);
              setAddEmpInput((p) => ({ ...p, [sid]: "" }));
              loadShiftEmployees(sid);
            } catch (err) { alert(err.message || "Failed to assign employees"); }
          };

          const handleRemoveEmp = async (sid, uid) => {
            try {
              await removeShiftEmployee(token, sid, uid);
              setShiftEmployees((p) => ({ ...p, [sid]: (p[sid] || []).filter((e) => e.id !== uid) }));
            } catch (err) { alert(err.message || "Failed to remove"); }
          };

          const filtered = shifts.filter((s) => s.name.toLowerCase().includes(shiftSearch.toLowerCase()));

          return (
            <div>
              {/* Page header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
                <div>
                  <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Shift Management</h1>
                  <p style={{ color: "#64748b", fontSize: "13.5px" }}>Create work shifts and assign employees, checklists, and logsheets to them</p>
                </div>
                {currentUser.role === "admin" && (
                  <button onClick={handleOpenCreate}
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "9px 16px", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Create Shift
                  </button>
                )}
              </div>

              {/* Search */}
              <input value={shiftSearch} onChange={(e) => setShiftSearch(e.target.value)} placeholder="Search shifts…"
                style={{ width: "280px", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", marginBottom: "20px", outline: "none" }} />

              {/* Empty state */}
              {!filtered.length && (
                <div style={{ padding: "48px", textAlign: "center", background: "#f8fafc", borderRadius: "14px", border: "2px dashed #e2e8f0" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{ margin: "0 auto 12px" }}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <p style={{ color: "#64748b", fontWeight: 600, marginBottom: "4px" }}>No shifts defined</p>
                  <p style={{ color: "#94a3b8", fontSize: "13px" }}>Create your first work shift to start organizing employees and templates</p>
                </div>
              )}

              {/* Shift cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {filtered.map((s) => {
                  const active = isActiveNow(s);
                  const expanded = expandedShiftId === s.id;
                  const empList = shiftEmployees[s.id] || [];
                  return (
                    <div key={s.id} style={{ background: "#fff", borderRadius: "12px", border: `1.5px solid ${active ? "#bbf7d0" : "#e2e8f0"}`, overflow: "hidden" }}>
                      {/* Card header row */}
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px" }}>
                        <div style={{ width: "42px", height: "42px", borderRadius: "10px", background: active ? "#dcfce7" : "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active ? "#16a34a" : "#64748b"} strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{s.name}</span>
                            {active && <span style={{ fontSize: "11px", fontWeight: 700, color: "#16a34a", background: "#dcfce7", padding: "2px 8px", borderRadius: "20px" }}>ACTIVE NOW</span>}
                            {s.status === "inactive" && <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", background: "#f1f5f9", padding: "2px 8px", borderRadius: "20px" }}>INACTIVE</span>}
                          </div>
                          <div style={{ fontSize: "13px", color: "#64748b", marginTop: "2px" }}>
                            {fmt12(s.startTime)} – {fmt12(s.endTime)}
                            {s.description && <span style={{ marginLeft: "10px", color: "#94a3b8" }}>· {s.description}</span>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span style={{ fontSize: "12px", color: "#64748b", background: "#f8fafc", padding: "4px 10px", borderRadius: "20px", border: "1px solid #e2e8f0" }}>
                            {s.employeeCount ?? 0} employee{s.employeeCount !== 1 ? "s" : ""}
                          </span>
                          <button onClick={() => handleExpandShift(s.id)}
                            style={{ padding: "6px 12px", background: expanded ? "#eff6ff" : "#f8fafc", color: expanded ? "#2563eb" : "#64748b", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer" }}>
                            {expanded ? "Hide" : "Employees"}
                          </button>
                          {currentUser.role === "admin" && (
                            <>
                              <button onClick={() => handleOpenEdit(s)}
                                style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                              <button onClick={() => handleDeleteShift(s.id)}
                                style={{ width: "30px", height: "30px", borderRadius: "7px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Expanded employee panel */}
                      {expanded && (
                        <div style={{ borderTop: "1px solid #f1f5f9", padding: "14px 18px", background: "#f8fafc" }}>
                          {shiftEmpError[s.id] && <p style={{ color: "#dc2626", fontSize: "12.5px", marginBottom: "8px" }}>{shiftEmpError[s.id]}</p>}
                          {!empList.length && !shiftEmpError[s.id] && (
                            <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "10px" }}>No employees assigned to this shift yet.</p>
                          )}
                          {empList.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                              {empList.map((e) => (
                                <span key={e.id} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "20px", padding: "4px 10px", fontSize: "12.5px", color: "#374151" }}>
                                  {e.fullName || e.username || e.email}
                                  {currentUser.role === "admin" && (
                                    <button onClick={() => handleRemoveEmp(s.id, e.id)}
                                      style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0, lineHeight: 1, display: "flex" }}>
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                          {currentUser.role === "admin" && (
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <select
                                multiple={false}
                                value={addEmpInput[s.id] || ""}
                                onChange={(e) => setAddEmpInput((p) => ({ ...p, [s.id]: e.target.value }))}
                                style={{ flex: 1, padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px" }}>
                                <option value="">— Select employee to add —</option>
                                {employees.filter((e) => !(shiftEmployees[s.id] || []).some((ae) => ae.id === e.id)).map((e) => (
                                  <option key={e.id} value={e.id}>{e.fullName || e.username || e.email}</option>
                                ))}
                              </select>
                              <button onClick={() => handleAssignEmployees(s.id)}
                                style={{ padding: "7px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "7px", fontWeight: 600, fontSize: "13px", cursor: "pointer" }}>
                                Add
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Create / Edit modal */}
              {showShiftModal && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                  <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px" }}>
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>{editShift ? "Edit Shift" : "Create Shift"}</p>
                      <button onClick={() => setShowShiftModal(false)} style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#f1f5f9", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                      {shiftFormError && <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", fontSize: "13px" }}>{shiftFormError}</div>}
                      <div>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Shift Name *</label>
                        <input value={shiftForm.name} onChange={(e) => setShiftForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Morning Shift"
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", boxSizing: "border-box" }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Start Time *</label>
                          <input type="time" value={shiftForm.startTime} onChange={(e) => setShiftForm((p) => ({ ...p, startTime: e.target.value }))}
                            style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", boxSizing: "border-box" }} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>End Time *</label>
                          <input type="time" value={shiftForm.endTime} onChange={(e) => setShiftForm((p) => ({ ...p, endTime: e.target.value }))}
                            style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", boxSizing: "border-box" }} />
                        </div>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>
                        <input value={shiftForm.description} onChange={(e) => setShiftForm((p) => ({ ...p, description: e.target.value }))} placeholder="Optional notes"
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", boxSizing: "border-box" }} />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Status</label>
                        <select value={shiftForm.status} onChange={(e) => setShiftForm((p) => ({ ...p, status: e.target.value }))}
                          style={{ width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px" }}>
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ padding: "14px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                      <button onClick={() => setShowShiftModal(false)}
                        style={{ padding: "8px 16px", background: "#fff", color: "#64748b", border: "1px solid #e2e8f0", borderRadius: "8px", fontWeight: 600, fontSize: "13.5px", cursor: "pointer" }}>Cancel</button>
                      <button onClick={handleSaveShift} disabled={shiftSaving}
                        style={{ padding: "8px 16px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "13.5px", cursor: "pointer", opacity: shiftSaving ? 0.7 : 1 }}>
                        {shiftSaving ? "Saving…" : editShift ? "Save Changes" : "Create Shift"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── OJT Management ──────────────────────────────── */}
        {nav === "ojt" && (
          <div>
            {showOjtBuilder ? (
              <OjtTrainingBuilder
                token={token}
                assets={assets}
                trainingId={buildingOjtTrainingId}
                onBack={() => {
                  setShowOjtBuilder(false);
                  setBuildingOjtTrainingId(null);
                  load("ojt", () => getOjtTrainings(token).then(setOjtTrainings));
                }}
              />
            ) : (
              <>
                <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>OJT Management</h1>
                    <p style={{ color: "#64748b", fontSize: "13.5px" }}>Create and manage On-the-Job Trainings and assess employee progress</p>
                  </div>
                  <Btn onClick={() => { setShowOjtBuilder(true); setBuildingOjtTrainingId(null); }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Create Training
                  </Btn>
                </div>

                {/* Sub-navigation */}
                <div style={{ display: "flex", gap: "24px", borderBottom: "1px solid #e2e8f0", marginBottom: "20px" }}>
                  {[
                    { key: "trainings", label: "Trainings" },
                    { key: "enrollment", label: "Enrollment" },
                    { key: "tracking", label: "Progress Tracking" }
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setOjtSubNav(tab.key)}
                      style={{
                        padding: "10px 4px", fontSize: "14px", fontWeight: 600, background: "none", border: "none", cursor: "pointer",
                        color: ojtSubNav === tab.key ? "#2563eb" : "#64748b",
                        borderBottom: ojtSubNav === tab.key ? "2px solid #2563eb" : "2px solid transparent",
                        transition: "all 0.2s"
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {ojtSubNav === "trainings" && (
                  <>
                    {!viewingOjtTraining ? (
                      <Card>
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                            <thead>
                              <tr>
                                {["Training Title", "Description", "Status", "Actions"].map((h) => (
                                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {loading.ojt ? (
                                <tr><td colSpan="4" style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Loading OJT…</td></tr>
                              ) : ojtTrainings.length === 0 ? (
                                <tr><td colSpan="4" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No training programs available.</td></tr>
                              ) : ojtTrainings.map((t) => (
                                <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }} onClick={async () => {
                                  try {
                                    const details = await getOjtTraining(token, t.id);
                                    setViewingOjtTraining(details);
                                  } catch (e) { alert("Failed to load training details"); }
                                }}>
                                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2563eb" }}>{t.title}</td>
                                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{t.description || "—"}</td>
                                  <td style={{ padding: "12px 16px" }}>
                                    <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: t.status === "published" ? "#dcfce7" : "#f1f5f9", color: t.status === "published" ? "#166534" : "#475569" }}>
                                      {t.status === "published" ? "Published" : "Draft"}
                                    </span>
                                  </td>
                                  <td style={{ padding: "12px 16px", display: "flex", gap: "6px", flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                                    <button title="Preview Training" onClick={async () => {
                                      try {
                                        const details = await getOjtTraining(token, t.id);
                                        setOjtPreviewTraining(details);
                                      } catch(e) { alert("Failed to load training"); }
                                    }} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    </button>
                                    <button title="Show QR Code" onClick={async () => {
                                      try {
                                        const url = t.assetId ? `${getQrBaseUrl()}/asset-scan/${t.assetId}` : `${getQrBaseUrl()}/ojt-training/${t.id}`;
                                        const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
                                        setOjtQrDataUrl(dataUrl);
                                        setOjtQrTraining(t);
                                      } catch(e) { alert("Failed to generate QR"); }
                                    }} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3M17 20h3M20 17v3"/></svg>
                                    </button>
                                    <button title="Edit Training" onClick={() => { setShowOjtBuilder(true); setBuildingOjtTrainingId(t.id); }}
                                      style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#f1f5f9", color: "#475569", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    </button>
                                    {t.status === "published" && (
                                      <button title="Unpublish Training" onClick={async () => {
                                        if (!window.confirm(`Unpublish '${t.title}'? It will become a draft.`)) return;
                                        try {
                                          await publishOjtTraining(token, t.id);
                                          setOjtTrainings(p => p.map(x => x.id === t.id ? { ...x, status: "draft" } : x));
                                        } catch (e) { alert("Failed to unpublish"); }
                                      }} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef9c3", color: "#ca8a04", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                                      </button>
                                    )}
                                    <button title="Delete Training" onClick={async () => {
                                      if (!window.confirm(`Delete training '${t.title}'? This cannot be undone.`)) return;
                                      try { await deleteOjtTraining(token, t.id); setOjtTrainings(p => p.filter(x => x.id !== t.id)); }
                                      catch (e) { alert("Failed to delete training"); }
                                    }} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </Card>
                    ) : (
                      <OjtTrainingDetailView
                        training={viewingOjtTraining}
                        token={token}
                        onBack={() => {
                          setViewingOjtTraining(null);
                          load("ojt", () => getOjtTrainings(token).then(setOjtTrainings));
                        }}
                        onUpdated={(updated) => setViewingOjtTraining(updated)}
                      />
                    )}
                  </>
                )}
                {ojtSubNav === "enrollment" && (
                  <OjtEnrollmentSection token={token} ojtTrainings={ojtTrainings} />
                )}
                {ojtSubNav === "tracking" && (
                  <TrackingSection token={token} ojtTrainings={ojtTrainings} />
                )}
              </>
            )}
          </div>
        )}

        {/* OJT Preview Modal */}
        {ojtPreviewTraining && (
          <TrainingPreviewModal
            training={ojtPreviewTraining}
            onClose={() => setOjtPreviewTraining(null)}
          />
        )}
        {/* OJT QR Modal */}
        {ojtQrTraining && (
          <TrainingQRModal
            training={ojtQrTraining}
            qrDataUrl={ojtQrDataUrl}
            onClose={() => { setOjtQrTraining(null); setOjtQrDataUrl(""); }}
          />
        )}

        {/* Asset QR Modal */}
        {/* ── Asset View QR Modal (Manage Assets tab) ─── */}
        {assetViewQrModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
            onClick={() => setAssetViewQrModal(null)}>
            <div style={{ background: "transparent", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
              {assetViewQrCardHtml
                ? <div dangerouslySetInnerHTML={{ __html: assetViewQrCardHtml }} style={{ display: "inline-block" }} />
                : <div style={{ width: "300px", height: "380px", background: "#fff", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "14px" }}>Generating card…</div>
              }
              <div style={{ display: "flex", gap: "8px", marginTop: "12px", justifyContent: "center" }}>
                <button onClick={() => openQrCodePrintWindow([assetViewQrModal])}
                  style={{ padding: "6px 14px", borderRadius: "8px", border: "none", background: "#0f172a", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                  Print
                </button>
                <button
                  disabled={!assetViewQrCardHtml}
                  onClick={() => downloadAssetQrCard(assetViewQrModal)}
                  style={{ padding: "6px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f0fdf4", color: "#16a34a", fontWeight: 600, cursor: assetViewQrCardHtml ? "pointer" : "not-allowed", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download
                </button>
                <button onClick={() => setAssetViewQrModal(null)}
                  style={{ padding: "6px 14px", borderRadius: "8px", border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>Close</button>
              </div>
            </div>
          </div>
        )}


        {/* ── Fleet Management ─────────────────────────────── */}
        {nav === "fleet" && (
          <div>
            <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Fleet Management</h1>
                <p style={{ color: "#64748b", fontSize: "13.5px" }}>Manage vehicles, track fuel usage, and schedule maintenance</p>
              </div>
            </div>

            <div style={{ display: "flex", gap: "24px", borderBottom: "1px solid #e2e8f0", marginBottom: "20px", overflowX: "auto" }}>
              {[
                { key: "assets", label: "Fleet Assets" },
                { key: "checklists", label: "Checklists" },
                { key: "logsheets", label: "Logsheets" },
                { key: "history", label: "Submission History" }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFleetSubNav(tab.key)}
                  style={{
                    padding: "10px 4px", fontSize: "14px", fontWeight: 600, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap",
                    color: fleetSubNav === tab.key ? "#2563eb" : "#64748b",
                    borderBottom: fleetSubNav === tab.key ? "2px solid #2563eb" : "2px solid transparent",
                    transition: "all 0.2s"
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {fleetSubNav === "assets" && (
              <>
                {/* ── Fleet Expiry Warnings ── */}
                {(() => {
                  const daysUntil = (dateStr) => {
                    if (!dateStr) return null;
                    const diff = new Date(dateStr).setHours(0,0,0,0) - new Date().setHours(0,0,0,0);
                    return Math.ceil(diff / (1000 * 60 * 60 * 24));
                  };
                  const fleetWarnings = [];
                  assets.filter(a => a.assetType === "fleet").forEach(a => {
                    const meta = a.metadata || {};
                    const name = meta.vehicleNumber || a.assetName;
                    [
                      { field: "insuranceExpiry", label: "Insurance" },
                      { field: "pucExpiry",       label: "PUC" },
                      { field: "serviceDueDate",  label: "Service Due" },
                    ].forEach(({ field, label }) => {
                      const days = daysUntil(meta[field]);
                      if (days === null || days > 5) return;
                      const severity = days <= 0 ? "critical" : days <= 2 ? "high" : "medium";
                      fleetWarnings.push({ id: `${a.id}-${field}`, name, label, days, severity, dateStr: meta[field] });
                    });
                  });
                  if (!fleetWarnings.length) return null;
                  // play sound when warnings appear
                  const sevOrder = { critical: 0, high: 1, medium: 2 };
                  fleetWarnings.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);
                  const topSev = fleetWarnings[0].severity;
                  const sevCfg = {
                    critical: { bg: "#fef2f2", border: "#fca5a5", title: "#991b1b", badge: { bg: "#fee2e2", color: "#dc2626" }, icon: "🚨" },
                    high:     { bg: "#fff7ed", border: "#fdba74", title: "#9a3412", badge: { bg: "#ffedd5", color: "#ea580c" }, icon: "⚠️" },
                    medium:   { bg: "#fffbeb", border: "#fde68a", title: "#92400e", badge: { bg: "#fef3c7", color: "#d97706" }, icon: "🔔" },
                  };
                  const playWarningSound = () => {
                    try {
                      const ctx = new (window.AudioContext || window.webkitAudioContext)();
                      const beeps = topSev === "critical" ? 3 : topSev === "high" ? 2 : 1;
                      for (let i = 0; i < beeps; i++) {
                        const osc = ctx.createOscillator();
                        const gain = ctx.createGain();
                        osc.connect(gain); gain.connect(ctx.destination);
                        osc.frequency.value = topSev === "critical" ? 880 : topSev === "high" ? 660 : 440;
                        osc.type = "sine";
                        gain.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.35);
                        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.35 + 0.25);
                        osc.start(ctx.currentTime + i * 0.35);
                        osc.stop(ctx.currentTime + i * 0.35 + 0.25);
                      }
                    } catch(_) {}
                  };
                  return (
                    <div style={{ marginBottom: "20px", background: sevCfg[topSev].bg, border: `1.5px solid ${sevCfg[topSev].border}`, borderRadius: "12px", overflow: "hidden" }}>
                      <div style={{ padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${sevCfg[topSev].border}` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "20px" }}>{sevCfg[topSev].icon}</span>
                          <span style={{ fontWeight: 800, fontSize: "14px", color: sevCfg[topSev].title }}>Fleet Expiry Warnings ({fleetWarnings.length})</span>
                        </div>
                        <button onClick={playWarningSound} style={{ padding: "5px 12px", borderRadius: "7px", background: "#fff", border: `1px solid ${sevCfg[topSev].border}`, color: sevCfg[topSev].title, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                          🔊 Play Alert
                        </button>
                      </div>
                      <div style={{ padding: "10px 18px 14px", display: "flex", flexDirection: "column", gap: "7px" }}>
                        {fleetWarnings.map(w => {
                          const cfg = sevCfg[w.severity];
                          return (
                            <div key={w.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", background: "#fff", borderRadius: "8px", border: `1px solid ${cfg.border}` }}>
                              <span style={{ background: cfg.badge.bg, color: cfg.badge.color, fontWeight: 800, fontSize: "10px", padding: "2px 8px", borderRadius: "12px", textTransform: "uppercase", flexShrink: 0 }}>{w.severity}</span>
                              <div style={{ flex: 1 }}>
                                <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>{w.name}</span>
                                <span style={{ fontSize: "12px", color: "#64748b", marginLeft: "8px" }}>— {w.label}</span>
                              </div>
                              <span style={{ fontSize: "12.5px", fontWeight: 700, color: cfg.badge.color, flexShrink: 0 }}>
                                {w.days <= 0 ? "Expired" : `${w.days} day${w.days !== 1 ? "s" : ""} left`}
                              </span>
                              <span style={{ fontSize: "11.5px", color: "#94a3b8", flexShrink: 0 }}>
                                {new Date(w.dateStr).toLocaleDateString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {!viewingFleetAsset ? (
                  <Card>
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a", margin: 0 }}>Registered Vehicles</h3>
                      <button onClick={() => { setNav("assets"); setAssetTypeFilter("fleet"); }}
                        style={{ padding: "6px 14px", borderRadius: "6px", background: "#2563eb", color: "#fff", border: "none", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                        + Register New Vehicle
                      </button>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                        <thead>
                          <tr>
                            {["Vehicle Number", "Type", "Driver", "Fuel Type", "Insurance", "Status", "Actions"].map((h) => (
                              <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const fleetAssetsFiltered = assets.filter(a => a.assetType === "fleet");
                            return fleetAssetsFiltered.length === 0 ? (
                              <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                                No vehicles registered. <button onClick={() => { setNav("assets"); setAssetTypeFilter("fleet"); }} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>Register one →</button>
                              </td></tr>
                            ) : fleetAssetsFiltered.map((a) => {
                              const meta = a.metadata || {};
                              const insStatus = meta.insuranceExpiry ? new Date(meta.insuranceExpiry) > new Date() ? "Active" : "Expired" : "—";
                              const insColor = insStatus === "Active" ? "#16a34a" : insStatus === "Expired" ? "#dc2626" : "#94a3b8";
                              return (
                                <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <td style={{ padding: "12px 16px", fontWeight: 600, color: "#2563eb", cursor: "pointer" }} onClick={() => setViewingFleetAsset(a.id)}>{meta.vehicleNumber || a.assetName}</td>
                                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{meta.vehicleType || "—"}</td>
                                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{meta.driver || "—"}</td>
                                  <td style={{ padding: "12px 16px", color: "#64748b" }}>{meta.fuelType || "—"}</td>
                                  <td style={{ padding: "12px 16px", color: insColor, fontWeight: 600 }}>{insStatus}</td>
                                  <td style={{ padding: "12px 16px" }}>
                                    <span style={{ padding: "3px 9px", borderRadius: "12px", fontSize: "11px", fontWeight: 600, background: a.status?.toLowerCase() === "active" ? "#dcfce7" : "#fee2e2", color: a.status?.toLowerCase() === "active" ? "#166534" : "#991b1b" }}>
                                      {a.status?.toLowerCase() === "active" ? "✔ Active" : "Inactive"}
                                    </span>
                                  </td>
                                  <td style={{ padding: "12px 16px", display: "flex", gap: "6px" }}>
                                    <button onClick={() => setViewingFleetAsset(a.id)} style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Details</button>
                                    <button onClick={() => { setEditAsset(a); setShowAssetModal(true); }} style={{ padding: "4px 10px", borderRadius: "6px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Edit</button>
                                    <button onClick={() => handleDeleteAsset(a.id)} style={{ padding: "4px 10px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Delete</button>
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : (() => {
                  const viewingAsset = assets.find(a => a.id === viewingFleetAsset);
                  const meta = viewingAsset?.metadata || {};
                  return (
                    <Card style={{ maxWidth: "100%" }}>
                      <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#0f172a", margin: 0 }}>{meta.vehicleNumber || viewingAsset?.assetName}</h3>
                        <button onClick={() => setViewingFleetAsset(null)} style={{ padding: "6px 14px", borderRadius: "6px", background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>← Back</button>
                      </div>
                      <div style={{ padding: "20px" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Vehicle Type</label>
                            <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>{meta.vehicleType || "—"}</p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Fuel Type</label>
                            <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>{meta.fuelType || "—"}</p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Driver Assigned</label>
                            <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>{meta.driver || "—"}</p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Status</label>
                            <p style={{ margin: 0, fontWeight: 600, color: viewingAsset?.status?.toLowerCase() === "active" ? "#16a34a" : "#dc2626" }}>
                              {viewingAsset?.status?.toLowerCase() === "active" ? "✔ Active" : "Inactive"}
                            </p>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", padding: "16px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Insurance Expiry</label>
                            <p style={{ margin: 0, fontWeight: 600, color: new Date(meta.insuranceExpiry) > new Date() ? "#16a34a" : "#dc2626" }}>
                              {meta.insuranceExpiry ? new Date(meta.insuranceExpiry).toLocaleDateString() : "—"}
                            </p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>PUC Expiry</label>
                            <p style={{ margin: 0, fontWeight: 600, color: meta.pucExpiry && new Date(meta.pucExpiry) < new Date() ? "#dc2626" : "#475569" }}>
                              {meta.pucExpiry ? new Date(meta.pucExpiry).toLocaleDateString() : "—"}
                            </p>
                          </div>
                          <div>
                            <label style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, display: "block", marginBottom: "4px" }}>Service Due</label>
                            <p style={{ margin: 0, fontWeight: 600, color: meta.serviceDueDate && new Date(meta.serviceDueDate) < new Date() ? "#dc2626" : "#475569" }}>
                              {meta.serviceDueDate ? new Date(meta.serviceDueDate).toLocaleDateString() : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })()}
              </>
            )}

            {fleetSubNav === "checklists" && (() => {
              const fleetAssetIds = new Set(assets.filter(a => a.assetType === "fleet").map(a => a.id));
              const fleetChecklists = checklists.filter(c => (c.assetId && fleetAssetIds.has(c.assetId)) || c.assetType === "fleet" || c.category === "fleet");
              return (
              <Card>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>Fleet Checklists ({fleetChecklists.length})</span>
                  <Btn onClick={() => { setEditChecklist(null); setShowChecklistModal(true); }} style={{ fontSize: "12px", padding: "6px 12px" }}>+ Create Checklist</Btn>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr>
                      {["Checklist Name", "Asset / Vehicle", "Frequency", "Status", "Questions", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading.checklists ? (
                      <tr><td colSpan="6" style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Loading…</td></tr>
                    ) : fleetChecklists.length === 0 ? (
                      <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                        No checklists found for fleet assets. Use "+ Create Checklist" above.
                      </td></tr>
                    ) : fleetChecklists.map((c) => (
                      <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{c.checklistName || c.templateName}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{c.assetName || assets.find(a => a.id === c.assetId)?.assetName || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{c.frequency || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "3px 9px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: c.isActive || c.status === "active" ? "#dcfce7" : "#f1f5f9", color: c.isActive || c.status === "active" ? "#16a34a" : "#64748b" }}>
                            {c.isActive || c.status === "active" ? "Active" : (c.status || "Inactive")}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{c.questions?.length ?? "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button title="Edit" onClick={() => { setEditChecklist(c); setShowChecklistModal(true); }}
                              style={{ padding: "4px 8px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Edit</button>
                            <button title="Assign to employee" onClick={() => setAssignFleetChecklist(c)}
                              style={{ padding: "4px 8px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Assign</button>
                            <button title="Delete" onClick={async () => {
                              if (!window.confirm(`Delete checklist '${c.checklistName || c.templateName}'?`)) return;
                              try { await deleteCompanyPortalChecklist(token, c.id); setChecklists(p => p.filter(x => x.id !== c.id)); }
                              catch (e) { alert("Delete failed"); }
                            }} style={{ padding: "4px 8px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              );
            })()}

            {fleetSubNav === "logsheets" && (() => {
              const fleetAssetIds = new Set(assets.filter(a => a.assetType === "fleet").map(a => a.id));
              const fleetLogsheets = logsheetTemplatesList.filter(l =>
                (l.assetId && fleetAssetIds.has(l.assetId)) ||
                (l.assetType && l.assetType.toLowerCase().includes("fleet"))
              );
              return (
              <Card>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>Fleet Logsheets ({fleetLogsheets.length})</span>
                  <Btn onClick={() => { setNav("logsheets"); }} style={{ fontSize: "12px", padding: "6px 12px" }}>+ Create Logsheet</Btn>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr>
                      {["Logsheet Name", "Asset / Vehicle", "Frequency", "Status", "Fields", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading.logsheet_templates ? (
                      <tr><td colSpan="6" style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Loading…</td></tr>
                    ) : fleetLogsheets.length === 0 ? (
                      <tr><td colSpan="6" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                        No logsheets found for fleet assets. Use "+ Create Logsheet" above.
                      </td></tr>
                    ) : fleetLogsheets.map((l) => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{l.name || l.templateName}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{assets.find(a => a.id === l.assetId)?.assetName || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{l.frequency || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "3px 9px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, background: l.status === "active" ? "#dcfce7" : "#f1f5f9", color: l.status === "active" ? "#16a34a" : "#64748b" }}>
                            {l.status || "Active"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{l.fields?.length ?? "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button title="Edit in Logsheets" onClick={() => setNav("logsheets")}
                              style={{ padding: "4px 8px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Edit</button>
                            <button title="Assign to employee" onClick={() => setAssignFleetLogsheet(l)}
                              style={{ padding: "4px 8px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Assign</button>
                            <button title="Delete" onClick={async () => {
                              if (!window.confirm(`Delete logsheet '${l.name || l.templateName}'?`)) return;
                              try { await deleteCompanyPortalLogsheetTemplate(token, l.id); setLogsheetTemplatesList(p => p.filter(x => x.id !== l.id)); }
                              catch (e) { alert("Delete failed"); }
                            }} style={{ padding: "4px 8px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              );
            })()}

            {/* Fleet Logsheet Assignment Modal */}
            {assignFleetLogsheet && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px", padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Assign "{assignFleetLogsheet.name || assignFleetLogsheet.templateName}"</h3>
                    <button onClick={() => setAssignFleetLogsheet(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", color: "#64748b" }}>✕</button>
                  </div>
                  <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>Select an employee to assign this logsheet to:</p>
                  <select id="fleet-assign-emp" style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", marginBottom: "16px" }} defaultValue="">
                    <option value="">— Select Employee —</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.fullName} ({e.role})</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button onClick={() => setAssignFleetLogsheet(null)} style={{ padding: "8px 16px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "none", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    <button onClick={async () => {
                      const empId = document.getElementById("fleet-assign-emp")?.value;
                      if (!empId) { alert("Please select an employee"); return; }
                      try {
                        await createTemplateUserAssignment(token, { templateType: "logsheet", templateId: assignFleetLogsheet.id, assignedTo: Number(empId) });
                        alert("Logsheet assigned successfully!");
                        setAssignFleetLogsheet(null);
                      } catch (e) { alert(e.message || "Assignment failed"); }
                    }} style={{ padding: "8px 16px", borderRadius: "8px", background: "#2563eb", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}>Assign</button>
                  </div>
                </div>
              </div>
            )}

            {/* Fleet Checklist Assignment Modal */}
            {assignFleetChecklist && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.50)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "480px", padding: "24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Assign "{assignFleetChecklist.checklistName || assignFleetChecklist.templateName}"</h3>
                    <button onClick={() => setAssignFleetChecklist(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", color: "#64748b" }}>✕</button>
                  </div>
                  <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>Select an employee to assign this checklist to:</p>
                  <select id="fleet-assign-chk-emp" style={{ width: "100%", padding: "9px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "14px", marginBottom: "16px" }} defaultValue="">
                    <option value="">— Select Employee —</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>{e.fullName} ({e.role})</option>
                    ))}
                  </select>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button onClick={() => setAssignFleetChecklist(null)} style={{ padding: "8px 16px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "none", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    <button onClick={async () => {
                      const empId = document.getElementById("fleet-assign-chk-emp")?.value;
                      if (!empId) { alert("Please select an employee"); return; }
                      try {
                        await createTemplateUserAssignment(token, { templateType: "checklist", templateId: assignFleetChecklist.id, assignedTo: Number(empId) });
                        alert("Checklist assigned successfully!");
                        setAssignFleetChecklist(null);
                      } catch (e) { alert(e.message || "Assignment failed"); }
                    }} style={{ padding: "8px 16px", borderRadius: "8px", background: "#2563eb", color: "#fff", border: "none", fontWeight: 600, cursor: "pointer" }}>Assign</button>
                  </div>
                </div>
              </div>
            )}

            {/* Fleet Submission History */}
            {fleetSubNav === "history" && (
              <Card>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "14px" }}>Submission History ({fleetHistory.length})</span>
                  <button onClick={async () => { try { await downloadFleetSubmissionsCSV(token); } catch (e) { alert("CSV export failed"); } }}
                    style={{ padding: "6px 14px", borderRadius: "8px", background: "#16a34a", color: "#fff", border: "none", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    ⬇ Export CSV
                  </button>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                  <thead>
                    <tr>
                      {["Type", "Template", "Asset / Vehicle", "Submitted By", "Date & Time", "Location", "Actions"].map((h) => (
                        <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loading.fleet_history ? (
                      <tr><td colSpan="7" style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>Loading…</td></tr>
                    ) : fleetHistory.length === 0 ? (
                      <tr><td colSpan="7" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No submissions found for fleet assets yet.</td></tr>
                    ) : fleetHistory.map((h, i) => (
                      <tr key={`${h.type}-${h.id}-${i}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ padding: "3px 9px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
                            background: h.type === "checklist" ? "#ede9fe" : "#dbeafe",
                            color: h.type === "checklist" ? "#7c3aed" : "#2563eb" }}>
                            {h.type === "checklist" ? "✓ Checklist" : "📋 Logsheet"}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{h.name || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{h.assetName || "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{h.submittedBy || "Anonymous"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b" }}>{h.submittedAt ? new Date(h.submittedAt).toLocaleString() : "—"}</td>
                        <td style={{ padding: "12px 16px", color: "#64748b", fontSize: "12px" }}>
                          {h.lat && h.lng ? (
                            <a href={`https://maps.google.com/?q=${h.lat},${h.lng}`} target="_blank" rel="noopener noreferrer"
                              style={{ color: "#2563eb", textDecoration: "none" }}>
                              📍 {Number(h.lat).toFixed(4)}, {Number(h.lng).toFixed(4)}
                            </a>
                          ) : <span style={{ color: "#cbd5e1" }}>—</span>}
                        </td>
                        <td style={{ padding: "12px 16px" }}>
                          <button onClick={async () => {
                            setFleetSubmissionDetailLoading(true);
                            try {
                              const detail = await getFleetSubmissionDetail(token, h.type, h.id);
                              setFleetSubmissionDetail(detail);
                            } catch (e) { alert("Failed to load details"); }
                            finally { setFleetSubmissionDetailLoading(false); }
                          }} style={{ padding: "4px 10px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                            {fleetSubmissionDetailLoading ? "…" : "Details"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}

            {/* Fleet Submission Detail Modal */}
            {fleetSubmissionDetail && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
                <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "600px", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
                  <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{fleetSubmissionDetail.name}</h3>
                      <p style={{ margin: "3px 0 0", fontSize: "12px", color: "#64748b" }}>
                        {fleetSubmissionDetail.assetName} · {fleetSubmissionDetail.submittedBy} · {fleetSubmissionDetail.submittedAt ? new Date(fleetSubmissionDetail.submittedAt).toLocaleString() : "—"}
                        {fleetSubmissionDetail.shift ? ` · Shift: ${fleetSubmissionDetail.shift}` : ""}
                        {fleetSubmissionDetail.lat && fleetSubmissionDetail.lng ? ` · 📍 ${Number(fleetSubmissionDetail.lat).toFixed(4)}, ${Number(fleetSubmissionDetail.lng).toFixed(4)}` : ""}
                      </p>
                    </div>
                    <button onClick={() => setFleetSubmissionDetail(null)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", padding: "6px 10px", cursor: "pointer", color: "#64748b", fontSize: "16px" }}>✕</button>
                  </div>
                  <div style={{ overflowY: "auto", padding: "16px 20px", flex: 1 }}>
                    {(!fleetSubmissionDetail.answers || fleetSubmissionDetail.answers.length === 0) ? (
                      <p style={{ color: "#94a3b8", textAlign: "center", padding: "20px 0" }}>No answer data available.</p>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            <th style={{ padding: "8px 12px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>Question</th>
                            <th style={{ padding: "8px 12px", textAlign: "left", color: "#475569", fontWeight: 600, borderBottom: "1px solid #e2e8f0" }}>Answer</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fleetSubmissionDetail.answers.map((a, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "8px 12px", color: "#0f172a", fontWeight: 500 }}>{a.question}</td>
                              <td style={{ padding: "8px 12px", color: "#475569" }}>{a.answer || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── My Tasks ──────────────────────────────────────── */}
        {nav === "mytasks" && (
          <div>
            <div style={{ marginBottom: "24px" }}>
              <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>My Tasks</h1>
              <p style={{ color: "#64748b", fontSize: "13.5px" }}>Templates assigned to you by your supervisor or admin</p>
            </div>

            {loading.mytasks ? (
              <p style={{ color: "#94a3b8", textAlign: "center", padding: "40px" }}>Loading…</p>
            ) : myAssignments.length === 0 ? (
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "60px 20px", textAlign: "center" }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5" style={{ marginBottom: "12px" }}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                <p style={{ color: "#94a3b8", fontSize: "15px", marginBottom: "4px" }}>No tasks assigned yet</p>
                <p style={{ color: "#cbd5e1", fontSize: "13px" }}>Your supervisor or admin will assign checklists and logsheets to you here</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "14px" }}>
                  <StatCard label="Total Assigned" value={myAssignments.length} sub="Templates to complete" iconBg="#eff6ff" iconCol="#2563eb" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/></svg>} />
                  <StatCard label="Checklists" value={myAssignments.filter((a) => a.templateType === "checklist").length} iconBg="#f0fdf4" iconCol="#16a34a" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>} />
                  <StatCard label="Logsheets" value={myAssignments.filter((a) => a.templateType === "logsheet").length} iconBg="#f3e8ff" iconCol="#7c3aed" icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>} />
                </div>

                {/* Checklists section */}
                {myAssignments.filter((a) => a.templateType === "checklist").length > 0 && (
                  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", background: "#f0fdf4", borderBottom: "1px solid #dcfce7", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#166534", margin: 0 }}>Assigned Checklists</h2>
                    </div>
                    <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {myAssignments.filter((a) => a.templateType === "checklist").map((a) => (
                        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "9px", border: "1px solid #e2e8f0", background: "#fafafa" }}>
                          <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><polyline points="9 11 12 14 22 4"/></svg>
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", margin: 0 }}>{a.templateName}</p>
                            <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>Assigned by {a.assignedByName} · {new Date(a.createdAt).toLocaleDateString()}</p>
                            {a.note && <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>Note: {a.note}</p>}
                          </div>
                          {currentUser.role === "supervisor" ? (
                            <span style={{ padding: "5px 12px", borderRadius: "7px", background: "#f1f5f9", color: "#94a3b8", fontSize: "12px", fontWeight: 600, border: "1px solid #e2e8f0" }}>View Only</span>
                          ) : (
                            <button onClick={() => setNav("checklists")}
                              style={{ padding: "6px 16px", borderRadius: "7px", background: "#16a34a", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                              Open
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Logsheets section */}
                {myAssignments.filter((a) => a.templateType === "logsheet").length > 0 && (
                  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                    <div style={{ padding: "14px 18px", background: "#f5f3ff", borderBottom: "1px solid #ede9fe", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#4c1d95", margin: 0 }}>Assigned Logsheet Templates</h2>
                    </div>
                    <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {myAssignments.filter((a) => a.templateType === "logsheet").map((a) => {
                        const FREQ_LABELS = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", half_yearly: "Half-Yearly", yearly: "Yearly" };
                        const FREQ_COLORS = { daily: ["#dcfce7","#16a34a"], weekly: ["#dbeafe","#1d4ed8"], monthly: ["#fef9c3","#ca8a04"], quarterly: ["#ede9fe","#7c3aed"], half_yearly: ["#fce7f3","#be185d"], yearly: ["#ffedd5","#c2410c"] };
                        const freq = a.frequency || "daily";
                        const [fbg, ftx] = FREQ_COLORS[freq] || ["#f1f5f9","#475569"];
                        return (
                          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "9px", border: "1px solid #e2e8f0", background: "#fafafa" }}>
                            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", margin: 0 }}>{a.templateName}</p>
                              <p style={{ fontSize: "12px", color: "#64748b", margin: 0 }}>{a.assetName ? `Asset: ${a.assetName} · ` : ""} Assigned by {a.assignedByName} · {new Date(a.createdAt).toLocaleDateString()}</p>
                            </div>
                            <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: fbg, color: ftx }}>{FREQ_LABELS[freq] || freq}</span>
                            <button onClick={() => { setDirectFillLogsheet({ templateId: a.templateId, assetId: a.assetId, template: a }); setNav("logsheets"); }}
                              style={{ padding: "6px 16px", borderRadius: "7px", background: "#7c3aed", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px" }}>
                              {currentUser.role === "supervisor" ? "Open & Fill" : "Fill"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Supervisor: show what they've assigned to their team */}
                {currentUser.role === "supervisor" && assignments.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginTop: "8px" }}>
                    <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Assignments I've Made to My Team</h2>
                      <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>{assignments.length} total</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13.5px" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            {["Team Member", "Type", "Template", "Assigned On"].map((h) => (
                              <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                            ))}
                            <th style={{ padding: "10px 14px", borderBottom: "1px solid #e2e8f0" }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignments.map((a) => (
                            <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a" }}>{a.assignedToName}</td>
                              <td style={{ padding: "10px 14px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: a.templateType === "checklist" ? "#f0fdf4" : "#eff6ff", color: a.templateType === "checklist" ? "#16a34a" : "#2563eb" }}>
                                  {a.templateType}
                                </span>
                              </td>
                              <td style={{ padding: "10px 14px", color: "#475569" }}>{a.templateName}</td>
                              <td style={{ padding: "10px 14px", color: "#94a3b8", fontSize: "12px" }}>{new Date(a.createdAt).toLocaleDateString()}</td>
                              <td style={{ padding: "10px 14px" }}>
                                <button onClick={async () => { try { await deleteTemplateUserAssignment(token, a.id); handleAssignmentRemoved(a.id); } catch (e) { alert(e.message); } }}
                                  style={{ width: "26px", height: "26px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Settings (Public Dashboard Link) ─────────────────── */}
      {nav === "settings" && currentUser.role === "admin" && (() => {
        const link = settingsPublicToken ? `${window.location.origin}/public/${settingsPublicToken}` : "";
        const copyLink = async () => {
          if (!link) return;
          try {
            if (navigator?.clipboard?.writeText && window.isSecureContext) {
              await navigator.clipboard.writeText(link);
            } else {
              const ta = document.createElement("textarea");
              ta.value = link;
              ta.setAttribute("readonly", "");
              ta.style.position = "fixed";
              ta.style.opacity = "0";
              ta.style.pointerEvents = "none";
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              const ok = document.execCommand("copy");
              document.body.removeChild(ta);
              if (!ok) throw new Error("Copy command failed");
            }
            setSettingsCopied(true);
            setTimeout(() => setSettingsCopied(false), 2000);
          } catch (_) {
            alert("Copy failed. Please select and copy the link manually.");
          }
        };
        const regenerate = async () => {
          setSettingsRegen(true);
          try {
            const res = await fetch(`${getApiBaseUrl()}/api/company-portal/public-link/regenerate`, {
              method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
            });
            const d = await res.json();
            setSettingsPublicToken(d.publicToken || "");
          } catch(_) {}
          setSettingsRegen(false);
        };
        return (
          <main style={{ flex: 1, padding: "32px 24px", overflowY: "auto", scrollBehavior: "smooth", fontFamily: "'Inter',-apple-system,sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
            <div style={{ width: "100%", maxWidth: "680px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", marginBottom: "4px" }}>Settings</h1>
            <p style={{ color: "#64748b", fontSize: "13.5px", marginBottom: "28px" }}>Manage your company portal configuration</p>
            <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                <div style={{ width: "40px", height: "40px", background: "#eff6ff", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>Public Dashboard Link</h2>
                  <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>Share this link so clients can view a read-only asset dashboard</p>
                </div>
              </div>
              {settingsPublicToken === null ? (
                <p style={{ color: "#94a3b8", fontSize: "13px" }}>Loading…</p>
              ) : (
                <div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                    <input readOnly value={link} style={{ flex: 1, minWidth: "200px", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: "9px", fontSize: "13px", background: "#f8fafc", color: "#0f172a", fontFamily: "monospace" }} />
                    <button onClick={copyLink} style={{ padding: "10px 16px", borderRadius: "9px", border: "1px solid #bfdbfe", background: settingsCopied ? "#dcfce7" : "#eff6ff", color: settingsCopied ? "#16a34a" : "#2563eb", fontWeight: 700, cursor: "pointer", fontSize: "13px", whiteSpace: "nowrap" }}>
                      {settingsCopied ? "✓ Copied!" : "Copy Link"}
                    </button>
                    <a href={link} target="_blank" rel="noopener noreferrer" style={{ padding: "10px 16px", borderRadius: "9px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontWeight: 600, fontSize: "13px", textDecoration: "none", whiteSpace: "nowrap" }}>
                      Preview ↗
                    </a>
                  </div>
                  <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <button onClick={regenerate} disabled={settingsRegen} style={{ padding: "7px 14px", borderRadius: "8px", border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontWeight: 600, fontSize: "12.5px", cursor: settingsRegen ? "not-allowed" : "pointer" }}>
                      {settingsRegen ? "Regenerating…" : "Regenerate Link"}
                    </button>
                    <p style={{ margin: 0, fontSize: "11.5px", color: "#94a3b8" }}>Regenerating invalidates the old link.</p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Status Master ── */}
            <StatusMasterSection token={token} />

          </div>
          </main>
        );
      })()}

      {/* Modals */}
      {showDeptModal && (
        <DeptModal
          token={token}
          companyId={currentUser?.companyId}
          existing={editDept}
          onClose={() => { setShowDeptModal(false); setEditDept(null); }}
          onSaved={handleDeptSaved}
        />
      )}
      {/* Asset Detail Modal — full screen with tabs */}
      {assetDetailModal && (() => {
        const a = assetDetailModal;
        const m = typeof a.metadata === "string"
          ? (() => { try { return JSON.parse(a.metadata || "{}"); } catch { return {}; } })()
          : (a.metadata || {});
        const normalizeImgUrl = (img) => {
          const r0 = typeof img === "string"
            ? img
            : (img && typeof img === "object" ? (img.url || img.src || img.path || "") : "");
          const raw = typeof r0 === "string" ? r0 : "";
          if (!raw) return "";
          if (raw.startsWith("http") || raw.startsWith("/")) return raw;
          return `/${raw}`;
        };
        const hcImages = [
          ...(Array.isArray(m.hcImages) ? m.hcImages : []),
          ...(Array.isArray(m.images) ? m.images : []),
          ...(Array.isArray(m.invoiceImages) ? m.invoiceImages : []),
          ...(m.invoiceUrl ? [m.invoiceUrl] : []),
          ...(m.hcInvoiceUrl ? [m.hcInvoiceUrl] : []),
        ].map(normalizeImgUrl).filter(Boolean);

        // Normalize maintenance types from both web schema (maintenanceTypes) and mobile schema (warranty/amc/cmc objects)
        const maintenanceTypes = m.maintenanceTypes || {
          warranty: !!(m.warranty?.enabled),
          amc: !!(m.amc?.enabled),
          cmc: !!(m.cmc?.enabled),
          inHouse: !!(m.inHouse),
          catalyst: !!(m.catalyst),
        };
        const warrantyStart = m.warrantyStart || m.warranty?.startDate || "";
        const warrantyEnd   = m.warrantyEnd   || m.warranty?.endDate   || "";
        const amcStart      = m.amcStart      || m.amc?.startDate      || "";
        const amcEnd        = m.amcEnd        || m.amc?.endDate        || "";
        const cmcStart      = m.cmcStart      || m.cmc?.startDate      || "";
        const cmcEnd        = m.cmcEnd        || m.cmc?.endDate        || "";
        const maint = [maintenanceTypes.warranty && "Warranty", maintenanceTypes.amc && "AMC", maintenanceTypes.cmc && "CMC", maintenanceTypes.inHouse && "In House", maintenanceTypes.catalyst && "Catalyst"].filter(Boolean).join(", ") || m.maintenanceType || "—";
        const fields = [
          ["Asset ID", a.generatedAssetId || a.assetUniqueId],
          ["Equipment Name", m.equipmentName || a.assetName],
          ["Make / Manufacturer", m.make || m.manufacturer],
          ["Model", m.model],
          ["Serial No.", m.serialNo],
          ["Accessories", m.accessories],
          ["Dealer / Distributor", m.dealer],
          ["Manufacturing Year", m.manufacturingYear || m.mfgYear],
          ["Installation Date", m.installationDate],
          ["Invoice No.", m.invoiceNo],
          ["Purchase Date", m.purchaseDate],
          ["Purchase Cost / Asset Value", m.purchaseCost ? `₹ ${m.purchaseCost}` : null],
          ["Maintenance", maint !== "—" ? maint : null],
          ["RBER", m.rber ? "Yes" : null],
          ["Remarks", m.remarks],
          ["Department", a.departmentName],
          ["Building", a.building],
          ["Floor", a.floor],
          ["Room / Area", a.room],
          ["Working Status", a.working_status || m.workingStatus],
          ["Status", a.status],
          ["Registered On", a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-IN") : null],
        ].filter(([, v]) => v);

        // Helper: format milliseconds as hh:mm:ss
        const fmtMs = (ms) => {
          const h = Math.floor(ms / 3600000);
          const min = Math.floor((ms % 3600000) / 60000);
          const sec = Math.floor((ms % 60000) / 1000);
          return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
        };

        // Compute MTBF / MTTR / Total downtime from call logs (available after loadCallLogs)
        const closedCalls = (assetDetailCallLogs || []).filter(wo => (wo.status === "closed" || wo.status === "resolved") && wo.createdAt && wo.closedAt);
        const totalDownMs = closedCalls.reduce((s, wo) => s + Math.max(0, new Date(wo.closedAt) - new Date(wo.createdAt)), 0);
        const failures = closedCalls.length;
        const assetAgeMs = a.createdAt ? Math.max(0, Date.now() - new Date(a.createdAt)) : 0;
        const operatingMs = Math.max(0, assetAgeMs - totalDownMs);
        const mtbfLabel = failures > 0 ? fmtMs(operatingMs / failures) : "—";
        const mttrLabel = failures > 0 ? fmtMs(totalDownMs / failures) : "—";
        const totalDownLabel = totalDownMs > 0 ? fmtMs(totalDownMs) : "—";

        // Fetch call logs for the asset when tab selected
        const loadCallLogs = async () => {
          if (assetDetailCallLogs !== null) return;
          try {
            const r = await fetch(`${getApiBaseUrl()}/api/company-portal/work-orders?assetId=${a.id}&limit=200`, { headers: { Authorization: `Bearer ${token}` } });
            const d = await r.json();
            setAssetDetailCallLogs(Array.isArray(d?.data) ? d.data : []);
          } catch { setAssetDetailCallLogs([]); }
        };

        const loadCalibration = async () => {
          if (assetDetailCalibration !== null) return;
          try {
            const r = await fetch(`${getApiBaseUrl()}/api/company-portal/assets/${a.id}/calibration-records`, { headers: { Authorization: `Bearer ${token}` } });
            const d = await r.json();
            setAssetDetailCalibration(Array.isArray(d) ? d : []);
          } catch { setAssetDetailCalibration([]); }
        };

        const handleTabChange = (tab) => {
          setAssetDetailTab(tab);
          if (tab === "calllogs") loadCallLogs();
          if (tab === "calibration") loadCalibration();
        };

        // Purchase history fields from asset metadata
        const purchaseMeta = {
          invoiceNo: m.invoiceNo || "",
          invoiceDate: m.invoiceDate || "",
          purchaseCost: m.purchaseCost || "",
          hcInvoiceUrl: m.hcInvoiceUrl || "",
          maintenanceTypes,
          warrantyStart,
          warrantyEnd,
          amcStart,
          amcEnd,
          cmcStart,
          cmcEnd,
          remarks: m.remarks || "",
        };

        const TABS = [
          { key: "overview", label: "Overview" },
          { key: "calllogs", label: "Call Log History" },
          { key: "pms", label: "Preventive Maintenance History" },
          { key: "calibration", label: "Calibration History" },
          { key: "purchase", label: "Purchase History" },
          { key: "indent", label: "Indent Details" },
        ];

        const tabStyle = (key) => ({
          padding: "12px 18px", background: "none", border: "none",
          borderBottom: assetDetailTab === key ? "3px solid #2563eb" : "3px solid transparent",
          color: assetDetailTab === key ? "#2563eb" : "#64748b",
          fontSize: "13.5px", fontWeight: assetDetailTab === key ? 700 : 500,
          cursor: "pointer", whiteSpace: "nowrap", transition: "color 0.15s",
        });

        const EmptyMsg = ({ msg }) => (
          <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: "12px", opacity: 0.5 }}><path d="M9 12h6m-6 4h6M9 8h.01M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3z"/></svg>
            <p style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{msg || "No records found"}</p>
          </div>
        );

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "stretch", justifyContent: "stretch" }}
            onClick={e => e.target === e.currentTarget && (setAssetDetailModal(null), setAssetDetailTab("overview"), setAssetDetailCallLogs(null), setAssetDetailCalibration(null))}>
            <div style={{ background: "#fff", width: "100vw", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{m.equipmentName || a.assetName}</h3>
                    <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "6px" }}>{a.generatedAssetId || a.assetUniqueId}</span>
                  </div>
                  <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: a.status === "Active" ? "#dcfce7" : "#f1f5f9", color: a.status === "Active" ? "#16a34a" : "#475569" }}>{a.status || "—"}</span>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <button onClick={() => { setAssetDetailModal(null); setAssetDetailTab("overview"); setAssetDetailCallLogs(null); setAssetDetailCalibration(null); setEditAsset(a); setShowAssetModal(true); }}
                    style={{ padding: "8px 16px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Edit Asset</button>
                  <button onClick={() => { handleShowAssetQR(a); setAssetDetailModal(null); setAssetDetailTab("overview"); setAssetDetailCallLogs(null); setAssetDetailCalibration(null); }}
                    style={{ padding: "8px 16px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Print QR</button>
                  <button onClick={() => { setAssetDetailModal(null); setAssetDetailTab("overview"); setAssetDetailCallLogs(null); setAssetDetailCalibration(null); }}
                    style={{ width: "36px", height: "36px", borderRadius: "50%", border: "none", background: "#f1f5f9", cursor: "pointer", fontSize: "20px", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
              </div>

              {/* Tab bar */}
              <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff", padding: "0 24px", overflowX: "auto", flexShrink: 0 }}>
                {TABS.map(t => (
                  <button key={t.key} style={tabStyle(t.key)} onClick={() => handleTabChange(t.key)}>{t.label}</button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc", padding: "24px" }}>

                {/* Overview */}
                {assetDetailTab === "overview" && (
                  <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
                    {hcImages.length > 0 && (
                      <div style={{ marginBottom: "24px" }}>
                        <h4 style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>Images</h4>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                          {hcImages.map((img, i) => {
                            const src = img;
                            return (
                              <a key={i} href={src} target="_blank" rel="noreferrer">
                                <img src={src} alt={`img-${i+1}`} style={{ width: "120px", height: "120px", objectFit: "cover", borderRadius: "10px", border: "1.5px solid #e2e8f0" }}
                                  onError={e => { e.currentTarget.style.display = "none"; }} />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                      {[
                        ["Cost of Asset", m.purchaseCost ? `₹ ${m.purchaseCost}` : "—"],
                        ["Total Down Time", totalDownLabel],
                        ["MTBF (hh:mm:ss)", mtbfLabel],
                        ["MTTR (hh:mm:ss)", mttrLabel],
                      ].map(([lbl, val]) => (
                        <div key={lbl} style={{ background: "#fff", borderRadius: "10px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{lbl}</div>
                          <div style={{ fontSize: "18px", color: "#0f172a", fontWeight: 800 }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                      {fields.map(([label, value]) => (
                        <div key={label} style={{ background: "#fff", borderRadius: "10px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</div>
                          <div style={{ fontSize: "14px", color: "#0f172a", fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Call Logs */}
                {assetDetailTab === "calllogs" && (
                  <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Call Log History / Work Orders for this Asset</h4>
                    {assetDetailCallLogs === null ? (
                      <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading…</div>
                    ) : assetDetailCallLogs.length === 0 ? <EmptyMsg msg="No call logs found for this asset" /> : (() => {
                      // Calculate total downtime across all closed/resolved work orders
                      const totalDowntimeMs = assetDetailCallLogs.reduce((sum, wo) => {
                        if ((wo.status === "closed" || wo.status === "resolved") && wo.createdAt && wo.closedAt) {
                          return sum + (new Date(wo.closedAt) - new Date(wo.createdAt));
                        }
                        return sum;
                      }, 0);
                      const totalDowntimeHours = Math.floor(totalDowntimeMs / 3600000);
                      const totalDowntimeMins = Math.floor((totalDowntimeMs % 3600000) / 60000);
                      const downtimeLabel = totalDowntimeMs > 0 ? `${totalDowntimeHours}h ${totalDowntimeMins}m` : "—";
                      return (
                        <>
                          <div style={{ display: "flex", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                            <div style={{ background: "#fff", borderRadius: "10px", padding: "12px 20px", border: "1px solid #e2e8f0", minWidth: "160px" }}>
                              <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Total Calls</div>
                              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>{assetDetailCallLogs.length}</div>
                            </div>
                            <div style={{ background: "#fff", borderRadius: "10px", padding: "12px 20px", border: "1px solid #e2e8f0", minWidth: "160px" }}>
                              <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Total Down Time</div>
                              <div style={{ fontSize: "24px", fontWeight: 800, color: totalDowntimeMs > 0 ? "#dc2626" : "#0f172a" }}>{downtimeLabel}</div>
                            </div>
                            <div style={{ background: "#fff", borderRadius: "10px", padding: "12px 20px", border: "1px solid #e2e8f0", minWidth: "160px" }}>
                              <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>Open</div>
                              <div style={{ fontSize: "24px", fontWeight: 800, color: "#854d0e" }}>{assetDetailCallLogs.filter(wo => wo.status !== "closed" && wo.status !== "resolved").length}</div>
                            </div>
                          </div>
                          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                              <thead>
                                <tr style={{ background: "#f8fafc" }}>
                                  {["WO Number","Description","Priority","Status","Assigned To","Created","Closed","Down Time"].map(h => (
                                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {assetDetailCallLogs.map(wo => {
                                  const downMs = (wo.status === "closed" || wo.status === "resolved") && wo.createdAt && wo.closedAt
                                    ? Math.max(0, new Date(wo.closedAt) - new Date(wo.createdAt)) : 0;
                                  const downLabel = downMs > 0 ? fmtMs(downMs) : "—";
                                  return (
                                    <tr key={wo.id} style={{ borderBottom: "1px solid #f1f5f9" }} onMouseEnter={e => e.currentTarget.style.background="#f8fafc"} onMouseLeave={e => e.currentTarget.style.background=""}>
                                      <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#2563eb", fontWeight: 600, fontSize: "12px" }}>{wo.workOrderNumber || `WO-${wo.id}`}</td>
                                      <td style={{ padding: "10px 14px", color: "#334155", maxWidth: "260px" }}>{wo.issueDescription || "—"}</td>
                                      <td style={{ padding: "10px 14px" }}>
                                        <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: wo.priority === "high" ? "#fee2e2" : wo.priority === "medium" ? "#fef9c3" : "#f1f5f9", color: wo.priority === "high" ? "#dc2626" : wo.priority === "medium" ? "#854d0e" : "#64748b" }}>{wo.priority || "—"}</span>
                                      </td>
                                      <td style={{ padding: "10px 14px" }}>
                                        <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: wo.status === "closed" || wo.status === "resolved" ? "#dcfce7" : wo.status === "in_progress" ? "#dbeafe" : "#fef9c3", color: wo.status === "closed" || wo.status === "resolved" ? "#166534" : wo.status === "in_progress" ? "#1e40af" : "#854d0e" }}>{wo.status || "—"}</span>
                                      </td>
                                      <td style={{ padding: "10px 14px", color: "#475569" }}>{wo.assignedToName || "Unassigned"}</td>
                                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{wo.createdAt ? new Date(wo.createdAt).toLocaleDateString("en-IN") : "—"}</td>
                                      <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{wo.closedAt ? new Date(wo.closedAt).toLocaleDateString("en-IN") : "—"}</td>
                                      <td style={{ padding: "10px 14px", color: downMs > 0 ? "#dc2626" : "#94a3b8", fontWeight: downMs > 0 ? 600 : 400, fontSize: "12px" }}>{downLabel}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {assetDetailTab === "indent" && (
                  <div style={{ maxWidth: "900px", margin: "0 auto" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Indent Details</h4>
                    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "24px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                        {[
                          ["Indent No.", m.indentNo],
                          ["Indent Date", m.indentDate ? new Date(m.indentDate).toLocaleDateString("en-IN") : null],
                          ["Requested By", m.requestedBy],
                          ["Approved By", m.approvedBy],
                          ["Supplier", m.supplier || m.dealer],
                          ["PO Number", m.poNumber],
                          ["PO Date", m.poDate ? new Date(m.poDate).toLocaleDateString("en-IN") : null],
                          ["Quantity", m.quantity],
                          ["Unit Price", m.unitPrice ? `₹ ${m.unitPrice}` : null],
                          ["Total Cost", m.totalCost ? `₹ ${m.totalCost}` : (m.purchaseCost ? `₹ ${m.purchaseCost}` : null)],
                          ["GRN Number", m.grnNumber],
                          ["GRN Date", m.grnDate ? new Date(m.grnDate).toLocaleDateString("en-IN") : null],
                          ["Remarks", m.indentRemarks || m.remarks],
                        ].filter(([, v]) => v).map(([label, value]) => (
                          <div key={label} style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</div>
                            <div style={{ fontSize: "14px", color: "#0f172a", fontWeight: 600 }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      {!m.indentNo && !m.poNumber && !m.grnNumber && !m.requestedBy && (
                        <EmptyMsg msg="No indent details recorded for this asset." />
                      )}
                    </div>
                  </div>
                )}

                {/* Calibration Records */}
                {assetDetailTab === "calibration" && (
                  <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Calibration Records</h4>
                    {assetDetailCalibration === null ? (
                      <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading…</div>
                    ) : assetDetailCalibration.length === 0 ? <EmptyMsg msg="No calibration records found" /> : (
                      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                          <thead>
                            <tr style={{ background: "#f8fafc" }}>
                              {["Calibration Date","Next Due","Vendor","Certificate No.","Calibrated By","Status","Remarks"].map(h => (
                                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {assetDetailCalibration.map(cr => (
                              <tr key={cr.id} style={{ borderBottom: "1px solid #f1f5f9" }} onMouseEnter={e => e.currentTarget.style.background="#f8fafc"} onMouseLeave={e => e.currentTarget.style.background=""}>
                                <td style={{ padding: "10px 14px", color: "#0f172a", fontWeight: 600 }}>{cr.calibrationDate ? new Date(cr.calibrationDate).toLocaleDateString("en-IN") : "—"}</td>
                                <td style={{ padding: "10px 14px", color: cr.nextDueDate && new Date(cr.nextDueDate) < new Date() ? "#dc2626" : "#475569", fontWeight: cr.nextDueDate && new Date(cr.nextDueDate) < new Date() ? 700 : 400 }}>{cr.nextDueDate ? new Date(cr.nextDueDate).toLocaleDateString("en-IN") : "—"}</td>
                                <td style={{ padding: "10px 14px", color: "#475569" }}>{cr.vendorName || "—"}</td>
                                <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: "12px", color: "#2563eb" }}>{cr.certificateNumber || "—"}</td>
                                <td style={{ padding: "10px 14px", color: "#475569" }}>{cr.calibratedBy || "—"}</td>
                                <td style={{ padding: "10px 14px" }}>
                                  <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: "#dcfce7", color: "#166534" }}>{cr.status || "Active"}</span>
                                </td>
                                <td style={{ padding: "10px 14px", color: "#64748b" }}>{cr.remarks || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* PMS History */}
                {assetDetailTab === "pms" && (
                  <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Preventive Maintenance History</h4>
                    <EmptyMsg msg="Preventive maintenance records will appear here once scheduled maintenance is logged for this asset." />
                  </div>
                )}

                {/* Purchase History */}
                {assetDetailTab === "purchase" && (
                  <div style={{ maxWidth: "900px", margin: "0 auto" }}>
                    <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Purchase History</h4>
                    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "24px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                        {[
                          ["Invoice No.", purchaseMeta.invoiceNo],
                          ["Purchase Date", purchaseMeta.invoiceDate ? new Date(purchaseMeta.invoiceDate).toLocaleDateString("en-IN") : null],
                          ["Purchase Cost", purchaseMeta.purchaseCost ? `\u20B9 ${purchaseMeta.purchaseCost}` : null],
                        ].map(([label, value]) => value ? (
                          <div key={label} style={{ background: "#f8fafc", borderRadius: "10px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</div>
                            <div style={{ fontSize: "15px", color: "#0f172a", fontWeight: 600 }}>{value}</div>
                          </div>
                        ) : null)}
                      </div>
                      {purchaseMeta.hcInvoiceUrl && (
                        <div style={{ marginBottom: "20px" }}>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>Invoice File</div>
                          <a href={purchaseMeta.hcInvoiceUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", color: "#2563eb", fontWeight: 600, fontSize: "13px", textDecoration: "none" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            View Invoice
                          </a>
                        </div>
                      )}
                      {Object.keys(purchaseMeta.maintenanceTypes).length > 0 && (
                        <div>
                          <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>Maintenance Under</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
                            {purchaseMeta.maintenanceTypes.warranty && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#dcfce7", color: "#166534" }}>Warranty</span>}
                            {purchaseMeta.maintenanceTypes.amc && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#dbeafe", color: "#1e40af" }}>AMC</span>}
                            {purchaseMeta.maintenanceTypes.cmc && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#fef3c7", color: "#92400e" }}>CMC</span>}
                            {purchaseMeta.maintenanceTypes.inHouse && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#f3e8ff", color: "#6b21a8" }}>In House</span>}
                            {purchaseMeta.maintenanceTypes.catalyst && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#fce7f3", color: "#9d174d" }}>Catalyst</span>}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                            {purchaseMeta.maintenanceTypes.warranty && purchaseMeta.warrantyStart && (
                              <div style={{ background: "#f0fdf4", borderRadius: "10px", padding: "12px 16px", border: "1px solid #bbf7d0" }}>
                                <div style={{ fontSize: "11px", fontWeight: 700, color: "#166534", textTransform: "uppercase", marginBottom: "4px" }}>Warranty Period</div>
                                <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>{new Date(purchaseMeta.warrantyStart).toLocaleDateString("en-IN")} — {purchaseMeta.warrantyEnd ? new Date(purchaseMeta.warrantyEnd).toLocaleDateString("en-IN") : "—"}</div>
                              </div>
                            )}
                            {purchaseMeta.maintenanceTypes.amc && purchaseMeta.amcStart && (
                              <div style={{ background: "#eff6ff", borderRadius: "10px", padding: "12px 16px", border: "1px solid #bfdbfe" }}>
                                <div style={{ fontSize: "11px", fontWeight: 700, color: "#1e40af", textTransform: "uppercase", marginBottom: "4px" }}>AMC Period</div>
                                <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>{new Date(purchaseMeta.amcStart).toLocaleDateString("en-IN")} — {purchaseMeta.amcEnd ? new Date(purchaseMeta.amcEnd).toLocaleDateString("en-IN") : "—"}</div>
                              </div>
                            )}
                            {purchaseMeta.maintenanceTypes.cmc && purchaseMeta.cmcStart && (
                              <div style={{ background: "#fffbeb", borderRadius: "10px", padding: "12px 16px", border: "1px solid #fde68a" }}>
                                <div style={{ fontSize: "11px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", marginBottom: "4px" }}>CMC Period</div>
                                <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>{new Date(purchaseMeta.cmcStart).toLocaleDateString("en-IN")} — {purchaseMeta.cmcEnd ? new Date(purchaseMeta.cmcEnd).toLocaleDateString("en-IN") : "—"}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {!purchaseMeta.invoiceNo && !purchaseMeta.purchaseCost && !purchaseMeta.hcInvoiceUrl && Object.keys(purchaseMeta.maintenanceTypes).length === 0 && (
                        <EmptyMsg msg="No purchase information recorded for this asset." />
                      )}
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        );
      })()}
      {showAssetModal && (
        <AssetModal
          token={token}
          companyId={currentUser.companyId}
          existing={editAsset}
          departments={departments}
          employees={employees}
          assetTypesList={assetTypesList}
          companySectors={companySectors}
          onClose={() => { setShowAssetModal(false); setEditAsset(null); }}
          onSaved={handleAssetSaved}
        />
      )}
      {showBulkAssetImport && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}
          onClick={() => setShowBulkAssetImport(false)}>
          <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "540px", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Import Assets from Excel</h2>
                <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>Upload an .xlsx / .xls / .csv file to register multiple assets at once.</p>
              </div>
              <button onClick={() => setShowBulkAssetImport(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>✕</button>
            </div>

            {/* Template download */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 16px", marginBottom: "18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <span style={{ fontSize: "13px", color: "#475569" }}>Download the template to see the required columns.</span>
              <a href={getCompanyPortalImportTemplateUrl()} download style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "7px", background: "#eff6ff", color: "#2563eb", fontWeight: 600, fontSize: "13px", border: "1px solid #bfdbfe", textDecoration: "none" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Template
              </a>
            </div>

            {/* File picker */}
            <div style={{ marginBottom: "18px" }}>
              <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Excel / CSV File <span style={{ color: "#ef4444" }}>*</span></label>
              <input type="file" accept=".xlsx,.xls,.csv"
                onChange={(e) => { setBulkAssetFile(e.target.files[0] || null); setBulkAssetResult(null); }}
                style={{ display: "block", width: "100%", fontSize: "13px", color: "#0f172a" }} />
              {bulkAssetFile && <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b" }}>{bulkAssetFile.name}</p>}
            </div>

            {/* Upload button */}
            <button type="button" disabled={bulkAssetImporting || !bulkAssetFile}
              onClick={async () => {
                if (!bulkAssetFile) return;
                setBulkAssetImporting(true); setBulkAssetResult(null);
                try {
                  const result = await bulkImportCompanyPortalAssets(token, bulkAssetFile);
                  setBulkAssetResult(result);
                  // Refresh assets
                  getCompanyPortalAssets(token).then((list) => list && setAssets(list)).catch(() => {});
                } catch (err) {
                  setBulkAssetResult({ error: err.message });
                } finally {
                  setBulkAssetImporting(false);
                }
              }}
              style={{ display: "block", width: "100%", padding: "10px", borderRadius: "8px", border: "none", background: bulkAssetImporting || !bulkAssetFile ? "#93c5fd" : "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: bulkAssetImporting || !bulkAssetFile ? "default" : "pointer" }}>
              {bulkAssetImporting ? "Uploading…" : "Upload & Register Assets"}
            </button>

            {/* Results */}
            {bulkAssetResult && !bulkAssetResult.error && (
              <div style={{ marginTop: "20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "14px" }}>
                  {[
                    { label: "Total Rows", value: bulkAssetResult.total, color: "#0f172a" },
                    { label: "Created", value: bulkAssetResult.created, color: "#16a34a" },
                    { label: "Skipped", value: bulkAssetResult.skipped, color: "#d97706" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 14px", textAlign: "center", border: "1px solid #e2e8f0" }}>
                      <div style={{ fontSize: "22px", fontWeight: 800, color }}>{value}</div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{label}</div>
                    </div>
                  ))}
                </div>
                {bulkAssetResult.errors?.length > 0 && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px" }}>
                    <p style={{ margin: "0 0 6px", fontSize: "12.5px", fontWeight: 700, color: "#dc2626" }}>Skipped rows:</p>
                    {bulkAssetResult.errors.map((e, i) => (
                      <p key={i} style={{ margin: "2px 0", fontSize: "12px", color: "#7f1d1d" }}>Row {e.row}: {e.assetName ? `"${e.assetName}" — ` : ""}{e.reason}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {bulkAssetResult?.error && (
              <div style={{ marginTop: "14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px" }}>
                <p style={{ margin: 0, fontSize: "13px", color: "#dc2626", fontWeight: 600 }}>{bulkAssetResult.error}</p>
              </div>
            )}
          </div>
        </div>
      )}
      {showEmpModal && (
        <EmployeeModal
          key={`emp-modal-${roleRefreshKey}`}
          token={token}
          existing={editEmp}
          employees={employees}
          customRoles={customRoles}
          currentUserRole={currentUser.role}
          onClose={() => { setShowEmpModal(false); setEditEmp(null); }}
          onSaved={handleEmpSaved}
        />
      )}
      {showRolesModal && (
        <RolesModal
          token={token}
          initialRoles={customRoles}
          onClose={() => setShowRolesModal(false)}
          onSaved={(list) => {
            setCustomRoles(list);
            applyCustomRoles(list);
            setRoleRefreshKey((k) => k + 1);
          }}
        />
      )}
      {showAssignModal && assignTarget && (
        <AssignTemplateModal
          employee={assignTarget}
          token={token}
          checklists={checklists}
          logsheetTemplates={logsheetTemplatesList}
          existingAssignments={assignments.filter((a) => String(a.assignedTo) === String(assignTarget.id))}
          onClose={() => { setShowAssignModal(false); setAssignTarget(null); }}
          onAssigned={handleAssigned}
          onRemoved={handleAssignmentRemoved}
        />
      )}
      {showForwardModal && forwardTarget && (
        <ForwardTemplateModal
          assignment={forwardTarget}
          token={token}
          teamMembers={employees.filter((e) => String(e.supervisorId) === String(currentUser.id))}
          existingForwards={assignments.filter((a) =>
            String(a.assignedBy) === String(currentUser.id) &&
            a.templateType === forwardTarget.templateType &&
            String(a.templateId) === String(forwardTarget.templateId)
          )}
          onClose={() => { setShowForwardModal(false); setForwardTarget(null); }}
          onForwarded={handleAssigned}
          onRemoved={handleAssignmentRemoved}
        />
      )}
      {showImport && (
        <ImportModal
          token={token}
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            load("employees", () => getCompanyPortalEmployees(token)).then((d) => d && setEmployees(d));
          }}
        />
      )}

      {/* ── Fleet Modals ── */}
      {showFleetInspectionModal && (
        <FleetInspectionModal
          token={token}
          fleetAssets={assets.filter(a => a.assetType === "fleet")}
          editData={editFleetInspection}
          onClose={() => { setShowFleetInspectionModal(false); setEditFleetInspection(null); }}
          onSaved={(saved) => {
            setShowFleetInspectionModal(false);
            setEditFleetInspection(null);
            setFleetInspections(p => editFleetInspection ? p.map(x => x.id === saved.id ? saved : x) : [saved, ...p]);
          }}
        />
      )}
      {showFleetFuelModal && (
        <FleetFuelModal
          token={token}
          fleetAssets={assets.filter(a => a.assetType === "fleet")}
          editData={editFleetFuel}
          onClose={() => { setShowFleetFuelModal(false); setEditFleetFuel(null); }}
          onSaved={(saved) => {
            setShowFleetFuelModal(false);
            setEditFleetFuel(null);
            setFleetFuelLogs(p => editFleetFuel ? p.map(x => x.id === saved.id ? saved : x) : [saved, ...p]);
          }}
        />
      )}
      {showFleetMaintModal && (
        <FleetMaintModal
          token={token}
          fleetAssets={assets.filter(a => a.assetType === "fleet")}
          editData={editFleetMaint}
          onClose={() => { setShowFleetMaintModal(false); setEditFleetMaint(null); }}
          onSaved={(saved) => {
            setShowFleetMaintModal(false);
            setEditFleetMaint(null);
            setFleetMaintenance(p => editFleetMaint ? p.map(x => x.id === saved.id ? saved : x) : [saved, ...p]);
          }}
        />
      )}

      {/* ── Toast notifications (fixed overlay) ── */}
      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 99999, display: "flex", flexDirection: "column", gap: "10px", pointerEvents: "none" }}>
        {toasts.map((t) => {
          const bg  = { critical: "#fee2e2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4", info: "#eff6ff" }[t.severity] || "#fff";
          const col = { critical: "#991b1b", high: "#9a3412",  medium: "#854d0e", low: "#166534", info: "#1d4ed8" }[t.severity] || "#0f172a";
          const bdr = { critical: "#fca5a5", high: "#fdba74",  medium: "#fde68a", low: "#86efac", info: "#bfdbfe" }[t.severity] || "#e2e8f0";
          const icon = { critical: "🚨", high: "⚠️", medium: "⚡", low: "🔔", info: "ℹ️" }[t.severity] || "⚠️";
          const label = { critical: "Critical Alert", high: "New Warning", medium: "New Alert", low: "Notification", info: "Info" }[t.severity] || "New Alert";
          return (
            <div key={t.id} className="fm-toast-enter" style={{ background: bg, border: `1px solid ${bdr}`, color: col, borderRadius: "10px", padding: "12px 16px", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: "13px", fontWeight: 600, maxWidth: "340px", pointerEvents: "auto", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <span style={{ fontSize: "18px", flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 800, marginBottom: "2px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                <div>{t.text}</div>
                <button onClick={() => { setNav("warnings"); setToasts((ts) => ts.filter((x) => x.id !== t.id)); }}
                  style={{ marginTop: "6px", background: "none", border: "none", color: col, fontWeight: 700, fontSize: "11px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>View warnings →</button>
              </div>
              <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
                style={{ marginLeft: "auto", background: "none", border: "none", color: col, cursor: "pointer", fontSize: "16px", lineHeight: 1, padding: 0, opacity: 0.6 }}>✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
