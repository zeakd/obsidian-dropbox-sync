# Troubleshooting

## "Token expired. Please reconnect in settings."

Your Dropbox access was revoked or the refresh token expired. Go to Settings > Dropbox Sync > Disconnect, then Connect again. Your files and sync state are preserved — only the authentication needs to be renewed.

## Sync seems stuck or nothing happens

1. Click the ribbon icon (or status bar) to check the current status
2. If it shows "error", click **View Logs** to see what went wrong
3. Try **Sync Now** to trigger a manual sync
4. Check that sync is enabled (toggle in Settings or status modal)

If the status bar shows "Dropbox: off", sync is disabled. Toggle it on in Settings.

## Files are syncing but some are missing

Check your **Exclude patterns** in Settings. The settings panel shows how many files are currently excluded. Remove or adjust patterns if needed.

Also check that the missing files aren't in a folder that was never synced. Changing the Vault ID starts syncing to a different Dropbox folder.

## "X deletions skipped by protection"

The bulk delete guard prevented a large number of deletions. This is a safety feature. If the deletions are intentional:

1. Sync again — the delete confirmation modal will appear
2. Review the list and click **Delete** to proceed

If you frequently need to delete many files at once, increase the **Delete threshold** in Settings.

## Conflicts keep appearing

If a conflict modal appears for the same file repeatedly:

- Choosing **Later** (skip) defers the conflict to the next sync. Resolve it by choosing local, remote, or merging.
- If two devices are both actively editing the same file, conflicts will recur. Consider editing on one device at a time, or switch to **Keep newest** strategy.

## Mobile: "Connection failed"

On iOS/Android, authentication uses a two-step code flow:

1. Click **Open Dropbox** — this opens the Dropbox authorization page
2. Copy the code shown after authorization
3. Paste it back in the plugin settings and click **Connect**

Make sure you complete both steps in the same session. The authorization code is single-use and expires quickly.

## Sync is slow

- The first sync uploads/downloads your entire vault. Subsequent syncs are incremental (delta only).
- Large vaults with many binary files (images, PDFs) take longer. Use **Exclude patterns** to skip files you don't need synced.
- Dropbox API rate limits may slow things down during heavy usage. The plugin retries automatically with backoff.

## Viewing logs

Two ways to access sync logs:

1. Command palette > "Dropbox Sync: View sync logs"
2. Settings > Dropbox Sync > Troubleshooting > View Logs

Logs show timestamps, sync actions, and errors. Use **Copy to clipboard** to share when reporting issues.

Each device writes to its own log file (`sync-debug-{deviceId}.log`) to avoid conflicts between devices.
