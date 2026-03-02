/**
 * Dropbox content_hash — 브라우저/Obsidian 환경용 (crypto.subtle).
 * hash.ts의 Node.js 버전과 동일한 결과를 반환한다.
 */

const BLOCK_SIZE = 4 * 1024 * 1024; // 4MB

export async function dropboxContentHashBrowser(
  data: Uint8Array,
): Promise<string> {
  const blockHashes: ArrayBuffer[] = [];

  if (data.length === 0) {
    const emptyHash = await crypto.subtle.digest(
      "SHA-256",
      new ArrayBuffer(0),
    );
    blockHashes.push(emptyHash);
  } else {
    for (let offset = 0; offset < data.length; offset += BLOCK_SIZE) {
      const end = Math.min(offset + BLOCK_SIZE, data.length);
      const block = data.buffer.slice(
        data.byteOffset + offset,
        data.byteOffset + end,
      ) as ArrayBuffer;
      const hash = await crypto.subtle.digest("SHA-256", block);
      blockHashes.push(hash);
    }
  }

  const totalLength = blockHashes.reduce((sum, h) => sum + h.byteLength, 0);
  const concat = new Uint8Array(totalLength);
  let pos = 0;
  for (const h of blockHashes) {
    concat.set(new Uint8Array(h), pos);
    pos += h.byteLength;
  }

  const finalHash = await crypto.subtle.digest("SHA-256", concat.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(finalHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
