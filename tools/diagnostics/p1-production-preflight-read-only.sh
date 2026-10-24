#!/usr/bin/env bash
# Read-only: no restart, DDL, sync, timer change, environment output or worker.
set -euo pipefail
current_path=$(readlink -f /opt/jiuchen-api/current)
printf 'CURRENT_PATH=%s\\n' "$current_path"
if [ -r "$current_path/COMMIT_SHA" ]; then printf 'CURRENT_COMMIT='; cat "$current_path/COMMIT_SHA"; else echo 'CURRENT_COMMIT=UNKNOWN'; fi
if [ -r /opt/jiuchen-api/shared/previous-release ]; then
  previous_commit=$(cat /opt/jiuchen-api/shared/previous-release)
  printf 'PREVIOUS_COMMIT=%s\\n' "$previous_commit"
  if [ -d "/opt/jiuchen-api/releases/$previous_commit" ]; then echo 'PREVIOUS_RELEASE_DIR=EXISTS'; else echo 'PREVIOUS_RELEASE_DIR=MISSING'; fi
else
  echo 'PREVIOUS_COMMIT=UNREADABLE'
  echo 'PREVIOUS_RELEASE_DIR=UNVERIFIED'
fi
systemctl show jiuchen-api.service -p ActiveState -p MainPID -p User -p Group -p NRestarts -p MemoryCurrent -p MemoryMax -p CPUQuotaPerSecUSec -p TasksMax
systemctl show jiuchen-news-sync.timer -p ActiveState -p Unit
df -h /opt/jiuchen-api
free -m
api_pid=$(systemctl show jiuchen-api.service -p MainPID --value)
[[ "$api_pid" =~ ^[1-9][0-9]*$ ]] || { echo 'BLOCKED: API MainPID unavailable'; exit 1; }
# Only this API service's processes, including an npm/wrapper child if present.
# Never enumerate website/Harbor command lines or output the full ss process list.
api_pids="$api_pid"
api_group=$(systemctl show jiuchen-api.service -p ControlGroup --value)
if [ "$api_group" = '/system.slice/jiuchen-api.service' ]; then
  for api_procs_file in "/sys/fs/cgroup${api_group}/cgroup.procs" "/sys/fs/cgroup/systemd${api_group}/cgroup.procs"; do
    if [ -r "$api_procs_file" ]; then api_pids="$api_pids $(awk '/^[0-9]+$/ {printf "%s ",$0}' "$api_procs_file")"; break; fi
  done
fi
mapfile -t api_sockets < <(ss -ltnpH | awk -v pids="$api_pids" 'BEGIN{n=split(pids,p," ")} {for(i=1;i<=n;i++)if(p[i]!="" && index($0,"pid=" p[i] ",")){print $4;break}}' | sort -u)
if [ "${#api_sockets[@]}" -ne 1 ]; then
  printf 'BLOCKED: API listener count=%s; identify service child PID/listener before release\n' "${#api_sockets[@]}"
  exit 1
fi
api_socket="${api_sockets[0]}"
printf 'API_ACTUAL_LISTENER=%s\n' "$api_socket"
api_port="${api_socket##*:}"
[[ "$api_port" =~ ^[0-9]+$ ]] && ((api_port>0 && api_port<65536)) || exit 1
case "$api_port" in 80|443|8088) echo 'BLOCKED: protected port; do not modify any service'; exit 1;; esac
api_host="${api_socket%:*}"
case "$api_host" in '*'|'0.0.0.0') api_host='127.0.0.1';; '[::]') api_host='[::1]';; esac
for endpoint in health/live health health/config; do
  curl --fail --silent --show-error --max-time 5 "http://${api_host}:${api_port}/${endpoint}"
  printf '\n'
done
printf 'WEBSITE_ROOT='
readlink -f /www/wwwroot/jiuchen-current
if [ -r /etc/production.env ]; then
  if grep -Eq '^ADMIN_AI_KEY_ENCRYPTION_KEY=.{40,}
 /etc/production.env; then
    echo 'ADMIN_AI_KEY_ENCRYPTION_KEY=PRESENT_SHAPED'
  else
    echo 'ADMIN_AI_KEY_ENCRYPTION_KEY=MISSING_OR_SHORT'
  fi
else
  echo 'ADMIN_AI_KEY_ENCRYPTION_KEY=UNVERIFIED'
fi
echo 'ACTUAL_LISTENER_HEALTH_PASS (not business/device acceptance)'
