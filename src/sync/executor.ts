import { dropboxContentHashBrowser } from "../hash.browser";
import type { FileSystem, RemoteStorage, SyncStateStore } from "../adapters/interfaces";
import { PathValidationError, RevConflictError, type ConflictContext, type DownloadResult, type SyncPlan, type SyncPlanItem, type SyncResult } from "../types";
import { validateDropboxPath } from "./path-validator";
import { runWithConcurrency } from "./concurrency";

export type ConflictStrategy = "keep_both" | "newest" | "manual";

/** manual 전략에서 사용자 선택을 반환하는 콜백 */
export type ConflictResolver = (
  localPath: string,
  context?: ConflictContext,
) => Promise<"local" | "remote" | { type: "merged"; content: Uint8Array } | null>;

export interface ExecutorDeps {
  fs: FileSystem;
  remote: RemoteStorage;
  store: SyncStateStore;
}

export interface ExecutorConfig {
  conflictStrategy?: ConflictStrategy;
  conflictResolver?: ConflictResolver;
  /** 파일이 현재 편집 중인지 확인. true면 download/conflict를 건너뛴다 */
  isFileActive?: (path: string) => boolean;
  /** 중단 시그널. aborted 시 나머지 항목 건너뛴다 */
  signal?: AbortSignal;
  /** 병렬 실행 동시성. 기본값 1 (순차) */
  concurrency?: number;
  /** 항목 실행 완료 시마다 호출. (완료 수, 전체 수) */
  onProgress?: (completed: number, total: number) => void;
}

/** 내부 함수에서 사용하는 통합 컨텍스트 */
type ExecutorContext = ExecutorDeps & ExecutorConfig;

/**
 * SyncPlan의 각 항목을 실행한다.
 *
 * - 항목별로 독립 실행 (하나 실패해도 나머지 계속)
 * - upload 시 rev 충돌 → conflict로 재분류
 * - download 후 hash 검증
 */
export async function executePlan(
  plan: SyncPlan,
  deps: ExecutorDeps,
  config: ExecutorConfig = {},
): Promise<SyncResult> {
  const ctx: ExecutorContext = { ...deps, ...config };
  const deferred: SyncPlanItem[] = [];

  // 활성 파일 보호: 먼저 deferred를 분리
  const executable: SyncPlanItem[] = [];
  for (const item of plan.items) {
    const t = item.action.type;
    if (
      (t === "download" || t === "conflict" || t === "deleteLocal") &&
      ctx.isFileActive?.(item.localPath)
    ) {
      deferred.push(item);
    } else {
      executable.push(item);
    }
  }

  const concurrency = ctx.concurrency ?? 1;
  let completed = 0;
  const total = executable.length;

  const tasks = executable.map((item) => () => executeItem(item, ctx));
  const settled = await runWithConcurrency(tasks, concurrency, {
    signal: ctx.signal,
    onTaskComplete: () => {
      completed++;
      ctx.onProgress?.(completed, total);
    },
  });

  const succeeded: SyncPlanItem[] = [];
  const failed: { item: SyncPlanItem; error: Error }[] = [];

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (!r) continue; // signal로 건너뛴 항목
    if (r.status === "fulfilled") {
      succeeded.push(executable[i]);
    } else {
      failed.push({ item: executable[i], error: r.reason as Error });
    }
  }

  return { succeeded, failed, deferred };
}

/** 다운로드 후 hash 검증 (R3) */
async function downloadAndVerify(
  remote: RemoteStorage,
  localPath: string,
): Promise<DownloadResult & { verifiedHash: string }> {
  const result = await remote.download(localPath);
  const hash = await dropboxContentHashBrowser(result.data);
  if (result.metadata.hash && hash !== result.metadata.hash) {
    throw new Error(`Hash mismatch after download: expected ${result.metadata.hash}, got ${hash}`);
  }
  return { ...result, verifiedHash: hash };
}

/** sync state 갱신 헬퍼 (R2) */
async function updateSyncState(
  store: SyncStateStore,
  pathLower: string,
  localPath: string,
  localHash: string,
  remoteHash: string,
  rev: string,
): Promise<void> {
  await store.setEntry({
    pathLower,
    localPath,
    baseLocalHash: localHash,
    baseRemoteHash: remoteHash,
    rev,
    lastSynced: Date.now(),
  });
}

async function executeItem(
  item: SyncPlanItem,
  deps: ExecutorContext,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { action, pathLower, localPath } = item;

  switch (action.type) {
    case "upload": {
      const pathError = validateDropboxPath(localPath);
      if (pathError) {
        throw new PathValidationError(localPath, pathError);
      }

      const data = await fs.read(localPath);
      const localHash = await dropboxContentHashBrowser(data);

      // base에서 rev 가져오기
      const base = await store.getEntry(pathLower);
      const rev = base?.rev ?? undefined;

      let entry;
      try {
        entry = await remote.upload(localPath, data, rev);
      } catch (err) {
        if (err instanceof RevConflictError) {
          // rev 충돌 → conflict 처리: 원격 파일을 conflict 파일로 다운로드
          await handleConflictOnUpload(item, deps);
          return;
        }
        throw err;
      }

      await updateSyncState(store, pathLower, localPath, localHash, entry.hash ?? localHash, entry.rev);
      break;
    }

    case "download": {
      const result = await downloadAndVerify(remote, localPath);
      await fs.write(localPath, result.data, result.metadata.serverModified);
      await updateSyncState(store, pathLower, localPath, result.verifiedHash, result.verifiedHash, result.metadata.rev);
      break;
    }

    case "deleteLocal": {
      await fs.delete(localPath);
      await store.deleteEntry(pathLower);
      break;
    }

    case "deleteRemote": {
      await remote.delete(localPath);
      await store.deleteEntry(pathLower);
      break;
    }

    case "conflict": {
      const strategy = deps.conflictStrategy ?? "keep_both";

      switch (strategy) {
        case "keep_both":
          await handleConflictKeepBoth(item, deps);
          break;
        case "newest":
          await handleConflictNewest(item, deps);
          break;
        case "manual":
          await handleConflictManual(item, deps);
          break;
      }
      break;
    }

    case "noop":
      break;
  }
}

/** keep_both: 원격을 .conflict 파일로 보존, 로컬을 원격에 업로드 */
async function handleConflictKeepBoth(
  item: SyncPlanItem,
  deps: ExecutorContext,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  const result = await downloadAndVerify(remote, localPath);
  const conflictPath = makeConflictPath(localPath);
  await fs.write(conflictPath, result.data, result.metadata.serverModified);

  const localData = await fs.read(localPath);
  const localHash = await dropboxContentHashBrowser(localData);
  const entry = await remote.upload(localPath, localData);

  await updateSyncState(store, pathLower, localPath, localHash, entry.hash ?? localHash, entry.rev);
}

/** newest: mtime 비교하여 더 최신 버전으로 통일. 동률 시 keep_both fallback */
async function handleConflictNewest(
  item: SyncPlanItem,
  deps: ExecutorContext,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  const localInfo = (await fs.list()).find(
    (f) => f.pathLower === pathLower,
  );
  const result = await downloadAndVerify(remote, localPath);

  const localMtime = localInfo?.mtime ?? 0;
  const remoteMtime = result.metadata.serverModified;

  if (localMtime === remoteMtime) {
    // 동률 → keep_both fallback
    await handleConflictKeepBoth(item, deps);
    return;
  }

  if (localMtime > remoteMtime) {
    // 로컬이 더 최신 → 로컬을 원격에 업로드
    const localData = await fs.read(localPath);
    const localHash = await dropboxContentHashBrowser(localData);
    const entry = await remote.upload(localPath, localData);

    await updateSyncState(store, pathLower, localPath, localHash, entry.hash ?? localHash, entry.rev);
  } else {
    // 원격이 더 최신 → 원격으로 로컬 덮어쓰기
    await fs.write(localPath, result.data, result.metadata.serverModified);
    await updateSyncState(store, pathLower, localPath, result.verifiedHash, result.verifiedHash, result.metadata.rev);
  }
}

/** manual: conflictResolver 콜백으로 사용자에게 위임. 없으면 keep_both fallback */
async function handleConflictManual(
  item: SyncPlanItem,
  deps: ExecutorContext,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  if (!deps.conflictResolver) {
    await handleConflictKeepBoth(item, deps);
    return;
  }

  // 비교용 양쪽 데이터 미리 읽기
  const localData = await fs.read(localPath);
  const result = await downloadAndVerify(remote, localPath);

  const context: ConflictContext = {
    localSize: localData.length,
    remoteSize: result.data.length,
    remoteMtime: result.metadata.serverModified,
  };

  const isText = /\.(md|txt|json|css|js|ts|html|xml|yaml|yml|csv|ini|cfg|log|toml)$/i.test(localPath);
  if (isText) {
    const decoder = new TextDecoder();
    context.localContent = decoder.decode(localData);
    context.remoteContent = decoder.decode(result.data);
  } else {
    context.localData = localData;
    context.remoteData = result.data;
  }

  const choice = await deps.conflictResolver(localPath, context);

  if (!choice) {
    await handleConflictKeepBoth(item, deps);
    return;
  }

  if (choice === "local") {
    const localHash = await dropboxContentHashBrowser(localData);
    const entry = await remote.upload(localPath, localData);
    await updateSyncState(store, pathLower, localPath, localHash, entry.hash ?? localHash, entry.rev);
  } else if (choice === "remote") {
    await fs.write(localPath, result.data, result.metadata.serverModified);
    await updateSyncState(store, pathLower, localPath, result.verifiedHash, result.verifiedHash, result.metadata.rev);
  } else {
    // merged
    const merged = choice.content;
    await fs.write(localPath, merged);
    const mergedHash = await dropboxContentHashBrowser(merged);
    const entry = await remote.upload(localPath, merged);
    await updateSyncState(store, pathLower, localPath, mergedHash, entry.hash ?? mergedHash, entry.rev);
  }
}

/**
 * upload 중 rev 충돌 발생 시 conflict 처리.
 * 원격 파일을 .conflict.md로 다운로드, 로컬 파일을 강제 업로드.
 */
async function handleConflictOnUpload(
  item: SyncPlanItem,
  deps: ExecutorContext,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  const result = await downloadAndVerify(remote, localPath);
  const conflictPath = makeConflictPath(localPath);
  await fs.write(conflictPath, result.data, result.metadata.serverModified);

  // rev 없이 강제 업로드
  const localData = await fs.read(localPath);
  const localHash = await dropboxContentHashBrowser(localData);
  const entry = await remote.upload(localPath, localData);

  await updateSyncState(store, pathLower, localPath, localHash, entry.hash ?? localHash, entry.rev);
}

/**
 * 충돌 파일 경로 생성 (timestamp 포함으로 반복 충돌 시 덮어쓰기 방지).
 * test.md → test.conflict-20260305T103500.md
 */
export function makeConflictPath(path: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return `${path}.conflict-${ts}`;
  return `${path.slice(0, lastDot)}.conflict-${ts}${path.slice(lastDot)}`;
}
