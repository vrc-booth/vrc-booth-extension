import { useEffect, useRef, useState } from "react";
import type { ReviewRequestContext } from "./api";
import type { ReviewImage } from "./types";

export type DraftReviewImage = {
  key: string;
  image?: ReviewImage;
  file?: File;
  previewUrl?: string;
  uploadContext?: ReviewRequestContext;
};

export function useReviewImageDraft() {
  const [images, setImages] = useState<DraftReviewImage[]>([]);
  const current = useRef<DraftReviewImage[]>([]);
  const baseline = useRef<ReviewImage[]>([]);
  const replace = (next: DraftReviewImage[]) => {
    for (const previous of current.current) {
      if (previous.previewUrl && !next.some((entry) => entry.previewUrl === previous.previewUrl)) {
        URL.revokeObjectURL(previous.previewUrl);
      }
    }
    current.current = next;
    setImages(next);
  };
  const reset = (saved: ReviewImage[] = []) => {
    baseline.current = saved;
    replace(saved.map((image) => ({ key: image.id, image })));
  };
  useEffect(() => () => {
    for (const image of current.current) if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
    current.current = [];
  }, []);
  return { images, current, baseline, replace, reset };
}
