import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  storageGet: vi.fn(),
  storageSet: vi.fn(),
}));
vi.mock("./messaging", () => ({ sendMessage: mocks.sendMessage }));
// Content scripts have no identity API; only the background may access it.
vi.mock("wxt/browser", () => ({ browser: {} }));
vi.mock("@/utils/storage", () => ({
  authTokenStorage: { getValue: mocks.storageGet, setValue: mocks.storageSet },
}));
import { loginWithDiscord } from "./auth";

const redirectUrl = "https://test-extension.chromiumapp.org/";
const tokens = { accessToken: "access", refreshToken: "refresh" };
const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("crypto", { randomUUID: () => "test-state" });
  mocks.sendMessage.mockImplementation(async (type: string) => type === "getAuthRedirectUrl" ? redirectUrl : type === "loginWithDiscord" ? "a+b&c=d" : undefined);
  fetchMock.mockResolvedValue(Response.json(tokens));
});

describe("Discord login helper", () => {
  it("logs in from a content context without identity and delegates redirect discovery", async () => {
    await loginWithDiscord();

    expect(mocks.sendMessage).toHaveBeenNthCalledWith(1, "getAuthRedirectUrl", undefined);
    const [message, requestUrl] = mocks.sendMessage.mock.calls[1];
    expect(message).toBe("loginWithDiscord");
    const authorization = new URL(requestUrl);
    expect(authorization.origin + authorization.pathname).toBe("https://vbt.kamyu.me/api/auth/oauth/discord");
    expect(authorization.searchParams.get("redirectUrl")).toBe(redirectUrl);
    expect(authorization.searchParams.get("state")).toBe("test-state");
    const callback = new URL(fetchMock.mock.calls[0][0]);
    expect(callback.origin + callback.pathname).toBe("https://vbt.kamyu.me/api/auth/oauth/discord/callback");
    expect(callback.searchParams.get("code")).toBe("a+b&c=d");
    expect(callback.searchParams.get("redirectUrl")).toBe(redirectUrl);
    expect(mocks.sendMessage).toHaveBeenLastCalledWith("setAuthTokens", tokens);
    expect(mocks.storageSet).not.toHaveBeenCalled();
  });

  it("does not fetch or store credentials after a cancelled callback", async () => {
    mocks.sendMessage.mockImplementation(async (type: string) => type === "getAuthRedirectUrl" ? redirectUrl : null);
    await expect(loginWithDiscord()).rejects.toThrow("cancelled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalledWith("setAuthTokens", expect.anything());
  });

  it("propagates launch cancellation without storing tokens", async () => {
    mocks.sendMessage.mockRejectedValue(new Error("The user did not approve access"));
    await expect(loginWithDiscord()).rejects.toThrow("did not approve");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalledWith("setAuthTokens", expect.anything());
  });

  it("rejects HTTP errors before accepting even a token-shaped body", async () => {
    fetchMock.mockResolvedValue(Response.json(tokens, { status: 401 }));
    await expect(loginWithDiscord()).rejects.toMatchObject({ status: 401 });
    expect(mocks.sendMessage).not.toHaveBeenCalledWith("setAuthTokens", expect.anything());
  });

  it.each([
    null,
    { message: "unexpected" },
    { accessToken: "access", refreshToken: "" },
    { accessToken: 42, refreshToken: "refresh" },
  ])("rejects malformed authentication data: %j", async (payload) => {
    fetchMock.mockResolvedValue(Response.json(payload));
    await expect(loginWithDiscord()).rejects.toThrow("Invalid authentication response");
    expect(mocks.sendMessage).not.toHaveBeenCalledWith("setAuthTokens", expect.anything());
  });

  it("waits for token persistence and propagates a failed background write", async () => {
    mocks.sendMessage.mockImplementation(async (type: string) => {
      if (type === "setAuthTokens") throw new Error("Storage failed");
      return type === "getAuthRedirectUrl" ? redirectUrl : "code";
    });
    await expect(loginWithDiscord()).rejects.toThrow("Storage failed");
  });
});
