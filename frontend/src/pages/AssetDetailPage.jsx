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

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, sans-serif", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
        <div style={{ fontSize: "12px", color: "#94a3b8" }}>{asset.departmentName && `Dept: ${asset.departmentName}`}</div>
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
