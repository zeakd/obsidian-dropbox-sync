import type { Vault, TFile, TAbstractFile } from "obsidian";
import type { FileSystem } from "./interfaces";
import type { FileInfo } from "../types";
import { dropboxContentHashBrowser } from "../hash.browser";

/**
 * Obsidian Vault API를 FileSystem 인터페이스로 래핑.
 *
 * 항상 Vault API를 사용한다 (adapter 직접 사용 X).
 * → 이벤트가 올바르게 발화되고, MetadataCache가 자동 업데이트됨.
 */
export class VaultAdapter implements FileSystem {
  constructor(private vault: Vault) {}

  async read(path: string): Promise<Uint8Array> {
    const file = this.getFile(path);
    const buffer = await this.vault.readBinary(file);
    return new Uint8Array(buffer);
  }

  async write(path: string, data: Uint8Array, mtime?: number): Promise<void> {
    const existing = this.vault.getAbstractFileByPath(path);
    const options = mtime ? { mtime } : undefined;

    if (existing && this.isTFile(existing)) {
      await this.vault.modifyBinary(existing, data.buffer as ArrayBuffer, options);
    } else {
      // 상위 폴더가 없으면 생성
      await this.ensureParentDir(path);
      await this.vault.createBinary(path, data.buffer as ArrayBuffer, options);
    }
  }

  async delete(path: string): Promise<void> {
    const file = this.vault.getAbstractFileByPath(path);
    if (file) {
      await this.vault.trash(file, false); // vault .trash로 이동
    }
  }

  async list(): Promise<FileInfo[]> {
    const files = this.vault.getFiles();
    const result: FileInfo[] = [];

    for (const file of files) {
      // 시스템 파일 제외
      if (this.shouldExclude(file.path)) continue;

      const data = await this.vault.readBinary(file);
      const hash = await dropboxContentHashBrowser(new Uint8Array(data));

      result.push({
        path: file.path,
        pathLower: file.path.toLowerCase(),
        hash,
        mtime: file.stat.mtime,
        size: file.stat.size,
      });
    }

    return result;
  }

  async computeHash(path: string): Promise<string> {
    const file = this.getFile(path);
    const data = await this.vault.readBinary(file);
    return dropboxContentHashBrowser(new Uint8Array(data));
  }

  // ── private ──

  private getFile(path: string): TFile {
    const file = this.vault.getAbstractFileByPath(path);
    if (!file || !this.isTFile(file)) {
      throw new Error(`File not found: ${path}`);
    }
    return file;
  }

  private isTFile(file: TAbstractFile): file is TFile {
    return "stat" in file && "extension" in file;
  }

  private shouldExclude(path: string): boolean {
    const excludes = [".trash/", ".sync-state/", ".DS_Store", "Thumbs.db"];
    if (excludes.some((ex) => path.startsWith(ex) || path.includes(`/${ex}`))) return true;
    if (path.startsWith("sync-debug-") && path.endsWith(".log")) return true;
    return false;
  }

  private async ensureParentDir(path: string): Promise<void> {
    const parts = path.split("/");
    if (parts.length <= 1) return;

    let current = "";
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      const existing = this.vault.getAbstractFileByPath(current);
      if (!existing) {
        await this.vault.createFolder(current);
      }
    }
  }
}
