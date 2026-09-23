/**
 * Parts / Inventory module (web).
 * Add spare parts (name, make, model, photo, quantities) and maintain a simple
 * inventory (total & available quantity). Parts added from the mobile app appear
 * here too — both use the same company-scoped /api/company-portal/parts endpoints.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getParts, getPartsSummary, createPart, updatePart, deletePart, uploadPartPhoto, getCompanyPortalAssets, syncPartsToZoho } from "../api";

const card = { background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0" };
const btn = (bg, color, border) => ({ padding: "8px 14px", borderRadius: "8px", border: `1px solid ${border || bg}`, background: bg, color, fontWeight: 700, fontSize: "13px", cursor: "pointer" });
const inp = { width: "100%", padding: "9px 11px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", boxSizing: "border-box" };
const lbl = { display: "block", fontSize: "11.5px", fontWeight: 700, color: "#475569", marginBottom: "4px" };

const EMPTY = { partName: "", make: "", model: "", unit: "", totalQuantity: "", availableQuantity: "",
  sku: "", hsn: "", gstRate: "", purchaseRate: "", mpn: "", compatibleEquipment: "", criticality: "" };

export default function PartsModule({ token, canManage = true }) {
  const [parts, setParts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // part object being edited
  const [viewImg, setViewImg] = useState(null); // photo URL shown in the lightbox
  const [syncing, setSyncing] = useState(false);
  const [syncAsset, setSyncAsset] = useState(""); // "" = all assets
  const [assets, setAssets] = useState([]);

  useEffect(() => { (async () => {
    try {
      const r = await getCompanyPortalAssets(token, { limit: 2000 });
      const list = Array.isArray(r) ? r : (r?.assets || r?.data || r?.rows || []);
      setAssets(list.map((a) => {
        const name = a.assetName || a.name || a.asset_name || `Asset #${a.id}`;
        const code = a.generatedAssetId || a.assetUniqueId || a.code || a.generated_asset_id;
        return code ? `${name} (${code})` : name;
      }));
    } catch { /* ignore */ }
  })(); }, [token]);

  const doSync = async () => {
    setSyncing(true); setErr("");
    try {
      const r = await syncPartsToZoho(token, syncAsset || undefined);
      alert(`Synchronised to Zoho Books${syncAsset ? ` (asset: ${syncAsset})` : " (all parts)"}\n\nNewly synced: ${r.synced}\nAlready synced: ${r.alreadySynced}\nFailed: ${r.failed}${r.errors?.length ? "\n\n" + r.errors.join("\n") : ""}`);
      load();
    } catch (e) { setErr(e.message || "Sync failed"); }
    finally { setSyncing(false); }
  };

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const [list, sum] = await Promise.all([getParts(token, q), getPartsSummary(token)]);
      setParts(Array.isArray(list) ? list : []);
      setSummary(sum);
    } catch (e) { setErr(e.message || "Failed to load parts"); }
    finally { setLoading(false); }
  }, [token, q]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {/* Header + summary */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>Parts / Inventory</h2>
          <p style={{ margin: "3px 0 0", fontSize: "13px", color: "#64748b" }}>Add spare parts and track total &amp; available quantity. Parts added from the mobile app appear here too.</p>
        </div>
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {canManage && (
            <select value={syncAsset} onChange={(e) => setSyncAsset(e.target.value)} title="Choose an asset to sync its parts, or all"
              style={{ padding: "8px 10px", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "13px", maxWidth: "220px" }}>
              <option value="">All assets</option>
              {assets.map((a, i) => <option key={i} value={a}>{a}</option>)}
            </select>
          )}
          {canManage && <button onClick={doSync} disabled={syncing} style={btn("#0f766e", "#fff")}>{syncing ? "Synchronising…" : "⟳ Synchronise to Zoho"}</button>}
          {canManage && <button onClick={() => { setEditing(null); setShowForm(true); }} style={btn("#2563eb", "#fff")}>+ Add Part</button>}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "18px" }}>
        <SummaryTile label="Distinct Parts" value={summary?.totalParts ?? "—"} color="#2563eb" />
        <SummaryTile label="Total Units" value={summary?.totalUnits ?? "—"} color="#0f172a" />
        <SummaryTile label="Available Units" value={summary?.availableUnits ?? "—"} color="#059669" />
        <SummaryTile label="Out of Stock" value={summary?.outOfStock ?? "—"} color={(summary?.outOfStock || 0) > 0 ? "#dc2626" : "#94a3b8"} />
      </div>

      {err && <div style={{ padding: "10px 14px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>{err}</div>}

      {/* Search */}
      <div style={{ marginBottom: "12px" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search parts by name, make or model…"
          style={{ ...inp, maxWidth: "360px" }} />
      </div>

      {/* Table */}
      <div style={{ ...card, overflow: "hidden" }}>
        {loading ? (
          <p style={{ color: "#94a3b8", fontSize: "13px", padding: "24px" }}>Loading…</p>
        ) : parts.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "13.5px" }}>
            No parts yet.{canManage ? " Click “+ Add Part” to add one." : ""}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", textAlign: "left" }}>
                  {["Photo", "Part", "Make", "Model", "Total", "Available", "Added by", ...(canManage ? ["Actions"] : [])].map((h, i) => (
                    <th key={h} style={{ padding: "10px 12px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1.5px solid #e2e8f0", textAlign: ["Total", "Available"].includes(h) ? "center" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => {
                  const out = (p.availableQuantity ?? 0) <= 0;
                  return (
                    <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "8px 12px" }}>
                        {p.photoUrl
                          ? <img src={p.photoUrl} alt={p.partName} onClick={() => setViewImg(p.photoUrl)} title="Click to view"
                              style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", border: "1px solid #e2e8f0", cursor: "pointer" }} />
                          : <div style={{ width: 40, height: 40, borderRadius: 8, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "16px" }}>⚙</div>}
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: "#0f172a" }}>{p.partName}</td>
                      <td style={{ padding: "8px 12px", color: "#475569" }}>{p.make || "—"}</td>
                      <td style={{ padding: "8px 12px", color: "#475569" }}>{p.model || "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center", fontWeight: 700, color: "#0f172a" }}>{p.totalQuantity ?? 0}{p.unit ? ` ${p.unit}` : ""}</td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        <span style={{ fontWeight: 800, color: out ? "#dc2626" : "#059669" }}>{p.availableQuantity ?? 0}</span>
                        {out && <span style={{ marginLeft: 6, fontSize: "10px", fontWeight: 700, color: "#dc2626", background: "#fef2f2", padding: "1px 6px", borderRadius: "10px" }}>OUT</span>}
                      </td>
                      <td style={{ padding: "8px 12px", color: "#94a3b8", fontSize: "12px" }}>{p.createdByName || "—"}</td>
                      {canManage && (
                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                          <button onClick={() => { setEditing(p); setShowForm(true); }} style={{ ...btn("#eff6ff", "#2563eb", "#bfdbfe"), padding: "5px 10px", marginRight: 6 }}>Edit</button>
                          <button onClick={async () => { if (window.confirm(`Delete "${p.partName}"?`)) { try { await deletePart(token, p.id); load(); } catch (e) { alert(e.message); } } }}
                            style={{ ...btn("#fef2f2", "#dc2626", "#fecaca"), padding: "5px 10px" }}>Delete</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <PartForm token={token} part={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }} />
      )}

      {viewImg && (
        <div onClick={() => setViewImg(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.8)", zIndex: 3100, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", cursor: "zoom-out" }}>
          <img src={viewImg} alt="Part" style={{ maxWidth: "90vw", maxHeight: "90vh", borderRadius: "12px", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" }} />
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value, color }) {
  return (
    <div style={{ ...card, padding: "14px 16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "26px", fontWeight: 900, color, marginTop: "4px", lineHeight: 1 }}>{value}</div>
    </div>
  );
}

function PartForm({ token, part, onClose, onSaved }) {
  const isEdit = !!part;
  const [form, setForm] = useState(isEdit
    ? { partName: part.partName || "", make: part.make || "", model: part.model || "", unit: part.unit || "",
        totalQuantity: String(part.totalQuantity ?? ""), availableQuantity: String(part.availableQuantity ?? ""),
        sku: part.sku || "", hsn: part.hsn || "", gstRate: part.gstRate != null ? String(part.gstRate) : "",
        purchaseRate: part.purchaseRate != null ? String(part.purchaseRate) : "", mpn: part.mpn || "",
        compatibleEquipment: part.compatibleEquipment || "", criticality: part.criticality || "" }
    : { ...EMPTY });
  const [photoUrl, setPhotoUrl] = useState(part?.photoUrl || null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [assets, setAssets] = useState([]);
  const fileRef = useRef(null);

  // Assets of the currently-selected company — for the Compatible Equipment dropdown.
  useEffect(() => { (async () => {
    try {
      const r = await getCompanyPortalAssets(token, { limit: 2000 });
      const list = Array.isArray(r) ? r : (r?.assets || r?.data || r?.rows || []);
      setAssets(list);
    } catch { /* ignore */ }
  })(); }, [token]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setErr("");
    try { const r = await uploadPartPhoto(token, file); setPhotoUrl(r.url); }
    catch (ex) { setErr(ex.message || "Photo upload failed"); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!form.partName.trim()) { setErr("Part name is required"); return; }
    setSaving(true); setErr("");
    const payload = {
      partName: form.partName.trim(), make: form.make.trim(), model: form.model.trim(),
      totalQuantity: form.totalQuantity === "" ? 0 : Math.max(0, parseInt(form.totalQuantity, 10) || 0),
      availableQuantity: form.availableQuantity === "" ? undefined : Math.max(0, parseInt(form.availableQuantity, 10) || 0),
      sku: form.sku.trim(), hsn: form.hsn.trim(),
      mpn: form.mpn.trim(), compatibleEquipment: form.compatibleEquipment.trim(), criticality: form.criticality,
      photoUrl: photoUrl || null,
    };
    try {
      if (isEdit) await updatePart(token, part.id, payload);
      else await createPart(token, payload);
      onSaved();
    } catch (ex) { setErr(ex.message || "Could not save"); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: "460px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", padding: "22px" }}>
        <h3 style={{ margin: "0 0 14px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{isEdit ? "Edit Part" : "Add Part"}</h3>
        {err && <div style={{ padding: "9px 12px", background: "#fef2f2", color: "#dc2626", borderRadius: "8px", fontSize: "12.5px", marginBottom: "12px" }}>{err}</div>}

        <div style={{ display: "grid", gap: "12px" }}>
          <div><label style={lbl}>Part name *</label><input style={inp} value={form.partName} onChange={set("partName")} placeholder="e.g. Air filter" /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div><label style={lbl}>Make</label><input style={inp} value={form.make} onChange={set("make")} placeholder="e.g. Philips" /></div>
            <div><label style={lbl}>Model</label><input style={inp} value={form.model} onChange={set("model")} placeholder="e.g. HR-2000" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div><label style={lbl}>Total qty</label><input style={inp} type="number" min="0" value={form.totalQuantity} onChange={set("totalQuantity")} placeholder="0" /></div>
            <div><label style={lbl}>Available</label><input style={inp} type="number" min="0" value={form.availableQuantity} onChange={set("availableQuantity")} placeholder="= total" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <div><label style={lbl}>SKU / Part code</label><input style={inp} value={form.sku} onChange={set("sku")} placeholder="e.g. AF-1024" /></div>
            <div><label style={lbl}>MPN (mfr part no.)</label><input style={inp} value={form.mpn} onChange={set("mpn")} placeholder="OEM part no." /></div>
            <div><label style={lbl}>HSN code</label><input style={inp} value={form.hsn} onChange={set("hsn")} placeholder="e.g. 9018" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px" }}>
            <div><label style={lbl}>Compatible equipment (asset)</label>
              <select style={inp} value={form.compatibleEquipment} onChange={set("compatibleEquipment")}>
                <option value="">— Select asset —</option>
                {(() => {
                  const opts = assets.map((a) => {
                    const name = a.assetName || a.name || a.asset_name || `Asset #${a.id}`;
                    const code = a.generatedAssetId || a.assetUniqueId || a.code || a.generated_asset_id;
                    return code ? `${name} (${code})` : name;
                  });
                  // Preserve a previously-saved value that isn't in the current asset list.
                  if (form.compatibleEquipment && !opts.includes(form.compatibleEquipment)) opts.unshift(form.compatibleEquipment);
                  return opts.map((label, i) => <option key={i} value={label}>{label}</option>);
                })()}
              </select>
            </div>
            <div><label style={lbl}>Criticality</label>
              <select style={inp} value={form.criticality} onChange={set("criticality")}>
                <option value="">—</option>
                <option value="Critical">Critical</option>
                <option value="Non-critical">Non-critical</option>
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Photo</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              {photoUrl && <img src={photoUrl} alt="part" style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: "1px solid #e2e8f0" }} />}
              <input ref={fileRef} type="file" accept="image/*" onChange={pickPhoto} style={{ display: "none" }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading} style={btn("#f1f5f9", "#475569", "#cbd5e1")}>
                {uploading ? "Uploading…" : photoUrl ? "Change photo" : "Upload photo"}
              </button>
              {photoUrl && <button onClick={() => setPhotoUrl(null)} style={btn("#fef2f2", "#dc2626", "#fecaca")}>Remove</button>}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
          <button onClick={onClose} style={btn("#fff", "#475569", "#cbd5e1")}>Cancel</button>
          <button onClick={submit} disabled={saving || uploading} style={btn("#2563eb", "#fff")}>{saving ? "Saving…" : isEdit ? "Save changes" : "Add Part"}</button>
        </div>
      </div>
    </div>
  );
}
