import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { NodeFsAdapter } from "@/cli/node-fs-adapter";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("NodeFsAdapter", () => {
  let tmpDir: string;
  let adapter: NodeFsAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nfs-test-"));
    adapter = new NodeFsAdapter(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("write → read 왕복", async () => {
    const data = new TextEncoder().encode("hello world");
    await adapter.write("test.md", data);
    const result = await adapter.read("test.md");
    expect(new TextDecoder().decode(result)).toBe("hello world");
  });

  test("write는 부모 디렉토리를 자동 생성한다", async () => {
    const data = new TextEncoder().encode("nested content");
    await adapter.write("a/b/c/deep.md", data);
    const result = await adapter.read("a/b/c/deep.md");
    expect(new TextDecoder().decode(result)).toBe("nested content");
  });

  test("write에 mtime을 전달하면 파일 타임스탬프가 설정된다", async () => {
    const data = new TextEncoder().encode("with mtime");
    const targetMtime = 1700000000000; // 2023-11-14
    await adapter.write("timed.md", data, targetMtime);

    const stat = await adapter.stat("timed.md");
    // mtime이 정확하게 일치해야 한다 (OS 정밀도에 따라 약간의 차이 허용)
    expect(Math.abs(stat.mtime - targetMtime)).toBeLessThan(1000);
  });

  test("delete는 파일을 삭제한다", async () => {
    const data = new TextEncoder().encode("to delete");
    await adapter.write("del.md", data);
    await adapter.delete("del.md");

    await expect(adapter.read("del.md")).rejects.toThrow();
  });

  test("delete: 존재하지 않는 파일을 삭제해도 에러가 발생하지 않는다", async () => {
    await expect(adapter.delete("nonexistent.md")).resolves.toBeUndefined();
  });

  test("list는 모든 파일의 정보를 반환한다", async () => {
    await adapter.write("a.md", new TextEncoder().encode("aaa"));
    await adapter.write("sub/b.md", new TextEncoder().encode("bbb"));

    const files = await adapter.list();
    expect(files).toHaveLength(2);

    const paths = files.map((f) => f.pathLower);
    expect(paths).toContain("a.md");
    expect(paths).toContain("sub/b.md");

    for (const f of files) {
      expect(f.pathLower).toBe(f.path.toLowerCase());
      expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(f.size).toBeGreaterThan(0);
      expect(f.mtime).toBeGreaterThan(0);
    }
  });

  test("list는 .obsidian, .trash, .DS_Store를 제외한다", async () => {
    await adapter.write("note.md", new TextEncoder().encode("note"));
    await adapter.write(".obsidian/config.json", new TextEncoder().encode("{}"));
    await adapter.write(".trash/deleted.md", new TextEncoder().encode("old"));
    await adapter.write(".DS_Store", new TextEncoder().encode(""));

    const files = await adapter.list();
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("note.md");
  });

  test("stat은 mtime과 size를 반환한다", async () => {
    const data = new TextEncoder().encode("stat test content");
    await adapter.write("stat.md", data);

    const stat = await adapter.stat("stat.md");
    expect(stat.size).toBe(data.length);
    expect(stat.mtime).toBeGreaterThan(0);
  });

  test("computeHash는 hex 문자열을 반환한다", async () => {
    const data = new TextEncoder().encode("hash me");
    await adapter.write("hash.md", data);

    const hash = await adapter.computeHash("hash.md");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("computeHash: 같은 내용 → 같은 해시", async () => {
    const data = new TextEncoder().encode("identical content");
    await adapter.write("file1.md", data);
    await adapter.write("file2.md", data);

    const hash1 = await adapter.computeHash("file1.md");
    const hash2 = await adapter.computeHash("file2.md");
    expect(hash1).toBe(hash2);
  });
});
