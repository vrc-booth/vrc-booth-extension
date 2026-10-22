/**
 * Button recipes shared by the review board, the account page and the local
 * preview, so the same kind of action always looks the same.
 */

/** Main write action (post/update review, save username). */
export const PRIMARY_BUTTON_CLASS =
  "rounded-2xl bg-gradient-to-r from-[#fc4d50] to-[#ff826a] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60";

/** Solid red call to action for signing in. */
export const LOGIN_BUTTON_CLASS =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-[#fc4d50] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e94145] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fc4d50] disabled:cursor-wait disabled:opacity-60";

/** Compact solid red button for small panels. */
export const SMALL_PRIMARY_BUTTON_CLASS =
  "rounded-2xl bg-[#fc4d50] px-3 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60";

/** Neutral bordered button, such as rechecking the sign-in state. */
export const SECONDARY_BUTTON_CLASS =
  "rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60";

/** Destructive action next to the primary button. */
export const DANGER_BUTTON_CLASS =
  "rounded-2xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60";

/** Header pill for secondary navigation such as account settings. */
export const PILL_BUTTON_CLASS =
  "rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-[#fc4d50]/40";

/** Header pill tinted with the accent colour, used for log out. */
export const ACCENT_PILL_BUTTON_CLASS =
  "rounded-full border border-[#fc4d50]/40 bg-[#fc4d50]/10 px-3 py-1 text-xs font-medium text-[#fc4d50] transition hover:bg-[#fc4d50]/20 disabled:opacity-60";

/** Previous/next pager buttons. */
export const PAGER_BUTTON_CLASS =
  "rounded-2xl border border-slate-200 px-3 py-1 transition hover:border-[#fc4d50]/70 disabled:opacity-60";

/** Plain text action such as refresh. */
export const TEXT_BUTTON_CLASS = "text-xs text-slate-500 hover:text-slate-900 disabled:opacity-60";
