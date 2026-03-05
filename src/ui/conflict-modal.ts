import { App, Modal, Platform, Setting } from "obsidian";
import type { ConflictContext } from "../types";
import { buildMergeSegments, assembleMerged, type ConflictSegment, type MergeSegment } from "./merge-segments";

export type ConflictChoice = "local" | "remote" | "skip" | MergedChoice;

export interface MergedChoice {
  type: "merged";
  content: Uint8Array;
}

export class ConflictModal extends Modal {
  private choice: ConflictChoice | null = null;
  private resolve: ((choice: ConflictChoice | null) => void) | null = null;

  constructor(
    app: App,
    private filePath: string,
    private context?: ConflictContext,
    private progress?: { index: number; total: number },
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, context } = this;
    const mobile = Platform.isMobile;

    this.modalEl.style.maxWidth = mobile ? "95vw" : "90vw";
    this.modalEl.style.width = mobile ? "95vw" : "90vw";

    const title = this.progress && this.progress.total > 1
      ? `Sync Conflict (${this.progress.index}/${this.progress.total})`
      : "Sync Conflict";
    contentEl.createEl("h3", { text: title });
    contentEl.createEl("p", {
      text: `"${this.filePath}" was modified on both this device and Dropbox.`,
    });

    if (context?.localContent !== undefined && context?.remoteContent !== undefined) {
      this.renderMergeView(contentEl, context.localContent, context.remoteContent, mobile);
    } else if (context?.localData && context?.remoteData && this.isImage(this.filePath)) {
      this.renderImageCompare(contentEl, context.localData, context.remoteData, mobile);
      this.renderSimpleButtons(contentEl);
    } else if (context) {
      this.renderMetadata(contentEl, context);
      this.renderSimpleButtons(contentEl);
    } else {
      this.renderSimpleButtons(contentEl);
    }
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

  // ── 텍스트 머지 뷰 (블록 선택) ──

  private renderMergeView(el: HTMLElement, local: string, remote: string, mobile: boolean): void {
    const segments = buildMergeSegments(local, remote);
    const conflictCount = segments.filter((s) => s.type === "conflict").length;

    if (conflictCount === 0) {
      el.createEl("p", {
        text: "No conflicts — changes are compatible and have been auto-merged.",
        cls: "setting-item-description",
      });
    } else {
      el.createEl("p", {
        text: `${conflictCount} section(s) differ between versions. Choose which to keep for each:`,
        cls: "setting-item-description",
      });
    }

    const scrollContainer = el.createDiv();
    scrollContainer.style.maxHeight = mobile ? "50vh" : "60vh";
    scrollContainer.style.overflow = "auto";
    scrollContainer.style.marginBottom = "16px";
    scrollContainer.style.border = "1px solid var(--background-modifier-border)";
    scrollContainer.style.borderRadius = "4px";
    scrollContainer.style.padding = "12px";
    scrollContainer.style.background = "var(--background-secondary)";

    let conflictIdx = 0;
    for (const seg of segments) {
      if (seg.type === "resolved") {
        this.renderResolvedBlock(scrollContainer, seg.lines);
      } else {
        conflictIdx++;
        this.renderConflictBlock(scrollContainer, seg, conflictIdx, conflictCount);
      }
    }

    // 상태 표시 + 저장 버튼
    const statusEl = el.createEl("p", { cls: "setting-item-description" });
    const updateStatus = () => {
      const unresolved = segments.filter(
        (s) => s.type === "conflict" && s.choice === null,
      ).length;
      if (unresolved > 0) {
        statusEl.textContent = `${unresolved} unresolved`;
        statusEl.style.color = "var(--text-error)";
      } else {
        statusEl.textContent = "All resolved";
        statusEl.style.color = "var(--text-success, var(--text-normal))";
      }
    };
    updateStatus();

    // 이벤트: 선택 변경 시 상태 갱신
    scrollContainer.addEventListener("conflict-resolved", () => updateStatus());

    const btnRow = new Setting(el);
    let saveBtnEl: HTMLButtonElement | null = null;

    btnRow
      .addButton((btn) => {
        btn
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            const merged = assembleMerged(segments);
            this.choice = {
              type: "merged",
              content: new TextEncoder().encode(merged),
            };
            this.close();
          });
        saveBtnEl = btn.buttonEl;
      })
      .addButton((btn) =>
        btn.setButtonText("Keep all local").onClick(() => {
          this.choice = "local";
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Keep all remote").onClick(() => {
          this.choice = "remote";
          this.close();
        }),
      )
      .addExtraButton((btn) =>
        btn.setIcon("clock").setTooltip("Later").onClick(() => {
          this.choice = "skip";
          this.close();
        }),
      );

    // Save 버튼에 미해결 경고 표시
    const updateSaveBtn = () => {
      if (!saveBtnEl) return;
      const unresolved = segments.filter(
        (s) => s.type === "conflict" && s.choice === null,
      ).length;
      if (unresolved > 0) {
        saveBtnEl.textContent = `Save (${unresolved} unresolved → local)`;
        saveBtnEl.title = `${unresolved} unresolved conflict(s) will default to local version`;
      } else {
        saveBtnEl.textContent = "Save";
        saveBtnEl.title = "";
      }
    };
    updateSaveBtn();
    scrollContainer.addEventListener("conflict-resolved", () => updateSaveBtn());
  }

  private renderResolvedBlock(parent: HTMLElement, lines: string[]): void {
    if (lines.length === 0) return;
    const block = parent.createDiv();
    block.style.fontFamily = "monospace";
    block.style.fontSize = "11px";
    block.style.whiteSpace = "pre-wrap";
    block.style.wordBreak = "break-word";
    block.style.color = "var(--text-muted)";
    block.style.padding = "2px 0";

    // 긴 동일 블록은 접기
    if (lines.length > 6) {
      const first = lines.slice(0, 2);
      const last = lines.slice(-2);
      block.createDiv({ text: first.join("\n") });
      const collapsed = block.createDiv({
        text: `  ... ${lines.length - 4} unchanged lines ...`,
      });
      collapsed.style.color = "var(--text-faint)";
      collapsed.style.fontStyle = "italic";
      collapsed.style.cursor = "pointer";
      const rest = block.createDiv({ text: last.join("\n") });

      let expanded = false;
      collapsed.addEventListener("click", () => {
        if (expanded) {
          collapsed.textContent = `  ... ${lines.length - 4} unchanged lines ...`;
          rest.textContent = last.join("\n");
        } else {
          collapsed.textContent = "";
          rest.textContent = lines.slice(2).join("\n");
        }
        expanded = !expanded;
      });
    } else {
      block.textContent = lines.join("\n");
    }
  }

  private renderConflictBlock(
    parent: HTMLElement,
    seg: ConflictSegment,
    idx: number,
    total: number,
  ): void {
    const card = parent.createDiv();
    card.style.border = "1px solid var(--text-error)";
    card.style.borderRadius = "6px";
    card.style.margin = "8px 0";
    card.style.overflow = "hidden";

    // 헤더
    const header = card.createDiv();
    header.style.background = "rgba(255, 80, 80, 0.1)";
    header.style.padding = "4px 8px";
    header.style.fontSize = "11px";
    header.style.fontWeight = "600";
    header.textContent = `Conflict ${idx}/${total}`;

    const body = card.createDiv();
    body.style.padding = "8px";

    const codeStyle = (div: HTMLDivElement, bg: string) => {
      div.style.fontFamily = "monospace";
      div.style.fontSize = "11px";
      div.style.whiteSpace = "pre-wrap";
      div.style.wordBreak = "break-word";
      div.style.padding = "6px 8px";
      div.style.borderRadius = "4px";
      div.style.background = bg;
      div.style.cursor = "pointer";
      div.style.border = "2px solid transparent";
      div.style.marginBottom = "4px";
      div.style.transition = "border-color 0.15s";
    };

    const hasLocal = seg.local.length > 0;
    const hasRemote = seg.remote.length > 0;
    const hasBoth = hasLocal && hasRemote;

    // Local 옵션
    const localRow = body.createDiv();
    const localLabel = hasRemote ? "Local" : "Local only (keep?)";
    localRow.createEl("span", {
      text: localLabel,
      cls: "setting-item-description",
    }).style.fontWeight = "600";
    const localCode = localRow.createDiv({
      text: hasLocal ? seg.local.join("\n") : "(empty — remove these lines)",
    });
    codeStyle(localCode, "rgba(255, 80, 80, 0.08)");
    if (!hasLocal) localCode.style.fontStyle = "italic";

    // Remote 옵션
    const remoteRow = body.createDiv();
    const remoteLabel = hasLocal ? "Remote" : "Remote only (include?)";
    remoteRow.createEl("span", {
      text: remoteLabel,
      cls: "setting-item-description",
    }).style.fontWeight = "600";
    const remoteCode = remoteRow.createDiv({
      text: hasRemote ? seg.remote.join("\n") : "(empty — remove these lines)",
    });
    codeStyle(remoteCode, "rgba(80, 200, 80, 0.08)");
    if (!hasRemote) remoteCode.style.fontStyle = "italic";

    // Both 옵션 (양쪽 다 있을 때만)
    let bothCode: HTMLDivElement | null = null;
    if (hasBoth) {
      const bothRow = body.createDiv();
      bothRow.createEl("span", {
        text: "Both (local + remote)",
        cls: "setting-item-description",
      }).style.fontWeight = "600";
      bothCode = bothRow.createDiv({
        text: [...seg.local, ...seg.remote].join("\n"),
      });
      codeStyle(bothCode, "rgba(100, 150, 255, 0.08)");
    }

    const select = (choice: "local" | "remote" | "both") => {
      seg.choice = choice;
      localCode.style.borderColor = choice === "local" ? "var(--text-error)" : "transparent";
      remoteCode.style.borderColor = choice === "remote" ? "var(--text-success, var(--interactive-accent))" : "transparent";
      if (bothCode) bothCode.style.borderColor = choice === "both" ? "var(--interactive-accent)" : "transparent";
      header.style.background = "rgba(80, 200, 80, 0.1)";
      header.textContent = `Conflict ${idx}/${total} — ${choice}`;
      card.style.borderColor = "var(--text-success, var(--interactive-accent))";
      parent.dispatchEvent(new Event("conflict-resolved"));
    };

    localCode.addEventListener("click", () => select("local"));
    remoteCode.addEventListener("click", () => select("remote"));
    if (bothCode) bothCode.addEventListener("click", () => select("both"));
  }

  // ── 이미지 비교 ──

  private renderImageCompare(el: HTMLElement, localData: Uint8Array, remoteData: Uint8Array, mobile: boolean): void {
    const mime = this.guessMime(this.filePath);

    const container = el.createDiv();
    container.style.display = "grid";
    container.style.gridTemplateColumns = mobile ? "1fr" : "1fr 1fr";
    container.style.gap = "8px";
    container.style.marginBottom = "16px";

    const imgStyle = (img: HTMLImageElement) => {
      img.style.maxWidth = "100%";
      img.style.maxHeight = mobile ? "200px" : "300px";
      img.style.objectFit = "contain";
      img.style.border = "1px solid var(--background-modifier-border)";
      img.style.borderRadius = "4px";
      img.style.background = "var(--background-secondary)";
    };

    const localCol = container.createDiv();
    localCol.createEl("h4", { text: `Local (${this.formatSize(localData.length)})` });
    const localImg = localCol.createEl("img");
    localImg.src = `data:${mime};base64,${uint8ToBase64(localData)}`;
    imgStyle(localImg);

    const remoteCol = container.createDiv();
    remoteCol.createEl("h4", { text: `Remote (${this.formatSize(remoteData.length)})` });
    const remoteImg = remoteCol.createEl("img");
    remoteImg.src = `data:${mime};base64,${uint8ToBase64(remoteData)}`;
    imgStyle(remoteImg);
  }

  // ── 메타데이터 / 간단 버튼 ──

  private renderMetadata(el: HTMLElement, ctx: ConflictContext): void {
    const parts: string[] = [];
    if (ctx.localSize !== undefined) parts.push(`Local: ${this.formatSize(ctx.localSize)}`);
    if (ctx.remoteSize !== undefined) parts.push(`Remote: ${this.formatSize(ctx.remoteSize)}`);
    if (ctx.remoteMtime) parts.push(`Remote modified: ${new Date(ctx.remoteMtime).toLocaleString()}`);
    if (parts.length > 0) {
      el.createEl("p", { text: parts.join(" · "), cls: "setting-item-description" });
    }
  }

  private renderSimpleButtons(el: HTMLElement): void {
    new Setting(el)
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
      )
      .addExtraButton((btn) =>
        btn.setIcon("clock").setTooltip("Later").onClick(() => {
          this.choice = "skip";
          this.close();
        }),
      );
  }

  // ── 유틸 ──

  private isImage(path: string): boolean {
    return /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(path);
  }

  private guessMime(path: string): string {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const map: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
      gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
      bmp: "image/bmp", ico: "image/x-icon",
    };
    return map[ext] ?? "application/octet-stream";
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// re-export for external consumers
export { buildMergeSegments, computeLineDiff } from "./merge-segments";

function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
