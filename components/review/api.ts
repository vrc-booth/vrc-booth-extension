import {
  ApiError,
  buildSearchCandidates,
  matchesNormalizedUrl,
  normalizeUrl,
  readResponseText,
} from "@/utils/review-utils";
import { authTokenStorage } from "@/utils/storage";
import { CommentItem, MyCommentData, ReviewProduct, UserProfile } from "./types";

const API_ORIGIN = "https://vbt.kamyu.me";
export const API_BASE = `${API_ORIGIN}/api`;

const defaultHeaders = {
  "Content-Type": "application/json",
  Accept: 'application/json',
};

const refreshAccessToken = async (): Promise<boolean> => {
  const tokens = await authTokenStorage.getValue();
  const refreshToken = tokens?.refreshToken;
  if (!refreshToken) {
    await authTokenStorage.setValue(null);
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/auth/token`, {
      method: "POST",
      credentials: "include",
      mode: "cors",
      headers: defaultHeaders,
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        await authTokenStorage.setValue(null);
      }
      return false;
    }

    const payload = await response.json();
    await authTokenStorage.setValue(payload);
    return true;
  } catch {
    return false;
  }
};

const performFetch = async (url: string, init: RequestInit, attempt = 0): Promise<any> => {
  const tokens = await authTokenStorage.getValue();
  const accessToken = tokens?.accessToken;
  const response = await fetch(url, {
    credentials: "include",
    mode: "cors",
    headers: {
      ...defaultHeaders,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init.headers ?? {}),
    },
    ...init,
  });

  if (response.ok) {
    return response.json();
  }

  if (response.status === 401 && attempt === 0) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return performFetch(url, init, attempt + 1);
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

export const deleteComment = async (productId: string) =>{
  const tokens = await authTokenStorage.getValue();
  const accessToken = tokens?.accessToken;
  apiFetch(`/comment/${productId}`, {
    method: "DELETE",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    }
  });
}

const voteComment = (
  comment: CommentItem,
  direction: "upvote" | "downvote",
) => apiFetch(`/comment/${comment.id}/${direction}`, { method: "POST", body: JSON.stringify(comment) });

export const upvoteComment = (comment: CommentItem) => voteComment(comment, "upvote");
export const downvoteComment = (comment: CommentItem) => voteComment(comment, "downvote");

const updateUserField = (path: string, body: Record<string, unknown>) =>
  apiFetch(path, { method: "PUT", body: JSON.stringify(body) });

export const updateUserAdult = (adult: boolean) => updateUserField("/user/adult", { adult });
export const updateUserAutoCollapse = (autoCollapse: boolean) =>
  updateUserField("/user/autoCollapse", { autoCollapse });
export const updateUserHideAvatar = (hideAvatar: boolean) =>
  updateUserField("/user/hideAvatar", { hideAvatar });
export const updateUsername = (username: string) => updateUserField("/user/username", { username });
export const updateBio = (bio: string) => updateUserField("/user/bio", { bio });
