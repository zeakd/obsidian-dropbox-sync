# Changelog

## 1.0.0 (2026-03-08)

First stable release — Community Plugin submission.

### Core
- Content-hash based change detection (no mtime dependency)
- Three-layer delete protection: event tracking + bulk delete guard + Dropbox trash
- Three conflict strategies: keep_both (default), newest, manual (side-by-side diff)
- Rev-based optimistic locking for concurrent edits
- Cursor-based incremental sync with full rescan on cursor expiry

### Platform
- Desktop: IndexedDB state store + obsidian:// protocol one-click auth
- iOS: VaultFileStore (JSON-based) + paste-code auth flow
- Dropbox longpoll real-time change detection (30s)
- Rate limit auto-retry with exponential backoff

### Safety
- Active file protection (skip download/conflict for files being edited)
- Delete catch-up: base-based intent detection for missed vault events
- All-or-nothing cursor advancement (retry on partial failure)
- Bulk delete confirmation modal (threshold configurable)

### UX
- Onboarding modal on first run
- Status bar with sync state (idle/syncing/success/error)
- Sync progress percentage
- Ribbon icon: click to sync, right-click for status
- Custom Dropbox App Key support
- Selective sync with glob exclude patterns
- Device-specific log files (200-line cap) with View Logs modal

### Developer
- 304 tests passing (bun test)
- TypeScript strict mode
- Simulation tests for multi-device scenarios
- Automated release via GitHub Actions (version change detection)

## 0.4.31 (2026-03-08)

- refactor: sync engine restructuring (classifyChange, runCycle method decomposition)
- fix: deleteLog persistence error logging (was silently swallowed)
- fix: RevConflict + dispatchConflict double-failure protection
- refactor: conflict handler deduplication (readLocalWithHash helper)

## 0.4.30 (2026-03-07)

- fix: increase retry delay for iOS network connection lost (-1005)

## 0.4.29 (2026-03-07)

- fix: add diagnostic logging for persistent download failures

## 0.4.28 (2026-03-06)

- fix: ensureParentDir race condition on parallel downloads

## 0.4.27 (2026-03-05)

- fix: mobile network disconnect retry

## 0.4.23

- chore: manifest version sync
- ux: ribbon icon click → immediate sync (status modal moved to right-click)

## 0.4.22

- fix: prevent delete/rename event drop during sync

## 0.4.21

- fix: always trigger sync on file delete/rename

## 0.4.20

- docs: README rewrite + 3 detailed guides + settings doc links

## 0.4.19

- ux: settings accessibility + onboarding English unification + sync summary + error flow

## 0.4.18

- refactor: dropbox-adapter retry deduplication → withRetry()

## 0.4.17

- refactor: dead code removal, null safety, type centralization, main.ts decomposition

## 0.4.16

- refactor: executor conflict handler separation + 5xx retry + VaultFileStore concurrency fix

## 0.4.15

- fix: remove auto-merge + merge logic separation

## 0.4.14

- fix: prevent cursor advance on conflict skip

## 0.4.0

- feat: onboarding modal, conflict side-by-side UI, longpoll, selective sync

## 0.3.0

- feat: status bar click modal + ribbon icon + commands

## 0.2.0

- feat: file change debounce sync + create/delete/rename options
- feat: device-specific log system + View Logs modal

## 0.1.0

- Initial release: sync engine MVP (91 tests)
