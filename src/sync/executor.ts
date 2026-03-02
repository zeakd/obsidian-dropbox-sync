import { dropboxContentHash } from "../hash";
import type { FileSystem, RemoteStorage, SyncStateStore } from "../adapters/interfaces";
import type { SyncEntry, SyncPlan, SyncPlanItem, SyncResult } from "../types";
import { RevConflictError } from "../adapters/memory";

export interface ExecutorDeps {
  fs: FileSystem;
  remote: RemoteStorage;
  store: SyncStateStore;
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
      const localHash = dropboxContentHash(data);

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
      const downloadedHash = dropboxContentHash(result.data);

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
      // 기본 전략: keep_both
      // 1. 원격 파일을 .conflict.md로 다운로드
      // 2. 로컬 파일은 그대로 유지
      // 3. 로컬 파일을 원격에 업로드 (rev 없이 — 강제 덮어쓰기)
      const result = await remote.download(localPath);
      const conflictPath = makeConflictPath(localPath);
      await fs.write(conflictPath, result.data, result.metadata.serverModified);

      // 로컬 파일을 원격에 업로드
      const localData = await fs.read(localPath);
      const localHash = dropboxContentHash(localData);
      const entry = await remote.upload(localPath, localData);

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

    case "noop":
      break;
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
  const localHash = dropboxContentHash(localData);
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
