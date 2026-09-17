import { PurchaseReviewCta } from "@/components/purchase/PurchaseReviewCta";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./queryClient";

export default () => (
  <QueryClientProvider client={queryClient}>
    <div className="mb-3 text-gray-900">
      <PurchaseReviewCta />
    </div>
  </QueryClientProvider>
);
