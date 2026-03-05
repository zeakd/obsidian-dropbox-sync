import { App, Modal, Setting, Notice } from "obsidian";

export class LogViewerModal extends Modal {
  constructor(
    app: App,
    private logContent: string,
    private deviceId: string,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl("h3", { text: `Sync Logs (${this.deviceId})` });

    const pre = contentEl.createEl("pre");
    pre.style.maxHeight = "400px";
    pre.style.overflow = "auto";
    pre.style.fontSize = "11px";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-all";
    pre.style.padding = "8px";
    pre.style.border = "1px solid var(--background-modifier-border)";
    pre.style.borderRadius = "4px";
    pre.setText(this.logContent);

    // Scroll to bottom (latest logs)
    pre.scrollTop = pre.scrollHeight;

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Copy to clipboard")
          .setCta()
          .onClick(async () => {
            await navigator.clipboard.writeText(this.logContent);
            new Notice("Logs copied to clipboard");
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Close").onClick(() => this.close()),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
