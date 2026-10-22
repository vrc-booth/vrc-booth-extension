import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { AuthToken } from "../components/review/types";
const storage = vi.hoisted(() => ({ watch: vi.fn(), getValue: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/utils/storage", () => ({ authTokenStorage: storage }));
import { watchAuthSessionCache } from "../components/review/session-cache";
let listener: (next: AuthToken | null, previous: AuthToken | null) => void;
const old = { accessToken: "old", refreshToken: "old-r", sessionId: "A" };
const next = { accessToken: "new", refreshToken: "new-r", sessionId: "B" };
beforeEach(() => {
  vi.clearAllMocks();
  storage.getValue.mockResolvedValue(old);
  storage.watch.mockImplementation(callback => { listener = callback; return storage.unsubscribe; });
});
describe("cross-tab private cache invalidation", () => {
  it.each([null, next])("clears prior profile/private reviews on a remote session change", async (replacement) => {
    const client = new QueryClient();
    client.setQueryData(["userProfile"], { id: "A" });
    client.setQueryData(["myComment", "42"], { content: "A private draft" });
    client.setQueryData(["myComments", 1], [{ content: "A history" }]);
    client.setQueryData(["product", "42"], { title: "public" });
    const stop = watchAuthSessionCache(client);
    listener(replacement, old);
    expect(client.getQueryData(["userProfile"])).toBeUndefined();
    expect(client.getQueryData(["myComment", "42"])).toBeUndefined();
    expect(client.getQueryData(["myComments", 1])).toBeUndefined();
    expect(client.getQueryData(["product", "42"])).toEqual({ title: "public" });
    stop();
    expect(storage.unsubscribe).toHaveBeenCalledOnce();
    client.clear();
  });
  it.each([
    [old, { ...old, accessToken: "rotated" }],
    [{ accessToken: "old", refreshToken: "old-r" }, { accessToken: "new", refreshToken: "new-r" }],
  ])("preserves caches for same-login token rotation", (previous, rotated) => {
    const client = new QueryClient();
    client.setQueryData(["userProfile"], { id: "A" });
    const stop = watchAuthSessionCache(client);
    listener(rotated, previous);
    expect(client.getQueryData(["userProfile"])).toEqual({ id: "A" });
    stop(); client.clear();
  });
  it("cancels an old-account response so it cannot repopulate the new session cache", async () => {
    const client = new QueryClient();
    let finish!: (value: unknown) => void;
    const pending = client.fetchQuery({ queryKey: ["userProfile"], queryFn: () => new Promise(resolve => { finish = resolve; }) }).catch(() => undefined);
    watchAuthSessionCache(client);
    listener(next, old);
    finish({ id: "A" });
    await pending;
    expect(client.getQueryData(["userProfile"])).toBeUndefined();
    client.clear();
  });
});


it("reconciles account changes while a board is unmounted and its cache survives", async () => {
  const client = new QueryClient();
  const stop = watchAuthSessionCache(client);
  await Promise.resolve();
  client.setQueryData(["userProfile"], { id: "A" });
  client.setQueryData(["myComment", "42"], { content: "A private review" });
  stop();
  storage.getValue.mockResolvedValue(next);
  const stopAgain = watchAuthSessionCache(client);
  await Promise.resolve();
  expect(client.getQueryData(["userProfile"])).toBeUndefined();
  expect(client.getQueryData(["myComment", "42"])).toBeUndefined();
  stopAgain(); client.clear();
});

it("does not overwrite a newer storage event with a delayed mount-time read", async () => {
  const client = new QueryClient();
  let finish!: (tokens: AuthToken) => void;
  storage.getValue.mockReturnValue(new Promise<AuthToken>(resolve => { finish = resolve; }));
  const stop = watchAuthSessionCache(client);
  listener(next, old);
  client.setQueryData(["userProfile"], { id: "B" });
  finish(old);
  await Promise.resolve();
  expect(client.getQueryData(["userProfile"])).toEqual({ id: "B" });
  stop(); client.clear();
});
