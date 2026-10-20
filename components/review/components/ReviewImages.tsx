import { i18n } from "#i18n";
import { normalizeReviewImages } from "@/components/review/images";
import type { ReviewImage } from "../types";

export function ReviewImages({ images, blinded }: { images?: ReviewImage[]; blinded?: boolean }) {
  if (blinded) return null;
  const safeImages = normalizeReviewImages(images);
  if (!safeImages.length) return null;
  return <div className="mt-3 flex flex-wrap gap-2">
    {safeImages.map((image, index) => <a key={image.id} href={image.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
      <img src={image.url} width={image.width} height={image.height} loading="lazy" referrerPolicy="no-referrer"
        alt={i18n.t("reviewImages.imageAlt", [index + 1])} className="h-24 w-24 rounded-xl border border-slate-200 object-cover" />
    </a>)}
  </div>;
}
