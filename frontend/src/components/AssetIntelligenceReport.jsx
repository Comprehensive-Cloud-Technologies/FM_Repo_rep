/**
 * Asset Pro Intelligence — report picker (Phase A).
 *
 * Instead of a free-text box, the user picks from a curated list of report
 * questions (grouped by area). The backend rule-based parser turns the chosen
 * question into a validated, company-scoped report. Results download as Excel
 * (SheetJS) or print to PDF via the browser.
 */
import { useState } from "react";
import * as XLSX from "xlsx";
import { generateIntelligenceReport } from "../api";

const QUESTION_GROUPS = [
  { group: "Assets", color: "#2563eb", items: [
    "All assets",
    "Critical assets",
    "Assets not working",
    "Critical assets not working",
    "Assets grouped by department",
    "Assets grouped by status",
    "Assets grouped by hospital",
  ] },
  { group: "Requests", color: "#0891b2", items: [
    "All requests",
    "Open requests",
    "Requests overdue",
    "Unassigned requests",
    "Requests grouped by status",
    "Requests grouped by department",
    "Requests grouped by hospital",
  ] },
  { group: "Calibration", color: "#7c3aed", items: [
    "Calibration due this month",
    "Calibration overdue",
    "Calibration grouped by department",
  ] },
  { group: "PMS", color: "#d97706", items: [
    "PMS due",
    "PMS overdue",
    "PMS grouped by department",
  ] },
  { group: "SLA", color: "#dc2626", items: [
    "SLA breaches",
    "SLA breaches grouped by department",
    "SLA breaches grouped by priority",
    "SLA breaches grouped by hospital",
  ] },
];

export default function AssetIntelligenceReport({ token, companyId }) {
  const [active, setActive] = useState("");   // the question currently selected
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { interpreted, summary, columns, rows }
  const [err, setErr] = useState("");

  const run = async (question) => {
    setActive(question); setLoading(true); setErr(""); setResult(null);
    try {
      const data = await generateIntelligenceReport(token, question, companyId);
      setResult(data);
    } catch (e) { setErr(e.message || "Could not generate report"); }
    finally { setLoading(false); }
  };

  const exportExcel = () => {
    if (!result?.rows?.length) return;
    const header = result.columns.map((c) => c.label);
    const body = result.rows.map((r) => result.columns.map((c) => r[c.key] ?? ""));
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws["!cols"] = header.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `asset-intelligence-${Date.now()}.xlsx`);
  };

  const exportPdf = () => {
    if (!result?.rows?.length) return;
    const head = result.columns.map((c) => `<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #334155;font-size:12px">${c.label}</th>`).join("");
    const rows = result.rows.map((r) =>
      `<tr>${result.columns.map((c) => `<td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px">${r[c.key] ?? ""}</td>`).join("")}</tr>`
    ).join("");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Asset Pro Intelligence Report</title></head>
      <body style="font-family:Arial,sans-serif;padding:28px;color:#0f172a">
        <h2 style="margin:0 0 4px">Asset Pro Intelligence Report</h2>
        <p style="color:#64748b;font-size:13px;margin:0 0 4px">${result.summary || ""}</p>
        <p style="color:#94a3b8;font-size:11px;margin:0 0 16px">Report: "${active}" · Generated ${new Date().toLocaleString()}</p>
        <table style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const card = { background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" };

  return (
    <div style={{ ...card, padding: "20px", marginBottom: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        <span style={{ fontSize: "17px" }}>💬</span>
        <h3 style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", margin: 0 }}>Ask for a report</h3>
      </div>
      <p style={{ fontSize: "12.5px", color: "#64748b", margin: "0 0 14px" }}>
        Pick a report to generate — then download it as Excel or PDF.
      </p>

      {/* Question groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {QUESTION_GROUPS.map((g) => (
          <div key={g.group}>
            <div style={{ fontSize: "11px", fontWeight: 800, color: g.color, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "7px" }}>{g.group}</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {g.items.map((q) => {
                const isActive = active === q;
                return (
                  <button key={q} onClick={() => run(q)} disabled={loading}
                    style={{ fontSize: "12.5px", padding: "8px 14px", borderRadius: "9px", cursor: loading ? "default" : "pointer",
                      border: `1px solid ${isActive ? g.color : "#e2e8f0"}`,
                      background: isActive ? g.color : "#fff",
                      color: isActive ? "#fff" : "#334155", fontWeight: isActive ? 700 : 500,
                      display: "inline-flex", alignItems: "center", gap: "7px" }}>
                    {isActive && loading ? "⏳ " : ""}{q}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {err && <div style={{ marginTop: "14px", padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "13px", fontWeight: 600 }}>{err}</div>}

      {result && (
        <div style={{ marginTop: "18px", borderTop: "1px solid #f1f5f9", paddingTop: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
            <div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "5px" }}>
                {(result.interpreted || []).map((chip, i) => (
                  <span key={i} style={{ fontSize: "10.5px", fontWeight: 700, padding: "2px 9px", borderRadius: "20px", background: i === 0 ? "#eff6ff" : "#f1f5f9", color: i === 0 ? "#2563eb" : "#475569" }}>{chip}</span>
                ))}
              </div>
              <div style={{ fontSize: "13px", color: "#0f172a", fontWeight: 600 }}>{result.summary}</div>
            </div>
            {result.rows?.length > 0 && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={exportExcel} style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #16a34a", background: "#f0fdf4", color: "#15803d", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}>⬇ Excel</button>
                <button onClick={exportPdf} style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: "12.5px", cursor: "pointer" }}>⬇ PDF</button>
              </div>
            )}
          </div>

          {result.rows?.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#94a3b8", fontSize: "13px", background: "#f8fafc", borderRadius: "10px" }}>No matching records found.</div>
          ) : (
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px", maxHeight: "440px", overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12.5px", minWidth: "480px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    {result.columns.map((c) => (
                      <th key={c.key} style={{ textAlign: "left", padding: "9px 12px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.03em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                      {result.columns.map((c) => (
                        <td key={c.key} style={{ padding: "8px 12px", color: "#334155", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>{r[c.key] ?? "—"}</td>
                      ))}
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
