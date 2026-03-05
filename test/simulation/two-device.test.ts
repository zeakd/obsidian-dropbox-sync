import { describe, test, expect, beforeEach } from "bun:test";
import { SyncSimulator, Device } from "../support/sync-simulator";

describe("2기기 동기화 시나리오", () => {
  let sim: SyncSimulator;
  let A: Device;
  let B: Device;

  beforeEach(() => {
    sim = new SyncSimulator();
    A = sim.addDevice("A");
    B = sim.addDevice("B");
  });

  test("기본 동기화: A 편집 → A sync → B sync → B에 반영", async () => {
    await A.editFile("note.md", "hello from A");
    await A.sync();
    await B.sync();

    expect(B.hasFile("note.md")).toBe(true);
    expect(await B.readFile("note.md")).toBe("hello from A");
  });

  test("양방향: A, B 다른 파일 편집 → sync → 양쪽 일치", async () => {
    await A.editFile("a.md", "content A");
    await B.editFile("b.md", "content B");

    await A.sync();
    await B.sync();
    // B가 sync하면 a.md 다운로드, b.md 업로드
    await A.sync();
    // A가 sync하면 b.md 다운로드

    expect(A.hasFile("a.md")).toBe(true);
    expect(A.hasFile("b.md")).toBe(true);
    expect(B.hasFile("a.md")).toBe(true);
    expect(B.hasFile("b.md")).toBe(true);

    await sim.assertAllConsistent();
  });

  test("충돌: A, B 같은 파일 편집 → 양쪽 보존", async () => {
    // 초기 동기화
    await A.editFile("note.md", "original");
    await A.sync();
    await B.sync();

    // 양쪽 수정
    await A.editFile("note.md", "version A");
    await B.editFile("note.md", "version B");

    await A.sync(); // A의 버전 업로드
    await B.sync(); // B에서 conflict 감지

    // B: 로컬에 자기 버전 유지, conflict 파일에 원격(A) 버전
    expect(B.hasFile("note.md")).toBe(true);
    const conflictPath = B.findFileByPrefix("note.conflict-");
    expect(conflictPath).toBeDefined();

    const bNote = await B.readFile("note.md");
    const bConflict = await B.readFile(conflictPath!);
    // 둘 중 하나는 "version A", 하나는 "version B"
    const versions = new Set([bNote, bConflict]);
    expect(versions.has("version A")).toBe(true);
    expect(versions.has("version B")).toBe(true);
  });

  test("삭제 전파: A 삭제 → B sync → B에서도 삭제", async () => {
    // 초기 동기화
    await A.editFile("note.md", "to delete");
    await A.sync();
    await B.sync();
    expect(B.hasFile("note.md")).toBe(true);

    // A에서 삭제
    await A.deleteFile("note.md");
    await A.sync();
    await B.sync();

    expect(B.hasFile("note.md")).toBe(false);
  });

  test("삭제 + 수정 교차: A 삭제 + B 편집 → B 변경 유지", async () => {
    // 초기 동기화
    await A.editFile("note.md", "original");
    await A.sync();
    await B.sync();

    // A 삭제 + B 수정
    await A.deleteFile("note.md");
    await B.editFile("note.md", "B edited");

    await A.sync(); // 원격에서 삭제됨
    await B.sync(); // B는 로컬 변경을 업로드 (변경 우선)

    // B에는 수정된 파일 유지
    expect(B.hasFile("note.md")).toBe(true);
    expect(await B.readFile("note.md")).toBe("B edited");

    // A가 다시 sync하면 B의 변경을 다운로드
    await A.sync();
    expect(A.hasFile("note.md")).toBe(true);
    expect(await A.readFile("note.md")).toBe("B edited");
  });

  test("순차 편집: A 편집 → sync → B 편집 → sync → A sync → 최신 반영", async () => {
    await A.editFile("note.md", "v1");
    await A.sync();
    await B.sync();

    await B.editFile("note.md", "v2");
    await B.sync();
    await A.sync();

    expect(await A.readFile("note.md")).toBe("v2");
    expect(await B.readFile("note.md")).toBe("v2");
  });

  test("여러 파일 동시 생성 → 양쪽 동기화", async () => {
    for (let i = 0; i < 5; i++) {
      await A.editFile(`a-${i}.md`, `A content ${i}`);
      await B.editFile(`b-${i}.md`, `B content ${i}`);
    }

    await A.sync();
    await B.sync();
    await A.sync();

    // A에 10개, B에 10개
    for (let i = 0; i < 5; i++) {
      expect(A.hasFile(`a-${i}.md`)).toBe(true);
      expect(A.hasFile(`b-${i}.md`)).toBe(true);
      expect(B.hasFile(`a-${i}.md`)).toBe(true);
      expect(B.hasFile(`b-${i}.md`)).toBe(true);
    }

    await sim.assertAllConsistent();
  });

  test("빈 파일 동기화", async () => {
    await A.editFile("empty.md", "");
    await A.sync();
    await B.sync();

    expect(B.hasFile("empty.md")).toBe(true);
    expect(await B.readFile("empty.md")).toBe("");
  });

  test("파일 덮어쓰기 후 동기화", async () => {
    await A.editFile("note.md", "v1");
    await A.sync();
    await B.sync();

    await A.editFile("note.md", "v2");
    await A.editFile("note.md", "v3"); // 연속 편집
    await A.sync();
    await B.sync();

    expect(await B.readFile("note.md")).toBe("v3");
  });
});
