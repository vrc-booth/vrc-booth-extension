import { afterEach, describe, expect, it, vi } from "vitest";
import { CwsClient, GithubJournal, TransportError, type JournalPhase } from "../scripts/cws-client.mjs";

const itemId = "abcdefghijklmnopabcdefghijklmnop";
const otherItemId = "b".repeat(32);
const publisherId = "publisher-123";
const name = `publishers/${publisherId}/items/${itemId}`;
const cwsToken = "CWS_PRIVATE_TOKEN_FIXTURE";
const githubToken = "GITHUB_PRIVATE_TOKEN_FIXTURE";
const repository = "example/boothplus";
const githubBase = `https://api.github.com/repos/${repository}/deployments`;
const environment = "chrome-web-store-ledger";
const candidate = {
  version: "3.3.0", commit: "a".repeat(40), sha256: "b".repeat(64), itemId, artifactId: "91", runId: "82",
};
const zip = new Uint8Array([80, 75, 3, 4]);
const response = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
const queuedFetch = (...responses: Response[]) => {
  const mock = vi.fn<typeof fetch>();
  for (const result of responses) mock.mockResolvedValueOnce(result);
  return mock;
};
const cws = (fetchImpl: typeof fetch, timeoutMs = 30000) => new CwsClient({ publisherId, itemId, accessToken: cwsToken, fetchImpl, timeoutMs });
const journal = (fetchImpl: typeof fetch, timeoutMs = 30000) => new GithubJournal({ repository, itemId, token: githubToken, fetchImpl, timeoutMs });
const deployment = (id = 10, changes: Record<string, unknown> = {}) => ({
  id, ref: candidate.commit, sha: candidate.commit, environment,
  transient_environment: false, production_environment: false,
  payload: { schema: 1, product: "boothplus", ...candidate }, ...changes,
});
const status = (phase: JournalPhase, overrides: Record<string, unknown> = {}) => ({
  id: 101, description: `cws:${phase}`, environment,
  state: phase === "published" ? "success" : phase === "failed" ? "failure" : phase === "upload_uncertain" ? "error" : phase === "prepared" ? "queued" : "in_progress",
  ...overrides,
});
const pageUrl = (page: number) => `${githubBase}?environment=${environment}&per_page=100&page=${page}`;

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("CWS V2 transport contract", () => {
  it("construction/import performs no requests and hides tokens from object inspection", () => {
    const fetchImpl = queuedFetch();
    expect(JSON.stringify(cws(fetchImpl))).not.toContain(cwsToken);
    expect(JSON.stringify(journal(fetchImpl))).not.toContain(githubToken);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches only the configured item's official V2 status", async () => {
    const data = { name, itemId, takenDown: false, warned: false, lastAsyncUploadState: "NOT_FOUND",
      publishedItemRevisionStatus: { state: "PUBLISHED", distributionChannels: [{ crxVersion: "3.2.0", deployPercentage: 100 }] } };
    const fetchImpl = queuedFetch(response(data));
    expect(await cws(fetchImpl).fetchStatus()).toEqual(data);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(`https://chromewebstore.googleapis.com/v2/${name}:fetchStatus`, {
      method: "GET", headers: { Authorization: `Bearer ${cwsToken}`, Accept: "application/json" },
      redirect: "error", signal: expect.any(AbortSignal),
    });
  });

  it("uploads raw ZIP bytes without a multipart wrapper", async () => {
    const data = { name, itemId, uploadState: "SUCCEEDED", crxVersion: "3.3.0" };
    const fetchImpl = queuedFetch(response(data));
    expect(await cws(fetchImpl).upload(zip)).toEqual(data);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(`https://chromewebstore.googleapis.com/upload/v2/${name}:upload`, {
      method: "POST", headers: { Authorization: `Bearer ${cwsToken}`, Accept: "application/json", "Content-Type": "application/zip" },
      body: zip, redirect: "error", signal: expect.any(AbortSignal),
    });
  });

  it.each(["DEFAULT_PUBLISH", "STAGED_PUBLISH"] as const)("publishes %s without skipping review or ignoring warnings", async (publishType) => {
    const fetchImpl = queuedFetch(response({ name, itemId, state: "PENDING_REVIEW" }));
    await cws(fetchImpl).publish(publishType);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://chromewebstore.googleapis.com/v2/${name}:publish`);
    expect(init).toMatchObject({ method: "POST", redirect: "error", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(init!.body as string)).toEqual({ publishType, skipReview: false, blockOnWarnings: true });
  });

  it.each(["IN_PROGRESS", "UPLOAD_IN_PROGRESS", "SOME_FUTURE_STATE"])("passes %s to policy without declaring it a successful exact upload", async (uploadState) => {
    const fetchImpl = queuedFetch(response({ name, itemId, uploadState }));
    expect(await cws(fetchImpl).upload(zip)).toEqual({ name, itemId, uploadState });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    { publisherId: "publisher\n" }, { itemId: itemId + "\n" }, { accessToken: cwsToken + "\n" },
    { publisherId: "../other" }, { publisherId: "x%2fy" }, { publisherId: "x?auth=y" },
    { itemId: "q".repeat(32) }, { itemId: "a".repeat(31) }, { itemId: `${itemId}\n` },
    { accessToken: "secret\r\nInjected: yes" }, { accessToken: "" }, { timeoutMs: 0 },
  ])("rejects unsafe configuration before fetching: %j", (overrides) => {
    const fetchImpl = queuedFetch();
    expect(() => new CwsClient({ publisherId, itemId, accessToken: cwsToken, fetchImpl, ...overrides })).toThrow(TransportError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects empty ZIPs and unsupported publish modes before mutation", async () => {
    const fetchImpl = queuedFetch();
    await expect(cws(fetchImpl).upload(new Uint8Array())).rejects.toMatchObject({ code: "INVALID_ZIP_BYTES", uncertain: false });
    await expect(cws(fetchImpl).publish("SKIP_REVIEW" as never)).rejects.toMatchObject({ code: "INVALID_PUBLISH_TYPE", uncertain: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    { name: name.replace(publisherId, "other"), itemId, uploadState: "SUCCEEDED", crxVersion: "3.3.0" },
    { name, itemId: otherItemId, uploadState: "SUCCEEDED", crxVersion: "3.3.0" },
    { name, itemId, uploadState: "SUCCEEDED" },
    { name, itemId, uploadState: null },
    { name, itemId, uploadState: "SUCCEEDED", crxVersion: "3.3.0", error: { message: cwsToken } },
  ])("marks a mismatched/malformed mutation response uncertain without retrying", async (data) => {
    const fetchImpl = queuedFetch(response(data));
    await expect(cws(fetchImpl).upload(zip)).rejects.toMatchObject({ uncertain: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([408, 429, 500, 503])("does not retry mutation HTTP %s or expose its response body", async (httpStatus) => {
    const fetchImpl = queuedFetch(response({ error: { message: `${cwsToken} private response` } }, httpStatus));
    const error = await cws(fetchImpl).publish("STAGED_PUBLISH").catch((error: unknown) => error) as TransportError;
    expect(error).toMatchObject({ code: "CWS_HTTP_ERROR", uncertain: true, status: httpStatus });
    expect(`${error.stack}${JSON.stringify(error)}`).not.toMatch(/CWS_PRIVATE_TOKEN|private response/);
    expect(error).not.toHaveProperty("cause");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("scrubs arbitrary fetch errors and JSON parsing errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error(`${cwsToken} URL headers payload`));
    const error = await cws(fetchImpl).upload(zip).catch((error: unknown) => error) as TransportError;
    expect(error).toMatchObject({ code: "CWS_NETWORK_ERROR", uncertain: true });
    expect(`${error.stack}${JSON.stringify(error)}`).not.toContain(cwsToken);
    const malformed = queuedFetch(new Response(`${cwsToken}: NOT JSON`));
    await expect(cws(malformed).upload(zip)).rejects.toMatchObject({ code: "CWS_MALFORMED_RESPONSE", uncertain: true });
    expect(malformed).toHaveBeenCalledTimes(1);
  });

  it("bounds a hanging fetch even when it ignores AbortSignal", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise(() => {}));
    const rejection = expect(cws(fetchImpl, 10).upload(zip)).rejects.toMatchObject({ code: "CWS_TIMEOUT", uncertain: true });
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]!.signal!.aborted).toBe(true);
  });

  it("includes response body parsing in the timeout and keeps GET failures read-only", async () => {
    vi.useFakeTimers();
    const hanging = response({});
    vi.spyOn(hanging, "json").mockImplementation(() => new Promise(() => {}));
    const fetchImpl = queuedFetch(hanging);
    const rejection = expect(cws(fetchImpl, 10).fetchStatus()).rejects.toMatchObject({ code: "CWS_TIMEOUT", uncertain: false });
    await vi.advanceTimersByTimeAsync(10);
    await rejection;
  });

  it.each([
    { name, itemId, warned: "false" },
    { name, itemId, submittedItemRevisionStatus: { state: "PENDING_REVIEW", distributionChannels: [{ crxVersion: "3.3.0", deployPercentage: 101 }] } },
    { name, itemId, submittedItemRevisionStatus: null },
  ])("rejects malformed status fields instead of silently dropping them", async (data) => {
    await expect(cws(queuedFetch(response(data))).fetchStatus()).rejects.toMatchObject({ code: "CWS_MALFORMED_RESPONSE", uncertain: false });
  });

  it("rejects an unexpectedly followed redirect", async () => {
    const redirected = response({ name, itemId, state: "PENDING_REVIEW" });
    Object.defineProperty(redirected, "redirected", { value: true });
    const fetchImpl = queuedFetch(redirected);
    await expect(cws(fetchImpl).publish("STAGED_PUBLISH")).rejects.toMatchObject({ code: "CWS_MALFORMED_RESPONSE", uncertain: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("durable GitHub deployment journal", () => {
  it("reserves the exact immutable candidate and appends prepared before returning", async () => {
    const fetchImpl = queuedFetch(response(deployment(), 201), response(status("prepared"), 201));
    expect(await journal(fetchImpl).reserve(candidate)).toEqual({ id: "10", ...candidate, phase: "prepared" });
    const [createUrl, createInit] = fetchImpl.mock.calls[0];
    expect(createUrl).toBe(githubBase);
    expect(createInit).toMatchObject({ method: "POST", redirect: "error", headers: {
      Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28",
    } });
    expect(JSON.parse(createInit!.body as string)).toEqual({
      ref: candidate.commit, environment, auto_merge: false, required_contexts: [],
      transient_environment: false, production_environment: false,
      description: "BOOTHPlus Chrome Web Store release ledger",
      payload: { schema: 1, product: "boothplus", ...candidate },
    });
    expect(fetchImpl.mock.calls[1][0]).toBe(`${githubBase}/10/statuses`);
    expect(JSON.parse(fetchImpl.mock.calls[1][1]!.body as string)).toEqual({
      state: "queued", description: "cws:prepared", environment, auto_inactive: false,
    });
  });

  it("loads every page, latest statuses, and reservations lacking a status in oldest-first order", async () => {
    const fetchImpl = queuedFetch(
      response([deployment(30)], 200, { link: `<${pageUrl(2)}>; rel="next", <${pageUrl(2)}>; rel="last"` }),
      response([status("submitted")]), response([deployment(20, { payload: JSON.stringify({ schema: 1, product: "boothplus", ...candidate }) })]),
      response([]), response([]),
    );
    expect(await journal(fetchImpl).list()).toEqual([
      { id: "20", ...candidate, phase: "prepared" }, { id: "30", ...candidate, phase: "submitted" },
    ]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      pageUrl(1), `${githubBase}/30/statuses?per_page=1&page=1`, pageUrl(2), `${githubBase}/20/statuses?per_page=1&page=1`, pageUrl(3),
    ]);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(new URL(url as string).origin).toBe("https://api.github.com");
      expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { Authorization: `Bearer ${githubToken}` } });
      expect(JSON.stringify(init)).not.toContain(cwsToken);
    }
  });

  it("does not silently drop a matching malformed ledger entry", async () => {
    for (const malformed of [
      deployment(1, { payload: "{broken" }),
      deployment(1, { payload: { schema: 2, product: "boothplus", ...candidate } }),
      deployment(1, { payload: { schema: 1, product: "boothplus", ...candidate, sha256: "" } }),
      deployment(1, { ref: "main" }),
      deployment(1, { production_environment: true }),
    ]) {
      const fetchImpl = queuedFetch(response([malformed]));
      await expect(journal(fetchImpl).list()).rejects.toBeInstanceOf(TransportError);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  });

  it("ignores only validated records for a different item", async () => {
    const fetchImpl = queuedFetch(response([deployment(12, { payload: { schema: 1, product: "boothplus", ...candidate, itemId: otherItemId } })]), response([]));
    expect(await journal(fetchImpl).list()).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    status("submitted", { description: "cws:unknown" }),
    status("submitted", { state: "success" }),
    status("submitted", { deployment_url: `${githubBase}/999` }),
    status("submitted", { environment: "production" }),
  ])("blocks an unrecognized or mismatched latest status", async (badStatus) => {
    await expect(journal(queuedFetch(response([deployment()]), response([badStatus]))).list()).rejects.toMatchObject({ code: "JOURNAL_MALFORMED_STATUS" });
  });

  it.each([
    `<https://evil.example/collect>; rel="next"`,
    `<${pageUrl(3)}>; rel="next"`,
    `<${pageUrl(3)}>; rel="last"`,
    `<${pageUrl(2)}&page=3>; rel="next"`,
  ])("fails closed on unsafe or incomplete pagination: %s", async (link) => {
    const fetchImpl = queuedFetch(response([deployment()], 200, { link }));
    await expect(journal(fetchImpl).list()).rejects.toBeInstanceOf(TransportError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(pageUrl(1));
  });

  it("fails closed if pagination repeats a deployment instead of completing history", async () => {
    const fetchImpl = queuedFetch(response([deployment()]), response([status("prepared")]), response([deployment()]));
    await expect(journal(fetchImpl).list()).rejects.toMatchObject({ code: "JOURNAL_TRUNCATED_HISTORY" });
  });

  it("checks unknown deployment identity before appending a status", async () => {
    const fetchImpl = queuedFetch(response(deployment()), response(status("upload_started"), 201));
    expect(await journal(fetchImpl).record("10", "upload_started")).toEqual({ id: "10", ...candidate, phase: "upload_started" });
    expect(fetchImpl.mock.calls[0][0]).toBe(`${githubBase}/10`);
    expect(fetchImpl.mock.calls[1][0]).toBe(`${githubBase}/10/statuses`);
  });

  it("never records a different item's deployment", async () => {
    const fetchImpl = queuedFetch(response(deployment(10, { payload: { schema: 1, product: "boothplus", ...candidate, itemId: otherItemId } })));
    await expect(journal(fetchImpl).record(10, "published")).rejects.toMatchObject({ code: "JOURNAL_IDENTITY_MISMATCH" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retains all history by disabling automatic inactivation for every phase", async () => {
    const phases: JournalPhase[] = ["prepared", "upload_started", "upload_succeeded", "upload_uncertain", "submit_started", "submitted", "staged", "promote_started", "published", "failed"];
    const fetchImpl = queuedFetch(response(deployment()), ...phases.map((phase) => response(status(phase), 201)));
    const ledger = journal(fetchImpl);
    for (const phase of phases) await ledger.record(10, phase);
    for (const [, init] of fetchImpl.mock.calls.slice(1)) {
      expect(init!.method).toBe("POST");
      expect(JSON.parse(init!.body as string).auto_inactive).toBe(false);
    }
    expect(fetchImpl.mock.calls.every(([, init]) => init!.method !== "DELETE")).toBe(true);
  });

  it("fails closed after an ambiguous reservation or status write, without retry", async () => {
    const fetchImpl = queuedFetch(response(deployment(), 201), response({ error: githubToken }, 503));
    const error = await journal(fetchImpl).reserve(candidate).catch((error: unknown) => error) as TransportError;
    expect(error).toMatchObject({ code: "JOURNAL_HTTP_ERROR", uncertain: true });
    expect(`${error.stack}${JSON.stringify(error)}`).not.toContain(githubToken);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const malformed = queuedFetch(response(deployment(10, { sha: "c".repeat(40) }), 201));
    await expect(journal(malformed).reserve(candidate)).rejects.toMatchObject({ code: "JOURNAL_IDENTITY_MISMATCH", uncertain: true });
    expect(malformed).toHaveBeenCalledTimes(1);
  });

  it("rejects GitHub's auto-merge response even if it is HTTP 202", async () => {
    const fetchImpl = queuedFetch(response({ message: githubToken }, 202));
    await expect(journal(fetchImpl).reserve(candidate)).rejects.toMatchObject({ code: "JOURNAL_UNEXPECTED_STATUS", uncertain: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("validates all request identity fields before reservation", async () => {
    const fetchImpl = queuedFetch();
    for (const changes of [{ commit: "main" }, { sha256: "0" }, { itemId: otherItemId }, { artifactId: 0 }, { runId: "../10" }, { version: "3.3.0-beta" }]) {
      await expect(journal(fetchImpl).reserve({ ...candidate, ...changes })).rejects.toBeInstanceOf(TransportError);
    }
    await expect(journal(fetchImpl).record("10", "unknown" as never)).rejects.toMatchObject({ code: "INVALID_JOURNAL_PHASE" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(["owner/../repo", "owner/repo?query", "owner/..", "https://evil.test/owner/repo"])("rejects unsafe repository %s", (repo) => {
    expect(() => new GithubJournal({ repository: repo, itemId, token: githubToken, fetchImpl: queuedFetch() })).toThrow(TransportError);
  });
});

describe("pre-automation GitHub release version floor", () => {
  it("includes every page, including drafts and prereleases, without inventing hashes", async () => {
    const base = `https://api.github.com/repos/${repository}/releases`;
    const fetchImpl = queuedFetch(
      response([{ id: 1, tag_name: "v3.2.0", draft: false, prerelease: false }], 200, { link: `<${base}?per_page=100&page=2>; rel="next"` }),
      response([{ id: 2, tag_name: "3.3.0", draft: true }, { id: 3, tag_name: "v3.4.0.1", prerelease: true }]), response([]),
    );
    expect(await journal(fetchImpl).listReleaseVersions()).toEqual(["3.2.0", "3.3.0", "3.4.0.1"]);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([1, 2, 3].map((page) => `${base}?per_page=100&page=${page}`));
  });

  it.each(["v3.3.0-beta.1", "release-3.3.0", "vv3.3.0", "3.3.0.0.1", "v3.3.0\n", ""])("fails closed on unsupported release tag %s", async (tag_name) => {
    await expect(journal(queuedFetch(response([{ id: 1, tag_name }]))).listReleaseVersions()).rejects.toMatchObject({ code: "JOURNAL_UNSUPPORTED_RELEASE_TAG" });
  });

  it("leaves leading-zero and component-bound rejection to policy", async () => {
    expect(await journal(queuedFetch(response([{ id: 1, tag_name: "v03.65536.0" }]), response([]))).listReleaseVersions()).toEqual(["03.65536.0"]);
  });

  it("detects repeated release pages instead of returning truncated history", async () => {
    const release = { id: 1, tag_name: "v3.3.0" };
    await expect(journal(queuedFetch(response([release]), response([release]))).listReleaseVersions()).rejects.toMatchObject({ code: "JOURNAL_TRUNCATED_HISTORY" });
  });
});
