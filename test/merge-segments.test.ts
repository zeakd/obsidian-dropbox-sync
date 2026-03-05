import { describe, test, expect } from "bun:test";
import { buildMergeSegments, computeLineDiff } from "../src/ui/merge-segments";

describe("buildMergeSegments", () => {
  test("동일한 내용 → conflict 없음", () => {
    const segs = buildMergeSegments("a\nb\nc", "a\nb\nc");
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe("resolved");
  });

  test("양쪽 다 변경 → conflict block", () => {
    const segs = buildMergeSegments("a\nlocal\nc", "a\nremote\nc");
    const conflicts = segs.filter((s) => s.type === "conflict");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type === "conflict" && conflicts[0].local).toEqual(["local"]);
    expect(conflicts[0].type === "conflict" && conflicts[0].remote).toEqual(["remote"]);
  });

  test("remote-only 추가 → conflict block (auto-merge하지 않음)", () => {
    const segs = buildMergeSegments("a\nb", "a\nnew line\nb");
    const conflicts = segs.filter((s) => s.type === "conflict");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type === "conflict" && conflicts[0].local).toEqual([]);
    expect(conflicts[0].type === "conflict" && conflicts[0].remote).toEqual(["new line"]);
  });

  test("local-only 추가 → conflict block (auto-merge하지 않음)", () => {
    const segs = buildMergeSegments("a\nlocal line\nb", "a\nb");
    const conflicts = segs.filter((s) => s.type === "conflict");
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type === "conflict" && conflicts[0].local).toEqual(["local line"]);
    expect(conflicts[0].type === "conflict" && conflicts[0].remote).toEqual([]);
  });

  test("여러 conflict block", () => {
    const local = "header\nlocal1\nmiddle\nlocal2\nfooter";
    const remote = "header\nremote1\nmiddle\nremote2\nfooter";
    const segs = buildMergeSegments(local, remote);
    const conflicts = segs.filter((s) => s.type === "conflict");
    expect(conflicts).toHaveLength(2);
  });

  test("완전히 다른 내용 → 하나의 큰 conflict", () => {
    const segs = buildMergeSegments("aaa\nbbb", "xxx\nyyy");
    const conflicts = segs.filter((s) => s.type === "conflict");
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
  });
});

describe("computeLineDiff", () => {
  test("동일한 내용 → 모든 줄 equal", () => {
    const diff = computeLineDiff("a\nb", "a\nb");
    expect(diff.every((d) => d.type === "equal")).toBe(true);
  });

  test("한 줄 변경", () => {
    const diff = computeLineDiff("a\nold\nc", "a\nnew\nc");
    expect(diff.filter((d) => d.type === "removed")).toHaveLength(1);
    expect(diff.filter((d) => d.type === "added")).toHaveLength(1);
  });
});
