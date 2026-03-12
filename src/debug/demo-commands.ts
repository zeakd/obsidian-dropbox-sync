import { Notice } from "obsidian";
import type DropboxSyncPlugin from "../main";
import { ConflictModal, type ConflictChoice } from "../ui/conflict-modal";

/**
 * 개발/디버그용 데모 커맨드 등록.
 * 프로덕션 빌드에서는 호출하지 않아도 된다.
 */
export function registerDemoCommands(plugin: DropboxSyncPlugin): void {
  plugin.addCommand({
    id: "demo-conflict",
    name: "Demo conflict modal",
    callback: () => showDemoConflict(plugin),
  });

  plugin.addCommand({
    id: "demo-conflict-current",
    name: "Demo conflict (current file)",
    callback: () => showDemoConflictCurrentFile(plugin),
  });

  plugin.addCommand({
    id: "demo-conflict-multi",
    name: "Demo conflict (multi-file)",
    callback: () => showDemoConflictMulti(plugin),
  });

  plugin.addCommand({
    id: "demo-conflict-image",
    name: "Demo conflict (image)",
    callback: () => showDemoConflictImage(plugin),
  });

  plugin.addCommand({
    id: "inject-conflict",
    name: "Debug: inject conflict on current file",
    callback: () => injectConflict(plugin),
  });
}

// ── 데모 시나리오 ──

async function showDemoConflict(plugin: DropboxSyncPlugin): Promise<void> {
  const local = [
    "# 프로젝트 회의록", "", "## 참석자", "- Alice", "- Bob", "- Charlie",
    "", "## 논의사항", "", "### 1. 아키텍처 결정",
    "SQLite를 메인 DB로 사용하기로 결정.", "WAL 모드로 동시 읽기 성능 확보.",
    "", "### 2. 일정", "- 1주차: 설계", "- 2주차: 구현", "- 3주차: 테스트",
    "", "### 3. 다음 회의", "3월 10일 월요일 오후 2시",
  ].join("\n");

  const remote = [
    "# 프로젝트 회의록", "", "## 참석자", "- Alice", "- Bob", "- Diana (Charlie 대신 참석)",
    "", "## 논의사항", "", "### 1. 아키텍처 결정",
    "PostgreSQL을 메인 DB로 사용하기로 결정.", "확장성을 고려한 선택.",
    "", "### 2. 일정", "- 1주차: 설계 + 프로토타입", "- 2주차: 구현", "- 3주차: QA + 배포",
    "", "### 3. 다음 회의", "3월 12일 수요일 오후 3시",
  ].join("\n");

  const modal = new ConflictModal(plugin.app, "meeting-notes.md", {
    localContent: local,
    remoteContent: remote,
    localSize: new TextEncoder().encode(local).length,
    remoteSize: new TextEncoder().encode(remote).length,
    remoteMtime: Date.now() - 3600000,
  });
  reportChoice("meeting-notes.md", await modal.waitForChoice());
}

async function showDemoConflictCurrentFile(plugin: DropboxSyncPlugin): Promise<void> {
  const active = plugin.app.workspace.getActiveFile();
  if (!active) {
    new Notice("No active file. Open a file first.");
    return;
  }

  const local = await plugin.app.vault.read(active);
  const remote = simulateRemoteEdit(local);

  const modal = new ConflictModal(plugin.app, active.path, {
    localContent: local,
    remoteContent: remote,
    localSize: new TextEncoder().encode(local).length,
    remoteSize: new TextEncoder().encode(remote).length,
    remoteMtime: Date.now() - 600000,
  });
  reportChoice(active.path, await modal.waitForChoice());
}

async function showDemoConflictMulti(plugin: DropboxSyncPlugin): Promise<void> {
  const files = [
    { path: "meeting-notes.md", localLines: ["# Meeting", "", "- Alice", "- Bob"], remoteLines: ["# Meeting", "", "- Alice", "- Charlie"] },
    { path: "project-plan.md", localLines: ["# Plan", "", "Phase 1: Design", "Phase 2: Build"], remoteLines: ["# Plan", "", "Phase 1: Research", "Phase 2: Build", "Phase 3: Deploy"] },
    { path: "daily-log.md", localLines: ["# Today", "", "Did code review.", "Fixed 3 bugs."], remoteLines: ["# Today", "", "Did code review.", "Fixed 5 bugs.", "Deployed to staging."] },
  ];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const local = f.localLines.join("\n");
    const remote = f.remoteLines.join("\n");
    const modal = new ConflictModal(plugin.app, f.path, {
      localContent: local,
      remoteContent: remote,
      localSize: new TextEncoder().encode(local).length,
      remoteSize: new TextEncoder().encode(remote).length,
      remoteMtime: Date.now() - 3600000,
    }, { index: i + 1, total: files.length });
    reportChoice(f.path, await modal.waitForChoice());
  }
  new Notice("Demo: all conflicts resolved.");
}

function showDemoConflictImage(plugin: DropboxSyncPlugin): void {
  const localSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#4a90d9"/><text x="100" y="105" text-anchor="middle" fill="white" font-size="16">Local v1</text></svg>`;
  const remoteSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#d94a4a"/><text x="100" y="105" text-anchor="middle" fill="white" font-size="16">Remote v2</text></svg>`;
  const localData = new TextEncoder().encode(localSvg);
  const remoteData = new TextEncoder().encode(remoteSvg);

  const modal = new ConflictModal(plugin.app, "diagram.svg", {
    localData,
    remoteData,
    localSize: localData.length,
    remoteSize: remoteData.length,
    remoteMtime: Date.now() - 1800000,
  });
  void modal.waitForChoice().then((choice) => reportChoice("diagram.svg", choice));
}

async function injectConflict(plugin: DropboxSyncPlugin): Promise<void> {
  const active = plugin.app.workspace.getActiveFile();
  if (!active) {
    new Notice("No active file. Open a file first.");
    return;
  }

  const remote = plugin.getRemoteAdapter();
  if (!remote) {
    plugin.getOrCreateEngine(); // force adapter creation
  }
  const adapter = plugin.getRemoteAdapter();
  if (!adapter) {
    new Notice("Not connected to Dropbox.");
    return;
  }

  try {
    const localContent = await plugin.app.vault.read(active);
    const remoteContent = simulateRemoteEdit(localContent);
    const remoteData = new TextEncoder().encode(remoteContent);
    await adapter.upload(active.path.toLowerCase(), remoteData);

    const now = new Date().toLocaleTimeString();
    const localEdited = localContent + `\n<!-- local edit at ${now} -->`;
    await plugin.app.vault.modify(active, localEdited);

    new Notice(
      `Conflict injected on "${active.path}".\n` +
      `Remote: modified version uploaded.\n` +
      `Local: edit marker added.\n\n` +
      `Run "Sync now" to trigger the conflict.`,
      8000,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    new Notice(`Inject failed: ${msg}`, 5000);
  }
}

// ── 유틸 ──

function reportChoice(path: string, choice: ConflictChoice | null): void {
  if (!choice) {
    new Notice(`Demo [${path}]: skipped`);
  } else if (typeof choice === "string") {
    new Notice(`Demo [${path}]: "${choice}"`);
  } else {
    const text = new TextDecoder().decode(choice.content);
    new Notice(`Demo [${path}]: merged (${text.split("\n").length} lines)`);
  }
}

/**
 * 로컬 텍스트를 기반으로 "리모트에서 수정된" 시뮬레이션 버전 생성.
 * 문서의 1/4, 1/2, 3/4 지점에서 각 1줄만 변경.
 */
function simulateRemoteEdit(text: string): string {
  const lines = text.split("\n");
  if (lines.length < 3) return text + "\n(remote edit)";

  const result = [...lines];
  for (const ratio of [0.25, 0.5, 0.75]) {
    const idx = Math.floor(lines.length * ratio);
    for (let j = idx; j < lines.length; j++) {
      if (result[j].trim().length > 0) {
        result[j] = "[remote] " + result[j];
        break;
      }
    }
  }
  return result.join("\n");
}
