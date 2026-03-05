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

    const ta = contentEl.createEl("textarea");
    ta.value = this.logContent;
    ta.readOnly = true;
    ta.style.width = "100%";
    ta.style.height = "400px";
    ta.style.fontSize = "11px";
    ta.style.fontFamily = "monospace";
    ta.style.resize = "vertical";
    ta.style.border = "1px solid var(--background-modifier-border)";
    ta.style.borderRadius = "4px";
    ta.style.padding = "8px";
    ta.style.background = "var(--background-secondary)";
    ta.style.color = "var(--text-normal)";

    // Scroll to bottom (latest logs)
    ta.scrollTop = ta.scrollHeight;

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
