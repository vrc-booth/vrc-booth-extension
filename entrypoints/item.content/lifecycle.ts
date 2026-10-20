import type { ContentScriptContext } from "#imports";

type InlineUi = {
  shadowHost: HTMLElement;
  mount: () => void;
  remove: () => void;
};

type Registration = {
  ui: InlineUi;
  resolveAnchor: () => Element | null;
  position: "before" | "after";
  anchor: Element | null;
  location: string | null;
};

/** Query strings and image fragments do not identify a different product. */
export const productLocationIdentity = (url = new URL(window.location.href)): string | null => {
  if (url.hostname !== "booth.pm" && !url.hostname.endsWith(".booth.pm")) return null;
  if (!/^\/(?:[^/]+\/)?items\/[^/]+\/?$/.test(url.pathname)) return null;
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
};

/**
 * BOOTH may add, replace, or move an anchor without reloading the content script.
 * WXT's autoMount tracks selector existence, not Element identity, so reconcile
 * both roots together and always remove the old React tree before mounting again.
 */
export const createProductUiLifecycle = (ctx: ContentScriptContext) => {
  const registrations: Registration[] = [];
  let stopped = false;

  const reconcile = () => {
    if (stopped) return;
    if (ctx.isInvalid) {
      stop();
      return;
    }

    const location = productLocationIdentity();
    for (const registration of registrations) {
      const { ui, resolveAnchor, position } = registration;
      const candidate = location ? resolveAnchor() : null;
      const anchor = candidate?.isConnected && candidate.parentElement ? candidate : null;
      const adjacent = position === "after" ? ui.shadowHost.previousElementSibling : ui.shadowHost.nextElementSibling;
      if (registration.anchor && (
        registration.anchor !== anchor || registration.location !== location ||
        !ui.shadowHost.isConnected || adjacent !== anchor
      )) {
        ui.remove();
        registration.anchor = null;
        registration.location = null;
      }
      if (anchor && !registration.anchor) {
        ui.mount();
        registration.anchor = anchor;
        registration.location = location;
      }
    }
  };

  // Document observation survives replacement of <body>. Shadow-tree React
  // mutations are not observed; our own host mutations settle with no remount.
  const observer = new MutationObserver(reconcile);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    observer.disconnect();
    for (const { ui } of registrations) ui.remove();
    registrations.length = 0;
  };

  // Register before awaiting WXT's asynchronous stylesheet loading.
  ctx.onInvalidated(stop);
  if (ctx.isInvalid) {
    stop();
  } else {
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "id"] });
    ctx.addEventListener(window, "wxt:locationchange", reconcile);
    ctx.addEventListener(window, "popstate", reconcile);
  }

  return {
    add: (ui: InlineUi, resolveAnchor: Registration["resolveAnchor"], position: Registration["position"]) => {
      if (stopped || ctx.isInvalid) {
        ui.remove();
        return;
      }
      registrations.push({ ui, resolveAnchor, position, anchor: null, location: null });
      reconcile();
    },
    stop,
  };
};
