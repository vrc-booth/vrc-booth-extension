import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthToken } from "../components/review/types";
const bridge = vi.hoisted(() => ({ getValue: vi.fn(), setValue: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@/utils/storage", () => ({ authTokenStorage: { getValue: bridge.getValue, setValue: bridge.setValue } }));
vi.mock("@/components/review/messaging", () => ({ sendMessage: bridge.sendMessage }));
import { apiFetch, deleteComment, fetchProductById, fetchUserProfile } from "../components/review/api";
import { refreshAccessToken, setAuthTokens } from "../components/review/session";

let tokens: AuthToken | null;
const network = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  tokens = { accessToken: "expired", refreshToken: "old-refresh", sessionId: "fixture-login" };
  bridge.getValue.mockImplementation(async () => tokens);
  bridge.setValue.mockImplementation(async value => { tokens = value; });
  bridge.sendMessage.mockImplementation(async (type, payload) => {
    if (type === "refreshAccessToken") return refreshAccessToken(payload);
    throw new Error(`Unexpected background message: ${type}`);
  });
  vi.stubGlobal("fetch", network);
});

describe("API requests and background session owner together (network and runtime simulated)", () => {
  it.each(["offline", "timeout", "malformed", 429, 500, 503])("preserves login after refresh %s and recovers without Discord", async failure => {
    let recovered = false;
    network.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/token")) {
        if (recovered) return Response.json({ accessToken: "current", refreshToken: "rotated" });
        if (failure === "offline") throw new TypeError("Failed to fetch");
        if (failure === "timeout") throw new DOMException("Timed out", "TimeoutError");
        if (failure === "malformed") return Response.json({ message: "unexpected" });
        return new Response("unavailable", { status: failure as number });
      }
      if (new Headers(init.headers).get("Authorization") === "Bearer current") return Response.json({ id: "same-user" });
      return new Response("expired", { status: 401 });
    });
    await expect(fetchUserProfile()).rejects.toMatchObject({ status: 503 });
    expect(tokens?.refreshToken).toBe("old-refresh");
    expect(bridge.setValue).not.toHaveBeenCalled();
    recovered = true;
    await expect(fetchUserProfile()).resolves.toEqual({ id: "same-user" });
    expect(tokens?.sessionId).toBe("fixture-login");
    expect(bridge.sendMessage.mock.calls.every(([name]) => name === "refreshAccessToken")).toBe(true);
  });

  it.each([401, 403])("requires login only after refresh credentials are rejected with %s", async status => {
    network.mockImplementation(async (url: string) =>
      new Response("rejected", { status: url.endsWith("/auth/token") ? status : 401 }));
    await expect(fetchUserProfile()).resolves.toBeNull();
    expect(tokens).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("does not cache an old request as signed out after a new login", async () => {
    let finishRefresh!: (value: Response) => void;
    network.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/token")) return new Promise<Response>(resolve => { finishRefresh = resolve; });
      return new Response("expired", { status: 401 });
    });
    const request = fetchUserProfile();
    const assertion = expect(request).rejects.toMatchObject({ status: 503 });
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    await setAuthTokens({ accessToken: "other-user", refreshToken: "other-refresh" });
    finishRefresh(new Response("revoked", { status: 401 }));
    await assertion;
    expect(tokens?.accessToken).toBe("other-user");
  });
  it("refreshes one rotated token for simultaneous profile/comment/delete requests and retries each once", async () => {
    let finishRefresh!: (value: Response) => void;
    const refreshResponse = new Promise<Response>(resolve => { finishRefresh = resolve; });
    network.mockImplementation(async (url: string, init: RequestInit) => {
      if (url.endsWith("/auth/token")) return refreshResponse;
      if (new Headers(init.headers).get("Authorization") === "Bearer expired") return new Response("expired", { status: 401 });
      expect(new Headers(init.headers).get("Authorization")).toBe("Bearer current");
      return Response.json({ accepted: true });
    });
    const requests = [apiFetch("/user/me"), apiFetch("/comment?productId=42"), deleteComment("42")];
    await vi.waitFor(() => expect(network.mock.calls.filter(([url]) => url.endsWith("/auth/token"))).toHaveLength(1));
    finishRefresh(Response.json({ accessToken: "current", refreshToken: "new-refresh" }));
    await expect(Promise.all(requests)).resolves.toEqual([{ accepted: true }, { accepted: true }, { accepted: true }]);
    expect(network).toHaveBeenCalledTimes(7);
    expect(tokens).toEqual({ accessToken: "current", refreshToken: "new-refresh", sessionId: "fixture-login" });
    expect(bridge.setValue).toHaveBeenCalledOnce();
  });

  it("a logout during refresh prevents both token restoration and mutation retry", async () => {
    let finishRefresh!: (value: Response) => void;
    network.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/token")) return new Promise<Response>(resolve => { finishRefresh = resolve; });
      return new Response("expired", { status: 401 });
    });
    const request = deleteComment("42");
    const assertion = expect(request).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    await setAuthTokens(null);
    finishRefresh(Response.json({ accessToken: "late-token", refreshToken: "late-refresh" }));
    await assertion;
    expect(tokens).toBeNull();
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("new login during an old refresh failure remains intact without replaying the old mutation", async () => {
    let finishRefresh!: (value: Response) => void;
    network.mockImplementation(async (url: string) => {
      if (url.endsWith("/auth/token")) return new Promise<Response>(resolve => { finishRefresh = resolve; });
      return new Response("expired", { status: 401 });
    });
    const request = apiFetch("/comment/42", { method: "PUT", body: JSON.stringify({ content: "synthetic review", score: 8 }) });
    const assertion = expect(request).rejects.toMatchObject({ status: 401 });
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    await setAuthTokens({ accessToken: "another-login", refreshToken: "another-refresh" });
    finishRefresh(new Response("revoked", { status: 401 }));
    await assertion;
    expect(tokens?.accessToken).toBe("another-login");
    expect(tokens?.sessionId).not.toBe("fixture-login");
    expect(network).toHaveBeenCalledTimes(2);
  });

  it.each([403, 409, 429, 500, 503])("propagates %s without retrying a write or rotating tokens", async status => {
    network.mockResolvedValue(new Response(JSON.stringify({ message: "synthetic failure" }), { status }));
    await expect(deleteComment("42")).rejects.toMatchObject({ status });
    expect(network).toHaveBeenCalledOnce();
    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });

  it("does not replay an offline request whose server outcome is unknown", async () => {
    network.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(deleteComment("42")).rejects.toThrow("Failed to fetch");
    expect(network).toHaveBeenCalledOnce();
    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });

  it("distinguishes a missing product from an unavailable service", async () => {
    network.mockResolvedValueOnce(new Response("not found", { status: 404 }))
      .mockResolvedValueOnce(new Response("service unavailable", { status: 503 }));
    await expect(fetchProductById("42")).resolves.toBeNull();
    await expect(fetchProductById("42")).rejects.toMatchObject({ status: 503 });
  });

  it("an anonymous unauthorized profile becomes signed-out without a refresh request", async () => {
    tokens = null;
    network.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(fetchUserProfile()).resolves.toBeNull();
    expect(network).toHaveBeenCalledOnce();
    expect(bridge.sendMessage).not.toHaveBeenCalled();
  });
});
