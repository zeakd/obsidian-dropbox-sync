const ACTION_LABELS: [string, string][] = [
  ["upload", "\u2191"],
  ["download", "\u2193"],
  ["conflict", "\u26A1"],
  ["deleteLocal", "\u2193\u2717"],
  ["deleteRemote", "\u2191\u2717"],
];

/** 동기화 결과를 아이콘 요약 문자열로 변환. 예: "↑2 ↓1 ⚡1" */
export function summarizeActions(items: { action: { type: string } }[]): string {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.action.type] = (counts[item.action.type] ?? 0) + 1;
  }
  const parts: string[] = [];
  for (const [type, icon] of ACTION_LABELS) {
    if (counts[type]) parts.push(`${icon}${counts[type]}`);
  }
  return parts.length > 0 ? parts.join(" ") : `${items.length} synced`;
}
