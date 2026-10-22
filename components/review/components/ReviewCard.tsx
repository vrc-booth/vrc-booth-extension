import { i18n } from "#i18n";
import StarIcons from "@/components/StarIcon";
import type { CommentItem } from "@/components/review/types";
import { formatDateTime } from "@/utils/review-utils";
import { ReviewImages } from "./ReviewImages";

type Props = {
  comment: CommentItem;
  /** Off where every entry belongs to the viewer, such as the account page. */
  showAuthor?: boolean;
  /** Tints the viewer's own review inside a public list. */
  highlighted?: boolean;
};

const reviewAuthorName = (user: CommentItem["user"]) =>
  user.anonymous ? i18n.t("reviewBoard.anonymous") : user.deactivated ? i18n.t("reviewBoard.deactivated") : user.username;

/** One review, shared by the product board and the account page. */
export function ReviewCard({ comment, showAuthor = true, highlighted = false }: Props) {
  return (
    <article
      className={`rounded-2xl border px-4 py-3 shadow-sm transition ${
        highlighted ? "border-[#fc4d50]/40 bg-[#fc4d50]/10" : "border-slate-100 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {showAuthor && <p className="truncate text-sm font-semibold text-slate-900">{reviewAuthorName(comment.user)}</p>}
          <p className="text-[11px] text-slate-500">{formatDateTime(comment.updatedAt)}</p>
        </div>
        <StarIcons score={comment.score} size={12} />
      </div>
      <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line text-slate-900">
        {comment.blinded ? i18n.t("reviewBoard.blinded") : comment.content}
      </p>
      <ReviewImages images={comment.images} blinded={comment.blinded} />
    </article>
  );
}
