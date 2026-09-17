import { fetchCommentsForProduct } from "@/components/review/api";
import type { CommentItem, CommentSort } from "@/components/review/types";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

export type SortedCommentsResult = {
  count: number;
  comments: CommentItem[];
};

type SortedCommentsQueryOptions = Omit<
  UseQueryOptions<SortedCommentsResult, Error>,
  "queryKey" | "queryFn"
>;

/**
 * 첫 페이지만 정렬해서 받아 오는 조회다. 리뷰 보드의 무한 스크롤 목록과 달리
 * 평점 양 끝을 집는 용도이므로 페이지를 넘기지 않는다.
 */
export const useSortedCommentsQuery = (
  productId: string | null,
  sort: CommentSort,
  limit: number,
  options?: SortedCommentsQueryOptions,
) => {
  const { enabled, ...restOptions } = options ?? {};
  const resolvedEnabled = typeof enabled === "undefined" ? Boolean(productId) : enabled;

  return useQuery<SortedCommentsResult, Error>({
    queryKey: ["comments", productId ?? "unknown", sort, limit],
    queryFn: async () => {
      const page = await fetchCommentsForProduct(productId!, 1, limit, sort);
      return { count: page.count, comments: page.comments };
    },
    enabled: resolvedEnabled,
    refetchOnWindowFocus: false,
    retry: false,
    ...restOptions,
  });
};
