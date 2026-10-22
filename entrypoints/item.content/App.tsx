import { ReviewBoard } from "@/components/ReviewBoard";
import { REVIEW_TOAST_CONTAINER_ID } from "@/utils/toast";
import { QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { queryClient } from "./queryClient";

export default () => (
  <QueryClientProvider client={queryClient}>
    <div className="relative!">
      <ToastContainer
        containerId={REVIEW_TOAST_CONTAINER_ID}
        autoClose={3000}
        hideProgressBar
        className="absolute!"
        position="top-center"
        limit={1}
        closeButton={false}
      />
    </div>
    <div className="my-5 text-booth-text">
      <ReviewBoard />
    </div>
  </QueryClientProvider>
);
