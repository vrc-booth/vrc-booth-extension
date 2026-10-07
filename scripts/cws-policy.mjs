// Pure, fail-closed policy. This module performs no I/O and cannot publish anything.
// API schema: https://developer.chrome.com/docs/webstore/api/reference/rest/v2/publishers.items/fetchStatus
// History is an authenticated, complete, append-only ledger supplied by the caller,
// oldest first. A version in fetchStatus is NOT proof of a draft's artifact identity.

export class CwsPolicyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CwsPolicyError";
    this.code = code;
  }
}

function requireThat(condition, code, message) {
  if (!condition) throw new CwsPolicyError(code, message);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseVersion(value, candidate) {
  const pattern = candidate
    ? /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/
    : /^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,3}$/;
  // Comparing the whole match also rejects a trailing newline ($ alone does not).
  requireThat(typeof value === "string" && value.match(pattern)?.[0] === value,
    "INVALID_VERSION", candidate ? "Candidate version must be canonical numeric x.y.z" : "Store/history version must have one to four canonical numeric components");
  const parts = value.split(".").map(Number);
  requireThat(parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 65535),
    "INVALID_VERSION", "Every extension version component must be between 0 and 65535");
  requireThat(parts.some((part) => part !== 0), "INVALID_VERSION", "An extension version cannot be all zero");
  return [...parts, ...Array(4 - parts.length).fill(0)];
}

export function parseCandidateVersion(value) {
  return parseVersion(value, true);
}

export function parseStoreVersion(value) {
  return parseVersion(value, false);
}

export function compareVersions(a, b) {
  const left = parseStoreVersion(a);
  const right = parseStoreVersion(b);
  for (let index = 0; index < 4; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

function validateArtifact(candidate, versionParser = parseCandidateVersion) {
  requireThat(object(candidate), "IDENTITY_MISMATCH", "A candidate artifact record is required");
  versionParser(candidate.version);
  requireThat(typeof candidate.commit === "string" && candidate.commit.length === 40 && /^[a-f0-9]{40}$/.test(candidate.commit),
    "IDENTITY_MISMATCH", "Candidate commit must be a full lowercase 40-character SHA");
  requireThat(typeof candidate.sha256 === "string" && candidate.sha256.length === 64 && /^[a-f0-9]{64}$/.test(candidate.sha256),
    "IDENTITY_MISMATCH", "Candidate sha256 must be a full lowercase artifact digest");
  requireThat(typeof candidate.itemId === "string" && candidate.itemId.length === 32 && /^[a-p]{32}$/.test(candidate.itemId),
    "IDENTITY_MISMATCH", "Candidate itemId must be a Chrome extension ID");
}

export function assertReleaseIdentity({ stage, candidate, packageVersion, manifestVersion, tag, tagCommit }) {
  requireThat(["prepare", "submit", "promote"].includes(stage), "IDENTITY_MISMATCH", "Unknown release stage");
  validateArtifact(candidate);
  requireThat(packageVersion === candidate.version && manifestVersion === candidate.version,
    "IDENTITY_MISMATCH", "Candidate, package.json, and packaged manifest versions must match exactly");
  requireThat(tag === `v${candidate.version}`, "TAG_MISMATCH", "Release tag must be the exact vX.Y.Z candidate tag");
  if (stage === "prepare") {
    requireThat(tagCommit === null, "TAG_MISMATCH", "Prepare requires a verified absent tag; never overwrite a release tag");
  } else {
    requireThat(tagCommit === candidate.commit, "TAG_MISMATCH", "Submit/promote requires the existing tag to resolve to the exact candidate commit");
  }
  return candidate;
}

export const HISTORY_PHASES = Object.freeze([
  "prepared", "upload_started", "upload_succeeded", "upload_uncertain",
  "submit_started", "submitted", "staged", "promote_started", "published", "failed",
]);

const ITEM_STATES = new Set([
  "ITEM_STATE_UNSPECIFIED", "PENDING_REVIEW", "STAGED", "PUBLISHED",
  "PUBLISHED_TO_TESTERS", "REJECTED", "CANCELLED",
]);
const UPLOAD_STATES = new Set([
  "UPLOAD_STATE_UNSPECIFIED", "SUCCEEDED", "IN_PROGRESS", "FAILED", "NOT_FOUND",
]);
const SUBMISSION_PHASES = new Set(["submit_started", "submitted", "staged", "promote_started", "published"]);

function validateHistory(history, historyTrusted, candidate) {
  requireThat(historyTrusted === true && Array.isArray(history), "INVALID_HISTORY",
    "A complete, trusted durable attempt history is required; unavailable history must not become an empty list");
  const identities = new Map();
  for (const entry of history) {
    validateArtifact(entry, parseStoreVersion);
    requireThat(entry.itemId === candidate.itemId, "INVALID_HISTORY", "History contains a different item ID");
    requireThat(HISTORY_PHASES.includes(entry.phase), "INVALID_HISTORY", "History contains an unknown attempt phase");
    const key = parseStoreVersion(entry.version).join(".");
    const prior = identities.get(key);
    requireThat(!prior || (prior.commit === entry.commit && prior.sha256 === entry.sha256),
      "INVALID_HISTORY", "History binds the same version to different artifacts or commits");
    identities.set(key, entry);
    const comparison = compareVersions(candidate.version, entry.version);
    requireThat(comparison >= 0, "NON_MONOTONIC", "Candidate must be newer than every other durable attempt version");
    if (comparison === 0) {
      requireThat(entry.commit === candidate.commit && entry.sha256 === candidate.sha256,
        "IDENTITY_MISMATCH", "The same version was already attempted with a different artifact or commit");
    }
  }
  return history.filter((entry) => compareVersions(entry.version, candidate.version) === 0);
}

function validateRevision(revision, label) {
  if (revision === undefined) return undefined; // Documented unset revision.
  requireThat(object(revision), "UNKNOWN_STATE", `${label} revision is malformed`);
  requireThat(ITEM_STATES.has(revision.state) && revision.state !== "ITEM_STATE_UNSPECIFIED",
    "UNKNOWN_STATE", `${label} revision has an unknown or unspecified item state`);
  requireThat(Array.isArray(revision.distributionChannels) && revision.distributionChannels.length > 0,
    "UNKNOWN_STATE", `${label} revision has no verifiable distribution channel versions`);
  for (const channel of revision.distributionChannels) {
    requireThat(object(channel), "UNKNOWN_STATE", `${label} distribution channel is malformed`);
    parseStoreVersion(channel.crxVersion);
    if (channel.deployPercentage !== undefined) {
      requireThat(Number.isInteger(channel.deployPercentage) && channel.deployPercentage >= 0 && channel.deployPercentage <= 100,
        "UNKNOWN_STATE", `${label} distribution percentage is malformed`);
    }
  }
  return revision;
}

function validateStatus(status, candidate) {
  requireThat(object(status), "UNKNOWN_STATE", "A fresh V2 fetchStatus response is required");
  requireThat(status.itemId === candidate.itemId && typeof status.name === "string" &&
    /^publishers\/[^/\s]+\/items\/[a-p]{32}$/.test(status.name) &&
    status.name.endsWith(`/items/${candidate.itemId}`),
  "IDENTITY_MISMATCH", "Store status does not identify the candidate item");
  for (const flag of ["takenDown", "warned"]) {
    // Protobuf JSON may omit false defaults. A malformed value must never be truthy-coerced.
    requireThat(status[flag] === undefined || status[flag] === false, "REMOTE_CONFLICT", `Store ${flag} flag blocks the release`);
  }
  if (status.lastAsyncUploadState !== undefined) {
    requireThat(UPLOAD_STATES.has(status.lastAsyncUploadState) && status.lastAsyncUploadState !== "UPLOAD_STATE_UNSPECIFIED",
      "UNKNOWN_STATE", "Unknown or unspecified async upload state; reconcile in the developer dashboard");
    requireThat(!["IN_PROGRESS", "FAILED"].includes(status.lastAsyncUploadState),
      "RECONCILIATION_REQUIRED", "An asynchronous upload is unresolved or failed; never publish based on fetchStatus alone");
  }
  const published = validateRevision(status.publishedItemRevisionStatus, "Published");
  const submitted = validateRevision(status.submittedItemRevisionStatus, "Submitted");
  if (published) {
    requireThat(["PUBLISHED", "PUBLISHED_TO_TESTERS"].includes(published.state),
      "REMOTE_CONFLICT", "Published revision has an inconsistent state");
  }
  for (const revision of [published, submitted].filter(Boolean)) {
    requireThat(!["REJECTED", "CANCELLED", "PUBLISHED_TO_TESTERS"].includes(revision.state),
      "REMOTE_CONFLICT", `Store state ${revision.state} requires manual reconciliation`);
  }
  return { published, submitted };
}

function plan(action, reason) {
  return { action, reason };
}

/**
 * A plan is permission for only the named next step, never a generic publish.
 * 'upload' allows a fresh, exact artifact upload in submit. The caller may request
 * STAGED_PUBLISH only after that same synchronous upload returns SUCCEEDED with
 * matching item/version. An async/timeout/crash gap always requires reconciliation.
 * 'promote' allows DEFAULT_PUBLISH of the existing STAGED revision, with no upload.
 */
export function planCwsRelease({ stage, candidate, status, history, historyTrusted, releaseVersions = [] }) {
  requireThat(["submit", "promote"].includes(stage), "IDENTITY_MISMATCH", "Use submit or promote for a store plan");
  validateArtifact(candidate);
  const matching = validateHistory(history, historyTrusted, candidate);
  requireThat(Array.isArray(releaseVersions), "INVALID_HISTORY", "Release-history versions must be a complete verified array");
  let sameVersionReleased = false;
  for (const version of releaseVersions) {
    parseStoreVersion(version);
    const comparison = compareVersions(candidate.version, version);
    requireThat(comparison >= 0, "NON_MONOTONIC", "Candidate must be newer than every other GitHub release version");
    sameVersionReleased ||= comparison === 0;
  }
  const { published, submitted } = validateStatus(status, candidate);
  const revisions = [published, submitted].filter(Boolean);
  for (const revision of revisions) {
    for (const channel of revision.distributionChannels) {
      requireThat(compareVersions(candidate.version, channel.crxVersion) >= 0,
        "NON_MONOTONIC", "Candidate must be newer than all published and submitted distribution channel versions");
    }
  }

  const exact = (revision) => Boolean(revision && revision.distributionChannels.every(
    (channel) => compareVersions(candidate.version, channel.crxVersion) === 0,
  ));
  const sameVersionVisible = revisions.some((revision) => revision.distributionChannels.some(
    (channel) => compareVersions(candidate.version, channel.crxVersion) === 0,
  ));
  const latest = matching.at(-1);
  const trustedSubmission = latest && SUBMISSION_PHASES.has(latest.phase);

  // A persisted uncertain upload is not repaired by a version-only status response.
  requireThat(!matching.some((entry) => ["upload_uncertain", "failed"].includes(entry.phase)),
    "RECONCILIATION_REQUIRED", "Candidate has an uncertain or failed attempt; reconcile the exact artifact manually");
  if (sameVersionVisible) {
    requireThat(trustedSubmission, "UNTRUSTED_RESUME", "Store version equality alone cannot prove candidate identity; trusted submission history is required");
  }
  if (submitted && ["PENDING_REVIEW", "STAGED"].includes(submitted.state)) {
    requireThat(exact(submitted), "REMOTE_CONFLICT", "Another candidate is pending review or staged; never cancel, overwrite, or replace it");
    requireThat(trustedSubmission, "UNTRUSTED_RESUME", "The submitted revision is not bound to this artifact by trusted history");
    requireThat(latest.phase !== "published" && latest.phase !== "promote_started",
      "RECONCILIATION_REQUIRED", "Submission state has regressed relative to durable history");
    if (submitted.state === "PENDING_REVIEW") {
      return plan("wait", "The exact candidate is pending review; leave it untouched");
    }
    return stage === "submit"
      ? plan("already_done", "The exact candidate is already approved and staged; promotion is separate")
      : plan("promote", "Promote only the exact existing STAGED candidate with DEFAULT_PUBLISH; do not rebuild or upload");
  }
  if (exact(published) && published.state === "PUBLISHED") {
    requireThat(!submitted || exact(submitted), "REMOTE_CONFLICT", "A different submitted revision prevents an idempotent completion");
    return plan("already_done", "The exact candidate is already published");
  }
  // A partially rolled-out or otherwise mixed revision is not an exact staged item.
  requireThat(!sameVersionVisible, "RECONCILIATION_REQUIRED", "Candidate appears in a mixed or inconsistent store revision; reconcile manually");
  requireThat(!submitted, "REMOTE_CONFLICT", "An existing submitted revision must be reconciled before another release");
  if (stage === "promote") {
    throw new CwsPolicyError("NOT_STAGED", "Promotion requires the exact candidate to be STAGED; it never uploads or rebuilds");
  }
  requireThat(matching.every((entry) => entry.phase === "prepared"), "RECONCILIATION_REQUIRED",
    "A prior upload/submission attempt lacks an exact submitted revision; fetchStatus cannot identify the draft artifact");
  requireThat(!sameVersionReleased, "UNTRUSTED_RESUME",
    "A GitHub release already uses this version; only a trusted exact-candidate store-state resume is permitted");
  return plan("upload", "Upload the exact immutable candidate once, then request STAGED_PUBLISH only after a verified synchronous success");
}
