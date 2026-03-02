import { App, Modal, Setting } from "obsidian";

export type ConflictChoice = "local" | "remote";

export class ConflictModal extends Modal {
  private choice: ConflictChoice | null = null;
  private resolve: ((choice: ConflictChoice | null) => void) | null = null;

  constructor(
    app: App,
    private filePath: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: "Sync Conflict" });
    contentEl.createEl("p", {
      text: `"${this.filePath}" was modified on both this device and Dropbox.`,
    });
    contentEl.createEl("p", {
      text: "Which version do you want to keep?",
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Keep local").setCta().onClick(() => {
          this.choice = "local";
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Keep remote").onClick(() => {
          this.choice = "remote";
          this.close();
        }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve?.(this.choice);
  }

  /** Modal을 열고 사용자 선택을 기다린다. */
  waitForChoice(): Promise<ConflictChoice | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }
}
