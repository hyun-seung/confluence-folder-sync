# Confluence Folder Sync

Publish a selected Obsidian vault folder to Confluence Cloud. Preview remote edits and save new Confluence pages as local Markdown copies. Processing runs in desktop Obsidian and connects directly to Atlassian. The plugin requires no external command, Python runtime, paid Obsidian add-on, or relay server.

This is a pre-release. Source and development history are available on [GitHub](https://github.com/hyun-seung/confluence-folder-sync). Official Obsidian Community directory submission is pending. The repository owner has yet to select a public license.

## Install the release candidate

1. Download the assets from a [GitHub release](https://github.com/hyun-seung/confluence-folder-sync/releases). Copy `main.js`, `manifest.json`, and `styles.css` to `.obsidian/plugins/confluence-folder-sync/` in a test vault. Enable **Confluence Folder Sync** in Obsidian's Community plugins settings.
2. In the plugin settings, enter your Confluence Cloud **folder URL** and the Atlassian email associated with a scoped API token. Select the token using Obsidian's secret picker. Use Obsidian Desktop 1.14 or later.
3. Set separate vault-relative source and import folders, then use **Test connection**.
4. Open the **Confluence sync dashboard** from the arrow icon in the left ribbon or from the command palette. To publish, enable **Enable publish** and verify the displayed destination when confirming.

Use a new Confluence test folder on first setup. This plugin maintains its own ID map. Existing pages are reported as conflicts when titles match an unrelated page. The Mac tool's existing mappings need a separate migration before this plugin can manage those pages.

## Upgrade an existing installation

Disable this plugin in Obsidian, replace the three release assets, and enable it again. Keep the installation's `data.json` and its Obsidian secret entry so existing page IDs and version baselines remain available.

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
| **Publish folder** | Review the source and destination, then publish eligible changes with conflict protection. |

Snapshots preserve local originals and previous copies and leave tracked versions unchanged. Downloads save files in an `Attachments` folder with versioned filenames. Previously tracked pages from older plugin versions first record the current attachment inventory when previewed.

Local application saves a backup of the note under `Backups`, checks the remote version again, and applies the selected lines only when the local file and open editor still match the review. Changes with missing or ambiguous context stay disabled. Selective application is available for linked published notes and leaves the last published version in place. If Confluence was edited directly, subsequent publication continues to surface that conflict, so unselected remote edits remain protected.

## Atlassian account and scopes

You need an Atlassian account with access to the selected Confluence Cloud folder. Create a scoped token in [Atlassian API token settings](https://id.atlassian.com/manage-profile/security/api-tokens). The publisher additionally requires the user's permission to create/update the relevant content.

- Preview and import use `read:folder:confluence`, `read:hierarchical-content:confluence`, `read:page:confluence`, and `read:attachment:confluence`.
- Publishing additionally uses `write:folder:confluence`, `write:page:confluence`, `write:attachment:confluence`, and `read:content-details:confluence`.

The token is retrieved from Obsidian SecretStorage. The plugin stores your settings, secret name, and synchronization metadata in its local plugin data.

## Network and vault access

- The selected `*.atlassian.net` site supplies the tenant's Cloud ID. The plugin sends authenticated REST requests to `api.atlassian.com` for the selected tenant.
- Preview and import read page and attachment metadata and page contents. Downloads use the desktop HTTPS client to request a specific attachment version from `api.atlassian.com`. The binary is then fetched from `api.media.atlassian.com` using the signed redirect, without forwarding the account token. Publish sends source note content, page and folder names, and referenced in-scope attachments only after local preflight and confirmation.
- References to online images are emitted as links so the plugin does not fetch them. The plugin has no analytics and accesses the vault through Obsidian APIs.
- Existing notes are modified only when the user explicitly confirms applying selected changes. Neither side's files or pages are automatically deleted. For any single Confluence folder, keep one designated publishing installation and let other installations preview or import.

## Coverage

- Publish supports headings, basic emphasis, lists, Markdown tables, fenced code, links within the configured source, and referenced in-scope attachments up to 25 MiB each. Mermaid is published as fenced source in a Confluence code macro. Rich Markdown extensions and all Confluence editor features have limited conversion.
- Import saves new page bodies and attachments under the separate import folder. Attachments up to 25 MiB each are downloaded, with size verification. Earlier page-body comparisons and selective application cover the converted text, while attachment changes appear separately in the report.
- The runtime uses Obsidian desktop APIs, web APIs, and the desktop HTTPS client for binary downloads. macOS local installation, account connection, page listing, version comparison, change preview, and synthetic page and attachment import have been verified in Obsidian 1.14.5. Windows and Linux installation checks remain pending.

## Build and review

Run `npm run build` to generate `main.js` deterministically. Run `npm test` to build and execute fixture tests. Node.js is only needed by maintainers for building and testing.

For an official Community release, the owner must approve a public license, publish this standalone source and a matching GitHub release, and submit it through [Obsidian Community](https://community.obsidian.md/). Include `main.js`, `manifest.json`, and `styles.css` as release assets. A release must contain generated code from the exact tagged source. Confirm the public plugin ID is available before submitting. See the [official submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).

Use synthetic notes and test identifiers in public materials. Keep personal configuration, vault content, account tokens, synchronization state, and organizational paths in local storage.

See [CHANGELOG.md](CHANGELOG.md) for released changes and verification coverage.
