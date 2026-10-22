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
import { ApiError } from "@/utils/review-utils";
import { loginWithDiscord } from "@/components/review/auth";
import { COMMENTS_PAGE_SIZE } from "@/components/review/constants";
import { REVIEW_FORM_FIELD_ID } from "@/components/review/reviewBoardFocus";
import { showErrorToast } from "@/utils/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useEffect, useRef, useState } from "react";
import { authTokenStorage } from "@/utils/storage";
import { normalizeReviewImages, validateReviewFiles } from "@/components/review/images";
import { useReviewImageDraft, type DraftReviewImage } from "@/components/review/image-draft";
import { ReviewCard } from "@/components/review/components/ReviewCard";
import { ReviewImageInput } from "@/components/review/components/ReviewImageInput";
import StarIcons from "./StarIcon";
import { IconBrandDiscord } from "@tabler/icons-react";
import { PRIMARY_BUTTON_CLASS, SECONDARY_BUTTON_CLASS, TEXT_BUTTON_CLASS } from "@/components/ui/buttons";

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
  const myCommentQuery = useMyCommentQuery(productId, {
    enabled: Boolean(productId && user?.id),
  });
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const comments = commentsQuery.data?.pages?.flatMap((page) => page.comments) ?? [];
  const commentCount = commentsQuery.data?.pages?.[0]?.count ?? 0;
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

  const handleStarSelect = (value: number) => {
    if (!canEdit || isSubmitting) {
      return;
    }

    setFormState((previous) => ({ ...previous, score: value }));
  };

  if (productQuery.isLoading) {
    return (
      <section className="py-6 text-center text-sm text-booth-sub">{i18n.t("reviewBoard.loading")}</section>
    );
  }

  const hasError = productQuery.isError || commentsQuery.isError || (isAuthenticated && myCommentQuery.isError);
  // A cached profile keeps the form usable through a transient failure; only an
  // unknown session shows the status box, so the two never appear together.
  const isSessionPending = !user && (userQuery.isPending || userQuery.isError);
  const canWrite = Boolean(product);
  const isOverLimit = formState.content.length > MAX_COMMENT_LENGTH;

  return (
    <section className="text-booth-text" aria-labelledby="review-board-title">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-booth-border pb-3">
        <h2 id="review-board-title" className="text-lg leading-7 font-bold text-booth-heading">
          {i18n.t("reviewBoard.header")}
          <span className="ml-2 text-sm font-normal text-booth-sub">
            {i18n.t("reviewBoard.commentsCount", [commentCount])}
          </span>
        </h2>
        {isAuthenticated && (
          <div className="flex items-center gap-4">
            {!showUsernameHint && (
              <button type="button" className={TEXT_BUTTON_CLASS} onClick={handleOpenAccountSettings}>
                {i18n.t("reviewBoard.button.accountSettings")}
              </button>
            )}
            <button type="button" className={TEXT_BUTTON_CLASS} onClick={handleLogout} disabled={isBusy}>
              {i18n.t("reviewBoard.button.logout")}
            </button>
          </div>
        )}
      </header>

      <div className="max-h-[440px] overflow-y-auto">
        {commentsLoading && (
          <div className="divide-y divide-booth-divider" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="animate-pulse space-y-2 py-4">
                <span className="block h-3 w-1/4 rounded-sm bg-booth-surface" />
                <span className="block h-3 w-3/4 rounded-sm bg-booth-surface" />
                <span className="block h-3 w-1/2 rounded-sm bg-booth-surface" />
              </div>
            ))}
          </div>
        )}

        {hasError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 py-4 text-sm text-booth-primary">
            <p>{i18n.t("messages.fetchReviewFailed")}</p>
            <button type="button" className="font-bold underline underline-offset-2" onClick={() => {
              if (productQuery.isError) void productQuery.refetch();
              else if (myCommentQuery.isError) void myCommentQuery.refetch();
              else void commentsQuery.refetch();
            }}>{i18n.t("reviewBoard.retry")}</button>
          </div>
        )}
        {productQuery.isSuccess && !product && (
          <p className="py-6 text-center text-sm text-booth-sub">{i18n.t("reviewBoard.productUnavailable")}</p>
        )}
        {showEmptyComments && (
          <p className="py-6 text-center text-sm text-booth-sub">{i18n.t("reviewBoard.noComments")}</p>
        )}

        {!commentsLoading && comments.length > 0 && (
          <div className="divide-y divide-booth-divider">
            {comments.map((comment) => (
              <ReviewCard key={comment.id} comment={comment} highlighted={Boolean(user && comment.user.id === user.id)} />
            ))}
          </div>
        )}

        {isFetchingNextPage && (
          <p className="py-3 text-center text-xs text-booth-sub">{i18n.t("reviewBoard.loader.loadingMore")}</p>
        )}
        <div ref={loadMoreTriggerRef} className="h-px" />
      </div>

      {isSessionPending && (
        <section role="status" className="mt-4 rounded-lg border border-booth-border px-5 py-5 text-center">
          <p className="text-sm text-booth-sub">
            {i18n.t(userQuery.isFetching || userQuery.isPending ? "reviewBoard.sessionChecking" : "reviewBoard.sessionUnavailable")}
          </p>
          {userQuery.isError && (
            <button
              type="button"
              onClick={() => void userQuery.refetch()}
              disabled={userQuery.isFetching}
              className={`mt-3 ${SECONDARY_BUTTON_CLASS}`}
            >
              {i18n.t("userPanel.checkLogin")}
            </button>
          )}
        </section>
      )}

      {!isAuthenticated && userQuery.isSuccess && canWrite && (
        <section className="mt-4 rounded-lg border border-booth-border px-5 py-6 text-center" aria-labelledby="review-login-title">
          <h3 id="review-login-title" className="text-base font-bold text-booth-heading">{i18n.t("reviewBoard.loginTitle")}</h3>
          <p className="mt-1 text-sm text-booth-sub">{i18n.t("reviewBoard.loginDescription")}</p>
          <button
            id="review-login-button"
            type="button"
            disabled={isAuthPending}
            onClick={handleLogin}
            className={`mt-4 ${SECONDARY_BUTTON_CLASS} disabled:cursor-wait`}
          >
            <IconBrandDiscord size={20} className="text-discord" aria-hidden="true" />
            {i18n.t(isAuthPending ? "reviewBoard.loginPending" : "reviewBoard.loginAction")}
          </button>
        </section>
      )}

      <form
        hidden={!isAuthenticated || !canWrite}
        className="mt-4 overflow-hidden rounded-lg border border-booth-border bg-white transition focus-within:border-booth-sub"
        onSubmit={handleSubmit}
      >
        {showUsernameHint && (
          <div role="status" className="flex flex-wrap items-center gap-3 border-b border-booth-divider px-4 py-2.5 text-xs text-booth-primary">
            <p>{i18n.t("messages.usernameSetupHint")}</p>
            <button type="button" className="font-bold underline underline-offset-2" onClick={handleOpenAccountSettings}>
              {i18n.t("reviewBoard.button.accountSettings")}
            </button>
          </div>
        )}
        <textarea
          id={REVIEW_FORM_FIELD_ID}
          rows={4}
          maxLength={MAX_COMMENT_LENGTH}
          aria-describedby="review-content-count"
          aria-invalid={isOverLimit}
          className="block w-full resize-y border-0 bg-transparent px-4 pt-4 pb-2 text-sm leading-relaxed text-booth-text placeholder:text-booth-sub focus:outline-none disabled:opacity-60"
          value={formState.content}
          onChange={(event) =>
            setFormState((previous) => ({ ...previous, content: event.target.value }))
          }
          placeholder={i18n.t("reviewBoard.placeholder")}
          disabled={!canEdit || isSubmitting}
        />
        <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3">
          <ReviewImageInput images={imageDraft.images} disabled={!canEdit || isSubmitting} onAdd={handleAddImages} onRemove={handleRemoveImage} />
          <p
            id="review-content-count"
            className={`ml-auto shrink-0 text-xs tabular-nums ${isOverLimit ? "text-booth-primary" : "text-booth-sub"}`}
          >
            {i18n.t("reviewBoard.characterCount", [formState.content.length, MAX_COMMENT_LENGTH])}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-booth-divider px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-booth-sub">{i18n.t("reviewBoard.rating")}</span>
            <StarIcons score={formState.score} size={22} interactive onSelect={handleStarSelect} />
          </div>
          <div className="flex items-center gap-4">
            {myComment && (
              <button
                type="button"
                className={`${TEXT_BUTTON_CLASS} hover:text-booth-primary`}
                onClick={handleDelete}
                disabled={!canEdit || isSubmitting}
              >
                {deleteMutation.isPending ? i18n.t("reviewBoard.submit.deleting") : i18n.t("reviewBoard.submit.delete")}
              </button>
            )}
            <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={!canEdit || isSubmitting}>
              {submitMutation.isPending
                ? i18n.t("reviewBoard.submit.saving")
                : myComment
                  ? i18n.t("reviewBoard.submit.edit")
                  : i18n.t("reviewBoard.submit.new")}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
