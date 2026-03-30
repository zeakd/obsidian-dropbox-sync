/**
 * Obsidian requestUrl 기반 HttpClient 구현.
 *
 * Electron/모바일의 CORS 우회를 활용한다.
 * non-2xx에서 throw하지 않도록 throw: false를 하드코딩한다.
 */
import { requestUrl } from "obsidian";
import { normalizeHeaders } from "./http-client";
import type { HttpClient } from "./http-client";

export const obsidianHttpClient: HttpClient = async (req) => {
  const resp = await requestUrl({
    url: req.url,
    method: req.method,
    contentType: req.contentType,
    headers: req.headers,
    body: req.body,
    throw: false,
  });

  return {
    status: resp.status,
    json: resp.json,
    text: resp.text,
    headers: normalizeHeaders(resp.headers),
    arrayBuffer: resp.arrayBuffer,
  };
};
