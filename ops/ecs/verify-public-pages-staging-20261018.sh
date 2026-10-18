#!/usr/bin/env bash
# Read-only candidate verification on the shared Jiuchen ECS. No production env,
# database connection, current symlink, website, proxy or active service change.
set -euo pipefail
umask 077

sha=858aa6a5bebbdb88346c6282f691b4976886b935
expected=0c316a8582a56c61c89bc8081b0669167b31baee85e0b5f1361bcda7bc089180
production=8cc4bb85ffdf3e86e7a13a89d119f1b110491e48
base=/opt/jiuchen-api
incoming="$base/staging/incoming/$sha"
archive="$incoming/jiuchen-api-$sha-readonly.tar.gz"
manifest="$incoming/manifest.json"
nodebin="$base/runtime/node-v22.23.3-linux-x64/bin/node"

die() { printf 'BLOCKED: %s\n' "$*" >&2; exit 1; }
[[ $(id -u) -eq 0 ]] || die 'run as root on ECS'
id jiuchen-deploy >/dev/null 2>&1 || die 'dedicated jiuchen-deploy user missing'
for cmd in python3 sha256sum systemd-run systemctl npm; do command -v "$cmd" >/dev/null || die "missing $cmd"; done
[[ -f "$archive" && ! -L "$archive" && -f "$manifest" && ! -L "$manifest" ]] || die 'uploaded archive/manifest missing or linked'
[[ -x "$nodebin" ]] || die 'pinned Node 22 runtime missing'
"$nodebin" -e 'if(process.versions.node.split(".")[0]!=="22")process.exit(1)' || die 'Node 22 required'
printf '%s  %s\n' "$expected" "$archive" | sha256sum -c - || die 'archive digest mismatch'

before=$(readlink -f "$base/current")
[[ "$before" == "$base/releases/"* ]] || die 'current release outside expected path'
[[ $(systemctl is-active jiuchen-api.service) == active ]] || die 'production API not active; stop for diagnosis'
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
[[ "$available" =~ ^[0-9]+$ && "$available" -ge 870400 ]] || die 'less than 850 MiB available; do not build alongside production'

work="$base/staging/verify-$sha-$(date -u +%Y%m%d-%H%M%S)-$$"
mkdir -m 0700 "$work"
printf 'VERIFY_DIRECTORY=%s\n' "$work"

python3 - "$archive" "$manifest" "$work" "$sha" "$expected" "$production" <<'PY'
import hashlib,json,os,pathlib,sys,tarfile
archive,manifest,root,sha,digest,production=sys.argv[1:]
with open(manifest,encoding='utf-8') as source:
    data=json.load(source)
assert data['candidateSha']==sha
assert data['sha256']==digest
assert data['sourceProductionSha']==production
assert data['status']=='REVIEW_ARTIFACT_ONLY_NOT_PRODUCTION_APPROVED'
assert data['privateEnvironmentIncluded'] is False
assert data['privateCasesIncluded'] is False
assert data['nodeModulesIncluded'] is False
assert data['distIncluded'] is False
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
printf '===== BOUNDED ECS BUILD =====\n'
build_result=$(systemd-run --unit="jiuchen-stage-build-$stamp" --wait --pipe \
  -p User=jiuchen-deploy \
  -p MemoryAccounting=yes -p MemoryLimit=768M -p CPUQuota=50% -p TasksMax=128 \
  -p RuntimeMaxSec=900 -p "WorkingDirectory=$api" \
  /usr/bin/env -i PATH="$taskpath" NODE_OPTIONS=--max-old-space-size=512 \
  npm_config_cache="$work/.npm-cache" \
  /bin/bash -c 'set -euo pipefail; npm ci --no-audit --no-fund; npm run typecheck; npm run build; echo ECS_TYPECHECK_AND_BUILD_PASS' 2>&1) || {
    printf '%s\n' "$build_result"; die 'bounded build failed';
  }
printf '%s\n' "$build_result"
[[ "$build_result" == *ECS_TYPECHECK_AND_BUILD_PASS* ]] || die 'build success marker missing'

cat > "$api/staging-smoke.mjs" <<'JS'
import {readFileSync} from 'node:fs'
import {buildApp} from './dist/app.js'
import {loadEnv} from './dist/config/env.js'

function controllerFile(controller,name){
  const line=readFileSync('/proc/self/cgroup','utf8').split('\n').find(row=>row.split(':')[1]?.split(',').includes(controller))
  if(!line)throw new Error('cgroup_controller_missing_'+controller)
  const group=line.split(':').slice(2).join(':')
  const roots=controller==='cpu'?['cpu','cpu,cpuacct','cpuacct,cpu']:[controller]
  for(const root of roots){
    try{return readFileSync('/sys/fs/cgroup/'+root+group+'/'+name,'utf8').trim()}
    catch(error){if(error?.code!=='ENOENT')throw error}
  }
  throw new Error('cgroup_metric_missing_'+controller+'_'+name)
}
const limit=Number(controllerFile('memory','memory.limit_in_bytes'))
const quota=Number(controllerFile('cpu','cpu.cfs_quota_us'))
const period=Number(controllerFile('cpu','cpu.cfs_period_us'))
const maxTasks=Number(controllerFile('pids','pids.max'))
if(!(limit>0&&limit<=256*1024*1024&&quota>0&&quota/period<=0.5&&maxTasks>0&&maxTasks<=64))
  throw new Error('kernel_limits_not_enforced')
const app=buildApp(loadEnv({NODE_ENV:'production'}))
try{
  const config=(await app.inject('/health/config')).json().config
  for(const key of ['databaseUrlConfigured','splitDatabaseConfigComplete','assessmentBackgroundExecution',
    'assessmentAiConfigured','scheduleAiConfigured','customerAiConfigured'])
    if(config[key])throw new Error('unsafe_config_'+key)
  const address=await app.listen({host:'127.0.0.1',port:0})
  let peakRss=0
  for(let i=0;i<30;i++){
    const response=await fetch(address+'/health')
    const data=await response.json()
    if(response.status!==200||data.dependencies.database!=='not_configured')
      throw new Error('unexpected_health')
    peakRss=Math.max(peakRss,process.memoryUsage().rss)
  }
  const peak=Number(controllerFile('memory','memory.max_usage_in_bytes'))
  const failcnt=Number(controllerFile('memory','memory.failcnt'))
  if(!(peak>0&&peak<limit&&failcnt===0))throw new Error('kernel_memory_exceeded_or_unmeasured')
  console.log(JSON.stringify({status:'ECS_KERNEL_256M_NO_DB_SMOKE_PASS',requests:30,
    memoryLimitBytes:limit,memoryPeakBytes:peak,memoryFailcnt:failcnt,
    cpuQuotaFraction:quota/period,tasksMax:maxTasks,peakSampledRssBytes:peakRss,
    databaseConfigured:false}))
}finally{await app.close()}
JS
chown jiuchen-deploy:jiuchen-deploy "$api/staging-smoke.mjs"

printf '===== 256 MiB / 50%% CPU / 64 TASKS SMOKE =====\n'
smoke_result=$(systemd-run --unit="jiuchen-stage-smoke-$stamp" --wait --pipe \
  -p User=jiuchen-deploy \
  -p MemoryAccounting=yes -p MemoryLimit=256M -p CPUAccounting=yes -p CPUQuota=50% \
  -p TasksAccounting=yes -p TasksMax=64 -p RuntimeMaxSec=60 -p "WorkingDirectory=$api" \
  /usr/bin/env -i PATH="$taskpath" "$nodebin" --max-old-space-size=160 staging-smoke.mjs 2>&1) || {
    printf '%s\n' "$smoke_result"; die 'bounded smoke failed';
  }
printf '%s\n' "$smoke_result"
[[ "$smoke_result" == *ECS_KERNEL_256M_NO_DB_SMOKE_PASS* ]] || die 'kernel limit smoke marker missing'

after=$(readlink -f "$base/current")
[[ "$after" == "$before" ]] || die 'production current changed during verification'
[[ $(systemctl is-active jiuchen-api.service) == active ]] || die 'production API became inactive'
printf 'PRODUCTION_CURRENT_UNCHANGED=%s\nVERIFY_DIRECTORY=%s\nECS_CANDIDATE_STAGING_PASS\n' "$after" "$work"
printf 'Real DB/AI load, production promotion, payment and device acceptance remain pending.\n'
