import ko from "../../locales/ko.yml";
import en from "../../locales/en.yml";
import ja from "../../locales/ja.yml";

export type PreviewLocale = "ko" | "en" | "ja";
let locale: PreviewLocale = "ko";
const messages = { ko, en, ja } as Record<PreviewLocale, Record<string, unknown>>;
export const setLocale = (value: PreviewLocale) => {
  locale = value;
  document.documentElement.lang = value;
};
export const i18n = {
  t(key: string, substitutions: Array<string | number> = []) {
    const value = key.split(".").reduce<unknown>((entry, part) =>
      entry && typeof entry === "object" ? (entry as Record<string, unknown>)[part] : undefined, messages[locale]);
    return typeof value === "string"
      ? value.replace(/\$(\d+)/g, (_, number: string) => String(substitutions[Number(number) - 1] ?? `$${number}`))
      : key;
  },
};
