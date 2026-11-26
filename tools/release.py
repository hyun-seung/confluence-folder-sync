"""Validate and package only public release files, using Python's standard library."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import zipfile

FILES = ('main.js', 'manifest.json', 'styles.css', 'README.md', 'README.ko.md', 'CHANGELOG.md', 'LICENSE')
SEMVER = r'(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)'


def metadata(root, tag):
    for name in FILES + ('package.json', 'versions.json'):
        file = root / name
        if file.is_symlink() or not file.is_file() or not file.read_bytes():
            raise ValueError('Missing, empty or symlinked public release file: ' + name)
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    versions = json.loads((root / 'versions.json').read_text(encoding='utf-8'))
    if not re.fullmatch(SEMVER, tag or '') or manifest.get('version') != tag or package.get('version') != tag:
        raise ValueError('The exact semantic tag must match manifest.json and package.json')
    plugin_id = manifest.get('id', '')
    if not re.fullmatch(r'[a-z][a-z0-9-]*', plugin_id) or 'obsidian' in plugin_id or plugin_id.endswith('plugin'):
        raise ValueError('Invalid plugin ID')
    minimum = manifest.get('minAppVersion', '')
    if not re.fullmatch(SEMVER, minimum) or versions.get(tag) != minimum:
        raise ValueError('versions.json must record the manifest minimum for this release')
    if manifest.get('isDesktopOnly') is not True or len(manifest.get('description', '')) > 250:
        raise ValueError('Invalid desktop manifest')
    if package.get('license') != 'MIT' or not (root / 'LICENSE').read_text(encoding='utf-8').startswith('MIT License\n'):
        raise ValueError('The MIT license must be included')
    return plugin_id


def asset_names(plugin_id, tag):
    return ('main.js', 'manifest.json', 'styles.css', f'{plugin_id}-{tag}.zip', 'SHA256SUMS.txt')


def checksums(output, names):
    return ''.join(hashlib.sha256((output / name).read_bytes()).hexdigest() + '  ' + name + '\n'
                   for name in sorted(names) if name != 'SHA256SUMS.txt')


def package_release(root, tag, output):
    plugin_id = metadata(root, tag)
    names = asset_names(plugin_id, tag)
    # Refuse to replace any previous directory or its contents.
    output.mkdir(parents=True, exist_ok=False)
    for name in names[:3]:
        (output / name).write_bytes((root / name).read_bytes())
    with zipfile.ZipFile(output / names[3], 'w', compression=zipfile.ZIP_STORED) as archive:
        for name in FILES:
            info = zipfile.ZipInfo(plugin_id + '/' + name, (1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, (root / name).read_bytes())
    (output / 'SHA256SUMS.txt').write_text(checksums(output, names), encoding='utf-8', newline='\n')
    verify_release(root, tag, output)
    return names


def verify_release(root, tag, output):
    plugin_id = metadata(root, tag)
    names = asset_names(plugin_id, tag)
    if output.is_symlink() or {item.name for item in output.iterdir()} != set(names):
        raise ValueError('Unexpected release assets')
    for name in names:
        if (output / name).is_symlink() or not (output / name).is_file():
            raise ValueError('Invalid release asset: ' + name)
    if (output / 'SHA256SUMS.txt').read_bytes() != checksums(output, names).encode('utf-8'):
        raise ValueError('Release checksums differ')
    for name in names[:3]:
        if (output / name).read_bytes() != (root / name).read_bytes():
            raise ValueError('Release asset differs from tagged source: ' + name)
    with zipfile.ZipFile(output / names[3]) as archive:
        expected = [plugin_id + '/' + name for name in FILES]
        if archive.namelist() != expected:
            raise ValueError('Unexpected ZIP contents')
        for name in FILES:
            if archive.read(plugin_id + '/' + name) != (root / name).read_bytes():
                raise ValueError('ZIP differs from tagged source: ' + name)


def release_notes(root, tag):
    text = (root / 'CHANGELOG.md').read_text(encoding='utf-8')
    match = re.search(r'^## ' + re.escape(tag) + r'\n(.*?)(?=^## |\Z)', text, flags=re.M | re.S)
    if not match:
        raise ValueError('CHANGELOG.md has no section for this release')
    return match.group(1).strip() + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--notes', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    if args.verify:
        verify_release(root, args.tag, args.output)
    else:
        notes = release_notes(root, args.tag) if args.notes else None
        if args.notes and args.notes.exists():
            raise ValueError('Refusing to replace release notes')
        package_release(root, args.tag, args.output)
        if args.notes:
            args.notes.parent.mkdir(parents=True, exist_ok=True)
            args.notes.write_text(notes, encoding='utf-8', newline='\n')
    print(json.dumps({'tag': args.tag, 'verified': True, 'assets': list(asset_names(metadata(root, args.tag), args.tag))}))


if __name__ == '__main__':
    main()
