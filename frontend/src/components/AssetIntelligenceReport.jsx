/**
 * Asset Pro Intelligence — guided conversational report assistant.
 *
 * A step-by-step chat wizard over the rule-based report engine (POST /generate):
 *   1. Personalised greeting.
 *   2. "What would you like a report on?" → pick a module.
 *   3. Module-specific questions appear dynamically.
 *   4. Pick a question → the report is shown (summary, chart, table, download).
 *   Back / Restart controls at every step; free-text + voice always available.
 * No LLM — the backend parses each prompt into a validated, company-scoped query.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { generateIntelligenceReport } from "../api";

/* ── Modules and their questions ──────────────────────────────────────────── */
const MODULES = [
  { key: "assets", label: "Assets", icon: "📦", color: "#2563eb", blurb: "Inventory, condition, downtime & lifecycle",
    questions: ["All assets", "Critical assets", "Assets not working", "Critical assets not working",
      "Assets grouped by department", "Assets grouped by status", "Assets with the most downtime",
      "Assets never maintained", "Warranty expiring in 90 days"] },
  { key: "requests", label: "Requests / Tickets", icon: "🎫", color: "#0891b2", blurb: "Breakdowns, response & resolution",
    questions: ["All requests", "Open requests", "Requests overdue", "Unassigned requests",
      "Requests grouped by status", "Requests grouped by department", "MTTR by department"] },
  { key: "pms", label: "Preventive Maintenance", icon: "🛠️", color: "#d97706", blurb: "Scheduled maintenance & compliance",
    questions: ["PMS due", "PMS overdue", "PMS grouped by department"] },
  { key: "calibration", label: "Calibration", icon: "🎯", color: "#7c3aed", blurb: "Calibration schedules & certificates",
    questions: ["Calibration due this month", "Calibration overdue", "Calibration grouped by department"] },
  { key: "sla", label: "SLA", icon: "⏱️", color: "#dc2626", blurb: "Service-level compliance & breaches",
    questions: ["SLA breaches", "SLA breaches grouped by priority", "SLA breaches grouped by department",
      "SLA breaches grouped by hospital"] },
];
const moduleByKey = (k) => MODULES.find((m) => m.key === k) || null;

/* ── Contextual follow-ups based on the last answer ───────────────────────── */
function followUps(result, lastQ) {
  if (!result || !result.rows?.length) return [];
  const ds = result.dataset || "";
  const q = (lastQ || "").toLowerCase();
  const grouped = !!(result.chart && result.columns?.some((c) => c.key === "grp"));
  const chips = [];
  const push = (label, nq) => chips.push({ label, q: nq });
  if (ds === "assets") {
    if (!/critical/.test(q)) push("Only critical", `critical ${lastQ}`);
    if (!/not working|faulty/.test(q)) push("Only not working", `${lastQ} not working`);
    if (!grouped) { push("Group by department", `${lastQ} grouped by department`); push("Group by status", `${lastQ} grouped by status`); }
  } else if (ds === "requests") {
    if (!/overdue/.test(q)) push("Only overdue", `overdue ${lastQ}`);
    if (!/unassigned/.test(q)) push("Only unassigned", `unassigned ${lastQ}`);
    if (!grouped) { push("Group by department", `${lastQ} grouped by department`); push("Group by status", `${lastQ} grouped by status`); }
  } else if (ds === "pms" || ds === "calibration") {
    if (!/overdue/.test(q)) push("Only overdue", `overdue ${lastQ}`);
    if (!grouped) push("Group by department", `${lastQ} grouped by department`);
  } else if (ds === "sla") {
    if (!grouped) { push("Group by priority", `${lastQ} grouped by priority`); push("Group by department", `${lastQ} grouped by department`); }
  }
  // Result-aware "focus" chip — drill into the biggest group from a chart.
  if (grouped && result.rows?.length > 1) {
    const top = result.rows[0];
    if (top && top.grp && top.grp !== "—") {
      const base = lastQ.replace(/\bgrouped by[\s\w]*/i, "").trim();
      push(`Focus on ${top.grp}`, `${base} ${top.grp}`.trim());
    }
  }
  if (!/top \d/.test(q)) push("Top 10 only", `top 10 ${lastQ}`);
  return chips.slice(0, 5);
}

let _uid = 0;
const uid = () => `m${++_uid}_${Date.now()}`;
const firstName = (n) => String(n || "").trim().split(/\s+/)[0] || "there";
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/* ── Turn a raw result into a natural, human-sounding line + optional insight ─ */
const DS_NOUN = {
  assets: "assets", requests: "requests", pms: "PMS tasks", calibration: "calibration items",
  sla: "SLA records", "downtime-leaders": "assets", "mttr-by-department": "departments",
  "warranty-expiring": "assets", "never-maintained": "assets",
};
function humanize(result, question) {
  if (!result) return { text: "", insight: "" };
  const noun = DS_NOUN[result.dataset] || "records";
  const n = result.count || 0;
  const grouped = !!(result.chart && result.columns?.some((c) => c.key === "grp"));
  const filters = (result.interpreted || []).slice(1).filter((f) => !/grouped by/i.test(f));
  const fstr = filters.length ? " " + filters.join(", ").toLowerCase() : "";

  if (n === 0) {
    return { text: pick([
      `Good news — nothing matches${fstr ? " for" + fstr : ""}. You're all clear here. ✅`,
      `I couldn't find any${fstr ? fstr : ""} ${noun}. Nothing needs your attention right now.`,
    ]), insight: "" };
  }
  if (grouped) {
    const rows = result.rows || [];
    const total = rows.reduce((s, r) => s + (Number(r.count) || 0), 0);
    const label = (result.columns?.[0]?.label || "group").toLowerCase();
    const top = rows[0];
    const text = `Across ${rows.length} ${label}${rows.length !== 1 ? "s" : ""}, that's ${total} ${noun}${fstr}.`;
    let insight = "";
    if (top && top.grp) {
      const share = total ? Math.round((Number(top.count) / total) * 100) : 0;
      insight = (share >= 50 && rows.length > 1)
        ? `${top.grp} stands out — ${top.count} of them (${share}%).`
        : `${top.grp} has the most (${top.count}).`;
    }
    return { text, insight };
  }
  const text = pick([
    `You have ${n} ${noun}${fstr}.`,
    `I found ${n} ${noun}${fstr}.`,
    `That's ${n} ${noun}${fstr} right now.`,
  ]);
  let insight = "";
  if (/overdue/i.test(fstr))            insight = `${n} overdue — worth clearing soon.`;
  else if (/breach/i.test(fstr))        insight = `${n} SLA breach${n !== 1 ? "es" : ""} to review.`;
  else if (/not working|faulty/i.test(fstr)) insight = `${n} down — check they're assigned to an engineer.`;
  else if (/unassigned/i.test(fstr))    insight = `${n} still need an engineer assigned.`;
  return { text, insight };
}

/* ── Excel / PDF helpers ──────────────────────────────────────────────────── */
function toExcel(result) {
  if (!result?.rows?.length) return;
  const header = result.columns.map((c) => c.label);
  const body = result.rows.map((r) => result.columns.map((c) => r[c.key] ?? ""));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = header.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, `asset-intelligence-${Date.now()}.xlsx`);
}
function toPdf(result, question) {
  if (!result?.rows?.length) return;
  const head = result.columns.map((c) => `<th style="text-align:left;padding:8px 10px;border-bottom:2px solid #334155;font-size:12px">${c.label}</th>`).join("");
  const rows = result.rows.map((r) => `<tr>${result.columns.map((c) => `<td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-size:12px">${r[c.key] ?? ""}</td>`).join("")}</tr>`).join("");
  const w = window.open("", "_blank"); if (!w) return;
  w.document.write(`<html><head><title>Asset Pro Intelligence Report</title></head>
    <body style="font-family:Arial,sans-serif;padding:28px;color:#0f172a">
      <h2 style="margin:0 0 4px">Asset Pro Intelligence Report</h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 4px">${result.summary || ""}</p>
      <p style="color:#94a3b8;font-size:11px;margin:0 0 16px">Report: "${question}" · Generated ${new Date().toLocaleString()}</p>
      <table style="width:100%;border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
    </body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
}

/* ── Inline SVG horizontal bar chart ──────────────────────────────────────── */
function BarChart({ result }) {
  const { chart } = result;
  if (!chart) return null;
  const lk = chart.labelKey, vk = chart.valueKey, unit = chart.unit || "";
  const data = result.rows.map((r) => ({ label: String(r[lk] ?? "—"), value: Number(r[vk]) || 0 }))
    .filter((d) => d.value > 0).slice(0, 12);
  if (!data.length) return null;
  const max = Math.max(...data.map((d) => d.value));
  const palette = ["#2563eb", "#0891b2", "#7c3aed", "#d97706", "#dc2626", "#059669", "#db2777", "#0d9488", "#4f46e5", "#ca8a04", "#e11d48", "#0369a1"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "7px", margin: "4px 0 12px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div title={d.label} style={{ width: "130px", flex: "0 0 130px", fontSize: "12px", color: "#475569", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
          <div style={{ flex: 1, background: "#f1f5f9", borderRadius: "6px", height: "22px", overflow: "hidden" }}>
            <div style={{ width: `${Math.max(3, (d.value / max) * 100)}%`, height: "100%", background: palette[i % palette.length], borderRadius: "6px", transition: "width .4s ease" }} />
          </div>
          <div style={{ width: "56px", flex: "0 0 56px", fontSize: "12px", fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" }}>{d.value}{unit}</div>
        </div>
      ))}
    </div>
  );
}

const btn = (border, bg, color) => ({ padding: "6px 12px", borderRadius: "8px", border: `1px solid ${border}`, background: bg, color, fontWeight: 700, fontSize: "12px", cursor: "pointer" });

/* ── Back / Restart control bar ───────────────────────────────────────────── */
function StepControls({ onBack, backLabel, onRestart, busy }) {
  return (
    <div style={{ display: "flex", gap: "8px", marginTop: "12px", paddingTop: "11px", borderTop: "1px dashed #eef1f6" }}>
      {onBack && (
        <button disabled={busy} onClick={onBack} style={{ ...ctrl, color: "#475569" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><polyline points="15 18 9 12 15 6"/></svg>
          {backLabel || "Back"}
        </button>
      )}
      <button disabled={busy} onClick={onRestart} style={{ ...ctrl, color: "#4f46e5" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        Restart
      </button>
    </div>
  );
}
const ctrl = { display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 11px", borderRadius: "20px", border: "1px solid #e2e8f0", background: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" };

/* ── Module picker ────────────────────────────────────────────────────────── */
function ModulePicker({ greetingName, isGreeting, onPick, onRestart, busy, companyId, briefing, onAsk }) {
  return (
    <div>
      {isGreeting ? (
        <>
          <div style={{ fontSize: "14.5px", color: "#0f172a", fontWeight: 700, marginBottom: "3px" }}>Hi {firstName(greetingName)} 👋 I'm your Asset Pro assistant.</div>
          {/* Proactive "at a glance" — tappable headline numbers */}
          {Array.isArray(briefing) && briefing.length > 0 && (
            <div style={{ margin: "8px 0 12px" }}>
              <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: "6px" }}>Today at a glance</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {briefing.map((b, i) => (
                  <button key={i} disabled={busy} onClick={() => onAsk && onAsk(b.q)} title={`See ${b.label.toLowerCase()}`}
                    style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", borderRadius: "10px", border: "1px solid #e7ebf3", background: "#fff", cursor: busy ? "default" : "pointer" }}>
                    <span style={{ fontSize: "18px", fontWeight: 800, color: b.color, fontVariantNumeric: "tabular-nums" }}>{b.value}</span>
                    <span style={{ fontSize: "12px", color: "#475569", fontWeight: 600 }}>{b.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p style={{ fontSize: "13px", color: "#475569", margin: "0 0 13px" }}>
            <strong>What would you like a report on?</strong> Pick a module to get started {companyId ? "" : "— covering all facilities you manage"}.
          </p>
        </>
      ) : (
        <div style={{ fontSize: "13.5px", color: "#0f172a", fontWeight: 700, marginBottom: "11px" }}>What else would you like a report on?</div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: "9px" }}>
        {MODULES.map((m) => (
          <button key={m.key} disabled={busy} onClick={() => onPick(m)}
            style={{ display: "flex", alignItems: "center", gap: "11px", textAlign: "left", padding: "12px 13px", borderRadius: "12px", border: "1px solid #e7ebf3", background: "#fff", cursor: busy ? "default" : "pointer", transition: "all .15s" }}
            onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.borderColor = m.color; e.currentTarget.style.background = "#fbfcff"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e7ebf3"; e.currentTarget.style.background = "#fff"; }}>
            <span style={{ width: "38px", height: "38px", flex: "0 0 38px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "19px", background: `${m.color}14` }}>{m.icon}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "13.5px", fontWeight: 700, color: "#0f172a" }}>{m.label}</span>
              <span style={{ display: "block", fontSize: "11px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.blurb}</span>
            </span>
          </button>
        ))}
      </div>
      {!isGreeting && <StepControls onRestart={onRestart} busy={busy} />}
    </div>
  );
}

/* ── Question picker for a module ─────────────────────────────────────────── */
function QuestionPicker({ moduleKey, onPick, onBack, onRestart, busy }) {
  const m = moduleByKey(moduleKey);
  if (!m) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <span style={{ width: "26px", height: "26px", borderRadius: "8px", display: "grid", placeItems: "center", fontSize: "14px", background: `${m.color}14` }}>{m.icon}</span>
        <span style={{ fontSize: "13.5px", fontWeight: 700, color: "#0f172a" }}>{m.label} reports</span>
      </div>
      <p style={{ fontSize: "12.5px", color: "#64748b", margin: "0 0 11px" }}>Which report would you like? Pick one below, or type your own question at the bottom.</p>
      <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
        {m.questions.map((q) => (
          <button key={q} disabled={busy} onClick={() => onPick(q, m.key)}
            style={{ fontSize: "12.5px", padding: "8px 13px", borderRadius: "20px", border: `1px solid ${m.color}44`, background: `${m.color}0c`, color: "#334155", fontWeight: 500, cursor: busy ? "default" : "pointer" }}
            onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.borderColor = m.color; e.currentTarget.style.color = m.color; } }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${m.color}44`; e.currentTarget.style.color = "#334155"; }}>
            {q}
          </button>
        ))}
      </div>
      <StepControls onBack={onBack} backLabel="Choose another module" onRestart={onRestart} busy={busy} />
    </div>
  );
}

/* ── Answer bubble ────────────────────────────────────────────────────────── */
function AnswerCard({ msg, onFollowUp, onBack, onRestart, busy }) {
  const { result, question, moduleKey } = msg;
  const [open, setOpen] = useState(false);
  const empty = !result.rows?.length;
  const fups = followUps(result, question);
  const mod = moduleByKey(moduleKey) || moduleByKey(result.dataset);
  const backLabel = mod ? `More ${mod.label} reports` : "Choose another module";
  const back = () => (mod ? onBack(mod.key) : onRestart());

  return (
    <div>
      {result.interpreted?.length > 0 && (
        <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "7px" }}>
          <span style={{ fontSize: "10.5px", color: "#94a3b8", alignSelf: "center" }}>Understood:</span>
          {result.interpreted.map((c, i) => (
            <span key={i} style={{ fontSize: "10.5px", fontWeight: 700, padding: "2px 9px", borderRadius: "20px", background: i === 0 ? "#eef2ff" : "#f1f5f9", color: i === 0 ? "#4f46e5" : "#475569" }}>{c}</span>
          ))}
        </div>
      )}
      <Typewriter text={(msg.human && msg.human.text) || result.summary}
        style={{ fontSize: "13.5px", color: "#0f172a", fontWeight: 600, display: "block", marginBottom: empty ? 0 : "8px", lineHeight: 1.5 }} />

      {!empty && msg.human?.insight && (
        <div style={{ fontSize: "12.5px", color: "#4338ca", background: "#eef2ff", border: "1px solid #e0e7ff", borderRadius: "8px", padding: "7px 11px", margin: "0 0 10px", display: "flex", gap: "7px", alignItems: "flex-start" }}>
          <span>💡</span><span>{msg.human.insight}</span>
        </div>
      )}

      {!empty && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "10.5px", color: "#94a3b8", margin: "0 0 8px" }}>
          <span>Live data · just now</span>
          <button onClick={() => { try { navigator.clipboard.writeText([(msg.human?.text||result.summary), msg.human?.insight].filter(Boolean).join(" ")); } catch(e){} }}
            style={{ border: "none", background: "none", color: "#94a3b8", cursor: "pointer", fontSize: "10.5px", padding: 0, textDecoration: "underline" }}>Copy</button>
        </div>
      )}

      {empty ? (
        <div style={{ padding: "14px", textAlign: "center", color: "#94a3b8", fontSize: "12.5px", background: "#f8fafc", borderRadius: "10px", margin: "8px 0" }}>No matching records found. Try a different question.</div>
      ) : (
        <>
          {result.chart && <BarChart result={result} />}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "8px" }}>
            <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#475569", background: "#f1f5f9", padding: "3px 10px", borderRadius: "20px" }}>{result.count} {result.count === 1 ? "row" : "rows"}</span>
            <div style={{ display: "flex", gap: "7px" }}>
              <button onClick={() => setOpen((o) => !o)} style={btn("#e2e8f0", "#fff", "#475569")}>{open ? "Hide table" : "View table"}</button>
              <button onClick={() => toExcel(result)} style={btn("#16a34a", "#f0fdf4", "#15803d")}>⬇ Excel</button>
              <button onClick={() => toPdf(result, question)} style={btn("#e2e8f0", "#fff", "#475569")}>⬇ PDF</button>
            </div>
          </div>
          {open && (
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: "10px", maxHeight: "340px", overflowY: "auto", marginBottom: "6px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "460px" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                    {result.columns.map((c) => (
                      <th key={c.key} style={{ textAlign: "left", padding: "8px 11px", fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".03em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 ? "#f8fafc" : "#fff" }}>
                      {result.columns.map((c) => (
                        <td key={c.key} style={{ padding: "7px 11px", color: "#334155", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" }}>{r[c.key] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {fups.length > 0 && (
            <div style={{ marginTop: "10px" }}>
              <div style={{ fontSize: "10.5px", color: "#94a3b8", marginBottom: "5px" }}>Refine this ↓</div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {fups.map((f, i) => (
                  <button key={i} disabled={busy} onClick={() => onFollowUp(f.q, moduleKey)} style={{ fontSize: "12px", padding: "5px 11px", borderRadius: "20px", border: "1px solid #c7d2fe", background: "#eef2ff", color: "#4338ca", fontWeight: 600, cursor: busy ? "default" : "pointer" }}>{f.label}</button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      <StepControls onBack={back} backLabel={backLabel} onRestart={onRestart} busy={busy} />
    </div>
  );
}

/* ── Main component ───────────────────────────────────────────────────────── */
export default function AssetIntelligenceReport({ token, companyId, userName }) {
  const greeting = () => ({ id: uid(), role: "assistant", kind: "modules", greeting: true });
  const [messages, setMessages] = useState([greeting()]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [briefing, setBriefing] = useState(null); // proactive "at a glance" stats
  const scrollRef = useRef(null);
  const recogRef = useRef(null);
  const voiceSupported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, busy]);

  // Proactive briefing — quietly pull a few headline numbers on open (free; reuses
  // the same report engine). Shown as tappable chips in the greeting.
  useEffect(() => {
    let alive = true;
    const probes = [
      { label: "Open requests",  q: "open requests",   color: "#2563eb" },
      { label: "Overdue",        q: "requests overdue", color: "#dc2626" },
      { label: "PMS due",        q: "pms due",          color: "#d97706" },
    ];
    Promise.all(probes.map((p) =>
      generateIntelligenceReport(token, p.q, companyId).then((d) => ({ ...p, value: d?.count ?? 0 })).catch(() => null)
    )).then((res) => { if (alive) setBriefing(res.filter(Boolean)); });
    return () => { alive = false; };
  }, [token, companyId]);

  const restart = useCallback(() => { setMessages([greeting()]); setInput(""); }, []);
  const backToModules = useCallback(() => {
    setMessages((m) => [...m, { id: uid(), role: "assistant", kind: "modules", greeting: false }]);
  }, []);
  const backToQuestions = useCallback((moduleKey) => {
    setMessages((m) => [...m, { id: uid(), role: "assistant", kind: "questions", moduleKey }]);
  }, []);
  const pickModule = useCallback((mod) => {
    setMessages((m) => [...m, { id: uid(), role: "user", text: mod.label }, { id: uid(), role: "assistant", kind: "questions", moduleKey: mod.key }]);
  }, []);

  const ask = useCallback(async (question, moduleKey) => {
    const q = String(question || "").trim();
    if (!q || busy) return;
    setInput("");
    const typingId = uid();
    setMessages((m) => [...m, { id: uid(), role: "user", text: q }, { id: typingId, role: "assistant", kind: "typing" }]);
    setBusy(true);
    try {
      const data = await generateIntelligenceReport(token, q, companyId);
      const mk = moduleKey || (moduleByKey(data.dataset) ? data.dataset : null);
      const human = humanize(data, q);   // natural phrasing computed once, so it stays stable
      setMessages((m) => m.map((x) => x.id === typingId ? { id: x.id, role: "assistant", kind: "result", question: q, moduleKey: mk, result: data, human } : x));
    } catch (e) {
      setMessages((m) => m.map((x) => x.id === typingId ? { id: x.id, role: "assistant", kind: "error", moduleKey, text: e.message || "Sorry, I couldn't generate that report." } : x));
    } finally { setBusy(false); }
  }, [token, companyId, busy]);

  const startVoice = () => {
    if (!voiceSupported) return;
    if (listening && recogRef.current) { recogRef.current.stop(); return; }
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new R();
    rec.lang = "en-IN"; rec.interimResults = true; rec.continuous = false;
    rec.onresult = (e) => setInput(Array.from(e.results).map((r) => r[0].transcript).join(""));
    rec.onend = () => { setListening(false); recogRef.current = null; };
    rec.onerror = () => { setListening(false); recogRef.current = null; };
    recogRef.current = rec; setListening(true); rec.start();
  };

  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", height: "min(74vh, 780px)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "13px 18px", borderBottom: "1px solid #eef1f6", background: "linear-gradient(90deg,#f8faff,#fff)" }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(140deg,#4f46e5,#0891b2)", display: "grid", placeItems: "center", fontSize: "18px" }}>🧠</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14.5px", fontWeight: 800, color: "#0f172a" }}>Asset Pro Assistant</div>
          <div style={{ fontSize: "11.5px", color: "#16a34a", display: "flex", alignItems: "center", gap: "5px" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#16a34a", display: "inline-block" }} />Online · guided reports</div>
        </div>
        <button onClick={restart} style={{ ...btn("#e2e8f0", "#fff", "#475569"), fontSize: "12px" }}>↻ Restart</button>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px", background: "#fbfcfe" }}>
        {messages.map((m) => (
          <MessageRow key={m.id} msg={m} busy={busy} companyId={companyId} userName={userName} briefing={briefing}
            onPickModule={pickModule} onPickQuestion={ask} onBackToModules={backToModules}
            onBackToQuestions={backToQuestions} onRestart={restart} />
        ))}
      </div>

      <div style={{ borderTop: "1px solid #eef1f6", padding: "12px 14px", background: "#fff" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "9px" }}>
          {voiceSupported && (
            <button onClick={startVoice} title="Speak your question" aria-label="Voice input"
              style={{ width: "42px", height: "42px", flex: "0 0 42px", borderRadius: "11px", border: `1px solid ${listening ? "#dc2626" : "#e2e8f0"}`, background: listening ? "#fef2f2" : "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: listening ? "#dc2626" : "#64748b" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={listening ? "#dc2626" : "none"} stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            </button>
          )}
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            placeholder={listening ? "Listening…" : "Or type your own question…"} rows={1}
            style={{ flex: 1, resize: "none", maxHeight: "110px", padding: "11px 14px", borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "13.5px", fontFamily: "inherit", outline: "none", lineHeight: 1.4 }} />
          <button onClick={() => ask(input)} disabled={busy || !input.trim()}
            style={{ height: "42px", padding: "0 16px", flex: "0 0 auto", borderRadius: "11px", border: "none", background: busy || !input.trim() ? "#c7d2fe" : "#4f46e5", color: "#fff", fontWeight: 700, fontSize: "13.5px", cursor: busy || !input.trim() ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: "7px" }}>
            Send
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
        <div style={{ fontSize: "10.5px", color: "#94a3b8", marginTop: "6px", textAlign: "center" }}>Read-only reports scoped to your company{companyId ? "" : " (all facilities you can access)"}. Download any answer as Excel or PDF.</div>
      </div>
    </div>
  );
}

/* ── Message row ──────────────────────────────────────────────────────────── */
function MessageRow({ msg, busy, companyId, userName, briefing, onPickModule, onPickQuestion, onBackToModules, onBackToQuestions, onRestart }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "14px" }}>
        <div style={{ maxWidth: "78%", background: "#4f46e5", color: "#fff", padding: "9px 14px", borderRadius: "14px 14px 4px 14px", fontSize: "13.5px", fontWeight: 500 }}>{msg.text}</div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", gap: "10px", marginBottom: "16px", alignItems: "flex-start" }}>
      <div style={{ width: "30px", height: "30px", flex: "0 0 30px", borderRadius: "9px", background: "linear-gradient(140deg,#4f46e5,#0891b2)", display: "grid", placeItems: "center", fontSize: "15px", marginTop: "2px" }}>🧠</div>
      <div style={{ maxWidth: "88%", background: "#fff", border: "1px solid #e9edf5", padding: "14px 16px", borderRadius: "4px 14px 14px 14px", boxShadow: "0 1px 2px rgba(15,23,42,.04)", width: "100%" }}>
        {msg.kind === "modules" && <ModulePicker greetingName={userName} isGreeting={msg.greeting} companyId={companyId} busy={busy} briefing={msg.greeting ? briefing : null} onAsk={onPickQuestion} onPick={onPickModule} onRestart={onRestart} />}
        {msg.kind === "questions" && <QuestionPicker moduleKey={msg.moduleKey} busy={busy} onPick={onPickQuestion} onBack={onBackToModules} onRestart={onRestart} />}
        {msg.kind === "typing" && <TypingInline />}
        {msg.kind === "error" && (
          <div>
            <div style={{ color: "#dc2626", fontSize: "13px", fontWeight: 600 }}>⚠ {msg.text}</div>
            <StepControls onBack={msg.moduleKey ? () => onBackToQuestions(msg.moduleKey) : onBackToModules} backLabel={msg.moduleKey ? "Back" : "Choose another module"} onRestart={onRestart} busy={busy} />
          </div>
        )}
        {msg.kind === "result" && <AnswerCard msg={msg} onFollowUp={onPickQuestion} onBack={onBackToQuestions} onRestart={onRestart} busy={busy} />}
      </div>
    </div>
  );
}

function TypingInline() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "2px 0" }}>
      <Dot d={0} /><Dot d={0.15} /><Dot d={0.3} />
      <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "6px" }}>Pulling your report…</span>
    </div>
  );
}

/* Reveals text word-by-word so answers feel "spoken", not pasted. Respects
   reduced-motion and only animates the first time a message renders. */
function Typewriter({ text, style }) {
  const words = String(text || "").split(" ");
  const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [count, setCount] = useState(reduce ? words.length : 0);
  const doneRef = useRef(reduce);
  useEffect(() => {
    if (doneRef.current) { setCount(words.length); return; }
    let i = 0;
    const timer = setInterval(() => {
      i += 1; setCount(i);
      if (i >= words.length) { clearInterval(timer); doneRef.current = true; }
    }, 45);
    return () => clearInterval(timer);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  return <span style={style}>{words.slice(0, count).join(" ")}</span>;
}
function Dot({ d }) {
  return <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#94a3b8", display: "inline-block", animation: `apmpulse 1s ${d}s infinite ease-in-out` }} />;
}

if (typeof document !== "undefined" && !document.getElementById("apm-kf")) {
  const s = document.createElement("style");
  s.id = "apm-kf";
  s.textContent = "@keyframes apmpulse{0%,100%{opacity:.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}";
  document.head.appendChild(s);
}
