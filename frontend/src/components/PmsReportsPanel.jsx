/**
 * PmsReportsPanel.jsx
 * Asset-wise PMS maintenance history report.
 */
import React, { useEffect, useState, useCallback } from "react";

const getBase = () => import.meta.env?.VITE_API_URL || "";

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// PSA raw status (before any submission)
const PSA_STATUS_STYLES = {
  pending:     { label: "Scheduled",   color: "#2563eb", bg: "#dbeafe" },
  in_progress: { label: "In Progress", color: "#d97706", bg: "#ffedd5" },
  missed:      { label: "Missed",      color: "#dc2626", bg: "#fee2e2" },
  cancelled:   { label: "Cancelled",   color: "#64748b", bg: "#f1f5f9" },
};

// Approval-level status (after engineer submits / dept-head reviews)
const APPROVAL_STYLES = {
  pending:         { label: "Completed",  color: "#059669", bg: "#dcfce7" }, // submitted by eng, awaiting dept-head
  auto_approved:   { label: "Completed",  color: "#059669", bg: "#dcfce7" }, // no dept-head in company → auto-pass
  approved:        { label: "Completed",  color: "#059669", bg: "#dcfce7" }, // approved but not yet closed
  rejected:        { label: "Rejected",   color: "#dc2626", bg: "#fee2e2" },
  rework_required: { label: "Rework",     color: "#d97706", bg: "#ffedd5" },
  completed:       { label: "Completed",  color: "#059669", bg: "#dcfce7" },
  closed:          { label: "Closed",     color: "#0891b2", bg: "#e0f2fe" }, // only when dept-head explicitly closes
  pending_approval:{ label: "Completed",  color: "#059669", bg: "#dcfce7" },
};

/**
 * Badge resolves display status correctly:
 *   approvalStatus set  → engineer has submitted  → use APPROVAL_STYLES
 *   approvalStatus null → not yet submitted        → use PSA_STATUS_STYLES
 */
const Badge = ({ status, approvalStatus }) => {
  let s;
  if (approvalStatus != null && approvalStatus !== "") {
    s = APPROVAL_STYLES[approvalStatus] || { label: approvalStatus, color: "#64748b", bg: "#f1f5f9" };
  } else {
    s = PSA_STATUS_STYLES[status] || APPROVAL_STYLES[status] || { label: status || "—", color: "#64748b", bg: "#f1f5f9" };
  }
  return (
    <span style={{ padding: "3px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
};

export default function PmsReportsPanel({ token }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [assetHistory, setAssetHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [assignmentDetail, setAssignmentDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const r = await fetch(`${getBase()}/api/company-portal/pms/reports${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setAssets(Array.isArray(d) ? d : []);
    } catch { setAssets([]); } finally { setLoading(false); }
  }, [token, search]);

  useEffect(() => { void load(); }, [load]);

  const openAsset = async (asset) => {
    setSelectedAsset(asset);
    setAssetHistory(null);
    setSelectedAssignment(null);
    setHistoryLoading(true);
    try {
      const r = await fetch(`${getBase()}/api/company-portal/pms/reports/${asset.assetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setAssetHistory(d);
    } catch { setAssetHistory(null); } finally { setHistoryLoading(false); }
  };

  const openAssignment = async (item) => {
    setSelectedAssignment(item);
    setAssignmentDetail(null);
    setDetailLoading(true);
    try {
      const r = await fetch(`${getBase()}/api/company-portal/pms/assignments/${item.id}/responses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setAssignmentDetail(d);
    } catch { setAssignmentDetail(null); } finally { setDetailLoading(false); }
  };

  // ── Assignment Detail View ──────────────────────────────────────────────────
  if (selectedAssignment) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => setSelectedAssignment(null)}
            style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            ← Back to History
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>PMS Submission Detail</h2>
        </div>

        {detailLoading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Loading…</div>
        ) : assignmentDetail ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
            {/* Summary */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Submission Summary</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {[
                  ["Asset", assignmentDetail.assetName],
                  ["Asset Code", assignmentDetail.generatedAssetId],
                  ["Department", assignmentDetail.departmentName],
                  ["Schedule", assignmentDetail.scheduleNumber],
                  ["Maintenance Date", fmt(assignmentDetail.maintenanceDate)],
                  ["Completed", fmt(assignmentDetail.completedAt || assignmentDetail.submitted_at)],
                  ["Engineer", assignmentDetail.engineerName],
                  ["Checklist", assignmentDetail.checklistName],
                  ["Status", <Badge key="s" status={assignmentDetail.status} approvalStatus={assignmentDetail.approvalStatus} />],
                  ["Approved By", assignmentDetail.approvedByName],
                  ["Approval Date", fmt(assignmentDetail.approved_at)],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13.5, color: "#0f172a", fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
              {assignmentDetail.engineer_notes && (
                <div style={{ marginTop: 14, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 3 }}>ENGINEER REMARKS</div>
                  <div style={{ fontSize: 13.5, color: "#78350f" }}>{assignmentDetail.engineer_notes}</div>
                </div>
              )}
              {assignmentDetail.approval_comments && (
                <div style={{ marginTop: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#15803d", marginBottom: 3 }}>DEPT. HEAD COMMENTS</div>
                  <div style={{ fontSize: 13.5, color: "#166534" }}>{assignmentDetail.approval_comments}</div>
                </div>
              )}
            </div>

            {/* Checklist Responses */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Checklist Responses</h3>
              {assignmentDetail.responses?.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["#", "Inspection Point", "Type", "Response", "Remarks"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: 12, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {assignmentDetail.responses.map((r, i) => {
                      const isPass = ["pass","yes","ok","cleaned","good"].includes((r.responseValue || "").toLowerCase());
                      const isFail = ["fail","no","not ok","not cleaned","bad"].includes((r.responseValue || "").toLowerCase());
                      return (
                        <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "8px 12px", color: "#94a3b8", fontWeight: 700 }}>{i + 1}</td>
                          <td style={{ padding: "8px 12px", color: "#0f172a", fontWeight: 600 }}>
                            {r.inspectionPoint}
                            {r.isMandatory ? <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span> : null}
                          </td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{r.checkType}</td>
                          <td style={{ padding: "8px 12px" }}>
                            <span style={{
                              padding: "2px 9px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                              background: isPass ? "#dcfce7" : isFail ? "#fee2e2" : "#f1f5f9",
                              color: isPass ? "#15803d" : isFail ? "#dc2626" : "#374151",
                            }}>
                              {r.responseValue || "—"}
                            </span>
                          </td>
                          <td style={{ padding: "8px 12px", color: "#64748b" }}>{r.remarks || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "#94a3b8", padding: "12px 0" }}>No checklist responses were recorded for this submission.</p>
              )}
            </div>

            {/* Audit Log */}
            {assignmentDetail.auditLog?.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Audit Timeline</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {assignmentDetail.auditLog.map((log) => (
                    <div key={log.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563eb", marginTop: 6, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>
                          {log.action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                        </div>
                        <div style={{ fontSize: 11.5, color: "#64748b" }}>
                          {log.actor_name} ({log.actor_role}) · {new Date(log.created_at).toLocaleString("en-IN")}
                        </div>
                        {log.comments && <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>{log.comments}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p style={{ color: "#dc2626" }}>Could not load submission detail.</p>
        )}
      </div>
    );
  }

  // ── Asset History View ──────────────────────────────────────────────────────
  if (selectedAsset) {
    const asset = assetHistory?.asset || selectedAsset;
    const history = assetHistory?.history || [];
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => setSelectedAsset(null)}
            style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
            ← All Assets
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>{asset.assetName}</h2>
        </div>

        {/* Asset info */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {[
              ["Asset Code", asset.generatedAssetId || asset.assetUniqueId],
              ["Department", asset.departmentName],
              ["Location", [asset.building, asset.floor, asset.room].filter(Boolean).join(" / ")],
              ["Last PMS", fmt(asset.lastPmsDate)],
              ["Next PMS Due", fmt(asset.nextPmsDue)],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 13.5, color: "#0f172a", fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {historyLoading ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>Loading history…</div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Schedule No.", "Checklist", "Scheduled", "Completed", "Engineer", "Dept. Head", "Status", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: 12, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No PMS history found.</td></tr>
                ) : history.map((h) => (
                  <tr key={h.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: "#2563eb", fontFamily: "monospace", cursor: "pointer", textDecoration: "underline" }}
                      onClick={() => openAssignment(h)}>{h.scheduleNumber}</td>
                    <td style={{ padding: "10px 14px", color: "#374151" }}>{h.checklistName || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#374151" }}>{fmt(h.maintenanceDate)}</td>
                    <td style={{ padding: "10px 14px", color: "#374151" }}>{fmt(h.completedAt)}</td>
                    <td style={{ padding: "10px 14px", color: "#374151" }}>{h.engineerName || "—"}</td>
                    <td style={{ padding: "10px 14px", color: "#374151" }}>{h.reviewerName || "—"}</td>
                    <td style={{ padding: "10px 14px" }}><Badge status={h.status} approvalStatus={h.approvalStatus} /></td>
                    <td style={{ padding: "10px 14px" }}>
                      <button onClick={() => openAssignment(h)}
                        style={{ padding: "5px 12px", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 6, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>
                        View Responses
                      </button>
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

  // ── Asset List View ─────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>PMS Reports</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>Asset-wise preventive maintenance history.</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Search by asset name, code or QR…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          style={{ flex: 1, padding: "9px 13px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13.5, outline: "none" }}
        />
        <button onClick={load}
          style={{ padding: "9px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13.5 }}>
          Search
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Loading…</div>
      ) : assets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <p style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>No PMS records found.</p>
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Asset", "Department", "Last PMS", "Next PMS", "Total", "Closed", "Pending"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: 12, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.assetId}
                  onClick={() => openAsset(a)}
                  style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                  <td style={{ padding: "12px 14px" }}>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{a.assetName}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{a.generatedAssetId || a.assetUniqueId}</div>
                  </td>
                  <td style={{ padding: "12px 14px", color: "#374151" }}>{a.departmentName || "—"}</td>
                  <td style={{ padding: "12px 14px", color: "#374151" }}>{fmt(a.lastPmsDate)}</td>
                  <td style={{ padding: "12px 14px", color: a.nextPmsDate && new Date(a.nextPmsDate) < new Date() ? "#dc2626" : "#374151" }}>
                    {fmt(a.nextPmsDate)}
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontWeight: 700, color: "#0f172a" }}>{a.totalPms}</span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <span style={{ fontWeight: 700, color: "#0891b2" }}>{a.closedPms ?? 0}</span>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    {a.pendingApproval > 0 ? (
                      <span style={{ padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#f3e8ff", color: "#7c3aed" }}>{a.pendingApproval} pending</span>
                    ) : <span style={{ color: "#94a3b8" }}>—</span>}
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
