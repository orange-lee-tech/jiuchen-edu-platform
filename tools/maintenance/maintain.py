#!/usr/bin/env python3
"""Administrator-side WSL CLI. Production credentials never enter console output."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import shlex
import shutil
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

HERE = Path(__file__).resolve().parent
MAGIC = b'JIUCHEN1'
LABELS = {
    'website': '网站程序与静态资源；可能包含发布时写入的个人资料',
    'api': '小程序服务端程序；可能包含内置案例、历史误放的配置',
    'runtime': 'Node 运行时',
    'user-files': '用户/私有案例业务文件（敏感个人资料）',
    'secrets': '系统密钥与运行配置（高度敏感）',
    'entry': '共享入口、证书私钥、代理账号配置（高度敏感）',
    'database': '全部业务数据库：用户档案、课表、评估等个人资料（高度敏感）',
}
SCOPES = {'website': {'website'}, 'miniprogram': {'api', 'user-files', 'database', 'runtime'},
          'all': set(LABELS)}

def call(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def key(password, salt):
    return Scrypt(salt=salt, length=32, n=32768, r=8, p=1).derive(password.encode())

def encrypt(source, target, password):
    salt, nonce = secrets.token_bytes(16), secrets.token_bytes(12)
    header = MAGIC + salt + nonce
    enc = Cipher(algorithms.AES(key(password, salt)), modes.GCM(nonce)).encryptor()
    enc.authenticate_additional_data(header)
    with open(source, 'rb') as src, open(target, 'xb') as out:
        os.chmod(target, 0o600)
        out.write(header)
        for data in iter(lambda: src.read(1024 * 1024), b''):
            out.write(enc.update(data))
        out.write(enc.finalize())
        out.write(enc.tag)

def decrypt(source, target, password):
    try:
        with open(source, 'rb') as src:
            header = src.read(36)
            if header[:8] != MAGIC or source.stat().st_size < 52:
                raise ValueError('Invalid backup envelope')
            src.seek(-16, 2)
            tag = src.read(16)
            dec = Cipher(algorithms.AES(key(password, header[8:24])), modes.GCM(header[24:], tag)).decryptor()
            dec.authenticate_additional_data(header)
            src.seek(36)
            remaining = source.stat().st_size - 52
            with open(target, 'xb') as out:
                os.chmod(target, 0o600)
                while remaining:
                    data = src.read(min(1024 * 1024, remaining))
                    if not data:
                        raise ValueError('Truncated backup')
                    remaining -= len(data)
                    out.write(dec.update(data))
                out.write(dec.finalize())
    except Exception:
        target.unlink(missing_ok=True)
        raise

def validate_tar(path):
    names = set()
    with tarfile.open(path, 'r:gz') as t:
        for m in t:
            p = PurePosixPath(m.name)
            if p.is_absolute() or '..' in p.parts or m.name in names:
                raise ValueError('Unsafe or duplicate archive member')
            if not (m.isfile() or m.isdir() or m.issym() or m.islnk()):
                raise ValueError('Unsupported archive member')
            # Internal symlinks are preserved but never followed/extracted by the client.
            names.add(m.name)
        if 'snapshot.json' not in names:
            raise ValueError('Snapshot metadata absent')

def retention(root):
    backups = []
    for p in root.iterdir():
        if p.is_dir() and (p / 'receipt.json').is_file():
            r = json.loads((p / 'receipt.json').read_text())
            if r.get('downloadVerified') is True:
                backups.append(p)
    backups.sort(key=lambda p: p.name)
    victims = [p for p in backups if not (p / 'PIN').exists()]
    excess = len(backups) - 3
    if excess > len(victims):
        raise RuntimeError('All older backups pinned: retention needs administrator review')
    # Called only after current backup is completely downloaded and authenticated.
    for p in victims[:max(0, excess)]:
        shutil.rmtree(p)

class Remote:
    def __init__(self, host, temp):
        if not host or host.startswith('-') or any(c.isspace() for c in host):
            raise ValueError('Invalid SSH destination')
        self.host = host
        self.socket = str(Path(temp) / 'ssh.sock')
        self.base = ['ssh', '-S', self.socket, '-o', 'ControlMaster=auto', '-o', 'ControlPersist=120', host]
        call(self.base + ['true'])
    def run(self, args, **kwargs):
        return call(self.base + [shlex.join(args)], **kwargs)
    def agent(self, action, component=None, **kwargs):
        args = ['python3', '-', action] + ([component] if component else [])
        with open(HERE / 'remote_snapshot.py', 'rb') as code:
            return self.run(args, stdin=code, **kwargs)
    def close(self):
        subprocess.run(['ssh', '-S', self.socket, '-O', 'exit', self.host], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# Secrets are projected through the encrypted SSH pipe directly into administrator memory.
# They are never printed or passed on a process command line.
DB_JS = """process.loadEnvFile('/etc/jiuchen-api/production.env');
const e=process.env; let o;
if(e.DATABASE_URL){let u=new URL(e.DATABASE_URL);if(!['mysql:','mysql2:'].includes(u.protocol))throw Error('protocol');o={host:u.hostname,port:u.port||3306,user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:decodeURIComponent(u.pathname.slice(1))}}
else{o={host:e.DB_HOST,port:e.DB_PORT||3306,user:e.DB_USER,password:e.DB_PASSWORD,database:e.DB_NAME}}
if(!o.host||!o.user||!o.database||o.password===undefined)throw Error('incomplete');
process.stdout.write(JSON.stringify(o))"""

def mysql_config(remote, temp):
    r = remote.run(['/usr/bin/env', '-i', '/opt/jiuchen-api/runtime/node-v22.23.3-linux-x64/bin/node', '-e', DB_JS], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    db = json.loads(r.stdout)
    if not all(isinstance(db[k], str) and '\n' not in db[k] and '\r' not in db[k] for k in ['host','user','password','database']):
        raise ValueError('Unsupported database configuration')
    if not db['database'].replace('_', '').isalnum() or not db['host'].replace('.', '').replace('-', '').isalnum():
        raise ValueError('Unsupported database or host identifier')
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    call(['ssh', '-S', remote.socket, '-O', 'forward', '-L', '127.0.0.1:%s:%s:%s' % (port, db['host'], int(db['port'])), remote.host], stdout=subprocess.DEVNULL)
    path = Path(temp) / 'mysql.cnf'
    def quote(v):
        return '"' + str(v).replace('\\', '\\\\').replace('"', '\\"') + '"'
    path.write_text('[client]\nprotocol=tcp\nhost=127.0.0.1\nport=%s\nuser=%s\npassword=%s\nssl-mode=REQUIRED\n' % (port, quote(db['user']), quote(db['password'])))
    path.chmod(0o600)
    return path, db['database']

def dump_database(remote, temp, target):
    cnf, db = mysql_config(remote, temp)
    # Never accept non-transactional tables as a consistent live snapshot.
    query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' AND (engine IS NULL OR engine<>'InnoDB');"
    r = call(['mysql', '--defaults-extra-file=' + str(cnf), '--batch', '--skip-column-names', db, '-e', query], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    if r.stdout.strip() != b'0':
        raise RuntimeError('Non-InnoDB source: controlled consistency procedure required')
    with open(target, 'xb') as out:
        call(['mysqldump', '--defaults-extra-file=' + str(cnf), '--single-transaction', '--quick', '--routines', '--events', '--triggers', '--hex-blob', '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--default-character-set=utf8mb4', db], stdout=out, stderr=subprocess.DEVNULL)
    if target.stat().st_size == 0:
        raise RuntimeError('Empty SQL backup')
    cnf.unlink()

NOTICE = '''此目录含加密的生产资料，请妥善管理。
database.jcb：用户档案、课表、评估等数据库个人资料。
user-files.jcb：用户/私有案例业务文件。
secrets.jcb：环境变量、API密钥和运行配置。
entry.jcb：证书私钥、代理账号及共享入口配置。
api.jcb、website.jcb 也可能包含内置个人资料或历史配置。
所有 .jcb 均需保密；不要发到聊天、Git、CI、公共网盘。
密码请与备份分开保管；忘记密码无法解密。数据恢复会丢失备份时间后的变化。
本工具只证明文件下载和认证完整，不代表数据库恢复或完整业务恢复已经演练。
'''

def backup(args):
    root = Path(args.output).expanduser().resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    # Require Linux permissions, e.g. WSL ext4. Windows-mounted public Desktop is unsuitable.
    if str(root).startswith('/mnt/'):
        raise ValueError('Use WSL home directory, not a Windows-mounted shared folder')
    password = getpass.getpass('新备份密码（至少12字符）：')
    if len(password) < 12 or getpass.getpass('再次输入：') != password:
        raise ValueError('Passphrase mismatch or too short')
    generation = root / (time.strftime('%Y%m%d-%H%M%S', time.gmtime()) + '-' + secrets.token_hex(3))
    generation.mkdir(mode=0o700)
    (generation / '管理员必读.txt').write_text(NOTICE)
    receipt = {'format': 1, 'createdUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
               'downloadVerified': False, 'productionBackupRestored': False,
               'fullBusinessCoverage': False, 'coveragePending': ['external persistent objects', 'website additional database/dependencies', 'live business-file consistency'], 'components': {}}
    try:
        with tempfile.TemporaryDirectory(prefix='jiuchen-') as temp:
            remote = Remote(args.host, temp)
            try:
                for component in LABELS:
                    print('备份：' + component + ' / ' + LABELS[component], flush=True)
                    plain = Path(temp) / 'component'
                    if component == 'database':
                        dump_database(remote, temp, plain)
                    else:
                        with open(plain, 'xb') as out:
                            remote.agent('snapshot', component, stdout=out)
                        validate_tar(plain)
                    encrypted = generation / (component + '.jcb')
                    encrypt(plain, encrypted, password)
                    check = Path(temp) / 'verify'
                    decrypt(encrypted, check, password)
                    if digest(plain) != digest(check):
                        raise RuntimeError('Roundtrip integrity mismatch')
                    check.unlink()
                    plain.unlink()
                    receipt['components'][component] = {'sha256': digest(encrypted), 'bytes': encrypted.stat().st_size, 'containsSensitiveData': component != 'runtime', 'description': LABELS[component]}
            finally:
                remote.close()
        receipt['downloadVerified'] = True
        (generation / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
        if args.pin:
            (generation / 'PIN').touch()
        # Coverage incomplete => retain all existing successful backups. No automatic deletion.
        print('KNOWN_COMPONENTS_DOWNLOAD_VERIFIED: ' + str(generation))
        print('完整业务覆盖与隔离恢复尚待验证；本次不自动清理旧备份。')
    except (Exception, KeyboardInterrupt):
        (generation / 'PARTIAL').touch()
        (generation / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
        raise

def select(args, receipt):
    chosen = set(args.components.split(','))
    if not chosen or not chosen <= SCOPES[args.scope]:
        raise ValueError('Component selection exceeds requested scope; shared secrets/entry require scope all')
    if not receipt.get('downloadVerified') or not chosen <= set(receipt['components']):
        raise ValueError('Backup is partial or selected components are absent')
    return sorted(chosen)

def plan(args):
    generation = Path(args.backup).resolve()
    receipt = json.loads((generation / 'receipt.json').read_text())
    chosen = select(args, receipt)
    password = getpass.getpass('备份密码：')
    with tempfile.TemporaryDirectory(prefix='jiuchen-verify-') as temp:
        for c in chosen:
            source = generation / (c + '.jcb')
            if digest(source) != receipt['components'][c]['sha256']:
                raise ValueError('Encrypted component checksum mismatch')
            dest = Path(temp) / c
            decrypt(source, dest, password)
            if c != 'database':
                validate_tar(dest)
        report = {'scope': args.scope, 'components': chosen, 'backupCreatedUtc': receipt['createdUtc'],
                  'productionWrites': False, 'defaultKeep': sorted(set(LABELS) - set(chosen)),
                  'databasePolicy': 'isolated restore first; no production SQL import',
                  'sharedEntryPolicy': 'review per-route diff before production apply',
                  'status': 'VERIFIED_PLAN_ONLY'}
        if args.command == 'stage':
            with tempfile.TemporaryDirectory(prefix='jiuchen-upload-') as transport:
                remote = Remote(args.host, transport)
                try:
                    stage = '/opt/jiuchen-api/staging/maintenance/restore-' + secrets.token_hex(12)
                    remote.run(['install', '-d', '-m', '0700', stage])
                    for c in chosen:
                        # Raw decrypted archives go only to protected staging, never current.
                        with open(Path(temp) / c, 'rb') as data:
                            remote.run(['bash', '-c', 'umask 077; set -e; cat > ' + shlex.quote(stage + '/' + c + ('.sql' if c == 'database' else '.tar.gz'))], stdin=data)
                        localhash = digest(Path(temp) / c)
                        output = remote.run(['sha256sum', stage + '/' + c + ('.sql' if c == 'database' else '.tar.gz')], stdout=subprocess.PIPE).stdout.decode().split()[0]
                        if output != localhash:
                            raise RuntimeError('Remote stage checksum mismatch')
                    report['stage'] = stage
                    report['status'] = 'STAGED_NOT_APPLIED'
                finally:
                    remote.close()
        print(json.dumps(report, ensure_ascii=False, indent=2))

def rehearse(args):
    generation = Path(args.backup).resolve()
    receipt = json.loads((generation / 'receipt.json').read_text())
    if not receipt.get('downloadVerified') or 'database' not in receipt['components']:
        raise ValueError('Verified database backup required')
    source = generation / 'database.jcb'
    if digest(source) != receipt['components']['database']['sha256']:
        raise ValueError('Database checksum mismatch')
    # Never download an image implicitly. WSL must have the already-approved local image.
    call(['docker', 'image', 'inspect', 'mysql:8.0'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    password = getpass.getpass('备份密码：')
    name = 'jiuchen-rehearse-' + secrets.token_hex(8)
    database_password = secrets.token_hex(24)
    with tempfile.TemporaryDirectory(prefix='jiuchen-rehearse-') as temp:
        sql = Path(temp) / 'database.sql'
        decrypt(source, sql, password)
        env = Path(temp) / 'mysql.env'
        env.write_text('MYSQL_ROOT_PASSWORD=' + database_password + '\nMYSQL_DATABASE=recovery_test\n')
        cnf = Path(temp) / 'mysql.cnf'
        cnf.write_text('[client]\nprotocol=tcp\nhost=127.0.0.1\nuser=root\npassword=' + database_password + '\n')
        created = False
        try:
            call(['docker', 'create', '--name', name, '--label', 'jiuchen.maintenance=rehearsal',
                  '--network', 'none', '--memory', '768m', '--cpus', '1', '--pids-limit', '256',
                  '--env-file', str(env), 'mysql:8.0', '--event-scheduler=OFF'], stdout=subprocess.DEVNULL)
            created = True
            call(['docker', 'cp', str(cnf), name + ':/tmp/rehearsal.cnf'], stdout=subprocess.DEVNULL)
            call(['docker', 'start', name], stdout=subprocess.DEVNULL)
            ready = False
            for _ in range(120):
                result = subprocess.run(['docker', 'exec', name, 'mysqladmin', '--defaults-extra-file=/tmp/rehearsal.cnf', 'ping', '--silent'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                if result.returncode == 0:
                    ready = True
                    break
                time.sleep(1)
            if not ready:
                raise RuntimeError('Isolated MySQL startup timeout')
            with open(sql, 'rb') as data:
                call(['docker', 'exec', '-i', name, 'mysql', '--defaults-extra-file=/tmp/rehearsal.cnf', 'recovery_test'], stdin=data, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            call(['docker', 'exec', name, 'mysqlcheck', '--defaults-extra-file=/tmp/rehearsal.cnf', '--check', 'recovery_test'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            result = call(['docker', 'exec', name, 'mysql', '--defaults-extra-file=/tmp/rehearsal.cnf', '--batch', '--skip-column-names', '-e', "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='recovery_test';"], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            count = int(result.stdout.strip())
            if count < 1:
                raise RuntimeError('No restored tables')
            report = {'status': 'ISOLATED_SQL_IMPORT_AND_CHECK_PASS', 'tables': count,
                      'productionWrites': False, 'businessAcceptance': False,
                      'note': 'SQL import and physical table checks only; source row equivalence and API migrations still require validation'}
            print(json.dumps(report, ensure_ascii=False, indent=2))
            (generation / 'isolated-restore.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        finally:
            if created:
                # Only this invocation's random, isolated container and its anonymous volumes.
                call(['docker', 'rm', '-f', '-v', name], stdout=subprocess.DEVNULL)

def main():
    os.umask(0o077)
    p = argparse.ArgumentParser(description='九辰管理员备份与救火工具（WSL）')
    sub = p.add_subparsers(dest='command', required=True)
    r = sub.add_parser('rehearse-db'); r.add_argument('--backup', required=True)
    d = sub.add_parser('doctor'); d.add_argument('--host', required=True)
    b = sub.add_parser('backup'); b.add_argument('--host', required=True); b.add_argument('--output', required=True); b.add_argument('--pin', action='store_true')
    for name in ['plan', 'stage']:
        s = sub.add_parser(name); s.add_argument('--backup', required=True); s.add_argument('--scope', choices=SCOPES, required=True); s.add_argument('--components', required=True)
        if name == 'stage':
            s.add_argument('--host', required=True)
    args = p.parse_args()
    if args.command == 'backup':
        backup(args)
    elif args.command == 'rehearse-db':
        rehearse(args)
    elif args.command == 'doctor':
        with tempfile.TemporaryDirectory(prefix='jiuchen-doctor-') as temp:
            remote = Remote(args.host, temp)
            try:
                r = remote.agent('doctor', stdout=subprocess.PIPE)
                print(json.dumps(json.loads(r.stdout), ensure_ascii=False, indent=2))
            finally:
                remote.close()
    else:
        plan(args)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('已停止；未完成备份不能用于恢复。', file=sys.stderr)
        sys.exit(130)
    except Exception as exc:
        # Do not echo subprocess stderr, credentials, source paths or production payloads.
        print('FAILED: ' + type(exc).__name__ + '；已停止。保留现役服务，勿重复覆盖。', file=sys.stderr)
        sys.exit(1)
