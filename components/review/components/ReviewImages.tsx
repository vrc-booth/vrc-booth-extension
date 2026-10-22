import { i18n } from "#i18n";
import { normalizeReviewImages } from "@/components/review/images";
import type { ReviewImage } from "../types";

/** One thumbnail look for saved attachments and drafts alike. */
export const REVIEW_THUMBNAIL_CLASS = "h-20 w-20 rounded border border-booth-divider bg-booth-surface object-cover";

export function ReviewImages({ images, blinded }: { images?: ReviewImage[]; blinded?: boolean }) {
  if (blinded) return null;
  const safeImages = normalizeReviewImages(images);
  if (!safeImages.length) return null;
  return <div className="mt-2 flex flex-wrap gap-2">
    {safeImages.map((image, index) => <a key={image.id} href={image.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
      className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-booth-primary">
      <img src={image.url} width={image.width} height={image.height} loading="lazy" referrerPolicy="no-referrer"
        alt={i18n.t("reviewImages.imageAlt", [index + 1])} className={REVIEW_THUMBNAIL_CLASS} />
    </a>)}
  </div>;
}
