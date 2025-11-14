import { toast } from "react-toastify";

export const REVIEW_TOAST_CONTAINER_ID = "specific-container-A";

const toastOptions = {
  containerId: REVIEW_TOAST_CONTAINER_ID,
};

export const showErrorToast = (message: string) => toast.error(message, toastOptions);
export const showSuccessToast = (message: string) => toast.success(message, toastOptions);
