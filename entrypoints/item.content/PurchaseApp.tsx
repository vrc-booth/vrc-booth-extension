import { PurchaseReviewCta } from "@/components/purchase/PurchaseReviewCta";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";

export default () => (
  <QueryClientProvider client={queryClient}>
    <PurchaseReviewCta />
  </QueryClientProvider>
);
