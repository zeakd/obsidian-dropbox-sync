import { describe, test, expect } from "bun:test";
import { SyncSimulator } from "./support/sync-simulator";

describe("삭제 catch-up (vault 이벤트 누락 대응)", () => {
  test("trackDelete 없이 파일을 지워도 deleteRemote가 실행됨", async () => {
    const sim = new SyncSimulator();
    const a = sim.addDevice("A");

    // 파일 생성 + sync → base 생성
    await a.editFile("note.md", "content");
    await a.sync();
    expect(sim.remote.has("note.md")).toBe(true);

    // trackDelete 없이 직접 삭제 (모바일에서 vault 이벤트 누락 시뮬레이션)
    await a.fs.delete("note.md");

    // sync: catch-up이 삭제 의도를 감지 → deleteRemote
    const { plan } = await a.sync();
    const actions = plan.items.filter((i) => i.pathLower === "note.md");
    expect(actions).toHaveLength(1);
    expect(actions[0].action.type).toBe("deleteRemote");
    expect(sim.remote.has("note.md")).toBe(false);
  });

  test("원격이 변경된 경우 catch-up이어도 download 우선", async () => {
    const sim = new SyncSimulator();
    const a = sim.addDevice("A");
    const b = sim.addDevice("B");

    // A: 파일 생성 + sync
    await a.editFile("note.md", "v1");
    await a.sync();

    // B: sync → 파일 받기
    await b.sync();

    // A: 파일 수정 + sync → 원격 변경
    await a.editFile("note.md", "v2");
    await a.sync();

    // B: trackDelete 없이 삭제
    await b.fs.delete("note.md");

    // B sync: 원격이 변경되었으므로 download (변경 우선)
    const { plan } = await b.sync();
    const actions = plan.items.filter((i) => i.pathLower === "note.md");
    expect(actions).toHaveLength(1);
    expect(actions[0].action.type).toBe("download");
    expect(b.hasFile("note.md")).toBe(true);
  });

  test("새 원격 파일은 catch-up 대상이 아님 (base 없으면 download)", async () => {
    const sim = new SyncSimulator();
    const a = sim.addDevice("A");
    const b = sim.addDevice("B");

    // A: 파일 생성 + sync
    await a.editFile("note.md", "content");
    await a.sync();

    // B: 한 번도 sync 안 한 상태 → base 없음
    const { plan } = await b.sync();
    const actions = plan.items.filter((i) => i.pathLower === "note.md");
    expect(actions).toHaveLength(1);
    expect(actions[0].action.type).toBe("download");
  });

  test("trackDelete와 catch-up이 중복되어도 문제 없음", async () => {
    const sim = new SyncSimulator();
    const a = sim.addDevice("A");

    // 파일 생성 + sync
    await a.editFile("note.md", "content");
    await a.sync();

    // trackDelete + 파일 삭제 (정상 경로)
    await a.deleteFile("note.md");

    // sync: trackDelete가 이미 있으므로 catch-up은 no-op
    const { plan } = await a.sync();
    const actions = plan.items.filter((i) => i.pathLower === "note.md");
    expect(actions).toHaveLength(1);
    expect(actions[0].action.type).toBe("deleteRemote");
  });
});
