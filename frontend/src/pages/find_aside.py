"""Rewrite the sidebar aside section in CompanyPortal.jsx"""
content = open('CompanyPortal.jsx', encoding='utf-8').read()

# Find the aside start
aside_start = content.find('<aside className="client-side-panel">')
# Find the </aside>
aside_end = content.find('</aside>', aside_start) + len('</aside>')

print(f"Aside found: chars {aside_start}-{aside_end}")
print(f"Length: {aside_end - aside_start}")
print("First 200 chars:", repr(content[aside_start:aside_start+200]))
print("Last 200 chars:", repr(content[aside_end-200:aside_end]))
