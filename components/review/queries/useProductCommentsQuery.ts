import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchCommentsForProduct } from "@/components/review/api";
import type { CommentItem } from "@/components/review/types";

export type ProductCommentsResult = {
  count: number;
  comments: CommentItem[];
  page: number;
  pageSize: number;
};

export const useProductCommentsQuery = (productId: string | null, limit = 10) => {
  const resolvedEnabled = Boolean(productId);

  const queryKey: readonly ["comments", string, number] = ["comments", productId ?? "unknown", limit];

  return useInfiniteQuery<ProductCommentsResult, Error>({
    queryKey,
    queryFn: ({ pageParam = 1 }) => {
      const pageNumber = typeof pageParam === "number" ? pageParam : 1;
      if (!productId) {
        return Promise.resolve({ count: 0, comments: [], page: pageNumber, pageSize: limit });
      }
      return fetchCommentsForProduct(productId, pageNumber, limit);
    },
    enabled: resolvedEnabled,
    refetchOnWindowFocus: false,
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pageSize <= 0) {
        return undefined;
      }
      const totalPages = Math.max(1, Math.ceil(lastPage.count / lastPage.pageSize));
      return lastPage.page < totalPages ? lastPage.page + 1 : undefined;
    },
  });
};
