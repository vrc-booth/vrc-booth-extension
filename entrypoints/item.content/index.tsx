import type { ContentScriptContext } from "#imports";
import ReactDOM from "react-dom/client";
import "~/assets/tailwind.css";
import App from "./App.tsx";

export default defineContentScript({
  matches: ["*://booth.pm/*/items/*", "*://*.booth.pm/items/*"],
  cssInjectionMode: "ui",

  async main(ctx: ContentScriptContext) {
    const ui = await createShadowRootUi(ctx, {
      name: "booth-review",
      position: "inline",
      anchor: ".primary-image-thumbnails",
      append: "after",
      onMount: (container) => {
        const wrapper = document.createElement("div");
        container.append(wrapper);

        const root = ReactDOM.createRoot(wrapper);
        root.render(<App />);
        return { root, wrapper };
      },
      onRemove: (elements) => {
        elements?.root.unmount();
        elements?.wrapper.remove();
      },
    });

    ui.mount();
  },
});