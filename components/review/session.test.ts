import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthToken } from "./types";
const storage = vi.hoisted(() => ({ getValue: vi.fn(), setValue: vi.fn() }));
vi.mock("@/utils/storage", () => ({ authTokenStorage: storage }));
import { refreshAccessToken, setAuthTokens } from "./session";
let tokens: AuthToken | null;
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  tokens = { accessToken: "old", refreshToken: "refresh" };
  storage.getValue.mockImplementation(async () => tokens);
  storage.setValue.mockImplementation(async value => { tokens = value; });
});
describe("background token rotation", () => {
  it("coalesces concurrent expired requests from extension contexts", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
    const attempts = [refreshAccessToken({ accessToken: "old" }), refreshAccessToken({ accessToken: "old" }), refreshAccessToken({ accessToken: "old" })];
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    finish(Response.json({ accessToken: "new", refreshToken: "rotated" }));
    await expect(Promise.all(attempts)).resolves.toEqual([true, true, true]);
    expect(storage.setValue).toHaveBeenCalledOnce();
  });
  it("reuses a newer token for a late 401 instead of rotating again", async () => {
    tokens = { accessToken: "new", refreshToken: "rotated" };
    await expect(refreshAccessToken({ accessToken: "old" })).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not revive a session after logout during refresh", async () => {
    fetchMock.mockImplementation(async () => { tokens = null; return Response.json({ accessToken: "new", refreshToken: "rotated" }); });
    await expect(refreshAccessToken({ accessToken: "old" })).resolves.toBe(false);
    expect(storage.setValue).not.toHaveBeenCalled();
  });
  it("does not erase a new login when an old refresh fails", async () => {
    fetchMock.mockImplementation(async () => { tokens = { accessToken: "other", refreshToken: "other-refresh", sessionId: "other-login" }; return new Response(null, { status: 401 }); });
    await expect(refreshAccessToken({ accessToken: "old" })).resolves.toBe(false);
    expect(storage.setValue).not.toHaveBeenCalled();
  });
  it("clears rejected refresh credentials", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(refreshAccessToken({ accessToken: "old" })).resolves.toBe(false);
    expect(tokens).toBeNull();
  });
  it("keeps credentials during temporary service errors", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    await expect(refreshAccessToken({ accessToken: "old" })).resolves.toBe(false);
    expect(storage.setValue).not.toHaveBeenCalled();
  });
  it("does not store malformed successful responses", async () => {
    fetchMock.mockResolvedValue(Response.json({ message: "unexpected" }));
    await expect(refreshAccessToken({ accessToken: "old" })).resolves.toBe(false);
    expect(storage.setValue).not.toHaveBeenCalled();
  });
});

it("serializes logout after a refresh commit already in progress", async () => {
  let completeWrite!: () => void;
  storage.setValue.mockImplementationOnce(value => new Promise<void>(resolve => {
    completeWrite = () => { tokens = value; resolve(); };
  })).mockImplementation(async value => { tokens = value; });
  fetchMock.mockResolvedValue(Response.json({ accessToken: "new", refreshToken: "rotated" }));
  const refreshing = refreshAccessToken({ accessToken: "old" });
  await vi.waitFor(() => expect(storage.setValue).toHaveBeenCalledOnce());
  const logout = setAuthTokens(null);
  completeWrite();
  await Promise.all([refreshing, logout]);
  expect(tokens).toBeNull();
});

it("does not replay requests across an explicit account switch", async () => {
  await setAuthTokens({ accessToken: "other", refreshToken: "other-refresh" });
  await expect(refreshAccessToken({ accessToken: "old" })).resolves.toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});
