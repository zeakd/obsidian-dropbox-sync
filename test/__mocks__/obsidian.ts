// Minimal obsidian mock for unit tests
export function requestUrl(): never {
  throw new Error("requestUrl is not available in tests");
}

export class Notice {
  constructor(_message: string) {}
}

export class Plugin {}
export class PluginSettingTab {}
export class Setting {}

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
  isIosApp: false,
};
