/** 동일(양쪽 일치) 블록 */
export interface ResolvedSegment {
  type: "resolved";
  lines: string[];
}

/** 충돌 블록 — 사용자가 local/remote/both 중 선택 */
export interface ConflictSegment {
  type: "conflict";
  local: string[];
  remote: string[];
  choice: "local" | "remote" | "both" | null;
}

export type MergeSegment = ResolvedSegment | ConflictSegment;

interface DiffEntry {
  type: "equal" | "added" | "removed";
  line: string;
}

/** diff에서 머지 세그먼트 구축 */
export function buildMergeSegments(local: string, remote: string): MergeSegment[] {
  const diff = computeLineDiff(local, remote);
  const segments: MergeSegment[] = [];
  let resolved: string[] = [];

  const flushResolved = () => {
    if (resolved.length > 0) {
      segments.push({ type: "resolved", lines: resolved });
      resolved = [];
    }
  };

  let i = 0;
  while (i < diff.length) {
    if (diff[i].type === "equal") {
      resolved.push(diff[i].line);
      i++;
      continue;
    }

    // removed/added 블록 수집
    const removed: string[] = [];
    const added: string[] = [];
    while (i < diff.length && diff[i].type === "removed") {
      removed.push(diff[i].line);
      i++;
    }
    while (i < diff.length && diff[i].type === "added") {
      added.push(diff[i].line);
      i++;
    }

    // 2-way diff에서는 base가 없으므로, 한쪽만 있는 변경도 conflict로 표시
    flushResolved();
    segments.push({ type: "conflict", local: removed, remote: added, choice: null });
  }

  flushResolved();
  return segments;
}

/** 세그먼트를 최종 텍스트로 조립 */
export function assembleMerged(segments: MergeSegment[]): string {
  const lines: string[] = [];
  for (const seg of segments) {
    if (seg.type === "resolved") {
      lines.push(...seg.lines);
    } else {
      const choice = seg.choice ?? "local"; // 미선택 시 local 기본
      if (choice === "local") lines.push(...seg.local);
      else if (choice === "remote") lines.push(...seg.remote);
      else lines.push(...seg.local, ...seg.remote); // both
    }
  }
  return lines.join("\n");
}

/** 줄 단위 diff (LCS 기반) */
export function computeLineDiff(local: string, remote: string): DiffEntry[] {
  const maxLines = 500;
  const a = local.split("\n").slice(0, maxLines);
  const b = remote.split("\n").slice(0, maxLines);
  return diffLines(a, b);
}

function diffLines(a: string[], b: string[]): DiffEntry[] {
  const m = a.length;
  const n = b.length;

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffEntry[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.push({ type: "equal", line: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", line: b[j - 1] });
      j--;
    } else {
      result.push({ type: "removed", line: a[i - 1] });
      i--;
    }
  }

  return result.reverse();
}
