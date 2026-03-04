import { describe, test, expect } from "vitest";
import { runWithConcurrency } from "@/sync/concurrency";

/** 지정 ms 후 resolve */
const delayed = <T>(ms: number, value: T): (() => Promise<T>) =>
  () => new Promise((resolve) => setTimeout(() => resolve(value), ms));

/** 지정 ms 후 reject */
const delayedReject = (ms: number, reason: string): (() => Promise<never>) =>
  () => new Promise((_, reject) => setTimeout(() => reject(new Error(reason)), ms));

describe("runWithConcurrency", () => {
  test("빈 배열 → 빈 결과", async () => {
    const results = await runWithConcurrency([], 3);
    expect(results).toHaveLength(0);
  });

  test("모든 태스크 성공 → fulfilled", async () => {
    const tasks = [
      delayed(10, "a"),
      delayed(10, "b"),
      delayed(10, "c"),
    ];
    const results = await runWithConcurrency(tasks, 2);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect((results[0] as any).value).toBe("a");
    expect((results[1] as any).value).toBe("b");
    expect((results[2] as any).value).toBe("c");
  });

  test("일부 실패 → rejected, 나머지 continued", async () => {
    const tasks = [
      delayed(10, "ok"),
      delayedReject(10, "fail"),
      delayed(10, "ok2"),
    ];
    const results = await runWithConcurrency(tasks, 2);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(results[2].status).toBe("fulfilled");
  });

  test("동시성 제한: concurrency=1 → 순차 실행", async () => {
    const order: number[] = [];
    const tasks = [0, 1, 2].map((i) => async () => {
      order.push(i);
      await new Promise((r) => setTimeout(r, 5));
      return i;
    });

    await runWithConcurrency(tasks, 1);
    expect(order).toEqual([0, 1, 2]);
  });

  test("동시성 제한: concurrency=2 → 최대 2개 동시", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array.from({ length: 5 }, () => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 20));
      concurrent--;
      return maxConcurrent;
    });

    await runWithConcurrency(tasks, 2);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(maxConcurrent).toBe(2);
  });

  test("abort → 나머지 건너뜀", async () => {
    const controller = new AbortController();
    let completed = 0;

    const tasks = Array.from({ length: 5 }, (_, i) => async () => {
      await new Promise((r) => setTimeout(r, 10));
      completed++;
      if (i === 0) controller.abort();
      return i;
    });

    await runWithConcurrency(tasks, 1, { signal: controller.signal });
    // concurrency=1이므로 첫 태스크 완료 후 abort → 1개만 완료
    expect(completed).toBe(1);
  });

  test("onTaskComplete 콜백 호출 횟수", async () => {
    let count = 0;
    const tasks = [
      delayed(5, "a"),
      delayed(5, "b"),
      delayed(5, "c"),
    ];

    await runWithConcurrency(tasks, 2, {
      onTaskComplete: () => count++,
    });
    expect(count).toBe(3);
  });
});
