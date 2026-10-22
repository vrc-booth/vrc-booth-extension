// @vitest-environment happy-dom
// Exercise real API adapters and hooks without live credentials or requests.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getValue: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@/utils/storage", () => ({
  authTokenStorage: { getValue: mocks.getValue, watch: () => () => undefined },
}));
vi.mock("@/components/review/messaging", () => ({ sendMessage: mocks.sendMessage }));
import { fetchUserComment } from "@/components/review/api";
import { useMyCommentQuery } from "@/components/review/queries/useMyCommentQuery";
import { useUserProfileQuery } from "@/components/review/queries/useUserProfileQuery";

let client: QueryClient;
let root: Root;
let container: HTMLDivElement;
const network = vi.fn();
function FormState() {
  const profile = useUserProfileQuery();
  const review = useMyCommentQuery("42", { enabled: Boolean(profile.data?.id) });
  return <div>{!review.isSuccess ? "blocked" : review.data ? `PUT:${review.data.content}` : "POST"}</div>;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getValue.mockResolvedValue({ accessToken: "expired", refreshToken: "recoverable", sessionId: "A" });
  mocks.sendMessage.mockResolvedValue(false);
  vi.stubGlobal("fetch", network);
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  vi.unstubAllGlobals();
});
const waitFor = async (check: () => void) => {
  await vi.waitFor(async () => {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    check();
  });
};

it("blocks creation after transient auth failure and restores the existing review on profile recovery", async () => {
  client.setQueryData(["userProfile"], { id: "me" });
  network.mockResolvedValue(new Response("expired", { status: 401 }));
  await act(async () => root.render(<QueryClientProvider client={client}><FormState /></QueryClientProvider>));
  await waitFor(() => expect(client.getQueryState(["myComment", "42"])?.status).toBe("error"));
  expect(container.textContent).toBe("blocked");
  expect(client.getQueryState(["myComment", "42"])?.error).toMatchObject({ status: 503 });

  network.mockImplementation(async (url: string) => url.endsWith("/user/me")
    ? Response.json({ id: "me" })
    : Response.json({ review: { id: "existing", content: "Saved review", score: 8, images: [] } }));
  await act(async () => { await client.invalidateQueries({ queryKey: ["userProfile"] }); });
  await waitFor(() => expect(container.textContent).toBe("PUT:Saved review"));
  expect(network.mock.calls.filter(([url]) => url.endsWith("/42/my"))).toHaveLength(2);
});

it("does not refetch a successful review when the profile refreshes", async () => {
  client.setQueryData(["userProfile"], { id: "me" });
  client.setQueryData(["myComment", "42"], { id: "existing", content: "Saved review" });
  network.mockResolvedValue(Response.json({ id: "me" }));
  await act(async () => root.render(<QueryClientProvider client={client}><FormState /></QueryClientProvider>));
  await act(async () => { await client.invalidateQueries({ queryKey: ["userProfile"] }); });
  expect(network).toHaveBeenCalledOnce();
  expect(network.mock.calls[0][0]).toContain("/user/me");
});

it("still returns no review for a confirmed sign-out", async () => {
  mocks.getValue.mockResolvedValue(null);
  network.mockResolvedValue(new Response("unauthorized", { status: 401 }));
  await expect(fetchUserComment("42")).resolves.toBeNull();
});

it("still returns no review for a confirmed missing review", async () => {
  network.mockResolvedValue(new Response("missing", { status: 404 }));
  await expect(fetchUserComment("42")).resolves.toBeNull();
});
