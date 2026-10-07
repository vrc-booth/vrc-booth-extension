import type { ContentScriptContext } from "#imports";
import { registerReviewBoard } from "@/components/review/reviewBoardFocus";
import ReactDOM from "react-dom/client";
import "~/assets/tailwind.css";
import App from "./App.tsx";
import PurchaseApp from "./PurchaseApp.tsx";
import { resolvePurchaseAnchor } from "./purchaseAnchor";

export default defineContentScript({
  matches: ["*://booth.pm/*/items/*", "*://*.booth.pm/items/*"],
  cssInjectionMode: "ui",

  async main(ctx: ContentScriptContext) {
    const ui = await createShadowRootUi(ctx, {
      name: "booth-review",
      position: "inline",
      anchor: ".primary-image-thumbnails",
      append: "after",
      onMount: (container, _shadow, shadowHost) => {
        const wrapper = document.createElement("div");
        container.append(wrapper);

        registerReviewBoard({ host: shadowHost, root: container });

        const root = ReactDOM.createRoot(wrapper);
        root.render(<App />);
        return { root, wrapper };
      },
      onRemove: (elements) => {
        registerReviewBoard(null);
        elements?.root.unmount();
        elements?.wrapper.remove();
      },
    });

    ui.mount();

    await mountPurchaseReviewCta(ctx);
  },
});

/**
 * 가격·장바구니 블록 바로 위에 리뷰 요약 칩을 얹는다. 앵커가 없는 페이지에서는
 * 마운트가 예외를 던지므로, 앵커를 실제로 찾았을 때에만 UI를 만든다.
 */
const mountPurchaseReviewCta = async (ctx: ContentScriptContext) => {
  const anchor = resolvePurchaseAnchor();
  if (!anchor) {
    return;
  }

  const ui = await createShadowRootUi(ctx, {
    name: "booth-purchase-review",
    position: "inline",
    anchor: () => anchor,
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
  });

  ui.mount();
};
