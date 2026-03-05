# Sync Safety

Syncing file deletions across devices is inherently dangerous. A bug or misunderstanding can cascade a single deletion into data loss on every device. This plugin uses three independent layers to prevent that.

## Layer 1: Delete tracking

The plugin does **not** infer deletions from missing files. Instead, it explicitly tracks delete events:

- When you delete a file in Obsidian, the plugin records it in a local delete log
- When you rename a file, the old path is recorded as a deletion
- On the next sync, only paths in the delete log are removed from Dropbox

This means:
- A file missing because of a partial sync is **not** deleted remotely
- A file excluded by a pattern is **not** deleted remotely
- Only intentional, observed deletions propagate

The delete log persists across sessions, so deletions aren't lost if you close Obsidian before syncing.

## Layer 2: Bulk delete guard

If a single sync cycle would delete more files than a configurable threshold (default: 5), the plugin pauses and shows a confirmation modal:

- The full list of files to be deleted (up to 20 shown, with a count for the rest)
- Whether each deletion targets local or remote
- **Delete** to proceed, or **Skip deletions** to sync everything else

This catches scenarios like:
- Accidentally deleting a folder
- A state corruption causing the plugin to think many files were deleted
- First sync after changing the Vault ID (which could look like mass deletion)

Configure in Settings > Delete protection and Delete threshold.

## Layer 3: Dropbox trash

Even after a file is deleted through the Dropbox API, it remains in Dropbox's trash:

- **Dropbox Basic/Plus**: recoverable for 30 days
- **Dropbox Professional/Business**: recoverable for 180 days

To recover: log into [dropbox.com](https://www.dropbox.com), navigate to Deleted files, and restore.

## Deferred files

Some files are "deferred" during a sync cycle — they are skipped and not counted as failures:

- Files currently open and being edited (to avoid mid-edit conflicts)
- Conflict files where the user chose "Later"

Deferred files are retried on the next sync cycle. The sync result shows the deferred count so you know nothing was silently lost.
