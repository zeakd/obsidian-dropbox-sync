import { describe, test, expect } from "bun:test";
import { isConflictFile } from "@/sync/engine";
import { SyncSimulator } from "./support/sync-simulator";

describe("isConflictFile", () => {
  test("conflict 패턴 매치", () => {
    expect(isConflictFile("note.conflict-20260306T143200.md")).toBe(true);
    expect(isConflictFile("folder/deep/note.conflict-20260101T000000.md")).toBe(true);
    expect(isConflictFile("test.conflict-20260305T103500.txt")).toBe(true);
    expect(isConflictFile("no-ext.conflict-20260306T143200")).toBe(true);
  });

  test("일반 파일은 매치 안 됨", () => {
    expect(isConflictFile("note.md")).toBe(false);
    expect(isConflictFile("conflict-notes.md")).toBe(false);
    expect(isConflictFile("my.conflict.md")).toBe(false);
    expect(isConflictFile("note.conflict-invalid.md")).toBe(false);
  });
});

describe("conflict 파일 싱크 제외", () => {
  test("conflict 파일은 Dropbox에 업로드되지 않음", async () => {
    const sim = new SyncSimulator();
    const a = sim.addDevice("A");

    // 일반 파일 + conflict 파일 생성
    await a.editFile("note.md", "content");
    await a.editFile("note.conflict-20260306T143200.md", "remote version");
    await a.sync();

    // 일반 파일만 원격에 존재
    expect(sim.remote.has("note.md")).toBe(true);
    expect(sim.remote.has("note.conflict-20260306T143200.md")).toBe(false);
  });

  test("Dropbox에 있는 conflict 파일은 다운로드되지 않음", async () => {
    const sim = new SyncSimulator();
    const a = sim.addDevice("A");
    const b = sim.addDevice("B");

    // A: 일반 파일 생성 + sync
    await a.editFile("note.md", "content");
    await a.sync();

    // 원격에 직접 conflict 파일 업로드 (레거시 데이터 시뮬레이션)
    await sim.remote.upload(
      "note.conflict-20260306T143200.md",
      new TextEncoder().encode("old conflict"),
    );

    // B sync: conflict 파일은 다운로드 안 됨
    await b.sync();
    expect(b.hasFile("note.md")).toBe(true);
    expect(b.hasFile("note.conflict-20260306T143200.md")).toBe(false);
  });

  test("conflict 파일 삭제 시 deleteRemote가 생성되지 않음", async () => {
    const sim = new SyncSimulator();
    const a = sim.addDevice("A");

    // 파일 생성 + sync
    await a.editFile("note.md", "content");
    await a.sync();

    // conflict 파일 생성 후 삭제 (trackDelete 호출)
    await a.editFile("note.conflict-20260306T143200.md", "conflict data");
    await a.deleteFile("note.conflict-20260306T143200.md");

    // sync: conflict 파일은 plan에 포함되지 않으므로 에러 없이 완료
    const { plan } = await a.sync();
    const conflictActions = plan.items.filter((i) =>
      i.pathLower.includes(".conflict-"),
    );
    expect(conflictActions).toHaveLength(0);
  });
});
