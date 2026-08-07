/**
 * AssetDetailPage – standalone full-screen asset detail view.
 * Opened in a new browser tab when the user clicks an asset ID.
 *
 * URL: /company/portal/asset/:id
 * Auth: reads cp_token from sessionStorage (company employee) OR
 *       company_portal_token from localStorage (admin portal).
 */
import { useEffect, useState, useContext, createContext } from "react";
import * as XLSX from "xlsx";
import { useParams } from "react-router-dom";

const getApiBaseUrl = () => {
  if (typeof window !== "undefined" && window.VITE_API_URL) return window.VITE_API_URL;
  return import.meta.env?.VITE_API_URL || "";
};

const fmt = (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "—");

// ─── Excel export helper ──────────────────────────────────────────────────────
function exportToExcel(rows, sheetName = "Export") {
  if (!rows || rows.length === 0) return;
  const ws = XLSX.utils.aoa_to_sheet(rows);
  // Auto column widths
  const colWidths = rows[0].map((_, ci) =>
    Math.max(...rows.map(r => String(r[ci] ?? "").length), 10) + 2
  );
  ws["!cols"] = colWidths.map(w => ({ wch: Math.min(w, 40) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${sheetName.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
// Convert any date format (dd/mm/yyyy, dd-mm-yyyy, ISO, etc.) → yyyy-MM-dd for <input type="date">
const toIsoDate = (d) => {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.substring(0, 10);
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(d)) { const p = d.split(/[\/\-]/); return `${p[2]}-${p[1]}-${p[0]}`; }
  const dt = new Date(d); return isNaN(dt) ? "" : dt.toISOString().substring(0, 10);
};

// ─── Edit-form helpers (defined at module level so they are stable component
// types across renders — prevents inputs losing focus on every keystroke) ──────
const EditCtx = createContext(null);

function EField({ label, children, full }) {
  return (
    <div style={full ? { gridColumn: "1 / -1" } : {}}>
      <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
}

function EInput({ label, fkey, type = "text", full, placeholder }) {
  const { editForm, setEditForm } = useContext(EditCtx);
  return (
    <EField label={label} full={full}>
      <input type={type} value={editForm[fkey] || ""} onChange={e => setEditForm(p => ({ ...p, [fkey]: e.target.value }))}
        placeholder={placeholder || ""}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
    </EField>
  );
}

function ESec({ title }) {
  return (
    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #f1f5f9", paddingTop: "12px", marginTop: "4px" }}>
      <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</p>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────────────────────

export default function AssetDetailPage() {
  const { id } = useParams();
  const cpToken = sessionStorage.getItem("cp_token");
  const adminToken = localStorage.getItem("company_portal_token");
  const token = cpToken || adminToken;
  const isAdmin = !cpToken && !!adminToken;
  const cpUser = (() => { try { return JSON.parse(sessionStorage.getItem("cp_user") || "null"); } catch { return null; } })();
  const canTransfer = isAdmin || (!!cpToken && cpUser?.role === "admin");

  const [asset, setAsset] = useState(null);
  const [callLogs, setCallLogs] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [pmsHistory, setPmsHistory] = useState(null);
  const [pmsHistoryLoading, setPmsHistoryLoading] = useState(false);
  const [selectedPms, setSelectedPms] = useState(null);
  const [pmsDetail, setPmsDetail] = useState(null);
  const [pmsDetailLoading, setPmsDetailLoading] = useState(false);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCallLog, setSelectedCallLog] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [locBuildings, setLocBuildings] = useState([]);
  const [locFloors, setLocFloors] = useState([]);
  const [locRooms, setLocRooms] = useState([]);
  const [locDepts, setLocDepts] = useState([]);
  const [transferHistory, setTransferHistory] = useState(null);
  const [transferHistoryLoading, setTransferHistoryLoading] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ toCompanyId: "", toDepartmentId: "", reason: "", remarks: "" });
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState(null);
  const [transferSuccess, setTransferSuccess] = useState(null);
  const [transferCompanies, setTransferCompanies] = useState([]);
  const [transferDepts, setTransferDepts] = useState([]);

  // Hospital / company name from session
  const hospitalName = cpUser?.companyName || "";
  useEffect(() => {
    if (!token || !id) { setError("Not authenticated or asset not found."); setLoading(false); return; }
    const base = getApiBaseUrl();
    const assetUrl = isAdmin
      ? `${base}/api/companies/assets/${id}`
      : `${base}/api/company-portal/assets/${id}`;
    fetch(assetUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => { setAsset(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [id, token, isAdmin]);

  useEffect(() => {
    if (!token || !id || isAdmin) {
      // Admin view: work orders and calibration require company-employee auth — skip
      if (isAdmin) { setCallLogs([]); setCalibration([]); }
      return;
    }
    const base = getApiBaseUrl();
    // Fetch work-orders AND asset queries (QR-scan requests) so downtime includes both sources
    Promise.all([
      fetch(`${base}/api/company-portal/work-orders?assetId=${id}&limit=200`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => Array.isArray(d?.data) ? d.data : [])
        .catch(() => []),
      fetch(`${base}/api/company-portal/asset-queries?assetId=${id}&limit=200`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(d => (Array.isArray(d) ? d : []).map(q => ({
          ...q,
          // Normalise to work-order field names used in downtime calculation
          wipAt: q.wipAt || null,
          resolutionAt: q.resolvedAt || null,
          closedAt: q.resolvedAt || null,
        })))
        .catch(() => []),
    ]).then(([workOrders, assetQueries]) => setCallLogs([...workOrders, ...assetQueries]));
    fetch(`${base}/api/company-portal/assets/${id}/calibration-records`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setCalibration(Array.isArray(d) ? d : []))
      .catch(() => setCalibration([]));
  }, [id, token, isAdmin]);


  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Inter, sans-serif", color: "#64748b" }}>
      Loading asset details…
    </div>
  );
  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Inter, sans-serif", color: "#dc2626" }}>
      {error}
    </div>
  );
  if (!asset) return null;

  const m = typeof asset.metadata === "string"
    ? (() => { try { return JSON.parse(asset.metadata || "{}"); } catch { return {}; } })()
    : (asset.metadata || {});

  // Normalize maintenance types from both mobile and web schemas
  const maintenanceTypes = m.maintenanceTypes || {
    warranty: !!(m.warranty?.enabled),
    amc: !!(m.amc?.enabled),
    cmc: !!(m.cmc?.enabled),
    inHouse: !!(m.inHouse),
    catalyst: !!(m.catalyst),
    highEnd: !!(m.highEnd),
    rented: !!(m.rented),
  };
  const warrantyStart = m.warrantyStart || m.warranty?.startDate || "";
  const warrantyEnd = m.warrantyEnd || m.warranty?.endDate || "";
  const amcStart = m.amcStart || m.amc?.startDate || "";
  const amcEnd = m.amcEnd || m.amc?.endDate || "";
  const cmcStart = m.cmcStart || m.cmc?.startDate || "";
  const cmcEnd = m.cmcEnd || m.cmc?.endDate || "";

  const maint = [
    maintenanceTypes.warranty && "Warranty",
    maintenanceTypes.amc && "AMC",
    maintenanceTypes.cmc && "CMC",
    maintenanceTypes.inHouse && "In House",
    maintenanceTypes.catalyst && "Catalyst",
    maintenanceTypes.highEnd && "High End",
    maintenanceTypes.rented && "Rented",
  ].filter(Boolean).join(", ") || m.maintenanceType || "—";

  const apiBase = getApiBaseUrl();
  const normalizeImgUrl = (img) => {
    const raw = typeof img === "string" ? img : (img?.url || img?.src || img?.path || "");
    if (!raw || typeof raw !== "string") return "";
    if (raw.startsWith("http")) return raw;
    // Relative path — prefix with the backend API base URL so the browser
    // resolves to the correct server, not the frontend origin.
    const base = apiBase.replace(/\/$/, "");
    return raw.startsWith("/") ? `${base}${raw}` : `${base}/${raw}`;
  };

  const images = [
    ...(Array.isArray(m.hcImages) ? m.hcImages : []),
    ...(Array.isArray(m.images) ? m.images : []),
    ...(Array.isArray(m.invoiceImages) ? m.invoiceImages : []),
    ...(m.invoiceUrl ? [m.invoiceUrl] : []),
  ].map(normalizeImgUrl).filter(Boolean);

  // Downtime = resolutionAt − wipAt (only for resolved/completed/closed tickets; 0 otherwise)
  const calcDownMs = (wo) => {
    const isFinished = wo.status === "closed" || wo.status === "completed" || wo.status === "resolved";
    if (!isFinished) return 0;
    // Backend stores accumulated minutes across reopen cycles — use it when available
    if (wo.downtimeMinutes != null) return wo.downtimeMinutes * 60000;
    const end = wo.resolutionAt || wo.closedAt;
    const start = wo.wipAt;
    if (!end || !start) return 0;
    return Math.max(0, new Date(end) - new Date(start));
  };

  // ── MTTR: Mean Time To Repair = Total Repair Time ÷ Number of Completed Breakdowns ──────
  const completedBreakdowns = (callLogs || []).filter(wo =>
    wo.downtimeMinutes != null ||
    ((wo.status === "completed" || wo.status === "closed" || wo.status === "resolved") &&
      wo.createdAt && (wo.resolutionAt || wo.closedAt))
  );
  const totalRepairMs = (callLogs || []).reduce((s, wo) => s + calcDownMs(wo), 0);
  const breakdownCount = completedBreakdowns.length;

  const fmtMs = (ms) => {
    const h = Math.floor(ms / 3600000);
    const min = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  // MTTR = Total Repair Time ÷ Completed Breakdowns (00:00:00 if no data)
  const mttrMs = breakdownCount > 0 ? totalRepairMs / breakdownCount : 0;
  const mttrLabel = fmtMs(mttrMs);

  const totalDownLabel = fmtMs(totalRepairMs);

  const fields = [
    ["Asset ID", asset.generatedAssetId || asset.assetUniqueId],
    ["Equipment Name", m.equipmentName || asset.assetName],
    ["Make / Manufacturer", m.make || m.manufacturer],
    ["Model", m.model],
    ["Serial No.", m.serialNo],
    ["Manufacturing Year", m.mfgYear || m.manufacturingYear],
    ["Accessories", m.accessories],
    ["Dealer / Distributor", m.dealer],
    ["Installation Date", fmt(m.installationDate)],
    ["Invoice No.", m.invoiceNo],
    ["Purchase Date", fmt(m.purchaseDate)],
    ["Purchase Cost / Asset Value", m.purchaseCost ? `₹ ${m.purchaseCost}` : null],
    ["Maintenance", maint],
    ["Start Date", [maintenanceTypes.warranty && warrantyStart, maintenanceTypes.amc && amcStart, maintenanceTypes.cmc && cmcStart].filter(Boolean).join(" | ") || null],
    ["End Date", [maintenanceTypes.warranty && warrantyEnd, maintenanceTypes.amc && amcEnd, maintenanceTypes.cmc && cmcEnd].filter(Boolean).join(" | ") || null],
    ["RBER", m.rber ? "Yes" : null],
    ["Remarks", m.remarks],
    ["Department", asset.departmentName],
    ["Building", asset.building],
    ["Floor", asset.floor],
    ["Room / Area", asset.room],
    ["Working Status", (asset.working_status || m.workingStatus || "").replace(/_/g, " ")],
    ["Status", asset.status],
    ["Registered On", asset.createdAt ? new Date(asset.createdAt).toLocaleDateString("en-IN") : null],
  ].filter(([, v]) => v && v !== "—");

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "calllogs", label: "Call Log History" },
    { key: "pms_history", label: "PMS History" },
    { key: "calibration", label: "Calibration History" },
    { key: "purchase", label: "Purchase History" },
    { key: "transfer_history", label: "Transfer History" },
    { key: "indent", label: "Indent Details" },
  ];

  const tabStyle = (key) => ({
    padding: "12px 18px", background: "none", border: "none",
    borderBottom: tab === key ? "3px solid #2563eb" : "3px solid transparent",
    color: tab === key ? "#2563eb" : "#64748b",
    fontSize: "13.5px", fontWeight: tab === key ? 700 : 500,
    cursor: "pointer", whiteSpace: "nowrap",
  });

  const FieldCard = ({ label, value }) => (
    <div style={{ background: "#fff", borderRadius: "10px", padding: "12px 16px", border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "14px", color: "#0f172a", fontWeight: 600, wordBreak: "break-word" }}>{value}</div>
    </div>
  );

  const openEditModal = () => {
    const mt = m.maintenanceTypes || {
      warranty: !!(m.warranty?.enabled || maintenanceTypes?.warranty),
      amc: !!(m.amc?.enabled || maintenanceTypes?.amc),
      cmc: !!(m.cmc?.enabled || maintenanceTypes?.cmc),
      inHouse: !!(m.inHouse || maintenanceTypes?.inHouse),
      catalyst: !!(m.catalyst || maintenanceTypes?.catalyst),
      highEnd: !!(m.highEnd || maintenanceTypes?.highEnd),
      rented: !!(m.rented || maintenanceTypes?.rented),
    };
    const cal = m.calibration || {};
    setEditForm({
      assetName: m.equipmentName || asset.assetName || "",
      make: m.make || m.manufacturer || "",
      model: m.model || "",
      serialNo: m.serialNo || "",
      accessories: m.accessories || "",
      dealer: m.dealer || m.distributor || "",
      mfgYear: m.mfgYear || m.manufacturingYear || "",
      installationDate: toIsoDate(m.installationDate),
      invoiceNo: m.invoiceNo || "",
      purchaseDate: m.purchaseDate || m.invoiceDate || "",
      purchaseCost: m.purchaseCost || "",
      criticality: m.criticality || asset.criticality || "Non_Critical",
      workingStatus: m.workingStatus || asset.working_status || "Working",
      rber: !!m.rber,
      remarks: m.remarks || "",
      building: asset.building || "",
      floor: asset.floor || "",
      room: asset.room || "",
      buildingId: asset.buildingId ? String(asset.buildingId) : "",
      floorId: asset.floorId ? String(asset.floorId) : "",
      roomId: asset.roomId ? String(asset.roomId) : "",
      departmentId: asset.departmentId ? String(asset.departmentId) : "",
      departmentName: asset.departmentName || "",
      // Maintenance
      mtWarranty: mt.warranty,
      mtAmc: mt.amc,
      mtCmc: mt.cmc,
      mtInHouse: mt.inHouse,
      mtCatalyst: mt.catalyst,
      mtHighEnd: mt.highEnd,
      mtRented: mt.rented,
      warrantyStart: toIsoDate(m.warrantyStart || m.warranty?.startDate),
      warrantyEnd: toIsoDate(m.warrantyEnd || m.warranty?.endDate),
      amcStart: toIsoDate(m.amcStart || m.amc?.startDate),
      amcEnd: toIsoDate(m.amcEnd || m.amc?.endDate),
      cmcStart: toIsoDate(m.cmcStart || m.cmc?.startDate),
      cmcEnd: toIsoDate(m.cmcEnd || m.cmc?.endDate),
      // Calibration
      calibrationRequired: !!(cal.required || m.calibrationRequired),
      calibrationFrequency: cal.frequency || m.calibrationFrequency || "",
      lastCalibrationDate: toIsoDate(cal.lastCalibrationDate || m.lastCalibrationDate),
      nextCalibrationDueDate: toIsoDate(cal.nextCalibrationDueDate || m.nextCalibrationDueDate),
      calibrationVendorName: cal.vendorName || m.calibrationVendorName || "",
      calibrationCertNo: cal.certificateNumber || m.calibrationCertificateNumber || "",
      calibrationStatus: cal.status || m.calibrationStatus || "Pending",
      alertBeforeDays: cal.alertBeforeDays || m.alertBeforeDays || 30,
    });
    setEditError(null);
    setLocBuildings([]); setLocFloors([]); setLocRooms([]); setLocDepts([]);
    // Load location data for dropdowns
    const base = getApiBaseUrl();
    const H = { Authorization: `Bearer ${token}` };
    const cId = asset.companyId;
    // Departments
    const deptUrl = isAdmin
      ? `${base}/api/departments?companyId=${cId}`
      : `${base}/api/company-portal/departments`;
    fetch(deptUrl, { headers: H }).then(r => r.json()).then(d => setLocDepts(Array.isArray(d) ? d : [])).catch(() => setLocDepts([]));
    // Buildings + pre-populate cascade
    const bldUrl = isAdmin
      ? `${base}/api/locations/buildings?companyId=${cId}`
      : `${base}/api/company-portal/locations/buildings`;
    fetch(bldUrl, { headers: H }).then(r => r.json()).then(async d => {
      setLocBuildings(Array.isArray(d) ? d : []);
      const bId = asset.buildingId ? String(asset.buildingId) : "";
      if (bId) {
        const flrUrl = isAdmin
          ? `${base}/api/locations/floors?buildingId=${bId}`
          : `${base}/api/company-portal/locations/floors?buildingId=${bId}`;
        try {
          const fr = await fetch(flrUrl, { headers: H });
          const floors = await fr.json();
          setLocFloors(Array.isArray(floors) ? floors : []);
          const fId = asset.floorId ? String(asset.floorId) : "";
          if (fId) {
            const rmUrl = isAdmin
              ? `${base}/api/locations/rooms?floorId=${fId}`
              : `${base}/api/company-portal/locations/rooms?floorId=${fId}`;
            const rr = await fetch(rmUrl, { headers: H });
            const rooms = await rr.json();
            setLocRooms(Array.isArray(rooms) ? rooms : []);
          }
        } catch { /* ignore */ }
      }
    }).catch(() => setLocBuildings([]));
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    setEditSaving(true);
    setEditError(null);
    try {
      const base = getApiBaseUrl();
      const metaPayload = {
        ...m,
        equipmentName: editForm.assetName,
        make: editForm.make,
        manufacturer: editForm.make,
        model: editForm.model,
        serialNo: editForm.serialNo,
        accessories: editForm.accessories,
        dealer: editForm.dealer,
        manufacturingYear: editForm.mfgYear,
        mfgYear: editForm.mfgYear,
        installationDate: editForm.installationDate,
        invoiceNo: editForm.invoiceNo,
        purchaseDate: editForm.purchaseDate,
        purchaseCost: editForm.purchaseCost,
        criticality: editForm.criticality,
        workingStatus: editForm.workingStatus,
        rber: editForm.rber,
        remarks: editForm.remarks,
        maintenanceTypes: {
          warranty: editForm.mtWarranty,
          amc: editForm.mtAmc,
          cmc: editForm.mtCmc,
          inHouse: editForm.mtInHouse,
          catalyst: editForm.mtCatalyst,
          highEnd: editForm.mtHighEnd,
          rented: editForm.mtRented,
        },
        warrantyStart: editForm.warrantyStart,
        warrantyEnd: editForm.warrantyEnd,
        amcStart: editForm.amcStart,
        amcEnd: editForm.amcEnd,
        cmcStart: editForm.cmcStart,
        cmcEnd: editForm.cmcEnd,
        calibrationRequired: editForm.calibrationRequired,
        calibrationFrequency: editForm.calibrationFrequency || null,
        lastCalibrationDate: editForm.lastCalibrationDate || null,
        nextCalibrationDueDate: editForm.nextCalibrationDueDate || null,
        calibrationVendorName: editForm.calibrationVendorName || null,
        calibrationCertificateNumber: editForm.calibrationCertNo || null,
        calibrationStatus: editForm.calibrationStatus || null,
        alertBeforeDays: editForm.alertBeforeDays ? Number(editForm.alertBeforeDays) : null,
        calibration: {
          required: !!editForm.calibrationRequired,
          frequency: editForm.calibrationFrequency || null,
          lastCalibrationDate: editForm.lastCalibrationDate || null,
          nextCalibrationDueDate: editForm.nextCalibrationDueDate || null,
          vendorName: editForm.calibrationVendorName || null,
          certificateNumber: editForm.calibrationCertNo || null,
          status: editForm.calibrationStatus || null,
          alertBeforeDays: editForm.alertBeforeDays ? Number(editForm.alertBeforeDays) : null,
        },
      };

      const fullPayload = {
        assetName: editForm.assetName,
        building: editForm.building || null,
        floor: editForm.floor || null,
        room: editForm.room || null,
        buildingId: editForm.buildingId ? Number(editForm.buildingId) : null,
        floorId: editForm.floorId ? Number(editForm.floorId) : null,
        roomId: editForm.roomId ? Number(editForm.roomId) : null,
        departmentId: editForm.departmentId ? Number(editForm.departmentId) : null,
        criticality: editForm.criticality,
        workingStatus: editForm.workingStatus,
        calibrationRequired: editForm.calibrationRequired,
        calibrationFrequency: editForm.calibrationFrequency || null,
        lastCalibrationDate: editForm.lastCalibrationDate || null,
        nextCalibrationDueDate: editForm.nextCalibrationDueDate || null,
        calibrationVendorName: editForm.calibrationVendorName || null,
        calibrationCertificateNumber: editForm.calibrationCertNo || null,
        calibrationStatus: editForm.calibrationStatus || null,
        alertBeforeDays: editForm.alertBeforeDays ? Number(editForm.alertBeforeDays) : null,
        metadata: metaPayload,
      };

      // Both employee (cp_token) and super admin use the same PATCH endpoint
      const url = isAdmin
        ? `${base}/api/assets/${id}`
        : `${base}/api/company-portal/assets/${id}`;
      const resp = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(fullPayload),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${resp.status}`);
      }
      // Use the full asset returned by PATCH directly — no second round-trip needed
      const updated = await resp.json();
      setAsset(updated);
      setShowEditModal(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
      // Notify any open portal tabs to refresh this asset
      try {
        const bc = new BroadcastChannel("asset-updates");
        bc.postMessage({ type: "asset-updated", assetId: id, isAdmin });
        bc.close();
      } catch (_) { }
    } catch (e) {
      setEditError(e.message || "Save failed");
    } finally {
      setEditSaving(false);
    }
  };

  // EField, EInput, ESec are defined at module level (above) to keep stable component references.

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Success toast */}
      {saveSuccess && (
        <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 2000, background: "#16a34a", color: "#fff", padding: "12px 24px", borderRadius: "10px", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: 700, animation: "fadeIn 0.2s ease" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
          Asset details updated successfully!
        </div>
      )}
      {/* Transfer Modal */}
      {showTransferModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={e => e.target === e.currentTarget && setShowTransferModal(false)}>
          <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "500px", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
            <div style={{ padding: "20px 28px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Transfer Asset</h3>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>Move this asset to another company or department</p>
              </div>
              <button onClick={() => setShowTransferModal(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", width: "32px", height: "32px", fontSize: "18px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
              {transferError && <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", fontSize: "13px" }}>{transferError}</div>}
              {transferSuccess && <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#dcfce7", color: "#166534", fontSize: "13px", fontWeight: 600 }}>{transferSuccess}</div>}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px", textTransform: "uppercase" }}>Destination Company *</label>
                <select value={transferForm.toCompanyId} onChange={e => {
                  const cId = e.target.value;
                  setTransferForm(p => ({ ...p, toCompanyId: cId, toDepartmentId: "" }));
                  setTransferDepts([]);
                  if (cId) {
                    fetch(`${getApiBaseUrl()}/api/company-portal/assets/transfer/departments?companyId=${cId}`, { headers: { Authorization: `Bearer ${token}` } })
                      .then(r => r.ok ? r.json() : Promise.reject())
                      .then(d => setTransferDepts(Array.isArray(d) ? d : []))
                      .catch(() => setTransferDepts([]));
                  }
                }}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff", boxSizing: "border-box" }}>
                  <option value="">— Select company —</option>
                  {transferCompanies.map(c => <option key={c.id} value={String(c.id)}>{c.companyName}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px", textTransform: "uppercase" }}>Destination Department</label>
                <select value={transferForm.toDepartmentId} onChange={e => setTransferForm(p => ({ ...p, toDepartmentId: e.target.value }))}
                  disabled={!transferForm.toCompanyId}
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: transferForm.toCompanyId ? "#fff" : "#f8fafc", boxSizing: "border-box" }}>
                  <option value="">{transferForm.toCompanyId ? "— None (company level) —" : "— Select company first —"}</option>
                  {transferDepts.map(d => <option key={d.id} value={String(d.id)}>{d.departmentName}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px", textTransform: "uppercase" }}>Reason</label>
                <input value={transferForm.reason} onChange={e => setTransferForm(p => ({ ...p, reason: e.target.value }))} placeholder="Reason for transfer"
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px", textTransform: "uppercase" }}>Remarks</label>
                <textarea value={transferForm.remarks} onChange={e => setTransferForm(p => ({ ...p, remarks: e.target.value }))} rows={2} placeholder="Additional remarks"
                  style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
            </div>
            <div style={{ padding: "16px 28px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button onClick={() => setShowTransferModal(false)} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 600, cursor: "pointer", fontSize: "13.5px" }}>Cancel</button>
              <button disabled={!transferForm.toCompanyId || transferSaving || !!transferSuccess} onClick={async () => {
                setTransferSaving(true);
                setTransferError(null);
                try {
                  const base = getApiBaseUrl();
                  const resp = await fetch(`${base}/api/company-portal/assets/${id}/transfer`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                      toCompanyId: Number(transferForm.toCompanyId),
                      toDepartmentId: transferForm.toDepartmentId ? Number(transferForm.toDepartmentId) : undefined,
                      reason: transferForm.reason,
                      remarks: transferForm.remarks,
                    }),
                  });
                  const data = await resp.json();
                  if (!resp.ok) throw new Error(data.message || `HTTP ${resp.status}`);
                  setTransferSuccess(data.message || "Asset transferred successfully!");
                  // Reload transfer history
                  setTransferHistory(null);
                } catch (e) {
                  setTransferError(e.message || "Transfer failed");
                } finally {
                  setTransferSaving(false);
                }
              }}
                style={{ padding: "9px 22px", borderRadius: "8px", border: "none", background: "#f97316", color: "#fff", fontWeight: 700, cursor: transferForm.toCompanyId && !transferSaving && !transferSuccess ? "pointer" : "not-allowed", fontSize: "13.5px", opacity: (!transferForm.toCompanyId || transferSaving || !!transferSuccess) ? 0.6 : 1 }}>
                {transferSaving ? "Transferring…" : "Confirm Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Full Edit Modal */}
      {showEditModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onClick={e => e.target === e.currentTarget && setShowEditModal(false)}>
          <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "800px", maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
            {/* Header */}
            <div style={{ padding: "20px 28px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Edit Asset Details</h3>
                <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>Update all fields for this asset</p>
              </div>
              <button onClick={() => setShowEditModal(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", width: "32px", height: "32px", fontSize: "18px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
            </div>
            {/* Scrollable body */}
            <EditCtx.Provider value={{ editForm, setEditForm }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px" }}>
                {editError && <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", marginBottom: "16px", fontSize: "13px" }}>{editError}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>

                  {/* Equipment Details */}
                  <ESec title="Equipment Details" />
                  <EInput label="Equipment Name" fkey="assetName" full placeholder="e.g. Ultrasound Machine" />
                  <EInput label="Make / Manufacturer" fkey="make" placeholder="e.g. Philips" />
                  <EInput label="Model" fkey="model" placeholder="e.g. EPIQ 7G" />
                  <EInput label="Serial No." fkey="serialNo" />
                  <EInput label="Accessories" fkey="accessories" />
                  <EInput label="Dealer / Distributor" fkey="dealer" />
                  <EInput label="Mfg. Year" fkey="mfgYear" placeholder="e.g. 2022" />
                  <EInput label="Installation Date" fkey="installationDate" type="date" />
                  <EInput label="Invoice No." fkey="invoiceNo" />
                  <EInput label="Purchase Date" fkey="purchaseDate" type="date" />
                  <EInput label="Purchase Cost (₹)" fkey="purchaseCost" placeholder="e.g. 500000" />

                  {/* Category & Status */}
                  <ESec title="Category & Status" />
                  <EField label="Category">
                    <select value={editForm.criticality || "Non_Critical"} onChange={e => setEditForm(p => ({ ...p, criticality: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff" }}>
                      <option value="Non_Critical">Non-Critical</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </EField>
                  <EField label="Working Status">
                    <select value={editForm.workingStatus || "Working"} onChange={e => setEditForm(p => ({ ...p, workingStatus: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff" }}>
                      <option value="Working">Working</option>
                      <option value="WIP">WIP</option>
                      <option value="Not_Working">Not Working</option>
                      <option value="Condemned">Condemned</option>
                    </select>
                  </EField>
                  <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "9px" }}>
                    <input type="checkbox" id="editRber" checked={!!editForm.rber} onChange={e => setEditForm(p => ({ ...p, rber: e.target.checked }))}
                      style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#2563eb" }} />
                    <label htmlFor="editRber" style={{ fontSize: "13.5px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>RBER (Recommended Beyond Economic Repair)</label>
                  </div>
                  <EField label="Remarks" full>
                    <textarea value={editForm.remarks || ""} onChange={e => setEditForm(p => ({ ...p, remarks: e.target.value }))} rows={2} placeholder="Additional notes..."
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
                  </EField>

                  {/* Maintenance Under */}
                  <ESec title="Maintenance Under" />
                  <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: "10px 28px" }}>
                    {[
                      ["mtWarranty", "a. Warranty"],
                      ["mtAmc", "b. AMC (Annual Maintenance Contract)"],
                      ["mtCmc", "c. CMC (Comprehensive Maintenance Contract)"],
                      ["mtInHouse", "d. In House"],
                      ["mtCatalyst", "e. Catalyst"],
                      ["mtHighEnd", "f. High End Equipment"],
                      ["mtRented", "g. Rented"],
                    ].map(([key, label]) => (
                      <label key={key} style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "13.5px", color: "#374151", fontWeight: 500 }}>
                        <input type="checkbox" checked={!!editForm[key]} onChange={e => {
                          if (e.target.checked) {
                            setEditForm(p => ({ ...p, mtWarranty: false, mtAmc: false, mtCmc: false, mtInHouse: false, mtCatalyst: false, mtHighEnd: false, mtRented: false, [key]: true }));
                          } else {
                            setEditForm(p => ({ ...p, [key]: false }));
                          }
                        }}
                          style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }} />
                        {label}
                      </label>
                    ))}
                  </div>
                  {editForm.mtWarranty && <>
                    <EInput label="Warranty Start" fkey="warrantyStart" type="date" />
                    <EInput label="Warranty End" fkey="warrantyEnd" type="date" />
                  </>}
                  {editForm.mtAmc && <>
                    <EInput label="AMC Start" fkey="amcStart" type="date" />
                    <EInput label="AMC End" fkey="amcEnd" type="date" />
                  </>}
                  {editForm.mtCmc && <>
                    <EInput label="CMC Start" fkey="cmcStart" type="date" />
                    <EInput label="CMC End" fkey="cmcEnd" type="date" />
                  </>}

                  {/* Calibration */}
                  <ESec title="Calibration Information" />
                  <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "9px" }}>
                    <input type="checkbox" id="editCalibReq" checked={!!editForm.calibrationRequired} onChange={e => setEditForm(p => ({ ...p, calibrationRequired: e.target.checked }))}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                    <label htmlFor="editCalibReq" style={{ fontSize: "13.5px", fontWeight: 600, color: "#475569", cursor: "pointer" }}>Calibration Required</label>
                  </div>
                  {editForm.calibrationRequired && <>
                    <EField label="Calibration Frequency">
                      <select value={editForm.calibrationFrequency || ""} onChange={e => setEditForm(p => ({ ...p, calibrationFrequency: e.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff" }}>
                        <option value="">— Select —</option>
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Half Yearly">Half Yearly</option>
                        <option value="Yearly">Yearly</option>
                      </select>
                    </EField>
                    <EField label="Calibration Status">
                      <select value={editForm.calibrationStatus || "Pending"} onChange={e => setEditForm(p => ({ ...p, calibrationStatus: e.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff" }}>
                        <option value="Pending">Pending</option>
                        <option value="Active">Active</option>
                        <option value="Expired">Expired</option>
                      </select>
                    </EField>
                    <EInput label="Last Calibration Date" fkey="lastCalibrationDate" type="date" />
                    <EInput label="Next Calibration Due Date" fkey="nextCalibrationDueDate" type="date" />
                    <EInput label="Calibration Vendor" fkey="calibrationVendorName" placeholder="Vendor name" />
                    <EInput label="Certificate Number" fkey="calibrationCertNo" placeholder="Cert. number" />
                    <EInput label="Alert Before Due (Days)" fkey="alertBeforeDays" placeholder="e.g. 30" />
                  </>}

                  {/* Location */}
                  <ESec title="Location & Department" />
                  {/* Department */}
                  <EField label="Department" full={locDepts.length === 0}>
                    {locDepts.length > 0 ? (
                      <select value={editForm.departmentId || ""} onChange={e => setEditForm(p => ({ ...p, departmentId: e.target.value }))}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff" }}>
                        <option value="">— None —</option>
                        {locDepts.map(d => <option key={d.id} value={String(d.id)}>{d.departmentName || d.name}</option>)}
                      </select>
                    ) : (
                      <input value={editForm.departmentName || editForm.departmentId || ""} readOnly
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#f8fafc", boxSizing: "border-box" }} />
                    )}
                  </EField>
                  {/* Building */}
                  <EField label="Building / Ward">
                    {locBuildings.length > 0 ? (
                      <select value={editForm.buildingId || ""} onChange={async e => {
                        const bid = e.target.value;
                        const bld = locBuildings.find(b => String(b.id) === bid);
                        setEditForm(p => ({ ...p, buildingId: bid, building: bld?.buildingName || "", floorId: "", floor: "", roomId: "", room: "" }));
                        setLocFloors([]); setLocRooms([]);
                        if (bid) {
                          const base = getApiBaseUrl();
                          const H = { Authorization: `Bearer ${token}` };
                          const url = isAdmin ? `${base}/api/locations/floors?buildingId=${bid}` : `${base}/api/company-portal/locations/floors?buildingId=${bid}`;
                          fetch(url, { headers: H }).then(r => r.json()).then(d => setLocFloors(Array.isArray(d) ? d : [])).catch(() => setLocFloors([]));
                        }
                      }}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: "#fff" }}>
                        <option value="">— Select Building —</option>
                        {locBuildings.map(b => <option key={b.id} value={String(b.id)}>{b.buildingName}</option>)}
                      </select>
                    ) : (
                      <>
                        <input value={editForm.building || ""} onChange={e => setEditForm(p => ({ ...p, building: e.target.value, buildingId: "", floorId: "", floor: "", roomId: "", room: "" }))} placeholder="e.g. OT Block"
                          style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
                        <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px", display: "block" }}>Set up buildings in Locations to enable dropdowns</span>
                      </>
                    )}
                  </EField>
                  {/* Floor */}
                  <EField label="Floor">
                    {locBuildings.length > 0 ? (
                      <select value={editForm.floorId || ""} onChange={async e => {
                        const fid = e.target.value;
                        const flr = locFloors.find(f => String(f.id) === fid);
                        setEditForm(p => ({ ...p, floorId: fid, floor: flr?.floorName || "", roomId: "", room: "" }));
                        setLocRooms([]);
                        if (fid) {
                          const base = getApiBaseUrl();
                          const H = { Authorization: `Bearer ${token}` };
                          const url = isAdmin ? `${base}/api/locations/rooms?floorId=${fid}` : `${base}/api/company-portal/locations/rooms?floorId=${fid}`;
                          fetch(url, { headers: H }).then(r => r.json()).then(d => setLocRooms(Array.isArray(d) ? d : [])).catch(() => setLocRooms([]));
                        }
                      }}
                        disabled={!editForm.buildingId}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: editForm.buildingId ? "#fff" : "#f8fafc" }}>
                        <option value="">{editForm.buildingId ? "— Select Floor —" : "— Select Building first —"}</option>
                        {locFloors.map(f => <option key={f.id} value={String(f.id)}>{f.floorName}</option>)}
                      </select>
                    ) : (
                      <input value={editForm.floor || ""} onChange={e => setEditForm(p => ({ ...p, floor: e.target.value, floorId: "", roomId: "", room: "" }))} placeholder="e.g. 2nd Floor"
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
                    )}
                  </EField>
                  {/* Room / Area */}
                  <EField label="Room / Area">
                    {locBuildings.length > 0 ? (
                      <select value={editForm.roomId || ""} onChange={e => {
                        const rid = e.target.value;
                        const rm = locRooms.find(r => String(r.id) === rid);
                        setEditForm(p => ({ ...p, roomId: rid, room: rm?.roomName || "" }));
                      }}
                        disabled={!editForm.floorId}
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", background: editForm.floorId ? "#fff" : "#f8fafc" }}>
                        <option value="">{editForm.floorId ? "— Select Room —" : "— Select Floor first —"}</option>
                        {locRooms.map(r => <option key={r.id} value={String(r.id)}>{r.roomName}</option>)}
                      </select>
                    ) : (
                      <input value={editForm.room || ""} onChange={e => setEditForm(p => ({ ...p, room: e.target.value, roomId: "" }))} placeholder="e.g. ICU Room 1"
                        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
                    )}
                  </EField>

                </div>
              </div>
            </EditCtx.Provider>
            {/* Footer */}
            <div style={{ padding: "16px 28px", borderTop: "1px solid #e2e8f0", display: "flex", gap: "10px", justifyContent: "flex-end", flexShrink: 0 }}>
              <button onClick={() => setShowEditModal(false)} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", fontWeight: 600, cursor: "pointer", fontSize: "13.5px" }}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} style={{ padding: "9px 22px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "13.5px", opacity: editSaving ? 0.7 : 1 }}>
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{m.equipmentName || asset.assetName}</h3>
            <span style={{ fontFamily: "monospace", fontSize: "12px", color: "#2563eb", background: "#eff6ff", padding: "2px 8px", borderRadius: "6px" }}>{asset.generatedAssetId || asset.assetUniqueId}</span>
          </div>
          {(Number(asset.isVerified) === 1 || asset.isVerified === true)
            ? <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: "#dcfce7", color: "#16a34a" }}>Verified</span>
            : <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: "#f1f5f9", color: "#64748b" }}>Unverified</span>
          }
          {(asset.working_status || m.workingStatus) && (
            <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: "#eff6ff", color: "#2563eb" }}>{(asset.working_status || m.workingStatus).replace(/_/g, " ")}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>{asset.departmentName && `Dept: ${asset.departmentName}`}</div>
          {canTransfer && (
            <button onClick={() => {
              setTransferForm({ toCompanyId: "", toDepartmentId: "", reason: "", remarks: "" });
              setTransferError(null);
              setTransferSuccess(null);
              setTransferDepts([]);
              const base = getApiBaseUrl();
              fetch(`${base}/api/company-portal/assets/transfer/companies`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.ok ? r.json() : Promise.reject())
                .then(d => setTransferCompanies(Array.isArray(d) ? d : []))
                .catch(() => setTransferCompanies([]));
              setShowTransferModal(true);
            }}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: "#f97316", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              Transfer
            </button>
          )}
          <button onClick={openEditModal}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
            Edit
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff", padding: "0 24px", overflowX: "auto", flexShrink: 0 }}>
        {TABS.map(t => <button key={t.key} style={tabStyle(t.key)} onClick={() => {
          setTab(t.key);
          if (t.key === "pms_history" && !pmsHistory && !pmsHistoryLoading && token && !isAdmin) {
            setPmsHistoryLoading(true);
            fetch(`${getApiBaseUrl()}/api/company-portal/pms/reports/${id}`, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(d => { setPmsHistory(d); setPmsHistoryLoading(false); })
              .catch(() => { setPmsHistory({ history: [] }); setPmsHistoryLoading(false); });
          }
          if (t.key === "transfer_history" && !transferHistory && !transferHistoryLoading && token) {
            setTransferHistoryLoading(true);
            fetch(`${getApiBaseUrl()}/api/company-portal/assets/${id}/transfer-history`, { headers: { Authorization: `Bearer ${token}` } })
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(d => { setTransferHistory(d); setTransferHistoryLoading(false); })
              .catch(() => { setTransferHistory({ transfers: [] }); setTransferHistoryLoading(false); });
          }
        }}>{t.label}</button>)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", background: "#f8fafc", padding: "24px" }}>

        {/* Overview */}
        {tab === "overview" && (
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            {images.length > 0 && (
              <div style={{ marginBottom: "24px" }}>
                <h4 style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px" }}>Images</h4>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {images.map((img, i) => (
                    <a key={i} href={img} target="_blank" rel="noreferrer" style={{ display: "block", width: "120px", height: "120px", borderRadius: "10px", border: "1.5px solid #e2e8f0", overflow: "hidden", flexShrink: 0 }}>
                      <img src={img} alt={`img-${i + 1}`} style={{ width: "120px", height: "120px", objectFit: "cover", display: "block" }}
                        onError={e => {
                          e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' fill='none'%3E%3Crect width='120' height='120' fill='%23f1f5f9'/%3E%3Cpath d='M48 54a6 6 0 1 0 12 0 6 6 0 0 0-12 0Zm-8 24h40l-12-16-6 8-4-4-10 12h-8Z' fill='%2394a3b8'/%3E%3Crect x='32' y='40' width='56' height='40' rx='4' stroke='%2394a3b8' stroke-width='2' fill='none'/%3E%3C/svg%3E";
                          e.currentTarget.style.objectFit = "fill";
                          e.currentTarget.parentElement.style.pointerEvents = "none";
                        }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Metrics row: Total Down Time + MTTR only (MTBF removed) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px", marginBottom: "20px" }}>
              <FieldCard label="Total Down Time" value={totalDownLabel} />
              <FieldCard label="MTTR (hh:mm:ss)" value={mttrLabel} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
              {fields.map(([label, value]) => (
                <FieldCard key={label} label={label} value={value} />
              ))}
            </div>
          </div>
        )}

        {/* Call Logs */}
        {tab === "calllogs" && (
          <div style={{ maxWidth: "100%", margin: "0 auto" }}>
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Call Log History</h4>
              {callLogs && callLogs.length > 0 && (
                <button
                  onClick={() => {

                    const assetName = m.equipmentName || asset?.assetName || "";
                    const make = m.make || m.manufacturer || "";
                    const model = m.model || "";
                    const serialNo = m.serialNo || "";
                    const headers = ["#", "Request ID", "Hospital", "Make", "Model", "Serial No.", "Department", "Description", "Raised By", "Assigned To", "Created", "WIP Date", "Response Time", "Resolution Date", "Status", "Down Time"];
                    const fmtDT = (v) => v ? new Date(v).toLocaleDateString("en-IN") + " " + new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
                    const fmtM = (mins) => mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${Math.floor(mins/1440)}d ${Math.floor((mins%1440)/60)}h`;
                    const dataRows = callLogs.map((wo, i) => {
                      const isAQ = !wo.workOrderNumber && !wo.work_order_number;
                      const reqId = wo.workOrderNumber || wo.work_order_number || (isAQ ? `AQ-${wo.id}` : `REQ-${wo.id}`);
                      const dtMs = calcDownMs(wo);
                      const respMins = wo.wipAt && wo.createdAt ? Math.max(0, Math.round((new Date(wo.wipAt) - new Date(wo.createdAt)) / 60000)) : null;
                      return [
                        i + 1,
                        reqId,
                        hospitalName || wo.companyName || "",
                        make, model, serialNo,
                        wo.departmentName || wo.department_name || asset?.departmentName || "",
                        wo.issueDescription || wo.description || wo.title || "",
                        wo.createdByName || wo.created_by_name || wo.raisedByName || "",
                        wo.assignedToName || wo.assigned_to_name || "",
                        fmtDT(wo.createdAt),
                        fmtDT(wo.wipAt),
                        respMins != null ? fmtM(respMins) : "",
                        fmtDT(wo.resolutionAt),
                        wo.status || "",
                        dtMs > 0 ? fmtMs(dtMs) : "",
                      ];
                    });
                    exportToExcel([headers, ...dataRows], "Call-Log-History");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="12" x2="12" y2="18" /><polyline points="9 15 12 18 15 15" /></svg>
                  Export Excel
                </button>
              )}
            </div>

            {callLogs === null ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading…</div>
            ) : callLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", color: "#94a3b8" }}>No call logs found</div>
            ) : (
              <>
                <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: 1100 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["#", "Request ID", "Hospital", "Make", "Model", "Serial No.", "Department", "Description", "Raised By", "Assigned To", "Created", "WIP Date", "Response Time", "Resolution Date", "Status", "Down Time"].map(h => (
                          <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {callLogs.map((wo, idx) => {
                        const isAQ = !wo.workOrderNumber && !wo.work_order_number;
                        const reqId = wo.workOrderNumber || wo.work_order_number || (isAQ ? `AQ-${wo.id}` : `REQ-${wo.id}`);
                        const dtMs = calcDownMs(wo);
                        const statusColors = { closed: { bg: "#f1f5f9", c: "#475569" }, resolved: { bg: "#dcfce7", c: "#166534" }, open: { bg: "#fee2e2", c: "#dc2626" }, wip: { bg: "#dbeafe", c: "#1d4ed8" }, in_progress: { bg: "#dbeafe", c: "#1d4ed8" } };
                        const st = statusColors[(wo.status || "").toLowerCase()] || { bg: "#f1f5f9", c: "#64748b" };
                        const fmtDT = (v) => v ? (<><div style={{ fontWeight: 600 }}>{new Date(v).toLocaleDateString("en-IN")}</div><div style={{ fontSize: "11px", color: "#94a3b8" }}>{new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></>) : <span style={{ color: "#94a3b8" }}>—</span>;
                        const respMins = wo.wipAt && wo.createdAt ? Math.max(0, Math.round((new Date(wo.wipAt) - new Date(wo.createdAt)) / 60000)) : null;
                        const fmtM = (mn) => mn < 60 ? `${mn}m` : mn < 1440 ? `${Math.floor(mn/60)}h ${mn%60}m` : `${Math.floor(mn/1440)}d ${Math.floor((mn%1440)/60)}h`;
                        return (
                          <tr key={wo.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                            onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                            onMouseLeave={e => e.currentTarget.style.background = ""}>
                            <td style={{ padding: "11px 14px", color: "#94a3b8", fontSize: "12px" }}>{idx + 1}</td>
                            <td style={{ padding: "11px 14px" }}>
                              <button onClick={() => setSelectedCallLog(wo)} style={{ fontFamily: "monospace", color: "#2563eb", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline", fontSize: "12.5px", whiteSpace: "nowrap" }}>{reqId}</button>
                            </td>
                            <td style={{ padding: "11px 14px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{hospitalName || "—"}</td>
                            <td style={{ padding: "11px 14px", color: "#334155", whiteSpace: "nowrap" }}>{m.make || m.manufacturer || "—"}</td>
                            <td style={{ padding: "11px 14px", color: "#334155", whiteSpace: "nowrap" }}>{m.model || "—"}</td>
                            <td style={{ padding: "11px 14px", color: "#334155", fontFamily: "monospace", fontSize: "11.5px" }}>{m.serialNo || "—"}</td>
                            <td style={{ padding: "11px 14px", color: "#64748b", whiteSpace: "nowrap" }}>{wo.departmentName || wo.department_name || asset?.departmentName || "—"}</td>
                            <td style={{ padding: "11px 14px", color: "#334155", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wo.issueDescription || wo.description || wo.title || "—"}</td>
                            <td style={{ padding: "11px 14px", fontSize: "12.5px", color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}>{wo.createdByName || wo.created_by_name || wo.raisedByName || "—"}</td>
                            <td style={{ padding: "11px 14px", fontSize: "13px", color: "#374151", whiteSpace: "nowrap" }}>{wo.assignedToName || wo.assigned_to_name || <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Unassigned</span>}</td>
                            <td style={{ padding: "11px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{fmtDT(wo.createdAt)}</td>
                            <td style={{ padding: "11px 14px", fontSize: "12px", color: "#1d4ed8", whiteSpace: "nowrap" }}>{fmtDT(wo.wipAt)}</td>
                            <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>{respMins != null ? <span style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: "#dbeafe", color: "#1d4ed8" }}>{fmtM(respMins)}</span> : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                            <td style={{ padding: "11px 14px", fontSize: "12px", color: "#16a34a", whiteSpace: "nowrap" }}>{fmtDT(wo.resolutionAt)}</td>
                            <td style={{ padding: "11px 14px" }}><span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: st.bg, color: st.c, textTransform: "capitalize" }}>{wo.status || "—"}</span></td>
                            <td style={{ padding: "11px 14px", color: dtMs > 0 ? "#dc2626" : "#94a3b8", fontWeight: dtMs > 0 ? 700 : 400, fontSize: "12px", whiteSpace: "nowrap" }}>{dtMs > 0 ? fmtMs(dtMs) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f8fafc", textAlign: "right", fontWeight: 700, borderTop: "2px solid #e2e8f0" }}>
                        <td colSpan={15} style={{ padding: "20px 5px", textAlign: "right", color: "#475569" }}>TOTAL DOWN TIME</td>
                        <td style={{ padding: "12px 14px", textAlign: "right", color: "#dc2626", fontWeight: 700 }}>{totalDownLabel}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Request Detail Modal */}
                {selectedCallLog && (() => {
                  const wo = selectedCallLog;
                  const isAQ = !wo.workOrderNumber && !wo.work_order_number;
                  const reqId = wo.workOrderNumber || wo.work_order_number || (isAQ ? `AQ-${wo.id}` : `REQ-${wo.id}`);
                  const dtMs = calcDownMs(wo);
                  const rows = [
                    ["Request ID", reqId],
                    ["Type", isAQ ? "QR Scan / Asset Query" : "Work Order"],
                    ["Asset Name", m.equipmentName || asset?.assetName],
                    ["Make", m.make || m.manufacturer],
                    ["Model", m.model],
                    ["Serial No.", m.serialNo],
                    ["Department", wo.departmentName || wo.department_name || asset?.departmentName],
                    ["Description", wo.issueDescription || wo.description || wo.title],
                    ["Priority", wo.priority],
                    ["Status", wo.status],
                    ["Raised By", wo.createdByName || wo.created_by_name || wo.raisedByName || wo.requesterName],
                    ["Assigned To", wo.assignedToName || wo.assigned_to_name || "Unassigned"],
                    ["Location", wo.location],
                    ["WIP Start", wo.wipAt ? new Date(wo.wipAt).toLocaleString() : null],
                    ["Created", wo.createdAt ? new Date(wo.createdAt).toLocaleString() : null],
                    ["Closed / Resolved", wo.closedAt ? new Date(wo.closedAt).toLocaleString() : null],
                    ["Down Time", dtMs > 0 ? fmtMs(dtMs) : null],
                    ["Resolution Note", wo.resolutionNote],
                  ].filter(([, v]) => v);
                  return (
                    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
                      onClick={e => e.target === e.currentTarget && setSelectedCallLog(null)}>
                      <div style={{ background: "#fff", borderRadius: "16px", width: "580px", maxWidth: "96vw", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
                        <div style={{ padding: "18px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff" }}>
                          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>Request: {reqId}</h3>
                          <button onClick={() => setSelectedCallLog(null)} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "#f1f5f9", cursor: "pointer", fontSize: "16px", color: "#475569" }}>×</button>
                        </div>
                        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {rows.map(([label, value]) => (
                            <div key={label} style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: "8px", fontSize: "13.5px", borderBottom: "1px solid #f8fafc", paddingBottom: "8px" }}>
                              <span style={{ color: "#64748b", fontWeight: 600 }}>{label}</span>
                              <span style={{ color: "#0f172a", wordBreak: "break-word" }}>{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Calibration */}
        {tab === "calibration" && (
          <div style={{ maxWidth: "100%", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Calibration Records</h4>
              {calibration && calibration.length > 0 && (
                <button
                  onClick={() => {
                    const headers = ["#", "Hospital", "Asset Name", "Asset ID", "Make", "Model", "Serial No.", "Department", "Calibration Date", "Next Due Date", "Vendor", "Certificate No.", "Calibrated By", "Result", "Status", "Remarks"];
                    const dataRows = calibration.map((cr, i) => [
                      i + 1,
                      hospitalName || "",
                      m.equipmentName || asset?.assetName || "",
                      asset?.generatedAssetId || asset?.assetUniqueId || "",
                      m.make || m.manufacturer || "",
                      m.model || "",
                      m.serialNo || "",
                      asset?.departmentName || "",
                      cr.calibrationDate ? new Date(cr.calibrationDate).toLocaleDateString("en-IN") : "",
                      cr.nextDueDate ? new Date(cr.nextDueDate).toLocaleDateString("en-IN") : "",
                      cr.vendorName || "",
                      cr.certificateNumber || "",
                      cr.calibratedBy || cr.calibrated_by || "",
                      cr.result || cr.calibrationResult || "",
                      cr.status || "Active",
                      cr.remarks || "",
                    ]);
                    exportToExcel([headers, ...dataRows], "Calibration-History");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="12" x2="12" y2="18" /><polyline points="9 15 12 18 15 15" /></svg>
                  Export Excel
                </button>
              )}
            </div>
            {calibration === null ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading…</div>
            ) : calibration.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", color: "#94a3b8" }}>No calibration records</div>
            ) : (
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: 1000 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["#", "Hospital", "Asset Name", "Asset ID", "Make", "Model", "Serial No.", "Department", "Date", "Next Due", "Vendor", "Certificate No.", "Calibrated By", "Result", "Status", "Remarks"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "10.5px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calibration.map((cr, i) => (
                      <tr key={cr.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <td style={{ padding: "9px 12px", color: "#94a3b8" }}>{i + 1}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{hospitalName || "—"}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{m.equipmentName || asset?.assetName || "—"}</td>
                        <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#2563eb", fontSize: "11.5px" }}>{asset?.generatedAssetId || asset?.assetUniqueId || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#334155", whiteSpace: "nowrap" }}>{m.make || m.manufacturer || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#334155", whiteSpace: "nowrap" }}>{m.model || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#334155", fontFamily: "monospace", fontSize: "11.5px" }}>{m.serialNo || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{asset?.departmentName || "—"}</td>
                        <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>{cr.calibrationDate ? new Date(cr.calibrationDate).toLocaleDateString("en-IN") : "—"}</td>
                        <td style={{ padding: "9px 12px", color: cr.nextDueDate && new Date(cr.nextDueDate) < new Date() ? "#dc2626" : "#475569", fontWeight: cr.nextDueDate && new Date(cr.nextDueDate) < new Date() ? 700 : 400, whiteSpace: "nowrap" }}>{cr.nextDueDate ? new Date(cr.nextDueDate).toLocaleDateString("en-IN") : "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#475569" }}>{cr.vendorName || "—"}</td>
                        <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#7c3aed", fontSize: "11.5px" }}>{cr.certificateNumber || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#475569" }}>{cr.calibratedBy || cr.calibrated_by || "—"}</td>
                        <td style={{ padding: "9px 12px" }}>{(() => { const r = (cr.result || cr.calibrationResult || "").toLowerCase(); const rc = r === "pass" ? { bg: "#dcfce7", c: "#166534" } : r === "fail" ? { bg: "#fee2e2", c: "#dc2626" } : { bg: "#f1f5f9", c: "#64748b" }; return <span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: rc.bg, color: rc.c }}>{cr.result || cr.calibrationResult || "—"}</span>; })()}</td>
                        <td style={{ padding: "9px 12px" }}><span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: "#dcfce7", color: "#166534" }}>{cr.status || "Active"}</span></td>
                        <td style={{ padding: "9px 12px", color: "#64748b", maxWidth: 180 }}>{cr.remarks || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Purchase History */}
        {tab === "purchase" && (
          <div style={{ maxWidth: "900px", margin: "0 auto" }}>
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Purchase History</h4>
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px", marginBottom: "20px" }}>
                {[
                  ["Invoice No.", m.invoiceNo],
                  ["Purchase Date", m.purchaseDate ? fmt(m.purchaseDate) : null],
                  ["Purchase Cost", m.purchaseCost ? `₹ ${m.purchaseCost}` : null],
                ].map(([label, value]) => value ? <FieldCard key={label} label={label} value={value} /> : null)}
              </div>
              {Object.values(maintenanceTypes).some(Boolean) && (
                <div style={{ marginTop: "12px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "10px" }}>Maintenance Under</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
                    {maintenanceTypes.warranty && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#dcfce7", color: "#16a34a" }}>Warranty</span>}
                    {maintenanceTypes.amc && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#dbeafe", color: "#1e40af" }}>AMC</span>}
                    {maintenanceTypes.cmc && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#fef3c7", color: "#92400e" }}>CMC</span>}
                    {maintenanceTypes.inHouse && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#f3e8ff", color: "#6b21a8" }}>In House</span>}
                    {maintenanceTypes.catalyst && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#fce7f3", color: "#9d174d" }}>Catalyst</span>}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                    {maintenanceTypes.warranty && warrantyStart && <FieldCard label="Warranty Period" value={`${fmt(warrantyStart)} — ${warrantyEnd ? fmt(warrantyEnd) : "—"}`} />}
                    {maintenanceTypes.amc && amcStart && <FieldCard label="AMC Period" value={`${fmt(amcStart)} — ${amcEnd ? fmt(amcEnd) : "—"}`} />}
                    {maintenanceTypes.cmc && cmcStart && <FieldCard label="CMC Period" value={`${fmt(cmcStart)} — ${cmcEnd ? fmt(cmcEnd) : "—"}`} />}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Transfer History */}
        {tab === "transfer_history" && (
          <div style={{ maxWidth: "100%", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Transfer History</h4>
              {transferHistory && (transferHistory.transfers || []).length > 0 && (
                <button
                  onClick={() => {
                    const headers = ["#", "Ref.", "Asset Name", "Asset ID", "Make", "Model", "Serial No.", "From Company", "From Dept.", "To Company", "To Dept.", "Transferred By", "Date", "Reason", "Status"];
                    const dataRows = (transferHistory.transfers || []).map((tr, i) => [
                      i + 1,
                      tr.transfer_reference || `#${tr.id}`,
                      m.equipmentName || asset?.assetName || "",
                      asset?.generatedAssetId || asset?.assetUniqueId || "",
                      m.make || m.manufacturer || "",
                      m.model || "",
                      m.serialNo || "",
                      tr.from_company_name || "",
                      tr.from_department_name || "",
                      tr.to_company_name || "",
                      tr.to_department_name || "",
                      tr.transferred_by_name || "",
                      tr.transferred_at ? new Date(tr.transferred_at).toLocaleDateString("en-IN") : "",
                      tr.reason || tr.remarks || "",
                      tr.status || "completed",
                    ]);
                    exportToExcel([headers, ...dataRows], "Transfer-History");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="12" x2="12" y2="18" /><polyline points="9 15 12 18 15 15" /></svg>
                  Export Excel
                </button>
              )}
            </div>
            {transferHistoryLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading transfer history…</div>
            ) : !transferHistory ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Click the tab to load transfer history.</div>
            ) : (transferHistory.transfers || []).length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", color: "#94a3b8", fontSize: "14px" }}>
                No transfer records found for this asset.
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: 1000 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["#", "Ref.", "Asset Name", "Asset ID", "Make", "Model", "Serial No.", "From Company", "From Dept.", "To Company", "To Dept.", "Transferred By", "Date", "Reason", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "10.5px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(transferHistory.transfers || []).map((tr, i) => (
                      <tr key={tr.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <td style={{ padding: "9px 12px", color: "#94a3b8" }}>{i + 1}</td>
                        <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#2563eb", fontWeight: 700 }}>{tr.transfer_reference || `#${tr.id}`}</td>
                        <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{m.equipmentName || asset?.assetName || "—"}</td>
                        <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#7c3aed", fontSize: "11.5px" }}>{asset?.generatedAssetId || asset?.assetUniqueId || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#334155", whiteSpace: "nowrap" }}>{m.make || m.manufacturer || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#334155", whiteSpace: "nowrap" }}>{m.model || "—"}</td>
                        <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#334155", fontSize: "11.5px" }}>{m.serialNo || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#334155" }}>{tr.from_company_name || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#64748b" }}>{tr.from_department_name || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#334155", fontWeight: 600 }}>{tr.to_company_name || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#64748b" }}>{tr.to_department_name || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#475569", whiteSpace: "nowrap" }}>{tr.transferred_by_name || "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>{tr.transferred_at ? new Date(tr.transferred_at).toLocaleDateString("en-IN") : "—"}</td>
                        <td style={{ padding: "9px 12px", color: "#64748b", maxWidth: "180px" }}>{tr.reason || tr.remarks || "—"}</td>
                        <td style={{ padding: "9px 12px" }}>
                          <span style={{
                            padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700,
                            background: tr.status === "completed" ? "#dcfce7" : tr.status === "pending" ? "#fef3c7" : "#fee2e2",
                            color: tr.status === "completed" ? "#166534" : tr.status === "pending" ? "#92400e" : "#991b1b"
                          }}>
                            {tr.status || "completed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Indent Details */}
        {tab === "indent" && (
          <div style={{ maxWidth: "900px", margin: "0 auto" }}>
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Indent Details</h4>
            <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "24px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "12px" }}>
                {[
                  ["Indent No.", m.indentNo],
                  ["Indent Date", m.indentDate ? fmt(m.indentDate) : null],
                  ["Requested By", m.requestedBy],
                  ["Approved By", m.approvedBy],
                  ["Supplier", m.supplier || m.dealer],
                  ["PO Number", m.poNumber],
                  ["PO Date", m.poDate ? fmt(m.poDate) : null],
                  ["Quantity", m.quantity],
                  ["Unit Price", m.unitPrice ? `₹ ${m.unitPrice}` : null],
                  ["Total Cost", m.totalCost ? `₹ ${m.totalCost}` : (m.purchaseCost ? `₹ ${m.purchaseCost}` : null)],
                  ["GRN Number", m.grnNumber],
                  ["GRN Date", m.grnDate ? fmt(m.grnDate) : null],
                  ["Remarks", m.indentRemarks || m.remarks],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <FieldCard key={label} label={label} value={value} />
                ))}
              </div>
              {[m.indentNo, m.poNumber, m.grnNumber, m.requestedBy].every(v => !v) && (
                <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8", fontSize: "14px" }}>No indent details recorded for this asset.</div>
              )}
            </div>
          </div>
        )}

        {/* PMS History */}
        {tab === "pms_history" && (
          <div style={{ maxWidth: "100%", margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
              <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: 0 }}>PMS History</h4>
              {!isAdmin && pmsHistory && (pmsHistory.history || []).length > 0 && (
                <button
                  onClick={() => {
                    const headers = ["#", "Hospital", "Schedule No.", "Asset Name", "Asset ID", "Make", "Model", "Serial No.", "Department", "Checklist", "Scheduled Date", "Completed Date", "Engineer", "Dept. Head", "Status"];
                    const dataRows = (pmsHistory.history || []).map((h, i) => [
                      i + 1,
                      hospitalName || "",
                      h.scheduleNumber || "",
                      m.equipmentName || asset?.assetName || "",
                      asset?.generatedAssetId || asset?.assetUniqueId || "",
                      m.make || m.manufacturer || "",
                      m.model || "",
                      m.serialNo || "",
                      asset?.departmentName || "",
                      h.checklistName || "",
                      fmt(h.maintenanceDate),
                      fmt(h.completedAt),
                      h.engineerName || "",
                      h.reviewerName || "",
                      h.approvalStatus || h.status || "",
                    ]);
                    exportToExcel([headers, ...dataRows], "PMS-History");
                  }}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#16a34a", fontSize: "12.5px", fontWeight: 700, cursor: "pointer" }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="12" x2="12" y2="18" /><polyline points="9 15 12 18 15 15" /></svg>
                  Export Excel
                </button>
              )}
            </div>
            {pmsHistoryLoading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading PMS history…</div>
            ) : isAdmin ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                PMS history is available in the Employee Portal.
              </div>
            ) : !pmsHistory ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                Click the tab to load PMS history.
              </div>
            ) : (
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: 1050 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["#", "Hospital", "Schedule No.", "Asset Name", "Asset ID", "Make", "Model", "Serial No.", "Department", "Checklist", "Scheduled", "Completed", "Engineer", "Dept. Head", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "10.5px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(pmsHistory.history || []).map((h, idx) => {
                      const apSt = {
                        pending: { label: "Awaiting Closure", color: "#0891b2", bg: "#e0f2fe" },
                        auto_approved: { label: "Closed", color: "#059669", bg: "#dcfce7" },
                        approved: { label: "Closed", color: "#059669", bg: "#dcfce7" },
                        rejected: { label: "Rejected", color: "#dc2626", bg: "#fee2e2" },
                        rework_required: { label: "Rework", color: "#d97706", bg: "#ffedd5" },
                        completed: { label: "Completed", color: "#059669", bg: "#dcfce7" },
                        closed: { label: "Closed", color: "#059669", bg: "#dcfce7" },
                        pending_approval: { label: "Completed", color: "#059669", bg: "#dcfce7" },
                      }[h.approvalStatus || h.status] || { label: h.status || "—", color: "#64748b", bg: "#f1f5f9" };
                      return (
                        <tr key={h.id} style={{ borderBottom: "1px solid #f1f5f9" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                          onMouseLeave={e => e.currentTarget.style.background = ""}>
                          <td style={{ padding: "9px 12px", color: "#94a3b8" }}>{idx + 1}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{hospitalName || "—"}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 700, color: "#2563eb", fontFamily: "monospace" }}>{h.scheduleNumber}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{m.equipmentName || asset?.assetName || "—"}</td>
                          <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#7c3aed", fontSize: "11.5px" }}>{asset?.generatedAssetId || asset?.assetUniqueId || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#334155", whiteSpace: "nowrap" }}>{m.make || m.manufacturer || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#334155", whiteSpace: "nowrap" }}>{m.model || "—"}</td>
                          <td style={{ padding: "9px 12px", fontFamily: "monospace", color: "#334155", fontSize: "11.5px" }}>{m.serialNo || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{asset?.departmentName || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#374151" }}>{h.checklistName || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#374151", whiteSpace: "nowrap" }}>{fmt(h.maintenanceDate)}</td>
                          <td style={{ padding: "9px 12px", color: "#374151", whiteSpace: "nowrap" }}>{fmt(h.completedAt)}</td>
                          <td style={{ padding: "9px 12px", color: "#374151", whiteSpace: "nowrap" }}>{h.engineerName || "—"}</td>
                          <td style={{ padding: "9px 12px", color: "#374151", whiteSpace: "nowrap" }}>{h.reviewerName || "—"}</td>
                          <td style={{ padding: "9px 12px" }}>
                            <span style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: apSt.bg, color: apSt.color }}>
                              {apSt.label}
                            </span>
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

        {/* Training Details tab & panel removed */}

      </div>
    </div >
  );
}
