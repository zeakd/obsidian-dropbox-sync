import { Menu, Notice, Platform, Plugin, TFile } from "obsidian";
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
import { OnboardingModal } from "./ui/onboarding-modal";
import { VaultAdapter } from "./adapters/vault-adapter";
import { DropboxAdapter, DropboxAuthError } from "./adapters/dropbox-adapter";
import { IndexedDBStore } from "./adapters/indexeddb-store";
import { VaultFileStore } from "./adapters/vault-file-store";
import type { RemoteStorage, SyncStateStore } from "./adapters/interfaces";
import { DesktopAuth } from "./auth/desktop-auth";
import { LongpollManager } from "./sync/longpoll";
import { EngineManager } from "./sync/engine-manager";
import { registerDemoCommands } from "./debug/demo-commands";
import type { SyncEngine } from "./sync/engine";

const MAX_LOG_LINES = 200;
const LOG_BUFFER_FLUSH_SIZE = 10;
const DEBOUNCE_DELAY_MS = 5000;

export default class DropboxSyncPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  private statusBar: StatusBar | null = null;
  private syncing = false;
  private syncTimerId: number | null = null;
  private abortController: AbortController | null = null;
  onAuthChange: (() => void) | null = null;
  private logBuffer: string[] = [];
  private debounceTimerId: number | null = null;
  private lastSyncTime: number | null = null;
  private ribbonEl: HTMLElement | null = null;
  private conflictIndex = 0;
  private conflictTotal = 0;

  // ── 모듈 ──
  private auth: DesktopAuth | null = null;
  private longpoll: LongpollManager | null = null;
  private engineMgr: EngineManager | null = null;

  private get logPath(): string {
    return `sync-debug-${this.settings.deviceId || "unknown"}.log`;
  }

  // ── Lifecycle ──

  async onload(): Promise<void> {
    await this.loadSettings();

    if (!this.settings.deviceId) {
      this.settings.deviceId = generateDeviceId();
      await this.saveSettings();
    }

    this.addSettingTab(new DropboxSyncSettingTab(this.app, this));
    this.statusBar = new StatusBar(this.addStatusBarItem());

    // 커맨드 등록
    this.addCommand({ id: "sync-now", name: "Sync now", callback: () => this.syncNow() });
    this.addCommand({ id: "view-logs", name: "View sync logs", callback: () => this.showLogs() });
    this.addCommand({
      id: "toggle-sync",
      name: "Toggle sync on/off",
      callback: () => this.settings.syncEnabled ? this.stopSync() : this.startSync(),
    });

    registerDemoCommands(this);

    // Auth (데스크톱)
    this.auth = new DesktopAuth(() => getEffectiveAppKey(this.settings));
    if (Platform.isDesktop) {
      this.registerObsidianProtocolHandler(
        "dropbox-sync",
        (params) => this.handleAuthCallback(params),
      );
    }

    // UI: 리본 + 상태 바
    this.ribbonEl = this.addRibbonIcon("refresh-cw", "Dropbox Sync", () => this.showStatusModal());
    this.ribbonEl.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.showContextMenu(evt);
    });
    this.statusBar?.onClick(() => this.showStatusModal());
    this.statusBar?.onContextMenu((evt) => this.showContextMenu(evt));

    this.app.workspace.onLayoutReady(async () => {
      if (this.settings.syncName) {
        await this.initEngine();
        this.registerVaultEvents();
      }
      this.applySyncState();
      this.showOnboardingIfNeeded();
    });
  }

  onunload(): void {
    this.clearSyncTimer();
    this.clearDebounceTimer();
    this.longpoll?.stop();
    this.statusBar?.destroy();
  }

  // ── Settings ──

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.engineMgr?.reset();
    this.applySyncState();
  }

  resetEngine(): void {
    this.engineMgr?.reset();
  }

  // ── Auth ──

  async startAuth(): Promise<void> {
    await this.auth?.start();
  }

  private async handleAuthCallback(params: Record<string, string>): Promise<void> {
    if (!this.auth) return;
    const tokens = await this.auth.handleCallback(params);
    if (!tokens) return;

    this.settings.accessToken = tokens.accessToken;
    this.settings.refreshToken = tokens.refreshToken;
    this.settings.tokenExpiry = tokens.expiresAt;
    await this.saveSettings();

    new Notice("Connected to Dropbox!");
    this.onAuthChange?.();
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
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await this.log("sync skipped: offline");
      return;
    }

    this.syncing = true;
    this.abortController = new AbortController();
    this.longpoll?.stop();
    this.statusBar?.update("syncing");
    await this.log("sync started");

    let cursorUpdated = false;

    try {
      const engine = this.getOrCreateEngine();
      this.conflictIndex = 0;
      this.conflictTotal = 0;
      const { plan, result, deletesSkipped, deferredCount } = await engine.runCycle(this.abortController.signal);

      await this.log(`plan: ${plan.items.length} items, succeeded: ${result.succeeded.length}, failed: ${result.failed.length}, deletesSkipped: ${deletesSkipped ?? 0}, deferred: ${deferredCount ?? 0}`);
      this.engineMgr?.persistDeleteLog();

      this.reportSyncResult(result, deletesSkipped);

      if (result.failed.length === 0 && !deletesSkipped && !deferredCount) {
        cursorUpdated = true;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        await this.log("sync aborted");
        this.statusBar?.update("idle");
        return;
      }
      if (e instanceof DropboxAuthError) {
        await this.log("auth error — token revoked", e);
        this.settings.accessToken = "";
        this.settings.tokenExpiry = 0;
        await this.saveSettings();
        this.statusBar?.update("error", "auth expired");
        new Notice("Dropbox Sync: Token expired. Please reconnect in settings.");
        return;
      }
      await this.log("sync error", e);
      this.statusBar?.update("error", "sync failed");
      new Notice(`Dropbox Sync error: ${(e as Error).message}`);
    } finally {
      this.syncing = false;
      this.abortController = null;
      this.lastSyncTime = Date.now();
      await this.flushLogs();
      if (cursorUpdated && this.settings.syncEnabled) {
        this.longpoll?.schedule();
      }
    }
  }

  async startSync(): Promise<void> {
    this.settings.syncEnabled = true;
    await this.saveSettings();
    this.syncNow();
  }

  async stopSync(): Promise<void> {
    this.abortController?.abort();
    this.longpoll?.stop();
    this.settings.syncEnabled = false;
    await this.saveSettings();
  }

  // ── Engine 접근자 (demo-commands 등에서 사용) ──

  getOrCreateEngine(): SyncEngine {
    return this.getEngineManager().getOrCreate();
  }

  getRemoteAdapter(): RemoteStorage | null {
    return this.engineMgr?.remote ?? null;
  }

  getStore(): SyncStateStore | null {
    return this.engineMgr?.store ?? null;
  }

  // ── Remote folder check (settings-tab에서 사용) ──

  async checkRemoteFolder(syncName: string): Promise<number | null> {
    const appKey = getEffectiveAppKey(this.settings);
    if (!appKey || !this.settings.accessToken) return null;

    try {
      const { requestUrl } = await import("obsidian");
      const resp = await requestUrl({
        url: "https://api.dropboxapi.com/2/files/list_folder",
        method: "POST",
        contentType: "application/json",
        headers: { Authorization: `Bearer ${this.settings.accessToken}` },
        body: JSON.stringify({ path: `/${syncName}`, recursive: true, limit: 100 }),
        throw: false,
      });
      if (resp.status !== 200) return null;
      const data = resp.json as { entries: unknown[] };
      return data.entries.filter((e: any) => e[".tag"] === "file").length;
    } catch {
      return null;
    }
  }

  async readLogs(): Promise<string> {
    await this.flushLogs();
    try {
      if (await this.app.vault.adapter.exists(this.logPath)) {
        return await this.app.vault.adapter.read(this.logPath);
      }
    } catch { /* ignore */ }
    return "(no logs)";
  }

  // ── Private: Engine ──

  private getEngineManager(): EngineManager {
    if (!this.engineMgr) {
      this.engineMgr = new EngineManager({
        createDeps: () => this.createEngineDeps(),
        getOptions: () => this.createEngineOptions(),
      });

      this.longpoll = new LongpollManager({
        getCursor: async () => this.engineMgr?.store?.getMeta("cursor") ?? null,
        isSyncing: () => this.syncing,
        isEnabled: () => this.settings.syncEnabled && !!this.engineMgr?.store,
        onChanges: () => this.syncNow(),
        log: (msg, data) => this.log(msg, data),
      });
    }
    return this.engineMgr;
  }

  private createEngineDeps() {
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
    const store: SyncStateStore = Platform.isIosApp
      ? new VaultFileStore(this.app.vault)
      : new IndexedDBStore(vaultId);

    return { fs, remote, store };
  }

  private createEngineOptions() {
    return {
      conflictStrategy: this.settings.conflictStrategy,
      conflictResolver: async (filePath: string, context: any) => {
        this.conflictIndex++;
        const modal = new ConflictModal(this.app, filePath, context, {
          index: this.conflictIndex,
          total: this.conflictTotal,
        });
        return modal.waitForChoice();
      },
      deleteProtection: this.settings.deleteProtection,
      deleteThreshold: this.settings.deleteThreshold,
      onDeleteGuardTriggered: async (guard: any) => {
        const modal = new DeleteConfirmModal(this.app, guard.deleteItems);
        return modal.waitForConfirmation();
      },
      isFileActive: (path: string) => this.app.workspace.getActiveFile()?.path === path,
      excludePatterns: this.settings.excludePatterns,
      concurrency: 3,
      onConflictCount: (count: number) => {
        this.conflictTotal = count;
        this.conflictIndex = 0;
      },
      onProgress: (completed: number, total: number) => {
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        this.statusBar?.update("syncing", `${pct}% · ${completed}/${total}`);
      },
    };
  }

  // ── Private: Init ──

  private async initEngine(): Promise<void> {
    this.getOrCreateEngine();
    await this.engineMgr?.restoreDeleteLog();
  }

  private registerVaultEvents(): void {
    const engine = this.getOrCreateEngine();

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (this.syncing || !(file instanceof TFile)) return;
        this.scheduleDebouncedSync();
      }),
    );

    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        if (this.syncing || !(file instanceof TFile)) return;
        engine.trackDelete(file.path.toLowerCase());
        this.engineMgr?.persistDeleteLog();
        if (this.settings.syncOnCreateDeleteRename) this.scheduleDebouncedSync();
      }),
    );

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.syncing || !(file instanceof TFile)) return;
        engine.trackDelete(oldPath.toLowerCase());
        this.engineMgr?.persistDeleteLog();
        if (this.settings.syncOnCreateDeleteRename) this.scheduleDebouncedSync();
      }),
    );

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (this.syncing || !(file instanceof TFile)) return;
        if (this.settings.syncOnCreateDeleteRename) this.scheduleDebouncedSync();
      }),
    );
  }

  private async showOnboardingIfNeeded(): Promise<void> {
    if (this.settings.onboardingDone) return;
    this.settings.onboardingDone = true;
    await this.saveSettings();
    if (!this.settings.refreshToken) {
      new OnboardingModal(this.app, {
        onOpenSettings: () => this.openSettings(),
      }).open();
    }
  }

  // ── Private: Timers ──

  applySyncState(): void {
    if (this.statusBar) {
      this.statusBar.enabled = this.settings.syncEnabled;
    }

    const shouldRun = this.settings.syncEnabled && !!this.settings.refreshToken && !!this.settings.syncName;
    if (shouldRun) {
      this.clearSyncTimer();
      this.syncTimerId = window.setInterval(() => this.syncNow(), this.settings.syncInterval * 1000);
      this.registerInterval(this.syncTimerId);
    } else {
      this.clearSyncTimer();
    }
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

  private clearSyncTimer(): void {
    if (this.syncTimerId !== null) {
      window.clearInterval(this.syncTimerId);
      this.syncTimerId = null;
    }
  }

  // ── Private: UI ──

  private showStatusModal(): void {
    new SyncStatusModal(
      this.app,
      {
        status: this.statusBar?.lastStatus ?? "idle",
        detail: this.statusBar?.lastDetail,
        syncEnabled: this.settings.syncEnabled,
        lastSyncTime: this.lastSyncTime,
        deviceId: this.settings.deviceId,
        version: this.manifest.version,
      },
      {
        onSyncNow: () => this.syncNow(),
        onToggleSync: () => this.settings.syncEnabled ? this.stopSync() : this.startSync(),
        onOpenSettings: () => this.openSettings(),
        checkRemote: () => this.checkRemoteChanges(),
      },
    ).open();
  }

  private showContextMenu(evt: MouseEvent): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle("Sync Now").setIcon("refresh-cw").onClick(() => this.syncNow()),
    );
    menu.addItem((item) =>
      item
        .setTitle(this.settings.syncEnabled ? "Stop Sync" : "Start Sync")
        .setIcon(this.settings.syncEnabled ? "pause" : "play")
        .onClick(() => this.settings.syncEnabled ? this.stopSync() : this.startSync()),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle("Settings").setIcon("settings").onClick(() => this.openSettings()),
    );
    menu.showAtMouseEvent(evt);
  }

  private async showLogs(): Promise<void> {
    const content = await this.readLogs();
    new LogViewerModal(this.app, content, this.settings.deviceId).open();
  }

  private openSettings(): void {
    // @ts-expect-error — Obsidian internal API
    this.app.setting?.open();
    // @ts-expect-error — Obsidian internal API
    this.app.setting?.openTabById(this.manifest.id);
  }

  private reportSyncResult(
    result: { succeeded: { action: { type: string } }[]; failed: { item: { action: { type: string }; localPath: string }; error: Error }[] },
    deletesSkipped?: number,
  ): void {
    if (result.failed.length > 0) {
      for (const f of result.failed) {
        this.log(`FAIL ${f.item.action.type} ${f.item.localPath}`, f.error);
      }
      this.statusBar?.update("error", `${result.failed.length} failed`);
      const first = result.failed[0];
      const detail = first.error?.message?.slice(0, 100) ?? "";
      new Notice(
        `Dropbox Sync: ${result.failed.length} failed (${result.succeeded.length} ok)\n${first.item.localPath}: ${detail}`,
        8000,
      );
    } else if (deletesSkipped && deletesSkipped > 0) {
      const summary = this.summarizeActions(result.succeeded);
      this.statusBar?.update("success", `${summary}, ${deletesSkipped} deletes skipped`);
      new Notice(`Dropbox Sync: ${summary}, ${deletesSkipped} deletions skipped by protection.`);
    } else if (result.succeeded.length > 0) {
      const summary = this.summarizeActions(result.succeeded);
      this.statusBar?.update("success", summary);
      new Notice(`Dropbox Sync: ${summary}`);
    } else {
      this.statusBar?.update("success", "up to date");
    }
  }

  private summarizeActions(items: { action: { type: string } }[]): string {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.action.type] = (counts[item.action.type] ?? 0) + 1;
    }
    const labels: [string, string][] = [
      ["upload", "\u2191"],
      ["download", "\u2193"],
      ["conflict", "\u26A1"],
      ["deleteLocal", "\u2193\u2717"],
      ["deleteRemote", "\u2191\u2717"],
    ];
    const parts: string[] = [];
    for (const [type, icon] of labels) {
      if (counts[type]) parts.push(`${icon}${counts[type]}`);
    }
    return parts.length > 0 ? parts.join(" ") : `${items.length} synced`;
  }

  private async checkRemoteChanges(): Promise<{ pendingChanges: number } | null> {
    const store = this.engineMgr?.store;
    const remote = this.engineMgr?.remote;
    if (!store || !remote) return null;
    const cursor = await store.getMeta("cursor");
    if (!cursor) return null;
    const result = await remote.listChanges(cursor);
    return { pendingChanges: result.entries.length };
  }

  // ── Private: Logging ──

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
}
