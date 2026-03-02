import { describe, test, expect, beforeEach } from "vitest";
import { executePlan, makeConflictPath } from "@/sync/executor";
import type { ExecutorDeps } from "@/sync/executor";
import {
  MemoryFileSystem,
  MemoryRemoteStorage,
  MemoryStateStore,
} from "@/adapters/memory";
import { dropboxContentHash } from "@/hash";
import type { SyncPlan, SyncPlanItem } from "@/types";

function mkPlan(...items: SyncPlanItem[]): SyncPlan {
  const stats = {
    upload: 0,
    download: 0,
    deleteLocal: 0,
    deleteRemote: 0,
    conflict: 0,
    noop: 0,
  };
  for (const item of items) {
    const key = item.action.type as keyof typeof stats;
    if (key in stats) stats[key]++;
  }
  return { items, stats };
}

describe("executePlan", () => {
  let fs: MemoryFileSystem;
  let remote: MemoryRemoteStorage;
  let store: MemoryStateStore;
  let deps: ExecutorDeps;

  beforeEach(() => {
    fs = new MemoryFileSystem();
    remote = new MemoryRemoteStorage();
    store = new MemoryStateStore();
    deps = { fs, remote, store };
  });

  // ── upload ──

  test("upload: 로컬 파일을 원격에 업로드", async () => {
    const data = new TextEncoder().encode("local content");
    await fs.write("test.md", data);

    const plan = mkPlan({
      pathLower: "test.md",
      localPath: "test.md",
      action: { type: "upload", reason: "new_local" },
    });

    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(0);

    // 원격에 파일 존재
    const dl = await remote.download("test.md");
    expect(dl.data).toEqual(data);

    // state 갱신됨
    const entry = await store.getEntry("test.md");
    expect(entry).not.toBeNull();
    expect(entry!.rev).toBeTruthy();
    expect(entry!.baseLocalHash).toBe(dropboxContentHash(data));
  });

  test("upload: rev 충돌 → conflict 파일 생성", async () => {
    // 원격에 다른 내용으로 파일 존재
    const remoteData = new TextEncoder().encode("remote version");
    const remoteEntry = await remote.upload("test.md", remoteData);

    // 로컬 파일
    const localData = new TextEncoder().encode("local version");
    await fs.write("test.md", localData);

    // base에 오래된 rev 기록
    await store.setEntry({
      pathLower: "test.md",
      localPath: "test.md",
      baseLocalHash: "old_hash",
      baseRemoteHash: "old_hash",
      rev: "wrong_rev", // 일부러 불일치
      lastSynced: 1000,
    });

    const plan = mkPlan({
      pathLower: "test.md",
      localPath: "test.md",
      action: { type: "upload", reason: "local_modified" },
    });

    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(1);

    // conflict 파일 생성됨
    expect(fs.has("test.conflict.md")).toBe(true);
    const conflictData = await fs.read("test.conflict.md");
    expect(conflictData).toEqual(remoteData);

    // 원본 로컬 파일 유지
    expect(await fs.read("test.md")).toEqual(localData);

    // 원격은 로컬 버전으로 업데이트됨
    const remoteDl = await remote.download("test.md");
    expect(remoteDl.data).toEqual(localData);
  });

  // ── download ──

  test("download: 원격 파일을 로컬에 다운로드", async () => {
    const data = new TextEncoder().encode("remote content");
    await remote.upload("test.md", data);

    const plan = mkPlan({
      pathLower: "test.md",
      localPath: "test.md",
      action: { type: "download", reason: "new_remote" },
    });

    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(1);

    // 로컬에 파일 존재
    const localData = await fs.read("test.md");
    expect(localData).toEqual(data);

    // state 갱신됨
    const entry = await store.getEntry("test.md");
    expect(entry).not.toBeNull();
    expect(entry!.baseLocalHash).toBe(dropboxContentHash(data));
  });

  // ── deleteLocal ──

  test("deleteLocal: 로컬 파일 삭제", async () => {
    await fs.write("test.md", new TextEncoder().encode("x"));
    await store.setEntry({
      pathLower: "test.md",
      localPath: "test.md",
      baseLocalHash: "h",
      baseRemoteHash: "h",
      rev: "r",
      lastSynced: 1000,
    });

    const plan = mkPlan({
      pathLower: "test.md",
      localPath: "test.md",
      action: { type: "deleteLocal", reason: "deleted_on_remote" },
    });

    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(1);
    expect(fs.has("test.md")).toBe(false);
    expect(await store.getEntry("test.md")).toBeNull();
  });

  // ── deleteRemote ──

  test("deleteRemote: 원격 파일 삭제", async () => {
    await remote.upload("test.md", new TextEncoder().encode("x"));
    await store.setEntry({
      pathLower: "test.md",
      localPath: "test.md",
      baseLocalHash: "h",
      baseRemoteHash: "h",
      rev: "r",
      lastSynced: 1000,
    });

    const plan = mkPlan({
      pathLower: "test.md",
      localPath: "test.md",
      action: { type: "deleteRemote", reason: "deleted_on_local" },
    });

    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(1);
    expect(remote.has("test.md")).toBe(false);
    expect(await store.getEntry("test.md")).toBeNull();
  });

  // ── conflict ──

  test("conflict: 양쪽 파일 모두 보존", async () => {
    const localData = new TextEncoder().encode("local version");
    const remoteData = new TextEncoder().encode("remote version");

    await fs.write("test.md", localData);
    await remote.upload("test.md", remoteData);

    const plan = mkPlan({
      pathLower: "test.md",
      localPath: "test.md",
      action: {
        type: "conflict",
        localHash: dropboxContentHash(localData),
        remoteHash: dropboxContentHash(remoteData),
      },
    });

    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(1);

    // 로컬 원본 유지
    expect(await fs.read("test.md")).toEqual(localData);

    // 원격 버전 conflict 파일로 보존
    expect(fs.has("test.conflict.md")).toBe(true);
    expect(await fs.read("test.conflict.md")).toEqual(remoteData);

    // 원격은 로컬 버전으로 업데이트
    const dl = await remote.download("test.md");
    expect(dl.data).toEqual(localData);

    // state 갱신
    const entry = await store.getEntry("test.md");
    expect(entry).not.toBeNull();
  });

  // ── partial failure ──

  test("partial failure: 일부 실패해도 나머지 계속 진행", async () => {
    // 성공할 파일
    const data = new TextEncoder().encode("content");
    await fs.write("good.md", data);

    // 실패할 파일 (원격에 없는데 download 시도)
    const plan = mkPlan(
      {
        pathLower: "good.md",
        localPath: "good.md",
        action: { type: "upload", reason: "new_local" },
      },
      {
        pathLower: "bad.md",
        localPath: "bad.md",
        action: { type: "download", reason: "new_remote" },
      },
    );

    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].item.pathLower).toBe("bad.md");
  });

  // ── 여러 액션 동시 실행 ──

  test("여러 파일 동시 처리", async () => {
    await fs.write("upload.md", new TextEncoder().encode("u"));
    await remote.upload("download.md", new TextEncoder().encode("d"));

    const plan = mkPlan(
      {
        pathLower: "upload.md",
        localPath: "upload.md",
        action: { type: "upload", reason: "new_local" },
      },
      {
        pathLower: "download.md",
        localPath: "download.md",
        action: { type: "download", reason: "new_remote" },
      },
    );

    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(0);

    // 양쪽 모두 처리됨
    expect(remote.has("upload.md")).toBe(true);
    expect(fs.has("download.md")).toBe(true);
  });

  // ── noop ──

  test("noop: 아무것도 하지 않음", async () => {
    const plan = mkPlan({
      pathLower: "test.md",
      localPath: "test.md",
      action: { type: "noop", reason: "same_content" },
    });

    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(1);
    expect(store.getEntryCount()).toBe(0);
  });

  // ── 빈 플랜 ──

  test("빈 플랜: 성공, 변경 없음", async () => {
    const plan = mkPlan();
    const result = await executePlan(plan, deps);
    expect(result.succeeded).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});

// ── makeConflictPath ──

describe("makeConflictPath", () => {
  test("확장자가 있는 파일", () => {
    expect(makeConflictPath("test.md")).toBe("test.conflict.md");
  });

  test("경로가 있는 파일", () => {
    expect(makeConflictPath("notes/doc.md")).toBe("notes/doc.conflict.md");
  });

  test("확장자 없는 파일", () => {
    expect(makeConflictPath("README")).toBe("README.conflict");
  });

  test("여러 점이 있는 파일", () => {
    expect(makeConflictPath("my.file.name.md")).toBe(
      "my.file.name.conflict.md",
    );
  });
});
