/**
 * HTTP 클라이언트 추상화.
 *
 * Obsidian의 requestUrl과 Node.js의 fetch를 통일하는 인터페이스.
 * DropboxAdapter, dropbox-auth, LongpollManager 등에서 DI로 주입한다.
 */

export interface HttpRequest {
  url: string;
  method: string;
  /** Content-Type은 headers에 포함한다. 별도 필드 없음. */
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
}

export interface HttpResponse {
  status: number;
  json: unknown;
  text: string;
  /** 응답 헤더. 키는 항상 소문자로 정규화된다. */
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
}

/** 헤더 키를 소문자로 정규화한다. HTTP 스펙상 헤더는 case-insensitive. */
export function normalizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(headers)) {
    out[key.toLowerCase()] = headers[key]!;
  }
  return out;
}

/**
 * HTTP 요청을 수행하는 함수 타입.
 * non-2xx 응답에서 throw하지 않고 status로 반환한다.
 */
export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;
