/**
 * RequestTrackingPanel.jsx
 * Advanced FM Request / Work Order Tracking Module
 * Features: Summary cards, full table, assignment, status mgmt,
 *           cutoff/escalation, activity timeline, Excel export, advanced filters
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { io } from "socket.io-client";
import { getApiBaseUrl } from "../utils/runtimeConfig";

const BASE = getApiBaseUrl();

/* ─── API ─────────────────────────────────────────────────────────────────── */
async function apiFetch(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, { ...opts });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `HTTP ${res.status}`);
  return data;
}

function buildQS(obj) {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== "" && v != null && v !== false) p.append(k, v); });
  return p.toString() ? `?${p}` : "";
}

/* ─── Style constants ─────────────────────────────────────────────────────── */
const PRIORITY_STYLE = {
  critical: { bg: "#fee2e2", color: "#991b1b", dot: "#dc2626", label: "Critical" },
  high:     { bg: "#ffedd5", color: "#9a3412", dot: "#f97316", label: "High" },
  medium:   { bg: "#fef9c3", color: "#854d0e", dot: "#eab308", label: "Medium" },
  low:      { bg: "#dcfce7", color: "#166534", dot: "#22c55e", label: "Low" },
};

const STATUS_STYLE = {
  open:        { bg: "#fee2e2",  color: "#dc2626",  label: "Open",        dot: "#dc2626" },
  assigned:    { bg: "#ede9fe",  color: "#7c3aed",  label: "Assigned",    dot: "#7c3aed" },
  in_progress: { bg: "#dbeafe",  color: "#1d4ed8",  label: "In Progress", dot: "#2563eb" },
  on_hold:     { bg: "#fef9c3",  color: "#854d0e",  label: "On Hold",     dot: "#eab308" },
  completed:   { bg: "#dcfce7",  color: "#166534",  label: "Completed",   dot: "#22c55e" },
  closed:      { bg: "#f1f5f9",  color: "#475569",  label: "Closed",      dot: "#94a3b8" },
  escalated:   { bg: "#fdf4ff",  color: "#7c3aed",  label: "Escalated",   dot: "#a855f7" },
};

const SOURCE_STYLE = {
  flag:             { bg: "#fdf4ff", color: "#7c3aed",  label: "Flag" },
  logsheet:         { bg: "#dcfce7", color: "#166534",  label: "Logsheet" },
  checklist:        { bg: "#dbeafe", color: "#1d4ed8",  label: "Checklist" },
  manual:           { bg: "#f1f5f9", color: "#475569",  label: "Manual" },
  "qr scan":        { bg: "#fef9c3", color: "#854d0e",  label: "QR Scan" },
  "qr_scan":        { bg: "#fef9c3", color: "#854d0e",  label: "QR Scan" },
  "mobile case log":{ bg: "#e0f2fe", color: "#075985",  label: "Mobile" },
  "mobile_case_log":{ bg: "#e0f2fe", color: "#075985",  label: "Mobile" },
};

/* ─── UI atoms ────────────────────────────────────────────────────────────── */
function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "64px" }}>
      <div style={{ width: "36px", height: "36px", border: "3px solid #e2e8f0", borderTopColor: "#2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function EmptyState({ message = "No requests found." }) {
  return (
    <div style={{ padding: "56px", textAlign: "center", color: "#94a3b8" }}>
      <div style={{ fontSize: "42px", marginBottom: "12px" }}>📋</div>
      <p style={{ margin: 0, fontSize: "14.5px" }}>{message}</p>
    </div>
  );
}

function Badge({ val, styleMap, fallback }) {
  const s = styleMap?.[(val || "").toLowerCase()] || fallback || { bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 700, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>
      {s.dot && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: s.dot, flexShrink: 0 }} />}
      {s.label || val}
    </span>
  );
}

function Modal({ onClose, title, children, width = "520px" }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: "16px", width, maxWidth: "96vw", maxHeight: "92vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "#0f172a" }}>{title}</h3>
          <button onClick={onClose} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "none", background: "#f1f5f9", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", color: "#475569" }}>×</button>
        </div>
        <div style={{ padding: "20px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", disabled, style: s = {} }) {
  const v = {
    primary:  { background: "#2563eb", color: "#fff",    border: "none" },
    danger:   { background: "#dc2626", color: "#fff",    border: "none" },
    outline:  { background: "#fff",    color: "#2563eb", border: "1.5px solid #2563eb" },
    ghost:    { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" },
  }[variant] || {};
  const sz = size === "sm" ? { padding: "5px 12px", fontSize: "12px" } : { padding: "9px 18px", fontSize: "13.5px" };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "8px", fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1, ...v, ...sz, ...s }}>
      {children}
    </button>
  );
}

/* ─── Summary Cards ───────────────────────────────────────────────────────── */
function SummaryCards({ summary, activeFilter, onFilterClick }) {
  const CARDS = [
    { key: "open",        label: "Open",        color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    { key: "assigned",    summaryKey: "assigned", label: "Assigned", color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
    { key: "in_progress", summaryKey: "inProgress", label: "In Progress", color: "#1d4ed8", bg: "#dbeafe", border: "#bfdbfe" },
    { key: "on_hold",     summaryKey: "onHold", label: "On Hold",     color: "#854d0e", bg: "#fef9c3", border: "#fde68a" },
    { key: "completed",   label: "Completed",   color: "#16a34a", bg: "#dcfce7", border: "#bbf7d0" },
    { key: "closed",      label: "Closed",      color: "#475569", bg: "#f1f5f9", border: "#e2e8f0" },
    { key: "escalated",   label: "Escalated",   color: "#7c3aed", bg: "#faf5ff", border: "#e9d5ff" },
    { key: "overdue",     label: "Overdue",     color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "20px" }}>
      {CARDS.map(c => {
        const val = summary?.[c.summaryKey || c.key] ?? "—";
        const isActive = activeFilter === c.key;
        return (
          <div
            key={c.key}
            onClick={() => onFilterClick(c.key)}
            style={{
              background: "#fff", borderRadius: "10px", padding: "12px 14px",
              border: `1.5px solid ${isActive ? c.color : c.border}`,
              cursor: "pointer", transition: "box-shadow 0.15s",
              boxShadow: isActive ? `0 0 0 3px ${c.color}25` : "0 1px 3px rgba(0,0,0,0.06)",
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 16px ${c.color}20`; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = isActive ? `0 0 0 3px ${c.color}25` : "0 1px 3px rgba(0,0,0,0.06)"; }}
          >
            <p style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 6px" }}>{c.label}</p>
            <p style={{ fontSize: "26px", fontWeight: 900, color: c.color, margin: 0, lineHeight: 1, letterSpacing: "-1px" }}>{val}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Filters Bar ─────────────────────────────────────────────────────────── */
function FiltersBar({ filters, setFilters, employees, departments, onReset }) {
  const [open, setOpen] = useState(false);
  const inputSt = { padding: "7px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", width: "100%", boxSizing: "border-box", outline: "none", background: "#fff" };
  const activeCount = Object.entries(filters).filter(([k, v]) => k !== "search" && v !== "" && v !== false).length;

  return (
    <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", marginBottom: "16px" }}>
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1", minWidth: "200px" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search by WO#, asset, description…"
            style={{ ...inputSt, paddingLeft: "32px", minWidth: "220px" }}
          />
        </div>
        {/* Status quick */}
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={{ ...inputSt, width: "auto", minWidth: "130px" }}>
          <option value="">All Statuses</option>
          {["open","assigned","in_progress","on_hold","completed","closed","escalated"].map(s => (
            <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}</option>
          ))}
        </select>
        {/* Priority */}
        <select value={filters.priority} onChange={e => setFilters(f => ({ ...f, priority: e.target.value }))}
          style={{ ...inputSt, width: "auto", minWidth: "120px" }}>
          <option value="">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <button onClick={() => setOpen(o => !o)} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 14px", borderRadius: "8px", border: "1px solid #e2e8f0", background: open ? "#eff6ff" : "#f8fafc", cursor: "pointer", fontSize: "13px", fontWeight: 600, color: open ? "#2563eb" : "#475569" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          More Filters {activeCount > 0 && <span style={{ background: "#2563eb", color: "#fff", borderRadius: "9px", padding: "0 6px", fontSize: "11px" }}>{activeCount}</span>}
        </button>
        {(activeCount > 0 || filters.search) && (
          <button onClick={onReset} style={{ padding: "7px 12px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", fontSize: "12.5px", color: "#64748b" }}>Reset</button>
        )}
      </div>

      {open && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid #f1f5f9" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px", paddingTop: "12px" }}>
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>Date From</label>
              <input type="date" value={filters.dateFrom} onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))} style={inputSt} />
            </div>
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>Date To</label>
              <input type="date" value={filters.dateTo} onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))} style={inputSt} />
            </div>
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>Assigned To</label>
              <select value={filters.assignedTo} onChange={e => setFilters(f => ({ ...f, assignedTo: e.target.value }))} style={inputSt}>
                <option value="">Any Employee</option>
                {employees.map(u => <option key={u.id} value={u.id}>{u.fullName || u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: "11.5px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>Department</label>
              <select value={filters.departmentId} onChange={e => setFilters(f => ({ ...f, departmentId: e.target.value }))} style={inputSt}>
                <option value="">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                <input type="checkbox" checked={!!filters.escalated} onChange={e => setFilters(f => ({ ...f, escalated: e.target.checked }))} style={{ width: "15px", height: "15px" }} />
                <span style={{ fontWeight: 600 }}>Escalated Only</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }}>
                <input type="checkbox" checked={!!filters.overdue} onChange={e => setFilters(f => ({ ...f, overdue: e.target.checked }))} style={{ width: "15px", height: "15px" }} />
                <span style={{ fontWeight: 600 }}>Overdue Only</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Activity Timeline ───────────────────────────────────────────────────── */
function ActivityTimeline({ items }) {
  if (!items.length) return <div style={{ color: "#94a3b8", textAlign: "center", padding: "24px" }}>No activity yet.</div>;

  const iconFor = (type) => {
    if (type === "status_change") return { icon: "🔄", bg: "#dbeafe" };
    if (type === "remark")        return { icon: "💬", bg: "#dcfce7" };
    if (type === "assignment")    return { icon: "👤", bg: "#faf5ff" };
    return { icon: "📌", bg: "#f1f5f9" };
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {items.map((item, i) => {
        const { icon, bg } = iconFor(item.type);
        const date = item.created_at ? new Date(item.created_at) : null;
        return (
          <div key={i} style={{ display: "flex", gap: "12px", paddingBottom: i < items.length - 1 ? "16px" : "0", position: "relative" }}>
            {/* Vertical line */}
            {i < items.length - 1 && <div style={{ position: "absolute", left: "17px", top: "34px", bottom: "0", width: "2px", background: "#f1f5f9" }} />}
            {/* Icon */}
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0, zIndex: 1, border: "2px solid #fff" }}>
              {icon}
            </div>
            {/* Content */}
            <div style={{ flex: 1, paddingTop: "6px" }}>
              <p style={{ margin: "0 0 2px", fontSize: "13px", fontWeight: 600, color: "#0f172a" }}>
                {item.type === "status_change" && `Status changed to "${(item.status || "").replace("_"," ")}"`}
                {item.type === "remark"        && `Remark: ${item.note || ""}`}
                {item.type === "assignment"    && `Assigned to ${item.assigned_name || "—"}${item.assigned_by_name ? ` by ${item.assigned_by_name}` : ""}`}
                {!["status_change","remark","assignment"].includes(item.type) && item.remarks}
              </p>
              {item.remarks && item.type === "status_change" && (
                <p style={{ margin: "0 0 2px", fontSize: "12px", color: "#64748b" }}>{item.remarks}</p>
              )}
              {item.added_by_name && item.type === "remark" && (
                <p style={{ margin: "0 0 2px", fontSize: "12px", color: "#64748b" }}>by {item.added_by_name}</p>
              )}
              {date && <p style={{ margin: 0, fontSize: "11.5px", color: "#94a3b8" }}>{date.toLocaleString()}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Work Order Detail Modal ─────────────────────────────────────────────── */
function WODetailModal({ wo, employees, token, companyPortalToken, onClose, onUpdated }) {
  const [tab, setTab]           = useState(wo._openTab || "details");
  const [activity, setActivity] = useState([]);
  const [remarks, setRemarks]   = useState([]);
  const [assignHistory, setAH]  = useState([]);
  const [newRemark, setNewRemark]= useState("");
  const [assignTo, setAssignTo] = useState("");
  const [assignNote, setAssignNote] = useState("");
  const [statusVal, setStatusVal]   = useState(wo.status || "open");
  const [saving, setSaving]     = useState(false);
  const [loadingAct, setLoadAct]= useState(false);
  const [err, setErr]           = useState(null);

  const authToken = companyPortalToken || token;

  useEffect(() => {
    if (tab === "activity") {
      setLoadAct(true);
      apiFetch("GET", `/api/company-portal/healthcare/work-orders/${wo.id}/activity`, undefined, authToken)
        .then(d => setActivity(Array.isArray(d) ? d : []))
        .catch(() => {})
        .finally(() => setLoadAct(false));
    }
  }, [tab, wo.id, authToken]);

  const addRemark = async () => {
    if (!newRemark.trim()) return;
    setSaving(true); setErr(null);
    try {
      await apiFetch("POST", `/api/company-portal/healthcare/work-orders/${wo.id}/remarks`, { remark: newRemark }, authToken);
      setNewRemark("");
      onUpdated?.();
    } catch (e) { setErr(e.message); }
    setSaving(false);
  };

  const isAQ = wo.source_type === 'asset_query';

  const saveAssign = async () => {
    if (!assignTo) return;
    setSaving(true); setErr(null);
    try {
      if (isAQ) {
        await apiFetch("PATCH", `/api/company-portal/asset-queries/${wo.id}/assign`, { assignedTo: Number(assignTo) }, authToken);
      } else {
        await apiFetch("PUT", `/api/company-portal/work-orders/${wo.id}/assign`, { assignedTo: Number(assignTo), assignedNote: assignNote }, authToken);
      }
      onUpdated?.();
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const saveStatus = async () => {
    setSaving(true); setErr(null);
    try {
      if (isAQ) {
        // Map WO status to AQ status
        const aqStatus = statusVal === 'completed' ? 'resolved' : statusVal === 'closed' ? 'resolved' : statusVal;
        await apiFetch("PATCH", `/api/company-portal/asset-queries/${wo.id}/status`, { status: aqStatus }, authToken);
      } else {
        await apiFetch("PATCH", `/api/company-portal/work-orders/${wo.id}/status`, { status: statusVal }, authToken);
      }
      onUpdated?.();
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const ps = PRIORITY_STYLE[(wo.priority || "").toLowerCase()] || PRIORITY_STYLE.medium;
  const ss = STATUS_STYLE[(wo.status || "").toLowerCase()]    || STATUS_STYLE.open;
  const src= SOURCE_STYLE[(wo.source_label || wo.issue_source || wo.issueSource || "manual").toLowerCase()] || SOURCE_STYLE.manual;

  const TABS = ["details","assign","status","remarks","activity"];

  return (
    <Modal onClose={onClose} title={`Request: ${wo.work_order_number || wo.workOrderNumber || `REQ-${wo.id}`}`} width="640px">
      {/* Header info */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
        <Badge val={wo.priority} styleMap={PRIORITY_STYLE} />
        <Badge val={wo.status}   styleMap={STATUS_STYLE} />
        <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 700, background: src.bg, color: src.color }}>{src.label}</span>
        {(Number(wo.escalation_level) > 0 || wo.escalationLevel > 0) && (
          <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 700, background: "#fdf4ff", color: "#7c3aed" }}>⏫ Escalated</span>
        )}
        {wo.is_overdue === 1 && (
          <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11.5px", fontWeight: 700, background: "#fff7ed", color: "#ea580c" }}>⚠️ Overdue</span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #e2e8f0", marginBottom: "18px", overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: tab === t ? "2.5px solid #2563eb" : "2.5px solid transparent", marginBottom: "-2px", cursor: "pointer", fontSize: "13px", fontWeight: tab === t ? 700 : 500, color: tab === t ? "#2563eb" : "#64748b", textTransform: "capitalize", whiteSpace: "nowrap" }}>
            {t === "assign" ? "Assign / Reassign" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "12px", fontSize: "13px" }}>{err}</div>}

      {/* Tab content */}
      {tab === "details" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <Row label="Request #"    val={wo.work_order_number || wo.workOrderNumber || `REQ-${wo.id}`} mono />
          <Row label="Asset"         val={wo.assetName || wo.asset_name || "—"} />
          <Row label="Department"    val={wo.department_name || "—"} />
          <Row label="Location"      val={wo.location || "—"} />
          <Row label="Description"   val={wo.issueDescription || wo.issue_description || "—"} multiline />
          <Row label="Source"        val={src.label} />
          <Row label="Assigned To"   val={wo.assigned_to_name || wo.assignedToName || "Unassigned"} />
          <Row label="Cutoff Time"   val={wo.cutoff_time ? new Date(wo.cutoff_time).toLocaleString() : "—"} />
          <Row label="Created"       val={wo.created_at ? new Date(wo.created_at).toLocaleString() : "—"} />
          {wo.escalation_level > 0 && <Row label="Escalation Level" val={`Level ${wo.escalation_level}`} />}
          {/* Images */}
          {Array.isArray(wo.images) && wo.images.length > 0 && (
            <div>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "8px" }}>Attachments ({wo.images.length})</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {wo.images.map((url, idx) => (
                  <a key={idx} href={`${BASE}${url}`} target="_blank" rel="noreferrer"
                    style={{ display: "block", width: "90px", height: "90px", borderRadius: "8px", overflow: "hidden", border: "1px solid #e2e8f0", flexShrink: 0 }}>
                    <img src={`${BASE}${url}`} alt={`attachment-${idx+1}`}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "assign" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <p style={{ margin: "0 0 4px", fontSize: "13px", color: "#64748b" }}>Current: <strong>{wo.assigned_to_name || wo.assignedToName || "Unassigned"}</strong></p>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Assign To *</label>
            <select value={assignTo} onChange={e => setAssignTo(e.target.value)}
              style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", background: "#fff" }}>
              <option value="">— Select employee —</option>
              {employees.map(u => <option key={u.id} value={u.id}>{u.fullName || u.full_name} ({u.role}{u.designation ? ` · ${u.designation}` : ""})</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Note (optional)</label>
            <textarea value={assignNote} onChange={e => setAssignNote(e.target.value)} rows={3}
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={saveAssign} disabled={saving || !assignTo}>{saving ? "Saving…" : "Assign"}</Btn>
          </div>
        </div>
      )}

      {tab === "status" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>New Status</label>
            <select value={statusVal} onChange={e => setStatusVal(e.target.value)}
              style={{ width: "100%", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", background: "#fff" }}>
              {["open","assigned","in_progress","on_hold","completed","closed"].map(s => (
                <option key={s} value={s}>{s.replace("_"," ").replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn onClick={saveStatus} disabled={saving}>{saving ? "Saving…" : "Update Status"}</Btn>
          </div>
        </div>
      )}

      {tab === "remarks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>Add Remark</label>
            <textarea value={newRemark} onChange={e => setNewRemark(e.target.value)} rows={3} placeholder="Enter remark or comment…"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", resize: "vertical" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
              <Btn onClick={addRemark} disabled={saving || !newRemark.trim()}>{saving ? "Adding…" : "Add Remark"}</Btn>
            </div>
          </div>
        </div>
      )}

      {tab === "activity" && (
        loadingAct ? <Spinner /> : <ActivityTimeline items={activity} />
      )}
    </Modal>
  );
}

function Row({ label, val, mono, multiline }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px", fontSize: "13.5px" }}>
      <span style={{ color: "#64748b", fontWeight: 600 }}>{label}</span>
      <span style={{ color: "#0f172a", fontFamily: mono ? "monospace" : undefined, whiteSpace: multiline ? "pre-wrap" : undefined }}>{val}</span>
    </div>
  );
}

/* ─── Create Work Order Modal ─────────────────────────────────────────────── */
function CreateWOModal({ employees, companyPortalToken, companyId, onClose, onCreated }) {
  const [form, setForm] = useState({
    issueDescription: "", assetName: "", location: "", priority: "medium",
    assignedTo: "", cutoffHours: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);

  const submit = async () => {
    if (!form.issueDescription) { setErr("Description is required."); return; }
    setSaving(true); setErr(null);
    try {
      const cutoffAt = form.cutoffHours
        ? new Date(Date.now() + Number(form.cutoffHours) * 3600_000).toISOString()
        : undefined;
      await apiFetch("POST", "/api/company-portal/work-orders", {
        issueDescription: form.issueDescription,
        assetName:        form.assetName     || undefined,
        location:         form.location      || undefined,
        priority:         form.priority,
        assignedTo:       form.assignedTo    ? Number(form.assignedTo) : undefined,
        cutoffTime:       cutoffAt,
        companyId,
      }, companyPortalToken);
      onCreated?.();
      onClose();
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const fld = (label, content, req) => (
    <div>
      <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "5px" }}>
        {label}{req && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      {content}
    </div>
  );

  const inputSt = { width: "100%", boxSizing: "border-box", padding: "9px 11px", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13.5px", outline: "none" };

  return (
    <Modal onClose={onClose} title="New Work Order / Request">
      {err && <div style={{ background: "#fef2f2", color: "#dc2626", padding: "9px 12px", borderRadius: "7px", marginBottom: "14px", fontSize: "13px" }}>{err}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {fld("Description", <textarea value={form.issueDescription} onChange={e => setForm(f => ({ ...f, issueDescription: e.target.value }))} rows={3} placeholder="Describe the issue…" style={{ ...inputSt, resize: "vertical" }} />, true)}
        {fld("Asset Name",  <input value={form.assetName} onChange={e => setForm(f => ({ ...f, assetName: e.target.value }))} placeholder="e.g. Ventilator B" style={inputSt} />)}
        {fld("Location",    <input value={form.location}  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}  placeholder="e.g. ICU Block A" style={inputSt} />)}
        {fld("Priority", (
          <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inputSt}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        ))}
        {fld("Assign To", (
          <select value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} style={inputSt}>
            <option value="">— Optional —</option>
            {employees.map(u => <option key={u.id} value={u.id}>{u.fullName || u.full_name}</option>)}
          </select>
        ))}
        {fld("Cutoff / Due (hours from now)", (
          <input type="number" min="1" value={form.cutoffHours} onChange={e => setForm(f => ({ ...f, cutoffHours: e.target.value }))} placeholder="e.g. 24" style={inputSt} />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={saving} style={{ background: saving ? "#86efac" : "#16a34a" }}>{saving ? "Creating…" : "Create Request"}</Btn>
      </div>
    </Modal>
  );
}

/* ─── Set Cutoff Modal ────────────────────────────────────────────────────── */
function SetCutoffModal({ wo, authToken, onClose, onSave }) {
  const [dateVal, setDateVal] = useState(
    wo.cutoff_time ? new Date(wo.cutoff_time).toISOString().slice(0, 16) : ''
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState(null);

  const inpSt = { width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', outline: 'none', background: '#fff' };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      if (wo.source_type === 'asset_query') {
        await apiFetch('PATCH', `/api/company-portal/asset-queries/${wo.id}/cutoff`, { cutoffTime: dateVal || null }, authToken);
      } else {
        await apiFetch('PATCH', `/api/company-portal/work-orders/${wo.id}/cutoff`, { expectedCompletionAt: dateVal || null }, authToken);
      }
      onSave(dateVal || null);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const clear = async () => {
    setSaving(true); setErr(null);
    try {
      if (wo.source_type === 'asset_query') {
        await apiFetch('PATCH', `/api/company-portal/asset-queries/${wo.id}/cutoff`, { cutoffTime: null }, authToken);
      } else {
        await apiFetch('PATCH', `/api/company-portal/work-orders/${wo.id}/cutoff`, { expectedCompletionAt: null }, authToken);
      }
      onSave(null);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  return (
    <Modal onClose={onClose} title="Set Cutoff Deadline" width="420px">
      {err && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '9px 12px', borderRadius: '7px', marginBottom: '14px', fontSize: '13px' }}>{err}</div>
      )}
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
        Request: <strong style={{ color: '#0f172a' }}>{wo.work_order_number || `REQ-${wo.id}`}</strong>
      </p>
      {wo.cutoff_time && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '8px 12px', marginBottom: '14px', fontSize: '12.5px', color: '#854d0e' }}>
          ⏰ Current deadline: <strong>{new Date(wo.cutoff_time).toLocaleString()}</strong>
        </div>
      )}
      <div style={{ marginBottom: '20px' }}>
        <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '6px' }}>New Deadline Date &amp; Time *</label>
        <input
          type="datetime-local"
          value={dateVal}
          onChange={e => setDateVal(e.target.value)}
          style={inpSt}
        />
        <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>When this deadline passes without resolution, the request will be auto-escalated to the supervisor.</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {wo.cutoff_time ? (
          <button onClick={clear} disabled={saving}
            style={{ padding: '7px 13px', borderRadius: '7px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '12px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            ✕ Remove Deadline
          </button>
        ) : <span />}
        <div style={{ display: 'flex', gap: '10px' }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn onClick={save} disabled={saving || !dateVal}>{saving ? 'Saving…' : 'Set Deadline'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function RequestTrackingPanel({ token, companyPortalToken, companyId, employees = [], departments = [], isAdmin = false, isSupervisor = false, allCompaniesMode = false }) {
  const canManage = isAdmin || isSupervisor;
  const authToken = companyPortalToken || token;

  const EMPTY_FILTERS = { search: "", status: "", priority: "", assignedTo: "", departmentId: "", dateFrom: "", dateTo: "", escalated: false, overdue: false };

  const [requests, setRequests]   = useState([]);
  const [summary, setSummary]     = useState(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 1 });
  const [filters, setFilters]     = useState(EMPTY_FILTERS);
  const [statusFilter, setStFil]  = useState("all");   // quick tab filter
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [selectedWO, setSelectedWO] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [cutoffWO, setCutoffWO]     = useState(null);  // request whose cutoff modal is open
  const [page, setPage]           = useState(1);
  const [openStatusMenu, setOpenStatusMenu] = useState(null); // row id with open status dropdown
  const LIMIT = 30;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const ef = { ...filters };
      // merge status-tab filter with dropdown filter
      if (statusFilter !== "all" && !ef.status) {
        if (statusFilter === "escalated") ef.escalated = true;
        else if (statusFilter === "overdue") ef.overdue = true;
        else ef.status = statusFilter;
      }
      if (allCompaniesMode) ef.allCompanies = true;
      const qs = buildQS({ ...ef, page, limit: LIMIT });
      const data = await apiFetch("GET", `/api/company-portal/healthcare/requests${qs}`, undefined, authToken);
      setRequests(Array.isArray(data.data) ? data.data : []);
      setSummary(data.summary || null);
      setPagination(data.pagination || { page: 1, total: 0, pages: 1 });
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [authToken, filters, statusFilter, page, allCompaniesMode]);

  useEffect(() => { load(); }, [load]);

  // ── Real-time Socket.IO subscription ──────────────────────────────────────
  // Connect to the backend Socket.IO server and join this company's room so
  // we receive live updates whenever an issue is created or its status changes.
  useEffect(() => {
    if (!companyId) return;
    const socket = io(BASE, { transports: ["websocket", "polling"], autoConnect: true });
    socket.on("connect", () => { socket.emit("join-company", companyId); });
    // Refresh the list when a new issue arrives or any issue status changes
    socket.on("issue:new",     () => { load(); });
    socket.on("issue:updated", () => { load(); });
    return () => {
      socket.emit("leave-company", companyId);
      socket.disconnect();
    };
  }, [companyId, load]);

  // Close status dropdown when clicking outside
  useEffect(() => {
    if (!openStatusMenu) return;
    const handler = () => setOpenStatusMenu(null);
    window.addEventListener('click', handler, true);
    return () => window.removeEventListener('click', handler, true);
  }, [openStatusMenu]);

  const handleReset = () => { setFilters(EMPTY_FILTERS); setStFil("all"); setPage(1); };

  const exportExcel = async () => {
    const ef = { ...filters };
    if (statusFilter !== "all" && !ef.status) {
      if (statusFilter === "escalated") ef.escalated = true;
      else ef.status = statusFilter;
    }
    if (allCompaniesMode) ef.allCompanies = true;
    const qs = buildQS({ ...ef, type: "requests" });
    try {
      const res = await fetch(`${BASE}/api/company-portal/healthcare/export${qs}`, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || `HTTP ${res.status}`); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `ticket-master-${new Date().toISOString().slice(0,10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch(e) { alert(`Export failed: ${e.message}`); }
  };

  const isOverdue = (wo) => {
    if (wo.is_overdue === 1) return true;
    if (wo.cutoff_time && !["completed","closed"].includes(wo.status)) {
      return new Date(wo.cutoff_time) < new Date();
    }
    return false;
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1400px", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "22px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", background: "#eff6ff", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", margin: 0 }}>Ticket Master</h1>
          </div>
          <p style={{ color: "#64748b", fontSize: "13.5px", margin: "4px 0 0" }}>Track and manage maintenance tasks and issue resolutions</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Btn variant="ghost" onClick={exportExcel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export Excel
          </Btn>
          <Btn onClick={() => setShowCreate(true)} style={{ background: "#16a34a", boxShadow: "0 2px 8px rgba(22,163,74,0.3)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Request
          </Btn>
        </div>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        summary={summary}
        activeFilter={statusFilter}
        onFilterClick={k => { setStFil(sf => sf === k ? "all" : k); setPage(1); }}
      />

      {/* Filters Bar */}
      <FiltersBar
        filters={filters}
        setFilters={f => { setFilters(f); setPage(1); }}
        employees={employees}
        departments={departments}
        onReset={handleReset}
      />

      {/* Status Tab Bar */}
      <div style={{ display: "flex", gap: "0", borderBottom: "2px solid #e2e8f0", marginBottom: "16px", overflowX: "auto" }}>
        {[
          ["all","All"],["open","Open"],["assigned","Assigned"],["in_progress","In Progress"],
          ["on_hold","On Hold"],["completed","Completed"],["closed","Closed"],
          ["escalated","Escalated ⏫"],["overdue","Overdue ⚠️"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => { setStFil(k); setPage(1); }}
            style={{ padding: "9px 16px", background: "none", border: "none", borderBottom: statusFilter === k ? "2.5px solid #2563eb" : "2.5px solid transparent", marginBottom: "-2px", cursor: "pointer", whiteSpace: "nowrap", fontSize: "13px", fontWeight: statusFilter === k ? 700 : 500, color: statusFilter === k ? "#2563eb" : "#64748b" }}>
            {l}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#fef2f2", color: "#dc2626", padding: "12px 16px", borderRadius: "10px", marginBottom: "16px", fontSize: "13.5px" }}>
          ⚠️ {error}
          <button onClick={load} style={{ marginLeft: "12px", textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontWeight: 600 }}>Retry</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        {loading ? <Spinner /> : requests.length === 0 ? <EmptyState /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["#","Request #","Hospital","Asset / Location","Description","Priority","Source","Raised By","Assigned To","WIP Date","Response Time","Resolution Date","TAT","Status","Created","Cutoff","Actions"].map(h => (
                    <th key={h} style={{ padding: "11px 14px", textAlign: "left", color: "#475569", fontWeight: 700, fontSize: "11.5px", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {requests.map((wo, i) => {
                  const overdueFlag = isOverdue(wo);
                  const escalatedFlag = Number(wo.escalation_level) > 0 || wo.flagEscalated;
                  const rowBg = overdueFlag ? "#fffbeb" : escalatedFlag ? "#faf5ff" : undefined;
                  const src = SOURCE_STYLE[(wo.source_label || wo.issue_source || wo.issueSource || "manual").toLowerCase()] || SOURCE_STYLE.manual;

                  return (
                    <tr key={wo.id} style={{ borderBottom: "1px solid #f8fafc", background: rowBg }}
                      onMouseEnter={e => { if (!rowBg) e.currentTarget.style.background = "#fafafa"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = rowBg || ""; }}>
                      <td style={{ padding: "11px 14px", color: "#94a3b8", fontSize: "12px" }}>{(page - 1) * LIMIT + i + 1}</td>
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        <button onClick={() => setSelectedWO(wo)} style={{ fontWeight: 700, color: "#2563eb", fontSize: "12.5px", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>{wo.work_order_number || wo.workOrderNumber || `REQ-${wo.id}`}</button>
                        {escalatedFlag && <span style={{ marginLeft: "5px", fontSize: "10px", background: "#faf5ff", color: "#7c3aed", padding: "1px 5px", borderRadius: "8px" }}>⏫</span>}
                        {overdueFlag   && <span style={{ marginLeft: "5px", fontSize: "10px", background: "#fff7ed", color: "#ea580c", padding: "1px 5px", borderRadius: "8px" }}>⚠️</span>}
                      </td>
                      {/* Hospital / Site Name */}
                      <td style={{ padding: "11px 14px", fontSize: "12.5px", color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {wo.company_name || <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <p style={{ margin: "0 0 2px", fontWeight: 600, color: "#0f172a", fontSize: "13px" }}>{wo.assetName || wo.asset_name || "—"}</p>
                        {(wo.generated_asset_id || wo.asset_id) && (
                          <button onClick={() => wo.asset_id && window.open(`/company/asset/${wo.asset_id}`, '_blank')} style={{ margin: "2px 0 0", fontSize: "11px", color: "#2563eb", fontFamily: "monospace", background: "#eff6ff", display: "inline-block", padding: "1px 6px", borderRadius: "4px", border: "none", cursor: wo.asset_id ? "pointer" : "default", textDecoration: wo.asset_id ? "underline" : "none" }}>{wo.generated_asset_id || `Asset #${wo.asset_id}`}</button>
                        )}
                        <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "11.5px" }}>{wo.location || wo.department_name || ""}</p>
                      </td>
                      <td style={{ padding: "11px 14px", maxWidth: "200px" }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#374151" }}>{wo.issueDescription || wo.issue_description || "—"}</div>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        {canManage && wo.source_type !== 'asset_query' ? (
                          <select
                            value={(wo.priority || 'medium').toLowerCase()}
                            onChange={async e => {
                              const v = e.target.value;
                              try {
                                await apiFetch('PATCH', `/api/company-portal/work-orders/${wo.id}/priority`, { priority: v }, authToken);
                                setRequests(r => r.map(x => x.id === wo.id ? { ...x, priority: v } : x));
                              } catch(_) {}
                            }}
                            style={{ padding: '3px 8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', fontWeight: 700, cursor: 'pointer', background: '#fff' }}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        ) : (
                          <Badge val={wo.priority} styleMap={PRIORITY_STYLE} />
                        )}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <span style={{ padding: "2px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: src.bg, color: src.color }}>{src.label}</span>
                      </td>
                      {/* Raised By */}
                      <td style={{ padding: "11px 14px", fontSize: "12.5px", color: "#0f172a", fontWeight: 600, whiteSpace: "nowrap" }}>
                        {wo.created_by_name || wo.requester_name || <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: "13px", color: "#374151", whiteSpace: "nowrap" }}>
                        {wo.assigned_to_name || wo.assignedToName
                          ? <><span style={{ fontWeight: 600 }}>{wo.assigned_to_name || wo.assignedToName}</span><br/><span style={{ fontSize: "11px", color: "#94a3b8" }}>{wo.assigned_to_designation || ""}</span></>
                          : <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Unassigned</span>}
                      </td>
                      {/* WIP Date */}
                      <td style={{ padding: "11px 14px", fontSize: "12px", color: "#1d4ed8", whiteSpace: "nowrap" }}>
                        {wo.wip_at ? (
                          <><div style={{ fontWeight: 600 }}>{new Date(wo.wip_at).toLocaleDateString()}</div>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{new Date(wo.wip_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></>
                        ) : <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      {/* Response Time: wip_at - created_at */}
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        {wo.wip_at && wo.created_at ? (() => {
                          const mins = Math.max(0, Math.round((new Date(wo.wip_at) - new Date(wo.created_at)) / 60000));
                          const label = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${Math.floor(mins/1440)}d ${Math.floor((mins%1440)/60)}h`;
                          return <span style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", whiteSpace: "nowrap" }}>{label}</span>;
                        })() : <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>}
                      </td>
                      {/* Resolution Date */}
                      <td style={{ padding: "11px 14px", fontSize: "12px", color: "#16a34a", whiteSpace: "nowrap" }}>
                        {wo.resolution_at ? (
                          <><div style={{ fontWeight: 600 }}>{new Date(wo.resolution_at).toLocaleDateString()}</div>
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{new Date(wo.resolution_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div></>
                        ) : <span style={{ color: "#94a3b8" }}>—</span>}
                      </td>
                      {/* TAT: closed_at - created_at */}
                      <td style={{ padding: "11px 14px", whiteSpace: "nowrap" }}>
                        {wo.closed_at && wo.created_at ? (() => {
                          const mins = Math.max(0, Math.round((new Date(wo.closed_at) - new Date(wo.created_at)) / 60000));
                          const label = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${Math.floor(mins/1440)}d ${Math.floor((mins%1440)/60)}h`;
                          return <span style={{ padding: "3px 9px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: "#dcfce7", color: "#166534", whiteSpace: "nowrap" }}>{label}</span>;
                        })() : <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <Badge val={wo.status} styleMap={STATUS_STYLE} />
                      </td>
                      <td style={{ padding: "11px 14px", color: "#64748b", fontSize: "12px", whiteSpace: "nowrap" }}>
                        {wo.created_at ? new Date(wo.created_at).toLocaleDateString() : "—"}
                        <br/>
                        <span style={{ fontSize: "11px" }}>{wo.created_at ? new Date(wo.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                      </td>
                      <td style={{ padding: "11px 14px", fontSize: "12px", whiteSpace: "nowrap" }}>
                        <div style={{ color: overdueFlag ? '#ea580c' : '#64748b', fontWeight: overdueFlag ? 700 : 400 }}>
                          {wo.cutoff_time ? new Date(wo.cutoff_time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                      </td>
                      <td style={{ padding: "8px 10px", minWidth: "160px" }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-start' }}>
                          {/* Row 1: View + Assign/Reassign */}
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'nowrap' }}>
                          {/* VIEW */}
                          <button onClick={() => setSelectedWO(wo)}
                            style={{ padding: '5px 12px', borderRadius: '6px', border: '1.5px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap' }}>
                            View
                          </button>

                          {/* ASSIGN / REASSIGN (all types, not completed/closed/resolved) */}
                          {canManage && !['completed','closed','resolved'].includes(wo.status) && (
                            <button onClick={() => setSelectedWO({ ...wo, _openTab: 'assign' })}
                              style={{ padding: '5px 12px', borderRadius: '6px', border: 'none', background: '#2563eb', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
                              {wo.cp_assigned_to || wo.assigned_to_name ? 'Reassign' : 'Assign'}
                            </button>
                          )}

                          {/* REOPEN (completed/closed/resolved → open) */}
                          {canManage && ['completed','closed','resolved'].includes(wo.status) && (
                            <button onClick={async () => {
                              try {
                                if (wo.source_type === 'asset_query') {
                                  await apiFetch('PATCH', `/api/company-portal/asset-queries/${wo.id}/status`, { status: 'open' }, authToken);
                                } else {
                                  await apiFetch('PATCH', `/api/company-portal/work-orders/${wo.id}/status`, { status: 'open' }, authToken);
                                }
                                load();
                              } catch(_) {}
                            }}
                              style={{ padding: '5px 12px', borderRadius: '6px', border: '1.5px solid #fbbf24', background: '#fffbeb', cursor: 'pointer', fontSize: '12px', fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>
                              Reopen
                            </button>
                          )}
                          </div>

                          {/* Row 2: Cutoff + Status/Acknowledge/Resolve */}
                          {canManage && (
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'nowrap' }}>
                          {/* CUTOFF — opens a proper deadline modal */}
                          {!['completed','closed','resolved'].includes(wo.status) && (
                            <button
                              title={wo.cutoff_time ? `Deadline: ${new Date(wo.cutoff_time).toLocaleString()}` : 'Set cutoff deadline'}
                              onClick={() => setCutoffWO(wo)}
                              style={{
                                padding: '4px 9px', borderRadius: '6px',
                                border: `1.5px solid ${overdueFlag ? '#fca5a5' : '#e5e7eb'}`,
                                background: overdueFlag ? '#fee2e2' : '#f8fafc',
                                cursor: 'pointer', fontSize: '11.5px', fontWeight: 700,
                                color: overdueFlag ? '#dc2626' : '#6b7280',
                                whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px',
                              }}>
                              🕐 {wo.cutoff_time
                                ? new Date(wo.cutoff_time).toLocaleDateString([], { month: 'short', day: 'numeric' })
                                : 'Cutoff'}
                            </button>
                          )}

                          {/* STATUS DROPDOWN */}
                          {(() => {
                            const aqTransitions = { open: ['in_progress','resolved'], in_progress: ['open','resolved'], resolved: ['open','in_progress'] };
                            const woTransitions = { open: ['in_progress','assigned','completed'], assigned: ['in_progress','completed'], in_progress: ['completed','closed'], completed: ['open'], closed: ['open'] };
                            const transitions = wo.source_type === 'asset_query' ? aqTransitions : woTransitions;
                            const options = transitions[wo.status] || [];
                            const labels = { open: '🔴 Open', assigned: '🔵 Assigned', in_progress: '🟠 In Progress', completed: '✅ Completed', closed: '⬛ Closed', resolved: '✅ Resolved' };
                            if (!options.length) return null;
                            const isOpen = openStatusMenu === `${wo.source_type}-${wo.id}`;
                            return (
                              <div style={{ position: 'relative' }}>
                                <button
                                  onClick={() => setOpenStatusMenu(isOpen ? null : `${wo.source_type}-${wo.id}`)}
                                  style={{ padding: '4px 9px', borderRadius: '6px', border: '1.5px solid #e5e7eb', background: isOpen ? '#f1f5f9' : '#fff', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                  Status ▾
                                </button>
                                {isOpen && (
                                  <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: '4px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 999, minWidth: '140px', padding: '4px 0' }}>
                                    {options.map(s => (
                                      <button key={s} onClick={async () => {
                                        setOpenStatusMenu(null);
                                        try {
                                          const endpoint = wo.source_type === 'asset_query'
                                            ? `/api/company-portal/asset-queries/${wo.id}/status`
                                            : `/api/company-portal/work-orders/${wo.id}/status`;
                                          await apiFetch('PATCH', endpoint, { status: s }, authToken);
                                          load();
                                        } catch(_) {}
                                      }}
                                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#374151' }}
                                        onMouseEnter={e => e.target.style.background = '#f8fafc'}
                                        onMouseLeave={e => e.target.style.background = 'none'}>
                                        {labels[s] || s}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* ACKNOWLEDGE (open → in_progress) */}
                          {wo.status === 'open' && (
                            <button onClick={async () => {
                              try {
                                const endpoint = wo.source_type === 'asset_query'
                                  ? `/api/company-portal/asset-queries/${wo.id}/status`
                                  : `/api/company-portal/work-orders/${wo.id}/status`;
                                await apiFetch('PATCH', endpoint, { status: 'in_progress' }, authToken);
                                load();
                              } catch(_) {}
                            }}
                              style={{ padding: '4px 9px', borderRadius: '6px', border: '1.5px solid #fed7aa', background: '#fff7ed', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#c2410c', whiteSpace: 'nowrap' }}>
                              Acknowledge
                            </button>
                          )}

                          {/* RESOLVE (in_progress → completed/resolved) */}
                          {wo.status === 'in_progress' && (
                            <button onClick={async () => {
                              try {
                                if (wo.source_type === 'asset_query') {
                                  await apiFetch('PATCH', `/api/company-portal/asset-queries/${wo.id}/status`, { status: 'resolved' }, authToken);
                                } else {
                                  await apiFetch('PATCH', `/api/company-portal/work-orders/${wo.id}/status`, { status: 'completed' }, authToken);
                                }
                                load();
                              } catch(_) {}
                            }}
                              style={{ padding: '4px 9px', borderRadius: '6px', border: '1.5px solid #6ee7b7', background: '#ecfdf5', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                              Resolve
                            </button>
                          )}

                          {/* DELETE (admin only) */}
                          {canManage && (
                            <button onClick={async () => {
                              if (!window.confirm(`Delete this request (#${wo.work_order_number || wo.id}) permanently? This cannot be undone.`)) return;
                              try {
                                if (wo.source_type === 'asset_query') {
                                  await apiFetch('DELETE', `/api/company-portal/asset-queries/${wo.id}`, undefined, authToken);
                                } else {
                                  await apiFetch('DELETE', `/api/company-portal/work-orders/${wo.id}`, undefined, authToken);
                                }
                                setRequests(r => r.filter(x => x.id !== wo.id));
                              } catch(e) { alert(e.message || 'Delete failed'); }
                            }}
                              style={{ padding: '4px 9px', borderRadius: '6px', border: '1.5px solid #fecaca', background: '#fef2f2', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                              🗑
                            </button>
                          )}
                          </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div style={{ padding: "12px 18px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>
              Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, pagination.total)} of {pagination.total} requests
            </p>
            <div style={{ display: "flex", gap: "6px" }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                style={{ padding: "6px 13px", borderRadius: "7px", border: "1px solid #e2e8f0", background: page <= 1 ? "#f8fafc" : "#fff", cursor: page <= 1 ? "default" : "pointer", fontSize: "12px", color: page <= 1 ? "#94a3b8" : "#374151" }}>
                ← Prev
              </button>
              {Array.from({ length: Math.min(pagination.pages, 7) }, (_, i) => {
                const pg = Math.max(1, page - 3) + i;
                if (pg > pagination.pages) return null;
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    style={{ padding: "6px 11px", borderRadius: "7px", border: `1px solid ${pg === page ? "#2563eb" : "#e2e8f0"}`, background: pg === page ? "#2563eb" : "#fff", color: pg === page ? "#fff" : "#374151", cursor: "pointer", fontSize: "12px", fontWeight: pg === page ? 700 : 400 }}>
                    {pg}
                  </button>
                );
              })}
              <button disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}
                style={{ padding: "6px 13px", borderRadius: "7px", border: "1px solid #e2e8f0", background: page >= pagination.pages ? "#f8fafc" : "#fff", cursor: page >= pagination.pages ? "default" : "pointer", fontSize: "12px", color: page >= pagination.pages ? "#94a3b8" : "#374151" }}>
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* WO Detail Modal */}
      {selectedWO && (
        <WODetailModal
          wo={selectedWO}
          employees={employees}
          token={token}
          companyPortalToken={authToken}
          onClose={() => setSelectedWO(null)}
          onUpdated={() => { setSelectedWO(null); load(); }}
        />
      )}

      {/* Create WO Modal */}
      {showCreate && (
        <CreateWOModal
          employees={employees}
          companyPortalToken={authToken}
          companyId={companyId}
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}

      {/* Set Cutoff Modal */}
      {cutoffWO && (
        <SetCutoffModal
          wo={cutoffWO}
          authToken={authToken}
          onClose={() => setCutoffWO(null)}
          onSave={(newTime) => {
            setRequests(r => r.map(x => x.id === cutoffWO.id && x.source_type === cutoffWO.source_type ? { ...x, cutoff_time: newTime } : x));
            setCutoffWO(null);
          }}
        />
      )}
    </div>
  );
}
