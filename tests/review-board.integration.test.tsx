// @vitest-environment happy-dom
// Synthetic React DOM integration coverage, not real-browser/extension QA.
// All API, authentication and extension-runtime boundaries are mocked. No live traffic is allowed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CommentItem, MyCommentData, ReviewProduct, UserProfile } from "@/components/review/types";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
  fetchProfile: vi.fn(),
  fetchComments: vi.fn(),
  fetchMyComment: vi.fn(),
  submitComment: vi.fn(),
  deleteComment: vi.fn(),
  captureSession: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  login: vi.fn(),
  sendMessage: vi.fn(),
  errorToast: vi.fn(),
  storageWatch: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
}));

vi.mock("@/utils/storage", () => ({ authTokenStorage: { watch: mocks.storageWatch, getValue: async () => ({ accessToken: "test", refreshToken: "refresh", sessionId: "A" }) } }));
vi.mock("#i18n", () => ({
  i18n: { t: (key: string, substitutions?: unknown[]) => `${key}${substitutions ? `:${substitutions.join(",")}` : ""}` },
}));
vi.mock("@/components/review/api", () => ({
  findProductForCurrentPage: mocks.findProduct,
  fetchUserProfile: mocks.fetchProfile,
  fetchCommentsForProduct: mocks.fetchComments,
  fetchUserComment: mocks.fetchMyComment,
  fetchMyComments: vi.fn(() => { throw new Error("Unexpected personal-comments query"); }),
  submitComment: mocks.submitComment,
  deleteComment: mocks.deleteComment,
  captureReviewSession: mocks.captureSession,
  uploadReviewImage: mocks.uploadImage,
  deleteReviewImage: mocks.deleteImage,
}));
vi.mock("@/components/review/auth", () => ({ loginWithDiscord: mocks.login }));
vi.mock("@/components/review/messaging", () => ({ sendMessage: mocks.sendMessage }));
vi.mock("@/utils/toast", () => ({ showErrorToast: mocks.errorToast }));

import { ReviewBoard } from "@/components/ReviewBoard";
import { ApiError } from "@/utils/review-utils";

const product: ReviewProduct = {
  id: "test-product", title: "Test product", url: "https://example.invalid/items/test-product",
  score: 8, thumbnails: [], category: "test", shop: { id: "shop", name: "Shop", url: "", avatar: "" },
};
const profile: UserProfile = {
  id: "me", username: "Tester", discord: "test", adult: false,
  autoCollapse: false, admin: false, bio: "",
};
const existingReview: MyCommentData = { id: "my-review", content: "My saved review", score: 6 };
const publicComment = (id: string): CommentItem => ({
  id, content: `Review ${id}`, score: 8, updatedAt: "2026-01-01T12:00:00.000Z",
  user: { id: `user-${id}`, username: `Reviewer ${id}` },
});
const emptyPage = { count: 0, comments: [] as CommentItem[], page: 1, pageSize: 20 };

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const observers: TestIntersectionObserver[] = [];
class TestIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
  takeRecords = vi.fn(() => []);
  root = null;
  rootMargin = "200px";
  thresholds = [0];
  constructor(private callback: IntersectionObserverCallback) { observers.push(this); }
  intersect() {
    this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
  }
}

let container: HTMLDivElement;
let root: Root | undefined;
let queryClient: QueryClient;
const forbiddenFetch = vi.fn(() => { throw new Error("Network is forbidden in synthetic integration tests"); });

beforeEach(() => {
  vi.resetAllMocks();
  observers.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", forbiddenFetch);
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("XHR is forbidden in synthetic integration tests"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("WebSockets are forbidden in synthetic integration tests"); } });
  mocks.storageWatch.mockReturnValue(() => undefined);
  let imageSequence = 0;
  mocks.createObjectURL.mockImplementation(() => `blob:synthetic-${++imageSequence}`);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: mocks.createObjectURL });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: mocks.revokeObjectURL });
  mocks.findProduct.mockResolvedValue(product);
  mocks.fetchProfile.mockResolvedValue(profile);
  mocks.fetchComments.mockResolvedValue(emptyPage);
  mocks.fetchMyComment.mockResolvedValue(null);
  mocks.submitComment.mockResolvedValue(undefined);
  mocks.deleteComment.mockResolvedValue(undefined);
  mocks.captureSession.mockImplementation(async (signal) => ({ sessionId: "A", signal }));
  mocks.deleteImage.mockResolvedValue(undefined);
  mocks.login.mockResolvedValue(undefined);
  mocks.sendMessage.mockImplementation(async (name: string) => {
    if (name !== "openAccountSettings" && name !== "setAuthTokens") throw new Error(`Unexpected runtime message: ${name}`);
  });
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  queryClient.clear();
  container.remove();
  expect(forbiddenFetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

async function renderBoard() {
  root = createRoot(container);
  await act(async () => root!.render(<QueryClientProvider client={queryClient}><ReviewBoard /></QueryClientProvider>));
}
async function eventually(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assertion();
  }, { timeout: 2000, interval: 5 });
}
function button(label: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent === label || element.getAttribute("aria-label") === label);
  expect(match, `Expected button ${label}`).toBeDefined();
  return match!;
}
function textarea(): HTMLTextAreaElement { return container.querySelector("textarea")!; }
async function click(element: HTMLElement) { await act(async () => element.click()); }
async function typeReview(value: string) {
  await act(async () => {
    const input = textarea();
    // Use the native setter so React's controlled-input tracker observes the DOM edit.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submitForm() {
  await act(async () => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}
async function ready() {
  await renderBoard();
  await eventually(() => expect(textarea()?.disabled).toBe(false));
}

describe("ReviewBoard React DOM integration", () => {
  it("shows loading until the product resolves, then shows the empty state and editable form", async () => {
    const pendingProduct = deferred<ReviewProduct>();
    mocks.findProduct.mockReturnValue(pendingProduct.promise);
    await renderBoard();
    expect(container.textContent).toContain("reviewBoard.loading");
    expect(container.querySelector("form")).toBeNull();
    expect(mocks.fetchComments).not.toHaveBeenCalled();
    await act(async () => pendingProduct.resolve(product));
    await eventually(() => {
      expect(container.textContent).toContain("reviewBoard.noComments");
      expect(textarea().disabled).toBe(false);
    });
    expect(mocks.fetchComments).toHaveBeenCalledWith(product.id, 1, 20);
  });

  it("does not show an empty list while comments are still loading", async () => {
    const comments = deferred<typeof emptyPage>();
    mocks.fetchComments.mockReturnValue(comments.promise);
    await ready();
    expect(container.textContent).not.toContain("reviewBoard.noComments");
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
    await act(async () => comments.resolve(emptyPage));
    await eventually(() => expect(container.textContent).toContain("reviewBoard.noComments"));
    expect(container.querySelector(".animate-pulse")).toBeNull();
  });

  it("waits for the user's existing review before enabling the form", async () => {
    const review = deferred<MyCommentData>();
    mocks.fetchMyComment.mockReturnValue(review.promise);
    await renderBoard();
    await eventually(() => expect(container.textContent).toContain("reviewBoard.noComments"));
    expect(textarea().disabled).toBe(true);
    expect(button("reviewBoard.submit.new").disabled).toBe(true);
    await act(async () => review.resolve(existingReview));
    await eventually(() => {
      expect(textarea().disabled).toBe(false);
      expect(textarea().value).toBe(existingReview.content);
      expect(button("reviewBoard.submit.edit").disabled).toBe(false);
    });
  });

  it("retries a failed product fetch without treating the failure as an empty comments result", async () => {
    mocks.findProduct.mockRejectedValueOnce(new Error("Product request failed")).mockResolvedValue(product);
    await renderBoard();
    await eventually(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.textContent).not.toContain("reviewBoard.noComments");
    expect(textarea().disabled).toBe(true);
    expect(mocks.errorToast).toHaveBeenCalledWith("Product request failed");
    await click(button("userComments.refresh"));
    await eventually(() => expect(container.textContent).toContain("reviewBoard.noComments"));
    expect(mocks.findProduct).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows a comments error and retries the failed comments query", async () => {
    mocks.fetchComments.mockRejectedValueOnce(new Error("Comments unavailable"))
      .mockResolvedValue({ ...emptyPage, count: 1, comments: [publicComment("recovered")] });
    await ready();
    await eventually(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.textContent).not.toContain("reviewBoard.noComments");
    await click(button("userComments.refresh"));
    await eventually(() => expect(container.textContent).toContain("Review recovered"));
    expect(mocks.fetchComments).toHaveBeenCalledTimes(2);
    expect(mocks.findProduct).toHaveBeenCalledTimes(1);
  });

  it("shows an unavailable product separately and never queries its comments", async () => {
    mocks.findProduct.mockResolvedValue(null);
    await renderBoard();
    await eventually(() => expect(container.textContent).toContain("reviewBoard.productUnavailable"));
    expect(textarea().disabled).toBe(true);
    expect(mocks.fetchComments).not.toHaveBeenCalled();
    expect(mocks.fetchMyComment).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("reviewBoard.noComments");
  });

  it("keeps signed-out editing disabled and rejects even a manually dispatched submit", async () => {
    mocks.fetchProfile.mockResolvedValue(null);
    await renderBoard();
    await eventually(() => expect(container.textContent).toContain("reviewBoard.noComments"));
    expect(textarea().disabled).toBe(true);
    expect(button("reviewBoard.submit.new").disabled).toBe(true);
    expect(container.textContent).toContain("reviewBoard.loginPrompt");
    expect(container.textContent).not.toContain("reviewBoard.button.accountSettings");
    await click(button("aria.scorePoint:1"));
    await submitForm();
    expect(mocks.submitComment).not.toHaveBeenCalled();
    expect(mocks.errorToast).toHaveBeenCalledWith("messages.loginRequired");
  });

  it("accepts exactly 500 characters, trims the content, and submits the selected half-star score once", async () => {
    const save = deferred<void>();
    mocks.submitComment.mockReturnValue(save.promise);
    await ready();
    expect(textarea().maxLength).toBe(500);
    expect(textarea().getAttribute("aria-describedby")).toBe("review-content-count");
    await typeReview("x".repeat(500));
    expect(container.querySelector("#review-content-count")?.textContent).toBe("reviewBoard.characterCount:500,500");
    await click(button("aria.scorePoint:7"));
    await click(button("reviewBoard.submit.new"));
    await eventually(() => expect(button("reviewBoard.submit.saving").disabled).toBe(true));
    expect(textarea().disabled).toBe(true);
    await click(button("reviewBoard.submit.saving"));
    expect(mocks.submitComment).toHaveBeenCalledTimes(1);
    expect(mocks.submitComment).toHaveBeenCalledWith(product.id, "POST", { content: "x".repeat(500), score: 7, imageIds: [] }, expect.objectContaining({ sessionId: "A" }));
    await act(async () => save.resolve());
    await eventually(() => expect(button("reviewBoard.submit.new").disabled).toBe(false));
    await typeReview("  Trim this review  ");
    await submitForm();
    expect(mocks.submitComment).toHaveBeenLastCalledWith(product.id, "POST", { content: "Trim this review", score: 7, imageIds: [] }, expect.objectContaining({ sessionId: "A" }));
  });

  it("rejects empty and over-limit input before starting a mutation", async () => {
    await ready();
    await typeReview("   ");
    await submitForm();
    expect(mocks.errorToast).toHaveBeenLastCalledWith("messages.emptyContent");
    await typeReview("x".repeat(501));
    expect(textarea().getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector("#review-content-count")?.textContent).toBe("reviewBoard.characterCount:501,500");
    await submitForm();
    expect(mocks.errorToast).toHaveBeenLastCalledWith("messages.contentTooLong:500");
    expect(mocks.submitComment).not.toHaveBeenCalled();
  });

  it("uses PUT for an existing review and refreshes the real query cache after success", async () => {
    mocks.fetchMyComment.mockResolvedValue(existingReview);
    await ready();
    await eventually(() => expect(textarea().value).toBe(existingReview.content));
    expect(button("reviewBoard.submit.edit")).toBeDefined();
    await typeReview("Edited review");
    await submitForm();
    expect(mocks.submitComment).toHaveBeenCalledWith(product.id, "PUT", { content: "Edited review", score: 6, imageIds: [] }, expect.objectContaining({ sessionId: "A" }));
    await eventually(() => {
      expect(mocks.findProduct).toHaveBeenCalledTimes(2);
      expect(mocks.fetchComments).toHaveBeenCalledTimes(2);
      expect(mocks.fetchMyComment).toHaveBeenCalledTimes(2);
    });
  });

  it("preserves the draft and score while deletion is pending and after a delayed failure", async () => {
    const removal = deferred<void>();
    mocks.fetchMyComment.mockResolvedValue(existingReview);
    mocks.deleteComment.mockReturnValue(removal.promise);
    await ready();
    await eventually(() => expect(textarea().value).toBe(existingReview.content));
    await typeReview("Unsaved edit worth keeping");
    await click(button("aria.scorePoint:3"));
    await click(button("reviewBoard.submit.delete"));
    await eventually(() => expect(button("reviewBoard.submit.deleting").disabled).toBe(true));
    expect(textarea().value).toBe("Unsaved edit worth keeping");
    expect(mocks.fetchComments).toHaveBeenCalledTimes(1);
    await click(button("reviewBoard.submit.deleting"));
    expect(mocks.deleteComment).toHaveBeenCalledTimes(1);
    await act(async () => removal.reject(new Error("Delete failed")));
    await eventually(() => expect(button("reviewBoard.submit.delete").disabled).toBe(false));
    expect(textarea().value).toBe("Unsaved edit worth keeping");
    expect(mocks.errorToast).toHaveBeenCalledWith("messages.reviewDeleteError");
    expect(mocks.fetchComments).toHaveBeenCalledTimes(1);
    await submitForm();
    expect(mocks.submitComment).toHaveBeenCalledWith(product.id, "PUT", { content: "Unsaved edit worth keeping", score: 3, imageIds: [] }, expect.objectContaining({ sessionId: "A" }));
  });

  it("clears a deleted review only after the delete promise succeeds and then resets the score", async () => {
    const removal = deferred<void>();
    mocks.fetchMyComment.mockResolvedValue(existingReview);
    mocks.deleteComment.mockReturnValue(removal.promise);
    await ready();
    await eventually(() => expect(textarea().value).toBe(existingReview.content));
    await click(button("reviewBoard.submit.delete"));
    await eventually(() => expect(button("reviewBoard.submit.deleting").disabled).toBe(true));
    expect(textarea().value).toBe(existingReview.content);
    expect(mocks.fetchComments).toHaveBeenCalledTimes(1);
    mocks.fetchMyComment.mockResolvedValue(null);
    await act(async () => removal.resolve());
    await eventually(() => {
      expect(textarea().value).toBe("");
      expect(button("reviewBoard.submit.new").disabled).toBe(false);
      expect(mocks.fetchComments).toHaveBeenCalledTimes(2);
      expect(mocks.findProduct).toHaveBeenCalledTimes(2);
    });
    expect(container.textContent).not.toContain("reviewBoard.submit.delete");
    await typeReview("A new review");
    await submitForm();
    expect(mocks.submitComment).toHaveBeenCalledWith(product.id, "POST", { content: "A new review", score: 8, imageIds: [] }, expect.objectContaining({ sessionId: "A" }));
  });

  it("allows a fresh login after cancellation while preventing repeated clicks during each pending attempt", async () => {
    const cancelled = deferred<void>();
    const successful = deferred<void>();
    mocks.fetchProfile.mockResolvedValue(null);
    mocks.login.mockReturnValueOnce(cancelled.promise).mockReturnValueOnce(successful.promise);
    await renderBoard();
    await eventually(() => expect(button("reviewBoard.button.login").disabled).toBe(false));
    await click(button("reviewBoard.button.login"));
    expect(button("reviewBoard.button.login").disabled).toBe(true);
    await click(button("reviewBoard.button.login"));
    expect(mocks.login).toHaveBeenCalledTimes(1);
    await act(async () => cancelled.reject(new Error("Cancelled by user")));
    await eventually(() => expect(button("reviewBoard.button.login").disabled).toBe(false));
    expect(mocks.errorToast).toHaveBeenCalledWith("messages.loginError");
    expect(mocks.fetchProfile).toHaveBeenCalledTimes(1);
    expect(textarea().disabled).toBe(true);
    await click(button("reviewBoard.button.login"));
    await click(button("reviewBoard.button.login"));
    expect(mocks.login).toHaveBeenCalledTimes(2);
    mocks.fetchProfile.mockResolvedValue(profile);
    await act(async () => successful.resolve());
    await eventually(() => {
      expect(button("reviewBoard.button.logout").disabled).toBe(false);
      expect(textarea().disabled).toBe(false);
    });
    expect(mocks.fetchProfile).toHaveBeenCalledTimes(2);
    expect(mocks.fetchComments).toHaveBeenCalledTimes(2);
    expect(mocks.fetchMyComment).toHaveBeenCalledTimes(2);
  });

  it("waits for token removal before logout refresh and clears the editable draft", async () => {
    const logout = deferred<void>();
    mocks.sendMessage.mockReturnValue(logout.promise);
    await ready();
    await typeReview("Draft before logout");
    await click(button("reviewBoard.button.logout"));
    expect(mocks.sendMessage).toHaveBeenCalledWith("setAuthTokens", null);
    expect(button("reviewBoard.button.logout").disabled).toBe(true);
    expect(textarea().disabled).toBe(true);
    expect(textarea().value).toBe("Draft before logout");
    await click(button("reviewBoard.button.logout"));
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.fetchProfile).toHaveBeenCalledTimes(1);
    mocks.fetchProfile.mockResolvedValue(null);
    await act(async () => logout.resolve());
    await eventually(() => {
      expect(button("reviewBoard.button.login").disabled).toBe(false);
      expect(textarea().value).toBe("");
      expect(textarea().disabled).toBe(true);
    });
  });

  it("disables deleting an existing review while logout is still pending", async () => {
    const logout = deferred<void>();
    mocks.fetchMyComment.mockResolvedValue(existingReview);
    mocks.sendMessage.mockReturnValue(logout.promise);
    await ready();
    await eventually(() => expect(textarea().value).toBe(existingReview.content));
    await click(button("reviewBoard.button.logout"));
    expect(button("reviewBoard.submit.delete").disabled).toBe(true);
    await click(button("reviewBoard.submit.delete"));
    expect(mocks.deleteComment).not.toHaveBeenCalled();
    mocks.fetchProfile.mockResolvedValue(null);
    mocks.fetchMyComment.mockResolvedValue(null);
    await act(async () => logout.resolve());
  });

  it("restores editing and preserves the draft when logout fails", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("Storage unavailable"));
    await ready();
    await typeReview("Keep me after logout failure");
    await click(button("reviewBoard.button.logout"));
    await eventually(() => expect(button("reviewBoard.button.logout").disabled).toBe(false));
    expect(mocks.errorToast).toHaveBeenCalledWith("messages.logoutError");
    expect(textarea().value).toBe("Keep me after logout failure");
    expect(textarea().disabled).toBe(false);
    expect(mocks.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it("populates the existing review after signing in", async () => {
    const login = deferred<void>();
    mocks.fetchProfile.mockResolvedValue(null);
    mocks.login.mockReturnValue(login.promise);
    await renderBoard();
    await eventually(() => expect(button("reviewBoard.button.login").disabled).toBe(false));
    await click(button("reviewBoard.button.login"));
    mocks.fetchProfile.mockResolvedValue(profile);
    mocks.fetchMyComment.mockResolvedValue(existingReview);
    await act(async () => login.resolve());
    await eventually(() => {
      expect(button("reviewBoard.submit.edit").disabled).toBe(false);
      expect(textarea().value).toBe(existingReview.content);
    });
  });

  it("shows actionable username guidance for the exact forbidden response and opens account settings", async () => {
    mocks.submitComment.mockRejectedValue(new ApiError(JSON.stringify({ message: "forbidden" }), 403));
    await ready();
    await typeReview("Please save this review");
    await submitForm();
    await eventually(() => expect(container.querySelector('[role="status"]')?.textContent).toContain("messages.usernameSetupHint"));
    expect(textarea().value).toBe("Please save this review");
    expect(mocks.errorToast).toHaveBeenCalledWith("messages.usernameSetupHint");
    const hintButton = container.querySelector<HTMLButtonElement>('[role="status"] button')!;
    await click(hintButton);
    expect(mocks.sendMessage).toHaveBeenCalledWith("openAccountSettings", undefined);
    mocks.submitComment.mockResolvedValue(undefined);
    await submitForm();
    await eventually(() => expect(container.querySelector('[role="status"]')).toBeNull());
  });

  it.each([
    [403, JSON.stringify({ message: "blinded" }), "messages.reviewSaveError"],
    [403, "Forbidden", "messages.reviewSaveError"],
    [400, JSON.stringify({ message: "validation failed" }), "messages.checkContent"],
    [500, "server failed", "messages.reviewSaveError"],
  ])("keeps the draft without misleading username guidance for error %s/%s", async (status, message, toast) => {
    mocks.submitComment.mockRejectedValue(new ApiError(message, status));
    await ready();
    await typeReview("Preserve this draft");
    await submitForm();
    await eventually(() => expect(mocks.errorToast).toHaveBeenCalledWith(toast));
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(textarea().value).toBe("Preserve this draft");
    expect(mocks.fetchComments).toHaveBeenCalledTimes(1);
  });

  it("opens account settings from the header and reports runtime failures", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("Could not open extension page"));
    await ready();
    await click(button("reviewBoard.button.accountSettings"));
    expect(mocks.sendMessage).toHaveBeenCalledWith("openAccountSettings", undefined);
    expect(mocks.errorToast).toHaveBeenCalledWith("messages.accountSettingsError");
  });

  it("loads the next comments page and cleans up observers across unmount and remount", async () => {
    const page2 = deferred<{ count: number; comments: CommentItem[]; page: number; pageSize: number }>();
    mocks.fetchComments.mockImplementation((_id: string, page: number) => page === 1
      ? Promise.resolve({ count: 21, comments: [publicComment("first")], page: 1, pageSize: 20 })
      : page2.promise);
    await ready();
    await eventually(() => expect(observers.length).toBeGreaterThan(0));
    const firstObserver = observers.at(-1)!;
    expect(firstObserver.observe).toHaveBeenCalledTimes(1);
    await act(async () => firstObserver.intersect());
    await eventually(() => expect(container.textContent).toContain("reviewBoard.loader.loadingMore"));
    expect(mocks.fetchComments).toHaveBeenCalledWith(product.id, 2, 20);
    await act(async () => page2.resolve({ count: 21, comments: [publicComment("last")], page: 2, pageSize: 20 }));
    await eventually(() => expect(container.textContent).toContain("Review last"));
    expect(container.textContent).toContain("Review first");
    expect(firstObserver.disconnect).toHaveBeenCalledTimes(1);
    await act(async () => root!.unmount());
    root = undefined;
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
    queryClient.clear();
    mocks.fetchComments.mockResolvedValue({ count: 21, comments: [publicComment("remount")], page: 1, pageSize: 20 });
    const previousObserverCount = observers.length;
    await renderBoard();
    await eventually(() => expect(observers.length).toBeGreaterThan(previousObserverCount));
    const remountObserver = observers.at(-1)!;
    expect(remountObserver.observe).toHaveBeenCalledTimes(1);
    expect(remountObserver.disconnect).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Review remount");
    await act(async () => root!.unmount());
    root = undefined;
    expect(remountObserver.disconnect).toHaveBeenCalledTimes(1);
  });
});


it("clears the prior account's form when another tab changes the stored session", async () => {
  mocks.fetchMyComment.mockResolvedValue(existingReview);
  await renderBoard();
  await eventually(() => expect(container.querySelector("textarea")?.value).toBe(existingReview.content));
  mocks.fetchProfile.mockResolvedValue({ ...profile, id: "other-user", username: "Other user" });
  mocks.fetchMyComment.mockResolvedValue(null);
  const onStorageChange = mocks.storageWatch.mock.calls[0][0];
  await act(async () => onStorageChange(
    { accessToken: "new", refreshToken: "new-r", sessionId: "B" },
    { accessToken: "old", refreshToken: "old-r", sessionId: "A" },
  ));
  await eventually(() => {
    expect(queryClient.getQueryData<{ id: string }>(["userProfile"])?.id).toBe("other-user");
    expect(container.querySelector("textarea")?.value).toBe("");
  });
});

const imageOne = { id: "image-one", url: "https://cdn.example.invalid/reviews/one.webp", width: 128, height: 96 };
const imageTwo = { id: "image-two", url: "https://cdn.example.invalid/reviews/two.webp", width: 96, height: 128 };
function imageFile(name = "synthetic.png", type = "image/png", size = 20) {
  return new File([new Uint8Array(size)], name, { type });
}
async function selectFiles(files: File[]) {
  await act(async () => {
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: files });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const draftImages = () => container.querySelectorAll('fieldset img');
async function sessionChange(nextSession = "B", previousSession = "A") {
  await act(async () => {
    for (const [callback] of mocks.storageWatch.mock.calls) callback(
      { accessToken: "new", refreshToken: "new-r", sessionId: nextSession },
      { accessToken: "old", refreshToken: "old-r", sessionId: previousSession },
    );
  });
}

describe("review image authoring and safe rendering (synthetic DOM only)", () => {
  it("previews files locally without uploading and revokes removed/unmounted previews", async () => {
    await ready();
    await selectFiles([imageFile(), imageFile("second.webp", "image/webp")]);
    expect(draftImages()).toHaveLength(2);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
    await click(button("reviewImages.remove:1"));
    expect(draftImages()).toHaveLength(1);
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-1");
    expect(mocks.deleteImage).not.toHaveBeenCalled();
    await act(async () => root!.unmount()); root = undefined;
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-2");
  });

  it("rejects unsupported/oversized/too-many images atomically and permits reselecting files", async () => {
    await ready();
    await selectFiles([imageFile("one.gif", "image/gif")]);
    expect(mocks.errorToast).toHaveBeenLastCalledWith("reviewImages.typeError");
    await selectFiles([imageFile("big.png", "image/png", 8 * 1024 * 1024 + 1)]);
    expect(mocks.errorToast).toHaveBeenLastCalledWith("reviewImages.sizeError");
    await selectFiles(Array.from({ length: 6 }, () => imageFile()));
    expect(mocks.errorToast).toHaveBeenLastCalledWith("reviewImages.countError");
    expect(draftImages()).toHaveLength(0);
    await selectFiles([imageFile()]);
    await selectFiles([imageFile()]);
    expect(draftImages()).toHaveLength(2);
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(2);
  });

  it("uploads only on save, locks same-tick repeated submits, and uses uploaded IDs", async () => {
    const upload = deferred<typeof imageOne>();
    mocks.uploadImage.mockReturnValue(upload.promise);
    await ready();
    await typeReview("With an image");
    const file = imageFile();
    await selectFiles([file]);
    await act(async () => {
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(mocks.uploadImage).toHaveBeenCalledOnce();
    expect(mocks.submitComment).not.toHaveBeenCalled();
    await eventually(() => expect(container.querySelector('fieldset')?.disabled).toBe(true));
    await act(async () => upload.resolve(imageOne));
    await eventually(() => expect(mocks.submitComment).toHaveBeenCalledOnce());
    expect(mocks.submitComment).toHaveBeenCalledWith(product.id, "POST", { content: "With an image", score: 8, imageIds: [imageOne.id] }, expect.objectContaining({ sessionId: "A" }));
    await eventually(() => expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-1"));
  });

  it("preserves the full draft after partial upload failure and reuses successful uploads on retry", async () => {
    mocks.uploadImage.mockResolvedValueOnce(imageOne).mockRejectedValueOnce(new ApiError("busy", 503)).mockResolvedValueOnce(imageTwo);
    await ready();
    await typeReview("Preserve my image draft");
    await click(button("aria.scorePoint:5"));
    await selectFiles([imageFile(), imageFile("second.png")]);
    await submitForm();
    await eventually(() => expect(mocks.errorToast).toHaveBeenCalledWith("reviewImages.uploadError"));
    expect(mocks.submitComment).not.toHaveBeenCalled();
    expect(textarea().value).toBe("Preserve my image draft");
    expect(draftImages()).toHaveLength(2);
    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();
    await submitForm();
    await eventually(() => expect(mocks.submitComment).toHaveBeenCalledOnce());
    expect(mocks.uploadImage).toHaveBeenCalledTimes(3);
    expect(mocks.submitComment).toHaveBeenCalledWith(product.id, "POST", { content: "Preserve my image draft", score: 5, imageIds: [imageOne.id, imageTwo.id] }, expect.any(Object));
  });

  it("retains uploaded files after save rejection, supports deleting pending uploads, and treats 404 as removed", async () => {
    mocks.uploadImage.mockResolvedValue(imageOne);
    mocks.submitComment.mockRejectedValue(new ApiError("validation", 400));
    await ready(); await typeReview("Unsaved"); await selectFiles([imageFile()]); await submitForm();
    await eventually(() => expect(mocks.errorToast).toHaveBeenCalledWith("messages.checkContent"));
    expect(draftImages()).toHaveLength(1);
    mocks.deleteImage.mockRejectedValueOnce(new Error("lost delete response"));
    await click(button("reviewImages.remove:1"));
    await eventually(() => expect(mocks.errorToast).toHaveBeenCalledWith("reviewImages.removeError"));
    expect(draftImages()).toHaveLength(1);
    mocks.deleteImage.mockRejectedValueOnce(new ApiError("not found", 404));
    await click(button("reviewImages.remove:1"));
    await eventually(() => expect(draftImages()).toHaveLength(0));
    expect(mocks.deleteImage).toHaveBeenCalledTimes(2);
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-1");
  });

  it("keeps existing IDs and anonymous state, and deletes detached images only after successful PUT", async () => {
    const save = deferred<void>();
    mocks.fetchMyComment.mockResolvedValue({ ...existingReview, images: [imageOne, imageTwo], anonymous: true });
    mocks.submitComment.mockReturnValue(save.promise);
    await ready(); await eventually(() => expect(draftImages()).toHaveLength(2));
    await click(button("reviewImages.remove:1"));
    expect(mocks.deleteImage).not.toHaveBeenCalled();
    await submitForm();
    expect(mocks.submitComment).toHaveBeenCalledWith(product.id, "PUT", { content: existingReview.content, score: existingReview.score, anonymous: true, imageIds: [imageTwo.id] }, expect.any(Object));
    expect(mocks.deleteImage).not.toHaveBeenCalled();
    mocks.fetchMyComment.mockResolvedValue({ ...existingReview, images: [imageTwo], anonymous: true });
    await act(async () => save.resolve());
    await eventually(() => expect(mocks.deleteImage).toHaveBeenCalledWith(imageOne.id, expect.objectContaining({ sessionId: "A" })));
    expect(mocks.uploadImage).not.toHaveBeenCalled();
    expect(draftImages()).toHaveLength(1);
  });

  it("does not delete existing images after a failed edit and preserves removals for retry", async () => {
    mocks.fetchMyComment.mockResolvedValue({ ...existingReview, images: [imageOne] });
    mocks.submitComment.mockRejectedValueOnce(new ApiError("rejected", 400)).mockResolvedValue(undefined);
    await ready(); await eventually(() => expect(draftImages()).toHaveLength(1));
    await click(button("reviewImages.remove:1")); await submitForm();
    await eventually(() => expect(mocks.errorToast).toHaveBeenCalled());
    expect(mocks.deleteImage).not.toHaveBeenCalled(); expect(draftImages()).toHaveLength(0);
    await submitForm();
    await eventually(() => expect(mocks.deleteImage).toHaveBeenCalledOnce());
  });

  it("reconciles a committed create after a lost response without repeating the write", async () => {
    mocks.uploadImage.mockResolvedValue(imageOne);
    mocks.submitComment.mockRejectedValue(new TypeError("lost response"));
    await ready(); await typeReview("Committed remotely"); await selectFiles([imageFile()]);
    mocks.fetchMyComment.mockResolvedValue({ id: "created-id", content: "Committed remotely", score: 8, images: [imageOne] });
    await submitForm();
    await eventually(() => expect(button("reviewBoard.submit.edit").disabled).toBe(false));
    expect(mocks.submitComment).toHaveBeenCalledOnce();
    expect(mocks.errorToast).not.toHaveBeenCalled();
    expect(textarea().value).toBe("Committed remotely"); expect(draftImages()).toHaveLength(1);
  });

  it("reconciles a conflicting create's identity without overwriting the edited draft", async () => {
    mocks.submitComment.mockRejectedValue(new ApiError("already exists", 409));
    await ready(); await typeReview("My current draft");
    mocks.fetchMyComment.mockResolvedValue({ ...existingReview, images: [imageOne] });
    await submitForm();
    await eventually(() => expect(mocks.errorToast).toHaveBeenCalledWith("messages.reviewSaveError"));
    expect(textarea().value).toBe("My current draft"); expect(draftImages()).toHaveLength(0);
    mocks.submitComment.mockResolvedValue(undefined);
    await submitForm();
    await eventually(() => expect(mocks.submitComment).toHaveBeenCalledTimes(2));
    expect(mocks.submitComment.mock.calls[1][1]).toBe("PUT");
  });

  it("aborts interrupted uploads on unmount and never submits their late results", async () => {
    const upload = deferred<typeof imageOne>(); mocks.uploadImage.mockReturnValue(upload.promise);
    await ready(); await typeReview("Interrupted"); await selectFiles([imageFile()]); await submitForm();
    const context = mocks.uploadImage.mock.calls[0][1];
    await act(async () => root!.unmount()); root = undefined;
    expect(context.signal.aborted).toBe(true);
    await act(async () => upload.resolve(imageOne));
    expect(mocks.submitComment).not.toHaveBeenCalled();
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-1");
  });

  it("clears and aborts the old account draft when another account logs in during an upload", async () => {
    const upload = deferred<typeof imageOne>(); mocks.uploadImage.mockReturnValue(upload.promise);
    await ready(); await typeReview("Account A draft"); await selectFiles([imageFile()]); await submitForm();
    mocks.fetchProfile.mockResolvedValue({ ...profile, id: "account-b" });
    await sessionChange();
    await act(async () => upload.resolve(imageOne));
    await eventually(() => expect(textarea().value).toBe(""));
    expect(draftImages()).toHaveLength(0); expect(mocks.submitComment).not.toHaveBeenCalled();
    expect(mocks.errorToast).not.toHaveBeenCalled();
  });

  it("rehydrates the same saved review ID after a fast same-user new-session refetch", async () => {
    mocks.fetchMyComment.mockResolvedValue({ ...existingReview, images: [imageOne] });
    await ready(); await eventually(() => expect(draftImages()).toHaveLength(1));
    await typeReview("Old session draft");
    await sessionChange();
    await eventually(() => {
      expect(textarea().value).toBe(existingReview.content);
      expect(draftImages()).toHaveLength(1);
    });
  });

  it("keeps local image/text drafts on token rotation within the same session", async () => {
    await ready(); await typeReview("Same session"); await selectFiles([imageFile()]);
    await sessionChange("A", "A");
    expect(textarea().value).toBe("Same session"); expect(draftImages()).toHaveLength(1);
    expect(mocks.revokeObjectURL).not.toHaveBeenCalled();
  });

  it("does not erase existing images when login's public-comments refetch finishes last", async () => {
    const slowComments = deferred<typeof emptyPage>();
    mocks.fetchProfile.mockResolvedValue(null);
    await renderBoard(); await eventually(() => expect(button("reviewBoard.button.login").disabled).toBe(false));
    mocks.fetchProfile.mockResolvedValue(profile);
    mocks.fetchMyComment.mockResolvedValue({ ...existingReview, images: [imageOne] });
    mocks.fetchComments.mockReturnValue(slowComments.promise);
    await click(button("reviewBoard.button.login"));
    await eventually(() => expect(draftImages()).toHaveLength(1));
    await act(async () => slowComments.resolve(emptyPage));
    await eventually(() => expect(button("reviewBoard.submit.edit").disabled).toBe(false));
    expect(textarea().value).toBe(existingReview.content); expect(draftImages()).toHaveLength(1);
  });

  it("shows a retry for failed own-review reads without allowing a destructive create", async () => {
    mocks.fetchMyComment.mockRejectedValueOnce(new Error("read unavailable")).mockResolvedValue(existingReview);
    await renderBoard(); await eventually(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(textarea().disabled).toBe(true);
    expect(container.textContent).not.toContain("reviewBoard.loginPrompt");
    await submitForm(); expect(mocks.submitComment).not.toHaveBeenCalled();
    await click(button("userComments.refresh"));
    await eventually(() => expect(textarea().value).toBe(existingReview.content));
    expect(textarea().disabled).toBe(false);
  });

  it("renders safe public images and anonymous names while suppressing hidden/unsafe images", async () => {
    mocks.fetchComments.mockResolvedValue({ ...emptyPage, count: 3, comments: [
      { ...publicComment("safe"), images: [imageOne], user: { id: "", username: "", anonymous: true } },
      { ...publicComment("hidden"), blinded: true, images: [imageTwo] },
      { ...publicComment("unsafe"), images: [{ ...imageOne, url: "javascript:alert(1)" }] },
    ] });
    await ready();
    const images = container.querySelectorAll("article img");
    expect(images).toHaveLength(1); expect(images[0].getAttribute("src")).toBe(imageOne.url);
    expect(images[0].getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(images[0].parentElement?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.textContent).toContain("reviewBoard.anonymous");
    expect(container.textContent).toContain("reviewBoard.blinded");
    expect(container.textContent).not.toContain("Review hidden");
  });
});

it("does not clear a new account's images when an older logout refetch completes late", async () => {
  mocks.fetchMyComment.mockResolvedValue({ ...existingReview, images: [imageOne] });
  await ready();
  const slowComments = deferred<typeof emptyPage>();
  mocks.fetchProfile.mockResolvedValue(null);
  mocks.fetchMyComment.mockResolvedValue(null);
  mocks.fetchComments.mockReturnValueOnce(slowComments.promise);
  await click(button("reviewBoard.button.logout"));
  await eventually(() => expect(mocks.fetchComments).toHaveBeenCalledTimes(2));
  mocks.fetchProfile.mockResolvedValue({ ...profile, id: "account-b" });
  mocks.fetchMyComment.mockResolvedValue({ id: "b-review", content: "B saved text", score: 8, images: [imageTwo] });
  await sessionChange("B", "A");
  await eventually(() => {
    expect(textarea().value).toBe("B saved text");
    expect(draftImages()).toHaveLength(1);
  });
  await act(async () => slowComments.resolve(emptyPage));
  await eventually(() => expect(button("reviewBoard.button.logout").disabled).toBe(false));
  expect(textarea().value).toBe("B saved text");
  expect(draftImages()).toHaveLength(1);
});

it("cleans only pending uploads after whole-review deletion, leaving attached image retention to the server", async () => {
  mocks.fetchMyComment.mockResolvedValue({ ...existingReview, images: [imageOne] });
  mocks.uploadImage.mockResolvedValue(imageTwo);
  mocks.submitComment.mockRejectedValue(new ApiError("invalid edit", 400));
  await ready(); await eventually(() => expect(draftImages()).toHaveLength(1));
  await selectFiles([imageFile()]); await submitForm();
  await eventually(() => expect(mocks.errorToast).toHaveBeenCalledWith("messages.checkContent"));
  mocks.fetchMyComment.mockResolvedValue(null);
  await click(button("reviewBoard.submit.delete"));
  await eventually(() => expect(draftImages()).toHaveLength(0));
  expect(mocks.deleteImage).toHaveBeenCalledExactlyOnceWith(imageTwo.id, expect.any(Object));
});
