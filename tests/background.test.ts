import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type MessageHandler = (message: { data: unknown; sender: { tab?: { id?: number } } }) => unknown;
const mocks = vi.hoisted(() => ({
  handlers: new Map<string, MessageHandler>(),
  launchWebAuthFlow: vi.fn(),
  getRedirectURL: vi.fn(),
  sidePanelOpen: vi.fn(),
  tabsCreate: vi.fn(),
  getURL: vi.fn(),
  refreshAccessToken: vi.fn(),
  setAuthTokens: vi.fn(),
}));
vi.mock("@/components/review/messaging", () => ({
  onMessage: (type: string, handler: MessageHandler) => { mocks.handlers.set(type, handler); },
}));
vi.mock("@/components/review/session", () => ({
  refreshAccessToken: mocks.refreshAccessToken,
  setAuthTokens: mocks.setAuthTokens,
}));
vi.mock("wxt/browser", () => ({
  browser: {
    identity: { getRedirectURL: mocks.getRedirectURL, launchWebAuthFlow: mocks.launchWebAuthFlow },
    sidePanel: { open: mocks.sidePanelOpen },
    tabs: { create: mocks.tabsCreate },
    runtime: { getURL: mocks.getURL },
  },
}));

let initialize: () => void;
const redirectUrl = "https://test-extension.chromiumapp.org/";
const requestUrl = `https://vbt.kamyu.me/api/auth/oauth/discord?${new URLSearchParams({ redirectUrl, state: "expected-state" })}`;
const dispatch = (type: string, data: unknown, sender = {}) => mocks.handlers.get(type)!({ data, sender });

beforeAll(async () => {
  vi.stubGlobal("defineBackground", (main: () => void) => main);
  initialize = (await import("../entrypoints/background")).default as unknown as () => void;
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.handlers.clear();
  mocks.getRedirectURL.mockReturnValue(redirectUrl);
  mocks.getURL.mockImplementation((path: string) => `chrome-extension://test-extension${path}`);
  mocks.launchWebAuthFlow.mockResolvedValue(`${redirectUrl}?code=verified-code&state=expected-state`);
  initialize();
});

describe("background OAuth callback validation", () => {
  it("accepts a callback with the expected origin, path and state", async () => {
    await expect(dispatch("loginWithDiscord", requestUrl)).resolves.toBe("verified-code");
    expect(mocks.launchWebAuthFlow).toHaveBeenCalledWith({ url: requestUrl, interactive: true });
  });

  it.each([
    undefined,
    "not-a-url",
    `${redirectUrl}?code=code&state=wrong-state`,
    `${redirectUrl}?code=code`,
    "https://other-extension.chromiumapp.org/?code=code&state=expected-state",
    `${redirectUrl}unexpected-path?code=code&state=expected-state`,
    `${redirectUrl}?error=access_denied&code=code&state=expected-state`,
    `${redirectUrl}?state=expected-state`,
  ])("rejects invalid or cancelled callback %s", async (callback) => {
    mocks.launchWebAuthFlow.mockResolvedValue(callback);
    await expect(dispatch("loginWithDiscord", requestUrl)).resolves.toBeNull();
  });

  it.each([
    `https://vbt.kamyu.me/api/auth/oauth/discord?${new URLSearchParams({ redirectUrl })}`,
    "https://vbt.kamyu.me/api/auth/oauth/discord?redirectUrl=https%3A%2F%2Fother.example%2F&state=expected-state",
  ])("does not launch an incomplete or mismatched request", async (request) => {
    await expect(dispatch("loginWithDiscord", request)).resolves.toBeNull();
    expect(mocks.launchWebAuthFlow).not.toHaveBeenCalled();
  });
});

describe("background session and settings messages", () => {
  it("resolves the redirect URL using background-only identity", () => {
    expect(dispatch("getAuthRedirectUrl", undefined)).toBe(redirectUrl);
    expect(mocks.getRedirectURL).toHaveBeenCalledOnce();
  });
  it("forwards session writes and failed-token metadata to the central owner", async () => {
    const failed = { accessToken: "expired", sessionId: "current-login" };
    mocks.refreshAccessToken.mockResolvedValue(true);
    await dispatch("setAuthTokens", null);
    await expect(dispatch("refreshAccessToken", failed)).resolves.toBe(true);
    expect(mocks.setAuthTokens).toHaveBeenCalledWith(null);
    expect(mocks.refreshAccessToken).toHaveBeenCalledWith(failed);
  });

  it("opens account settings in the sender's side panel", async () => {
    await dispatch("openAccountSettings", undefined, { tab: { id: 42 } });
    expect(mocks.sidePanelOpen).toHaveBeenCalledWith({ tabId: 42 });
    expect(mocks.tabsCreate).not.toHaveBeenCalled();
  });

  it("falls back to the extension settings page when side panel open is rejected", async () => {
    mocks.sidePanelOpen.mockRejectedValue(new Error("User gesture required"));
    await dispatch("openAccountSettings", undefined, { tab: { id: 42 } });
    expect(mocks.tabsCreate).toHaveBeenCalledWith({ url: "chrome-extension://test-extension/account.html" });
  });
});
