content = open('CompanyPortal.jsx', encoding='utf-8').read()

# Reduce Add Asset button padding in assets section
old1 = 'padding: "8px 16px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: companies.length ? "pointer" : "not-allowed", border: "none", background: companies.length ? "#2563eb" : "#94a3b8"'
new1 = 'padding: "6px 13px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: companies.length ? "pointer" : "not-allowed", border: "none", background: companies.length ? "#2563eb" : "#94a3b8"'
if old1 in content:
    content = content.replace(old1, new1, 1)
    print('Add Asset button resized')
else:
    print('Add Asset button not found')

# Reduce Import Excel button
old2 = 'padding: "8px 16px", borderRadius: "8px", fontSize: "13.5px", fontWeight: 600, cursor: companies.length ? "pointer" : "not-allowed", border: "1.5px solid #2563eb"'
new2 = 'padding: "6px 13px", borderRadius: "8px", fontSize: "12px", fontWeight: 600, cursor: companies.length ? "pointer" : "not-allowed", border: "1.5px solid #2563eb"'
if old2 in content:
    content = content.replace(old2, new2, 1)
    print('Import button resized')
else:
    print('Import button not found')

open('CompanyPortal.jsx', 'w', encoding='utf-8').write(content)
print('Saved')
