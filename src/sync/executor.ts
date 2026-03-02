import { dropboxContentHashBrowser } from "../hash.browser";
import type { FileSystem, RemoteStorage, SyncStateStore } from "../adapters/interfaces";
import { RevConflictError, type SyncPlan, type SyncPlanItem, type SyncResult } from "../types";

export type ConflictStrategy = "keep_both" | "newest" | "manual";

/** manual 전략에서 사용자 선택을 반환하는 콜백 */
export type ConflictResolver = (
  localPath: string,
) => Promise<"local" | "remote" | null>;

export interface ExecutorDeps {
  fs: FileSystem;
  remote: RemoteStorage;
  store: SyncStateStore;
  conflictStrategy?: ConflictStrategy;
  conflictResolver?: ConflictResolver;
}

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
): Promise<SyncResult> {
  const succeeded: SyncPlanItem[] = [];
  const failed: { item: SyncPlanItem; error: Error }[] = [];

  for (const item of plan.items) {
    try {
      await executeItem(item, deps);
      succeeded.push(item);
    } catch (err) {
      failed.push({ item, error: err as Error });
    }
  }

  return { succeeded, failed };
}

async function executeItem(
  item: SyncPlanItem,
  deps: ExecutorDeps,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { action, pathLower, localPath } = item;

  switch (action.type) {
    case "upload": {
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

      await store.setEntry({
        pathLower,
        localPath,
        baseLocalHash: localHash,
        baseRemoteHash: entry.hash ?? localHash,
        rev: entry.rev,
        lastSynced: Date.now(),
      });
      break;
    }

    case "download": {
      const result = await remote.download(localPath);
      const downloadedHash = await dropboxContentHashBrowser(result.data);

      // hash 검증
      if (result.metadata.hash && downloadedHash !== result.metadata.hash) {
        throw new Error(
          `Hash mismatch after download: expected ${result.metadata.hash}, got ${downloadedHash}`,
        );
      }

      await fs.write(localPath, result.data, result.metadata.serverModified);

      await store.setEntry({
        pathLower,
        localPath,
        baseLocalHash: downloadedHash,
        baseRemoteHash: downloadedHash,
        rev: result.metadata.rev,
        lastSynced: Date.now(),
      });
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
  deps: ExecutorDeps,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  const result = await remote.download(localPath);
  const conflictPath = makeConflictPath(localPath);
  await fs.write(conflictPath, result.data, result.metadata.serverModified);

  const localData = await fs.read(localPath);
  const localHash = await dropboxContentHashBrowser(localData);
  const entry = await remote.upload(localPath, localData);

  await store.setEntry({
    pathLower,
    localPath,
    baseLocalHash: localHash,
    baseRemoteHash: entry.hash ?? localHash,
    rev: entry.rev,
    lastSynced: Date.now(),
  });
}

/** newest: mtime 비교하여 더 최신 버전으로 통일. 동률 시 keep_both fallback */
async function handleConflictNewest(
  item: SyncPlanItem,
  deps: ExecutorDeps,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  const localInfo = (await fs.list()).find(
    (f) => f.pathLower === pathLower,
  );
  const result = await remote.download(localPath);

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

    await store.setEntry({
      pathLower,
      localPath,
      baseLocalHash: localHash,
      baseRemoteHash: entry.hash ?? localHash,
      rev: entry.rev,
      lastSynced: Date.now(),
    });
  } else {
    // 원격이 더 최신 → 원격으로 로컬 덮어쓰기
    const downloadedHash = await dropboxContentHashBrowser(result.data);
    await fs.write(localPath, result.data, result.metadata.serverModified);

    await store.setEntry({
      pathLower,
      localPath,
      baseLocalHash: downloadedHash,
      baseRemoteHash: downloadedHash,
      rev: result.metadata.rev,
      lastSynced: Date.now(),
    });
  }
}

/** manual: conflictResolver 콜백으로 사용자에게 위임. 없으면 keep_both fallback */
async function handleConflictManual(
  item: SyncPlanItem,
  deps: ExecutorDeps,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  if (!deps.conflictResolver) {
    await handleConflictKeepBoth(item, deps);
    return;
  }

  const choice = await deps.conflictResolver(localPath);

  if (!choice) {
    // 사용자가 취소 → keep_both fallback
    await handleConflictKeepBoth(item, deps);
    return;
  }

  if (choice === "local") {
    // 로컬 버전 유지 → 원격에 업로드
    const localData = await fs.read(localPath);
    const localHash = await dropboxContentHashBrowser(localData);
    const entry = await remote.upload(localPath, localData);

    await store.setEntry({
      pathLower,
      localPath,
      baseLocalHash: localHash,
      baseRemoteHash: entry.hash ?? localHash,
      rev: entry.rev,
      lastSynced: Date.now(),
    });
  } else {
    // 원격 버전 선택 → 로컬에 다운로드
    const result = await remote.download(localPath);
    const downloadedHash = await dropboxContentHashBrowser(result.data);
    await fs.write(localPath, result.data, result.metadata.serverModified);

    await store.setEntry({
      pathLower,
      localPath,
      baseLocalHash: downloadedHash,
      baseRemoteHash: downloadedHash,
      rev: result.metadata.rev,
      lastSynced: Date.now(),
    });
  }
}

/**
 * upload 중 rev 충돌 발생 시 conflict 처리.
 * 원격 파일을 .conflict.md로 다운로드, 로컬 파일을 강제 업로드.
 */
async function handleConflictOnUpload(
  item: SyncPlanItem,
  deps: ExecutorDeps,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  const result = await remote.download(localPath);
  const conflictPath = makeConflictPath(localPath);
  await fs.write(conflictPath, result.data, result.metadata.serverModified);

  // rev 없이 강제 업로드
  const localData = await fs.read(localPath);
  const localHash = await dropboxContentHashBrowser(localData);
  const entry = await remote.upload(localPath, localData);

  await store.setEntry({
    pathLower,
    localPath,
    baseLocalHash: localHash,
    baseRemoteHash: entry.hash ?? localHash,
    rev: entry.rev,
    lastSynced: Date.now(),
  });
}

/**
 * 충돌 파일 경로 생성.
 * test.md → test.conflict.md
 * notes/doc.md → notes/doc.conflict.md
 */
export function makeConflictPath(path: string): string {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return `${path}.conflict`;
  return `${path.slice(0, lastDot)}.conflict${path.slice(lastDot)}`;
}
