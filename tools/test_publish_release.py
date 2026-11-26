from pathlib import Path
import unittest

from release import package_release
from publish_release import publish_release
import test_release
import contextlib
import io
import hashlib


class FakeGitHub:
    def __init__(self, commit):
        self.commit = commit
        self.entry = None
        self.files = {}
        self.uploaded = []
        self.published = False
        self.verified = []
        self.fail_verification = False
        self.move_tag_after_verification = False
        self.replace_asset_after_verification = False

    def tag_commit(self, tag):
        return self.commit

    def release(self, tag):
        if self.entry is None:
            return None
        return {**self.entry, 'id': 'release-fixture', 'assets': [{'name': name, 'id': 'asset-' + name, 'size': len(data), 'digest': hashlib.sha256(data).hexdigest(), 'updatedAt': 'fixture-time'} for name, data in self.files.items()]}

    def create(self, tag, commit, notes):
        self.entry = {'isDraft': True, 'targetCommitish': commit}

    def download(self, tag, output):
        for name, data in self.files.items():
            (output / name).write_bytes(data)

    def upload(self, tag, file):
        if file.name in self.files:
            raise AssertionError('Existing asset would be overwritten')
        self.files[file.name] = file.read_bytes()
        self.uploaded.append(file.name)

    def verify(self, tag, commit, file):
        if self.fail_verification:
            raise RuntimeError('Temporary provenance failure')
        self.verified.append(file.name)
        if self.replace_asset_after_verification:
            self.files['main.js'] = b'Replaced during provenance verification'
        if self.move_tag_after_verification:
            self.commit = 'b' * 40

    def publish(self, tag):
        self.entry['isDraft'] = False
        self.published = True


class PublicationTests(unittest.TestCase):
    def setUp(self):
        fixture = test_release.PackagingTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.root = fixture.root
        self.output = fixture.base / 'assets'
        self.notes = fixture.base / 'notes.md'
        self.notes.write_text('Release notes', encoding='utf-8')
        package_release(self.root, '1.2.3', self.output)
        self.commit = 'a' * 40
        self.github = FakeGitHub(self.commit)

    def publish(self):
        with contextlib.redirect_stdout(io.StringIO()):
            publish_release(self.root, '1.2.3', self.output, self.notes, self.commit, self.github)

    def test_checked_publication_and_idempotent_rerun(self):
        self.publish()
        self.assertTrue(self.github.published)
        self.assertEqual(len(self.github.verified), 5)
        uploads = list(self.github.uploaded)
        self.publish()
        self.assertEqual(self.github.uploaded, uploads)

    def test_partial_draft_resumes_without_replacing_existing_assets(self):
        self.github.create('1.2.3', self.commit, self.notes)
        self.github.files['main.js'] = (self.output / 'main.js').read_bytes()
        self.publish()
        self.assertNotIn('main.js', self.github.uploaded)
        self.assertEqual(len(self.github.uploaded), 4)
        self.assertTrue(self.github.published)

    def test_failed_verification_leaves_draft_and_retry_can_finish(self):
        self.github.fail_verification = True
        with self.assertRaises(RuntimeError):
            self.publish()
        self.assertTrue(self.github.entry['isDraft'])
        self.assertFalse(self.github.published)
        uploads = list(self.github.uploaded)
        self.github.fail_verification = False
        self.publish()
        self.assertEqual(self.github.uploaded, uploads)

    def test_moved_tag_is_rejected_before_creation_and_before_publication(self):
        self.github.commit = 'b' * 40
        with self.assertRaises(ValueError):
            self.publish()
        self.assertIsNone(self.github.entry)
        self.github.commit = self.commit
        self.github.move_tag_after_verification = True
        with self.assertRaises(ValueError):
            self.publish()
        self.assertFalse(self.github.published)

    def test_unrelated_or_altered_release_is_not_modified(self):
        self.github.entry = {'isDraft': True, 'targetCommitish': 'b' * 40}
        with self.assertRaises(ValueError):
            self.publish()
        self.github.entry['targetCommitish'] = self.commit
        self.github.files['main.js'] = b'Other contents'
        with self.assertRaises(ValueError):
            self.publish()
        self.assertEqual(self.github.uploaded, [])
        self.assertEqual(self.github.files['main.js'], b'Other contents')

    def test_remote_asset_replacement_after_download_blocks_publication(self):
        self.github.replace_asset_after_verification = True
        with self.assertRaisesRegex(ValueError, 'remote release changed'):
            self.publish()
        self.assertFalse(self.github.published)
