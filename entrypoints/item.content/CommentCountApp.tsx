import { QueryClientProvider } from "@tanstack/react-query";
import { CommentCountButton } from "@/components/review/CommentCountButton";
import { queryClient } from "./queryClient";

export default () => (
  <QueryClientProvider client={queryClient}>
    <CommentCountButton />
  </QueryClientProvider>
);
