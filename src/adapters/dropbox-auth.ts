import type { HttpClient } from "../http-client";
import type { DropboxTokenResponse } from "./dropbox-types";

const AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";

export interface AuthConfig {
  appKey: string;
}

export interface TokenInfo {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * PKCE code_verifier 생성 (43~128자 크립토 랜덤).
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * code_challenge = SHA256(code_verifier) -> Base64URL.
 */
export async function generateCodeChallenge(
  verifier: string,
): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(hash));
}

/**
 * CSRF 방지용 state 생성 (Base64URL 인코딩된 랜덤 문자열).
 */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Dropbox OAuth 인가 URL 생성.
 * 브라우저에서 이 URL을 열어 사용자가 인증한다.
 */
export function buildAuthUrl(params: {
  appKey: string;
  codeChallenge: string;
  redirectUri?: string;
  state?: string;
}): string {
  const query: Record<string, string> = {
    client_id: params.appKey,
    response_type: "code",
    token_access_type: "offline",
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
  };
  if (params.redirectUri) {
    query.redirect_uri = params.redirectUri;
  }
  if (params.state) {
    query.state = params.state;
  }
  const searchParams = new URLSearchParams(query);
  return `${AUTHORIZE_URL}?${searchParams.toString()}`;
}

/**
 * authorization code -> access_token + refresh_token 교환.
 */
export async function exchangeCodeForToken(
  httpClient: HttpClient,
  appKey: string,
  code: string,
  codeVerifier: string,
  redirectUri?: string,
): Promise<TokenInfo> {
  const params: Record<string, string> = {
    code,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
    client_id: appKey,
  };
  if (redirectUri) {
    params.redirect_uri = redirectUri;
  }

  const body = new URLSearchParams(params);

  const resp = await httpClient({
    url: TOKEN_URL,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: body.toString(),
  });

  const data = resp.json as DropboxTokenResponse;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * refresh_token -> 새 access_token 발급.
 */
export async function refreshAccessToken(
  httpClient: HttpClient,
  appKey: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: appKey,
  });

  const resp = await httpClient({
    url: TOKEN_URL,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: body.toString(),
  });

  const data = resp.json as DropboxTokenResponse;
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
