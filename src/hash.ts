import { createHash } from "crypto";

const BLOCK_SIZE = 4 * 1024 * 1024; // 4MB

/**
 * Dropbox content_hash 계산 (Node.js 환경).
 *
 * 알고리즘:
 * 1. 데이터를 4MB 블록으로 분할
 * 2. 각 블록을 SHA-256 해시
 * 3. 모든 블록 해시를 연결
 * 4. 연결된 바이트를 다시 SHA-256 해시
 *
 * 빈 파일: SHA-256("") 한 번 → 다시 SHA-256
 */
export function dropboxContentHash(data: Uint8Array): string {
  const blockHashes: Buffer[] = [];

  for (let offset = 0; offset < data.length; offset += BLOCK_SIZE) {
    const end = Math.min(offset + BLOCK_SIZE, data.length);
    const block = data.subarray(offset, end);
    const hash = createHash("sha256").update(block).digest();
    blockHashes.push(hash);
  }

  const concat = Buffer.concat(blockHashes);
  return createHash("sha256").update(concat).digest("hex");
}
