import { describe, test, expect, afterEach } from "bun:test";
import { loadCliConfig } from "@/cli/config";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("loadCliConfig", () => {
  const tmpDirs: string[] = [];

  async function createVault(data: Record<string, unknown>): Promise<string> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cfg-"));
    tmpDirs.push(tmpDir);

    const configDir = path.join(tmpDir, ".obsidian", "plugins", "dropbox-sync");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(
      path.join(configDir, "data.json"),
      JSON.stringify(data),
    );

    return tmpDir;
  }

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  test("유효한 config를 data.json에서 로드한다", async () => {
    const vaultPath = await createVault({
      accessToken: "token_abc",
      refreshToken: "refresh_xyz",
      tokenExpiry: 9999999999,
      appKey: "app_key_123",
      syncName: "my-vault",
      excludePatterns: ["*.tmp"],
      deleteProtection: true,
      deleteThreshold: 10,
      conflictStrategy: "newest",
    });

    const config = await loadCliConfig(vaultPath);
    expect(config.accessToken).toBe("token_abc");
    expect(config.refreshToken).toBe("refresh_xyz");
    expect(config.tokenExpiry).toBe(9999999999);
    expect(config.appKey).toBe("app_key_123");
    expect(config.syncName).toBe("my-vault");
    expect(config.excludePatterns).toEqual(["*.tmp"]);
    expect(config.deleteProtection).toBe(true);
    expect(config.deleteThreshold).toBe(10);
    expect(config.conflictStrategy).toBe("newest");
  });

  test("remotePath는 '/' + syncName으로 계산된다", async () => {
    const vaultPath = await createVault({
      refreshToken: "refresh",
      syncName: "test-vault",
    });

    const config = await loadCliConfig(vaultPath);
    expect(config.remotePath).toBe("/test-vault");
  });

  test("data.json이 없으면 에러를 던진다", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cli-cfg-"));
    tmpDirs.push(tmpDir);

    await expect(loadCliConfig(tmpDir)).rejects.toThrow("Plugin config not found");
  });

  test("refreshToken이 없으면 에러를 던진다", async () => {
    const vaultPath = await createVault({
      accessToken: "token",
      syncName: "vault",
    });

    await expect(loadCliConfig(vaultPath)).rejects.toThrow("refreshToken");
  });

  test("선택적 필드가 없으면 기본값을 사용한다", async () => {
    const vaultPath = await createVault({
      refreshToken: "refresh_only",
    });

    const config = await loadCliConfig(vaultPath);
    expect(config.accessToken).toBe("");
    expect(config.appKey).toBe("");
    expect(config.syncName).toBe("");
    expect(config.remotePath).toBe("");
    expect(config.excludePatterns).toEqual([]);
    expect(config.deleteProtection).toBe(true);
    expect(config.deleteThreshold).toBe(5);
    expect(config.conflictStrategy).toBe("keep_both");
  });
});
