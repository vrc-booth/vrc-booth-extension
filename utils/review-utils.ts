export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export const readResponseText = async (response: Response): Promise<string> => {
  try {
    const text = await response.text();
    return text || response.statusText;
  } catch {
    return response.statusText;
  }
};

export const normalizeUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${cleanPath}`;
  } catch {
    return value.replace(/\/+$/, "");
  }
};

export const buildSearchCandidates = () => {
  const { href, origin, pathname } = window.location;
  const trimmedPath = pathname.replace(/\/+$/, "");
  const set = new Set<string>();
  set.add(href);
  set.add(`${origin}${trimmedPath}`);
  set.add(trimmedPath);
  const idMatch = trimmedPath.match(/\/items\/([^/]+)/);
  if (idMatch) {
    set.add(idMatch[1]);
    set.add(trimmedPath.substring(trimmedPath.lastIndexOf("/")));
  }
  return Array.from(set).filter(Boolean);
};

export const matchesNormalizedUrl = (productUrl: string, pageUrl: string) => {
  const normalizedProduct = normalizeUrl(productUrl);
  if (!normalizedProduct || !pageUrl) {
    return false;
  }

  if (normalizedProduct === pageUrl) {
    return true;
  }

  if (pageUrl.startsWith(normalizedProduct) || normalizedProduct.startsWith(pageUrl)) {
    return true;
  }

  return false;
};

export const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const formatScore = (value?: number) => {
  if (typeof value !== "number") {
    return "-";
  }

  return value.toFixed(1);
};
