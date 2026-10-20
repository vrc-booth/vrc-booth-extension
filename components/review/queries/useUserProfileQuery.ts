import { useEffect } from "react";
import { watchAuthSessionCache } from "@/components/review/session-cache";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { fetchUserProfile } from "@/components/review/api";
import type { UserProfile } from "@/components/review/types";
import { ApiError } from "@/utils/review-utils";

type UserProfileQueryOptions = Omit<UseQueryOptions<UserProfile | null, Error>, "queryKey" | "queryFn">;

export const useUserProfileQuery = (options?: UserProfileQueryOptions) => {
  const client = useQueryClient();
  useEffect(() => watchAuthSessionCache(client), [client]);
  return useQuery<UserProfile | null>({
    queryKey: ["userProfile"],
    queryFn: fetchUserProfile,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: (failureCount, error) =>
      failureCount < 2 && (!(error instanceof ApiError) || error.status >= 500),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
    ...options,
  });

};
