"""Rewrite sidebar aside section"""
content = open('CompanyPortal.jsx', encoding='utf-8').read()

aside_start = content.find('<aside className="client-side-panel">')
aside_end = content.find('</aside>', aside_start) + len('</aside>')
old_aside = content[aside_start:aside_end]

NEW_ASIDE = '''<aside className={`client-side-panel${sidebarCollapsed ? " collapsed" : ""}`}>

        <div className="client-side-header">
          <div className="client-avatar">CP</div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div className="client-side-title">Client Portal</div>
            <div className="client-side-sub">Manage companies</div>
          </div>
          {/* Notification bell */}
          <div style={{ position: "relative", marginLeft: "2px", flexShrink: 0 }}>
            <button onClick={() => setBellOpen((o) => !o)} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px", borderRadius: "6px", position: "relative", display: "flex", alignItems: "center" }} title="Warnings">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              {warnOpenCount > 0 && <span style={{ position: "absolute", top: "-2px", right: "-2px", background: "#dc2626", color: "#fff", borderRadius: "50%", fontSize: "9px", fontWeight: 800, width: "15px", height: "15px", display: "flex", alignItems: "center", justifyContent: "center" }}>{warnOpenCount > 99 ? "99+" : warnOpenCount}</span>}
            </button>
            {/* Bell dropdown */}
            {bellOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "300px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.12)", zIndex: 9999, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: "13px", color: "#0f172a" }}>⚠️ Active Warnings</span>
                  <button onClick={() => { setBellOpen(false); setNav("warnings"); setShowAddForm(false); }} style={{ background: "none", border: "none", color: "#2563eb", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>View all →</button>
                </div>
                {recentAlerts.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>No open warnings</div>}
                {recentAlerts.map((a) => {
                  const sevColor = { critical: "#dc2626", high: "#ea580c", medium: "#d97706", low: "#16a34a" }[a.severity] || "#475569";
                  const sevBg    = { critical: "#fee2e2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4" }[a.severity] || "#f8fafc";
                  return (
                    <div key={a.id} style={{ padding: "10px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer" }} onClick={() => { setBellOpen(false); setNav("warnings"); setShowAddForm(false); }} onMouseEnter={e => e.currentTarget.style.background="#f8fafc"} onMouseLeave={e => e.currentTarget.style.background=""}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ background: sevBg, color: sevColor, fontSize: "10px", fontWeight: 800, padding: "2px 7px", borderRadius: "10px", textTransform: "uppercase" }}>{a.severity}</span>
                        <span style={{ fontWeight: 600, fontSize: "12px", color: "#0f172a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.assetName || "Unknown asset"}</span>
                      </div>
                      <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.description || "No description"}</div>
                    </div>
                  );
                })}
                {warnOpenCount > 5 && <div style={{ padding: "10px 16px", textAlign: "center", borderTop: "1px solid #f1f5f9" }}><button onClick={() => { setBellOpen(false); setNav("warnings"); setShowAddForm(false); }} style={{ background: "none", border: "none", color: "#2563eb", fontWeight: 700, fontSize: "12px", cursor: "pointer" }}>+{warnOpenCount - recentAlerts.length} more — View all</button></div>}
                <div style={{ borderTop: "1px solid #f1f5f9", padding: "8px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>Alert sounds</span>
                  <div style={{ display: "flex", gap: "5px" }}>
                    <button className={`fm-alarm-gear${alarmSettingsOpen ? " fm-open" : ""}`} onClick={() => setAlarmSettingsOpen(v => !v)} title="Alarm settings">⚙</button>
                    <button className={`fm-sound-toggle ${soundEnabled ? "fm-enabled" : "fm-muted"}`} onClick={toggleSound}>{soundEnabled ? "🔊 On" : "🔇 Off"}</button>
                  </div>
                </div>
                {alarmSettingsOpen && (
                  <div className="fm-alarm-settings">
                    <h4>Alarm Settings</h4>
                    <div className="fm-alarm-vol-row"><span>Volume</span><strong>{Math.round(alarmVolume * 100)}%</strong></div>
                    <input type="range" min="0" max="1" step="0.05" value={alarmVolume} onChange={e => updateAlarmVolume(parseFloat(e.target.value))} className="fm-vol-slider" />
                    <div className="fm-sev-section-label">Sound per severity</div>
                    {[{ key: "critical", label: "Critical", color: "#dc2626", bg: "#fee2e2" }, { key: "high", label: "High", color: "#ea580c", bg: "#fff7ed" }, { key: "medium", label: "Medium", color: "#d97706", bg: "#fefce8" }, { key: "low", label: "Low", color: "#16a34a", bg: "#f0fdf4" }, { key: "info", label: "Info", color: "#2563eb", bg: "#eff6ff" }].map(({ key, label, color, bg }) => {
                      const isOn = alarmSevConfig[key] !== false;
                      return (
                        <div key={key} className="fm-sev-row">
                          <span className="fm-sev-badge" style={{ background: bg, color }}>{label}</span>
                          <div className="fm-sev-actions">
                            <button className="fm-preview-btn" title={`Preview ${label}`} onClick={() => previewAlertSound(key)}>▶ Test</button>
                            <button className={`fm-sev-toggle ${isOn ? "on" : "off"}`} onClick={() => updateAlarmSevConfig(key, !isOn)}>{isOn ? "ON" : "OFF"}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
          <button className="client-toggle-btn" onClick={() => setSidebarCollapsed(c => !c)} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {sidebarCollapsed
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            }
          </button>
        </div>

        <nav className="client-side-nav">
          {/* Overview */}
          <div className="nav-group-label">Overview</div>
          <button className={nav === "dashboard" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("dashboard"); setShowAddForm(false); }} title="Dashboard">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
            <span className="nav-label">Dashboard</span>
          </button>

          {/* Management */}
          <div className="nav-group-label">Management</div>
          <button className={nav === "companies" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("companies"); setShowAddForm(false); }} title="Companies">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18"/><path d="M9 8h1"/><path d="M9 12h1"/><path d="M9 16h1"/><path d="M14 8h1"/><path d="M14 12h1"/><path d="M14 16h1"/><path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"/></svg>
            <span className="nav-label">Companies</span>
          </button>
          <button className={nav === "employees" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("employees"); setShowAddForm(false); }} title="Employees">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span className="nav-label">Employees</span>
          </button>
          <button className={nav === "departments" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("departments"); setShowAddForm(false); }} title="Departments">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="6" height="6" rx="1"/><rect x="9" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><path d="M5 9v3M12 9v3M19 9v3"/><rect x="5" y="15" width="14" height="6" rx="1"/></svg>
            <span className="nav-label">Departments</span>
          </button>

          {/* Operations */}
          <div className="nav-group-label">Operations</div>
          <button className={nav === "assets" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("assets"); setShowAddForm(false); }} title="Assets">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
            <span className="nav-label">Assets</span>
          </button>
          <button className={nav === "checklists" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("checklists"); setShowAddForm(false); }} title="Checklists">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            <span className="nav-label">Checklists</span>
          </button>
          <button className={nav === "logsheets" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("logsheets"); setShowAddForm(false); }} title="Logsheets">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            <span className="nav-label">Logsheets</span>
          </button>
          <button className={nav === "workorders" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("workorders"); setShowAddForm(false); }} title="Requests">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span className="nav-label">Requests</span>
          </button>

          {/* Analytics */}
          <div className="nav-group-label">Analytics</div>
          <button className={nav === "reports" ? "client-side-item active" : "client-side-item"} onClick={() => { setNav("reports"); setShowAddForm(false); }} title="Reports">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><polyline points="6 14 12 4 18 10"/></svg>
            <span className="nav-label">Reports</span>
          </button>
        </nav>

        <div className="client-side-footer">
          <button className="client-side-item" disabled title="Settings">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>
            <span className="nav-label">Settings</span>
          </button>
          <button className="client-side-item" onClick={handleLogout} title="Logout">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span className="nav-label">Logout</span>
          </button>
        </div>

      </aside>'''

new_content = content[:aside_start] + NEW_ASIDE + content[aside_end:]
open('CompanyPortal.jsx', 'w', encoding='utf-8').write(new_content)
print(f"Done. Lines: {len(new_content.splitlines())}")
