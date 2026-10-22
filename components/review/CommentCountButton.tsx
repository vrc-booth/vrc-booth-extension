import { i18n } from "#i18n";
import { IconMessageCircle } from "@tabler/icons-react";
import { COMMENTS_PAGE_SIZE } from "./constants";
import { useProductCommentsQuery, useProductQuery } from "./queries";
import { focusReviewForm } from "./reviewBoardFocus";

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
      className="inline-flex h-12 min-w-16 cursor-pointer items-center justify-center gap-1 rounded-lg border-2 border-[#d4d9e1] bg-white px-3 text-sm font-normal text-[#8190a5] transition-colors hover:border-[#8190a5] hover:bg-[#f7f8fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8190a5]"
    >
      <IconMessageCircle size={24} stroke={1.5} aria-hidden="true" />
      <span className="tabular-nums">{count}</span>
    </button>
  );
}
