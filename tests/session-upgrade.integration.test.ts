import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthToken } from "../components/review/types";
const persisted = vi.hoisted(() => ({ getValue: vi.fn(), setValue: vi.fn() }));
vi.mock("@/utils/storage", () => ({ authTokenStorage: persisted }));
let value: AuthToken | null;
const network = vi.fn();
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", network);
  value = null;
  persisted.getValue.mockImplementation(async () => value);
  persisted.setValue.mockImplementation(async tokens => { value = tokens; });
});

describe("stored-session compatibility across simulated module reloads", () => {
  it("keeps a new installation signed out without network or storage writes", async () => {
    const session = await import("../components/review/session");
    await expect(session.refreshAccessToken({ accessToken: "missing" })).resolves.toBe(false);
    expect(network).not.toHaveBeenCalled();
    expect(persisted.setValue).not.toHaveBeenCalled();
  });

  it("accepts 3.2.0 token pairs without sessionId and keeps them usable after a fresh module load", async () => {
    value = { accessToken: "legacy-access", refreshToken: "legacy-refresh" };
    network.mockResolvedValueOnce(Response.json({ accessToken: "rotated-access", refreshToken: "rotated-refresh" }))
      .mockResolvedValueOnce(Response.json({ accessToken: "second-access", refreshToken: "second-refresh" }));
    const first = await import("../components/review/session");
    await expect(first.refreshAccessToken({ accessToken: "legacy-access" })).resolves.toBe(true);
    expect(value?.accessToken).toBe("rotated-access");
    expect(value?.sessionId).toBeUndefined();

    vi.resetModules();
    const reloaded = await import("../components/review/session");
    await expect(reloaded.refreshAccessToken({ accessToken: "legacy-access" })).resolves.toBe(true);
    expect(network).toHaveBeenCalledOnce();
    await expect(reloaded.refreshAccessToken({ accessToken: "rotated-access" })).resolves.toBe(true);
    expect(value?.accessToken).toBe("second-access");
    expect(network).toHaveBeenCalledTimes(2);
  });

  it("preserves explicit login generation and rejects another session after module reload", async () => {
    const first = await import("../components/review/session");
    await first.setAuthTokens({ accessToken: "stored-access", refreshToken: "stored-refresh" });
    const sessionId = value?.sessionId;
    expect(sessionId).toBeTruthy();
    vi.resetModules();
    const reloaded = await import("../components/review/session");
    await expect(reloaded.refreshAccessToken({ accessToken: "old-access", sessionId: "different-login" })).resolves.toBe(false);
    expect(value?.sessionId).toBe(sessionId);
    expect(network).not.toHaveBeenCalled();
  });

  it("does not overwrite malformed persisted values or invent credentials", async () => {
    persisted.getValue.mockResolvedValue({ accessToken: "incomplete" });
    const session = await import("../components/review/session");
    await expect(session.refreshAccessToken({ accessToken: "incomplete" })).resolves.toBe(false);
    expect(network).not.toHaveBeenCalled();
    expect(persisted.setValue).not.toHaveBeenCalled();
  });
});
