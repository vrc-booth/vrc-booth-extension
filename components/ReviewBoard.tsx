import { i18n } from "#i18n";
import {
  deleteComment,
  submitComment,
} from "@/components/review/api";
import { sendMessage } from "@/components/review/messaging";
import {
  useMyCommentQuery,
  useProductCommentsQuery,
  useProductQuery,
  useUserProfileQuery,
} from "@/components/review/queries";
import { ApiError, formatDateTime } from "@/utils/review-utils";
import { loginWithDiscord } from "@/components/review/auth";
import { COMMENTS_PAGE_SIZE } from "@/components/review/constants";
import { REVIEW_FORM_FIELD_ID } from "@/components/review/reviewBoardFocus";
import { showErrorToast } from "@/utils/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useRef, useState } from "react";
import StarIcons from "./StarIcon";

const DEFAULT_SCORE = 8;
const MAX_COMMENT_LENGTH = 500;

type SubmitVariables = {
  productId: string;
  method: "POST" | "PUT";
  body: {
    content: string;
    score: number;
  };
  isUpdate: boolean;
};

const isForbiddenWriteError = (error: Error) => {
  if (!(error instanceof ApiError) || error.status !== 403) {
    return false;
  }

  try {
    return JSON.parse(error.message)?.message === "forbidden";
  } catch {
    return false;
  }
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
  const hasMoreComments = Boolean(commentsQuery.hasNextPage);
  const isFetchingNextPage = commentsQuery.isFetchingNextPage;
  const myComment = myCommentQuery.data ?? null;
  const showEmptyComments = Boolean(product) && commentsQuery.isSuccess && comments.length === 0;
  const commentsLoading = commentsQuery.isLoading;

  const [isAuthPending, setIsAuthPending] = useState(false);
  const [showUsernameHint, setShowUsernameHint] = useState(false);
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
        : i18n.t("messages.fetchReviewFailed");
    showErrorToast(message);
  }, [productQuery.error, productQuery.isError]);

  const lastUserId = useRef(user?.id);
  useEffect(() => {
    if (lastUserId.current && lastUserId.current !== user?.id) {
      setFormState({ content: "", score: DEFAULT_SCORE });
      setShowUsernameHint(false);
    }
    lastUserId.current = user?.id;
  }, [user?.id]);

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
      setShowUsernameHint(false);
      queryClient.invalidateQueries({ queryKey: ["comments", variables.productId, COMMENTS_PAGE_SIZE] });
      queryClient.invalidateQueries({ queryKey: ["myComment", variables.productId] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
    },
    onError: (error) => {
      if (isForbiddenWriteError(error)) {
        setShowUsernameHint(true);
        showErrorToast(i18n.t("messages.usernameSetupHint"));
      } else if (error instanceof ApiError && error.status === 400) {
        showErrorToast(i18n.t("messages.checkContent"));
      } else {
        showErrorToast(i18n.t("messages.reviewSaveError"));
      }
    },
  });

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: (targetProductId: string) => deleteComment(targetProductId),
    onSuccess(_, targetProductId) {
      setShowUsernameHint(false);
      queryClient.invalidateQueries({ queryKey: ["comments", targetProductId, COMMENTS_PAGE_SIZE] });
      queryClient.invalidateQueries({ queryKey: ["myComment", targetProductId] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      setFormState({ content: "", score: DEFAULT_SCORE });
    },
    onError() {
      showErrorToast(i18n.t("messages.reviewDeleteError"));
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
    if (isAuthPending) return;
    setIsAuthPending(true);
    try {
      await loginWithDiscord();
      await refreshAuthDependentData();
      setFormState({ content: "", score: DEFAULT_SCORE });
    } catch {
      showErrorToast(i18n.t("messages.loginError"));
    } finally {
      setIsAuthPending(false);
    }
  };

  const handleOpenAccountSettings = async () => {
    try {
      await sendMessage("openAccountSettings", undefined);
    } catch {
      showErrorToast(i18n.t("messages.accountSettingsError"));
    }
  };

  const handleLogout = async () => {
    if (isAuthPending) return;
    setIsAuthPending(true);
    try {
      await sendMessage("setAuthTokens", null);
      await refreshAuthDependentData();
      setShowUsernameHint(false);
      setFormState({ content: "", score: DEFAULT_SCORE });
    } catch {
      showErrorToast(i18n.t("messages.logoutError"));
    } finally {
      setIsAuthPending(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!product) {
      return;
    }

    if (!user) {
      showErrorToast(i18n.t("messages.loginRequired"));
      return;
    }

    const trimmed = formState.content.trim();
    if (!trimmed) {
      showErrorToast(i18n.t("messages.emptyContent"));
      return;
    }

    if (trimmed.length > MAX_COMMENT_LENGTH) {
      showErrorToast(i18n.t("messages.contentTooLong", [MAX_COMMENT_LENGTH]));
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
    if (!product || !myComment || !canEdit || isSubmitting) return;
    deleteMutation.mutate(product.id);
  };

  const isSubmitting = submitMutation.isPending || deleteMutation.isPending;
  const isAuthenticated = Boolean(user);
  const canEdit = isAuthenticated && Boolean(product) && !isAuthPending && !myCommentQuery.isLoading;
  const isBusy = isSubmitting || isAuthPending || productQuery.isFetching;

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

  if (productQuery.isLoading) {
    return (
      <div className="rounded-3xl bg-white p-5 shadow">
        <p className="text-sm text-slate-500">{i18n.t("reviewBoard.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] text-slate-400">{i18n.t("reviewBoard.info")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[#fc4d50]">
              {i18n.t("reviewBoard.commentsCount", [commentCount])}
            </span>
            {isAuthenticated && (
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-[#fc4d50]/40"
                onClick={handleOpenAccountSettings}
              >
                {i18n.t("reviewBoard.button.accountSettings")}
              </button>
            )}
              <button
                type="button"
                className="rounded-full border border-[#fc4d50]/40 bg-[#fc4d50]/10 px-3 py-1 text-xs font-medium text-[#fc4d50] transition hover:bg-[#fc4d50]/20 disabled:opacity-60"
                onClick={isAuthenticated ? handleLogout : handleLogin}
                disabled={isBusy}
              >
                {isAuthenticated ? i18n.t("reviewBoard.button.logout") : i18n.t("reviewBoard.button.login")}
              </button>
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

          {(productQuery.isError || commentsQuery.isError) && (
            <div role="alert" className="text-xs text-red-600">
              <p>{i18n.t("messages.fetchReviewFailed")}</p>
              <button type="button" className="mt-2 underline" onClick={() => {
                if (productQuery.isError) void productQuery.refetch();
                else void commentsQuery.refetch();
              }}>{i18n.t("userComments.refresh")}</button>
            </div>
          )}
          {productQuery.isSuccess && !product && (
            <p className="text-xs text-slate-500">{i18n.t("reviewBoard.productUnavailable")}</p>
          )}

          {showEmptyComments && (
            <p className="text-xs text-slate-500">{i18n.t("reviewBoard.noComments")}</p>
          )}

          {!commentsLoading &&
            comments.map((comment) => {
              const mine = user && comment.user.id === user.id;
            return (
              <article
                key={comment.id}
                className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-sm transition ${
                  mine ? "border-[#fc4d50]/40 bg-[#fc4d50]/10" : "border-slate-100 bg-white"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div aria-hidden="true" className="h-10 w-10 shrink-0 rounded-full bg-slate-200" />
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
              </article>
            );
          })}

          {isFetchingNextPage && (
            <p className="text-xs text-slate-500 text-center">{i18n.t("reviewBoard.loader.loadingMore")}</p>
          )}

          <div ref={loadMoreTriggerRef} className="h-px" />
        </div>

        <form className="mt-4 space-y-4 border-t border-slate-100 pt-4" onSubmit={handleSubmit}>
          {showUsernameHint && (
            <div role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p>{i18n.t("messages.usernameSetupHint")}</p>
              <button
                type="button"
                className="mt-2 font-semibold underline underline-offset-2"
                onClick={handleOpenAccountSettings}
              >
                {i18n.t("reviewBoard.button.accountSettings")}
              </button>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500" htmlFor={REVIEW_FORM_FIELD_ID}>
              {i18n.t("userComments.title")}
            </label>
            <textarea
              id={REVIEW_FORM_FIELD_ID}
              rows={4}
              maxLength={MAX_COMMENT_LENGTH}
              aria-describedby="review-content-count"
              aria-invalid={formState.content.length > MAX_COMMENT_LENGTH}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-inner transition focus:border-[#fc4d50]/80 focus:outline-none"
              value={formState.content}
              onChange={(event) =>
                setFormState((previous) => ({ ...previous, content: event.target.value }))
              }
              placeholder={i18n.t("reviewBoard.placeholder")}
              disabled={!canEdit || isSubmitting}
            />
            <p
              id="review-content-count"
              className={`mt-1 text-right text-[11px] ${
                formState.content.length > MAX_COMMENT_LENGTH ? "text-red-600" : "text-slate-400"
              }`}
            >
              {i18n.t("reviewBoard.characterCount", [formState.content.length, MAX_COMMENT_LENGTH])}
            </p>
          </div>

          <div className="flex flex-col gap-2 text-xs font-semibold text-slate-500">
            <label className="text-[11px]" htmlFor="review-score">
              {i18n.t("reviewBoard.rating")}
            </label>
            <div className="flex gap-1">
              <StarIcons
                score={formState.score}
                interactive
                onSelect={(value) => handleStarSelect(value)}
              />
            </div>
            {!canEdit && (
              <p className="text-[11px] text-slate-400">{i18n.t("reviewBoard.loginPrompt")}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="flex-1 rounded-2xl bg-gradient-to-r from-[#fc4d50] to-[#ff826a] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
              type="submit"
              disabled={!canEdit || isSubmitting}
            >
              {submitMutation.isPending
                ? i18n.t("reviewBoard.submit.saving")
                : myComment
                  ? i18n.t("reviewBoard.submit.edit")
                  : i18n.t("reviewBoard.submit.new")}
            </button>

            {myComment && (
              <button
                type="button"
                className="rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                onClick={handleDelete}
                disabled={!canEdit || isSubmitting}
              >
                {deleteMutation.isPending
                  ? i18n.t("reviewBoard.submit.deleting")
                  : i18n.t("reviewBoard.submit.delete")}
              </button>
            )}
          </div>
        </form>

      </div>
    </div>
  );
}
