#!/usr/bin/env python3
import re

nginx_conf = '/etc/nginx/nginx.conf'
with open(nginx_conf, 'r') as f:
    content = f.read()

# Comment out the default server block (listen 80 server_name _)
# Replace the server block that serves /usr/share/nginx/html
content = content.replace(
    '    server {\n        listen       80;\n        listen       [::]:80;\n        server_name  _;\n        root         /usr/share/nginx/html;',
    '    # server block disabled - fmapp.conf handles port 80\n    # server {\n    #     listen       80;\n    #     listen       [::]:80;\n    #     server_name  _;\n    #     root         /usr/share/nginx/html;'
)

# Also comment out the closing of that block
# Find and comment everything between the markers
import re
pattern = r'(    # server block disabled.*?root.*?/usr/share/nginx/html;)(.*?)(    })'

def comment_block(m):
    # Get the inner content and comment each line
    inner = m.group(2)
    commented = '\n'.join('    # ' + line.strip() if line.strip() else '' for line in inner.split('\n'))
    return m.group(1) + commented + '\n    # }'

content = re.sub(pattern, comment_block, content, flags=re.DOTALL)

with open(nginx_conf, 'w') as f:
    f.write(content)

print('nginx.conf updated')
