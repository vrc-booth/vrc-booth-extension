import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { fetchUserComment } from "@/components/review/api";
import type { MyCommentData } from "@/components/review/types";

type MyCommentQueryOptions = Omit<UseQueryOptions<MyCommentData | null, Error>, "queryKey" | "queryFn">;

export const useMyCommentQuery = (productId: string | null, options?: MyCommentQueryOptions) =>
  useQuery<MyCommentData | null>({
    queryKey: ["myComment", productId],
    queryFn: () => fetchUserComment(productId!),
    enabled: Boolean(productId),
    refetchOnWindowFocus: false,
    retry: false,
    ...options,
  });
