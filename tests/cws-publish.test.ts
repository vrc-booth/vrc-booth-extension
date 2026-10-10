import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { executeRelease, assertActivation, assertEnvironmentApproval, assertTagHistory, ITEM_ID, REPOSITORY } from "../scripts/cws-publish.mjs";
import { TransportError } from "../scripts/cws-client.mjs";

const bytes = Buffer.from("synthetic verified ZIP bytes");
const candidate = { version: "3.3.0", commit: "1".repeat(40), sha256: createHash("sha256").update(bytes).digest("hex"), itemId: ITEM_ID, artifactId: "20", runId: "30" };
const name = `publishers/fixture/items/${ITEM_ID}`;
const revision = (state: string, version: string) => ({ state, distributionChannels: [{ crxVersion: version, deployPercentage: 100 }] });
const prior = { name, itemId: ITEM_ID, publishedItemRevisionStatus: revision("PUBLISHED", "2.1.0") };
const current = (state: string) => ({ ...prior, submittedItemRevisionStatus: revision(state, candidate.version) });
const identity = { packageVersion: "3.3.0", manifestVersion: "3.3.0", tag: "v3.3.0", tagCommit: candidate.commit };
function fixture(stage = "submit", initial: any[] = [], status: any = prior) {
  const records = initial.map(entry => ({ ...entry }));
  const calls: string[] = [];
  const client = {
    fetchStatus: vi.fn(async () => { calls.push("status"); return status; }),
    upload: vi.fn(async () => { calls.push("upload"); return { name, itemId: ITEM_ID, uploadState: "SUCCEEDED", crxVersion: candidate.version }; }),
    publish: vi.fn(async (type: string) => { calls.push(type); return { name, itemId: ITEM_ID, state: stage === "promote" ? "PUBLISHED" : "PENDING_REVIEW" }; }),
  };
  const journal = {
    list: vi.fn(async () => records.map(entry => ({ ...entry }))),
    listReleaseVersions: vi.fn(async () => ["2.1.0"]),
    reserve: vi.fn(async (value: any) => { const entry = { ...value, id: "10", phase: "prepared" }; records.push(entry); calls.push("reserve"); return { ...entry }; }),
    record: vi.fn(async (id: string, phase: string) => { calls.push(phase); const entry = records.find(value => value.id === id)!; entry.phase = phase; return { ...entry }; }),
  };
  return { client, journal, calls, records, options: { enabled: true, stage, candidate, identity, zipBytes: bytes, client, journal } };
}

describe("guarded CWS orchestration with no live requests", () => {
  it("is disabled before any status, history or store call", async () => {
    const f = fixture();
    await expect(executeRelease({ ...f.options, enabled: false })).rejects.toThrow("automation_disabled");
    expect(f.client.fetchStatus).not.toHaveBeenCalled(); expect(f.journal.list).not.toHaveBeenCalled();
  });
  it("rejects altered bytes before reading store status", async () => {
    const f = fixture();
    await expect(executeRelease({ ...f.options, zipBytes: Buffer.from("changed") })).rejects.toThrow("artifact_hash_mismatch");
    expect(f.client.fetchStatus).not.toHaveBeenCalled();
  });
  it("records each phase before exactly one upload and staged submission", async () => {
    const f = fixture();
    await expect(executeRelease(f.options)).resolves.toMatchObject({ action: "submitted" });
    expect(f.calls).toEqual(["status", "reserve", "upload_started", "upload", "upload_succeeded", "status", "submit_started", "STAGED_PUBLISH", "submitted"]);
    expect(f.client.upload).toHaveBeenCalledOnce();
    expect(f.client.publish).toHaveBeenCalledWith("STAGED_PUBLISH");
  });
  it("promotes a proven staged package without uploading or rebuilding", async () => {
    const f = fixture("promote", [{ ...candidate, id: "10", phase: "staged" }], current("STAGED"));
    await expect(executeRelease(f.options)).resolves.toMatchObject({ action: "published" });
    expect(f.client.upload).not.toHaveBeenCalled(); expect(f.journal.reserve).not.toHaveBeenCalled();
    expect(f.client.publish).toHaveBeenCalledWith("DEFAULT_PUBLISH");
  });
  it("waits for the same exact pending review without writing", async () => {
    const f = fixture("submit", [{ ...candidate, id: "10", phase: "submitted" }], current("PENDING_REVIEW"));
    await expect(executeRelease(f.options)).resolves.toMatchObject({ action: "wait" });
    expect(f.client.upload).not.toHaveBeenCalled(); expect(f.client.publish).not.toHaveBeenCalled();
    expect(f.journal.record).not.toHaveBeenCalled();
  });
  it("blocks a different pending submission", async () => {
    const f = fixture("submit", [], { ...prior, submittedItemRevisionStatus: revision("PENDING_REVIEW", "3.2.0") });
    await expect(executeRelease(f.options)).rejects.toThrow();
    expect(f.client.upload).not.toHaveBeenCalled(); expect(f.journal.reserve).not.toHaveBeenCalled();
  });
  it("does not mutate the store if durable reservation fails", async () => {
    const f = fixture(); f.journal.reserve.mockRejectedValue(new Error("ledger unavailable"));
    await expect(executeRelease(f.options)).rejects.toThrow();
    expect(f.client.upload).not.toHaveBeenCalled();
  });
  it("does not mutate the store if the write-ahead phase cannot be recorded", async () => {
    const f = fixture(); f.journal.record.mockRejectedValue(new Error("ledger unavailable"));
    await expect(executeRelease(f.options)).rejects.toThrow();
    expect(f.client.upload).not.toHaveBeenCalled();
  });
  it("never retries an upload whose response was lost", async () => {
    const f = fixture(); f.client.upload.mockRejectedValue(new TransportError("network", { uncertain: true }));
    await expect(executeRelease(f.options)).rejects.toThrow("upload_outcome_unknown_reconcile_manually");
    expect(f.client.upload).toHaveBeenCalledOnce(); expect(f.client.publish).not.toHaveBeenCalled();
    expect(f.records[0].phase).toBe("upload_uncertain");
  });
  it.each(["IN_PROGRESS", "UPLOAD_IN_PROGRESS", "FAILED", "NOT_FOUND", "UPLOAD_STATE_UNSPECIFIED"])("does not publish an unproven %s upload", async (state) => {
    const f = fixture(); f.client.upload.mockResolvedValue({ name, itemId: ITEM_ID, uploadState: state, crxVersion: "3.3.0" });
    await expect(executeRelease(f.options)).rejects.toThrow("draft_identity_not_proven");
    expect(f.client.publish).not.toHaveBeenCalled(); expect(f.records[0].phase).toBe("upload_uncertain");
  });
  it("blocks an unexpected upload version", async () => {
    const f = fixture(); f.client.upload.mockResolvedValue({ name, itemId: ITEM_ID, uploadState: "SUCCEEDED", crxVersion: "9.0.0" });
    await expect(executeRelease(f.options)).rejects.toThrow("draft_identity_not_proven");
    expect(f.client.publish).not.toHaveBeenCalled();
  });
  it("recovers a lost submission response by status inspection, never by a second POST", async () => {
    const f = fixture();
    f.client.fetchStatus.mockResolvedValueOnce(prior).mockResolvedValueOnce(prior).mockResolvedValue(current("PENDING_REVIEW"));
    f.client.publish.mockRejectedValue(new TransportError("network", { uncertain: true }));
    await expect(executeRelease(f.options)).resolves.toMatchObject({ action: "wait" });
    expect(f.client.publish).toHaveBeenCalledOnce();
    expect(f.records[0].phase).toBe("submit_started");
  });
  it("halts when a lost submission response cannot be reconciled", async () => {
    const f = fixture(); f.client.publish.mockRejectedValue(new TransportError("network", { uncertain: true }));
    await expect(executeRelease(f.options)).rejects.toThrow("submission_outcome_unknown_reconcile_manually");
    expect(f.client.publish).toHaveBeenCalledOnce();
  });
  it("does not reuse a version with different recorded artifact bytes", async () => {
    const f = fixture("submit", [{ ...candidate, id: "10", sha256: "f".repeat(64), phase: "prepared" }]);
    await expect(executeRelease(f.options)).rejects.toThrow();
    expect(f.client.upload).not.toHaveBeenCalled();
  });
});

describe("disabled activation and explicit environment approval", () => {
  const valid = { CWS_AUTOMATION_ENABLED: "true", GITHUB_ACTIONS: "true", GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF: "refs/heads/main", CWS_ITEM_ID: ITEM_ID, CWS_CONFIRM_ITEM_ID: ITEM_ID, CWS_PUBLISHER_ID: "publisher", GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1" };
  it("requires explicit activation and the existing item", () => {
    expect(() => assertActivation({})).toThrow("automation_disabled");
    expect(() => assertActivation(valid)).not.toThrow();
    expect(() => assertActivation({ ...valid, GITHUB_RUN_ATTEMPT: "2" })).toThrow("fresh_manual_dispatch_required");
    expect(() => assertActivation({ ...valid, GITHUB_REF: "refs/heads/dev" })).toThrow();
    expect(() => assertActivation({ ...valid, CWS_CONFIRM_ITEM_ID: "other" })).toThrow();
  });
  it("requires an actual environment approval history, not a newly auto-created environment", () => {
    expect(() => assertEnvironmentApproval([])).toThrow();
    expect(() => assertEnvironmentApproval([{ state: "approved", environments: [{ name: "chrome-web-store" }] }])).not.toThrow();
    expect(() => assertEnvironmentApproval([{ state: "approved", environments: [{ name: "other" }] }])).toThrow();
    expect(() => assertEnvironmentApproval([{ state: "rejected", environments: [{ name: "chrome-web-store" }] }])).toThrow();
  });
});

describe("publication workflow stays opt-in and promotes immutable files", () => {
  const workflow = readFileSync(new URL("../.github/workflows/chrome-web-store.yml", import.meta.url), "utf8");
  const prepare = readFileSync(new URL("../.github/workflows/prepare-chrome-release.yml", import.meta.url), "utf8");
  it("has only manual triggers and an item-wide non-cancelling lock", () => {
    expect(workflow).toContain("workflow_dispatch:"); expect(workflow.split("permissions:")[0]).not.toMatch(/^  (push|pull_request|release):/m);
    expect(workflow).toContain("group: chrome-web-store-item-${{ vars.CWS_ITEM_ID }}");
    expect(workflow).toContain("cancel-in-progress: false"); expect(workflow).toContain('test "$ENABLED" = true');
    expect(workflow).toContain("environment: chrome-web-store");
    expect(workflow.match(/test "\$GITHUB_RUN_ATTEMPT" = 1/g)).toHaveLength(2);
  });
  it("validates artifact and real environment approval before obtaining the short-lived token", () => {
    expect(workflow.indexOf("assertEnvironmentApproval")).toBeLessThan(workflow.indexOf("google-github-actions/auth@"));
    expect(workflow.indexOf("scripts/cws-artifact.py verify")).toBeLessThan(workflow.indexOf("google-github-actions/auth@"));
    expect(workflow).toContain("create_credentials_file: false"); expect(workflow).toContain("export_environment_variables: false");
  });
  it("never rebuilds, creates a tag, cancels a submission, or deploys Firefox during promotion", () => {
    expect(workflow).not.toMatch(/bun |pnpm |npm |wxt |git push|git tag|cancelSubmission|setPublishedDeployPercentage|web-ext sign/);
    expect(prepare).toContain('test "$CANDIDATE_SHA" = "$GITHUB_SHA"');
    expect(prepare).toContain("--chrome-only --release-ready");
  });
});


it("does not replay a timed-out promotion while the store still reports STAGED", async () => {
  const f = fixture("promote", [{ ...candidate, id: "10", phase: "staged" }], current("STAGED"));
  f.client.publish.mockRejectedValue(new TransportError("network", { uncertain: true }));
  await expect(executeRelease(f.options)).rejects.toThrow("submission_outcome_unknown_reconcile_manually");
  expect(f.records[0].phase).toBe("promote_started");
  await expect(executeRelease(f.options)).rejects.toThrow();
  expect(f.client.publish).toHaveBeenCalledOnce();
});


it("does not replace a previously bound preparation run even if inner ZIP bytes match", async () => {
  const f = fixture("promote", [{ ...candidate, id: "10", phase: "staged", artifactId: "999" }], current("STAGED"));
  await expect(executeRelease(f.options)).rejects.toThrow("artifact_provenance_changed");
  expect(f.client.publish).not.toHaveBeenCalled();
});

it("requires the candidate to exceed prior version tags without mistaking its own exact tag for a prior release", () => {
  expect(() => assertTagHistory(["v2.1.0", "v3.3.0", "documentation"], "3.3.0", "v3.3.0")).not.toThrow();
  expect(() => assertTagHistory(["3.3.0", "v3.3.0"], "3.3.0", "v3.3.0")).toThrow();
  expect(() => assertTagHistory(["v3.4.0"], "3.3.0", "v3.3.0")).toThrow();
  expect(() => assertTagHistory(["v3.3.0-rc.1"], "3.3.0", "v3.3.0")).toThrow();
});
