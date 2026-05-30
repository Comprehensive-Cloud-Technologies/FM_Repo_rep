"""Replace the entire dashboard section in CompanyPortal.jsx"""
content = open('CompanyPortal.jsx', encoding='utf-8').read()
lines = content.splitlines(True)

# Find dashboard start
dash_start = None
for i, l in enumerate(lines):
    if 'nav === "dashboard" && (() => {' in l:
        dash_start = i
        break

# Find end (the })()}  after 1000+ lines)
dash_end = None
for i, l in enumerate(lines[dash_start+1000:], dash_start+1000):
    if '})()}' in l.strip() and l.strip().startswith('})()}'):
        dash_end = i
        break

print(f"Dashboard section: lines {dash_start+1} to {dash_end+1}")

# Read the new dashboard code
new_dash = open('new_dashboard.txt', encoding='utf-8').read()

# Build new content: everything before + new dashboard + everything after
before = ''.join(lines[:dash_start])
after = ''.join(lines[dash_end+1:])

new_content = before + new_dash + '\n' + after
open('CompanyPortal.jsx', 'w', encoding='utf-8').write(new_content)
print(f"Done. Lines: {len(new_content.splitlines())}")
