/**
 * 동기화 사이클의 모든 결정을 기록하는 구조화된 컨텍스트.
 *
 * 사용: engine이 사이클 시작 시 생성, planner/executor에 전달.
 * 각 컴포넌트는 emit()으로 이벤트를 기록한다.
 * 사이클 종료 후 toJsonl()로 직렬화.
 */

export type SyncEvent =
  | { type: "cycle_start"; ts: number; cursor: string | null }
  | { type: "cycle_end"; ts: number; duration: number; stats: Record<string, number>; failed: number; deferred: number }
  | { type: "local_scan"; ts: number; fileCount: number; duration: number }
  | { type: "remote_fetch"; ts: number; deltaCount: number; cursor: string; hasMore: boolean; duration: number }
  | { type: "plan_decision"; ts: number; pathLower: string; action: string; reason: string; localHash: string | null; remoteHash: string | null; baseLocalHash: string | null; baseRemoteHash: string | null }
  | { type: "exec_start"; ts: number; pathLower: string; action: string }
  | { type: "exec_end"; ts: number; pathLower: string; action: string; ok: boolean; error?: string; duration: number }
  | { type: "delete_guard"; ts: number; deleteCount: number; threshold: number; passed: boolean }
  | { type: "cursor_reset"; ts: number; oldCursor: string };

export class CycleContext {
  private events: SyncEvent[] = [];
  readonly cycleId: string;
  readonly startTime: number;

  constructor() {
    this.startTime = Date.now();
    this.cycleId = `cycle-${this.startTime}`;
  }

  emit(event: SyncEvent): void {
    this.events.push(event);
  }

  getEvents(): readonly SyncEvent[] {
    return this.events;
  }

  /** JSONL 형식으로 직렬화 */
  toJsonl(): string {
    return this.events.map(e => JSON.stringify({ ...e, cycleId: this.cycleId })).join("\n") + "\n";
  }
}
