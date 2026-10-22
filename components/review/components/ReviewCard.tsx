import { i18n } from "#i18n";
import StarIcons from "@/components/StarIcon";
import type { CommentItem } from "@/components/review/types";
import { formatDateTime } from "@/utils/review-utils";
import { ReviewImages } from "./ReviewImages";

type Props = {
  comment: CommentItem;
  /** Off where every entry belongs to the viewer, such as the account page. */
  showAuthor?: boolean;
  /** Marks the viewer's own review inside a public list with a small label. */
  highlighted?: boolean;
};

const reviewAuthorName = (user: CommentItem["user"]) =>
  user.anonymous ? i18n.t("reviewBoard.anonymous") : user.deactivated ? i18n.t("reviewBoard.deactivated") : user.username;

/** One review row. Flat and divider-separated so it reads like BOOTH's own lists. */
export function ReviewCard({ comment, showAuthor = true, highlighted = false }: Props) {
  return (
    <article className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-xs text-booth-sub">
          {showAuthor && (
            <p className="flex items-center gap-2 text-sm font-bold text-booth-text">
              <span className="truncate">{reviewAuthorName(comment.user)}</span>
              {highlighted && <span className="shrink-0 text-xs text-booth-primary">{i18n.t("reviewBoard.mine")}</span>}
            </p>
          )}
          <p>{formatDateTime(comment.updatedAt)}</p>
        </div>
        <StarIcons score={comment.score} size={14} />
      </div>
      <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-line text-booth-text">
        {comment.blinded ? i18n.t("reviewBoard.blinded") : comment.content}
      </p>
      <ReviewImages images={comment.images} blinded={comment.blinded} />
    </article>
  );
}
