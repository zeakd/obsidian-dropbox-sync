# Troubleshooting

## "Token expired. Please reconnect in settings."

Your Dropbox connection expired. This happens occasionally and is easy to fix:

1. Go to **Settings > Dropbox Sync**
2. Click **Disconnect**
3. Click **Connect to Dropbox** again

Your files and settings are preserved — only the connection needs to be renewed.

## Sync doesn't seem to be working

A few things to check:

1. Look at the **status bar** at the bottom of Obsidian — it shows the current sync state
2. If it says "Dropbox: off", sync is disabled. Go to Settings and toggle it on.
3. If it says "error", right-click the sync icon in the sidebar and choose a menu option, or check the logs (see below)
4. Try clicking the **sync icon** in the left sidebar to trigger a manual sync

<!-- TODO: 스크린샷 — 우클릭 메뉴 (Sync Now / Start Sync / Settings) -->
<!-- 파일: docs/images/context-menu.png -->

## Some files aren't syncing

This usually means they match an **exclude pattern**. Check in **Settings > Exclude patterns** — the panel shows how many files are currently excluded.

If you recently changed the **Vault ID**, the plugin is now syncing to a different Dropbox folder. Files from the old folder are still on Dropbox but won't sync to this vault anymore.

## "X deletions skipped by protection"

This is the safety guard doing its job. A sync tried to delete more files than the threshold allows.

If the deletions are intentional:
1. Sync again — the confirmation window will appear
2. Review the file list
3. Click **Delete** to proceed

If this happens often, you can increase the threshold in **Settings > Delete threshold**.

## Conflicts keep coming back

Two common reasons:

- **You chose "Later"**: the conflict is deferred and will appear again on the next sync. To resolve it, choose your version, the remote version, or merge them.
- **Two devices are editing the same file at the same time**: conflicts will recur until one device finishes editing. Try waiting for sync to complete before switching devices.

## Mobile: connection isn't working

On mobile, connecting to Dropbox takes two steps:

1. Tap **Open Dropbox** — this opens the authorization page
2. After authorizing, you'll see a code — copy it
3. Go back to Obsidian and paste the code, then tap **Connect**

The code can only be used once and expires quickly, so paste it promptly.

## Sync is slow

- **First sync** uploads or downloads your entire vault. This is normal and only happens once.
- **Large files** (images, PDFs) take longer. You can exclude them with patterns like `*.pdf` or `attachments/`.
- If Dropbox is rate-limiting your requests, the plugin waits and retries automatically.

## How to check the logs

Logs can help diagnose what's going wrong. Two ways to access them:

1. Open the **command palette** (Ctrl/Cmd+P) and search for "View sync logs"
2. Go to **Settings > Dropbox Sync > Troubleshooting > View Logs**

<!-- TODO: 스크린샷 — 로그 뷰어 모달 -->
<!-- 파일: docs/images/log-viewer.png -->

You can copy the logs to your clipboard to share when reporting issues.
