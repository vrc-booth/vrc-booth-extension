import { describe, expect, it } from "vitest";
import {
  assertReleaseIdentity, compareVersions, CwsPolicyError, HISTORY_PHASES,
  parseCandidateVersion, parseStoreVersion, planCwsRelease,
  type Candidate, type FetchStatus, type HistoryPhase, type HistoryRecord, type ItemRevisionStatus,
} from "../scripts/cws-policy.mjs";

// All inputs are fixtures. No credentials or network are needed by this policy.
const candidate: Candidate = {
  version: "3.3.0", commit: "a".repeat(40), sha256: "b".repeat(64), itemId: "c".repeat(32),
};
const revision = (state: ItemRevisionStatus["state"], ...versions: string[]): ItemRevisionStatus => ({
  state, distributionChannels: versions.map((crxVersion) => ({ crxVersion, deployPercentage: 100 })),
});
const status = (extra: Partial<FetchStatus> = {}): FetchStatus => ({
  name: `publishers/12345/items/${candidate.itemId}`, itemId: candidate.itemId,
  publishedItemRevisionStatus: revision("PUBLISHED", "3.2.0"), takenDown: false, warned: false, ...extra,
});
const record = (phase: HistoryPhase, extra: Partial<HistoryRecord> = {}): HistoryRecord => ({ ...candidate, phase, ...extra });
const input = (extra: Partial<Parameters<typeof planCwsRelease>[0]> = {}) => ({
  stage: "submit" as const, candidate, status: status(), history: [] as HistoryRecord[], historyTrusted: true, ...extra,
});
const planFor = (state: ItemRevisionStatus["state"], phase: HistoryPhase, stage: "submit" | "promote" = "submit") => planCwsRelease(input({
  stage, history: [record(phase)], status: status({ submittedItemRevisionStatus: revision(state, candidate.version) }),
}));
const identity = (extra: Partial<Parameters<typeof assertReleaseIdentity>[0]> = {}) => ({
  stage: "prepare" as const, candidate, packageVersion: candidate.version, manifestVersion: candidate.version,
  tag: `v${candidate.version}`, tagCommit: null, ...extra,
});
const code = (operation: () => unknown, expected: string) => {
  try { operation(); throw new Error("Expected the policy to block"); }
  catch (error) {
    expect(error).toBeInstanceOf(CwsPolicyError);
    expect((error as CwsPolicyError).code).toBe(expected);
  }
};

describe("strict Chrome numeric versions", () => {
  it.each(["1.0.0", "0.0.1", "65535.65535.65535"])("accepts canonical candidate %s", (value) => {
    expect(parseCandidateVersion(value)).toEqual([...value.split(".").map(Number), 0]);
  });
  it.each([
    "0.0.0", "1", "1.2", "1.2.3.0", "01.2.3", "1.02.3", "1.2.03", "65536.0.0",
    "1.2.65536", "-1.2.3", "+1.2.3", "1.2.3-beta", "1.2.3+build", "v1.2.3", "1.2.3\n",
    "1.2.3\r\n", " 1.2.3", "1.2.3 ", "١.٢.٣", "1e2.0.0", "999999999999999999999999.0.0", "",
  ])("rejects candidate %j", (value) => {
    code(() => parseCandidateVersion(value), "INVALID_VERSION");
  });
  it.each([null, undefined, 123, [], {}, true])("rejects a non-string candidate %j", (value) => {
    code(() => parseCandidateVersion(value), "INVALID_VERSION");
  });
  it.each([
    ["3", [3, 0, 0, 0]], ["3.3", [3, 3, 0, 0]], ["3.3.0", [3, 3, 0, 0]],
    ["3.3.0.7", [3, 3, 0, 7]], ["0.0.0.1", [0, 0, 0, 1]],
  ])("normalizes store version %s to four components", (value, expected) => {
    expect(parseStoreVersion(value)).toEqual(expected);
  });
  it.each(["0", "0.0", "0.0.0", "0.0.0.0", "1.2.3.4.5", "3.03", "3.3.0.65536", "3.3.0.1\n", "3..1", "3.3.0-beta"])("rejects malformed store version %j", (value) => {
    code(() => parseStoreVersion(value), "INVALID_VERSION");
  });
  it("compares numerically, including the fourth component and short-form equality", () => {
    expect(compareVersions("3.10.0", "3.9.65535.65535")).toBe(1);
    expect(compareVersions("3.3.0", "3.3.0.1")).toBe(-1);
    expect(compareVersions("3.3.0", "3.3")).toBe(0);
    expect(compareVersions("3.3.0", "3.3.0.0")).toBe(0);
    expect(compareVersions("3.3.1", "3.3.0.65535")).toBe(1);
  });
});

describe("candidate artifact and tag identity", () => {
  it("requires an absent tag only during preparation", () => {
    expect(assertReleaseIdentity(identity())).toBe(candidate);
    code(() => assertReleaseIdentity(identity({ tagCommit: candidate.commit })), "TAG_MISMATCH");
    code(() => assertReleaseIdentity(identity({ tagCommit: undefined as never })), "TAG_MISMATCH");
  });
  it.each(["submit", "promote"] as const)("requires the exact existing immutable tag for %s", (stage) => {
    expect(assertReleaseIdentity(identity({ stage, tagCommit: candidate.commit }))).toBe(candidate);
    code(() => assertReleaseIdentity(identity({ stage })), "TAG_MISMATCH");
    code(() => assertReleaseIdentity(identity({ stage, tagCommit: "d".repeat(40) })), "TAG_MISMATCH");
  });
  it.each([
    { packageVersion: "3.3.1" }, { manifestVersion: "3.3.0.0" }, { tag: "3.3.0" }, { tag: "v3.3.1" },
  ])("blocks mismatched package, packaged manifest or tag %j", (extra) => {
    expect(() => assertReleaseIdentity(identity(extra))).toThrow(CwsPolicyError);
  });
  it.each([
    { commit: "abc" }, { commit: "A".repeat(40) }, { commit: `${candidate.commit}\n` },
    { sha256: "b".repeat(63) }, { sha256: "B".repeat(64) }, { sha256: `${candidate.sha256}\n` },
    { itemId: "q".repeat(32) }, { itemId: `${candidate.itemId}\n` }, { itemId: "../other" },
  ])("blocks malformed artifact identity %j", (extra) => {
    code(() => assertReleaseIdentity(identity({ candidate: { ...candidate, ...extra } })), "IDENTITY_MISMATCH");
  });
  it("rejects unknown release stages", () => {
    expect(() => assertReleaseIdentity(identity({ stage: "publish" as never }))).toThrow();
    expect(() => planCwsRelease(input({ stage: "publish" as never }))).toThrow();
  });
});

describe("all-channel and complete-history monotonicity", () => {
  it("allows a new version after all store and durable attempt versions", () => {
    const plan = planCwsRelease(input({
      status: status({ publishedItemRevisionStatus: revision("PUBLISHED", "3.1.0", "3.2.0.65535") }),
      history: [record("failed", { version: "3.2.1" })],
    }));
    expect(plan.action).toBe("upload");
    expect(plan.reason).toContain("STAGED_PUBLISH");
  });
  it("accepts a known unpublished item with a trusted empty ledger", () => {
    expect(planCwsRelease(input({ status: status({ publishedItemRevisionStatus: undefined }) })).action).toBe("upload");
  });
  it.each(["publishedItemRevisionStatus", "submittedItemRevisionStatus"] as const)("checks every %s distribution channel, not just the first", (key) => {
    code(() => planCwsRelease(input({ status: status({ [key]: revision(key === "publishedItemRevisionStatus" ? "PUBLISHED" : "STAGED", "3.2.0", "3.3.0.1") }) })), "NON_MONOTONIC");
  });
  it("checks every durable record, including failed higher attempts", () => {
    code(() => planCwsRelease(input({ history: [record("failed", { version: "3.3.0.1" }), record("published", { version: "3.2.0" })] })), "NON_MONOTONIC");
  });
  it.each(["garbage", "03.2.0", "3.2.0.65536"])("rejects malformed historical version %j", (version) => {
    code(() => planCwsRelease(input({ history: [record("published", { version })] })), "INVALID_VERSION");
    code(() => planCwsRelease(input({ status: status({ publishedItemRevisionStatus: revision("PUBLISHED", "3.2.0", version) }) })), "INVALID_VERSION");
  });
  it("does not interpret unreadable or untrusted history as empty", () => {
    code(() => planCwsRelease(input({ historyTrusted: false })), "INVALID_HISTORY");
    code(() => planCwsRelease(input({ history: undefined as never })), "INVALID_HISTORY");
    code(() => planCwsRelease(input({ historyTrusted: undefined as never })), "INVALID_HISTORY");
  });
  it.each([
    { phase: "unknown" }, { itemId: "d".repeat(32) }, { commit: "invalid" }, { sha256: "invalid" },
  ])("blocks malformed or mismatched durable record %j", (extra) => {
    expect(() => planCwsRelease(input({ history: [{ ...record("prepared"), ...extra } as HistoryRecord] }))).toThrow();
  });
  it.each([{ commit: "d".repeat(40) }, { sha256: "d".repeat(64) }])("rejects same version with another identity %j", (extra) => {
    code(() => planCwsRelease(input({ history: [record("prepared", extra)] })), "IDENTITY_MISMATCH");
  });
  it("also detects identity conflicts in older normalized history versions", () => {
    code(() => planCwsRelease(input({ history: [
      record("submitted", { version: "3.2.0" }), record("published", { version: "3.2.0.0", sha256: "d".repeat(64) }),
    ] })), "INVALID_HISTORY");
  });
  it("compares every GitHub release, including older releases without journal records", () => {
    expect(planCwsRelease(input({ releaseVersions: ["3", "3.2", "3.2.0", "3.2.1.65535"] })).action).toBe("upload");
    code(() => planCwsRelease(input({ releaseVersions: ["3.4.0", "3.2.0"] })), "NON_MONOTONIC");
    code(() => planCwsRelease(input({ releaseVersions: ["3.3.0.1"] })), "NON_MONOTONIC");
  });
  it.each([null, "3.2.0", ["unknown"], ["v3.2.0"], ["03.2.0"], ["3.2.0.0.0"], ["3.2.0\n"]])("rejects malformed release history %j", (releaseVersions) => {
    expect(() => planCwsRelease(input({ releaseVersions: releaseVersions as never }))).toThrow(CwsPolicyError);
  });
  it("does not treat a GitHub release version as sufficient artifact identity", () => {
    code(() => planCwsRelease(input({ releaseVersions: [candidate.version] })), "UNTRUSTED_RESUME");
    code(() => planCwsRelease(input({ releaseVersions: ["3.3.0.0"] })), "UNTRUSTED_RESUME");
    code(() => planCwsRelease(input({ releaseVersions: [candidate.version], history: [record("prepared")] })), "UNTRUSTED_RESUME");
  });
  it.each(["PENDING_REVIEW", "STAGED", "PUBLISHED"] as const)("allows an equal GitHub release floor only for trusted observed %s resume", (state) => {
    const remote = state === "PUBLISHED"
      ? status({ publishedItemRevisionStatus: revision(state, candidate.version) })
      : status({ submittedItemRevisionStatus: revision(state, candidate.version) });
    const plan = planCwsRelease(input({ stage: "promote", releaseVersions: [candidate.version], history: [record("submitted")], status: remote }));
    expect(plan.action).toBe({ PENDING_REVIEW: "wait", STAGED: "promote", PUBLISHED: "already_done" }[state]);
  });
});

describe("store state fail-closed parsing", () => {
  it.each(["REJECTED", "CANCELLED", "PUBLISHED_TO_TESTERS", "ITEM_STATE_UNSPECIFIED", "UNKNOWN_NEW_STATE", "DRAFT"])("blocks item state %s", (state) => {
    expect(() => planCwsRelease(input({ status: status({ submittedItemRevisionStatus: revision(state as never, "3.2.1") }) }))).toThrow(CwsPolicyError);
  });
  it.each(["IN_PROGRESS", "UPLOAD_IN_PROGRESS", "FAILED", "UPLOAD_STATE_UNSPECIFIED", "UNKNOWN_NEW_STATE", null])("blocks unresolved or unknown upload state %j", (lastAsyncUploadState) => {
    expect(() => planCwsRelease(input({ status: status({ lastAsyncUploadState: lastAsyncUploadState as never }) }))).toThrow(CwsPolicyError);
  });
  it.each([undefined, "SUCCEEDED", "NOT_FOUND"])("permits a fresh upload with benign historical async state %j", (lastAsyncUploadState) => {
    expect(planCwsRelease(input({ status: status({ lastAsyncUploadState: lastAsyncUploadState as never }) })).action).toBe("upload");
  });
  it.each(["takenDown", "warned"])("blocks true or malformed %s flags", (flag) => {
    for (const value of [true, "false", 0, null, {}, []]) {
      code(() => planCwsRelease(input({ status: status({ [flag]: value }) })), "REMOTE_CONFLICT");
    }
  });
  it("accepts omitted false protobuf flags", () => {
    expect(planCwsRelease(input({ status: status({ warned: undefined, takenDown: undefined }) })).action).toBe("upload");
  });
  it.each([
    { itemId: "d".repeat(32) }, { name: `publishers/12345/items/${"d".repeat(32)}` }, { name: "other" },
  ])("blocks wrong or malformed response identity %j", (extra) => {
    code(() => planCwsRelease(input({ status: status(extra) })), "IDENTITY_MISMATCH");
  });
  it.each([
    null, {}, { state: "PUBLISHED" }, { state: "PUBLISHED", distributionChannels: [] },
    { state: "PUBLISHED", distributionChannels: [{}] }, { state: "PUBLISHED", distributionChannels: [null] },
    { state: "PUBLISHED", distributionChannels: [{ crxVersion: "3.2.0", deployPercentage: -1 }] },
    { state: "PUBLISHED", distributionChannels: [{ crxVersion: "3.2.0", deployPercentage: 101 }] },
  ])("blocks malformed revision %j", (publishedItemRevisionStatus) => {
    expect(() => planCwsRelease(input({ status: status({ publishedItemRevisionStatus: publishedItemRevisionStatus as never }) }))).toThrow(CwsPolicyError);
  });
  it("rejects pending review in the published revision slot", () => {
    code(() => planCwsRelease(input({ status: status({ publishedItemRevisionStatus: revision("PENDING_REVIEW", "3.2.0") }) })), "REMOTE_CONFLICT");
  });
});

describe("idempotent submit and promote plans", () => {
  it("permits an exact prepared reservation to make its first upload", () => {
    expect(planCwsRelease(input({ history: [record("prepared")] })).action).toBe("upload");
  });
  it.each(["PENDING_REVIEW", "STAGED"] as const)("leaves another candidate's %s revision untouched", (state) => {
    code(() => planCwsRelease(input({ status: status({ submittedItemRevisionStatus: revision(state, "3.2.1") }) })), "REMOTE_CONFLICT");
  });
  it.each(["submit", "promote"] as const)("waits during exact-candidate review on %s reruns", (stage) => {
    expect(planFor("PENDING_REVIEW", "submitted", stage).action).toBe("wait");
  });
  it("treats an exact staged candidate as submit complete and promotes it without uploading", () => {
    expect(planFor("STAGED", "submitted").action).toBe("already_done");
    expect(planFor("STAGED", "staged", "promote")).toEqual({
      action: "promote", reason: expect.stringContaining("DEFAULT_PUBLISH"),
    });
  });
  it.each(["submit", "promote"] as const)("does nothing when the exact candidate is publicly published (%s)", (stage) => {
    expect(planCwsRelease(input({ stage, history: [record("promote_started")], status: status({
      publishedItemRevisionStatus: revision("PUBLISHED", "3.3", "3.3.0.0"),
    }) })).action).toBe("already_done");
  });
  it.each(["PENDING_REVIEW", "STAGED", "PUBLISHED"] as const)("never infers candidate identity from store version alone (%s)", (state) => {
    const remote = state === "PUBLISHED"
      ? status({ publishedItemRevisionStatus: revision(state, candidate.version) })
      : status({ submittedItemRevisionStatus: revision(state, candidate.version) });
    code(() => planCwsRelease(input({ status: remote })), "UNTRUSTED_RESUME");
    code(() => planCwsRelease(input({ status: remote, history: [record("prepared")] })), "UNTRUSTED_RESUME");
  });
  it("uses trusted submit_started evidence to reconcile an ambiguous submission response", () => {
    expect(planFor("PENDING_REVIEW", "submit_started").action).toBe("wait");
  });
  it("never promotes a version absent from STAGED", () => {
    code(() => planCwsRelease(input({ stage: "promote" })), "NOT_STAGED");
  });
  it.each(["upload_started", "upload_succeeded", "upload_uncertain", "submit_started", "submitted", "staged", "promote_started", "published", "failed"] as const)("blocks blind replay after %s without a matching submitted revision", (phase) => {
    code(() => planCwsRelease(input({ history: [record(phase)] })), "RECONCILIATION_REQUIRED");
  });
  it.each([undefined, "SUCCEEDED", "NOT_FOUND"])("never converts uncertain upload into publish permission from async status %j", (lastAsyncUploadState) => {
    code(() => planCwsRelease(input({ history: [record("upload_uncertain")], status: status({ lastAsyncUploadState: lastAsyncUploadState as never }) })), "RECONCILIATION_REQUIRED");
  });
  it("never auto-recovers an uncertain upload even when a version-equal submission appears", () => {
    code(() => planFor("STAGED", "upload_uncertain", "promote"), "RECONCILIATION_REQUIRED");
  });
  it("does not trust a later phase to erase an earlier uncertain attempt", () => {
    code(() => planCwsRelease(input({ history: [record("upload_uncertain"), record("submitted")], status: status({ submittedItemRevisionStatus: revision("STAGED", candidate.version) }) })), "RECONCILIATION_REQUIRED");
  });
  it("blocks a mixed staged revision even when one channel matches", () => {
    code(() => planCwsRelease(input({ stage: "promote", history: [record("staged")], status: status({ submittedItemRevisionStatus: revision("STAGED", "3.2.0", candidate.version) }) })), "REMOTE_CONFLICT");
  });
  it("does not claim complete for a partially rolled-out mixed public revision", () => {
    code(() => planCwsRelease(input({ history: [record("published")], status: status({ publishedItemRevisionStatus: revision("PUBLISHED", "3.2.0", candidate.version) }) })), "RECONCILIATION_REQUIRED");
  });
  it.each(["PENDING_REVIEW", "STAGED"] as const)("rejects state regression after recorded publication (%s)", (state) => {
    code(() => planFor(state, "published", "promote"), "RECONCILIATION_REQUIRED");
  });
  it("has no mutation, cancel, rebuild, downgrade, or generic publish action", () => {
    const actions = [planCwsRelease(input()).action, planFor("PENDING_REVIEW", "submitted").action,
      planFor("STAGED", "staged").action, planFor("STAGED", "staged", "promote").action];
    expect(actions).toEqual(["upload", "wait", "already_done", "promote"]);
    expect(Object.isFrozen(HISTORY_PHASES)).toBe(true);
  });
});


it("blocks stale STAGED after a recorded promotion attempt", () => {
  expect(() => planCwsRelease(input({ stage: "promote", history: [record("promote_started")],
    status: status({ submittedItemRevisionStatus: revision("STAGED", candidate.version) }) }))).toThrow();
});
