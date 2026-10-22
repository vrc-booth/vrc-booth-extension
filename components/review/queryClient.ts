import { QueryClient, type DefaultOptions } from "@tanstack/react-query";

/**
 * One set of query defaults for every surface (content script, side panel,
 * preview). Hooks override only what they need, such as the profile query
 * refetching on window focus.
 */
export const createReviewQueryClient = (overrides: DefaultOptions["queries"] = {}) =>
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60,
        ...overrides,
      },
    },
  });
