/**
 * Glob 패턴으로 파일 경로 매칭.
 *
 * - "folder/" → 해당 폴더 아래 전부
 * - "*.ext" (슬래시 없음) → 파일명만 매칭
 * - "path/to/*.ext" (슬래시 포함) → 전체 경로 매칭
 * - * 는 / 제외 아무 문자, ** 는 경로 구분자 포함 아무 문자
 */
export function matchExcludePattern(path: string, pattern: string): boolean {
  if (pattern.endsWith("/")) {
    return path.startsWith(pattern);
  }

  // 슬래시 없는 패턴은 파일명만 매칭
  const target = pattern.includes("/") ? path : (path.split("/").pop() ?? path);

  let regex = "^";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      regex += ".*";
      i++;
      if (pattern[i + 1] === "/") i++;
    } else if (c === "*") {
      regex += "[^/]*";
    } else if (c === "?") {
      regex += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      regex += "\\" + c;
    } else {
      regex += c;
    }
  }
  regex += "$";

  return new RegExp(regex, "i").test(target);
}

/** 주어진 경로가 제외 패턴 목록에 매치되는지 확인 */
export function isExcluded(path: string, patterns: string[]): boolean {
  return patterns.some((p) => matchExcludePattern(path, p));
}
