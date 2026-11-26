import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from release import FILES, package_release, verify_release


class PackagingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / 'source'
        self.root.mkdir()
        for name in FILES:
            (self.root / name).write_text('Synthetic public ' + name, encoding='utf-8')
        (self.root / 'manifest.json').write_text(json.dumps({'id': 'confluence-fixture', 'version': '1.2.3',
            'minAppVersion': '1.14.0', 'isDesktopOnly': True, 'description': 'Publish notes.'}), encoding='utf-8')
        (self.root / 'package.json').write_text(json.dumps({'version': '1.2.3', 'license': 'MIT'}), encoding='utf-8')
        (self.root / 'versions.json').write_text(json.dumps({'1.2.3': '1.14.0'}), encoding='utf-8')
        (self.root / 'LICENSE').write_text('MIT License\nSynthetic fixture.', encoding='utf-8')

    def test_reproducible_archive_excludes_private_and_untracked_files(self):
        (self.root / 'data.json').write_text('PRIVATE FIXTURE', encoding='utf-8')
        (self.root / '.env').write_text('PRIVATE FIXTURE', encoding='utf-8')
        one, two = self.base / 'one', self.base / 'two'
        names = package_release(self.root, '1.2.3', one)
        package_release(self.root, '1.2.3', two)
        self.assertEqual(len(names), 5)
        for name in names:
            self.assertEqual((one / name).read_bytes(), (two / name).read_bytes())
        with zipfile.ZipFile(one / names[3]) as archive:
            self.assertEqual(len(archive.namelist()), len(FILES))
            self.assertNotIn(b'PRIVATE FIXTURE', b''.join(archive.read(name) for name in archive.namelist()))

    def test_tag_version_and_compatibility_must_match(self):
        for tag in ('v1.2.3', '1.2.4', '1.2.3-rc1', '../1.2.3', '01.2.3'):
            with self.assertRaises(ValueError):
                package_release(self.root, tag, self.base / 'invalid')
        (self.root / 'versions.json').write_text('{}', encoding='utf-8')
        with self.assertRaises(ValueError):
            package_release(self.root, '1.2.3', self.base / 'invalid')

    def test_license_and_symlinked_inputs_are_rejected(self):
        (self.root / 'LICENSE').unlink()
        with self.assertRaises(ValueError):
            package_release(self.root, '1.2.3', self.base / 'invalid')
        target = self.base / 'private'
        target.write_text('MIT License\nPRIVATE FIXTURE', encoding='utf-8')
        (self.root / 'LICENSE').symlink_to(target)
        with self.assertRaises(ValueError):
            package_release(self.root, '1.2.3', self.base / 'invalid')

    def test_existing_output_is_never_replaced(self):
        output = self.base / 'existing'
        output.mkdir()
        (output / 'keep').write_text('Keep me', encoding='utf-8')
        with self.assertRaises(FileExistsError):
            package_release(self.root, '1.2.3', output)
        self.assertEqual((output / 'keep').read_text(), 'Keep me')

    def test_modified_assets_checksums_and_extra_files_fail_verification(self):
        output = self.base / 'release'
        package_release(self.root, '1.2.3', output)
        original = (output / 'main.js').read_bytes()
        (output / 'main.js').write_bytes(b'Altered')
        with self.assertRaises(ValueError):
            verify_release(self.root, '1.2.3', output)
        (output / 'main.js').write_bytes(original)
        (output / 'extra').write_text('Extra', encoding='utf-8')
        with self.assertRaises(ValueError):
            verify_release(self.root, '1.2.3', output)


if __name__ == '__main__':
    unittest.main()
