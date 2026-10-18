import io
import json
from pathlib import Path
import tempfile
import tarfile
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import hashlib
import subprocess
import maintain as m

class MaintenanceTests(unittest.TestCase):
    def test_encryption_roundtrip_tamper_and_wrong_password(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp); plain = root/'plain'; encrypted=root/'data.jcb'; out=root/'out'
            plain.write_bytes(b'private synthetic data'*100000)
            m.encrypt(plain, encrypted, 'test-passphrase-long')
            m.decrypt(encrypted, out, 'test-passphrase-long')
            self.assertEqual(plain.read_bytes(), out.read_bytes()); out.unlink()
            with self.assertRaises(Exception):
                m.decrypt(encrypted, out, 'wrong-password')
            self.assertFalse(out.exists())
            data = bytearray(encrypted.read_bytes()); data[50] ^= 1; encrypted.write_bytes(data)
            with self.assertRaises(Exception):
                m.decrypt(encrypted, out, 'test-passphrase-long')
            self.assertFalse(out.exists())

    def test_archive_rejects_traversal_duplicates_devices(self):
        with tempfile.TemporaryDirectory() as temp:
            p=Path(temp)/'test.tar.gz'
            for bad in ['../escape', '/absolute', 'snapshot.json']:
                with tarfile.open(p, 'w:gz') as t:
                    for name in ['snapshot.json', bad]:
                        info=tarfile.TarInfo(name); info.size=2; t.addfile(info, io.BytesIO(b'{}'))
                with self.assertRaises(ValueError): m.validate_tar(p)
            with tarfile.open(p, 'w:gz') as t:
                info=tarfile.TarInfo('snapshot.json'); info.size=2; t.addfile(info, io.BytesIO(b'{}'))
                info=tarfile.TarInfo('device'); info.type=tarfile.CHRTYPE; t.addfile(info)
            with self.assertRaises(ValueError): m.validate_tar(p)

    def test_scope_cannot_cross_restore_data_or_shared_entry(self):
        receipt={'downloadVerified':True, 'components':dict.fromkeys(m.LABELS)}
        self.assertEqual(m.select(SimpleNamespace(scope='website',components='website'),receipt), ['website'])
        for component in ['database','api','entry','secrets']:
            with self.assertRaises(ValueError): m.select(SimpleNamespace(scope='website',components=component),receipt)
        with self.assertRaises(ValueError): m.select(SimpleNamespace(scope='all',components='database'),{'downloadVerified':False})

    def test_rotation_preserves_pinned_and_partial(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            for i in range(5):
                p=root/str(i); p.mkdir(); (p/'receipt.json').write_text(json.dumps({'downloadVerified':i!=0}))
            (root/'1'/'PIN').touch()
            m.retention(root)
            self.assertTrue((root/'0').exists()); self.assertTrue((root/'1').exists()); self.assertFalse((root/'2').exists())
            self.assertEqual(len(list(root.iterdir())),4)

    def test_website_snapshot_contains_real_release_not_empty_pointer(self):
        import remote_snapshot as agent
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); release=root/'release'; release.mkdir()
            (release/'index.html').write_text('synthetic website')
            pointer=root/'current'; pointer.symlink_to(release, target_is_directory=True)
            output=io.BytesIO()
            with patch.dict(agent.COMPONENTS, {'website':[str(pointer)]}), patch.object(agent, 'ROOT', str(root/'scratch')), patch.object(agent.sys, 'stdout', SimpleNamespace(buffer=output)):
                agent.snapshot('website')
            archive=root/'site.tar.gz'; archive.write_bytes(output.getvalue()); m.validate_tar(archive)
            with tarfile.open(archive) as t:
                self.assertEqual(t.extractfile('payload/0/index.html').read(), b'synthetic website')
                metadata=json.load(t.extractfile('snapshot.json'))
                self.assertEqual(metadata['sources'][str(pointer)], str(release))

    def test_cloud_database_hyphen_and_ipv6_are_supported(self):
        config={'host':'db.example.com','port':'3306','user':'synthetic','password':'not-a-real-password','database':'cloudbase-db_1'}
        self.assertEqual(m.validate_db_config(config)['database'], 'cloudbase-db_1')
        self.assertEqual(m.validate_db_config(dict(config, host='[::1]'))['host'], '[::1]')

    def test_unsafe_database_configuration_is_rejected_without_value_disclosure(self):
        config={'host':'db.example.com','port':'3306','user':'synthetic','password':'secret-marker','database':'test-db'}
        for changes in [{'host':'bad:host;evil'}, {'database':'--options'}, {'database':'bad/name'}, {'port':'70000'}, {'password':'secret-marker\nextra'}]:
            with self.assertRaises(m.ConfigError) as error:
                m.validate_db_config(dict(config, **changes))
            self.assertNotIn('secret-marker', str(error.exception))

    def test_resume_authenticates_and_reuses_completed_component(self):
        from unittest.mock import patch, MagicMock
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp); generation=root/'20261016-test'; generation.mkdir()
            plain=root/'plain.tar.gz'
            with tarfile.open(plain,'w:gz') as t:
                info=tarfile.TarInfo('snapshot.json'); info.size=2; t.addfile(info,io.BytesIO(b'{}'))
            password='synthetic-original-password'
            encrypted=generation/'website.jcb'; m.encrypt(plain,encrypted,password)
            original=encrypted.read_bytes()
            receipt={'format':1,'createdUtc':'synthetic','downloadVerified':False,'components':{'website':{'sha256':m.digest(encrypted)}}}
            (generation/'receipt.json').write_text(json.dumps(receipt)); (generation/'PARTIAL').touch()
            remote=MagicMock()
            def dump(remote,temp,target,accept_existing_db_route=False):
                self.assertFalse(accept_existing_db_route)
                target.write_bytes(b'-- synthetic dump for resume orchestration test only')
            args=SimpleNamespace(output=str(root),resume_latest=True,host='synthetic-host',pin=True)
            with patch.object(m,'LABELS',{'website':'site','database':'data'}), patch.object(m.getpass,'getpass',return_value=password), patch.object(m,'Remote',return_value=remote), patch.object(m,'dump_database',side_effect=dump), patch('builtins.print'):
                m.backup(args)
            remote.agent.assert_not_called()
            self.assertEqual(encrypted.read_bytes(),original)
            self.assertTrue(json.loads((generation/'receipt.json').read_text())['downloadVerified'])
            self.assertFalse((generation/'PARTIAL').exists())
            self.assertTrue((generation/'PIN').exists())

    def test_database_errors_reveal_codes_not_credentials(self):
        import subprocess
        cases=[(b"ERROR 1045 (28000): Access denied for user 'secret-user'@'secret-host'",'MYSQL_ERROR_1045'),
               (b"mysqldump: Got error: 1227: secret database",'MYSQL_ERROR_1227'),
               (b"unknown variable ssl-mode=REQUIRED secret-marker",'CLIENT_OPTION_UNSUPPORTED'),
               (b"Connection timed out secret-host",'TIMEOUT')]
        for stderr, code in cases:
            err=m.db_failure('TEST_STEP',subprocess.CompletedProcess([],1,stderr=stderr))
            self.assertEqual(str(err),'TEST_STEP:'+code)
            self.assertNotIn('secret',str(err))

    def test_docker_client_mounts_only_configuration_and_keeps_tls(self):
        args=m.mysql_command('docker','mysqldump',Path('/synthetic/mysql.cnf'),['--single-transaction','synthetic-db'])
        self.assertIn('--pull=never',args)
        self.assertIn('--network=host',args)
        self.assertIn('--read-only',args)
        self.assertEqual(args[args.index('--entrypoint')+1],'mysqldump')
        self.assertIn('--defaults-extra-file=/run/jiuchen.cnf',args)
        self.assertFalse(any('ssl-mode=DISABLED' in x for x in args))
        self.assertEqual(sum(x=='--mount' for x in args),1)

    def test_dump_uses_mysqldump_options_and_cleans_config(self):
        with tempfile.TemporaryDirectory() as temp:
            config=Path(temp)/'mysql.cnf'; config.write_text('[client]\n')
            output=Path(temp)/'database.sql'
            def fake_run(stage, args, **kwargs):
                self.assertEqual(stage,'MYSQLDUMP_FULL_EXPORT')
                self.assertNotIn('--connect-timeout=15',args)
                for required in ['--single-transaction','--quick','--routines','--events',
                                 '--triggers','--hex-blob','--no-tablespaces','--set-gtid-purged=OFF']:
                    self.assertIn(required,args)
                kwargs['stdout'].write(b'-- synthetic SQL')
            with patch.object(m,'mysql_backend',return_value='local'), \
                 patch.object(m,'mysql_config',return_value=(config,'synthetic-db')), \
                 patch.object(m,'database_connection_check'), patch.object(m,'db_run',side_effect=fake_run):
                m.dump_database(None,temp,output)
            self.assertFalse(config.exists())
            self.assertTrue(output.stat().st_size)

    def test_mysql_greeting_tls_bit_and_malformed_packets(self):
        greeting = b'\x0a8.0.0\x00' + b'1234' + b'12345678' + b'\x00'
        self.assertFalse(m.mysql_greeting_has_tls(greeting+b'\x00\x00'))
        self.assertTrue(m.mysql_greeting_has_tls(greeting+b'\x00\x08'))
        for packet in [b'', b'\x09bad\x00', greeting+b'\x00']:
            with self.assertRaises(m.ConfigError): m.mysql_greeting_has_tls(packet)

    def test_no_tls_only_allowed_at_same_ecs_interface(self):
        config={'host':'172.25.80.203','port':3306,'user':'test-user',
                'password':'secret-synthetic','database':'test-db'}
        remote=MagicMock(host='synthetic-ssh',socket='/tmp/synthetic.sock')
        expected_hash=hashlib.sha256(config['host'].encode()).hexdigest()
        remote.run.side_effect=[subprocess.CompletedProcess([],0,stdout=json.dumps(config).encode()),
                                subprocess.CompletedProcess([],0,stdout=json.dumps({'hostHash':expected_hash,'onInterface':True}).encode())]
        with tempfile.TemporaryDirectory() as temp, patch.object(m,'db_run'), patch.object(m,'mysql_server_has_tls',return_value=False), patch('builtins.print'):
            path,db=m.mysql_config(remote,temp)
            self.assertEqual(db,'test-db')
            self.assertIn('ssl-mode=DISABLED',path.read_text())
            self.assertEqual(path.stat().st_mode & 0o777,0o600)
            self.assertIn('password="secret-synthetic"',path.read_text())
        remote.run.side_effect=[subprocess.CompletedProcess([],0,stdout=json.dumps(config).encode()),
                                subprocess.CompletedProcess([],0,stdout=json.dumps({'hostHash':expected_hash,'onInterface':False}).encode())]
        with tempfile.TemporaryDirectory() as temp, patch.object(m,'db_run'), patch.object(m,'mysql_server_has_tls',return_value=False), patch('builtins.print'):
            with self.assertRaisesRegex(m.ConfigError,'DB_TLS_UNAVAILABLE_REMOTE_ENDPOINT'):
                m.mysql_config(remote,temp)
            self.assertFalse((Path(temp)/'mysql.cnf').exists())
        remote.run.side_effect=[subprocess.CompletedProcess([],0,stdout=json.dumps(config).encode()),
                                subprocess.CompletedProcess([],0,stdout=json.dumps({'hostHash':expected_hash,'onInterface':False}).encode())]
        with tempfile.TemporaryDirectory() as temp, patch.object(m,'db_run'), patch.object(m,'mysql_server_has_tls',return_value=False), patch('builtins.print') as shown:
            path,_=m.mysql_config(remote,temp,accept_existing_db_route=True)
            self.assertIn('ssl-mode=DISABLED',path.read_text())
            self.assertTrue(any('EXISTING_PRODUCTION_DB_ROUTE_NO_TLS_EXPLICIT' in str(call)
                                for call in shown.call_args_list))
        remote.run.side_effect=[subprocess.CompletedProcess([],0,stdout=json.dumps(config).encode()),
                                subprocess.CompletedProcess([],0,stdout=json.dumps({'hostHash':'0'*64,'onInterface':False}).encode())]
        with tempfile.TemporaryDirectory() as temp, patch.object(m,'db_run'), patch.object(m,'mysql_server_has_tls',return_value=False), patch('builtins.print'):
            with self.assertRaisesRegex(m.ConfigError,'DB_CONFIG_CHANGED_DURING_CHECK'):
                m.mysql_config(remote,temp,accept_existing_db_route=True)

    def test_tls_capable_server_keeps_required_mode(self):
        config={'host':'db.example.test','port':3306,'user':'test-user','password':'secret','database':'test-db'}
        remote=MagicMock(host='synthetic-ssh',socket='/tmp/synthetic.sock')
        remote.run.return_value=subprocess.CompletedProcess([],0,stdout=json.dumps(config).encode())
        with tempfile.TemporaryDirectory() as temp, patch.object(m,'db_run'), patch.object(m,'mysql_server_has_tls',return_value=True), patch('builtins.print'):
            path,_=m.mysql_config(remote,temp)
            self.assertIn('ssl-mode=REQUIRED',path.read_text())
            self.assertEqual(remote.run.call_count,1)

    def test_mariadb_client_uses_existing_image_without_pull(self):
        import subprocess
        from unittest.mock import patch
        def run(args,**kwargs):
            if args[0] in ['mysql','mysqldump']:
                return subprocess.CompletedProcess(args,0,stdout=b'mysql Ver 15.1 Distrib 10.11-MariaDB',stderr=b'')
            self.assertEqual(args,['docker','image','inspect','mysql:8.0'])
            return subprocess.CompletedProcess(args,0,stdout=b'',stderr=b'')
        with patch.object(m.subprocess,'run',side_effect=run),patch('builtins.print'):
            self.assertEqual(m.mysql_backend(),'docker')

    def test_remote_source_python36_syntax(self):
        import ast
        ast.parse((m.HERE/'remote_snapshot.py').read_text(), feature_version=(3,6))

if __name__=='__main__': unittest.main()
