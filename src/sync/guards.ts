import type { DeleteGuardResult, SyncPlan } from "../types";

/**
 * 대량 삭제 가드. 삭제 개수가 임계값을 초과하면 차단.
 *
 * - passed: true → 원본 plan 그대로 실행
 * - passed: false → filteredPlan(삭제 제외)만 실행하고 deleteItems를 사용자에게 확인
 */
export function checkDeleteGuard(
  plan: SyncPlan,
  threshold: number,
  enabled = true,
): DeleteGuardResult {
  if (!enabled) {
    return { passed: true, deleteItems: [], filteredPlan: plan };
  }

  const deleteItems = plan.items.filter(
    (item) => item.action.type === "deleteRemote" || item.action.type === "deleteLocal",
  );

  if (deleteItems.length <= threshold) {
    return { passed: true, deleteItems: [], filteredPlan: plan };
  }

  // 삭제 항목 제외한 플랜
  const nonDeleteItems = plan.items.filter(
    (item) => item.action.type !== "deleteRemote" && item.action.type !== "deleteLocal",
  );

  const filteredStats = { ...plan.stats, deleteLocal: 0, deleteRemote: 0 };

  return {
    passed: false,
    deleteItems,
    filteredPlan: { items: nonDeleteItems, stats: filteredStats },
  };
}
