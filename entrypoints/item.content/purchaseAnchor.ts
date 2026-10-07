/** 상점 서브도메인이 가격·장바구니 전체를 감싸는 컨테이너다. */
const PURCHASE_BLOCK_SELECTOR = ".cart-btns";

/** 가격과 장바구니 버튼이 들어 있는 variation 목록이다. */
const VARIATIONS_SELECTOR = "#variations";

/**
 * 요약 칩을 끼워 넣을 자리, 곧 구매 블록 전체의 바로 앞 형제를 찾는다.
 *
 * booth.pm 본 도메인은 `ul#variations` 를 평범한 div 하나로만 감싸지만, 상점
 * 서브도메인은 그 바깥에 `.cart-btns` 를 한 겹 더 두른다. 그래서 `ul#variations`
 * 자체를 앵커로 쓰면 상점 서브도메인에서 칩이 구매 블록 안쪽으로 들어가, 물품
 * 상품의 배송 구분이나 배지 같은 variation 메타 행 사이에 끼어 보인다.
 *
 * 두 경우 모두 상품 제목 아래이면서 가격·장바구니 위인 한 자리를 돌려주며,
 * 구매 버튼을 가리거나 덮지 않는다.
 */
export const resolvePurchaseAnchor = (root: ParentNode = document): Element | null => {
  const purchaseBlock = root.querySelector(PURCHASE_BLOCK_SELECTOR);
  if (purchaseBlock) {
    return purchaseBlock;
  }

  const variations = root.querySelector(VARIATIONS_SELECTOR);
  if (!variations) {
    return null;
  }

  return variations.parentElement ?? variations;
};
