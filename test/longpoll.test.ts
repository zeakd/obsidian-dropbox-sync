import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ── window/document 글로벌 설정 (bun test에는 없음) ──

let timerCallbacks: Map<number, () => void>;
let timerCounter: number;
const realSetTimeout = globalThis.setTimeout;

function fakeSetTimeout(cb: () => void, _ms?: number): number {
  const id = ++timerCounter;
  timerCallbacks.set(id, cb);
  return id;
}

function fakeClearTimeout(id: number): void {
  timerCallbacks.delete(id);
}

// window 글로벌 설정 (모듈 로드 전에 해야 함)
(globalThis as Record<string, unknown>).window = {
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
};
(globalThis as Record<string, unknown>).document = {
  hidden: false,
  addEventListener: mock(() => {}),
  removeEventListener: mock(() => {}),
};

// 모듈 로드는 window 설정 후
import { LongpollManager, type LongpollConfig } from "@/sync/longpoll";
import type { HttpClient } from "@/http-client";

// ── mock: httpClient ──

let mockHttpClient: ReturnType<typeof mock>;
let httpClientImpl: (opts: unknown) => Promise<unknown>;

function createConfig(overrides: Partial<LongpollConfig> = {}): LongpollConfig {
  return {
    httpClient: ((...args: unknown[]) => {
      mockHttpClient(...args);
      return httpClientImpl(args[0]);
    }) as HttpClient,
    getCursor: async () => "cursor_abc",
    isSyncing: () => false,
    isEnabled: () => true,
    onChanges: mock(() => {}),
    log: mock(async () => {}),
    ...overrides,
  };
}

describe("LongpollManager", () => {
  let mgr: LongpollManager;
  let config: LongpollConfig;

  beforeEach(() => {
    timerCallbacks = new Map();
    timerCounter = 0;

    // window의 타이머 함수를 fake로 재설정
    (window as unknown as Record<string, unknown>).setTimeout = fakeSetTimeout;
    (window as unknown as Record<string, unknown>).clearTimeout = fakeClearTimeout;

    mockHttpClient = mock(() => {});
    httpClientImpl = async () => ({
      status: 200,
      json: { changes: false },
    });

    config = createConfig();
    mgr = new LongpollManager(config);
  });

  afterEach(() => {
    mgr.stop();
  });

  function flushTimers(): void {
    const callbacks = [...timerCallbacks.values()];
    timerCallbacks.clear();
    for (const cb of callbacks) cb();
  }

  async function flushTimersAsync(): Promise<void> {
    flushTimers();
    await new Promise((r) => realSetTimeout(r, 0));
  }

  // ── schedule ──

  test("schedule: 타이머 등록", () => {
    mgr.schedule();
    expect(timerCallbacks.size).toBe(1);
  });

  test("schedule: disabled면 타이머 등록 안 됨", () => {
    config = createConfig({ isEnabled: () => false });
    mgr = new LongpollManager(config);
    mgr.schedule();
    expect(timerCallbacks.size).toBe(0);
  });

  // ── stop ──

  test("stop: 타이머 클리어", () => {
    mgr.schedule();
    expect(timerCallbacks.size).toBe(1);
    mgr.stop();
    expect(timerCallbacks.size).toBe(0);
  });

  // ── run: changes=true → onChanges ──

  test("changes detected → onChanges 호출", async () => {
    httpClientImpl = async () => ({
      status: 200,
      json: { changes: true },
    });

    mgr.schedule();
    await flushTimersAsync();

    expect(config.onChanges).toHaveBeenCalledTimes(1);
  });

  // ── run: changes=false → 재스케줄 ──

  test("no changes → 재스케줄", async () => {
    mgr.schedule();
    await flushTimersAsync();

    // run 후 다시 schedule → 새 타이머 등록
    expect(timerCallbacks.size).toBe(1);
  });

  // ── run: cursor null ──

  test("cursor null → 요청 안 보냄", async () => {
    config = createConfig({ getCursor: async () => null });
    mgr = new LongpollManager(config);

    mgr.schedule();
    await flushTimersAsync();

    expect(mockHttpClient).not.toHaveBeenCalled();
  });

  // ── run: syncing 중 ──

  test("syncing 중이면 스킵", async () => {
    config = createConfig({ isSyncing: () => true });
    mgr = new LongpollManager(config);

    mgr.schedule();
    await flushTimersAsync();

    expect(mockHttpClient).not.toHaveBeenCalled();
  });

  // ── API 에러 ──

  test("API 에러 status → 로그 기록", async () => {
    httpClientImpl = async () => ({
      status: 500,
      json: {},
    });

    mgr.schedule();
    await flushTimersAsync();

    expect(config.log).toHaveBeenCalled();
  });

  // ── 네트워크 에러 → 백오프 ──

  test("네트워크 에러 → 백오프 재시도 등록", async () => {
    httpClientImpl = async () => {
      throw new Error("network error");
    };

    mgr.schedule();
    await flushTimersAsync();

    expect(config.log).toHaveBeenCalled();
    // 백오프 타이머 등록됨
    expect(timerCallbacks.size).toBeGreaterThanOrEqual(1);
  });

  // ── backoff 응답 ──

  test("backoff 응답 → 지연 후 재스케줄", async () => {
    httpClientImpl = async () => ({
      status: 200,
      json: { changes: false, backoff: 5 },
    });

    mgr.schedule();
    await flushTimersAsync();

    expect(timerCallbacks.size).toBe(1);
  });

  test("backoff + changes → 지연 후 onChanges", async () => {
    httpClientImpl = async () => ({
      status: 200,
      json: { changes: true, backoff: 2 },
    });

    mgr.schedule();
    await flushTimersAsync();

    // backoff 타이머 실행
    await flushTimersAsync();

    expect(config.onChanges).toHaveBeenCalledTimes(1);
  });

  // ── requestUrl 호출 파라미터 ──

  test("requestUrl에 올바른 파라미터 전달", async () => {
    httpClientImpl = async () => ({
      status: 200,
      json: { changes: false },
    });

    mgr.schedule();
    await flushTimersAsync();

    expect(mockHttpClient).toHaveBeenCalledTimes(1);
    const callArgs = (mockHttpClient as ReturnType<typeof mock>).mock.calls[0][0] as Record<string, unknown>;
    expect(callArgs).toMatchObject({
      url: "https://notify.dropboxapi.com/2/files/list_folder/longpoll",
      method: "POST",
      body: JSON.stringify({ cursor: "cursor_abc", timeout: 30 }),
    });
  });

  // ── disabled 상태에서 run 시도 ──

  test("run 도중 disabled → 결과 무시", async () => {
    let enabled = true;
    config = createConfig({ isEnabled: () => enabled });
    mgr = new LongpollManager(config);

    httpClientImpl = async () => {
      // API 호출 중간에 disabled 됨
      enabled = false;
      return { status: 200, json: { changes: true } };
    };

    mgr.schedule();
    await flushTimersAsync();

    // disabled 상태이므로 onChanges 미호출
    expect(config.onChanges).not.toHaveBeenCalled();
  });
});
