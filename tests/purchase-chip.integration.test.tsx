// @vitest-environment happy-dom
// Synthetic React/shadow-DOM integration, not installed-extension or browser QA.
// These are the real two application roots and their exported shared QueryClient.
// Every API/auth/runtime boundary is mocked; live traffic is forbidden.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentItem, ReviewProduct, UserProfile } from "@/components/review/types";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(), fetchProfile: vi.fn(), fetchComments: vi.fn(), fetchMyComment: vi.fn(),
  submitComment: vi.fn(), deleteComment: vi.fn(), login: vi.fn(), sendMessage: vi.fn(), errorToast: vi.fn(),
  messages: {} as Record<string, unknown>,
}));
vi.mock("@/utils/storage", () => ({ authTokenStorage: { watch: () => () => undefined, getValue: async () => ({ accessToken: "test", refreshToken: "refresh", sessionId: "A" }) } }));
vi.mock("#i18n", () => ({ i18n: { t: (key: string, substitutions: Array<string | number> = []) => {
  const value = key.split(".").reduce<unknown>((entry, part) =>
    entry && typeof entry === "object" ? (entry as Record<string, unknown>)[part] : undefined, mocks.messages);
  if (typeof value !== "string") throw new Error(`Missing real locale string: ${key}`);
  return value.replace(/\$(\d+)/g, (_, index: string) => String(substitutions[Number(index) - 1] ?? `$${index}`));
} } }));
vi.mock("@/components/review/api", () => ({
  findProductForCurrentPage: mocks.findProduct, fetchUserProfile: mocks.fetchProfile,
  fetchCommentsForProduct: mocks.fetchComments, fetchUserComment: mocks.fetchMyComment,
  submitComment: mocks.submitComment, deleteComment: mocks.deleteComment,
  captureReviewSession: async (signal?: AbortSignal) => ({ sessionId: "A", signal }),
  uploadReviewImage: vi.fn(), deleteReviewImage: vi.fn(),
}));
vi.mock("@/components/review/auth", () => ({ loginWithDiscord: mocks.login }));
vi.mock("@/components/review/messaging", () => ({ sendMessage: mocks.sendMessage }));
vi.mock("@/utils/toast", () => ({ REVIEW_TOAST_CONTAINER_ID: "synthetic-review-toasts", showErrorToast: mocks.errorToast }));

import App from "@/entrypoints/item.content/App";
import PurchaseApp from "@/entrypoints/item.content/PurchaseApp";
import { queryClient } from "@/entrypoints/item.content/queryClient";
import { registerReviewBoard, REVIEW_FORM_FIELD_ID } from "@/components/review/reviewBoardFocus";
import { REVIEW_CHIP_DISMISS_KEY } from "@/utils/purchase-review";
import { normalizeUrl } from "@/utils/review-utils";
import { COMMENTS_PAGE_SIZE } from "@/components/review/constants";

const require = createRequire(import.meta.url);
const localeRequire = createRequire(require.resolve("@wxt-dev/i18n"));
const { parseYAML } = localeRequire("confbox") as { parseYAML: (value: string) => Record<string, unknown> };
const locale = (name: string) => parseYAML(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), `../locales/${name}.yml`), "utf8"));
const product: ReviewProduct = {
  id: "chip-test-product", title: "Synthetic product", url: "https://example.invalid/items/synthetic",
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
let purchase: Surface;
const forbiddenFetch = vi.fn(() => { throw new Error("Live network is forbidden in synthetic chip tests"); });
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
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", forbiddenFetch);
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  vi.stubGlobal("XMLHttpRequest", class { constructor() { throw new Error("XHR forbidden"); } });
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("WebSocket forbidden"); } });
  window.localStorage.clear();
  mocks.messages = locale("en");
  mocks.findProduct.mockResolvedValue(product);
  mocks.fetchProfile.mockResolvedValue(profile);
  mocks.fetchComments.mockResolvedValue(initialPage);
  mocks.fetchMyComment.mockResolvedValue(null);
  mocks.submitComment.mockResolvedValue(undefined);
  mocks.deleteComment.mockResolvedValue(undefined);
  mocks.login.mockResolvedValue(undefined);
  mocks.sendMessage.mockImplementation(() => { throw new Error("Unexpected extension-runtime message"); });
  queryClient.clear();
  queryClient.setDefaultOptions({
    ...originalDefaults,
    queries: { ...originalDefaults.queries, retry: false, gcTime: Infinity },
  });
  board = surface("synthetic-review-host");
  purchase = surface("synthetic-purchase-host");
  registerReviewBoard({ host: board.host, root: board.shadow });
});
afterEach(async () => {
  await act(async () => { board?.root?.unmount(); purchase?.root?.unmount(); });
  registerReviewBoard(null);
  queryClient.clear();
  queryClient.setDefaultOptions(originalDefaults);
  board?.host.remove(); purchase?.host.remove();
  expect(forbiddenFetch).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});
async function mountBoard() {
  board.root = createRoot(board.mount);
  await act(async () => board.root!.render(<App />));
}
async function mountPurchase() {
  purchase.root = createRoot(purchase.mount);
  await act(async () => purchase.root!.render(<PurchaseApp />));
}
async function mountBoth() {
  board.root = createRoot(board.mount); purchase.root = createRoot(purchase.mount);
  await act(async () => { board.root!.render(<App />); purchase.root!.render(<PurchaseApp />); });
}
async function remountPurchase() {
  await act(async () => purchase.root!.unmount());
  purchase.root = undefined;
  await mountPurchase();
}
async function eventually(assertion: () => void) {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assertion();
  }, { timeout: 2000, interval: 5 });
}
const chip = () => purchase.shadow.querySelector("section");
const chipButton = () => purchase.shadow.querySelector<HTMLButtonElement>("section button")!;
const dismissButton = () => purchase.shadow.querySelector<HTMLButtonElement>("button[aria-label]")!;
const field = () => board.shadow.querySelector<HTMLTextAreaElement>(`#${REVIEW_FORM_FIELD_ID}`)!;
const cacheKeys = () => queryClient.getQueryCache().getAll().map((query) => JSON.stringify(query.queryKey)).sort();
async function ready() {
  await mountBoth();
  await eventually(() => { expect(chip()).not.toBeNull(); expect(field()?.disabled).toBe(false); });
}
async function click(element: HTMLElement) { await act(async () => element.click()); }

describe("purchase chip and review board in distinct real application roots", () => {
  it("deduplicates in-flight product and first-comments requests and uses server total/score", async () => {
    const pendingProduct = deferred<ReviewProduct>();
    const pendingComments = deferred<typeof initialPage>();
    mocks.findProduct.mockReturnValue(pendingProduct.promise);
    mocks.fetchComments.mockReturnValue(pendingComments.promise);
    await mountBoth();
    expect(mocks.findProduct).toHaveBeenCalledOnce();
    expect(mocks.fetchComments).not.toHaveBeenCalled();
    expect(chip()).toBeNull();
    await act(async () => pendingProduct.resolve(product));
    await eventually(() => expect(mocks.fetchComments).toHaveBeenCalledOnce());
    expect(chip()).toBeNull();
    await act(async () => pendingComments.resolve(initialPage));
    await eventually(() => expect(chipButton().textContent).toBe("7.4·23 reviews"));
    expect(board.shadow.textContent).toContain("Comments 23");
    expect(board.shadow.querySelectorAll("article")).toHaveLength(2);
    expect(mocks.fetchComments).toHaveBeenCalledWith(product.id, 1, COMMENTS_PAGE_SIZE);
    expect(queryClient.getQueryCache().find({ queryKey: ["product", normalizeUrl(window.location.href)] })?.getObserversCount()).toBe(2);
    expect(queryClient.getQueryCache().find({ queryKey: ["comments", product.id, COMMENTS_PAGE_SIZE] })?.getObserversCount()).toBe(2);
  });

  it("adds neither new cache keys nor requests when the purchase root mounts after the board", async () => {
    await mountBoard();
    await eventually(() => expect(board.shadow.textContent).toContain("Comments 23"));
    const boardKeys = cacheKeys();
    await mountPurchase();
    await eventually(() => expect(chip()).not.toBeNull());
    expect(cacheKeys()).toEqual(boardKeys);
    expect(mocks.findProduct).toHaveBeenCalledOnce();
    expect(mocks.fetchComments).toHaveBeenCalledOnce();
    expect(mocks.fetchProfile).toHaveBeenCalledOnce();
    expect(mocks.fetchMyComment).toHaveBeenCalledOnce();
  });

  it("shows the first-review invitation only after a successful zero-count comments result", async () => {
    const pendingComments = deferred<ReturnType<typeof page>>();
    mocks.fetchComments.mockReturnValue(pendingComments.promise);
    await mountBoth();
    await eventually(() => expect(mocks.fetchComments).toHaveBeenCalledOnce());
    expect(chip()).toBeNull();
    expect(purchase.shadow.textContent).not.toContain("Write the first review");
    await act(async () => pendingComments.resolve(page(0)));
    await eventually(() => expect(chipButton().textContent).toBe("Write the first review"));
    expect(board.shadow.textContent).toContain("No comments yet.");
  });

  it.each(["product", "comments"] as const)("hides the chip when the %s request fails instead of claiming zero reviews", async (request) => {
    (request === "product" ? mocks.findProduct : mocks.fetchComments).mockRejectedValue(new Error("Synthetic unavailable"));
    await mountBoth();
    await eventually(() => expect(board.shadow.querySelector('[role="alert"]')).not.toBeNull());
    expect(chip()).toBeNull();
    expect(purchase.shadow.textContent).not.toContain("Write the first review");
    if (request === "product") expect(mocks.fetchComments).not.toHaveBeenCalled();
  });

  it("hides a previously empty chip if its background revalidation fails", async () => {
    mocks.fetchComments.mockResolvedValue(page(0));
    await ready();
    expect(chipButton().textContent).toBe("Write the first review");
    mocks.fetchComments.mockRejectedValue(new Error("Synthetic revalidation failure"));
    await act(async () => queryClient.invalidateQueries({ queryKey: ["comments", product.id, COMMENTS_PAGE_SIZE] }));
    await eventually(() => expect(chip()).toBeNull());
    expect(board.shadow.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("does not show a chip or query comments for an unregistered product", async () => {
    mocks.findProduct.mockResolvedValue(null);
    await mountBoth();
    await eventually(() => expect(board.shadow.textContent).toContain("not registered"));
    expect(chip()).toBeNull();
    expect(mocks.fetchComments).not.toHaveBeenCalled();
  });

  it("scrolls to the registered board and focuses its real shadow-root textarea without authentication", async () => {
    await ready();
    const focus = vi.spyOn(field(), "focus");
    await click(chipButton());
    expect(board.host.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(board.shadow.activeElement).toBe(field());
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("lets signed-out readers jump to reviews without launching Discord or enabling editing", async () => {
    mocks.fetchProfile.mockResolvedValue(null);
    await mountBoth();
    await eventually(() => expect(chip()).not.toBeNull());
    expect(field().disabled).toBe(true);
    await click(chipButton());
    expect(board.host.scrollIntoView).toHaveBeenCalledOnce();
    expect(field().disabled).toBe(true);
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    registerReviewBoard(null);
    await click(chipButton());
    expect(board.host.scrollIntoView).toHaveBeenCalledOnce();
  });

  it("persists dismissal across purchase-root remounts without scrolling or starting login", async () => {
    await ready();
    await click(dismissButton());
    expect(chip()).toBeNull();
    expect(window.localStorage.getItem(REVIEW_CHIP_DISMISS_KEY)).toBe("1");
    await remountPurchase();
    expect(chip()).toBeNull();
    expect(board.host.scrollIntoView).not.toHaveBeenCalled();
    expect(mocks.login).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it.each(["access", "operations"] as const)("remains usable when localStorage %s are blocked", async (failure) => {
    if (failure === "access") vi.spyOn(window, "localStorage", "get").mockImplementation(() => { throw new Error("Storage access denied"); });
    else {
      vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("Storage read denied"); });
      vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("Storage write denied"); });
    }
    await ready();
    await click(dismissButton());
    expect(chip()).toBeNull();
    // A blocked store cannot persist dismissal, but both mounts remain safe.
    await remountPurchase();
    await eventually(() => expect(chip()).not.toBeNull());
  });

  it("refreshes both roots from one product/comments invalidation without extra cache entries", async () => {
    await ready();
    const keys = cacheKeys();
    mocks.findProduct.mockResolvedValue({ ...product, score: 9.2 });
    mocks.fetchComments.mockResolvedValue(page(24, [comment("new"), ...initialPage.comments]));
    await act(async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["product"] }),
        queryClient.invalidateQueries({ queryKey: ["comments", product.id, COMMENTS_PAGE_SIZE] }),
      ]);
    });
    await eventually(() => {
      expect(chipButton().textContent).toBe("9.2·24 reviews");
      expect(board.shadow.textContent).toContain("Comments 24");
      expect(board.shadow.textContent).toContain("Synthetic review new");
    });
    expect(mocks.findProduct).toHaveBeenCalledTimes(2);
    expect(mocks.fetchComments).toHaveBeenCalledTimes(2);
    expect(cacheKeys()).toEqual(keys);
  });

  it.each(["en", "ko", "ja"])("renders existing %s chip strings, including count substitutions and the empty branch", async (language) => {
    mocks.messages = locale(language);
    const text = mocks.messages.purchaseReview as Record<string, string>;
    for (const key of ["label", "reviewCount", "writeFirst", "dismiss"]) expect(text[key]).toBeTruthy();
    expect(text.reviewCount).toContain("$1");
    await ready();
    expect(chip()?.getAttribute("aria-label")).toBe(text.label);
    expect(chipButton().textContent).toContain(text.reviewCount.replace("$1", "23"));
    expect(dismissButton().getAttribute("aria-label")).toBe(text.dismiss);
    mocks.fetchComments.mockResolvedValue(page(0));
    await act(async () => queryClient.invalidateQueries({ queryKey: ["comments", product.id, COMMENTS_PAGE_SIZE] }));
    await eventually(() => expect(chipButton().textContent).toBe(text.writeFirst));
  });
});
