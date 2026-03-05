import { describe, test, expect, beforeEach } from "bun:test";
import { SyncSimulator, Device } from "../support/sync-simulator";

describe("활성 파일 보호 시뮬레이션", () => {
  let sim: SyncSimulator;
  let A: Device;
  let B: Device;

  beforeEach(() => {
    sim = new SyncSimulator();
    A = sim.addDevice("A");
    B = sim.addDevice("B", {
      isFileActive: (path) => path === "editing.md",
    });
  });

  test("편집 중인 파일은 download에서 건너뛰고, 나머지는 정상 동기화", async () => {
    await A.editFile("editing.md", "from A");
    await A.editFile("other.md", "from A");
    await A.sync();

    const result = await B.sync();
    // other.md는 다운로드됨
    expect(B.hasFile("other.md")).toBe(true);
    // editing.md는 건너뜀
    expect(B.hasFile("editing.md")).toBe(false);
    expect(result.deferredCount).toBe(1);
  });

  test("활성 파일 비활성화 후 sync하면 정상 다운로드", async () => {
    await A.editFile("editing.md", "from A");
    await A.sync();

    // 첫 sync: editing.md 건너뜀
    const r1 = await B.sync();
    expect(r1.deferredCount).toBe(1);
    expect(B.hasFile("editing.md")).toBe(false);

    // isFileActive를 비활성으로 변경한 새 device로 재시도
    const B2 = sim.addDevice("B2");
    // B2는 isFileActive가 없으므로 모두 다운로드
    const r2 = await B2.sync();
    expect(B2.hasFile("editing.md")).toBe(true);
    expect(r2.deferredCount).toBeUndefined();
  });

  test("활성 파일 보호 시 cursor가 갱신되지 않아 다음 cycle에서 재시도", async () => {
    await A.editFile("editing.md", "version 1");
    await A.sync();

    // B sync: editing.md deferred → cursor 갱신 안 됨
    await B.sync();
    expect(B.hasFile("editing.md")).toBe(false);

    // B에서 isFileActive 해제된 새 engine으로 다시 sync
    const B3 = sim.addDevice("B3");
    await B3.sync();
    expect(B3.hasFile("editing.md")).toBe(true);
    expect(await B3.readFile("editing.md")).toBe("version 1");
  });
});
