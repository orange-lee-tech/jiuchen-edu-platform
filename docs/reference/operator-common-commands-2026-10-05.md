# Jiuchen Operator Common Commands — 2026-10-05

Purpose: copy/paste reference for the commands repeatedly needed during Jiuchen
development, ECS production diagnosis and Assessment AI operations.

Repository: `orange-lee-tech/jiuchen-edu-platform`  
Integration branch: `p1/foundation`

This document intentionally contains **no secrets**.

## Safety rules before using any command

- Never paste API keys, database passwords, WeChat secrets, Tencent CAM secrets, SSH
  private keys or passphrases into chat, Git or terminal history.
- Never `echo` a secret merely to check whether it exists.
- Production env is `/etc/jiuchen-api/production.env`, root-owned mode `0600`.
- Do not touch Nginx Proxy Manager, Harbor, Portainer, Docker networks, ports
  80/443/8088 or `/www/wwwroot/jiuchen-current` during routine Jiuchen API work.
- Do not manually rewrite `/opt/jiuchen-api/current`; use the controlled release
  workflow.
- A passing `assessmentAiConfigured=true` only proves values are present. It does
  not prove the provider credential works.

Placeholders such as `<ECS_HOST>`, `<assessment-id>` and `<key-file>` must be
replaced locally.

---

## 1. Local Windows PowerShell — enter the repository

```powershell
Set-Location "C:\Users\yulia\Desktop\jiuchen-edu-platform"
```

Show current branch and working tree:

```powershell
git status --short --branch
```

Show exact HEAD:

```powershell
git rev-parse HEAD
```

Update the shared integration branch without creating a merge commit:

```powershell
git switch p1/foundation
git pull --ff-only origin p1/foundation
```

Recent commits:

```powershell
git log --oneline -10
```

On this Windows machine prefer `npm.cmd` when PowerShell policy interferes with
`npm.ps1`:

```powershell
npm.cmd --prefix services/api test
npm.cmd --prefix services/api run build
npm.cmd --prefix services/api run typecheck
```

---

## 2. SSH to ECS

If SSH config/key selection is already configured:

```powershell
ssh root@<ECS_HOST>
```

If an explicit key is required:

```powershell
ssh -i "$env:USERPROFILE\.ssh\<key-file>" root@<ECS_HOST>
```

Never print or paste the private key into the terminal.

---

## 3. Production service and active release

Service state:

```bash
systemctl is-active jiuchen-api.service
systemctl status jiuchen-api.service --no-pager
```

Current immutable release:

```bash
readlink -f /opt/jiuchen-api/current
```

Current release SHA only:

```bash
basename "$(readlink -f /opt/jiuchen-api/current)"
```

Service unit source:

```bash
systemctl show -p FragmentPath jiuchen-api.service
```

Resource contract:

```bash
systemctl show jiuchen-api.service -p MemoryMax -p CPUQuotaPerSecUSec -p TasksMax -p Restart
```

Listener:

```bash
ss -lntp | grep ':3100'
```

---

## 4. Public health checks

Liveness:

```bash
curl -fsS https://api.jiuchenedu.com/health/live; echo
```

Database/readiness:

```bash
curl -fsS https://api.jiuchenedu.com/health; echo
```

Non-secret configuration presence:

```bash
curl -fsS https://api.jiuchenedu.com/health/config; echo
```

Assessment metadata:

```bash
curl -fsS https://api.jiuchenedu.com/assessments/meta; echo
```

Interpretation:

- `/health/live=200` -> process is answering;
- `/health` -> includes database readiness;
- `assessmentAiConfigured=true` -> config values exist only;
- `providerConfigured=true` -> provider object has required values only;
- neither config flag substitutes for a real provider probe.

---

## 5. Recent production logs

Last 100 lines:

```bash
journalctl -u jiuchen-api.service -n 100 --no-pager
```

Last 15 minutes:

```bash
journalctl -u jiuchen-api.service --since "15 minutes ago" --no-pager
```

Find one Assessment request:

```bash
journalctl -u jiuchen-api.service --since "30 minutes ago" --no-pager | grep -C 12 '<assessment-id>'
```

Look only for Assessment/provider failures:

```bash
journalctl -u jiuchen-api.service --since "30 minutes ago" --no-pager | grep -E 'Assessment execution failed|ai_provider_|assessment_case_data|JsonModelProvider'
```

Check for malformed environment assignments after a restart:

```bash
journalctl -u jiuchen-api.service -n 80 --no-pager | grep -F 'Ignoring invalid environment assignment'
```

---

## 6. Safe production env inspection

File ownership and mode:

```bash
stat -c '%U:%G %a %n' /etc/jiuchen-api/production.env
```

Expected:

```text
root:root 600 /etc/jiuchen-api/production.env
```

Show only non-secret Assessment fields:

```bash
grep -E '^(NODE_ENV|ASSESSMENT_AI_PROVIDER|ASSESSMENT_AI_BASE_URL|ASSESSMENT_AI_MODEL|ASSESSMENT_AI_TEMPERATURE|ASSESSMENT_AI_JSON_MODE|ASSESSMENT_AI_RESPONSE_FORMAT|ASSESSMENT_AI_EXTRA_BODY_JSON|ASSESSMENT_CASE_DATA_ROOT)=' /etc/jiuchen-api/production.env
```

Current production baseline:

```text
NODE_ENV=production
ASSESSMENT_AI_PROVIDER=qianwen-maas
ASSESSMENT_AI_BASE_URL=https://maas.qianwenaiapi.com/compatible-mode/v1
ASSESSMENT_AI_MODEL=qwen3.8-flash
ASSESSMENT_AI_TEMPERATURE=0
ASSESSMENT_AI_JSON_MODE=true
ASSESSMENT_AI_RESPONSE_FORMAT=json_schema
ASSESSMENT_AI_EXTRA_BODY_JSON={"enable_thinking":false}
ASSESSMENT_CASE_DATA_ROOT=/opt/jiuchen-api/shared/cases
```

Check API key presence and length without printing it:

```bash
awk -F= '/^ASSESSMENT_AI_API_KEY=/{print "KEY_PRESENT=true"; print "KEY_LENGTH=" length(substr($0,index($0,"=")+1))}' /etc/jiuchen-api/production.env
```

Do **not** use:

```bash
echo "$ASSESSMENT_AI_API_KEY"
cat /etc/jiuchen-api/production.env
```

in shared logs/screenshots.

---

## 7. Back up production env before an edit

```bash
cp -a /etc/jiuchen-api/production.env /etc/jiuchen-api/production.env.bak-$(date +%Y%m%d-%H%M%S)
```

After editing, always run:

```bash
grep -nE 'NODE_ENV|ASSESSMENT_AI_PROVIDER|ASSESSMENT_CASE_DATA_ROOT' /etc/jiuchen-api/production.env
```

This catches accidental concatenation such as a malformed `NODE_ENV` line before a
restart.

---

## 8. Verify the production RAG corpus

Expected root:

```text
/opt/jiuchen-api/shared/cases
```

Expected production file:

```text
/opt/jiuchen-api/shared/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl
```

Readable check:

```bash
test -r /opt/jiuchen-api/shared/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl && echo RAG_PROD_OK || echo RAG_PROD_MISSING
```

Count rows:

```bash
wc -l /opt/jiuchen-api/shared/cases/ai/rag/v1.0.0/rag_reference_production_all.jsonl
```

The accepted 2026-10-04/05 snapshot contained 748 production case rows. Future
approved corpus versions may legitimately differ.

Locate the corpus if the configured path is uncertain:

```bash
find /opt/jiuchen-api /opt/jiuchen-api-smoke /root -type f -name 'rag_reference_production_all.jsonl' 2>/dev/null
```

---

## 9. Confirm what the running process actually received

After restart:

```bash
PID=$(systemctl show -p MainPID --value jiuchen-api.service); tr '\0' '\n' < /proc/$PID/environ | grep -E '^(NODE_ENV|ASSESSMENT_CASE_DATA_ROOT|ASSESSMENT_AI_PROVIDER|ASSESSMENT_AI_BASE_URL|ASSESSMENT_AI_MODEL|ASSESSMENT_AI_RESPONSE_FORMAT|ASSESSMENT_AI_EXTRA_BODY_JSON)='
```

This is more authoritative than merely inspecting the env file.

Never include `ASSESSMENT_AI_API_KEY` in this grep.

---

## 10. Windows PowerShell — temporarily load the Assessment API key

Use an interactive secure prompt so the key is not written literally into the command
line:

```powershell
$sec = Read-Host "请输入 Assessment API Key" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
    $env:ASSESSMENT_AI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}
```

Load the non-secret baseline:

```powershell
$env:ASSESSMENT_AI_PROVIDER = "qianwen-maas"
$env:ASSESSMENT_AI_BASE_URL = "https://maas.qianwenaiapi.com/compatible-mode/v1"
$env:ASSESSMENT_AI_MODEL = "qwen3.8-flash"
$env:ASSESSMENT_AI_TEMPERATURE = "0"
$env:ASSESSMENT_AI_JSON_MODE = "true"
$env:ASSESSMENT_AI_RESPONSE_FORMAT = "json_schema"
$env:ASSESSMENT_AI_EXTRA_BODY_JSON = '{"enable_thinking":false}'
```

Presence check only:

```powershell
Write-Host "KEY PRESENT:" ([bool]$env:ASSESSMENT_AI_API_KEY)
Write-Host "KEY LENGTH:" $env:ASSESSMENT_AI_API_KEY.Trim().Length
Write-Host "BASE URL:" $env:ASSESSMENT_AI_BASE_URL
Write-Host "MODEL:" $env:ASSESSMENT_AI_MODEL
```

Clear the key from the current PowerShell process when finished:

```powershell
Remove-Item Env:ASSESSMENT_AI_API_KEY -ErrorAction SilentlyContinue
```

---

## 11. Minimal local/ECS provider probe

Use this before a full Assessment run when credentials or API host have changed.

The probe must test the same important production contract:

- `qwen3.8-flash`;
- non-thinking;
- temperature 0;
- strict `json_schema`;
- tiny output.

On ECS, read the key from the root-only env file without printing it:

```bash
node - <<'NODE'
const fs = require('node:fs')
const text = fs.readFileSync('/etc/jiuchen-api/production.env', 'utf8')

function readEnv(name) {
  const match = text.match(new RegExp('^' + name + '=(.*)$', 'm'))
  if (!match) throw new Error('missing ' + name)
  let value = match[1].trim()
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return value
}

const base = readEnv('ASSESSMENT_AI_BASE_URL').replace(/\/+$/, '')
const key = readEnv('ASSESSMENT_AI_API_KEY')
const model = readEnv('ASSESSMENT_AI_MODEL')

const response = await fetch(base + '/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + key,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model,
    messages: [{ role: 'user', content: '返回一个JSON对象，字段ok的值为PASS。' }],
    temperature: 0,
    max_tokens: 32,
    stream: false,
    enable_thinking: false,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'jiuchen_provider_probe',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'string' } },
          required: ['ok'],
        },
      },
    },
  }),
})

console.log('HTTP:', response.status)
const body = await response.text()

if (response.ok) {
  const parsed = JSON.parse(body)
  console.log('MODEL:', parsed.model || model)
  console.log('CONTENT:', parsed.choices?.[0]?.message?.content || '')
} else {
  console.log('ERROR:', body.slice(0, 500))
  process.exitCode = 1
}
NODE
```

Required gate before restart/deploy when provider configuration changed:

```text
HTTP: 200
```

---

## 12. Full local Assessment smoke

From the repository root after all required local env variables are loaded:

```powershell
npm.cmd --prefix services/api run assessment:smoke:live
```

Do not run this repeatedly when a tiny provider probe already fails. Fix authentication,
host or configuration first.

---

## 13. Restart only the Jiuchen API

Only after the env/provider/RAG preflight passes:

```bash
systemctl restart jiuchen-api.service
systemctl is-active jiuchen-api.service
```

Then verify:

```bash
curl -fsS https://api.jiuchenedu.com/health/live; echo
curl -fsS https://api.jiuchenedu.com/health; echo
curl -fsS https://api.jiuchenedu.com/health/config; echo
curl -fsS https://api.jiuchenedu.com/assessments/meta; echo
```

If `/health` alone returns a database timeout while other routes recover, capture
logs and retest deliberately; do not immediately rewrite unrelated configuration.

---

## 14. Assessment real-device debugging shortcut

When WeChat DevTools reports:

```text
POST /me/assessments/<id>/run 502
```

do not guess from the mini-program console. Copy the Assessment ID and run:

```bash
journalctl -u jiuchen-api.service --since "15 minutes ago" --no-pager | grep -C 12 '<assessment-id>'
```

Common interpretations:

- `ai_provider_http_401` -> credential/API-host/provider pairing problem;
- `assessment_case_data_unavailable` + eval-safe filename -> verify
  `NODE_ENV=production`;
- production corpus ENOENT -> verify `ASSESSMENT_CASE_DATA_ROOT` and shared file;
- later `PUT ... 409` after a failed run -> old Assessment row is no longer an
  editable draft; create a fresh Assessment for the next test.

---

## 15. Controlled release discipline

Production layout:

```text
/opt/jiuchen-api/releases/<SHA>
/opt/jiuchen-api/current
/opt/jiuchen-api/shared
```

Promotion is controlled by:

```text
/usr/local/sbin/jiuchen-promote
```

The promote script requires an approved release and `staging/READY`, validates
ownership/permissions, validates runtime readability as the `jiuchen-api` service
user, switches `current`, restarts only the API, performs bounded health checks and
reverts on failure.

Do not replace that mechanism with:

```bash
ln -sfn ... /opt/jiuchen-api/current
```

or manual in-place edits of an immutable release.

Current production snapshot as of this document:

```text
active:   8e5a0ffe7869cd3f6ec8c0a8a876247798b65519
rollback: e4aa5c12a3e905ad1dba55ac92a26609bb171259
```

Always re-read `current` before acting because these values will become historical.

---

## 16. Commands that are deliberately not part of the normal toolbox

Do not normalize or casually use:

```text
docker system prune
npm install -g ...
curl ... | bash
rm -rf <broad path>
manual current symlink rewrites
production schema writes without explicit approval
echo/print of API keys or other secrets
firewall / iptables / nftables changes
Nginx Proxy Manager / Harbor / Portainer restarts
```

The full host guardrails remain in:

```text
ops/ecs/AGENTS.md
```

---

## 17. Fast incident checklist

When production Assessment breaks, use this order:

```text
1. /health/live
2. /health
3. /health/config
4. /assessments/meta
5. journalctl for the exact Assessment ID
6. inspect actual process env (non-secret fields)
7. verify NODE_ENV=production
8. verify shared production RAG is readable
9. provider probe
10. only then restart/retest with a fresh Assessment row
```

This order is designed to avoid repeating the 2026-10-05 incident pattern: guessing
from config-presence flags, changing multiple layers at once, or treating the
downstream 409 as the original failure.
