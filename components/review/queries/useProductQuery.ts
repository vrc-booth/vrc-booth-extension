import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { findProductForCurrentPage } from "@/components/review/api";
import type { ReviewProduct } from "@/components/review/types";

type ProductQueryOptions = Omit<UseQueryOptions<ReviewProduct | null, Error>, "queryKey" | "queryFn">;

export const useProductQuery = (options?: ProductQueryOptions) =>
  useQuery<ReviewProduct | null>({
    queryKey: ["product", typeof window === "undefined" ? "unknown" : window.location.href],
    queryFn: findProductForCurrentPage,
    refetchOnWindowFocus: false,
    retry: false,
    ...options,
  });
