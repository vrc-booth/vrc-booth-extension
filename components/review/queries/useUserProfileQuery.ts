import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { fetchUserProfile } from "@/components/review/api";
import type { UserProfile } from "@/components/review/types";

type UserProfileQueryOptions = Omit<UseQueryOptions<UserProfile | null, Error>, "queryKey" | "queryFn">;

export const useUserProfileQuery = (options?: UserProfileQueryOptions) =>
  useQuery<UserProfile | null>({
    queryKey: ["userProfile"],
    queryFn: fetchUserProfile,
    refetchOnWindowFocus: false,
    retry: false,
    ...options,
  });
