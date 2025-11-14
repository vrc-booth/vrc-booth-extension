import {
  API_BASE,
  deleteComment,
  downvoteComment,
  submitComment,
  upvoteComment,
} from "@/components/review/api";
import { sendMessage } from "@/components/review/messaging";
import {
  useMyCommentQuery,
  useProductCommentsQuery,
  useProductQuery,
  useUserProfileQuery,
} from "@/components/review/queries";
import { ApiError, formatDateTime } from "@/utils/review-utils";
import { authTokenStorage } from "@/utils/storage";
import { showErrorToast } from "@/utils/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";
import { CommentItem } from "./review/types";
import StarIcons from "./StarIcon";

const DEFAULT_SCORE = 8;
const COMMENTS_PAGE_SIZE = 10;

type SubmitVariables = {
  productId: string;
  method: "POST" | "PUT";
  body: {
    content: string;
    score: number;
  };
  isUpdate: boolean;
};

export function ReviewBoard() {
  const queryClient = useQueryClient();

  const productQuery = useProductQuery();
  const userQuery = useUserProfileQuery();

  const product = productQuery.data ?? null;
  const user = userQuery.data;
  const productId = product?.id ?? null;

  const commentsQuery = useProductCommentsQuery(productId, COMMENTS_PAGE_SIZE);
  const myCommentQuery = useMyCommentQuery(productId);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const comments = commentsQuery.data?.pages?.flatMap((page) => page.comments) ?? [];
  const totalCount = commentsQuery.data?.pages?.[0]?.count ?? 0;
  const commentCount = totalCount;
  const totalPages = totalCount > 0 ? Math.max(1, Math.ceil(totalCount / COMMENTS_PAGE_SIZE)) : 1;
  const pagesLoaded = commentsQuery.data?.pages.length ?? 0;
  const currentPageNumber = pagesLoaded === 0 ? 1 : Math.min(pagesLoaded, totalPages);
  const hasMoreComments = Boolean(commentsQuery.hasNextPage);
  const isFetchingNextPage = commentsQuery.isFetchingNextPage;
  const myComment = myCommentQuery.data ?? null;
  const showEmptyComments = !commentsQuery.isLoading && comments.length === 0;
  const commentsLoading = commentsQuery.isLoading;

  const [formState, setFormState] = useState({
    content: "",
    score: DEFAULT_SCORE,
  });
  useEffect(() => {
    if (!productQuery.isError) {
      return;
    }

    const message =
      productQuery.error instanceof Error
        ? productQuery.error.message
        : "리뷰를 가져오는 데 실패했습니다.";
    showErrorToast(message);
  }, [productQuery.error, productQuery.isError]);

  useEffect(() => {
    if (!myComment) {
      return;
    }

    setFormState((previous) => ({
      ...previous,
      content: myComment.content,
      score: typeof myComment.score === "number" ? myComment.score : previous.score,
    }));
  }, [myComment?.id]);

  useEffect(() => {
    const element = loadMoreTriggerRef.current;
    if (!element || !hasMoreComments) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreComments && !isFetchingNextPage) {
          commentsQuery.fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMoreComments, isFetchingNextPage, commentsQuery.fetchNextPage, productId]);

  const submitMutation = useMutation<void, Error, SubmitVariables>({
    mutationFn: ({ productId, method, body }: SubmitVariables) => submitComment(productId, method, body),
    onSuccess(_, variables) {
      queryClient.invalidateQueries({ queryKey: ["comments", variables.productId, COMMENTS_PAGE_SIZE] });
      queryClient.invalidateQueries({ queryKey: ["myComment", variables.productId] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        showErrorToast("내용을 확인해주세요.");
      } else {
        showErrorToast("댓글을 저장하는 동안 오류가 발생했습니다.");
      }
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: (targetProductId: string) => deleteComment(targetProductId),
    onSuccess(_, targetProductId) {
      queryClient.invalidateQueries({ queryKey: ["comments", targetProductId, COMMENTS_PAGE_SIZE] });
      queryClient.invalidateQueries({ queryKey: ["myComment", targetProductId] });
      setFormState({ content: "", score: DEFAULT_SCORE });
    },
    onError() {
      showErrorToast("댓글을 삭제하는 동안 오류가 발생했습니다.");
    },
  });

  const voteMutation = useMutation<
    void,
    Error,
    { comment: CommentItem; direction: "upvote" | "downvote" }
  >({
    mutationFn: ({ comment, direction }) =>
      direction === "upvote" ? upvoteComment(comment) : downvoteComment(comment),
    onSuccess(_, variables) {
      if (productId) {
        queryClient.invalidateQueries({ queryKey: ["comments", productId, COMMENTS_PAGE_SIZE] });
        queryClient.invalidateQueries({ queryKey: ["myComment", productId] });
      }
    },
    onError(e) {
      try {
        const error = JSON.parse(e.message);
        switch(error.message) {
          case 'cannot upvote your own comment':
            showErrorToast("자신의 리뷰에는 추천을 할 수 없습니다.");
            break;
          case 'cannot downvote your own comment':
            showErrorToast("자신의 리뷰에는 비추천을 할 수 없습니다.");
            break;
          default:
            showErrorToast("투표 중 오류가 발생했습니다.");
            break;
        }
      } catch {
        showErrorToast("투표 중 오류가 발생했습니다.");
      }
    },
  });

  const refreshAuthDependentData = async () => {
    await Promise.all([
      userQuery.refetch(),
      commentsQuery.refetch(),
      myCommentQuery.refetch(),
    ]);
  };

  const handleLogin = async () => {
    const redirectUrl = `https://${browser.runtime.id}.chromiumapp.org/`
    const authUrl = `${API_BASE}/auth/oauth/discord?redirectUrl=${redirectUrl}`;
    const code = await sendMessage('loginWithDiscord', authUrl);
    const response = await fetch(`${API_BASE}/auth/oauth/discord/callback?code=${code}&redirectUrl=${redirectUrl}`);
    const authToken = await response.json();
    await authTokenStorage.setValue(authToken);
    await refreshAuthDependentData();
    setFormState({ content: "", score: DEFAULT_SCORE });
  };

  const handleLogout = async () => {
    try {
      await authTokenStorage.setValue(null);
      await refreshAuthDependentData();
      await closeSidePanel();
      setFormState({ content: "", score: DEFAULT_SCORE });
    } catch {
      showErrorToast("로그아웃 중 오류가 발생했습니다.");
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!product) {
      return;
    }

    if (!user) {
      showErrorToast("로그인이 필요합니다.");
      return;
    }

    const trimmed = formState.content.trim();
    if (!trimmed) {
      showErrorToast("내용을 입력해주세요.");
      return;
    }

    const method: "POST" | "PUT" = myComment ? "PUT" : "POST";
    submitMutation.mutate({
      productId: product.id,
      method,
      body: {
        content: trimmed,
        score: formState.score,
      },
      isUpdate: Boolean(myComment),
    });
  };

  const handleDelete = () => {
    if (!product || !myComment) return;
    deleteMutation.mutate(product.id);
  };

  const isSubmitting = submitMutation.isPending || deleteMutation.isPending;
  const isAuthenticated = Boolean(user);
  const canEdit = isAuthenticated;
  const isBusy = isSubmitting || productQuery.isFetching;

  const handleVote = (comment: CommentItem, direction: "upvote" | "downvote") => {
    if (!isAuthenticated) {
      showErrorToast("로그인이 필요합니다.");
      return;
    }

    voteMutation.mutate({ comment, direction });
  };

  const handleLoadMoreComments = () => {
    if (!hasMoreComments || isFetchingNextPage) {
      return;
    }

    commentsQuery.fetchNextPage();
  };

  const handleStarSelect = (value: number) => {
    if (!canEdit || isSubmitting) {
      return;
    }

    setFormState((previous) => ({ ...previous, score: value }));
  };

  const openSidePanel = async () => sendMessage('openSidePanel');
  const closeSidePanel = async () => sendMessage('closeSidePanel');

  if (productQuery.isLoading) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow">
        <p className="text-sm text-slate-500">리뷰를 불러오는 중입니다…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] text-slate-400">
              최신순으로 정렬되며 좋아요/싫어요 정보도 표시됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#fc4d50]">댓글 {commentCount}</span>
            <button
              type="button"
              className="rounded-full border border-[#fc4d50]/40 bg-[#fc4d50]/10 px-3 py-1 text-xs font-medium text-[#fc4d50] transition hover:bg-[#fc4d50]/20 disabled:opacity-60"
              onClick={isAuthenticated ? handleLogout : handleLogin}
              disabled={isBusy}
            >
              {isAuthenticated ? `로그아웃` : "로그인"}
            </button>
            {isAuthenticated && (
              <button          
                type="button"
                className="rounded-full border border-[#fc4d50]/40 bg-[#fc4d50]/10 px-3 py-1 text-xs font-medium text-[#fc4d50] transition hover:bg-[#fc4d50]/20 disabled:opacity-60"
                onClick={isAuthenticated && openSidePanel}>
                계정 설정
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-3 max-h-[360px] overflow-y-auto pr-2">
          {commentsLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="flex animate-pulse gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                >
                  <span className="h-10 w-10 rounded-full bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <span className="block h-3 w-1/3 rounded-full bg-slate-200" />
                    <span className="block h-4 rounded-full bg-slate-200" />
                    <span className="block h-3 w-2/3 rounded-full bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {showEmptyComments && (
            <p className="text-xs text-slate-500">아직 댓글이 없습니다. 첫 경험을 공유해 보세요.</p>
          )}

          {!commentsLoading &&
            comments.map((comment) => {
              const mine = user && comment.user.id === user.id;
              const avatarUrl = `${API_BASE}/user/avatar/${comment.user.id}`;
            return (
              <article
                key={comment.id}
                className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-sm transition ${
                  mine ? "border-[#fc4d50]/40 bg-[#fc4d50]/10" : "border-slate-100 bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="relative h-10 w-10 overflow-hidden rounded-full bg-slate-100">
                    <img
                      src={avatarUrl}
                      alt={`${comment.user.username} avatar`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{comment.user.username}</p>
                        <p className="text-[11px] text-slate-500">{formatDateTime(comment.updatedAt)}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">
                        <StarIcons score={comment.score} size={12} />
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-900">{comment.content}</p>
                  </div>
                </div>
                <footer className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-500">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-[#fc4d50] transition hover:border-[#fc4d50]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc4d50]/40 disabled:opacity-60"
                    onClick={() => handleVote(comment, "upvote")}
                    disabled={!isAuthenticated || voteMutation.isPending}
                    aria-label="댓글 좋아요"
                  >
                    <span>👍</span>
                    <span>{comment.upvotes ?? 0}</span>
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500 transition hover:border-[#fc4d50]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc4d50]/40 disabled:opacity-60"
                    onClick={() => handleVote(comment, "downvote")}
                    disabled={!isAuthenticated || voteMutation.isPending}
                    aria-label="댓글 싫어요"
                  >
                    <span>👎</span>
                    <span>{comment.downvotes ?? 0}</span>
                  </button>
                </footer>
              </article>
            );
          })}

          {isFetchingNextPage && (
            <p className="text-xs text-slate-500 text-center">다음 페이지를 불러오는 중입니다…</p>
          )}

          <div ref={loadMoreTriggerRef} className="h-px" />
        </div>

        <form className="mt-4 space-y-4 border-t border-slate-100 pt-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor="review-content">
              나의 댓글
            </label>
            <textarea
              id="review-content"
              rows={4}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-inner transition focus:border-[#fc4d50]/80 focus:outline-none"
              value={formState.content}
              onChange={(event) =>
                setFormState((previous) => ({ ...previous, content: event.target.value }))
              }
              placeholder="직접 사용한 경험을 솔직하게 공유해보세요."
              disabled={!canEdit || isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
            <label className="text-[11px]" htmlFor="review-score">
              평점
            </label>
            <div className="flex gap-1">
              <StarIcons
                score={formState.score}
                interactive
                onSelect={(value) => handleStarSelect(value)}
              />
            </div>
            {!canEdit && (
              <p className="text-[11px] text-slate-400">
                로그인하면 댓글을 쓸 수 있어요.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="flex-1 rounded-2xl bg-gradient-to-r from-[#fc4d50] to-[#ff826a] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              type="submit"
              disabled={!canEdit || isSubmitting}
            >
              {submitMutation.isPending ? "저장 중…" : myComment ? "댓글 수정" : "댓글 등록"}
            </button>

            {myComment && (
              <button
                type="button"
                className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                {deleteMutation.isPending ? "삭제 중…" : "댓글 삭제"}
              </button>
            )}
          </div>
        </form>

      </div>
    </div>
  );
}
