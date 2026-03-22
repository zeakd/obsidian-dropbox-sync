/**
 * Node.js/Bun fetch 기반 HttpClient 구현.
 *
 * CLI 환경에서 사용한다. CORS 제약 없음.
 */
import type { HttpClient } from "./http-client";

export const nodeHttpClient: HttpClient = async (req) => {
  const headers: Record<string, string> = { ...req.headers };
  if (req.contentType) {
    headers["Content-Type"] = req.contentType;
  }

  const resp = await fetch(req.url, {
    method: req.method,
    headers,
    body: req.body,
  });

  const arrayBuffer = await resp.arrayBuffer();
  const text = new TextDecoder().decode(arrayBuffer);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  // Headers → Record<string, string>
  const respHeaders: Record<string, string> = {};
  resp.headers.forEach((value, key) => {
    respHeaders[key] = value;
  });

  return {
    status: resp.status,
    json,
    text,
    headers: respHeaders,
    arrayBuffer,
  };
};
