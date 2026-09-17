import type { ContentScriptContext } from "#imports";
import { registerReviewBoard } from "@/components/review/reviewBoardFocus";
import ReactDOM from "react-dom/client";
import "~/assets/tailwind.css";
import App from "./App.tsx";
import PurchaseApp from "./PurchaseApp.tsx";

/** 구매 CTA(가격·장바구니 목록)의 앵커다. booth.pm 본 도메인과 상점 서브도메인에 모두 있다. */
const PURCHASE_ANCHOR = "#variations";

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
 * 구매 버튼 바로 위에 리뷰 요약을 얹는다. 앵커가 없는 페이지에서는 마운트가
 * 예외를 던지므로, 앵커가 실제로 있을 때에만 UI를 만든다.
 */
const mountPurchaseReviewCta = async (ctx: ContentScriptContext) => {
  if (!document.querySelector(PURCHASE_ANCHOR)) {
    return;
  }

  const ui = await createShadowRootUi(ctx, {
    name: "booth-purchase-review",
    position: "inline",
    anchor: PURCHASE_ANCHOR,
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
