import { describe, it, expect } from "bun:test";
import {
  buildAuthUrl,
  generateState,
  generateCodeVerifier,
} from "../src/adapters/dropbox-auth";

describe("buildAuthUrl", () => {
  const base = {
    appKey: "test-key",
    codeChallenge: "test-challenge",
  };

  it("기본 파라미터로 인가 URL 생성", () => {
    const url = buildAuthUrl(base);
    const parsed = new URL(url);

    expect(parsed.origin + parsed.pathname).toBe(
      "https://www.dropbox.com/oauth2/authorize",
    );
    expect(parsed.searchParams.get("client_id")).toBe("test-key");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge")).toBe("test-challenge");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("token_access_type")).toBe("offline");
  });

  it("redirect_uri 미지정 시 파라미터에 포함되지 않음", () => {
    const url = buildAuthUrl(base);
    const parsed = new URL(url);
    expect(parsed.searchParams.has("redirect_uri")).toBe(false);
  });

  it("redirect_uri 지정 시 파라미터에 포함됨", () => {
    const url = buildAuthUrl({ ...base, redirectUri: "obsidian://cb" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe("obsidian://cb");
  });

  it("state 미지정 시 파라미터에 포함되지 않음", () => {
    const url = buildAuthUrl(base);
    const parsed = new URL(url);
    expect(parsed.searchParams.has("state")).toBe(false);
  });

  it("state 지정 시 파라미터에 포함됨", () => {
    const url = buildAuthUrl({ ...base, state: "abc123" });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("state")).toBe("abc123");
  });

  it("redirect_uri + state 동시 지정", () => {
    const url = buildAuthUrl({
      ...base,
      redirectUri: "obsidian://dropbox-auth-cb",
      state: "xyz",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "obsidian://dropbox-auth-cb",
    );
    expect(parsed.searchParams.get("state")).toBe("xyz");
  });
});

describe("generateState", () => {
  it("Base64URL 형식 문자열 반환", () => {
    const state = generateState();
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(state.length).toBeGreaterThan(0);
  });

  it("매 호출마다 다른 값 생성", () => {
    const states = new Set(Array.from({ length: 20 }, () => generateState()));
    expect(states.size).toBe(20);
  });
});

describe("generateCodeVerifier", () => {
  it("Base64URL 형식 문자열 반환", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it("매 호출마다 다른 값 생성", () => {
    const verifiers = new Set(
      Array.from({ length: 20 }, () => generateCodeVerifier()),
    );
    expect(verifiers.size).toBe(20);
  });
});
