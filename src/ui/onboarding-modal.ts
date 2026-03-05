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
      text: "Obsidian vault를 Dropbox와 동기화합니다. 여러 기기에서 같은 vault를 사용할 수 있습니다.",
    });

    const steps = contentEl.createEl("ol");
    steps.style.paddingLeft = "20px";
    steps.style.lineHeight = "1.8";

    steps.createEl("li", { text: "Dropbox 계정을 연결합니다." });
    steps.createEl("li", { text: "Vault ID를 설정합니다 (Dropbox 폴더명)." });
    steps.createEl("li", { text: "Sync를 켜면 자동으로 동기화가 시작됩니다." });

    contentEl.createEl("p", {
      text: "설정에서 바로 시작할 수 있습니다.",
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
