import type { CommentItem } from "@/components/review/types";
import { UserCommentItem } from "./UserCommentItem";
import { i18n } from "#i18n";

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

export function UserCommentsList({
  comments,
  count,
  page,
  pageSize,
  isLoading,
  isFetching,
  onPageChange,
  onRefresh,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const hasNoComments = !isLoading && comments.length === 0;

  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{i18n.t("userComments.title")}</h2>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>{i18n.t("userComments.total", { count })}</span>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-900"
            onClick={onRefresh}
            disabled={isFetching}
          >
            {i18n.t("userComments.refresh")}
          </button>
        </div>
      </div>

      {isLoading && <p className="text-xs text-slate-500">{i18n.t("userComments.loading")}</p>}
      {hasNoComments && <p className="text-xs text-slate-500">{i18n.t("userComments.empty")}</p>}

      <div className="space-y-3">
        {comments.map((comment) => (
          <UserCommentItem key={comment.id} comment={comment} />
        ))}
      </div>

      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <button
          type="button"
          className="rounded-2xl border border-slate-200 px-3 py-1 transition hover:border-[#fc4d50]/70"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          {i18n.t("userComments.previous")}
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="rounded-2xl border border-slate-200 px-3 py-1 transition hover:border-[#fc4d50]/70 disabled:opacity-60"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
        >
          {i18n.t("userComments.next")}
        </button>
      </div>
    </section>
  );
}
