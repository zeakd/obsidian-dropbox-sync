declare const __DROPBOX_APP_KEY__: string;

export const DEFAULT_APP_KEY: string =
  typeof __DROPBOX_APP_KEY__ !== "undefined" ? __DROPBOX_APP_KEY__ : "";

export interface PluginSettings {
  appKey: string;
  useCustomAppKey: boolean;
  refreshToken: string;
  accessToken: string;
  tokenExpiry: number;
  syncInterval: number;
  syncEnabled: boolean;
  conflictStrategy: "keep_both" | "manual" | "newest";
  deleteProtection: boolean;
  deleteThreshold: number;
  syncName: string;
  excludePatterns: string[];
  deviceId: string;
  syncOnCreateDeleteRename: boolean;
  onboardingDone: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  appKey: "",
  useCustomAppKey: false,
  refreshToken: "",
  accessToken: "",
  tokenExpiry: 0,
  syncInterval: 60,
  syncEnabled: false,
  conflictStrategy: "keep_both",
  deleteProtection: true,
  deleteThreshold: 5,
  syncName: "",
  excludePatterns: [".obsidian/workspace*"],
  deviceId: "",
  syncOnCreateDeleteRename: false,
  onboardingDone: false,
};

export function generateDeviceId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 4; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

/**
 * 유효한 App Key 결정: custom key > 빌트인 key > 기존 settings (하위 호환).
 */
/** 허용: 영문, 숫자, 하이픈, 언더스코어. 1~100자. */
const VALID_SYNC_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

export function isValidSyncName(name: string): boolean {
  return VALID_SYNC_NAME.test(name);
}

/** @deprecated 유효성 검사(isValidSyncName)를 대신 사용 */
export function sanitizeSyncName(raw: string): string {
  return raw.replace(/[/\\:*?"<>|]/g, "").replace(/^[\s.]+|[\s.]+$/g, "").slice(0, 100);
}

export function getEffectiveRemotePath(settings: PluginSettings): string {
  return "/" + settings.syncName;
}

export function getEffectiveAppKey(settings: PluginSettings): string {
  if (settings.useCustomAppKey && settings.appKey) {
    return settings.appKey;
  }
  return DEFAULT_APP_KEY || settings.appKey;
}
