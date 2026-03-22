import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SyncStateStore } from "../adapters/interfaces";
import type { SyncEntry } from "../types";

interface StoreData {
  entries: Record<string, SyncEntry>;
  meta: Record<string, string>;
}

/**
 * JSON 파일 기반 SyncStateStore.
 * CLI/headless 환경에서 IndexedDB 대신 사용.
 *
 * 매 변경 시 전체 파일을 다시 쓴다 (간단한 구현).
 * 대규모 vault에서는 성능 고려가 필요할 수 있지만,
 * CLI 디버깅 용도로는 충분하다.
 */
export class FileStateStore implements SyncStateStore {
  private data: StoreData = { entries: {}, meta: {} };
  private loaded = false;

  constructor(private filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      this.data = JSON.parse(raw) as StoreData;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      this.data = { entries: {}, meta: {} };
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async getEntry(pathLower: string): Promise<SyncEntry | null> {
    await this.ensureLoaded();
    return this.data.entries[pathLower] ?? null;
  }

  async setEntry(entry: SyncEntry): Promise<void> {
    await this.ensureLoaded();
    this.data.entries[entry.pathLower] = entry;
    await this.save();
  }

  async deleteEntry(pathLower: string): Promise<void> {
    await this.ensureLoaded();
    delete this.data.entries[pathLower];
    await this.save();
  }

  async getAllEntries(): Promise<SyncEntry[]> {
    await this.ensureLoaded();
    return Object.values(this.data.entries);
  }

  async clear(): Promise<void> {
    this.data = { entries: {}, meta: {} };
    await this.save();
  }

  async getMeta(key: string): Promise<string | null> {
    await this.ensureLoaded();
    return this.data.meta[key] ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.ensureLoaded();
    this.data.meta[key] = value;
    await this.save();
  }
}
