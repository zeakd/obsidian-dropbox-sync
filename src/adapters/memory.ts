import { dropboxContentHash } from "../hash";
import {
  RevConflictError,
  type FileInfo,
  type RemoteEntry,
  type SyncEntry,
  type ListChangesResult,
  type DownloadResult,
} from "../types";
import type { FileSystem, RemoteStorage, SyncStateStore } from "./interfaces";

// re-export for backward compat
export { RevConflictError };

// ── MemoryFileSystem ──

interface MemoryFile {
  data: Uint8Array;
  mtime: number;
}

export class MemoryFileSystem implements FileSystem {
  private files = new Map<string, MemoryFile>();

  async read(path: string): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return file.data;
  }

  async write(path: string, data: Uint8Array, mtime?: number): Promise<void> {
    this.files.set(path, { data, mtime: mtime ?? Date.now() });
  }

  async delete(path: string): Promise<void> {
    if (!this.files.has(path)) throw new Error(`File not found: ${path}`);
    this.files.delete(path);
  }

  async list(): Promise<FileInfo[]> {
    const result: FileInfo[] = [];
    for (const [path, file] of this.files) {
      result.push({
        path,
        pathLower: path.toLowerCase(),
        hash: dropboxContentHash(file.data),
        mtime: file.mtime,
        size: file.data.length,
      });
    }
    return result;
  }

  async computeHash(path: string): Promise<string> {
    const file = this.files.get(path);
    if (!file) throw new Error(`File not found: ${path}`);
    return dropboxContentHash(file.data);
  }

  // 테스트 헬퍼
  has(path: string): boolean {
    return this.files.has(path);
  }

  /** 파일명이 prefix로 시작하는 첫 번째 경로 반환 */
  findByPrefix(prefix: string): string | undefined {
    for (const key of this.files.keys()) {
      if (key.startsWith(prefix)) return key;
    }
    return undefined;
  }

  getData(path: string): Uint8Array | undefined {
    return this.files.get(path)?.data;
  }

  getFileCount(): number {
    return this.files.size;
  }
}

// ── MemoryRemoteStorage ──

interface RemoteFile {
  pathLower: string;
  pathDisplay: string;
  data: Uint8Array;
  hash: string;
  rev: string;
  serverModified: number;
  deleted: boolean;
}

/** 변경 이력 엔트리 (cursor 시뮬레이션용) */
interface ChangeLogEntry {
  entry: RemoteEntry;
  seq: number;
}

export class MemoryRemoteStorage implements RemoteStorage {
  private files = new Map<string, RemoteFile>();
  private changeLog: ChangeLogEntry[] = [];
  private seq = 0;
  private revCounter = 0;

  async listChanges(cursor?: string): Promise<ListChangesResult> {
    const fromSeq = cursor ? parseInt(cursor, 10) : 0;
    const entries = this.changeLog
      .filter((c) => c.seq > fromSeq)
      .map((c) => c.entry);

    return {
      entries,
      cursor: String(this.seq),
      hasMore: false,
    };
  }

  async download(path: string): Promise<DownloadResult> {
    const pathLower = path.toLowerCase();
    const file = this.files.get(pathLower);
    if (!file || file.deleted) {
      throw new Error(`File not found on remote: ${path}`);
    }
    return {
      data: new Uint8Array(file.data),
      metadata: this.toRemoteEntry(file),
    };
  }

  async upload(
    path: string,
    data: Uint8Array,
    rev?: string,
  ): Promise<RemoteEntry> {
    const pathLower = path.toLowerCase();
    const existing = this.files.get(pathLower);

    // rev 기반 충돌 감지
    if (rev && existing && existing.rev !== rev) {
      throw new RevConflictError(
        `Rev conflict: expected ${rev}, got ${existing.rev}`,
        existing.rev,
      );
    }

    const newRev = this.nextRev();
    const hash = dropboxContentHash(data);
    const now = Date.now();

    const file: RemoteFile = {
      pathLower,
      pathDisplay: path,
      data: new Uint8Array(data),
      hash,
      rev: newRev,
      serverModified: now,
      deleted: false,
    };

    this.files.set(pathLower, file);
    this.addChangeLog(this.toRemoteEntry(file));

    return this.toRemoteEntry(file);
  }

  async delete(path: string): Promise<void> {
    const pathLower = path.toLowerCase();
    const file = this.files.get(pathLower);
    if (!file) return;

    file.deleted = true;
    this.addChangeLog({
      ...this.toRemoteEntry(file),
      deleted: true,
      hash: null,
    });
  }

  // 테스트 헬퍼
  has(pathLower: string): boolean {
    const file = this.files.get(pathLower);
    return !!file && !file.deleted;
  }

  getFile(pathLower: string): RemoteFile | undefined {
    return this.files.get(pathLower);
  }

  getFileCount(): number {
    let count = 0;
    for (const f of this.files.values()) {
      if (!f.deleted) count++;
    }
    return count;
  }

  private nextRev(): string {
    return `rev_${++this.revCounter}`;
  }

  private addChangeLog(entry: RemoteEntry): void {
    this.changeLog.push({ entry, seq: ++this.seq });
  }

  private toRemoteEntry(file: RemoteFile): RemoteEntry {
    return {
      pathLower: file.pathLower,
      pathDisplay: file.pathDisplay,
      hash: file.hash,
      serverModified: file.serverModified,
      rev: file.rev,
      size: file.data.length,
      deleted: file.deleted,
    };
  }
}

// ── MemoryStateStore ──

export class MemoryStateStore implements SyncStateStore {
  private entries = new Map<string, SyncEntry>();
  private meta = new Map<string, string>();

  async getEntry(pathLower: string): Promise<SyncEntry | null> {
    return this.entries.get(pathLower) ?? null;
  }

  async setEntry(entry: SyncEntry): Promise<void> {
    this.entries.set(entry.pathLower, { ...entry });
  }

  async deleteEntry(pathLower: string): Promise<void> {
    this.entries.delete(pathLower);
  }

  async getAllEntries(): Promise<SyncEntry[]> {
    return [...this.entries.values()];
  }

  async clear(): Promise<void> {
    this.entries.clear();
    this.meta.clear();
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key) ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    this.meta.set(key, value);
  }

  // 테스트 헬퍼
  getEntryCount(): number {
    return this.entries.size;
  }
}
