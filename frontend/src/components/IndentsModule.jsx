/**
 * Part Indents module (web) — spare-part requests, approvals & issue.
 * Managers see an approvals inbox and can approve / reject / issue (which moves
 * stock via the ledger). Anyone can raise an indent and track their own.
 */
import { useCallback, useEffect, useState } from "react";
import { getIndents, getIndent, createIndent, approveIndent, rejectIndent, issueIndent, cancelIndent, getParts,
  getVendors, createVendor, sendToProcurement, quoteIndent, approveIndentPrice, rejectIndentPrice, dispatchIndent, grnIndent } from "../api";

const STATUS_CFG = {
  pending_approval:       { label: "Pending Approval", bg: "#fef3c7", color: "#b45309" },
  approved:               { label: "Approved",         bg: "#e0e7ff", color: "#4338ca" },
  in_procurement:         { label: "In Procurement",   bg: "#ffedd8", color: "#c2410c" },
  pending_price_approval: { label: "Price Approval",   bg: "#fef3c7", color: "#b45309" },
  po_created:             { label: "PO Created",        bg: "#e0f2fe", color: "#0369a1" },
  dispatched:             { label: "Dispatched",       bg: "#ede9fe", color: "#6d28d9" },
  received:               { label: "Received",         bg: "#d6f5f0", color: "#0d9488" },
  issued:                 { label: "Issued",           bg: "#dcfce7", color: "#15803d" },
  rejected:               { label: "Rejected",         bg: "#fee2e2", color: "#b91c1c" },
  cancelled:              { label: "Cancelled",        bg: "#f1f5f9", color: "#64748b" },
};
const card = { background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" };
const btn = (bg, color, border) => ({ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${border || bg}`, background: bg, color, fontWeight: 700, fontSize: "13px", cursor: "pointer" });
const Chip = ({ s }) => { const c = STATUS_CFG[s] || STATUS_CFG.cancelled; return <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: c.bg, color: c.color, whiteSpace: "nowrap" }}>{c.label}</span>; };

export default function IndentsModule({ token, canManage = false, canProcure = false, canFinance = false }) {
  const [scope, setScope] = useState(canManage ? "inbox" : "mine");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try { setList(await getIndents(token, { scope })); }
    catch (e) { setErr(e.message || "Failed to load indents"); }
    finally { setLoading(false); }
  }, [token, scope]);

  useEffect(() => { load(); }, [load]);

  const tabs = [
    ...(canManage || canFinance ? [{ k: "inbox", label: "Approvals" }] : []),
    ...(canProcure ? [{ k: "procurement", label: "Procurement" }] : []),
    { k: "mine", label: "My Indents" },
    ...(canManage || canProcure || canFinance ? [{ k: "all", label: "All" }] : []),
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Part Indents</h2>
          <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#64748b" }}>Request spare parts, approve them, and issue from stock. Approving reserves stock; issuing consumes it.</p>
        </div>
        <button onClick={() => setShowNew(true)} style={btn("#2563eb", "#fff")}>+ New Indent</button>
      </div>

      <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setScope(t.k)}
            style={{ ...btn(scope === t.k ? "#0f172a" : "#fff", scope === t.k ? "#fff" : "#475569", "#e2e8f0"), padding: "6px 14px" }}>
            {t.label}
          </button>
        ))}
      </div>

      {err && <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>{err}</div>}

      <div style={{ ...card, overflow: "hidden" }}>
        {loading ? (
          <p style={{ color: "#94a3b8", fontSize: "13px", padding: "24px" }}>Loading…</p>
        ) : list.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "13.5px" }}>No indents here.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                  {["Indent #", "Asset", "Parts", "Qty", "Raised by", "Status", ""].map((h) => (
                    <th key={h} style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1.5px solid #e2e8f0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "9px 12px", fontFamily: "monospace", fontWeight: 700, color: "#0f172a" }}>{r.indentNumber || `#${r.id}`}</td>
                    <td style={{ padding: "9px 12px", color: "#475569" }}>{r.assetName || "—"}</td>
                    <td style={{ padding: "9px 12px", color: "#475569" }}>{r.itemCount} item(s)</td>
                    <td style={{ padding: "9px 12px", color: "#475569" }}>{r.totalQty}</td>
                    <td style={{ padding: "9px 12px", color: "#64748b" }}>{r.raisedByName || "—"}</td>
                    <td style={{ padding: "9px 12px" }}><Chip s={r.status} /></td>
                    <td style={{ padding: "9px 12px", textAlign: "right" }}>
                      <button onClick={() => setOpenId(r.id)} style={{ ...btn("#eff6ff", "#2563eb", "#bfdbfe"), padding: "5px 12px" }}>Open</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openId && <IndentDetail token={token} id={openId} canManage={canManage} canProcure={canProcure} canFinance={canFinance} onClose={() => setOpenId(null)} onChanged={() => { setOpenId(null); load(); }} />}
      {showNew && <NewIndent token={token} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function IndentDetail({ token, id, canManage, canProcure, canFinance, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [quoting, setQuoting] = useState(false);

  const reload = async () => { try { setData(await getIndent(token, id)); } catch (e) { setErr(e.message); } };
  useEffect(() => { reload(); }, [token, id]);

  const act = async (fn, confirmMsg) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true); setErr("");
    try { await fn(); onChanged(); }
    catch (e) { setErr(e.message || "Action failed"); setBusy(false); }
  };

  const st = data?.status;
  const canApprove = canManage && st === "pending_approval";
  const canIssue = canManage && (st === "approved" || st === "received");
  const canReject = canManage && ["pending_approval", "approved"].includes(st);
  const canCancel = ["pending_approval", "approved"].includes(st);
  const canSendProc = canManage && ["pending_approval", "approved"].includes(st);
  const canQuote = canProcure && ["in_procurement"].includes(st);
  const canApprovePrice = (canManage || canFinance) && st === "pending_price_approval";
  const canDispatch = canProcure && st === "po_created";
  const canGrn = (canProcure || canManage) && ["dispatched", "po_created"].includes(st);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "560px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: "22px" }}>
        {!data ? <p style={{ color: "#94a3b8" }}>Loading…</p> : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a", fontFamily: "monospace" }}>{data.indent_number || `Indent #${data.id}`}</h3>
              <Chip s={data.status} />
            </div>
            <p style={{ margin: "0 0 14px", fontSize: "12.5px", color: "#64748b" }}>
              {data.assetName ? `Asset: ${data.assetName} · ` : ""}Raised by {data.raised_by_name || "—"}{data.notes ? ` · ${data.notes}` : ""}
            </p>

            {err && <div style={{ padding: "9px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "12.5px", marginBottom: "12px" }}>{err}</div>}

            <div style={{ ...card, overflow: "hidden", marginBottom: "16px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead><tr style={{ background: "#f8fafc" }}>
                  {["Part", "Requested", "Approved", "Issued", "In stock"].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {(data.items || []).map((it) => (
                    <tr key={it.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600, color: "#0f172a" }}>{it.part_name || `Part #${it.part_id}`}</td>
                      <td style={{ padding: "8px 12px" }}>{it.qty_requested}</td>
                      <td style={{ padding: "8px 12px" }}>{it.qty_approved ?? "—"}</td>
                      <td style={{ padding: "8px 12px" }}>{it.qty_issued}</td>
                      <td style={{ padding: "8px 12px", color: (it.partAvailable ?? 0) <= 0 ? "#dc2626" : "#059669", fontWeight: 700 }}>{it.partAvailable ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* History */}
            {(data.history || []).length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "6px" }}>History</div>
                {data.history.map((h, i) => (
                  <div key={i} style={{ fontSize: "12px", color: "#475569", padding: "3px 0", display: "flex", justifyContent: "space-between", gap: "10px" }}>
                    <span><b style={{ color: "#0f172a", textTransform: "capitalize" }}>{h.action}</b>{h.actorName ? ` — ${h.actorName}` : ""}{h.comments ? `: ${h.comments}` : ""}</span>
                    <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>{new Date(h.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
              {canCancel && <button disabled={busy} onClick={() => act(() => cancelIndent(token, id), "Cancel this indent?")} style={btn("#fff", "#64748b", "#cbd5e1")}>Cancel</button>}
              {canReject && <button disabled={busy} onClick={() => act(() => rejectIndent(token, id), "Reject this indent?")} style={btn("#fef2f2", "#dc2626", "#fecaca")}>Reject</button>}
              {canSendProc && <button disabled={busy} onClick={() => act(() => sendToProcurement(token, id), "Send this indent to the purchase team? (buys new stock, no reservation)")} style={btn("#fff7ed", "#c2410c", "#fed7aa")}>Send to procurement</button>}
              {canApprove && <button disabled={busy} onClick={() => act(() => approveIndent(token, id))} style={btn("#4338ca", "#fff")}>Approve &amp; reserve</button>}
              {canQuote && <button disabled={busy} onClick={() => setQuoting(true)} style={btn("#c2410c", "#fff")}>Add quote</button>}
              {canApprovePrice && <button disabled={busy} onClick={() => act(() => rejectIndentPrice(token, id), "Reject the quote and send back for re-quote?")} style={btn("#fef2f2", "#dc2626", "#fecaca")}>Reject price</button>}
              {canApprovePrice && <button disabled={busy} onClick={() => act(() => approveIndentPrice(token, id), "Approve price and generate the PO?")} style={btn("#0369a1", "#fff")}>Approve price &amp; make PO</button>}
              {canDispatch && <button disabled={busy} onClick={() => act(() => dispatchIndent(token, id))} style={btn("#6d28d9", "#fff")}>Dispatch to site</button>}
              {canGrn && <button disabled={busy} onClick={() => act(() => grnIndent(token, id), "Confirm goods received? This adds the parts to stock.")} style={btn("#0d9488", "#fff")}>Receive (GRN)</button>}
              {canIssue && <button disabled={busy} onClick={() => act(() => issueIndent(token, id), "Issue parts and deduct stock?")} style={btn("#15803d", "#fff")}>Issue &amp; deduct</button>}
              <button onClick={onClose} style={btn("#fff", "#475569", "#cbd5e1")}>Close</button>
            </div>

            {quoting && <QuoteForm token={token} indent={data} onClose={() => setQuoting(false)} onSaved={() => { setQuoting(false); onChanged(); }} />}
          </>
        )}
      </div>
    </div>
  );
}

function QuoteForm({ token, indent, onClose, onSaved }) {
  const [vendors, setVendors] = useState([]);
  const [vendorId, setVendorId] = useState("");
  const [prices, setPrices] = useState(() => Object.fromEntries((indent.items || []).map((it) => [it.id, it.unit_price ?? ""])));
  const [newVendor, setNewVendor] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const loadV = async () => { try { setVendors(await getVendors(token)); } catch { /* ignore */ } };
  useEffect(() => { loadV(); }, []);

  const addVendor = async () => {
    if (!newVendor.trim()) return;
    try { const r = await createVendor(token, { name: newVendor.trim() }); setNewVendor(""); await loadV(); setVendorId(String(r.id)); }
    catch (e) { setErr(e.message); }
  };
  const submit = async () => {
    setSaving(true); setErr("");
    const priceMap = {}; Object.entries(prices).forEach(([k, v]) => { if (v !== "") priceMap[k] = Number(v); });
    try { await quoteIndent(token, indent.id, { vendorId: vendorId ? Number(vendorId) : null, prices: priceMap }); onSaved(); }
    catch (e) { setErr(e.message || "Could not submit quote"); setSaving(false); }
  };
  const inp = { width: "100%", padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 3200, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "480px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: "22px" }}>
        <h3 style={{ margin: "0 0 12px", fontSize: "17px", fontWeight: 800, color: "#0f172a" }}>Vendor &amp; pricing</h3>
        {err && <div style={{ padding: "9px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "12.5px", marginBottom: "12px" }}>{err}</div>}
        <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>Vendor</label>
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={{ ...inp, marginBottom: "8px" }}>
          <option value="">Select vendor…</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
          <input value={newVendor} onChange={(e) => setNewVendor(e.target.value)} placeholder="Add a new vendor…" style={inp} />
          <button onClick={addVendor} style={btn("#f1f5f9", "#475569", "#e2e8f0")}>Add</button>
        </div>
        <div style={{ ...card, overflow: "hidden", marginBottom: "16px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead><tr style={{ background: "#f8fafc" }}>{["Part", "Qty", "Unit price"].map((h) => <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: "10.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {(indent.items || []).map((it) => (
                <tr key={it.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600 }}>{it.part_name || `Part #${it.part_id}`}</td>
                  <td style={{ padding: "8px 12px" }}>{it.qty_approved ?? it.qty_requested}</td>
                  <td style={{ padding: "8px 12px" }}><input type="number" min="0" step="0.01" value={prices[it.id] ?? ""} onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value }))} style={{ ...inp, width: "120px" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
          <button onClick={onClose} style={btn("#fff", "#475569", "#cbd5e1")}>Cancel</button>
          <button onClick={submit} disabled={saving} style={btn("#c2410c", "#fff")}>{saving ? "Submitting…" : "Submit quote for approval"}</button>
        </div>
      </div>
    </div>
  );
}

function NewIndent({ token, onClose, onSaved }) {
  const [parts, setParts] = useState([]);
  const [rows, setRows] = useState([{ partId: "", qty: "1" }]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { (async () => { try { setParts(await getParts(token)); } catch { /* ignore */ } })(); }, [token]);

  const setRow = (i, k, v) => setRows((rs) => rs.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  const addRow = () => setRows((rs) => [...rs, { partId: "", qty: "1" }]);
  const rmRow = (i) => setRows((rs) => rs.filter((_, idx) => idx !== i));

  const submit = async () => {
    const items = rows.map((r) => ({ partId: Number(r.partId), qty: Math.max(1, parseInt(r.qty, 10) || 0) })).filter((r) => r.partId && r.qty > 0);
    if (!items.length) { setErr("Add at least one part"); return; }
    setSaving(true); setErr("");
    try { await createIndent(token, { items, notes: notes.trim() || null }); onSaved(); }
    catch (e) { setErr(e.message || "Could not submit"); setSaving(false); }
  };

  const inp = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "520px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: "22px" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>New Indent</h3>
        {err && <div style={{ padding: "9px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "12.5px", marginBottom: "12px" }}>{err}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {rows.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: "8px", alignItems: "center" }}>
              <select value={r.partId} onChange={(e) => setRow(i, "partId", e.target.value)} style={inp}>
                <option value="">Select part…</option>
                {parts.map((p) => <option key={p.id} value={p.id}>{p.partName}{p.make ? ` — ${p.make}` : ""} (avail {p.availableQuantity ?? 0})</option>)}
              </select>
              <input type="number" min="1" value={r.qty} onChange={(e) => setRow(i, "qty", e.target.value)} style={inp} />
              <button onClick={() => rmRow(i)} disabled={rows.length === 1} style={{ ...btn("#fff", "#dc2626", "#fecaca"), padding: "7px 10px", opacity: rows.length === 1 ? 0.4 : 1 }}>✕</button>
            </div>
          ))}
          <button onClick={addRow} style={{ ...btn("#f1f5f9", "#475569", "#e2e8f0"), alignSelf: "flex-start" }}>+ Add part</button>
          <div>
            <label style={{ display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" }}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} placeholder="Why is this part needed?" />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "18px" }}>
          <button onClick={onClose} style={btn("#fff", "#475569", "#cbd5e1")}>Cancel</button>
          <button onClick={submit} disabled={saving} style={btn("#2563eb", "#fff")}>{saving ? "Submitting…" : "Submit for approval"}</button>
        </div>
      </div>
    </div>
  );
}
