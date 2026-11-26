# Development roadmap

English · [한국어](ROADMAP.ko.md) · [Usage guide](README.md)

Current release: **0.6.1** (MIT licensing and submission preparation; runtime behavior from 0.6.0). This document proposes the next work; the items below are not implemented or scheduled. Version 0.6.0 adds verified reconnection, source-root migration and completed-operation recovery to selective publication, text conflict resolution, tracked local moves, operation history and guarded backup restoration, and optional automatic checks/publication. See [CHANGELOG.md](CHANGELOG.md) for delivered work.

## Recommended order

| Priority | Work | Current limit | Completion criteria |
| --- | --- | --- | --- |
| 1 | Cross-platform and reproducible UI verification | Native installation was checked on macOS; the synthetic browser workflow is not yet a public, portable test harness. | Verify installation, SecretStorage, attachments, moves and restoration in native Windows/Linux Obsidian; provide synthetic UI tests runnable from the repository. Keep native evidence separate from Node/browser fixtures. |
| 2 | Repeatable CI and release packaging | Tests, ZIP generation and release checks were run during development; no repository CI/release workflow is included. | Run fixture checks in CI; build the exact tagged source; verify manifest/tag compatibility; package both guides and the standard assets; generate checksums and build-provenance attestations, and exclude private data. |
| 3 | Large-folder performance and rate-limit handling | Reviews fetch per-page metadata and attachment inventories, and an automatic check repeats some reads. | Limit path enumeration to the configured source, reuse reads within one check, bound concurrency and improve rate-limit/backoff behavior. Benchmark large synthetic trees and interruption/retry cases while preserving fresh checks before writes. |
| 4 | Connection setup and diagnostics | Setup uses individual settings fields and reports connection/API errors. | Guide users through folder URL, secret selection, permissions and target confirmation; explain token/account/scope failures; provide diagnostics that omit credentials and document contents. |
| 5 | Markdown fidelity and local Mermaid rendering | Basic Markdown is supported; rich macros and extensions have limited conversion, and Mermaid is code source. | Offer optional locally rendered diagram images, preserve source for later edits, and add round-trip fixtures for supported callouts, lists, tables, anchors and internal links. Use no external rendering service. |
| 6 | Multiple configurations and team setup | State is separated by target/source, but settings expose one active configuration. Sharing a publisher's `data.json` exposes private metadata and is not a setup workflow. | Provide named configurations and a validated export/import format without secrets or personal document paths; clearly distinguish publishing and read-only installations and detect conflicting ownership. |

Mapping and recovery management shipped in 0.6.0 with conservative recovery checks. The next work is **cross-platform and reproducible UI verification**. Platform validation and CI make distribution easier to verify and maintain. Richer word-level differences, conflict navigation and an incoming-review queue can follow after these foundations.

## Community directory preparation

The [official submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin) is the source for directory requirements. This repository currently has public source, bilingual usage guides, a manifest and a matching 0.6.1 GitHub release. Still to do:

- MIT licensing is complete: the repository and installation ZIP include `LICENSE`.
- The initial submission accepted the ID/name and created the [official listing](https://community.obsidian.md/plugins/confluence-folder-sync) on 2026-11-26.
- Complete the project's platform verification and public test/packaging work above.
- Submission and publication are complete. Automated review was still running at the submission checkpoint; monitor the official listing and address blocking findings before treating installation as available.

Cross-platform checks are this project's readiness goal; directory acceptance depends on the official requirements and review.

## Later decisions

Unattended remote-to-local updates, broader automatic two-way merging and synchronization deletion policies require separate product decisions. They are not enabled by the existing automatic-publication option. Current automatic checks are read-only, and optional automatic uploads handle eligible existing linked pages only.

Maintain the current boundaries while adding features: explicit destination/scope, protected unrelated content, no automatic deletion, backups before confirmed local changes, opt-in automation, direct Atlassian connections and private local credentials/state. Changing these defaults is not implied by this roadmap.

## Initial directory review checkpoint

The submitted 0.6.1 release has no vulnerable dependencies reported. Initial recommendations cover missing GitHub artifact attestations, whole-vault path enumeration, and extra release assets. The installation ZIP and checksum file are intentional manual-install downloads; Obsidian itself downloads only the standard runtime assets. The scan was incomplete at this checkpoint, so recommendations do not constitute final acceptance or an installation guarantee.
