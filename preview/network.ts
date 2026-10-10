import { MOCK_TOKEN } from "./mocks/state";

// The real component's OAuth callback is exercised locally without authentication.
// API functions themselves are replaced at import time by in-memory fixtures.
export function installPreviewNetworkGuard() {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (url.origin !== window.location.origin) {
      throw new Error("External network requests are disabled in this local UI preview.");
    }
    if (url.pathname === "/__preview_api__/auth/oauth/discord/callback") {
      return new Response(JSON.stringify(MOCK_TOKEN), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname.startsWith("/__preview_api__/")) {
      throw new Error(`Unmocked preview request: ${url.pathname}`);
    }
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    if (method !== "GET" && method !== "HEAD") {
      throw new Error("Network writes are disabled in this local UI preview.");
    }
    return originalFetch(input, init);
  };
}
