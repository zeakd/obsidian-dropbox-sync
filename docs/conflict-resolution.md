# Conflict Resolution

A conflict occurs when the same file is modified on two devices before they sync. For example, you edit `notes/idea.md` on your laptop and your phone, then both devices try to sync.

## Strategies

Choose a strategy in Settings > Dropbox Sync > Conflict strategy.

### Keep both (default)

Both versions are preserved. The remote version is saved alongside your local file with a `.conflict` suffix:

```
notes/idea.md                          ← your local version (unchanged)
notes/idea.conflict-20260306T143200.md ← the remote version
```

The timestamp in the filename prevents overwriting if multiple conflicts occur for the same file. You can manually merge and delete the `.conflict` file at your leisure.

### Keep newest

The version with the more recent modification time wins automatically. The other version is silently overwritten.

This is convenient but can lose edits if both devices made meaningful changes. Best for vaults where files are typically edited on one device at a time.

### Ask me (manual merge)

A modal opens showing both versions side by side. The experience differs by file type:

**Text files** — a section-by-section diff view:

- **Resolved sections** (identical on both sides) are shown in gray, with long blocks collapsed
- **Conflicting sections** are highlighted with local (red) and remote (green) options
- Click a section to choose local, remote, or both
- A status bar tracks unresolved sections
- Click **Save** to write the merged result. Unresolved sections default to local.
- **Keep all local** / **Keep all remote** buttons for quick resolution

**Images** — a side-by-side visual comparison with file sizes displayed. Choose local or remote.

**Other binary files** — metadata (file sizes, remote modification time) is shown. Choose local or remote.

**Skip (Later)** — defer this conflict. The file won't be synced this cycle. It will appear again on the next sync.

## How conflicts are detected

The plugin tracks each file's `rev` (Dropbox revision ID). When uploading, it sends the last known rev. If Dropbox has a newer rev (someone else uploaded in between), the API returns a conflict error, and the chosen strategy kicks in.

This is more reliable than timestamp comparison — it catches every concurrent edit, even if the clocks are in sync.
