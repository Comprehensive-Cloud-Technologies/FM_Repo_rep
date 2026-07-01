/**
 * AssetScanPage
 * Public page shown when a QR / barcode is scanned.
 * Shows full asset details + "Raise a Query" form.
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/runtimeConfig";
import catalystLogo from "../images/image.png";

const BASE = getApiBaseUrl();

const DEFAULT_QUERIES_FALLBACK = [
  "Equipment not working",
  "Maintenance required",
  "Calibration needed",
  "Accessories missing",
  "Physical damage observed",
  "Other",
];

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9", gap: "12px" }}>
      <span style={{ fontSize: "12px", color: "#64748b", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{ fontSize: "11px", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px" }}>{title}</div>
      {children}
    </div>
  );
}

export default function AssetScanPage() {
  const { assetId } = useParams();

  const [asset, setAsset] = useState(null);
  const [calibrationHistory, setCalibrationHistory] = useState([]);
  const [assetLoading, setAssetLoading] = useState(true);
  const [assetError, setAssetError] = useState(null);
  const [defaultQueries, setDefaultQueries] = useState(DEFAULT_QUERIES_FALLBACK);

  const [showQueryForm, setShowQueryForm] = useState(false);
  const [queryForm, setQueryForm] = useState({ requesterName: "", requesterPhone: "", requesterEmail: "", queryType: "", message: "" });
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [querySuccess, setQuerySuccess] = useState(false);
  const [queryError, setQueryError] = useState(null);

  useEffect(() => {
    if (!assetId) return;
    fetch(`${BASE}/api/asset-qr/${assetId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data) => {
        if (data?.asset) {
          setAsset(data.asset);
          setCalibrationHistory(Array.isArray(data?.calibrationHistory) ? data.calibrationHistory : []);
        } else setAssetError("Asset not found.");
      })
      .catch(() => setAssetError("Failed to load asset details."))
      .finally(() => setAssetLoading(false));

    fetch(`${BASE}/api/asset-qr/${assetId}/queries/defaults`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.questions?.length) setDefaultQueries(data.questions); })
      .catch(() => {});
  }, [assetId]);

  const handleQueryChange = (field, value) => setQueryForm((prev) => ({ ...prev, [field]: value }));

  const handleQuerySubmit = async (e) => {
    e.preventDefault();
    if (!queryForm.requesterName.trim()) { setQueryError("Please enter your name."); return; }
    setQuerySubmitting(true); setQueryError(null);
    try {
      const resp = await fetch(`${BASE}/api/asset-qr/${assetId}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(queryForm),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "Submission failed");
      setQuerySuccess(true);
    } catch (err) {
      setQueryError(err.message);
    } finally {
      setQuerySubmitting(false);
    }
  };

  const meta = asset?.metadata || {};
  const calibration = meta?.calibration || {};
  const calibrationStatus = asset?.calibrationStatus || calibration.status;
  const calibrationDueDate = asset?.nextCalibrationDueDate || calibration.nextCalibrationDueDate;
  const calibrationVendor = asset?.calibrationVendorName || calibration.vendorName;
  const calibrationCertificate = calibration.certificateNumber;

  const maintenanceLabel = () => {
    const map = { warranty: "Warranty", amc: "AMC", cmc: "CMC", inhouse: "In-House", catalyst: "Catalyst FM" };
    return map[meta.maintenanceType] || meta.maintenanceType;
  };

  const maintenanceDates = () => {
    const t = meta.maintenanceType;
    if (!t) return null;
    const start = meta[`${t}Start`], end = meta[`${t}End`];
    if (start && end) return `${start} → ${end}`;
    if (start) return `From ${start}`;
    return null;
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #f0f9ff 0%, #e8f4fd 100%)", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px 48px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
        <img src={catalystLogo} alt="Catalyst FM" style={{ height: "36px", objectFit: "contain" }} />
        <span style={{ fontSize: "15px", fontWeight: 800, color: "#1e3a8a" }}>Catalyst FM</span>
      </div>

      <div style={{ width: "100%", maxWidth: "460px" }}>
        {assetLoading && (
          <div style={{ background: "#fff", borderRadius: "16px", padding: "40px", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
            <div style={{ width: "36px", height: "36px", border: "4px solid #e0f2fe", borderTop: "4px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ color: "#64748b", margin: 0 }}>Loading asset details…</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {assetError && !assetLoading && (
          <div style={{ background: "#fff", borderRadius: "16px", padding: "32px 24px", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>⚠️</div>
            <h3 style={{ margin: "0 0 8px", color: "#dc2626" }}>Asset Not Found</h3>
            <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>{assetError}</p>
          </div>
        )}

        {asset && !assetLoading && !querySuccess && (
          <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg, #1e3a8a, #2563eb)", padding: "20px 20px 16px" }}>
              <div style={{ fontSize: "11px", color: "#93c5fd", marginBottom: "4px", fontWeight: 600 }}>ASSET DETAILS</div>
              <h2 style={{ margin: 0, color: "#fff", fontSize: "18px", fontWeight: 800 }}>{asset.assetName}</h2>
              {asset.assetUniqueId && (
                <div style={{ marginTop: "6px", fontFamily: "monospace", fontSize: "12px", background: "rgba(255,255,255,0.15)", color: "#e0f2fe", padding: "3px 8px", borderRadius: "6px", display: "inline-block" }}>
                  {asset.assetUniqueId}
                </div>
              )}
              {asset.departmentName && (
                <div style={{ marginTop: "10px", fontSize: "12px", color: "#bfdbfe" }}>
                  📍 {[asset.building, asset.floor, asset.room, asset.departmentName].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>

            <div style={{ padding: "20px" }}>
              {!showQueryForm ? (
                <>
                  {/* Equipment photos */}
                  {Array.isArray(meta.hcImages) && meta.hcImages.length > 0 && (
                    <Section title="Equipment Photos">
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {meta.hcImages.map((img, i) => {
                          const rawUrl = typeof img === "string" ? img : (img?.url || img?.src || img?.path || "");
                          const src = rawUrl.startsWith("http") ? rawUrl : `${BASE.replace(/\/$/, "")}${rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`}`;
                          const label = typeof img === "object" ? (img?.name || `photo-${i+1}`) : `photo-${i+1}`;
                          return (
                            <a key={i} href={src} target="_blank" rel="noreferrer">
                              <img src={src} alt={label} style={{ width: "72px", height: "72px", objectFit: "cover", borderRadius: "6px", border: "1px solid #e2e8f0", cursor: "pointer" }} />
                            </a>
                          );
                        })}
                      </div>
                    </Section>
                  )}

                  <Section title="Equipment Information">
                    <InfoRow label="Make / Brand" value={meta.make || meta.manufacturer} />
                    <InfoRow label="Model" value={meta.model} />
                    <InfoRow label="Serial No." value={meta.serialNo} />
                    <InfoRow label="Accessories" value={meta.accessories} />
                    <InfoRow label="Dealer / Distributor" value={meta.dealer} />
                    <InfoRow label="Mfg. Year" value={meta.manufacturingYear} />
                    <InfoRow label="Installation Date" value={meta.installationDate || meta.hcInstallationDate} />
                    <InfoRow label="Invoice No." value={meta.invoiceNo} />
                    <InfoRow label="Purchase Cost" value={meta.purchaseCost ? `₹ ${Number(meta.purchaseCost).toLocaleString("en-IN")}` : null} />
                    {meta.hcInvoiceUrl && (
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f1f5f9", gap: "12px" }}>
                        <span style={{ fontSize: "12px", color: "#64748b", flexShrink: 0 }}>Invoice Document</span>
                        <a href={meta.hcInvoiceUrl} target="_blank" rel="noreferrer" style={{ fontSize: "13px", fontWeight: 600, color: "#2563eb" }}>📄 View</a>
                      </div>
                    )}
                  </Section>

                  {meta.maintenanceType && (
                    <Section title="Maintenance Status">
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: "#f5f3ff", color: "#7c3aed", border: "1px solid #ede9fe" }}>{maintenanceLabel()}</span>
                        {meta.rber && <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}>RBER</span>}
                      </div>
                      {maintenanceDates() && <InfoRow label="Period" value={maintenanceDates()} />}
                    </Section>
                  )}

                  {(calibrationStatus || calibrationDueDate || calibrationVendor) && (
                    <Section title="Calibration Status">
                      <InfoRow label="Status" value={calibrationStatus} />
                      <InfoRow label="Due Date" value={calibrationDueDate} />
                      <InfoRow label="Vendor" value={calibrationVendor} />
                      <InfoRow label="Certificate" value={calibrationCertificate} />
                    </Section>
                  )}

                  {calibrationHistory.length > 0 && (
                    <Section title="Calibration History">
                      {calibrationHistory.slice(0, 5).map((row) => (
                        <div key={row.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
                            {row.calibrationDate} → {row.nextDueDate || "-"}
                          </div>
                          <div style={{ fontSize: "12px", color: "#64748b" }}>
                            {(row.vendorName || "Vendor N/A")} · {(row.status || "Pending")}
                            {row.certificateUrl ? (
                              <a href={row.certificateUrl} target="_blank" rel="noreferrer" style={{ marginLeft: "8px", color: "#2563eb", fontWeight: 600 }}>View PDF</a>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </Section>
                  )}

                  {meta.remarks && (
                    <Section title="Remarks">
                      <p style={{ margin: 0, fontSize: "13px", color: "#475569", lineHeight: "1.6" }}>{meta.remarks}</p>
                    </Section>
                  )}

                  {asset.companyName && (
                    <Section title="Facility">
                      <InfoRow label="Facility" value={asset.companyName} />
                    </Section>
                  )}

                  <button onClick={() => setShowQueryForm(true)} style={{ width: "100%", marginTop: "8px", padding: "14px", borderRadius: "12px", background: "linear-gradient(135deg, #2563eb, #1d4ed8)", color: "#fff", border: "none", cursor: "pointer", fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", boxShadow: "0 4px 12px rgba(37,99,235,0.3)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Raise a Query / Request Service
                  </button>
                </>
              ) : (
                <form onSubmit={handleQuerySubmit}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                    <button type="button" onClick={() => { setShowQueryForm(false); setQueryError(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: "13px", padding: "4px 0" }}>← Back</button>
                    <span style={{ fontSize: "15px", fontWeight: 800, color: "#0f172a" }}>Raise a Query</span>
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "5px" }}>Your Name *</label>
                    <input type="text" required value={queryForm.requesterName} onChange={(e) => handleQueryChange("requesterName", e.target.value)} placeholder="Full name" style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "5px" }}>Phone Number</label>
                    <input type="tel" value={queryForm.requesterPhone} onChange={(e) => handleQueryChange("requesterPhone", e.target.value)} placeholder="Mobile number" style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", outline: "none", boxSizing: "border-box" }} />
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "5px" }}>Query Type</label>
                    <select value={queryForm.queryType} onChange={(e) => handleQueryChange("queryType", e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", outline: "none", background: "#fff", boxSizing: "border-box" }}>
                      <option value="">Select issue type…</option>
                      {defaultQueries.map((q) => <option key={q} value={q}>{q}</option>)}
                    </select>
                  </div>

                  <div style={{ marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "5px" }}>Additional Details</label>
                    <textarea value={queryForm.message} onChange={(e) => handleQueryChange("message", e.target.value)} placeholder="Describe the issue in more detail…" rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid #d1d5db", fontSize: "14px", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                  </div>

                  {queryError && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", padding: "10px 12px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>{queryError}</div>}

                  <button type="submit" disabled={querySubmitting} style={{ width: "100%", padding: "14px", borderRadius: "12px", background: querySubmitting ? "#94a3b8" : "linear-gradient(135deg, #16a34a, #15803d)", color: "#fff", border: "none", cursor: querySubmitting ? "not-allowed" : "pointer", fontSize: "15px", fontWeight: 700 }}>
                    {querySubmitting ? "Submitting…" : "Submit Query"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {querySuccess && (
          <div style={{ background: "#fff", borderRadius: "16px", padding: "40px 24px", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}>
            <div style={{ width: "64px", height: "64px", background: "#f0fdf4", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: "32px" }}>✅</div>
            <h3 style={{ margin: "0 0 8px", color: "#16a34a", fontSize: "18px" }}>Query Submitted!</h3>
            <p style={{ color: "#64748b", fontSize: "14px", lineHeight: "1.6", margin: "0 0 20px" }}>Our team has been notified and will reach out to you shortly.</p>
            <button onClick={() => { setQuerySuccess(false); setShowQueryForm(false); setQueryForm({ requesterName: "", requesterPhone: "", requesterEmail: "", queryType: "", message: "" }); }} style={{ padding: "10px 24px", borderRadius: "10px", background: "#2563eb", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "14px" }}>
              Back to Asset Details
            </button>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: "24px", fontSize: "11px", color: "#94a3b8" }}>
          Powered by <strong>Catalyst FM</strong> · Facility Management Platform
        </div>
      </div>
    </div>
  );
}
