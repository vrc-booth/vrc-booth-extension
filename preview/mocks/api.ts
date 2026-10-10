import type { CommentItem, MyCommentData, ReviewImage, ReviewProduct, UserProfile } from "@/components/review/types";
import { ApiError } from "@/utils/review-utils";
import { delay, notify, product, state } from "./state";

// Deliberately same-origin and intercepted by the preview. Never a service URL.
export const API_BASE = "/__preview_api__";
export const fetchUserProfile = async (): Promise<UserProfile | null> => {
  await delay();
  return state.signedIn ? { ...state.profile } : null;
};
export const fetchProductById = async (_productId: string): Promise<ReviewProduct | null> => {
  await delay();
  return { ...product };
};
export const findProductForCurrentPage = () => fetchProductById(product.id);
export const fetchCommentsForProduct = async (_productId: string, page = 1, limit = 10) => {
  await delay();
  return { count: state.comments.length, comments: state.comments.slice((page - 1) * limit, page * limit), page, pageSize: limit };
};
export const fetchUserComment = async (_productId: string): Promise<MyCommentData | null> => {
  await delay();
  const comment = state.signedIn && state.comments.find((item) => item.user.id === state.profile.id);
  return comment ? { id: comment.id, content: comment.content, score: comment.score, images: comment.images } : null;
};
export const fetchMyComments = async (page = 1, limit = 5) => {
  await delay();
  const comments = state.signedIn ? state.myComments : [];
  return { count: comments.length, comments: comments.slice((page - 1) * limit, page * limit) };
};
const requireSession = () => {
  if (!state.signedIn) throw new ApiError("Preview session is signed out", 401);
};
export const submitComment = async (_productId: string, _method: "POST" | "PUT", body: Record<string, unknown>): Promise<void> => {
  requireSession();
  await delay();
  const existing = state.comments.find((item) => item.user.id === state.profile.id);
  const comment: CommentItem = {
    id: existing?.id ?? "demo-current-review",
    content: String(body.content ?? ""), score: Number(body.score ?? 8), updatedAt: new Date().toISOString(),
    user: { id: state.profile.id, username: state.profile.username },
    images: (body.imageIds as string[] ?? []).flatMap((id) => {
      const url = state.imageUrls.get(id);
      return url ? [{ id, url, width: 128, height: 128 }] : [];
    }),
  };
  state.comments = [comment, ...state.comments.filter((item) => item.user.id !== state.profile.id)];
  state.myComments = [comment, ...state.myComments.filter((item) => item.id !== comment.id)];
  notify();
};
export const deleteComment = async (_productId: string): Promise<void> => {
  requireSession();
  await delay();
  const ids = new Set(state.comments.filter((item) => item.user.id === state.profile.id).map((item) => item.id));
  state.comments = state.comments.filter((item) => item.user.id !== state.profile.id);
  state.myComments = state.myComments.filter((item) => !ids.has(item.id));
  notify();
};
export const updateUsername = async (username: string): Promise<void> => {
  requireSession();
  await delay();
  if (!username.trim()) throw new ApiError("Please enter a username", 400);
  state.profile = { ...state.profile, username: username.trim() };
  const rename = (comment: CommentItem) => comment.user.id === state.profile.id
    ? { ...comment, user: { ...comment.user, username: state.profile.username } } : comment;
  state.comments = state.comments.map(rename);
  state.myComments = state.myComments.map(rename);
  notify();
};
const retired = async (): Promise<never> => {
  throw new ApiError("This retired endpoint is intentionally unavailable in the preview", 410);
};
export const upvoteComment = (_comment: CommentItem) => retired();
export const downvoteComment = (_comment: CommentItem) => retired();
export const updateUserAdult = (_value: boolean) => retired();
export const updateUserAutoCollapse = (_value: boolean) => retired();
export const updateBio = (_value: string) => retired();
export const apiFetch = (_path: string, _init: RequestInit = {}): Promise<never> => retired();

// In-memory only. Selected files never leave this isolated preview.
export const captureReviewSession = async (signal?: AbortSignal) => {
  signal?.throwIfAborted();
  requireSession();
  return { sessionId: "synthetic-preview-session", signal };
};
export const uploadReviewImage = async (file: File, context: { signal?: AbortSignal }): Promise<ReviewImage> => {
  context.signal?.throwIfAborted();
  requireSession();
  await delay();
  context.signal?.throwIfAborted();
  const id = crypto.randomUUID();
  const url = URL.createObjectURL(file);
  state.imageUrls.set(id, url);
  return { id, url, width: 128, height: 128 };
};
export const deleteReviewImage = async (id: string, context: { signal?: AbortSignal }) => {
  context.signal?.throwIfAborted();
  requireSession();
  const url = state.imageUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  state.imageUrls.delete(id);
};
