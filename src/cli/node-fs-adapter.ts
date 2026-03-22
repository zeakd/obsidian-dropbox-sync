import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { FileSystem } from "../adapters/interfaces";
import type { FileInfo } from "../types";
import { dropboxContentHash } from "../hash";

const EXCLUDED = [
  ".obsidian",
  ".trash",
  ".sync-state",
  ".DS_Store",
  "Thumbs.db",
];

export class NodeFsAdapter implements FileSystem {
  constructor(private basePath: string) {}

  private resolve(filePath: string): string {
    return path.join(this.basePath, filePath);
  }

  async read(filePath: string): Promise<Uint8Array> {
    const buffer = await fs.readFile(this.resolve(filePath));
    return new Uint8Array(buffer);
  }

  async write(
    filePath: string,
    data: Uint8Array,
    mtime?: number,
  ): Promise<void> {
    const fullPath = this.resolve(filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, data);
    if (mtime !== undefined) {
      const time = new Date(mtime);
      await fs.utimes(fullPath, time, time);
    }
  }

  async delete(filePath: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(filePath));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
  }

  async list(): Promise<FileInfo[]> {
    const result: FileInfo[] = [];
    await this.walk("", result);
    return result;
  }

  async stat(filePath: string): Promise<{ mtime: number; size: number }> {
    const s = await fs.stat(this.resolve(filePath));
    return { mtime: s.mtimeMs, size: s.size };
  }

  async computeHash(filePath: string): Promise<string> {
    const data = await this.read(filePath);
    return dropboxContentHash(data);
  }

  private async walk(dir: string, result: FileInfo[]): Promise<void> {
    const fullDir = this.resolve(dir);
    const entries = await fs.readdir(fullDir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = dir ? `${dir}/${entry.name}` : entry.name;

      if (this.shouldExclude(entry.name, relativePath)) continue;

      if (entry.isDirectory()) {
        await this.walk(relativePath, result);
      } else if (entry.isFile()) {
        const fullPath = path.join(fullDir, entry.name);
        const s = await fs.stat(fullPath);
        const data = await fs.readFile(fullPath);
        const hash = await dropboxContentHash(new Uint8Array(data));

        result.push({
          path: relativePath,
          pathLower: relativePath.toLowerCase(),
          hash,
          mtime: s.mtimeMs,
          size: s.size,
        });
      }
    }
  }

  private shouldExclude(name: string, relativePath: string): boolean {
    if (EXCLUDED.includes(name)) return true;
    if (
      relativePath.startsWith("sync-debug-") &&
      relativePath.endsWith(".log")
    )
      return true;
    return false;
  }
}
