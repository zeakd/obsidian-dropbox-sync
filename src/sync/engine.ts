import type { FileSystem, RemoteStorage, SyncStateStore } from "../adapters/interfaces";
import type { RemoteEntry, SyncPlan, SyncResult } from "../types";
import { createPlan } from "./planner";
import { executePlan } from "./executor";

export interface SyncEngineDeps {
  fs: FileSystem;
  remote: RemoteStorage;
  store: SyncStateStore;
}

export interface CycleResult {
  plan: SyncPlan;
  result: SyncResult;
}

/**
 * 동기화 엔진.
 * runCycle()로 한 번의 동기화 사이클을 실행한다.
 *
 * 1. 로컬 파일 수집 + hash 계산
 * 2. 원격 변경 수집 (cursor 기반 delta)
 * 3. 이전 상태(base) 로드
 * 4. base + delta 병합 → 전체 원격 상태 구성
 * 5. Planner로 동기화 계획 생성
 * 6. Executor로 계획 실행
 * 7. 모두 성공 시에만 cursor 갱신
 */
export class SyncEngine {
  constructor(private deps: SyncEngineDeps) {}

  async runCycle(): Promise<CycleResult> {
    const { fs, remote, store } = this.deps;

    // 1. 로컬 파일 수집
    const localFiles = await fs.list();

    // 2. 원격 변경 수집 (delta)
    const cursor = await store.getMeta("cursor");
    const changes = await remote.listChanges(cursor ?? undefined);

    let deltaEntries = [...changes.entries];
    let latestCursor = changes.cursor;
    let hasMore = changes.hasMore;

    while (hasMore) {
      const more = await remote.listChanges(latestCursor);
      deltaEntries = deltaEntries.concat(more.entries);
      latestCursor = more.cursor;
      hasMore = more.hasMore;
    }

    // 3. 이전 상태 로드
    const baseEntries = await store.getAllEntries();

    // 4. base + delta 병합 → 전체 원격 상태 구성
    //    base에서 마지막으로 알려진 원격 상태를 복원하고,
    //    delta의 변경(추가/수정/삭제)을 덮어씀
    const fullRemoteMap = new Map<string, RemoteEntry>();

    for (const base of baseEntries) {
      if (base.baseRemoteHash && base.rev) {
        fullRemoteMap.set(base.pathLower, {
          pathLower: base.pathLower,
          pathDisplay: base.localPath,
          hash: base.baseRemoteHash,
          serverModified: base.lastSynced,
          rev: base.rev,
          size: 0,
          deleted: false,
        });
      }
    }

    for (const entry of deltaEntries) {
      if (entry.deleted) {
        fullRemoteMap.delete(entry.pathLower);
      } else {
        fullRemoteMap.set(entry.pathLower, entry);
      }
    }

    const fullRemoteEntries = Array.from(fullRemoteMap.values());

    // 5. 동기화 계획 생성
    const plan = createPlan(localFiles, fullRemoteEntries, baseEntries);

    // 6. 계획 실행
    const result = await executePlan(plan, { fs, remote, store });

    // 7. 모두 성공 시에만 cursor 갱신
    //    실패가 있으면 cursor를 갱신하지 않아 다음 cycle에서 동일 delta를 재수신
    if (result.failed.length === 0) {
      await store.setMeta("cursor", latestCursor);
    }

    return { plan, result };
  }
}
