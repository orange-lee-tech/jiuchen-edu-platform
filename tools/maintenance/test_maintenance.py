import io
import json
from pathlib import Path
import tempfile
import tarfile
import unittest
from types import SimpleNamespace
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
            def dump(remote,temp,target): target.write_bytes(b'-- synthetic dump for resume orchestration test only')
            args=SimpleNamespace(output=str(root),resume_latest=True,host='synthetic-host',pin=True)
            with patch.object(m,'LABELS',{'website':'site','database':'data'}), patch.object(m.getpass,'getpass',return_value=password), patch.object(m,'Remote',return_value=remote), patch.object(m,'dump_database',side_effect=dump), patch('builtins.print'):
                m.backup(args)
            remote.agent.assert_not_called()
            self.assertEqual(encrypted.read_bytes(),original)
            self.assertTrue(json.loads((generation/'receipt.json').read_text())['downloadVerified'])
            self.assertFalse((generation/'PARTIAL').exists())
            self.assertTrue((generation/'PIN').exists())

    def test_remote_source_python36_syntax(self):
        import ast
        ast.parse((m.HERE/'remote_snapshot.py').read_text(), feature_version=(3,6))

if __name__=='__main__': unittest.main()
