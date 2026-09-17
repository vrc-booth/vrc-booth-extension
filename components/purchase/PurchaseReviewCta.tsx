import ReviewHighlightQuote from "@/components/purchase/ReviewHighlightQuote";
import { loginWithDiscord } from "@/components/review/auth";
import { useProductQuery, useSortedCommentsQuery, useUserProfileQuery } from "@/components/review/queries";
import { focusReviewForm } from "@/components/review/reviewBoardFocus";
import StarIcons from "@/components/StarIcon";
import { MIN_REVIEWS_FOR_HIGHLIGHT, selectReviewHighlights } from "@/utils/purchase-review";
import { formatScore } from "@/utils/review-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { i18n } from "#i18n";

/**
 * 하이라이트 후보를 받아 오는 건수다. 평점을 남기지 않았거나 본문이 빈 리뷰를
 * 걸러 내고도 양 끝을 집을 수 있도록 여유를 둔다.
 */
const HIGHLIGHT_CANDIDATE_LIMIT = 5;

const CARD_CLASS_NAME = "rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm";

/**
 * 구매 버튼 바로 위에 붙어서, 이미 쌓인 리뷰를 요약해 보여 주거나 리뷰가 없으면
 * 작성을 유도한다. 리뷰 보드와 같은 QueryClient를 공유하므로 상품과 사용자 정보는
 * 다시 요청하지 않는다.
 */
export function PurchaseReviewCta() {
  const queryClient = useQueryClient();

  const productQuery = useProductQuery();
  const userQuery = useUserProfileQuery();

  const product = productQuery.data ?? null;
  const productId = product?.id ?? null;
  const isAuthenticated = Boolean(userQuery.data);

  const bestQuery = useSortedCommentsQuery(productId, "score_desc", HIGHLIGHT_CANDIDATE_LIMIT);
  const reviewCount = bestQuery.data?.count ?? 0;

  /*
   * 최저 평점 목록은 하이라이트를 실제로 그릴 만큼 리뷰가 쌓였을 때에만 요청한다.
   * 리뷰가 적은 상품에서 쓸데없는 왕복을 만들지 않기 위해서다.
   */
  const worstQuery = useSortedCommentsQuery(productId, "score_asc", HIGHLIGHT_CANDIDATE_LIMIT, {
    enabled: Boolean(productId) && reviewCount >= MIN_REVIEWS_FOR_HIGHLIGHT,
  });

  const highlights = useMemo(
    () =>
      selectReviewHighlights(
        bestQuery.data?.comments ?? [],
        worstQuery.data?.comments ?? [],
        reviewCount,
      ),
    [bestQuery.data?.comments, worstQuery.data?.comments, reviewCount],
  );

  const loginMutation = useMutation<void, Error, void>({
    mutationFn: loginWithDiscord,
    onSuccess: async () => {
      await queryClient.invalidateQueries();
      focusReviewForm();
    },
  });

  const handleWriteReview = () => {
    if (isAuthenticated) {
      focusReviewForm();
      return;
    }

    loginMutation.mutate();
  };

  if (productQuery.isLoading || bestQuery.isLoading) {
    return (
      <div className={`${CARD_CLASS_NAME} animate-pulse`}>
        <span className="block h-4 w-2/3 rounded-full bg-slate-200" />
        <span className="mt-3 block h-8 rounded-full bg-slate-100" />
      </div>
    );
  }

  /* 서비스에 등록되지 않은 상품은 리뷰를 달 대상이 없으므로 아무것도 그리지 않는다. */
  if (!product) {
    return null;
  }

  const writeButtonLabel = loginMutation.isPending
    ? i18n.t("purchaseReview.button.loggingIn")
    : isAuthenticated
      ? i18n.t("purchaseReview.button.write")
      : i18n.t("purchaseReview.button.loginAndWrite");

  return (
    <section className={CARD_CLASS_NAME} aria-label={i18n.t("purchaseReview.title")}>
      {reviewCount > 0 ? (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StarIcons score={product.score} size={14} />
              <span className="text-sm font-semibold text-slate-900">
                {formatScore(product.score)}
              </span>
              <span className="text-[11px] text-slate-500">
                {i18n.t("purchaseReview.reviewCount", [reviewCount])}
              </span>
            </div>
            <button
              type="button"
              className="shrink-0 text-[11px] font-semibold text-[#fc4d50] underline-offset-2 transition hover:underline"
              onClick={() => focusReviewForm()}
            >
              {i18n.t("purchaseReview.viewAll")}
            </button>
          </div>

          {highlights.length > 0 && (
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-slate-600">
                {i18n.t("purchaseReview.highlightTitle")}
              </p>
              {highlights.map((highlight) => (
                <ReviewHighlightQuote key={highlight.comment.id} highlight={highlight} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold text-slate-900">
            {i18n.t("purchaseReview.empty.title")}
          </p>
          <p className="text-[11px] leading-relaxed text-slate-500">
            {i18n.t("purchaseReview.empty.description")}
          </p>
        </div>
      )}

      <button
        type="button"
        className="mt-3 w-full rounded-2xl bg-gradient-to-r from-[#fc4d50] to-[#ff826a] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
        onClick={handleWriteReview}
        disabled={loginMutation.isPending}
      >
        {writeButtonLabel}
      </button>

      {loginMutation.isError && (
        <p className="mt-2 text-[11px] text-red-600">{i18n.t("messages.loginError")}</p>
      )}
    </section>
  );
}
