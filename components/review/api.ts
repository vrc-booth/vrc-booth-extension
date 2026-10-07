import {
  ApiError,
  buildSearchCandidates,
  matchesNormalizedUrl,
  normalizeUrl,
  readResponseText,
} from "@/utils/review-utils";
import { authTokenStorage } from "@/utils/storage";
import { CommentItem, MyCommentData, ReviewProduct, UserProfile } from "./types";

import { API_BASE } from "./config";
import { sendMessage } from "./messaging";
export { API_BASE } from "./config";

const defaultHeaders = {
  "Content-Type": "application/json",
  Accept: 'application/json',
};

const performFetch = async (url: string, init: RequestInit, attempt = 0, sessionId?: string): Promise<any> => {
  const tokens = await authTokenStorage.getValue();
  if (attempt > 0 && (!tokens || tokens.sessionId !== sessionId)) {
    throw new ApiError("Authentication session changed. Please try again.", 401);
  }
  const accessToken = tokens?.accessToken;
  const headers = new Headers(defaultHeaders);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(url, {
    credentials: "include",
    mode: "cors",
    ...init,
    headers,
  });

  if (response.ok) {
    return response.status === 204 ? undefined : response.json();
  }

  if (response.status === 401 && attempt === 0 && accessToken) {
    const refreshed = await sendMessage("refreshAccessToken", { accessToken, sessionId: tokens?.sessionId });
    if (refreshed) {
      return performFetch(url, init, attempt + 1, tokens?.sessionId);
    }
  }

  const message = await readResponseText(response);
  throw new ApiError(message, response.status);
};

export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const url = `${API_BASE}${path}`;
  return performFetch(url, init);
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

export const fetchCommentsForProduct = async (
  productId: string,
  page = 1,
  limit = 10,
): Promise<{ count: number; comments: CommentItem[]; page: number; pageSize: number }> => {
  const payload = await apiFetch(
    `/comment?productId=${encodeURIComponent(productId)}&sort=new&page=${page}&limit=${limit}`,
  );
  return {
    count: typeof payload?.count === "number" ? payload.count : 0,
    comments: Array.isArray(payload?.comments) ? payload.comments : [],
    page,
    pageSize: limit,
  };
};

export const fetchUserComment = async (productId: string): Promise<MyCommentData | null> => {
  try {
    const payload = await apiFetch(`/comment/${productId}/my`);
    return payload?.comment ?? null;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
      return null;
    }
    throw error;
  }
};

export const fetchMyComments = async (
  page = 1,
  limit = 5,
): Promise<{ count: number; comments: CommentItem[] }> => {
  const payload = await apiFetch(`/comment/my?page=${page}&limit=${limit}&sort=new`);
  return {
    count: typeof payload?.count === "number" ? payload.count : 0,
    comments: Array.isArray(payload?.comments) ? payload.comments : [],
  };
};

export const submitComment = (
  productId: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>,
) => apiFetch(`/comment/${productId}`, { method, body: JSON.stringify(body) });

export const deleteComment = (productId: string) =>
  apiFetch(`/comment/${encodeURIComponent(productId)}`, { method: "DELETE" });

export const updateUsername = (username: string) =>
  apiFetch("/user/username", { method: "PUT", body: JSON.stringify({ username }) });
