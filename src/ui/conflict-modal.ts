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

    this.modalEl.style.maxWidth = "90vw";
    this.modalEl.style.width = "90vw";

    contentEl.createEl("h3", { text: "Sync Conflict" });
    contentEl.createEl("p", {
      text: `"${this.filePath}" was modified on both this device and Dropbox.`,
    });

    if (context?.localContent !== undefined && context?.remoteContent !== undefined) {
      this.renderDiffCompare(contentEl, context.localContent, context.remoteContent);
    } else if (context?.localData && context?.remoteData && this.isImage(this.filePath)) {
      this.renderImageCompare(contentEl, context.localData, context.remoteData);
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

  private renderDiffCompare(el: HTMLElement, local: string, remote: string): void {
    const diff = computeLineDiff(local, remote);

    const container = el.createDiv();
    container.style.display = "grid";
    container.style.gridTemplateColumns = "1fr 1fr";
    container.style.gap = "8px";
    container.style.marginBottom = "16px";

    const colStyle = (div: HTMLDivElement) => {
      div.style.maxHeight = "400px";
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

    // 동기 스크롤
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

  private renderImageCompare(el: HTMLElement, localData: Uint8Array, remoteData: Uint8Array): void {
    const mime = this.guessMime(this.filePath);

    const container = el.createDiv();
    container.style.display = "grid";
    container.style.gridTemplateColumns = "1fr 1fr";
    container.style.gap = "8px";
    container.style.marginBottom = "16px";

    const imgStyle = (img: HTMLImageElement) => {
      img.style.maxWidth = "100%";
      img.style.maxHeight = "300px";
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

/** 간단한 줄 단위 diff (Myers 알고리즘 대신 LCS 기반) */
export function computeLineDiff(local: string, remote: string): DiffEntry[] {
  const a = local.split("\n");
  const b = remote.split("\n");

  // LCS 테이블 구축
  const m = a.length;
  const n = b.length;

  // 메모리 효율을 위해 2행만 사용
  let prev = new Uint16Array(n + 1);
  let curr = new Uint16Array(n + 1);

  for (let i = 1; i <= m; i++) {
    [prev, curr] = [curr, prev];
    curr.fill(0);
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
  }

  // 역추적을 위해 전체 테이블 필요 — 큰 파일은 잘라서 처리
  const maxLines = 500;
  const ta = a.length > maxLines ? a.slice(0, maxLines) : a;
  const tb = b.length > maxLines ? b.slice(0, maxLines) : b;

  return diffLines(ta, tb);
}

function diffLines(a: string[], b: string[]): DiffEntry[] {
  const m = a.length;
  const n = b.length;

  // 전체 LCS 테이블
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

  // 역추적
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

function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
