"""Download a pinned official Obsidian desktop build for disposable CI tests only."""
import hashlib
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import tempfile

VERSION = "1.14.5"
ASSETS = {
    "Linux": ("obsidian-1.14.5.tar.gz", "1bc6547c889d7d02c3f2c5b55884cba14980bfac4ada32c0bdc6ec6db542aaf8"),
    "Windows": ("Obsidian-1.14.5.exe", "4b95aa855062fb253439c392a32b536c3f9f22ac7fad04f1a6cbf176ecbcfa2a"),
}


def main():
    if os.environ.get("CI") != "true" or not os.environ.get("GITHUB_ENV"):
        raise SystemExit("This downloader is restricted to disposable GitHub Actions runners.")
    system = platform.system()
    name, expected = ASSETS[system]
    root = Path(tempfile.mkdtemp(prefix="cfs-obsidian-"))
    archive = root / name
    url = f"https://github.com/obsidianmd/obsidian-releases/releases/download/v{VERSION}/{name}"
    subprocess.run(["curl", "--fail", "--location", "--retry", "3", "--output", str(archive), url], check=True)
    with archive.open("rb") as source:
        actual = hashlib.file_digest(source, "sha256").hexdigest()
    if actual != expected:
        raise SystemExit("Official desktop download checksum mismatch.")
    extracted = root / "app"
    extracted.mkdir()
    if system == "Linux":
        with tarfile.open(archive) as source:
            source.extractall(extracted, filter="data")
        executables = list(extracted.rglob("obsidian"))
    else:
        seven = shutil.which("7z") or r"C:\Program Files\7-Zip\7z.exe"
        subprocess.run([seven, "x", str(archive), f"-o{extracted}", "-y"], check=True, stdout=subprocess.DEVNULL)
        payloads = list(extracted.rglob("app-64.7z"))
        if len(payloads) != 1:
            raise SystemExit("Expected exactly one x64 Windows application payload.")
        app = root / "desktop"
        subprocess.run([seven, "x", str(payloads[0]), f"-o{app}", "-y"], check=True, stdout=subprocess.DEVNULL)
        executables = list(app.rglob("Obsidian.exe"))
    executables = [path for path in executables if path.is_file()]
    if len(executables) != 1:
        raise SystemExit("Expected exactly one desktop executable.")
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as env:
        env.write(f"OBSIDIAN_EXECUTABLE={executables[0]}\n")
    print(f"Verified official Obsidian {VERSION} ({system}, SHA256 {expected}).")


if __name__ == "__main__":
    main()
