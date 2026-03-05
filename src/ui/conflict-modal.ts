import { App, Modal, Setting } from "obsidian";
import type { ConflictContext } from "../types";

export type ConflictChoice = "local" | "remote";

export class ConflictModal extends Modal {
  private choice: ConflictChoice | null = null;
  private resolve: ((choice: ConflictChoice | null) => void) | null = null;

  constructor(
    app: App,
    private filePath: string,
    private context?: ConflictContext,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, context } = this;

    contentEl.createEl("h3", { text: "Sync Conflict" });
    contentEl.createEl("p", {
      text: `"${this.filePath}" was modified on both this device and Dropbox.`,
    });

    if (context?.localContent !== undefined && context?.remoteContent !== undefined) {
      this.renderTextCompare(contentEl, context.localContent, context.remoteContent);
    } else if (context) {
      this.renderMetadata(contentEl, context);
    }

    contentEl.createEl("p", { text: "Which version do you want to keep?" });

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

  waitForChoice(): Promise<ConflictChoice | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.open();
    });
  }

  private renderTextCompare(el: HTMLElement, local: string, remote: string): void {
    const container = el.createDiv();
    container.style.display = "grid";
    container.style.gridTemplateColumns = "1fr 1fr";
    container.style.gap = "8px";
    container.style.marginBottom = "16px";

    const taStyle = (ta: HTMLTextAreaElement) => {
      ta.readOnly = true;
      ta.style.width = "100%";
      ta.style.height = "300px";
      ta.style.fontSize = "11px";
      ta.style.fontFamily = "monospace";
      ta.style.resize = "vertical";
      ta.style.border = "1px solid var(--background-modifier-border)";
      ta.style.borderRadius = "4px";
      ta.style.padding = "8px";
      ta.style.background = "var(--background-secondary)";
      ta.style.color = "var(--text-normal)";
    };

    const localCol = container.createDiv();
    localCol.createEl("h4", { text: "Local (this device)" });
    const localTa = localCol.createEl("textarea");
    localTa.value = local;
    taStyle(localTa);

    const remoteCol = container.createDiv();
    remoteCol.createEl("h4", { text: "Remote (Dropbox)" });
    const remoteTa = remoteCol.createEl("textarea");
    remoteTa.value = remote;
    taStyle(remoteTa);
  }

  private renderMetadata(el: HTMLElement, ctx: ConflictContext): void {
    const parts: string[] = [];
    if (ctx.localSize !== undefined) parts.push(`Local: ${this.formatSize(ctx.localSize)}`);
    if (ctx.remoteSize !== undefined) parts.push(`Remote: ${this.formatSize(ctx.remoteSize)}`);
    if (ctx.remoteMtime) parts.push(`Remote modified: ${new Date(ctx.remoteMtime).toLocaleString()}`);
    if (parts.length > 0) {
      el.createEl("p", { text: parts.join(" · "), cls: "setting-item-description" });
    }
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
