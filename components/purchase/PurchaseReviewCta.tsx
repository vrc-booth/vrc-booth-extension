import { COMMENTS_PAGE_SIZE } from "@/components/review/constants";
import { useProductCommentsQuery, useProductQuery } from "@/components/review/queries";
import { focusReviewForm } from "@/components/review/reviewBoardFocus";
import { dismissReviewChip, isReviewChipDismissed } from "@/utils/purchase-review";
import { formatScore } from "@/utils/review-utils";
import { IconStar, IconStarFilled, IconX } from "@tabler/icons-react";
import { useState } from "react";
import { i18n } from "#i18n";

const CHIP_CLASS_NAME =
  "inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 " +
  "text-[11px] font-semibold text-slate-700 transition " +
  "hover:border-[#fc4d50]/50 hover:text-[#fc4d50] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc4d50]/40";

/**
 * 가격·구매 영역 바로 위에 놓이는 요약 칩이다. 평점과 리뷰 수만 보여 주고, 리뷰
 * 본문과 작성 기능은 아래 리뷰 보드가 그대로 맡는다. 구매 버튼을 가리거나 그와
 * 경쟁하지 않도록 카드나 전체 폭 버튼을 두지 않는다.
 */
export function PurchaseReviewCta() {
  const [isDismissed, setIsDismissed] = useState(isReviewChipDismissed);

  const productQuery = useProductQuery();
  const product = productQuery.data ?? null;
  const productId = product?.id ?? null;

  /* 리뷰 보드와 같은 페이지 크기를 써서 캐시를 공유하므로 요청이 늘지 않는다. */
  const commentsQuery = useProductCommentsQuery(productId, COMMENTS_PAGE_SIZE);
  const reviewCount = commentsQuery.data?.pages?.[0]?.count ?? 0;

  if (isDismissed || productQuery.isLoading || commentsQuery.isLoading || !product) {
    return null;
  }

  const handleDismiss = () => {
    dismissReviewChip();
    setIsDismissed(true);
  };

  const hasReviews = reviewCount > 0;

  return (
    <section
      className="mb-2 flex items-center gap-1"
      aria-label={i18n.t("purchaseReview.label")}
    >
      <button type="button" className={CHIP_CLASS_NAME} onClick={() => focusReviewForm()}>
        {hasReviews ? (
          <>
            <IconStarFilled className="shrink-0 text-yellow-500" size={12} />
            <span>{formatScore(product.score)}</span>
            <span aria-hidden className="text-slate-300">
              ·
            </span>
            <span className="font-medium text-slate-500">
              {i18n.t("purchaseReview.reviewCount", [reviewCount])}
            </span>
          </>
        ) : (
          <>
            <IconStar className="shrink-0 text-slate-400" size={12} />
            <span className="font-medium">{i18n.t("purchaseReview.writeFirst")}</span>
          </>
        )}
      </button>

      <button
        type="button"
        className="rounded-full p-1 text-slate-300 transition hover:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc4d50]/40"
        aria-label={i18n.t("purchaseReview.dismiss")}
        onClick={handleDismiss}
      >
        <IconX size={12} />
      </button>
    </section>
  );
}
