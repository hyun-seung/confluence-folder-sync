# Development roadmap

English · [한국어](ROADMAP.ko.md) · [Usage guide](README.md)

Current release: **0.9.0** adds Markdown fidelity and optional offline Mermaid PNG/source publishing. Previous work includes a bilingual staged connection wizard, read-only checks, explicit guarded settings saves and redacted diagnostics; 0.7.0 read efficiency and fresh write checks remain. This document proposes the next work; the items below are not implemented or scheduled. Version 0.6.0 adds verified reconnection, source-root migration and completed-operation recovery to selective publication, text conflict resolution, tracked local moves, operation history and guarded backup restoration, and optional automatic checks/publication. See [CHANGELOG.md](CHANGELOG.md) for delivered work.

## Recommended order

| Priority | Work | Current limit | Completion criteria |
| --- | --- | --- | --- |
| 1 | Multiple configurations and team setup | State is separated by target/source, but settings expose one active configuration. Sharing a publisher's `data.json` exposes private metadata and is not a setup workflow. | Provide named configurations and a validated export/import format without secrets or personal document paths; clearly distinguish publishing and read-only installations and detect conflicting ownership. |

Public UI fixtures and native synthetic platform checks completed on 2026-11-26: local macOS Obsidian 1.14.5 plus official Windows/Linux desktop builds. All [nine CI jobs](https://github.com/hyun-seung/confluence-folder-sync/actions/runs/45769956255) passed. The [test guide](testing/README.md) records scope and limits. Version 0.7.0 adds large-folder read efficiency and rate-limit handling. A 1,000-note/110-folder automatic check reduces calls from 3,162 to 1,162; see the [benchmark scope and reproduction guide](testing/PERFORMANCE.md). Version 0.8.0 adds connection setup and diagnostics UI. Version 0.9.0 adds Markdown fidelity and optional offline Mermaid PNG/source publishing. Next is **multiple configurations and team setup**. Mapping/recovery management shipped in 0.6.0; CI and tag-based attested packaging shipped in 0.6.2. Richer word-level differences, conflict navigation and an incoming-review queue can follow after these foundations.

## Community directory status

The [official submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin) is the source for directory requirements. This repository currently has public source, bilingual usage guides, a manifest and a matching GitHub release. Current status:

- MIT licensing is complete: the repository and installation ZIP include `LICENSE`.
- The initial submission accepted the ID/name and created the [official listing](https://community.obsidian.md/plugins/confluence-folder-sync) on 2026-11-26.
- Public UI fixtures, native synthetic platform checks and packaging checks are complete. Live account authentication and installer UI remain outside those checks.
- Submission and publication are complete. Automated review of 0.7.0, reproducible builds and artifact attestations were reconfirmed on 2026-11-27. Manual staff review is not claimed; monitor the official listing for subsequent versions and review findings.

Cross-platform checks are this project's readiness goal; directory acceptance depends on the official requirements and review.

## Later decisions

Unattended remote-to-local updates, broader automatic two-way merging and synchronization deletion policies require separate product decisions. They are not enabled by the existing automatic-publication option. Current automatic checks are read-only, and optional automatic uploads handle eligible existing linked pages only.

Maintain the current boundaries while adding features: explicit destination/scope, protected unrelated content, no automatic deletion, backups before confirmed local changes, opt-in automation, direct Atlassian connections and private local credentials/state. Changing these defaults is not implied by this roadmap.

## Initial directory review checkpoint

The submitted 0.6.1 release has no vulnerable dependencies reported. Initial recommendations cover missing GitHub artifact attestations, whole-vault path enumeration, and extra release assets. The installation ZIP and checksum file are intentional manual-install downloads; Obsidian itself downloads only the standard runtime assets. The scan was incomplete at this checkpoint, so recommendations do not constitute final acceptance or an installation guarantee.

The 0.6.2 review completed and no longer reported missing attestations or vault-wide enumeration. It flagged a CSS `:has` performance warning and could not attempt independent build verification without a lockfile. The 0.6.3 review passed, removed the CSS warning, and reproduced `main.js` byte-for-byte in its independent build. The official listing remains the source for current findings. The extra ZIP/checksum recommendation is intentional for manual installation.
