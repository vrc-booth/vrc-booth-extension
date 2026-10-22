import { toast } from "react-toastify";

export const REVIEW_TOAST_CONTAINER_ID = "boothplus-review-toasts";

export const showErrorToast = (message: string) => toast.error(message, { containerId: REVIEW_TOAST_CONTAINER_ID });
