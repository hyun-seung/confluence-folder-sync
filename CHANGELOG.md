# Changelog

## 0.4.0

- Follow the Obsidian interface language, with English and Korean overrides in settings.
- Translate settings, dashboard controls, confirmations, notices, known plugin errors, and generated report text.
- Add a full Korean usage guide and bilingual release notes.
- Distribute the three standard Obsidian release assets plus an optional installation ZIP and SHA-256 checksums.
- Verify 14 automated fixtures, both languages in the Chromium dashboard workflow, and native macOS language/command switching in Obsidian 1.14.5.

## 0.3.1

- Preserve unchanged page bodies when a verified baseline is migrated from a different Markdown formatter.
- Document release installation, upgrades, migration, current limits, and pending platform checks.
- Verify macOS installation in Obsidian 1.14.5, including SecretStorage access, direct account connection, page listing, version comparison, and change preview.
- Verify an actual synthetic page import and check its downloaded files against their expected SHA-256 hashes.

## 0.3.0

- Apply selected incoming text changes to linked local notes after matching the context and rechecking both versions.
- Save a local backup before applying a selection.
- Detect attachment additions, version changes, renames, and removals during preview.
- Download versioned attachment binaries into imported copies and snapshots.

## 0.2.0

- Open the dashboard from a ribbon button or command.
- Compare two Confluence page versions.
- Download a full current snapshot or one page's latest copy.
- Retain source originals and existing imported copies.

## Verification

- Automated fixture coverage includes publishing, conflict handling, version comparison, selective local updates, attachment metadata changes, and credential boundaries.
- Chromium fixture checks cover the dashboard controls, selection application, backups, snapshot cancellation, and local attachments.
- Downloads of synthetic Confluence attachments were checked against their expected SHA-256 hashes.
- Native Windows and Linux installation and workflow verification are pending.
