import { describe, test, expect } from "bun:test";
import { DropboxAuthError } from "@/adapters/dropbox-adapter";

describe("DropboxAuthError", () => {
  test("이름과 메시지 설정", () => {
    const err = new DropboxAuthError("Token revoked");
    expect(err.name).toBe("DropboxAuthError");
    expect(err.message).toBe("Token revoked");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DropboxAuthError);
  });

  test("instanceof 체크 동작", () => {
    const err: Error = new DropboxAuthError("test");
    expect(err instanceof DropboxAuthError).toBe(true);
  });
});
