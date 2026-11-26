"""Publish or resume a checked draft without replacing existing release assets."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile

from release import asset_names, metadata, verify_release


class GitHub:
    def __init__(self, repository):
        self.repository = repository

    def run(self, *args):
        process = subprocess.run(['gh', *args], capture_output=True, text=True)
        if process.returncode:
            raise RuntimeError(process.stderr.strip() or 'GitHub command failed')
        return process.stdout.strip()

    def tag_commit(self, tag):
        return self.run('api', f'repos/{self.repository}/commits/{tag}', '--jq', '.sha')

    def release(self, tag):
        try:
            return json.loads(self.run('release', 'view', tag, '--repo', self.repository,
                                       '--json', 'id,isDraft,targetCommitish,assets'))
        except RuntimeError as error:
            if str(error) == 'release not found':
                return None
            raise

    def create(self, tag, commit, notes):
        self.run('release', 'create', tag, '--repo', self.repository, '--target', commit,
                 '--verify-tag', '--draft', '--title', tag, '--notes-file', str(notes))

    def download(self, tag, output):
        self.run('release', 'download', tag, '--repo', self.repository, '--dir', str(output))

    def upload(self, tag, file):
        self.run('release', 'upload', tag, str(file), '--repo', self.repository)

    def verify(self, tag, commit, file):
        self.run('attestation', 'verify', str(file), '--repo', self.repository,
                 '--signer-workflow', self.repository + '/.github/workflows/release.yml',
                 '--source-ref', 'refs/tags/' + tag, '--source-digest', commit)

    def publish(self, tag):
        self.run('release', 'edit', tag, '--repo', self.repository, '--draft=false', '--latest')


def publish_release(root, tag, assets, notes, commit, github):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise ValueError('Expected the full source commit')
    names = asset_names(metadata(root, tag), tag)
    verify_release(root, tag, assets)

    def check_tag():
        if github.tag_commit(tag) != commit:
            raise ValueError('The remote tag changed; release publication stopped')

    def check_release(release):
        if not release or release.get('targetCommitish') != commit:
            raise ValueError('Existing release is not bound to this exact commit')
        existing = [asset['name'] for asset in release.get('assets', [])]
        if len(existing) != len(set(existing)) or not set(existing).issubset(names):
            raise ValueError('Unexpected remote release assets')
        return set(existing)

    def snapshot(release):
        check_release(release)
        if not release.get('id'):
            raise ValueError('Missing remote release identity')
        assets = []
        for asset in release.get('assets', []):
            if not asset.get('id') or not asset.get('updatedAt'):
                raise ValueError('Missing remote asset identity')
            assets.append(tuple(asset.get(key) for key in ('name', 'id', 'size', 'digest', 'updatedAt')))
        return (release['id'], release['isDraft'], release['targetCommitish'], sorted(assets))

    check_tag()
    release = github.release(tag)
    if release is None:
        github.create(tag, commit, notes)
        release = github.release(tag)
    existing = check_release(release)
    # A partial upload can be resumed, but no existing file is ever replaced.
    if existing:
        with tempfile.TemporaryDirectory(prefix='confluence-existing-') as directory:
            output = Path(directory)
            github.download(tag, output)
            if {file.name for file in output.iterdir()} != existing:
                raise ValueError('Remote release contents changed while downloading')
            for name in existing:
                if (output / name).is_symlink() or (output / name).read_bytes() != (assets / name).read_bytes():
                    raise ValueError('Existing asset differs; refusing to replace it: ' + name)
    missing = set(names) - existing
    if missing and not release['isDraft']:
        raise ValueError('A published release is incomplete; refusing to change it')
    for name in names:
        if name in missing:
            github.upload(tag, assets / name)
    latest = github.release(tag)
    if check_release(latest) != set(names):
        raise ValueError('Remote release is incomplete')
    verified_state = snapshot(latest)
    with tempfile.TemporaryDirectory(prefix='confluence-verified-') as directory:
        output = Path(directory)
        github.download(tag, output)
        verify_release(root, tag, output)
        for name in names:
            github.verify(tag, commit, output / name)
    check_tag()
    final = github.release(tag)
    if snapshot(final) != verified_state:
        raise ValueError('The remote release changed during verification; publication stopped')
    if final['isDraft']:
        github.publish(tag)
    check_tag()
    print(json.dumps({'tag': tag, 'commit': commit, 'published': True, 'verifiedAssets': len(names)}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--repo', required=True)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--notes', type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repo):
        raise ValueError('Invalid GitHub repository')
    root = Path(__file__).resolve().parent.parent
    publish_release(root, args.tag, args.assets, args.notes, args.commit, GitHub(args.repo))


if __name__ == '__main__':
    main()
