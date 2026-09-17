import { QueryClient } from "@tanstack/react-query";

/**
 * 리뷰 보드와 구매 CTA는 서로 다른 섀도 루트에 마운트되지만 같은 콘텐츠 스크립트
 * 안에서 동작한다. 하나의 QueryClient를 공유해서 상품과 사용자 정보를 두 번
 * 요청하지 않도록 한다.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60,
    },
  },
});
