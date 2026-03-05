import { Notice, Platform, Plugin, requestUrl, TFile } from "obsidian";
import {
  DEFAULT_SETTINGS,
  generateDeviceId,
  getEffectiveAppKey,
  getEffectiveRemotePath,
  type PluginSettings,
} from "./settings";
import { DropboxSyncSettingTab } from "./ui/settings-tab";
import { StatusBar } from "./ui/status-bar";
import { ConflictModal } from "./ui/conflict-modal";
import { DeleteConfirmModal } from "./ui/delete-confirm-modal";
import { LogViewerModal } from "./ui/log-viewer-modal";
import { SyncStatusModal } from "./ui/sync-status-modal";
import { VaultAdapter } from "./adapters/vault-adapter";
import { DropboxAdapter, DropboxAuthError } from "./adapters/dropbox-adapter";
import { IndexedDBStore } from "./adapters/indexeddb-store";
import { VaultFileStore } from "./adapters/vault-file-store";
import { SyncEngine } from "./sync/engine";
import type { SyncStateStore } from "./adapters/interfaces";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
  exchangeCodeForToken,
} from "./adapters/dropbox-auth";

const REDIRECT_URI = "obsidian://dropbox-sync";
const MAX_LOG_LINES = 200;
const LOG_BUFFER_FLUSH_SIZE = 10;
const DEBOUNCE_DELAY_MS = 5000;

export default class DropboxSyncPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private statusBar: StatusBar | null = null;
  private syncEngine: SyncEngine | null = null;
  private syncing = false;
  private store: SyncStateStore | null = null;
  private pendingAuth: { codeVerifier: string; state: string } | null = null;
  private syncTimerId: number | null = null;
  private abortController: AbortController | null = null;
  onAuthChange: (() => void) | null = null;
  private logBuffer: string[] = [];
  private debounceTimerId: number | null = null;
  private lastSyncTime: number | null = null;
  private ribbonEl: HTMLElement | null = null;
  private longpollActive = false;
  private longpollTimerId: number | null = null;

  private get logPath(): string {
    return `sync-debug-${this.settings.deviceId || "unknown"}.log`;
  }

  private async log(msg: string, data?: unknown): Promise<void> {
    const ts = new Date().toISOString();
    const detail = data instanceof Error
      ? `${data.name}: ${data.message}` + (data.stack ? `\n${data.stack}` : "")
      : data !== undefined ? JSON.stringify(data) : "";
    const line = detail ? `[${ts}] ${msg} ${detail}` : `[${ts}] ${msg}`;
    console.log("[Dropbox Sync]", msg, data ?? "");
    this.logBuffer.push(line);
    if (this.logBuffer.length >= LOG_BUFFER_FLUSH_SIZE) {
      await this.flushLogs();
    }
  }

  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0) return;
    const toWrite = this.logBuffer.splice(0);
    try {
      let existing = "";
      if (await this.app.vault.adapter.exists(this.logPath)) {
        existing = await this.app.vault.adapter.read(this.logPath);
      }
      const lines = existing ? existing.split("\n").filter(Boolean) : [];
      lines.push(...toWrite);
      const trimmed = lines.slice(-MAX_LOG_LINES);
      await this.app.vault.adapter.write(this.logPath, trimmed.join("\n") + "\n");
    } catch { /* ignore log write failures */ }
  }

  async readLogs(): Promise<string> {
    // flush any buffered lines first
    await this.flushLogs();
    try {
      if (await this.app.vault.adapter.exists(this.logPath)) {
        return await this.app.vault.adapter.read(this.logPath);
      }
    } catch { /* ignore */ }
    return "(no logs)";
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    if (!this.settings.deviceId) {
      this.settings.deviceId = generateDeviceId();
      await this.saveSettings();
    }

    this.addSettingTab(new DropboxSyncSettingTab(this.app, this));

    this.statusBar = new StatusBar(this.addStatusBarItem());

    this.addCommand({
      id: "sync-now",
      name: "Sync now",
      callback: () => this.syncNow(),
    });

    this.addCommand({
      id: "view-logs",
      name: "View sync logs",
      callback: () => this.showLogs(),
    });

    this.addCommand({
      id: "toggle-sync",
      name: "Toggle sync on/off",
      callback: () => {
        if (this.settings.syncEnabled) {
          this.stopSync();
        } else {
          this.startSync();
        }
      },
    });

    // 리본 아이콘
    this.ribbonEl = this.addRibbonIcon("refresh-cw", "Dropbox Sync", () => {
      this.showStatusModal();
    });

    // 상태 바 클릭
    this.statusBar?.onClick(() => this.showStatusModal());

    // 데스크톱: obsidian:// 프로토콜 핸들러 등록
    if (Platform.isDesktop) {
      this.registerObsidianProtocolHandler(
        "dropbox-sync",
        (params) => this.handleAuthCallback(params),
      );
    }

    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.syncName) {
        // 삭제 로그 복원
        const engine = this.getOrCreateEngine();
        if (this.store) {
          const saved = await this.store.getMeta("deleteLog");
          if (saved) {
            try {
              const paths = JSON.parse(saved) as string[];
              engine.restoreDeleteLog(paths);
            } catch { /* ignore parse errors */ }
          }
        }

        // 파일 수정 → debounce sync (항상)
        this.registerEvent(
          this.app.vault.on("modify", (file) => {
            if (this.syncing) return;
            if (file instanceof TFile) {
              this.scheduleDebouncedSync();
            }
          }),
        );

        // 삭제/이름변경 이벤트 추적 + 옵션에 따라 debounce sync
        this.registerEvent(
          this.app.vault.on("delete", (file) => {
            if (this.syncing) return;
            if (file instanceof TFile) {
              const pathLower = file.path.toLowerCase();
              engine.trackDelete(pathLower);
              this.persistDeleteLog(engine);
              if (this.settings.syncOnCreateDeleteRename) {
                this.scheduleDebouncedSync();
              }
            }
          }),
        );

        this.registerEvent(
          this.app.vault.on("rename", (file, oldPath) => {
            if (this.syncing) return;
            if (file instanceof TFile) {
              const oldPathLower = oldPath.toLowerCase();
              engine.trackDelete(oldPathLower);
              this.persistDeleteLog(engine);
              if (this.settings.syncOnCreateDeleteRename) {
                this.scheduleDebouncedSync();
              }
            }
          }),
        );

        // 파일 생성 → 옵션에 따라 debounce sync
        this.registerEvent(
          this.app.vault.on("create", (file) => {
            if (this.syncing) return;
            if (file instanceof TFile && this.settings.syncOnCreateDeleteRename) {
              this.scheduleDebouncedSync();
            }
          }),
        );
      }

      this.applySyncState();
    });
  }

  onunload(): void {
    this.clearSyncTimer();
    this.clearDebounceTimer();
    this.stopLongpoll();
    this.statusBar?.destroy();
  }

  private scheduleDebouncedSync(): void {
    if (!this.settings.syncEnabled) return;
    this.clearDebounceTimer();
    this.debounceTimerId = window.setTimeout(() => {
      this.debounceTimerId = null;
      this.syncNow();
    }, DEBOUNCE_DELAY_MS);
  }

  private clearDebounceTimer(): void {
    if (this.debounceTimerId !== null) {
      window.clearTimeout(this.debounceTimerId);
      this.debounceTimerId = null;
    }
  }

  // ── Longpoll (원격 변경 감지) ──

  private scheduleLongpoll(): void {
    if (!this.settings.syncEnabled || !this.store) return;
    this.clearLongpollTimer();
    this.longpollTimerId = window.setTimeout(() => {
      this.longpollTimerId = null;
      this.runLongpoll();
    }, 1000);
  }

  private async runLongpoll(): Promise<void> {
    if (!this.settings.syncEnabled || !this.store || this.syncing) return;

    try {
      const cursor = await this.store.getMeta("cursor");
      if (!cursor) return;

      this.longpollActive = true;

      const resp = await requestUrl({
        url: "https://notify.dropboxapi.com/2/files/list_folder/longpoll",
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify({ cursor, timeout: 30 }),
        throw: false,
      });

      if (!this.longpollActive || !this.settings.syncEnabled) return;

      if (resp.status !== 200) {
        await this.log("longpoll error", resp.status);
        return;
      }

      const result = resp.json as { changes: boolean; backoff?: number };

      if (result.backoff) {
        this.longpollTimerId = window.setTimeout(() => {
          this.longpollTimerId = null;
          if (result.changes) {
            this.syncNow();
          } else {
            this.scheduleLongpoll();
          }
        }, result.backoff * 1000);
        return;
      }

      if (result.changes) {
        await this.syncNow();
      } else {
        this.scheduleLongpoll();
      }
    } catch (e) {
      await this.log("longpoll error", e);
    } finally {
      this.longpollActive = false;
    }
  }

  private stopLongpoll(): void {
    this.clearLongpollTimer();
    this.longpollActive = false;
  }

  private clearLongpollTimer(): void {
    if (this.longpollTimerId !== null) {
      window.clearTimeout(this.longpollTimerId);
      this.longpollTimerId = null;
    }
  }

  // ── OAuth 플로우 (데스크톱) ──

  /**
   * 데스크톱 원클릭 인증 시작.
   * 브라우저를 열고, 인증 완료 후 obsidian:// 프로토콜로 자동 복귀.
   */
  async startAuth(): Promise<void> {
    const appKey = getEffectiveAppKey(this.settings);
    if (!appKey) {
      new Notice("App Key가 설정되지 않았습니다. Advanced 설정에서 입력하세요.");
      return;
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    this.pendingAuth = { codeVerifier, state };

    const url = buildAuthUrl({
      appKey,
      codeChallenge,
      redirectUri: REDIRECT_URI,
      state,
    });

    window.open(url);
  }

  private async handleAuthCallback(params: Record<string, string>): Promise<void> {
    const { code, state } = params;

    if (!this.pendingAuth) {
      new Notice("No pending authentication. Please try connecting again.");
      return;
    }

    if (state !== this.pendingAuth.state) {
      new Notice("Authentication failed: state mismatch.");
      this.pendingAuth = null;
      return;
    }

    if (!code) {
      new Notice("Authentication failed: no authorization code received.");
      this.pendingAuth = null;
      return;
    }

    try {
      const appKey = getEffectiveAppKey(this.settings);
      const tokenInfo = await exchangeCodeForToken(
        appKey,
        code,
        this.pendingAuth.codeVerifier,
        REDIRECT_URI,
      );

      this.settings.accessToken = tokenInfo.accessToken;
      this.settings.refreshToken = tokenInfo.refreshToken;
      this.settings.tokenExpiry = tokenInfo.expiresAt;
      await this.saveSettings();

      // 엔진 재생성 (새 토큰 반영)
      this.syncEngine = null;

      this.pendingAuth = null;
      new Notice("Connected to Dropbox!");
      this.onAuthChange?.();
    } catch (e) {
      new Notice(`Connection failed: ${(e as Error).message}`);
      this.pendingAuth = null;
    }
  }

  // ── Sync ──

  async syncNow(): Promise<void> {
    if (this.syncing) return;
    if (!this.settings.syncName) {
      new Notice("Dropbox Sync: Set a Vault ID in settings first.");
      return;
    }
    if (!this.settings.refreshToken) {
      new Notice("Dropbox Sync: Not connected. Open settings to connect.");
      return;
    }

    // 네트워크 감지
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await this.log("sync skipped: offline");
      return;
    }

    this.syncing = true;
    this.abortController = new AbortController();
    this.stopLongpoll();
    this.statusBar?.update("syncing");
    await this.log("sync started");

    let cursorUpdated = false;

    try {
      const engine = this.getOrCreateEngine();
      const { plan, result, deletesSkipped, deferredCount } = await engine.runCycle(this.abortController.signal);

      await this.log(`plan: ${plan.items.length} items, succeeded: ${result.succeeded.length}, failed: ${result.failed.length}, deletesSkipped: ${deletesSkipped ?? 0}, deferred: ${deferredCount ?? 0}`);

      // 삭제 로그 영속화 (성공한 항목 제거 후)
      this.persistDeleteLog(engine);

      const total =
        result.succeeded.length + result.failed.length;

      if (result.failed.length > 0) {
        for (const f of result.failed) {
          await this.log(`FAIL ${f.item.action.type} ${f.item.localPath}`, f.error);
        }
        this.statusBar?.update(
          "error",
          `${result.failed.length} failed`,
        );
        const firstErr = result.failed[0];
        const errDetail = firstErr.error instanceof Error ? firstErr.error.message : String(firstErr.error);
        new Notice(
          `Dropbox Sync: ${result.failed.length} failed (${result.succeeded.length} ok)\n${firstErr.item.localPath}: ${errDetail.slice(0, 100)}`,
          8000,
        );
      } else if (deletesSkipped && deletesSkipped > 0) {
        this.statusBar?.update(
          "success",
          `${result.succeeded.length} synced, ${deletesSkipped} deletes skipped`,
        );
        new Notice(
          `Dropbox Sync: ${result.succeeded.length} synced, ${deletesSkipped} deletions skipped by protection.`,
        );
      } else if (result.succeeded.length > 0) {
        this.statusBar?.update(
          "success",
          `${result.succeeded.length} synced`,
        );
      } else {
        this.statusBar?.update("success", "up to date");
      }

      if (result.failed.length === 0 && !deletesSkipped && !deferredCount) {
        cursorUpdated = true;
      }
    } catch (e) {
      // AbortError는 정상적인 중단
      if (e instanceof Error && e.name === "AbortError") {
        await this.log("sync aborted");
        this.statusBar?.update("idle");
        return;
      }
      // 401 토큰 만료/revoke
      if (e instanceof DropboxAuthError) {
        await this.log("auth error — token revoked", e);
        this.settings.accessToken = "";
        this.settings.tokenExpiry = 0;
        await this.saveSettings();
        this.syncEngine = null;
        this.statusBar?.update("error", "auth expired");
        new Notice("Dropbox Sync: Token expired. Please reconnect in settings.");
        return;
      }
      await this.log("sync error", e);
      const msg = (e as Error).message;
      this.statusBar?.update("error", "sync failed");
      new Notice(`Dropbox Sync error: ${msg}`);
    } finally {
      this.syncing = false;
      this.abortController = null;
      this.lastSyncTime = Date.now();
      await this.flushLogs();
      if (cursorUpdated && this.settings.syncEnabled) {
        this.scheduleLongpoll();
      }
    }
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applySyncState();
  }

  resetEngine(): void {
    this.syncEngine = null;
  }

  /** syncEnabled 상태에 따라 타이머 등록/해제 */
  applySyncState(): void {
    const shouldRun =
      this.settings.syncEnabled &&
      !!this.settings.refreshToken &&
      !!this.settings.syncName;

    if (shouldRun) {
      this.clearSyncTimer();
      this.syncTimerId = window.setInterval(
        () => this.syncNow(),
        this.settings.syncInterval * 1000,
      );
      this.registerInterval(this.syncTimerId);
    } else {
      this.clearSyncTimer();
    }
  }

  /** UI "Start Sync" 클릭 */
  async startSync(): Promise<void> {
    this.settings.syncEnabled = true;
    await this.saveSettings();
    this.syncNow();
  }

  /** UI "Stop Sync" 클릭 */
  async stopSync(): Promise<void> {
    this.abortController?.abort();
    this.stopLongpoll();
    this.settings.syncEnabled = false;
    await this.saveSettings();
  }

  private clearSyncTimer(): void {
    if (this.syncTimerId !== null) {
      window.clearInterval(this.syncTimerId);
      this.syncTimerId = null;
    }
  }

  /**
   * Dropbox에 해당 syncName 폴더가 존재하는지 확인.
   * 존재하면 파일 수를 반환, 없으면 null.
   */
  async checkRemoteFolder(syncName: string): Promise<number | null> {
    const appKey = getEffectiveAppKey(this.settings);
    if (!appKey || !this.settings.accessToken) return null;

    try {
      const resp = await requestUrl({
        url: "https://api.dropboxapi.com/2/files/list_folder",
        method: "POST",
        contentType: "application/json",
        headers: {
          Authorization: `Bearer ${this.settings.accessToken}`,
        },
        body: JSON.stringify({
          path: `/${syncName}`,
          recursive: true,
          limit: 100,
        }),
        throw: false,
      });

      if (resp.status === 409) return null; // path/not_found
      if (resp.status !== 200) return null;

      const data = resp.json as { entries: unknown[]; has_more: boolean };
      const fileCount = data.entries.filter(
        (e: any) => e[".tag"] === "file",
      ).length;
      return data.has_more ? fileCount : fileCount; // 정확한 수 또는 최소 수
    } catch {
      return null;
    }
  }

  private showStatusModal(): void {
    new SyncStatusModal(
      this.app,
      {
        status: this.statusBar?.lastStatus ?? "idle",
        detail: this.statusBar?.lastDetail,
        syncEnabled: this.settings.syncEnabled,
        lastSyncTime: this.lastSyncTime,
        deviceId: this.settings.deviceId,
      },
      {
        onSyncNow: () => this.syncNow(),
        onToggleSync: () => {
          if (this.settings.syncEnabled) {
            this.stopSync();
          } else {
            this.startSync();
          }
        },
        onViewLogs: () => this.showLogs(),
      },
    ).open();
  }

  private async showLogs(): Promise<void> {
    const content = await this.readLogs();
    new LogViewerModal(this.app, content, this.settings.deviceId).open();
  }

  private persistDeleteLog(engine: SyncEngine): void {
    if (!this.store) return;
    const log = engine.getDeleteLog();
    this.store.setMeta("deleteLog", JSON.stringify(log)).catch(() => {});
  }

  private getOrCreateEngine(): SyncEngine {
    if (this.syncEngine) return this.syncEngine;

    const vaultId = this.app.vault.getName();

    const fs = new VaultAdapter(this.app.vault, this.settings.excludePatterns);
    const remote = new DropboxAdapter({
      appKey: getEffectiveAppKey(this.settings),
      remotePath: getEffectiveRemotePath(this.settings),
      getAccessToken: () => this.settings.accessToken,
      getRefreshToken: () => this.settings.refreshToken,
      getTokenExpiry: () => this.settings.tokenExpiry,
      onTokenRefreshed: async (accessToken, expiresAt) => {
        this.settings.accessToken = accessToken;
        this.settings.tokenExpiry = expiresAt;
        await this.saveSettings();
      },
    });
    this.store = Platform.isIosApp
      ? new VaultFileStore(this.app.vault)
      : new IndexedDBStore(vaultId);

    this.syncEngine = new SyncEngine(
      { fs, remote, store: this.store },
      {
        conflictStrategy: this.settings.conflictStrategy,
        conflictResolver: async (filePath, context) => {
          const modal = new ConflictModal(this.app, filePath, context);
          return modal.waitForChoice();
        },
        deleteProtection: this.settings.deleteProtection,
        deleteThreshold: this.settings.deleteThreshold,
        onDeleteGuardTriggered: async (guard) => {
          const modal = new DeleteConfirmModal(this.app, guard.deleteItems);
          return modal.waitForConfirmation();
        },
        isFileActive: (path) => {
          const active = this.app.workspace.getActiveFile();
          return active?.path === path;
        },
        excludePatterns: this.settings.excludePatterns,
        concurrency: 3,
        onProgress: (completed, total) => {
          const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
          this.statusBar?.update("syncing", `${pct}% · ${completed}/${total}`);
        },
      },
    );
    return this.syncEngine;
  }
}
