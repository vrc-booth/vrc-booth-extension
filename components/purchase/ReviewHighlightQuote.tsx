import { formatScore } from "@/utils/review-utils";
import type { ReviewHighlight } from "@/utils/purchase-review";
import { IconThumbDown, IconThumbUp } from "@tabler/icons-react";
import { i18n } from "#i18n";

type Props = {
  highlight: ReviewHighlight;
};

/**
 * 사이트의 신뢰 하이라이트와 같은 어조로 리뷰 한 건을 인용한다. 구매 칼럼은 폭이
 * 좁으므로 본문은 세 줄까지만 보여 주고 나머지는 리뷰 보드에서 확인하게 한다.
 */
const ReviewHighlightQuote = ({ highlight }: Props) => {
  const isBest = highlight.kind === "best";
  const Icon = isBest ? IconThumbUp : IconThumbDown;
  const labelClassName = isBest ? "text-emerald-700" : "text-rose-700";
  const label = isBest
    ? i18n.t("purchaseReview.highlightBest")
    : i18n.t("purchaseReview.highlightWorst");

  return (
    <div className="flex flex-col gap-1">
      <p className={`inline-flex items-center gap-1 text-[11px] font-semibold ${labelClassName}`}>
        <Icon className="shrink-0" size={14} />
        {label}
      </p>
      <blockquote className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
        <p className="line-clamp-3 text-xs leading-relaxed text-slate-900">
          {highlight.comment.content}
        </p>
        <footer className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
          <span className="truncate">{highlight.comment.user.username}</span>
          <span className="font-semibold text-slate-600">
            {formatScore(highlight.comment.score)}
          </span>
        </footer>
      </blockquote>
    </div>
  );
};

export default ReviewHighlightQuote;
