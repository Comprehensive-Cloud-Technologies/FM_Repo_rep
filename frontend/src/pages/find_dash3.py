"""Find dashboard section end"""
content = open('CompanyPortal.jsx', encoding='utf-8').read()
lines = content.splitlines(True)

# Find dashboard section start
dash_start = None
for i, l in enumerate(lines):
    if 'nav === "dashboard" && (() => {' in l:
        dash_start = i
        break

print(f"Dashboard start: line {dash_start+1}")

# Search from 1000 lines after start for the closing pattern
for i, l in enumerate(lines[dash_start+1000:], dash_start+1000):
    stripped = l.strip()
    if '})()}' in stripped:
        print(f"Candidate end: line {i+1}: {repr(l[:80])}")
        # Check if it's at the same indent level
        spaces = len(l) - len(l.lstrip())
        print(f"  indent: {spaces}")
        break
