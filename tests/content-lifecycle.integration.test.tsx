// @vitest-environment happy-dom
// @vitest-environment-options { "url": "https://booth.pm/en/items/100" }
import { act, createElement, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { ContentScriptContext } from "wxt/utils/content-script-context";
import { focusReviewForm } from "../components/review/reviewBoardFocus";
import { useProductQuery } from "../components/review/queries/useProductQuery";
import { queryClient } from "../entrypoints/item.content/queryClient";

const effects = vi.hoisted(() => {
  vi.stubGlobal("chrome", { runtime: {
    id: "fixture-extension", getURL: (path: string) => `chrome-extension://fixture-extension${path}`,
  } });
  return { mount: vi.fn(), unmount: vi.fn(), product: vi.fn() };
});
vi.mock("wxt/browser", () => ({ browser: { runtime: {
  id: "fixture-extension", getURL: (path: string) => `chrome-extension://fixture-extension${path}`,
} } }));
vi.mock("../components/review/api", () => ({ findProductForCurrentPage: effects.product }));

function ProductFixture() {
  const product = useProductQuery();
  const [draft, setDraft] = useState("");
  useEffect(() => {
    effects.mount(window.location.pathname);
    return () => { effects.unmount(); };
  }, []);
  return createElement("section", { "data-fixture": "review", "data-product": product.data?.id },
    createElement("p", null, "Synthetic review application"),
    createElement("button", { "data-action": "draft", onClick: () => setDraft("Unsaved review") }, "Write fixture draft"),
    createElement("textarea", { id: "review-content", value: draft, onChange: (event) => setDraft((event.target as HTMLTextAreaElement).value) }));
}
vi.mock("../entrypoints/item.content/App.tsx", () => ({ default: function TestApplication() {
  return createElement(QueryClientProvider, { client: queryClient }, createElement(ProductFixture));
} }));
vi.mock("~/assets/tailwind.css", () => ({}));
vi.mock("../entrypoints/item.content/CommentCountApp.tsx", () => ({
  default: () => createElement("button", null, "Comments fixture"),
}));

type Definition = { matches: string[]; main: (ctx: ContentScriptContext) => Promise<void> };
let definition: Definition;
const contexts: ContentScriptContext[] = [];
// Use the real context's invalidation and URL watcher. Extension reinjection
// messages are unrelated to these simulated DOM tests and are disabled here.
class FixtureContext extends ContentScriptContext {
  listenForNewerScripts() {}
  stopOldScripts() {}
}
const context = () => {
  const ctx = new FixtureContext("item", { cssInjectionMode: "ui" });
  contexts.push(ctx);
  return ctx;
};
const host = () => document.querySelector("booth-review");
const purchaseHost = () => document.querySelector("booth-purchase-review");
const flush = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); };
const invalidate = async (ctx: ContentScriptContext) => { await act(async () => ctx.notifyInvalidated()); };
const navigate = async (path: string) => {
  await act(async () => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await flush();
};
const start = async () => {
  const ctx = context();
  await act(async () => { await definition.main(ctx); });
  await flush();
  return ctx;
};
const appendAnchors = () => {
  document.querySelector("main")!.innerHTML = '<div class="primary-image-thumbnails">Product images</div><div class="cart-btns"><ul id="variations"><li>Purchase controls</li></ul></div>';
};

beforeAll(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("defineContentScript", (value: Definition) => value);
  vi.stubGlobal("createShadowRootUi", createShadowRootUi);
  definition = (await import("../entrypoints/item.content/index")).default as unknown as Definition;
});
beforeEach(() => {
  vi.clearAllMocks();
  contexts.length = 0;
  queryClient.clear();
  window.history.replaceState({}, "", "https://booth.pm/en/items/100");
  document.body.innerHTML = "<main></main>";
  appendAnchors();
  effects.product.mockImplementation(async () => ({ id: window.location.pathname.split("/").at(-1) }));
  vi.stubGlobal("fetch", vi.fn(async (input: unknown) => {
    if (!String(input).startsWith("chrome-extension://fixture-extension/content-scripts/")) {
      throw new Error("Unexpected network request in simulated DOM test");
    }
    return new Response(":root { color: black; }");
  }));
});
afterEach(async () => {
  await act(async () => { for (const ctx of contexts) ctx.notifyInvalidated(); });
  queryClient.clear();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("content entrypoint with real WXT shadow-root mounting in simulated DOM", () => {
  it("keeps main-domain and shop-domain match patterns", () => {
    expect(definition.matches).toEqual(["*://booth.pm/*/items/*", "*://*.booth.pm/items/*"]);
  });

  it("mounts the board and comment count without adding a purchase summary badge", async () => {
    document.querySelector("main")!.insertAdjacentHTML("afterbegin",
      '<div><form action="/items/100/wish_list"></form><button id="heart"><span><pixiv-icon name="24/BoothLikeOff"></pixiv-icon></span></button></div>');
    await start();
    expect(document.querySelectorAll("booth-review")).toHaveLength(1);
    expect(purchaseHost()).toBeNull();
    const commentCountHost = document.querySelector("booth-comment-count");
    expect(commentCountHost).not.toBeNull();
    expect(document.querySelector("#heart")?.nextElementSibling).toBe(commentCountHost);
    expect(commentCountHost?.shadowRoot?.textContent).toContain("Comments fixture");
    expect(document.querySelector(".primary-image-thumbnails")?.nextElementSibling).toBe(host());
    expect(document.querySelector(".cart-btns")?.previousElementSibling).toBe(host());
    expect(host()?.shadowRoot?.querySelector('[data-fixture="review"]')?.textContent).toBe("Synthetic review applicationWrite fixture draft");
    expect(document.querySelector("#variations")?.textContent).toBe("Purchase controls");
    expect(effects.mount).toHaveBeenCalledOnce();
    expect(effects.product).toHaveBeenCalledOnce();
  });

  it("unmounts the board, clears focus refs, and stops remounting after invalidation", async () => {
    const ctx = await start();
    const scroll = vi.spyOn(host() as HTMLElement, "scrollIntoView");
    expect(focusReviewForm()).toBe(true);
    expect(scroll).toHaveBeenCalledOnce();
    await invalidate(ctx);
    expect(host()).toBeNull();
    expect(purchaseHost()).toBeNull();
    expect(focusReviewForm()).toBe(false);
    expect(effects.unmount).toHaveBeenCalledOnce();
    appendAnchors();
    await navigate("/en/items/101");
    expect(host()).toBeNull();
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).toHaveBeenCalledOnce();
  });

  it("supports new content contexts without duplicate roots or stale focus-ref cleanup", async () => {
    const oldContext = await start();
    const firstHost = host();
    const newContext = await start();
    expect(host()).not.toBe(firstHost);
    expect(document.querySelectorAll("booth-review")).toHaveLength(1);
    expect(purchaseHost()).toBeNull();
    await invalidate(oldContext);
    const scroll = vi.spyOn(host() as HTMLElement, "scrollIntoView");
    expect(focusReviewForm()).toBe(true);
    expect(scroll).toHaveBeenCalledOnce();
    await invalidate(newContext);
    expect(focusReviewForm()).toBe(false);
    expect(effects.mount).toHaveBeenCalledTimes(2);
    expect(effects.unmount).toHaveBeenCalledTimes(2);
  });

  it("waits for the image anchor and mounts the board without a purchase badge", async () => {
    document.querySelector("main")!.replaceChildren();
    await start();
    expect(host()).toBeNull();
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).not.toHaveBeenCalled();
    appendAnchors();
    await flush();
    expect(document.querySelectorAll("booth-review")).toHaveLength(1);
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).toHaveBeenCalledOnce();
  });

  it("leaves late main-domain purchase controls untouched", async () => {
    document.querySelector(".cart-btns")!.remove();
    await start();
    expect(host()).not.toBeNull();
    expect(purchaseHost()).toBeNull();
    const purchase = document.createElement("div");
    purchase.innerHTML = '<ul id="variations"><li>Main-domain purchase controls</li></ul>';
    document.querySelector("main")!.append(purchase);
    await flush();
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).toHaveBeenCalledOnce();
  });

  it("remounts the board after image replacement without adding a purchase badge", async () => {
    await start();
    const image = document.querySelector(".primary-image-thumbnails")!;
    const purchase = document.querySelector(".cart-btns")!;
    const newImage = image.cloneNode(true) as Element;
    const newPurchase = purchase.cloneNode(true) as Element;
    image.replaceWith(newImage);
    purchase.replaceWith(newPurchase);
    await flush();
    expect(newImage.nextElementSibling).toBe(host());
    expect(document.querySelectorAll("booth-review")).toHaveLength(1);
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).toHaveBeenCalledTimes(2);
    expect(effects.unmount).toHaveBeenCalledOnce();

    newImage.remove();
    newPurchase.remove();
    await flush();
    expect(host()).toBeNull();
    expect(purchaseHost()).toBeNull();
    expect(focusReviewForm()).toBe(false);
    appendAnchors();
    await flush();
    expect(effects.mount).toHaveBeenCalledTimes(3);
  });

  it("recovers when page updates remove only the shadow hosts", async () => {
    await start();
    host()!.remove();
    await flush();
    expect(document.querySelectorAll("booth-review")).toHaveLength(1);
    expect(purchaseHost()).toBeNull();
    expect(effects.unmount).toHaveBeenCalledOnce();
    expect(effects.mount).toHaveBeenCalledTimes(2);
  });

  it("follows a moved image anchor without adding a badge to a new purchase wrapper", async () => {
    document.querySelector(".cart-btns")!.className = "main-domain-purchase";
    await start();
    const destination = document.createElement("aside");
    document.querySelector("main")!.append(destination);
    destination.append(document.querySelector(".primary-image-thumbnails")!);
    const purchase = document.querySelector("#variations")!.parentElement!;
    const newWrapper = document.createElement("div");
    newWrapper.className = "cart-btns";
    purchase.before(newWrapper);
    newWrapper.append(purchase);
    await flush();
    expect(destination.lastElementChild).toBe(host());
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).toHaveBeenCalledTimes(2);
    expect(effects.unmount).toHaveBeenCalledOnce();
  });

  it("detects anchor selector changes and survives complete body replacement", async () => {
    document.querySelector(".primary-image-thumbnails")!.className = "images-loading";
    document.querySelector(".cart-btns")!.className = "purchase-loading";
    document.querySelector("#variations")!.id = "variations-loading";
    await start();
    expect(host()).toBeNull();
    expect(purchaseHost()).toBeNull();
    document.querySelector(".images-loading")!.className = "primary-image-thumbnails";
    document.querySelector("#variations-loading")!.id = "variations";
    await flush();
    expect(effects.mount).toHaveBeenCalledOnce();
    const body = document.createElement("body");
    body.innerHTML = '<main><div class="primary-image-thumbnails"></div><div class="cart-btns"><ul id="variations"></ul></div></main>';
    document.body.replaceWith(body);
    await flush();
    expect(document.querySelectorAll("booth-review")).toHaveLength(1);
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).toHaveBeenCalledTimes(2);
    expect(effects.unmount).toHaveBeenCalledOnce();
  });

  it("does not remount for unrelated or shadow-tree React mutations", async () => {
    await start();
    for (let index = 0; index < 4; index++) {
      const node = document.createElement("div");
      node.className = `unrelated-${index}`;
      document.body.append(node);
      host()!.shadowRoot!.append(document.createElement("span"));
      await flush();
    }
    expect(effects.mount).toHaveBeenCalledOnce();
    expect(effects.unmount).not.toHaveBeenCalled();
  });

  it("remounts the board on history navigation without restoring the purchase badge", async () => {
    await start();
    for (const id of ["101", "102", "100"]) {
      await act(async () => { (host()!.shadowRoot!.querySelector("button") as HTMLButtonElement).click(); });
      expect((host()!.shadowRoot!.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Unsaved review");
      // This is the native Back/Forward event; no DOM changes are necessary.
      await navigate(`/en/items/${id}`);
      expect(host()?.shadowRoot?.querySelector("[data-product]")?.getAttribute("data-product")).toBe(id);
      expect(document.querySelectorAll("booth-review")).toHaveLength(1);
      expect(purchaseHost()).toBeNull();
      expect((host()!.shadowRoot!.querySelector("textarea") as HTMLTextAreaElement).value).toBe("");
    }
    expect(effects.mount).toHaveBeenCalledTimes(4);
    expect(effects.unmount).toHaveBeenCalledTimes(3);
    expect(effects.product).toHaveBeenCalledTimes(3); // Returning to 100 reuses its fresh shared cache.
  });

  it("detects pushState without DOM mutations through the real WXT location watcher", async () => {
    await start();
    // WXT intentionally polls history changes once a second instead of patching page history.
    await act(async () => {
      window.history.pushState({}, "", "/en/items/101");
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    await flush();
    expect(effects.mount).toHaveBeenCalledTimes(2);
    expect(host()?.shadowRoot?.querySelector("[data-product]")?.getAttribute("data-product")).toBe("101");
  });

  it("leaves a same-product fragment alone and removes stale roots off product pages", async () => {
    await start();
    await navigate("/en/items/100?ref=cart#images");
    expect(effects.mount).toHaveBeenCalledOnce();
    await navigate("/en/search");
    expect(host()).toBeNull();
    expect(purchaseHost()).toBeNull();
    expect(focusReviewForm()).toBe(false);
    await navigate("/en/items/101");
    expect(effects.mount).toHaveBeenCalledTimes(2);
  });

  it("ignores an older initialization that finishes after a newer context", async () => {
    let resolveCss!: (response: Response) => void;
    const stylesheet = new Promise<Response>((resolve) => { resolveCss = resolve; });
    const fetchStyles = vi.fn().mockReturnValueOnce(stylesheet).mockReturnValueOnce(stylesheet)
      .mockImplementation(async () => new Response(""));
    vi.stubGlobal("fetch", fetchStyles);
    const oldContext = context();
    const oldInitialization = definition.main(oldContext);
    await start();
    const currentHost = host();
    await act(async () => { resolveCss(new Response("")); await oldInitialization; });
    await invalidate(oldContext);
    await flush();
    expect(host()).toBe(currentHost);
    expect(document.querySelectorAll("booth-review")).toHaveLength(1);
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).toHaveBeenCalledOnce();
    expect(focusReviewForm()).toBe(true);
  });

  it("never starts observing or mounting for an already invalid context", async () => {
    const ctx = context();
    await invalidate(ctx);
    await act(async () => { await definition.main(ctx); });
    appendAnchors();
    await flush();
    expect(host()).toBeNull();
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).not.toHaveBeenCalled();
  });

  it("does not mount if invalidated while WXT stylesheets are still loading", async () => {
    let resolveCss!: (response: Response) => void;
    const stylesheet = new Promise<Response>((resolve) => { resolveCss = resolve; });
    vi.stubGlobal("fetch", vi.fn(() => stylesheet));
    const ctx = context();
    const initialization = definition.main(ctx);
    await invalidate(ctx);
    await act(async () => { resolveCss(new Response("")); await initialization; });
    appendAnchors();
    await flush();
    expect(host()).toBeNull();
    expect(purchaseHost()).toBeNull();
    expect(effects.mount).not.toHaveBeenCalled();
    expect(focusReviewForm()).toBe(false);
  });
});
