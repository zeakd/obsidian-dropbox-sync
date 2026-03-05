import { describe, test, expect } from "bun:test";
import { dropboxContentHash } from "@/hash";
import { dropboxContentHashBrowser } from "@/hash.browser";

/**
 * hash.browser.ts (crypto.subtle) 가 hash.ts (node:crypto) 와
 * 동일한 결과를 반환하는지 검증한다.
 *
 * Node 20+ 에서 globalThis.crypto.subtle 사용 가능.
 */
describe("dropboxContentHashBrowser", () => {
  test("빈 파일: node와 동일", async () => {
    const data = new Uint8Array(0);
    const nodeHash = dropboxContentHash(data);
    const browserHash = await dropboxContentHashBrowser(data);
    expect(browserHash).toBe(nodeHash);
  });

  test("짧은 텍스트: node와 동일", async () => {
    const data = new TextEncoder().encode("hello world");
    const nodeHash = dropboxContentHash(data);
    const browserHash = await dropboxContentHashBrowser(data);
    expect(browserHash).toBe(nodeHash);
  });

  test("4MB 미만: node와 동일", async () => {
    const data = new Uint8Array(1000);
    data.fill(0x42);
    const nodeHash = dropboxContentHash(data);
    const browserHash = await dropboxContentHashBrowser(data);
    expect(browserHash).toBe(nodeHash);
  });

  test("정확히 4MB: node와 동일", async () => {
    const data = new Uint8Array(4 * 1024 * 1024);
    data.fill(0x41);
    const nodeHash = dropboxContentHash(data);
    const browserHash = await dropboxContentHashBrowser(data);
    expect(browserHash).toBe(nodeHash);
  });

  test("4MB 초과 (2블록): node와 동일", async () => {
    const size = 4 * 1024 * 1024 + 1;
    const data = new Uint8Array(size);
    data.fill(0x43);
    const nodeHash = dropboxContentHash(data);
    const browserHash = await dropboxContentHashBrowser(data);
    expect(browserHash).toBe(nodeHash);
  });

  test("8MB (정확히 2블록): node와 동일", async () => {
    const data = new Uint8Array(8 * 1024 * 1024);
    for (let i = 0; i < data.length; i++) data[i] = i % 256;
    const nodeHash = dropboxContentHash(data);
    const browserHash = await dropboxContentHashBrowser(data);
    expect(browserHash).toBe(nodeHash);
  });
});
