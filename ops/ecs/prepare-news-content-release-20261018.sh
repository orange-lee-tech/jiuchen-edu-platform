#!/usr/bin/env bash
# Build a new immutable Jiuchen API release from the verified fixed archive.
# Does not read production secrets, write the database, or switch current.
set -euo pipefail
umask 077

sha=50e7fe3d7f93a347dfdc4af0675992690eb01e6f
digest=64f58071e86fcdf292810a82314117148232a5fd64ccd38d4a730635c288fe6d
expected_current=8cc4bb85ffdf3e86e7a13a89d119f1b110491e48
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
