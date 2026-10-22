import { i18n } from "#i18n";
import { MAX_REVIEW_IMAGES, REVIEW_IMAGE_TYPES, safeReviewImageUrl } from "@/components/review/images";
import { SMALL_BUTTON_CLASS } from "@/components/ui/buttons";
import { IconPhotoPlus, IconX } from "@tabler/icons-react";
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
  return <fieldset disabled={disabled} className="min-w-0 space-y-2">
    <legend className="sr-only" aria-live="polite">{i18n.t("reviewImages.label", [images.length, MAX_REVIEW_IMAGES])}</legend>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="button" disabled={cannotAdd} onClick={() => inputRef.current?.click()} aria-describedby="review-image-help"
        className={`${SMALL_BUTTON_CLASS} gap-1 px-2.5`}>
        <IconPhotoPlus size={16} aria-hidden="true" />
        {i18n.t("reviewImages.add")}
        <span aria-hidden="true" className="font-normal tabular-nums">{images.length}/{MAX_REVIEW_IMAGES}</span>
      </button>
      <p id="review-image-help" className="text-xs text-booth-sub">{i18n.t("reviewImages.help")}</p>
    </div>
    <input ref={inputRef} hidden type="file" multiple accept={REVIEW_IMAGE_TYPES.join(",")} disabled={cannotAdd} onChange={(event) => {
      const files = Array.from(event.currentTarget.files ?? []);
      event.currentTarget.value = "";
      onAdd(files);
    }} />
    {images.length > 0 && <ul className="flex flex-wrap gap-2 pt-1">
      {images.map((entry, index) => <li key={entry.key} className="relative">
        <img src={entry.previewUrl ?? safeReviewImageUrl(entry.image?.url) ?? undefined} title={entry.file?.name}
          alt={i18n.t("reviewImages.imageAlt", [index + 1])} referrerPolicy="no-referrer" className={REVIEW_THUMBNAIL_CLASS} />
        <button type="button" disabled={disabled} onClick={() => onRemove(entry.key)} aria-label={i18n.t("reviewImages.remove", [index + 1])}
          className="absolute -top-1.5 -right-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-booth-border bg-white text-booth-sub transition hover:border-booth-primary hover:text-booth-primary focus-visible:outline-2 focus-visible:outline-booth-primary disabled:opacity-50">
          <IconX size={12} aria-hidden="true" />
        </button>
      </li>)}
    </ul>}
  </fieldset>;
}
