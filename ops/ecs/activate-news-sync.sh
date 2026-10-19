#!/usr/bin/env bash
set -euo pipefail

# One-time news service activation, without restarting jiuchen-api.
# Run as root from a trusted ECS console. Safe on repeat; refuses conflicting unit files.
[ "$(id -u)" -eq 0 ] || { echo "ROOT_REQUIRED"; exit 1; }
SRC=/opt/jiuchen-api/staging
SYSTEMD=/etc/systemd/system
NODE=/opt/jiuchen-api/runtime/node/bin/node
API=/opt/jiuchen-api/current/services/api

for name in jiuchen-news-sync.service jiuchen-news-sync.timer; do
  [ -f "$SRC/$name" ] || { echo "MISSING_STAGED_UNIT=$name"; exit 1; }
  if [ -e "$SYSTEMD/$name" ] && ! cmp -s "$SRC/$name" "$SYSTEMD/$name"; then
    echo "STOP: existing unit differs: $name"
    exit 1
  fi
done

[ -f "$API/dist/scripts/sync-official-account.js" ] || {
  echo "SYNC_SCRIPT_MISSING"; exit 1;
}
[ -f "$SRC/issue-acceptance-identities.mjs" ] || {
  echo "TEST_ID_SCRIPT_MISSING"; exit 1;
}
"$NODE" --check "$SRC/issue-acceptance-identities.mjs"

install -o root -g root -m 0644 "$SRC/jiuchen-news-sync.service" "$SYSTEMD/jiuchen-news-sync.service"
install -o root -g root -m 0644 "$SRC/jiuchen-news-sync.timer" "$SYSTEMD/jiuchen-news-sync.timer"
systemctl daemon-reload

echo "=== FIRST NEWS SYNC (one-shot; updates news_posts content, not schema) ==="
systemctl start jiuchen-news-sync.service
systemctl show jiuchen-news-sync.service -p Result -p ExecMainStatus
journalctl -u jiuchen-news-sync.service -n 10 --no-pager

echo "=== ENABLE RECURRING TIMER ==="
systemctl enable --now jiuchen-news-sync.timer
systemctl is-enabled jiuchen-news-sync.timer
systemctl is-active jiuchen-news-sync.timer
systemctl list-timers --all --no-pager | grep jiuchen-news-sync

echo "NEWS_SYNC_TIMER_GATE_PASS"
