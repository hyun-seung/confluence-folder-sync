# Reproducible desktop and UI checks

English · [한국어](README.ko.md)

These tests use synthetic notes, account identifiers and remote responses. Never point them at a personal vault or copy private plugin data into this directory. Test dependencies live here; the shipped plugin and root build have no npm dependencies.

From the repository root, using Node.js 26:

```sh
npm ci --ignore-scripts --offline --no-audit --no-fund
npm test
npm ci --ignore-scripts --prefix testing --no-audit --no-fund
npm test --prefix testing
python3 -m unittest discover -s tools -p 'test_*.py' -v
```

The first `npm ci` is offline. Installing the separate testing dependencies needs npm registry access. Lifecycle scripts are disabled. Run `npm run build` before standalone UI/native tests when the source changes.

## Browser fixtures

Install Chrome/Chromium or set `CHROME_PATH` to its executable. `puppeteer-core` does not download a browser. The runner discovers standard macOS, Windows and Linux installations and fails if none exists. It creates a temporary Chrome profile, blocks external page requests, loads the committed runtime and CSS, then runs English and Korean at 1280px and 390px. The narrow viewport verifies responsive desktop dialogs; mobile Obsidian is not supported.

The real Chromium DOM uses a small Obsidian UI shim and an in-memory vault/Confluence service. Scenarios cover selected publication, version differences, selected local edits and backups, conflict resolution, restoration, attachment imports, and mapping reconnection/cancellation/recovery/source migration. Page errors fail the test. These are browser fixtures, not native Obsidian checks or live Confluence integration tests.

## Native desktop fixtures

Set `OBSIDIAN_EXECUTABLE` to an existing Obsidian desktop executable, then run:

```sh
npm run test:native --prefix testing
```

The runner creates a new temporary user-data profile and vault, installs the unchanged plugin assets and a test-only API probe, and connects to that instance through [Puppeteer CDP](https://pptr.dev/api/puppeteer.puppeteer.connect). It verifies the actual vault path before enabling plugins or writing notes. The fixture trust prompt is accepted only in this isolated instance. The probe is never packaged. The profile and vault are removed after the app closes.

The native scenario uses real Plugin, Modal, Setting, Vault, SecretStorage and rename events. It checks English/Korean controls, selected local application, backup contents and guarded restoration, binary attachment bytes, page-ID preservation through a rename, and state/secret access after reloading the plugin. Remote responses and user confirmation are synthetic. SecretStorage checks prove API round trips, not OS keychain security, app-restart persistence or live Atlassian authentication. This suite does not test the Windows installer UI, signing, or every window manager/keyring combination.

CI downloads official Obsidian **1.14.5** [release assets](https://github.com/obsidianmd/obsidian-releases/releases/tag/v1.14.5) with hard-coded SHA256 checksums. Windows uses 7-Zip to extract the verified x64 application without running an installer. Linux extracts the official tarball and uses Xvfb. `--no-sandbox` is added only on disposable Linux CI runners; tests use no credentials or real documents. The downloader refuses to run outside GitHub Actions. Local runs use an explicitly selected installed executable, whose authenticity remains the maintainer's responsibility.

Every push/PR runs Node and Chromium fixtures on all three operating systems plus actual Obsidian on Windows and Linux. Tag release CI uses the same checks. Runner browser and desktop/API versions appear in logs. A failed or unavailable native run fails CI; it is never silently counted as a pass. See the workflow run for the exact commit and platform results.

## Verified checkpoint — 2026-11-26

[CI run 45769956255](https://github.com/hyun-seung/confluence-folder-sync/actions/runs/45769956255) passed all nine jobs at commit `db03cf22fea4fee605c55d0a236d0dcb50ffe8f1`:

| Check | macOS | Windows | Linux |
| --- | --- | --- | --- |
| Node checks (60) | Passed | Passed | Passed |
| Chromium: en/ko × 1280/390px | Passed | Passed | Passed |
| Real Obsidian 1.14.5: en/ko | Passed locally | Passed in CI | Passed in CI |

The packaging job also passed all 12 Python checks and package validation. Native logs report API version `1.14.5` and success for SecretStorage round trips, selected edits/restoration, binary imports, rename events and plugin reload. The public runtime remains 0.6.3; this checkpoint changes development infrastructure only. Native macOS was run separately with the installed official desktop executable and a disposable profile.
