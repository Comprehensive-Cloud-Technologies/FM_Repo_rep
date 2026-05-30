"""
Comprehensive dashboard rewrite:
1. Remove header: Refresh, Add Company, summary text
2. Add Export All dropdown button
3. Clickable tiles → drill-down with asset/complaint detail
4. Add Pie + Bar charts
5. Remove companies grid + recent submissions
"""
import re

content = open('CompanyPortal.jsx', encoding='utf-8').read()
lines = content.splitlines(True)

# Find dashboard section start (the nav==="dashboard" IIFE)
dash_start = None
for i, l in enumerate(lines):
    if 'nav === "dashboard" && (() => {' in l:
        dash_start = i
        break

# Find the end - look for })()}  at the same indent level
# The dashboard section ends with })()}  before the next major section
dash_end = None
for i, l in enumerate(lines[dash_start+5000:], dash_start+5000):
    stripped = l.strip()
    if stripped == '})()}' or stripped.startswith('})()}'):
        dash_end = i
        break

print(f"Dashboard: lines {dash_start+1} to {dash_end+1}")
print("End line:", repr(lines[dash_end]))
print("Line after:", repr(lines[dash_end+1] if dash_end+1 < len(lines) else "EOF"))
