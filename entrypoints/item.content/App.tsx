import { ReviewBoard } from "@/components/ReviewBoard";
import { REVIEW_TOAST_CONTAINER_ID } from "@/utils/toast";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { i18n } from "#i18n";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60,
    },
  },
});

export default () => (
  <>
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
      <div className="text-gray-900">
        <div className="mx-auto max-w-4xl space-y-6">
          <h1 className="text-2xl font-bold">{i18n.t("reviewBoard.header")}</h1>
          <ReviewBoard />
        </div>
      </div>
    </QueryClientProvider>
  </>
);
