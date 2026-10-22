// @vitest-environment happy-dom
// Real profile hook and QueryClient; no browser credentials or live requests.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ profile: vi.fn() }));
vi.mock("@/components/review/api", () => ({ fetchUserProfile: mock.profile }));
vi.mock("@/utils/storage", () => ({
  authTokenStorage: { watch: () => () => undefined, getValue: async () => ({ accessToken: "test", refreshToken: "test", sessionId: "A" }) },
}));
import { useUserProfileQuery } from "@/components/review/queries/useUserProfileQuery";
import { ApiError } from "@/utils/review-utils";

let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
function State() {
  const query = useUserProfileQuery();
  return <div>{query.data ? `signed-in:${query.data.id}` : query.isSuccess ? "signed-out" : query.isPending ? "checking" : "unavailable"}</div>;
}
beforeEach(async () => {
  mock.profile.mockReset();
  focusManager.setFocused(true);
  onlineManager.setOnline(true);
  // Production's shared client turns focus refetch off. The hook must override it.
  client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 60_000 } } });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
});
const mount = () => act(async () => { root.render(<QueryClientProvider client={client}><State /></QueryClientProvider>); });
const waitFor = async (check: () => void) => {
  await vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); check(); }, { timeout: 5000 });
};
it("automatically recovers on retry without emitting signed-out state", async () => {
  const states: string[] = [];
  const observer = new MutationObserver(() => states.push(container.textContent ?? ""));
  observer.observe(container, { childList: true, subtree: true, characterData: true });
  try {
    mock.profile.mockRejectedValueOnce(new ApiError("refresh unavailable", 503)).mockResolvedValue({ id: "me" });
    await mount();
    expect(container.textContent).toBe("checking");
    await waitFor(() => expect(container.textContent).toBe("signed-in:me"));
    expect(mock.profile).toHaveBeenCalledTimes(2);
    expect(states).not.toContain("signed-out");
  } finally { observer.disconnect(); }
});
it("bounds retries then recovers when the connection returns", async () => {
  mock.profile.mockRejectedValue(new ApiError("refresh unavailable", 503));
  await mount();
  await waitFor(() => expect(container.textContent).toBe("unavailable"));
  expect(mock.profile).toHaveBeenCalledTimes(3);
  await act(async () => onlineManager.setOnline(false));
  mock.profile.mockResolvedValue({ id: "me" });
  await act(async () => onlineManager.setOnline(true));
  await waitFor(() => expect(container.textContent).toBe("signed-in:me"));
  expect(mock.profile).toHaveBeenCalledTimes(4);
});
it("preserves an existing profile through a transient failure and retries on tab focus", async () => {
  client.setQueryData(["userProfile"], { id: "me" });
  mock.profile.mockRejectedValue(new ApiError("temporary", 503));
  await mount();
  await act(async () => { void client.invalidateQueries({ queryKey: ["userProfile"] }); });
  await waitFor(() => expect(client.getQueryState(["userProfile"])?.status).toBe("error"));
  expect(container.textContent).toBe("signed-in:me");
  mock.profile.mockResolvedValue({ id: "me" });
  await act(async () => focusManager.setFocused(false));
  await act(async () => focusManager.setFocused(true));
  await waitFor(() => expect(client.getQueryState(["userProfile"])?.status).toBe("success"));
  expect(container.textContent).toBe("signed-in:me");
});
it("does not retry a confirmed signed-out response", async () => {
  mock.profile.mockResolvedValue(null);
  await mount();
  await waitFor(() => expect(container.textContent).toBe("signed-out"));
  expect(mock.profile).toHaveBeenCalledOnce();
});
