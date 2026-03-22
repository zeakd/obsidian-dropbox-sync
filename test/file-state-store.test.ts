import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { FileStateStore } from "@/cli/file-state-store";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { SyncEntry } from "@/types";

describe("FileStateStore", () => {
  let tmpDir: string;
  let storePath: string;
  let store: FileStateStore;

  const entry: SyncEntry = {
    pathLower: "test.md",
    localPath: "test.md",
    baseLocalHash: "hash_local",
    baseRemoteHash: "hash_remote",
    rev: "rev_1",
    lastSynced: 1000,
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fss-test-"));
    storePath = path.join(tmpDir, "sync-state.json");
    store = new FileStateStore(storePath);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("setEntry → getEntry 왕복", async () => {
    await store.setEntry(entry);
    const result = await store.getEntry("test.md");
    expect(result).toEqual(entry);
  });

  test("getEntry: 존재하지 않으면 null", async () => {
    const result = await store.getEntry("missing.md");
    expect(result).toBeNull();
  });

  test("deleteEntry는 엔트리를 삭제한다", async () => {
    await store.setEntry(entry);
    await store.deleteEntry("test.md");
    expect(await store.getEntry("test.md")).toBeNull();
  });

  test("getAllEntries는 모든 엔트리를 반환한다", async () => {
    await store.setEntry(entry);
    await store.setEntry({ ...entry, pathLower: "b.md", localPath: "b.md" });

    const all = await store.getAllEntries();
    expect(all).toHaveLength(2);
    const paths = all.map((e) => e.pathLower);
    expect(paths).toContain("test.md");
    expect(paths).toContain("b.md");
  });

  test("clear는 모든 데이터를 삭제한다", async () => {
    await store.setEntry(entry);
    await store.setMeta("cursor", "abc");
    await store.clear();

    expect(await store.getEntry("test.md")).toBeNull();
    expect(await store.getMeta("cursor")).toBeNull();
  });

  test("setMeta → getMeta 왕복", async () => {
    await store.setMeta("cursor", "cursor_value_123");
    expect(await store.getMeta("cursor")).toBe("cursor_value_123");
  });

  test("getMeta: 존재하지 않으면 null", async () => {
    expect(await store.getMeta("nonexistent")).toBeNull();
  });

  test("상태 영속성: 같은 경로로 새 인스턴스를 만들면 데이터가 유지된다", async () => {
    await store.setEntry(entry);
    await store.setMeta("cursor", "persisted_cursor");

    // 새 인스턴스 생성
    const store2 = new FileStateStore(storePath);
    const result = await store2.getEntry("test.md");
    expect(result).toEqual(entry);
    expect(await store2.getMeta("cursor")).toBe("persisted_cursor");
  });

  test("store는 파일의 부모 디렉토리를 자동 생성한다", async () => {
    const deepPath = path.join(tmpDir, "a", "b", "c", "state.json");
    const deepStore = new FileStateStore(deepPath);

    await deepStore.setEntry(entry);
    const result = await deepStore.getEntry("test.md");
    expect(result).toEqual(entry);

    // 실제 파일이 생성되었는지 확인
    const stat = await fs.stat(deepPath);
    expect(stat.isFile()).toBe(true);
  });
});
