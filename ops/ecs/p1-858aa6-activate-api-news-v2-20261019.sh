#!/usr/bin/env bash
# Approved A+B only: fixed API promotion and one News V2 source/window preheat.
# C (four reviewed public posts) is a separate, later admin write.
set -euo pipefail
umask 077

candidate=858aa6a5bebbdb88346c6282f691b4976886b935
previous=8cc4bb85ffdf3e86e7a13a89d119f1b110491e48
base=/opt/jiuchen-api
release="$base/releases/$candidate"
incoming="$base/staging/incoming/$candidate"
promoter="$incoming/jiuchen-promote-reference-20261019.sh"
promoter_hash=bd462b9520997e3b4ab3c59da017821e4dd7a718e3961c2212afd691dae752a9
env_file=/etc/jiuchen-api/production.env
approved_file=/etc/jiuchen-api/approved-release
ready_file="$base/staging/READY"
env_backup="/etc/jiuchen-api/production.env.before-$candidate"
approved_backup="$base/staging/approved-release.before-$candidate"
node=/opt/jiuchen-api/runtime/node/bin/node
phase=preflight

block() { printf 'BLOCKED=%s; PHASE=%s\n' "$*" "$phase" >&2; exit 1; }
[[ $# -eq 1 && $1 == --apply && $(id -u) -eq 0 ]] || block 'root_and_apply_required'
for tool in python3 curl systemctl systemd-run sha256sum runuser flock; do
  command -v "$tool" >/dev/null || block "missing_$tool"
done
exec 8>"$base/staging/.approved-858aa6-release.lock"
flock -n 8 || block 'another_approved_release_script_running'
printf 'STEP=PRECHECK\n'
[[ $(readlink -f "$base/current") == "$base/releases/$previous" ]] || block 'unexpected_active_release'
[[ $(systemctl is-active jiuchen-api.service) == active ]] || block 'api_not_active'
[[ -d "$release" && ! -L "$release" && -f "$release/COMMIT_SHA" ]] || block 'candidate_release_missing'
[[ $(tr -d '[:space:]' < "$release/COMMIT_SHA") == "$candidate" ]] || block 'candidate_marker_mismatch'
[[ $(stat -c %U:%G "$release") == root:root ]] || block 'candidate_owner_mismatch'
runuser -u jiuchen-api -- test -r "$release/services/api/dist/server.js" || block 'candidate_unreadable'
[[ -f "$promoter" && ! -L "$promoter" ]] || block 'fixed_promoter_missing'
printf '%s  %s\n' "$promoter_hash" "$promoter" | sha256sum -c - || block 'fixed_promoter_hash_mismatch'
bash -n "$promoter" || block 'fixed_promoter_syntax'
[[ -x "$node" && -f "$release/services/api/dist/scripts/sync-official-account.js" ]] || block 'candidate_sync_missing'
[[ -f "$env_file" && ! -L "$env_file" && $(stat -c %U "$env_file") == root ]] || block 'production_env_invalid'
[[ $(stat -c %a "$env_file") == 600 ]] || block 'production_env_not_0600'
[[ ! -e "$env_backup" && ! -e "$approved_backup" ]] || block 'prior_attempt_backups_exist'
[[ ! -e "$ready_file" && ! -L "$ready_file" ]] || block 'READY_already_exists'
[[ -f "$approved_file" && ! -L "$approved_file" ]] || block 'approved_marker_invalid'
[[ $(tr -d '[:space:]' < "$approved_file") == "$previous" ]] || block 'approved_marker_not_previous'
[[ $(systemctl is-active jiuchen-news-sync.service || true) != active ]] || block 'news_sync_currently_running'
python3 - "$env_file" <<'PY'
from pathlib import Path
import re,sys
s=Path(sys.argv[1]).read_text()
matches=re.findall(r'^NEWS_V2_ENABLED=(.*)$',s,re.M)
if len(matches)>1:raise SystemExit('BLOCKED=duplicate_news_flag')
if matches and matches[0].strip().strip('"\'').lower() in ('1','true','yes','on'):
    raise SystemExit('BLOCKED=news_v2_already_enabled')
print('NEWS_FLAG_WAS_OFF_OR_ABSENT')
PY
[[ $(readlink -f /www/wwwroot/jiuchen-current) == /www/wwwroot/jiuchen-releases/* ]] || block 'website_pointer_unexpected'
website_before=$(readlink -f /www/wwwroot/jiuchen-current)
runtime=/etc/jiuchen-api/runtime.conf
[[ -f "$runtime" && ! -L "$runtime" && $(stat -c %U "$runtime") == root ]] || block 'runtime_conf_invalid'
# shellcheck disable=SC1090
source "$runtime"
[[ -n ${HEALTH_LIVE_URL:-} && -n ${HEALTH_READY_URL:-} ]] || block 'health_urls_missing'
curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_LIVE_URL" >/dev/null || block 'live_precheck_failed'
curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_READY_URL" >/dev/null || block 'ready_precheck_failed'
printf 'PRECHECK_PASS current=%s candidate=%s\n' "$previous" "$candidate"

# A unit with only the reviewed release, production EnvironmentFile, and a
# command-local override. The active API keeps its original environment.
phase=preheat
printf 'STEP=NEWS_V2_PREHEAT\n'
taskpath="$(dirname "$node"):/usr/local/bin:/usr/bin:/bin"
stamp="$(date +%s)-$$"
set +e
sync_output=$(systemd-run --unit="jiuchen-news-v2-preheat-$stamp" --wait --pipe \
  -p User=jiuchen-api -p Group=jiuchen-api \
  -p "EnvironmentFile=$env_file" -p "WorkingDirectory=$release/services/api" \
  -p MemoryAccounting=yes -p MemoryLimit=256M -p CPUQuota=50% -p TasksMax=64 -p RuntimeMaxSec=300 \
  /usr/bin/env NEWS_V2_ENABLED=true NODE_OPTIONS=--max-old-space-size=160 PATH="$taskpath" \
  "$node" "$release/services/api/dist/scripts/sync-official-account.js" 2>&1)
sync_rc=$?
set -e
printf '%s\n' "$sync_output"
[[ $sync_rc -eq 0 && "$sync_output" == *CHECKED\ official\ account\ sync:* && "$sync_output" == *failed=0* && "$sync_output" == *truncated=false* ]] ||
  block 'preheat_incomplete; current_unchanged; news_writes_may_be_partial'
printf 'NEWS_V2_PREHEAT_PASS\n'

read -r -d '' check_js <<'JS' || true
import {loadEnv} from './dist/config/env.js'
import {createDatabaseContext} from './dist/db/client.js'
const db=createDatabaseContext(loadEnv())
if(!db.configured)throw Error('db_missing')
try {
  const [rows]=await db.pool.query("SELECT COUNT(*) AS normalCount FROM news_display_states s JOIN news_posts n ON n.id=s.post_id WHERE s.phase='normal' AND n.status='active' AND JSON_LENGTH(n.tags_json)>0")
  const count=Number(rows[0]?.normalCount||0)
  console.log('NEWS_V2_NORMAL_COUNT='+count)
  if(count<1)process.exitCode=2
} finally {await db.pool.end()}
JS
set +e
window_output=$(systemd-run --unit="jiuchen-news-v2-window-$stamp" --wait --pipe \
  -p User=jiuchen-api -p Group=jiuchen-api \
  -p "EnvironmentFile=$env_file" -p "WorkingDirectory=$release/services/api" \
  -p MemoryAccounting=yes -p MemoryLimit=256M -p CPUQuota=50% -p TasksMax=64 -p RuntimeMaxSec=60 \
  /usr/bin/env NODE_OPTIONS=--max-old-space-size=160 PATH="$taskpath" \
  "$node" --input-type=module -e "$check_js" 2>&1)
window_rc=$?
set -e
printf '%s\n' "$window_output"
[[ $window_rc -eq 0 && "$window_output" == *NEWS_V2_NORMAL_COUNT=* ]] ||
  block 'preheated_window_empty_or_failed; current_unchanged'

phase=activation
printf 'STEP=ENABLE_FLAG_AND_PROMOTE\n'
restore_activation_files() {
  local rc=$?
  trap - ERR
  if [[ -f "$env_backup" ]]; then cp -p "$env_backup" "$env_file" || true; fi
  if [[ -f "$approved_backup" ]]; then cp -p "$approved_backup" "$approved_file" || true; fi
  if [[ -f "$ready_file" && ! -L "$ready_file" &&
        $(tr -d '[:space:]' < "$ready_file") == "$candidate" ]]; then
    rm -f "$ready_file" || true
  fi
  printf 'BLOCKED=activation_file_write_failed; CURRENT_REQUIRES_INSPECTION; EXIT=%s\n' "$rc" >&2
  exit "$rc"
}
trap restore_activation_files ERR
cp -p "$env_file" "$env_backup"; chmod 0600 "$env_backup"
cp -p "$approved_file" "$approved_backup"; chmod 0600 "$approved_backup"
python3 - "$env_file" <<'PY'
from pathlib import Path
import os,re,sys,tempfile
p=Path(sys.argv[1]); old=p.read_bytes()
lines=old.splitlines(keepends=True)
lines=[line for line in lines if not re.match(rb'^NEWS_V2_ENABLED=',line)]
new=b''.join(lines)
if new and not new.endswith(b'\n'): new+=b'\n'
new+=b'NEWS_V2_ENABLED=true\n'
fd,tmp=tempfile.mkstemp(prefix='.production.env.',dir=p.parent)
try:
    os.fchmod(fd,0o600);os.fchown(fd,0,0)
    with os.fdopen(fd,'wb') as out:out.write(new);out.flush();os.fsync(out.fileno())
    os.replace(tmp,p)
finally:
    if os.path.exists(tmp):os.unlink(tmp)
print('NEWS_FLAG_FILE_SET_TRUE; values_not_printed')
PY
printf '%s\n' "$candidate" > "$approved_file.tmp.$$"
chmod 0600 "$approved_file.tmp.$$"; chown root:root "$approved_file.tmp.$$"
mv -f "$approved_file.tmp.$$" "$approved_file"
printf '%s\n' "$candidate" > "$ready_file.tmp.$$"
chmod 0600 "$ready_file.tmp.$$"; chown root:root "$ready_file.tmp.$$"
mv -f "$ready_file.tmp.$$" "$ready_file"
trap - ERR

if ! bash "$promoter"; then
  # The reviewed promoter already attempts to restore the previous release
  # on a failed restart/health gate. Restore files for its next invocation.
  cp -p "$env_backup" "$env_file"
  cp -p "$approved_backup" "$approved_file"
  if [[ -f "$ready_file" && $(tr -d '[:space:]' < "$ready_file") == "$candidate" ]]; then rm -f "$ready_file"; fi
  block 'promoter_failed; original_configuration_restored; inspect_current'
fi

phase=postcheck
printf 'STEP=POST_PROMOTION_CHECK\n'
news_url=$(python3 - "$HEALTH_READY_URL" <<'PY'
import sys,urllib.parse
u=urllib.parse.urlsplit(sys.argv[1])
print(urllib.parse.urlunsplit((u.scheme,u.netloc,'/news','','')))
PY
)
post_ok=true
[[ $(readlink -f "$base/current") == "$release" ]] || post_ok=false
[[ $(systemctl is-active jiuchen-api.service) == active ]] || post_ok=false
curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_LIVE_URL" >/dev/null || post_ok=false
curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_READY_URL" >/dev/null || post_ok=false
news_output=$(curl -fsS --connect-timeout 5 --max-time 15 "$news_url" |
  python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("ok") is True and d.get("v2") is True and len(d.get("posts",[]))>=1; print("NEWS_V2_PUBLIC_COUNT="+str(len(d["posts"])))') || post_ok=false
printf '%s\n' "$news_output"
[[ $(readlink -f /www/wwwroot/jiuchen-current) == "$website_before" ]] || post_ok=false
if [[ $post_ok != true ]]; then
  printf 'POSTCHECK_FAILED_ROLLING_BACK\n' >&2
  cp -p "$env_backup" "$env_file"
  cp -p "$approved_backup" "$approved_file"
  [[ ! -e "$ready_file" ]] || block 'unexpected_READY_after_promotion; manual_intervention'
  printf '%s\n' "$previous" > "$ready_file"
  chmod 0600 "$ready_file"; chown root:root "$ready_file"
  if ! bash "$promoter"; then block 'rollback_promoter_failed; manual_intervention'; fi
  block 'postcheck_failed; previous_API_restored; News_V2_DB_preheat_retained'
fi
printf 'API_CURRENT=%s\nNEWS_V2_ENABLED=true\nWEBSITE_POINTER_UNCHANGED=true\n' "$candidate"
printf 'A_B_PROMOTION_PASS; C_FOUR_ARTICLE_IMPORT_PENDING\n'
