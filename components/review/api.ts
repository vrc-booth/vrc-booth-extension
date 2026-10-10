import {
  ApiError,
  buildSearchCandidates,
  matchesNormalizedUrl,
  normalizeUrl,
  readResponseText,
} from "@/utils/review-utils";
import { authTokenStorage } from "@/utils/storage";
import { CommentItem, MyCommentData, ReviewImage, ReviewProduct, UserProfile } from "./types";
import { normalizeReviewImages, validateReviewFiles } from "@/components/review/images";
import { COMMENTS_PAGE_SIZE } from "./constants";

import { API_BASE } from "./config";
import { sendMessage } from "./messaging";
export { API_BASE } from "./config";

const defaultHeaders = {
  "Content-Type": "application/json",
  Accept: 'application/json',
};

export type ReviewRequestContext = { sessionId?: string; signal?: AbortSignal };

export const captureReviewSession = async (signal?: AbortSignal, expectedGeneration?: string | null): Promise<ReviewRequestContext> => {
  signal?.throwIfAborted();
  const tokens = await authTokenStorage.getValue();
  signal?.throwIfAborted();
  if (!tokens?.accessToken) throw new ApiError("Authentication required", 401);
  if (expectedGeneration !== undefined && (tokens.sessionId ?? "legacy") !== expectedGeneration) {
    throw new ApiError("Authentication session changed. Please try again.", 401);
  }
  return { sessionId: tokens.sessionId, signal };
};

const assertReviewSession = async (context: ReviewRequestContext) => {
  context.signal?.throwIfAborted();
  const current = await authTokenStorage.getValue();
  context.signal?.throwIfAborted();
  if (!current || current.sessionId !== context.sessionId) {
    throw new ApiError("Authentication session changed. Please try again.", 401);
  }
};

const performFetch = async (url: string, init: RequestInit, attempt = 0, sessionId?: string, context?: ReviewRequestContext): Promise<any> => {
  const tokens = await authTokenStorage.getValue();
  context?.signal?.throwIfAborted();
  if ((attempt > 0 || context) && (!tokens || tokens.sessionId !== (context ? context.sessionId : sessionId))) {
    throw new ApiError("Authentication session changed. Please try again.", 401);
  }
  const accessToken = tokens?.accessToken;
  const headers = new Headers(defaultHeaders);
  if (init.body instanceof FormData) headers.delete("Content-Type");
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, {
    credentials: "include",
    mode: "cors",
    ...init,
    headers,
    ...(context?.signal ? { signal: context.signal } : {}),
  });

  if (response.ok) {
    const result = response.status === 204 ? undefined : await response.json();
    if (context) await assertReviewSession(context);
    return result;
  }

  if (response.status === 401 && attempt === 0 && accessToken) {
    const refreshed = await sendMessage("refreshAccessToken", { accessToken, sessionId: tokens?.sessionId });
    if (refreshed) {
      return performFetch(url, init, attempt + 1, tokens?.sessionId, context);
    }
  }

  const message = await readResponseText(response);
  throw new ApiError(message, response.status);
};

export const apiFetch = async (path: string, init: RequestInit = {}, context?: ReviewRequestContext) => {
  const url = `${API_BASE}${path}`;
  return performFetch(url, init, 0, undefined, context);
};

export const fetchUserProfile = async (): Promise<UserProfile | null> => {
  try {
    const response = await apiFetch(`/user/me`);
    return response ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }
    throw error;
  }
};

const ITEM_PATH_REGEX = /\/items\/([^/?#]+)/;

const extractProductIdFromPath = (path: string) => {
  const match = path.match(ITEM_PATH_REGEX);
  if (!match) {
    return null;
  }

  return match[1];
};

export const fetchProductById = async (productId: string): Promise<ReviewProduct | null> => {
  try {
    const payload = await apiFetch(`/product/${productId}`);
    return payload?.product ?? null;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

export const findProductForCurrentPage = async (): Promise<ReviewProduct | null> => {
  const normalizedPage = normalizeUrl(window.location.href);
  const productIdFromPath = extractProductIdFromPath(new URL(window.location.href).pathname);

  if (productIdFromPath) {
    const directProduct = await fetchProductById(productIdFromPath);
    if (directProduct) {
      return directProduct;
    }
  }

  const candidates = buildSearchCandidates();

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const payload = await apiFetch(`/product/search?limit=6&query=${encodeURIComponent(candidate)}`);
    const fetchedProducts: ReviewProduct[] = Array.isArray(payload?.products) ? payload.products : [];
    const match = fetchedProducts.find((product) => matchesNormalizedUrl(product.url, normalizedPage));
    if (match) {
      return match;
    }
  }

  return null;
};

const normalizeComment = (comment: CommentItem): CommentItem => ({
  ...comment,
  images: comment.blinded ? [] : normalizeReviewImages(comment.images),
});

// V2 uses one-based pages of exactly 20; it ignores a client `limit` parameter.
export const fetchCommentsForProduct = async (
  productId: string,
  page = 1,
  _limit = COMMENTS_PAGE_SIZE,
): Promise<{ count: number; comments: CommentItem[]; page: number; pageSize: number }> => {
  const payload = await apiFetch(
    `/v2/review?productId=${encodeURIComponent(productId)}&sort=new&page=${page}`,
  );
  return {
    count: typeof payload?.count === "number" ? payload.count : 0,
    comments: Array.isArray(payload?.reviews) ? payload.reviews.map(normalizeComment) : [],
    page,
    pageSize: COMMENTS_PAGE_SIZE,
  };
};

export const fetchUserComment = async (productId: string, context?: ReviewRequestContext): Promise<MyCommentData | null> => {
  try {
    const payload = await apiFetch(`/v2/review/${encodeURIComponent(productId)}/my`, {}, context);
    // The owner can edit a blinded review. Do not strip its draft images here.
    return payload?.review ? { ...payload.review, images: normalizeReviewImages(payload.review.images) } : null;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) return null;
    throw error;
  }
};

export const fetchMyComments = async (
  page = 1,
  _limit = COMMENTS_PAGE_SIZE,
): Promise<{ count: number; comments: CommentItem[] }> => {
  const payload = await apiFetch(`/v2/review/my?page=${page}`);
  return {
    count: typeof payload?.count === "number" ? payload.count : 0,
    comments: Array.isArray(payload?.reviews) ? payload.reviews.map(normalizeComment) : [],
  };
};

export type ReviewWriteBody = { content: string; score: number; imageIds?: string[]; anonymous?: boolean };

export const submitComment = (
  productId: string,
  method: "POST" | "PUT",
  body: ReviewWriteBody,
  context?: ReviewRequestContext,
) => apiFetch(`/v2/review/${encodeURIComponent(productId)}`, { method, body: JSON.stringify(body) }, context);

export const deleteComment = (productId: string, context?: ReviewRequestContext) =>
  apiFetch(`/v2/review/${encodeURIComponent(productId)}`, { method: "DELETE" }, context);

export const uploadReviewImage = async (file: File, context: ReviewRequestContext): Promise<ReviewImage> => {
  if (validateReviewFiles([file], 0)) throw new ApiError("Invalid review image", 400);
  const body = new FormData();
  body.append("file", file);
  const payload = await apiFetch("/v2/review/image", { method: "POST", body }, context);
  const image = normalizeReviewImages([payload?.image])[0];
  if (!image) throw new ApiError("Invalid image upload response", 502);
  return image;
};

// Only pending/unbound uploads can be deleted; remove existing attachments in a
// successful review update first. No automatic retries on ambiguous failures.
export const deleteReviewImage = (id: string, context: ReviewRequestContext) => {
  // Cleanup is best-effort; unlike upload processing it must not hold a saved
  // review's controls indefinitely when storage is unavailable.
  const signal = AbortSignal.any([
    ...(context.signal ? [context.signal] : []),
    AbortSignal.timeout(15_000),
  ]);
  return apiFetch(`/v2/review/image/${encodeURIComponent(id)}`, { method: "DELETE" }, { ...context, signal });
};

export const updateUsername = (username: string) =>
  apiFetch("/user/username", { method: "PUT", body: JSON.stringify({ username }) });
