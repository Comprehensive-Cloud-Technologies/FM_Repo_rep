import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import {





  login,





  getCompanies,





  createCompany,





  updateCompany,





  deleteCompany,





  getAssets,





  createAsset,





  updateAsset,





  deleteAsset,
  bulkDeleteAssets,
  bulkVerifyAssets,
  verifyAsset,





  getDepartments,





  createDepartment,





  deleteDepartment,





  getLogs,





  createLog,





  deleteLog,





  getChecklistAssignees,





  assignChecklistToUsers,





  getAssetTypes,





  createAssetType,





  updateAssetType,





  deleteAssetType,



  getUsers,



  getChecklistTemplates,



  createChecklistTemplate,



  getChecklistTemplate,





  updateChecklistTemplate,





  deleteChecklistTemplate,





  getLogsheetTemplate,





  updateLogsheetTemplate,





  deleteLogsheetTemplate,





  getLogsheetTemplates,





  createLogsheetTemplate,





  assignLogsheetTemplate,





  getLogsheetEntriesByTemplate,





  submitLogsheetEntry,





  getRecentLogsheetEntries,





  getRecentChecklistSubmissions,





  getLogsheetEntryDetail,





  getChecklistSubmissionDetail,





  getCompanyOverview,





  getRolePermissions,





  saveRolePermissions,





  getLogsheetIssuesReport,





  getAdminOjtTrainings,





  getAdminOjtProgress,





  getAdminWorkOrders,





  createAdminWorkOrder,





  updateAdminWOStatus,
  deleteAdminWorkOrder,





  assignAdminWO,
  getAdminQrCodes,
  generateAdminQrCodes,
  deleteAdminQrCode,
  bulkDeleteAdminQrCodes,





  getAdminShifts,





  createAdminShift,





  updateAdminShift,





  deleteAdminShift,





  getAdminEmployees,





  createAdminEmployee,





  updateAdminEmployee,





  deleteAdminEmployee,
  getClientAssets,
  createCompanyUser,
  getCompanyUsers,





  bulkImportAssets,





  getAssetImportTemplateUrl,





  deleteAllAssets,





} from "../api";





import ChecklistBuilder from "../components/ChecklistBuilder";





import LogsheetModule from "../components/LogsheetModule.jsx";





import ChecklistTemplateModule from "../components/ChecklistTemplateModule.jsx";





import SubmissionsPanel from "../components/SubmissionsPanel.jsx";





import WarningsPanel from "../components/WarningsPanel.jsx";





import { useAlertSound } from "../hooks/useAlertSound";





import QRCode from "qrcode";





import { buildApiUrl, getPublicAppUrl } from "../utils/runtimeConfig";





import catalystLogo from "../images/image.png";











const TOKEN_KEY = "company_portal_token";











/* ××××××××× Photo thumbnail + full-screen lightbox ××××××××××××××××××××××××××××××××××××××××××××××××××××××××× */





function PhotoAnswer({ src, alt = "Photo" }) {





  const [open, setOpen] = useState(false);





  return (





    <>





      <div>





        <img





          src={src} alt={alt}





          onClick={() => setOpen(true)}





          style={{ maxWidth: "160px", maxHeight: "120px", borderRadius: "6px", objectFit: "cover",





            display: "block", border: "1px solid #e2e8f0", cursor: "pointer", marginTop: "4px" }}





        />





        <button





          onClick={() => setOpen(true)}





          style={{ marginTop: "5px", padding: "3px 12px", background: "#eff6ff", color: "#2563eb",





            border: "1px solid #bfdbfe", borderRadius: "6px", fontSize: "12px",





            fontWeight: 600, cursor: "pointer" }}





        >





          View





        </button>





      </div>





      {open && (





        <div





          onClick={() => setOpen(false)}





          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 9999,





            display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}





        >





          <div onClick={(e) => e.stopPropagation()} style={{ position: "relative" }}>





            <img





              src={src} alt={alt}





              style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: "12px",





                objectFit: "contain", boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}





            />





            <button





              onClick={() => setOpen(false)}





              style={{ position: "absolute", top: "-16px", right: "-16px", background: "#fff",





                border: "none", borderRadius: "50%", width: "34px", height: "34px",





                cursor: "pointer", fontSize: "20px", fontWeight: 700, lineHeight: 1,





                display: "flex", alignItems: "center", justifyContent: "center",





                boxShadow: "0 2px 10px rgba(0,0,0,0.3)", color: "#1e293b" }}





            >





              ×





            </button>





          </div>





        </div>





      )}





    </>





  );





}











const emptyCompany = {





  companyName: "",





  companyCode: "",





  description: "",





  addressLine1: "",





  addressLine2: "",





  city: "",





  state: "",





  country: "",





  pincode: "",





  gstNumber: "",





  panNumber: "",





  cinNumber: "",





  contractStartDate: "",





  contractEndDate: "",





  billingCycle: "Monthly",





  paymentTermsDays: "30",





  maxEmployees: "",





  qsrModule: true,





  premealModule: true,





  deliveryModule: true,





  allowGuestBooking: false,





  status: "Active",





  sectors: [],





};











const SECTORS = [





  { value: "healthcare", label: "Healthcare / Medical", icon: "HC", description: "Hospitals, clinics, medical colleges" },





  { value: "soft_services", label: "Soft Services", icon: "SS", description: "Housekeeping, catering, security" },





  { value: "technical", label: "Technical Assets", icon: "TA", description: "Engineering, maintenance, HVAC" },





  { value: "fleet", label: "Fleet Management", icon: "FM", description: "Vehicles, logistics, transport" },





  { value: "general", label: "General / Other", icon: "GO", description: "Other industries" },





];











const emptyHospital = {





  siteName: "",





  entityType: "",





  facilityType: "",





  gstNo: "",





  panNo: "",





  address: "",





  state: "",





  pinCode: "",





  contactPersonName: "",





  contactPersonPhone: "",





  contactEmail: "",





  status: "Active",





};











const emptyUser = {





  fullName: "",





  email: "",





  phone: "",





  designation: "",





  role: "employee",





  status: "Active",





  password: "",





  username: "",



  moduleAccess: [],





};











const emptyAsset = {





  id: null,





  companyId: "",





  departmentId: "",





  assetName: "",





  assetUniqueId: "",





  assetType: "",





  building: "",





  floor: "",





  room: "",

  // Structured location IDs (from Location Management)
  buildingId: "",
  floorId: "",
  locDeptId: "",
  roomId: "",
  locationId: "",

  status: "Active",





  qrCode: "",





  imageUrl: "",





  // Common attachments / description





  description: "",





  checklist: "",





  documentLinks: "",





  // Soft services





  serviceArea: "",





  frequency: "Daily",





  shift: "Morning",





  supervisor: "",





  staffRequired: "",





  specialInstructions: "",





  // Technical





  machineName: "",





  brand: "",





  modelNumber: "",





  serialNumber: "",





  installationDate: "",





  warrantyExpiry: "",





  maintenanceFrequency: "",





  lastServiceDate: "",





  nextServiceDate: "",





  technician: "",





  // Fleet





  vehicleNumber: "",





  vehicleType: "",





  fuelType: "",





  driver: "",





  rcNumber: "",





  insuranceExpiry: "",





  pucExpiry: "",





  serviceDueDate: "",





  purchaseDate: "",





  vendor: "",





  dailyKmTracking: false,





  // ×××××× Healthcare-specific fields (stored in metadata) ××××××





  make: "",





  manufacturer: "",





  model: "",





  serialNo: "",





  accessories: "",





  dealer: "",





  manufacturingYear: "",





  hcInstallationDate: "",





  invoiceNo: "",





  invoiceDate: "",





  purchaseCost: "",





  maintenanceType: "",  // "warranty" | "amc" | "cmc" | "inhouse" | "catalyst"





  warrantyStart: "",





  warrantyEnd: "",





  amcStart: "",





  amcEnd: "",





  cmcStart: "",





  cmcEnd: "",





  rber: false,           // Recommended Beyond Economic Repair





  remarks: "",





  // Healthcare image & document uploads





  hcImages: [],          // Array of { url, name } - up to 5 equipment photos





  hcInvoiceUrl: "",      // URL of uploaded invoice document





};











const emptyDepartment = {





  name: "",





  description: "",





  buildingId: "",





  floorId: "",





  roomId: "",





};











const assetTypeLabels = {





  soft: "Soft Services",





  technical: "Technical",





  fleet: "Fleet",





};











/* ××××××××× Admin OJT Section ×××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××× */





function AdminOjtSection({ token, companies = [] }) {





  const [selectedCo, setSelectedCo] = useState(companies[0]?.id || null);





  const [trainings, setTrainings] = useState([]);





  const [progress, setProgress] = useState([]);





  const [loading, setLoading] = useState(false);





  const [subTab, setSubTab] = useState("trainings"); // trainings | progress











  useEffect(() => {





    if (!selectedCo) return;





    setLoading(true);





    Promise.all([





      getAdminOjtTrainings(token, selectedCo),





      getAdminOjtProgress(token, selectedCo),





    ])





      .then(([t, p]) => { setTrainings(Array.isArray(t) ? t : []); setProgress(Array.isArray(p) ? p : []); })





      .catch(() => {})





      .finally(() => setLoading(false));





  }, [selectedCo, token]);











  return (





    <div>





      <div style={{ marginBottom: "20px" }}>





        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "4px" }}>OJT Training</h1>





        <p style={{ color: "#64748b", fontSize: "13.5px" }}>View On-the-Job Training programs and employee progress across companies.</p>





      </div>











      {/* Company selector */}





      <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px 20px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>





        <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#374151" }}>Company:</span>





        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>





          {companies.map((c) => (





            <button key={c.id} type="button" onClick={() => setSelectedCo(c.id)}





              style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: selectedCo === c.id ? "none" : "1px solid #e2e8f0", background: selectedCo === c.id ? "#2563eb" : "#f8fafc", color: selectedCo === c.id ? "#fff" : "#475569" }}>





              {c.companyName || c.name}





            </button>





          ))}





        </div>





      </div>











      {/* Sub tabs */}





      <div style={{ display: "flex", gap: "4px", marginBottom: "20px", borderBottom: "2px solid #e2e8f0" }}>





        {[{ k: "trainings", label: `Trainings (${trainings.length})` }, { k: "progress", label: `Employee Progress (${progress.length})` }].map(({ k, label }) => (





          <button key={k} type="button" onClick={() => setSubTab(k)}





            style={{ padding: "10px 20px", background: "none", border: "none", borderBottom: subTab === k ? "3px solid #2563eb" : "3px solid transparent", marginBottom: "-2px", fontSize: "14px", fontWeight: 700, color: subTab === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>





            {label}





          </button>





        ))}





      </div>











      {loading ? (





        <div style={{ padding: "40px", textAlign: "center", color: "#64748b", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>Loading OJT data...</div>





      ) : !selectedCo ? (





        <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>Select a company to view OJT trainings.</div>





      ) : subTab === "trainings" ? (





        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>





          {trainings.length === 0 ? (





            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>No OJT trainings found for this company.</div>





          ) : (





            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>





              <thead>





                <tr style={{ background: "#f8fafc" }}>





                  {["Training Title", "Status", "Enrolled", "Completed", "Passing %", "Created"].map((h) => (





                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>





                  ))}





                </tr>





              </thead>





              <tbody>





                {trainings.map((t) => (





                  <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>





                    <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{t.title}</td>





                    <td style={{ padding: "12px 16px" }}>





                      <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: t.status === "published" ? "#dcfce7" : "#f1f5f9", color: t.status === "published" ? "#166534" : "#475569" }}>





                        {t.status === "published" ? "Published" : "Draft"}





                      </span>





                    </td>





                    <td style={{ padding: "12px 16px", color: "#2563eb", fontWeight: 600 }}>{t.enrolledCount}</td>





                    <td style={{ padding: "12px 16px", color: "#16a34a", fontWeight: 600 }}>{t.completedCount}</td>





                    <td style={{ padding: "12px 16px", color: "#64748b" }}>{t.passingPercentage}%</td>





                    <td style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "12px" }}>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "-"}</td>





                  </tr>





                ))}





              </tbody>





            </table>





          )}





        </div>





      ) : (





        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>





          {progress.length === 0 ? (





            <div style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>No employee progress data found.</div>





          ) : (





            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>





              <thead>





                <tr style={{ background: "#f8fafc" }}>





                  {["Employee", "Training", "Status", "Score", "Certificate"].map((h) => (





                    <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>





                  ))}





                </tr>





              </thead>





              <tbody>





                {progress.map((p) => (





                  <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>





                    <td style={{ padding: "12px 16px" }}>





                      <div style={{ fontWeight: 600, color: "#0f172a" }}>{p.userName}</div>





                      <div style={{ fontSize: "11px", color: "#94a3b8" }}>{p.email}</div>





                    </td>





                    <td style={{ padding: "12px 16px", color: "#64748b" }}>{p.trainingTitle}</td>





                    <td style={{ padding: "12px 16px" }}>





                      <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600,





                        background: p.status === "completed" ? "#dcfce7" : p.status === "in_progress" ? "#fef9c3" : p.status === "failed" ? "#fee2e2" : "#f1f5f9",





                        color: p.status === "completed" ? "#166534" : p.status === "in_progress" ? "#854d0e" : p.status === "failed" ? "#991b1b" : "#475569" }}>





                        {(p.status || "not_started").replace("_", " ").toUpperCase()}





                      </span>





                    </td>





                    <td style={{ padding: "12px 16px", fontWeight: 600, color: p.score != null ? "#0f172a" : "#94a3b8" }}>





                      {p.score != null ? `${p.score}%` : "-"}





                    </td>





                    <td style={{ padding: "12px 16px" }}>





                      {p.certificateUrl ? (





                        <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: 600, background: "#dcfce7", color: "#166534" }}>✓ Issued</span>





                      ) : <span style={{ fontSize: "12px", color: "#94a3b8" }}>-</span>}





                    </td>





                  </tr>





                ))}





              </tbody>





            </table>





          )}





        </div>





      )}





    </div>





  );





}











/* ××××××××× Admin Work Orders Section ×××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××× */





const WO_STATUS_COLORS = {
  open:        { bg:"#fef2f2", color:"#dc2626" },
  assigned:    { bg:"#f5f3ff", color:"#7c3aed" },
  in_progress: { bg:"#dbeafe", color:"#1d4ed8" },
  on_hold:     { bg:"#fff7ed", color:"#c2410c" },
  completed:   { bg:"#dcfce7", color:"#166534" },
  closed:      { bg:"#f1f5f9", color:"#475569" },
  escalated:   { bg:"#faf5ff", color:"#7c3aed" },
  overdue:     { bg:"#fef2f2", color:"#991b1b" },
};





const WO_PRI_COLORS    = { critical: { bg:"#fee2e2",color:"#991b1b" }, high: { bg:"#ffedd5",color:"#9a3412" }, medium: { bg:"#fef9c3",color:"#854d0e" }, low: { bg:"#dcfce7",color:"#166534" } };













// →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
// AdminStatesSection  →  State Management
// →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
function AdminStatesSection({ token }) {
  const [states, setStates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(null); // null | { mode: "add"|"edit", data }
  const [form, setForm] = useState({ stateName: "", stateCode: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });

  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const flash = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "" }), 3500);
  };

  const loadStates = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/states", { headers: H });
      const d = await r.json();
      setStates(Array.isArray(d) ? d : []);
    } catch { setStates([]); } finally { setLoading(false); }
  };

  useEffect(() => { loadStates(); }, []);

  const openAdd = () => { setForm({ stateName: "", stateCode: "" }); setModal({ mode: "add" }); };
  const openEdit = (row) => { setForm({ stateName: row.state_name, stateCode: row.state_code, id: row.id }); setModal({ mode: "edit", data: row }); };
  const closeModal = () => { setModal(null); setForm({ stateName: "", stateCode: "" }); };

  const handleSave = async () => {
    if (!form.stateName.trim()) return flash("State name is required", "error");
    if (!form.stateCode.trim()) return flash("State code is required", "error");
    setSaving(true);
    try {
      const url = modal.mode === "edit" ? `/api/states/${form.id}` : "/api/states";
      const method = modal.mode === "edit" ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: H, body: JSON.stringify({ stateName: form.stateName, stateCode: form.stateCode }) });
      const d = await r.json();
      if (!r.ok) return flash(d.message || "Error saving", "error");
      flash(`State ${modal.mode === "edit" ? "updated" : "created"} successfully!`);
      closeModal();
      loadStates();
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this state? This cannot be undone.")) return;
    const r = await fetch(`/api/states/${id}`, { method: "DELETE", headers: H });
    const d = await r.json();
    if (r.ok) { flash("State deleted"); loadStates(); }
    else flash(d.message || "Delete failed", "error");
  };

  return (
    <div style={{ padding: "0" }}>
      {msg.text && (
        <div style={{ marginBottom: "12px", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: msg.type === "error" ? "#fef2f2" : "#f0fdf4", color: msg.type === "error" ? "#dc2626" : "#16a34a", border: `1px solid ${msg.type === "error" ? "#fecaca" : "#bbf7d0"}` }}>
          {msg.text}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "2px" }}>States / Regions</h1>
          <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Manage state codes used in generating Asset IDs (Company Code - State Code - 000001).</p>
        </div>
        <button onClick={openAdd} style={{ padding: "9px 18px", borderRadius: "8px", border: "none", cursor: "pointer", background: "#2563eb", color: "#fff", fontWeight: 700, fontSize: "13px", display: "inline-flex", alignItems: "center", gap: "6px" }}>+ Add State</button>
      </div>

      {loading ? (
        <p style={{ color: "#94a3b8", textAlign: "center", padding: "40px" }}>LoadingGǪ</p>
      ) : (
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          {states.length === 0 ? (
            <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8" }}>
              <div style={{ fontSize: "28px", marginBottom: "8px" }}>🏢n×</div>
              <div style={{ fontWeight: 600 }}>No states yet</div>
              <div style={{ fontSize: "13px" }}>Add states so companies can be linked to a state for asset ID generation.</div>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["#", "State Name", "State Code", "Status", "Actions"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {states.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 16px", color: "#94a3b8", fontSize: "12px" }}>{i + 1}</td>
                      <td style={{ padding: "10px 16px", fontWeight: 600, color: "#0f172a" }}>{s.state_name}</td>
                      <td style={{ padding: "10px 16px", fontFamily: "monospace", fontWeight: 700, color: "#2563eb", fontSize: "13px" }}>{s.state_code}</td>
                      <td style={{ padding: "10px 16px" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "8px", background: s.status === "Active" ? "#f0fdf4" : "#fef2f2", color: s.status === "Active" ? "#16a34a" : "#dc2626", fontSize: "11px", fontWeight: 700 }}>{s.status}</span>
                      </td>
                      <td style={{ padding: "10px 16px", display: "flex", gap: "6px" }}>
                        <button onClick={() => openEdit(s)} style={{ padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer", background: "#eff6ff", color: "#2563eb", fontSize: "11px", fontWeight: 600 }}>Edit</button>
                        <button onClick={() => handleDelete(s.id)} style={{ padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer", background: "#fef2f2", color: "#dc2626", fontSize: "11px", fontWeight: 600 }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={closeModal}>
          <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "100%", maxWidth: "420px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: 0 }}>{modal.mode === "edit" ? "Edit" : "Add"} State</h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px" }}>×</button>
            </div>
            <div style={{ marginBottom: "14px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>State Name <span style={{ color: "#ef4444" }}>*</span></label>
              <input value={form.stateName} onChange={e => setForm(p => ({ ...p, stateName: e.target.value }))} placeholder="e.g. Maharashtra"
                style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>State Code <span style={{ color: "#ef4444" }}>*</span></label>
              <input value={form.stateCode} onChange={e => setForm(p => ({ ...p, stateCode: e.target.value.toUpperCase() }))} placeholder="e.g. MH" maxLength={10}
                style={{ width: "100%", padding: "9px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "monospace", letterSpacing: "1px" }} />
              <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", margin: "4px 0 0" }}>Short code used in Asset ID (2-10 chars, e.g. MH, KA, DL)</p>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={closeModal} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "14px" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "14px", opacity: saving ? 0.7 : 1 }}>
                {saving ? "SavingGǪ" : (modal.mode === "edit" ? "Update" : "Create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
// Shared UI primitives for Location sections (defined at module scope so React
// doesn't unmount/remount inputs on every re-render → typing works correctly)
// →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
function LocBtn({ onClick, children, color = "#2563eb", small }) {
  return <button onClick={onClick} style={{ padding: small ? "5px 10px" : "7px 14px", borderRadius: "7px", border: "none", cursor: "pointer", background: color, color: "#fff", fontSize: small ? "11px" : "12px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}>{children}</button>;
}
function LocDelBtn({ onClick }) {
  return <button onClick={onClick} style={{ padding: "4px 8px", borderRadius: "6px", border: "none", cursor: "pointer", background: "#fef2f2", color: "#dc2626", fontSize: "11px", fontWeight: 600 }}>Delete</button>;
}
function LocEditBtn({ onClick }) {
  return <button onClick={onClick} style={{ padding: "4px 8px", borderRadius: "6px", border: "none", cursor: "pointer", background: "#eff6ff", color: "#2563eb", fontSize: "11px", fontWeight: 600 }}>Edit</button>;
}
function LocInp({ label, name, value, onChange, placeholder, required, type = "text" }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>
      <input type={type} name={name} value={value ?? ""} onChange={onChange} required={required} placeholder={placeholder || ""}
        style={{ width: "100%", padding: "8px 11px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}
function LocSel({ label, name, value, onChange, options, required, placeholder }) {
  const listId = `loc-sel-${name}`;
  const selected = (options || []).find((o) => String(o.value) === String(value ?? ""));
  const [search, setSearch] = useState(selected?.label || "");

  useEffect(() => {
    const next = (options || []).find((o) => String(o.value) === String(value ?? ""));
    setSearch(next?.label || "");
  }, [value, options]);

  const handleSearch = (e) => {
    const typed = e.target.value;
    setSearch(typed);
    const match = (options || []).find((o) => o.label === typed);
    const nextValue = match ? String(match.value) : "";
    onChange?.({ target: { name, value: nextValue } });
  };

  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "5px" }}>{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>
      <input
        list={listId}
        name={`${name}Label`}
        value={search}
        onChange={handleSearch}
        required={required}
        placeholder={placeholder || `Search ${label}`}
        style={{ width: "100%", padding: "8px 11px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff", color: "#374151", outline: "none", boxSizing: "border-box" }}
      />
      <datalist id={listId}>
        {(options || []).map((o) => <option key={o.value} value={o.label} />)}
      </datalist>
    </div>
  );
}
function LocTreeNode({ node, depth = 0 }) {
  const [open, setOpen] = useState(true);
  const icons = { Building: "🏢", Floor: "🏢", Room: "🚪" };
  const colors = { Building: "#2563eb", Floor: "#7c3aed", Room: "#16a34a" };
  const children = node.floors || node.rooms || [];
  return (
    <div style={{ marginLeft: depth * 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "6px", cursor: children.length ? "pointer" : "default" }}
        onClick={() => children.length && setOpen(!open)}>
        {children.length > 0 && <span style={{ color: "#94a3b8", fontSize: "10px", width: "10px" }}>{open ? "▸" : "▾"}</span>}
        {!children.length && <span style={{ width: "10px" }} />}
        <span style={{ fontSize: "14px" }}>{icons[node.type] || "🏢"}</span>
        <span style={{ fontSize: "13px", fontWeight: 600, color: colors[node.type] || "#374151" }}>{node.name}</span>
        {node.code && <span style={{ fontSize: "11px", color: "#94a3b8", fontFamily: "monospace" }}>({node.code})</span>}
        <span style={{ fontSize: "11px", padding: "1px 6px", borderRadius: "9px", background: node.status === "Active" ? "#f0fdf4" : "#fef2f2", color: node.status === "Active" ? "#16a34a" : "#dc2626" }}>{node.type}</span>
        {node.roomType && <span style={{ fontSize: "11px", color: "#64748b" }}>-+ {node.roomType}</span>}
        {node.capacity && <span style={{ fontSize: "11px", color: "#64748b" }}>-+ cap: {node.capacity}</span>}
      </div>
      {open && children.map((c, i) => <LocTreeNode key={i} node={c} depth={depth + 1} />)}
    </div>
  );
}

// →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
// AdminLocationsSection  →  Location Management (Building → Floor → Room)
// Departments are managed separately via AdminDepartmentsSection
// →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
function AdminLocationsSection({ token, companies = [] }) {
  const [companyId, setCompanyId] = useState(() => companies[0]?.id ? String(companies[0].id) : "");
  const [tab, setTab] = useState("buildings"); // buildings | floors | rooms
  const [msg, setMsg] = useState({ text: "", type: "" });

  // master data
  const [buildings, setBuildings] = useState([]);
  const [floors,    setFloors]    = useState([]);
  const [rooms,     setRooms]     = useState([]);
  const [tree,      setTree]      = useState([]);
  const [loading,   setLoading]   = useState(false);

  // filter cascades for list views
  const [filterBld, setFilterBld] = useState("");
  const [filterFlr, setFilterFlr] = useState("");

  // dropdowns for modal cascades
  const [bldFloors, setBldFloors] = useState([]);
  // (flrDepts no longer needed here; rooms are under floors directly)
  const [flrDepts,  setFlrDepts]  = useState([]); // kept for room modal dept info only
  const [deptRooms, setDeptRooms] = useState([]);

  // modal state
  const [modal, setModal] = useState(null); // null | { type, mode, data }
  const [form,  setForm]  = useState({});
  const [saving, setSaving] = useState(false);
  const [importingLocations, setImportingLocations] = useState(false);
  const locationImportInputRef = useRef(null);

  const API = "/api/locations";
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const flash = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "" }), 3500);
  };

  const loadTree = async (cId) => {
    if (!cId) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/hierarchy?companyId=${cId}`, { headers: H });
      const d = await r.json();
      setTree(Array.isArray(d) ? d : []);
    } catch { setTree([]); } finally { setLoading(false); }
  };

  const loadBuildings = async (cId) => {
    if (!cId) return;
    try { const r = await fetch(`${API}/buildings?companyId=${cId}`, { headers: H }); const d = await r.json(); setBuildings(Array.isArray(d) ? d : []); } catch { setBuildings([]); }
  };

  const loadFloors = async (bId) => {
    if (!bId && !companyId) { setFloors([]); return; }
    const q = bId ? `buildingId=${bId}` : `companyId=${companyId}`;
    try { const r = await fetch(`${API}/floors?${q}`, { headers: H }); const d = await r.json(); setFloors(Array.isArray(d) ? d : []); } catch { setFloors([]); }
  };

  const loadRooms = async ({ floorId, buildingId } = {}) => {
    if (!floorId && !buildingId && !companyId) { setRooms([]); return; }
    const q = floorId ? `floorId=${floorId}` : (buildingId ? `buildingId=${buildingId}` : `companyId=${companyId}`);
    try { const r = await fetch(`${API}/rooms?${q}`, { headers: H }); const d = await r.json(); setRooms(Array.isArray(d) ? d : []); } catch { setRooms([]); }
  };

  // Pre-select first company when companies prop arrives (async load)
  useEffect(() => {
    if (!companyId && companies.length > 0) {
      setCompanyId(String(companies[0].id));
    }
  }, [companies]);

  // When company changes
  useEffect(() => {
    if (!companyId) { setBuildings([]); setFloors([]); setRooms([]); setTree([]); return; }
    loadBuildings(companyId);
    setFilterBld(""); setFilterFlr("");
    setFloors([]); setRooms([]);
  }, [companyId]);

  // Cascade loads for filter dropdowns
  useEffect(() => { loadFloors(filterBld); setFilterFlr(""); setRooms([]); }, [filterBld]);
  useEffect(() => {
    if (tab === "rooms") {
      loadRooms({ buildingId: filterBld });
      return;
    }
    loadRooms({ floorId: filterFlr });
  }, [tab, filterBld, filterFlr]);

  // Load dropdowns for modal
  useEffect(() => {
    if (!modal) return;
    if (modal.type === "floor" || modal.type === "room") {
      if (form.buildingId) fetch(`${API}/floors?buildingId=${form.buildingId}`, { headers: H }).then(r => r.json()).then(d => setBldFloors(Array.isArray(d) ? d : []));
    }
  }, [modal?.type, form.buildingId]);

  const openModal = (type, mode = "add", data = {}) => {
    const defaults = {
      building:   { buildingCode: "", buildingName: "", description: "" },
      floor:      { buildingId: filterBld || "", floorCode: "", floorName: "", floorNumber: "" },
      room:       { buildingId: filterBld || "", floorId: filterFlr || "", roomCode: "", roomName: "", roomType: "", capacity: "" },
    };
    setForm(mode === "edit" ? { ...data } : { ...defaults[type] });
    setModal({ type, mode, data });
    setBldFloors([]); setFlrDepts([]); setDeptRooms([]);
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

      flash(`${type.charAt(0).toUpperCase() + type.slice(1)} ${mode === "edit" ? "updated" : "created"} successfully!`);
      closeModal();
      if (type === "building") { loadBuildings(companyId); }
      if (type === "floor")    { loadFloors(form.buildingId || filterBld); }
      if (type === "room")     { loadRooms({ floorId: form.floorId || filterFlr, buildingId: form.buildingId || filterBld }); }
    } finally { setSaving(false); }
  };

  const handleDelete = async (type, id) => {
    if (!window.confirm(`Delete this ${type}? All child records will also be deactivated.`)) return;
    const r = await fetch(`${API}/${type}s/${id}`, { method: "DELETE", headers: H });
    if (r.ok) {
      flash(`${type} deleted`);
      if (type === "building") loadBuildings(companyId);
      if (type === "floor")    loadFloors(filterBld);
      if (type === "room")     loadRooms({ floorId: filterFlr, buildingId: filterBld });
    } else {
      const d = await r.json();
      flash(d.message || "Delete failed", "error");
    }
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

  // →→ Styles →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→
  const tabBtn = (key) => ({
    padding: "7px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600,
    background: tab === key ? "#2563eb" : "#f1f5f9", color: tab === key ? "#fff" : "#475569",
  });

  // →→ Table for a specific level →→→→→→→→→→→→→→→→→→→→→→→→→→→→
  const renderTable = (rows, type, cols) => {
    const safeRows = Array.isArray(rows) ? rows : [];
    return (
    <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
      {safeRows.length === 0
        ? <p style={{ padding: "32px", textAlign: "center", color: "#94a3b8" }}>No {type}s found. Create one to get started.</p>
        : <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {cols.map(c => <th key={c.key} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{c.label}</th>)}
                <th style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {safeRows.map((row, i) => (
                <tr key={row.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                  {cols.map(c => <td key={c.key} style={{ padding: "10px 14px", color: "#374151" }}>{row[c.key] ?? "▾"}</td>)}
                  <td style={{ padding: "10px 14px", display: "flex", gap: "6px" }}>
                    <LocEditBtn onClick={() => openModal(type, "edit", row)} />
                    <LocDelBtn onClick={() => handleDelete(type, row.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      }
    </div>
    );
  };

  if (!companies.length) return <div style={{ padding: "40px", color: "#94a3b8", textAlign: "center" }}>No companies available.</div>;

  return (
    <div style={{ padding: "0" }}>
      {/* Flash message */}
      {msg.text && (
        <div style={{ marginBottom: "12px", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, background: msg.type === "error" ? "#fef2f2" : "#f0fdf4", color: msg.type === "error" ? "#dc2626" : "#16a34a", border: `1px solid ${msg.type === "error" ? "#fecaca" : "#bbf7d0"}` }}>
          {msg.text}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginBottom: "2px" }}>Location Management</h1>
        <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Register locations: Building → Floor → Room. Departments are managed separately.</p>
      </div>

      {/* Company picker */}
      <div style={{ marginBottom: "16px" }}>
        <select value={companyId} onChange={e => setCompanyId(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff", color: "#374151", minWidth: "260px" }}>
          <option value="">Select a Company</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.companyName || c.company_name}</option>)}
        </select>
      </div>

      {!companyId ? (
        <div style={{ padding: "60px", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>🏢</div>
          <div style={{ fontWeight: 700, marginBottom: "4px" }}>Select a Company to Manage Locations</div>
          <div style={{ fontSize: "13px" }}>Choose a company from the dropdown above to view and manage its location hierarchy.</div>
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button style={tabBtn("buildings")} onClick={() => setTab("buildings")}>🏢 Buildings</button>
              <button style={tabBtn("floors")} onClick={() => setTab("floors")}>🏢 Floors</button>
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

          {/* →→ Buildings →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→ */}
          {tab === "buildings" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>Buildings ({buildings.length})</h2>
                <LocBtn onClick={() => openModal("building")}>+ Add Building</LocBtn>
              </div>
              {renderTable(buildings, "building", [
                { key: "buildingName", label: "Building Name" },
                { key: "description", label: "Description" },
                { key: "status", label: "Status" },
              ])}
            </div>
          )}

          {/* →→ Floors →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→ */}
          {tab === "floors" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>Floors</h2>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <select value={filterBld} onChange={e => setFilterBld(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff", color: "#374151" }}>
                    <option value="">All Buildings</option>
                    {buildings.map(b => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
                  </select>
                  <LocBtn onClick={() => openModal("floor")}>+ Add Floor</LocBtn>
                </div>
              </div>
              {renderTable(floors, "floor", [
                  { key: "floorName", label: "Floor Name" },
                  { key: "floorNumber", label: "Floor No." },
                  { key: "buildingName", label: "Building" },
                  { key: "status", label: "Status" },
                ])}
            </div>
          )}

          {/* →→ Departments →→→→→→→→→→→→→→→→→→→→→→→→→→→→→ */}

          {/* →→ Rooms →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→ */}
          {tab === "rooms" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 700, margin: 0, color: "#0f172a" }}>Rooms</h2>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <select value={filterBld} onChange={e => setFilterBld(e.target.value)}
                    style={{ padding: "7px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", fontSize: "13px", background: "#fff", color: "#374151" }}>
                    <option value="">All Buildings</option>
                    {buildings.map(b => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
                  </select>
                  <LocBtn onClick={() => openModal("room")}>+ Add Room</LocBtn>
                </div>
              </div>
              {renderTable(rooms, "room", [
                  { key: "roomName", label: "Room Name" },
                  { key: "roomType", label: "Type" },
                  { key: "capacity", label: "Capacity" },
                  { key: "floorName", label: "Floor" },
                  { key: "status", label: "Status" },
                ])}
            </div>
          )}
        </>
      )}

      {/* →→ Modal →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→ */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={closeModal}>
          <div style={{ background: "#fff", borderRadius: "14px", padding: "28px", width: "100%", maxWidth: "480px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: 0 }}>
                {modal.mode === "edit" ? "Edit" : "Add"} {modal.type.charAt(0).toUpperCase() + modal.type.slice(1)}
              </h2>
              <button onClick={closeModal} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px" }}>×</button>
            </div>

            {/* Building form */}
            {modal.type === "building" && (
              <>
                <LocInp label="Building Name" name="buildingName" value={form.buildingName} onChange={e => setForm(p => ({ ...p, buildingName: e.target.value }))} required />
                <LocInp label="Description" name="description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                {modal.mode === "edit" && (
                  <LocSel label="Status" name="status" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
                )}
              </>
            )}

            {/* Floor form */}
            {modal.type === "floor" && (
              <>
                <LocSel label="Building" name="buildingId" value={form.buildingId} onChange={e => setForm(p => ({ ...p, buildingId: e.target.value }))} required
                  options={buildings.map(b => ({ value: b.id, label: b.buildingName }))} />
                <LocInp label="Floor Name" name="floorName" value={form.floorName} onChange={e => setForm(p => ({ ...p, floorName: e.target.value }))} required />
                <LocInp label="Floor Number" name="floorNumber" value={form.floorNumber} onChange={e => setForm(p => ({ ...p, floorNumber: e.target.value }))} type="number" placeholder="e.g. 1" />
                {modal.mode === "edit" && (
                  <LocSel label="Status" name="status" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
                )}
              </>
            )}

            {/* Room form */}
            {modal.type === "room" && (
              <>
                <LocSel label="Building" name="buildingId" value={form.buildingId} onChange={async e => {
                  const bid = e.target.value;
                  setForm(p => ({ ...p, buildingId: bid, floorId: "" }));
                  const r = await fetch(`${API}/floors?buildingId=${bid}`, { headers: H });
                  setBldFloors(await r.json());
                }} required options={buildings.map(b => ({ value: b.id, label: b.buildingName }))} />
                <LocSel label="Floor" name="floorId" value={form.floorId} onChange={e => setForm(p => ({ ...p, floorId: e.target.value }))} required
                  options={bldFloors.map(f => ({ value: f.id, label: f.floorName }))} placeholder="Select Floor" />
                <LocInp label="Room Name" name="roomName" value={form.roomName} onChange={e => setForm(p => ({ ...p, roomName: e.target.value }))} required />
                <LocInp label="Room Type" name="roomType" value={form.roomType} onChange={e => setForm(p => ({ ...p, roomType: e.target.value }))} placeholder="e.g. Ward, OT, ICU" />
                <LocInp label="Capacity" name="capacity" value={form.capacity} onChange={e => setForm(p => ({ ...p, capacity: e.target.value }))} type="number" />
                {modal.mode === "edit" && (
                  <LocSel label="Status" name="status" value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} />
                )}
              </>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button onClick={closeModal} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "14px" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "14px", opacity: saving ? 0.7 : 1 }}>
                {saving ? "SavingGǪ" : (modal.mode === "edit" ? "Update" : "Create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminQrCodesSection({ token, companies = [] }) {
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCompanyName, setSelectedCompanyName] = useState(""); // for client label on QR cards
  const [qrCodes, setQrCodes] = useState([]);
  const [companyLogoUrl, setCompanyLogoUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [qrFilter, setQrFilter] = useState("all");
  const [qrSearch, setQrSearch] = useState("");
  const [generateCount, setGenerateCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [msg, setMsg] = useState("");

  const loadQrCodes = async (companyId) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await getAdminQrCodes(token, companyId);
      setQrCodes(Array.isArray(data) ? data : []);
    } catch(e) {
      setMsg("Failed to load QR codes");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (selectedCompanyId) {
      loadQrCodes(selectedCompanyId);
      (async () => {
        try {
          const r = await fetch(`/api/company-users/companies/${selectedCompanyId}/logo`, { headers: { Authorization: `Bearer ${token}` } });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(data.message || "Failed to load logo");
          setCompanyLogoUrl(data.logoUrl || "");
        } catch {
          setCompanyLogoUrl("");
        }
      })();
    } else {
      setQrCodes([]);
      setCompanyLogoUrl("");
    }
    setSelectedIds([]);
    setQrFilter("all");
    setQrSearch("");
  }, [selectedCompanyId]);

  const filtered = qrCodes.filter(q => {
    if (qrFilter === "linked" && !q.assetId) return false;
    if (qrFilter === "unlinked" && q.assetId) return false;
    if (qrSearch) {
      const s = qrSearch.toLowerCase();
      if (!(q.qrUniqueId?.toLowerCase().includes(s) || (q.assetName || "").toLowerCase().includes(s) || (q.assetUniqueId || "").toLowerCase().includes(s) || (q.generatedAssetId || "").toLowerCase().includes(s))) return false;
    }
    return true;
  });

  const handleGenerate = async () => {
    if (!selectedCompanyId) return setMsg("Select a company first");
    if (!generateCount || generateCount < 1) return setMsg("Enter a QR count greater than 0");
    setGenerating(true);
    try {
      const newCodes = await generateAdminQrCodes(token, selectedCompanyId, generateCount);
      setQrCodes(prev => [...(Array.isArray(newCodes) ? newCodes : []), ...prev]);
      setMsg("Generated " + (Array.isArray(newCodes) ? newCodes.length : 0) + " QR codes");
    } catch(e) { setMsg("Failed to generate"); }
    finally { setGenerating(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this QR code?")) return;
    try {
      await deleteAdminQrCode(token, id);
      setQrCodes(prev => prev.filter(q => q.id !== id));
    } catch(e) { setMsg("Failed to delete"); }
  };

  const handleBulkDelete = async () => {
    const toDelete = selectedIds.length > 0 ? selectedIds : filtered.map(q => q.id);
    if (!toDelete.length) return;
    if (!window.confirm("Delete " + toDelete.length + " QR code(s)?")) return;
    try {
      await bulkDeleteAdminQrCodes(token, toDelete);
      setQrCodes(prev => prev.filter(q => !toDelete.includes(q.id)));
      setSelectedIds([]);
    } catch(e) { setMsg("Failed to delete"); }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAll = () => {
    if (selectedIds.length === filtered.length) setSelectedIds([]);
    else setSelectedIds(filtered.map(q => q.id));
  };

  const total = qrCodes.length;
  const linked = qrCodes.filter(q => !!q.assetId).length;
  const unlinked = qrCodes.filter(q => !q.assetId).length;

  return (
    <div style={{ padding: "24px" }}>
      <h2 style={{ marginBottom: 16, fontSize: 20, fontWeight: 700 }}>QR Codes</h2>
      {msg && <div style={{ padding: "8px 12px", background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{msg}<button onClick={() => setMsg("")} style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>x</button></div>}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <select value={selectedCompanyId} onChange={e => { setSelectedCompanyId(e.target.value); const co = companies.find(c => String(c.id) === e.target.value); setSelectedCompanyName(co?.companyName || co?.name || ""); }} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13, minWidth: 200, background: "#fff", color: "#374151" }}>
          <option value="">-- Select Company --</option>
          {companies.map(co => <option key={co.id} value={co.id}>{co.companyName || co.name}</option>)}
        </select>
        <label title="Upload company logo for QR cards" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 12px", borderRadius: "8px", background: companyLogoUrl ? "#f0fdf4" : "#f8fafc", color: companyLogoUrl ? "#16a34a" : "#64748b", border: `1px solid ${companyLogoUrl ? "#bbf7d0" : "#e2e8f0"}`, cursor: selectedCompanyId ? "pointer" : "not-allowed", fontSize: "12px", fontWeight: 600, opacity: selectedCompanyId ? 1 : 0.6 }}>
          {companyLogoUrl ? "Company Logo ✓" : "Upload Logo"}
          <input type="file" accept="image/*" disabled={!selectedCompanyId} style={{ display: "none" }} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !selectedCompanyId) return;
            const fd = new FormData();
            fd.append("logo", file);
            try {
              const r = await fetch(`/api/company-users/companies/${selectedCompanyId}/logo`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
              const data = await r.json().catch(() => ({}));
              if (!r.ok) throw new Error(data.message || "Upload failed");
              setCompanyLogoUrl(data.url || "");
              setMsg("Company logo updated");
            } catch (err) {
              setMsg(err.message || "Failed to upload logo");
            }
            e.target.value = "";
          }} />
        </label>
        {selectedCompanyId && companyLogoUrl && (
          <button onClick={async () => {
            try {
              const r = await fetch(`/api/company-users/companies/${selectedCompanyId}/logo`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
              const data = await r.json().catch(() => ({}));
              if (!r.ok) throw new Error(data.message || "Remove failed");
              setCompanyLogoUrl("");
              setMsg("Company logo removed");
            } catch (err) {
              setMsg(err.message || "Failed to remove logo");
            }
          }} style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", cursor: "pointer", fontWeight: 700, lineHeight: 1 }}>×</button>
        )}
        <input type="number" min={0} value={generateCount} onChange={e => {
          const raw = Number(e.target.value);
          setGenerateCount(Number.isFinite(raw) && raw >= 0 ? raw : 0);
        }} placeholder="QR count" style={{ width: "90px", padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13 }} />
        <input type="text" value={selectedCompanyName} onChange={e => setSelectedCompanyName(e.target.value)} placeholder="Client label on QR cards" title="This name appears on printed QR cards" style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13, minWidth: 180 }} />
        <button onClick={handleGenerate} disabled={generating || !selectedCompanyId} style={{ padding: "8px 16px", background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
          {generating ? "Generating..." : "Generate QR Codes"}
        </button>
      </div>

      {/* Stats tiles */}
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        <div onClick={() => setQrFilter("all")} style={{ flex: 1, padding: "16px", background: qrFilter === "all" ? "#eff6ff" : "#f8fafc", border: "2px solid " + (qrFilter === "all" ? "#3b82f6" : "#e2e8f0"), borderRadius: 10, cursor: "pointer", textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#1e40af" }}>{total}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Total Generated</div>
        </div>
        <div onClick={() => setQrFilter("linked")} style={{ flex: 1, padding: "16px", background: qrFilter === "linked" ? "#f0fdf4" : "#f8fafc", border: "2px solid " + (qrFilter === "linked" ? "#22c55e" : "#e2e8f0"), borderRadius: 10, cursor: "pointer", textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#15803d" }}>{linked}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Linked to Assets</div>
        </div>
        <div onClick={() => setQrFilter("unlinked")} style={{ flex: 1, padding: "16px", background: qrFilter === "unlinked" ? "#fff7ed" : "#f8fafc", border: "2px solid " + (qrFilter === "unlinked" ? "#f97316" : "#e2e8f0"), borderRadius: 10, cursor: "pointer", textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#c2410c" }}>{unlinked}</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Unlinked</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search by QR ID, asset name or asset IDGǪ"
          value={qrSearch}
          onChange={e => setQrSearch(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box" }}
        />
      </div>

      {/* Table actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, justifyContent: "flex-end", alignItems: "center" }}>
        {(qrFilter !== "all" || qrSearch) && <span style={{ fontSize: 12, color: "#64748b", marginRight: "auto" }}>Showing: {filtered.length} {qrFilter !== "all" ? qrFilter : ""} QR codes{qrSearch ? ` matching "${qrSearch}"` : ""}</span>}
        {(selectedIds.length > 0 || filtered.length > 0) && (
          <button onClick={handleBulkDelete} style={{ padding: "6px 14px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13 }}>
            {selectedIds.length > 0 ? "Delete Selected (" + selectedIds.length + ")" : "Delete All Filtered (" + filtered.length + ")"}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>Loading QR codes...</div>
      ) : !selectedCompanyId ? (
        <div style={{ textAlign: "center", color: "#94a3b8", padding: 40 }}>Select a company to view QR codes</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "10px 8px", textAlign: "center", width: 40 }}>
                  <input type="checkbox" checked={filtered.length > 0 && selectedIds.length === filtered.length} onChange={toggleAll} />
                </th>
                <th style={{ padding: "10px 8px", textAlign: "left" }}>Asset / QR ID</th>
                <th style={{ padding: "10px 8px", textAlign: "left" }}>Status</th>
                <th style={{ padding: "10px 8px", textAlign: "left" }}>Linked Asset</th>
                <th style={{ padding: "10px 8px", textAlign: "left" }}>Linked At</th>
                <th style={{ padding: "10px 8px", textAlign: "left" }}>Created At</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 30, color: "#94a3b8" }}>No QR codes found</td></tr>
              ) : filtered.map(q => (
                <tr key={q.id} style={{ borderBottom: "1px solid #f1f5f9", background: selectedIds.includes(q.id) ? "#eff6ff" : "transparent" }}>
                  <td style={{ textAlign: "center", padding: "8px" }}>
                    <input type="checkbox" checked={selectedIds.includes(q.id)} onChange={() => toggleSelect(q.id)} />
                  </td>
                  <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 12 }}>{q.generatedAssetId || q.assetUniqueId || q.qrUniqueId}</td>
                  <td style={{ padding: "8px" }}>
                    {q.assetId ? (
                      <span style={{ background: "#dcfce7", color: "#16a34a", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>Linked</span>
                    ) : (
                      <span style={{ background: "#fef9c3", color: "#a16207", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>Unlinked</span>
                    )}
                  </td>
                  <td style={{ padding: "8px", color: q.assetName ? "#1e293b" : "#94a3b8" }}>{q.assetName || "-"}</td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 12 }}>{q.linkedAt ? new Date(q.linkedAt).toLocaleDateString() : "-"}</td>
                  <td style={{ padding: "8px", color: "#64748b", fontSize: 12 }}>{q.createdAt ? new Date(q.createdAt).toLocaleDateString() : "-"}</td>
                  <td style={{ textAlign: "center", padding: "8px" }}>
                    <button onClick={() => handleDelete(q.id)} style={{ padding: "4px 10px", background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}


function AdminWorkOrdersSection({ token, companies = [] }) {
  const [wos, setWos]         = useState([]);
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState("all");
  const [search, setSearch]   = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const prevWoCountRef = useRef(0);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm]       = useState({ issueDescription:"", priority:"medium", assignedTo:"", assetName:"", companyId:"" });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, usrs] = await Promise.all([
        getAdminWorkOrders(token, companyFilter || null),
        ...(companies.length ? [getAdminEmployees(token, companies[0]?.id)] : [Promise.resolve([])]),
      ]);
      setWos(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
      setUsers(Array.isArray(usrs) ? usrs : []);
    } catch(e) { setError(e.message); }
    setLoading(false);
  }, [token, companies, companyFilter]);

  useEffect(() => { load(); }, [load]);

  // Poll every 30s, play beep notification when new requests arrive
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const data = await getAdminWorkOrders(token, companyFilter || null);
        const nw = Array.isArray(data && data.data) ? data.data : Array.isArray(data) ? data : [];
        if (nw.length > prevWoCountRef.current && prevWoCountRef.current > 0) {
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.connect(g); g.connect(ctx.destination);
            osc.frequency.value = 880; g.gain.value = 0.3;
            osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, 400);
          } catch(e) {}
        }
        prevWoCountRef.current = nw.length;
        setWos(nw);
      } catch(e) {}
    }, 30000);
    return () => clearInterval(iv);
  }, [token, companyFilter]);

  const handleCreate = async () => {
    if (!form.issueDescription || !form.companyId) return;
    setSaving(true);
    try {
      await createAdminWorkOrder(token, { ...form, assignedTo: form.assignedTo ? Number(form.assignedTo) : undefined });
      await load();
      setShowCreate(false);
      setForm({ issueDescription:"", priority:"medium", assignedTo:"", assetName:"", companyId:"" });
    } catch(e) { alert(e.message); }
    setSaving(false);
  };

  const updateStatus = async (wo, status) => {
    try {
      await updateAdminWOStatus(token, wo.id, status);
      setWos(prev => prev.map(w => w.id === wo.id ? { ...w, status } : w));
    } catch(e) { alert(e.message); }
  };

  const handleDelete = async (wo) => {
    if (!window.confirm(`Delete request "${wo.workOrderNumber || `WO-${wo.id}`}"? This cannot be undone.`)) return;
    try {
      await deleteAdminWorkOrder(token, wo.id);
      setWos(prev => prev.filter(w => w.id !== wo.id));
    } catch(e) { alert(e.message || "Delete failed"); }
  };

  const now = Date.now();
  const counts = { all:0, open:0, assigned:0, in_progress:0, on_hold:0, completed:0, closed:0, escalated:0, overdue:0 };
  for (const w of wos) {
    counts.all++;
    if (counts[w.status] !== undefined) counts[w.status]++;
    if (Number(w.escalationLevel) > 0 || w.flagEscalated) counts.escalated++;
    if (w.expectedCompletionAt && new Date(w.expectedCompletionAt).getTime() < now && !["completed","closed"].includes(w.status)) counts.overdue++;
  }

  const displayed = wos.filter(w => {
    if (filter === "escalated") return Number(w.escalationLevel) > 0 || w.flagEscalated;
    if (filter === "overdue") return w.expectedCompletionAt && new Date(w.expectedCompletionAt).getTime() < now && !["completed","closed"].includes(w.status);
    if (filter !== "all") return w.status === filter;
    return true;
  }).filter(w => !search || (w.workOrderNumber||"").toLowerCase().includes(search.toLowerCase()) || (w.issueDescription||"").toLowerCase().includes(search.toLowerCase()) || (w.assetName||"").toLowerCase().includes(search.toLowerCase()) || (w.companyName||"").toLowerCase().includes(search.toLowerCase()));

  const exportToExcel = () => {
    const rows = [["WO #","Company","Asset","Description","Priority","Status","Assigned To","Created At"]];
    displayed.forEach(w => rows.push([w.workOrderNumber||`WO-${w.id}`, w.companyName||"", w.assetName||"", w.issueDescription||"", w.priority||"", (w.status||"").replace(/_/g," "), w.assignedToName||"Unassigned", w.createdAt ? new Date(w.createdAt).toLocaleDateString() : ""]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" }); const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `requests-${filter}-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const TILES = [
    ["open","Open",counts.open,"#dc2626"],["assigned","Assigned",counts.assigned,"#7c3aed"],
    ["in_progress","In Progress",counts.in_progress,"#1d4ed8"],["on_hold","On Hold",counts.on_hold,"#c2410c"],
    ["completed","Completed",counts.completed,"#166534"],["closed","Closed",counts.closed,"#475569"],
    ["escalated","Escalated",counts.escalated,"#7c3aed"],["overdue","Overdue",counts.overdue,"#991b1b"],
  ];

  return (
    <div style={{ padding:"24px", maxWidth:"1400px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"20px", flexWrap:"wrap", gap:"10px" }}>
        <div>
          <h1 style={{ fontSize:"22px", fontWeight:800, color:"#0f172a", margin:0 }}>Requests</h1>
          <p style={{ color:"#64748b", fontSize:"13.5px", margin:"4px 0 0" }}>Track and manage maintenance tasks and all issue resolutions</p>
        </div>
        <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
          <button type="button" onClick={exportToExcel} style={{ padding:"9px 16px", background:"#fff", color:"#166534", border:"1.5px solid #22c55e", borderRadius:"8px", fontSize:"13px", fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:"6px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Excel
          </button>
          <button type="button" onClick={() => setShowCreate(true)} style={{ padding:"9px 18px", background:"#2563eb", color:"#fff", border:"none", borderRadius:"8px", fontSize:"13.5px", fontWeight:700, cursor:"pointer" }}>+ Create Request</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:"10px", marginBottom:"20px" }}>
        {TILES.map(([k,l,v,clr]) => (
          <div key={k} onClick={() => setFilter(filter===k?"all":k)} style={{ background:"#fff", borderRadius:"10px", border:`1.5px solid ${filter===k ? clr : "#e2e8f0"}`, padding:"14px 12px", cursor:"pointer", textAlign:"center", transition:"all 0.15s", boxShadow: filter===k ? `0 0 0 3px ${clr}22` : "none" }}>
            <p style={{ fontSize:"10px", fontWeight:700, color:"#64748b", textTransform:"uppercase", margin:"0 0 6px", letterSpacing:"0.5px" }}>{l}</p>
            <p style={{ fontSize:"24px", fontWeight:800, color:clr, margin:0 }}>{v}</p>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:"4px", borderBottom:"2px solid #e2e8f0", marginBottom:"16px", alignItems:"center", flexWrap:"wrap" }}>
        {[["all","All"],["open","Open"],["assigned","Assigned"],["in_progress","In Progress"],["on_hold","On Hold"],["completed","Completed"],["closed","Closed"],["escalated","Escalated (!)"],["overdue","Overdue"]].map(([k,l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} style={{ padding:"10px 14px", background:"none", border:"none", borderBottom: filter===k ? "2.5px solid #2563eb":"2.5px solid transparent", marginBottom:"-2px", fontSize:"13px", fontWeight: filter===k ? 700:500, color: filter===k ? "#2563eb":"#64748b", cursor:"pointer", whiteSpace:"nowrap" }}>
            {l} {(counts[k]||0) > 0 && <span style={{ background: filter===k ? "#2563eb":"#f1f5f9", color: filter===k ? "#fff":"#64748b", borderRadius:"9px", padding:"1px 6px", fontSize:"11px", marginLeft:"4px" }}>{counts[k]}</span>}
          </button>
        ))}
        <div style={{ display:"flex", gap:"8px", alignItems:"center", marginLeft:"auto" }}>
          <select value={companyFilter} onChange={e=>setCompanyFilter(e.target.value)} style={{ padding:"7px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13px", minWidth:"150px" }}>
            <option value="">All Companies</option>
            {companies.map(co => <option key={co.id} value={co.id}>{co.companyName||co.name}</option>)}
          </select>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search requests..." style={{ padding:"7px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13px", outline:"none", width:"190px" }} />
        </div>
      </div>

      {showCreate && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <div style={{ background:"#fff", borderRadius:"16px", padding:"28px", width:"480px", maxWidth:"92vw" }}>
            <h3 style={{ margin:"0 0 20px", fontSize:"17px", fontWeight:800 }}>Create Request</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>
              <select value={form.companyId} onChange={e=>setForm({...form,companyId:e.target.value})} style={{ padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px" }}>
                <option value="">Select Company *</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.companyName||c.name}</option>)}
              </select>
              <textarea value={form.issueDescription} onChange={e=>setForm({...form,issueDescription:e.target.value})} placeholder="Issue description *" rows={3} style={{ padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", resize:"vertical" }} />
              <input value={form.assetName} onChange={e=>setForm({...form,assetName:e.target.value})} placeholder="Asset name (optional)" style={{ padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px" }} />
              <select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} style={{ padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px" }}>
                {["low","medium","high","critical"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
              </select>
              <select value={form.assignedTo} onChange={e=>setForm({...form,assignedTo:e.target.value})} style={{ padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px" }}>
                <option value="">Assign to (optional)</option>
                {users.filter(u=>u.role==="admin"||u.role==="supervisor").map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
            <div style={{ display:"flex", gap:"10px", justifyContent:"flex-end", marginTop:"20px" }}>
              <button type="button" onClick={() => setShowCreate(false)} style={{ padding:"9px 18px", borderRadius:"8px", border:"1px solid #e2e8f0", background:"#f8fafc", fontWeight:600, cursor:"pointer" }}>Cancel</button>
              <button type="button" onClick={handleCreate} disabled={saving} style={{ padding:"9px 18px", borderRadius:"8px", border:"none", background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer" }}>{saving ? "Creating...":"Create Request"}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding:"40px", textAlign:"center", color:"#94a3b8" }}>Loading requests...</div>
      ) : displayed.length === 0 ? (
        <div style={{ padding:"48px", textAlign:"center", color:"#94a3b8", background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0" }}>No requests found.</div>
      ) : (
        <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0", overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"14px" }}>
            <thead>
              <tr style={{ background:"#f8fafc" }}>
                {["WO #","Company","Asset","Description","Priority","Status","Assigned To","Actions"].map(h=>(
                  <th key={h} style={{ padding:"11px 14px", textAlign:"left", color:"#475569", fontWeight:600, fontSize:"12px", textTransform:"uppercase", borderBottom:"1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map(w => {
                const sc = WO_STATUS_COLORS[w.status] || { bg:"#f1f5f9", color:"#475569" };
                const pc = WO_PRI_COLORS[w.priority] || { bg:"#f1f5f9", color:"#475569" };
                const isOverdue = w.expectedCompletionAt && new Date(w.expectedCompletionAt).getTime() < now && !["completed","closed"].includes(w.status);
                return (
                  <tr key={w.id} style={{ borderBottom:"1px solid #f1f5f9", background: isOverdue ? "#fff7f7":"#fff" }}>
                    <td style={{ padding:"11px 14px", fontWeight:700, color:"#2563eb", fontSize:"12.5px" }}>
                      {w.workOrderNumber || `WO-${w.id}`}
                      {(Number(w.escalationLevel)>0||w.flagEscalated) && <span style={{ marginLeft:"6px", fontSize:"10px", background:"#faf5ff", color:"#7c3aed", padding:"1px 5px", borderRadius:"8px" }}>Escalated</span>}
                      {isOverdue && <span style={{ marginLeft:"4px", fontSize:"10px", background:"#fee2e2", color:"#991b1b", padding:"1px 5px", borderRadius:"8px" }}>Overdue</span>}
                    </td>
                    <td style={{ padding:"11px 14px", color:"#475569", fontSize:"12.5px", fontWeight:600 }}>{w.companyName||"-"}</td>
                    <td style={{ padding:"11px 14px", color:"#475569", fontSize:"13px" }}>{w.assetName||"-"}</td>
                    <td style={{ padding:"11px 14px", color:"#0f172a", maxWidth:"180px" }}><div style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{w.issueDescription||"-"}</div></td>
                    <td style={{ padding:"11px 14px" }}><span style={{ padding:"3px 9px", borderRadius:"20px", fontSize:"11.5px", fontWeight:700, background:pc.bg, color:pc.color, textTransform:"capitalize" }}>{w.priority}</span></td>
                    <td style={{ padding:"11px 14px" }}><span style={{ padding:"3px 9px", borderRadius:"20px", fontSize:"11.5px", fontWeight:700, background:sc.bg, color:sc.color, textTransform:"capitalize" }}>{(w.status||"").replace(/_/g," ")}</span></td>
                    <td style={{ padding:"11px 14px", fontSize:"13px", color:"#475569" }}>{w.assignedToName||<span style={{ color:"#94a3b8" }}>Unassigned</span>}</td>
                    <td style={{ padding:"11px 14px" }}>
                      <div style={{ display:"flex", gap:"6px", alignItems:"center" }}>
                        <select value={w.status} onChange={e=>updateStatus(w,e.target.value)} style={{ padding:"5px 8px", borderRadius:"6px", border:"1px solid #e2e8f0", fontSize:"12px", cursor:"pointer" }}>
                          {["open","assigned","in_progress","on_hold","completed","closed","escalated"].map(s=><option key={s} value={s}>{s.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
                        </select>
                        <button onClick={() => handleDelete(w)} title="Delete request" style={{ padding:"5px 8px", borderRadius:"6px", border:"1px solid #fecaca", background:"#fef2f2", color:"#dc2626", cursor:"pointer", fontSize:"12px", fontWeight:700, flexShrink:0 }}>
                          Delete
                        </button>
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
  );
}











/* ××××××××× Admin Shifts Section ××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××× */





function AdminShiftsSection({ token, companies = [] }) {





  const [selCo, setSelCo]   = useState(companies[0]?.id || null);





  const [shifts, setShifts] = useState([]);





  const [loading, setLoading] = useState(false);





  const [showCreate, setShowCreate] = useState(false);





  const [editShift, setEditShift] = useState(null);





  const emptyForm = { name:"", startTime:"", endTime:"", description:"", status:"active" };





  const [form, setForm]     = useState(emptyForm);





  const [saving, setSaving] = useState(false);











  const load = useCallback(async (cid) => {





    if (!cid) return; setLoading(true);





    try { const d = await getAdminShifts(token, cid); setShifts(Array.isArray(d) ? d : []); }





    catch(e) { console.error(e); }





    setLoading(false);





  }, [token]);











  useEffect(() => { if (selCo) load(selCo); }, [selCo, load]);











  const handleSave = async () => {





    if (!form.name || !form.startTime || !form.endTime) return;





    setSaving(true);





    try {





      if (editShift) {





        await updateAdminShift(token, editShift.id, form);





      } else {





        await createAdminShift(token, { ...form, companyId: selCo });





      }





      await load(selCo);





      setShowCreate(false); setEditShift(null); setForm(emptyForm);





    } catch(e) { alert(e.message); }





    setSaving(false);





  };











  const handleDelete = async (id) => {





    if (!window.confirm("Delete this shift?")) return;





    try { await deleteAdminShift(token, id); setShifts(prev => prev.filter(s => s.id !== id)); }





    catch(e) { alert(e.message); }





  };











  const fmt12 = t => { if (!t) return ""; const [h,m] = t.split(":"); const hr=parseInt(h,10); return `${hr%12||12}:${m} ${hr<12?"AM":"PM"}`; };











  return (





    <div style={{ padding:"24px", maxWidth:"1100px" }}>





      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"20px", gap:"10px" }}>





        <div><h1 style={{ fontSize:"22px", fontWeight:800, color:"#0f172a", margin:0 }}>Shifts</h1><p style={{ color:"#64748b", fontSize:"13.5px", margin:"4px 0 0" }}>Manage shift schedules across companies</p></div>





        <button type="button" onClick={() => { setForm(emptyForm); setEditShift(null); setShowCreate(true); }} style={{ padding:"9px 18px", background:"#2563eb", color:"#fff", border:"none", borderRadius:"8px", fontSize:"13.5px", fontWeight:700, cursor:"pointer" }}>+ Create Shift</button>





      </div>











      {/* Company selector */}





      <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0", padding:"12px 16px", marginBottom:"20px", display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap" }}>





        <span style={{ fontSize:"13px", fontWeight:700, color:"#374151" }}>Company:</span>





        {companies.map(c => (





          <button key={c.id} type="button" onClick={() => setSelCo(c.id)} style={{ padding:"5px 12px", borderRadius:"7px", fontSize:"12.5px", fontWeight:600, cursor:"pointer", border: selCo===c.id ? "none":"1px solid #e2e8f0", background: selCo===c.id ? "#2563eb":"#f8fafc", color: selCo===c.id ? "#fff":"#475569" }}>{c.companyName||c.name}</button>





        ))}





      </div>











      {/* Create/Edit modal */}





      {(showCreate || editShift) && (





        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center" }}>





          <div style={{ background:"#fff", borderRadius:"16px", padding:"28px", width:"440px", maxWidth:"92vw" }}>





            <h3 style={{ margin:"0 0 20px", fontSize:"17px", fontWeight:800 }}>{editShift ? "Edit Shift":"New Shift"}</h3>





            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>





              <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Shift name *" style={{ padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px" }} />





              <div style={{ display:"flex", gap:"10px" }}>





                <div style={{ flex:1 }}><label style={{ fontSize:"12px", fontWeight:600, color:"#475569" }}>Start Time</label><input type="time" value={form.startTime} onChange={e=>setForm({...form,startTime:e.target.value})} style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", marginTop:"4px" }} /></div>





                <div style={{ flex:1 }}><label style={{ fontSize:"12px", fontWeight:600, color:"#475569" }}>End Time</label><input type="time" value={form.endTime} onChange={e=>setForm({...form,endTime:e.target.value})} style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", marginTop:"4px" }} /></div>





              </div>





              <input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Description (optional)" style={{ padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px" }} />





              <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{ padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px" }}>





                <option value="active">Active</option><option value="inactive">Inactive</option>





              </select>





            </div>





            <div style={{ display:"flex", gap:"10px", justifyContent:"flex-end", marginTop:"20px" }}>





              <button type="button" onClick={() => { setShowCreate(false); setEditShift(null); }} style={{ padding:"9px 18px", borderRadius:"8px", border:"1px solid #e2e8f0", background:"#f8fafc", fontWeight:600, cursor:"pointer" }}>Cancel</button>





              <button type="button" onClick={handleSave} disabled={saving} style={{ padding:"9px 18px", borderRadius:"8px", border:"none", background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer" }}>{saving ? "Saving...":"Save Shift"}</button>





            </div>





          </div>





        </div>





      )}











      {loading ? (





        <div style={{ padding:"40px", textAlign:"center", color:"#94a3b8" }}>Loading shifts...</div>





      ) : shifts.length === 0 ? (





        <div style={{ padding:"48px", textAlign:"center", color:"#94a3b8", background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0" }}>No shifts created for this company.</div>





      ) : (





        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:"14px" }}>





          {shifts.map(s => (





            <div key={s.id} style={{ background:"#fff", borderRadius:"12px", border:`1px solid ${s.status==="active" ? "#bbf7d0":"#e2e8f0"}`, padding:"18px" }}>





              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"10px" }}>





                <div>





                  <p style={{ fontWeight:700, fontSize:"15px", color:"#0f172a", margin:0 }}>{s.name}</p>





                  <p style={{ fontSize:"13px", color:"#64748b", margin:"3px 0 0" }}>{fmt12(s.startTime)} → {fmt12(s.endTime)}</p>





                </div>





                <span style={{ padding:"3px 9px", borderRadius:"20px", fontSize:"11.5px", fontWeight:700, background: s.status==="active" ? "#dcfce7":"#f1f5f9", color: s.status==="active" ? "#166534":"#475569" }}>{s.status==="active" ? "Active":"Inactive"}</span>





              </div>





              {s.description && <p style={{ fontSize:"12.5px", color:"#64748b", margin:"0 0 10px" }}>{s.description}</p>}





              <p style={{ fontSize:"12px", color:"#94a3b8", margin:"0 0 12px" }}>{s.employeeCount||0} employees</p>





              <div style={{ display:"flex", gap:"8px" }}>





                <button type="button" onClick={() => { setForm({ name:s.name, startTime:s.startTime, endTime:s.endTime, description:s.description||"", status:s.status }); setEditShift(s); setShowCreate(false); }} style={{ flex:1, padding:"6px", borderRadius:"7px", border:"1px solid #e2e8f0", background:"#f8fafc", fontWeight:600, fontSize:"12.5px", cursor:"pointer" }}>Edit</button>





                <button type="button" onClick={() => handleDelete(s.id)} style={{ flex:1, padding:"6px", borderRadius:"7px", border:"1px solid #fee2e2", background:"#fef2f2", color:"#dc2626", fontWeight:600, fontSize:"12.5px", cursor:"pointer" }}>Delete</button>





              </div>





            </div>





          ))}





        </div>





      )}





    </div>





  );





}











/* ××××××××× Admin Employees Section ×××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××× */





function AdminEmployeesSection({ token, companies = [], initialCompanyId = null, onCompanySelected }) {
  const allCos = Array.isArray(companies) ? companies : [];
  const [selCo, setSelCo]     = useState(initialCompanyId || null);
  const [employees, setEmp]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch]   = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [coSearch, setCoSearch] = useState("");
  const [coDropOpen, setCoDropOpen] = useState(false);
  const emptyForm = { fullName:"", email:"", phone:"", designation:"", role:"employee", status:"Active", username:"", password:"" };
  const [form, setForm]       = useState(emptyForm);
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState(null);
  const [extraCompanyIds, setExtraCompanyIds] = useState([]); // additional company access
  const [formCompanyId, setFormCompanyId] = useState(null); // primary company selected inside modal
  const [companyAccessOpen, setCompanyAccessOpen] = useState(false);
  const [companyAccessSearch, setCompanyAccessSearch] = useState("");

  useEffect(() => {
    if (initialCompanyId) { setSelCo(initialCompanyId); if (onCompanySelected) onCompanySelected(); }
  }, [initialCompanyId]);

  const load = useCallback(async (cid) => {
    setLoading(true);
    try {
      if (!cid) {
        // All Companies: fetch from each in parallel
        const all = await Promise.all(allCos.map(c => getAdminEmployees(token, c.id).catch(() => [])));
        setEmp(all.flat());
      } else {
        const d = await getAdminEmployees(token, cid); setEmp(Array.isArray(d) ? d : []);
      }
    }
    catch(e) { console.error(e); }
    setLoading(false);
  }, [token, allCos]);

  useEffect(() => { load(selCo); }, [selCo, load]);

  const handleSave = async () => {
    setFormErr(null);
    const primaryCompanyId = selCo || formCompanyId;
    if (!form.fullName || !form.email) { setFormErr("Full Name and Email are required."); return; }
    if (!editEmp && !form.password) { setFormErr("Password is required."); return; }
    if (!editEmp && !primaryCompanyId) { setFormErr("Please select a primary company."); return; }
    setSaving(true);
    try {
      if (editEmp) {
        await updateAdminEmployee(token, editEmp.id, { ...form });
        // Update additional company access
        const accessResp = await fetch(`/api/company-users/${editEmp.id}/companies`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ additionalCompanyIds: extraCompanyIds }),
        });
        if (!accessResp.ok) {
          const errBody = await accessResp.json().catch(() => ({}));
          throw new Error(errBody.message || "Failed to update company access");
        }
      } else {
        const created = await createAdminEmployee(token, { ...form, companyId: primaryCompanyId });
        // Set additional company access for newly created user
        if (created?.id && extraCompanyIds.length > 0) {
          const accessResp2 = await fetch(`/api/company-users/${created.id}/companies`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ additionalCompanyIds: extraCompanyIds }),
          });
          if (!accessResp2.ok) {
            const errBody2 = await accessResp2.json().catch(() => ({}));
            throw new Error(errBody2.message || "Failed to set company access");
          }
        }
      }
      await load(selCo);
      setShowCreate(false); setEditEmp(null); setForm(emptyForm); setExtraCompanyIds([]); setFormCompanyId(null); setCompanyAccessOpen(false); setCompanyAccessSearch("");
    } catch(e) { setFormErr(e.message || "Save failed"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this employee? This cannot be undone.")) return;
    try { await deleteAdminEmployee(token, id); setEmp(prev => prev.filter(e => e.id !== id)); }
    catch(e) { alert(e.message); }
  };

  const displayed = employees.filter(e => !search || (e.fullName||"").toLowerCase().includes(search.toLowerCase()) || (e.email||"").toLowerCase().includes(search.toLowerCase()) || (e.designation||"").toLowerCase().includes(search.toLowerCase()));
  const ROLES = ["admin","supervisor","technician","employee","doctor","engineer","nurse","wardboy"];
  const roleColors = { admin:"#dbeafe", supervisor:"#fef9c3", technician:"#dcfce7", employee:"#f1f5f9" };
  const roleTextColors = { admin:"#1d4ed8", supervisor:"#854d0e", technician:"#166534", employee:"#475569" };
  const selectedCo = allCos.find(c => c.id === selCo);
  const filteredCos = coSearch ? allCos.filter(c => (c.companyName||c.name||"").toLowerCase().includes(coSearch.toLowerCase())) : allCos;

  return (
    <div style={{ padding:"24px", maxWidth:"1300px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"20px", gap:"10px", flexWrap:"wrap" }}>
        <div><h1 style={{ fontSize:"22px", fontWeight:800, color:"#0f172a", margin:0 }}>Employees</h1><p style={{ color:"#64748b", fontSize:"13.5px", margin:"4px 0 0" }}>Manage employees across companies</p></div>
        <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employees..." style={{ padding:"8px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13px", outline:"none", width:"200px" }} />
          <button type="button" onClick={() => { setForm(emptyForm); setEditEmp(null); setFormErr(null); setFormCompanyId(selCo); setShowCreate(true); }} style={{ padding:"8px 16px", background:"#2563eb", color:"#fff", border:"none", borderRadius:"8px", fontSize:"13px", fontWeight:700, cursor:"pointer" }}>+ Add User</button>
        </div>
      </div>

      {/* Searchable company dropdown */}
      <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0", padding:"12px 16px", marginBottom:"20px", display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap" }}>
        <span style={{ fontSize:"13px", fontWeight:700, color:"#374151", whiteSpace:"nowrap" }}>Company:</span>
        <div style={{ position:"relative", minWidth:"220px" }}>
          <button type="button" onClick={() => setCoDropOpen(o => !o)}
            style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px", padding:"7px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", background:"#f8fafc", fontSize:"13px", fontWeight:600, cursor:"pointer", color:"#374151" }}>
            <span>{selCo ? (selectedCo?.companyName||selectedCo?.name||"Select Company") : "All Companies"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {coDropOpen && (
            <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:9999, background:"#fff", border:"1px solid #e2e8f0", borderRadius:"10px", boxShadow:"0 8px 24px rgba(0,0,0,0.12)", minWidth:"220px", overflow:"hidden" }}>
              <div style={{ padding:"8px" }}>
                <input autoFocus value={coSearch} onChange={e=>setCoSearch(e.target.value)} placeholder="Search company..." style={{ width:"100%", padding:"7px 10px", borderRadius:"7px", border:"1px solid #e2e8f0", fontSize:"12.5px", boxSizing:"border-box" }} />
              </div>
              <div style={{ maxHeight:"200px", overflowY:"auto" }}>
                {filteredCos.length === 0 && <div style={{ padding:"12px", color:"#94a3b8", fontSize:"12px", textAlign:"center" }}>No companies found</div>}
                <button key="all" type="button" onClick={() => { setSelCo(null); setCoDropOpen(false); setCoSearch(""); }}
                  style={{ width:"100%", display:"block", padding:"9px 14px", border:"none", background: !selCo ? "#eff6ff" : "transparent", color: !selCo ? "#2563eb" : "#374151", fontWeight: !selCo ? 700 : 500, fontSize:"13px", cursor:"pointer", textAlign:"left" }}>
                  All Companies
                </button>
                {filteredCos.map(c => (
                  <button key={c.id} type="button" onClick={() => { setSelCo(c.id); setCoDropOpen(false); setCoSearch(""); }}
                    style={{ width:"100%", display:"block", padding:"9px 14px", border:"none", background: selCo===c.id ? "#eff6ff" : "transparent", color: selCo===c.id ? "#2563eb" : "#374151", fontWeight: selCo===c.id ? 700 : 500, fontSize:"13px", cursor:"pointer", textAlign:"left" }}
                    onMouseEnter={e => { if(selCo!==c.id) e.currentTarget.style.background="#f8fafc"; }}
                    onMouseLeave={e => { if(selCo!==c.id) e.currentTarget.style.background="transparent"; }}>
                    {c.companyName||c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit modal */}
      {(showCreate || editEmp) && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }} onClick={e => { if(e.target===e.currentTarget){setShowCreate(false);setEditEmp(null);} }}>
          <div style={{ background:"#fff", borderRadius:"16px", padding:"clamp(16px,3vw,28px)", width:"min(560px,95vw)", maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.18)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"20px" }}>
              <h3 style={{ margin:0, fontSize:"18px", fontWeight:800, color:"#0f172a" }}>{editEmp ? "Edit User" : "Add User"}</h3>
              <button type="button" onClick={() => { setShowCreate(false); setEditEmp(null); setCompanyAccessOpen(false); setCompanyAccessSearch(""); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:"22px", lineHeight:1 }}>&#10005;</button>
            </div>
            {formErr && <div style={{ background:"#fee2e2", color:"#dc2626", borderRadius:"8px", padding:"8px 12px", fontSize:"12.5px", marginBottom:"12px", fontWeight:600 }}>{formErr}</div>}
            <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
              <div>
                <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Full Name <span style={{ color:"#dc2626" }}>*</span></label>
                <input value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} placeholder="Full Name" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Email <span style={{ color:"#dc2626" }}>*</span></label>
                <input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@example.com" type="email" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box" }} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Phone</label>
                  <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="Phone number" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Designation</label>
                  <input value={form.designation} onChange={e=>setForm({...form,designation:e.target.value})} placeholder="e.g. Manager" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box" }} />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Role <span style={{ color:"#dc2626" }}>*</span></label>
                  <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", background:"#fff" }}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Status</label>
                  <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", background:"#fff" }}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Username <span style={{ fontSize:"11px", color:"#94a3b8", fontWeight:400 }}>(for mobile login)</span></label>
                  <input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} placeholder="Username" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box", background:"#f8fafc" }} />
                </div>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Password {!editEmp && <span style={{ color:"#dc2626" }}>*</span>}</label>
                  <input value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;&#9679;" type="password" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box", background:"#f8fafc" }} />
                </div>
              </div>
              {/* Company Access — unified primary + additional */}
              <div>
                <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"4px" }}>
                  Company Access <span style={{ fontSize:"11px", color:"#94a3b8", fontWeight:400 }}>(search and select companies this user should access)</span>
                </label>
                <button type="button" onClick={() => setCompanyAccessOpen(v => !v)}
                  style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", background:"#fff", cursor:"pointer", fontSize:"13px", color:"#374151" }}>
                  <span style={{ textAlign:"left", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {(() => {
                      const primaryId = selCo || formCompanyId;
                      const totalSelected = (primaryId ? 1 : 0) + extraCompanyIds.length;
                      if (totalSelected === 0) return "Select company access";
                      if (totalSelected === 1 && primaryId) return (allCos.find(c => c.id === primaryId)?.companyName || allCos.find(c => c.id === primaryId)?.name || "1 company");
                      return `${totalSelected} companies selected`;
                    })()}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                {companyAccessOpen && (
                  <div style={{ marginTop:"6px", border:"1px solid #e2e8f0", borderRadius:"8px", background:"#fff", overflow:"hidden" }}>
                    <div style={{ padding:"8px", borderBottom:"1px solid #f1f5f9" }}>
                      <input
                        value={companyAccessSearch}
                        onChange={e => setCompanyAccessSearch(e.target.value)}
                        placeholder="Search companies..."
                        style={{ width:"100%", padding:"8px 10px", borderRadius:"7px", border:"1px solid #e2e8f0", fontSize:"12.5px", boxSizing:"border-box" }}
                      />
                    </div>
                    <div style={{ maxHeight:"170px", overflowY:"auto", padding:"6px 8px" }}>
                      {allCos.filter(c => {
                        const name = (c.companyName || c.name || "").toLowerCase();
                        return !companyAccessSearch || name.includes(companyAccessSearch.toLowerCase());
                      }).length === 0 ? (
                        <p style={{ color:"#94a3b8", fontSize:"12px", margin:"6px 4px" }}>No matching companies</p>
                      ) : allCos
                        .filter(c => {
                          const name = (c.companyName || c.name || "").toLowerCase();
                          return !companyAccessSearch || name.includes(companyAccessSearch.toLowerCase());
                        })
                        .map(c => {
                          const primaryId = editEmp?.companyId ?? selCo ?? formCompanyId;
                          const isPrimary = primaryId != null && Number(c.id) === Number(primaryId);
                          const isChecked = isPrimary || extraCompanyIds.some(id => Number(id) === Number(c.id));
                          return (
                            <label key={c.id} style={{ display:"flex", alignItems:"center", gap:"8px", padding:"6px 4px", cursor:"pointer", fontSize:"13px", color:"#374151", borderBottom:"1px solid #f8fafc" }}>
                              <input type="checkbox"
                                checked={isChecked}
                                onChange={ev => {
                                  if (isPrimary) return;
                                  if (!selCo && !editEmp && !formCompanyId && ev.target.checked) { setFormCompanyId(c.id); return; }
                                  setExtraCompanyIds(prev => ev.target.checked ? [...prev, c.id] : prev.filter(id => Number(id) !== Number(c.id)));
                                }}
                                style={{ accentColor:"#2563eb" }}
                              />
                              <span style={{ flex:1 }}>{c.companyName || c.name}</span>
                              {isPrimary && <span style={{ fontSize:"10px", fontWeight:700, color:"#2563eb", background:"#dbeafe", padding:"1px 6px", borderRadius:"8px" }}>Primary</span>}
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}
                <div style={{ display:"flex", gap:"6px", flexWrap:"wrap", marginTop:"6px" }}>
                  {(selCo || formCompanyId) && (
                    <span style={{ fontSize:"11px", color:"#2563eb", background:"#eff6ff", border:"1px solid #bfdbfe", padding:"2px 7px", borderRadius:"999px", fontWeight:700 }}>
                      Primary: {allCos.find(c=>c.id===(selCo||formCompanyId))?.companyName || allCos.find(c=>c.id===(selCo||formCompanyId))?.name || "—"}
                    </span>
                  )}
                  {extraCompanyIds.map(id => {
                    const co = allCos.find(c => c.id === id);
                    return (
                      <span key={`extra-${id}`} style={{ fontSize:"11px", color:"#334155", background:"#f8fafc", border:"1px solid #e2e8f0", padding:"2px 7px", borderRadius:"999px" }}>
                        {co?.companyName || co?.name || id}
                      </span>
                    );
                  })}
                </div>
                {!selCo && !editEmp && !formCompanyId && <p style={{ fontSize:"11px", color:"#f59e0b", margin:"4px 0 0" }}>Check the primary company first</p>}
              </div>
            </div>
            <div style={{ display:"flex", gap:"10px", justifyContent:"flex-end", marginTop:"22px" }}>
              <button type="button" onClick={() => { setShowCreate(false); setEditEmp(null); setCompanyAccessOpen(false); setCompanyAccessSearch(""); }} style={{ padding:"9px 20px", borderRadius:"8px", border:"1px solid #e2e8f0", background:"#f8fafc", fontWeight:600, cursor:"pointer", fontSize:"13.5px" }}>Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ padding:"9px 20px", borderRadius:"8px", border:"none", background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:"13.5px", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : editEmp ? "Save Changes" : "Add User"}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding:"40px", textAlign:"center", color:"#94a3b8" }}>Loading employees...</div>
      ) : displayed.length === 0 ? (
        <div style={{ padding:"48px", textAlign:"center", color:"#94a3b8", background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0" }}>No employees found.</div>
      ) : (
        <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0", overflow:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13.5px" }}>
            <thead><tr style={{ background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
              {["#","Name","Email","Phone","Designation","Role","Status","Actions"].map(h=>(
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontWeight:700, color:"#64748b", fontSize:"11px", textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {displayed.map((e,i) => (
                <tr key={e.id} style={{ borderBottom:"1px solid #f1f5f9" }}
                  onMouseEnter={ev => ev.currentTarget.style.background="#f8fafc"}
                  onMouseLeave={ev => ev.currentTarget.style.background=""}>
                  <td style={{ padding:"10px 14px", color:"#94a3b8", fontSize:"12px" }}>{i+1}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
                      <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:"#2563eb", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", fontWeight:700, flexShrink:0 }}>{(e.fullName||"?")[0].toUpperCase()}</div>
                      <div><p style={{ margin:0, fontWeight:600, color:"#0f172a", fontSize:"13px" }}>{e.fullName}</p>{e.username && <p style={{ margin:0, fontSize:"11px", color:"#94a3b8" }}>{e.username}</p>}</div>
                    </div>
                  </td>
                  <td style={{ padding:"10px 14px", color:"#475569" }}>{e.email}</td>
                  <td style={{ padding:"10px 14px", color:"#475569" }}>{e.phone||"-"}</td>
                  <td style={{ padding:"10px 14px", color:"#475569" }}>{e.designation||"-"}</td>
                  <td style={{ padding:"10px 14px" }}><span style={{ background: roleColors[e.role]||"#f1f5f9", color: roleTextColors[e.role]||"#475569", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:700, textTransform:"capitalize" }}>{e.role}</span></td>
                  <td style={{ padding:"10px 14px" }}><span style={{ background: e.status==="Active"||e.status==="active" ? "#dcfce7":"#fee2e2", color: e.status==="Active"||e.status==="active" ? "#166534":"#dc2626", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:700 }}>{e.status||"Active"}</span></td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", gap:"6px" }}>
                      <button type="button" onClick={async () => {
                        setEditEmp(e);
                        setForm({ fullName:e.fullName||"", email:e.email||"", phone:e.phone||"", designation:e.designation||"", role:e.role||"employee", status:e.status||"Active", username:e.username||"", password:"" });
                        setFormErr(null); setShowCreate(false);
                        // Load existing additional company access
                        try {
                          const r = await fetch(`/api/company-users/${e.id}/companies`, { headers: { Authorization: `Bearer ${token}` } });
                          if (r.ok) {
                            const d = await r.json();
                            const primId = e.companyId ?? selCo;
                            setExtraCompanyIds((d.companyIds || []).filter(id => Number(id) !== Number(primId)));
                          }
                        } catch { setExtraCompanyIds([]); }
                      }} style={{ padding:"5px 10px", borderRadius:"6px", border:"1px solid #e2e8f0", background:"#f8fafc", color:"#475569", fontSize:"12px", cursor:"pointer", fontWeight:600 }}>Edit</button>
                      <button type="button" onClick={() => handleDelete(e.id)} style={{ padding:"5px 10px", borderRadius:"6px", border:"1px solid #fecaca", background:"#fff", color:"#dc2626", fontSize:"12px", cursor:"pointer", fontWeight:600 }}>Delete</button>
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
}

const CompanyPortal = () => {





  const [searchParams, setSearchParams] = useSearchParams();





  const [token, setToken] = useState(() => {





    const stored = localStorage.getItem(TOKEN_KEY);





    if (!stored || stored === "undefined" || stored === "null") return "";





    return stored;





  });





  const [authError, setAuthError] = useState(null);





  const [loading, setLoading] = useState(false);





  const [companies, setCompanies] = useState([]);





  const [selectedCompanyId, setSelectedCompanyId] = useState(null);





  const [companyForm, setCompanyForm] = useState(emptyCompany);





  const [companyError, setCompanyError] = useState(null);





  const [companyLoading, setCompanyLoading] = useState(false);





  // URL-driven navigation: /client?tab=dashboard - enables browser back/forward





  const nav = searchParams.get("tab") || localStorage.getItem("portal_nav") || "dashboard";





  const setNav = useCallback((tab) => {





    localStorage.setItem("portal_nav", tab);

    setSearchParams({ tab }, { replace: false });

  }, [setSearchParams]);





  const [checklistSubNav, setChecklistSubNav] = useState("templates");





  const [checklistSelectedCompanyId, setChecklistSelectedCompanyId] = useState(null);





  const [assetSubNav, setAssetSubNav] = useState("dashboard");





  const [logsheetSubNav, setLogsheetSubNav] = useState("templates");





  const [logsheetSelectedCompanyId, setLogsheetSelectedCompanyId] = useState(null);





  const [showAddForm, setShowAddForm] = useState(false);





  const [showSectorModal, setShowSectorModal] = useState(false);





  const [selectedSectors, setSelectedSectors] = useState([]);





  const [hospitalForm, setHospitalForm] = useState(emptyHospital);





  const [hospitalLoading, setHospitalLoading] = useState(false);





  const [hospitalError, setHospitalError] = useState(null);

  // States lookup for company/hospital registration dropdowns
  const [statesList, setStatesList] = useState([]);
  useEffect(() => {
    fetch('/api/states', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setStatesList(Array.isArray(d) ? d : [])).catch(() => {});
  }, [token]);





  const [searchTerm, setSearchTerm] = useState("");





  const [statusFilter, setStatusFilter] = useState("all");





  const [loginForm, setLoginForm] = useState({ email: "", password: "" });





  const [assets, setAssets] = useState([]);





  const [assetForm, setAssetForm] = useState(emptyAsset);





  const [assetLoading, setAssetLoading] = useState(false);
  const [viewingAsset, setViewingAsset] = useState(null);
  const [viewingAssetTab, setViewingAssetTab] = useState("overview");
  const [viewingAssetCallLogs, setViewingAssetCallLogs] = useState(null);
  const [viewingAssetCalibration, setViewingAssetCalibration] = useState(null);





  const [assetError, setAssetError] = useState(null);





  const [showAssetModal, setShowAssetModal] = useState(false);

  // Location cascade state for asset registration form
  const [locBuildings, setLocBuildings] = useState([]);
  const [locFloors,    setLocFloors]    = useState([]);
  const [locDepts,     setLocDepts]     = useState([]);
  const [locRooms,     setLocRooms]     = useState([]);

  const [assetQrModal, setAssetQrModal] = useState(null);

  const [assetQrDataUrl, setAssetQrDataUrl] = useState("");





  const [assetSearch, setAssetSearch] = useState("");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [assetStatusFilter, setAssetStatusFilter] = useState("all");
  const [assetCompanyFilter, setAssetCompanyFilter] = useState(""); // "" = all companies
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);





  const [editingAssetId, setEditingAssetId] = useState(null);





  const [assetTypes, setAssetTypes] = useState([]);





  const [assetTypeDraft, setAssetTypeDraft] = useState({ code: "", label: "", category: "", workflowType: "standard", fieldLayout: { fields: [] } });





  const [editingAssetTypeId, setEditingAssetTypeId] = useState(null);





  const [showFieldLayoutBuilder, setShowFieldLayoutBuilder] = useState(false);





  const [departments, setDepartments] = useState([]);





  const [departmentForm, setDepartmentForm] = useState(emptyDepartment);





  const [deptLocBuildings, setDeptLocBuildings] = useState([]);





  const [deptLocFloors, setDeptLocFloors] = useState([]);





  const [deptLocRooms, setDeptLocRooms] = useState([]);





  const [departmentLoading, setDepartmentLoading] = useState(false);





  const [departmentError, setDepartmentError] = useState(null);





  const [departmentSearch, setDepartmentSearch] = useState("");





  const [logs, setLogs] = useState([]);





  const [logForm, setLogForm] = useState({ assetId: "", note: "" });





  const [logError, setLogError] = useState(null);





  const [portalUsers, setPortalUsers] = useState([]);





  const [portalRole, setPortalRole] = useState(() => localStorage.getItem("client_portal_role") || "client_admin");





  const isClientAdmin = portalRole === "client_admin";











  // Company table UI state





  const [tableSearch, setTableSearch] = useState("");
  const [dashCompanyFilters, setDashCompanyFilters] = useState([]); // array of company IDs (strings) – applied
  const [dashCompanyPending, setDashCompanyPending] = useState([]); // pending selection before Apply
  const [dashCompanyFilter, setDashCompanyFilter] = useState(""); // legacy single (for export)
  const [dashFilterOpen, setDashFilterOpen] = useState(false);
  const [dashView, setDashView] = useState("company"); // "company" | "user"
  const [dashUserFilters, setDashUserFilters] = useState([]); // array of composite user-company keys (strings) – applied in User View
  const [dashUserFilterOpen, setDashUserFilterOpen] = useState(false);
  const [dashCompanySearch, setDashCompanySearch] = useState("");
  const [dashUserSearch, setDashUserSearch] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const [activeTile, setActiveTile] = useState(null);
  const [dashExportOpen, setDashExportOpen] = useState(false);
  const [empInitCompanyId, setEmpInitCompanyId] = useState(null);
  const [tileAssets, setTileAssets] = useState(null); // loaded assets for the active tile drill-down
  const [tileAssetsLoading, setTileAssetsLoading] = useState(false);
  const drillDownRef = useRef(null); // ref for scroll-to when tile activated;





  const [tableEntries, setTableEntries] = useState(25);





  const [tablePage, setTablePage] = useState(0);





  const [sortField, setSortField] = useState("companyName");





  const [sortDir, setSortDir] = useState("asc");





  const [viewCompanyId, setViewCompanyId] = useState(null);





  const [editCompanyId, setEditCompanyId] = useState(null);





  const [editCompanyForm, setEditCompanyForm] = useState(emptyCompany);





  const [editCompanyLoading, setEditCompanyLoading] = useState(false);





  const [editCompanyError, setEditCompanyError] = useState(null);











  // Modules modal state





  const [modulesModalId, setModulesModalId] = useState(null);





  const [modulesForm, setModulesForm] = useState([]);





  const [modulesSaving, setModulesSaving] = useState(false);











  // Role permissions modal state





  const [rolePermsModalId, setRolePermsModalId] = useState(null);





  const [rolePermsData, setRolePermsData] = useState({});





  const [rolePermsSaving, setRolePermsSaving] = useState(false);





  const [rolePermsActiveRoles, setRolePermsActiveRoles] = useState([]);











  // Company Users (Admin) state





  const [adminCompanyId, setAdminCompanyId] = useState(null);





  const [companyOverview, setCompanyOverview] = useState(null);





  const [overviewLoading, setOverviewLoading] = useState(false);





  const [recentEntries, setRecentEntries] = useState([]);





  const [recentEntriesLoading, setRecentEntriesLoading] = useState(false);





  const [recentChecklists, setRecentChecklists] = useState([]);





  const [recentChecklistsLoading, setRecentChecklistsLoading] = useState(false);





  const [dashboardTab, setDashboardTab] = useState("logsheets");





  const [logsheetShowAll, setLogsheetShowAll] = useState(false);





  const [checklistShowAll, setChecklistShowAll] = useState(false);





  const [detailModal, setDetailModal] = useState({ open: false, type: null, data: null, loading: false, error: null });











  const getQrBaseUrl = () => {





    return getPublicAppUrl();





  };











  const handleShowAssetQR = async (assetId, assetName, assetRecord) => {





    try {





      const url = `${getQrBaseUrl()}/asset-scan/${assetId}`;





      const dataUrl = await QRCode.toDataURL(url, { width: 320, margin: 2, color: { dark: "#0f172a", light: "#ffffff" } });





      setAssetQrDataUrl(dataUrl);





      const company = companies.find((c) => String(c.id) === String(assetRecord?.companyId));





      setAssetQrModal({





        assetId,





        assetName,





        url,





        barcodeNumber: assetRecord?.assetUniqueId || null,





        assetType: assetRecord?.assetType || null,





        companyName: company?.companyName || null,





        companyId: assetRecord?.companyId || null,





        location: [assetRecord?.building, assetRecord?.floor, assetRecord?.room].filter(Boolean).join(" →→ ") || null,





      });





    } catch (err) {





      alert("QR generation failed: " + err.message);





    }





  };











  const openDetail = async (type, id) => {





    setDetailModal({ open: true, type, data: null, loading: true, error: null });





    try {





      const data = type === "logsheet"





        ? await getLogsheetEntryDetail(token, id)





        : await getChecklistSubmissionDetail(token, id);





      setDetailModal({ open: true, type, data, loading: false, error: null });





    } catch (err) {





      setDetailModal({ open: true, type, data: null, loading: false, error: err.message || "Failed to load details" });





    }





  };





  const [issuesReport, setIssuesReport] = useState({ issues: [], summary: null });





  const [issuesReportLoading, setIssuesReportLoading] = useState(false);





  // Warnings nav badge





  const [warnOpenCount, setWarnOpenCount] = useState(0);





  // Notification bell + toasts





  const [bellOpen,     setBellOpen]    = useState(false);





  const [bellRinging,  setBellRinging] = useState(false);





  const [recentAlerts, setRecentAlerts] = useState([]); // [{id,severity,assetName,description,createdAt}]





  const [toasts,       setToasts]      = useState([]);   // [{id,text,severity}]





  const prevWarnCount = useRef(0);





  const toastId = useRef(0);











  // Modular alert sound hook - single shared AudioContext, throttled, localStorage preference





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





  useEffect(() => {





    if (nav === "warnings") setNav("reports");





  }, [nav]);











  useEffect(() => { localStorage.setItem("portal_nav", nav); }, [nav]);











  const [companyUsers, setCompanyUsers] = useState([]);





  const [companyUsersLoading, setCompanyUsersLoading] = useState(false);





  const [companyUsersError, setCompanyUsersError] = useState(null);





  const [showAddUserModal, setShowAddUserModal] = useState(false);





  const [editUserId, setEditUserId] = useState(null);





  const [userForm, setUserForm] = useState(emptyUser);





  const [userFormLoading, setUserFormLoading] = useState(false);





  const [userFormError, setUserFormError] = useState(null);





  const [userTableSearch, setUserTableSearch] = useState("");





  const [userTablePage, setUserTablePage] = useState(0);





  const [userTableEntries, setUserTableEntries] = useState(10);





  const [userSortField, setUserSortField] = useState("fullName");





  const [userSortDir, setUserSortDir] = useState("asc");





  // Asset table UI state





  const [assetTablePage, setAssetTablePage] = useState(0);





  const [assetTableEntries, setAssetTableEntries] = useState(25);





  const [assetSortField, setAssetSortField] = useState("assetName");





  const [assetSortDir, setAssetSortDir] = useState("asc");





  // Bulk import state





  const [showBulkImport, setShowBulkImport] = useState(false);





  const [bulkImportFile, setBulkImportFile] = useState(null);





  const [bulkImportDeptId, setBulkImportDeptId] = useState("");





  const [bulkImporting, setBulkImporting] = useState(false);





  const [bulkImportResult, setBulkImportResult] = useState(null);





  // Client portal aggregate dashboard stats





  const [dashboardStats, setDashboardStats] = useState(null);











  const selectedCompany = useMemo(





    () => companies.find((c) => c.id === selectedCompanyId) || companies[0],





    [companies, selectedCompanyId]





  );











  const filteredCompanies = useMemo(() => {





    return companies.filter((c) => {





      const status = (c.status || "Active").toLowerCase();





      const matchesStatus =





        statusFilter === "all" ||





        (statusFilter === "active" && status === "active") ||





        (statusFilter === "inactive" && status === "inactive") ||





        (statusFilter === "pending" && status === "pending");





      const term = searchTerm.trim().toLowerCase();





      const matchesTerm = term





        ? c.companyName?.toLowerCase().includes(term) ||





          c.city?.toLowerCase().includes(term) ||





          c.description?.toLowerCase().includes(term)





        : true;





      return matchesStatus && matchesTerm;





    });





  }, [companies, statusFilter, searchTerm]);











  const filteredAssets = useMemo(() => {





    return assets.filter((a) => {





      const matchesType = assetTypeFilter === "all" || a.assetType === assetTypeFilter;





      const term = assetSearch.trim().toLowerCase();





      const matchesTerm = term





        ? a.assetName?.toLowerCase().includes(term) ||





          a.assetUniqueId?.toLowerCase().includes(term) ||





          a.building?.toLowerCase().includes(term) ||





          a.room?.toLowerCase().includes(term) ||
          (a.qrCode && a.qrCode.toLowerCase().includes(term)) ||
          String(a.id).includes(term) ||
          a.companyName?.toLowerCase().includes(term)





        : true;





      return matchesType && matchesTerm && (assetStatusFilter === "all" || (assetStatusFilter === "unverified" ? !a.verified : a.status === assetStatusFilter)) && (assetCompanyFilter === "" || String(a.companyId) === String(assetCompanyFilter));





    });





  }, [assets, assetTypeFilter, assetSearch, assetStatusFilter, assetCompanyFilter]);











  const assetTypeLabelMap = useMemo(() => {





    const map = {};





    assetTypes.forEach((t) => { map[t.code] = t.label; });





    return map;





  }, [assetTypes]);











  const filteredDepartments = useMemo(() => {





    const term = departmentSearch.trim().toLowerCase();





    const activeCompanyId = selectedCompanyId || companies[0]?.id;





    return departments.filter((d) => {





      const matchesCompany = activeCompanyId ? String(d.companyId) === String(activeCompanyId) : true;





      const matchesTerm = term





        ? d.name.toLowerCase().includes(term) || (d.description || "").toLowerCase().includes(term)





        : true;





      return matchesCompany && matchesTerm;





    });





  }, [companies, departmentSearch, departments, selectedCompanyId]);











  const companyDepartmentOptions = useMemo(() => {





    const companyId = assetForm.companyId || selectedCompanyId || companies[0]?.id;





    return departments.filter((d) => String(d.companyId) === String(companyId));





  }, [assetForm.companyId, companies, departments, selectedCompanyId]);











  const assetOptions = useMemo(() => {





    const companyId = selectedCompanyId || companies[0]?.id;





    return assets.filter((a) => String(a.companyId) === String(companyId));





  }, [assets, companies, selectedCompanyId]);











  // --- Company table computed values ---





  const companyStats = useMemo(() => ({





    total: companies.length,





    active: companies.filter((c) => (c.status || "Active").toLowerCase() === "active").length,





    inactive: companies.filter((c) => (c.status || "Active").toLowerCase() !== "active").length,





    totalEmployees: companies.reduce((sum, c) => sum + (Number(c.employeeCount) || 0), 0),





  }), [companies]);











  const toggleSort = (field) => {





    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));





    else { setSortField(field); setSortDir("asc"); }





    setTablePage(0);





  };











  const sortedFilteredCompanies = useMemo(() => {





    const term = tableSearch.trim().toLowerCase();





    const filtered = companies.filter((c) => {





      if (!term) return true;





      return (





        c.companyName?.toLowerCase().includes(term) ||





        c.companyCode?.toLowerCase().includes(term) ||





        c.city?.toLowerCase().includes(term) ||





        c.description?.toLowerCase().includes(term)





      );





    });





    return [...filtered].sort((a, b) => {





      let av = a[sortField] || "";





      let bv = b[sortField] || "";





      if (typeof av === "string") av = av.toLowerCase();





      if (typeof bv === "string") bv = bv.toLowerCase();





      if (av < bv) return sortDir === "asc" ? -1 : 1;





      if (av > bv) return sortDir === "asc" ? 1 : -1;





      return 0;





    });





  }, [companies, tableSearch, sortField, sortDir]);











  const tablePages = useMemo(() => {





    const total = sortedFilteredCompanies.length;





    const totalPages = Math.max(1, Math.ceil(total / tableEntries));





    const startIndex = tablePage * tableEntries;





    return { total, totalPages, startIndex };





  }, [sortedFilteredCompanies, tableEntries, tablePage]);











  const pagedCompanies = useMemo(





    () => sortedFilteredCompanies.slice(tablePages.startIndex, tablePages.startIndex + tableEntries),





    [sortedFilteredCompanies, tablePages.startIndex, tableEntries]





  );











  const loadCompanies = async (authToken) => {





    setCompanyLoading(true);





    setCompanyError(null);





    try {





      const list = await getCompanies(authToken);





      const normalized = list.map((c) => ({ ...emptyCompany, ...c }));





      setCompanies(normalized);





      setSelectedCompanyId((prev) => prev || normalized[0]?.id || null);





    } catch (err) {





      if (err.status === 401) {





        handleLogout();





        setAuthError("Session expired. Please log in again.");





        return;





      }





      setCompanyError(err.message);





    } finally {





      setCompanyLoading(false);





    }





  };











  useEffect(() => {





    if (token) {





      loadCompanies(token).catch(() => {});





    }





  }, [token]);











  const loadAssets = async (authToken, companyId) => {





    setAssetLoading(true);





    setAssetError(null);





    try {





      const params = companyId ? `companyId=${companyId}` : "";





      const list = await getAssets(authToken, params);





      setAssets(list.map((a) => ({





        ...a,





        metadata: a.metadata || {},





      })));





    } catch (err) {





      setAssetError(err.message || "Could not load assets");





    } finally {





      setAssetLoading(false);





    }





  };











  const loadDepartments = async (authToken, companyId) => {





    if (!companyId) return;





    setDepartmentLoading(true);





    setDepartmentError(null);





    try {





      const params = companyId ? `companyId=${companyId}` : "";





      const list = await getDepartments(authToken, params);





      setDepartments(list);





      setDepartmentForm((prev) => ({ ...prev, companyId }));





      try {





        const r = await fetch(`/api/locations/buildings?companyId=${companyId}`, { headers: { Authorization: `Bearer ${authToken}` } });





        const d = await r.json();





        setDeptLocBuildings(Array.isArray(d) ? d : []);





      } catch {





        setDeptLocBuildings([]);





      }





    } catch (err) {





      setDepartmentError(err.message || "Could not load departments");





    } finally {





      setDepartmentLoading(false);





    }





  };











  const loadAssetTypes = async (authToken) => {





    if (!authToken) return;





    try {





      const list = await getAssetTypes(authToken);





      setAssetTypes(list);





      const defaultType = list[0]?.code || "";





      setAssetForm((prev) => ({ ...prev, assetType: prev.assetType || defaultType }));





    } catch (err) {





      // keep silent but avoid crash





      // eslint-disable-next-line no-console





      console.error(err);





    }





  };











  // Fetch aggregate stats when on dashboard tab





  useEffect(() => {





    if (!token || nav !== "dashboard") return;





    const statsUrl = dashCompanyFilters.length > 0
      ? `/api/companies/stats?companyIds=${dashCompanyFilters.join(",")}`
      : "/api/companies/stats";
    fetch(statsUrl, { headers: { Authorization: `Bearer ${token}` } })





      .then((r) => r.json())





      .then((d) => setDashboardStats(d))





      .catch(() => setDashboardStats({}));





    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, nav, dashCompanyFilters]);











  useEffect(() => {





    if (token && nav === "assets") {





      // Load assets for ALL companies (no companyId filter)





      loadAssets(token, null).catch(() => {});





      const defaultCompanyId = selectedCompanyId || companies[0]?.id;





      if (defaultCompanyId) setAssetForm((prev) => ({ ...prev, companyId: defaultCompanyId }));





    }





    // eslint-disable-next-line react-hooks/exhaustive-deps





  }, [token, nav, selectedCompanyId]);











  useEffect(() => {





    if (token) {





      loadAssetTypes(token).catch(() => {});





    }





    // eslint-disable-next-line react-hooks/exhaustive-deps





  }, [token]);











  useEffect(() => {





    if (token && (nav === "checklists" || nav === "logs")) {





      const companyId = selectedCompanyId || companies[0]?.id;





      if (companyId) {





        loadAssets(token, companyId).catch(() => {});





      }





    }





    // eslint-disable-next-line react-hooks/exhaustive-deps





  }, [token, nav, selectedCompanyId]);











  useEffect(() => {





    if (nav === "checklists" && portalUsers.length === 0) {





      loadUsers().catch(() => {});





    }





    // eslint-disable-next-line react-hooks/exhaustive-deps





  }, [nav]);











  useEffect(() => {





    if (nav === "logs" && logForm.assetId) {





      loadLogs(logForm.assetId).catch(() => {});





    }





    // eslint-disable-next-line react-hooks/exhaustive-deps





  }, [nav, logForm.assetId]);











  useEffect(() => {





    if (token && (nav === "assets" || nav === "departments" || nav === "companies")) {





      const companyId = selectedCompanyId || companies[0]?.id;





      if (nav === "companies" || nav === "departments") {





        // Load ALL departments so filteredDepartments memo can filter client-side





        setDepartmentLoading(true);





        getDepartments(token, "").then((list) => {





          setDepartments(list);





          if (companyId) {





            setDepartmentForm((prev) => ({ ...prev, companyId }));





          }





        }).catch(() => {}).finally(() => setDepartmentLoading(false));





      } else if (companyId) {





        loadDepartments(token, companyId).catch(() => {});





        setDepartmentForm((prev) => ({ ...prev, companyId }));





      }





    }





    // eslint-disable-next-line react-hooks/exhaustive-deps





  }, [token, nav, selectedCompanyId, companies]);











  // ×××××× Poll for new flags every 30 s - show toast when count increases ×××××××××××××××××××××××××××





  useEffect(() => {





    if (!token) return;





    const poll = async () => {





      const cid = selectedCompanyId || companies[0]?.id;





      if (!cid) return;





      try {





        const res = await fetch(buildApiUrl(`/api/flags/admin/list?companyId=${cid}&status=open&limit=5`), {





          headers: { Authorization: `Bearer ${token}` }





        });





        if (!res.ok) return;





        const data = await res.json();





        const newCount = data?.total ?? 0;





        const prev    = prevWarnCount.current;





        prevWarnCount.current = newCount;





        setWarnOpenCount(newCount);





        if (data?.data?.length) setRecentAlerts(data.data.slice(0, 5));





        if (newCount > prev) {





          const diff = newCount - prev;





          const newest = data?.data?.[0];





          const sev = newest?.severity || "high";





          const msg = newest





            ? `${diff} new warning${diff > 1 ? "s" : ""}: ${newest.severity?.toUpperCase()} → ${newest.assetName || "unknown asset"}`





            : `${diff} new warning${diff > 1 ? "s" : ""} raised`;





          pushToast(msg, sev);





          playAlertSound(sev);





          ringBell();





        }





      } catch (_) { /* silent */ }





    };





    const id = setInterval(poll, 15000);





    return () => clearInterval(id);





  }, [token, selectedCompanyId, companies, pushToast, playAlertSound, ringBell]);











  // ×××××× Initial data load on login ××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××





  useEffect(() => {





    if (!token) return;





    setRecentEntriesLoading(true);





    getRecentLogsheetEntries(token)





      .then((data) => setRecentEntries(data))





      .catch(() => {})





      .finally(() => setRecentEntriesLoading(false));





    setRecentChecklistsLoading(true);





    getRecentChecklistSubmissions(token)





      .then((data) => setRecentChecklists(data))





      .catch(() => {})





      .finally(() => setRecentChecklistsLoading(false));





    setIssuesReportLoading(true);





    getLogsheetIssuesReport(token, "limit=100")





      .then((data) => setIssuesReport(data))





      .catch(() => {})





      .finally(() => setIssuesReportLoading(false));





    // Pre-load open flag count for nav badge - use admin endpoint





    const cid = selectedCompanyId || companies[0]?.id;





    if (cid) {





      fetch(buildApiUrl(`/api/flags/admin/list?companyId=${cid}&status=open&limit=1`), {





        headers: { Authorization: `Bearer ${token}` }





      })





        .then((r) => r.json())





        .then((res) => {





          const count = res?.total ?? 0;





          prevWarnCount.current = count;





          setWarnOpenCount(count);





        })





        .catch(() => {});





    }





  }, [token]);











  const handleLogin = async (e) => {





    e.preventDefault();





    setLoading(true);





    setAuthError(null);





    try {





      const res = await login(loginForm);





      localStorage.setItem(TOKEN_KEY, res.token);





      localStorage.setItem("client_portal_role", "client_admin");





      setPortalRole("client_admin");





      setToken(res.token);





    } catch (err) {





      setAuthError(err.message || "Login failed");





    } finally {





      setLoading(false);





    }





  };











  useEffect(() => {





    const companyId = assetForm.companyId || selectedCompanyId || companies[0]?.id;





    const companyDepartments = departments.filter((d) => String(d.companyId) === String(companyId));





    const hasSelected = companyDepartments.some((d) => String(d.id) === String(assetForm.departmentId));





    if (companyId && companyDepartments.length > 0 && !hasSelected) {





      setAssetForm((prev) => ({ ...prev, companyId, departmentId: String(companyDepartments[0].id) }));





    }





  }, [assetForm.companyId, assetForm.departmentId, companies, departments, selectedCompanyId]);











  const handleLogout = () => {





    localStorage.removeItem(TOKEN_KEY);





    localStorage.removeItem("client_portal_role");





    setToken("");





    setCompanies([]);





    setSelectedCompanyId(null);





  };











  const handleCompanyChange = (e) => {





    const { name, value, type, checked } = e.target;





    setCompanyForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));





  };











  const handleHospitalChange = (e) => {





    const { name, value } = e.target;





    setHospitalForm((prev) => ({ ...prev, [name]: value }));





  };











  const handleCreateHospital = async (e) => {





    e.preventDefault();





    if (!token) return;





    setHospitalLoading(true);





    setHospitalError(null);





    try {





      const siteCode = hospitalForm.siteName





        .toUpperCase()





        .replace(/[^A-Z0-9]/g, "-")





        .replace(/-+/g, "-")





        .slice(0, 20)





        .replace(/-$/, "") + "-" + Date.now().toString(36).toUpperCase().slice(-4);





      const payload = {





        companyName: hospitalForm.siteName,





        companyCode: siteCode,





        sector: "healthcare",





        sectors: ["healthcare"],





        entityType: hospitalForm.entityType,





        facilityType: hospitalForm.facilityType,





        gstNumber: hospitalForm.gstNo,





        panNumber: hospitalForm.panNo,





        addressLine1: hospitalForm.address,





        state: hospitalForm.state,





        pincode: hospitalForm.pinCode,





        contactPersonName: hospitalForm.contactPersonName,





        contactPersonPhone: hospitalForm.contactPersonPhone,





        contactEmail: hospitalForm.contactEmail,





        status: hospitalForm.status,





        qsrModule: true,





        premealModule: true,





        deliveryModule: false,





        allowGuestBooking: false,





      };





      const created = await createCompany(token, payload);





      const merged = { ...emptyCompany, ...created };





      setCompanies((prev) => [merged, ...prev]);





      setSelectedCompanyId(created.id);





      setHospitalForm(emptyHospital);





      setSelectedSectors([]);





      setShowAddForm(false);





    } catch (err) {





      setHospitalError(err.message || "Could not register hospital");





    } finally {





      setHospitalLoading(false);





    }





  };











  const handleAssetChange = (e) => {





    const { name, value, type, checked } = e.target;





    if (name === "companyId") {





      const companyDepartments = departments.filter((d) => String(d.companyId) === String(value));





      const nextDepartmentId = companyDepartments[0] ? String(companyDepartments[0].id) : "";





      setAssetForm((prev) => ({





        ...prev,





        companyId: value,





        departmentId: nextDepartmentId,





      }));





      return;





    }





    setAssetForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));





  };











  const handleLogChange = (e) => {





    const { name, value } = e.target;





    setLogForm((prev) => ({ ...prev, [name]: value }));





  };











  const handleDepartmentChange = (e) => {





    const { name, value } = e.target;





    if (name === "companyId") {





      setDepartmentForm((prev) => ({ ...prev, companyId: value, buildingId: "", floorId: "", roomId: "" }));





      setDeptLocFloors([]);





      setDeptLocRooms([]);





      if (!value || !token) { setDeptLocBuildings([]); return; }





      fetch(`/api/locations/buildings?companyId=${value}`, { headers: { Authorization: `Bearer ${token}` } })





        .then((r) => r.json())





        .then((d) => setDeptLocBuildings(Array.isArray(d) ? d : []))





        .catch(() => setDeptLocBuildings([]));





      return;





    }





    if (name === "buildingId") {





      setDepartmentForm((prev) => ({ ...prev, buildingId: value, floorId: "", roomId: "" }));





      setDeptLocRooms([]);





      if (!value || !token) { setDeptLocFloors([]); return; }





      fetch(`/api/locations/floors?buildingId=${value}`, { headers: { Authorization: `Bearer ${token}` } })





        .then((r) => r.json())





        .then((d) => setDeptLocFloors(Array.isArray(d) ? d : []))





        .catch(() => setDeptLocFloors([]));





      return;





    }





    if (name === "floorId") {





      setDepartmentForm((prev) => ({ ...prev, floorId: value, roomId: "" }));





      if (!value || !token) { setDeptLocRooms([]); return; }





      fetch(`/api/locations/rooms?floorId=${value}`, { headers: { Authorization: `Bearer ${token}` } })





        .then((r) => r.json())





        .then((d) => setDeptLocRooms(Array.isArray(d) ? d : []))





        .catch(() => setDeptLocRooms([]));





      return;





    }





    setDepartmentForm((prev) => ({ ...prev, [name]: value }));





  };











  const handleCreateCompany = async (e) => {





    e.preventDefault();





    if (!token) return;





    setCompanyLoading(true);





    setCompanyError(null);





    try {

      if (!String(companyForm.companyCode || "").trim()) {
        setCompanyError("Company code is required");
        return;
      }





      const payload = { ...companyForm, sectors: selectedSectors, sector: selectedSectors[0] || null };





      const created = await createCompany(token, payload);





      const merged = { ...emptyCompany, ...companyForm, ...created };





      setCompanies((prev) => [merged, ...prev]);





      setSelectedCompanyId(created.id);





      setCompanyForm(emptyCompany);





      setSelectedSectors([]);





      setShowAddForm(false);





    } catch (err) {





      setCompanyError(err.message || "Could not create company");





    } finally {





      setCompanyLoading(false);





    }





  };;











  const handleCreateDepartment = async (e) => {





    e.preventDefault();





    if (!token) return;





    const companyId = departmentForm.companyId || selectedCompanyId || companies[0]?.id;





    if (!companyId) {





      setDepartmentError("Please create a company first");





      return;





    }





    setDepartmentLoading(true);





    setDepartmentError(null);





    try {





      const created = await createDepartment(token, {





        companyId: Number(companyId),





        name: departmentForm.name,





        description: departmentForm.description,





        buildingId: departmentForm.buildingId ? Number(departmentForm.buildingId) : null,





        floorId: departmentForm.floorId ? Number(departmentForm.floorId) : null,





        roomId: departmentForm.roomId ? Number(departmentForm.roomId) : null,





      });





      setDepartments((prev) => [created, ...prev]);





      setDepartmentForm({ ...emptyDepartment, companyId });





    } catch (err) {





      setDepartmentError(err.message || "Could not create department");





    } finally {





      setDepartmentLoading(false);





    }





  };











  const handleCreateAssetType = async (e) => {





    e.preventDefault();





    if (!token) return;





    if (!assetTypeDraft.code.trim() || !assetTypeDraft.label.trim()) {





      setAssetError("Type code and label are required");





      return;





    }





    setAssetError(null);





    setAssetLoading(true);





    try {





      const payload = {





        code: assetTypeDraft.code.trim().toLowerCase(),





        label: assetTypeDraft.label.trim(),





        category: assetTypeDraft.category.trim() || undefined,





        workflowType: assetTypeDraft.workflowType || "standard",





        fieldLayout: assetTypeDraft.fieldLayout?.fields?.length ? assetTypeDraft.fieldLayout : undefined,





      };





      if (editingAssetTypeId) {





        const updated = await updateAssetType(token, editingAssetTypeId, payload);





        setAssetTypes((prev) => prev.map(t => t.id === editingAssetTypeId ? { ...t, ...updated } : t).sort((a, b) => a.label.localeCompare(b.label)));





        setEditingAssetTypeId(null);





      } else {





        const created = await createAssetType(token, payload);





        setAssetTypes((prev) => [...prev, created].sort((a, b) => a.label.localeCompare(b.label)));





      }





      setAssetTypeDraft({ code: "", label: "", category: "", workflowType: "standard", fieldLayout: { fields: [] } });





      setShowFieldLayoutBuilder(false);





    } catch (err) {





      setAssetError(err.message || "Could not save asset type");





    } finally {





      setAssetLoading(false);





    }





  };











  const handleDeleteAssetType = async (id) => {





    if (!window.confirm("Delete this asset type? Assets using this type will keep the type code.")) return;





    if (!token) return;





    try {





      await deleteAssetType(token, id);





      setAssetTypes(prev => prev.filter(t => t.id !== id));





    } catch (err) {





      alert(err.message || "Could not delete asset type");





    }





  };











  const handleEditAssetType = (at) => {





    setEditingAssetTypeId(at.id);





    setAssetTypeDraft({





      code: at.code,





      label: at.label,





      category: at.category || "",





      workflowType: at.workflowType || "standard",





      fieldLayout: at.fieldLayout || { fields: [] },





    });





    setShowFieldLayoutBuilder(!!(at.fieldLayout?.fields?.length));





  };











  const addFieldToLayout = () => {





    setAssetTypeDraft(prev => ({





      ...prev,





      fieldLayout: {





        fields: [





          ...(prev.fieldLayout?.fields || []),





          { key: "", label: "", type: "text", required: false, placeholder: "" },





        ],





      },





    }));





    setShowFieldLayoutBuilder(true);





  };











  const updateLayoutField = (idx, changes) => {





    setAssetTypeDraft(prev => {





      const fields = [...(prev.fieldLayout?.fields || [])];





      fields[idx] = { ...fields[idx], ...changes };





      // Auto-generate key from label if key not set





      if (changes.label && !fields[idx].key) {





        fields[idx].key = changes.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "");





      }





      return { ...prev, fieldLayout: { fields } };





    });





  };











  const removeLayoutField = (idx) => {





    setAssetTypeDraft(prev => ({





      ...prev,





      fieldLayout: { fields: prev.fieldLayout.fields.filter((_, i) => i !== idx) },





    }));





  };











  const getWorkflowTypeForAsset = (assetTypeCode) => {





    const at = assetTypes.find(t => t.code === assetTypeCode);





    if (at?.workflowType) return at.workflowType;





    // Legacy fallback





    if (assetTypeCode === "soft" || assetTypeCode === "soft service") return "soft";





    if (assetTypeCode === "fleet") return "fleet";





    if (assetTypeCode === "technical") return "technical";





    if (assetTypeCode === "healthcare" || assetTypeCode === "medical") return "healthcare";





    return "standard";





  };











  // Derive whether the currently selected company is a healthcare company





  const isHealthcareCompany = (companyId) => {





    const co = companies.find((c) => String(c.id) === String(companyId));





    if (!co) return false;





    const secs = co.sectors || (co.sector ? [co.sector] : []);





    return secs.includes("healthcare");





  };











  // Return sector-filtered asset type options for a company.





  // Returns null if no sector restriction (show all). Returns [] if company unknown.





  const getCompanySectorTypes = (companyId) => {





    const co = companies.find((c) => String(c.id) === String(companyId));





    if (!co) return null;





    const secs = co.sectors || (co.sector ? [co.sector] : []);





    if (!secs.length) return null;





    const allowed = [];





    if (secs.includes("healthcare")) allowed.push({ code: "healthcare", label: "Healthcare Equipment", workflowType: "healthcare" });





    if (secs.includes("soft_services") || secs.includes("soft")) allowed.push({ code: "soft", label: "Soft Services", workflowType: "soft" });





    if (secs.includes("technical")) allowed.push({ code: "technical", label: "Technical Assets", workflowType: "technical" });





    if (secs.includes("fleet")) allowed.push({ code: "fleet", label: "Fleet / Vehicles", workflowType: "fleet" });





    if (secs.includes("general") || secs.includes("other")) allowed.push(...(assetTypes.filter(t => !["healthcare","soft","technical","fleet"].includes(t.code))));





    return allowed.length ? allowed : null;





  };











  const buildMetadataFromForm = (form) => {





    const wf = getWorkflowTypeForAsset(form.assetType);





    if (wf === "healthcare") {





      return {





        make: form.make,





        manufacturer: form.manufacturer,





        model: form.model,





        serialNo: form.serialNo,





        accessories: form.accessories,





        dealer: form.dealer,





        manufacturingYear: form.manufacturingYear,





        installationDate: form.hcInstallationDate,





        invoiceNo: form.invoiceNo,





        invoiceDate: form.invoiceDate,





        purchaseCost: form.purchaseCost,





        maintenanceType: form.maintenanceType,





        warrantyStart: form.warrantyStart,





        warrantyEnd: form.warrantyEnd,





        amcStart: form.amcStart,





        amcEnd: form.amcEnd,





        cmcStart: form.cmcStart,





        cmcEnd: form.cmcEnd,





        rber: !!form.rber,





        remarks: form.remarks,





        description: form.description,





        imageUrl: form.imageUrl,





        hcImages: form.hcImages || [],





        hcInvoiceUrl: form.hcInvoiceUrl || "",





        documents: form.documentLinks ? form.documentLinks.split(/\n|,/).map((d) => d.trim()).filter(Boolean) : [],





      };





    }





    if (wf === "soft") {





      return {





        building: form.building,





        floor: form.floor,





        room: form.room,





        description: form.description,





      };





    }





    if (wf === "technical") {





      return {





        machineName: form.machineName,





        brand: form.brand,





        modelNumber: form.modelNumber,





        serialNumber: form.serialNumber,





        installationDate: form.installationDate,





        warrantyExpiry: form.warrantyExpiry,





        maintenanceFrequency: form.maintenanceFrequency,





        lastServiceDate: form.lastServiceDate,





        nextServiceDate: form.nextServiceDate,





        technician: form.technician,





        checklist: form.checklist,





        description: form.description,





        imageUrl: form.imageUrl,





        documents: form.documentLinks ? form.documentLinks.split(/\n|,/).map((d) => d.trim()).filter(Boolean) : [],





      };





    }





    if (wf === "fleet") {





      return {





        vehicleNumber: form.vehicleNumber,





        vehicleType: form.vehicleType,





        fuelType: form.fuelType,





        driver: form.driver,





        rcNumber: form.rcNumber,





        insuranceExpiry: form.insuranceExpiry,





        pucExpiry: form.pucExpiry,





        serviceDueDate: form.serviceDueDate,





        purchaseDate: form.purchaseDate,





        vendor: form.vendor,





        dailyKmTracking: !!form.dailyKmTracking,





        checklist: form.checklist,





        description: form.description,





        imageUrl: form.imageUrl,





        documents: form.documentLinks ? form.documentLinks.split(/\n|,/).map((d) => d.trim()).filter(Boolean) : [],





      };





    }





    return {





      description: form.description,





      imageUrl: form.imageUrl,





      documents: form.documentLinks ? form.documentLinks.split(/\n|,/).map((d) => d.trim()).filter(Boolean) : [],





      // Collect any custom field values (prefixed with _custom_)





      ...Object.entries(form)





        .filter(([k]) => k.startsWith("_custom_"))





        .reduce((acc, [k, v]) => { acc[k.replace("_custom_", "")] = v; return acc; }, {}),





    };





  };











  const normalizeAssetFormFromRecord = (asset) => {





    // Safely parse metadata whether it comes as string or object
    let meta = asset.metadata || {};
    if (typeof meta === "string") { try { meta = JSON.parse(meta); } catch { meta = {}; } }





    if (asset.assetType === "healthcare" || (meta.maintenanceType !== undefined && asset.assetType !== "soft" && asset.assetType !== "technical" && asset.assetType !== "fleet")) {





      return {





        ...emptyAsset,





        ...asset,





        assetType: asset.assetType || "healthcare",





        departmentId: asset.departmentId ? String(asset.departmentId) : "",





        make: meta.make || "",





        manufacturer: meta.manufacturer || "",





        model: meta.model || "",





        serialNo: meta.serialNo || "",





        accessories: meta.accessories || "",





        dealer: meta.dealer || "",





        manufacturingYear: meta.manufacturingYear || "",





        hcInstallationDate: meta.installationDate || "",





        invoiceNo: meta.invoiceNo || "",





        invoiceDate: meta.invoiceDate || "",





        purchaseCost: meta.purchaseCost || "",





        maintenanceType: meta.maintenanceType || "",





        warrantyStart: meta.warrantyStart || "",





        warrantyEnd: meta.warrantyEnd || "",





        amcStart: meta.amcStart || "",





        amcEnd: meta.amcEnd || "",





        cmcStart: meta.cmcStart || "",





        cmcEnd: meta.cmcEnd || "",





        rber: !!meta.rber,





        remarks: meta.remarks || "",





        description: meta.description || "",





        imageUrl: meta.imageUrl || "",





        hcImages: Array.isArray(meta.hcImages) ? meta.hcImages : [],





        hcInvoiceUrl: meta.hcInvoiceUrl || "",





        documentLinks: (meta.documents || []).join("\n"),





      };





    }





    if (asset.assetType === "soft") {





      return {





        ...emptyAsset,





        ...asset,





        departmentId: asset.departmentId ? String(asset.departmentId) : "",





        serviceArea: meta.serviceArea || "",





        frequency: meta.frequency || "Daily",





        shift: meta.shift || "Morning",





        supervisor: meta.supervisor || "",





        staffRequired: meta.staffRequired || "",





        specialInstructions: meta.specialInstructions || "",





        checklist: meta.checklist || "",





        description: meta.description || "",





        imageUrl: meta.imageUrl || "",





      };





    }





    if (asset.assetType === "technical") {





      return {





        ...emptyAsset,





        ...asset,





        departmentId: asset.departmentId ? String(asset.departmentId) : "",





        machineName: meta.machineName || "",





        brand: meta.brand || "",





        modelNumber: meta.modelNumber || "",





        serialNumber: meta.serialNumber || "",





        installationDate: meta.installationDate || "",





        warrantyExpiry: meta.warrantyExpiry || "",





        maintenanceFrequency: meta.maintenanceFrequency || "",





        lastServiceDate: meta.lastServiceDate || "",





        nextServiceDate: meta.nextServiceDate || "",





        technician: meta.technician || "",





        checklist: meta.checklist || "",





        description: meta.description || "",





        imageUrl: meta.imageUrl || "",





        documentLinks: (meta.documents || []).join("\n"),





      };





    }





    if (asset.assetType === "fleet") {





      return {





        ...emptyAsset,





        ...asset,





        departmentId: asset.departmentId ? String(asset.departmentId) : "",





        vehicleNumber: meta.vehicleNumber || "",





        vehicleType: meta.vehicleType || "",





        fuelType: meta.fuelType || "",





        driver: meta.driver || "",





        rcNumber: meta.rcNumber || "",





        insuranceExpiry: meta.insuranceExpiry || "",





        pucExpiry: meta.pucExpiry || "",





        serviceDueDate: meta.serviceDueDate || "",





        purchaseDate: meta.purchaseDate || "",





        vendor: meta.vendor || "",





        dailyKmTracking: !!meta.dailyKmTracking,





        checklist: meta.checklist || "",





        description: meta.description || "",





        imageUrl: meta.imageUrl || "",





        documentLinks: (meta.documents || []).join("\n"),





      };





    }





    return {





      ...emptyAsset,





      ...asset,





      departmentId: asset.departmentId ? String(asset.departmentId) : "",





      description: meta.description || "",





      imageUrl: meta.imageUrl || "",





      documentLinks: (meta.documents || []).join("\n"),





    };





  };











  const handleSubmitAsset = async (e) => {





    e.preventDefault();





    if (!token) return;





    if (!assetForm.assetType) {





      setAssetError("Please select an asset type");





      return;





    }





    const companyId = assetForm.companyId || selectedCompanyId || companies[0]?.id;





    if (!companyId) {





      setAssetError("Please create a company first");





      return;





    }











    // Soft services don't require a department - auto-pick first available





    // Healthcare assets also allow optional department





    let departmentId = assetForm.departmentId;





    const isHCAsset = assetForm.assetType === "healthcare" || isHealthcareCompany(companyId);





    if (assetForm.assetType !== "soft" && !isHCAsset) {





      const companyDepartments = departments.filter((d) => String(d.companyId) === String(companyId));





      if (!companyDepartments.length) {





        setAssetError("Please add a department for this company first");





        return;





      }





      if (!departmentId) {





        setAssetError("Please select a department for this asset");





        return;





      }





    } else if (assetForm.assetType === "soft") {





      // For soft services pick the first department of the company as a fallback





      if (!departmentId) {





        const firstDept = departments.find((d) => String(d.companyId) === String(companyId));





        departmentId = firstDept?.id || "";





      }





    }





    // Soft services: asset name is derived from Room / Area





    let resolvedAssetName = assetForm.assetName;





    if (assetForm.assetType === "soft") {





      resolvedAssetName = (assetForm.room || "").trim();





      if (!resolvedAssetName) {





        setAssetError("Room / Area is required for Soft Services");





        return;





      }





    }





    setAssetLoading(true);





    setAssetError(null);





    try {





      const metadata = buildMetadataFromForm(assetForm);





      const payload = {





        companyId,





        departmentId: Number(departmentId),





        assetName: resolvedAssetName,





        assetUniqueId: assetForm.assetUniqueId,





        assetType: assetForm.assetType,





        building: assetForm.building,

        floor: assetForm.floor,

        room: assetForm.room,

        buildingId: assetForm.buildingId || null,
        floorId: assetForm.floorId || null,
        locDeptId: assetForm.locDeptId || null,
        roomId: assetForm.roomId || null,
        locationId: assetForm.locationId || null,

        status: assetForm.status,

        qrCode: assetForm.qrCode,

        metadata,

      };

      if (editingAssetId) {

        await updateAsset(token, editingAssetId, payload);

        await loadAssets(token, companyId);

      } else {

        await createAsset(token, payload);

        await loadAssets(token, companyId);

      }

      setAssetForm({ ...emptyAsset, companyId, departmentId: assetForm.departmentId });

      setEditingAssetId(null);

      setShowAssetModal(false);

    } catch (err) {

      setAssetError(err.message || "Could not save asset");

    } finally {

      setAssetLoading(false);

    }

  };
  const handleEditAsset = (asset) => {

    setEditingAssetId(asset.id);

    setAssetForm(normalizeAssetFormFromRecord(asset));

    setShowAssetModal(true);

    // Load location buildings for cascading dropdowns
    const cId = asset.companyId || selectedCompanyId || companies[0]?.id;
    if (cId) {
      fetch(`/api/locations/buildings?companyId=${cId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => setLocBuildings(Array.isArray(d) ? d : [])).catch(() => setLocBuildings([]));
    }

  };

  const handleDeleteAsset = async (id) => {

    if (!token) return;

    if (!window.confirm("Delete this asset?")) return;

    try {

      await deleteAsset(token, id);

      setAssets((prev) => prev.filter((a) => a.id !== id));

    } catch (err) {

      setAssetError(err.message || "Delete failed");

    }

  };

  const handleBulkDeleteAssets = async () => {
    if (!selectedAssetIds.length) return;
    if (!window.confirm("Delete " + selectedAssetIds.length + " selected asset(s)?")) return;
    try {
      const companyId = selectedCompanyId || companies[0]?.id;
      if (!companyId) throw new Error("Select a company first");

      const CHUNK_SIZE = 500;
      for (let i = 0; i < selectedAssetIds.length; i += CHUNK_SIZE) {
        const chunk = selectedAssetIds.slice(i, i + CHUNK_SIZE);
        await bulkDeleteAssets(token, companyId, chunk);
      }
      setAssets(prev => prev.filter(a => !selectedAssetIds.includes(a.id)));
      setSelectedAssetIds([]);
    } catch(err) { alert(err.message || "Bulk delete failed"); }
  };

  const handleBulkVerifyAssets = async () => {
    if (!selectedAssetIds.length) return;
    try {
      await bulkVerifyAssets(token, selectedAssetIds, 1);
      setAssets(prev => prev.map(a => selectedAssetIds.includes(a.id) ? { ...a, verified: 1 } : a));
      setSelectedAssetIds([]);
    } catch(err) { alert(err.message || "Bulk verify failed"); }
  };

  const handleInlineAssetStatus = async (assetId, changes) => {
    try {
      const { status, workingStatus, criticality, rber, verified } = changes;
      const existing = assets.find(a => a.id === assetId);
      const payload = {};
      if (status) payload.status = status;
      payload.metadata = {
        ...(existing?.metadata || {}),
        ...(workingStatus !== undefined ? { workingStatus } : {}),
        ...(criticality  !== undefined ? { criticality  } : {}),
        ...(rber         !== undefined ? { rber         } : {}),
      };
      if (verified !== undefined) {
        await verifyAsset(token, assetId, verified ? 1 : 0);
      }
      await updateAsset(token, assetId, payload);
      setAssets(p => p.map(a => a.id !== assetId ? a : {
        ...a,
        ...(status ? { status } : {}),
        ...(verified !== undefined ? { verified: verified ? 1 : 0 } : {}),
        metadata: {
          ...(a.metadata || {}),
          ...(workingStatus !== undefined ? { workingStatus } : {}),
          ...(criticality  !== undefined ? { criticality  } : {}),
          ...(rber         !== undefined ? { rber         } : {}),
        },
      }));
    } catch (err) {
      alert(err.message || "Failed to update asset status");
    }
  };
  const handleDeleteAllAssets = async () => {





    if (!token) return;





    const companyId = selectedCompanyId || companies[0]?.id;





    if (!companyId) return;





    const confirmed = window.confirm(





      `×▸××→-+→→× WARNING: This will permanently delete ALL assets for this company. This action cannot be undone.\n\nType OK to confirm.`





    );





    if (!confirmed) return;





    try {





      const result = await deleteAllAssets(token, companyId);





      setAssets([]);





      alert(`✓ ${result?.deleted ?? 0} assets deleted successfully.`);





    } catch (err) {





      setAssetError(err.message || "Delete all failed");





    }





  };











  const loadLogs = async (assetId) => {





    if (!token || !assetId) return;





    try {





      const list = await getLogs(token, `assetId=${assetId}`);





      setLogs(list);





    } catch (err) {





      setLogError(err.message || "Could not load logs");





    }





  };











  const loadUsers = async () => {





    try {





      const list = await getUsers();





      setPortalUsers(list);





    } catch (err) {





      // eslint-disable-next-line no-console





      console.error(err);





    }





  };











  const handleCreateLog = async (e) => {





    e.preventDefault();





    if (!token) return;





    if (!logForm.assetId) {





      setLogError("Select an asset first");





      return;





    }





    if (!logForm.note.trim()) {





      setLogError("Note is required");





      return;





    }





    setLogError(null);





    try {





      await createLog(token, { assetId: Number(logForm.assetId), note: logForm.note });





      await loadLogs(logForm.assetId);





      setLogForm({ ...logForm, note: "" });





    } catch (err) {





      setLogError(err.message || "Could not create log" );





    }





  };











  const handleDeleteLog = async (id) => {





    if (!token) return;





    if (!window.confirm("Delete this log entry?")) return;





    try {





      await deleteLog(token, id);





      setLogs((prev) => prev.filter((l) => l.id !== id));





    } catch (err) {





      setLogError(err.message || "Delete failed");





    }





  };











  const handleDeleteDepartment = async (id) => {





    if (!token) return;





    if (!window.confirm("Delete this department?")) return;





    try {





      await deleteDepartment(token, id);





      setDepartments((prev) => prev.filter((d) => d.id !== id));





    } catch (err) {





      setDepartmentError(err.message || "Delete failed");





    }





  };











  const handleDeleteCompany = async (id) => {





    if (!token) return;





    if (!window.confirm("Delete this company?")) return;





    try {





      await deleteCompany(token, id);





      setCompanies((prev) => prev.filter((c) => c.id !== id));





      setSelectedCompanyId((prev) => (prev === id ? null : prev));





    } catch (err) {





      setCompanyError(err.message || "Delete failed");





    }





  };











  const openEditCompany = (c) => {





    setEditCompanyId(c.id);





    setEditCompanyForm({ ...emptyCompany, ...c });





    setEditCompanyError(null);





  };











  const handleEditCompanyChange = (e) => {





    const { name, value, type, checked } = e.target;





    setEditCompanyForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));





  };











  const handleEditStateChange = (e) => {
    const selectedId = Number(e.target.value);
    const found = statesList.find(s => Number(s.id) === selectedId);
    setEditCompanyForm(prev => ({
      ...prev,
      stateId: selectedId || null,
      state: found?.state_name || "",
      stateCode: found?.state_code || "",
    }));
  };

    const handleUpdateCompany = async (e) => {





    e.preventDefault();





    if (!token || !editCompanyId) return;





    setEditCompanyLoading(true);





    setEditCompanyError(null);





    try {





      const updated = await updateCompany(token, editCompanyId, editCompanyForm);





      setCompanies((prev) =>





        prev.map((c) => (c.id === editCompanyId ? { ...emptyCompany, ...c, ...updated } : c))





      );





      setEditCompanyId(null);





    } catch (err) {





      setEditCompanyError(err.message || "Could not update company");





    } finally {





      setEditCompanyLoading(false);





    }





  };











  // ×××××× Company Users (Admin) ×××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××





  const loadCompanyUsers = async (companyId) => {





    if (!token || !companyId) return;





    setCompanyUsersLoading(true);





    setCompanyUsersError(null);





    try {





      const list = await getCompanyUsers(token, companyId);





      setCompanyUsers(list);





    } catch (err) {





      setCompanyUsersError(err.message || "Could not load users");





    } finally {





      setCompanyUsersLoading(false);





    }





  };











  const openAdminView = (companyId) => {





    setAdminCompanyId(companyId);





    setUserTableSearch("");





    setUserTablePage(0);





    setCompanyOverview(null);





    loadCompanyUsers(companyId);





    setOverviewLoading(true);





    getCompanyOverview(token, companyId)





      .then((d) => setCompanyOverview(d))





      .catch(() => {})





      .finally(() => setOverviewLoading(false));





  };











  const ALL_MODULES = [





    { key: "assets", label: "Asset Management" },





    { key: "checklists", label: "FM e Checklist" },





    { key: "logsheets", label: "Logsheets" },





    { key: "workorders", label: "Requests" },





    { key: "ojt", label: "OJT Training" },





    { key: "fleet", label: "Fleet Management" },





    { key: "warnings", label: "Warnings" },





    { key: "shifts", label: "Shifts" },





    { key: "departments", label: "Departments" },





  ];











  const ALL_ROLES = ["admin", "technical_lead", "assistant_manager", "technical_executive", "supervisor", "technician", "cleaner", "security", "driver", "fleet_operator", "employee"];

  const portalTabModules = [
    { key: "locations", label: "Locations" },
    { key: "departments", label: "Departments" },
    { key: "assets", label: "Assets" },
    { key: "requests", label: "Requests" },
    { key: "employees", label: "Employees" },
    { key: "qrcodes", label: "QR Codes" },
    { key: "settings", label: "Settings" },
  ];

  const normalizePortalModuleKey = (value) => {
    const key = String(value || "").trim().toLowerCase();
    if (!key) return "";
    const map = {
      workorders: "requests",
      "work-order": "requests",
      work_order: "requests",
      qrcode: "qrcodes",
      "qr-code": "qrcodes",
      qr: "qrcodes",
    };
    return map[key] || key;
  };











  const openModulesModal = (company) => {





    setModulesModalId(company.id);





    const enabled = Array.isArray(company.enabledModules)
      ? [...new Set(company.enabledModules.map(normalizePortalModuleKey).filter(Boolean))]
      : portalTabModules.map((m) => m.key);





    setModulesForm(enabled);





  };











  const handleSaveModules = async () => {





    if (!modulesModalId) return;





    setModulesSaving(true);





    try {





      const company = companies.find((c) => c.id === modulesModalId);
      const normalizedModules = [...new Set((modulesForm || []).map(normalizePortalModuleKey).filter(Boolean))];





      const updated = await updateCompany(token, modulesModalId, { ...company, enabledModules: normalizedModules });





      setCompanies((prev) => prev.map((c) => (c.id === modulesModalId ? { ...c, enabledModules: normalizedModules, ...updated } : c)));





      setModulesModalId(null);





    } catch (err) {





      alert(err.message || "Could not save module access");





    } finally {





      setModulesSaving(false);





    }





  };











  const openRolePermsModal = async (company) => {





    setRolePermsModalId(company.id);





    setRolePermsData({});





    setRolePermsActiveRoles([]);





    try {





      const [permsData, usersData] = await Promise.all([





        getRolePermissions(token, company.id),





        getCompanyUsers(token, company.id),





      ]);





      setRolePermsData(permsData || {});





      // Derive the unique roles that actually exist for this company's users





      const usedRoles = [...new Set((Array.isArray(usersData) ? usersData : []).map((u) => u.role).filter(Boolean))];



      const savedRoles = Object.keys(permsData || {}).filter(Boolean);



      const activeRoles = [...new Set([...usedRoles, ...savedRoles])];





      setRolePermsActiveRoles(activeRoles.length ? activeRoles : ["admin"]);





    } catch {





      setRolePermsData({});





      setRolePermsActiveRoles(["admin"]);





    }





  };











  const handleRolePermChange = (role, module, op) => {





    setRolePermsData((prev) => {





      const rolePerms = prev[role] || {};





      const modPerms = rolePerms[module] || {};





      return { ...prev, [role]: { ...rolePerms, [module]: { ...modPerms, [op]: !modPerms[op] } } };





    });





  };











  const handleSaveRolePerms = async () => {





    if (!rolePermsModalId) return;





    setRolePermsSaving(true);





    try {



      const active = new Set((rolePermsActiveRoles || []).filter(Boolean));



      const payload = Object.entries(rolePermsData || {}).reduce((acc, [role, perms]) => {



        if (active.has(role)) acc[role] = perms;



        return acc;



      }, {});





      await saveRolePermissions(token, rolePermsModalId, payload);





      setRolePermsModalId(null);





    } catch (err) {





      alert(err.message || "Could not save permissions");





    } finally {





      setRolePermsSaving(false);





    }





  };























  const handleUserFormChange = (e) => {





    const { name, value } = e.target;





    setUserForm((prev) => ({ ...prev, [name]: value }));





  };





  const handleUserModuleAccessToggle = (moduleKey) => {



    setUserForm((prev) => {



      const current = Array.isArray(prev.moduleAccess) ? prev.moduleAccess : [];



      const normalized = normalizePortalModuleKey(moduleKey);



      if (!normalized) return prev;



      const next = current.includes(normalized)



        ? current.filter((m) => m !== normalized)



        : [...current, normalized];



      return { ...prev, moduleAccess: next };



    });



  };











  const handleOpenAddUser = () => {





    setEditUserId(null);





    setUserForm(emptyUser);





    setUserFormError(null);





    setShowAddUserModal(true);





  };











  const handleOpenEditUser = (u) => {





    setEditUserId(u.id);





    const userModules = Array.isArray(u.moduleAccess)



      ? u.moduleAccess



      : (typeof u.moduleAccess === "string"



        ? (() => {



            try {



              const parsed = JSON.parse(u.moduleAccess);



              return Array.isArray(parsed) ? parsed : [];



            } catch {



              return [];



            }



          })()



        : []);



    const normalizedModules = [...new Set(userModules.map(normalizePortalModuleKey).filter(Boolean))];



    setUserForm({ fullName: u.fullName, email: u.email, phone: u.phone || "", designation: u.designation || "", role: u.role || "employee", status: u.status, password: "", username: u.username || "", moduleAccess: normalizedModules });





    setUserFormError(null);





    setShowAddUserModal(true);





  };











  const handleSubmitUser = async (e) => {





    e.preventDefault();





    if (!token || !adminCompanyId) return;





    setUserFormLoading(true);





    setUserFormError(null);





    try {





      const normalizedModules = [...new Set((userForm.moduleAccess || []).map(normalizePortalModuleKey).filter(Boolean))];



      const payload = { ...userForm, companyId: adminCompanyId, moduleAccess: normalizedModules };





      if (editUserId) {





        const updated = await updateCompanyUser(token, editUserId, payload);





        setCompanyUsers((prev) => prev.map((u) => (u.id === editUserId ? { ...u, ...updated } : u)));





      } else {





        if (!userForm.password) { setUserFormError("Password is required for new users"); setUserFormLoading(false); return; }





        const created = await createCompanyUser(token, payload);





        setCompanyUsers((prev) => [created, ...prev]);





        // refresh companies list so employee count updates in the table





        loadCompanies(token).catch(() => {});





      }





      setShowAddUserModal(false);





    } catch (err) {





      setUserFormError(err.message || "Could not save user");





    } finally {





      setUserFormLoading(false);





    }





  };











  const handleDeleteCompanyUser = async (id) => {





    if (!token) return;





    if (!window.confirm("Delete this user?")) return;





    try {





      await deleteCompanyUser(token, id);





      setCompanyUsers((prev) => prev.filter((u) => u.id !== id));





      // refresh companies list so employee count updates





      loadCompanies(token).catch(() => {});





    } catch (err) {





      setCompanyUsersError(err.message || "Delete failed");





    }





  };











  if (!token) {





    return (





      <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>





        <div style={{ width: "100%", maxWidth: "440px" }}>





          {/* Logo */}





          <div style={{ textAlign: "center", marginBottom: "36px" }}>





            <img src={catalystLogo} alt="Catalyst" style={{ height: "52px", objectFit: "contain", marginBottom: "16px" }} />





            <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "6px" }}>Client Portal</h1>





            <p style={{ color: "#64748b", fontSize: "14.5px" }}>Sign in with the user credentials created in the client portal.</p>





          </div>











          {/* Card */}





          <div style={{ background: "#fff", borderRadius: "16px", padding: "36px 40px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0" }}>





            {authError && (





              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "11px 14px", borderRadius: "8px", fontSize: "13.5px", marginBottom: "20px", display: "flex", gap: "8px", alignItems: "flex-start" }}>





                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, marginTop: "1px" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>





                {authError}





              </div>





            )}











            <form onSubmit={handleLogin}>





              <div style={{ marginBottom: "18px" }}>





                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "7px" }}>Email Address</label>





                <div style={{ position: "relative" }}>





                  <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>





                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>





                  </span>





                  <input





                    name="email"





                    type="email"





                    value={loginForm.email}





                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}





                    required





                    placeholder="you@company.com"





                    style={{ width: "100%", padding: "11px 12px 11px 40px", border: "1.5px solid #e2e8f0", borderRadius: "9px", fontSize: "14px", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}





                    onFocus={(e) => (e.target.style.borderColor = "#2563eb")}





                    onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}





                  />





                </div>





              </div>





              <div style={{ marginBottom: "24px" }}>





                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "7px" }}>Password</label>





                <div style={{ position: "relative" }}>





                  <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>





                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>





                  </span>





                  <input





                    name="password"





                    type="password"





                    value={loginForm.password}





                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}





                    required





                    placeholder="Enter your password"





                    style={{ width: "100%", padding: "11px 12px 11px 40px", border: "1.5px solid #e2e8f0", borderRadius: "9px", fontSize: "14px", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}





                    onFocus={(e) => (e.target.style.borderColor = "#2563eb")}





                    onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}





                  />





                </div>





              </div>





              <button type="submit" disabled={loading}





                style={{ width: "100%", padding: "13px", background: loading ? "#93c5fd" : "#2563eb", color: "#fff", border: "none", borderRadius: "9px", fontSize: "15px", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", transition: "background 0.2s" }}>





                {loading ? "Signing in..." : "Sign In"}





              </button>





            </form>





          </div>





        </div>





      </div>





    );





  }











  return (





    <div className="client-portal-shell">





      {/* ×××××× Submission Detail Modal ××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××××× */}





      {detailModal.open && (





        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}





          onClick={(e) => { if (e.target === e.currentTarget) setDetailModal({ open: false, type: null, data: null, loading: false, error: null }); }}>





          <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "860px", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 30px 80px rgba(0,0,0,0.25)" }}>





            {/* Modal header */}





            <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>





              <div>





                <div style={{ fontWeight: 800, fontSize: "17px", color: "#0f172a" }}>





                  {detailModal.loading ? "Loading..." : (detailModal.data?.templateName || (detailModal.type === "logsheet" ? "Logsheet Entry" : "Checklist Submission"))}





                </div>





                {detailModal.data && (





                  <div style={{ fontSize: "13px", color: "#64748b", marginTop: "3px" }}>





                    {detailModal.data.assetName && <span>Asset: <strong>{detailModal.data.assetName}</strong></span>}





                    {detailModal.data.companyName && <span style={{ marginLeft: "12px" }}>Company: {detailModal.data.companyName}</span>}





                  </div>





                )}





              </div>





              <button onClick={() => setDetailModal({ open: false, type: null, data: null, loading: false, error: null })}





                style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", width: "34px", height: "34px", cursor: "pointer", fontSize: "18px", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>





            </div>











            {/* Modal body */}





            <div style={{ overflowY: "auto", flex: 1, padding: "20px 24px" }}>





              {detailModal.loading && <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8", fontSize: "14px" }}>Loading submission details...</div>}





              {detailModal.error && <div style={{ color: "#dc2626", padding: "20px", fontWeight: 600 }}>→n× {detailModal.error}</div>}





              {detailModal.data && detailModal.type === "logsheet" && (() => {





                const d = detailModal.data;





                const MONAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];





                const isTabular = d.layoutType === "tabular" || (d.data && typeof d.data === "object");





                return (





                  <div>





                    {/* Summary row */}





                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>





                      {[





                        { label: "Period", value: `${MONAMES[(d.month || 1) - 1]} ${d.year}${d.shift ? ` →→ Shift ${d.shift}` : ""}` },





                        { label: "Frequency", value: d.frequency || "-" },





                        { label: "Submitted By", value: d.submittedBy || "-" },





                        { label: "Submitted At", value: d.submittedAt ? new Date(d.submittedAt).toLocaleString() : "-" },





                        { label: "Status", value: d.status || "submitted" },





                      ].map((f) => (





                        <div key={f.label} style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>





                          <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>{f.label}</div>





                          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>{f.value}</div>





                        </div>





                      ))}





                    </div>





                    {/* Tabular data */}





                    {isTabular && d.data?.readings && (





                      <div>





                        <div style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a", marginBottom: "12px" }}>Tabular Readings</div>





                        <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "14px", fontSize: "13px", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all", maxHeight: "300px", overflowY: "auto", border: "1px solid #e2e8f0" }}>





                          {JSON.stringify(d.data, null, 2)}





                        </div>





                      </div>





                    )}





                    {/* Standard Q&A answers */}





                    {!isTabular && d.answers && d.answers.length > 0 && (() => {





                      const grouped = d.answers.reduce((acc, a) => {





                        const sec = a.sectionName || "General";





                        if (!acc[sec]) acc[sec] = [];





                        const dayParts = acc[sec];





                        const existing = dayParts.find((x) => x.questionId === a.questionId);





                        if (existing) {





                          existing.days = existing.days || {};





                          existing.days[a.dateColumn] = { value: a.answerValue, isIssue: a.isIssue };





                        } else {





                          dayParts.push({ questionId: a.questionId, questionText: a.questionText, answerType: a.answerType, spec: a.specification, days: { [a.dateColumn]: { value: a.answerValue, isIssue: a.isIssue } } });





                        }





                        return acc;





                      }, {});





                      return (





                        <div>





                          {Object.entries(grouped).map(([section, qs]) => (





                            <div key={section} style={{ marginBottom: "20px" }}>





                              <div style={{ fontWeight: 700, fontSize: "13px", color: "#1e40af", background: "#dbeafe", padding: "6px 12px", borderRadius: "6px", marginBottom: "8px" }}>{section}</div>





                              <div style={{ overflowX: "auto" }}>





                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>





                                  <thead>





                                    <tr style={{ background: "#f8fafc" }}>





                                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", minWidth: "200px" }}>Question</th>





                                      {[...new Set(d.answers.map((a) => a.dateColumn))].sort((a, b) => a - b).map((day) => (





                                        <th key={day} style={{ padding: "8px 6px", textAlign: "center", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", minWidth: "32px" }}>{day}</th>





                                      ))}





                                    </tr>





                                  </thead>





                                  <tbody>





                                    {qs.map((q, qi) => (





                                      <tr key={q.questionId || qi} style={{ borderBottom: "1px solid #f1f5f9", background: qi % 2 === 0 ? "#fff" : "#fafafa" }}>





                                        <td style={{ padding: "7px 12px", fontWeight: 500, color: "#334155" }}>{q.questionText}{q.spec && <span style={{ color: "#94a3b8", fontSize: "11px", display: "block" }}>{q.spec}</span>}</td>





                                        {[...new Set(d.answers.map((a) => a.dateColumn))].sort((a, b) => a - b).map((day) => {





                                          const cell = q.days?.[day];





                                          return (





                                            <td key={day} style={{ padding: "7px 4px", textAlign: "center", background: cell?.isIssue ? "#fef2f2" : "transparent", color: cell?.isIssue ? "#dc2626" : "#0f172a" }}>





                                              {cell?.value ?? ""}





                                            </td>





                                          );





                                        })}





                                      </tr>





                                    ))}





                                  </tbody>





                                </table>





                              </div>





                            </div>





                          ))}





                        </div>





                      );





                    })()}





                    {!isTabular && (!d.answers || d.answers.length === 0) && (





                      <div style={{ color: "#94a3b8", textAlign: "center", padding: "32px", fontSize: "13px" }}>No answers recorded for this entry.</div>





                    )}





                  </div>





                );





              })()}





              {detailModal.data && detailModal.type === "checklist" && (() => {





                const d = detailModal.data;





                const statusColors = { completed: ["#f0fdf4","#16a34a"], partial: ["#fffbeb","#ca8a04"], pending: ["#f1f5f9","#64748b"], submitted: ["#eff6ff","#2563eb"] };





                const [sbg, stx] = statusColors[d.status] || ["#f1f5f9","#64748b"];





                return (





                  <div>





                    {/* Summary */}





                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" }}>





                      {[





                        { label: "Status", value: <span style={{ padding: "3px 10px", borderRadius: "20px", background: sbg, color: stx, fontWeight: 700, fontSize: "13px", textTransform: "capitalize" }}>{d.status}</span> },





                        { label: "Completion", value: `${d.completionPct || 0}%` },





                        { label: "Submitted By", value: d.submittedBy || "-" },





                        { label: "Submitted At", value: d.submittedAt ? new Date(d.submittedAt).toLocaleString() : "-" },





                        { label: "Frequency", value: d.frequency || "-" },





                      ].map((f) => (





                        <div key={f.label} style={{ background: "#f8fafc", borderRadius: "8px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>





                          <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", marginBottom: "4px" }}>{f.label}</div>





                          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: "14px" }}>{f.value}</div>





                        </div>





                      ))}





                    </div>





                    {/* Q&A table */}





                    {d.answers && d.answers.length > 0 && (





                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>





                        <thead>





                          <tr style={{ background: "#f8fafc" }}>





                            <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>#</th>





                            <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0", minWidth: "240px" }}>Question</th>





                            <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Type</th>





                            <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Answer</th>





                          </tr>





                        </thead>





                        <tbody>





                          {d.answers.map((a, idx) => {





                            const val = a.answerJson?.value ?? a.optionSelected ?? "-";





                            const isIssue = a.answerJson?.flagIssue || (typeof val === "string" && val.toLowerCase() === "no");





                            return (





                              <tr key={a.id || idx} style={{ borderBottom: "1px solid #f1f5f9", background: isIssue ? "#fef2f2" : (idx % 2 === 0 ? "#fff" : "#fafafa") }}>





                                <td style={{ padding: "10px 14px", color: "#94a3b8", fontWeight: 600 }}>{idx + 1}</td>





                                <td style={{ padding: "10px 14px", color: "#334155", fontWeight: 500 }}>{a.questionText}</td>





                                <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{a.inputType || a.answerType || "-"}</td>





                                <td style={{ padding: "10px 14px", fontWeight: 600, color: isIssue ? "#dc2626" : "#0f172a" }}>





                                  {isIssue && <span style={{ marginRight: "4px" }}>→n×</span>}





                                  {(() => {





                                    const v = val !== null && val !== undefined ? val : "-";





                                    const vStr = String(v);





                                    if (vStr.startsWith("http") && /\.(jpe?g|png|gif|webp)(\?|$)/i.test(vStr)) {





                                      return <PhotoAnswer src={vStr} />;





                                    }





                                    return vStr;





                                  })()}





                                  {a.answerJson?.remark && <span style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 400 }}>{a.answerJson.remark}</span>}





                                </td>





                              </tr>





                            );





                          })}





                        </tbody>





                      </table>





                    )}





                    {(!d.answers || d.answers.length === 0) && (





                      <div style={{ color: "#94a3b8", textAlign: "center", padding: "32px", fontSize: "13px" }}>No answers recorded for this submission.</div>





                    )}





                  </div>





                );





              })()}





            </div>





          </div>





        </div>





      )}





      <aside className="client-side-panel">

        <div className="client-side-header">
          <div className="client-avatar">CP</div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div className="client-side-title">Client Portal</div>
            <div className="client-side-sub">Manage companies</div>
          </div>
          {/* Notification bell */}
          <div style={{ position: "relative", marginLeft: "2px", flexShrink: 0 }}>
            <button onClick={() => setBellOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", position: "relative", display: "flex", alignItems: "center" }} title="Warnings">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {warnOpenCount > 0 && <span style={{ position: "absolute", top: "-2px", right: "-2px", background: "#dc2626", color: "#fff", borderRadius: "50%", fontSize: "9px", fontWeight: 800, width: "15px", height: "15px", display: "flex", alignItems: "center", justifyContent: "center" }}>{warnOpenCount > 99 ? "99+" : warnOpenCount}</span>}
            </button>
            {/* Bell dropdown */}
            {bellOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "300px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.12)", zIndex: 9999, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>Active Warnings</span>
                  <button onClick={() => { setBellOpen(false); setNav("warnings"); setShowAddForm(false); }} style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>View all &rarr;</button>
                </div>
                {recentAlerts.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>No open warnings</div>}
                {recentAlerts.map((a) => {
                  const sevColor = { critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#16a34a" }[a.severity] || "#475569";
                  const sevBg    = { critical: "#fee2e2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4" }[a.severity] || "#f8fafc";
                  return (
                    <div key={a.id} style={{ padding: "10px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer" }} onClick={() => { setBellOpen(false); setNav("warnings"); setShowAddForm(false); }} onMouseEnter={e => e.currentTarget.style.background="#f8fafc"} onMouseLeave={e => e.currentTarget.style.background=""}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ background: sevBg, color: sevColor, fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "10px", textTransform: "uppercase" }}>{a.severity}</span>
                        <span style={{ fontWeight: 600, fontSize: "12px", color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.assetName || "Unknown asset"}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description || "No description"}</div>
                    </div>
                  );
                })}
                {warnOpenCount > 5 && <div style={{ padding: "10px 16px", textAlign: "center", borderTop: "1px solid #f1f5f9" }}><button onClick={() => { setBellOpen(false); setNav("warnings"); setShowAddForm(false); }} style={{ background: "none", border: "none", color: "#2563eb", fontWeight: 700, fontSize: "12px", cursor: "pointer" }}>+{warnOpenCount - recentAlerts.length} more - View all</button></div>}
                <div style={{ borderTop: "1px solid #f1f5f9", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>Alert sounds</span>
                  <div style={{ display: "flex", gap: "5px" }}>
                    <button className={`fm-alarm-gear${alarmSettingsOpen ? " fm-open" : ""}`} onClick={() => setAlarmSettingsOpen(v => !v)} title="Alarm settings">→n×</button>
                    <button className={`fm-sound-toggle ${soundEnabled ? "fm-enabled" : "fm-muted"}`} onClick={toggleSound}>{soundEnabled ? "🏢 On" : "🏢 Off"}</button>
                  </div>
                </div>
                {alarmSettingsOpen && (
                  <div className="fm-alarm-settings">
                    <h4>Alarm Settings</h4>
                    <div className="fm-alarm-vol-row"><span>Volume</span><strong>{Math.round(alarmVolume * 100)}%</strong></div>
                    <input type="range" min="0" max="1" step="0.05" value={alarmVolume} onChange={e => updateAlarmVolume(parseFloat(e.target.value))} className="fm-vol-slider" />
                    <div className="fm-sev-section-label">Sound per severity</div>
                    {[{ key: "critical", label: "Critical", color: "#dc2626", bg: "#fee2e2" }, { key: "high", label: "High", color: "#ea580c", bg: "#fff7ed" }, { key: "medium", label: "Medium", color: "#d97706", bg: "#fefce8" }, { key: "low", label: "Low", color: "#16a34a", bg: "#f0fdf4" }, { key: "info", label: "Info", color: "#2563eb", bg: "#eff6ff" }].map(({ key, label, color, bg }) => {
                      const isOn = alarmSevConfig[key] !== false;
                      return (
                        <div key={key} className="fm-sev-row">
                          <span className="fm-sev-badge" style={{ background: bg, color }}>{label}</span>
                          <div className="fm-sev-actions">
                            <button className="fm-preview-btn" title={`Preview ${label}`} onClick={() => previewAlertSound(key)}>×++→ Test</button>
                            <button className={`fm-sev-toggle ${isOn ? "on" : "off"}`} onClick={() => updateAlarmSevConfig(key, !isOn)}>{isOn ? "ON" : "OFF"}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        <nav className="client-side-nav">
          {/* Overview */}
          <div className="nav-group-label">Overview</div>
          <button className={nav === "dashboard" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("dashboard"); setShowAddForm(false); }} title="Dashboard">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            <span className="nav-label">Dashboard</span>
          </button>

          {/* Management */}
          <div className="nav-group-label">Management</div>
          <button className={nav === "companies" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("companies"); setShowAddForm(false); }} title="Customers">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>
            <span className="nav-label">Customers</span>
          </button>
          <button className={nav === "employees" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("employees"); setShowAddForm(false); }} title="Employees">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span className="nav-label">Employees</span>
          </button>
          <button className={nav === "locations" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("locations"); setShowAddForm(false); }} title="Locations">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span className="nav-label">Locations</span>
          </button>
          <button className={nav === "departments" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("departments"); setShowAddForm(false); }} title="Departments">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><path d="M5 9v3M12 9v3M19 9v3"/><rect x="5" y="15" width="14" height="6" rx="1"/></svg>
            <span className="nav-label">Departments</span>
          </button>
          <button className={nav === "states" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("states"); setShowAddForm(false); }} title="States">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
            <span className="nav-label">States</span>
          </button>

          {/* Operations */}
          <div className="nav-group-label">Operations</div>
          <button className={nav === "assets" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("assets"); setShowAddForm(false); }} title="Assets">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            <span className="nav-label">Assets</span>
          </button>
          <button className={nav === "checklists" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("checklists"); setShowAddForm(false); }} title="Checklists">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <span className="nav-label">Checklists</span>
          </button>
          <button className={nav === "logsheets" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("logsheets"); setShowAddForm(false); }} title="Logsheets">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <span className="nav-label">Logsheets</span>
          </button>
          <button className={nav === "workorders" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("workorders"); setShowAddForm(false); }} title="Requests">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span className="nav-label">Requests</span>
          </button>
          <button className={nav === "qrcodes" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("qrcodes"); setShowAddForm(false); }} title="QR Codes">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="5" y="5" width="3" height="3"/><rect x="16" y="5" width="3" height="3"/><rect x="16" y="16" width="3" height="3"/><rect x="5" y="16" width="3" height="3"/></svg>
            <span className="nav-label">QR Codes</span>
          </button>

          {/* Analytics */}
          <div className="nav-group-label">Analytics</div>
          <button className={nav === "reports" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("reports"); setShowAddForm(false); }} title="Reports">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><polyline points="6 14 12 4 18 10"/></svg>
            <span className="nav-label">Reports</span>
          </button>
        </nav>

        <div className="client-side-footer">
          <button className="client-side-item" disabled title="Settings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>
            <span className="nav-label">Settings</span>
          </button>
          <button className="client-side-item" onClick={handleLogout} title="Logout">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="nav-label">Logout</span>
          </button>
        </div>

      </aside>











      <div className="page client-main-area">
        <div key={nav} className="page-fade-in" style={{ minHeight: "100%" }}>







        {nav === "companies" && !showAddForm && adminCompanyId && (() => {





          const adminCompany = companies.find((c) => c.id === adminCompanyId);





          const userStats = {





            total: companyUsers.length,





            active: companyUsers.filter((u) => (u.status || "Active").toLowerCase() === "active").length,





            inactive: companyUsers.filter((u) => (u.status || "Active").toLowerCase() !== "active").length,





          };





          const term = userTableSearch.trim().toLowerCase();





          const filteredUsers = companyUsers.filter((u) =>





            !term || u.fullName?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || (u.designation || "").toLowerCase().includes(term)





          );





          const sortedUsers = [...filteredUsers].sort((a, b) => {





            let av = a[userSortField] || ""; let bv = b[userSortField] || "";





            if (typeof av === "string") av = av.toLowerCase(); if (typeof bv === "string") bv = bv.toLowerCase();





            if (av < bv) return userSortDir === "asc" ? -1 : 1;





            if (av > bv) return userSortDir === "asc" ? 1 : -1;





            return 0;





          });





          const totalPages = Math.max(1, Math.ceil(sortedUsers.length / userTableEntries));





          const startIndex = userTablePage * userTableEntries;





          const pagedUsers = sortedUsers.slice(startIndex, startIndex + userTableEntries);





          const toggleUserSort = (f) => {





            if (userSortField === f) setUserSortDir((d) => (d === "asc" ? "desc" : "asc"));





            else { setUserSortField(f); setUserSortDir("asc"); }





            setUserTablePage(0);





          };





          const UserTH = ({ field, children, sortable = true }) => (





            <th onClick={sortable ? () => toggleUserSort(field) : undefined}





              style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", cursor: sortable ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none" }}>





              {children}{sortable && <span style={{ color: userSortField === field ? "#7c3aed" : "#94a3b8", fontSize: "11px", marginLeft: "4px" }}>{userSortField === field ? (userSortDir === "asc" ? "▾" : "▲") : "▾"}</span>}





            </th>





          );





          return (





            <>





              {/* Header */}





              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "22px" }}>





                <div>





                  <h1 style={{ fontSize: "24px", fontWeight: "800", color: "#0f172a", marginBottom: "4px", letterSpacing: "-0.5px" }}>





                    Users - {adminCompany?.companyName || "Company"}





                  </h1>





                  <p style={{ fontSize: "13px", color: "#94a3b8" }}>





                    Companies&nbsp;<span style={{ color: "#cbd5e1" }}>/</span>&nbsp;





                    <button onClick={() => setAdminCompanyId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#3b82f6", fontWeight: 500, fontSize: "13px", padding: 0 }}>{adminCompany?.companyName || "Company"}</button>





                    &nbsp;<span style={{ color: "#cbd5e1" }}>/</span>&nbsp;<span style={{ color: "#0f172a" }}>Users</span>





                  </p>





                </div>





                <button onClick={handleOpenAddUser}





                  style={{ display: "flex", alignItems: "center", gap: "8px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontWeight: "600", fontSize: "14px", cursor: "pointer", boxShadow: "0 1px 3px rgba(37,99,235,0.4)" }}>





                  + Add User





                </button>





              </div>











              {/* Stat Cards */}





              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "24px" }}>





                {[





                  { label: "Total Users", value: userStats.total, sub: "All users", subColor: "#64748b", iconBg: "#ede9fe", iconColor: "#7c3aed", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },





                  { label: "Active Users", value: userStats.active, sub: "✓ Active", subColor: "#22c55e", iconBg: "#f0fdf4", iconColor: "#22c55e", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },





                  { label: "Inactive Users", value: userStats.inactive, sub: "××→ Inactive", subColor: "#f59e0b", iconBg: "#fffbeb", iconColor: "#f59e0b", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },





                ].map((s) => (





                  <div key={s.label} style={{ background: "#fff", borderRadius: "12px", padding: "20px 24px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>





                    <div>





                      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "10px", fontWeight: "500" }}>{s.label}</p>





                      <p style={{ fontSize: "34px", fontWeight: "800", color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{s.value}</p>





                      <p style={{ color: s.subColor, fontSize: "13px", marginTop: "10px", fontWeight: "500" }}>{s.sub}</p>





                    </div>





                    <div style={{ width: "50px", height: "50px", background: s.iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: s.iconColor, flexShrink: 0 }}>{s.icon}</div>





                  </div>





                ))}





              </div>











              {companyUsersError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", marginBottom: "12px", fontSize: "14px" }}>×▸××→-+→→× {companyUsersError}</div>}











              {/* Users Table */}





              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>





                  <h2 style={{ fontSize: "17px", fontWeight: "700", color: "#0f172a" }}>Users List</h2>





                </div>





                <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>





                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>





                    <span style={{ color: "#64748b", fontSize: "14px" }}>Show</span>





                    <select value={userTableEntries} onChange={(e) => { setUserTableEntries(Number(e.target.value)); setUserTablePage(0); }}





                      style={{ padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "14px", background: "#fff" }}>





                      {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}





                    </select>





                    <span style={{ color: "#64748b", fontSize: "14px" }}>entries</span>





                  </div>





                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>





                    <span style={{ color: "#64748b", fontSize: "14px" }}>Search:</span>





                    <input value={userTableSearch} onChange={(e) => { setUserTableSearch(e.target.value); setUserTablePage(0); }}





                      style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "14px", width: "200px", outline: "none" }} />





                  </div>





                </div>





                <div style={{ overflowX: "auto" }}>





                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>





                    <thead>

                      <tr>

                        <UserTH field="sno" sortable={false}>S.No</UserTH>





                        <UserTH field="email">Email</UserTH>





                        <UserTH field="phone">Phone</UserTH>





                        <UserTH field="designation">Designation</UserTH>





                        <UserTH field="role">Role</UserTH>





                        <UserTH field="status">Status</UserTH>





                        <UserTH field="action" sortable={false}>Action</UserTH>





                      </tr>





                    </thead>





                    <tbody>





                      {companyUsersLoading ? (





                        <tr><td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>Loading...</td></tr>





                      ) : pagedUsers.length === 0 ? (





                        <tr><td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No users yet. Click "+ Add User" to add the first admin.</td></tr>





                      ) : pagedUsers.map((u, idx) => {





                        const statusLower = (u.status || "Active").toLowerCase();





                        const initials = (u.fullName || "U").slice(0, 1).toUpperCase();





                        return (





                          <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>





                            <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: "600" }}>{startIndex + idx + 1}</td>





                            <td style={{ padding: "14px 16px" }}>





                              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>





                                <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", color: "#7c3aed", fontWeight: "700", fontSize: "15px", flexShrink: 0 }}>{initials}</div>





                                <span style={{ fontWeight: "600", color: "#0f172a" }}>{u.fullName}</span>





                              </div>





                            </td>





                            <td style={{ padding: "14px 16px" }}>





                              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "13px" }}>





                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>





                                {u.email}





                              </div>





                            </td>





                            <td style={{ padding: "14px 16px", color: "#475569", fontSize: "13px" }}>{u.phone || "-"}</td>





                            <td style={{ padding: "14px 16px", color: "#475569", fontSize: "13px" }}>{u.designation || "-"}</td>





                            <td style={{ padding: "14px 16px" }}>





                              <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: u.role === "admin" ? "#ede9fe" : u.role === "supervisor" ? "#fef3c7" : u.role === "technician" ? "#ecfeff" : "#f1f5f9", color: u.role === "admin" ? "#7c3aed" : u.role === "supervisor" ? "#d97706" : u.role === "technician" ? "#0891b2" : "#475569", textTransform: "capitalize" }}>





                                {u.role || "employee"}





                              </span>





                            </td>





                            <td style={{ padding: "14px 16px" }}>





                              <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", background: statusLower === "active" ? "#f0fdf4" : "#fffbeb", color: statusLower === "active" ? "#16a34a" : "#d97706" }}>{u.status || "Active"}</span>





                            </td>





                            <td style={{ padding: "14px 16px" }}>





                              <div style={{ display: "flex", gap: "5px" }}>





                                <button title="Edit" onClick={() => handleOpenEditUser(u)} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef9c3", color: "#ca8a04", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>





                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>





                                </button>





                                <button title="Delete" onClick={() => handleDeleteCompanyUser(u.id)} style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fee2e2", color: "#dc2626", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>





                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>





                                </button>





                              </div>





                            </td>





                          </tr>





                        );





                      })}





                    </tbody>





                  </table>





                </div>





                <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>





                  <span style={{ color: "#64748b", fontSize: "13px" }}>





                    {sortedUsers.length === 0 ? "No entries" : `Showing ${startIndex + 1} to ${Math.min(startIndex + userTableEntries, sortedUsers.length)} of ${sortedUsers.length} entries`}





                  </span>





                  <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>





                    <button onClick={() => setUserTablePage((p) => Math.max(0, p - 1))} disabled={userTablePage === 0}





                      style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: userTablePage === 0 ? "not-allowed" : "pointer", color: userTablePage === 0 ? "#cbd5e1" : "#475569", fontSize: "13px", fontWeight: "500" }}>Previous</button>





                    <span style={{ padding: "6px 12px", background: "#2563eb", color: "#fff", borderRadius: "6px", fontSize: "13px", fontWeight: "600", minWidth: "34px", textAlign: "center" }}>{userTablePage + 1}</span>





                    <button onClick={() => setUserTablePage((p) => Math.min(totalPages - 1, p + 1))} disabled={userTablePage >= totalPages - 1}





                      style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: userTablePage >= totalPages - 1 ? "not-allowed" : "pointer", color: userTablePage >= totalPages - 1 ? "#cbd5e1" : "#475569", fontSize: "13px", fontWeight: "500" }}>Next</button>





                  </div>





                </div>





              </div>











              {/* Add / Edit User Modal */}





              {showAddUserModal && (





                <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setShowAddUserModal(false)}>





                  <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "480px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>





                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>





                      <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a" }}>{editUserId ? "Edit User" : "Add User"}</h2>





                      <button onClick={() => setShowAddUserModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>×</button>





                    </div>





                    {userFormError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", marginBottom: "14px", fontSize: "13.5px" }}>×▸××→-+→→× {userFormError}</div>}





                    <form onSubmit={handleSubmitUser}>





                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>





                        <div style={{ gridColumn: "span 2" }}>





                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Full Name<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span></label>





                          <input name="fullName" value={userForm.fullName} onChange={handleUserFormChange} className="form-input" placeholder="Full Name" required style={{ width: "100%" }} />





                        </div>





                        <div style={{ gridColumn: "span 2" }}>





                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Email<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span></label>





                          <input name="email" type="email" value={userForm.email} onChange={handleUserFormChange} className="form-input" placeholder="email@example.com" required style={{ width: "100%" }} />





                        </div>





                        <div>





                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Phone</label>





                          <input name="phone" value={userForm.phone} onChange={handleUserFormChange} className="form-input" placeholder="Phone number" style={{ width: "100%" }} />





                        </div>





                        <div>





                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Designation</label>





                          <input name="designation" value={userForm.designation} onChange={handleUserFormChange} className="form-input" placeholder="e.g. Manager" style={{ width: "100%" }} />





                        </div>





                        <div>





                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Role<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span></label>





                          <select name="role" value={userForm.role} onChange={handleUserFormChange} className="form-select" style={{ width: "100%" }}>





                            <option value="admin">Admin</option>





                            <option value="supervisor">Supervisor</option>





                            <option value="technician">Technician</option>





                            <option value="cleaner">Cleaner</option>





                            <option value="security">Security</option>





                            <option value="driver">Driver</option>





                            <option value="fleet_operator">Fleet Operator</option>





                            <option value="employee">Employee</option>





                            <option value="doctor">Doctor (HC)</option>





                            <option value="nurse">Nurse (HC)</option>





                            <option value="ward_boy">Ward Boy (HC)</option>





                            <option value="engineer">Engineer (HC)</option>





                          </select>





                        </div>





                        <div>





                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Status</label>





                          <select name="status" value={userForm.status} onChange={handleUserFormChange} className="form-select" style={{ width: "100%" }}>





                            <option value="Active">Active</option>





                            <option value="Inactive">Inactive</option>





                          </select>





                        </div>





                        <div>





                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>





                            Username <span style={{ color: "#94a3b8", fontWeight: "400" }}>(for mobile login)</span>





                          </label>





                          <input name="username" value={userForm.username} onChange={handleUserFormChange} className="form-input" placeholder="e.g. john.doe" style={{ width: "100%" }} />





                        </div>





                        <div>





                          <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "5px" }}>Password{!editUserId && <span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>}{editUserId && <span style={{ color: "#94a3b8", fontWeight: "400", marginLeft: "4px" }}>(leave blank to keep)</span>}</label>





                          <input name="password" type="password" value={userForm.password} onChange={handleUserFormChange} className="form-input" placeholder={editUserId ? "Leave blank to keep" : "Min 8 characters"} style={{ width: "100%" }} />





                        </div>





                      </div>





                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" }}>





                        <button type="button" onClick={() => setShowAddUserModal(false)} className="btn-cancel">Cancel</button>





                        <button type="submit" className="btn-submit" disabled={userFormLoading}>{userFormLoading ? "Saving..." : (editUserId ? "Save Changes" : "Add User")}</button>





                      </div>





                    </form>





                  </div>





                </div>





              )}











              {/* ×××××× Company Data Overview ×××××× */}





              <div style={{ marginTop: "32px" }}>





                <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>





                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>





                  Data Overview





                </h2>











                {overviewLoading ? (





                  <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>Loading overview...</div>





                ) : !companyOverview ? (





                  <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>No data available.</div>





                ) : (() => {





                  const ov = companyOverview;





                  const FREQ_COLORS = { daily: ["#dcfce7","#16a34a"], weekly: ["#dbeafe","#1d4ed8"], monthly: ["#fef9c3","#ca8a04"], quarterly: ["#ede9fe","#7c3aed"], half_yearly: ["#fce7f3","#be185d"], yearly: ["#ffedd5","#c2410c"] };





                  const freqLabel = { daily:"Daily", weekly:"Weekly", monthly:"Monthly", quarterly:"Quarterly", half_yearly:"Half-Yearly", yearly:"Yearly" };





                  return (





                    <>





                      {/* Stat cards */}





                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "24px" }}>





                        {[





                          { label: "Assets", value: ov.assets?.length ?? 0, iconBg: "#eff6ff", iconColor: "#2563eb", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },





                          { label: "Departments", value: ov.departments?.length ?? 0, iconBg: "#f0fdf4", iconColor: "#16a34a", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },





                          { label: "Logsheet Templates", value: ov.logsheets?.length ?? 0, iconBg: "#ede9fe", iconColor: "#7c3aed", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> },





                          { label: "Checklist Templates", value: ov.checklists?.length ?? 0, iconBg: "#fef3c7", iconColor: "#d97706", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg> },





                        ].map((s) => (





                          <div key={s.label} style={{ background: "#fff", borderRadius: "12px", padding: "18px 20px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>





                            <div>



                            <div style={{ gridColumn: "span 2" }}>



                              <label style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#475569", marginBottom: "7px" }}>Tab Access (User-wise)</label>



                              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "8px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "10px" }}>



                                {portalTabModules.map((m) => {



                                  const checked = Array.isArray(userForm.moduleAccess) && userForm.moduleAccess.includes(m.key);



                                  return (



                                    <label key={m.key} style={{ display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#334155", fontSize: "13px", fontWeight: 500 }}>



                                      <input type="checkbox" checked={checked} onChange={() => handleUserModuleAccessToggle(m.key)} style={{ width: "14px", height: "14px", accentColor: "#2563eb", cursor: "pointer" }} />



                                      {m.label}



                                    </label>



                                  );



                                })}



                              </div>



                              <p style={{ margin: "6px 0 0", fontSize: "11.5px", color: "#64748b" }}>Only selected tabs will be visible in the company portal for this user.</p>



                            </div>





                              <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "6px", fontWeight: "500" }}>{s.label}</p>





                              <p style={{ fontSize: "30px", fontWeight: "800", color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{s.value}</p>





                            </div>





                            <div style={{ width: "44px", height: "44px", background: s.iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: s.iconColor, flexShrink: 0 }}>{s.icon}</div>





                          </div>





                        ))}





                      </div>











                      {/* Assets table */}





                      {ov.assets?.length > 0 && (





                        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "20px" }}>





                          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>





                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>





                            <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>Assets ({ov.assets.length})</h3>





                          </div>





                          <div style={{ overflowX: "auto" }}>





                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>





                              <thead>





                                <tr style={{ background: "#f8fafc" }}>





                                  {["#","Asset Name","Asset Type","Model","Department","Status"].map((h) => (





                                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>





                                  ))}





                                </tr>





                              </thead>





                              <tbody>





                                {ov.assets.map((a, i) => (





                                  <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>





                                    <td style={{ padding: "10px 16px", color: "#94a3b8", fontWeight: "600" }}>{i + 1}</td>





                                    <td style={{ padding: "10px 16px", fontWeight: "600", color: "#0f172a" }}>{a.asset_name || a.assetName}</td>





                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{a.asset_type || a.assetType || "-"}</td>





                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{a.asset_model || a.assetModel || "-"}</td>





                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{a.department_name || a.departmentName || "-"}</td>





                                    <td style={{ padding: "10px 16px" }}>





                                      <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: (a.status || "active").toLowerCase() === "active" ? "#f0fdf4" : "#f1f5f9", color: (a.status || "active").toLowerCase() === "active" ? "#16a34a" : "#64748b" }}>





                                        {a.status || "Active"}





                                      </span>





                                    </td>





                                  </tr>





                                ))}





                              </tbody>





                            </table>





                          </div>





                        </div>





                      )}











                      {/* Logsheet templates table */}





                      {ov.logsheets?.length > 0 && (





                        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", marginBottom: "20px" }}>





                          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>





                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>





                            <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>Logsheet Templates ({ov.logsheets.length})</h3>





                          </div>





                          <div style={{ overflowX: "auto" }}>





                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>





                              <thead>





                                <tr style={{ background: "#f8fafc" }}>





                                  {["#","Template Name","Asset","Frequency","Log Entries","Asset Type"].map((h) => (





                                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>





                                  ))}





                                </tr>





                              </thead>





                              <tbody>





                                {ov.logsheets.map((t, i) => {





                                  const freq = t.frequency || "daily";





                                  const [fbg, ftx] = FREQ_COLORS[freq] || ["#f1f5f9","#475569"];





                                  return (





                                    <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9" }}>





                                      <td style={{ padding: "10px 16px", color: "#94a3b8", fontWeight: "600" }}>{i + 1}</td>





                                      <td style={{ padding: "10px 16px", fontWeight: "600", color: "#0f172a" }}>{t.template_name || t.templateName}</td>





                                      <td style={{ padding: "10px 16px", color: "#475569" }}>{t.asset_name || t.assetName || "-"}</td>





                                      <td style={{ padding: "10px 16px" }}>





                                        <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: fbg, color: ftx }}>{freqLabel[freq] || freq}</span>





                                      </td>





                                      <td style={{ padding: "10px 16px", color: "#475569" }}>{t.entryCount ?? t.entry_count ?? 0}</td>





                                      <td style={{ padding: "10px 16px", color: "#475569" }}>{t.asset_type || t.assetType || "-"}</td>





                                    </tr>





                                  );





                                })}





                              </tbody>





                            </table>





                          </div>





                        </div>





                      )}











                      {/* Checklist templates table */}





                      {ov.checklists?.length > 0 && (





                        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>





                          <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: "8px" }}>





                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>





                            <h3 style={{ fontSize: "15px", fontWeight: "700", color: "#0f172a" }}>Checklist Templates ({ov.checklists.length})</h3>





                          </div>





                          <div style={{ overflowX: "auto" }}>





                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>





                              <thead>





                                <tr style={{ background: "#f8fafc" }}>





                                  {["#","Template Name","Asset Type","Questions","Status"].map((h) => (





                                    <th key={h} style={{ padding: "10px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>





                                  ))}





                                </tr>





                              </thead>





                              <tbody>





                                {ov.checklists.map((c, i) => (





                                  <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>





                                    <td style={{ padding: "10px 16px", color: "#94a3b8", fontWeight: "600" }}>{i + 1}</td>





                                    <td style={{ padding: "10px 16px", fontWeight: "600", color: "#0f172a" }}>{c.template_name || c.templateName}</td>





                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{c.asset_type || c.assetType || "-"}</td>





                                    <td style={{ padding: "10px 16px", color: "#475569" }}>{c.questionCount ?? c.question_count ?? 0}</td>





                                    <td style={{ padding: "10px 16px" }}>





                                      <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: (c.status || "active").toLowerCase() === "active" ? "#f0fdf4" : "#f1f5f9", color: (c.status || "active").toLowerCase() === "active" ? "#16a34a" : "#64748b" }}>





                                        {c.status || "Active"}





                                      </span>





                                    </td>





                                  </tr>





                                ))}





                              </tbody>





                            </table>





                          </div>





                        </div>





                      )}











                      {ov.assets?.length === 0 && ov.logsheets?.length === 0 && ov.checklists?.length === 0 && (





                        <div style={{ padding: "32px", textAlign: "center", color: "#94a3b8", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "14px" }}>





                          This company has no assets, logsheet templates, or checklist templates yet.





                        </div>





                      )}





                    </>





                  );





                })()}





              </div>











            </>





          );





        })()}











        {nav === "companies" && !showAddForm && !adminCompanyId && (() => {





          const ABtns = ({ bg, col, title, onClick, children }) => (





            <button title={title} onClick={onClick} style={{ width: "30px", height: "30px", borderRadius: "6px", background: bg, color: col, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{children}</button>





          );





          const SortIcon = ({ field }) => (





            <span style={{ color: sortField === field ? "#2563eb" : "#94a3b8", fontSize: "11px", marginLeft: "4px" }}>





              {sortField === field ? (sortDir === "asc" ? "▾" : "▲") : "▾"}





            </span>





          );





          const TH = ({ field, children, sortable = true }) => (





            <th onClick={sortable ? () => toggleSort(field) : undefined}





              style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", cursor: sortable ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none" }}>





              {children}{sortable && <SortIcon field={field} />}





            </th>





          );





          return (





            <>





              {/* ×××××× Header ×××××× */}





              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>





                <div>





                  <h1 style={{ fontSize: "26px", fontWeight: "800", color: "#0f172a", marginBottom: "4px", letterSpacing: "-0.5px" }}>Company Management</h1>





                  <p style={{ color: "#64748b", fontSize: "14px" }}>Manage your client companies and their configurations</p>





                </div>





                <button type="button" onClick={() => { setSelectedSectors([]); setShowSectorModal(true); }}





                  style={{ display: "flex", alignItems: "center", gap: "8px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", fontWeight: "600", fontSize: "14px", cursor: "pointer", boxShadow: "0 1px 3px rgba(37,99,235,0.4)" }}>





                  + Add Customer





                </button>





              </div>











              {/* ×××××× Stat Cards ×××××× */}





              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>





                {[





                  { label: "Total Companies", value: companyStats.total, sub: "All registered companies", subColor: "#64748b", iconBg: "#eff6ff", iconColor: "#2563eb", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg> },





                  { label: "Active Companies", value: companyStats.active, sub: "✓ Active", subColor: "#22c55e", iconBg: "#f0fdf4", iconColor: "#22c55e", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },





                  { label: "Total Employees", value: companyStats.totalEmployees, sub: "Across all companies", subColor: "#64748b", iconBg: "#eff6ff", iconColor: "#2563eb", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },





                  { label: "Inactive Companies", value: companyStats.inactive, sub: "××→ Inactive", subColor: "#f59e0b", iconBg: "#fffbeb", iconColor: "#f59e0b", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> },





                ].map((s) => (





                  <div key={s.label} style={{ background: "#fff", borderRadius: "12px", padding: "20px 24px", border: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>





                    <div>





                      <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "10px", fontWeight: "500" }}>{s.label}</p>





                      <p style={{ fontSize: "34px", fontWeight: "800", color: "#0f172a", lineHeight: 1, letterSpacing: "-1px" }}>{s.value}</p>





                      <p style={{ color: s.subColor, fontSize: "13px", marginTop: "10px", fontWeight: "500" }}>{s.sub}</p>





                    </div>





                    <div style={{ width: "50px", height: "50px", background: s.iconBg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: s.iconColor, flexShrink: 0 }}>{s.icon}</div>





                  </div>





                ))}





              </div>











              {/* ×××××× Companies Table Card ×××××× */}





              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>





                  <h2 style={{ fontSize: "17px", fontWeight: "700", color: "#0f172a" }}>Companies List</h2>





                </div>





                <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>





                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>





                    <span style={{ color: "#64748b", fontSize: "14px" }}>Show</span>





                    <select value={tableEntries} onChange={(e) => { setTableEntries(Number(e.target.value)); setTablePage(0); }}





                      style={{ padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "14px", background: "#fff" }}>





                      {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}





                    </select>





                    <span style={{ color: "#64748b", fontSize: "14px" }}>entries</span>





                  </div>





                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>





                    <span style={{ color: "#64748b", fontSize: "14px" }}>Search:</span>





                    <input value={tableSearch} onChange={(e) => { setTableSearch(e.target.value); setTablePage(0); }}





                      style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "6px", fontSize: "14px", width: "200px", outline: "none" }} />





                  </div>





                </div>











                <div style={{ overflowX: "auto" }}>





                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>





                    <thead>





                      <tr>





                        <TH field="sno" sortable={false}>S.No</TH>





                        <TH field="companyName">Company</TH>





                        <TH field="contact" sortable={false}>Contact</TH>





                        <TH field="city">Location</TH>





                        <TH field="modules" sortable={false}>Modules</TH>





                        <TH field="stats" sortable={false}>Stats</TH>





                        <TH field="status">Status</TH>





                        <TH field="actions" sortable={false}>Action</TH>





                      </tr>





                    </thead>





                    <tbody>





                      {pagedCompanies.length === 0 ? (





                        <tr><td colSpan="8" style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>





                          {companyLoading ? "Loading companies..." : "No companies found."}





                        </td></tr>





                      ) : (





                        pagedCompanies.map((c, idx) => {





                          const companyDepts = departments.filter((d) => String(d.companyId) === String(c.id));





                          const employeeCount = Number(c.employeeCount) || 0;





                          const modules = [c.qsrModule && "Asset Mgmt", c.premealModule && "FM Checklist", c.deliveryModule && "Fleet", c.allowGuestBooking && "OJT Training"].filter(Boolean);





                          const statusLower = (c.status || "Active").toLowerCase();





                          return (





                            <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>





                              <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: "600" }}>{tablePages.startIndex + idx + 1}</td>





                              <td style={{ padding: "14px 16px" }}>





                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>





                                  <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#4338ca", fontWeight: "700", fontSize: "14px", flexShrink: 0 }}>





                                    {c.companyName?.slice(0, 2).toUpperCase() || "CO"}





                                  </div>





                                  <div>





                                    <div style={{ fontWeight: "600", color: "#0f172a", fontSize: "14px" }}>{c.companyName}</div>





                                    <div style={{ color: "#94a3b8", fontSize: "12px" }}>{c.companyCode}</div>





                                  </div>





                                </div>





                              </td>





                              <td style={{ padding: "14px 16px" }}>





                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>





                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "13px" }}>





                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>





                                    {c.description?.slice(0, 18) || "-"}





                                  </div>





                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#94a3b8", fontSize: "13px" }}>





                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.14 11.93A19.75 19.75 0 0 1 1.09 3.21a2 2 0 0 1 1.76-2.18h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.61 8.18a16 16 0 0 0 7.18 7.18l.82-.82a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>





                                    {c.pincode || "-"}





                                  </div>





                                </div>





                              </td>





                              <td style={{ padding: "14px 16px" }}>





                                <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#475569", fontSize: "13px" }}>





                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>





                                  {[c.city, c.state].filter(Boolean).join(", ") || "-"}





                                </div>





                              </td>





                              <td style={{ padding: "14px 16px" }}>





                                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>





                                  {modules.length === 0 ? (





                                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>-</span>





                                  ) : modules.map((m) => (





                                    <span key={m} style={{ background: "#f1f5f9", color: "#475569", padding: "3px 8px", borderRadius: "4px", fontSize: "12px", fontWeight: "500" }}>{m}</span>





                                  ))}





                                </div>





                              </td>





                              <td style={{ padding: "14px 16px" }}>





                                <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", color: "#475569" }}>





                                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>





                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>





                                    {employeeCount} Employees





                                  </div>





                                  <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>





                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><line x1="12" y1="12" x2="5" y2="15"/><line x1="12" y1="12" x2="19" y2="15"/></svg>





                                    {companyDepts.length} Departments





                                  </div>





                                </div>





                              </td>





                              <td style={{ padding: "14px 16px" }}>





                                <span style={{ padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600", background: statusLower === "active" ? "#f0fdf4" : "#fffbeb", color: statusLower === "active" ? "#16a34a" : "#d97706" }}>





                                  {c.status || "Active"}





                                </span>





                              </td>





                              <td style={{ padding: "14px 16px" }}>





                                <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>





                                  <ABtns bg="#dbeafe" col="#2563eb" title="View Details" onClick={() => setViewCompanyId(c.id)}>





                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>





                                  </ABtns>





                                  <ABtns bg="#dbeafe" col="#2563eb" title="Departments" onClick={() => { setSelectedCompanyId(c.id); setNav("departments"); }}>





                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/><line x1="12" y1="12" x2="5" y2="15"/><line x1="12" y1="12" x2="19" y2="15"/></svg>





                                  </ABtns>





                                  <ABtns bg="#dcfce7" col="#16a34a" title="Checklists" onClick={() => { setSelectedCompanyId(c.id); setNav("checklists"); }}>





                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>





                                  </ABtns>





                                  <ABtns bg="#f3e8ff" col="#7c3aed" title="Add/View Users" onClick={() => { setEmpInitCompanyId(c.id); setNav("employees"); setShowAddForm(false); }}>





                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>





                                  </ABtns>





                                  <ABtns bg="#e0f2fe" col="#0284c7" title="Module Access" onClick={() => openModulesModal(c)}>





                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>





                                  </ABtns>





                                  <ABtns bg="#fdf4ff" col="#9333ea" title="Role Permissions" onClick={() => openRolePermsModal(c)}>





                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>





                                  </ABtns>





                                  <ABtns bg="#fef9c3" col="#ca8a04" title="Edit" onClick={() => openEditCompany(c)}>





                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>





                                  </ABtns>





                                  <ABtns bg="#fee2e2" col="#dc2626" title="Delete" onClick={() => handleDeleteCompany(c.id)}>





                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>





                                  </ABtns>





                                </div>





                              </td>





                            </tr>





                          );





                        })





                      )}





                    </tbody>





                  </table>





                </div>











                {/* Pagination Footer */}





                <div style={{ padding: "12px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>





                  <span style={{ color: "#64748b", fontSize: "13px" }}>





                    {tablePages.total === 0 ? "No entries" : `Showing ${tablePages.startIndex + 1} to ${Math.min(tablePages.startIndex + tableEntries, tablePages.total)} of ${tablePages.total} entries`}





                  </span>





                  <div style={{ display: "flex", gap: "4px" }}>





                    <button onClick={() => setTablePage((p) => Math.max(0, p - 1))} disabled={tablePage === 0}





                      style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: tablePage === 0 ? "not-allowed" : "pointer", color: tablePage === 0 ? "#cbd5e1" : "#475569", fontSize: "13px", fontWeight: "500" }}>Previous</button>





                    <button onClick={() => setTablePage((p) => Math.min(tablePages.totalPages - 1, p + 1))} disabled={tablePage >= tablePages.totalPages - 1}





                      style={{ padding: "6px 12px", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#fff", cursor: tablePage >= tablePages.totalPages - 1 ? "not-allowed" : "pointer", color: tablePage >= tablePages.totalPages - 1 ? "#cbd5e1" : "#475569", fontSize: "13px", fontWeight: "500" }}>Next</button>





                  </div>





                </div>





              </div>











              {/* ×××××× View Company Modal ×××××× */}





              {viewCompanyId && (() => {





                const vc = companies.find((c) => c.id === viewCompanyId);





                if (!vc) return null;





                return (





                  <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setViewCompanyId(null)}>





                    <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "580px", width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>





                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>





                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>





                          <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", color: "#4338ca", fontWeight: "700", fontSize: "16px" }}>{vc.companyName?.slice(0, 2).toUpperCase()}</div>





                          <div>





                            <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a" }}>{vc.companyName}</h2>





                            <span style={{ fontSize: "12px", color: "#94a3b8" }}>{vc.companyCode}</span>





                          </div>





                        </div>





                        <button onClick={() => setViewCompanyId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>×</button>





                      </div>





                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "14px" }}>





                        {[["Description", vc.description], ["City", vc.city], ["State", vc.state], ["Country", vc.country], ["Pincode", vc.pincode], ["GST Number", vc.gstNumber], ["PAN Number", vc.panNumber], ["CIN Number", vc.cinNumber], ["Billing Cycle", vc.billingCycle], ["Payment Terms", vc.paymentTermsDays ? `${vc.paymentTermsDays} days` : null], ["Max Employees", vc.maxEmployees || "Unlimited"], ["Status", vc.status || "Active"]].map(([label, val]) => (





                          <div key={label}>





                            <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "2px", fontWeight: "500" }}>{label}</div>





                            <div style={{ fontWeight: "600", color: "#0f172a" }}>{val || "-"}</div>





                          </div>





                        ))}





                      </div>





                      <div style={{ marginTop: "16px" }}>





                        <div style={{ color: "#94a3b8", fontSize: "12px", marginBottom: "6px", fontWeight: "500" }}>Modules</div>





                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>





                          {[vc.qsrModule && "QSR / Asset Mgmt", vc.premealModule && "FM e Checklist", vc.deliveryModule && "Fleet Management", vc.allowGuestBooking && "OJT Training"].filter(Boolean).map((m) => (





                            <span key={m} style={{ background: "#eff6ff", color: "#2563eb", padding: "4px 10px", borderRadius: "20px", fontSize: "12px", fontWeight: "600" }}>{m}</span>





                          ))}





                        </div>





                      </div>





                    </div>





                  </div>





                );





              })()}











              {/* ×××××× Edit Company Modal ×××××× */}





              {editCompanyId && (





                <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setEditCompanyId(null)}>





                  <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "700px", width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>





                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>





                      <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a" }}>Edit Company</h2>





                      <button onClick={() => setEditCompanyId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>×</button>





                    </div>





                    {editCompanyError && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "14px" }}>×▸××→-+→→× {editCompanyError}</div>}





                    <form onSubmit={handleUpdateCompany}>





                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>





                        <div className="form-group" style={{ gridColumn: "span 2" }}>





                          <label>Company Name</label>





                          <input name="companyName" value={editCompanyForm.companyName} onChange={handleEditCompanyChange} className="form-input" required />





                        </div>





                        <div className="form-group">





                          <label>Company Code</label>





                          <input name="companyCode" value={editCompanyForm.companyCode} onChange={handleEditCompanyChange} className="form-input" required />





                        </div>





                        <div className="form-group">





                          <label>Status</label>





                          <select name="status" value={editCompanyForm.status} onChange={handleEditCompanyChange} className="form-select">





                            <option value="Active">Active</option>





                            <option value="Inactive">Inactive</option>





                          </select>





                        </div>





                        <div className="form-group">





                          <label>City</label>





                          <input name="city" value={editCompanyForm.city} onChange={handleEditCompanyChange} className="form-input" />





                        </div>





                        <div className="form-group">





                          <label>State</label>





                          <select name="state" value={String(editCompanyForm.stateId ?? "")} onChange={handleEditStateChange} className="form-input">
                          <option value="">Select State</option>
                          {statesList.map(s => <option key={s.id} value={String(s.id)}>{s.state_name} ({s.state_code})</option>)}
                          </select>





                        </div>





                        <div className="form-group">





                          <label>Country</label>





                          <input name="country" value={editCompanyForm.country} onChange={handleEditCompanyChange} className="form-input" />





                        </div>





                        <div className="form-group">





                          <label>Pincode</label>





                          <input name="pincode" value={editCompanyForm.pincode} onChange={handleEditCompanyChange} className="form-input" />





                        </div>





                        <div className="form-group">





                          <label>GST Number</label>





                          <input name="gstNumber" value={editCompanyForm.gstNumber} onChange={handleEditCompanyChange} className="form-input" />





                        </div>





                        <div className="form-group">





                          <label>Billing Cycle</label>





                          <select name="billingCycle" value={editCompanyForm.billingCycle} onChange={handleEditCompanyChange} className="form-select">





                            <option value="Monthly">Monthly</option>





                            <option value="Quarterly">Quarterly</option>





                            <option value="Yearly">Yearly</option>





                          </select>





                        </div>





                        <div className="form-group">





                          <label>Max Employees</label>





                          <input type="number" name="maxEmployees" value={editCompanyForm.maxEmployees} onChange={handleEditCompanyChange} className="form-input" min="0" />





                        </div>





                        <div className="form-group" style={{ gridColumn: "span 2" }}>





                          <label>Description</label>





                          <input name="description" value={editCompanyForm.description} onChange={handleEditCompanyChange} className="form-input" />





                        </div>





                      </div>





                      <div style={{ marginTop: "16px" }}>





                        <label style={{ display: "block", color: "#475569", fontWeight: "600", fontSize: "13px", marginBottom: "10px" }}>Module Access</label>





                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>





                          {[["qsrModule", "QSR / Asset Management"], ["premealModule", "FM e Checklist"], ["deliveryModule", "Fleet Management"], ["allowGuestBooking", "OJT Training"]].map(([key, label]) => (





                            <label key={key} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", fontSize: "14px", color: "#475569" }}>





                              <input type="checkbox" name={key} checked={!!editCompanyForm[key]} onChange={handleEditCompanyChange} />





                              {label}





                            </label>





                          ))}





                        </div>





                      </div>





                      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "24px" }}>





                        <button type="button" onClick={() => setEditCompanyId(null)} className="btn-cancel">Cancel</button>





                        <button type="submit" className="btn-submit" disabled={editCompanyLoading}>{editCompanyLoading ? "Saving..." : "Save Changes"}</button>





                      </div>





                    </form>





                  </div>





                </div>





              )}











              {/* ×××××× Module Access Modal ×××××× */}





              {modulesModalId && (





                <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setModulesModalId(null)}>





                  <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "480px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>





                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>





                      <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a" }}>Module Access</h2>





                      <button onClick={() => setModulesModalId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>×</button>





                    </div>





                    <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Select which modules are visible in the company portal dashboard.</p>





                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "24px" }}>





                      {portalTabModules.map((m) => (





                        <label key={m.key} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: "8px", background: modulesForm.includes(m.key) ? "#eff6ff" : "#fff", transition: "background 0.15s" }}>





                          <input type="checkbox" checked={modulesForm.includes(m.key)} onChange={() => setModulesForm((prev) => prev.includes(m.key) ? prev.filter((k) => k !== m.key) : [...prev, m.key])} style={{ width: "16px", height: "16px", accentColor: "#2563eb" }} />





                          <span style={{ fontSize: "14px", fontWeight: "500", color: "#334155" }}>{m.label}</span>





                        </label>





                      ))}





                    </div>





                    <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>





                      <button type="button" onClick={() => setModulesModalId(null)} className="btn-cancel">Cancel</button>





                      <button type="button" onClick={handleSaveModules} className="btn-submit" disabled={modulesSaving}>{modulesSaving ? "Saving..." : "Save Access"}</button>





                    </div>





                  </div>





                </div>





              )}











              {/* ×××××× Role Permissions Modal ×××××× */}





              {rolePermsModalId && (





                <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={() => setRolePermsModalId(null)}>





                  <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "900px", width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>





                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>





                      <h2 style={{ fontSize: "18px", fontWeight: "700", color: "#0f172a" }}>Role Permissions</h2>





                      <button onClick={() => setRolePermsModalId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>×</button>





                    </div>





                    <p style={{ color: "#64748b", fontSize: "13px", marginBottom: "16px" }}>Configure Create / Read / Update / Delete permissions per role and company-portal tab.</p>





                    <div style={{ overflowX: "auto" }}>





                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>





                        <thead>





                          <tr style={{ background: "#f8fafc" }}>





                            <th style={{ padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: "700", minWidth: "130px" }}>Role</th>





                            {portalTabModules.map((m) => (





                              <th key={m.key} style={{ padding: "10px 8px", textAlign: "center", borderBottom: "2px solid #e2e8f0", color: "#475569", fontWeight: "700", minWidth: "90px" }}>





                                {m.label}





                                <div style={{ display: "flex", justifyContent: "center", gap: "2px", marginTop: "4px" }}>





                                  {["C","R","U","D"].map((op) => <span key={op} style={{ fontSize: "10px", color: "#94a3b8", width: "16px", textAlign: "center" }}>{op}</span>)}





                                </div>





                              </th>





                            ))}





                          </tr>





                        </thead>





                        <tbody>





                          {ALL_ROLES.filter((r) => rolePermsActiveRoles.includes(r)).map((role, ri) => (





                            <tr key={role} style={{ background: ri % 2 === 0 ? "#fff" : "#f8fafc" }}>





                              <td style={{ padding: "8px 12px", borderBottom: "1px solid #e2e8f0", color: "#334155", fontWeight: "600", textTransform: "capitalize" }}>





                                {role.replace(/_/g, " ")}





                              </td>





                              {portalTabModules.map((m) => {





                                const perms = (rolePermsData[role] || {})[m.key] || {};





                                return (





                                  <td key={m.key} style={{ padding: "8px", borderBottom: "1px solid #e2e8f0", textAlign: "center" }}>





                                    <div style={{ display: "flex", justifyContent: "center", gap: "2px" }}>





                                      {[["c","create"],["r","read"],["u","update"],["d","delete"]].map(([op, label]) => (





                                        <input key={op} type="checkbox" title={label} checked={!!perms[op]} onChange={() => handleRolePermChange(role, m.key, op)}





                                          style={{ width: "14px", height: "14px", cursor: "pointer", accentColor: "#2563eb" }} />





                                      ))}





                                    </div>





                                  </td>





                                );





                              })}





                            </tr>





                          ))}





                        </tbody>





                      </table>





                    </div>





                    <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "24px" }}>





                      <button type="button" onClick={() => setRolePermsModalId(null)} className="btn-cancel">Cancel</button>





                      <button type="button" onClick={handleSaveRolePerms} className="btn-submit" disabled={rolePermsSaving}>{rolePermsSaving ? "Saving..." : "Save Permissions"}</button>





                    </div>





                  </div>





                </div>





              )}





            </>





          );





        })()}











        {companyError && (





          <div style={{ background: "#3b0e0e", color: "#f87171", padding: "10px 14px", borderRadius: "6px", marginBottom: "12px", fontSize: "14px" }}>





            ×▸××→-+→→× {companyError}





          </div>





        )}











        {assetError && nav === "assets" && (





          <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", marginBottom: "12px", fontSize: "14px", border: "1px solid #fecaca" }}>





            ×▸××→-+→→× {assetError}





          </div>





        )}

















        {nav === "assets" && (() => {





          const assetTotalCount = assets.length;





          const assetActiveCount = assets.filter((a) => (a.status || "Active").toLowerCase() === "active").length;





          const assetInactiveCount = assetTotalCount - assetActiveCount;





          const assetTypesCount = assetTypes.length || 3;





          const sortedAssets = [...filteredAssets].sort((a, b) => {





            let av = a[assetSortField] || ""; let bv = b[assetSortField] || "";





            if (typeof av === "string") av = av.toLowerCase(); if (typeof bv === "string") bv = bv.toLowerCase();





            if (av < bv) return assetSortDir === "asc" ? -1 : 1;





            if (av > bv) return assetSortDir === "asc" ? 1 : -1;





            return 0;





          });





          const assetTotalPages = Math.max(1, Math.ceil(sortedAssets.length / assetTableEntries));





          const assetStartIndex = assetTablePage * assetTableEntries;





          const pagedAssets = sortedAssets.slice(assetStartIndex, assetStartIndex + assetTableEntries);





          const toggleAssetSort = (f) => {





            if (assetSortField === f) setAssetSortDir((d) => (d === "asc" ? "desc" : "asc"));





            else { setAssetSortField(f); setAssetSortDir("asc"); }





            setAssetTablePage(0);





          };





          const ATH = ({ field, children, sortable = true }) => (





            <th onClick={sortable ? () => toggleAssetSort(field) : undefined}





              style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: "600", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", cursor: sortable ? "pointer" : "default", whiteSpace: "nowrap", userSelect: "none" }}>





              {children}{sortable && <span style={{ color: assetSortField === field ? "#2563eb" : "#94a3b8", fontSize: "11px", marginLeft: "4px" }}>{assetSortField === field ? (assetSortDir === "asc" ? "▾" : "▸") : "▾"}</span>}





            </th>





          );





          return (





            <>





              {/* Header */}





              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>





                <div>





                  <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Asset Management</h1>





                  <p style={{ color: "#64748b", fontSize: "13.5px" }}>Manage assets across Soft, Technical, and Fleet categories.</p>





                </div>





                <button type="button"





                  onClick={() => { const defaultCompany = selectedCompanyId || companies[0]?.id || ""; const sectorTypes = getCompanySectorTypes(defaultCompany); const defaultAssetType = sectorTypes?.length === 1 ? sectorTypes[0].code : (sectorTypes?.[0]?.code || assetTypes[0]?.code || ""); setAssetForm({ ...emptyAsset, companyId: defaultCompany, assetType: defaultAssetType }); setEditingAssetId(null); setShowAssetModal(true); setLocFloors([]); setLocDepts([]); setLocRooms([]); if (defaultCompany) { fetch(`/api/locations/buildings?companyId=${defaultCompany}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(d => setLocBuildings(Array.isArray(d) ? d : [])).catch(() => setLocBuildings([])); } else { setLocBuildings([]); } }}





                  disabled={!companies.length}





                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 13px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: companies.length ? "pointer" : "not-allowed", border: "none", background: companies.length ? "#2563eb" : "#94a3b8", color: "#fff", opacity: companies.length ? 1 : 0.6 }}>





                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>





                  Add Asset





                </button>





                <button type="button"





                  onClick={() => { setBulkImportFile(null); setBulkImportDeptId(""); setBulkImportResult(null); setShowBulkImport(true); }}





                  disabled={!companies.length}





                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 13px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: companies.length ? "pointer" : "not-allowed", border: "1.5px solid #2563eb", background: "#eff6ff", color: "#2563eb", opacity: companies.length ? 1 : 0.6 }}>





                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>





                  Import Excel





                </button>





                <button type="button"





                  onClick={handleDeleteAllAssets}





                  disabled={!assets.length}





                  title="Permanently delete ALL assets for this company"





                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: assets.length ? "pointer" : "not-allowed", border: "1.5px solid #ef4444", background: "#fef2f2", color: "#ef4444", opacity: assets.length ? 1 : 0.5 }}>





                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>





                  Delete All Assets





                </button>





              </div>





              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>





                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>





                  <div>





                    <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", lineHeight: 1.3 }}>Asset List</p>





                    <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>{filteredAssets.length} assets</p>





                  </div>





                  <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
                    <select value={assetTypeFilter} onChange={(e) => setAssetTypeFilter(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12.5px", background: "#fff", outline: "none" }}>
                      <option value="all">All Types</option>
                      {(assetTypes.length ? assetTypes : [{ code: "soft", label: "Soft" }, { code: "technical", label: "Technical" }, { code: "fleet", label: "Fleet" }]).map((t) => (
                        <option key={t.code} value={t.code}>{t.label}</option>
                      ))}
                    </select>
                    <select value={assetStatusFilter} onChange={(e) => setAssetStatusFilter(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12.5px", background: "#fff", outline: "none" }}>
                      <option value="all">All Status</option>
                      <option value="unverified">Unverified</option>
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="Verified">Verified</option>
                    </select>
                    <select value={assetCompanyFilter} onChange={(e) => { setAssetCompanyFilter(e.target.value); }} style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12.5px", background: "#fff", outline: "none", maxWidth: "180px" }}>
                      <option value="">All Companies</option>
                      {companies.map((c) => (
                        <option key={c.id} value={String(c.id)}>{c.companyName || c.name}</option>
                      ))}
                    </select>
                    <input value={assetSearch} onChange={(e) => setAssetSearch(e.target.value)} placeholder="Search..." style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12.5px", outline: "none", width: "140px" }} />
                    {selectedAssetIds.length > 0 && (
                      <>
                        <button type="button" onClick={handleBulkVerifyAssets} style={{ padding: "6px 12px", borderRadius: "7px", border: "none", background: "#22c55e", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Verify ({selectedAssetIds.length})</button>
                        <button type="button" onClick={handleBulkDeleteAssets} style={{ padding: "6px 12px", borderRadius: "7px", border: "none", background: "#ef4444", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>Delete ({selectedAssetIds.length})</button>
                        <button type="button" onClick={() => setSelectedAssetIds([])} style={{ padding: "6px 10px", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", fontSize: "12px", cursor: "pointer" }}>Clear</button>
                      </>
                    )}
                  </div>





                </div>





                {assetLoading ? (





                  <p style={{ padding: "24px", color: "#94a3b8", textAlign: "center" }}>Loading...</p>





                ) : (





                  <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "65vh" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "2000px" }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr>
                        <th style={{ padding: "10px 8px", background: "#f1f5f9", borderBottom: "2px solid #e2e8f0" }}>
                          <input type="checkbox" onChange={e => setSelectedAssetIds(e.target.checked ? filteredAssets.map(a => a.id) : [])} checked={filteredAssets.length > 0 && selectedAssetIds.length === filteredAssets.length} />
                        </th>
                        {["SN", "Asset ID", "Company", "Equipment Name", "Make", "Model", "Sr. No.", "Accessories", "Department", "Maintenance", "Dealer / Distributor", "Mfg. Year", "Installation Date", "Invoice No.", "Purchase Date", "Purchase Cost", "RBER", "Remarks", "Status", "Actions"].map((h) => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", background: "#f1f5f9", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAssets.length === 0
                        ? <tr><td colSpan={21} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>{assetLoading ? "Loading..." : "No assets found."}</td></tr>
                        : filteredAssets.map((a, i) => {
                          const m = a.metadata || {};
                          const maint = [
                            (m.warranty?.enabled || m.maintenanceTypes?.warranty) && "Warranty",
                            (m.amc?.enabled || m.maintenanceTypes?.amc) && "AMC",
                            (m.cmc?.enabled || m.maintenanceTypes?.cmc) && "CMC",
                            (m.inHouse || m.maintenanceTypes?.inHouse) && "In House",
                            (m.catalyst || m.maintenanceTypes?.catalyst) && "Catalyst",
                          ].filter(Boolean).join(", ") || m.maintenanceType || "-";
                          const ws   = a.workingStatus || a.working_status || m.workingStatus || "Working";
                          const crit = a.criticality || m.criticality || "Non_Critical";
                          const st   = a.status || "Active";
                          const combined = st === "Inactive" ? "Inactive"
                            : ((Number(a.verified) === 1) || st === "Verified") ? "Verified"
                            : ws === "Condemned" ? "Condemned"
                            : m.rber ? "RBER"
                            : ws === "Not_Working" ? "Not_Working"
                            : ws === "WIP" ? "WIP"
                            : crit === "Critical" ? "Critical"
                            : "Active";
                          const COLOR_MAP = {
                            Active:      { bg: "#f0fdf4", color: "#16a34a" },
                            Inactive:    { bg: "#f8fafc", color: "#94a3b8" },
                            Verified:    { bg: "#dbeafe", color: "#1d4ed8" },
                            WIP:         { bg: "#fef9c3", color: "#92400e" },
                            Not_Working: { bg: "#fef2f2", color: "#dc2626" },
                            Critical:    { bg: "#fce7f3", color: "#9d174d" },
                            RBER:        { bg: "#fff7ed", color: "#ea580c" },
                            Condemned:   { bg: "#f5f3ff", color: "#7c3aed" },
                          };
                          const cm = COLOR_MAP[combined] || COLOR_MAP.Active;
                          return (
                            <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9", background: selectedAssetIds.includes(a.id) ? "#f0f9ff" : undefined }}>
                              <td style={{ padding: "8px 14px" }}>
                                <input type="checkbox" checked={selectedAssetIds.includes(a.id)} onChange={e => setSelectedAssetIds(prev => e.target.checked ? [...prev, a.id] : prev.filter(id => id !== a.id))} />
                              </td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{i + 1}</td>
                              <td style={{ padding: "10px 14px", color: "#1e40af", fontFamily: "monospace", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", textDecoration: "underline" }} title="Click to open asset details in new window" onClick={() => window.open(`/company/asset/${a.id}`, '_blank')}>{a.generatedAssetId || a.id}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{a.companyName || "-"}</td>
                              <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }} title="Click to view asset details" onClick={() => setViewingAsset(a)}>{m.equipmentName || a.assetName || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.make || m.manufacturer || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.model || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{m.serialNo || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>{m.accessories || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{a.departmentName || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{maint}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.dealer || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{m.mfgYear || m.manufacturingYear || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.installationDate || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{m.invoiceNo || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.purchaseDate || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{m.purchaseCost ? `Rs. ${m.purchaseCost}` : "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{m.rber ? "Yes" : "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis" }}>{m.remarks || "-"}</td>
                              <td style={{ padding: "10px 14px" }}>
                                {!a.verified && <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: "6px", background: "#fef9c3", color: "#92400e", fontSize: "10px", fontWeight: 700, marginBottom: "4px" }}>Unverified</span>}
                                <select
                                  value={combined}
                                  onChange={e => {
                                    const v = e.target.value;
                                    if (v === "Inactive")         handleInlineAssetStatus(a.id, { status: "Inactive", verified: 0, rber: false });
                                    else if (v === "Verified")    handleInlineAssetStatus(a.id, { status: "Active", workingStatus: "Working", criticality: "Non_Critical", verified: 1, rber: false });
                                    else if (v === "WIP")         handleInlineAssetStatus(a.id, { workingStatus: "WIP", status: "Active", verified: 0, rber: false });
                                    else if (v === "Not_Working") handleInlineAssetStatus(a.id, { workingStatus: "Not_Working", status: "Active", verified: 0, rber: false });
                                    else if (v === "Critical")    handleInlineAssetStatus(a.id, { criticality: "Critical", workingStatus: "Working", status: "Active", verified: 0, rber: false });
                                    else if (v === "RBER")        handleInlineAssetStatus(a.id, { workingStatus: "Not_Working", status: "Active", verified: 0, rber: true });
                                    else if (v === "Condemned")   handleInlineAssetStatus(a.id, { workingStatus: "Condemned", status: "Active", verified: 0, rber: false });
                                    else                           handleInlineAssetStatus(a.id, { status: "Active", workingStatus: "Working", criticality: "Non_Critical", verified: 0, rber: false });
                                  }}
                                  style={{ padding: "4px 8px", border: `1px solid ${cm.color}40`, borderRadius: "8px", fontSize: "12px", fontWeight: 700, background: cm.bg, color: cm.color, cursor: "pointer", outline: "none" }}>
                                  <option value="Active">Active</option>
                                  <option value="Verified">Verified</option>
                                  <option value="Inactive">Inactive</option>
                                  <option value="WIP">WIP</option>
                                  <option value="Not_Working">Not Working</option>
                                  <option value="Critical">Critical</option>
                                  <option value="RBER">RBER</option>
                                  <option value="Condemned">Condemned</option>
                                </select>
                              </td>
                              <td style={{ padding: "10px 14px" }}>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  <button title="Show QR Code" type="button" onClick={() => handleShowAssetQR(a.id, a.assetName, a)}
                                    style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#f0fdf4", color: "#16a34a", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                                  </button>
                                  <button title="Edit" type="button" onClick={() => handleEditAsset(a)}
                                    style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#eff6ff", color: "#2563eb", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button title="Delete" type="button" onClick={() => handleDeleteAsset(a.id)}
                                    style={{ width: "28px", height: "28px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                  </button>
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











            {showAssetModal && (





              <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflowY: "auto" }} onClick={() => { setShowAssetModal(false); setEditingAssetId(null); }}>





              <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", maxWidth: "780px", width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onClick={(e) => e.stopPropagation()}>





                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>





                  <div>





                    <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#0f172a", marginBottom: "4px" }}>{editingAssetId ? "Edit Asset" : "Add Asset"}</h2>





                    <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Fill in details based on the selected asset category.</p>





                  </div>





                  <button onClick={() => { setShowAssetModal(false); setEditingAssetId(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>×</button>





                </div>





                <form onSubmit={handleSubmitAsset}>





                  {/* ×××××× Asset Type - filtered by company sector ×××××× */}





                  {(() => {





                    const sectorTypes = getCompanySectorTypes(assetForm.companyId);





                    const isHCOnly = sectorTypes?.length === 1 && sectorTypes[0].code === "healthcare";





                    if (isHCOnly) {





                      return (





                        <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px" }}>





                          <span style={{ fontSize: "18px" }}>🏢</span>





                          <div>





                            <div style={{ fontWeight: 700, color: "#9a3412", fontSize: "13px" }}>Healthcare Equipment Registration</div>





                            <div style={{ color: "#c2410c", fontSize: "12px" }}>All required fields for medical equipment - barcode auto-generated on save</div>





                          </div>





                        </div>





                      );





                    }





                    const typesToShow = sectorTypes || (assetTypes.length ? assetTypes : [





                      { code: "soft", label: "Soft Services", workflowType: "soft" },





                      { code: "technical", label: "Technical", workflowType: "technical" },





                      { code: "fleet", label: "Fleet", workflowType: "fleet" },





                    ]);





                    return (





                      <div style={{ marginBottom: "16px" }}>





                        <div className="form-group">





                          <label>Asset Type <span style={{ color: "#ef4444" }}>*</span></label>





                          <select name="assetType" value={assetForm.assetType} onChange={handleAssetChange} className="form-select" required>





                            <option value="" disabled>Select type</option>





                            {typesToShow.map((t) => (





                              <option key={t.code} value={t.code}>{t.label}</option>





                            ))}





                          </select>





                        </div>





                      </div>





                    );





                  })()}











                  {/* Determine workflow type of selected asset type */}





                  {(() => {





                    const selectedAt = assetTypes.find(t => t.code === assetForm.assetType);





                    const wf = selectedAt?.workflowType || (assetForm.assetType === "soft" ? "soft" : assetForm.assetType === "fleet" ? "fleet" : assetForm.assetType === "healthcare" ? "healthcare" : "technical");





                    const customFields = selectedAt?.fieldLayout?.fields || [];





                    const isSoftWf = wf === "soft";





                    const isFleetWf = wf === "fleet";





                    const isTechWf = wf === "technical";





                    const isHealthcareWf = wf === "healthcare" || isHealthcareCompany(assetForm.companyId);











                    if (!assetForm.assetType) return null;











                    return (<>





                      {/* Company + Asset Name (all types except soft) */}





                      {!isSoftWf && (





                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "12px" }}>





                          <div className="form-group">





                            <label>Equipment Name <span style={{ color: "#ef4444" }}>*</span></label>





                            <input name="assetName" value={assetForm.assetName} onChange={handleAssetChange} className="form-input" required placeholder="e.g. MRI Scanner, Ventilator" />





                          </div>





                          <div className="form-group">





                            <label>Company <span style={{ color: "#ef4444" }}>*</span></label>





                            <select name="companyId" value={assetForm.companyId || ""} onChange={handleAssetChange} className="form-select" required>





                              <option value="" disabled>Select company</option>





                              {companies.map((c) => (





                                <option key={c.id} value={c.id}>{c.companyName}</option>





                              ))}





                            </select>





                          </div>





                        </div>





                      )}











                      {/* Healthcare workflow: full medical equipment form */}





                      {isHealthcareWf && !isSoftWf && (<>





                        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: "8px", padding: "8px 14px", marginBottom: "14px", fontSize: "12.5px", color: "#9a3412", display: "flex", alignItems: "center", gap: "8px" }}>





                          <span>🏢</span> Healthcare equipment registration - barcode will be auto-generated.





                        </div>











                        {/* Equipment Photos - up to 5 */}





                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 14px", marginBottom: "12px" }}>





                          <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#374151", marginBottom: "10px", display: "block" }}>





                            Equipment Photos <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: "11px" }}>(up to 5 images)</span>





                          </label>





                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "flex-start" }}>





                            {(assetForm.hcImages || []).map((img, i) => (





                              <div key={i} style={{ position: "relative", width: "76px", height: "76px" }}>





                                <img src={img.url} alt={img.name || "photo"} style={{ width: "76px", height: "76px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e2e8f0" }} />





                                <button type="button" onClick={() => setAssetForm(p => ({ ...p, hcImages: p.hcImages.filter((_, j) => j !== i) }))}





                                  style={{ position: "absolute", top: "-6px", right: "-6px", background: "#ef4444", color: "#fff", border: "none", borderRadius: "50%", width: "18px", height: "18px", cursor: "pointer", fontSize: "12px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>→×</button>





                              </div>





                            ))}





                            {(assetForm.hcImages || []).length < 5 && (





                              <label style={{ width: "76px", height: "76px", border: "2px dashed #cbd5e1", borderRadius: "6px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#94a3b8", fontSize: "11px", gap: "3px", flexShrink: 0 }}>





                                <span style={{ fontSize: "22px", lineHeight: 1 }}>+</span>





                                <span>Add Photo</span>





                                <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {





                                  const file = e.target.files[0]; if (!file) return;





                                  const fd = new FormData(); fd.append("file", file);





                                  try {





                                    const res = await fetch(buildApiUrl("/api/upload"), { method: "POST", body: fd });





                                    const data = await res.json();





                                    setAssetForm(p => ({ ...p, hcImages: [...(p.hcImages || []), { url: data.url, name: file.name }] }));





                                  } catch { /* silent */ }





                                  e.target.value = "";





                                }} />





                              </label>





                            )}





                          </div>





                        </div>











                        {/* Row 1: Barcode No (auto), Make/Manufacturer */}





                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>





                          <div className="form-group">





                            <label>Barcode No. <span style={{ fontSize: "11px", color: "#94a3b8" }}>(auto-generated)</span></label>





                            <input name="assetUniqueId" value={assetForm.assetUniqueId || "HC-AUTO"} onChange={handleAssetChange} className="form-input" placeholder="Auto-generated on save" style={{ background: assetForm.assetUniqueId ? undefined : "#f8fafc", color: "#64748b" }} readOnly={!assetForm.assetUniqueId} />





                          </div>





                          <div className="form-group">





                            <label>Make / Manufacturer</label>





                            <input name="make" value={assetForm.make} onChange={handleAssetChange} className="form-input" placeholder="e.g. Philips" />





                          </div>









                        </div>











                        {/* Row 2: Model, Serial No, Accessories */}





                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>





                          <div className="form-group">





                            <label>Model</label>





                            <input name="model" value={assetForm.model} onChange={handleAssetChange} className="form-input" placeholder="Model designation" />





                          </div>





                          <div className="form-group">





                            <label>Serial No.</label>





                            <input name="serialNo" value={assetForm.serialNo} onChange={handleAssetChange} className="form-input" placeholder="Serial number" />





                          </div>





                          <div className="form-group">





                            <label>Accessories Included</label>





                            <input name="accessories" value={assetForm.accessories} onChange={handleAssetChange} className="form-input" placeholder="List accessories" />





                          </div>





                        </div>











                        {/* Row 3: Dealer, Manufacturing Year, Installation Date */}





                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>





                          <div className="form-group">





                            <label>Dealer / Distributor</label>





                            <input name="dealer" value={assetForm.dealer} onChange={handleAssetChange} className="form-input" placeholder="Dealer name" />





                          </div>





                          <div className="form-group">





                            <label>Manufacturing Year</label>





                            <input name="manufacturingYear" value={assetForm.manufacturingYear} onChange={handleAssetChange} className="form-input" placeholder="e.g. 2022" type="number" min="1990" max="2100" />





                          </div>





                          <div className="form-group">





                            <label>Installation Date</label>





                            <input type="date" name="hcInstallationDate" value={assetForm.hcInstallationDate} onChange={handleAssetChange} className="form-input" />





                          </div>





                        </div>











                        {/* Row 4: Invoice No, Invoice/Purchase Date, Purchase Cost */}





                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>





                          <div className="form-group">





                            <label>Invoice No. / Purchase No.</label>





                            <input name="invoiceNo" value={assetForm.invoiceNo} onChange={handleAssetChange} className="form-input" placeholder="INV-XXXX" />





                            {/* Invoice file upload */}





                            <div style={{ marginTop: "6px" }}>





                              {assetForm.hcInvoiceUrl ? (





                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>





                                  <a href={assetForm.hcInvoiceUrl} target="_blank" rel="noreferrer" style={{ fontSize: "12px", color: "#2563eb", display: "flex", alignItems: "center", gap: "4px" }}>🏢 View Invoice</a>





                                  <button type="button" onClick={() => setAssetForm(p => ({ ...p, hcInvoiceUrl: "" }))} style={{ fontSize: "11px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>





                                </div>





                              ) : (





                                <label style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", border: "1px dashed #cbd5e1", borderRadius: "6px", cursor: "pointer", fontSize: "12px", color: "#64748b" }}>





                                  🏢 Upload Invoice





                                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={async (e) => {





                                    const file = e.target.files[0]; if (!file) return;





                                    const fd = new FormData(); fd.append("file", file);





                                    try {





                                      const res = await fetch(buildApiUrl("/api/upload"), { method: "POST", body: fd });





                                      const data = await res.json();





                                      setAssetForm(p => ({ ...p, hcInvoiceUrl: data.url }));





                                    } catch { /* silent */ }





                                    e.target.value = "";





                                  }} />





                                </label>





                              )}





                            </div>





                          </div>





                          <div className="form-group">





                            <label>Purchase Date</label>





                            <input type="date" name="invoiceDate" value={assetForm.invoiceDate} onChange={handleAssetChange} className="form-input" />





                          </div>





                          <div className="form-group">





                            <label>Purchase Cost (Rs.)</label>





                            <input type="number" name="purchaseCost" value={assetForm.purchaseCost} onChange={handleAssetChange} className="form-input" placeholder="0.00" min="0" step="0.01" />





                          </div>





                        </div>











                        {/* Maintenance Under */}





                        <div style={{ background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0", padding: "14px 16px", marginBottom: "12px" }}>





                          <label style={{ fontSize: "12.5px", fontWeight: 700, color: "#374151", marginBottom: "10px", display: "block" }}>Maintenance Under</label>





                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>





                            {[["warranty","Warranty"],["amc","AMC"],["cmc","CMC"],["inhouse","In House"],["catalyst","Catalyst"]].map(([v, l]) => (





                              <button key={v} type="button"





                                onClick={() => setAssetForm((p) => ({ ...p, maintenanceType: p.maintenanceType === v ? "" : v }))}





                                style={{ padding: "5px 14px", borderRadius: "20px", fontSize: "12.5px", fontWeight: 600, cursor: "pointer", border: `2px solid ${assetForm.maintenanceType === v ? "#2563eb" : "#e2e8f0"}`, background: assetForm.maintenanceType === v ? "#eff6ff" : "#fff", color: assetForm.maintenanceType === v ? "#1d4ed8" : "#64748b" }}>





                                {l}





                              </button>





                            ))}





                          </div>





                          {assetForm.maintenanceType === "warranty" && (





                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>





                              <div className="form-group"><label>Warranty Start</label><input type="date" name="warrantyStart" value={assetForm.warrantyStart} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Warranty End</label><input type="date" name="warrantyEnd" value={assetForm.warrantyEnd} onChange={handleAssetChange} className="form-input" /></div>





                            </div>





                          )}





                          {assetForm.maintenanceType === "amc" && (





                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>





                              <div className="form-group"><label>AMC Start</label><input type="date" name="amcStart" value={assetForm.amcStart} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>AMC End</label><input type="date" name="amcEnd" value={assetForm.amcEnd} onChange={handleAssetChange} className="form-input" /></div>





                            </div>





                          )}





                          {assetForm.maintenanceType === "cmc" && (





                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>





                              <div className="form-group"><label>CMC Start</label><input type="date" name="cmcStart" value={assetForm.cmcStart} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>CMC End</label><input type="date" name="cmcEnd" value={assetForm.cmcEnd} onChange={handleAssetChange} className="form-input" /></div>





                            </div>





                          )}





                        </div>











                        {/* RBER + Remarks */}





                        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px", marginBottom: "12px" }}>





                          <div className="form-group" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>





                            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: "8px", background: assetForm.rber ? "#fef2f2" : "#f8fafc" }}>





                              <input type="checkbox" name="rber" checked={!!assetForm.rber} onChange={handleAssetChange} style={{ width: "15px", height: "15px", accentColor: "#dc2626" }} />





                              <div>





                                <div style={{ fontWeight: 700, color: assetForm.rber ? "#dc2626" : "#374151", fontSize: "13px" }}>RBER</div>





                                <div style={{ fontSize: "11px", color: "#64748b" }}>Recommended Beyond Economic Repair</div>





                              </div>





                            </label>





                          </div>





                          <div className="form-group">





                            <label>Remarks</label>





                            <textarea name="remarks" value={assetForm.remarks} onChange={handleAssetChange} className="form-input" rows="2" placeholder="Any additional remarks or notes" />





                          </div>





                        </div>











                        {/* Location + Status */}





                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>





                          <div className="form-group"><label>Department</label>





                            <select name="departmentId" value={assetForm.departmentId || ""} onChange={handleAssetChange} className="form-select">





                              <option value="">- None -</option>





                              {companyDepartmentOptions.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}





                            </select>





                          </div>





                          {/* Cascading location dropdowns */}
                          <>
                            <div className="form-group"><label>Building / Ward</label>
                              <select name="buildingId" value={assetForm.buildingId} className="form-select" onChange={async e => { const bid = e.target.value; const bld = locBuildings.find(b => String(b.id) === bid); setAssetForm(p => ({ ...p, buildingId: bid, building: bld?.buildingName || "", floorId: "", floor: "", locDeptId: "", roomId: "", room: "", locationId: "" })); setLocFloors([]); setLocDepts([]); setLocRooms([]); if (bid) { const r = await fetch(`/api/locations/floors?buildingId=${bid}`, { headers: { Authorization: `Bearer ${token}` } }); setLocFloors(await r.json()); } }}>
                                <option value="">→ Select Building →</option>
                                {locBuildings.map(b => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
                              </select>
                            </div>
                            <div className="form-group"><label>Floor</label>
                              <select name="floorId" value={assetForm.floorId} className="form-select" onChange={async e => { const fid = e.target.value; const flr = locFloors.find(f => String(f.id) === fid); setAssetForm(p => ({ ...p, floorId: fid, floor: flr?.floorName || "", locDeptId: "", roomId: "", room: "", locationId: "" })); setLocDepts([]); setLocRooms([]); if (fid) { const r = await fetch(`/api/locations/rooms?floorId=${fid}`, { headers: { Authorization: `Bearer ${token}` } }); setLocRooms(await r.json()); } }}>
                                <option value="">→ Select Floor →</option>
                                {locFloors.map(f => <option key={f.id} value={f.id}>{f.floorName}</option>)}
                              </select>
                            </div>
                          </>





                          <div className="form-group"><label>Status</label>





                            <select name="status" value={assetForm.status} onChange={handleAssetChange} className="form-select">





                              <option value="Active">Active</option>





                              <option value="Inactive">Inactive</option>
                              <option value="Verified">Verified</option>
                              <option value="Under Maintenance">Under Maintenance</option>
                              <option value="Condemned">Condemned</option>





                            </select>





                          </div>





                        </div>





                      </>)}











                      {/* Soft workflow: Location fields only */}





                      {isSoftWf && (





                        <div style={{ marginBottom: "12px" }}>





                          <div className="form-section">





                            <h3 style={{ marginBottom: "12px", fontSize: "13px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em" }}>Location</h3>





                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>





                              {/* Cascading location dropdowns */}
                              <>
                                <div className="form-group"><label>Building</label>
                                  <select name="buildingId" value={assetForm.buildingId} className="form-select" onChange={async e => { const bid = e.target.value; const bld = locBuildings.find(b => String(b.id) === bid); setAssetForm(p => ({ ...p, buildingId: bid, building: bld?.buildingName || "", floorId: "", floor: "", locDeptId: "", roomId: "", room: "", locationId: "" })); setLocFloors([]); setLocDepts([]); setLocRooms([]); if (bid) { const r = await fetch(`/api/locations/floors?buildingId=${bid}`, { headers: { Authorization: `Bearer ${token}` } }); setLocFloors(await r.json()); } }}>
                                    <option value="">→ Select Building →</option>
                                    {locBuildings.map(b => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
                                  </select>
                                </div>
                                <div className="form-group"><label>Floor</label>
                                  <select name="floorId" value={assetForm.floorId} className="form-select" onChange={async e => { const fid = e.target.value; const flr = locFloors.find(f => String(f.id) === fid); setAssetForm(p => ({ ...p, floorId: fid, floor: flr?.floorName || "", locDeptId: "", roomId: "", room: "", locationId: "" })); setLocDepts([]); setLocRooms([]); if (fid) { const r = await fetch(`/api/locations/rooms?floorId=${fid}`, { headers: { Authorization: `Bearer ${token}` } }); setLocRooms(await r.json()); } }}>
                                    <option value="">→ Select Floor →</option>
                                    {locFloors.map(f => <option key={f.id} value={f.id}>{f.floorName}</option>)}
                                  </select>
                                </div>
                                <div className="form-group"><label>Department</label>
                                  <select name="locDeptId" value={assetForm.locDeptId} className="form-select" onChange={async e => { const did = e.target.value; setAssetForm(p => ({ ...p, locDeptId: did, roomId: "", room: "", locationId: "" })); if (assetForm.floorId) { const r = await fetch(`/api/locations/rooms?floorId=${assetForm.floorId}`, { headers: { Authorization: `Bearer ${token}` } }); setLocRooms(await r.json()); } }}>
                                    <option value="">→ Select Department →</option>
                                    {locDepts.map(d => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
                                  </select>
                                </div>
                                <div className="form-group"><label>Room / Area</label>
                                  <select name="roomId" value={assetForm.roomId} className="form-select" onChange={e => { const rid = e.target.value; const rm = locRooms.find(r => String(r.id) === rid); setAssetForm(p => ({ ...p, roomId: rid, room: rm?.roomName || "", locationId: rm?.locationId ? String(rm.locationId) : "" })); }}>
                                    <option value="">→ Select Room →</option>
                                    {locRooms.map(r => <option key={r.id} value={r.id}>{r.roomName}</option>)}
                                  </select>
                                </div>
                              </>





                            </div>





                            <div className="form-group" style={{ marginTop: "10px" }}>





                              <label>Description</label>





                              <textarea name="description" value={assetForm.description} onChange={handleAssetChange} className="form-input" rows="2" placeholder="Notes, instructions, etc." />





                            </div>





                          </div>





                        </div>





                      )}











                      {/* Non-soft: standard fields - NOT shown for healthcare (has its own location section above) */}





                      {!isSoftWf && !isHealthcareWf && (<>





                        <div className="form-group">





                          <label>Department</label>





                          <select name="departmentId" value={assetForm.departmentId || ""} onChange={handleAssetChange} className="form-select">





                            <option value="">- None -</option>





                            {companyDepartmentOptions.map((d) => (





                              <option key={d.id} value={d.id}>{d.name}</option>





                            ))}





                          </select>





                        </div>











                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "12px" }}>





                          <div className="form-group">





                            <label>Asset Unique ID</label>





                            <input name="assetUniqueId" value={assetForm.assetUniqueId} onChange={handleAssetChange} className="form-input" placeholder="Auto or manual" />





                          </div>





                          <div className="form-group">





                            <label>Status</label>





                            <select name="status" value={assetForm.status} onChange={handleAssetChange} className="form-select">





                              <option value="Active">Active</option>





                              <option value="Inactive">Inactive</option>





                            </select>





                          </div>





                        </div>











                        {!isFleetWf && (





                          <div className="form-section" style={{ marginBottom: "12px" }}>





                            <h3 style={{ marginBottom: "8px" }}>Location</h3>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
                              {locBuildings.length > 0 ? (
                                <>
                                  <div className="form-group"><label>Building</label>
                                    <select name="buildingId" value={assetForm.buildingId} className="form-select" onChange={async e => { const bid = e.target.value; const bld = locBuildings.find(b => String(b.id) === bid); setAssetForm(p => ({ ...p, buildingId: bid, building: bld?.buildingName || "", floorId: "", floor: "", locDeptId: "", roomId: "", room: "", locationId: "" })); setLocFloors([]); setLocDepts([]); setLocRooms([]); if (bid) { const r = await fetch(`/api/locations/floors?buildingId=${bid}`, { headers: { Authorization: `Bearer ${token}` } }); setLocFloors(await r.json()); } }}>
                                      <option value="">→ Select Building →</option>
                                      {locBuildings.map(b => <option key={b.id} value={b.id}>{b.buildingName}</option>)}
                                    </select>
                                  </div>
                                  <div className="form-group"><label>Floor</label>
                                    <select name="floorId" value={assetForm.floorId} className="form-select" onChange={async e => { const fid = e.target.value; const flr = locFloors.find(f => String(f.id) === fid); setAssetForm(p => ({ ...p, floorId: fid, floor: flr?.floorName || "", locDeptId: "", roomId: "", room: "", locationId: "" })); setLocDepts([]); setLocRooms([]); if (fid) { const r = await fetch(`/api/locations/rooms?floorId=${fid}`, { headers: { Authorization: `Bearer ${token}` } }); setLocRooms(await r.json()); } }}>
                                      <option value="">→ Select Floor →</option>
                                      {locFloors.map(f => <option key={f.id} value={f.id}>{f.floorName}</option>)}
                                    </select>
                                  </div>
                                  <div className="form-group"><label>Department</label>
                                    <select name="locDeptId" value={assetForm.locDeptId} className="form-select" onChange={async e => { const did = e.target.value; setAssetForm(p => ({ ...p, locDeptId: did, roomId: "", room: "", locationId: "" })); if (assetForm.floorId) { const r = await fetch(`/api/locations/rooms?floorId=${assetForm.floorId}`, { headers: { Authorization: `Bearer ${token}` } }); setLocRooms(await r.json()); } }}>
                                      <option value="">→ Select Department →</option>
                                      {locDepts.map(d => <option key={d.id} value={d.id}>{d.departmentName}</option>)}
                                    </select>
                                  </div>
                                  <div className="form-group"><label>Room/Area</label>
                                    <select name="roomId" value={assetForm.roomId} className="form-select" onChange={e => { const rid = e.target.value; const rm = locRooms.find(r => String(r.id) === rid); setAssetForm(p => ({ ...p, roomId: rid, room: rm?.roomName || "", locationId: rm?.locationId ? String(rm.locationId) : "" })); }}>
                                      <option value="">→ Select Room →</option>
                                      {locRooms.map(r => <option key={r.id} value={r.id}>{r.roomName}</option>)}
                                    </select>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="form-group"><label>Building</label><input name="building" value={assetForm.building} onChange={handleAssetChange} className="form-input" /></div>
                                  <div className="form-group"><label>Floor</label><input name="floor" value={assetForm.floor} onChange={handleAssetChange} className="form-input" /></div>
                                  <div className="form-group"><label>Room/Area</label><input name="room" value={assetForm.room} onChange={handleAssetChange} className="form-input" /></div>
                                </>
                              )}
                            </div>

                          </div>

                        )}


                        <div className="form-group" style={{ marginBottom: "12px" }}>

                          <label>Asset Description</label>





                          <textarea name="description" value={assetForm.description} onChange={handleAssetChange} className="form-input" rows="2" placeholder="Notes, instructions, etc." />





                        </div>











                        {isTechWf && !isHealthcareWf && (





                          <div className="form-section" style={{ marginBottom: "12px" }}>





                            <h3 style={{ marginBottom: "8px" }}>Technical Details</h3>





                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>





                              <div className="form-group"><label>Machine Name</label><input name="machineName" value={assetForm.machineName} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Brand/Manufacturer</label><input name="brand" value={assetForm.brand} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Model Number</label><input name="modelNumber" value={assetForm.modelNumber} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Serial Number</label><input name="serialNumber" value={assetForm.serialNumber} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Installation Date</label><input type="date" name="installationDate" value={assetForm.installationDate} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Warranty Expiry</label><input type="date" name="warrantyExpiry" value={assetForm.warrantyExpiry} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Maintenance Frequency</label><input name="maintenanceFrequency" value={assetForm.maintenanceFrequency} onChange={handleAssetChange} className="form-input" placeholder="e.g. Monthly" /></div>





                              <div className="form-group"><label>Last Service Date</label><input type="date" name="lastServiceDate" value={assetForm.lastServiceDate} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Next Service Date</label><input type="date" name="nextServiceDate" value={assetForm.nextServiceDate} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Technician Assigned</label><input name="technician" value={assetForm.technician} onChange={handleAssetChange} className="form-input" /></div>





                            </div>





                          </div>





                        )}











                        {isFleetWf && !isHealthcareWf && (





                          <div className="form-section" style={{ marginBottom: "12px" }}>





                            <h3 style={{ marginBottom: "8px" }}>Fleet Details</h3>





                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>





                              <div className="form-group"><label>Vehicle Number</label><input name="vehicleNumber" value={assetForm.vehicleNumber} onChange={handleAssetChange} className="form-input" required /></div>





                              <div className="form-group"><label>Vehicle Type</label><input name="vehicleType" value={assetForm.vehicleType} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Fuel Type</label><input name="fuelType" value={assetForm.fuelType} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Driver Assigned</label><input name="driver" value={assetForm.driver} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>RC Number</label><input name="rcNumber" value={assetForm.rcNumber} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Insurance Expiry</label><input type="date" name="insuranceExpiry" value={assetForm.insuranceExpiry} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>PUC Expiry</label><input type="date" name="pucExpiry" value={assetForm.pucExpiry} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Service Due Date</label><input type="date" name="serviceDueDate" value={assetForm.serviceDueDate} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Purchase Date</label><input type="date" name="purchaseDate" value={assetForm.purchaseDate} onChange={handleAssetChange} className="form-input" /></div>





                              <div className="form-group"><label>Vendor</label><input name="vendor" value={assetForm.vendor} onChange={handleAssetChange} className="form-input" /></div>





                              <label className="checkbox-row" style={{ display: "flex", alignItems: "center", gap: "8px" }}>





                                <input type="checkbox" name="dailyKmTracking" checked={assetForm.dailyKmTracking} onChange={handleAssetChange} />





                                <span>Daily KM Tracking</span>





                              </label>





                            </div>





                          </div>





                        )}











                        {/* Dynamic custom fields from field_layout */}





                        {customFields.length > 0 && (





                          <div className="form-section" style={{ marginBottom: "12px" }}>





                            <h3 style={{ marginBottom: "8px" }}>Additional Fields</h3>





                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>





                              {customFields.map((f) => (





                                <div key={f.key} className="form-group">





                                  <label>{f.label}{f.required && <span style={{ color: "#ef4444" }}> *</span>}</label>





                                  {f.type === "textarea" ? (





                                    <textarea





                                      name={`_custom_${f.key}`}





                                      value={assetForm[`_custom_${f.key}`] || ""}





                                      onChange={handleAssetChange}





                                      className="form-input"





                                      rows="2"





                                      placeholder={f.placeholder || ""}





                                      required={f.required}





                                    />





                                  ) : (





                                    <input





                                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}





                                      name={`_custom_${f.key}`}





                                      value={assetForm[`_custom_${f.key}`] || ""}





                                      onChange={handleAssetChange}





                                      className="form-input"





                                      placeholder={f.placeholder || ""}





                                      required={f.required}





                                    />





                                  )}





                                </div>





                              ))}





                            </div>





                          </div>





                        )}











                        <div className="form-section" style={{ marginBottom: "12px" }}>





                          <h3 style={{ marginBottom: "8px" }}>Attachments & Tracking</h3>





                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>





                            <div className="form-group"><label>Image URL</label><input name="imageUrl" value={assetForm.imageUrl} onChange={handleAssetChange} className="form-input" placeholder="Link to asset image" /></div>





                            <div className="form-group"><label>Checklist (name or ID)</label><input name="checklist" value={assetForm.checklist} onChange={handleAssetChange} className="form-input" placeholder="Attach checklist reference" /></div>





                            <div className="form-group"><label>QR Code</label><input name="qrCode" value={assetForm.qrCode} onChange={handleAssetChange} className="form-input" placeholder="QR code value (optional)" /></div>





                            <div className="form-group"><label>Document Links (one per line)</label><textarea name="documentLinks" value={assetForm.documentLinks} onChange={handleAssetChange} className="form-input" rows="2" placeholder="Paste URLs or notes" /></div>





                          </div>





                        </div>





                      </>)}





                    </>);





                  })()}











                  <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>





                    <button type="button" onClick={() => { setShowAssetModal(false); setEditingAssetId(null); }} style={{ padding: "9px 20px", border: "1px solid #e2e8f0", borderRadius: "8px", background: "#fff", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "14px" }}>Cancel</button>





                    <button type="submit" disabled={assetLoading} style={{ padding: "9px 24px", borderRadius: "8px", border: "none", background: assetLoading ? "#93c5fd" : "#2563eb", color: "#fff", fontWeight: 600, cursor: assetLoading ? "default" : "pointer", fontSize: "14px" }}>{assetLoading ? "Saving..." : editingAssetId ? "Update Asset" : "Add Asset"}</button>





                  </div>





                </form>





              </div>





              </div>





            )}





            {/* Bulk Import Modal */}





            {showBulkImport && (





              <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}





                onClick={() => setShowBulkImport(false)}>





                <div style={{ background: "#fff", borderRadius: "14px", width: "100%", maxWidth: "540px", padding: "28px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}





                  onClick={(e) => e.stopPropagation()}>





                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>





                    <div>





                      <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Import Assets from Excel</h2>





                      <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>Upload an .xlsx / .xls / .csv file to register multiple assets at once.</p>





                    </div>





                    <button onClick={() => setShowBulkImport(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "22px", lineHeight: 1 }}>×</button>





                  </div>











                  {/* Template download */}





                  <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "12px 16px", marginBottom: "18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>





                    <span style={{ fontSize: "13px", color: "#475569" }}>Download the template to see the required columns.</span>





                    <a href={getAssetImportTemplateUrl()} download style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 14px", borderRadius: "7px", background: "#eff6ff", color: "#2563eb", fontWeight: 600, fontSize: "13px", border: "1px solid #bfdbfe", textDecoration: "none" }}>





                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>





                      Template





                    </a>





                  </div>











                  {/* File picker */}





                  <div style={{ marginBottom: "18px" }}>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Excel / CSV File <span style={{ color: "#ef4444" }}>*</span></label>





                    <input type="file" accept=".xlsx,.xls,.csv"





                      onChange={(e) => { setBulkImportFile(e.target.files[0] || null); setBulkImportResult(null); }}





                      style={{ display: "block", width: "100%", fontSize: "13px", color: "#0f172a" }} />





                    {bulkImportFile && <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#64748b" }}>{bulkImportFile.name}</p>}





                  </div>











                  {/* Upload button */}





                  <button type="button" disabled={bulkImporting || !bulkImportFile}





                    onClick={async () => {





                      if (!bulkImportFile) return;





                      setBulkImporting(true); setBulkImportResult(null);





                      try {





                        const companyId = selectedCompanyId || companies[0]?.id;





                        const result = await bulkImportAssets(token, bulkImportFile, companyId);





                        setBulkImportResult(result);





                        // Refresh assets list





                        await loadAssets(token, companyId).catch(() => {});





                      } catch (err) {





                        setBulkImportResult({ error: err.message });





                      } finally {





                        setBulkImporting(false);





                      }





                    }}





                    style={{ display: "block", width: "100%", padding: "10px", borderRadius: "8px", border: "none", background: bulkImporting || !bulkImportFile ? "#93c5fd" : "#2563eb", color: "#fff", fontWeight: 700, fontSize: "14px", cursor: bulkImporting || !bulkImportFile ? "default" : "pointer" }}>





                    {bulkImporting ? "Uploading..." : "Upload & Register Assets"}





                  </button>











                  {/* Results */}





                  {bulkImportResult && !bulkImportResult.error && (





                    <div style={{ marginTop: "20px" }}>





                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "14px" }}>





                        {[





                          { label: "Total Rows", value: bulkImportResult.total, color: "#0f172a" },





                          { label: "Created", value: bulkImportResult.created, color: "#16a34a" },





                          { label: "Skipped", value: bulkImportResult.skipped, color: "#d97706" },





                        ].map(({ label, value, color }) => (





                          <div key={label} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 14px", textAlign: "center", border: "1px solid #e2e8f0" }}>





                            <div style={{ fontSize: "22px", fontWeight: 800, color }}>{value}</div>





                            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>{label}</div>





                          </div>





                        ))}





                      </div>





                      {bulkImportResult.errors?.length > 0 && (





                        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px" }}>





                          <p style={{ margin: "0 0 6px", fontSize: "12.5px", fontWeight: 700, color: "#dc2626" }}>Skipped rows:</p>





                          {bulkImportResult.errors.map((e, i) => (





                            <p key={i} style={{ margin: "2px 0", fontSize: "12px", color: "#7f1d1d" }}>Row {e.row}: {e.assetName ? `"${e.assetName}" - ` : ""}{e.reason}</p>





                          ))}





                        </div>





                      )}





                    </div>





                  )}





                  {bulkImportResult?.error && (





                    <div style={{ marginTop: "14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px" }}>





                      <p style={{ margin: 0, fontSize: "13px", color: "#dc2626", fontWeight: 600 }}>{bulkImportResult.error}</p>





                    </div>





                  )}





                </div>





              </div>





            )}





            {assetQrModal && (





              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>





                <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "420px", padding: "28px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>





                  <h3 style={{ margin: "0 0 4px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Asset QR / Barcode Label</h3>





                  {assetQrDataUrl ? (





                    /* ×××××× Barcode label preview (industry standard 3.5" x 2" ratio) ×××××× */





                    <div id="barcode-label-preview" style={{ display: "inline-block", border: "2px solid #e2e8f0", borderRadius: "10px", padding: "12px 16px", background: "#fff", maxWidth: "320px", width: "100%", textAlign: "left", fontFamily: "'Arial', sans-serif" }}>





                      {/* Header row: client name + Catalyst brand */}





                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", borderBottom: "1px solid #e2e8f0", paddingBottom: "6px" }}>





                        <span style={{ fontSize: "11px", fontWeight: 800, color: "#1e3a8a", letterSpacing: "0.5px", textTransform: "uppercase" }}>





                          {assetQrModal.companyName || companies.find((c) => c.id === assetQrModal.companyId)?.companyName || "Company"}





                        </span>





                        <span style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", background: "#f1f5f9", padding: "2px 7px", borderRadius: "4px" }}>CATALYST FM</span>





                      </div>





                      {/* QR + details side by side */}





                      <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>





                        <img src={assetQrDataUrl} alt="QR" style={{ width: "80px", height: "80px", flexShrink: 0, borderRadius: "4px" }} />





                        <div style={{ flex: 1, minWidth: 0 }}>





                          <div style={{ fontWeight: 800, fontSize: "13.5px", color: "#0f172a", marginBottom: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assetQrModal.assetName}</div>





                          {assetQrModal.barcodeNumber && (





                            <div style={{ fontSize: "11px", fontFamily: "monospace", color: "#1e3a8a", fontWeight: 700, marginBottom: "3px", background: "#eff6ff", padding: "2px 6px", borderRadius: "3px", display: "inline-block" }}>{assetQrModal.barcodeNumber}</div>





                          )}





                          {assetQrModal.assetType && <div style={{ fontSize: "10.5px", color: "#64748b", marginBottom: "2px" }}>Type: {assetQrModal.assetType}</div>}





                          {assetQrModal.location && <div style={{ fontSize: "10.5px", color: "#64748b" }}>🏢 {assetQrModal.location}</div>}





                        </div>





                      </div>





                      {/* Footer */}





                      <div style={{ marginTop: "8px", paddingTop: "5px", borderTop: "1px solid #e2e8f0", fontSize: "9.5px", color: "#94a3b8", textAlign: "center" }}>





                        Scan QR to view details &amp; raise queries →→ {new Date().getFullYear()}





                      </div>





                    </div>





                  ) : (





                    <p style={{ color: "#94a3b8" }}>Generating QR...</p>





                  )}





                  <div style={{ display: "flex", gap: "10px", marginTop: "18px", justifyContent: "center", flexWrap: "wrap" }}>





                    {assetQrDataUrl && (





                      <a href={assetQrDataUrl} download={`QR-${assetQrModal.assetName.replace(/[^a-zA-Z0-9]/g, "_")}-${assetQrModal.assetId}.png`} style={{ padding: "8px 16px", borderRadius: "8px", background: "#2563eb", color: "#fff", textDecoration: "none", fontSize: "13px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>





                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>





                        Download QR





                      </a>





                    )}





                    {assetQrDataUrl && (





                      <button onClick={() => {





                        const label = document.getElementById("barcode-label-preview");





                        const labelHtml = label ? label.outerHTML : "";





                        const w = window.open("", "_blank");





                        w.document.write(`<!DOCTYPE html><html><head><title>Barcode Label - ${assetQrModal.assetName}</title>





                          <style>





                            @page { size: 89mm 51mm; margin: 0; }





                            body { margin: 0; padding: 4mm; font-family: Arial, sans-serif; background: #fff; }





                            * { box-sizing: border-box; }





                          </style>





                        </head><body>${labelHtml}</body></html>`);





                        w.document.close();





                        w.focus();





                        setTimeout(() => { w.print(); w.close(); }, 500);





                      }} style={{ padding: "8px 16px", borderRadius: "8px", background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", cursor: "pointer", fontSize: "13px", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "6px" }}>





                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>





                        Print Label





                      </button>





                    )}





                    <button onClick={() => { setAssetQrModal(null); setAssetQrDataUrl(""); }} style={{ padding: "8px 16px", borderRadius: "8px", background: "#f1f5f9", color: "#475569", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>Close</button>





                  </div>





                </div>





              </div>





            )}







            {/* Asset Detail — Full-width page with tabs */}
            {viewingAsset && (() => {
              const a = viewingAsset;
              const m = typeof a.metadata === "string"
                ? (() => { try { return JSON.parse(a.metadata || "{}"); } catch { return {}; } })()
                : (a.metadata || {});
              const closeDetail = () => { setViewingAsset(null); setViewingAssetTab("overview"); setViewingAssetCallLogs(null); setViewingAssetCalibration(null); };
              const mf = (field) => a[field] || m[field];
              const dateField = (v) => v ? String(v).replace("T00:00:00.000Z","").replace("T"," ").slice(0,10) : "";
              // Normalize maintenance types from both web and mobile schemas
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
              const normalizeImg = (img) => {
                const raw = typeof img === "string" ? img : (img?.url || img?.src || img?.path || "");
                if (!raw || typeof raw !== "string") return "";
                if (raw.startsWith("http") || raw.startsWith("/")) return raw;
                return `/${raw}`;
              };
              const hcImages = [
                ...(Array.isArray(m.hcImages) ? m.hcImages : []),
                ...(Array.isArray(m.images) ? m.images : []),
                ...(Array.isArray(m.invoiceImages) ? m.invoiceImages : []),
                ...(m.invoiceUrl ? [m.invoiceUrl] : []),
                ...(m.hcInvoiceUrl ? [m.hcInvoiceUrl] : []),
              ].map(normalizeImg).filter(Boolean);

              const loadCallLogs = async () => {
                if (viewingAssetCallLogs !== null) return;
                try {
                  const r = await fetch(`${getApiBaseUrl()}/api/companies/work-orders?assetId=${a.id}&limit=100`, { headers: { Authorization: `Bearer ${token}` } });
                  const d = await r.json();
                  setViewingAssetCallLogs(Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : []));
                } catch { setViewingAssetCallLogs([]); }
              };
              const loadCalibration = async () => {
                if (viewingAssetCalibration !== null) return;
                try {
                  const companyId = a.companyId || (companies.find(c => c.companyName === a.companyName)?.id) || "";
                  const r = await fetch(`${getApiBaseUrl()}/api/companies/${companyId}/assets/${a.id}/calibration-records`, { headers: { Authorization: `Bearer ${token}` } });
                  const d = await r.json();
                  setViewingAssetCalibration(Array.isArray(d) ? d : []);
                } catch { setViewingAssetCalibration([]); }
              };
              const handleTab = (tab) => {
                setViewingAssetTab(tab);
                if (tab === "calllogs") loadCallLogs();
                if (tab === "calibration") loadCalibration();
              };
              const TABS = [
                { key: "overview",    label: "Overview" },
                { key: "calllogs",    label: "Call Log History" },
                { key: "calibration", label: "Calibration History" },
                { key: "purchase",    label: "Purchase History" },
                { key: "indent",      label: "Indent Details" },
              ];
              const tabStyle = (key) => ({
                padding: "12px 18px", background: "none", border: "none",
                borderBottom: viewingAssetTab === key ? "3px solid #2563eb" : "3px solid transparent",
                color: viewingAssetTab === key ? "#2563eb" : "#64748b",
                fontSize: "13.5px", fontWeight: viewingAssetTab === key ? 700 : 500,
                cursor: "pointer", whiteSpace: "nowrap", transition: "color 0.15s",
              });
              const EmptyMsg = ({ msg }) => (
                <div style={{ textAlign: "center", padding: "48px 24px", color: "#94a3b8" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: "12px", opacity: 0.5 }}><path d="M9 12h6m-6 4h6M9 8h.01M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3z"/></svg>
                  <p style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>{msg || "No records found"}</p>
                </div>
              );
              const fields = [
                ["Asset ID",           a.generatedAssetId || a.assetUniqueId],
                ["Equipment Name",     m.equipmentName || a.assetName],
                ["Company",            a.companyName],
                ["Make / Manufacturer",m.make || m.manufacturer],
                ["Model",              m.model],
                ["Serial No.",         m.serialNo],
                ["Accessories",        m.accessories],
                ["Dealer / Distributor",m.dealer],
                ["Manufacturing Year", m.mfgYear || m.manufacturingYear],
                ["Installation Date",  dateField(m.installationDate)],
                ["Invoice No.",        m.invoiceNo],
                ["Purchase Date",      dateField(m.purchaseDate)],
                ["Purchase Cost",      m.purchaseCost ? `₹ ${m.purchaseCost}` : null],
                ["Maintenance",        maint],
                ["RBER",               m.rber ? "Yes" : null],
                ["Remarks",            m.remarks],
                ["Department",         a.departmentName],
                ["Building",           a.building],
                ["Floor",              a.floor],
                ["Room / Area",        a.room],
                ["Status",             a.status],
                ["Asset Type",         a.assetType],
                ["Criticality",        a.criticality || m.criticality],
                ["Registered On",      a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-IN") : null],
              ].filter(([, v]) => v);

              return (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex" }}
                  onClick={e => e.target === e.currentTarget && closeDetail()}>
                  <div style={{ background: "#fff", width: "100vw", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    {/* Header */}
                    <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", flexShrink: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                        <div>
                          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{m.equipmentName || a.assetName}</h3>
                          <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "6px" }}>{a.generatedAssetId || a.assetUniqueId}</span>
                        </div>
                        <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: a.status === "Active" ? "#dcfce7" : "#f1f5f9", color: a.status === "Active" ? "#16a34a" : "#475569" }}>{a.status || "—"}</span>
                        {a.companyName && <span style={{ fontSize: "12px", color: "#64748b", background: "#f1f5f9", padding: "4px 10px", borderRadius: "8px" }}>{a.companyName}</span>}
                      </div>
                      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <button onClick={() => { closeDetail(); setEditingAssetId(a.id); setAssetForm({ ...emptyAsset, ...a, metadata: m, companyId: a.companyId || "" }); setShowAssetModal(true); }}
                          style={{ padding: "8px 16px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: "8px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>Edit Asset</button>
                        <button onClick={closeDetail}
                          style={{ width: "36px", height: "36px", borderRadius: "50%", border: "none", background: "#f1f5f9", cursor: "pointer", fontSize: "20px", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                    </div>
                    {/* Tabs */}
                    <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff", padding: "0 24px", overflowX: "auto", flexShrink: 0 }}>
                      {TABS.map(t => <button key={t.key} style={tabStyle(t.key)} onClick={() => handleTab(t.key)}>{t.label}</button>)}
                    </div>
                    {/* Content */}
                    <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc", padding: "24px" }}>

                      {/* ── Overview ── */}
                      {viewingAssetTab === "overview" && (
                        <>
                          {hcImages.length > 0 && (
                            <div style={{ marginBottom: "20px" }}>
                              <p style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 10px" }}>IMAGES</p>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                                {hcImages.map((src, i) => (
                                  <a key={i} href={src} target="_blank" rel="noreferrer" style={{ display: "block", borderRadius: "10px", overflow: "hidden", border: "1px solid #e2e8f0", width: "140px", height: "140px" }}>
                                    <img src={src} alt={`img-${i}`} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => { e.target.parentElement.style.display = "none"; }} />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "16px" }}>
                            {[
                              ["Cost of Asset", m.purchaseCost ? `₹ ${m.purchaseCost}` : "—"],
                              ["Total Down Time", "—"],
                              ["MTBF", "—"],
                              ["MTTR", "—"],
                            ].map(([lbl, val]) => (
                              <div key={lbl} style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "12px 16px" }}>
                                <p style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>{lbl}</p>
                                <p style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{val}</p>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                            {fields.map(([label, val]) => (
                              <div key={label} style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "12px 16px", boxShadow: "0 1px 2px rgba(0,0,0,0.03)" }}>
                                <p style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>{label}</p>
                                <p style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", margin: 0 }}>{String(val)}</p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {/* ── Call Log History ── */}
                      {viewingAssetTab === "calllogs" && (
                        viewingAssetCallLogs === null ? <EmptyMsg msg="Loading call logs…" /> :
                        viewingAssetCallLogs.length === 0 ? <EmptyMsg msg="No call log history" /> :
                        <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead><tr style={{ background: "#f8fafc" }}>
                              {["#","Title","Priority","Status","Assigned To","Created"].map(h => (
                                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>{viewingAssetCallLogs.map((w, i) => (
                              <tr key={w.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{i + 1}</td>
                                <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a" }}>{w.title || w.issueDescription || "—"}</td>
                                <td style={{ padding: "10px 14px", color: "#64748b" }}>{w.priority || "—"}</td>
                                <td style={{ padding: "10px 14px" }}><span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: "#f1f5f9", color: "#475569" }}>{w.status || "—"}</span></td>
                                <td style={{ padding: "10px 14px", color: "#64748b" }}>{w.assignedToName || w.assignedTo || "—"}</td>
                                <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{w.createdAt ? new Date(w.createdAt).toLocaleDateString("en-IN") : "—"}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}

                      {/* ── Calibration History ── */}
                      {viewingAssetTab === "calibration" && (
                        viewingAssetCalibration === null ? <EmptyMsg msg="Loading calibration records…" /> :
                        viewingAssetCalibration.length === 0 ? <EmptyMsg msg="No calibration records" /> :
                        <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead><tr style={{ background: "#f8fafc" }}>
                              {["#","Date","Done By","Next Due","Certificate","Notes"].map(h => (
                                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>{viewingAssetCalibration.map((c, i) => (
                              <tr key={c.id || i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                <td style={{ padding: "10px 14px", color: "#94a3b8" }}>{i + 1}</td>
                                <td style={{ padding: "10px 14px", color: "#0f172a" }}>{c.calibrationDate || "—"}</td>
                                <td style={{ padding: "10px 14px", color: "#64748b" }}>{c.doneBy || "—"}</td>
                                <td style={{ padding: "10px 14px", color: "#64748b" }}>{c.nextDueDate || "—"}</td>
                                <td style={{ padding: "10px 14px" }}>{c.certificateUrl ? <a href={c.certificateUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>View</a> : "—"}</td>
                                <td style={{ padding: "10px 14px", color: "#64748b" }}>{c.notes || "—"}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      )}

                      {/* ── Purchase History ── */}
                      {viewingAssetTab === "purchase" && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                          {[
                            ["Invoice No.", m.invoiceNo], ["Purchase Date", dateField(m.purchaseDate)],
                            ["Purchase Cost", m.purchaseCost ? `₹ ${m.purchaseCost}` : null],
                            ["Dealer / Distributor", m.dealer],
                            ["Warranty", maintenanceTypes.warranty ? `${warrantyStart || "—"} → ${warrantyEnd || "—"}` : null],
                            ["AMC", maintenanceTypes.amc ? `${amcStart || "—"} → ${amcEnd || "—"}` : null],
                            ["CMC", maintenanceTypes.cmc ? `${cmcStart || "—"} → ${cmcEnd || "—"}` : null],
                            ["Remarks", m.remarks],
                          ].filter(([, v]) => v).map(([label, val]) => (
                            <div key={label} style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "12px 16px" }}>
                              <p style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>{label}</p>
                              <p style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", margin: 0 }}>{String(val)}</p>
                            </div>
                          ))}
                          {!m.invoiceNo && !m.purchaseDate && !m.purchaseCost && !m.dealer && <EmptyMsg msg="No purchase information recorded" />}
                        </div>
                      )}

                      {/* ── Indent Details ── */}
                      {viewingAssetTab === "indent" && (
                        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "24px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                            {[
                              ["Indent No.", m.indentNo],
                              ["Indent Date", m.indentDate ? dateField(m.indentDate) : null],
                              ["Requested By", m.requestedBy],
                              ["Approved By", m.approvedBy],
                              ["Supplier", m.supplier || m.dealer],
                              ["PO Number", m.poNumber],
                              ["PO Date", m.poDate ? dateField(m.poDate) : null],
                              ["Quantity", m.quantity],
                              ["Unit Price", m.unitPrice ? `₹ ${m.unitPrice}` : null],
                              ["Total Cost", m.totalCost ? `₹ ${m.totalCost}` : (m.purchaseCost ? `₹ ${m.purchaseCost}` : null)],
                              ["GRN Number", m.grnNumber],
                              ["GRN Date", m.grnDate ? dateField(m.grnDate) : null],
                              ["Remarks", m.indentRemarks || m.remarks],
                            ].filter(([, v]) => v).map(([label, val]) => (
                              <div key={label} style={{ background: "#f8fafc", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "12px 16px" }}>
                                <p style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 4px" }}>{label}</p>
                                <p style={{ fontSize: "14px", fontWeight: 600, color: "#0f172a", margin: 0 }}>{String(val)}</p>
                              </div>
                            ))}
                          </div>
                          {!m.indentNo && !m.poNumber && !m.grnNumber && !m.requestedBy && <EmptyMsg msg="No indent details recorded for this asset." />}
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              );
            })()}
            </>





          );





        })()}











        {nav === "departments" && (





          <div>





            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px" }}>





              <div>





                <h1 style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px", marginBottom: "4px" }}>Departments</h1>





                <p style={{ color: "#64748b", fontSize: "13.5px" }}>Create and manage departments across your companies.</p>





              </div>





            </div>











            {departmentError && (





              <div style={{ background: "#fef2f2", color: "#dc2626", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: "1px solid #fecaca", marginBottom: "14px" }}>





                {departmentError}





              </div>





            )}











            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>





              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>





                <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Add Department</p>





              </div>





              <div style={{ padding: "16px 20px" }}>





                <form onSubmit={handleCreateDepartment}>





                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>





                    <div>





                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Company <span style={{ color: "#ef4444" }}>*</span></label>





                      <select name="companyId" value={departmentForm.companyId || selectedCompanyId || companies[0]?.id || ""} onChange={handleDepartmentChange}





                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", background: "#fff" }} required>





                        <option value="" disabled>Select company</option>





                        {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}





                      </select>





                    </div>





                    <div>





                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Department Name <span style={{ color: "#ef4444" }}>*</span></label>





                      <input name="name" value={departmentForm.name} onChange={handleDepartmentChange} placeholder="Housekeeping, HVAC, Pantry"





                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none" }} required />





                    </div>





                  </div>





                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "12px" }}>





                    <div>





                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Building</label>





                      <select name="buildingId" value={departmentForm.buildingId || ""} onChange={handleDepartmentChange}





                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", background: "#fff" }}>





                        <option value="">Optional</option>





                        {deptLocBuildings.map((b) => <option key={b.id} value={b.id}>{b.buildingName}</option>)}





                      </select>





                    </div>





                    <div>





                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Floor</label>





                      <select name="floorId" value={departmentForm.floorId || ""} onChange={handleDepartmentChange}





                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", background: "#fff" }}>





                        <option value="">Optional</option>





                        {deptLocFloors.map((f) => <option key={f.id} value={f.id}>{f.floorName}</option>)}





                      </select>





                    </div>





                    <div>





                      <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Room</label>





                      <select name="roomId" value={departmentForm.roomId || ""} onChange={handleDepartmentChange}





                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none", background: "#fff" }}>





                        <option value="">Optional</option>





                        {deptLocRooms.map((r) => <option key={r.id} value={r.id}>{r.roomName}</option>)}





                      </select>





                    </div>





                  </div>





                  <div style={{ marginBottom: "12px" }}>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "5px" }}>Description</label>





                    <input name="description" value={departmentForm.description} onChange={handleDepartmentChange} placeholder="Optional notes"





                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13.5px", outline: "none" }} />





                  </div>





                  <button type="submit" disabled={departmentLoading}





                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 18px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: departmentLoading ? "not-allowed" : "pointer", border: "none", background: departmentLoading ? "#93c5fd" : "#2563eb", color: "#fff" }}>





                    {departmentLoading ? "Saving..." : "Add Department"}





                  </button>





                </form>





              </div>





            </div>











            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" }}>





              <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>





                <div>





                  <p style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a", lineHeight: 1.3 }}>All Departments</p>





                  <p style={{ fontSize: "12.5px", color: "#64748b", marginTop: "2px" }}>{filteredDepartments.length} departments</p>





                </div>





                <input value={departmentSearch} onChange={(e) => setDepartmentSearch(e.target.value)} placeholder="Search..."





                  style={{ padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "13px", outline: "none", width: "180px" }} />





              </div>





              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>





                <thead>





                  <tr>





                    {["#", "Department Name", "Company", "Description", "Actions"].map((h) => (





                      <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#475569", fontWeight: 600, fontSize: "12px", textTransform: "uppercase", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>{h}</th>





                    ))}





                  </tr>





                </thead>





                <tbody>





                  {filteredDepartments.length === 0 ? (





                    <tr><td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>{departmentLoading ? "Loading..." : "No departments found"}</td></tr>





                  ) : filteredDepartments.map((d, i) => (





                    <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9" }}>





                      <td style={{ padding: "14px 16px", color: "#64748b", fontWeight: 600 }}>{i + 1}</td>





                      <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>{d.name}</td>





                      <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>{d.companyName || companies.find((c) => String(c.id) === String(d.companyId))?.companyName || "-"}</td>





                      <td style={{ padding: "14px 16px", color: "#64748b", fontSize: "13px" }}>{d.description || "-"}</td>





                      <td style={{ padding: "12px 16px" }}>





                        <button title="Delete" type="button" onClick={() => handleDeleteDepartment(d.id)}





                          style={{ width: "30px", height: "30px", borderRadius: "6px", background: "#fef2f2", color: "#dc2626", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>





                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>





                        </button>





                      </td>





                    </tr>





                  ))}





                </tbody>





              </table>





            </div>





          </div>





        )}











        {nav === "checklists" && (() => {





          const clCompanyId = checklistSelectedCompanyId || companies[0]?.id || null;





          return (





          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>





            {/* Sub-navigation tabs */}





            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>





              {[{ k: "templates", label: "Templates" }, { k: "submissions", label: "Submissions & Reports" }].map(({ k, label }) => (





                <button key={k} type="button" onClick={() => setChecklistSubNav(k)}





                  style={{ padding: "10px 20px", background: "none", border: "none",





                    borderBottom: checklistSubNav === k ? "3px solid #2563eb" : "3px solid transparent",





                    marginBottom: "-2px", fontSize: "14px", fontWeight: 700,





                    color: checklistSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>





                  {label}





                </button>





              ))}





            </div>











            {/* Company selector */}





            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px 20px", marginBottom: "22px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>





              <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>Company:</span>





              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>





                <button type="button"





                  onClick={() => setChecklistSelectedCompanyId(null)}





                  style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: clCompanyId === (companies[0]?.id || null) && !checklistSelectedCompanyId ? "none" : (checklistSelectedCompanyId === null ? "none" : "1px solid #e2e8f0"), background: checklistSelectedCompanyId === null ? "#2563eb" : "#f8fafc", color: checklistSelectedCompanyId === null ? "#fff" : "#475569" }}>





                  All Companies





                </button>





                {companies.map((c) => (





                  <button key={c.id} type="button"





                    onClick={() => setChecklistSelectedCompanyId(c.id)}





                    style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: checklistSelectedCompanyId === c.id ? "none" : "1px solid #e2e8f0", background: checklistSelectedCompanyId === c.id ? "#2563eb" : "#f8fafc", color: checklistSelectedCompanyId === c.id ? "#fff" : "#475569" }}>





                    {c.companyName || c.name}





                  </button>





                ))}





              </div>





            </div>











            {checklistSubNav === "templates" && (





              <ChecklistTemplateModule





                token={token}





                companies={companies}





                assets={assets}





                companyId={checklistSelectedCompanyId || null}





                fetchTemplates={getChecklistTemplates}





                createTemplate={createChecklistTemplate}





                fetchTemplate={getChecklistTemplate}





                updateTemplate={updateChecklistTemplate}





                deleteTemplate={deleteChecklistTemplate}





                canBuild={!isClientAdmin}





              />





            )}











            {checklistSubNav === "submissions" && (





              <SubmissionsPanel token={token} type="checklists" companyId={checklistSelectedCompanyId || null} />





            )}





          </div>





          );





        })()}











        {nav === "logsheets" && (() => {





          return (





          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>





            {/* Sub-navigation tabs */}





            <div style={{ display: "flex", gap: "4px", marginBottom: "24px", borderBottom: "2px solid #e2e8f0" }}>





              {[{ k: "templates", label: "Templates" }, { k: "submissions", label: "Submissions & Reports" }].map(({ k, label }) => (





                <button key={k} type="button" onClick={() => setLogsheetSubNav(k)}





                  style={{ padding: "10px 20px", background: "none", border: "none",





                    borderBottom: logsheetSubNav === k ? "3px solid #2563eb" : "3px solid transparent",





                    marginBottom: "-2px", fontSize: "14px", fontWeight: 700,





                    color: logsheetSubNav === k ? "#2563eb" : "#64748b", cursor: "pointer" }}>





                  {label}





                </button>





              ))}





            </div>











            {/* Company selector */}





            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px 20px", marginBottom: "22px", display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>





              <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#374151", whiteSpace: "nowrap" }}>Company:</span>





              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>





                <button type="button"





                  onClick={() => setLogsheetSelectedCompanyId(null)}





                  style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: logsheetSelectedCompanyId === null ? "none" : "1px solid #e2e8f0", background: logsheetSelectedCompanyId === null ? "#2563eb" : "#f8fafc", color: logsheetSelectedCompanyId === null ? "#fff" : "#475569" }}>





                  All Companies





                </button>





                {companies.map((c) => (





                  <button key={c.id} type="button"





                    onClick={() => setLogsheetSelectedCompanyId(c.id)}





                    style={{ padding: "6px 14px", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", border: logsheetSelectedCompanyId === c.id ? "none" : "1px solid #e2e8f0", background: logsheetSelectedCompanyId === c.id ? "#2563eb" : "#f8fafc", color: logsheetSelectedCompanyId === c.id ? "#fff" : "#475569" }}>





                    {c.companyName || c.name}





                  </button>





                ))}





              </div>





            </div>











            {logsheetSubNav === "templates" && (





              <LogsheetModule





                token={token}





                assets={assets}





                companies={companies}





                companyId={logsheetSelectedCompanyId || null}





                fetchTemplates={(tok, params) => getLogsheetTemplates(tok, params)}





                fetchTemplate={(tok, id) => getLogsheetTemplate(tok, id)}





                createTemplate={(tok, data) => createLogsheetTemplate(tok, data)}





                updateTemplate={(tok, id, data) => updateLogsheetTemplate(tok, id, data)}





                deleteTemplate={(tok, id) => deleteLogsheetTemplate(tok, id)}





                assignTemplate={(tok, templateId, assetId) => assignLogsheetTemplate(tok, templateId, assetId)}





                fetchEntries={(tok, templateId, params) => getLogsheetEntriesByTemplate(tok, templateId, params)}





                submitEntry={(tok, templateId, data) => submitLogsheetEntry(tok, templateId, data)}





                canBuild={!isClientAdmin}





              />





            )}











            {logsheetSubNav === "submissions" && (





              <SubmissionsPanel token={token} type="logsheets" companyId={logsheetSelectedCompanyId || null} />





            )}





          </div>





          );





        })()}











        {nav === "ojt" && (() => {





          return <AdminOjtSection token={token} companies={companies} />;





        })()}











        {nav === "reports" && (





          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>





            <WarningsPanel





              token={token}





              companyId={selectedCompanyId || companies[0]?.id || null}





              companies={companies.map((c) => ({ id: c.id, companyName: c.companyName || c.company || "(unnamed)" }))}





            />





            <AdminWorkOrdersSection token={token} companies={companies} />





          </div>





        )}












        {nav === "qrcodes" && (
          <AdminQrCodesSection token={token} companies={companies} />
        )}

        {nav === "locations" && (
          <AdminLocationsSection token={token} companies={companies} />
        )}

        {nav === "states" && (
          <AdminStatesSection token={token} />
        )}

        {nav === "workorders" && (





          <AdminWorkOrdersSection token={token} companies={companies} />





        )}











        {nav === "shifts" && (





          <AdminShiftsSection token={token} companies={companies} />





        )}











        {nav === "employees" && (





          <AdminEmployeesSection token={token} companies={companies} initialCompanyId={empInitCompanyId} onCompanySelected={() => setEmpInitCompanyId(null)} />





        )}











        {/* ×××××× Toast notifications (fixed overlay on every page) ×××××× */}





        <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 99999, display: "flex", flexDirection: "column", gap: "10px", pointerEvents: "none" }}>





          {toasts.map((t) => {





            const bg  = { critical: "#fee2e2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4", info: "#eff6ff" }[t.severity] || "#fff";





            const col = { critical: "#991b1b", high: "#9a3412", medium: "#854d0e", low: "#166534", info: "#1d4ed8" }[t.severity] || "#0f172a";





            const bdr = { critical: "#fca5a5", high: "#fdba74",  medium: "#fde68a", low: "#86efac", info: "#bfdbfe" }[t.severity] || "#e2e8f0";





            const icon  = { critical: "🚨", high: "⚠", medium: "▾", low: "🏢", info: "ℹ" }[t.severity] || "⚠";





            const label = { critical: "Critical Alert", high: "New Warning", medium: "New Alert", low: "Notification", info: "Info" }[t.severity] || "New Alert";





            return (





              <div key={t.id} className="fm-toast-enter" style={{ background: bg, border: `1px solid ${bdr}`, color: col, borderRadius: "10px", padding: "12px 16px", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", fontSize: "13px", fontWeight: 600, maxWidth: "340px", pointerEvents: "auto", display: "flex", alignItems: "flex-start", gap: "8px" }}>





                <span style={{ fontSize: "18px", flexShrink: 0 }}>{icon}</span>





                <div>





                  <div style={{ fontWeight: 800, marginBottom: "2px", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>





                  <div>{t.text}</div>





                  <button onClick={() => { setNav("reports"); setShowAddForm(false); setToasts((ts) => ts.filter((x) => x.id !== t.id)); }}





                    style={{ marginTop: "6px", background: "none", border: "none", color: col, fontWeight: 700, fontSize: "11px", cursor: "pointer", padding: 0, textDecoration: "underline" }}>View warnings -&gt;</button>





                </div>





              </div>





            );





          })}





        </div>











        {/* Sector Selection Modal */}





        {showSectorModal && (





          <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>





            <div style={{ background: "#fff", borderRadius: "16px", padding: "28px", width: "min(760px, 98vw)", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", border: "1px solid #e2e8f0" }}>





              <div style={{ marginBottom: "20px" }}>





                <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", marginBottom: "6px" }}>Select Sector(s)</h2>





                <p style={{ color: "#64748b", fontSize: "14px" }}>Select one or more industry sectors. Module access will be configured accordingly.</p>





              </div>





              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "12px", marginBottom: "18px" }}>





                {SECTORS.map((s) => {





                  const checked = selectedSectors.includes(s.value);





                  return (





                    <button key={s.value} type="button"





                      onClick={() => setSelectedSectors((prev) => checked ? prev.filter((v) => v !== s.value) : [...prev, s.value])}





                      style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "14px 16px", border: `2px solid ${checked ? "#2563eb" : "#dbe2ea"}`, borderRadius: "12px", background: checked ? "#eff6ff" : "#f8fafc", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>





                      <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${checked ? "#2563eb" : "#94a3b8"}`, background: checked ? "#2563eb" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>





                        {checked && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}





                      </div>





                      <span style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "9px",
                        border: `1px solid ${checked ? "#93c5fd" : "#d1d5db"}`,
                        background: checked ? "#dbeafe" : "#fff",
                        color: checked ? "#1d4ed8" : "#475569",
                        fontWeight: 800,
                        fontSize: "11px",
                        lineHeight: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        letterSpacing: "0.02em"
                      }}>{s.icon}</span>





                      <div>





                        <div style={{ fontWeight: 700, fontSize: "13.5px", color: checked ? "#1d4ed8" : "#0f172a", marginBottom: "2px" }}>{s.label}</div>





                        <div style={{ fontSize: "12px", color: "#64748b" }}>{s.description}</div>





                      </div>





                    </button>





                  );





                })}





              </div>





              {selectedSectors.length > 0 && (





                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px", color: "#166534" }}>





                  Selected: <strong>{selectedSectors.map((v) => SECTORS.find((s) => s.value === v)?.label).join(", ")}</strong>





                </div>





              )}





              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>





                <button type="button" onClick={() => { setShowSectorModal(false); setSelectedSectors([]); }}





                  style={{ padding: "9px 20px", fontSize: "13.5px", fontWeight: 600, borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}>





                  Cancel





                </button>





                <button type="button" disabled={selectedSectors.length === 0}





                  onClick={() => {





                    setShowSectorModal(false);





                    setHospitalForm(emptyHospital);





                    setCompanyForm({ ...emptyCompany, sectors: selectedSectors });





                    setShowAddForm(true);





                  }}





                  style={{ padding: "9px 24px", fontSize: "13.5px", fontWeight: 600, borderRadius: "7px", border: "none", background: selectedSectors.length > 0 ? "#2563eb" : "#93c5fd", color: "#fff", cursor: selectedSectors.length > 0 ? "pointer" : "default" }}>





                  Continue





                </button>





              </div>





            </div>





          </div>





        )}











        {nav === "companies" && showAddForm && selectedSectors.includes("healthcare") && selectedSectors.length === 1 && (





          <div style={{ background: "#f1f5f9", minHeight: "100%", padding: "0 0 32px 0" }}>





            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0 16px 0" }}>





              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1e293b", margin: 0, letterSpacing: "-0.3px" }}>Register Hospital / Medical Institute</h2>





              <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 400 }}>





                Companies&nbsp;<span style={{ color: "#cbd5e1" }}>/</span>&nbsp;





                <span style={{ color: "#3b82f6", fontWeight: 500 }}>Healthcare Registration</span>





              </span>





            </div>











            <form onSubmit={handleCreateHospital}>





              {hospitalError && (





                <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", color: "#dc2626", fontSize: "14px" }}>





                  {hospitalError}





                </div>





              )}











              {/* Site Information */}





              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "10px" }}>





                  <span style={{ fontSize: "18px" }}>🏢</span>





                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b" }}>Site / Institute Information</span>





                </div>





                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px 24px" }}>





                  <div style={{ gridColumn: "span 2" }}>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Site / Institute Name<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <input name="siteName" value={hospitalForm.siteName} onChange={handleHospitalChange} required





                      className="form-input" placeholder="e.g. City General Hospital" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Status</label>





                    <select name="status" value={hospitalForm.status} onChange={handleHospitalChange} className="form-select" style={{ width: "100%", boxSizing: "border-box" }}>





                      <option value="Active">Active</option>





                      <option value="Inactive">Inactive</option>





                    </select>





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Entity Type<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <select name="entityType" value={hospitalForm.entityType} onChange={handleHospitalChange} required className="form-select" style={{ width: "100%", boxSizing: "border-box" }}>





                      <option value="">Select Entity Type</option>





                      <option value="Hospital">Hospital</option>





                      <option value="Medical College">Medical College</option>





                      <option value="Clinic">Clinic</option>





                      <option value="Diagnostic Centre">Diagnostic Centre</option>





                      <option value="Nursing Home">Nursing Home</option>





                    </select>





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Facility Type<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <select name="facilityType" value={hospitalForm.facilityType} onChange={handleHospitalChange} required className="form-select" style={{ width: "100%", boxSizing: "border-box" }}>





                      <option value="">Select Facility Type</option>





                      <option value="Private">Private</option>





                      <option value="Trust">Trust</option>





                      <option value="Public">Public</option>





                      <option value="Government">Government</option>





                    </select>





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>GST No.</label>





                    <input name="gstNo" value={hospitalForm.gstNo} onChange={handleHospitalChange}





                      className="form-input" placeholder="e.g. 22AAAAA0000A1Z5" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>PAN No.</label>





                    <input name="panNo" value={hospitalForm.panNo} onChange={handleHospitalChange}





                      className="form-input" placeholder="e.g. AAAAA0000A" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                </div>





              </div>











              {/* Location */}





              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "10px" }}>





                  <span style={{ fontSize: "18px" }}>🏢</span>





                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b" }}>Location</span>





                </div>





                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "18px 24px" }}>





                  <div style={{ gridColumn: "span 3" }}>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Address<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <input name="address" value={hospitalForm.address} onChange={handleHospitalChange} required





                      className="form-input" placeholder="Full address of the facility" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      State<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <select name="state" value={hospitalForm.state} onChange={handleHospitalChange} required
                      className="form-input" style={{ width: "100%", boxSizing: "border-box" }}>
                      <option value="">Select State</option>
                      {statesList.map(s => <option key={s.id} value={s.state_name}>{s.state_name} ({s.state_code})</option>)}
                    </select>





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Pin Code<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <input name="pinCode" value={hospitalForm.pinCode} onChange={handleHospitalChange} required





                      className="form-input" placeholder="e.g. 400001" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                </div>





              </div>











              {/* Contact Information */}





              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "10px" }}>





                  <span style={{ fontSize: "18px" }}>📄P</span>





                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b" }}>Contact Information</span>





                </div>





                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px 24px" }}>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Contact Person Name<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <input name="contactPersonName" value={hospitalForm.contactPersonName} onChange={handleHospitalChange} required





                      className="form-input" placeholder="Full name" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Contact Person No.<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <input name="contactPersonPhone" value={hospitalForm.contactPersonPhone} onChange={handleHospitalChange} required





                      className="form-input" placeholder="e.g. +91 9876543210" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Email Address<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <input type="email" name="contactEmail" value={hospitalForm.contactEmail} onChange={handleHospitalChange} required





                      className="form-input" placeholder="contact@hospital.com" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                </div>





              </div>











              {/* Action Buttons */}





              <div style={{ display: "flex", gap: "10px" }}>





                <button type="button"





                  onClick={() => { setShowAddForm(false); setSelectedSectors([]); setHospitalError(null); }}





                  style={{ padding: "9px 22px", fontSize: "13.5px", fontWeight: 600, borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}>





                  Cancel





                </button>





                <button type="submit" disabled={hospitalLoading}





                  style={{ padding: "9px 26px", fontSize: "13.5px", fontWeight: 600, borderRadius: "7px", border: "none", background: hospitalLoading ? "#93c5fd" : "#3b82f6", color: "#fff", cursor: hospitalLoading ? "default" : "pointer" }}>





                  {hospitalLoading ? "Saving..." : "Register Hospital"}





                </button>





              </div>





            </form>





          </div>





        )}











        {nav === "companies" && showAddForm && !(selectedSectors.includes("healthcare") && selectedSectors.length === 1) && (





          <div style={{ background: "#f1f5f9", minHeight: "100%", padding: "0 0 32px 0" }}>





            {/* Page Header */}





            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 0 16px 0" }}>





              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1e293b", margin: 0, letterSpacing: "-0.3px" }}>





                Add Company





                {selectedSectors.length > 0 && (





                  <span style={{ marginLeft: "10px", fontSize: "13px", fontWeight: 500, color: "#2563eb", background: "#eff6ff", borderRadius: "6px", padding: "2px 10px", verticalAlign: "middle" }}>





                    {selectedSectors.map((v) => SECTORS.find((s) => s.value === v)?.label).join(" + ")}





                  </span>





                )}





              </h2>





              <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 400 }}>





                Companies&nbsp;<span style={{ color: "#cbd5e1" }}>/</span>&nbsp;





                <span style={{ color: "#3b82f6", fontWeight: 500 }}>Add Company</span>





              </span>





            </div>











            <form onSubmit={handleCreateCompany}>





              {/* Basic Information */}





              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>





                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Basic Information</span>





                </div>





                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px 24px" }}>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Company Code<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <input name="companyCode" value={companyForm.companyCode} onChange={handleCompanyChange} className="form-input" placeholder="e.g. ACME-001" required style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>





                      Company Name<span style={{ color: "#ef4444", marginLeft: "2px" }}>*</span>





                    </label>





                    <input name="companyName" value={companyForm.companyName} onChange={handleCompanyChange} className="form-input" placeholder="Business Name" required style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Description</label>





                    <input name="description" value={companyForm.description} onChange={handleCompanyChange} className="form-input" placeholder="Short description" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                </div>





              </div>











              {/* Address Information */}





              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>





                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Address Information</span>





                </div>





                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 24px" }}>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Address Line 1</label>





                    <input name="addressLine1" value={companyForm.addressLine1} onChange={handleCompanyChange} className="form-input" placeholder="Street Address" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Address Line 2</label>





                    <input name="addressLine2" value={companyForm.addressLine2} onChange={handleCompanyChange} className="form-input" placeholder="Apartment, Suite, etc." style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                </div>





                <div style={{ padding: "0 20px 20px 20px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "18px 24px" }}>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>City</label>





                    <input name="city" value={companyForm.city} onChange={handleCompanyChange} className="form-input" placeholder="City" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>State</label>





                    <select name="state" value={companyForm.state} onChange={handleCompanyChange} className="form-input" style={{ width: "100%", boxSizing: "border-box" }}>
                      <option value="">Select State</option>
                      {statesList.map(s => <option key={s.id} value={s.state_name}>{s.state_name} ({s.state_code})</option>)}
                    </select>





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Country</label>





                    <input name="country" value={companyForm.country} onChange={handleCompanyChange} className="form-input" placeholder="India" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Pincode</label>





                    <input name="pincode" value={companyForm.pincode} onChange={handleCompanyChange} className="form-input" placeholder="Pincode" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                </div>





              </div>











              {/* Business Details */}





              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>





                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Business Details</span>





                </div>





                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px 24px" }}>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>GST Number</label>





                    <input name="gstNumber" value={companyForm.gstNumber} onChange={handleCompanyChange} className="form-input" placeholder="e.g. 22AAAAA0000A1Z5" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>PAN Number</label>





                    <input name="panNumber" value={companyForm.panNumber} onChange={handleCompanyChange} className="form-input" placeholder="e.g. AAAAA0000A" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>CIN Number</label>





                    <input name="cinNumber" value={companyForm.cinNumber} onChange={handleCompanyChange} className="form-input" placeholder="Corporate Identity Number" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Status</label>





                    <select name="status" value={companyForm.status} onChange={handleCompanyChange} className="form-select" style={{ width: "100%", boxSizing: "border-box" }}>





                      <option value="Active">Active</option>





                      <option value="Inactive">Inactive</option>





                    </select>





                  </div>





                </div>





              </div>











              {/* Contract Details */}





              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "16px", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>





                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Contract Details</span>





                </div>





                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "18px 24px" }}>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Contract Start Date</label>





                    <input type="date" name="contractStartDate" value={companyForm.contractStartDate} onChange={handleCompanyChange} className="form-input" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Contract End Date</label>





                    <input type="date" name="contractEndDate" value={companyForm.contractEndDate} onChange={handleCompanyChange} className="form-input" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Billing Cycle</label>





                    <select name="billingCycle" value={companyForm.billingCycle} onChange={handleCompanyChange} className="form-select" style={{ width: "100%", boxSizing: "border-box" }}>





                      <option>Monthly</option>





                      <option>Quarterly</option>





                      <option>Yearly</option>





                    </select>





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Payment Terms (Days)</label>





                    <input type="number" name="paymentTermsDays" value={companyForm.paymentTermsDays} onChange={handleCompanyChange} className="form-input" min="0" placeholder="e.g. 30" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                  <div>





                    <label style={{ display: "block", fontSize: "12.5px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>Max Employees</label>





                    <input type="number" name="maxEmployees" value={companyForm.maxEmployees} onChange={handleCompanyChange} className="form-input" placeholder="Leave empty for unlimited" style={{ width: "100%", boxSizing: "border-box" }} />





                  </div>





                </div>





              </div>











              {/* Module Access */}





              <div style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", marginBottom: "20px", overflow: "hidden" }}>





                <div style={{ padding: "16px 20px 12px 20px", borderBottom: "1px solid #f1f5f9" }}>





                  <span style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", letterSpacing: "0.01em" }}>Module Access</span>





                </div>





                <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px 24px" }}>





                  {[





                    { name: "qsrModule", label: "Asset Management" },





                    { name: "premealModule", label: "FM e Checklist" },





                    { name: "deliveryModule", label: "Fleet Management" },





                    { name: "allowGuestBooking", label: "OJT Training" },





                  ].map(({ name, label }) => (





                    <label key={name} style={{ display: "flex", alignItems: "center", gap: "9px", cursor: "pointer", padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: "8px", background: companyForm[name] ? "#eff6ff" : "#f8fafc", transition: "background 0.15s" }}>





                      <input





                        type="checkbox"





                        name={name}





                        checked={companyForm[name]}





                        onChange={handleCompanyChange}





                        style={{ width: "15px", height: "15px", accentColor: "#3b82f6", cursor: "pointer" }}





                      />





                      <span style={{ fontSize: "13px", fontWeight: 500, color: companyForm[name] ? "#1d4ed8" : "#475569" }}>{label}</span>





                    </label>





                  ))}





                </div>





              </div>











              {/* Action Buttons */}





              <div style={{ display: "flex", gap: "10px" }}>





                <button





                  type="button"





                  onClick={() => { setShowAddForm(false); setSelectedSectors([]); }}





                  style={{ padding: "9px 22px", fontSize: "13.5px", fontWeight: 600, borderRadius: "7px", border: "1px solid #e2e8f0", background: "#fff", color: "#64748b", cursor: "pointer" }}





                >





                  Cancel





                </button>





                <button





                  type="submit"





                  disabled={companyLoading}





                  style={{ padding: "9px 26px", fontSize: "13.5px", fontWeight: 600, borderRadius: "7px", border: "none", background: companyLoading ? "#93c5fd" : "#3b82f6", color: "#fff", cursor: companyLoading ? "default" : "pointer" }}





                >





                  {companyLoading ? "Saving..." : "Add Company"}





                </button>





              </div>





            </form>





          </div>





        )}

{nav === "dashboard" && (() => {

          const SECTOR_COLORS = {
            healthcare:    { bg: "#eff6ff", col: "#2563eb", label: "Healthcare" },
            technical:     { bg: "#f0fdf4", col: "#16a34a", label: "Technical" },
            soft_services: { bg: "#fef9c3", col: "#ca8a04", label: "Soft Services" },
            fleet:         { bg: "#fce7f3", col: "#be185d", label: "Fleet" },
            general:       { bg: "#f1f5f9", col: "#475569", label: "General" },
          };

          const getSectors = (c) => {
            const s = Array.isArray(c.sectors) ? c.sectors : (c.sector ? [c.sector] : []);
            return s.length > 0 ? s : ["general"];
          };

          const totalCompanies = dashboardStats?.totalCompanies ?? companies.length;
          const activeCompanies = dashboardStats?.activeCompanies ?? companies.filter(c => (c.status || "Active").toLowerCase() === "active").length;
          const totalAssets = dashboardStats?.totalAssets;
          const totalEmployees = dashboardStats?.totalEmployees;

          // Asset/complaint profile
          const assetProfile = dashboardStats?.assetProfile || {};
          const complaintProfile = dashboardStats?.complaintProfile || {};
          const byCompany = dashboardStats?.byCompany || [];
          const byUser = dashboardStats?.byUser || [];

          // --- Inline Charts ---
          const PIE_COLORS_LIST = ["#2563eb","#dc2626","#16a34a","#7c3aed","#64748b","#0d9488","#ea580c","#ca8a04"];

          const DonutChart = ({ data, size = 160 }) => {
            const filtered = (data || []).filter(d => d.value > 0);
            const total = filtered.reduce((s, d) => s + d.value, 0);
            if (!total) return <div style={{ width: size, height: size, display:"flex", alignItems:"center", justifyContent:"center", color:"#94a3b8", fontSize:"12px", background:"#f8fafc", borderRadius:"50%" }}>No data</div>;
            const r = size / 2 - 12, cx = size / 2, cy = size / 2;
            let cumulative = 0;
            const slices = filtered.length === 1
              ? [{ fullCircle: true, color: filtered[0].color || PIE_COLORS_LIST[0], label: filtered[0].name, value: filtered[0].value, pct: 1 }]
              : filtered.map((d, i) => {
                  const pct = d.value / total;
                  const s = cumulative * 2 * Math.PI - Math.PI / 2;
                  cumulative += pct;
                  const e = cumulative * 2 * Math.PI - Math.PI / 2;
                  const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
                  const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
                  return { path: `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${pct > 0.5 ? 1 : 0},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`, color: d.color || PIE_COLORS_LIST[i % PIE_COLORS_LIST.length], label: d.name, value: d.value, pct };
                });
            return (
              <div style={{ display:"flex", gap:"16px", alignItems:"center", flexWrap:"wrap" }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
                  {slices.map((s, i) =>
                    s.fullCircle
                      ? <circle key={i} cx={cx} cy={cy} r={r} fill={s.color} stroke="#fff" strokeWidth="2" />
                      : <path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2" />
                  )}
                  <circle cx={cx} cy={cy} r={r * 0.52} fill="#fff" />
                  <text x={cx} y={cy - 6} textAnchor="middle" fontSize="15" fontWeight="800" fill="#0f172a">{total.toLocaleString()}</text>
                  <text x={cx} y={cy + 9} textAnchor="middle" fontSize="9" fill="#94a3b8">Total</text>
                </svg>
                <div style={{ display:"flex", flexDirection:"column", gap:"4px" }}>
                  {slices.map((s, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:"6px", fontSize:"11px" }}>
                      <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:s.color, flexShrink:0 }} />
                      <span style={{ color:"#475569" }}>{s.label}</span>
                      <span style={{ fontWeight:800, color:"#0f172a" }}>{s.value}</span>
                      <span style={{ color:"#94a3b8", fontSize:"10px" }}>({(s.pct*100).toFixed(0)}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          };

          const BarChartCompany = ({ data, height = 180 }) => {
            if (!data || data.length === 0) return <div style={{ color:"#94a3b8", fontSize:"13px", padding:"20px", textAlign:"center" }}>No data</div>;
            const maxVal = Math.max(...data.map(d => d.assetCount || 0), 1);
            return (
              <div style={{ overflowX:"auto" }}>
                <div style={{ display:"flex", alignItems:"flex-end", gap:"6px", minWidth:`${data.length * 60}px`, height:`${height}px`, padding:"8px 0" }}>
                  {data.map((d, i) => {
                    const barH = Math.max(((d.assetCount || 0) / maxVal) * (height - 48), d.assetCount ? 4 : 0);
                    const col = PIE_COLORS_LIST[i % PIE_COLORS_LIST.length];
                    return (
                      <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"2px", flex:1, minWidth:"50px" }}>
                        {d.assetCount > 0 && <span style={{ fontSize:"10px", fontWeight:700, color:col }}>{d.assetCount}</span>}
                        <div title={`${d.companyName}: ${d.assetCount} assets`} style={{ width:"100%", maxWidth:"32px", background:col, borderRadius:"4px 4px 0 0", height:`${barH}px`, transition:"opacity 0.12s", cursor:"default" }} onMouseEnter={e=>e.target.style.opacity="0.75"} onMouseLeave={e=>e.target.style.opacity="1"} />
                        <div style={{ fontSize:"9px", color:"#64748b", textAlign:"center", wordBreak:"break-all", lineHeight:1.2, maxWidth:"48px" }}>{(d.companyName||"").slice(0,10)}{(d.companyName||"").length>10?"...":""}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          };

          // Export helpers
          const exportToCSV = (rows, headers, filename) => {
            const lines = [headers.join(","), ...rows.map(r => headers.map(h => `"${(r[h]??'').toString().replace(/"/g,'""')}"`).join(","))];
            const blob = new Blob([lines.join("\n")], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
          };

          const ASSET_HEADERS = ["Company","Department","Asset Name","Asset ID","Type","Status","Building","Floor","Room","Make","Model","Serial No","Accessories","Dealer","Mfg Year","Installation Date","Invoice No","Purchase Date","Purchase Cost","Remarks","Created At"];
          const assetRowMapper = a => ({
            "Company": a.companyName||"", "Department": a.departmentName||"",
            "Asset Name": a.assetName||"", "Asset ID": a.assetUniqueId||"",
            "Type": a.assetType||"", "Status": a.status||"",
            "Building": a.building||"", "Floor": a.floor||"", "Room": a.room||"",
            "Make": a.make||"", "Model": a.model||"", "Serial No": a.serialNo||"",
            "Accessories": a.accessories||"", "Dealer": a.dealer||"",
            "Mfg Year": a.mfgYear||"", "Installation Date": a.installationDate||"",
            "Invoice No": a.invoiceNo||"", "Purchase Date": a.purchaseDate||"",
            "Purchase Cost": a.purchaseCost||"", "Remarks": a.remarks||"",
            "Created At": a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "",
          });

          const handleExport = async (type) => {
            const coParam = dashCompanyFilters.length > 0 ? ("&companyIds=" + dashCompanyFilters.join(",")) : "";
            if (type === "asset_profile" || type === "critical" || type === "non_critical" || type === "rber" || type === "new_addition" || type === "total_assets") {
              const statusMap = { asset_profile: "", total_assets: "", critical: "critical", non_critical: "non_critical", rber: "rber", new_addition: "new_addition" };
              const statusParam = statusMap[type] ? ("status=" + statusMap[type]) : "";
              const qs = [statusParam, coParam.slice(1)].filter(Boolean).join("&");
              try {
                const assets = await getClientAssets(token, qs);
                exportToCSV(assets.map(assetRowMapper), ASSET_HEADERS, (type === "asset_profile" || type === "total_assets" ? "all" : type) + "_assets.csv");
              } catch(e) { alert("Export failed: " + e.message); }
            } else if (type === "complaint_profile" && dashboardStats) {
              const cp = dashboardStats.complaintProfile || {};
              const rows = [
                { Category: "Total Complaints", Count: cp.total ?? 0 },
                { Category: "Work In Progress", Count: cp.wip ?? 0 },
                { Category: "< 7 Days", Count: cp.lt7d ?? 0 },
                { Category: "> 7 Days", Count: cp.gt7d ?? 0 },
                { Category: "Resolved", Count: cp.resolved ?? 0 },
                { Category: "Closed", Count: cp.closed ?? 0 },
              ];
              exportToCSV(rows, ["Category", "Count"], "complaint_profile.csv");
            } else if (type === "companies" && byCompany.length > 0) {
              const rows = byCompany.map(c => ({ Company: c.companyName || "", Assets: c.assetCount ?? 0, Employees: c.employeeCount ?? 0 }));
              exportToCSV(rows, ["Company", "Assets", "Employees"], "companies_summary.csv");
            } else {
              // Export all assets
              const qs = coParam ? coParam.slice(1) : "";
              try {
                const assets = await getClientAssets(token, qs);
                exportToCSV(assets.map(assetRowMapper), ASSET_HEADERS, "all_assets.csv");
              } catch(e) { alert("Export failed: " + e.message); }
            }
          };

          // Tile click handler - show drill-down on same dashboard
          const ASSET_TILES = ["total_assets","critical","non_critical","rber","new_addition"];
          const COMPLAINT_TILES = ["total_complaint","wip","lt7d","gt7d","resolved","closed"];
          const tileStatusMap = { total_assets: "", critical: "critical", non_critical: "non_critical", rber: "rber", new_addition: "new_addition" };

          const getDashUserSelectionKey = (u) => `${u.id}-${u.companyId}`;

          const handleTileClick = async (tileId) => {
            if (activeTile === tileId) { setActiveTile(null); setTileAssets(null); return; }
            setActiveTile(tileId);
            setTileAssets(null);
            // Scroll drill-down panel into view after React re-renders
            setTimeout(() => drillDownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
            if (ASSET_TILES.includes(tileId)) {
              setTileAssetsLoading(true);
              try {
                const coParam = dashCompanyFilters.length > 0 ? ("&companyIds=" + dashCompanyFilters.join(",")) : "";
                const statusParam = tileStatusMap[tileId] ? ("status=" + tileStatusMap[tileId]) : "";
                const qs = [statusParam, coParam.slice(1)].filter(Boolean).join("&");
                const rows = await getClientAssets(token, qs);
                setTileAssets(Array.isArray(rows) ? rows : []);
              } catch { setTileAssets([]); } finally { setTileAssetsLoading(false); }
            }
          };
          // Keep tile drill-down on the dashboard instead of navigating away.
          const handleViewAll = (tileId) => {
            setActiveTile(tileId);
          };

          // Drill-down data based on active tile
          const getDrillDownData = () => {
            if (!activeTile) return [];
            const ap = dashboardStats?.assetProfile || {};
            const cp = dashboardStats?.complaintProfile || {};
            if (activeTile === "total_assets") {
              return byCompany.map(c => ({ col1: c.companyName, col2: c.assetCount ?? 0, col3: c.employeeCount ?? 0, label1: "Company", label2: "Assets", label3: "Staff" }));
            }
            if (activeTile === "total_complaint") {
              return byCompany.map(c => ({ col1: c.companyName, col2: c.assetCount ?? 0, col3: c.employeeCount ?? 0, label1: "Company", label2: "Assets", label3: "Staff" }));
            }
            return [];
          };

          const tileConfig = {
            total_assets:      { label: "TOTAL ASSETS",      value: dashboardStats ? (assetProfile.total ?? totalAssets) : null, col: "#2563eb" },
            critical:          { label: "CRITICAL",           value: dashboardStats ? (assetProfile.critical ?? 0) : null, col: "#dc2626" },
            non_critical:      { label: "NON-CRITICAL",       value: dashboardStats ? (assetProfile.nonCritical ?? 0) : null, col: "#16a34a" },
            total_asset_value: { label: "TOTAL ASSET VALUE",  value: dashboardStats ? (() => { const v = Number(assetProfile.totalAssetValue || 0); return v >= 10000000 ? `₹${(v/10000000).toFixed(2)}Cr` : v >= 100000 ? `₹${(v/100000).toFixed(2)}L` : v >= 1000 ? `₹{(v/1000).toFixed(1)}K` : `₹${v.toFixed(0)}`; })() : null, col: "#0891b2", noFilter: true },
            rber:              { label: "RBER",               value: dashboardStats ? (assetProfile.rber ?? 0) : null, col: "#7c3aed" },
            new_addition:      { label: "NEW ADDITION",       value: dashboardStats ? (assetProfile.newAdditions ?? 0) : null, col: "#0d9488" },
            total_complaint:{ label: "TOTAL COMPLAINT",    value: dashboardStats ? (complaintProfile.total ?? 0) : null, col: "#ea580c" },
            wip:            { label: "WORK IN PROGRESS",   value: dashboardStats ? (complaintProfile.wip ?? 0) : null, col: "#ca8a04" },
            lt7d:           { label: "< 7 DAYS",           value: dashboardStats ? (complaintProfile.lt7d ?? 0) : null, col: "#2563eb" },
            gt7d:           { label: "> 7 DAYS",           value: dashboardStats ? (complaintProfile.gt7d ?? 0) : null, col: "#dc2626" },
            resolved:       { label: "RESOLVED",           value: dashboardStats ? (complaintProfile.resolved ?? 0) : null, col: "#16a34a" },
            closed:         { label: "CLOSED",             value: dashboardStats ? (complaintProfile.closed ?? 0) : null, col: "#475569" },
          };

          const TILE_ICONS = {
            total_assets:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>,
            critical:          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
            non_critical:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
              total_asset_value: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
              rber:              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
          
            new_addition:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
            total_complaint: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
            wip:             <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
            lt7d:            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
            gt7d:            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>,
            resolved:        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
            closed:          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
          };

          const KpiTile = ({ id, label, value, col, icon, noFilter }) => {
            const isActive = activeTile === id;
            const bgLight = col + "12";
            const borderLight = col + "40";
            return (
              <div
                onClick={() => !noFilter && handleTileClick(id)}
                style={{
                  background: isActive ? bgLight : "#fff",
                  borderRadius: "10px",
                  border: isActive ? `2px solid ${col}` : `1px solid ${borderLight}`,
                  padding: "10px 10px 8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "5px",
                  minHeight: "82px",
                  boxShadow: isActive ? `0 2px 10px ${col}33` : "0 1px 3px rgba(0,0,0,0.04)",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  position: "relative",
                  textAlign: "center",
                  userSelect: "none",
                }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 14px ${col}33`; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = isActive ? `0 2px 10px ${col}33` : "0 1px 3px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "none"; }}
              >
                {isActive && <div style={{ position: "absolute", top: "6px", left: "6px", width: "6px", height: "6px", borderRadius: "50%", background: col }} />}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
                  <div style={{ width: "22px", height: "22px", background: bgLight, borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", color: col, flexShrink: 0 }}>
                    {icon}
                  </div>
                  <p style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0, lineHeight: 1.2, textAlign: "left" }}>{label}</p>
                </div>
                <div>
                  {value !== null && value !== undefined
                    ? <p style={{ fontSize: "26px", fontWeight: 900, color: isActive ? col : col, margin: 0, lineHeight: 1, letterSpacing: "-0.5px" }}>{value}</p>
                    : <div style={{ width: "40px", height: "22px", background: "#f1f5f9", borderRadius: "4px", margin: "0 auto" }} />}
                </div>
              </div>
            );
          };

          // Asset status pie data
          const assetPieData = dashboardStats ? [
            { name: "Critical",     value: assetProfile.critical     || 0, color: "#dc2626" },
            { name: "Non-Critical", value: assetProfile.nonCritical  || 0, color: "#16a34a" },
            { name: "RBER",         value: assetProfile.rber         || 0, color: "#7c3aed" },
            { name: "Condemned",    value: assetProfile.condemned    || 0, color: "#64748b" },
          ].filter(d => d.value > 0) : [];

          // Complaint status pie data
          const complaintPieData = dashboardStats ? [
            { name: "WIP",      value: complaintProfile.wip      || 0, color: "#ca8a04" },
            { name: "< 7 Days", value: complaintProfile.lt7d     || 0, color: "#2563eb" },
            { name: "> 7 Days", value: complaintProfile.gt7d     || 0, color: "#dc2626" },
            { name: "Resolved", value: complaintProfile.resolved || 0, color: "#16a34a" },
            { name: "Closed",   value: complaintProfile.closed   || 0, color: "#475569" },
          ].filter(d => d.value > 0) : [];

          return (
            <div style={{ fontFamily: "'Inter',-apple-system,sans-serif" }}>

              {/* ×××××× Header ×××××× */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "3px" }}>
                    <div style={{ width: "34px", height: "34px", background: "#eff6ff", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563eb", flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                    </div>
                    <h1 style={{ fontSize: "20px", fontWeight: 800, color: "#0f172a", margin: 0 }}>
                      Client Dashboard{dashCompanyFilters.length === 1 ? `: ${companies.find(c => String(c.id) === dashCompanyFilters[0])?.companyName || ""}` : dashCompanyFilters.length > 1 ? ` (${dashCompanyFilters.length} companies)` : ""}
                    </h1>
                  </div>
                  <p style={{ color: "#64748b", fontSize: "12.5px", margin: 0 }}>
                    {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  {/* Multi-company filter */}
                  <div style={{ position: "relative" }} ref={r => { if (r) r._closeOnBlur = () => setDashFilterOpen(false); }}>
                    <button onClick={() => { setDashCompanyPending(dashCompanyFilters); setDashCompanySearch(""); setDashFilterOpen(o => !o); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 12px", border: `1px solid ${dashUserFilters.length > 0 && dashCompanyFilters.length > 0 ? "#7c3aed" : dashCompanyFilters.length > 0 ? "#2563eb" : "#e2e8f0"}`, borderRadius: "8px", fontSize: "13px", background: dashUserFilters.length > 0 && dashCompanyFilters.length > 0 ? "#faf5ff" : "#fff", color: dashUserFilters.length > 0 && dashCompanyFilters.length > 0 ? "#7c3aed" : "#374151", cursor: "pointer", minWidth: "160px", justifyContent: "space-between" }}>
                      <span>
                        {dashUserFilters.length > 0 && dashCompanyFilters.length > 0
                          ? `${dashCompanyFilters.length} co. (from user filter)`
                          : dashCompanyFilters.length === 0 ? "All Companies"
                          : dashCompanyFilters.length === 1 ? (companies.find(c => String(c.id) === dashCompanyFilters[0])?.companyName || "1 company")
                          : `${dashCompanyFilters.length} companies`}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                    {dashFilterOpen && (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 300, minWidth: "220px", overflow: "hidden" }}>
                        <div style={{ padding: "8px 6px 6px" }}>
                          <div style={{ padding: "2px 4px 8px" }}>
                            <input
                              autoFocus
                              value={dashCompanySearch}
                              onChange={(e) => setDashCompanySearch(e.target.value)}
                              placeholder="Search companies..."
                              style={{ width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", boxSizing: "border-box" }}
                            />
                          </div>
                          {dashUserFilters.length > 0 && (
                            <div style={{ padding: "4px 10px 8px", fontSize: "11px", color: "#7c3aed", fontWeight: 600, display: "flex", alignItems: "center", gap: "5px" }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                              Auto-filtered by selected users
                            </div>
                          )}
                          <button onClick={() => { setDashCompanyPending([]); }}
                            style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "none", borderRadius: "6px", background: dashCompanyPending.length === 0 ? "#eff6ff" : "transparent", color: dashCompanyPending.length === 0 ? "#2563eb" : "#374151", cursor: "pointer", fontWeight: dashCompanyPending.length === 0 ? 700 : 400, fontSize: "13px" }}>
                            All Companies
                          </button>
                          {companies
                            .filter((co) => {
                              // When user filter is active, only list companies assigned to selected users
                              // BUT only apply this restriction if byUser actually has data for those users
                              if (dashUserFilters.length > 0) {
                                const userCompanyIds = new Set(
                                  byUser.filter(u2 => dashUserFilters.includes(getDashUserSelectionKey(u2))).map(u2 => String(u2.companyId))
                                );
                                // If we got a valid non-empty intersection, filter; otherwise show all (byUser may be scoped to fewer companies)
                                if (userCompanyIds.size > 0 && !userCompanyIds.has(String(co.id))) return false;
                              }
                              const q = (dashCompanySearch || "").toLowerCase().trim();
                              if (!q) return true;
                              return (co.companyName || "").toLowerCase().includes(q);
                            })
                            .map(co => {
                            const sid = String(co.id);
                            const checked = dashCompanyPending.includes(sid);
                            return (
                              <label key={co.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", cursor: "pointer", borderRadius: "6px", fontSize: "13px", color: "#374151" }}
                                onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                                onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                                <input type="checkbox" checked={checked} onChange={() => {
                                  setDashCompanyPending(prev => checked ? prev.filter(x => x !== sid) : [...prev, sid]);
                                }} style={{ accentColor: "#2563eb" }} />
                                {co.companyName}
                              </label>
                            );
                          })}
                          <div style={{ borderTop: "1px solid #f1f5f9", padding: "8px 6px 4px", display: "flex", gap: "6px" }}>
                            <button onClick={() => { setDashCompanyPending([]); setDashCompanyFilters([]); setActiveTile(null); setDashFilterOpen(false); }}
                              style={{ flex: 1, padding: "7px 0", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#f8fafc", color: "#64748b", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                              Clear
                            </button>
                            <button onClick={() => { setDashCompanyFilters(dashCompanyPending); setActiveTile(null); setDashFilterOpen(false); }}
                              style={{ flex: 2, padding: "7px 0", border: "none", borderRadius: "6px", background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
                              Apply
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Multi-user filter — show each user once; selecting picks ALL their company composite keys */}
                  <div style={{ position: "relative" }}>
                    {(() => {
                      // Deduplicated user list (one entry per unique user ID)
                      const uniqueUserIds = [...new Set(byUser.map(u => u.id))];
                      const selectedUserIds = [...new Set(
                        byUser.filter(u2 => dashUserFilters.includes(getDashUserSelectionKey(u2))).map(u2 => u2.id)
                      )];
                      return (<>
                        <button onClick={() => { setDashUserSearch(""); setDashUserFilterOpen(o => !o); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 12px", border: `1px solid ${selectedUserIds.length > 0 ? "#2563eb" : "#e2e8f0"}`, borderRadius: "8px", fontSize: "13px", background: selectedUserIds.length > 0 ? "#eff6ff" : "#fff", color: selectedUserIds.length > 0 ? "#2563eb" : "#374151", cursor: "pointer", minWidth: "170px", justifyContent: "space-between" }}>
                          <span>{selectedUserIds.length === 0 ? "All Users" : selectedUserIds.length === 1 ? "1 user" : `${selectedUserIds.length} users`}</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        {dashUserFilterOpen && (
                          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 300, minWidth: "260px", maxHeight: "360px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                            <div style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>
                              <input
                                autoFocus
                                value={dashUserSearch}
                                onChange={(e) => setDashUserSearch(e.target.value)}
                                placeholder="Search users..."
                                style={{ width: "100%", padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: "7px", fontSize: "12px", boxSizing: "border-box" }}
                              />
                            </div>
                            <div style={{ padding: "6px", overflowY: "auto", flex: 1 }}>
                              <button onClick={() => {
                                setDashUserFilters([]);
                                setDashCompanyFilters([]);
                                setActiveTile(null);
                                setDashUserFilterOpen(false);
                              }}
                                style={{ width: "100%", textAlign: "left", padding: "7px 10px", border: "none", borderRadius: "6px", background: selectedUserIds.length === 0 ? "#eff6ff" : "transparent", color: selectedUserIds.length === 0 ? "#2563eb" : "#374151", cursor: "pointer", fontWeight: selectedUserIds.length === 0 ? 700 : 400, fontSize: "12px" }}>
                                All Users
                              </button>
                              {uniqueUserIds
                                .map(uid => byUser.find(u => u.id === uid))
                                .filter(u => {
                                  if (!u) return false;
                                  const q = (dashUserSearch || "").toLowerCase();
                                  if (!q) return true;
                                  return (
                                    (u.userName || "").toLowerCase().includes(q) ||
                                    (u.email || "").toLowerCase().includes(q)
                                  );
                                })
                                .map(u => {
                                  // All composite keys for this user across all their companies
                                  const allKeysForUser = byUser.filter(u2 => u2.id === u.id).map(u2 => getDashUserSelectionKey(u2));
                                  const userCompanyNames = byUser.filter(u2 => u2.id === u.id).map(u2 => u2.companyName).filter(Boolean);
                                  const checked = selectedUserIds.includes(u.id);
                                  return (
                                    <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", cursor: "pointer", borderRadius: "6px", fontSize: "12px", color: "#374151", background: checked ? "#eff6ff" : "transparent" }}
                                      onMouseEnter={e => { if (!checked) e.currentTarget.style.background="#f8fafc"; }}
                                      onMouseLeave={e => { e.currentTarget.style.background = checked ? "#eff6ff" : "transparent"; }}>
                                      <input type="checkbox" checked={checked} onChange={() => {
                                        // Toggle all composite keys for this user
                                        const next = checked
                                          ? dashUserFilters.filter(x => !allKeysForUser.includes(x))
                                          : [...new Set([...dashUserFilters, ...allKeysForUser])];
                                        setDashUserFilters(next);
                                        if (next.length > 0) {
                                          const autoCompanyIds = [...new Set(
                                            byUser.filter(u2 => next.includes(getDashUserSelectionKey(u2))).map(u2 => String(u2.companyId))
                                          )];
                                          setDashCompanyFilters(autoCompanyIds);
                                        } else {
                                          setDashCompanyFilters([]);
                                        }
                                        setActiveTile(null);
                                      }} style={{ accentColor: "#2563eb" }} />
                                      <div>
                                        <div style={{ fontWeight: checked ? 700 : 600, color: checked ? "#2563eb" : "#0f172a" }}>{u.userName || u.email}</div>
                                        <div style={{ fontSize: "11px", color: "#94a3b8" }}>{userCompanyNames.length > 1 ? `${userCompanyNames.length} companies` : userCompanyNames[0] || ""}</div>
                                      </div>
                                    </label>
                                  );
                                })}
                            </div>
                            <div style={{ borderTop: "1px solid #f1f5f9", padding: "8px 6px 4px", display: "flex", gap: "6px" }}>
                              <button onClick={() => { setDashUserFilters([]); setDashCompanyFilters([]); setActiveTile(null); }}
                                style={{ flex: 1, padding: "7px 0", border: "1px solid #e2e8f0", borderRadius: "6px", background: "#f8fafc", color: "#64748b", cursor: "pointer", fontSize: "12px", fontWeight: 600 }}>
                                Clear
                              </button>
                              <button onClick={() => { setDashUserFilterOpen(false); }}
                                style={{ flex: 2, padding: "7px 0", border: "none", borderRadius: "6px", background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: "12px", fontWeight: 700 }}>
                                Apply{selectedUserIds.length > 0 ? ` (${selectedUserIds.length} user${selectedUserIds.length !== 1 ? "s" : ""})` : ""}
                              </button>
                            </div>
                          </div>
                        )}
                      </>);
                    })()}
                  </div>
                  {/* Export All button with dropdown */}
                  <div style={{ position: "relative" }}>
                        <button onClick={() => setDashExportOpen(o => !o)}
                          style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#0f172a", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Export
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        {dashExportOpen && (
                          <div style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200, minWidth: "210px", overflow: "hidden" }}>
                            {[
                              { id: "total_assets",    label: "All Assets",         icon: "" },
                              { id: "critical",        label: "Critical Assets",     icon: "" },
                              { id: "non_critical",    label: "Non-Critical Assets", icon: "" },
                              { id: "rber",            label: "RBER Assets",         icon: "" },
                              { id: "rber",            label: "RBER Assets",          icon: "" },
                              { id: "new_addition",    label: "New Addition Assets",  icon: "" },
                              { id: "complaint_profile",label: "Complaint Profile (CSV)", icon: "" },
                              { id: "companies",       label: "Companies Summary",   icon: "" },
                            ].map(opt => (
                              <button key={opt.id} onClick={() => { handleExport(opt.id); setDashExportOpen(false); }}
                                style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", fontSize: "13px", color: "#374151", textAlign: "left" }}
                                onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                                onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                                <span>{opt.icon}</span>{opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                </div>
              </div>

              {/* ═══ USER-WISE VIEW ═══ */}
              {dashView === "user" && (
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>User-Wise Overview</span>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>({dashUserFilters.length > 0 ? `${byUser.filter(u => dashUserFilters.includes(getDashUserSelectionKey(u))).length} of ` : ""}{byUser.length} users)</span>
                    {dashUserFilters.length > 0 && (
                      <button onClick={() => { setDashUserFilters([]); setDashCompanyFilters([]); setActiveTile(null); }}
                        style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: "6px", border: "none", background: "#fee2e2", color: "#dc2626", cursor: "pointer", fontSize: "11.5px", fontWeight: 600 }}>
                        Clear user filter
                      </button>
                    )}
                  </div>
                  {byUser.length === 0 ? (
                    <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                      {dashboardStats ? "No user data available" : "Loading..."}
                    </div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                        <thead>
                          <tr style={{ background: "#f8fafc" }}>
                            {["#", "Name", "Email", "Role", "Company", "Assets Created", "Complaints Created"].map(h => (
                              <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(dashUserFilters.length > 0 ? byUser.filter(u => dashUserFilters.includes(getDashUserSelectionKey(u))) : byUser).map((u, i) => (
                            <tr key={`${u.id}-${u.companyId}`} style={{ borderBottom: "1px solid #f1f5f9" }}
                              onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                              onMouseLeave={e => e.currentTarget.style.background = ""}>
                              <td style={{ padding: "10px 14px", color: "#94a3b8", fontWeight: 600, fontSize: "12px" }}>{i + 1}</td>
                              <td style={{ padding: "10px 14px", fontWeight: 600, color: "#0f172a" }}>{u.userName || "-"}</td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{u.email || "-"}</td>
                              <td style={{ padding: "10px 14px" }}>
                                <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700,
                                  background: { admin: "#dbeafe", supervisor: "#fef9c3", technician: "#dcfce7" }[u.role] || "#f1f5f9",
                                  color: { admin: "#1d4ed8", supervisor: "#854d0e", technician: "#166534" }[u.role] || "#475569" }}>
                                  {u.role || "employee"}
                                </span>
                              </td>
                              <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{u.companyName || "-"}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "#2563eb" }}>{u.createdAssets ?? 0}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 700, color: "#ea580c" }}>{u.createdComplaints ?? 0}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ═══ COMPANY-WISE VIEW ═══ */}
              {dashView === "company" && (<>

              {/* ×××××× ASSET PROFILE ×××××× */}
              <div style={{ marginBottom: "20px" }}>
                <div style={{ marginBottom: "10px" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>Asset Profile</h2>
                  <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>Click a tile to navigate to that report</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                  {["total_assets","critical","non_critical","total_asset_value","rber",,"new_addition"].map(id => {
                    const t = tileConfig[id];
                    return <KpiTile key={id} id={id} label={t.label} value={t.value} col={t.col} icon={TILE_ICONS[id]} noFilter={t.noFilter} />;
                  })}
                </div>
              </div>

              {/* ×××××× COMPLAINT PROFILE ×××××× */}
              <div style={{ marginBottom: "24px" }}>
                <div style={{ marginBottom: "10px" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>Complaint Profile</h2>
                  <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>Click a tile to navigate to that report</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                  {["total_complaint","wip","lt7d","gt7d","resolved","closed"].map(id => {
                    const t = tileConfig[id];
                    return <KpiTile key={id} id={id} label={t.label} value={t.value} col={t.col} icon={TILE_ICONS[id]} />;
                  })}
                </div>
              </div>

              {/* ×××××× CALIBRATION PROFILE ×××××× */}
              {dashboardStats?.calibrationProfile && (() => {
                const cp = dashboardStats.calibrationProfile;
                const calTiles = [
                  { label: "Due This Month", value: cp.dueThisMonth ?? 0, col: "#f59e0b" },
                  { label: "Overdue", value: cp.overdue ?? 0, col: "#ef4444" },
                  { label: "Upcoming (30 Days)", value: cp.upcoming30d ?? 0, col: "#3b82f6" },
                  { label: "Completed This Month", value: cp.completedThisMonth ?? 0, col: "#10b981" },
                ];
                return (
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ marginBottom: "10px" }}>
                      <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>Calibration Profile</h2>
                      <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>{cp.total ?? 0} assets require calibration</p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
                      {calTiles.map(t => (
                        <div key={t.label} style={{
                          background: "#fff", borderRadius: "10px", border: `1px solid ${t.col}40`,
                          padding: "10px 10px 8px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                          gap: "5px", minHeight: "82px", textAlign: "center"
                        }}>
                          <p style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>{t.label}</p>
                          <p style={{ fontSize: "26px", fontWeight: 900, color: t.col, margin: 0, lineHeight: 1, letterSpacing: "-0.5px" }}>{t.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ×××××× Drill-down panel (when tile clicked) ×××××× */}
              {activeTile && (
                <div ref={drillDownRef} style={{ marginBottom: "24px", background: "#fff", borderRadius: "12px", border: `1px solid ${tileConfig[activeTile]?.col}33`, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.06)" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ color: tileConfig[activeTile]?.col }}>{TILE_ICONS[activeTile]}</span>
                      <span style={{ fontWeight: 700, fontSize: "14px", color: "#0f172a" }}>
                        {tileConfig[activeTile]?.label}
                        {ASSET_TILES.includes(activeTile) ? " — Asset List" : " — Company Breakdown"}
                      </span>
                      <span style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 500 }}>Total: <strong style={{ color: tileConfig[activeTile]?.col }}>{tileConfig[activeTile]?.value ?? "..."}</strong></span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      {ASSET_TILES.includes(activeTile) && (
                        <button onClick={() => handleExport(activeTile)} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 12px", borderRadius: "7px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#374151", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                          Export CSV
                        </button>
                      )}
                      <button onClick={() => { setActiveTile(null); setTileAssets(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: "4px" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                  <div style={{ padding: "0", maxHeight: "420px", overflowY: "auto" }}>
                    {ASSET_TILES.includes(activeTile) ? (
                      tileAssetsLoading ? (
                        <div style={{ textAlign: "center", color: "#94a3b8", padding: "32px", fontSize: "13px" }}>Loading assets…</div>
                      ) : !tileAssets || tileAssets.length === 0 ? (
                        <div style={{ textAlign: "center", color: "#94a3b8", padding: "32px", fontSize: "13px" }}>No assets found for this filter.</div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px" }}>
                          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                            <tr style={{ background: "#f8fafc" }}>
                              {["#","Company","Asset Name","Asset ID","Type","Status","Department","Building"].map(h => (
                                <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tileAssets.map((a, i) => (
                              <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }} onMouseEnter={e => e.currentTarget.style.background="#f8fafc"} onMouseLeave={e => e.currentTarget.style.background=""}>
                                <td style={{ padding: "9px 12px", color: "#94a3b8", fontSize: "11px" }}>{i + 1}</td>
                                <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{a.companyName || "—"}</td>
                                <td style={{ padding: "9px 12px", color: "#1e293b", cursor: "pointer" }} onClick={() => setViewingAsset(a)}>{a.assetName || a.equipmentName || "—"}</td>
                                <td style={{ padding: "9px 12px" }}>
                                  <button onClick={() => window.open(`/company/asset/${a.id}`, '_blank')} style={{ background: "none", border: "none", fontFamily: "monospace", color: "#2563eb", fontSize: "11.5px", cursor: "pointer", textDecoration: "underline", padding: 0, fontWeight: 600 }}>{a.assetUniqueId || "—"}</button>
                                </td>
                                <td style={{ padding: "9px 12px", color: "#475569" }}>{a.assetType || "—"}</td>
                                <td style={{ padding: "9px 12px" }}>
                                  <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: tileConfig[activeTile]?.col + "22", color: tileConfig[activeTile]?.col }}>{a.status || "—"}</span>
                                </td>
                                <td style={{ padding: "9px 12px", color: "#64748b" }}>{a.departmentName || "—"}</td>
                                <td style={{ padding: "9px 12px", color: "#64748b" }}>{a.building || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    ) : (
                      /* Complaint / other tiles: company breakdown */
                      byCompany.length === 0 ? (
                        <div style={{ textAlign: "center", color: "#94a3b8", padding: "24px", fontSize: "13px" }}>
                          {dashboardStats ? "No company data available" : "Loading data..."}
                        </div>
                      ) : (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                          <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                            <tr style={{ background: "#f8fafc" }}>
                              <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>#</th>
                              <th style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>Company</th>
                              <th style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>Total Assets</th>
                              <th style={{ padding: "9px 12px", textAlign: "right", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase" }}>Staff</th>
                            </tr>
                          </thead>
                          <tbody>
                            {byCompany.map((c, i) => (
                              <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }} onMouseEnter={e=>e.currentTarget.style.background="#fafafa"} onMouseLeave={e=>e.currentTarget.style.background=""}>
                                <td style={{ padding: "10px 12px", color: "#94a3b8", fontWeight: 600 }}>{i+1}</td>
                                <td style={{ padding: "10px 12px", fontWeight: 600, color: "#0f172a" }}>{c.companyName}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: tileConfig[activeTile]?.col }}>{c.assetCount ?? 0}</td>
                                <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b" }}>{c.employeeCount ?? 0}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* ×××××× Charts Row ×××××× */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>

                {/* Asset Status Pie */}
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "18px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                    <span style={{ fontWeight: 700, fontSize: "12px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em" }}>Asset Status</span>
                  </div>
                  <DonutChart data={assetPieData} size={140} />
                </div>

                {/* Complaint Status Pie */}
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "18px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                    <span style={{ fontWeight: 700, fontSize: "12px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em" }}>Complaint Status</span>
                  </div>
                  <DonutChart data={complaintPieData} size={140} />
                </div>

                {/* Assets per Company Bar */}
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "18px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    <span style={{ fontWeight: 700, fontSize: "12px", color: "#0f172a", textTransform: "uppercase", letterSpacing: "0.05em" }}>Assets per Company</span>
                  </div>
                  <BarChartCompany data={byCompany} height={160} />
                </div>

              </div>

              {/* ×××××× Summary Stats Row ×××××× */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "12px" }}>
                {[
                  { label: "Total Companies", value: totalCompanies, col: "#2563eb", bg: "#eff6ff", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/><path d="M9 9h1"/><path d="M14 9h1"/><path d="M9 13h1"/><path d="M14 13h1"/></svg> },
                  { label: "Active Companies", value: activeCompanies, col: "#16a34a", bg: "#f0fdf4", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> },
                  { label: "Total Assets", value: dashboardStats ? totalAssets : "...", col: "#7c3aed", bg: "#faf5ff", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg> },
                  { label: "Total Employees", value: dashboardStats ? totalEmployees : "...", col: "#0d9488", bg: "#f0fdfa", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
                ].map(k => (
                  <div key={k.label} style={{ background: "#fff", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "40px", height: "40px", background: k.bg, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", color: k.col, flexShrink: 0 }}>{k.icon}</div>
                    <div>
                      <p style={{ color: "#64748b", fontSize: "11px", fontWeight: 600, margin: 0, marginBottom: "3px" }}>{k.label}</p>
                      <p style={{ fontSize: "24px", fontWeight: 800, color: k.col, margin: 0, lineHeight: 1 }}>{k.value ?? "..."}</p>
                    </div>
                  </div>
                ))}
              </div>

              </>)} {/* end company view */}

            </div>
          );
        })()} 

        </div>
      </div>

    </div>

  );

};

export default CompanyPortal;





