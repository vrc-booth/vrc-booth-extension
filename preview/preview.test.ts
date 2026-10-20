import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteComment, fetchCommentsForProduct, fetchMyComments, fetchUserComment, fetchUserProfile, submitComment, updateUsername } from "./mocks/api";
import { loginWithDiscord } from "./mocks/auth";
import { sendMessage } from "./mocks/messaging";
import { MOCK_TOKEN, resetScenario, state } from "./mocks/state";
import { installPreviewNetworkGuard } from "./network";

let networkFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  networkFetch = vi.fn(async () => new Response("local asset"));
  const target = new EventTarget();
  vi.stubGlobal("window", Object.assign(target, {
    location: { href: "http://127.0.0.1:4173/", origin: "http://127.0.0.1:4173" },
    fetch: networkFetch,
    setTimeout: (callback: () => void) => globalThis.setTimeout(callback, 0),
  }));
  resetScenario("signed-out");
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("local UI preview fixtures", () => {
  it("exposes public comments without an authenticated profile", async () => {
    expect(await fetchUserProfile()).toBeNull();
    expect((await fetchCommentsForProduct("preview", 1, 10)).comments).toHaveLength(3);
    expect(await fetchUserComment("preview")).toBeNull();
    await expect(submitComment("preview", "POST", { content: "test", score: 8 })).rejects.toThrow();
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it("simulates login, create, update, delete and logout entirely in memory", async () => {
    await loginWithDiscord();
    expect((await fetchUserProfile())?.id).toBe("demo-user-001");
    await submitComment("preview", "POST", { content: "Synthetic draft", score: 7 });
    expect((await fetchUserComment("preview"))?.content).toBe("Synthetic draft");
    await submitComment("preview", "PUT", { content: "Edited synthetic draft", score: 9 });
    expect((await fetchCommentsForProduct("preview")).comments).toHaveLength(4);
    expect((await fetchMyComments()).comments[0].score).toBe(9);
    await deleteComment("preview");
    expect(await fetchUserComment("preview")).toBeNull();
    expect((await fetchMyComments()).comments).toHaveLength(0);
    await sendMessage("setAuthTokens", null);
    expect(await fetchUserProfile()).toBeNull();
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it("provides account pagination and resets all local edits", async () => {
    resetScenario("account");
    expect((await fetchMyComments(1, 5)).comments).toHaveLength(5);
    expect((await fetchMyComments(2, 5)).comments).toHaveLength(2);
    await updateUsername("Local name");
    expect((await fetchUserProfile())?.username).toBe("Local name");
    expect((await fetchMyComments()).comments[0].user.username).toBe("Local name");
    resetScenario("empty");
    expect((await fetchCommentsForProduct("preview")).count).toBe(0);
    expect(state.profile.username).toBe("미리보기 사용자");
    expect(networkFetch).not.toHaveBeenCalled();
  });
});

describe("local preview network isolation", () => {
  it("blocks all external fetches without contacting the network", async () => {
    installPreviewNetworkGuard();
    await expect(window.fetch("https://example.invalid/api")).rejects.toThrow("External network requests are disabled");
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it("blocks network writes and undefined mock API routes", async () => {
    installPreviewNetworkGuard();
    await expect(window.fetch("/somewhere", { method: "POST" })).rejects.toThrow("Network writes are disabled");
    await expect(window.fetch("/__preview_api__/undefined")).rejects.toThrow("Unmocked preview request");
    expect(networkFetch).not.toHaveBeenCalled();
  });

  it("returns only synthetic OAuth tokens and allows local asset reads", async () => {
    installPreviewNetworkGuard();
    const callback = await window.fetch("/__preview_api__/auth/oauth/discord/callback?code=synthetic");
    expect(await callback.json()).toEqual(MOCK_TOKEN);
    expect(networkFetch).not.toHaveBeenCalled();
    const response = await window.fetch("/main.tsx");
    expect(await response.text()).toBe("local asset");
    expect(networkFetch).toHaveBeenCalledOnce();
  });
});
