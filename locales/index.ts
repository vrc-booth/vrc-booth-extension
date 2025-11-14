import koYaml from "./ko.yml?raw";
import enYaml from "./en.yml?raw";
import jpYaml from "./jp.yml?raw";

type LocaleCode = "ko" | "en" | "jp";
type TranslationValue = string | TranslationNode;
type TranslationNode = Record<string, TranslationValue>;

type StackItem = { indent: number; node: TranslationNode };

const parseSimpleYaml = (content: string): TranslationNode => {
  const root: TranslationNode = {};
  const stack: StackItem[] = [{ indent: -1, node: root }];

  content.split(/\r?\n/).forEach((originalLine) => {
    const line = originalLine.replace(/\t/g, "  ");
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return;
    }

    const indent = line.length - line.trimStart().length;
    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex === -1) {
      return;
    }

    const key = trimmedLine.slice(0, colonIndex).trim();
    const valuePart = trimmedLine.slice(colonIndex + 1).trim();

    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;

    if (valuePart === "") {
      const nested: TranslationNode = {};
      parent[key] = nested;
      stack.push({ indent, node: nested });
    } else {
      parent[key] = valuePart;
    }
  });

  return root;
};

const LOCALES: Record<LocaleCode, TranslationNode> = {
  ko: parseSimpleYaml(koYaml),
  en: parseSimpleYaml(enYaml),
  jp: parseSimpleYaml(jpYaml),
};

const FALLBACK_LOCALE: LocaleCode = "ko";

const detectLocale = (): LocaleCode => {
  if (typeof navigator === "undefined") {
    return FALLBACK_LOCALE;
  }

  const language = navigator.language?.split("-")[0].toLowerCase();
  if (!language) {
    return FALLBACK_LOCALE;
  }

  const supportedLocales = Object.keys(LOCALES) as LocaleCode[];
  const candidate = language as LocaleCode;
  if (supportedLocales.includes(candidate)) {
    return candidate;
  }

  return FALLBACK_LOCALE;
};

const getNestedValue = (node: TranslationNode, path: string): string | undefined => {
  const segments = path.split(".");
  let current: TranslationValue | undefined = node;

  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = (current as TranslationNode)[segment];
  }

  return typeof current === "string" ? current : undefined;
};

const interpolate = (value: string, variables?: Record<string, string | number>) =>
  value.replace(/\{(\w+)\}/g, (_, token) => {
    if (!variables) {
      return `{${token}}`;
    }

    const replacement = variables[token];
    return replacement !== undefined ? String(replacement) : `{${token}}`;
  });

const defaultLocale = detectLocale();

export const getLocale = () => defaultLocale;

export const t = (
  key: string,
  variables?: Record<string, string | number>,
  localeOverride?: LocaleCode,
): string => {
  const locale = localeOverride ?? defaultLocale;
  const translation = getNestedValue(LOCALES[locale], key) ?? getNestedValue(LOCALES[FALLBACK_LOCALE], key);
  if (!translation) {
    return key;
  }
  return interpolate(translation, variables);
};
