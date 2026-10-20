// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { resolveCommentCountAnchor } from "@/entrypoints/item.content/commentCountAnchor";

const mock = vi.hoisted(() => ({ count: 23, success: true, focus: vi.fn() }));
vi.mock("#i18n", () => ({ i18n: { t: (_key: string, [count]: number[]) => `Comments ${count}` } }));
vi.mock("@/components/review/queries", () => ({
  useProductQuery: () => ({ isSuccess: true, data: { id: "test" } }),
  useProductCommentsQuery: () => ({ isSuccess: mock.success, data: { pages: [{ count: mock.count }] } }),
}));
vi.mock("@/components/review/reviewBoardFocus", () => ({ focusReviewForm: mock.focus }));
import { CommentCountButton } from "@/components/review/CommentCountButton";

describe("comment count beside the product heart", () => {
  it("targets only the current product, including the liked state", () => {
    window.history.replaceState({}, "", "/ko/items/5058077");
    const fixture = document.createElement("div");
    fixture.innerHTML = `<div><form action="/items/other/wish_list"></form><div><div><pixiv-icon name="24/BoothLikeOff"></pixiv-icon></div></div></div>
      <div><form action="/items/5058077/wish_list"></form><div id="heart"><div><pixiv-icon name="24/BoothLikeOn"></pixiv-icon></div><div>50700</div></div></div>`;
    expect(resolveCommentCountAnchor(fixture)?.id).toBe("heart");
    fixture.querySelector("#heart")?.remove();
    expect(resolveCommentCountAnchor(fixture)).toBeNull();
  });

  it("shows actual counts including zero, opens reviews, and hides failed responses", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<CommentCountButton />));
      expect(container.querySelector("button")?.textContent).toBe("23");
      await act(async () => container.querySelector("button")?.click());
      expect(mock.focus).toHaveBeenCalledOnce();
      mock.count = 0;
      await act(async () => root.render(<CommentCountButton />));
      expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Comments 0");
      expect(container.textContent).toBe("0");
      mock.success = false;
      await act(async () => root.render(<CommentCountButton />));
      expect(container.querySelector("button")).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });
});
