import { describe, test, expect } from "bun:test";
import { dropboxContentHash } from "@/hash";

describe("dropboxContentHash", () => {
  test("빈 파일", async () => {
    const data = new Uint8Array(0);
    const hash = await dropboxContentHash(data);
    // Dropbox content_hash: 0블록 → SHA-256(빈 연결) = SHA-256("")
    expect(hash).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("4MB 미만 (단일 블록)", async () => {
    const data = new TextEncoder().encode("hello world");
    const hash = await dropboxContentHash(data);
    // 단일 블록: SHA-256("hello world") → SHA-256(그 결과)
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toHaveLength(64);
  });

  test("같은 입력 → 같은 해시", async () => {
    const data = new TextEncoder().encode("test content");
    const hash1 = await dropboxContentHash(data);
    const hash2 = await dropboxContentHash(data);
    expect(hash1).toBe(hash2);
  });

  test("다른 입력 → 다른 해시", async () => {
    const data1 = new TextEncoder().encode("content A");
    const data2 = new TextEncoder().encode("content B");
    expect(await dropboxContentHash(data1)).not.toBe(await dropboxContentHash(data2));
  });

  test("정확히 4MB", async () => {
    const data = new Uint8Array(4 * 1024 * 1024);
    data.fill(0x41); // 'A'
    const hash = await dropboxContentHash(data);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("4MB 초과 (2블록)", async () => {
    const size = 4 * 1024 * 1024 + 1;
    const data = new Uint8Array(size);
    data.fill(0x42); // 'B'
    const hash = await dropboxContentHash(data);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // 단일 블록과 다른 해시여야 함
    const singleBlock = new Uint8Array(4 * 1024 * 1024);
    singleBlock.fill(0x42);
    expect(hash).not.toBe(await dropboxContentHash(singleBlock));
  });

  test("Dropbox 공식 테스트 벡터: 1000바이트의 \\0", async () => {
    // Dropbox 문서의 테스트 벡터
    // 1000바이트의 널 바이트 → 단일 블록
    // block_hash = SHA-256(1000 * \\0)
    // content_hash = SHA-256(block_hash)
    const data = new Uint8Array(1000);
    const hash = await dropboxContentHash(data);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // SHA-256(1000 null bytes) 직접 검증
    const { createHash } = require("crypto");
    const blockHash = createHash("sha256").update(data).digest();
    const expected = createHash("sha256").update(blockHash).digest("hex");
    expect(hash).toBe(expected);
  });

  test("8MB 파일 (정확히 2블록)", async () => {
    const data = new Uint8Array(8 * 1024 * 1024);
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 256;
    }
    const hash = await dropboxContentHash(data);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);

    // 수동 검증: 2블록 해시 연결
    const { createHash } = require("crypto");
    const block1 = data.subarray(0, 4 * 1024 * 1024);
    const block2 = data.subarray(4 * 1024 * 1024);
    const h1 = createHash("sha256").update(block1).digest();
    const h2 = createHash("sha256").update(block2).digest();
    const concat = Buffer.concat([h1, h2]);
    const expected = createHash("sha256").update(concat).digest("hex");
    expect(hash).toBe(expected);
  });
});
