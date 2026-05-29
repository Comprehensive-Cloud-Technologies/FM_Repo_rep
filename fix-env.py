#!/usr/bin/env python3
import re

env_path = '/home/ec2-user/fmapp/backend/.env'
with open(env_path, 'r') as f:
    content = f.read()

# Add quotes around password value to prevent dotenv treating # as comment
content = re.sub(
    r'^(DB_PASSWORD=)(.+)$',
    lambda m: m.group(1) + '"' + m.group(2).strip() + '"',
    content,
    flags=re.MULTILINE
)

with open(env_path, 'w') as f:
    f.write(content)

print('Fixed .env:')
with open(env_path, 'r') as f:
    print(f.read())
