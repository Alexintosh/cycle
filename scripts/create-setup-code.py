#!/usr/bin/env python3
"""Create an expiring setup code for an existing, passkey-less account. Requires operator Wrangler access."""
import argparse, hashlib, json, os, pathlib, secrets, subprocess, tempfile
ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('email')
parser.add_argument('--output', type=pathlib.Path, required=True)
args = parser.parse_args()
email = args.email.strip().lower()
output = args.output.resolve()
if output.exists():
    raise SystemExit('Output already exists; choose a new private path.')
def execute(sql=None, file=None):
    command = ['bunx','wrangler','d1','execute','DB','--remote','--json']
    command += ['--command',sql] if sql is not None else ['--file',str(file)]
    env = dict(os.environ, WRANGLER_LOG_PATH='/private/tmp/cycle-wrangler.log')
    raw = subprocess.check_output(command, cwd=ROOT/'apps/backend', env=env, text=True)
    result = json.loads(raw if raw.lstrip().startswith("[") else raw[raw.index("\n[")+1:])
    if not all(item['success'] for item in result): raise SystemExit('D1 request failed.')
    return result
literal = "'" + email.replace("'", "''") + "'"
result = execute('SELECT id, (SELECT COUNT(*) FROM passkeys WHERE user_id=users.id) AS passkeys FROM users WHERE email='+literal)
rows = result[0]['results']
if len(rows) != 1 or rows[0]['passkeys'] != 0:
    raise SystemExit('Setup requires exactly one existing account with no registered passkeys.')
user_id = rows[0]['id']
code = secrets.token_hex(16)
formatted = '-'.join(code[i:i+8] for i in range(0,len(code),8))
hash_value = hashlib.sha256((email+':'+code).encode()).hexdigest()
output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
# Save the code before submitting; if the request fails, the operator can inspect D1 before retrying.
with open(output, 'x', opener=lambda path, flags: os.open(path,flags,0o600)) as file:
    file.write('Cycle account setup\nEmail: '+email+'\nCode: '+formatted+'\n\nExpires in 24 hours. Open https://cycle.alexintosh.com/login, choose Recover / set up account, enter email and code, then create a passkey. Save the new recovery codes. Keep this file private.\n')
with tempfile.TemporaryDirectory() as directory:
    sqlfile = pathlib.Path(directory)/'setup.sql'
    sqlfile.write_text("INSERT INTO recovery_codes(hash,user_id,expires_at) SELECT '"+hash_value+"', id, unixepoch()+86400 FROM users WHERE email="+literal+" AND NOT EXISTS(SELECT 1 FROM passkeys WHERE user_id=users.id);\n")
    result = execute(file=sqlfile)
verified = execute("SELECT COUNT(*) AS count FROM recovery_codes WHERE hash='"+hash_value+"' AND user_id='"+user_id.replace("'","''")+"' AND expires_at > unixepoch()")
if verified[0]['results'][0]['count'] != 1: raise SystemExit('Setup code was not created; inspect the account before retrying.')
print('Private setup code saved to '+str(output))
