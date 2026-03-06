import { Notice } from "obsidian";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthUrl,
  exchangeCodeForToken,
} from "../adapters/dropbox-auth";

const REDIRECT_URI = "obsidian://dropbox-sync";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * 데스크톱 PKCE OAuth 플로우.
 *
 * 1. start() → 브라우저에서 Dropbox 인증 페이지 열기
 * 2. handleCallback() → obsidian:// 프로토콜로 돌아온 코드 교환
 */
export class DesktopAuth {
  private pending: { codeVerifier: string; state: string } | null = null;

  constructor(private getAppKey: () => string) {}

  async start(): Promise<void> {
    const appKey = this.getAppKey();
    if (!appKey) {
      new Notice("No App Key configured. Set your App Key in Connection settings.");
      return;
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    this.pending = { codeVerifier, state };

    const url = buildAuthUrl({
      appKey,
      codeChallenge,
      redirectUri: REDIRECT_URI,
      state,
    });

    window.open(url);
  }

  async handleCallback(params: Record<string, string>): Promise<AuthTokens | null> {
    const { code, state } = params;

    if (!this.pending) {
      new Notice("No pending authentication. Please try connecting again.");
      return null;
    }

    if (state !== this.pending.state) {
      new Notice("Authentication failed: state mismatch.");
      this.pending = null;
      return null;
    }

    if (!code) {
      new Notice("Authentication failed: no authorization code received.");
      this.pending = null;
      return null;
    }

    try {
      const appKey = this.getAppKey();
      const tokenInfo = await exchangeCodeForToken(
        appKey,
        code,
        this.pending.codeVerifier,
        REDIRECT_URI,
      );

      this.pending = null;
      return {
        accessToken: tokenInfo.accessToken,
        refreshToken: tokenInfo.refreshToken,
        expiresAt: tokenInfo.expiresAt,
      };
    } catch (e) {
      new Notice(`Connection failed: ${(e as Error).message}`);
      this.pending = null;
      return null;
    }
  }
}
