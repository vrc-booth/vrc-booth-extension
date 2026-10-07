import { authTokenStorage } from "@/utils/storage";
import { API_BASE } from "./config";
import type { AuthToken } from "./types";

export const isAuthToken = (value: unknown): value is AuthToken => {
  if (!value || typeof value !== "object") return false;
  const tokens = value as Partial<AuthToken>;
  return typeof tokens.accessToken === "string" && tokens.accessToken.length > 0
    && typeof tokens.refreshToken === "string" && tokens.refreshToken.length > 0;
};

// Only the background worker calls this: token rotation must be shared across tabs.
const pendingRefreshes = new Map<string, Promise<boolean>>();

let sessionWrites: Promise<unknown> = Promise.resolve();
const serializeSessionWrite = <T>(operation: () => Promise<T>): Promise<T> => {
  const next = sessionWrites.then(operation, operation);
  sessionWrites = next.catch(() => undefined);
  return next;
};

export const setAuthTokens = (tokens: AuthToken | null): Promise<void> =>
  serializeSessionWrite(async () => {
    if (tokens !== null && !isAuthToken(tokens)) throw new Error("Invalid authentication response");
    await authTokenStorage.setValue(tokens ? { ...tokens, sessionId: crypto.randomUUID() } : null);
  });

const rotateToken = async (tokens: AuthToken): Promise<boolean> => {
  try {
    const response = await fetch(`${API_BASE}/auth/token`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload: unknown = response.ok ? await response.json() : null;
    return await serializeSessionWrite(async () => {
      const current = await authTokenStorage.getValue();
      if (!current || current.sessionId !== tokens.sessionId) return false;
      if (current.refreshToken !== tokens.refreshToken) return true;
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) await authTokenStorage.setValue(null);
        return false;
      }
      if (!isAuthToken(payload)) return false;
      await authTokenStorage.setValue({ ...payload, sessionId: tokens.sessionId });
      return true;
    });
  } catch {
    return false;
  }
};

export const refreshAccessToken = async (failed: Pick<AuthToken, "accessToken" | "sessionId">): Promise<boolean> => {
  const prepared = await serializeSessionWrite(async () => {
    const tokens = await authTokenStorage.getValue();
    if (!isAuthToken(tokens) || tokens.sessionId !== failed.sessionId) return { result: false };
    if (tokens.accessToken !== failed.accessToken) return { result: true };

    let pending = pendingRefreshes.get(tokens.refreshToken);
    if (!pending) {
      pending = rotateToken(tokens);
      pendingRefreshes.set(tokens.refreshToken, pending);
    }
    // Return a wrapper so the write queue never waits on the network request.
    return { pending, key: tokens.refreshToken };
  });
  if (!prepared.pending) return prepared.result ?? false;
  try {
    return await prepared.pending;
  } finally {
    if (pendingRefreshes.get(prepared.key) === prepared.pending) {
      pendingRefreshes.delete(prepared.key);
    }
  }
};
