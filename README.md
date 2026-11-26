# Confluence Folder Sync

English · [한국어](README.ko.md) · [Development roadmap](ROADMAP.md)

Publish a selected Obsidian vault folder to Confluence Cloud. Preview remote edits and save new Confluence pages as local Markdown copies. Processing runs in desktop Obsidian and connects directly to Atlassian. The plugin requires no external command, Python runtime, paid Obsidian add-on, or relay server.

Source and development history are available on [GitHub](https://github.com/hyun-seung/confluence-folder-sync). Released under the [MIT License](LICENSE). Submitted and published to [Obsidian Community](https://community.obsidian.md/plugins/confluence-folder-sync) on 2026-11-26. The listing shows the current automated review and installation status.

## Install the release

1. Open [Releases](https://github.com/hyun-seung/confluence-folder-sync/releases) and choose the newest release. Download [confluence-folder-sync-0.6.2.zip](https://github.com/hyun-seung/confluence-folder-sync/releases/download/0.6.2/confluence-folder-sync-0.6.2.zip), then extract its `confluence-folder-sync` folder into your vault's `.obsidian/plugins/` folder. Alternatively, download the three individual assets `main.js`, `manifest.json`, and `styles.css` from the same release into `.obsidian/plugins/confluence-folder-sync/`. Enable **Confluence Folder Sync** in Obsidian's Community plugins settings. GitHub's automatically generated **Source code (zip)** is for development and has a different directory structure.
2. In the plugin settings, enter your Confluence Cloud **folder URL** and the Atlassian email associated with a scoped API token. Select the token using Obsidian's secret picker. Use Obsidian Desktop 1.14 or later.
3. Set separate vault-relative source and import folders, then use **Test connection**.
4. Open the **Confluence sync dashboard** from the arrow icon in the left ribbon or from the command palette. Use **Review publication** to inspect all source notes. Enable **Enable publish**, select eligible notes, and verify the destination before uploading.

Use a new Confluence test folder on first setup. This plugin maintains its own ID map. Existing pages are reported as conflicts when titles match an unrelated page. Use **Manage connections** to explicitly reconnect an exact matching page. Different formatter output still requires a separately verified baseline migration.

## Everyday workflow

| Goal | Recommended steps |
| --- | --- |
| Publish local edits | **Review publication → select eligible notes → Publish selected**. Enable publishing in settings first; check the destination in the confirmation. |
| Bring in new remote pages | **Preview changes → Import new pages**. Copies are saved in the separate import folder. |
| Get a fresh current export | **Download snapshot**, or choose a page and **Download latest copy**. Existing originals and prior copies remain available. |
| Apply remote edits to a linked note | Load the page and use **Review local application** for individual matching changes. Use **Resolve text conflict** when you need to choose the full resolution and accept a new remote baseline. |
| Check or repair links | **Manage connections → Load connections → choose action → Preview mapping change → Apply mapping change**. |
| Recover a local change | **Open history → Open backup**. Use **Restore backup** only when the current note still matches the recorded result. |

Start with manual review. Automatic checking and automatic publication are independent options and default to off. Neither automatic mode imports remote edits into existing local notes.

## Language

The interface follows the Obsidian application language by default. In this plugin's settings, choose **Language → Follow Obsidian / English / 한국어**. Settings, dashboard controls, confirmations, notifications, plugin error messages, and generated report text support both languages. The command palette and ribbon label update when you change this setting. Other Obsidian languages use English. Original note content, Confluence titles, technical diagnostics from the host, and stable import directory names retain their own language. The same release and ZIP support both languages.

## Upgrade an existing installation

Disable this plugin in Obsidian, replace the three release assets, and enable it again. When upgrading with the ZIP, copy its files into the existing plugin folder instead of deleting the old folder. Keep the installation's `data.json` and its Obsidian secret entry so existing page IDs and version baselines remain available.

Migrating from an external publisher requires verifying each page's ID, parent, title, and version and transferring the baseline locally. A migrated baseline can preserve unchanged page contents even when the publishers use different formatters. If a source note changes, subsequent publishing uses this plugin's documented conversion coverage. Start with publishing disabled, test the connection, preview changes, and review a snapshot before enabling uploads.

## Use the dashboard

| Action | What it does |
| --- | --- |
| **Preview changes** | Compare remote page and attachment versions with the recorded versions. Flag edits on both sides and attachment additions, changes, and removals even when page versions match. |
| **Import new pages** | Save previously unlinked pages as Markdown with binary attachments under `Imported pages`. Use this on the first run to record imported versions for later previews. |
| **Download snapshot** | Save every current page in a fresh subfolder under `Snapshots`. Use this for a one-time export or a fresh copy even if pages are already tracked. |
| **Load pages → Load versions → Compare** | Pick a page and two available Confluence versions. Added and removed Markdown lines appear in the dashboard. |
| **Review local application** | Compare the linked page's last published version with its current Confluence version. Choose individual text changes with a unique matching location, then confirm local application. |
| **Download latest copy** | Save the selected page's current version under `Snapshots`, including when a copy already exists. |
| **Review publication** | List new, changed, unchanged and conflicting notes. Select eligible notes and confirm **Publish selected**. Unselected pages and folders are preserved. |
| **Resolve text conflict** | Compare the previous baseline, local note and Confluence text. Keep local text, use remote text or edit a resolution, then back up and save locally. Review and publish the resolution separately. |
| **Manage connections** | Inspect linked, unlinked, missing and interrupted items; preview verified reconnection, source-root migration or completed-operation recovery. |
| **Open history** | View recent operations and recorded backups. Open a backup or restore it after checking that the note has not changed since that operation. |

Snapshots preserve local originals and previous copies and leave tracked versions unchanged. Downloads save files in an `Attachments` folder with versioned filenames. Previously tracked pages from older plugin versions first record the current attachment inventory when previewed.

Local application saves a backup of the note under `Backups`, checks the remote version again, and applies the selected lines only when the local file and open editor still match the review. Changes with missing or ambiguous context stay disabled. Selective application is available for linked published notes and leaves the last published version in place. If Confluence was edited directly, subsequent publication continues to surface that conflict, so unselected remote edits remain protected.

## Selective publication and tracked moves

The publication review is read-only and remains available when publishing is disabled. Select notes individually or use **Select eligible notes**. A new linked note must also be selected when another selected note references it. Existing mapped targets remain valid links without being selected. The plugin rechecks the destination, disk contents, open editor text, attachment bytes and remote revisions before writes. Refresh the review if these inputs change. Cancellation stops before the next write request; completed changes and resumable state remain recorded.

While the plugin is enabled, note and folder renames within the configured source preserve page IDs. The next selected publication updates page titles and parents. New destination folders are created as needed; old folders are retained and owned folders can be reused when moving back. Moves outside the configured source are excluded. Rename collisions appear as conflicts; undo the move or move to a free path. For offline moves and source-root changes, use the management workflow below before publishing.

Conflict resolution accepts the displayed current remote version as the new comparison baseline after explicit confirmation. It never uploads immediately. Keeping local text or editing a merged resolution can replace the accepted remote text in the next manual publication. Selecting the converted remote text preserves the current Confluence body until another local edit. Attachments stay on Confluence. Resolving a conflict requires a manual publication before unattended uploads resume for that note.

## Connections and recovery

Open **Manage connections** in the dashboard or **Connections and recovery** from the command palette. **Load connections** reads the active source and destination without changing documents. Search the status list and choose one action:

- **Reconnect existing page**: select an unlinked note and an existing in-scope page. For a move made while the plugin was disabled, also select its previous missing link. A new connection requires the same title, folder hierarchy, exact generated body and matching referenced attachments; dependencies must already be linked. Offline moves require the previous local input and remote baseline to remain unchanged. A different formatter or edited note/page must be reconciled first. Existing or duplicate page ownership is refused.
- **Migrate source root**: first set the new source in settings, then select the previous source profile for the same Confluence site and root folder. The current mapping must be empty. Every mapped note, referenced asset and remote baseline must match; unresolved moves, pending operations and retired folders block migration. The preview lists the transferred paths and IDs. The previous profile becomes a migration marker so it cannot publish; its previous metadata is retained in the backup. This transfers ownership to the new root and preserves IDs and remote contents.
- **Recover completed publication**: recover an unknown page create only when a unique version-1 page has the exact recorded placeholder. A lost update response can be acknowledged only with the recorded version message, body hash, location and verified attachment inventory. An update not confirmed as completed stays pending: resume it using **Review publication**. Unknown folder creates and absent, ambiguous or independently edited outcomes require inspection; the management screen never clears their markers to retry a create.

**Preview mapping change** performs read-only verification. **Apply mapping change** asks for confirmation and rechecks the inputs before saving metadata. It does not change local Markdown, attachments, remote bodies, titles or parents. After applying, automatic publication is disabled and affected notes require manual review. Publication may subsequently perform a separately confirmed relocation or update. The latest 10 pre-change profile snapshots remain in private local `data.json` as `mappingBackups`; there is no automatic metadata-restore action. These snapshots contain private paths and IDs and must not be shared. Save failures restore the in-memory profiles and leave automatic publication disabled.

## History and local restoration

The plugin retains the latest 100 operation records and 100 backup receipts in local plugin data; the history screen shows the latest 30 of each. Backup contents remain as Markdown under the import folder's `Backups` directory and are never automatically removed. Backups made before this version remain on disk, but have no receipt in the new history screen.

Restoration checks the source/destination, backup hash, current note and open editor, then backs up the current revision before restoring. If either the note or backup was edited, open the backup and merge it manually. Restoring a note does not roll back Confluence versions or change the accepted remote baseline.

## Optional automatic operation

**Automatic checks** is off by default. When enabled, changes under the source folder trigger a debounced check; periodic checks run every 5, 15 or 60 minutes while Obsidian is open. Checks compare page and tracked attachment versions and show notifications/history without creating report files, importing pages or deleting anything. Repeated source changes are throttled to at least one minute between checks.

**Automatic publication** is a separate setting. It requires **Enable publish**, **Automatic checks** and an explicit destination confirmation. It uploads local edits only to established linked pages with a known baseline. New pages, moves, pending publishes, unresolved conflicts and conflict resolutions awaiting manual publication stay in the review workflow. Disabling publishing/checks or changing the account, secret, source or folder URL disables unattended uploads. The local installation starts with automatic options off.

## Atlassian account and scopes

You need an Atlassian account with access to the selected Confluence Cloud folder. Create a scoped token in [Atlassian API token settings](https://id.atlassian.com/manage-profile/security/api-tokens). The publisher additionally requires the user's permission to create/update the relevant content.

- Preview and import use `read:folder:confluence`, `read:hierarchical-content:confluence`, `read:page:confluence`, and `read:attachment:confluence`.
- Publishing additionally uses `write:folder:confluence`, `write:page:confluence`, `write:attachment:confluence`, and `read:content-details:confluence`.

The token is retrieved from Obsidian SecretStorage. The plugin stores your settings, secret name, and synchronization metadata in its local plugin data.

## Network and vault access

- The selected `*.atlassian.net` site supplies the tenant's Cloud ID. The plugin sends authenticated REST requests to `api.atlassian.com` for the selected tenant.
- Preview and import read page and attachment metadata and page contents. Downloads use the desktop HTTPS client to request a specific attachment version from `api.atlassian.com`. The binary is then fetched from `api.media.atlassian.com` using the signed redirect, without forwarding the account token. Manual publication sends selected source note content, page/folder names and referenced in-scope attachments after preflight and confirmation. Optional unattended publication sends eligible linked-note changes only after its separate setting is explicitly enabled.
- References to online images are emitted as links so the plugin does not fetch them. The plugin has no analytics and accesses the vault through Obsidian APIs. Source enumeration walks only the configured folder branch; hidden source paths and hidden attachment targets are excluded.
- Existing notes are modified only after confirmation of selected changes, conflict resolution or backup restoration. Neither side's files or pages are automatically deleted. For any single Confluence folder, keep one designated publishing installation and let other installations preview or import.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| No notes can be selected | **Unchanged** and **Conflict** rows are disabled. Save open editor changes, refresh the review and inspect the row's explanation. Publishing also requires **Enable publish**. |
| A selected note needs another note | Select its unpublished link targets too. Already mapped link targets do not need to be selected. |
| A page or attachment changed remotely | Refresh the review. For a linked page's text conflict, use **Resolve text conflict** after checking the current version. Independent title/parent changes and unfinished publishes must be resolved before that text workflow is available. |
| Publication was cancelled or interrupted | Completed changes stay recorded. Refresh and retry verifiable mapped notes. If a create result is unknown, inspect the destination and retain `data.json`; deleting the mapping can cause duplicates. Use **Manage connections** for verified completed operations. Unproved outcomes remain blocked. |
| A local rename conflicts with an existing mapping | Undo the move or choose an unoccupied path, then refresh. Use **Manage connections** for offline moves or source-root migration when their baselines are unchanged. |
| Connection fails with HTTP 401 or 403 | Check the account email, token selection/validity, configured scopes and the account's access to the target folder. Do not include tokens in an issue or screenshot. |
| An attachment fails to transfer | The current limit is 25 MiB per file. Transfers with an unexpected host or mismatched size are rejected; keep the original file and review the error. |
| Automatic publication does nothing | Obsidian must be open. Enable **Enable publish**, **Automatic checks** and separately confirmed **Automatic publication**. New/moved notes, conflicts and pending operations remain manual. |
| Mermaid appears as code | Version 0.6.0 publishes Mermaid source in a code macro. Local image rendering is a roadmap item. |

## Coverage

- Publish supports headings, basic emphasis, lists, Markdown tables, fenced code, links within the configured source, and referenced in-scope attachments up to 25 MiB each. Mermaid is published as fenced source in a Confluence code macro. Rich Markdown extensions and all Confluence editor features have limited conversion.
- Import saves new page bodies and attachments under the separate import folder. Attachments up to 25 MiB each are downloaded, with size verification. Earlier page-body comparisons and selective application cover the converted text, while attachment changes appear separately in the report.
- The runtime uses Obsidian desktop APIs, web APIs, and the desktop HTTPS client for binary downloads. The 0.6.0 macOS installation, SecretStorage access, account connection and localized management screen were verified against 85 existing links in Obsidian 1.14.5. The earlier 0.5.0 read-only publication review and activity checks remain covered. Selected writes, conflict resolution, restoration and management actions are covered by synthetic fixtures in both languages; earlier native synthetic attachment imports were also verified. Windows and Linux installation checks remain pending.

## Build and review

Run `npm run build` to generate `main.js` deterministically. Run `npm test` to build and execute fixture tests. Node.js is only needed by maintainers for building and testing.

For Community submission, the repository needs its usage guide, `LICENSE`, the manifest and a matching GitHub release. Submit through [Obsidian Community](https://community.obsidian.md/) after checking the official requirements. Native Windows/Linux verification is also a readiness goal for this project; the current completed native checks cover macOS. Include `main.js`, `manifest.json`, and `styles.css` as release assets. The release tag matches `manifest.json` exactly, without a `v` prefix. `versions.json` records the minimum supported Obsidian version. The optional installation ZIP contains the plugin folder, the three assets, both language guides, and `LICENSE`. `SHA256SUMS.txt` verifies the downloads. A release must contain generated code from the exact tagged source. Confirm the public plugin ID is available before submitting. See the [official submission guide](https://docs.obsidian.md/plugins/releasing/submit-plugin).

CI runs the Node fixtures on Linux, macOS and Windows, checks that the generated runtime matches committed `main.js`, and validates release metadata and packaging. These are synthetic checks, separate from native Obsidian validation. Maintainers use Node.js 26 and Python 3 for the packaging tools; users need neither runtime.

To publish a new version, update `manifest.json`, `package.json`, `versions.json`, `CHANGELOG.md` and installation links, build and commit the result, then push an exact `x.y.z` tag. The release workflow waits for CI, packages only the three runtime assets, both guides, changelog and MIT license, and attests all downloadable assets. It creates a draft, downloads and verifies its bytes, ZIP whitelist, signing workflow, source tag and commit, then publishes. Existing release assets are never replaced; a retry can resume an existing draft bound to the same commit after verifying every existing asset, uploading only missing assets and verifying provenance. A changed tag or mismatched draft is refused. Ordinary CI and pull requests have read-only permissions; only the tag release job can publish and request provenance certificates.

Local packaging checks: `python3 -m unittest discover -s tools -p 'test_*.py' -v`. Build a fresh package with `python3 tools/release.py --tag 0.6.2 --output /tmp/confluence-folder-sync-0.6.2`. Download the standard assets, optional ZIP and checksums from the same release. Verify checksums, then use `gh attestation verify main.js --repo hyun-seung/confluence-folder-sync --signer-workflow hyun-seung/confluence-folder-sync/.github/workflows/release.yml --source-ref refs/tags/0.6.2`; repeat for each other asset. Add `--source-digest <full-tag-commit>` to enforce an exact commit. See [GitHub's provenance documentation](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

Use synthetic notes and test identifiers in public materials. Keep personal configuration, vault content, account tokens, synchronization state, and organizational paths in local storage.

See [CHANGELOG.md](CHANGELOG.md) for released changes and verification coverage, and [ROADMAP.md](ROADMAP.md) for proposed development and submission preparation. Release binaries are built from their exact tagged source.
