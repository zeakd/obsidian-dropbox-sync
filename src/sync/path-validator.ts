/**
 * Dropbox 경로 검증.
 * 업로드 전 금지 문자/패턴을 검사하여 API 오류를 사전 방지한다.
 */

/** 금지 문자 (Dropbox 제한) */
const FORBIDDEN_CHARS = /[\\:*?"<>|]/;

/**
 * Dropbox 경로 유효성 검증.
 * 유효하면 null, 위반이면 사유 문자열을 반환한다.
 */
export function validateDropboxPath(path: string): string | null {
  if (!path) {
    return "path is empty";
  }

  if (FORBIDDEN_CHARS.test(path)) {
    const match = path.match(FORBIDDEN_CHARS)!;
    return `forbidden character: '${match[0]}'`;
  }

  const segments = path.split("/");
  for (const seg of segments) {
    if (seg === "" ) continue; // leading/trailing slash

    if (seg === "." || seg === "..") {
      return `invalid segment: '${seg}'`;
    }

    if (seg.endsWith(" ") || seg.endsWith(".")) {
      return `segment ends with '${seg[seg.length - 1]}': '${seg}'`;
    }
  }

  return null;
}
