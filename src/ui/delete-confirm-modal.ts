import { App, Modal, Setting } from "obsidian";
import type { SyncPlanItem } from "../types";

/**
 * 대량 삭제 확인 모달.
 * 삭제 대상 목록을 보여주고 사용자 확인을 받는다.
 */
export class DeleteConfirmModal extends Modal {
  private confirmed = false;
  private resolve: ((confirmed: boolean) => void) | null = null;

  constructor(
    app: App,
    private deleteItems: SyncPlanItem[],
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: "Delete Protection" });
    contentEl.createEl("p", {
      text: `${this.deleteItems.length} files will be deleted. Continue?`,
    });

    const list = contentEl.createEl("ul");
    const maxShow = 20;
    for (const item of this.deleteItems.slice(0, maxShow)) {
      const direction = item.action.type === "deleteRemote" ? "remote" : "local";
      list.createEl("li", { text: `${item.localPath} (${direction})` });
    }
    if (this.deleteItems.length > maxShow) {
      list.createEl("li", {
        text: `... and ${this.deleteItems.length - maxShow} more`,
      });
    }

    contentEl.createEl("p", {
      text: "Deleted files on Dropbox can be recovered from the Dropbox web trash (30–180 days).",
      cls: "setting-item-description",
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Delete")
          .setWarning()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Skip deletions").onClick(() => {
          this.close();
        }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve?.(this.confirmed);
  }

  waitForConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }
}
