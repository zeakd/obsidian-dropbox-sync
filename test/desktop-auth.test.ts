import { describe, test, expect, beforeEach, mock } from "bun:test";
import { DesktopAuth, type AuthTokens } from "@/auth/desktop-auth";

// ── mock: obsidian ──

const mockNotice = mock(() => {});
mock.module("obsidian", () => ({
  Notice: class {
    constructor(msg: string) { mockNotice(msg); }
  },
}));

// ── mock: dropbox-auth ──

let mockExchangeResult: { accessToken: string; refreshToken: string; expiresAt: number };
let mockExchangeThrow: Error | null = null;
const mockGenerateCodeVerifier = mock(() => "test_verifier_123");
const mockGenerateCodeChallenge = mock(async () => "test_challenge_456");
const mockGenerateState = mock(() => "test_state_789");
const mockBuildAuthUrl = mock(() => "https://dropbox.com/oauth2/authorize?test=1");
const mockExchangeCodeForToken = mock(async () => {
  if (mockExchangeThrow) throw mockExchangeThrow;
  return mockExchangeResult;
});

mock.module("../src/adapters/dropbox-auth", () => ({
  generateCodeVerifier: mockGenerateCodeVerifier,
  generateCodeChallenge: mockGenerateCodeChallenge,
  generateState: mockGenerateState,
  buildAuthUrl: mockBuildAuthUrl,
  exchangeCodeForToken: mockExchangeCodeForToken,
}));

// ── mock: window.open ──

const mockWindowOpen = mock(() => {});
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).open = mockWindowOpen;
} else {
  (globalThis as unknown as Record<string, unknown>).window = { open: mockWindowOpen };
}

describe("DesktopAuth", () => {
  let auth: DesktopAuth;

  beforeEach(() => {
    auth = new DesktopAuth(() => "test_app_key");
    mockNotice.mockClear();
    mockWindowOpen.mockClear();
    mockExchangeThrow = null;
    mockExchangeResult = {
      accessToken: "access_token_123",
      refreshToken: "refresh_token_456",
      expiresAt: Date.now() + 3600000,
    };
  });

  // ── start ──

  test("start: 브라우저에서 인증 URL 열기", async () => {
    await auth.start();

    expect(mockGenerateCodeVerifier).toHaveBeenCalled();
    expect(mockGenerateCodeChallenge).toHaveBeenCalled();
    expect(mockGenerateState).toHaveBeenCalled();
    expect(mockBuildAuthUrl).toHaveBeenCalled();
    expect(mockWindowOpen).toHaveBeenCalled();
  });

  test("start: appKey 없으면 Notice 표시", async () => {
    auth = new DesktopAuth(() => "");
    await auth.start();

    expect(mockNotice).toHaveBeenCalledTimes(1);
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

  // ── handleCallback ──

  test("handleCallback: 정상 플로우 → AuthTokens 반환", async () => {
    await auth.start();

    const result = await auth.handleCallback({
      code: "auth_code_abc",
      state: "test_state_789",
    });

    expect(result).not.toBeNull();
    expect(result!.accessToken).toBe("access_token_123");
    expect(result!.refreshToken).toBe("refresh_token_456");
  });

  test("handleCallback: pending 없으면 Notice + null", async () => {
    // start() 안 하고 바로 callback
    const result = await auth.handleCallback({
      code: "auth_code_abc",
      state: "some_state",
    });

    expect(result).toBeNull();
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });

  test("handleCallback: state 불일치 → Notice + null", async () => {
    await auth.start();
    mockNotice.mockClear();

    const result = await auth.handleCallback({
      code: "auth_code_abc",
      state: "wrong_state",
    });

    expect(result).toBeNull();
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });

  test("handleCallback: code 없으면 → Notice + null", async () => {
    await auth.start();
    mockNotice.mockClear();

    const result = await auth.handleCallback({
      code: "",
      state: "test_state_789",
    });

    expect(result).toBeNull();
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });

  test("handleCallback: token 교환 실패 → Notice + null", async () => {
    mockExchangeThrow = new Error("network error");

    await auth.start();
    mockNotice.mockClear();

    const result = await auth.handleCallback({
      code: "auth_code_abc",
      state: "test_state_789",
    });

    expect(result).toBeNull();
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });

  test("handleCallback: 성공 후 pending 클리어 (두 번째 호출 실패)", async () => {
    await auth.start();

    const first = await auth.handleCallback({
      code: "auth_code_abc",
      state: "test_state_789",
    });
    expect(first).not.toBeNull();

    mockNotice.mockClear();
    const second = await auth.handleCallback({
      code: "auth_code_abc",
      state: "test_state_789",
    });
    expect(second).toBeNull();
    expect(mockNotice).toHaveBeenCalledTimes(1);
  });
});
