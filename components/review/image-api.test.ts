import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthToken } from "./types";
const mocks = vi.hoisted(() => ({ getValue: vi.fn(), sendMessage: vi.fn() }));
vi.mock("@/utils/storage", () => ({ authTokenStorage: { getValue: mocks.getValue } }));
vi.mock("./messaging", () => ({ sendMessage: mocks.sendMessage }));
import { captureReviewSession, deleteComment, deleteReviewImage, fetchCommentsForProduct, fetchMyComments, fetchUserComment, submitComment, uploadReviewImage } from "./api";
const network = vi.fn();
let tokens: AuthToken | null;
const image = { id: "image/1", url: "https://cdn.example.invalid/reviews/one.webp", width: 128, height: 96 };
const file = () => new File([new Uint8Array([137, 80, 78, 71])], "synthetic.png", { type: "image/png" });
const context = { sessionId: "A" };

beforeEach(() => {
  vi.resetAllMocks();
  tokens = { accessToken: "token-A", refreshToken: "refresh-A", sessionId: "A" };
  mocks.getValue.mockImplementation(async () => tokens);
  vi.stubGlobal("fetch", network);
});
afterEach(() => vi.unstubAllGlobals());

describe("v2 image and review API contracts (mock network only)", () => {
  it("uploads multipart file to the API with auth and without a JSON content-type", async () => {
    network.mockResolvedValue(Response.json({ image }, { status: 201 }));
    const selected = file();
    expect(await uploadReviewImage(selected, context)).toEqual(image);
    const [url, init] = network.mock.calls[0];
    expect(url).toBe("https://vbt.kamyu.me/api/v2/review/image");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get("file")).toBe(selected);
    expect(init.headers.get("Content-Type")).toBeNull();
    expect(init.headers.get("Authorization")).toBe("Bearer token-A");
    expect(network).toHaveBeenCalledOnce();
  });
  it("retries an explicit unauthorized multipart upload once in the same rotated session", async () => {
    network.mockResolvedValueOnce(new Response("expired", { status: 401 })).mockResolvedValueOnce(Response.json({ image }));
    mocks.sendMessage.mockImplementation(async () => { tokens = { ...tokens!, accessToken: "rotated" }; return true; });
    await uploadReviewImage(file(), context);
    expect(network).toHaveBeenCalledTimes(2);
    expect(network.mock.calls[1][1].body).toBe(network.mock.calls[0][1].body);
    expect(network.mock.calls[1][1].headers.get("Content-Type")).toBeNull();
    expect(network.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer rotated");
  });
  it.each([400, 403, 413, 415, 422, 429, 503])("propagates upload %s without retrying", async status => {
    network.mockResolvedValue(new Response("rejected", { status }));
    await expect(uploadReviewImage(file(), context)).rejects.toMatchObject({ status });
    expect(network).toHaveBeenCalledOnce();
  });
  it("does not retry an ambiguous upload transport failure", async () => {
    network.mockRejectedValue(new TypeError("lost response"));
    await expect(uploadReviewImage(file(), context)).rejects.toThrow("lost response");
    expect(network).toHaveBeenCalledOnce();
  });
  it("rejects malformed/unsafe upload metadata", async () => {
    network.mockResolvedValue(Response.json({ image: { ...image, url: "javascript:alert(1)" } }));
    await expect(uploadReviewImage(file(), context)).rejects.toMatchObject({ status: 502 });
  });
  it("rejects stale generation or signed-out upload before contacting the API", async () => {
    tokens = { ...tokens!, sessionId: "B" };
    await expect(captureReviewSession(undefined, "A")).rejects.toMatchObject({ status: 401 });
    await expect(uploadReviewImage(file(), context)).rejects.toMatchObject({ status: 401 });
    tokens = null;
    await expect(captureReviewSession()).rejects.toMatchObject({ status: 401 });
    expect(network).not.toHaveBeenCalled();
  });
  it("rejects a late upload result after a new login, without a save/delete request", async () => {
    network.mockImplementation(async () => {
      tokens = { ...tokens!, sessionId: "B" };
      return Response.json({ image });
    });
    await expect(uploadReviewImage(file(), context)).rejects.toMatchObject({ status: 401 });
    expect(network).toHaveBeenCalledOnce();
  });
  it("honors interrupted operations before upload and passes abort signal to fetch", async () => {
    const aborted = new AbortController(); aborted.abort();
    await expect(uploadReviewImage(file(), { ...context, signal: aborted.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(network).not.toHaveBeenCalled();
    const active = new AbortController();
    network.mockResolvedValue(Response.json({ image }));
    await uploadReviewImage(file(), { ...context, signal: active.signal });
    expect(network.mock.calls[0][1].signal).toBe(active.signal);
  });
  it("preserves desired IDs/anonymous in review writes and sends explicit empty IDs for removal", async () => {
    network.mockResolvedValue(new Response(null, { status: 204 }));
    await submitComment("42/1", "POST", { content: "Test", score: 8, imageIds: ["first", "second"] }, context);
    await submitComment("42/1", "PUT", { content: "Edit", score: 6, anonymous: true, imageIds: [] }, context);
    expect(network.mock.calls.map(([url]) => url)).toEqual(["https://vbt.kamyu.me/api/v2/review/42%2F1", "https://vbt.kamyu.me/api/v2/review/42%2F1"]);
    expect(JSON.parse(network.mock.calls[1][1].body)).toEqual({ content: "Edit", score: 6, anonymous: true, imageIds: [] });
    await deleteComment("42/1", context);
    await deleteReviewImage("image/1", context);
    expect(network.mock.calls[2][0]).toBe("https://vbt.kamyu.me/api/v2/review/42%2F1");
    expect(network.mock.calls[3][0]).toBe("https://vbt.kamyu.me/api/v2/review/image/image%2F1");
  });
  it("adapts all v2 read envelopes and fixed page size, withholding blinded public images", async () => {
    const review = { id: "review", content: "text", score: 8, blinded: true, images: [image] };
    network.mockResolvedValueOnce(Response.json({ count: 21, reviews: [review] }))
      .mockResolvedValueOnce(Response.json({ count: 1, reviews: [review] }))
      .mockResolvedValueOnce(Response.json({ review }));
    expect(await fetchCommentsForProduct("42/1", 2)).toMatchObject({ count: 21, page: 2, pageSize: 20, comments: [{ images: [] }] });
    expect(await fetchMyComments(2)).toMatchObject({ count: 1, comments: [{ images: [] }] });
    expect(await fetchUserComment("42/1")).toMatchObject({ images: [image], blinded: true });
    expect(network.mock.calls.map(([url]) => url)).toEqual([
      "https://vbt.kamyu.me/api/v2/review?productId=42%2F1&sort=new&page=2",
      "https://vbt.kamyu.me/api/v2/review/my?page=2",
      "https://vbt.kamyu.me/api/v2/review/42%2F1/my",
    ]);
  });
});

it("bounds pending-image deletion and links its abort signal to the active operation", async () => {
  const controller = new AbortController();
  network.mockImplementation((_url, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(init.signal!.reason));
  }));
  const deletion = deleteReviewImage("pending", { ...context, signal: controller.signal });
  const result = expect(deletion).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(network).toHaveBeenCalledOnce());
  const signal = network.mock.calls[0][1].signal as AbortSignal;
  expect(signal).not.toBe(controller.signal);
  controller.abort();
  await result;
  expect(signal.aborted).toBe(true);
});
