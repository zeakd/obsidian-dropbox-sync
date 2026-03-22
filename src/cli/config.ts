import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ConflictStrategy } from "../types";

export interface CliConfig {
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  appKey: string;
  /** Dropbox 원격 경로 ("/" + syncName) */
  remotePath: string;
  syncName: string;
  excludePatterns: string[];
  deleteProtection: boolean;
  deleteThreshold: number;
  conflictStrategy: ConflictStrategy;
}

/**
 * Obsidian 플러그인의 data.json에서 설정을 읽는다.
 *
 * 경로: {vaultPath}/.obsidian/plugins/dropbox-sync/data.json
 * 이 파일에는 OAuth 토큰과 동기화 설정이 저장돼 있다.
 *
 * remotePath는 data.json의 syncName에서 계산한다 ("/" + syncName).
 * settings.ts의 getEffectiveRemotePath()와 동일한 로직.
 */
export async function loadCliConfig(vaultPath: string): Promise<CliConfig> {
  const configPath = path.join(
    vaultPath,
    ".obsidian",
    "plugins",
    "dropbox-sync",
    "data.json",
  );

  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Plugin config not found at ${configPath}\n` +
          `먼저 Obsidian에서 Dropbox 연결을 완료하세요.`,
      );
    }
    throw e;
  }

  const data = JSON.parse(raw) as Record<string, unknown>;

  const refreshToken = data.refreshToken as string | undefined;

  if (!refreshToken) {
    throw new Error(
      "data.json에 refreshToken이 없습니다.\n" +
        "Obsidian에서 Dropbox 재연결이 필요합니다.",
    );
  }

  // appKey: useCustomAppKey면 appKey, 아니면 빌트인 (CLI에선 항상 data.json의 값 사용)
  const useCustom = data.useCustomAppKey as boolean | undefined;
  const appKey = useCustom
    ? ((data.appKey as string) ?? "")
    : ((data.appKey as string) ?? "");

  const syncName = (data.syncName as string) ?? "";

  return {
    accessToken: (data.accessToken as string) ?? "",
    refreshToken,
    tokenExpiry: (data.tokenExpiry as number) ?? 0,
    appKey,
    syncName,
    remotePath: syncName ? `/${syncName}` : "",
    excludePatterns: (data.excludePatterns as string[]) ?? [],
    deleteProtection: (data.deleteProtection as boolean) ?? true,
    deleteThreshold: (data.deleteThreshold as number) ?? 5,
    conflictStrategy: (data.conflictStrategy as ConflictStrategy) ?? "keep_both",
  };
}
