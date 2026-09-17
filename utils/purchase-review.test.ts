import { beforeEach, describe, expect, test } from "vitest";
import {
  REVIEW_CHIP_DISMISS_KEY,
  dismissReviewChip,
  isReviewChipDismissed,
} from "./purchase-review";

type FakeStorage = Pick<Storage, "getItem" | "setItem">;

const createFakeStorage = (initial: Record<string, string> = {}) => {
  const values = { ...initial };

  return {
    values,
    storage: {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, value: string) => {
        values[key] = value;
      },
    } satisfies FakeStorage,
  };
};

const createThrowingStorage = (): FakeStorage => ({
  getItem: () => {
    throw new Error("storage is blocked");
  },
  setItem: () => {
    throw new Error("storage is blocked");
  },
});

describe("구매 요약 칩 숨김 상태", () => {
  let fake: ReturnType<typeof createFakeStorage>;

  beforeEach(() => {
    fake = createFakeStorage();
  });

  test("숨긴 적이 없으면 숨김 상태가 아니다", () => {
    expect(isReviewChipDismissed(fake.storage)).toBe(false);
  });

  test("숨기면 저장소에 기록되고 이후 숨김 상태로 읽힌다", () => {
    dismissReviewChip(fake.storage);

    expect(fake.values[REVIEW_CHIP_DISMISS_KEY]).toBeDefined();
    expect(isReviewChipDismissed(fake.storage)).toBe(true);
  });

  test("다른 값이 들어 있으면 숨김 상태로 보지 않는다", () => {
    const tampered = createFakeStorage({ [REVIEW_CHIP_DISMISS_KEY]: "0" });

    expect(isReviewChipDismissed(tampered.storage)).toBe(false);
  });

  test("저장소 접근이 막혀 있어도 예외를 던지지 않고 칩을 보여 준다", () => {
    const blocked = createThrowingStorage();

    expect(() => dismissReviewChip(blocked)).not.toThrow();
    expect(isReviewChipDismissed(blocked)).toBe(false);
  });
});
