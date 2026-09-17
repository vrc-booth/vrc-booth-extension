import { describe, expect, test } from "vitest";
import type { CommentItem } from "@/components/review/types";
import { MIN_REVIEWS_FOR_HIGHLIGHT, selectReviewHighlights } from "./purchase-review";

const createComment = (overrides: Partial<CommentItem> & { id: string }): CommentItem => ({
  content: "직접 써 보고 남기는 후기입니다.",
  score: 8,
  updatedAt: "2026-09-01T00:00:00.000Z",
  user: { id: `user-${overrides.id}`, username: `user-${overrides.id}` },
  ...overrides,
});

describe("selectReviewHighlights", () => {
  test("리뷰 수가 최소 기준에 미치지 못하면 하이라이트를 만들지 않는다", () => {
    const comments = [createComment({ id: "1", score: 10 })];

    const highlights = selectReviewHighlights(comments, comments, MIN_REVIEWS_FOR_HIGHLIGHT - 1);

    expect(highlights).toEqual([]);
  });

  test("최고 평점과 최저 평점을 각각 한 건씩 세운다", () => {
    const best = createComment({ id: "best", score: 10 });
    const worst = createComment({ id: "worst", score: 2 });

    const highlights = selectReviewHighlights([best, worst], [worst, best], 6);

    expect(highlights).toEqual([
      { kind: "best", comment: best },
      { kind: "worst", comment: worst },
    ]);
  });

  test("평점을 남기지 않았거나 본문이 빈 리뷰는 인용하지 않는다", () => {
    const scoreless = createComment({ id: "scoreless", score: 0 });
    const blank = createComment({ id: "blank", score: 9, content: "   " });
    const quotable = createComment({ id: "quotable", score: 6 });

    const highlights = selectReviewHighlights([blank, quotable, scoreless], [scoreless, quotable, blank], 5);

    expect(highlights).toEqual([{ kind: "best", comment: quotable }]);
  });

  test("최고 평점보다 낮은 리뷰가 없으면 최고 평점만 세운다", () => {
    const first = createComment({ id: "1", score: 10 });
    const second = createComment({ id: "2", score: 10 });

    const highlights = selectReviewHighlights([first, second], [second, first], 4);

    expect(highlights).toEqual([{ kind: "best", comment: first }]);
  });
});
