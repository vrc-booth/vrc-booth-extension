import { i18n } from "#i18n";
import { MAX_REVIEW_IMAGES, REVIEW_IMAGE_TYPES, safeReviewImageUrl } from "@/components/review/images";
import { IconPhotoPlus } from "@tabler/icons-react";
import { useRef } from "react";
import type { DraftReviewImage } from "../image-draft";
import { REVIEW_THUMBNAIL_CLASS } from "./ReviewImages";

export function ReviewImageInput({ images, disabled, onAdd, onRemove }: {
  images: DraftReviewImage[];
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cannotAdd = disabled || images.length >= MAX_REVIEW_IMAGES;
  return <fieldset disabled={disabled} className="space-y-2">
    <legend className="text-xs font-semibold text-slate-500" aria-live="polite">{i18n.t("reviewImages.label", [images.length, MAX_REVIEW_IMAGES])}</legend>
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <button type="button" disabled={cannotAdd} onClick={() => inputRef.current?.click()} aria-describedby="review-image-help"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-[#fc4d50] hover:text-[#fc4d50] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fc4d50] disabled:cursor-not-allowed disabled:opacity-50">
        <IconPhotoPlus size={20} aria-hidden="true" />
        {i18n.t("reviewImages.add")}
      </button>
      <p id="review-image-help" className="text-xs text-slate-500">{i18n.t("reviewImages.help")}</p>
    </div>
    <input ref={inputRef} hidden type="file" multiple accept={REVIEW_IMAGE_TYPES.join(",")} disabled={cannotAdd} onChange={(event) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      onAdd(files);
    }} />
    {images.length > 0 && <div className="flex flex-wrap gap-2">
      {images.map((entry, index) => <div key={entry.key} className="relative space-y-1">
        <img src={entry.previewUrl ?? safeReviewImageUrl(entry.image?.url) ?? undefined}
          alt={i18n.t("reviewImages.imageAlt", [index + 1])} referrerPolicy="no-referrer" className={REVIEW_THUMBNAIL_CLASS} />
        {entry.file && <p className="w-24 truncate text-xs text-slate-500" title={entry.file.name}>{entry.file.name}</p>}
        <button type="button" disabled={disabled} onClick={() => onRemove(entry.key)}
          aria-label={i18n.t("reviewImages.remove", [index + 1])} className="w-full text-xs text-red-600 underline">
          {i18n.t("reviewImages.remove", [index + 1])}
        </button>
      </div>)}
    </div>}
  </fieldset>;
}
