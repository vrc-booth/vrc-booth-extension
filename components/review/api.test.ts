import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getValue: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@/utils/storage", () => ({ authTokenStorage: { getValue: mocks.getValue } }));
vi.mock("./messaging", () => ({ sendMessage: mocks.sendMessage }));
import { apiFetch, deleteComment, fetchCommentsForProduct, fetchProductById } from "./api";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  mocks.getValue.mockResolvedValue({ accessToken: "old", refreshToken: "refresh" });
});
describe("legacy API requests", () => {
  it("awaits delete completion and forwards failures to the mutation", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(resolve => { finish = resolve; }));
    let settled = false;
    const deletion = deleteComment("42");
    const outcome = deletion.then(() => { settled = true; }, error => { settled = true; throw error; });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    finish(new Response("delete denied", { status: 403 }));
    await expect(outcome).rejects.toMatchObject({ status: 403, message: "delete denied" });
  });
  it("retries once with the newly rotated token even with custom headers", async () => {
    fetchMock.mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    mocks.sendMessage.mockImplementation(async () => {
      mocks.getValue.mockResolvedValue({ accessToken: "new", refreshToken: "rotated" });
      return true;
    });
    await expect(apiFetch("/comment/42", { method: "DELETE", headers: new Headers({ "X-Test": "yes", Authorization: "Bearer stale" }) })).resolves.toEqual({ ok: true });
    expect(mocks.sendMessage).toHaveBeenCalledWith("refreshAccessToken", { accessToken: "old", sessionId: undefined });
    const headers = fetchMock.mock.calls[1][1].headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer new");
    expect(headers.get("X-Test")).toBe("yes");
    expect(headers.get("Accept")).toBe("application/json");
  });
  it("does not loop on a second 401", async () => {
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    mocks.sendMessage.mockResolvedValue(true);
    await expect(apiFetch("/user/me")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage).toHaveBeenCalledOnce();
  });
  it("never attempts token rotation for an anonymous request", async () => {
    mocks.getValue.mockResolvedValue(null);
    fetchMock.mockResolvedValue(new Response("unauthorized", { status: 401 }));
    await expect(apiFetch("/user/me")).rejects.toMatchObject({ status: 401 });
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
  it("supports successful responses without a JSON body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(deleteComment("42")).resolves.toBeUndefined();
  });
  it("keeps legacy wrappers and one-based pagination", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ product: { id: "42", title: "Product" } }))
      .mockResolvedValueOnce(Response.json({ count: 12, comments: [{ id: "review" }] }));
    await expect(fetchProductById("42")).resolves.toEqual({ id: "42", title: "Product" });
    await expect(fetchCommentsForProduct("42", 2, 10)).resolves.toEqual({ count: 12, comments: [{ id: "review" }], page: 2, pageSize: 10 });
    expect(fetchMock.mock.calls[1][0]).toBe("https://vbt.kamyu.me/api/comment?productId=42&sort=new&page=2&limit=10");
  });
});

it("does not retry a mutation if accounts change after refresh", async () => {
  mocks.getValue.mockResolvedValue({ accessToken: "old", refreshToken: "refresh", sessionId: "first" });
  fetchMock.mockResolvedValue(new Response("expired", { status: 401 }));
  mocks.sendMessage.mockImplementation(async () => {
    mocks.getValue.mockResolvedValue({ accessToken: "other", refreshToken: "other-refresh", sessionId: "second" });
    return true;
  });
  await expect(apiFetch("/comment/42", { method: "DELETE" })).rejects.toMatchObject({ status: 401 });
  expect(fetchMock).toHaveBeenCalledOnce();
});
