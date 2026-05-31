#!/usr/bin/env python3
"""Patch CompanyPortal.jsx for multiple fixes."""
import re, sys

with open("CompanyPortal.jsx", "r", encoding="utf-8") as f:
    content = f.read()

orig = content

# ── 1. Fix handleExport to export full asset list with all fields ─────────────
old_export = '''          const handleExport = (type) => {
            if (type === "asset_profile" && dashboardStats) {
              const ap = dashboardStats.assetProfile || {};
              const rows = [
                { Category: "Total Assets", Count: ap.total ?? dashboardStats.totalAssets ?? 0 },
                { Category: "Critical", Count: ap.critical ?? 0 },
                { Category: "Non-Critical", Count: ap.nonCritical ?? 0 },
                { Category: "RBER", Count: ap.rber ?? 0 },
                { Category: "Condemned", Count: ap.condemned ?? 0 },
                { Category: "New Addition", Count: ap.newAdditions ?? 0 },
              ];
              exportToCSV(rows, ["Category", "Count"], "asset_profile.csv");
            } else if (type === "complaint_profile" && dashboardStats) {
              const cp = dashboardStats.complaintProfile || {};
              const rows = [
                { Category: "Total Complaints", Count: cp.total ?? 0 },
                { Category: "Work In Progress", Count: cp.wip ?? 0 },
                { Category: "< 7 Days", Count: cp.lt7d ?? 0 },
                { Category: "> 7 Days", Count: cp.gt7d ?? 0 },
                { Category: "Resolved", Count: cp.resolved ?? 0 },
                { Category: "Closed", Count: cp.closed ?? 0 },
              ];
              exportToCSV(rows, ["Category", "Count"], "complaint_profile.csv");
            } else if (type === "companies" && byCompany.length > 0) {
              const rows = byCompany.map(c => ({ Company: c.companyName || "", Assets: c.assetCount ?? 0, Employees: c.employeeCount ?? 0 }));
              exportToCSV(rows, ["Company", "Assets", "Employees"], "companies_summary.csv");
            } else {
              // Export all
              const rows = [];
              if (dashboardStats) {
                rows.push({ Section: "Asset Profile", Category: "Total Assets", Count: dashboardStats.assetProfile?.total ?? dashboardStats.totalAssets ?? 0 });
                rows.push({ Section: "Asset Profile", Category: "Critical", Count: dashboardStats.assetProfile?.critical ?? 0 });
                rows.push({ Section: "Asset Profile", Category: "Non-Critical", Count: dashboardStats.assetProfile?.nonCritical ?? 0 });
                rows.push({ Section: "Asset Profile", Category: "RBER", Count: dashboardStats.assetProfile?.rber ?? 0 });
                rows.push({ Section: "Asset Profile", Category: "Condemned", Count: dashboardStats.assetProfile?.condemned ?? 0 });
                rows.push({ Section: "Complaint Profile", Category: "Total Complaints", Count: dashboardStats.complaintProfile?.total ?? 0 });
                rows.push({ Section: "Complaint Profile", Category: "Work In Progress", Count: dashboardStats.complaintProfile?.wip ?? 0 });
                rows.push({ Section: "Complaint Profile", Category: "< 7 Days", Count: dashboardStats.complaintProfile?.lt7d ?? 0 });
                rows.push({ Section: "Complaint Profile", Category: "> 7 Days", Count: dashboardStats.complaintProfile?.gt7d ?? 0 });
                rows.push({ Section: "Complaint Profile", Category: "Resolved", Count: dashboardStats.complaintProfile?.resolved ?? 0 });
                rows.push({ Section: "Complaint Profile", Category: "Closed", Count: dashboardStats.complaintProfile?.closed ?? 0 });
              }
              exportToCSV(rows, ["Section", "Category", "Count"], "client_dashboard.csv");
            }
          };'''

new_export = '''          const ASSET_HEADERS = ["Company","Department","Asset Name","Asset ID","Type","Status","Building","Floor","Room","Make","Model","Serial No","Accessories","Dealer","Mfg Year","Installation Date","Invoice No","Purchase Date","Purchase Cost","Remarks","Created At"];
          const assetRowMapper = a => ({
            "Company": a.companyName||"", "Department": a.departmentName||"",
            "Asset Name": a.assetName||"", "Asset ID": a.assetUniqueId||"",
            "Type": a.assetType||"", "Status": a.status||"",
            "Building": a.building||"", "Floor": a.floor||"", "Room": a.room||"",
            "Make": a.make||"", "Model": a.model||"", "Serial No": a.serialNo||"",
            "Accessories": a.accessories||"", "Dealer": a.dealer||"",
            "Mfg Year": a.mfgYear||"", "Installation Date": a.installationDate||"",
            "Invoice No": a.invoiceNo||"", "Purchase Date": a.purchaseDate||"",
            "Purchase Cost": a.purchaseCost||"", "Remarks": a.remarks||"",
            "Created At": a.createdAt ? new Date(a.createdAt).toLocaleDateString() : "",
          });

          const handleExport = async (type) => {
            const co = dashCompanyFilter || "";
            const coParam = co ? ("&companyId=" + co) : "";
            if (type === "asset_profile" || type === "critical" || type === "non_critical" || type === "rber" || type === "condemned" || type === "new_addition" || type === "total_assets") {
              const statusMap = { asset_profile: "", total_assets: "", critical: "critical", non_critical: "non_critical", rber: "rber", condemned: "condemned", new_addition: "new_addition" };
              const statusParam = statusMap[type] ? ("status=" + statusMap[type]) : "";
              const qs = [statusParam, coParam.slice(1)].filter(Boolean).join("&");
              try {
                const assets = await getClientAssets(token, qs);
                exportToCSV(assets.map(assetRowMapper), ASSET_HEADERS, (type === "asset_profile" || type === "total_assets" ? "all" : type) + "_assets.csv");
              } catch(e) { alert("Export failed: " + e.message); }
            } else if (type === "complaint_profile" && dashboardStats) {
              const cp = dashboardStats.complaintProfile || {};
              const rows = [
                { Category: "Total Complaints", Count: cp.total ?? 0 },
                { Category: "Work In Progress", Count: cp.wip ?? 0 },
                { Category: "< 7 Days", Count: cp.lt7d ?? 0 },
                { Category: "> 7 Days", Count: cp.gt7d ?? 0 },
                { Category: "Resolved", Count: cp.resolved ?? 0 },
                { Category: "Closed", Count: cp.closed ?? 0 },
              ];
              exportToCSV(rows, ["Category", "Count"], "complaint_profile.csv");
            } else if (type === "companies" && byCompany.length > 0) {
              const rows = byCompany.map(c => ({ Company: c.companyName || "", Assets: c.assetCount ?? 0, Employees: c.employeeCount ?? 0 }));
              exportToCSV(rows, ["Company", "Assets", "Employees"], "companies_summary.csv");
            } else {
              // Export all assets
              const qs = coParam ? coParam.slice(1) : "";
              try {
                const assets = await getClientAssets(token, qs);
                exportToCSV(assets.map(assetRowMapper), ASSET_HEADERS, "all_assets.csv");
              } catch(e) { alert("Export failed: " + e.message); }
            }
          };'''

if old_export in content:
    content = content.replace(old_export, new_export)
    print("✓ Export handler updated")
else:
    print("✗ Export handler NOT found")

# ── 2. Fix handleTileClick to navigate directly (asset tiles → assets, complaint → workorders) ────
old_tile = '''          const handleTileClick = (tileId) => {
            const assetTiles = ["total_assets","critical","non_critical","rber","condemned","new_addition"];
            const complaintTiles = ["total_complaint","wip","lt7d","gt7d","resolved","closed"];
            if (assetTiles.includes(tileId)) {
              setActiveTile(prev => prev === tileId ? null : tileId);
            } else if (complaintTiles.includes(tileId)) {
              setActiveTile(prev => prev === tileId ? null : tileId);
            }
          };'''

new_tile = '''          const handleTileClick = (tileId) => {
            const assetTiles = ["total_assets","critical","non_critical","rber","condemned","new_addition"];
            const complaintTiles = ["total_complaint","wip","lt7d","gt7d","resolved","closed"];
            if (assetTiles.includes(tileId)) {
              setActiveTile(tileId);
              setNav("assets");
              setTimeout(() => setActiveTile(null), 100);
            } else if (complaintTiles.includes(tileId)) {
              setActiveTile(tileId);
              setNav("workorders");
              setTimeout(() => setActiveTile(null), 100);
            }
          };'''

if old_tile in content:
    content = content.replace(old_tile, new_tile)
    print("✓ handleTileClick updated")
else:
    print("✗ handleTileClick NOT found")

# ── 3. Remove sidebar collapse toggle button ──────────────────────────────────
# Find the toggle button and remove it
old_toggle = '          <button className="client-toggle-btn" onClick={() => setSidebarCollapsed(c => !c)} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>'
if old_toggle in content:
    # Find the full button block
    idx = content.find(old_toggle)
    # Find the closing </button> after this
    end_idx = content.find("</button>", idx) + len("</button>")
    content = content[:idx] + content[end_idx:]
    print("✓ Sidebar toggle button removed")
else:
    print("✗ Sidebar toggle button NOT found, trying alternate search")
    idx = content.find("client-toggle-btn")
    if idx >= 0:
        # find the enclosing button start
        start = content.rfind("<button", 0, idx)
        end = content.find("</button>", idx) + len("</button>")
        content = content[:start] + content[end:]
        print("✓ Sidebar toggle button removed (alternate)")
    else:
        print("✗ Sidebar toggle button still NOT found")

# ── 4. Remove sidebarCollapsed from aside class (keep hover only) ─────────────
old_aside_class = 'className={`client-side-panel${(sidebarCollapsed && !sidebarHovered) ? " collapsed" : ""}`}'
new_aside_class = 'className={`client-side-panel${!sidebarHovered ? " collapsed" : ""}`}'
if old_aside_class in content:
    content = content.replace(old_aside_class, new_aside_class)
    print("✓ Aside class updated for hover-only expand")
else:
    print("✗ Aside class NOT found")

with open("CompanyPortal.jsx", "w", encoding="utf-8") as f:
    f.write(content)

if content != orig:
    print("✓ File saved")
else:
    print("No changes made")
