import { i18n } from "#i18n";
import { MAX_REVIEW_IMAGES, REVIEW_IMAGE_TYPES, safeReviewImageUrl } from "@/components/review/images";
import type { DraftReviewImage } from "../image-draft";

export function ReviewImageInput({ images, disabled, onAdd, onRemove }: {
  images: DraftReviewImage[];
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
}) {
  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="text-xs font-semibold text-slate-500">{i18n.t("reviewImages.label", [images.length, MAX_REVIEW_IMAGES])}</legend>
    <p id="review-image-help" className="text-xs text-slate-500">{i18n.t("reviewImages.help")}</p>
    <input type="file" multiple accept={REVIEW_IMAGE_TYPES.join(",")} aria-label={i18n.t("reviewImages.add")}
      aria-describedby="review-image-help" disabled={disabled || images.length >= MAX_REVIEW_IMAGES}
      className="w-full text-xs text-slate-600" onChange={(event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        onAdd(files);
      }} />
    <div className="flex flex-wrap gap-2">
      {images.map((entry, index) => <div key={entry.key} className="relative space-y-1">
        <img src={entry.previewUrl ?? safeReviewImageUrl(entry.image?.url) ?? undefined}
          alt={i18n.t("reviewImages.imageAlt", [index + 1])} referrerPolicy="no-referrer" className="h-24 w-24 rounded-xl border border-slate-200 object-cover" />
        <button type="button" disabled={disabled} onClick={() => onRemove(entry.key)}
          aria-label={i18n.t("reviewImages.remove", [index + 1])} className="w-full text-xs text-red-600 underline">
          {i18n.t("reviewImages.remove", [index + 1])}
        </button>
      </div>)}
    </div>
  </fieldset>;
}
