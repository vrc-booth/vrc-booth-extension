// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { resolvePurchaseAnchor } from "./purchaseAnchor";

const createDocument = (body: string) => {
  const parsed = new DOMParser().parseFromString(`<body>${body}</body>`, "text/html");
  return parsed;
};

/** booth.pm 본 도메인은 variation 목록을 평범한 div 하나로만 감싼다. */
const MAIN_DOMAIN_MARKUP = `
  <div class="summary">
    <header><h2>상품 제목</h2></header>
    <div id="variations-wrapper">
      <ul class="variations" id="variations">
        <li class="variation-item">
          <div class="variation-price">¥ 1,000</div>
          <div class="variation-cart"><button class="add-cart">카트에 넣기</button></div>
        </li>
      </ul>
    </div>
  </div>
`;

/** 상점 서브도메인은 그 바깥에 `.cart-btns` 를 한 겹 더 두른다. */
const SHOP_SUBDOMAIN_MARKUP = `
  <div class="summary">
    <header><h2>상품 제목</h2></header>
    <div class="cart-btns">
      <div>
        <ul class="variations" id="variations">
          <li class="variation-item">
            <span class="type">물품 상품(창고에서 발송)</span>
            <span class="badge">네코포스 가능</span>
            <div class="variation-price">¥ 1,000</div>
            <div class="variation-cart"><button class="add-cart">카트에 넣기</button></div>
          </li>
        </ul>
      </div>
    </div>
  </div>
`;

describe("resolvePurchaseAnchor", () => {
  test("상점 서브도메인에서는 구매 블록 전체를 앵커로 잡는다", () => {
    const document = createDocument(SHOP_SUBDOMAIN_MARKUP);

    const anchor = resolvePurchaseAnchor(document);

    expect(anchor?.className).toBe("cart-btns");
  });

  test("본 도메인에서는 variation 목록을 감싼 블록을 앵커로 잡는다", () => {
    const document = createDocument(MAIN_DOMAIN_MARKUP);

    const anchor = resolvePurchaseAnchor(document);

    expect(anchor?.id).toBe("variations-wrapper");
  });

  test("어느 경우에도 앵커가 variation 행 안쪽을 가리키지 않는다", () => {
    for (const markup of [MAIN_DOMAIN_MARKUP, SHOP_SUBDOMAIN_MARKUP]) {
      const document = createDocument(markup);

      const anchor = resolvePurchaseAnchor(document);

      expect(anchor).not.toBeNull();
      expect(anchor!.closest(".variation-item")).toBeNull();
      expect(anchor!.querySelector(".add-cart")).not.toBeNull();
    }
  });

  test("구매 블록이 없는 페이지에서는 앵커를 찾지 않는다", () => {
    const document = createDocument("<div class='summary'><header><h2>상품 제목</h2></header></div>");

    expect(resolvePurchaseAnchor(document)).toBeNull();
  });
});
