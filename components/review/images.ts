import type { ReviewImage } from "./types";

// Official review-image contract (vrc-booth 2.5.20).
export const MAX_REVIEW_IMAGES = 5;
export const MAX_REVIEW_IMAGE_BYTES = 8 * 1024 * 1024;
export const REVIEW_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const safeReviewImageUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
};

export const normalizeReviewImages = (value: unknown): ReviewImage[] => {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((image) => {
    if (!image || typeof image.id !== "string" || !image.id || ids.has(image.id)) return [];
    const url = safeReviewImageUrl(image.url);
    if (!url || !Number.isInteger(image.width) || image.width <= 0
      || !Number.isInteger(image.height) || image.height <= 0) return [];
    ids.add(image.id);
    return [{ id: image.id, url, width: image.width, height: image.height }];
  }).slice(0, MAX_REVIEW_IMAGES);
};

export const validateReviewFiles = (files: File[], existingCount: number): "count" | "type" | "size" | null => {
  if (files.length + existingCount > MAX_REVIEW_IMAGES) return "count";
  if (files.some((file) => !REVIEW_IMAGE_TYPES.includes(file.type as typeof REVIEW_IMAGE_TYPES[number]))) return "type";
  if (files.some((file) => file.size <= 0 || file.size > MAX_REVIEW_IMAGE_BYTES)) return "size";
  return null;
};
