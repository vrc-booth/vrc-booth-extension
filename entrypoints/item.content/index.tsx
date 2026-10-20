import type { ContentScriptContext } from "#imports";
import { registerReviewBoard } from "@/components/review/reviewBoardFocus";
import ReactDOM from "react-dom/client";
import "~/assets/tailwind.css";
import App from "./App.tsx";
import PurchaseApp from "./PurchaseApp.tsx";
import { createProductUiLifecycle } from "./lifecycle";
import { resolvePurchaseAnchor } from "./purchaseAnchor";

let activeLifecycle: ReturnType<typeof createProductUiLifecycle> | undefined;
let registeredReviewHost: HTMLElement | undefined;

export default defineContentScript({
  matches: ["*://booth.pm/*/items/*", "*://*.booth.pm/items/*"],
  cssInjectionMode: "ui",

  async main(ctx: ContentScriptContext) {
    activeLifecycle?.stop();
    const lifecycle = createProductUiLifecycle(ctx);
    activeLifecycle = lifecycle;
    ctx.onInvalidated(() => {
      if (activeLifecycle === lifecycle) activeLifecycle = undefined;
    });
    const resolveReviewAnchor = () => document.querySelector(".primary-image-thumbnails");

    try {
      await Promise.all([
        createShadowRootUi(ctx, {
          name: "booth-review",
          position: "inline",
          anchor: resolveReviewAnchor,
          append: "after",
          onMount: (container, _shadow, shadowHost) => {
            const wrapper = document.createElement("div");
            container.append(wrapper);

            registeredReviewHost = shadowHost;
            registerReviewBoard({ host: shadowHost, root: container });

            const root = ReactDOM.createRoot(wrapper);
            root.render(<App />);
            return { root, wrapper, shadowHost };
          },
          onRemove: (elements) => {
            // WXT can remove an already-removed UI again on invalidation. An old
            // context must not clear the focus refs of a newer mounted board.
            if (elements && elements.shadowHost === registeredReviewHost) {
              registeredReviewHost = undefined;
              registerReviewBoard(null);
            }
            elements?.root.unmount();
            elements?.wrapper.remove();
          },
        }).then((ui) => lifecycle.add(ui, resolveReviewAnchor, "after")),
        createShadowRootUi(ctx, {
          name: "booth-purchase-review",
          position: "inline",
          anchor: resolvePurchaseAnchor,
          append: "before",
          onMount: (container) => {
            const wrapper = document.createElement("div");
            container.append(wrapper);

            const root = ReactDOM.createRoot(wrapper);
            root.render(<PurchaseApp />);
            return { root, wrapper };
          },
          onRemove: (elements) => {
            elements?.root.unmount();
            elements?.wrapper.remove();
          },
        }).then((ui) => lifecycle.add(ui, resolvePurchaseAnchor, "before")),
      ]);
    } catch (error) {
      lifecycle.stop();
      throw error;
    }
  },
});
