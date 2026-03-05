import { App, Modal, Setting } from "obsidian";

export class OnboardingModal extends Modal {
  constructor(
    app: App,
    private actions: {
      onOpenSettings: () => void;
    },
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;

    contentEl.createEl("h2", { text: "Dropbox Sync" });
    contentEl.createEl("p", {
      text: "Sync your Obsidian vault with Dropbox. Use the same vault across multiple devices.",
    });

    const steps = contentEl.createEl("ol");
    steps.style.paddingLeft = "20px";
    steps.style.lineHeight = "1.8";

    steps.createEl("li", { text: "Connect your Dropbox account." });
    steps.createEl("li", { text: "Set a Vault ID (your Dropbox folder name)." });
    steps.createEl("li", { text: "Enable sync to start syncing automatically." });

    contentEl.createEl("p", {
      text: "You can get started right from Settings.",
      cls: "setting-item-description",
    });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("Open Settings")
          .setCta()
          .onClick(() => {
            this.close();
            this.actions.onOpenSettings();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Later").onClick(() => this.close()),
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
