"""Python 3.6 compatible, invoked over SSH; never prints file contents."""
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

ROOT = '/opt/jiuchen-api/staging/maintenance'
COMPONENTS = {
    'website': ['/www/wwwroot/jiuchen-current'],
    'api': ['/opt/jiuchen-api/current'],
    'runtime': ['/opt/jiuchen-api/runtime/node-v22.23.3-linux-x64'],
    'user-files': ['/opt/jiuchen-api/shared/cases'],
    'secrets': ['/etc/jiuchen-api', '/etc/systemd/system/jiuchen-api.service'],
    'entry': ['/etc/nginx', '/clouddream/nginx-proxy-manage/letsencrypt',
              '/clouddream/nginx-proxy-manage/app/index.js',
              '/clouddream/nginx-proxy-manage/data'],
}

def run(args):
    return subprocess.check_output(args, stderr=subprocess.DEVNULL).decode().strip()

def doctor():
    checks = {}
    for name, paths in COMPONENTS.items():
        checks[name] = all(os.path.exists(p) for p in paths)
    checks['api-service'] = subprocess.call(['systemctl', 'is-active', '--quiet', 'jiuchen-api.service']) == 0
    for name, url in [('api-health', 'http://172.25.80.203:3100/health'),
                      ('website-origin', 'http://127.0.0.1:8088/')]:
        try:
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with opener.open(url, timeout=10) as r:
                if name == 'api-health':
                    body = json.load(r)
                    checks[name] = r.status == 200 and body.get('dependencies', {}).get('database') == 'ok'
                else:
                    checks[name] = r.status == 200
        except Exception:
            checks[name] = False
    checks['sqlite-tool'] = shutil.which('sqlite3') is not None
    suggestions = []
    if not checks['api-service']:
        suggestions.append('API process unavailable: inspect service before choosing program restore; keep current secrets and data.')
    elif not checks['api-health']:
        suggestions.append('API/database health failed: distinguish database reachability from program failure; do not overwrite database.')
    if not checks['website-origin']:
        suggestions.append('Website origin failed: inspect origin process and website files before shared entry changes.')
    if all(checks.values()):
        suggestions.append('Known origins healthy. If external access fails, check DNS/TLS/shared proxy; no data restore indicated.')
    print(json.dumps({'checks': checks, 'suggestions': suggestions, 'scope': 'known origins only; external DNS/TLS and business operations not verified'}))

def snapshot(component):
    paths = COMPONENTS[component]
    for p in paths:
        if not os.path.exists(p):
            raise RuntimeError('Missing required asset: ' + p)
    os.makedirs(ROOT, mode=0o700, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='snapshot-', dir=ROOT) as temp:
        sqlite_copy = os.path.join(temp, 'database.sqlite')
        if component == 'entry':
            db = '/clouddream/nginx-proxy-manage/data/database.sqlite'
            subprocess.check_call(['sqlite3', db, ".timeout 10000", ".backup '" + sqlite_copy + "'"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if run(['sqlite3', sqlite_copy, 'PRAGMA integrity_check;']) != 'ok':
                raise RuntimeError('SQLite integrity check failed')
        metadata = {'component': component, 'sources': {p: os.path.realpath(p) for p in paths}}
        meta = os.path.join(temp, 'snapshot.json')
        with open(meta, 'w') as f:
            json.dump(metadata, f)
        def filt(member):
            # Never include sockets or device files. Live SQLite is replaced below.
            if not (member.isfile() or member.isdir() or member.issym() or member.islnk()):
                return None
            if component == 'entry' and member.name in [
                'payload/3/database.sqlite', 'payload/3/database.sqlite-wal',
                'payload/3/database.sqlite-shm', 'payload/3/database.sqlite-journal']:
                return None
            return member
        with tarfile.open(fileobj=sys.stdout.buffer, mode='w|gz') as t:
            t.add(meta, arcname='snapshot.json')
            for i, path in enumerate(paths):
                # Resolve the top-level release pointer; preserve nested symlinks.
                t.add(os.path.realpath(path), arcname='payload/' + str(i), filter=filt)
            if component == 'entry':
                t.add(sqlite_copy, arcname='payload/3/database.sqlite')

if __name__ == '__main__':
    try:
        if sys.argv[1] == 'doctor':
            doctor()
        elif sys.argv[1] == 'snapshot' and sys.argv[2] in COMPONENTS:
            snapshot(sys.argv[2])
        else:
            raise RuntimeError('Unsupported action')
    except Exception as e:
        # Only type is printed: underlying errors may include confidential filenames.
        print('MAINTENANCE_FAILED:' + type(e).__name__, file=sys.stderr)
        sys.exit(1)
