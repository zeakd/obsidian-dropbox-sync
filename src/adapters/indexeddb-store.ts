import localforage from "localforage";
import type { SyncStateStore } from "./interfaces";
import type { SyncEntry } from "../types";

const ENTRIES_STORE = "sync-entries";
const META_STORE = "sync-meta";

/**
 * IndexedDB 기반 SyncStateStore (localforage 래퍼).
 *
 * vault별로 고유한 DB 인스턴스를 생성한다.
 * iOS에서 IndexedDB 불안정 시 file-store fallback 사용 (Phase 2.5).
 */
export class IndexedDBStore implements SyncStateStore {
  private entriesDb: LocalForage;
  private metaDb: LocalForage;

  constructor(vaultId: string) {
    this.entriesDb = localforage.createInstance({
      name: `dropbox-sync-${vaultId}`,
      storeName: ENTRIES_STORE,
    });
    this.metaDb = localforage.createInstance({
      name: `dropbox-sync-${vaultId}`,
      storeName: META_STORE,
    });
  }

  async getEntry(pathLower: string): Promise<SyncEntry | null> {
    return this.entriesDb.getItem<SyncEntry>(pathLower);
  }

  async setEntry(entry: SyncEntry): Promise<void> {
    await this.entriesDb.setItem(entry.pathLower, entry);
  }

  async deleteEntry(pathLower: string): Promise<void> {
    await this.entriesDb.removeItem(pathLower);
  }

  async getAllEntries(): Promise<SyncEntry[]> {
    const entries: SyncEntry[] = [];
    await this.entriesDb.iterate<SyncEntry, void>((value) => {
      entries.push(value);
    });
    return entries;
  }

  async clear(): Promise<void> {
    await this.entriesDb.clear();
    await this.metaDb.clear();
  }

  async getMeta(key: string): Promise<string | null> {
    return this.metaDb.getItem<string>(key);
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.metaDb.setItem(key, value);
  }
}
