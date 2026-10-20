import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { fetchMyComments } from "@/components/review/api";
import type { CommentItem } from "@/components/review/types";

export type MyCommentsResult = {
  count: number;
  comments: CommentItem[];
};

type MyCommentsQueryOptions = Omit<UseQueryOptions<MyCommentsResult, Error>, "queryKey" | "queryFn">;

export const useMyCommentsQuery = (page: number, limit: number, options?: MyCommentsQueryOptions) => {
  const { enabled, ...restOptions } = options ?? {};
  const resolvedEnabled = typeof enabled === "undefined" ? page > 0 && limit > 0 : enabled;

  return useQuery<MyCommentsResult>({
    queryKey: ["myComments", page, limit],
    queryFn: () => fetchMyComments(page, limit),
    enabled: resolvedEnabled,
    refetchOnWindowFocus: false,
    ...restOptions,
  });
};
