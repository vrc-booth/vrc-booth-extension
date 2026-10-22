import type { CommentItem } from "@/components/review/types";
import { SMALL_BUTTON_CLASS, TEXT_BUTTON_CLASS } from "@/components/ui/buttons";
import { i18n } from "#i18n";
import { ReviewCard } from "./ReviewCard";

type Props = {
  comments: CommentItem[];
  count: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  isFetching: boolean;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
};

export function UserCommentsList({ comments, count, page, pageSize, isLoading, isFetching, onPageChange, onRefresh }: Props) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const hasNoComments = !isLoading && comments.length === 0;

  return (
    <section aria-labelledby="user-comments-title">
      <div className="flex items-center justify-between gap-3 border-b border-booth-border pb-2">
        <h2 id="user-comments-title" className="text-base font-bold text-booth-heading">
          {i18n.t("userComments.title")}
          <span className="ml-2 text-sm font-normal text-booth-sub">{i18n.t("userComments.total", [count])}</span>
        </h2>
        <button type="button" className={TEXT_BUTTON_CLASS} onClick={onRefresh} disabled={isFetching}>
          {i18n.t("userComments.refresh")}
        </button>
      </div>

      {isLoading && <p className="py-6 text-center text-sm text-booth-sub">{i18n.t("userComments.loading")}</p>}
      {hasNoComments && <p className="py-6 text-center text-sm text-booth-sub">{i18n.t("userComments.empty")}</p>}

      <div className="divide-y divide-booth-divider">
        {comments.map((comment) => (
          <ReviewCard key={comment.id} comment={comment} showAuthor={false} />
        ))}
      </div>

      {totalPages > 1 && (
        <nav className="mt-3 flex items-center justify-between text-xs text-booth-sub">
          <button type="button" className={SMALL_BUTTON_CLASS} onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>
            {i18n.t("userComments.previous")}
          </button>
          <span className="tabular-nums">{page} / {totalPages}</span>
          <button type="button" className={SMALL_BUTTON_CLASS} onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            {i18n.t("userComments.next")}
          </button>
        </nav>
      )}
    </section>
  );
}
