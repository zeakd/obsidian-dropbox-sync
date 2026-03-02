import type { Vault } from "obsidian";
import type { SyncStateStore } from "./interfaces";
import type { SyncEntry } from "../types";

const ENTRIES_PATH = ".sync-state/entries.json";
const META_PATH = ".sync-state/meta.json";

/**
 * Vault 파일 기반 SyncStateStore (iOS fallback).
 *
 * IndexedDB가 불안정한 iOS에서 사용.
 * vault adapter를 직접 사용하여 이벤트 발화를 방지한다.
 * .sync-state/ 경로는 vault-adapter.ts의 shouldExclude에 이미 등록됨.
 */
export class VaultFileStore implements SyncStateStore {
  constructor(private vault: Vault) {}

  async getEntry(pathLower: string): Promise<SyncEntry | null> {
    const entries = await this.loadEntries();
    return entries[pathLower] ?? null;
  }

  async setEntry(entry: SyncEntry): Promise<void> {
    const entries = await this.loadEntries();
    entries[entry.pathLower] = entry;
    await this.saveEntries(entries);
  }

  async deleteEntry(pathLower: string): Promise<void> {
    const entries = await this.loadEntries();
    delete entries[pathLower];
    await this.saveEntries(entries);
  }

  async getAllEntries(): Promise<SyncEntry[]> {
    const entries = await this.loadEntries();
    return Object.values(entries);
  }

  async clear(): Promise<void> {
    await this.writeFile(ENTRIES_PATH, "{}");
    await this.writeFile(META_PATH, "{}");
  }

  async getMeta(key: string): Promise<string | null> {
    const meta = await this.loadMeta();
    return meta[key] ?? null;
  }

  async setMeta(key: string, value: string): Promise<void> {
    const meta = await this.loadMeta();
    meta[key] = value;
    await this.saveMeta(meta);
  }

  // ── private ──

  private async loadEntries(): Promise<Record<string, SyncEntry>> {
    return this.readJson<Record<string, SyncEntry>>(ENTRIES_PATH, {});
  }

  private async saveEntries(entries: Record<string, SyncEntry>): Promise<void> {
    await this.writeFile(ENTRIES_PATH, JSON.stringify(entries));
  }

  private async loadMeta(): Promise<Record<string, string>> {
    return this.readJson<Record<string, string>>(META_PATH, {});
  }

  private async saveMeta(meta: Record<string, string>): Promise<void> {
    await this.writeFile(META_PATH, JSON.stringify(meta));
  }

  private async readJson<T>(path: string, fallback: T): Promise<T> {
    try {
      if (await this.vault.adapter.exists(path)) {
        const raw = await this.vault.adapter.read(path);
        return JSON.parse(raw) as T;
      }
    } catch {
      // 파싱 실패 시 fallback
    }
    return fallback;
  }

  private async writeFile(path: string, content: string): Promise<void> {
    await this.ensureDir(".sync-state");
    await this.vault.adapter.write(path, content);
  }

  private async ensureDir(dir: string): Promise<void> {
    if (!(await this.vault.adapter.exists(dir))) {
      await this.vault.adapter.mkdir(dir);
    }
  }
}
