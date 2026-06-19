/**
 * AssetDetailPage – standalone full-screen asset detail view.
 * Opened in a new browser tab when the user clicks an asset ID.
 *
 * URL: /company/portal/asset/:id
 * Auth: reads cp_token from sessionStorage (company employee) OR
 *       company_portal_token from localStorage (admin portal).
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

const getApiBaseUrl = () => {
  if (typeof window !== "undefined" && window.VITE_API_URL) return window.VITE_API_URL;
  return import.meta.env?.VITE_API_URL || "";
};

const fmt = (v) => (v ? new Date(v).toLocaleDateString("en-IN") : "—");
// Convert any date format (dd/mm/yyyy, dd-mm-yyyy, ISO, etc.) → yyyy-MM-dd for <input type="date">
const toIsoDate = (d) => {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.substring(0, 10);
  if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(d)) { const p = d.split(/[\/\-]/); return `${p[2]}-${p[1]}-${p[0]}`; }
  const dt = new Date(d); return isNaN(dt) ? "" : dt.toISOString().substring(0, 10);
};

export default function AssetDetailPage() {
  const { id } = useParams();
  const cpToken    = sessionStorage.getItem("cp_token");
  const adminToken = localStorage.getItem("company_portal_token");
  const token      = cpToken || adminToken;
  const isAdmin    = !cpToken && !!adminToken;

  const [asset, setAsset] = useState(null);
  const [callLogs, setCallLogs] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [tab, setTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState(null);
  const [locBuildings, setLocBuildings] = useState([]);
  const [locFloors, setLocFloors] = useState([]);
  const [locRooms, setLocRooms] = useState([]);
  const [locDepts, setLocDepts] = useState([]);

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
    fetch(`${base}/api/company-portal/work-orders?assetId=${id}&limit=200`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setCallLogs(Array.isArray(d?.data) ? d.data : []))
      .catch(() => setCallLogs([]));
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
  };
  const warrantyStart = m.warrantyStart || m.warranty?.startDate || "";
  const warrantyEnd   = m.warrantyEnd   || m.warranty?.endDate   || "";
  const amcStart      = m.amcStart      || m.amc?.startDate      || "";
  const amcEnd        = m.amcEnd        || m.amc?.endDate        || "";
  const cmcStart      = m.cmcStart      || m.cmc?.startDate      || "";
  const cmcEnd        = m.cmcEnd        || m.cmc?.endDate        || "";

  const maint = [
    maintenanceTypes.warranty && "Warranty",
    maintenanceTypes.amc && "AMC",
    maintenanceTypes.cmc && "CMC",
    maintenanceTypes.inHouse && "In House",
    maintenanceTypes.catalyst && "Catalyst",
  ].filter(Boolean).join(", ") || m.maintenanceType || "—";

  const normalizeImgUrl = (img) => {
    const raw = typeof img === "string" ? img : (img?.url || img?.src || img?.path || "");
    if (!raw) return "";
    if (raw.startsWith("http") || raw.startsWith("/")) return raw;
    return `/${raw}`;
  };

  const images = [
    ...(Array.isArray(m.hcImages) ? m.hcImages : []),
    ...(Array.isArray(m.images) ? m.images : []),
    ...(Array.isArray(m.invoiceImages) ? m.invoiceImages : []),
    ...(m.invoiceUrl ? [m.invoiceUrl] : []),
  ].map(normalizeImgUrl).filter(Boolean);

  // Compute MTBF / MTTR / downtime from call logs
  const closed = (callLogs || []).filter(wo => (wo.status === "closed" || wo.status === "resolved") && wo.createdAt && wo.closedAt);
  const totalDownMs = closed.reduce((s, wo) => s + Math.max(0, new Date(wo.closedAt) - new Date(wo.createdAt)), 0);
  const fmtMs = (ms) => {
    const h = Math.floor(ms / 3600000);
    const min = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2,"0")}:${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  // MTBF = Total operating time / number of failures (failures = closed calls)
  const failures = closed.length;
  const assetAge = asset.createdAt ? Math.max(0, Date.now() - new Date(asset.createdAt)) : 0;
  const operatingMs = Math.max(0, assetAge - totalDownMs);
  const mtbfLabel = failures > 0 ? fmtMs(operatingMs / failures) : "0";
  // MTTR = Total downtime / number of breakdowns
  const mttrLabel = failures > 0 ? fmtMs(totalDownMs / failures) : "0";

  const totalDownLabel = totalDownMs > 0 ? fmtMs(totalDownMs) : "0";

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
    ["Total Down Time", totalDownLabel],
    ["MTBF (Mean Time Between Failure)", mtbfLabel],
    ["MTTR (Mean Time to Repair)", mttrLabel],
    ["RBER", m.rber ? "Yes" : null],
    ["Remarks", m.remarks],
    ["Department", asset.departmentName],
    ["Building", asset.building],
    ["Floor", asset.floor],
    ["Room / Area", asset.room],
    ["Working Status", asset.working_status || m.workingStatus],
    ["Status", asset.status],
    ["Registered On", asset.createdAt ? new Date(asset.createdAt).toLocaleDateString("en-IN") : null],
  ].filter(([, v]) => v && v !== "—");

  const TABS = [
    { key: "overview", label: "Overview" },
    { key: "calllogs", label: "Call Log History" },
    { key: "calibration", label: "Calibration History" },
    { key: "purchase", label: "Purchase History" },
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
      amc:      !!(m.amc?.enabled      || maintenanceTypes?.amc),
      cmc:      !!(m.cmc?.enabled      || maintenanceTypes?.cmc),
      inHouse:  !!(m.inHouse           || maintenanceTypes?.inHouse),
      catalyst: !!(m.catalyst          || maintenanceTypes?.catalyst),
      highEnd:  !!(m.highEnd           || maintenanceTypes?.highEnd),
    };
    const cal = m.calibration || {};
    setEditForm({
      assetName:      m.equipmentName || asset.assetName || "",
      make:           m.make || m.manufacturer || "",
      model:          m.model || "",
      serialNo:       m.serialNo || "",
      accessories:    m.accessories || "",
      dealer:         m.dealer || m.distributor || "",
      mfgYear:        m.mfgYear || m.manufacturingYear || "",
      installationDate: toIsoDate(m.installationDate),
      invoiceNo:      m.invoiceNo || "",
      purchaseDate:   m.purchaseDate || m.invoiceDate || "",
      purchaseCost:   m.purchaseCost || "",
      criticality:    m.criticality || asset.criticality || "Non_Critical",
      workingStatus:  m.workingStatus || asset.working_status || "Working",
      rber:           !!m.rber,
      remarks:        m.remarks || "",
      building:       asset.building || "",
      floor:          asset.floor || "",
      room:           asset.room || "",
      buildingId:     asset.buildingId ? String(asset.buildingId) : "",
      floorId:        asset.floorId   ? String(asset.floorId)   : "",
      roomId:         asset.roomId    ? String(asset.roomId)    : "",
      departmentId:   asset.departmentId ? String(asset.departmentId) : "",
      departmentName: asset.departmentName || "",
      // Maintenance
      mtWarranty: mt.warranty,
      mtAmc:      mt.amc,
      mtCmc:      mt.cmc,
      mtInHouse:  mt.inHouse,
      mtCatalyst: mt.catalyst,
      mtHighEnd:  mt.highEnd,
      warrantyStart: toIsoDate(m.warrantyStart || m.warranty?.startDate),
      warrantyEnd:   toIsoDate(m.warrantyEnd   || m.warranty?.endDate),
      amcStart:      toIsoDate(m.amcStart      || m.amc?.startDate),
      amcEnd:        toIsoDate(m.amcEnd        || m.amc?.endDate),
      cmcStart:      toIsoDate(m.cmcStart      || m.cmc?.startDate),
      cmcEnd:        toIsoDate(m.cmcEnd        || m.cmc?.endDate),
      // Calibration
      calibrationRequired:     !!(cal.required || m.calibrationRequired),
      calibrationFrequency:    cal.frequency || m.calibrationFrequency || "",
      lastCalibrationDate:     toIsoDate(cal.lastCalibrationDate || m.lastCalibrationDate),
      nextCalibrationDueDate:  toIsoDate(cal.nextCalibrationDueDate || m.nextCalibrationDueDate),
      calibrationVendorName:   cal.vendorName || m.calibrationVendorName || "",
      calibrationCertNo:       cal.certificateNumber || m.calibrationCertificateNumber || "",
      calibrationStatus:       cal.status || m.calibrationStatus || "Pending",
      alertBeforeDays:         cal.alertBeforeDays || m.alertBeforeDays || 30,
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
        equipmentName:    editForm.assetName,
        make:             editForm.make,
        manufacturer:     editForm.make,
        model:            editForm.model,
        serialNo:         editForm.serialNo,
        accessories:      editForm.accessories,
        dealer:           editForm.dealer,
        manufacturingYear: editForm.mfgYear,
        mfgYear:          editForm.mfgYear,
        installationDate: editForm.installationDate,
        invoiceNo:        editForm.invoiceNo,
        purchaseDate:     editForm.purchaseDate,
        purchaseCost:     editForm.purchaseCost,
        criticality:      editForm.criticality,
        workingStatus:    editForm.workingStatus,
        rber:             editForm.rber,
        remarks:          editForm.remarks,
        maintenanceTypes: {
          warranty: editForm.mtWarranty,
          amc:      editForm.mtAmc,
          cmc:      editForm.mtCmc,
          inHouse:  editForm.mtInHouse,
          catalyst: editForm.mtCatalyst,
          highEnd:  editForm.mtHighEnd,
        },
        warrantyStart: editForm.warrantyStart,
        warrantyEnd:   editForm.warrantyEnd,
        amcStart:      editForm.amcStart,
        amcEnd:        editForm.amcEnd,
        cmcStart:      editForm.cmcStart,
        cmcEnd:        editForm.cmcEnd,
        calibrationRequired:          editForm.calibrationRequired,
        calibrationFrequency:         editForm.calibrationFrequency || null,
        lastCalibrationDate:          editForm.lastCalibrationDate || null,
        nextCalibrationDueDate:       editForm.nextCalibrationDueDate || null,
        calibrationVendorName:        editForm.calibrationVendorName || null,
        calibrationCertificateNumber: editForm.calibrationCertNo || null,
        calibrationStatus:            editForm.calibrationStatus || null,
        alertBeforeDays:              editForm.alertBeforeDays ? Number(editForm.alertBeforeDays) : null,
        calibration: {
          required:              !!editForm.calibrationRequired,
          frequency:             editForm.calibrationFrequency || null,
          lastCalibrationDate:   editForm.lastCalibrationDate || null,
          nextCalibrationDueDate: editForm.nextCalibrationDueDate || null,
          vendorName:            editForm.calibrationVendorName || null,
          certificateNumber:     editForm.calibrationCertNo || null,
          status:                editForm.calibrationStatus || null,
          alertBeforeDays:       editForm.alertBeforeDays ? Number(editForm.alertBeforeDays) : null,
        },
      };

      const fullPayload = {
        assetName:    editForm.assetName,
        building:     editForm.building || null,
        floor:        editForm.floor || null,
        room:         editForm.room || null,
        buildingId:   editForm.buildingId ? Number(editForm.buildingId) : null,
        floorId:      editForm.floorId   ? Number(editForm.floorId)   : null,
        roomId:       editForm.roomId    ? Number(editForm.roomId)    : null,
        departmentId: editForm.departmentId ? Number(editForm.departmentId) : null,
        criticality:  editForm.criticality,
        workingStatus: editForm.workingStatus,
        calibrationRequired:         editForm.calibrationRequired,
        calibrationFrequency:        editForm.calibrationFrequency || null,
        lastCalibrationDate:         editForm.lastCalibrationDate || null,
        nextCalibrationDueDate:      editForm.nextCalibrationDueDate || null,
        calibrationVendorName:       editForm.calibrationVendorName || null,
        calibrationCertificateNumber: editForm.calibrationCertNo || null,
        calibrationStatus:           editForm.calibrationStatus || null,
        alertBeforeDays:             editForm.alertBeforeDays ? Number(editForm.alertBeforeDays) : null,
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
      // Re-fetch asset to get updated data
      const assetUrl = isAdmin
        ? `${base}/api/companies/assets/${id}`
        : `${base}/api/company-portal/assets/${id}`;
      const updated = await fetch(assetUrl, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      setAsset(updated);
      setShowEditModal(false);
    } catch (e) {
      setEditError(e.message || "Save failed");
    } finally {
      setEditSaving(false);
    }
  };

  const EField = ({ label, children, full }) => (
    <div style={full ? { gridColumn: "1 / -1" } : {}}>
      <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
    </div>
  );
  const EInput = ({ label, fkey, type = "text", full, placeholder }) => (
    <EField label={label} full={full}>
      <input type={type} value={editForm[fkey] || ""} onChange={e => setEditForm(p => ({ ...p, [fkey]: e.target.value }))}
        placeholder={placeholder || ""}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", outline: "none", boxSizing: "border-box" }} />
    </EField>
  );
  const ESec = ({ title }) => (
    <div style={{ gridColumn: "1 / -1", borderTop: "1px solid #f1f5f9", paddingTop: "12px", marginTop: "4px" }}>
      <p style={{ margin: 0, fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</p>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                    ["mtAmc",      "b. AMC (Annual Maintenance Contract)"],
                    ["mtCmc",      "c. CMC (Comprehensive Maintenance Contract)"],
                    ["mtInHouse",  "d. In House"],
                    ["mtCatalyst", "e. Catalyst"],
                    ["mtHighEnd",  "f. High End Equipment"],
                  ].map(([key, label]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: "7px", cursor: "pointer", fontSize: "13.5px", color: "#374151", fontWeight: 500 }}>
                      <input type="checkbox" checked={!!editForm[key]} onChange={e => {
                        if (e.target.checked) {
                          setEditForm(p => ({ ...p, mtWarranty: false, mtAmc: false, mtCmc: false, mtInHouse: false, mtCatalyst: false, mtHighEnd: false, [key]: true }));
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
                  <EInput label="Warranty End"   fkey="warrantyEnd"   type="date" />
                </>}
                {editForm.mtAmc && <>
                  <EInput label="AMC Start" fkey="amcStart" type="date" />
                  <EInput label="AMC End"   fkey="amcEnd"   type="date" />
                </>}
                {editForm.mtCmc && <>
                  <EInput label="CMC Start" fkey="cmcStart" type="date" />
                  <EInput label="CMC End"   fkey="cmcEnd"   type="date" />
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
          <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: asset.status === "Active" ? "#dcfce7" : "#f1f5f9", color: asset.status === "Active" ? "#16a34a" : "#475569" }}>{asset.status || "—"}</span>
          {(asset.working_status || m.workingStatus) && (
            <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 700, background: "#eff6ff", color: "#2563eb" }}>{asset.working_status || m.workingStatus}</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>{asset.departmentName && `Dept: ${asset.departmentName}`}</div>
          <button onClick={openEditModal}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "8px 16px", borderRadius: "8px", border: "none", background: "#2563eb", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", background: "#fff", padding: "0 24px", overflowX: "auto", flexShrink: 0 }}>
        {TABS.map(t => <button key={t.key} style={tabStyle(t.key)} onClick={() => setTab(t.key)}>{t.label}</button>)}
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
                    <a key={i} href={img} target="_blank" rel="noreferrer">
                      <img src={img} alt={`img-${i+1}`} style={{ width: "120px", height: "120px", objectFit: "cover", borderRadius: "10px", border: "1.5px solid #e2e8f0" }}
                        onError={e => { e.currentTarget.style.display = "none"; }} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Metrics row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
              <FieldCard label="Cost of Asset" value={m.purchaseCost ? `₹ ${m.purchaseCost}` : "0"} />
              <FieldCard label="Total Down Time" value={totalDownLabel} />
              <FieldCard label="MTBF (hh:mm:ss)" value={mtbfLabel} />
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
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Call Log History</h4>
            {callLogs === null ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading…</div>
            ) : callLogs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", color: "#94a3b8" }}>No call logs found</div>
            ) : (
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["WO Number", "Description", "Priority", "Status", "Assigned To", "Created", "Closed", "Down Time"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {callLogs.map(wo => {
                      const dtMs = (wo.status === "closed" || wo.status === "resolved") && wo.createdAt && wo.closedAt ? Math.max(0, new Date(wo.closedAt) - new Date(wo.createdAt)) : 0;
                      return (
                        <tr key={wo.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#2563eb", fontWeight: 600 }}>{wo.workOrderNumber || `WO-${wo.id}`}</td>
                          <td style={{ padding: "10px 14px", color: "#334155" }}>{wo.issueDescription || "—"}</td>
                          <td style={{ padding: "10px 14px" }}><span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: "#f1f5f9", color: "#64748b" }}>{wo.priority || "—"}</span></td>
                          <td style={{ padding: "10px 14px" }}><span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: "#dcfce7", color: "#166534" }}>{wo.status || "—"}</span></td>
                          <td style={{ padding: "10px 14px", color: "#475569" }}>{wo.assignedToName || "Unassigned"}</td>
                          <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{wo.createdAt ? new Date(wo.createdAt).toLocaleDateString("en-IN") : "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#64748b", fontSize: "12px" }}>{wo.closedAt ? new Date(wo.closedAt).toLocaleDateString("en-IN") : "—"}</td>
                          <td style={{ padding: "10px 14px", color: dtMs > 0 ? "#dc2626" : "#94a3b8", fontWeight: dtMs > 0 ? 600 : 400, fontSize: "12px" }}>{dtMs > 0 ? fmtMs(dtMs) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Calibration */}
        {tab === "calibration" && (
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <h4 style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Calibration Records</h4>
            {calibration === null ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading…</div>
            ) : calibration.length === 0 ? (
              <div style={{ textAlign: "center", padding: "48px", color: "#94a3b8" }}>No calibration records</div>
            ) : (
              <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["Date", "Next Due", "Vendor", "Certificate No.", "Status", "Remarks"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: "11px", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {calibration.map(cr => (
                      <tr key={cr.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "10px 14px" }}>{cr.calibrationDate ? new Date(cr.calibrationDate).toLocaleDateString("en-IN") : "—"}</td>
                        <td style={{ padding: "10px 14px", color: cr.nextDueDate && new Date(cr.nextDueDate) < new Date() ? "#dc2626" : "#475569" }}>{cr.nextDueDate ? new Date(cr.nextDueDate).toLocaleDateString("en-IN") : "—"}</td>
                        <td style={{ padding: "10px 14px" }}>{cr.vendorName || "—"}</td>
                        <td style={{ padding: "10px 14px", fontFamily: "monospace", color: "#2563eb" }}>{cr.certificateNumber || "—"}</td>
                        <td style={{ padding: "10px 14px" }}><span style={{ padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 700, background: "#dcfce7", color: "#166534" }}>{cr.status || "Active"}</span></td>
                        <td style={{ padding: "10px 14px", color: "#64748b" }}>{cr.remarks || "—"}</td>
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
                    {maintenanceTypes.warranty && <span style={{ padding: "4px 12px", borderRadius: "20px", fontSize: "12px", fontWeight: 600, background: "#dcfce7", color: "#166534" }}>Warranty</span>}
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

      </div>
    </div>
  );
}
