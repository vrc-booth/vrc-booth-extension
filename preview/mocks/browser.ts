export const browser = {
  runtime: { id: "boothplus-local-preview", getURL: (path: string) => new URL(path, window.location.origin).href },
  i18n: { getUILanguage: () => document.documentElement.lang || "ko" },
};
