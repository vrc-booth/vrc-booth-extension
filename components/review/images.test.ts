import { describe, expect, it } from "vitest";
import { MAX_REVIEW_IMAGE_BYTES, normalizeReviewImages, safeReviewImageUrl, validateReviewFiles } from "./images";
const image = { id: "image-1", url: "https://images.example.invalid/reviews/2026/10/one.webp", width: 1600, height: 900 };
const file = (type = "image/png", size = 10) => ({ type, size }) as File;

describe("review image trust boundary", () => {
  it.each(["javascript:alert(1)", "data:image/svg+xml,<svg/>", "blob:https://vrc-booth.com/id", "http://cdn.example/image", "//cdn.example/image", "/image", "https://user:secret@cdn.example/image", "not-a-url", null])("rejects unsafe image URL %s", url => {
    expect(safeReviewImageUrl(url)).toBeNull();
  });
  it("accepts configured HTTPS CDN origins without inventing an allowlist", () => {
    expect(safeReviewImageUrl(image.url)).toBe(image.url);
  });
  it("rejects malformed image entries, deduplicates IDs and caps the count", () => {
    expect(normalizeReviewImages([image, image, null, { ...image, id: "bad", width: -1 }, { ...image, id: "bad2", url: "javascript:1" }])).toEqual([image]);
    expect(normalizeReviewImages(Array.from({ length: 7 }, (_, n) => ({ ...image, id: String(n) })))).toHaveLength(5);
    expect(normalizeReviewImages(undefined)).toEqual([]);
  });
  it("accepts exact byte/count boundaries and all supported MIME types", () => {
    expect(validateReviewFiles([file("image/jpeg"), file("image/png", MAX_REVIEW_IMAGE_BYTES), file("image/webp")], 2)).toBeNull();
  });
  it("rejects count, zero/oversize files and unsupported MIME types before upload", () => {
    expect(validateReviewFiles([file()], 5)).toBe("count");
    expect(validateReviewFiles([file("image/svg+xml")], 0)).toBe("type");
    expect(validateReviewFiles([file("image/gif")], 0)).toBe("type");
    expect(validateReviewFiles([file("image/png", 0)], 0)).toBe("size");
    expect(validateReviewFiles([file("image/png", MAX_REVIEW_IMAGE_BYTES + 1)], 0)).toBe("size");
  });
});
