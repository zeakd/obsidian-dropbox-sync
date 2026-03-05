import { describe, test, expect } from "bun:test";
import { validateDropboxPath } from "@/sync/path-validator";

describe("validateDropboxPath", () => {
  // ── 유효한 경로 ──

  test("일반 경로 → null", () => {
    expect(validateDropboxPath("notes/hello.md")).toBeNull();
  });

  test("깊은 경로 → null", () => {
    expect(validateDropboxPath("a/b/c/d/e.md")).toBeNull();
  });

  test("한글 파일명 → null", () => {
    expect(validateDropboxPath("메모/일기.md")).toBeNull();
  });

  test("하이픈, 언더스코어, 공백 포함 → null", () => {
    expect(validateDropboxPath("my notes/hello world.md")).toBeNull();
  });

  // ── Dropbox가 허용하는 특수문자 ──

  test("물음표 → 허용", () => {
    expect(validateDropboxPath("file?.md")).toBeNull();
  });

  test("별표, 콜론, 꺾쇠, 파이프 → 허용", () => {
    expect(validateDropboxPath("file*name.md")).toBeNull();
    expect(validateDropboxPath("file:name.md")).toBeNull();
    expect(validateDropboxPath("file<1>.md")).toBeNull();
    expect(validateDropboxPath("file|name.md")).toBeNull();
  });

  // ── 금지 문자 (제어문자) ──

  test("NUL → 에러", () => {
    expect(validateDropboxPath("file\x00.md")).toContain("forbidden character");
  });

  test("제어문자 → 에러", () => {
    expect(validateDropboxPath("file\x01.md")).toContain("forbidden character");
  });

  // ── 금지 세그먼트 ──

  test("세그먼트 . → 에러", () => {
    expect(validateDropboxPath("notes/./file.md")).toContain("invalid segment");
  });

  test("세그먼트 .. → 에러", () => {
    expect(validateDropboxPath("notes/../file.md")).toContain("invalid segment");
  });

  // ── trailing 공백/점 ──

  test("세그먼트 끝 공백 → 에러", () => {
    expect(validateDropboxPath("notes /file.md")).toContain("segment ends with");
  });

  test("세그먼트 끝 점 → 에러", () => {
    expect(validateDropboxPath("notes./file.md")).toContain("segment ends with");
  });

  // ── 빈 경로 ──

  test("빈 문자열 → 에러", () => {
    expect(validateDropboxPath("")).toContain("empty");
  });
});
