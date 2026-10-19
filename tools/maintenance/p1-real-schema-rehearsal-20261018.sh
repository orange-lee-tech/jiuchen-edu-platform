#!/usr/bin/env bash
# One-use release gate: production backup -> disposable WSL MySQL -> fixed API migrations.
# No production database writes or ECS service changes.
set -euo pipefail
umask 077

candidate=1b8ae8b3c5a1285b84ab6b5f573ca9db5d93d0a7
archive_hash=98279923d783889caa87deb815d3828d53266a84a7be081714188a71f1fc1fb8
generation=/home/orangelee-tech/jiuchen-backups/20261016-134131-cf772f
python=/home/orangelee-tech/.local/share/jiuchen-maintenance/venv/bin/python3
maintenance=/home/orangelee-tech/jiuchen-maintenance-20261016
remote="root@121.40.168.181:/opt/jiuchen-api/staging/incoming/$candidate/jiuchen-api-$candidate-readonly.tar.gz"

for program in docker scp sha256sum tar openssl; do
  command -v "$program" >/dev/null || { echo "BLOCKED: $program is missing"; exit 1; }
done
"$python" -c 'import cryptography' || { echo 'BLOCKED: maintenance Python is unavailable'; exit 1; }
if ! command -v node >/dev/null || [[ $(node -p 'process.versions.node.split(".")[0]') != 22 ]]; then
  for toolbin in /home/orangelee-tech/actions-runner/_work/_tool/node/22.*/x64/bin; do
    if [[ -x "$toolbin/node" && -x "$toolbin/npm" ]]; then
      export PATH="$toolbin:$PATH"
      break
    fi
  done
fi
command -v node >/dev/null && command -v npm >/dev/null || { echo 'BLOCKED: WSL Node/npm required'; exit 1; }
test "$(node -p 'process.versions.node.split(".")[0]')" = 22 || { echo 'BLOCKED: Node 22 required in WSL'; exit 1; }
test -f "$generation/receipt.json" && test ! -e "$generation/PARTIAL" || { echo 'BLOCKED: verified backup absent'; exit 1; }
docker image inspect mysql:8.0 >/dev/null

work=$(mktemp -d -t jiuchen-schema-XXXXXXXX)
container="jiuchen-schema-${RANDOM}-${RANDOM}"
cleanup() {
  if [[ -n "${container:-}" ]]; then
    docker rm -f -v "$container" >/dev/null 2>&1 || true
  fi
  if [[ -n "${work:-}" && "$work" == /tmp/jiuchen-schema-* ]]; then
    rm -rf -- "$work"
  fi
}
trap cleanup EXIT

echo 'STEP=FIXED_API_ARCHIVE'
scp -q -o ConnectTimeout=15 -o ConnectionAttempts=1 "$remote" "$work/api.tar.gz"
printf '%s  %s\n' "$archive_hash" "$work/api.tar.gz" | sha256sum -c -
mkdir "$work/source"
tar -xzf "$work/api.tar.gz" -C "$work/source" --no-same-owner
api="$work/source/services/api"
test -f "$api/package-lock.json" && test -f "$api/src/db/upgrade-enrollment-year.ts"

echo 'STEP=CANDIDATE_DEPENDENCIES'
(cd "$api" && npm ci --no-audit --no-fund >/dev/null)

echo 'STEP=BACKUP_DECRYPT_LOCAL'
PYTHONPATH="$maintenance" "$python" - "$generation" "$work/database.sql" <<'PY'
import getpass, json, sys
from pathlib import Path
from maintain import decrypt, digest
generation=Path(sys.argv[1]); output=Path(sys.argv[2]); source=generation/'database.jcb'
receipt=json.loads((generation/'receipt.json').read_text())
if not receipt.get('downloadVerified') or digest(source)!=receipt['components']['database']['sha256']:
    raise SystemExit('BLOCKED: encrypted database backup checksum mismatch')
decrypt(source, output, getpass.getpass('备份密码：'))
print('LOCAL_BACKUP_DECRYPT_PASS')
PY

password=$(openssl rand -hex 24)
printf 'MYSQL_ROOT_PASSWORD=%s\nMYSQL_DATABASE=recovery_test\n' "$password" > "$work/mysql.env"
printf '[client]\nprotocol=tcp\nhost=127.0.0.1\nuser=root\npassword=%s\n' "$password" > "$work/mysql.cnf"

echo 'STEP=ISOLATED_DATABASE_START'
docker run -d --pull=never --name "$container" --label jiuchen.maintenance=release-rehearsal \
  --network bridge -p 127.0.0.1::3306 --memory 768m --cpus 1 --pids-limit 256 \
  --env-file "$work/mysql.env" mysql:8.0 --event-scheduler=OFF >/dev/null
docker cp "$work/mysql.cnf" "$container:/tmp/rehearsal.cnf" >/dev/null
ready=false
for ((i=0;i<120;i++)); do
  if docker exec "$container" mysqladmin --defaults-extra-file=/tmp/rehearsal.cnf ping --silent >/dev/null 2>&1; then
    ready=true; break
  fi
  sleep 1
done
test "$ready" = true || { echo 'BLOCKED: isolated MySQL startup'; exit 1; }
port=$(docker port "$container" 3306/tcp)
port=${port##*:}
[[ "$port" =~ ^[0-9]+$ ]] || { echo 'BLOCKED: local database port'; exit 1; }

echo 'STEP=RESTORE_REAL_STRUCTURE'
docker exec "$container" mysql --defaults-extra-file=/tmp/rehearsal.cnf \
  -e 'ALTER DATABASE recovery_test CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci' >/dev/null
docker exec -i "$container" mysql --defaults-extra-file=/tmp/rehearsal.cnf recovery_test \
  < "$work/database.sql" >/dev/null
source_count=$(docker exec "$container" mysql --defaults-extra-file=/tmp/rehearsal.cnf \
  --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='recovery_test';")
test "$source_count" = 17 || { echo 'BLOCKED: restored source table count changed'; exit 1; }
echo 'RESTORED_SOURCE_TABLES=17'

export DATABASE_URL="mysql://root:${password}@127.0.0.1:${port}/recovery_test"
gate() {
  local label=$1 command=$2
  echo "STEP=$label"
  if ! (cd "$api" && npm run "$command" >"$work/gate.log" 2>&1); then
    echo "FAILED=$label; local migration details withheld from console"
    exit 1
  fi
  echo "PASS=$label"
}

gate PROFILE_UPGRADE db:upgrade:enrollment-year
gate PROFILE_REPEAT db:upgrade:enrollment-year
gate PROFILE_CONTRACT db:check:profile
gate NEWS_UPGRADE db:upgrade:news-v2
gate NEWS_REPEAT db:upgrade:news-v2
gate COMMERCIAL_UPGRADE db:upgrade:credit-payment
gate COMMERCIAL_REPEAT db:upgrade:credit-payment
gate COMMERCIAL_CONTRACT db:check:credit-payment

final_count=$(docker exec "$container" mysql --defaults-extra-file=/tmp/rehearsal.cnf \
  --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='recovery_test';")
test "$final_count" = 28 || { echo 'BLOCKED: unexpected final table count'; exit 1; }
echo 'REAL_17_TABLE_SCHEMA_REHEARSAL_PASS; final_tables=28; production_writes=false'
