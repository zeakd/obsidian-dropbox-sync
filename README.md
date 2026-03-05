# Dropbox Sync for Obsidian

Sync your Obsidian vault with Dropbox. Works on desktop and mobile, detects changes accurately using content hashes, and keeps your data safe with three layers of delete protection.

## Features

### Accurate sync with content hashing

Changes are detected using Dropbox's `content_hash` algorithm — a block-level hash of file contents. This means no false positives from timestamp drift or timezone differences. Only files that actually changed get synced.

### Real-time change detection

The plugin uses Dropbox's longpoll API to detect remote changes in real-time. When someone edits a file on another device, this device picks it up within seconds — no need to wait for the next sync interval.

Local file edits trigger a sync after a 5-second debounce, so your changes reach Dropbox quickly without overwhelming the API.

### Smart conflict resolution

When the same file is edited on two devices before syncing, you have three options:

- **Keep both** (default) — saves the remote version as a `.conflict` file alongside your local version
- **Newest wins** — automatically keeps whichever version was modified more recently
- **Ask me** — opens a side-by-side merge modal where you can choose per section

The merge modal shows a diff-style view for text files and a visual comparison for images. You can pick local, remote, or both for each conflicting section. [Learn more about conflict resolution](docs/conflict-resolution.md)

### Three layers of delete protection

Syncing deletions is risky — one mistake can wipe files across all devices. This plugin uses three independent safety layers:

1. **Delete tracking** — only files explicitly deleted in Obsidian are removed remotely. Missing files (e.g., from a partial sync) are never auto-deleted.
2. **Bulk delete guard** — if a sync would delete more files than a threshold (default: 5), a confirmation modal shows the full list before proceeding.
3. **Dropbox trash** — even after deletion, files are recoverable from Dropbox's web trash for 30-180 days.

[Learn more about sync safety](docs/sync-safety.md)

### Selective sync

Exclude files from syncing using glob patterns. Useful for large attachments, temporary files, or workspace-specific configs.

Examples: `*.pdf`, `attachments/`, `.obsidian/workspace*`

The settings panel shows a live count of how many files are excluded.

### Works on mobile

Full support for iOS and Android. The plugin uses a file-based state storage fallback on iOS where IndexedDB is unreliable. Authentication works via a two-step code flow on mobile (one-click OAuth on desktop).

## Getting started

### Install

**Community Plugins (recommended):**

Settings > Community plugins > Search "Dropbox Sync" > Install > Enable

**Manual:**

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/zeakd/obsidian-dropbox-sync/releases/latest). Place them in `.obsidian/plugins/dropbox-sync/` and reload Obsidian.

### Connect

1. Open Settings > Dropbox Sync
2. Click **Connect to Dropbox** (desktop opens browser automatically; mobile shows a two-step code flow)
3. Set a **Vault ID** — this becomes your Dropbox folder name (e.g., `my-vault` syncs to `/my-vault/`)
4. Toggle **Enable sync** on

That's it. Your vault will sync immediately and continue syncing on file changes.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| **Vault ID** | — | Dropbox folder name for this vault. Required. |
| **Enable sync** | off | Toggle automatic syncing on/off. |
| **Conflict strategy** | Keep both | `Keep both`, `Keep newest`, or `Ask me`. [Details](docs/conflict-resolution.md) |
| **Exclude patterns** | `.obsidian/workspace*` | Glob patterns for files to skip. One per line. |
| **Sync on create/delete/rename** | off | Also trigger sync on file creation, deletion, and rename. Edits always trigger sync. |
| **Sync interval** | 60s | Fallback polling interval. Longpoll handles most real-time detection. |
| **Delete protection** | on | Show confirmation before bulk deletions. [Details](docs/sync-safety.md) |
| **Delete threshold** | 5 | Number of deletions that triggers the confirmation. |

## Sync status

Click the ribbon icon or status bar to see:

- Current sync state and last sync summary (e.g., "2 uploads, 1 download")
- Pending remote changes (checked live against Dropbox)
- Quick actions: Sync Now, Start/Stop, Settings, View Logs (on error)

## Troubleshooting

See [Troubleshooting guide](docs/troubleshooting.md) for common issues and solutions.

## Development

```bash
bun install
bun run build      # Production build
bun run dev        # Watch mode
bun run typecheck  # TypeScript check
bun test           # Run tests (288 tests)
```

## License

[MIT](LICENSE)
