/**
 * 구매 요약 칩을 숨겼는지 기록하는 키다. booth.pm 오리진의 localStorage에 남으며,
 * 상품별이 아니라 한 번 숨기면 계속 숨긴 상태를 유지한다.
 */
export const REVIEW_CHIP_DISMISS_KEY = "boothplus.purchaseReviewChip.dismissed";

const DISMISSED_VALUE = "1";

type DismissStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * 시크릿 창이나 저장소 차단 환경에서는 localStorage 접근 자체가 예외를 던진다.
 * 그 경우에는 저장소가 없는 것으로 보고 칩을 평소대로 보여 준다.
 */
const resolveStorage = (storage?: DismissStorage): DismissStorage | null => {
  if (storage) {
    return storage;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const isReviewChipDismissed = (storage?: DismissStorage): boolean => {
  const resolved = resolveStorage(storage);
  if (!resolved) {
    return false;
  }

  try {
    return resolved.getItem(REVIEW_CHIP_DISMISS_KEY) === DISMISSED_VALUE;
  } catch {
    return false;
  }
};

export const dismissReviewChip = (storage?: DismissStorage): void => {
  const resolved = resolveStorage(storage);
  if (!resolved) {
    return;
  }

  try {
    resolved.setItem(REVIEW_CHIP_DISMISS_KEY, DISMISSED_VALUE);
  } catch {
    /* 저장에 실패해도 이번 화면에서는 숨긴 상태를 유지하므로 조용히 넘어간다. */
  }
};
