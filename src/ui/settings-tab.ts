import { App, Platform, PluginSettingTab, Setting, Notice, TFile } from "obsidian";
import type { ConflictStrategy } from "../types";
import type DropboxSyncPlugin from "../main";
import { ConfirmModal } from "./confirm-modal";
import { DEFAULT_APP_KEY, getEffectiveAppKey, isValidSyncName, sanitizeSyncName } from "../settings";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  buildAuthUrl,
  exchangeCodeForToken,
} from "../adapters/dropbox-auth";
import { LogViewerModal } from "./log-viewer-modal";
import { isExcluded } from "../exclude";

const DOCS_BASE = "https://github.com/zeakd/obsidian-dropbox-sync/blob/main/docs";

export class DropboxSyncSettingTab extends PluginSettingTab {
  private codeVerifier: string | null = null;

  constructor(
    app: App,
    private plugin: DropboxSyncPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    this.plugin.onAuthChange = () => this.display();

    const { containerEl } = this;
    containerEl.empty();

    const isConnected = !!this.plugin.settings.refreshToken;
    const hasSyncName = !!this.plugin.settings.syncName;
    const syncRunning = this.plugin.settings.syncEnabled;

    // ── Status bar ──
    const version = `v${this.plugin.manifest.version}`;
    const status = new Setting(containerEl);
    status.settingEl.style.paddingTop = "28px";
    status.settingEl.style.paddingBottom = "28px";
    if (syncRunning) {
      status
        .setName(`Sync is running · ${version}`)
        .setDesc("Your vault is being synced with Dropbox.")
        .addButton((btn) =>
          btn.setButtonText("Sync now").onClick(() => this.plugin.syncNow()),
        );
    } else if (isConnected && hasSyncName) {
      status
        .setName(`Sync is stopped · ${version}`)
        .setDesc("Toggle sync on to start syncing.");
    } else if (isConnected) {
      status
        .setName(`Not syncing · ${version}`)
        .setDesc("Set a Vault ID to get started.");
    } else {
      status
        .setName(`Not connected · ${version}`)
        .setDesc("Connect to Dropbox to set up sync.");
    }

    // ── Sync ──
    new Setting(containerEl).setName("Sync").setHeading();
    if (!isConnected) {
      new Setting(containerEl)
        .setDesc("Connect to Dropbox to set up sync.");
    } else {
      this.renderSyncSection(containerEl, hasSyncName, syncRunning);
      if (hasSyncName) {
        this.renderSyncNameChange(containerEl, this.plugin.settings.syncName);
      }
      if (hasSyncName) {
        this.renderSyncOptions(containerEl);
      }
    }

    // ── Connection ──
    new Setting(containerEl).setName("Connection").setHeading();
    if (isConnected) {
      this.renderDisconnect(containerEl);
    } else {
      this.renderAuth(containerEl);
    }
    this.renderAppKey(containerEl);

    // ── Troubleshooting ──
    const troubleshootingFrag = document.createDocumentFragment();
    const tsLink = troubleshootingFrag.createEl("a", { text: "Troubleshooting guide", href: `${DOCS_BASE}/troubleshooting.md` });
    tsLink.setAttr("target", "_blank");
    new Setting(containerEl).setName("Troubleshooting").setDesc(troubleshootingFrag).setHeading();
    new Setting(containerEl)
      .setName("View sync logs")
      .setDesc(`Device: ${this.plugin.settings.deviceId || "unknown"}`)
      .addButton((btn) =>
        btn.setButtonText("View Logs").onClick(async () => {
          const content = await this.plugin.readLogs();
          new LogViewerModal(this.app, content, this.plugin.settings.deviceId).open();
        }),
      );
  }

  // ── 인증 (미연결 시) ──
  private renderAuth(containerEl: HTMLElement): void {
    if (Platform.isDesktop) {
      this.renderDesktopAuth(containerEl);
    } else {
      this.renderMobileAuth(containerEl);
    }
  }

  private renderSyncSection(
    containerEl: HTMLElement,
    hasSyncName: boolean,
    syncRunning: boolean,
  ): void {
    if (!hasSyncName) {
      this.renderSyncNameSetup(containerEl);
      return;
    }

    const syncName = this.plugin.settings.syncName;

    new Setting(containerEl)
      .setName("Enable sync")
      .addToggle((toggle) =>
        toggle.setValue(syncRunning).onChange(async (value) => {
          if (value) {
            await this.plugin.startSync();
          } else {
            await this.plugin.stopSync();
          }
          this.display();
        }),
      );

  }

  // 최초 설정: 이름 입력 + Set
  private renderSyncNameSetup(containerEl: HTMLElement): void {
    const defaultName = sanitizeSyncName(this.app.vault.getName());
    let inputName = defaultName;
    let setBtnEl: HTMLButtonElement | null = null;
    const setting = new Setting(containerEl)
      .setName("Vault ID")
      .setDesc("Letters, numbers, hyphens, underscores only.")
      .addText((text) =>
        text
          .setPlaceholder(defaultName)
          .setValue(defaultName)
          .onChange((value) => {
            inputName = value.trim();
            const valid = isValidSyncName(inputName);
            if (setBtnEl) setBtnEl.disabled = !valid;
            setting.setDesc(
              valid || !inputName
                ? "Letters, numbers, hyphens, underscores only."
                : `Invalid name: "${inputName}". Use only a-z, 0-9, -, _`,
            );
          }),
      )
      .addButton((btn) => {
        btn
          .setButtonText("Set")
          .setCta()
          .onClick(async () => {
            if (!isValidSyncName(inputName)) {
              new Notice("Invalid Vault ID.");
              return;
            }
            const fileCount = await this.plugin.checkRemoteFolder(inputName);
            if (fileCount !== null) {
              const confirmed = await new ConfirmModal(
                this.app,
                "Folder already exists",
                `"${inputName}" already has ${fileCount}+ files on Dropbox.`,
                "Your local vault will be synced with this existing folder. "
                + "This may overwrite local or remote files.",
              ).waitForConfirmation();
              if (!confirmed) return;
            }
            this.plugin.settings.syncName = inputName;
            await this.plugin.saveSettings();
            this.plugin.resetEngine();
            new Notice(`Vault ID set: ${inputName}`);
            this.display();
          });
        setBtnEl = btn.buttonEl;
        setBtnEl.disabled = !isValidSyncName(defaultName);
      });
  }

  // 이름 변경: Connection 섹션 안에서 변경 (위험 경고)
  private renderSyncNameChange(containerEl: HTMLElement, savedName: string): void {
    let pendingName = savedName;
    let changeBtnEl: HTMLButtonElement | null = null;

    const setting = new Setting(containerEl)
      .setName("Change Vault ID")
      .addText((text) =>
        text.setValue(savedName).onChange((value) => {
          pendingName = value.trim();
          const valid = isValidSyncName(pendingName);
          const changed = valid && pendingName !== savedName;
          if (changeBtnEl) {
            changeBtnEl.disabled = !changed;
            changeBtnEl.toggleClass("mod-cta", changed);
          }
          setting.setDesc(
            !pendingName || valid
              ? ""
              : `Invalid name. Use only a-z, 0-9, -, _`,
          );
        }),
      )
      .addButton((btn) => {
        btn
          .setButtonText("Change")
          .onClick(async () => {
            if (!isValidSyncName(pendingName)) {
              new Notice("Invalid Vault ID. Use only letters, numbers, hyphens, underscores.");
              return;
            }
            if (pendingName === savedName) return;

            const fileCount = await this.plugin.checkRemoteFolder(pendingName);
            const exists = fileCount !== null;

            const confirmed = await new ConfirmModal(
              this.app,
              `"${savedName}" → "${pendingName}"`,
              exists
                ? `"${pendingName}" already has ${fileCount}+ files on Dropbox.`
                : `"${pendingName}" is a new folder on Dropbox.`,
              exists
                ? "Changing will stop syncing with the current folder. "
                  + "Your local vault will merge with the existing remote folder. "
                  + "This may cause conflicts or data overwrite."
                : "Changing will stop syncing with the current folder. "
                  + "Files in \"" + savedName + "\" on Dropbox will remain untouched. "
                  + "A full upload to the new folder will occur on next sync.",
            ).waitForConfirmation();
            if (!confirmed) return;
            this.plugin.settings.syncName = pendingName;
            await this.plugin.saveSettings();
            this.plugin.resetEngine();
            new Notice(`Vault ID changed: ${pendingName}`);
            this.display();
          });
        changeBtnEl = btn.buttonEl;
        changeBtnEl.disabled = true;
      });
  }

  private renderDisconnect(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Connected to Dropbox")
      .addButton((btn) =>
        btn
          .setButtonText("Disconnect")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.refreshToken = "";
            this.plugin.settings.accessToken = "";
            this.plugin.settings.tokenExpiry = 0;
            this.plugin.settings.syncEnabled = false;
            await this.plugin.saveSettings();
            this.display();
          }),
      );
  }

  // ── 데스크톱: 원클릭 인증 ──
  private renderDesktopAuth(containerEl: HTMLElement): void {
    const appKey = getEffectiveAppKey(this.plugin.settings);

    if (!appKey) {
      new Setting(containerEl)
        .setName("Setup required")
        .setDesc(
          "No App Key configured. Set your App Key below first.",
        );
      return;
    }

    new Setting(containerEl)
      .setName("Connect to Dropbox")
      .setDesc(
        "Opens Dropbox in your browser. After authorization, you'll be redirected back automatically.",
      )
      .addButton((btn) =>
        btn
          .setButtonText("Connect")
          .setCta()
          .onClick(() => this.plugin.startAuth()),
      );
  }

  // ── 모바일: 2단계 수동 인증 ──
  private renderMobileAuth(containerEl: HTMLElement): void {
    const appKey = getEffectiveAppKey(this.plugin.settings);

    if (!appKey) {
      new Setting(containerEl)
        .setName("Setup required")
        .setDesc(
          "No App Key configured. Set your App Key below first.",
        );
      return;
    }

    // Step 1: 인증 URL 열기
    new Setting(containerEl)
      .setName("Step 1: Authorize")
      .setDesc("Open Dropbox in your browser to authorize this plugin.")
      .addButton((btn) =>
        btn
          .setButtonText("Open Dropbox")
          .setCta()
          .onClick(async () => {
            this.codeVerifier = generateCodeVerifier();
            const challenge = await generateCodeChallenge(this.codeVerifier);
            const url = buildAuthUrl({ appKey, codeChallenge: challenge });
            window.location.href = url;
          }),
      );

    // Step 2: 인증 코드 입력
    let authCodeInput = "";
    new Setting(containerEl)
      .setName("Step 2: Enter authorization code")
      .setDesc("Paste the code from Dropbox here.")
      .addText((text) =>
        text
          .setPlaceholder("Authorization code")
          .onChange((value) => {
            authCodeInput = value.trim();
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Connect").onClick(async () => {
          if (!authCodeInput || !this.codeVerifier) {
            new Notice("Please complete Step 1 first, then paste the code.");
            return;
          }
          try {
            const tokenInfo = await exchangeCodeForToken(
              appKey,
              authCodeInput,
              this.codeVerifier,
            );
            this.plugin.settings.accessToken = tokenInfo.accessToken;
            this.plugin.settings.refreshToken = tokenInfo.refreshToken;
            this.plugin.settings.tokenExpiry = tokenInfo.expiresAt;
            await this.plugin.saveSettings();
            this.codeVerifier = null;
            new Notice("Connected to Dropbox!");
            this.display();
          } catch (e) {
            new Notice(`Connection failed: ${(e as Error).message}`);
          }
        }),
      );
  }

  private renderSyncOptions(containerEl: HTMLElement): void {
    // ── 기본 옵션 ──
    const strategyDescs: Record<string, string> = {
      keep_both: "Both versions are kept. Remote version is saved as a .conflict file.",
      newest: "The newer version wins, based on modification time.",
      manual: "A merge modal opens so you can compare and choose per section.",
    };

    const conflictDesc = (strategy: string) => {
      const frag = document.createDocumentFragment();
      frag.appendText(strategyDescs[strategy] ?? "");
      frag.appendText(" ");
      const link = frag.createEl("a", { text: "Learn more", href: `${DOCS_BASE}/conflict-resolution.md` });
      link.setAttr("target", "_blank");
      return frag;
    };

    const strategySetting = new Setting(containerEl)
      .setName("Conflict strategy")
      .setDesc(conflictDesc(this.plugin.settings.conflictStrategy))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("keep_both", "Keep both versions")
          .addOption("newest", "Keep newest")
          .addOption("manual", "Ask me")
          .setValue(this.plugin.settings.conflictStrategy)
          .onChange(async (value) => {
            this.plugin.settings.conflictStrategy = value as ConflictStrategy;
            strategySetting.setDesc(conflictDesc(value));
            await this.plugin.saveSettings();
          }),
      );

    const excludeSetting = new Setting(containerEl)
      .setName("Exclude patterns")
      .setDesc("Files matching these patterns won't sync. One per line. Examples: *.pdf, attachments/, .obsidian/workspace*")
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.excludePatterns.join("\n"))
          .onChange(async (value) => {
            this.plugin.settings.excludePatterns = value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
            this.plugin.resetEngine();
            this.updateExcludeCount(excludeSetting);
          });
        text.inputEl.rows = 4;
        text.inputEl.style.width = "100%";
      });
    this.updateExcludeCount(excludeSetting);

    // ── Advanced ──
    new Setting(containerEl).setName("Advanced").setHeading();

    new Setting(containerEl)
      .setName("Sync on file create")
      .setDesc("Trigger sync when new files are created. Edits, deletions, and renames always trigger sync.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.syncOnCreateDeleteRename)
          .onChange(async (value) => {
            this.plugin.settings.syncOnCreateDeleteRename = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Sync interval (seconds)")
      .setDesc("Fallback interval when no file changes are detected.")
      .addSlider((slider) =>
        slider
          .setLimits(30, 600, 30)
          .setValue(this.plugin.settings.syncInterval)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.syncInterval = value;
            await this.plugin.saveSettings();
          }),
      );

    const deleteDesc = (() => {
      const frag = document.createDocumentFragment();
      frag.appendText("Warn before deleting more files than the threshold. ");
      const link = frag.createEl("a", { text: "Learn more", href: `${DOCS_BASE}/sync-safety.md` });
      link.setAttr("target", "_blank");
      return frag;
    })();

    new Setting(containerEl)
      .setName("Delete protection")
      .setDesc(deleteDesc)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.deleteProtection)
          .onChange(async (value) => {
            this.plugin.settings.deleteProtection = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Delete threshold")
      .setDesc("Number of deletions that triggers protection (default 5).")
      .addSlider((slider) =>
        slider
          .setLimits(1, 50, 1)
          .setValue(this.plugin.settings.deleteThreshold)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.deleteThreshold = value;
            await this.plugin.saveSettings();
          }),
      );
  }

  // ── App Key (disconnect 상태에서만 변경 가능) ──
  private renderAppKey(containerEl: HTMLElement): void {
    const isConnected = !!this.plugin.settings.refreshToken;

    if (DEFAULT_APP_KEY) {
      new Setting(containerEl)
        .setName("Use custom App Key")
        .setDesc(
          isConnected
            ? "Disconnect first to change App Key."
            : "Override the built-in App Key with your own.",
        )
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.useCustomAppKey)
            .setDisabled(isConnected)
            .onChange(async (value) => {
              this.plugin.settings.useCustomAppKey = value;
              await this.plugin.saveSettings();
              this.display();
            }),
        );
    }

    if (this.plugin.settings.useCustomAppKey || !DEFAULT_APP_KEY) {
      new Setting(containerEl)
        .setName("App Key")
        .setDesc(
          isConnected
            ? "Disconnect first to change App Key."
            : "Create an app at dropbox.com/developers/apps",
        )
        .addText((text) =>
          text
            .setPlaceholder(DEFAULT_APP_KEY || "Your App Key")
            .setValue(this.plugin.settings.appKey)
            .setDisabled(isConnected)
            .onChange(async (value) => {
              this.plugin.settings.appKey = value.trim();
              await this.plugin.saveSettings();
            }),
        );
    }
  }

  private updateExcludeCount(setting: Setting): void {
    const patterns = this.plugin.settings.excludePatterns;
    if (patterns.length === 0) {
      setting.setDesc("Files matching these patterns won't sync. One per line. Examples: *.pdf, attachments/, .obsidian/workspace*");
      return;
    }
    const allFiles = this.app.vault.getFiles();
    const excluded = allFiles.filter((f: TFile) => isExcluded(f.path, patterns));
    setting.setDesc(`${excluded.length} file(s) excluded out of ${allFiles.length} total.`);
  }
}
