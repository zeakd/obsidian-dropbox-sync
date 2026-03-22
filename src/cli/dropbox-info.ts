#!/usr/bin/env bun
/**
 * CLI Dropbox 연결 정보 조회.
 *
 * 사용법:
 *   bun src/cli/dropbox-info.ts <vault-path>
 *
 * 출력:
 * - OAuth 토큰 상태 (만료 시각, 유효 여부)
 * - Dropbox 계정 정보 (get_current_account)
 * - 원격 폴더 존재 여부
 */
import * as path from "node:path";
import { loadCliConfig } from "./config";
import { nodeHttpClient } from "../http-client.node";
import { refreshAccessToken } from "../adapters/dropbox-auth";

// ── args ──

const vaultPath = process.argv[2];
if (!vaultPath) {
  console.error("Usage: bun src/cli/dropbox-info.ts <vault-path>");
  process.exit(1);
}

// ── main ──

async function main(): Promise<void> {
  const resolvedVault = path.resolve(vaultPath);
  const config = await loadCliConfig(resolvedVault);

  console.log("=== Dropbox Connection ===");
  console.log(`  appKey: ${config.appKey ? config.appKey.slice(0, 6) + "..." : "(empty)"}`);
  console.log(`  syncName: ${config.syncName || "(root)"}`);
  console.log(`  remotePath: ${config.remotePath || "/"}`);

  // 토큰 상태
  const now = Date.now();
  const expiry = config.tokenExpiry;
  const expired = now > expiry;
  console.log(`\n=== Token ===`);
  console.log(`  accessToken: ${config.accessToken ? "present" : "empty"}`);
  console.log(`  refreshToken: present`);
  console.log(`  expiry: ${new Date(expiry).toISOString()} (${expired ? "EXPIRED" : "valid"})`);

  // 토큰이 만료되었으면 갱신 시도
  let accessToken = config.accessToken;
  if (expired && config.appKey) {
    console.log("  → refreshing token...");
    try {
      const result = await refreshAccessToken(nodeHttpClient, config.appKey, config.refreshToken);
      accessToken = result.accessToken;
      console.log(`  → refreshed, new expiry: ${new Date(result.expiresAt).toISOString()}`);
    } catch (e) {
      console.log(`  → refresh FAILED: ${(e as Error).message}`);
      console.log("  → Obsidian에서 Dropbox 재연결이 필요할 수 있습니다.");
      return;
    }
  }

  // 계정 정보
  console.log("\n=== Account ===");
  try {
    const resp = await nodeHttpClient({
      url: "https://api.dropboxapi.com/2/users/get_current_account",
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: "null",
    });

    if (resp.status === 200) {
      const account = resp.json as {
        name?: { display_name?: string };
        email?: string;
        account_type?: { ".tag"?: string };
      };
      console.log(`  name: ${account.name?.display_name ?? "unknown"}`);
      console.log(`  email: ${account.email ?? "unknown"}`);
      console.log(`  type: ${account.account_type?.[".tag"] ?? "unknown"}`);
    } else {
      console.log(`  API error: ${resp.status} ${resp.text.slice(0, 100)}`);
    }
  } catch (e) {
    console.log(`  network error: ${(e as Error).message}`);
  }

  // 원격 폴더 확인
  if (config.remotePath) {
    console.log("\n=== Remote Folder ===");
    try {
      const resp = await nodeHttpClient({
        url: "https://api.dropboxapi.com/2/files/get_metadata",
        method: "POST",
        contentType: "application/json",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ path: config.remotePath }),
      });

      if (resp.status === 200) {
        const meta = resp.json as { ".tag"?: string; name?: string };
        console.log(`  path: ${config.remotePath}`);
        console.log(`  type: ${meta[".tag"] ?? "unknown"}`);
        console.log(`  status: exists ✓`);
      } else if (resp.status === 409) {
        console.log(`  path: ${config.remotePath}`);
        console.log(`  status: NOT FOUND — 첫 동기화 시 자동 생성됩니다.`);
      } else {
        console.log(`  API error: ${resp.status}`);
      }
    } catch (e) {
      console.log(`  network error: ${(e as Error).message}`);
    }
  }

  // 용량 정보
  console.log("\n=== Space Usage ===");
  try {
    const resp = await nodeHttpClient({
      url: "https://api.dropboxapi.com/2/users/get_space_usage",
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: "null",
    });

    if (resp.status === 200) {
      const usage = resp.json as { used?: number; allocation?: { allocated?: number } };
      const usedGB = ((usage.used ?? 0) / 1e9).toFixed(2);
      const allocGB = ((usage.allocation?.allocated ?? 0) / 1e9).toFixed(2);
      console.log(`  used: ${usedGB} GB / ${allocGB} GB`);
    }
  } catch {
    // 용량 조회 실패는 무시
  }
}

main().catch((e: Error) => {
  console.error(`[dropbox-info] fatal: ${e.message}`);
  process.exit(1);
});
