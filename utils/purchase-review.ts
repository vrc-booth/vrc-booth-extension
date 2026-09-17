import type { CommentItem } from "@/components/review/types";

/**
 * 구매 CTA 옆 요약은 좁은 칼럼에 들어가므로 인용할 리뷰를 최대 두 건만 세운다.
 * 리뷰가 이 수에 미치지 못하면 양 끝을 나눌 만한 분포가 없다고 보고 하이라이트를
 * 그리지 않으며, 사이트의 신뢰 하이라이트(#18-A)와 같은 기준을 사용한다.
 */
export const MIN_REVIEWS_FOR_HIGHLIGHT = 4;

export type ReviewHighlightKind = "best" | "worst";

export type ReviewHighlight = {
  kind: ReviewHighlightKind;
  comment: CommentItem;
};

/**
 * 평점을 남기지 않은 리뷰는 점수가 0으로 들어오고, 본문이 빈 리뷰는 인용해도
 * 보여 줄 근거가 없다. 두 경우 모두 하이라이트에서 제외한다.
 */
const isQuotable = (comment: CommentItem) =>
  comment.score > 0 && comment.content.trim().length > 0;

/**
 * 정렬 API가 내려준 두 목록에서 인용할 리뷰를 고른다. `bestFirst` 는 `score_desc`,
 * `worstFirst` 는 `score_asc` 로 받은 첫 페이지다.
 *
 * 높은 평점만 내걸면 고른 티가 나서 오히려 신뢰를 깎기 때문에, 최고 평점보다
 * 실제로 낮은 리뷰가 있을 때에만 반대쪽을 함께 세운다.
 */
export const selectReviewHighlights = (
  bestFirst: CommentItem[],
  worstFirst: CommentItem[],
  totalCount: number,
): ReviewHighlight[] => {
  if (totalCount < MIN_REVIEWS_FOR_HIGHLIGHT) {
    return [];
  }

  const best = bestFirst.find(isQuotable);
  if (!best) {
    return [];
  }

  const worst = worstFirst.find(
    (comment) => isQuotable(comment) && comment.id !== best.id && comment.score < best.score,
  );

  return worst
    ? [
        { kind: "best", comment: best },
        { kind: "worst", comment: worst },
      ]
    : [{ kind: "best", comment: best }];
};
