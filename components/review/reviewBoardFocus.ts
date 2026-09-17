/**
 * 리뷰 보드의 본문 입력란 id다. 구매 CTA가 섀도 루트 밖에서 이 입력란을 찾아
 * 포커스를 옮기므로, 보드와 CTA가 같은 값을 쓰도록 여기에서 내보낸다.
 */
export const REVIEW_FORM_FIELD_ID = "review-content";

type ReviewBoardRefs = {
  /** 라이트 DOM에 삽입된 섀도 호스트다. 스크롤 대상이 된다. */
  host: HTMLElement;
  /** 섀도 루트 안에서 입력란을 찾기 위한 조회 기준점이다. */
  root: ParentNode;
};

let registeredRefs: ReviewBoardRefs | null = null;

export const registerReviewBoard = (refs: ReviewBoardRefs | null) => {
  registeredRefs = refs;
};

/**
 * 리뷰 보드로 화면을 옮기고 본문 입력란에 포커스를 준다. 보드가 아직 마운트되지
 * 않았거나 입력란이 비활성 상태라면 스크롤만 수행한다. 이동 여부를 돌려준다.
 */
export const focusReviewForm = (): boolean => {
  if (!registeredRefs) {
    return false;
  }

  registeredRefs.host.scrollIntoView({ behavior: "smooth", block: "center" });

  const field = registeredRefs.root.querySelector<HTMLTextAreaElement>(`#${REVIEW_FORM_FIELD_ID}`);
  field?.focus({ preventScroll: true });

  return true;
};
