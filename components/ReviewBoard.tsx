import { i18n } from "#i18n";
import {
  deleteComment,
  submitComment,
  captureReviewSession,
  fetchUserComment,
  uploadReviewImage,
  deleteReviewImage,
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
import { authTokenStorage } from "@/utils/storage";
import { normalizeReviewImages, validateReviewFiles } from "@/components/review/images";
import { useReviewImageDraft, type DraftReviewImage } from "@/components/review/image-draft";
import { ReviewImages } from "@/components/review/components/ReviewImages";
import { ReviewImageInput } from "@/components/review/components/ReviewImageInput";
import StarIcons from "./StarIcon";

const DEFAULT_SCORE = 8;
const MAX_COMMENT_LENGTH = 500;

type ReviewOperation = { controller: AbortController; sessionGeneration: string | null | undefined };

type SubmitVariables = {
  productId: string;
  method: "POST" | "PUT";
  body: {
    content: string;
    score: number;
    anonymous?: boolean;
  };
  phase?: "upload" | "save";
  images: DraftReviewImage[];
  removedImageIds: string[];
  operation: ReviewOperation;
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

  const imageDraft = useReviewImageDraft();
  const skipHydration = useRef<string | null>(null);
  // A ref closes the same-event-loop gap before React renders pending state.
  const activeOperation = useRef<ReviewOperation | null>(null);
  const [isImageRemoving, setIsImageRemoving] = useState(false);
  const observedGeneration = useRef<string | null | undefined>(undefined);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionRevision, setSessionRevision] = useState(0);
  const invalidateOperation = () => {
    activeOperation.current?.controller.abort();
    activeOperation.current = null;
  };
  useEffect(() => {
    let stopped = false;
    let events = 0;
    const stop = authTokenStorage.watch((next, previous) => {
      events++;
      observedGeneration.current = next ? next.sessionId ?? "legacy" : null;
      setSessionReady(true);
      if ((next ? next.sessionId ?? "legacy" : null) !== (previous ? previous.sessionId ?? "legacy" : null)) {
        invalidateOperation();
        skipHydration.current = null;
        setSessionRevision((revision) => revision + 1);
        imageDraft.reset();
        setFormState({ content: "", score: DEFAULT_SCORE });
        setShowUsernameHint(false);
      }
    });
    void authTokenStorage.getValue().then((tokens) => {
      if (!stopped && events === 0) {
        observedGeneration.current = tokens ? tokens.sessionId ?? "legacy" : null;
        setSessionReady(true);
      }
    }).catch(() => undefined);
    return () => { stopped = true; stop(); invalidateOperation(); };
  }, []);
  useEffect(() => {
    imageDraft.reset();
    setFormState({ content: "", score: DEFAULT_SCORE });
    return invalidateOperation;
  }, [productId]);

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
      invalidateOperation();
      imageDraft.reset();
      setFormState({ content: "", score: DEFAULT_SCORE });
      setShowUsernameHint(false);
    }
    lastUserId.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    if (!myComment) {
      return;
    }

    if (skipHydration.current === myComment.id) {
      skipHydration.current = null;
      return;
    }
    imageDraft.reset(normalizeReviewImages(myComment.images));
    setFormState((previous) => ({
      ...previous,
      content: myComment.content,
      score: typeof myComment.score === "number" ? myComment.score : previous.score,
    }));
  }, [myComment?.id, sessionRevision, productId]);

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

  const refreshReviewData = (targetProductId: string) => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["comments", targetProductId, COMMENTS_PAGE_SIZE] }),
    queryClient.invalidateQueries({ queryKey: ["myComment", targetProductId] }),
    queryClient.invalidateQueries({ queryKey: ["myComments"] }),
    queryClient.invalidateQueries({ queryKey: ["product"] }),
  ]);

  const submitMutation = useMutation<void, Error, SubmitVariables>({
    retry: false,
    mutationFn: async (variables) => {
      const { productId, method, body, operation } = variables;
      const context = await captureReviewSession(operation.controller.signal, operation.sessionGeneration);
      const completed: DraftReviewImage[] = [];
      for (const entry of variables.images) {
        operation.controller.signal.throwIfAborted();
        variables.phase = "upload";
        const image = entry.image ?? await uploadReviewImage(entry.file!, context);
        operation.controller.signal.throwIfAborted();
        const uploaded = { ...entry, image, uploadContext: entry.uploadContext ?? context };
        completed.push(uploaded);
        // Successful uploads survive a later upload/save failure, so retrying the
        // draft does not upload the same file twice or consume the pending quota.
        imageDraft.replace(imageDraft.current.current.map((item) => item.key === entry.key ? uploaded : item));
      }
      variables.phase = "save";
      const imageIds = completed.map((entry) => entry.image!.id);
      try {
        await submitComment(productId, method, { ...body, imageIds }, context);
      } catch (error) {
        operation.controller.signal.throwIfAborted();
        // A lost response may still have committed. Reconcile with a scoped read,
        // never automatically repeat the write or discard the editable draft.
        if (!(error instanceof ApiError) || error.status >= 500 || error.status === 409) {
          const saved = await fetchUserComment(productId, context).catch(() => undefined);
          operation.controller.signal.throwIfAborted();
          if (saved) {
            const savedImages = normalizeReviewImages(saved.images);
            const matches = saved.content === body.content && saved.score === body.score
              && (body.anonymous === undefined || saved.anonymous === body.anonymous)
              && JSON.stringify(savedImages.map((image) => image.id)) === JSON.stringify(imageIds);
            imageDraft.baseline.current = savedImages;
            if (saved.id !== myComment?.id) skipHydration.current = saved.id;
            queryClient.setQueryData(["myComment", productId], saved);
            if (!matches) throw error;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      operation.controller.signal.throwIfAborted();
      imageDraft.reset(completed.map((entry) => entry.image!));
      // PUT has detached these images. Never delete an existing attachment first.
      await Promise.all(variables.removedImageIds.map((id) => deleteReviewImage(id, context).catch(() => undefined)));
    },
    async onSuccess(_, variables) {
      if (activeOperation.current !== variables.operation) return;
      setShowUsernameHint(false);
      await refreshReviewData(variables.productId);
    },
    onError: (error, variables) => {
      if (activeOperation.current !== variables.operation || variables.operation.controller.signal.aborted) return;
      if (isForbiddenWriteError(error)) {
        setShowUsernameHint(true);
        showErrorToast(i18n.t("messages.usernameSetupHint"));
      } else if (variables.phase === "upload" && error instanceof ApiError) {
        showErrorToast(i18n.t(error.status === 429 ? "reviewImages.pendingError"
          : error.status === 422 ? "reviewImages.moderationError"
          : [400, 413, 415].includes(error.status) ? "reviewImages.invalidError" : "reviewImages.uploadError"));
      } else if (error instanceof ApiError && error.status === 400) {
        showErrorToast(i18n.t("messages.checkContent"));
      } else {
        showErrorToast(i18n.t("messages.reviewSaveError"));
      }
    },
    onSettled: (_, __, variables) => {
      if (activeOperation.current === variables.operation) activeOperation.current = null;
    },
  });

  type DeleteVariables = { productId: string; operation: ReviewOperation; pendingImageIds: string[] };
  const deleteMutation = useMutation<void, Error, DeleteVariables>({
    retry: false,
    mutationFn: async ({ productId, operation, pendingImageIds }) => {
      const context = await captureReviewSession(operation.controller.signal, operation.sessionGeneration);
      await deleteComment(productId, context);
      await Promise.all(pendingImageIds.map((id) => deleteReviewImage(id, context).catch(() => undefined)));
    },
    async onSuccess(_, variables) {
      if (activeOperation.current !== variables.operation) return;
      setShowUsernameHint(false);
      imageDraft.reset();
      setFormState({ content: "", score: DEFAULT_SCORE });
      await refreshReviewData(variables.productId);
    },
    onError(_, variables) {
      if (activeOperation.current === variables.operation && !variables.operation.controller.signal.aborted) {
        showErrorToast(i18n.t("messages.reviewDeleteError"));
      }
    },
    onSettled: (_, __, variables) => {
      if (activeOperation.current === variables.operation) activeOperation.current = null;
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
      // Storage/user transitions own draft resets. A newer login can complete
      // while these reads are pending; never clear its draft on this return.
      await refreshAuthDependentData();
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

    if (!canEdit || activeOperation.current || isSubmitting) return;

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
    const operation = { controller: new AbortController(), sessionGeneration: observedGeneration.current };
    activeOperation.current = operation;
    submitMutation.mutate({
      productId: product.id,
      method,
      body: {
        content: trimmed,
        score: formState.score,
        ...(typeof myComment?.anonymous === "boolean" ? { anonymous: myComment.anonymous } : {}),
      },
      images: [...imageDraft.current.current],
      removedImageIds: imageDraft.baseline.current.filter((saved) => !imageDraft.current.current.some((entry) => entry.image?.id === saved.id)).map((image) => image.id),
      operation,
    });
  };

  const handleDelete = () => {
    if (!product || !myComment || !canEdit || isSubmitting || activeOperation.current) return;
    const operation = { controller: new AbortController(), sessionGeneration: observedGeneration.current };
    activeOperation.current = operation;
    deleteMutation.mutate({ productId: product.id, operation, pendingImageIds: imageDraft.current.current
      .filter((entry) => entry.image && entry.uploadContext && !imageDraft.baseline.current.some((image) => image.id === entry.image!.id))
      .map((entry) => entry.image!.id) });
  };

  const isSubmitting = submitMutation.isPending || deleteMutation.isPending || isImageRemoving;
  const isAuthenticated = Boolean(user);
  const canEdit = isAuthenticated && sessionReady && observedGeneration.current !== null && Boolean(product) && !isAuthPending && myCommentQuery.isSuccess;
  const isBusy = isSubmitting || isAuthPending || productQuery.isFetching;

  const handleAddImages = (files: File[]) => {
    if (!canEdit || isSubmitting || activeOperation.current || !files.length) return;
    const invalid = validateReviewFiles(files, imageDraft.current.current.length);
    if (invalid) {
      showErrorToast(i18n.t(invalid === "count" ? "reviewImages.countError" : invalid === "type" ? "reviewImages.typeError" : "reviewImages.sizeError"));
      return;
    }
    imageDraft.replace([...imageDraft.current.current, ...files.map((file) => ({
      key: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file),
    }))]);
  };

  const handleRemoveImage = async (key: string) => {
    if (!canEdit || isSubmitting || activeOperation.current) return;
    const entry = imageDraft.current.current.find((image) => image.key === key);
    if (!entry) return;
    const isPendingUpload = entry.image && entry.uploadContext && !imageDraft.baseline.current.some((image) => image.id === entry.image!.id);
    const operation = { controller: new AbortController(), sessionGeneration: observedGeneration.current };
    activeOperation.current = operation;
    setIsImageRemoving(true);
    try {
      if (isPendingUpload) {
        await deleteReviewImage(entry.image!.id, { ...entry.uploadContext!, signal: operation.controller.signal }).catch((error) => {
          // Already absent/expired is an idempotent local removal, including a
          // retry after the first successful DELETE response was lost.
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
        });
      }
      if (activeOperation.current === operation) imageDraft.replace(imageDraft.current.current.filter((image) => image.key !== key));
    } catch {
      if (!operation.controller.signal.aborted) showErrorToast(i18n.t("reviewImages.removeError"));
    } finally {
      if (activeOperation.current === operation) activeOperation.current = null;
      setIsImageRemoving(false);
    }
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
                  <div className="flex-1 space-y-2">
                    <span className="block h-3 w-1/3 rounded-full bg-slate-200" />
                    <span className="block h-4 rounded-full bg-slate-200" />
                    <span className="block h-3 w-2/3 rounded-full bg-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {(productQuery.isError || commentsQuery.isError || (isAuthenticated && myCommentQuery.isError)) && (
            <div role="alert" className="text-xs text-red-600">
              <p>{i18n.t("messages.fetchReviewFailed")}</p>
              <button type="button" className="mt-2 underline" onClick={() => {
                if (productQuery.isError) void productQuery.refetch();
                else if (myCommentQuery.isError) void myCommentQuery.refetch();
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
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{comment.user.anonymous ? i18n.t("reviewBoard.anonymous") : comment.user.deactivated ? i18n.t("reviewBoard.deactivated") : comment.user.username}</p>
                        <p className="text-[11px] text-slate-500">{formatDateTime(comment.updatedAt)}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">
                        <StarIcons score={comment.score} size={12} />
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-900">{comment.blinded ? i18n.t("reviewBoard.blinded") : comment.content}</p>
                    <ReviewImages images={comment.images} blinded={comment.blinded} />
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

          <ReviewImageInput images={imageDraft.images} disabled={!canEdit || isSubmitting} onAdd={handleAddImages} onRemove={handleRemoveImage} />

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
            {!isAuthenticated && (
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
