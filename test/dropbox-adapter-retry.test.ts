import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DropboxAdapter, DropboxRateLimitError } from "@/adapters/dropbox-adapter";

// requestUrl mock
const requestUrlMock = mock();
mock.module("obsidian", () => ({
  requestUrl: (...args: unknown[]) => requestUrlMock(...args),
  Platform: { isDesktop: true, isMobile: false },
}));

function createAdapter(): DropboxAdapter {
  return new DropboxAdapter({
    appKey: "test-key",
    remotePath: "",
    getAccessToken: () => "test-token",
    getRefreshToken: () => "test-refresh",
    getTokenExpiry: () => Date.now() + 3600_000,
    onTokenRefreshed: () => {},
  });
}

describe("DropboxAdapter retry on 429", () => {
  beforeEach(() => {
    requestUrlMock.mockReset();
  });

  test("rpcCall: 429 한 번 → retry 후 성공", async () => {
    const adapter = createAdapter();

    // 첫 호출: 429
    requestUrlMock.mockResolvedValueOnce({
      status: 429,
      json: { error: { retry_after: 0 } },
      text: "rate limited",
    });

    // 두 번째 호출: 성공
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      json: {
        entries: [],
        cursor: "cursor_1",
        has_more: false,
      },
      text: "{}",
    });

    const result = await adapter.listChanges();
    expect(result.entries).toEqual([]);
    expect(result.cursor).toBe("cursor_1");
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
  });

  test("rpcCall: 429 연속 4번 (max 3 retry 초과) → DropboxRateLimitError", async () => {
    const adapter = createAdapter();

    // 4번 연속 429
    for (let i = 0; i < 4; i++) {
      requestUrlMock.mockResolvedValueOnce({
        status: 429,
        json: { error: { retry_after: 0 } },
        text: "rate limited",
      });
    }

    await expect(adapter.listChanges()).rejects.toThrow(DropboxRateLimitError);
    expect(requestUrlMock).toHaveBeenCalledTimes(4);
  });

  test("download: 429 → retry 후 성공", async () => {
    const adapter = createAdapter();

    // 첫 호출: 429
    requestUrlMock.mockResolvedValueOnce({
      status: 429,
      json: { error: { retry_after: 0 } },
      text: "rate limited",
    });

    // 두 번째 호출: 성공
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      arrayBuffer: new ArrayBuffer(5),
      headers: {
        "dropbox-api-result": JSON.stringify({
          path_display: "/test.md",
          content_hash: "abc123",
          server_modified: "2024-01-01T00:00:00Z",
          rev: "rev_1",
          size: 5,
        }),
      },
      text: "",
    });

    const result = await adapter.download("test.md");
    expect(result.metadata.rev).toBe("rev_1");
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
  });

  test("upload: 429 → retry 후 성공", async () => {
    const adapter = createAdapter();
    const data = new Uint8Array([1, 2, 3]);

    // 첫 호출: 429
    requestUrlMock.mockResolvedValueOnce({
      status: 429,
      json: { error: { retry_after: 0 } },
      text: "rate limited",
    });

    // 두 번째 호출: 성공
    requestUrlMock.mockResolvedValueOnce({
      status: 200,
      json: {
        path_display: "/test.md",
        content_hash: "abc123",
        server_modified: "2024-01-01T00:00:00Z",
        rev: "rev_2",
        size: 3,
      },
      text: "",
    });

    const result = await adapter.upload("test.md", data);
    expect(result.rev).toBe("rev_2");
    expect(requestUrlMock).toHaveBeenCalledTimes(2);
  });

  test("rpcCall: 409 reset → DropboxCursorResetError (retry 안 함)", async () => {
    const adapter = createAdapter();
    const { DropboxCursorResetError } = await import("@/adapters/dropbox-adapter");

    requestUrlMock.mockResolvedValueOnce({
      status: 409,
      json: { error_summary: "reset/.." },
      text: "cursor reset",
    });

    await expect(adapter.listChanges("old_cursor")).rejects.toThrow(DropboxCursorResetError);
    expect(requestUrlMock).toHaveBeenCalledTimes(1);
  });
});
