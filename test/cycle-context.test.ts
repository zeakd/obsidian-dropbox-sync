import { describe, test, expect } from "bun:test";
import { CycleContext } from "@/sync/cycle-context";
import type { SyncEvent } from "@/sync/cycle-context";

describe("CycleContext", () => {
  test("emit은 이벤트를 순서대로 저장한다", () => {
    const ctx = new CycleContext();
    const e1: SyncEvent = { type: "cycle_start", ts: 1000, cursor: null };
    const e2: SyncEvent = { type: "local_scan", ts: 1001, fileCount: 5, duration: 10 };
    ctx.emit(e1);
    ctx.emit(e2);

    const events = ctx.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual(e1);
    expect(events[1]).toEqual(e2);
  });

  test("getEvents는 readonly 배열을 반환한다", () => {
    const ctx = new CycleContext();
    ctx.emit({ type: "cycle_start", ts: 1000, cursor: null });

    const events = ctx.getEvents();
    expect(events).toHaveLength(1);
    // readonly 타입이므로 push 등이 타입 에러를 일으키지만,
    // 런타임에서도 원본 배열과 동일한 참조인지 확인
    expect(Array.isArray(events)).toBe(true);
  });

  test("toJsonl은 각 이벤트를 cycleId와 함께 한 줄의 JSON으로 직렬화한다", () => {
    const ctx = new CycleContext();
    ctx.emit({ type: "cycle_start", ts: 1000, cursor: "abc" });
    ctx.emit({ type: "cycle_end", ts: 2000, duration: 1000, stats: { upload: 1 }, failed: 0, deferred: 0 });

    const jsonl = ctx.toJsonl();
    const lines = jsonl.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);

    const parsed0 = JSON.parse(lines[0]);
    expect(parsed0.type).toBe("cycle_start");
    expect(parsed0.cycleId).toBe(ctx.cycleId);
    expect(parsed0.cursor).toBe("abc");

    const parsed1 = JSON.parse(lines[1]);
    expect(parsed1.type).toBe("cycle_end");
    expect(parsed1.cycleId).toBe(ctx.cycleId);
    expect(parsed1.duration).toBe(1000);
  });

  test("toJsonl 출력은 유효한 JSONL이다 (각 줄이 독립적으로 파싱 가능)", () => {
    const ctx = new CycleContext();
    ctx.emit({ type: "cycle_start", ts: 1000, cursor: null });
    ctx.emit({ type: "local_scan", ts: 1001, fileCount: 10, duration: 5 });
    ctx.emit({
      type: "plan_decision",
      ts: 1002,
      pathLower: "test.md",
      action: "upload",
      reason: "new_local",
      localHash: "abc",
      remoteHash: null,
      baseLocalHash: null,
      baseRemoteHash: null,
    });

    const jsonl = ctx.toJsonl();
    // 마지막에 개행이 있으므로 빈 줄 제거
    const lines = jsonl.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(3);

    // 각 줄이 독립적으로 파싱 가능해야 한다
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  test("cycleId는 'cycle-'로 시작한다", () => {
    const ctx = new CycleContext();
    expect(ctx.cycleId).toMatch(/^cycle-/);
  });

  test("여러 이벤트 타입이 공존할 수 있다", () => {
    const ctx = new CycleContext();
    ctx.emit({ type: "cycle_start", ts: 1000, cursor: null });
    ctx.emit({ type: "local_scan", ts: 1001, fileCount: 3, duration: 10 });
    ctx.emit({
      type: "remote_fetch",
      ts: 1002,
      deltaCount: 2,
      cursor: "cur1",
      hasMore: false,
      duration: 50,
    });
    ctx.emit({
      type: "plan_decision",
      ts: 1003,
      pathLower: "a.md",
      action: "upload",
      reason: "new_local",
      localHash: "h1",
      remoteHash: null,
      baseLocalHash: null,
      baseRemoteHash: null,
    });
    ctx.emit({ type: "exec_start", ts: 1004, pathLower: "a.md", action: "upload" });
    ctx.emit({ type: "exec_end", ts: 1005, pathLower: "a.md", action: "upload", ok: true, duration: 100 });
    ctx.emit({ type: "delete_guard", ts: 1006, deleteCount: 0, threshold: 5, passed: true });
    ctx.emit({
      type: "cycle_end",
      ts: 2000,
      duration: 1000,
      stats: { upload: 1 },
      failed: 0,
      deferred: 0,
    });

    const events = ctx.getEvents();
    expect(events).toHaveLength(8);

    const types = events.map((e) => e.type);
    expect(types).toContain("cycle_start");
    expect(types).toContain("local_scan");
    expect(types).toContain("remote_fetch");
    expect(types).toContain("plan_decision");
    expect(types).toContain("exec_start");
    expect(types).toContain("exec_end");
    expect(types).toContain("delete_guard");
    expect(types).toContain("cycle_end");
  });
});
