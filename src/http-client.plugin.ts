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
  // headers에서 Content-Type을 추출하여 Obsidian requestUrl의 contentType 파라미터로 전달.
  // requestUrl은 contentType을 별도 파라미터로 받는 Obsidian 고유 API.
  const headers = { ...req.headers };
  const contentType = headers["Content-Type"];
  delete headers["Content-Type"];

  const resp = await requestUrl({
    url: req.url,
    method: req.method,
    contentType,
    headers,
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
