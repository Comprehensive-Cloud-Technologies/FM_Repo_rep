/**
 * PmsApprovalsPanel.jsx
 * Department Head / Admin view for reviewing and approving completed PMS submissions.
 */
import React, { useEffect, useState, useCallback } from "react";

const getBase = () => import.meta.env?.VITE_API_URL || "";

const STATUS_STYLES = {
  pending:          { label: "Awaiting Closure",  color: "#0891b2", bg: "#e0f2fe" },
  auto_approved:    { label: "Closed",            color: "#059669", bg: "#dcfce7" },
  approved:         { label: "Closed",            color: "#059669", bg: "#dcfce7" },
  closed:           { label: "Closed",            color: "#059669", bg: "#dcfce7" },
  rejected:         { label: "Rejected",          color: "#dc2626", bg: "#fee2e2" },
  rework_required:  { label: "Rework Required",   color: "#d97706", bg: "#ffedd5" },
};

const Badge = ({ status }) => {
  const s = STATUS_STYLES[status] || { label: status, color: "#64748b", bg: "#f1f5f9" };
  return (
    <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
};

const fmt = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export default function PmsApprovalsPanel({ token, currentUser }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${getBase()}/api/company-portal/pms/dept-head/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setList(Array.isArray(d) ? d : []);
    } catch { setList([]); } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = async (item) => {
    setSelected(item);
    setDetail(null);
    setComments("");
    setMsg("");
    setDetailLoading(true);
    try {
      const r = await fetch(`${getBase()}/api/company-portal/pms/dept-head/${item.id}/details`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setDetail(d);
    } catch { setDetail(null); } finally { setDetailLoading(false); }
  };

  const submitReview = async (decision) => {
    setSaving(true); setMsg("");
    try {
      const r = await fetch(`${getBase()}/api/company-portal/pms/dept-head/${selected.id}/review`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ decision, approvalComments: comments }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.message); }
      setMsg(decision === "closed" ? "✓ PMS closed successfully." : "✓ Rework requested. Engineer will be notified.");
      setSelected(null);
      void load();
    } catch (e) { setMsg(`Error: ${e.message}`); } finally { setSaving(false); }
  };

  // ── Detail modal ────────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => setSelected(null)}
            style={{ padding: "8px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#374151" }}>
            ← Back
          </button>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0 }}>PMS Review</h2>
        </div>

        {detailLoading ? (
          <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Loading submission details…</div>
        ) : detail ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, maxWidth: 1100 }}>
            {/* Asset Info */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, gridColumn: "span 2" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Asset Information</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {[
                  ["Asset Name", detail.assetName],
                  ["Asset Code", detail.generatedAssetId || detail.assetUniqueId],
                  ["Department", detail.departmentName],
                  ["Location", [detail.building, detail.floor, detail.room].filter(Boolean).join(" / ")],
                  ["Checklist", detail.checklistName],
                  ["Schedule No.", detail.scheduleNumber],
                  ["Maintenance Date", fmt(detail.maintenanceDate)],
                  ["Completed Date", fmt(detail.completedAt)],
                  ["Engineer", detail.engineerName],
                  ["Status", <Badge key="st" status={detail.approvalStatus || detail.status} />],
                ].map(([label, value]) => value ? (
                  <div key={label} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13.5, color: "#0f172a", fontWeight: 600 }}>{value}</div>
                  </div>
                ) : null)}
              </div>
              {detail.engineerNotes && (
                <div style={{ marginTop: 14, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 3 }}>ENGINEER REMARKS</div>
                  <div style={{ fontSize: 13.5, color: "#78350f" }}>{detail.engineerNotes}</div>
                </div>
              )}
            </div>

            {/* Checklist Responses */}
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, gridColumn: "span 2" }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Checklist Responses</h3>
              {detail.responses?.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      {["#", "Inspection Point", "Type", "Response", "Remarks"].map(h => (
                        <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontWeight: 700, color: "#475569", fontSize: 12, borderBottom: "1px solid #e2e8f0" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.responses.map((r, i) => {
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
                <p style={{ color: "#94a3b8", fontSize: 13.5 }}>No responses recorded.</p>
              )}
            </div>

            {/* Review Action */}
            {(detail.approvalStatus === "pending" || detail.approvalStatus === "auto_approved" || currentUser?.role === "admin") && (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, gridColumn: "span 2" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Review Action</h3>
                <p style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>
                  Review the engineer's submission above. Add optional remarks then close or request rework.
                </p>
                <textarea
                  placeholder="Remarks (optional)…"
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13.5, resize: "vertical", boxSizing: "border-box" }}
                />
                {msg && <p style={{ fontSize: 13, color: msg.startsWith("✓") ? "#16a34a" : "#dc2626", marginTop: 8 }}>{msg}</p>}
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button onClick={() => submitReview("rework_required")} disabled={saving}
                    style={{ padding: "10px 22px", background: "#d97706", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                    {saving ? "…" : "↩ Request Rework"}
                  </button>
                  <button onClick={() => submitReview("closed")} disabled={saving}
                    style={{ padding: "10px 28px", background: "#0891b2", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
                    {saving ? "Closing…" : "🔒 Close PMS"}
                  </button>
                </div>
              </div>
            )}

            {/* Already reviewed */}
            {detail.approvalStatus !== "pending" && detail.approvedAt && (
              <div style={{ background: "#f0fdf4", borderRadius: 12, border: "1px solid #bbf7d0", padding: 20, gridColumn: "span 2" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#15803d", margin: "0 0 10px" }}>Review Record</h3>
                <p style={{ margin: 0, fontSize: 13.5, color: "#166534" }}>
                  <strong>{detail.reviewerName || detail.approvedByName}</strong> {detail.approvalStatus} this PMS on{" "}
                  {fmt(detail.approvedAt)}.
                </p>
                {detail.approvalComments && (
                  <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "#166534" }}>"{detail.approvalComments}"</p>
                )}
              </div>
            )}

            {/* Audit Log */}
            {detail.auditLog?.length > 0 && (
              <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, gridColumn: "span 2" }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" }}>Audit Timeline</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {detail.auditLog.map((log, i) => (
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
          <p style={{ color: "#dc2626" }}>Could not load details.</p>
        )}
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────────
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: 0 }}>PMS Approvals</h2>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Review and approve completed preventive maintenance submissions.
          </p>
        </div>
        <button onClick={load}
          style={{ padding: "8px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#374151" }}>
          ↺ Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#94a3b8" }}>Loading…</div>
      ) : list.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <p style={{ color: "#64748b", fontSize: 14, fontWeight: 600 }}>No pending approvals</p>
          <p style={{ color: "#94a3b8", fontSize: 13 }}>All PMS submissions have been reviewed.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map((item) => (
            <div key={item.id}
              onClick={() => openDetail(item)}
              style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "16px 20px", cursor: "pointer", transition: "box-shadow 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)"}
              onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{item.assetName}</span>
                  <Badge status={item.approvalStatus} />
                </div>
                <div style={{ fontSize: 12.5, color: "#64748b" }}>
                  {item.generatedAssetId || item.assetUniqueId}
                  {item.departmentName ? ` · ${item.departmentName}` : ""}
                  {item.checklistName ? ` · ${item.checklistName}` : ""}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>
                  Engineer: {item.engineerName || "—"} · Submitted: {fmt(item.submittedAt)} · Scheduled: {fmt(item.maintenanceDate)}
                </div>
              </div>
              <div style={{ color: "#2563eb", fontWeight: 700, fontSize: 13 }}>Review →</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
