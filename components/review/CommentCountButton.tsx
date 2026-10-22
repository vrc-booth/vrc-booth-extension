import { i18n } from "#i18n";
import { IconMessageCircle } from "@tabler/icons-react";
import { COMMENTS_PAGE_SIZE } from "./constants";
import { useProductCommentsQuery, useProductQuery } from "./queries";
import { focusReviewForm } from "./reviewBoardFocus";

/** Sits beside BOOTH's wishlist heart and copies that button's exact proportions. */
export function CommentCountButton() {
  const product = useProductQuery();
  const comments = useProductCommentsQuery(product.data?.id ?? null, COMMENTS_PAGE_SIZE);
  const count = comments.data?.pages[0]?.count;
  // Never turn an unavailable or pending response into a misleading zero.
  if (!product.isSuccess || !product.data || !comments.isSuccess || count == null) return null;

  return (
    <button
      type="button"
      aria-label={i18n.t("reviewBoard.commentsCount", [count])}
      title={i18n.t("reviewBoard.commentsCount", [count])}
      onClick={() => focusReviewForm()}
      className="inline-flex h-12 min-w-16 cursor-pointer items-center justify-center gap-1 rounded-lg border-2 border-booth-border bg-white px-3 text-sm text-booth-sub transition-colors hover:border-booth-sub hover:bg-booth-surface-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-booth-sub"
    >
      <IconMessageCircle size={24} stroke={1.5} aria-hidden="true" />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
