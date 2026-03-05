import { dropboxContentHashBrowser } from "../hash.browser";
import type { FileSystem, RemoteStorage, SyncStateStore } from "../adapters/interfaces";
import type { ConflictContext, DownloadResult, SyncPlanItem } from "../types";
import type { ConflictResolver, ConflictStrategy } from "../types";

/** skip된 conflict를 구분하기 위한 내부 에러 */
export class ConflictSkippedError extends Error {
  constructor() {
    super("conflict skipped");
    this.name = "ConflictSkippedError";
  }
}

/** conflict handler에 필요한 의존성 */
export interface ConflictHandlerDeps {
  fs: FileSystem;
  remote: RemoteStorage;
  store: SyncStateStore;
  conflictStrategy?: ConflictStrategy;
  conflictResolver?: ConflictResolver;
}

// ── 공유 유틸리티 ──

/** 다운로드 후 hash 검증 */
export async function downloadAndVerify(
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

/** sync state 갱신 */
export async function updateSyncState(
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

// ── Conflict Handlers ──

/** keep_both: 원격을 .conflict 파일로 보존, 로컬을 원격에 업로드 */
export async function handleConflictKeepBoth(
  item: SyncPlanItem,
  deps: ConflictHandlerDeps,
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
export async function handleConflictNewest(
  item: SyncPlanItem,
  deps: ConflictHandlerDeps,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  const localStat = await fs.stat(localPath);
  const result = await downloadAndVerify(remote, localPath);

  const localMtime = localStat.mtime;
  const remoteMtime = result.metadata.serverModified;

  if (localMtime === remoteMtime) {
    await handleConflictKeepBoth(item, deps);
    return;
  }

  if (localMtime > remoteMtime) {
    const localData = await fs.read(localPath);
    const localHash = await dropboxContentHashBrowser(localData);
    const entry = await remote.upload(localPath, localData);
    await updateSyncState(store, pathLower, localPath, localHash, entry.hash ?? localHash, entry.rev);
  } else {
    await fs.write(localPath, result.data, result.metadata.serverModified);
    await updateSyncState(store, pathLower, localPath, result.verifiedHash, result.verifiedHash, result.metadata.rev);
  }
}

/** manual: conflictResolver 콜백으로 사용자에게 위임. 없으면 keep_both fallback */
export async function handleConflictManual(
  item: SyncPlanItem,
  deps: ConflictHandlerDeps,
): Promise<void> {
  const { fs, remote, store } = deps;
  const { pathLower, localPath } = item;

  if (!deps.conflictResolver) {
    await handleConflictKeepBoth(item, deps);
    return;
  }

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

  if (choice === "skip" || !choice) {
    throw new ConflictSkippedError();
  }

  if (choice === "local") {
    const localHash = await dropboxContentHashBrowser(localData);
    const entry = await remote.upload(localPath, localData);
    await updateSyncState(store, pathLower, localPath, localHash, entry.hash ?? localHash, entry.rev);
  } else if (choice === "remote") {
    await fs.write(localPath, result.data, result.metadata.serverModified);
    await updateSyncState(store, pathLower, localPath, result.verifiedHash, result.verifiedHash, result.metadata.rev);
  } else {
    const merged = choice.content;
    await fs.write(localPath, merged);
    const mergedHash = await dropboxContentHashBrowser(merged);
    const entry = await remote.upload(localPath, merged);
    await updateSyncState(store, pathLower, localPath, mergedHash, entry.hash ?? mergedHash, entry.rev);
  }
}

/** 전략 → 핸들러 디스패치 맵 */
type ConflictHandler = (item: SyncPlanItem, deps: ConflictHandlerDeps) => Promise<void>;

const CONFLICT_HANDLERS: Record<ConflictStrategy, ConflictHandler> = {
  keep_both: handleConflictKeepBoth,
  newest: handleConflictNewest,
  manual: handleConflictManual,
};

/** strategy에 따라 적절한 conflict handler를 호출 */
export function dispatchConflict(
  item: SyncPlanItem,
  deps: ConflictHandlerDeps,
): Promise<void> {
  const strategy = deps.conflictStrategy ?? "keep_both";
  return CONFLICT_HANDLERS[strategy](item, deps);
}

/** @deprecated dispatchConflict 사용 */
export const handleConflictOnUpload = dispatchConflict;

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
