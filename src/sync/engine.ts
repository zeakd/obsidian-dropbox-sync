import type { FileSystem, RemoteStorage, SyncStateStore } from "../adapters/interfaces";
import type { RemoteEntry, SyncPlan, SyncResult } from "../types";
import { createPlan } from "./planner";
import type { ConflictStrategy, ConflictResolver, DeleteGuardResult } from "../types";
import { executePlan, type ExecutorConfig } from "./executor";
import { checkDeleteGuard } from "./guards";
import { DropboxCursorResetError } from "../adapters/dropbox-adapter";
import { isExcluded } from "../exclude";

/** conflict 파일 판별 (.conflict-YYYY-MM-DDTHHMM 패턴) */
export function isConflictFile(path: string): boolean {
  return /\.conflict-\d{4}-\d{2}-\d{2}t\d{4}/i.test(path);
}

export interface SyncEngineDeps {
  fs: FileSystem;
  remote: RemoteStorage;
  store: SyncStateStore;
}

export interface SyncEngineOptions {
  conflictStrategy?: ConflictStrategy;
  conflictResolver?: ConflictResolver;
  deleteProtection?: boolean;
  deleteThreshold?: number;
  /** 대량 삭제 시 사용자 확인 콜백. true면 삭제 실행, false면 스킵 */
  onDeleteGuardTriggered?: (guard: DeleteGuardResult) => Promise<boolean>;
  /** 파일이 현재 편집 중인지 확인. true면 download/conflict를 건너뛴다 */
  isFileActive?: (path: string) => boolean;
  /** 파일 제외 패턴 */
  excludePatterns?: string[];
  /** 병렬 실행 동시성. 기본값 1 (순차) */
  concurrency?: number;
  /** 항목 실행 완료 시마다 호출. (완료 수, 전체 수) */
  onProgress?: (completed: number, total: number) => void;
  /** conflict 직렬 실행 전 호출. conflict 총 수 전달. */
  onConflictCount?: (count: number) => void;
}

export interface CycleResult {
  plan: SyncPlan;
  result: SyncResult;
  /** 삭제 가드에 의해 스킵된 항목 수 */
  deletesSkipped?: number;
  /** 활성 파일 보호로 건너뛴 항목 수 */
  deferredCount?: number;
}

/**
 * 동기화 엔진.
 * runCycle()로 한 번의 동기화 사이클을 실행한다.
 *
 * 1. 로컬 파일 수집 + hash 계산
 * 2. 원격 변경 수집 (cursor 기반 delta)
 * 3. 이전 상태(base) 로드
 * 4. base + delta 병합 → 전체 원격 상태 구성
 * 5. Planner로 동기화 계획 생성 (삭제 의도 전달)
 * 6. 삭제 가드 적용
 * 7. Executor로 계획 실행
 * 8. 모두 성공 시에만 cursor 갱신
 */
export class SyncEngine {
  private deletedPaths = new Set<string>();

  constructor(
    private deps: SyncEngineDeps,
    private options: SyncEngineOptions = {},
  ) {}

  /** 로컬 삭제 이벤트 기록 */
  trackDelete(pathLower: string): void {
    this.deletedPaths.add(pathLower);
  }

  /** 저장된 삭제 로그에서 복원 */
  restoreDeleteLog(paths: string[]): void {
    for (const p of paths) {
      this.deletedPaths.add(p);
    }
  }

  /** 현재 삭제 로그 반환 (영속화용) */
  getDeleteLog(): string[] {
    return [...this.deletedPaths];
  }

  /** 미소비 삭제 항목 존재 여부 */
  hasPendingDeletes(): boolean {
    return this.deletedPaths.size > 0;
  }

  async runCycle(signal?: AbortSignal): Promise<CycleResult> {
    const { fs, remote, store } = this.deps;
    const sig = signal;

    // 1. 로컬 파일 수집 (conflict 파일 제외 — 로컬 전용 산물)
    sig?.throwIfAborted();
    const localFiles = (await fs.list()).filter((f) => !isConflictFile(f.path));

    // 2. 원격 변경 수집 (delta, cursor 만료 시 전체 재스캔)
    let cursor = await store.getMeta("cursor");
    let changes;
    try {
      changes = await remote.listChanges(cursor ?? undefined);
    } catch (e) {
      if (e instanceof DropboxCursorResetError && cursor) {
        await store.setMeta("cursor", "");
        cursor = null;
        changes = await remote.listChanges();
      } else {
        throw e;
      }
    }

    let deltaEntries = [...changes.entries];
    let latestCursor = changes.cursor;
    let hasMore = changes.hasMore;

    while (hasMore) {
      sig?.throwIfAborted();
      const more = await remote.listChanges(latestCursor);
      deltaEntries = deltaEntries.concat(more.entries);
      latestCursor = more.cursor;
      hasMore = more.hasMore;
    }

    // 3. 이전 상태 로드
    sig?.throwIfAborted();
    const baseEntries = await store.getAllEntries();

    // 4. base + delta 병합 → 전체 원격 상태 구성
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

    // 제외 패턴 + conflict 파일 제외
    const excludePatterns = this.options.excludePatterns ?? [];
    for (const key of fullRemoteMap.keys()) {
      if (isExcluded(key, excludePatterns.map((p) => p.toLowerCase())) || isConflictFile(key)) {
        fullRemoteMap.delete(key);
      }
    }

    const fullRemoteEntries = Array.from(fullRemoteMap.values());

    // 5. 동기화 계획 생성 (삭제 의도 전달)
    sig?.throwIfAborted();
    const plan = createPlan(localFiles, fullRemoteEntries, baseEntries, {
      localDeletedPaths: this.deletedPaths,
    });

    // 6. 삭제 가드 적용
    const guard = checkDeleteGuard(
      plan,
      this.options.deleteThreshold ?? 5,
      this.options.deleteProtection ?? false,
    );

    let planToExecute = plan;
    let deletesSkipped = 0;

    if (!guard.passed) {
      if (this.options.onDeleteGuardTriggered) {
        const approved = await this.options.onDeleteGuardTriggered(guard);
        if (!approved) {
          planToExecute = guard.filteredPlan;
          deletesSkipped = guard.deleteItems.length;
        }
        // approved → 원본 plan 그대로 실행
      } else {
        // 콜백 없음 → 삭제 스킵 (안전)
        planToExecute = guard.filteredPlan;
        deletesSkipped = guard.deleteItems.length;
      }
    }

    // 7. 계획 실행
    sig?.throwIfAborted();
    const executorConfig: ExecutorConfig = {
      conflictStrategy: this.options.conflictStrategy,
      conflictResolver: this.options.conflictResolver,
      isFileActive: this.options.isFileActive,
      signal: sig,
      concurrency: this.options.concurrency,
      onProgress: this.options.onProgress,
      onConflictCount: this.options.onConflictCount,
    };
    const result = await executePlan(planToExecute, { fs, remote, store }, executorConfig);

    // 8. 모두 성공 시에만 cursor 갱신 (deferred도 미완료 취급)
    if (result.failed.length === 0 && deletesSkipped === 0 && result.deferred.length === 0) {
      await store.setMeta("cursor", latestCursor);
    }

    // 성공한 삭제 항목을 deletedPaths에서 제거
    for (const item of result.succeeded) {
      if (item.action.type === "deleteRemote" || item.action.type === "deleteLocal") {
        this.deletedPaths.delete(item.pathLower);
      }
    }

    const deferredCount = result.deferred.length > 0 ? result.deferred.length : undefined;
    return { plan, result, deletesSkipped, deferredCount };
  }
}
