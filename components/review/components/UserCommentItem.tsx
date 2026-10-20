import { ReviewImages } from "./ReviewImages";
import { i18n } from "#i18n";
import { formatDateTime, formatScore } from "@/utils/review-utils";
import type { CommentItem } from "@/components/review/types";

type Props = {
  comment: CommentItem;
};

export function UserCommentItem({ comment }: Props) {
  return (
    <article className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm shadow-sm">
      <p className="text-[11px] text-slate-500">{formatDateTime(comment.updatedAt)}</p>
      <p className="mt-1 text-slate-900">{comment.blinded ? i18n.t("reviewBoard.blinded") : comment.content}</p>
      <ReviewImages images={comment.images} blinded={comment.blinded} />
      <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-[#fc4d50]">
        <span>⭐︎</span>
        <span>{formatScore(comment.score)}</span>
      </p>
    </article>
  );
}
