import { App, Modal, Setting } from "obsidian";
import type { SyncStatus } from "./status-bar";
import { LogViewerModal } from "./log-viewer-modal";

export interface SyncStatusInfo {
  status: SyncStatus;
  detail?: string;
  syncEnabled: boolean;
  lastSyncTime: number | null;
  deviceId: string;
}

export class SyncStatusModal extends Modal {
  constructor(
    app: App,
    private info: SyncStatusInfo,
    private actions: {
      onSyncNow: () => void;
      onToggleSync: () => void;
      onViewLogs: () => Promise<void>;
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
      contentEl.createEl("p", {
        text: `Last sync: ${ago}`,
        cls: "setting-item-description",
      });
    }

    contentEl.createEl("p", {
      text: `Device: ${info.deviceId}`,
      cls: "setting-item-description",
    });

    new Setting(contentEl)
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
          .setButtonText("View Logs")
          .onClick(async () => {
            this.close();
            await this.actions.onViewLogs();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
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
