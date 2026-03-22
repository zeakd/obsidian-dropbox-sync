#!/usr/bin/env bun
/**
 * CLI 동기화 실행.
 *
 * 사용법:
 *   bun src/cli/sync.ts <vault-path> [--dry-run] [--report]
 *
 * --dry-run: 계획만 출력, 실행하지 않음
 * --report:  사이클 리포트(JSONL)를 stdout에 출력
 *
 * Obsidian 없이 SyncEngine을 실행한다.
 * data.json에서 OAuth 토큰을 읽고, NodeFsAdapter + FileStateStore로 동작한다.
 */
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { loadCliConfig } from "./config";
import { NodeFsAdapter } from "./node-fs-adapter";
import { FileStateStore } from "./file-state-store";
import { DropboxAdapter } from "../adapters/dropbox-adapter";
import { nodeHttpClient } from "../http-client.node";
import { SyncEngine } from "../sync/engine";
import type { SyncPlan } from "../types";

// ── args ──

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

const vaultPath = positional[0];
if (!vaultPath) {
  console.error("Usage: bun src/cli/sync.ts <vault-path> [--dry-run] [--report]");
  process.exit(1);
}

const dryRun = flags.has("--dry-run");
const enableReport = flags.has("--report");

// ── main ──

async function main(): Promise<void> {
  const resolvedVault = path.resolve(vaultPath);
  console.error(`[sync] vault: ${resolvedVault}`);

  // 1. 설정 로드
  const config = await loadCliConfig(resolvedVault);
  console.error(`[sync] syncName: ${config.syncName || "(root)"}`);
  console.error(`[sync] remotePath: ${config.remotePath || "/"}`);

  // 2. 어댑터 구성
  const fsAdapter = new NodeFsAdapter(resolvedVault);
  const stateFile = path.join(resolvedVault, ".obsidian", "plugins", "dropbox-sync", "cli-state.json");
  const store = new FileStateStore(stateFile);

  // 토큰 상태 (mutable — onTokenRefreshed에서 갱신)
  let accessToken = config.accessToken;
  let tokenExpiry = config.tokenExpiry;

  const remote = new DropboxAdapter({
    httpClient: nodeHttpClient,
    appKey: config.appKey,
    remotePath: config.remotePath,
    getAccessToken: () => accessToken,
    getRefreshToken: () => config.refreshToken,
    getTokenExpiry: () => tokenExpiry,
    onTokenRefreshed: (newToken, newExpiry) => {
      accessToken = newToken;
      tokenExpiry = newExpiry;
      console.error(`[sync] token refreshed, expires: ${new Date(newExpiry).toISOString()}`);
    },
  });

  // 3. 엔진 구성
  const engine = new SyncEngine(
    { fs: fsAdapter, remote, store },
    {
      excludePatterns: config.excludePatterns,
      deleteProtection: config.deleteProtection,
      deleteThreshold: config.deleteThreshold,
      conflictStrategy: config.conflictStrategy,
      enableCycleReports: enableReport || dryRun,
      onCycleReport: async (report, cycleId) => {
        if (enableReport) {
          // 리포트를 파일로 저장
          const reportDir = path.join(resolvedVault, ".obsidian", "plugins", "dropbox-sync", "reports");
          await fs.mkdir(reportDir, { recursive: true });
          const reportPath = path.join(reportDir, `${cycleId}.jsonl`);
          await fs.writeFile(reportPath, report);
          console.error(`[sync] report saved: ${reportPath}`);
        }
      },
    },
  );

  // 4. dry-run: 계획만 출력
  if (dryRun) {
    console.error("[sync] dry-run mode — 계획만 생성");

    // engine의 runCycle 대신 직접 계획까지만 실행
    // SyncEngine은 runCycle이 원자적이므로, 직접 adapter를 사용
    const localFiles = await fsAdapter.list();
    const baseEntries = await store.getAllEntries();
    const cursor = await store.getMeta("cursor");

    console.error(`[sync] local files: ${localFiles.length}`);
    console.error(`[sync] base entries: ${baseEntries.length}`);
    console.error(`[sync] cursor: ${cursor ? cursor.slice(0, 20) + "..." : "(none)"}`);

    const changes = await remote.listChanges(cursor ?? undefined);
    console.error(`[sync] remote delta: ${changes.entries.length} entries`);

    const { createPlan } = await import("../sync/planner");
    const plan = createPlan(localFiles, changes.entries, baseEntries);

    printPlan(plan);

    if (enableReport) {
      // dry-run에서도 plan_decision 이벤트 포함 리포트 출력
      const { CycleContext } = await import("../sync/cycle-context");
      const ctx = new CycleContext();
      ctx.emit({ type: "cycle_start", ts: ctx.startTime, cursor: cursor ?? null });
      ctx.emit({ type: "local_scan", ts: Date.now(), fileCount: localFiles.length, duration: 0 });
      ctx.emit({ type: "remote_fetch", ts: Date.now(), deltaCount: changes.entries.length, cursor: changes.cursor, hasMore: changes.hasMore, duration: 0 });

      // 재실행으로 decision 이벤트 기록
      createPlan(localFiles, changes.entries, baseEntries, { ctx });

      ctx.emit({ type: "cycle_end", ts: Date.now(), duration: Date.now() - ctx.startTime, stats: plan.stats as unknown as Record<string, number>, failed: 0, deferred: 0 });

      const reportDir = path.join(resolvedVault, ".obsidian", "plugins", "dropbox-sync", "reports");
      await fs.mkdir(reportDir, { recursive: true });
      const reportPath = path.join(reportDir, `${ctx.cycleId}.jsonl`);
      await fs.writeFile(reportPath, ctx.toJsonl());
      console.error(`[sync] report saved: ${reportPath}`);
    }
    return;
  }

  // 5. 실행
  console.error("[sync] running sync cycle...");
  const { plan, result, deletesSkipped, deferredCount } = await engine.runCycle();

  printPlan(plan);

  console.error("\n--- result ---");
  console.error(`  succeeded: ${result.succeeded.length}`);
  console.error(`  failed:    ${result.failed.length}`);
  if (result.deferred.length > 0) console.error(`  deferred:  ${result.deferred.length}`);
  if (deletesSkipped) console.error(`  deletes skipped (guard): ${deletesSkipped}`);

  if (result.failed.length > 0) {
    console.error("\n--- failures ---");
    for (const f of result.failed) {
      console.error(`  ${f.item.localPath}: ${f.error.message}`);
    }
    process.exit(1);
  }
}

function printPlan(plan: SyncPlan): void {
  console.error("\n--- plan ---");
  console.error(`  upload: ${plan.stats.upload}  download: ${plan.stats.download}`);
  console.error(`  deleteLocal: ${plan.stats.deleteLocal}  deleteRemote: ${plan.stats.deleteRemote}`);
  console.error(`  conflict: ${plan.stats.conflict}  noop: ${plan.stats.noop}`);

  if (plan.items.length > 0) {
    console.error("\n  items:");
    for (const item of plan.items) {
      const reason = "reason" in item.action ? item.action.reason : "";
      console.error(`    ${item.action.type.padEnd(14)} ${item.localPath}${reason ? ` (${reason})` : ""}`);
    }
  }
}

main().catch((e: Error) => {
  console.error(`[sync] fatal: ${e.message}`);
  process.exit(1);
});
