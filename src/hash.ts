/**
 * Dropbox content_hash — Web Crypto API (crypto.subtle) 사용.
 *
 * 알고리즘:
 * 1. 데이터를 4MB 블록으로 분할
 * 2. 각 블록을 SHA-256 해시
 * 3. 모든 블록 해시를 연결
 * 4. 연결된 바이트를 다시 SHA-256 해시
 *
 * 빈 파일: SHA-256("") 한 번 → 다시 SHA-256
 */

const BLOCK_SIZE = 4 * 1024 * 1024; // 4MB

export async function dropboxContentHash(data: Uint8Array): Promise<string> {
  const blockHashes: ArrayBuffer[] = [];

  for (let offset = 0; offset < data.length; offset += BLOCK_SIZE) {
    const end = Math.min(offset + BLOCK_SIZE, data.length);
    const block = data.subarray(offset, end);
    const hash = await globalThis.crypto.subtle.digest("SHA-256", block as Uint8Array<ArrayBuffer>);
    blockHashes.push(hash);
  }

  const totalLength = blockHashes.reduce((sum, h) => sum + h.byteLength, 0);
  const concat = new Uint8Array(totalLength);
  let pos = 0;
  for (const h of blockHashes) {
    concat.set(new Uint8Array(h), pos);
    pos += h.byteLength;
  }

  const finalHash = await globalThis.crypto.subtle.digest("SHA-256", concat.buffer);
  return Array.from(new Uint8Array(finalHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
