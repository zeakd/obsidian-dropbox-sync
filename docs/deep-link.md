# Deep Link: Sync & Open

Open a file by URL — if it hasn't been synced yet, the plugin downloads it from Dropbox first.

## URI format

```
obsidian://dropbox-sync-open?file=path/to/note.md
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `file`    | Yes      | File path relative to your vault root |
| `vault`   | No       | Vault name (defaults to the active vault) |

The `file` parameter should be URL-encoded. Most tools do this automatically.

## How it works

1. You click a `obsidian://dropbox-sync-open?file=...` link
2. If the file exists locally → opens it immediately
3. If the file doesn't exist locally → downloads it from Dropbox, saves it, then opens it
4. The sync state is updated so the file won't be re-downloaded on the next sync

## Examples

Open a note in the `inbox` folder:

```
obsidian://dropbox-sync-open?file=inbox%2Fmy-note.md
```

Open a note in a specific vault:

```
obsidian://dropbox-sync-open?vault=my-vault&file=projects%2Freadme.md
```

## Use cases

- **Cross-app links**: Link to Obsidian notes from other apps (task managers, wikis, bookmarks). The note will always open, even if it hasn't synced yet.
- **Shared links**: Share a link with someone who has the same Dropbox-synced vault. They can open it without waiting for a full sync.
- **Automation**: Scripts or tools can open specific notes via URL.

## Compared to `obsidian://open`

Obsidian's built-in `obsidian://open` URI only opens files that already exist locally. If the file hasn't been synced from Dropbox yet, you'll get an error.

`obsidian://dropbox-sync-open` solves this by checking Dropbox when the file is missing locally.

## Requirements

- The plugin must be installed and connected to Dropbox
- The file must exist in your Dropbox sync folder
- Works on desktop. Mobile support is expected but not yet verified.
