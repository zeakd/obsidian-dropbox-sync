# Dropbox Sync for Obsidian

Sync your Obsidian vault with Dropbox using content-hash based change detection.

## Features

- **Content-hash sync**: Uses Dropbox's content_hash algorithm for accurate change detection — no timestamp drift issues
- **Cursor-based delta sync**: Only fetches changes since last sync, not the entire vault
- **Three-layer delete protection**:
  1. Delete event tracking — distinguishes intentional deletes from missing files
  2. Bulk delete guard — blocks mass deletions above a configurable threshold
  3. Dropbox's built-in trash — deleted files are recoverable
- **Conflict resolution**: Choose between keep-both (default), newest-wins, or manual resolution
- **iOS support**: File-based state storage fallback for iOS where IndexedDB is unreliable
- **Rate limit handling**: Automatic retry with exponential backoff on Dropbox API rate limits
- **Cursor expiry recovery**: Automatic full rescan when Dropbox cursor expires

## Installation

### From Community Plugins (recommended)

1. Open Obsidian Settings → Community plugins
2. Search for "Dropbox Sync"
3. Click Install, then Enable

### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/anthropics/obsidian-dropbox-sync/releases/latest)
2. Create a folder `dropbox-sync` in your vault's `.obsidian/plugins/` directory
3. Copy the downloaded files into the folder
4. Reload Obsidian and enable the plugin in Settings → Community plugins

## Setup

1. Open Settings → Dropbox Sync
2. Click "Connect to Dropbox" (desktop) or follow the two-step auth flow (mobile)
3. Configure sync settings (remote path, auto-sync interval, conflict strategy)
4. Use the command palette → "Dropbox Sync: Sync now" or wait for auto-sync

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Remote Path | `/` | Dropbox folder to sync with |
| Auto Sync | `true` | Sync automatically on interval |
| Sync Interval | `300` | Seconds between auto-syncs |
| Conflict Strategy | `keep_both` | How to handle conflicts: `keep_both`, `newest`, `manual` |
| Delete Protection | `true` | Enable bulk delete guard |
| Delete Threshold | `5` | Max deletions before guard triggers |

## Development

```bash
npm install
npm run build      # Production build
npm run dev        # Watch mode
npm run typecheck  # TypeScript check
npm test           # Run tests
```

## License

[MIT](LICENSE)
