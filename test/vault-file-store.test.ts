import { describe, test, expect, beforeEach } from "bun:test";
import { VaultFileStore } from "@/adapters/vault-file-store";
import type { SyncEntry } from "@/types";

/**
 * Vault adapter를 메모리 맵으로 시뮬레이션.
 * 실제 Obsidian Vault와 동일한 인터페이스를 제공.
 */
function createMockVault() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();

  return {
    adapter: {
      exists: async (path: string) => files.has(path) || dirs.has(path),
      read: async (path: string) => {
        const content = files.get(path);
        if (content === undefined) throw new Error(`File not found: ${path}`);
        return content;
      },
      write: async (path: string, data: string) => {
        files.set(path, data);
      },
      mkdir: async (path: string) => {
        dirs.add(path);
      },
      remove: async (path: string) => {
        files.delete(path);
      },
      rename: async (from: string, to: string) => {
        const content = files.get(from);
        if (content === undefined) throw new Error(`File not found: ${from}`);
        files.delete(from);
        files.set(to, content);
      },
    },
    // 테스트 헬퍼
    _files: files,
    _dirs: dirs,
  };
}

describe("VaultFileStore", () => {
  let store: VaultFileStore;
  const entry: SyncEntry = {
    pathLower: "test.md",
    localPath: "test.md",
    baseLocalHash: "hash_local",
    baseRemoteHash: "hash_remote",
    rev: "rev_1",
    lastSynced: 1000,
  };

  beforeEach(() => {
    const vault = createMockVault();
    store = new VaultFileStore(vault as any);
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

  test("파일 없는 초기 상태에서 getEntry → null", async () => {
    expect(await store.getEntry("anything")).toBeNull();
  });

  test("파일 없는 초기 상태에서 getAllEntries → 빈 배열", async () => {
    expect(await store.getAllEntries()).toEqual([]);
  });

  // ── 동시성 테스트 ──

  test("동시에 여러 setEntry 호출 → 모든 엔트리 보존", async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      ...entry,
      pathLower: `file-${i}.md`,
      localPath: `file-${i}.md`,
      rev: `rev_${i}`,
    }));

    // 모든 setEntry를 동시에 실행
    await Promise.all(entries.map((e) => store.setEntry(e)));

    const all = await store.getAllEntries();
    expect(all).toHaveLength(10);

    // 각 엔트리가 올바르게 저장되었는지 확인
    for (const e of entries) {
      const result = await store.getEntry(e.pathLower);
      expect(result?.rev).toBe(e.rev);
    }
  });

  test("동시에 setEntry + setMeta → 상호 간섭 없음", async () => {
    await Promise.all([
      store.setEntry(entry),
      store.setMeta("cursor", "abc"),
      store.setEntry({ ...entry, pathLower: "b.md", localPath: "b.md" }),
      store.setMeta("deviceId", "xyz"),
    ]);

    expect(await store.getEntry("test.md")).not.toBeNull();
    expect(await store.getEntry("b.md")).not.toBeNull();
    expect(await store.getMeta("cursor")).toBe("abc");
    expect(await store.getMeta("deviceId")).toBe("xyz");
  });

  test("동시에 setEntry + deleteEntry → 최종 상태 일관성", async () => {
    await store.setEntry(entry);

    // 삭제와 새 추가를 동시에
    await Promise.all([
      store.deleteEntry("test.md"),
      store.setEntry({ ...entry, pathLower: "new.md", localPath: "new.md" }),
    ]);

    expect(await store.getEntry("test.md")).toBeNull();
    expect(await store.getEntry("new.md")).not.toBeNull();
  });
});
