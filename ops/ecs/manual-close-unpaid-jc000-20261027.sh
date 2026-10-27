#!/usr/bin/env bash
# Run on the Jiuchen ECS through the existing interactive root SSH session.
set -Eeuo pipefail
umask 077
[[ ${1:-} == --preflight || ${1:-} == --apply ]] || { echo 'BLOCKED=usage'; exit 2; }
[[ $(id -u) == 0 ]] || { echo 'BLOCKED=root_required'; exit 1; }
base=/opt/jiuchen-api
current=$(readlink -f "$base/current")
[[ "$current" == "$base/releases/985be8c75e2e1254761ab7c914975f5dac77cf83" ]] || {
  echo 'BLOCKED=unexpected_api_release'; exit 1;
}
[[ $(systemctl is-active jiuchen-api.service) == active ]] || { echo 'BLOCKED=api_inactive'; exit 1; }
pid=$(systemctl show jiuchen-api.service -p MainPID --value)
node="$base/runtime/node/bin/node"
api="$current/services/api"
script="$base/staging/manual-close-unpaid-jc000-20261027.cjs"
[[ "$pid" =~ ^[1-9][0-9]*$ && -r "/proc/$pid/environ" && -x "$node" &&
   -f "$api/node_modules/mysql2/promise.js" && -f "$script" ]] || {
  echo 'BLOCKED=runtime_missing'; exit 1;
}
[[ ${1:-} != --apply || ${2:-} =~ ^[a-f0-9]{16}$ ]] || { echo 'BLOCKED=fingerprint_required'; exit 2; }
python3 - "$pid" "$node" "$api" "$script" "$@" <<'PY'
import os, sys
pid, node, api, script, *args = sys.argv[1:]
raw = open('/proc/' + pid + '/environ', 'rb').read()
env = dict(os.environ)
for item in raw.split(b'\0'):
    if b'=' in item:
        key, value = item.split(b'=', 1)
        env[os.fsdecode(key)] = os.fsdecode(value)
os.chdir(api)
os.execve(node, [node, script, *args], env)
PY
