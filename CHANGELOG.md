# Changelog

## 0.8.0

- Add a bilingual four-step setup wizard from settings, dashboard and command palette. Draft edits stay separate until explicit save; existing mapping/history data is retained and publication/automatic options are disabled on save.
- Verify secrets, local folder scope and authenticated folder/descendant read access without reading note bodies, creating folders, writing test pages or claiming publication permissions.
- Show actionable fixed diagnostics and copy a strict allowlist report without sites, accounts, paths, connection IDs, token values/hashes or content.
- Recheck draft/settings/secret/folder/verification age at commit boundaries. Cancelled or stale saves restore the previous settings; uncertain disk restoration is reported.
- Extend synthetic Node checks to 96 and bilingual browser/native Obsidian checks to cover setup, actual SecretComponent, cancellation, saved mappings and diagnostic privacy.
- 영문·한글 연결 설정 마법사와 읽기 전용 진단을 추가했습니다. 토큰·설정 변경과 저장 중 취소를 확인하고 기존 연결·원본 문서를 보존합니다.

## 0.7.0

- Batch mapped page metadata in groups of 25 and reuse page/attachment reads within one read-only check. Rebuild the read view for every review and retain direct fresh checks in all publication writes.
- Bound API concurrency to four; retry GETs at most four attempts with exponential backoff/jitter, honor Retry-After without truncation, stop after the 60-second waiting deadline, and check cancellation during backoff. Never replay POST/PUT or unknown write responses.
- Add a 1,000-note/110-folder synthetic comparison: 3,162 → 1,162 HTTP calls (63% fewer), with no remote writes. Simulated timings are not production throughput measurements.
- 페이지 일괄 조회·검토 내 조회 재사용과 동시 요청 제한을 추가했습니다. 서버 대기 시간을 존중하며 쓰기 재전송과 오래된 검토 결과로의 발행을 막습니다.
- Publish a portable synthetic UI harness with separate locked test dependencies: English/Korean at desktop and narrow viewport widths.
- Add native Obsidian 1.14.5 checks with disposable profiles/vaults, pinned official Windows/Linux downloads, actual UI/Vault/SecretStorage APIs, restoration, binary imports, rename events and plugin reload.
- Run all three OS browser/Node jobs and both native desktop jobs in CI; refuse unrelated vaults without closing their app instance. The native runner checks the same shipped runtime assets.
- 공개 UI 시험과 실제 Windows·Linux Obsidian의 합성 시험을 CI에 연결했습니다. 로컬 macOS에서도 검증했으며 원본 문서·설정·인증·연결 상태를 유지합니다.

## 0.6.3

- Replace the conflict dialog's CSS `:has` selector with a class attached to that modal only; remove the class when the dialog closes and retain the same width and responsive columns.
- Commit the dependency-free npm lockfile, use offline `npm ci` in CI/release jobs, and reject a missing or mismatched lockfile during packaging.
- CSS 성능 경고를 명시적 모달 클래스로 정리하고 의존성 없는 lockfile로 독립 빌드 검증을 준비했습니다. 동기화 범위와 발행 동작은 유지합니다.

## 0.6.2

- Enumerate Markdown through the selected source folder's children instead of the vault-wide file registry. Exclude hidden branches and hidden attachment targets; reject malformed or changed hierarchies before publication.
- Add cross-platform Node fixture CI and packaging regression checks using read-only pull-request permissions.
- Build exact semantic release tags, verify the committed generated runtime, package an explicit public-file whitelist, and generate deterministic ZIPs with checksums.
- Attest every release asset with GitHub build provenance, verify downloaded draft assets against their tagged source and signing workflow/ref/commit, then publish. Existing releases are not overwritten.
- 원본 폴더 안의 파일만 순회하고 숨김 경로를 제외합니다. 태그 기반 CI에서 배포 파일과 빌드 출처 증명을 검증한 뒤 공개합니다. 실행 환경은 Obsidian 데스크톱이며 Windows·Linux 실제 앱 검증은 별도입니다.

## 0.6.1

- Add the owner-approved MIT license to the source repository and installation ZIP.
- Update bilingual installation and Community submission documentation to the current account-based submission process.
- Keep runtime behavior unchanged from 0.6.0; retain the 52 regression fixtures and existing platform-verification limits.

## 0.6.0

- Add bilingual Connections and recovery UI with scoped status filtering and explicit preview/confirmation.
- Reconnect exact matching existing pages and unchanged offline moves; refuse duplicate ownership and unrelated content.
- Transfer verified mappings to a new source root without changing page IDs or documents; preserve a previous-profile migration marker.
- Recover provable placeholder creates and completed lost-response updates. Unproved creates, folder creates and pending updates keep their recovery markers.
- Recheck disk/editor inputs, remote body/version/location/attachments and profile state before saving; retain ten private metadata snapshots and roll back profiles on save failure.
- Disable automatic publication after management changes and require manual review of affected notes.
- Verify 52 Node fixtures and management actions/cancellation in both language Chromium workflows. Independent review reproduced and verified asset-baseline, overlapping-root ownership and migration-entry fixes.
- Verify the macOS Obsidian 1.14.5 management screen with 85 existing links; preserve all original files, profiles, settings and authentication. Native Windows/Linux checks remain pending.

## 0.5.0

- Review new, changed, unchanged and conflicting notes, then publish an explicit selection with unpublished-link dependency checks.
- Recheck saved text, unsaved editors, binaries, destination and remote versions before write requests; support progress and cancellation.
- Resolve three-way text conflicts locally with a backup and explicit remote-baseline acceptance, followed by manual publication.
- Preserve page IDs for tracked local renames and folder moves; protect mapping collisions and reuse owned prior folders.
- Record bounded operation history and backup receipts; restore only unchanged notes and unmodified backups, with a recovery backup first.
- Add optional source-change and periodic checks, plus separately confirmed unattended uploads for established linked notes. All automatic settings default to off.
- Verify native macOS installation, read-only publication review and local activity persistence in Obsidian 1.14.5.
- Verify 37 automated fixtures and both language dashboards. Independent review reproduced and verified fixes for stale writes, unsaved editors, rename collisions, and interrupted attachment publication recovery.

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
