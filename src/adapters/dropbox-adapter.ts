import { requestUrl } from "obsidian";
import type { RemoteStorage } from "./interfaces";
import type {
  RemoteEntry,
  ListChangesResult,
  DownloadResult,
} from "../types";
import { RevConflictError } from "../types";
import type {
  DropboxFileMetadata,
  DropboxMetadata,
  DropboxListFolderResult,
  DropboxErrorResponse,
} from "./dropbox-types";
import { refreshAccessToken } from "./dropbox-auth";

const API_BASE = "https://api.dropboxapi.com/2";
const CONTENT_BASE = "https://content.dropboxapi.com/2";

/** HTTP 헤더용 ASCII-safe JSON. 비ASCII 문자를 \uXXXX 이스케이프. */
function headerSafeJson(obj: object): string {
  return JSON.stringify(obj).replace(/[\u0080-\uffff]/g, (c) =>
    "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );
}

export interface DropboxAdapterConfig {
  appKey: string;
  remotePath: string;
  getAccessToken: () => string;
  getRefreshToken: () => string;
  getTokenExpiry: () => number;
  onTokenRefreshed: (accessToken: string, expiresAt: number) => void;
}

/**
 * Dropbox API v2 직접 호출 어댑터.
 * requestUrl 기반 (CORS 우회, 데스크톱+모바일).
 */
export class DropboxAdapter implements RemoteStorage {
  constructor(private config: DropboxAdapterConfig) {}

  async listChanges(cursor?: string): Promise<ListChangesResult> {
    let result: DropboxListFolderResult;

    try {
      if (cursor) {
        result = await this.rpcCall<DropboxListFolderResult>(
          "/files/list_folder/continue",
          { cursor },
        );
      } else {
        result = await this.rpcCall<DropboxListFolderResult>(
          "/files/list_folder",
          {
            path: this.config.remotePath || "",
            recursive: true,
            include_deleted: true,
            limit: 2000,
          },
        );
      }
    } catch (e) {
      // 폴더가 아직 없으면 빈 결과 반환 (첫 동기화 시)
      if (e instanceof Error && e.message.includes("path/not_found")) {
        return { entries: [], cursor: "", hasMore: false };
      }
      throw e;
    }

    const entries = result.entries
      .filter((e): e is DropboxFileMetadata | (DropboxMetadata & { ".tag": "deleted" }) =>
        e[".tag"] === "file" || e[".tag"] === "deleted",
      )
      .map((e) => this.toRemoteEntry(e));

    return {
      entries,
      cursor: result.cursor,
      hasMore: result.has_more,
    };
  }

  async download(path: string): Promise<DownloadResult> {
    const maxRetries = 3;
    const apiArg = headerSafeJson({ path: this.toRemotePath(path) });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.ensureValidToken();

      const resp = await requestUrl({
        url: `${CONTENT_BASE}/files/download`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.getAccessToken()}`,
          "Dropbox-API-Arg": apiArg,
        },
        throw: false,
      });

      if (resp.status === 429) {
        if (attempt < maxRetries) {
          const errBody = resp.json as DropboxErrorResponse;
          const retryAfter = errBody.error?.retry_after ?? 1;
          await this.sleep(retryAfter * 1000);
          continue;
        }
        throw this.parseError(resp.status, resp.text);
      }

      if (resp.status !== 200) {
        throw this.parseError(resp.status, resp.text);
      }

      const metadata = JSON.parse(
        resp.headers["dropbox-api-result"] ?? "{}",
      ) as DropboxFileMetadata;

      return {
        data: new Uint8Array(resp.arrayBuffer),
        metadata: this.fileMetadataToEntry(metadata),
      };
    }

    throw new Error("download failed after retries");
  }

  async upload(
    path: string,
    data: Uint8Array,
    rev?: string,
  ): Promise<RemoteEntry> {
    const maxRetries = 3;
    const mode = rev
      ? { ".tag": "update" as const, update: rev }
      : { ".tag": "overwrite" as const };

    const apiArg = headerSafeJson({
      path: this.toRemotePath(path),
      mode,
      autorename: false,
      mute: false,
      strict_conflict: true,
    });

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.ensureValidToken();

      const resp = await requestUrl({
        url: `${CONTENT_BASE}/files/upload`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.getAccessToken()}`,
          "Dropbox-API-Arg": apiArg,
          "Content-Type": "application/octet-stream",
        },
        body: data.buffer as ArrayBuffer,
        throw: false,
      });

      if (resp.status === 429) {
        if (attempt < maxRetries) {
          const errBody = resp.json as DropboxErrorResponse;
          const retryAfter = errBody.error?.retry_after ?? 1;
          await this.sleep(retryAfter * 1000);
          continue;
        }
        throw this.parseError(resp.status, resp.text);
      }

      if (resp.status === 409) {
        const errBody = resp.json as DropboxErrorResponse;
        if (errBody.error_summary?.includes("conflict")) {
          throw new RevConflictError(
            `Rev conflict on upload: ${path}`,
            rev ?? "",
          );
        }
      }

      if (resp.status !== 200) {
        throw this.parseError(resp.status, resp.text);
      }

      const metadata = resp.json as DropboxFileMetadata;
      return this.fileMetadataToEntry(metadata);
    }

    throw new Error("upload failed after retries");
  }

  async delete(path: string): Promise<void> {
    await this.rpcCall("/files/delete_v2", {
      path: this.toRemotePath(path),
    });
  }

  // ── private ──

  private async rpcCall<T>(endpoint: string, body: object): Promise<T> {
    const maxRetries = 3;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await this.ensureValidToken();

      const resp = await requestUrl({
        url: `${API_BASE}${endpoint}`,
        method: "POST",
        contentType: "application/json",
        headers: {
          Authorization: `Bearer ${this.config.getAccessToken()}`,
        },
        body: JSON.stringify(body),
        throw: false,
      });

      if (resp.status === 429) {
        const errBody = resp.json as DropboxErrorResponse;
        const retryAfter = errBody.error?.retry_after ?? 1;
        if (attempt < maxRetries) {
          await this.sleep(retryAfter * 1000);
          continue;
        }
        throw new DropboxRateLimitError(
          `Rate limited: ${endpoint}`,
          retryAfter,
        );
      }

      if (resp.status === 409) {
        const errBody = resp.json as DropboxErrorResponse;
        if (errBody.error_summary?.includes("reset")) {
          throw new DropboxCursorResetError("Cursor reset required");
        }
        throw this.parseError(resp.status, resp.text);
      }

      if (resp.status !== 200) {
        throw this.parseError(resp.status, resp.text);
      }

      return resp.json as T;
    }

    // unreachable, but TypeScript needs it
    throw new Error(`rpcCall failed after ${maxRetries} retries`);
  }

  private async ensureValidToken(): Promise<void> {
    const expiry = this.config.getTokenExpiry();
    // 5분 전에 미리 갱신
    if (Date.now() > expiry - 5 * 60 * 1000) {
      const result = await refreshAccessToken(
        this.config.appKey,
        this.config.getRefreshToken(),
      );
      this.config.onTokenRefreshed(result.accessToken, result.expiresAt);
    }
  }

  private toRemotePath(localPath: string): string {
    const base = this.config.remotePath || "";
    if (base) {
      return `${base}/${localPath}`;
    }
    return `/${localPath}`;
  }

  /**
   * Dropbox 경로 → vault 상대 경로로 변환.
   * remotePath="/vault" → "/vault/file.md" → "file.md"
   * remotePath="" → "/file.md" → "file.md"
   */
  private stripRemotePrefix(dropboxPath: string): string {
    const base = this.config.remotePath || "";
    let rel = dropboxPath;
    if (base && rel.toLowerCase().startsWith(base.toLowerCase())) {
      rel = rel.slice(base.length);
    }
    // 선행 "/" 제거
    if (rel.startsWith("/")) {
      rel = rel.slice(1);
    }
    return rel;
  }

  private toRemoteEntry(metadata: DropboxMetadata): RemoteEntry {
    if (metadata[".tag"] === "file") {
      return this.fileMetadataToEntry(metadata);
    }
    // deleted
    const stripped = this.stripRemotePrefix(metadata.path_display);
    return {
      pathLower: stripped.toLowerCase(),
      pathDisplay: stripped,
      hash: null,
      serverModified: 0,
      rev: "",
      size: 0,
      deleted: true,
    };
  }

  private fileMetadataToEntry(metadata: DropboxFileMetadata): RemoteEntry {
    const stripped = this.stripRemotePrefix(metadata.path_display);
    return {
      pathLower: stripped.toLowerCase(),
      pathDisplay: stripped,
      hash: metadata.content_hash ?? null,
      serverModified: new Date(metadata.server_modified).getTime(),
      rev: metadata.rev,
      size: metadata.size,
      deleted: false,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseError(status: number, text: string): Error {
    if (status === 401) {
      return new DropboxAuthError(`Token expired or revoked: ${text.slice(0, 200)}`);
    }
    return new Error(`Dropbox API error ${status}: ${text.slice(0, 200)}`);
  }
}

export class DropboxRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfter: number,
  ) {
    super(message);
    this.name = "DropboxRateLimitError";
  }
}

export class DropboxCursorResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DropboxCursorResetError";
  }
}

/** 401 토큰 만료/revoke 에러 */
export class DropboxAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DropboxAuthError";
  }
}
