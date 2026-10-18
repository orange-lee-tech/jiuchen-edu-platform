#!/usr/bin/env python3
"""Administrator-side WSL CLI. Production credentials never enter console output."""
import argparse
import getpass
import hashlib
import json
import re
import ipaddress
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
        self.base = ['ssh', '-S', self.socket, '-o', 'ConnectTimeout=15', '-o', 'ConnectionAttempts=1', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2', '-o', 'ControlMaster=auto', '-o', 'ControlPersist=120', host]
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

# This runs on the ECS and returns only a hash and a boolean. A DB address on a
# local ECS interface has no off-host DB leg after the administrator's SSH tunnel.
DB_LOCAL_INTERFACE_JS = """process.loadEnvFile('/etc/jiuchen-api/production.env');
const e=process.env,crypto=require('node:crypto'),net=require('node:net'),os=require('node:os');
const h=e.DATABASE_URL?new URL(e.DATABASE_URL).hostname:e.DB_HOST;
if(!h)process.exit(2);
const host=h.replace(/^\\[|\\]$/g,'');
const hash=crypto.createHash('sha256').update(h).digest('hex');
const local=new Set(Object.values(os.networkInterfaces()).flat().filter(Boolean).map(x=>x.address));
process.stdout.write(JSON.stringify({hostHash:hash,onInterface:!!net.isIP(host)&&local.has(host)}))"""

class ConfigError(ValueError):
    """Only fixed, credential-free messages may be used here."""


def db_failure(stage, result):
    # Classify in memory; never echo stderr, SQL, credentials, hostnames or argv.
    detail = (result.stderr or b'').decode('utf-8', errors='replace') if isinstance(result.stderr, bytes) else (result.stderr or '')
    lower = detail.lower()
    code = re.search(r'(?:error\s*:?|got error\s*:)\s*(\d{4})\b', detail, re.I)
    if code:
        reason = 'MYSQL_ERROR_' + code.group(1)
    elif 'unknown option' in lower or 'unknown variable' in lower:
        reason = 'CLIENT_OPTION_UNSUPPORTED'
    elif 'permission denied' in lower:
        reason = 'ACCESS_DENIED'
    elif 'timed out' in lower or 'timeout' in lower:
        reason = 'TIMEOUT'
    elif result.returncode == 255:
        reason = 'SSH_TRANSPORT_FAILED'
    else:
        reason = 'EXIT_' + str(result.returncode)
    return ConfigError(stage + ':' + reason)


def db_run(stage, args, **kwargs):
    print('DB_STEP=' + stage, flush=True)
    try:
        result = subprocess.run(args, stderr=subprocess.PIPE, **kwargs)
    except FileNotFoundError:
        raise ConfigError(stage + ':CLIENT_NOT_INSTALLED')
    except subprocess.TimeoutExpired:
        raise ConfigError(stage + ':TIMEOUT')
    if result.returncode:
        raise db_failure(stage, result)
    return result


def mysql_backend():
    supported = True
    for program in ['mysql', 'mysqldump']:
        try:
            result = subprocess.run([program, '--no-defaults', '--version'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
            version = result.stdout.decode('utf-8', errors='replace')
            supported = supported and result.returncode == 0 and 'mariadb' not in version.lower() and bool(re.search(r'\b(?:Ver|Distrib)\s+8\.', version))
        except (FileNotFoundError, subprocess.TimeoutExpired):
            supported = False
    if supported:
        print('DB_CLIENT_BACKEND=local-mysql8', flush=True)
        return 'local'
    # Use only the pre-existing WSL image as an ephemeral client, not a DB server.
    # No image download, daemon/network change or ECS Docker operation.
    db_run('LOCAL_MYSQL8_IMAGE', ['docker', 'image', 'inspect', 'mysql:8.0'], stdout=subprocess.DEVNULL, timeout=20)
    print('DB_CLIENT_BACKEND=existing-docker-mysql8-client', flush=True)
    return 'docker'


def mysql_command(backend, program, cnf, options):
    if backend == 'local':
        return [program, '--defaults-extra-file=' + str(cnf)] + options
    return ['docker', 'run', '--rm', '--pull=never', '--network=host', '--read-only',
            '--cap-drop=ALL', '--security-opt=no-new-privileges', '--pids-limit=64',
            '--memory=256m', '--cpus=1', '--mount',
            'type=bind,source=' + str(cnf) + ',target=/run/jiuchen.cnf,readonly',
            '--entrypoint', program, 'mysql:8.0', '--defaults-extra-file=/run/jiuchen.cnf'] + options

def validate_db_config(db):
    for field in ['host', 'user', 'password', 'database']:
        if not isinstance(db.get(field), str) or any(ord(c) < 32 or ord(c) == 127 for c in db[field]):
            raise ConfigError('DB_CONFIG_INVALID_' + field.upper())
    if not all(db[k] for k in ['host', 'user', 'database']):
        raise ConfigError('DB_CONFIG_REQUIRED_FIELD_EMPTY')
    # Database names are passed as separate argv values, never interpolated into SQL.
    # MySQL database names commonly contain hyphens (including CloudBase names).
    if len(db['database']) > 64 or not re.fullmatch(r'[\w$-]+', db['database']):
        raise ConfigError('DB_DATABASE_NAME_UNSUPPORTED')
    if db['database'].startswith('-'):
        raise ConfigError('DB_DATABASE_NAME_OPTION_PREFIX')
    host = db['host']
    try:
        address = ipaddress.ip_address(host.strip('[]'))
        host = '[' + str(address) + ']' if address.version == 6 else str(address)
    except ValueError:
        if not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?', host) or '..' in host:
            raise ConfigError('DB_HOST_UNSUPPORTED')
    try:
        port = int(db['port'])
        if not 1 <= port <= 65535:
            raise ValueError()
    except (KeyError, ValueError, TypeError):
        raise ConfigError('DB_PORT_INVALID')
    return dict(db, host=host, port=port)


def mysql_greeting_has_tls(packet):
    # MySQL protocol v10 handshake: lower two capability bytes follow the
    # NUL-terminated version, connection id, salt and filler. CLIENT_SSL=0x0800.
    if not packet or packet[0] != 10:
        raise ConfigError('DB_TLS_GREETING_INVALID')
    end = packet.find(b'\0', 1)
    capability = end + 1 + 4 + 8 + 1
    if end < 0 or len(packet) < capability + 2:
        raise ConfigError('DB_TLS_GREETING_INVALID')
    return bool(int.from_bytes(packet[capability:capability + 2], 'little') & 0x0800)


def mysql_server_has_tls(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=10) as connection:
            connection.settimeout(10)
            def take(size):
                data = bytearray()
                while len(data) < size:
                    part = connection.recv(size - len(data))
                    if not part:
                        raise ConfigError('DB_TLS_GREETING_TRUNCATED')
                    data.extend(part)
                return bytes(data)
            header = take(4)
            length = int.from_bytes(header[:3], 'little')
            if not 20 <= length <= 4096:
                raise ConfigError('DB_TLS_GREETING_INVALID')
            return mysql_greeting_has_tls(take(length))
    except (OSError, socket.timeout):
        raise ConfigError('DB_TLS_GREETING_UNAVAILABLE')


def db_on_ecs_interface(remote, db):
    try:
        result = remote.run(['/usr/bin/env', '-i', '/opt/jiuchen-api/runtime/node-v22.23.3-linux-x64/bin/node',
                             '-e', DB_LOCAL_INTERFACE_JS], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        answer = json.loads(result.stdout)
        if answer['hostHash'] != hashlib.sha256(db['host'].encode()).hexdigest():
            raise ConfigError('DB_CONFIG_CHANGED_DURING_CHECK')
        return answer['onInterface'] is True
    except ConfigError:
        raise
    except (subprocess.CalledProcessError, ValueError, KeyError, TypeError):
        raise ConfigError('DB_LOCAL_INTERFACE_CHECK_FAILED')


def mysql_config(remote, temp, accept_existing_db_route=False):
    print('DB_STEP=REMOTE_CONFIG_READ', flush=True)
    try:
        r = remote.run(['/usr/bin/env', '-i', '/opt/jiuchen-api/runtime/node-v22.23.3-linux-x64/bin/node', '-e', DB_JS], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except subprocess.CalledProcessError as exc:
        raise db_failure('REMOTE_CONFIG_READ', exc)
    try:
        db = validate_db_config(json.loads(r.stdout))
    except json.JSONDecodeError:
        raise ConfigError('DB_CONFIG_PROJECTION_NOT_JSON')
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
    db_run('SSH_TUNNEL_CREATE', ['ssh', '-S', remote.socket, '-O', 'forward', '-L', '127.0.0.1:%s:%s:%s' % (port, db['host'], int(db['port'])), remote.host], stdout=subprocess.DEVNULL, timeout=20)
    path = Path(temp) / 'mysql.cnf'
    def quote(v):
        return '"' + str(v).replace('\\', '\\\\').replace('"', '\\"') + '"'
    if mysql_server_has_tls(port):
        mode = 'REQUIRED'
        print('DB_TRANSPORT=MYSQL_TLS_REQUIRED', flush=True)
    else:
        if not db_on_ecs_interface(remote, db):
            if not accept_existing_db_route:
                raise ConfigError('DB_TLS_UNAVAILABLE_REMOTE_ENDPOINT')
            print('DB_TRANSPORT=EXISTING_PRODUCTION_DB_ROUTE_NO_TLS_EXPLICIT', flush=True)
        else:
            print('DB_TRANSPORT=SSH_TUNNEL_TO_ECS_LOCAL_INTERFACE', flush=True)
        mode = 'DISABLED'
    path.write_text('[client]\nprotocol=tcp\nhost=127.0.0.1\nport=%s\nuser=%s\npassword=%s\nssl-mode=%s\n' % (port, quote(db['user']), quote(db['password']), mode))
    path.chmod(0o600)
    return path, db['database']

def database_connection_check(backend, cnf, db):
    query = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' AND (engine IS NULL OR engine<>'InnoDB');"
    r = db_run('MYSQL_CONNECT_AND_ENGINE_CHECK', mysql_command(backend, 'mysql', cnf,
        ['--connect-timeout=15', '--batch', '--skip-column-names', '-e', query, db]), stdout=subprocess.PIPE, timeout=45)
    if r.stdout.strip() != b'0':
        raise ConfigError('MYSQL_ENGINE_CHECK:NON_INNODB_REQUIRES_CONSISTENCY_PLAN')


def dump_database(remote, temp, target, accept_existing_db_route=False):
    backend = mysql_backend()
    cnf, db = mysql_config(remote, temp, accept_existing_db_route)
    try:
        database_connection_check(backend, cnf, db)
        with open(target, 'xb') as out:
            db_run('MYSQLDUMP_FULL_EXPORT', mysql_command(backend, 'mysqldump', cnf,
                ['--connect-timeout=15', '--single-transaction', '--quick', '--routines', '--events', '--triggers', '--hex-blob', '--no-tablespaces', '--set-gtid-purged=OFF', '--column-statistics=0', '--default-character-set=utf8mb4', db]), stdout=out)
        if target.stat().st_size == 0:
            raise ConfigError('MYSQLDUMP_FULL_EXPORT:EMPTY_OUTPUT')
    finally:
        cnf.unlink(missing_ok=True)


def db_check(args):
    backend = mysql_backend()
    with tempfile.TemporaryDirectory(prefix='jiuchen-db-check-') as temp:
        remote = Remote(args.host, temp)
        try:
            cnf, db = mysql_config(remote, temp, args.accept_existing_db_route)
            try:
                database_connection_check(backend, cnf, db)
            finally:
                cnf.unlink(missing_ok=True)
        finally:
            remote.close()
    print('DB_READONLY_CONNECTION_CHECK_PASS')
    print('Only connectivity and table-engine checks passed; export permissions and restore are not yet verified.')

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

def write_receipt(generation, receipt):
    pending = generation / 'receipt.pending'
    pending.write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
    os.replace(pending, generation / 'receipt.json')

def backup(args):
    root = Path(args.output).expanduser().resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    # Require Linux permissions, e.g. WSL ext4. Windows-mounted public Desktop is unsuitable.
    if str(root).startswith('/mnt/'):
        raise ValueError('Use WSL home directory, not a Windows-mounted shared folder')
    resume = getattr(args, 'resume_latest', False)
    if resume:
        candidates = sorted(p for p in root.iterdir() if not p.is_symlink() and p.is_dir() and (p / 'PARTIAL').is_file() and (p / 'receipt.json').is_file())
        if not candidates:
            raise ConfigError('NO_PARTIAL_BACKUP_TO_RESUME')
        generation = candidates[-1]
        receipt = json.loads((generation / 'receipt.json').read_text())
        if receipt.get('downloadVerified') or receipt.get('format') != 1:
            raise ConfigError('INVALID_PARTIAL_RECEIPT')
        password = getpass.getpass('输入上次未完成备份的原密码：')
        print('续传目录：' + str(generation), flush=True)
    else:
        password = getpass.getpass('新备份密码（至少12字符）：')
        if len(password) < 12 or getpass.getpass('再次输入：') != password:
            raise ConfigError('BACKUP_PASSWORD_MISMATCH_OR_TOO_SHORT')
        generation = root / (time.strftime('%Y%m%d-%H%M%S', time.gmtime()) + '-' + secrets.token_hex(3))
        generation.mkdir(mode=0o700)
        (generation / '管理员必读.txt').write_text(NOTICE)
        receipt = {'format': 1, 'createdUtc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                   'downloadVerified': False, 'productionBackupRestored': False,
                   'fullBusinessCoverage': False, 'coveragePending': ['external persistent objects', 'website additional database/dependencies', 'live business-file consistency'], 'components': {}}
    (generation / 'PARTIAL').touch()
    write_receipt(generation, receipt)
    try:
        with tempfile.TemporaryDirectory(prefix='jiuchen-') as temp:
            # Verify retained components before opening SSH. A wrong password stops here.
            for component in receipt['components']:
                if component not in LABELS:
                    raise ConfigError('UNKNOWN_PARTIAL_COMPONENT')
                source = generation / (component + '.jcb')
                if digest(source) != receipt['components'][component]['sha256']:
                    raise ConfigError('RETAINED_COMPONENT_CHECKSUM_MISMATCH')
                restored = Path(temp) / 'retained'
                decrypt(source, restored, password)
                if component != 'database':
                    validate_tar(restored)
                restored.unlink()
                print('已验证，复用：' + component, flush=True)
            if resume:
                receipt['resumedUtc'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
                receipt['coveragePending'] = sorted(set(receipt.get('coveragePending', []) + ['resumed components captured at different times']))
            remote = Remote(args.host, temp)
            try:
                for component in LABELS:
                    if component in receipt['components']:
                        continue
                    print('备份：' + component + ' / ' + LABELS[component], flush=True)
                    plain = Path(temp) / 'component'
                    if component == 'database':
                        dump_database(remote, temp, plain, getattr(args, 'accept_existing_db_route', False))
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
                    write_receipt(generation, receipt)
            finally:
                remote.close()
        receipt['downloadVerified'] = True
        write_receipt(generation, receipt)
        (generation / 'PARTIAL').unlink(missing_ok=True)
        if args.pin:
            (generation / 'PIN').touch()
        # Coverage incomplete => retain all existing successful backups. No automatic deletion.
        print('KNOWN_COMPONENTS_DOWNLOAD_VERIFIED: ' + str(generation))
        print('完整业务覆盖与隔离恢复尚待验证；本次不自动清理旧备份。')
    except (Exception, KeyboardInterrupt):
        (generation / 'PARTIAL').touch()
        write_receipt(generation, receipt)
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
    dc = sub.add_parser('db-check'); dc.add_argument('--host', required=True)
    dc.add_argument('--accept-existing-db-route', action='store_true')
    d = sub.add_parser('doctor'); d.add_argument('--host', required=True)
    b = sub.add_parser('backup'); b.add_argument('--host', required=True); b.add_argument('--output', required=True); b.add_argument('--pin', action='store_true'); b.add_argument('--resume-latest', action='store_true')
    b.add_argument('--accept-existing-db-route', action='store_true')
    for name in ['plan', 'stage']:
        s = sub.add_parser(name); s.add_argument('--backup', required=True); s.add_argument('--scope', choices=SCOPES, required=True); s.add_argument('--components', required=True)
        if name == 'stage':
            s.add_argument('--host', required=True)
    args = p.parse_args()
    if args.command == 'backup':
        backup(args)
    elif args.command == 'db-check':
        db_check(args)
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
        print('FAILED: ' + (str(exc) if isinstance(exc, ConfigError) else type(exc).__name__) + '；已停止。保留现役服务，勿重复覆盖。', file=sys.stderr)
        sys.exit(1)
