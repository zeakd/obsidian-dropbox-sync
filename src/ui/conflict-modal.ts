import { App, Modal, Platform, Setting } from "obsidian";
import type { ConflictContext } from "../types";

export type ConflictChoice = "local" | "remote" | MergedChoice;

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
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, context } = this;
    const mobile = Platform.isMobile;

    this.modalEl.style.maxWidth = mobile ? "95vw" : "90vw";
    this.modalEl.style.width = mobile ? "95vw" : "90vw";

    contentEl.createEl("h3", { text: "Sync Conflict" });
    contentEl.createEl("p", {
      text: `"${this.filePath}" was modified on both this device and Dropbox.`,
    });

    if (context?.localContent !== undefined && context?.remoteContent !== undefined) {
      this.renderDiffCompare(contentEl, context.localContent, context.remoteContent, mobile);
    } else if (context?.localData && context?.remoteData && this.isImage(this.filePath)) {
      this.renderImageCompare(contentEl, context.localData, context.remoteData, mobile);
    } else if (context) {
      this.renderMetadata(contentEl, context);
    }

    contentEl.createEl("p", { text: "Which version do you want to keep?" });

    const hasText = context?.localContent !== undefined && context?.remoteContent !== undefined;

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
      )
      .addExtraButton((btn) => {
        btn.setIcon("pencil").setTooltip("Merge").onClick(() => {
          if (hasText) {
            this.showMergeEditor(contentEl, context!.localContent!, context!.remoteContent!);
          }
        });
        if (!hasText) {
          btn.extraSettingsEl.style.display = "none";
        }
      });
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

  private showMergeEditor(parentEl: HTMLElement, local: string, remote: string): void {
    parentEl.empty();

    parentEl.createEl("h3", { text: "Merge Editor" });
    parentEl.createEl("p", {
      text: `"${this.filePath}" — resolve conflict markers (<<<< / ==== / >>>>)`,
      cls: "setting-item-description",
    });

    const merged = autoMerge(local, remote);

    const ta = parentEl.createEl("textarea");
    ta.value = merged;
    ta.style.width = "100%";
    ta.style.height = Platform.isMobile ? "50vh" : "60vh";
    ta.style.fontFamily = "monospace";
    ta.style.fontSize = "12px";
    ta.style.resize = "vertical";
    ta.style.border = "1px solid var(--background-modifier-border)";
    ta.style.borderRadius = "4px";
    ta.style.padding = "8px";
    ta.style.background = "var(--background-secondary)";
    ta.style.color = "var(--text-normal)";
    ta.style.tabSize = "2";

    const hasConflicts = merged.includes("<<<<");
    if (hasConflicts) {
      const hint = parentEl.createEl("p", {
        text: `${countMarkers(merged)} conflict(s) remaining`,
        cls: "setting-item-description",
      });
      hint.style.color = "var(--text-error)";

      ta.addEventListener("input", () => {
        const n = countMarkers(ta.value);
        if (n > 0) {
          hint.textContent = `${n} conflict(s) remaining`;
          hint.style.color = "var(--text-error)";
        } else {
          hint.textContent = "All conflicts resolved";
          hint.style.color = "var(--text-success, var(--text-normal))";
        }
      });
    }

    new Setting(parentEl)
      .addButton((btn) =>
        btn.setButtonText("Save merged").setCta().onClick(() => {
          this.choice = {
            type: "merged",
            content: new TextEncoder().encode(ta.value),
          };
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("Cancel").onClick(() => {
          this.close();
        }),
      );
  }

  private renderDiffCompare(el: HTMLElement, local: string, remote: string, mobile: boolean): void {
    const diff = computeLineDiff(local, remote);
    const paneHeight = mobile ? "200px" : "400px";

    const container = el.createDiv();
    container.style.display = "grid";
    container.style.gridTemplateColumns = mobile ? "1fr" : "1fr 1fr";
    container.style.gap = "8px";
    container.style.marginBottom = "16px";

    const colStyle = (div: HTMLDivElement) => {
      div.style.maxHeight = paneHeight;
      div.style.overflow = "auto";
      div.style.border = "1px solid var(--background-modifier-border)";
      div.style.borderRadius = "4px";
      div.style.padding = "8px";
      div.style.background = "var(--background-secondary)";
      div.style.fontFamily = "monospace";
      div.style.fontSize = "11px";
      div.style.whiteSpace = "pre-wrap";
      div.style.wordBreak = "break-word";
    };

    const localCol = container.createDiv();
    localCol.createEl("h4", { text: "Local (this device)" });
    const localPane = localCol.createDiv();
    colStyle(localPane);

    const remoteCol = container.createDiv();
    remoteCol.createEl("h4", { text: "Remote (Dropbox)" });
    const remotePane = remoteCol.createDiv();
    colStyle(remotePane);

    for (const entry of diff) {
      if (entry.type === "equal") {
        localPane.createDiv({ text: entry.line });
        remotePane.createDiv({ text: entry.line });
      } else if (entry.type === "removed") {
        const line = localPane.createDiv({ text: entry.line });
        line.style.background = "rgba(255, 80, 80, 0.15)";
        line.style.color = "var(--text-error)";
      } else if (entry.type === "added") {
        const line = remotePane.createDiv({ text: entry.line });
        line.style.background = "rgba(80, 200, 80, 0.15)";
        line.style.color = "var(--text-success, var(--text-normal))";
      }
    }

    // 동기 스크롤 (데스크톱만)
    if (!mobile) {
      let syncing = false;
      const syncScroll = (source: HTMLElement, target: HTMLElement) => {
        source.addEventListener("scroll", () => {
          if (syncing) return;
          syncing = true;
          target.scrollTop = source.scrollTop;
          syncing = false;
        });
      };
      syncScroll(localPane, remotePane);
      syncScroll(remotePane, localPane);
    }
  }

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

  private renderMetadata(el: HTMLElement, ctx: ConflictContext): void {
    const parts: string[] = [];
    if (ctx.localSize !== undefined) parts.push(`Local: ${this.formatSize(ctx.localSize)}`);
    if (ctx.remoteSize !== undefined) parts.push(`Remote: ${this.formatSize(ctx.remoteSize)}`);
    if (ctx.remoteMtime) parts.push(`Remote modified: ${new Date(ctx.remoteMtime).toLocaleString()}`);
    if (parts.length > 0) {
      el.createEl("p", { text: parts.join(" · "), cls: "setting-item-description" });
    }
  }

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

// ── Line diff ──

interface DiffEntry {
  type: "equal" | "added" | "removed";
  line: string;
}

/** 줄 단위 diff (LCS 기반) */
export function computeLineDiff(local: string, remote: string): DiffEntry[] {
  const maxLines = 500;
  const a = local.split("\n").slice(0, maxLines);
  const b = remote.split("\n").slice(0, maxLines);
  return diffLines(a, b);
}

function diffLines(a: string[], b: string[]): DiffEntry[] {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffEntry[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: "equal", line: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", line: b[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", line: a[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

// ── Auto-merge ──

/** diff 기반 auto-merge. 충돌 구간은 마커로 표시. */
export function autoMerge(local: string, remote: string): string {
  const diff = computeLineDiff(local, remote);
  const lines: string[] = [];

  let i = 0;
  while (i < diff.length) {
    const entry = diff[i];

    if (entry.type === "equal") {
      lines.push(entry.line);
      i++;
      continue;
    }

    // removed/added 블록 수집
    const removed: string[] = [];
    const added: string[] = [];
    while (i < diff.length && diff[i].type === "removed") {
      removed.push(diff[i].line);
      i++;
    }
    while (i < diff.length && diff[i].type === "added") {
      added.push(diff[i].line);
      i++;
    }

    if (removed.length > 0 && added.length > 0) {
      // 양쪽 다 변경 → conflict 마커
      lines.push("<<<< local");
      lines.push(...removed);
      lines.push("====");
      lines.push(...added);
      lines.push(">>>> remote");
    } else if (removed.length > 0) {
      // local에만 있는 줄 (remote에서 삭제됨) → 유지하되 사용자에게 맡김
      lines.push(...removed);
    } else {
      // remote에만 있는 줄 (추가됨) → 자동 반영
      lines.push(...added);
    }
  }

  return lines.join("\n");
}

function countMarkers(text: string): number {
  return (text.match(/^<<<<\s/gm) || []).length;
}

function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
