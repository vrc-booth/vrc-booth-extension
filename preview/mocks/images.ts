import type { ReviewImage } from "@/components/review/types";
import { state } from "./state";
export { MAX_REVIEW_IMAGES, MAX_REVIEW_IMAGE_BYTES, REVIEW_IMAGE_TYPES, validateReviewFiles } from "../../components/review/images";

// Preview-only substitution: accept exclusively blobs minted by our fixture API.
// Production retains its HTTPS-only validation and cannot load this module.
export const safeReviewImageUrl = (value: unknown): string | null =>
  typeof value === "string" && [...state.imageUrls.values()].includes(value) ? value : null;
export const normalizeReviewImages = (value: unknown): ReviewImage[] =>
  Array.isArray(value) ? value.filter((image) => image && typeof image.id === "string" && safeReviewImageUrl(image.url)).slice(0, 5) : [];
