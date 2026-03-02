import { describe, test, expect, beforeEach } from "vitest";
import {
  MemoryFileSystem,
  MemoryRemoteStorage,
  MemoryStateStore,
  RevConflictError,
} from "@/adapters/memory";
import type { SyncEntry } from "@/types";

// ── MemoryFileSystem ──

describe("MemoryFileSystem", () => {
  let fs: MemoryFileSystem;

  beforeEach(() => {
    fs = new MemoryFileSystem();
  });

  test("write → read 왕복", async () => {
    const data = new TextEncoder().encode("hello");
    await fs.write("test.md", data);
    const result = await fs.read("test.md");
    expect(result).toEqual(data);
  });

  test("존재하지 않는 파일 read → 에러", async () => {
    await expect(fs.read("missing.md")).rejects.toThrow("File not found");
  });

  test("write → delete → read → 에러", async () => {
    await fs.write("test.md", new Uint8Array([1]));
    await fs.delete("test.md");
    await expect(fs.read("test.md")).rejects.toThrow("File not found");
  });

  test("존재하지 않는 파일 delete → 에러", async () => {
    await expect(fs.delete("missing.md")).rejects.toThrow("File not found");
  });

  test("list: 여러 파일 목록", async () => {
    await fs.write("a.md", new TextEncoder().encode("aaa"));
    await fs.write("b.md", new TextEncoder().encode("bbb"));
    const files = await fs.list();
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path).sort()).toEqual(["a.md", "b.md"]);
  });

  test("list: pathLower 정규화", async () => {
    await fs.write("Notes/README.md", new TextEncoder().encode("x"));
    const files = await fs.list();
    expect(files[0].pathLower).toBe("notes/readme.md");
  });

  test("computeHash: content_hash 반환", async () => {
    await fs.write("test.md", new TextEncoder().encode("content"));
    const hash = await fs.computeHash("test.md");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("computeHash: 같은 내용 → 같은 해시", async () => {
    const data = new TextEncoder().encode("same");
    await fs.write("a.md", data);
    await fs.write("b.md", data);
    const hashA = await fs.computeHash("a.md");
    const hashB = await fs.computeHash("b.md");
    expect(hashA).toBe(hashB);
  });

  test("write with mtime", async () => {
    await fs.write("test.md", new Uint8Array([1]), 1000);
    const files = await fs.list();
    expect(files[0].mtime).toBe(1000);
  });

  test("has 헬퍼", async () => {
    expect(fs.has("test.md")).toBe(false);
    await fs.write("test.md", new Uint8Array([1]));
    expect(fs.has("test.md")).toBe(true);
  });
});

// ── MemoryRemoteStorage ──

describe("MemoryRemoteStorage", () => {
  let remote: MemoryRemoteStorage;

  beforeEach(() => {
    remote = new MemoryRemoteStorage();
  });

  test("upload → download 왕복", async () => {
    const data = new TextEncoder().encode("remote content");
    await remote.upload("test.md", data);
    const result = await remote.download("test.md");
    expect(result.data).toEqual(data);
    expect(result.metadata.rev).toBeTruthy();
    expect(result.metadata.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("존재하지 않는 파일 download → 에러", async () => {
    await expect(remote.download("missing.md")).rejects.toThrow(
      "File not found",
    );
  });

  test("upload: rev 매칭 시 성공", async () => {
    const entry = await remote.upload("test.md", new Uint8Array([1]));
    const updated = await remote.upload(
      "test.md",
      new Uint8Array([2]),
      entry.rev,
    );
    expect(updated.rev).not.toBe(entry.rev);
  });

  test("upload: rev 불일치 시 RevConflictError", async () => {
    await remote.upload("test.md", new Uint8Array([1]));
    await expect(
      remote.upload("test.md", new Uint8Array([2]), "wrong_rev"),
    ).rejects.toThrow(RevConflictError);
  });

  test("upload: rev 없이 덮어쓰기 가능", async () => {
    await remote.upload("test.md", new Uint8Array([1]));
    const updated = await remote.upload("test.md", new Uint8Array([2]));
    expect(updated.rev).toBeTruthy();
    const dl = await remote.download("test.md");
    expect(dl.data).toEqual(new Uint8Array([2]));
  });

  test("delete → download → 에러", async () => {
    await remote.upload("test.md", new Uint8Array([1]));
    await remote.delete("test.md");
    await expect(remote.download("test.md")).rejects.toThrow("File not found");
  });

  test("listChanges: cursor 없으면 전체", async () => {
    await remote.upload("a.md", new Uint8Array([1]));
    await remote.upload("b.md", new Uint8Array([2]));
    const result = await remote.listChanges();
    expect(result.entries).toHaveLength(2);
    expect(result.cursor).toBeTruthy();
  });

  test("listChanges: cursor 이후 변경분만", async () => {
    await remote.upload("a.md", new Uint8Array([1]));
    const { cursor } = await remote.listChanges();
    await remote.upload("b.md", new Uint8Array([2]));
    const result = await remote.listChanges(cursor);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].pathLower).toBe("b.md");
  });

  test("listChanges: 삭제도 변경 이력에 포함", async () => {
    await remote.upload("a.md", new Uint8Array([1]));
    const { cursor } = await remote.listChanges();
    await remote.delete("a.md");
    const result = await remote.listChanges(cursor);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].deleted).toBe(true);
  });

  test("path_lower: 대소문자 무시", async () => {
    await remote.upload("Notes/README.md", new Uint8Array([1]));
    expect(remote.has("notes/readme.md")).toBe(true);
    const dl = await remote.download("Notes/README.md");
    expect(dl.metadata.pathLower).toBe("notes/readme.md");
  });
});

// ── MemoryStateStore ──

describe("MemoryStateStore", () => {
  let store: MemoryStateStore;
  const entry: SyncEntry = {
    pathLower: "test.md",
    localPath: "test.md",
    baseLocalHash: "hash_local",
    baseRemoteHash: "hash_remote",
    rev: "rev_1",
    lastSynced: 1000,
  };

  beforeEach(() => {
    store = new MemoryStateStore();
  });

  test("setEntry → getEntry 왕복", async () => {
    await store.setEntry(entry);
    const result = await store.getEntry("test.md");
    expect(result).toEqual(entry);
  });

  test("getEntry: 존재하지 않으면 null", async () => {
    expect(await store.getEntry("missing")).toBeNull();
  });

  test("deleteEntry → getEntry null", async () => {
    await store.setEntry(entry);
    await store.deleteEntry("test.md");
    expect(await store.getEntry("test.md")).toBeNull();
  });

  test("getAllEntries", async () => {
    await store.setEntry(entry);
    await store.setEntry({ ...entry, pathLower: "b.md", localPath: "b.md" });
    const all = await store.getAllEntries();
    expect(all).toHaveLength(2);
  });

  test("clear: 모든 데이터 삭제", async () => {
    await store.setEntry(entry);
    await store.setMeta("cursor", "abc");
    await store.clear();
    expect(await store.getEntry("test.md")).toBeNull();
    expect(await store.getMeta("cursor")).toBeNull();
  });

  test("setMeta → getMeta 왕복", async () => {
    await store.setMeta("cursor", "abc123");
    expect(await store.getMeta("cursor")).toBe("abc123");
  });

  test("getMeta: 존재하지 않으면 null", async () => {
    expect(await store.getMeta("missing")).toBeNull();
  });

  test("setEntry: 같은 키로 덮어쓰기", async () => {
    await store.setEntry(entry);
    await store.setEntry({ ...entry, rev: "rev_2" });
    const result = await store.getEntry("test.md");
    expect(result?.rev).toBe("rev_2");
  });
});
