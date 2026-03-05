import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
  private confirmed = false;
  private resolve: ((confirmed: boolean) => void) | null = null;

  constructor(
    app: App,
    private title: string,
    private message: string,
    private warning?: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    contentEl.createEl("p", { text: this.message });
    if (this.warning) {
      contentEl.createEl("p", {
        text: this.warning,
        cls: "mod-warning",
      });
    }

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Confirm")
          .setCta()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => this.close()),
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
