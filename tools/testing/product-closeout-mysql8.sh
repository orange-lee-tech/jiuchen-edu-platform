#!/usr/bin/env bash
# Disposable synthetic MySQL only. Never consumes DATABASE_URL from the caller.
set -euo pipefail
repo=$(cd "$(dirname "$0")/../.." && pwd)
node=/home/orangelee-tech/actions-runner/_work/_tool/node/22.23.3/x64/bin/node
tsx=/home/orangelee-tech/jiuchen-release-prep/36aea4bab3e9bc1aa1c46403cc05e3b2208df1d4/source/services/api/node_modules/tsx/dist/cli.mjs
test -x "$node" && test -f "$tsx"
name="jiuchen-closeout-test-$$-$(date +%s)"
cid=$(docker run -d --name "$name" -e MYSQL_ROOT_PASSWORD=local_test_only -e MYSQL_DATABASE=closeout_test -p 127.0.0.1::3306 mysql:8.0)
cleanup() { [[ "$cid" =~ ^[0-9a-f]{64}$ ]] && docker rm -f "$cid" >/dev/null; }
trap cleanup EXIT
for _ in $(seq 1 90); do
  if docker exec "$cid" mysql -uroot -plocal_test_only closeout_test -e 'SELECT 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$cid" mysql -uroot -plocal_test_only closeout_test -e 'SELECT 1' >/dev/null 2>&1
port=$(docker port "$cid" 3306/tcp | sed -n 's/.*://p' | head -n 1)
[[ "$port" =~ ^[0-9]+$ ]]
docker exec "$cid" mysql -uroot -plocal_test_only closeout_test -e "CREATE TABLE sentinel (id INT PRIMARY KEY, value VARCHAR(20)); INSERT INTO sentinel VALUES (1,'preserved');" 2>/dev/null
for migration in upgrade-teacher-todos upgrade-ai-balance-snapshots; do
  for run in 1 2; do
    DATABASE_URL="mysql://root:local_test_only@127.0.0.1:$port/closeout_test" "$node" "$tsx" "$repo/services/api/src/db/$migration.ts"
    echo "MIGRATION_PASS name=$migration run=$run"
  done
done
result=$(docker exec "$cid" mysql -N -uroot -plocal_test_only closeout_test -e "SELECT CONCAT((SELECT COUNT(*) FROM sentinel WHERE id=1 AND value='preserved'),':',(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='teacher_todos' AND COLUMN_NAME IN ('teacher_id','due_date','status')),':',(SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ai_balance_snapshots' AND COLUMN_NAME IN ('balance','warning_threshold','verified_at','actor_user_id')),':',(SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND ((TABLE_NAME='teacher_todos' AND INDEX_NAME='teacher_todos_owner') OR (TABLE_NAME='ai_balance_snapshots' AND INDEX_NAME='ai_balance_snapshots_account'))))" 2>/dev/null)
[[ "$result" == '1:3:4:5' ]]
DATABASE_URL="mysql://root:local_test_only@127.0.0.1:$port/closeout_test" "$node" "$tsx" "$repo/services/api/src/db/verify-product-closeout-mysql.ts"
echo 'ISOLATED_MYSQL8_MIGRATIONS_PASS sentinel_preserved=true indexes=true'
