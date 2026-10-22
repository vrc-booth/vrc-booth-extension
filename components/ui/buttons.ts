/**
 * BOOTH-style button recipes shared by the review board, the account page and
 * the local preview: two heights (40px / 32px), pill or 6px corners, one accent
 * red, one focus ring. Keep every control on these so siblings never disagree.
 */
const BASE =
  "inline-flex items-center justify-center gap-2 font-bold transition " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-booth-primary disabled:opacity-60";

/** Solid red pill, like BOOTH's add-to-cart button. */
export const PRIMARY_BUTTON_CLASS = `${BASE} h-10 rounded-full bg-booth-primary px-5 text-sm text-white hover:bg-booth-primary-hover`;

/** White pill with a thin gray border, like BOOTH's gift button. */
export const SECONDARY_BUTTON_CLASS = `${BASE} h-10 rounded-full border-2 border-booth-border bg-white px-5 text-sm text-booth-text hover:border-booth-sub`;

/** Compact bordered button for inline tools (attach image, pager). */
export const SMALL_BUTTON_CLASS = `${BASE} h-8 rounded-md border border-booth-border bg-white px-3 text-xs text-booth-sub hover:border-booth-sub hover:text-booth-text disabled:cursor-not-allowed`;

/** Plain text action for header links such as account settings or log out. */
export const TEXT_BUTTON_CLASS =
  "text-sm text-booth-sub transition hover:text-booth-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-booth-primary disabled:opacity-60";
