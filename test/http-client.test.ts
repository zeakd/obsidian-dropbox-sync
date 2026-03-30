import { describe, test, expect } from "bun:test";
import { normalizeHeaders } from "@/http-client";

describe("normalizeHeaders", () => {
  test("소문자 키는 그대로 유지", () => {
    const result = normalizeHeaders({ "content-type": "text/plain" });
    expect(result["content-type"]).toBe("text/plain");
  });

  test("대문자 키를 소문자로 변환", () => {
    const result = normalizeHeaders({ "Content-Type": "text/plain" });
    expect(result["content-type"]).toBe("text/plain");
  });

  test("혼합 케이스 키를 소문자로 변환", () => {
    const result = normalizeHeaders({
      "Dropbox-API-Result": '{"rev":"abc"}',
      "Content-Type": "application/octet-stream",
    });
    expect(result["dropbox-api-result"]).toBe('{"rev":"abc"}');
    expect(result["content-type"]).toBe("application/octet-stream");
  });

  test("빈 객체 처리", () => {
    expect(normalizeHeaders({})).toEqual({});
  });
});
