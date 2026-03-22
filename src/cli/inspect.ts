#!/usr/bin/env bun
/**
 * CLI 동기화 상태 조회.
 *
 * 사용법:
 *   bun src/cli/inspect.ts <vault-path> [--entries] [--local] [--diff]
 *
 * 기본: 메타 정보 (cursor, entry 수) 요약 출력
 * --entries: 모든 sync state entry 출력
 * --local:   로컬 파일 목록 + hash 출력
 * --diff:    로컬과 state의 차이 비교
 */
import * as path from "node:path";
import { NodeFsAdapter } from "./node-fs-adapter";
import { FileStateStore } from "./file-state-store";

// ── args ──

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));

const vaultPath = positional[0];
if (!vaultPath) {
  console.error("Usage: bun src/cli/inspect.ts <vault-path> [--entries] [--local] [--diff]");
  process.exit(1);
}

const showEntries = flags.has("--entries");
const showLocal = flags.has("--local");
const showDiff = flags.has("--diff");

// ── main ──

async function main(): Promise<void> {
  const resolvedVault = path.resolve(vaultPath);
  const stateFile = path.join(resolvedVault, ".obsidian", "plugins", "dropbox-sync", "cli-state.json");
  const store = new FileStateStore(stateFile);

  // 메타 정보
  const cursor = await store.getMeta("cursor");
  const entries = await store.getAllEntries();

  console.log("=== Sync State ===");
  console.log(`  state file: ${stateFile}`);
  console.log(`  entries: ${entries.length}`);
  console.log(`  cursor: ${cursor ? cursor.slice(0, 40) + "..." : "(none)"}`);

  // --entries
  if (showEntries) {
    console.log("\n=== Entries ===");
    const sorted = entries.sort((a, b) => a.pathLower.localeCompare(b.pathLower));
    for (const e of sorted) {
      console.log(`  ${e.localPath}`);
      console.log(`    localHash:  ${e.baseLocalHash?.slice(0, 16) ?? "(null)"}`);
      console.log(`    remoteHash: ${e.baseRemoteHash?.slice(0, 16) ?? "(null)"}`);
      console.log(`    rev: ${e.rev ?? "(null)"}  synced: ${new Date(e.lastSynced).toISOString()}`);
    }
  }

  // --local
  if (showLocal || showDiff) {
    const fsAdapter = new NodeFsAdapter(resolvedVault);
    const localFiles = await fsAdapter.list();

    if (showLocal) {
      console.log(`\n=== Local Files (${localFiles.length}) ===`);
      const sorted = localFiles.sort((a, b) => a.pathLower.localeCompare(b.pathLower));
      for (const f of sorted) {
        console.log(`  ${f.path}  hash=${f.hash.slice(0, 16)}  size=${f.size}`);
      }
    }

    // --diff
    if (showDiff) {
      console.log("\n=== Diff (local vs state) ===");

      const entryMap = new Map(entries.map((e) => [e.pathLower, e]));
      const localMap = new Map(localFiles.map((f) => [f.pathLower, f]));

      const allPaths = new Set([...entryMap.keys(), ...localMap.keys()]);
      let changes = 0;

      const sorted = [...allPaths].sort();
      for (const p of sorted) {
        const local = localMap.get(p);
        const entry = entryMap.get(p);

        if (local && !entry) {
          console.log(`  + ${local.path}  (new, no sync state)`);
          changes++;
        } else if (!local && entry) {
          console.log(`  - ${entry.localPath}  (missing locally, has sync state)`);
          changes++;
        } else if (local && entry) {
          if (local.hash !== entry.baseLocalHash) {
            console.log(`  ~ ${local.path}  (local hash changed: ${entry.baseLocalHash?.slice(0, 12)} → ${local.hash.slice(0, 12)})`);
            changes++;
          }
        }
      }

      if (changes === 0) {
        console.log("  (no differences)");
      } else {
        console.log(`\n  ${changes} change(s) detected`);
      }
    }
  }
}

main().catch((e: Error) => {
  console.error(`[inspect] fatal: ${e.message}`);
  process.exit(1);
});
