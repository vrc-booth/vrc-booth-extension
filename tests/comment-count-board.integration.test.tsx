// @vitest-environment happy-dom
// Synthetic React/shadow-DOM integration of the two shipped content-script roots and
// their exported shared QueryClient. Every API/auth/runtime boundary is mocked; live
// traffic is forbidden. This is not installed-extension or browser QA.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentItem, ReviewProduct, UserProfile } from "@/components/review/types";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(), fetchProfile: vi.fn(), fetchComments: vi.fn(), fetchMyComment: vi.fn(), errorToast: vi.fn(),
}));
vi.mock("@/utils/storage", () => ({ authTokenStorage: { watch: () => () => undefined, getValue: async () => ({ accessToken: "test", refreshToken: "refresh", sessionId: "A" }) } }));
vi.mock("#i18n", () => ({
  i18n: { t: (key: string, substitutions?: unknown[]) => `${key}${substitutions ? `:${substitutions.join(",")}` : ""}` },
}));
vi.mock("@/components/review/api", () => ({
  findProductForCurrentPage: mocks.findProduct, fetchUserProfile: mocks.fetchProfile,
  fetchCommentsForProduct: mocks.fetchComments, fetchUserComment: mocks.fetchMyComment,
  submitComment: vi.fn(), deleteComment: vi.fn(), captureReviewSession: vi.fn(),
  uploadReviewImage: vi.fn(), deleteReviewImage: vi.fn(),
}));
vi.mock("@/components/review/auth", () => ({ loginWithDiscord: vi.fn() }));
vi.mock("@/components/review/messaging", () => ({ sendMessage: vi.fn() }));
vi.mock("@/utils/toast", () => ({ REVIEW_TOAST_CONTAINER_ID: "synthetic-review-toasts", showErrorToast: mocks.errorToast }));

import App from "@/entrypoints/item.content/App";
import CommentCountApp from "@/entrypoints/item.content/CommentCountApp";
import { queryClient } from "@/entrypoints/item.content/queryClient";
import { registerReviewBoard, REVIEW_FORM_FIELD_ID } from "@/components/review/reviewBoardFocus";
import { COMMENTS_PAGE_SIZE } from "@/components/review/constants";
import { normalizeUrl } from "@/utils/review-utils";

const product: ReviewProduct = {
  id: "count-test-product", title: "Synthetic product", url: "https://example.invalid/items/synthetic",
  score: 7.4, thumbnails: [], category: "test", shop: { id: "shop", name: "Shop", url: "", avatar: "" },
};
const profile: UserProfile = {
  id: "me", username: "Synthetic reviewer", discord: "test", adult: false,
  autoCollapse: false, admin: false, bio: "",
};
const comment = (id: string): CommentItem => ({
  id, content: `Synthetic review ${id}`, score: 8, updatedAt: "2026-01-01T12:00:00Z",
  user: { id: `user-${id}`, username: `Reviewer ${id}` },
});
const page = (count: number, comments: CommentItem[] = []) => ({ count, comments, page: 1, pageSize: COMMENTS_PAGE_SIZE });
const initialPage = page(23, [comment("one"), comment("two")]);
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
class TestIntersectionObserver {
  observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); takeRecords = vi.fn(() => []);
  root = null; rootMargin = "200px"; thresholds = [0];
}

type Surface = { host: HTMLElement; shadow: ShadowRoot; mount: HTMLDivElement; root?: Root };
let board: Surface;
let counter: Surface;
const forbiddenFetch = vi.fn(() => { throw new Error("Live network is forbidden in synthetic tests"); });
const originalDefaults = queryClient.getDefaultOptions();
const surface = (name: string): Surface => {
  const host = document.createElement(name);
  const shadow = host.attachShadow({ mode: "open" });
  const mount = document.createElement("div");
  shadow.append(mount);
  document.body.append(host);
  host.scrollIntoView = vi.fn();
  return { host, shadow, mount };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", forbiddenFetch);
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  mocks.findProduct.mockResolvedValue(product);
  mocks.fetchProfile.mockResolvedValue(profile);
  mocks.fetchComments.mockResolvedValue(initialPage);
  mocks.fetchMyComment.mockResolvedValue(null);
  queryClient.clear();
  queryClient.setDefaultOptions({
    ...originalDefaults,
    queries: { ...originalDefaults.queries, retry: false, gcTime: Infinity },
  });
  board = surface("synthetic-review-host");
  counter = surface("synthetic-count-host");
  registerReviewBoard({ host: board.host, root: board.shadow });
});
afterEach(async () => {
  await act(async () => { board.root?.unmount(); counter.root?.unmount(); });
  registerReviewBoard(null);
  queryClient.clear();
  queryClient.setDefaultOptions(originalDefaults);
  board.host.remove();
  counter.host.remove();
  expect(forbiddenFetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
async function mountBoth() {
  board.root = createRoot(board.mount);
  counter.root = createRoot(counter.mount);
  await act(async () => { board.root!.render(<App />); counter.root!.render(<CommentCountApp />); });
}
async function eventually(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assertion();
  }, { timeout: 2000, interval: 5 });
}
const countButton = () => counter.shadow.querySelector<HTMLButtonElement>("button");
const field = () => board.shadow.querySelector<HTMLTextAreaElement>(`#${REVIEW_FORM_FIELD_ID}`)!;

describe("comment count button and review board in distinct application roots", () => {
  it("deduplicates in-flight product and first-page requests and shows the server total in both roots", async () => {
    const pendingProduct = deferred<ReviewProduct>();
    const pendingComments = deferred<typeof initialPage>();
    mocks.findProduct.mockReturnValue(pendingProduct.promise);
    mocks.fetchComments.mockReturnValue(pendingComments.promise);
    await mountBoth();
    expect(mocks.findProduct).toHaveBeenCalledOnce();
    expect(mocks.fetchComments).not.toHaveBeenCalled();
    expect(countButton()).toBeNull();
    await act(async () => pendingProduct.resolve(product));
    await eventually(() => expect(mocks.fetchComments).toHaveBeenCalledOnce());
    expect(countButton()).toBeNull();
    await act(async () => pendingComments.resolve(initialPage));
    await eventually(() => expect(countButton()?.textContent).toBe("23"));
    expect(board.shadow.textContent).toContain("reviewBoard.commentsCount:23");
    expect(board.shadow.querySelectorAll("article")).toHaveLength(2);
    expect(mocks.fetchComments).toHaveBeenCalledWith(product.id, 1, COMMENTS_PAGE_SIZE);
    expect(queryClient.getQueryCache().find({ queryKey: ["product", normalizeUrl(window.location.href)] })?.getObserversCount()).toBe(2);
    expect(queryClient.getQueryCache().find({ queryKey: ["comments", product.id, COMMENTS_PAGE_SIZE] })?.getObserversCount()).toBe(2);
  });

  it.each(["product", "comments"] as const)("hides the count when the %s request fails instead of claiming zero", async (request) => {
    (request === "product" ? mocks.findProduct : mocks.fetchComments).mockRejectedValue(new Error("Synthetic unavailable"));
    await mountBoth();
    await eventually(() => expect(board.shadow.querySelector('[role="alert"]')).not.toBeNull());
    expect(countButton()).toBeNull();
    if (request === "product") expect(mocks.fetchComments).not.toHaveBeenCalled();
  });

  it("jumps from the count button to the board's own textarea without new requests", async () => {
    await mountBoth();
    await eventually(() => { expect(countButton()).not.toBeNull(); expect(field()?.disabled).toBe(false); });
    const focus = vi.spyOn(field(), "focus");
    await act(async () => countButton()!.click());
    expect(board.host.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(board.shadow.activeElement).toBe(field());
    expect(mocks.findProduct).toHaveBeenCalledOnce();
    expect(mocks.fetchComments).toHaveBeenCalledOnce();
  });

  it("sends signed-out readers to the single Discord login control", async () => {
    mocks.fetchProfile.mockResolvedValue(null);
    await mountBoth();
    await eventually(() => expect(countButton()).not.toBeNull());
    expect(field().closest("form")?.hidden).toBe(true);
    const loginButtons = board.shadow.querySelectorAll("#review-login-button");
    expect(loginButtons).toHaveLength(1);
    await act(async () => countButton()!.click());
    expect(board.shadow.activeElement).toBe(loginButtons[0]);
  });
});
