#!/usr/bin/env bash
# Promote only the reviewed dbd7 API after separate exact-SHA approval.
# No DDL, payment flag, website, proxy, or NEWS_V2_ENABLED change.
set -Eeuo pipefail
umask 077

candidate=dbd7d9a818523cc3b007afe47a03519510415652
previous=858aa6a5bebbdb88346c6282f691b4976886b935
base=/opt/jiuchen-api
release="$base/releases/$candidate"
promoter="$base/staging/incoming/$previous/jiuchen-promote-reference-20261019.sh"
promoter_hash=bd462b9520997e3b4ab3c59da017821e4dd7a718e3961c2212afd691dae752a9
approved_file=/etc/jiuchen-api/approved-release
env_file=/etc/jiuchen-api/production.env
ready_file="$base/staging/READY"
previous_file="$base/shared/previous-release"
approved_backup="$base/staging/approved-release.before-$candidate"
previous_backup="$base/staging/previous-release.before-$candidate"
runtime=/etc/jiuchen-api/runtime.conf
phase=preflight

block(){ printf 'BLOCKED=%s PHASE=%s\n' "$*" "$phase" >&2; exit 1; }
[[ $# -eq 1 && $1 == --apply && $(id -u) -eq 0 ]] || block 'root_and_apply_required'
for cmd in sha256sum bash flock systemctl curl python3 runuser; do
  command -v "$cmd" >/dev/null || block "missing_$cmd"
done
exec 8>"$base/staging/.approved-dbd7-release.lock"
flock -n 8 || block 'another_dbd7_release_script_running'
[[ $(readlink -f "$base/current") == "$base/releases/$previous" ]] || block 'unexpected_active_release'
[[ $(systemctl is-active jiuchen-api.service) == active ]] || block 'api_not_active'
[[ -d "$release" && ! -L "$release" && -f "$release/COMMIT_SHA" ]] || block 'candidate_release_missing'
[[ $(tr -d '[:space:]' < "$release/COMMIT_SHA") == "$candidate" ]] || block 'candidate_marker_mismatch'
[[ $(stat -c %U:%G "$release") == root:root ]] || block 'candidate_owner_mismatch'
[[ -z $(find "$release" -xdev \( ! -user root -o ! -group root \) -print -quit) ]] || block 'candidate_has_nonroot_content'
[[ -z $(find "$release" -xdev ! -type l \( -perm -0020 -o -perm -0002 \) -print -quit) ]] || block 'candidate_has_writable_content'
runuser -u jiuchen-api -- test -r "$release/services/api/dist/server.js" || block 'candidate_unreadable'
[[ -f "$promoter" && ! -L "$promoter" ]] || block 'reviewed_promoter_missing'
printf '%s  %s\n' "$promoter_hash" "$promoter" | sha256sum -c - || block 'promoter_hash_mismatch'
bash -n "$promoter" || block 'promoter_syntax_invalid'
[[ -f "$approved_file" && ! -L "$approved_file" &&
   $(tr -d '[:space:]' < "$approved_file") == "$previous" ]] || block 'approved_marker_not_previous'
[[ -f "$previous_file" && ! -L "$previous_file" ]] || block 'prior_rollback_marker_missing'
[[ ! -e "$ready_file" && ! -L "$ready_file" ]] || block 'READY_already_exists'
[[ ! -e "$approved_backup" && ! -e "$previous_backup" ]] || block 'backup_target_already_exists'
[[ -f "$env_file" && ! -L "$env_file" &&
   $(stat -c %U "$env_file") == root &&
   $(stat -c %a "$env_file") == 600 ]] || block 'production_env_invalid'
python3 - "$env_file" <<'PY'
import re,sys
from pathlib import Path
s=Path(sys.argv[1]).read_text()
values=re.findall(r'^NEWS_V2_ENABLED=(.*)$',s,re.M)
if len(values)!=1 or values[0].strip().strip('"\'').lower() not in ('1','true','yes','on'):
    raise SystemExit('BLOCKED=NEWS_V2_must_remain_enabled')
print('NEWS_V2_FLAG_PRECHECK_PASS')
PY
[[ -f "$runtime" && ! -L "$runtime" && $(stat -c %U "$runtime") == root ]] || block 'runtime_conf_invalid'
# shellcheck disable=SC1090
source "$runtime"
[[ -n ${HEALTH_LIVE_URL:-} && -n ${HEALTH_READY_URL:-} ]] || block 'health_urls_missing'
curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_LIVE_URL" >/dev/null || block 'live_precheck_failed'
curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_READY_URL" >/dev/null || block 'ready_precheck_failed'
website_before=$(readlink -f /www/wwwroot/jiuchen-current)
[[ "$website_before" == /www/wwwroot/jiuchen-releases/* ]] || block 'website_pointer_unexpected'
printf 'PRECHECK_PASS candidate=%s previous=%s\n' "$candidate" "$previous"

phase=activation
if ! cp -p "$approved_file" "$approved_backup" ||
   ! cp -p "$previous_file" "$previous_backup" ||
   ! chmod 0600 "$approved_backup" "$previous_backup"; then
  rm -f -- "$approved_backup" "$previous_backup"
  block 'marker_backup_failed_before_activation'
fi

recover(){
  local reason=$1
  local recovery_ok=1
  trap - ERR
  set +e
  phase=recovery
  printf 'RECOVERY_START original_exit=%s\n' "$reason" >&2
  rm -f -- "$approved_file.tmp.$$" "$ready_file.tmp.$$"
  if [[ -f "$approved_backup" ]]; then
    cp -p "$approved_backup" "$approved_file" || recovery_ok=0
  else
    recovery_ok=0
  fi
  if [[ -f "$ready_file" && ! -L "$ready_file" &&
        $(tr -d '[:space:]' < "$ready_file") == "$candidate" ]]; then
    rm -f -- "$ready_file" || recovery_ok=0
  fi
  if [[ $(readlink -f "$base/current") == "$release" ]]; then
    if printf '%s\n' "$previous" > "$ready_file" &&
       chmod 0600 "$ready_file" && chown root:root "$ready_file"; then
      bash "$promoter" || recovery_ok=0
    else
      recovery_ok=0
    fi
  fi
  if [[ -f "$previous_backup" ]]; then
    cp -p "$previous_backup" "$previous_file" || recovery_ok=0
  else
    recovery_ok=0
  fi
  [[ -f "$approved_file" && $(tr -d '[:space:]' < "$approved_file") == "$previous" ]] || recovery_ok=0
  [[ ! -e "$ready_file" && ! -L "$ready_file" ]] || recovery_ok=0
  [[ $(readlink -f "$base/current") == "$base/releases/$previous" ]] || recovery_ok=0
  [[ $(systemctl is-active jiuchen-api.service) == active ]] || recovery_ok=0
  curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_LIVE_URL" >/dev/null || recovery_ok=0
  curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_READY_URL" >/dev/null || recovery_ok=0
  [[ $(readlink -f /www/wwwroot/jiuchen-current) == "$website_before" ]] || recovery_ok=0
  if [[ "$recovery_ok" == 1 ]]; then
    printf 'RECOVERY_PREVIOUS_ACTIVE=%s\n' "$previous" >&2
  else
    printf 'BLOCKED=RECOVERY_NEEDS_OPERATOR_INSPECTION\n' >&2
  fi
  exit "$reason"
}
trap 'recover $?' ERR
printf '%s\n' "$candidate" > "$approved_file.tmp.$$"
chmod 0600 "$approved_file.tmp.$$"; chown root:root "$approved_file.tmp.$$"
mv -f "$approved_file.tmp.$$" "$approved_file"
printf '%s\n' "$candidate" > "$ready_file.tmp.$$"
chmod 0600 "$ready_file.tmp.$$"; chown root:root "$ready_file.tmp.$$"
mv -f "$ready_file.tmp.$$" "$ready_file"

printf 'STEP=PROMOTE_FIXED_SHA\n'
bash "$promoter"
phase=postcheck
[[ $(readlink -f "$base/current") == "$release" ]]
[[ $(systemctl is-active jiuchen-api.service) == active ]]
[[ $(tr -d '[:space:]' < "$approved_file") == "$candidate" ]]
curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_LIVE_URL" >/dev/null
curl -fsS --connect-timeout 5 --max-time 10 "$HEALTH_READY_URL" >/dev/null
api_root=$(python3 - "$HEALTH_READY_URL" <<'PY'
import sys,urllib.parse
u=urllib.parse.urlsplit(sys.argv[1])
print(urllib.parse.urlunsplit((u.scheme,u.netloc,'','','')))
PY
)
news_count=$(curl -fsS --connect-timeout 5 --max-time 15 "$api_root/news" |
  python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("ok") is True and d.get("v2") is True and len(d.get("posts",[]))>0; print(len(d["posts"]))')
[[ "$news_count" =~ ^[0-9]+$ && "$news_count" -gt 0 ]]
# An unauthenticated request must stop at authorization, before either mutation.
name_code=$(curl -sS --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code}' \
  -X PUT -H 'Content-Type: application/json' --data '{"displayName":"probe"}' "$api_root/me/display-name")
favorite_code=$(curl -sS --connect-timeout 5 --max-time 10 -o /dev/null -w '%{http_code}' \
  -X POST -H 'Content-Type: application/json' --data '{}' \
  "$api_root/me/news-favorites/00000000-0000-4000-8000-000000000000/remove")
[[ "$name_code" == 401 && "$favorite_code" == 401 ]]
[[ $(readlink -f /www/wwwroot/jiuchen-current) == "$website_before" ]]
[[ ! -e "$ready_file" && ! -L "$ready_file" ]]
trap - ERR
printf 'NEWS_V2_PUBLIC_COUNT=%s\nAUTH_BOUNDARY_DISPLAY_NAME=%s\nAUTH_BOUNDARY_FAVORITES=%s\n' \
  "$news_count" "$name_code" "$favorite_code"
printf 'API_CURRENT=%s\nROLLBACK_TARGET=%s\nWEBSITE_POINTER_UNCHANGED=true\n' \
  "$release" "$base/releases/$previous"
printf 'DBD7_API_PROMOTION_PASS\n'
