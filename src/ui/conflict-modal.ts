import { App, Modal, Platform, Setting } from "obsidian";
import type { ConflictContext } from "../types";

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

    new Setting(el)
      .addButton((btn) =>
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
          }),
      )
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

    // Local 옵션
    const localRow = body.createDiv();
    localRow.createEl("span", {
      text: "Local",
      cls: "setting-item-description",
    }).style.fontWeight = "600";
    const localCode = localRow.createDiv({ text: seg.local.join("\n") });
    codeStyle(localCode, "rgba(255, 80, 80, 0.08)");

    // Remote 옵션
    const remoteRow = body.createDiv();
    remoteRow.createEl("span", {
      text: "Remote",
      cls: "setting-item-description",
    }).style.fontWeight = "600";
    const remoteCode = remoteRow.createDiv({ text: seg.remote.join("\n") });
    codeStyle(remoteCode, "rgba(80, 200, 80, 0.08)");

    // Both 옵션
    const bothRow = body.createDiv();
    bothRow.createEl("span", {
      text: "Both (local + remote)",
      cls: "setting-item-description",
    }).style.fontWeight = "600";
    const bothCode = bothRow.createDiv({
      text: [...seg.local, ...seg.remote].join("\n"),
    });
    codeStyle(bothCode, "rgba(100, 150, 255, 0.08)");

    const select = (choice: "local" | "remote" | "both") => {
      seg.choice = choice;
      localCode.style.borderColor = choice === "local" ? "var(--text-error)" : "transparent";
      remoteCode.style.borderColor = choice === "remote" ? "var(--text-success, var(--interactive-accent))" : "transparent";
      bothCode.style.borderColor = choice === "both" ? "var(--interactive-accent)" : "transparent";
      header.style.background = "rgba(80, 200, 80, 0.1)";
      header.textContent = `Conflict ${idx}/${total} — ${choice}`;
      card.style.borderColor = "var(--text-success, var(--interactive-accent))";
      parent.dispatchEvent(new Event("conflict-resolved"));
    };

    localCode.addEventListener("click", () => select("local"));
    remoteCode.addEventListener("click", () => select("remote"));
    bothCode.addEventListener("click", () => select("both"));
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

// ── Merge segments ──

interface ResolvedSegment {
  type: "resolved";
  lines: string[];
}

interface ConflictSegment {
  type: "conflict";
  local: string[];
  remote: string[];
  choice: "local" | "remote" | "both" | null;
}

type MergeSegment = ResolvedSegment | ConflictSegment;

interface DiffEntry {
  type: "equal" | "added" | "removed";
  line: string;
}

/** diff에서 머지 세그먼트 구축 */
export function buildMergeSegments(local: string, remote: string): MergeSegment[] {
  const diff = computeLineDiff(local, remote);
  const segments: MergeSegment[] = [];
  let resolved: string[] = [];

  const flushResolved = () => {
    if (resolved.length > 0) {
      segments.push({ type: "resolved", lines: resolved });
      resolved = [];
    }
  };

  let i = 0;
  while (i < diff.length) {
    if (diff[i].type === "equal") {
      resolved.push(diff[i].line);
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
      flushResolved();
      segments.push({ type: "conflict", local: removed, remote: added, choice: null });
    } else if (removed.length > 0) {
      // local에만 있음 → auto-resolve (유지)
      resolved.push(...removed);
    } else {
      // remote에만 있음 → auto-resolve (반영)
      resolved.push(...added);
    }
  }

  flushResolved();
  return segments;
}

/** 세그먼트를 최종 텍스트로 조립 */
function assembleMerged(segments: MergeSegment[]): string {
  const lines: string[] = [];
  for (const seg of segments) {
    if (seg.type === "resolved") {
      lines.push(...seg.lines);
    } else {
      const choice = seg.choice ?? "local"; // 미선택 시 local 기본
      if (choice === "local") lines.push(...seg.local);
      else if (choice === "remote") lines.push(...seg.remote);
      else lines.push(...seg.local, ...seg.remote); // both
    }
  }
  return lines.join("\n");
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

function uint8ToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}
