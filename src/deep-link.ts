import type { FileSystem, RemoteStorage, SyncStateStore } from "./adapters/interfaces";

export interface FetchFileDeps {
  remote: RemoteStorage;
  fs: FileSystem;
  store: SyncStateStore | null;
  computeHash: (data: Uint8Array) => Promise<string>;
}

export interface FetchFileResult {
  /** 다운로드된 바이트 */
  data: Uint8Array;
  /** Dropbox pathLower */
  pathLower: string;
  /** Dropbox rev */
  rev: string;
}

/**
 * Dropbox에서 단일 파일을 다운로드하고 로컬에 저장.
 * sync state도 업데이트하여 다음 싱크에서 재다운로드 방지.
 *
 * @throws Dropbox API 에러 (파일 없음, 네트워크 등)
 */
export async function fetchFileFromRemote(
  filePath: string,
  deps: FetchFileDeps,
): Promise<FetchFileResult> {
  const { data, metadata } = await deps.remote.download(filePath);
  await deps.fs.write(filePath, data, metadata.serverModified);

  if (deps.store) {
    const localHash = await deps.computeHash(data);
    await deps.store.setEntry({
      pathLower: metadata.pathLower,
      localPath: filePath,
      baseLocalHash: localHash,
      baseRemoteHash: metadata.hash,
      rev: metadata.rev,
      lastSynced: Date.now(),
    });
  }

  return {
    data,
    pathLower: metadata.pathLower,
    rev: metadata.rev,
  };
}
