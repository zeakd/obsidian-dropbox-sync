/**
 * HTTP 클라이언트 추상화.
 *
 * Obsidian의 requestUrl과 Node.js의 fetch를 통일하는 인터페이스.
 * DropboxAdapter, dropbox-auth, LongpollManager 등에서 DI로 주입한다.
 */

export interface HttpRequest {
  url: string;
  method: string;
  contentType?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer;
}

export interface HttpResponse {
  status: number;
  json: unknown;
  text: string;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
}

/**
 * HTTP 요청을 수행하는 함수 타입.
 * non-2xx 응답에서 throw하지 않고 status로 반환한다.
 */
export type HttpClient = (req: HttpRequest) => Promise<HttpResponse>;
