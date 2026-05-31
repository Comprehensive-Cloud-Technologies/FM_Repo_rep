#!/usr/bin/env python3
"""Patch CompanyPortal.jsx - employee section, sidebar, navigation"""
import re

with open("CompanyPortal.jsx", "r", encoding="utf-8") as f:
    content = f.read()

orig = content

# ── 1. Add createCompanyUser to imports ───────────────────────────────────────
if "createCompanyUser" not in content:
    content = content.replace("  getClientAssets,", "  getClientAssets,\n  createCompanyUser,\n  getCompanyUsers,")
    print("✓ Added createCompanyUser, getCompanyUsers imports")
else:
    print("- createCompanyUser already imported")

# ── 2. Add navigateToEmployeesCompany state variable ─────────────────────────
OLD_STATE = "  const [dashExportOpen, setDashExportOpen] = useState(false);"
NEW_STATE = ("  const [dashExportOpen, setDashExportOpen] = useState(false);\n"
             "  const [empInitCompanyId, setEmpInitCompanyId] = useState(null);")
if OLD_STATE in content:
    content = content.replace(OLD_STATE, NEW_STATE)
    print("✓ Added empInitCompanyId state")
else:
    print("✗ dashExportOpen state NOT found for empInitCompanyId insert")

# ── 3. Update Admin Users button to navigate to employees section ─────────────
OLD_ADMIN_BTN = '<ABtns bg="#f3e8ff" col="#7c3aed" title="Admin Users" onClick={() => openAdminView(c.id)}>'
NEW_ADMIN_BTN = '<ABtns bg="#f3e8ff" col="#7c3aed" title="Add/View Users" onClick={() => { setEmpInitCompanyId(c.id); setNav("employees"); setShowAddForm(false); }}>'
if OLD_ADMIN_BTN in content:
    content = content.replace(OLD_ADMIN_BTN, NEW_ADMIN_BTN)
    print("✓ Updated Admin Users button to navigate to employees")
else:
    print("✗ Admin Users button NOT found")

# ── 4. Pass empInitCompanyId to AdminEmployeesSection ─────────────────────────
OLD_EMP_SECTION = '<AdminEmployeesSection token={token} companies={companies} />'
NEW_EMP_SECTION = '<AdminEmployeesSection token={token} companies={companies} initialCompanyId={empInitCompanyId} onCompanySelected={() => setEmpInitCompanyId(null)} />'
if OLD_EMP_SECTION in content:
    content = content.replace(OLD_EMP_SECTION, NEW_EMP_SECTION)
    print("✓ Passed initialCompanyId to AdminEmployeesSection")
else:
    print("✗ AdminEmployeesSection usage NOT found")

# ── 5. Replace AdminEmployeesSection entirely with new form ──────────────────
# Find the function definition
fn_start = content.find("function AdminEmployeesSection({ token, companies = [] }) {")
if fn_start < 0:
    print("✗ AdminEmployeesSection function NOT found")
else:
    # Find where the function ends - look for the next "function " or the export
    # The function ends at matching braces
    # Simpler: find the next top-level "function " definition
    next_fn = content.find("\nfunction ", fn_start + 10)
    if next_fn < 0:
        print("✗ Could not find end of AdminEmployeesSection")
    else:
        old_fn = content[fn_start:next_fn]
        new_fn = r'''function AdminEmployeesSection({ token, companies = [], initialCompanyId = null, onCompanySelected }) {
  const allCos = Array.isArray(companies) ? companies : [];
  const [selCo, setSelCo] = useState(initialCompanyId || allCos[0]?.id || null);
  const [employees, setEmp] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editEmp, setEditEmp] = useState(null);
  const [coSearch, setCoSearch] = useState("");
  const [coDropOpen, setCoDropOpen] = useState(false);
  const emptyForm = { fullName:"", email:"", phone:"", designation:"", role:"employee", status:"Active", username:"", password:"" };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState(null);

  // Sync initialCompanyId when it changes (e.g. navigated from company action)
  useEffect(() => {
    if (initialCompanyId) { setSelCo(initialCompanyId); if (onCompanySelected) onCompanySelected(); }
  }, [initialCompanyId]);

  const load = useCallback(async (cid) => {
    if (!cid) return; setLoading(true);
    try { const d = await getAdminEmployees(token, cid); setEmp(Array.isArray(d) ? d : []); }
    catch(e) { console.error(e); }
    setLoading(false);
  }, [token]);

  useEffect(() => { if (selCo) load(selCo); }, [selCo, load]);

  const handleSave = async () => {
    setFormErr(null);
    if (!form.fullName || !form.email) { setFormErr("Full Name and Email are required."); return; }
    if (!editEmp && !form.password) { setFormErr("Password is required."); return; }
    setSaving(true);
    try {
      if (editEmp) {
        await updateAdminEmployee(token, editEmp.id, form);
      } else {
        await createCompanyUser(token, { ...form, companyId: selCo });
      }
      await load(selCo);
      setShowCreate(false); setEditEmp(null); setForm(emptyForm);
    } catch(e) { setFormErr(e.message || "Save failed"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this employee? This cannot be undone.")) return;
    try { await deleteAdminEmployee(token, id); setEmp(prev => prev.filter(e => e.id !== id)); }
    catch(e) { alert(e.message); }
  };

  const displayed = employees.filter(e => !search || (e.fullName||"").toLowerCase().includes(search.toLowerCase()) || (e.email||"").toLowerCase().includes(search.toLowerCase()) || (e.designation||"").toLowerCase().includes(search.toLowerCase()));
  const ROLES = ["admin","supervisor","technician","employee"];
  const roleColors = { admin:"#dbeafe", supervisor:"#fef9c3", technician:"#dcfce7", employee:"#f1f5f9" };
  const roleTextColors = { admin:"#1d4ed8", supervisor:"#854d0e", technician:"#166534", employee:"#475569" };

  const selectedCo = allCos.find(c => c.id === selCo);
  const filteredCos = coSearch ? allCos.filter(c => (c.companyName||c.name||"").toLowerCase().includes(coSearch.toLowerCase())) : allCos;

  return (
    <div style={{ padding:"24px", maxWidth:"1300px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"20px", gap:"10px", flexWrap:"wrap" }}>
        <div><h1 style={{ fontSize:"22px", fontWeight:800, color:"#0f172a", margin:0 }}>Employees</h1><p style={{ color:"#64748b", fontSize:"13.5px", margin:"4px 0 0" }}>Manage employees across companies</p></div>
        <div style={{ display:"flex", gap:"10px", flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employees…" style={{ padding:"8px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13px", outline:"none", width:"200px" }} />
          <button type="button" onClick={() => { setForm(emptyForm); setEditEmp(null); setFormErr(null); setShowCreate(true); }} style={{ padding:"8px 16px", background:"#2563eb", color:"#fff", border:"none", borderRadius:"8px", fontSize:"13px", fontWeight:700, cursor:"pointer" }}>+ Add User</button>
        </div>
      </div>

      {/* Searchable company dropdown */}
      <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0", padding:"12px 16px", marginBottom:"20px", display:"flex", alignItems:"center", gap:"12px", flexWrap:"wrap" }}>
        <span style={{ fontSize:"13px", fontWeight:700, color:"#374151", whiteSpace:"nowrap" }}>Company:</span>
        <div style={{ position:"relative", minWidth:"220px" }}>
          <button type="button" onClick={() => setCoDropOpen(o => !o)}
            style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"8px", padding:"7px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", background:"#f8fafc", fontSize:"13px", fontWeight:600, cursor:"pointer", color:"#374151" }}>
            <span>{selectedCo ? (selectedCo.companyName||selectedCo.name) : "Select Company"}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {coDropOpen && (
            <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, zIndex:9999, background:"#fff", border:"1px solid #e2e8f0", borderRadius:"10px", boxShadow:"0 8px 24px rgba(0,0,0,0.12)", minWidth:"220px", overflow:"hidden" }}>
              <div style={{ padding:"8px" }}>
                <input autoFocus value={coSearch} onChange={e=>setCoSearch(e.target.value)} placeholder="Search company…" style={{ width:"100%", padding:"7px 10px", borderRadius:"7px", border:"1px solid #e2e8f0", fontSize:"12.5px", boxSizing:"border-box" }} />
              </div>
              <div style={{ maxHeight:"200px", overflowY:"auto" }}>
                {filteredCos.length === 0 && <div style={{ padding:"12px", color:"#94a3b8", fontSize:"12px", textAlign:"center" }}>No companies found</div>}
                {filteredCos.map(c => (
                  <button key={c.id} type="button" onClick={() => { setSelCo(c.id); setCoDropOpen(false); setCoSearch(""); }}
                    style={{ width:"100%", display:"block", padding:"9px 14px", border:"none", background: selCo===c.id ? "#eff6ff" : "transparent", color: selCo===c.id ? "#2563eb" : "#374151", fontWeight: selCo===c.id ? 700 : 500, fontSize:"13px", cursor:"pointer", textAlign:"left" }}
                    onMouseEnter={e => { if(selCo!==c.id) e.currentTarget.style.background="#f8fafc"; }}
                    onMouseLeave={e => { if(selCo!==c.id) e.currentTarget.style.background="transparent"; }}>
                    {c.companyName||c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit modal */}
      {(showCreate || editEmp) && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }} onClick={e => { if(e.target===e.currentTarget){setShowCreate(false);setEditEmp(null);} }}>
          <div style={{ background:"#fff", borderRadius:"16px", padding:"28px", width:"500px", maxWidth:"95vw", boxShadow:"0 20px 60px rgba(0,0,0,0.18)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"20px" }}>
              <h3 style={{ margin:0, fontSize:"18px", fontWeight:800, color:"#0f172a" }}>{editEmp ? "Edit User" : "Add User"}</h3>
              <button type="button" onClick={() => { setShowCreate(false); setEditEmp(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:"22px", lineHeight:1 }}>✕</button>
            </div>
            {formErr && <div style={{ background:"#fee2e2", color:"#dc2626", borderRadius:"8px", padding:"8px 12px", fontSize:"12.5px", marginBottom:"12px", fontWeight:600 }}>{formErr}</div>}
            <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
              <div>
                <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Full Name <span style={{ color:"#dc2626" }}>*</span></label>
                <input value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})} placeholder="Full Name" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box" }} />
              </div>
              <div>
                <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Email <span style={{ color:"#dc2626" }}>*</span></label>
                <input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="email@example.com" type="email" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box" }} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Phone</label>
                  <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="Phone number" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Designation</label>
                  <input value={form.designation} onChange={e=>setForm({...form,designation:e.target.value})} placeholder="e.g. Manager" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box" }} />
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Role <span style={{ color:"#dc2626" }}>*</span></label>
                  <select value={form.role} onChange={e=>setForm({...form,role:e.target.value})} style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", background:"#fff" }}>
                    {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Status</label>
                  <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", background:"#fff" }}>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"12px" }}>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Username <span style={{ fontSize:"11px", color:"#94a3b8", fontWeight:400" }}>(for mobile login)</span></label>
                  <input value={form.username} onChange={e=>setForm({...form,username:e.target.value})} placeholder="Username" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box", background:"#f8fafc" }} />
                </div>
                <div>
                  <label style={{ fontSize:"12px", fontWeight:700, color:"#374151", display:"block", marginBottom:"5px" }}>Password {!editEmp && <span style={{ color:"#dc2626" }}>*</span>}</label>
                  <input value={form.password} onChange={e=>setForm({...form,password:e.target.value})} placeholder="••••••••" type="password" style={{ width:"100%", padding:"9px 12px", borderRadius:"8px", border:"1px solid #e2e8f0", fontSize:"13.5px", boxSizing:"border-box", background:"#f8fafc" }} />
                </div>
              </div>
            </div>
            <div style={{ display:"flex", gap:"10px", justifyContent:"flex-end", marginTop:"22px" }}>
              <button type="button" onClick={() => { setShowCreate(false); setEditEmp(null); }} style={{ padding:"9px 20px", borderRadius:"8px", border:"1px solid #e2e8f0", background:"#f8fafc", fontWeight:600, cursor:"pointer", fontSize:"13.5px" }}>Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ padding:"9px 20px", borderRadius:"8px", border:"none", background:"#2563eb", color:"#fff", fontWeight:700, cursor:"pointer", fontSize:"13.5px", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : editEmp ? "Save Changes" : "Add User"}</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding:"40px", textAlign:"center", color:"#94a3b8" }}>Loading employees…</div>
      ) : displayed.length === 0 ? (
        <div style={{ padding:"48px", textAlign:"center", color:"#94a3b8", background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0" }}>No employees found.</div>
      ) : (
        <div style={{ background:"#fff", borderRadius:"12px", border:"1px solid #e2e8f0", overflow:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13.5px" }}>
            <thead><tr style={{ background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
              {["#","Name","Email","Phone","Designation","Role","Status","Actions"].map(h=>(
                <th key={h} style={{ padding:"10px 14px", textAlign:"left", fontWeight:700, color:"#64748b", fontSize:"11px", textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {displayed.map((e,i) => (
                <tr key={e.id} style={{ borderBottom:"1px solid #f1f5f9" }}
                  onMouseEnter={ev => ev.currentTarget.style.background="#f8fafc"}
                  onMouseLeave={ev => ev.currentTarget.style.background=""}>
                  <td style={{ padding:"10px 14px", color:"#94a3b8", fontSize:"12px" }}>{i+1}</td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"9px" }}>
                      <div style={{ width:"32px", height:"32px", borderRadius:"50%", background:"#2563eb", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"12px", fontWeight:700, flexShrink:0 }}>{(e.fullName||"?")[0].toUpperCase()}</div>
                      <div><p style={{ margin:0, fontWeight:600, color:"#0f172a", fontSize:"13px" }}>{e.fullName}</p>{e.username && <p style={{ margin:0, fontSize:"11px", color:"#94a3b8" }}>{e.username}</p>}</div>
                    </div>
                  </td>
                  <td style={{ padding:"10px 14px", color:"#475569" }}>{e.email}</td>
                  <td style={{ padding:"10px 14px", color:"#475569" }}>{e.phone||"—"}</td>
                  <td style={{ padding:"10px 14px", color:"#475569" }}>{e.designation||"—"}</td>
                  <td style={{ padding:"10px 14px" }}><span style={{ background: roleColors[e.role]||"#f1f5f9", color: roleTextColors[e.role]||"#475569", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:700, textTransform:"capitalize" }}>{e.role}</span></td>
                  <td style={{ padding:"10px 14px" }}><span style={{ background: e.status==="Active"||e.status==="active" ? "#dcfce7":"#fee2e2", color: e.status==="Active"||e.status==="active" ? "#166534":"#dc2626", padding:"3px 10px", borderRadius:"20px", fontSize:"11px", fontWeight:700 }}>{e.status||"Active"}</span></td>
                  <td style={{ padding:"10px 14px" }}>
                    <div style={{ display:"flex", gap:"6px" }}>
                      <button type="button" onClick={() => { setEditEmp(e); setForm({ fullName:e.fullName||"", email:e.email||"", phone:e.phone||"", designation:e.designation||"", role:e.role||"employee", status:e.status||"Active", username:e.username||"", password:"" }); setFormErr(null); }} style={{ padding:"5px 10px", borderRadius:"6px", border:"1px solid #e2e8f0", background:"#f8fafc", color:"#475569", fontSize:"12px", cursor:"pointer", fontWeight:600 }}>Edit</button>
                      <button type="button" onClick={() => handleDelete(e.id)} style={{ padding:"5px 10px", borderRadius:"6px", border:"1px solid #fecaca", background:"#fff", color:"#dc2626", fontSize:"12px", cursor:"pointer", fontWeight:600 }}>Delete</button>
                    </div>
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

'''
        content = content[:fn_start] + new_fn + content[next_fn:]
        print("✓ AdminEmployeesSection replaced with new Add User form + searchable dropdown")

# ── 6. Make company portal sidebar narrower (CSS in styles.css will handle) ───
# Here just ensure no minWidth/maxWidth issues in aside
# The aside in CompanyPortal is CSS-based (.client-side-panel) - handled in styles.css

with open("CompanyPortal.jsx", "w", encoding="utf-8") as f:
    f.write(content)

if content != orig:
    print("✓ File saved")
else:
    print("No changes made")
