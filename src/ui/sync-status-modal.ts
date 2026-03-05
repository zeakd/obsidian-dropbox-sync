import { App, Modal, Setting } from "obsidian";
import type { SyncStatus } from "./status-bar";

export interface SyncStatusInfo {
  status: SyncStatus;
  detail?: string;
  syncEnabled: boolean;
  lastSyncTime: number | null;
  lastSyncSummary?: string | null;
  deviceId: string;
  version: string;
}

export class SyncStatusModal extends Modal {
  constructor(
    app: App,
    private info: SyncStatusInfo,
    private actions: {
      onSyncNow: () => void;
      onToggleSync: () => void;
      onOpenSettings: () => void;
      onViewLogs: () => void;
      checkRemote?: () => Promise<{ pendingChanges: number } | null>;
    },
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    const { info } = this;

    contentEl.createEl("h3", { text: "Dropbox Sync" });

    const statusText = this.formatStatus();
    const statusEl = contentEl.createEl("p", { text: statusText });
    if (info.status === "error") {
      statusEl.style.color = "var(--text-error)";
    }

    if (info.lastSyncTime) {
      const ago = this.timeAgo(info.lastSyncTime);
      const text = info.lastSyncSummary
        ? `Last sync: ${ago} — ${info.lastSyncSummary}`
        : `Last sync: ${ago}`;
      contentEl.createEl("p", { text, cls: "setting-item-description" });
    }

    // Dropbox 실시간 상태 (비동기)
    const remoteEl = contentEl.createEl("p", {
      text: "Dropbox: checking...",
      cls: "setting-item-description",
    });
    this.checkRemoteStatus(remoteEl);

    contentEl.createEl("p", {
      text: `Device: ${info.deviceId} · v${info.version}`,
      cls: "setting-item-description",
    });

    const btnRow = new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Sync Now")
          .setCta()
          .onClick(() => {
            this.close();
            this.actions.onSyncNow();
          }),
      )
      .addButton((btn) =>
        btn
          .setButtonText(info.syncEnabled ? "Stop Sync" : "Start Sync")
          .onClick(() => {
            this.close();
            this.actions.onToggleSync();
          }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Settings")
          .onClick(() => {
            this.close();
            this.actions.onOpenSettings();
          }),
      );

    if (info.status === "error") {
      btnRow.addButton((btn) =>
        btn
          .setButtonText("View Logs")
          .onClick(() => {
            this.close();
            this.actions.onViewLogs();
          }),
      );
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async checkRemoteStatus(el: HTMLElement): Promise<void> {
    if (!this.actions.checkRemote) {
      el.textContent = "Dropbox: not connected";
      return;
    }

    try {
      const result = await this.actions.checkRemote();
      if (!result) {
        el.textContent = "Dropbox: not connected";
      } else if (result.pendingChanges > 0) {
        el.textContent = `Dropbox: ${result.pendingChanges} pending change(s)`;
        el.style.color = "var(--text-accent)";
      } else {
        el.textContent = "Dropbox: up to date";
        el.style.color = "var(--text-success, var(--text-normal))";
      }
    } catch {
      el.textContent = "Dropbox: check failed";
      el.style.color = "var(--text-error)";
    }
  }

  private formatStatus(): string {
    switch (this.info.status) {
      case "idle": return "Idle";
      case "syncing": return this.info.detail ? `Syncing: ${this.info.detail}` : "Syncing...";
      case "success": return this.info.detail ?? "Synced";
      case "error": return this.info.detail ?? "Error";
    }
  }

  private timeAgo(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
}
