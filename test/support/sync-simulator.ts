import {
  MemoryFileSystem,
  MemoryRemoteStorage,
  MemoryStateStore,
} from "@/adapters/memory";
import { SyncEngine, type CycleResult } from "@/sync/engine";
import { dropboxContentHash } from "@/hash";

/**
 * 다기기 동기화 시뮬레이터.
 *
 * 모든 device가 하나의 MemoryRemoteStorage를 공유한다.
 * 각 device는 독립된 MemoryFileSystem과 MemoryStateStore를 갖는다.
 */
export class SyncSimulator {
  readonly remote: MemoryRemoteStorage;
  private devices = new Map<string, Device>();

  constructor() {
    this.remote = new MemoryRemoteStorage();
  }

  addDevice(name: string): Device {
    const device = new Device(name, this.remote);
    this.devices.set(name, device);
    return device;
  }

  getDevice(name: string): Device {
    const device = this.devices.get(name);
    if (!device) throw new Error(`Device not found: ${name}`);
    return device;
  }

  /**
   * 지정된 경로의 파일이 모든 device에서 동일한 내용인지 검증.
   * conflict 파일은 검증에서 제외.
   */
  async assertConsistent(path: string): Promise<void> {
    const hashes: { device: string; hash: string }[] = [];

    for (const [name, device] of this.devices) {
      if (!device.fs.has(path)) continue;
      const hash = await device.fs.computeHash(path);
      hashes.push({ device: name, hash });
    }

    if (hashes.length <= 1) return;

    const first = hashes[0].hash;
    for (const h of hashes.slice(1)) {
      if (h.hash !== first) {
        throw new Error(
          `Inconsistent content for "${path}": ${hashes.map((h) => `${h.device}=${h.hash.slice(0, 8)}`).join(", ")}`,
        );
      }
    }
  }

  /**
   * 모든 device의 모든 파일이 일치하는지 검증.
   * (conflict 파일 제외)
   */
  async assertAllConsistent(): Promise<void> {
    const allPaths = new Set<string>();
    for (const device of this.devices.values()) {
      const files = await device.fs.list();
      for (const f of files) {
        if (!f.path.includes(".conflict")) {
          allPaths.add(f.path);
        }
      }
    }

    for (const path of allPaths) {
      await this.assertConsistent(path);
    }
  }
}

export class Device {
  readonly fs: MemoryFileSystem;
  readonly store: MemoryStateStore;
  private engine: SyncEngine;

  constructor(
    readonly name: string,
    remote: MemoryRemoteStorage,
  ) {
    this.fs = new MemoryFileSystem();
    this.store = new MemoryStateStore();
    this.engine = new SyncEngine({ fs: this.fs, remote, store: this.store });
  }

  async editFile(path: string, content: string): Promise<void> {
    const data = new TextEncoder().encode(content);
    await this.fs.write(path, data);
  }

  async deleteFile(path: string): Promise<void> {
    await this.fs.delete(path);
  }

  async sync(): Promise<CycleResult> {
    return this.engine.runCycle();
  }

  async readFile(path: string): Promise<string> {
    const data = await this.fs.read(path);
    return new TextDecoder().decode(data);
  }

  hasFile(path: string): boolean {
    return this.fs.has(path);
  }

  async getFileHash(path: string): Promise<string> {
    return this.fs.computeHash(path);
  }
}
