#!/usr/bin/env bash
# Build a new immutable Jiuchen API release from the verified fixed archive.
# Reads the existing production DB only to check the candidate's schema contract.
# Does not change DB rows, current, the API service, or the company website.
set -euo pipefail
umask 077

sha=dbd7d9a818523cc3b007afe47a03519510415652
digest=1bffcd9f66da800c7713ecad7bd9008edd68a21228c752e6311928e8adea26de
expected_current=858aa6a5bebbdb88346c6282f691b4976886b935
base=/opt/jiuchen-api
incoming="$base/staging/incoming/$sha"
archive="$incoming/jiuchen-api-$sha-readonly.tar.gz"
manifest="$incoming/manifest.json"
target="$base/releases/$sha"
nodebin="$base/runtime/node-v22.23.3-linux-x64/bin/node"

die() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
[[ $# -eq 0 ]] || die 'no arguments accepted'
[[ $(id -u) -eq 0 ]] || die 'run as root on Jiuchen ECS'
for cmd in python3 sha256sum systemd-run systemctl runuser flock npm; do
  command -v "$cmd" >/dev/null || die "missing $cmd"
done
id jiuchen-deploy >/dev/null 2>&1 || die 'jiuchen-deploy user missing'
id jiuchen-api >/dev/null 2>&1 || die 'jiuchen-api service user missing'
[[ -d "$base/releases" && ! -L "$base/releases" ]] || die 'release root missing or linked'
[[ $(stat -c %d "$base/staging") == $(stat -c %d "$base/releases") ]] || die 'staging and releases differ in filesystem; atomic move unavailable'
[[ -f "$archive" && ! -L "$archive" && -f "$manifest" && ! -L "$manifest" ]] || die 'fixed archive/manifest missing or linked'
[[ -x "$nodebin" ]] || die 'pinned Node runtime missing'
"$nodebin" -e 'if(process.versions.node.split(".")[0]!=="22")process.exit(1)' || die 'Node 22 required'
[[ ! -e "$target" && ! -L "$target" ]] || die 'release target already exists; inspect, do not overwrite'
[[ $(systemctl is-active jiuchen-api.service) == active ]] || die 'production API inactive; inspect first'
before=$(readlink -f "$base/current")
[[ "$before" == "$base/releases/$expected_current" ]] || die 'production current differs from last verified release'
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
[[ "$available" =~ ^[0-9]+$ && "$available" -ge 870400 ]] || die 'less than 850 MiB available'
printf '%s  %s\n' "$digest" "$archive" | sha256sum -c - || die 'archive digest mismatch'

exec 9>"$base/staging/.prepare-release.lock"
flock -n 9 || die 'another release preparation is running'
[[ ! -e "$target" && ! -L "$target" ]] || die 'release target appeared; inspect'
work="$base/staging/prepare-$sha-$(date -u +%Y%m%d-%H%M%S)-$$"
mkdir -m 0700 "$work"
cache="$base/staging/npm-cache-$sha-$(date -u +%Y%m%d-%H%M%S)-$$"
mkdir -m 0700 "$cache"
chown jiuchen-deploy:jiuchen-deploy "$cache"
printf 'PREPARE_DIRECTORY=%s\n' "$work"

python3 - "$archive" "$manifest" "$work" "$sha" "$digest" <<'PY'
import hashlib,json,os,pathlib,sys,tarfile
archive,manifest,root,sha,digest=sys.argv[1:]
with open(manifest,encoding='utf-8') as source:
    data=json.load(source)
assert data['candidateSha']==sha and data['sha256']==digest
assert data['status']=='REVIEW_ARTIFACT_ONLY_NOT_PRODUCTION_APPROVED'
for key in ('privateEnvironmentIncluded','privateCasesIncluded','nodeModulesIncluded','distIncluded'):
    assert data[key] is False
expected={row['path']:row for row in data['files']}
assert len(expected)==len(data['files']) and expected
seen=set()
total=0
with tarfile.open(archive,'r:gz') as tar:
    for member in tar:
        path=pathlib.PurePosixPath(member.name)
        assert not path.is_absolute() and '..' not in path.parts and '\\' not in member.name
        assert member.mode & 0o022 == 0
        if member.isdir():
            continue
        assert member.isfile() and member.name in expected and member.name not in seen
        assert member.size <= 16*1024*1024
        total += member.size
        assert total <= 64*1024*1024
        content=tar.extractfile(member).read()
        blob=hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()
        assert blob==expected[member.name]['blob']
        target=pathlib.Path(root).joinpath(*path.parts)
        target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
        with open(target,'xb') as out:
            out.write(content)
        os.chmod(target,0o755 if member.mode & 0o111 else 0o644)
        seen.add(member.name)
assert seen==set(expected)
print('ARCHIVE_MANIFEST_AND_BLOBS_PASS',flush=True)
PY

api="$work/services/api"
[[ -f "$api/package-lock.json" && -f "$api/package.json" ]] || die 'API package files missing'
chown -R jiuchen-deploy:jiuchen-deploy "$work"
taskpath="$(dirname "$nodebin"):/usr/local/bin:/usr/bin:/bin"
stamp="$(date +%s)-$$"
build_result=$(systemd-run --unit="jiuchen-release-build-$stamp" --wait --pipe \
  -p User=jiuchen-deploy \
  -p MemoryAccounting=yes -p MemoryLimit=768M -p CPUQuota=50% -p TasksMax=128 \
  -p RuntimeMaxSec=900 -p "WorkingDirectory=$api" \
  /usr/bin/env -i PATH="$taskpath" NODE_OPTIONS=--max-old-space-size=512 \
  npm_config_cache="$cache" \
  /bin/bash -c 'set -euo pipefail; npm ci --no-audit --no-fund; npm run typecheck; npm run build; echo RELEASE_TYPECHECK_AND_BUILD_PASS' 2>&1) || {
    printf '%s\n' "$build_result"; die 'release build failed; current unchanged';
  }
printf '%s\n' "$build_result"
[[ "$build_result" == *RELEASE_TYPECHECK_AND_BUILD_PASS* ]] || die 'build marker absent'

env_file=/etc/jiuchen-api/production.env
[[ -f "$env_file" && ! -L "$env_file" &&
   $(stat -c %U "$env_file") == root &&
   $(stat -c %a "$env_file") == 600 ]] || die 'production env file ownership/mode mismatch'
cat > "$api/release-compat-readonly.mjs" <<'JS'
import {loadEnv} from './dist/config/env.js'
import {createDatabaseContext} from './dist/db/client.js'

let connection
let database
try {
  const env=loadEnv()
  if(!env.NEWS_V2_ENABLED)throw new Error('news_v2_flag_off')
  database=createDatabaseContext(env)
  if(!database.configured)throw new Error('database_not_configured')
  connection=await database.pool.getConnection()
  await connection.query('START TRANSACTION READ ONLY')
  const columns={
    users:['id','display_name'],
    students:['user_id','name'],
    user_profiles:['user_id','enrollment_year'],
    news_posts:['id','article_url','status'],
    news_favorites:['user_id','post_id','original_url'],
    news_display_states:['post_id','phase'],
  }
  const [rows]=await connection.query(
    'SELECT table_name AS tableName,column_name AS columnName FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN (?,?,?,?,?,?)',
    Object.keys(columns),
  )
  const found=new Set(rows.map(row=>row.tableName+'.'+row.columnName))
  const missing=Object.entries(columns).flatMap(([table,names])=>
    names.filter(name=>!found.has(table+'.'+name)).map(name=>table+'.'+name))
  if(missing.length)throw new Error('missing_columns:'+missing.join(','))
  for(const table of Object.keys(columns))
    await connection.query('SELECT 1 FROM `'+table+'` LIMIT 1')
  console.log(JSON.stringify({status:'PRODUCTION_DB_READONLY_COMPAT_PASS',
    tablesChecked:Object.keys(columns),newsV2Enabled:true,productionWrites:false,
    aiOrPaymentCalls:false}))
} catch(error) {
  const message=String(error?.message||'')
  const safe=/^(news_v2_flag_off|database_not_configured|missing_columns:[a-z_.,]+)$/.test(message)
    ?message:String(error?.code||error?.name||'UNKNOWN')
  console.error('PRODUCTION_DB_READONLY_COMPAT_BLOCKED='+safe)
  process.exitCode=1
} finally {
  if(connection){
    try{await connection.query('ROLLBACK')}
    catch(error){
      console.error('READ_ONLY_ROLLBACK_BLOCKED='+String(error?.code||error?.name||'UNKNOWN'))
      process.exitCode=1
    }finally{connection.release()}
  }
  if(database?.configured)await database.pool.end()
}
JS
chown jiuchen-deploy:jiuchen-deploy "$api/release-compat-readonly.mjs"
printf '===== PRODUCTION DATABASE READ-ONLY COMPATIBILITY =====\n'
set +e
compat_output=$(systemd-run --unit="jiuchen-db-compat-$stamp" --wait --pipe \
  -p User=jiuchen-deploy -p Group=jiuchen-deploy \
  -p "EnvironmentFile=$env_file" -p "WorkingDirectory=$api" \
  -p MemoryAccounting=yes -p MemoryLimit=256M -p CPUQuota=50% -p TasksMax=64 \
  -p RuntimeMaxSec=60 \
  /usr/bin/env NODE_OPTIONS=--max-old-space-size=160 PATH="$taskpath" \
  "$nodebin" release-compat-readonly.mjs 2>&1)
compat_rc=$?
set -e
printf '%s\n' "$compat_output"
[[ $compat_rc -eq 0 && "$compat_output" == *PRODUCTION_DB_READONLY_COMPAT_PASS* ]] ||
  die 'production database read-only compatibility failed; current unchanged'
rm -f -- "$api/release-compat-readonly.mjs"
printf '%s\n' "$sha" > "$work/COMMIT_SHA"

# Build cache stays in staging. Preserve the verified source and installed
# runtime modules, but reject any link that escapes the published tree.
python3 - "$work" <<'PY'
import os,sys
root=os.path.realpath(sys.argv[1])
for current,dirs,files in os.walk(root,followlinks=False):
    for name in dirs+files:
        path=os.path.join(current,name)
        if os.path.islink(path):
            resolved=os.path.realpath(path)
            assert os.path.commonpath((root,resolved))==root and os.path.exists(resolved),path
print('RELEASE_LINK_BOUNDARY_PASS',flush=True)
PY
chown -R root:root "$work"
find "$work" -xdev -type d -exec chmod 0755 {} +
find "$work" -xdev ! -type l -exec chmod go-w {} +
[[ -f "$api/dist/server.js" ]] || die 'built server missing'
[[ -z $(find "$work" -xdev \( ! -user root -o ! -group root \) -print -quit) ]] || die 'non-root-owned release content'
[[ -z $(find "$work" -xdev ! -type l \( -perm -0020 -o -perm -0002 \) -print -quit) ]] || die 'writable release content'
[[ $(tr -d '[:space:]' < "$work/COMMIT_SHA") == "$sha" ]] || die 'commit marker mismatch'
[[ $(readlink -f "$base/current") == "$before" ]] || die 'current changed during preparation'
[[ $(systemctl is-active jiuchen-api.service) == active ]] || die 'production API became inactive'
[[ ! -e "$target" && ! -L "$target" ]] || die 'release target appeared; inspect'

mv -T "$work" "$target"
[[ -d "$target" && ! -L "$target" ]] || die 'release move failed'
runuser -u jiuchen-api -- test -x "$target/services/api/dist" || die 'service user cannot traverse final dist'
runuser -u jiuchen-api -- test -r "$target/services/api/dist/server.js" || die 'service user cannot read final server'
runuser -u jiuchen-api -- "$base/runtime/node/bin/node" --check "$target/services/api/dist/server.js" || die 'final service user syntax/access failed'
[[ $(readlink -f "$base/current") == "$before" ]] || die 'current changed during preparation'
printf 'RELEASE_PREPARED=%s\nPRODUCTION_CURRENT_UNCHANGED=%s\n' "$target" "$before"
printf 'No READY/approved-release written; no service restart, database write, or production cutover.\n'
