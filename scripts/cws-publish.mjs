import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CwsClient, GithubJournal } from "./cws-client.mjs";
import { assertReleaseIdentity, compareVersions, parseStoreVersion, planCwsRelease } from "./cws-policy.mjs";

export const ITEM_ID = "hafbafjoecfjdlhjilpakabocglkaegj";
export const REPOSITORY = "vrc-booth/vrc-booth-extension";
export const APPROVAL_ENVIRONMENT = "chrome-web-store";

export class PublicationError extends Error {
  constructor(code) { super(code); this.name = "PublicationError"; this.code = code; }
}
const requireCondition = (condition, code) => { if (!condition) throw new PublicationError(code); };
const sameCandidate = (entry, candidate) => entry.itemId === candidate.itemId
  && entry.version === candidate.version && entry.commit === candidate.commit && entry.sha256 === candidate.sha256;

export function assertActivation(env) {
  requireCondition(env.CWS_AUTOMATION_ENABLED === "true", "automation_disabled");
  requireCondition(env.GITHUB_RUN_ATTEMPT === "1", "fresh_manual_dispatch_required");
  requireCondition(env.GITHUB_ACTIONS === "true" && env.GITHUB_REPOSITORY === REPOSITORY
    && env.GITHUB_REF === "refs/heads/main", "untrusted_workflow_context");
  requireCondition(env.CWS_ITEM_ID === ITEM_ID && env.CWS_CONFIRM_ITEM_ID === ITEM_ID, "item_confirmation_required");
  requireCondition(/^[A-Za-z0-9_-]{1,80}$/.test(env.CWS_PUBLISHER_ID ?? ""), "publisher_not_configured");
  requireCondition(/^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? ""), "workflow_run_required");
}

export function assertTagHistory(tags, version, currentTag) {
  requireCondition(Array.isArray(tags), "tag_history_missing");
  for (const tag of tags) {
    if (tag === currentTag || !/^v?[0-9]/.test(tag)) continue;
    const older = tag.startsWith("v") ? tag.slice(1) : tag;
    parseStoreVersion(older);
    requireCondition(compareVersions(version, older) > 0, "version_not_newer_than_tag_history");
  }
}

export function assertEnvironmentApproval(reviews) {
  requireCondition(Array.isArray(reviews), "invalid_approval_history");
  const decisions = reviews.filter((review) => Array.isArray(review.environments)
    && review.environments.some((environment) => environment.name === APPROVAL_ENVIRONMENT));
  requireCondition(decisions.length > 0 && decisions.some((review) => review.state === "approved")
    && !decisions.some((review) => review.state === "rejected"), "protected_environment_approval_required");
}

// No write is retried. A durable phase is recorded BEFORE each store mutation.
// Retry decisions always come from a fresh store status and complete history.
export async function executeRelease({ enabled, stage, candidate, identity, zipBytes, client, journal }) {
  requireCondition(enabled === true, "automation_disabled");
  assertReleaseIdentity({ stage, candidate, ...identity });
  requireCondition(createHash("sha256").update(zipBytes).digest("hex") === candidate.sha256, "artifact_hash_mismatch");
  const [status, history, releaseVersions] = await Promise.all([
    client.fetchStatus(), journal.list(), journal.listReleaseVersions(),
  ]);
  for (const entry of history.filter((item) => sameCandidate(item, candidate))) {
    requireCondition(String(entry.artifactId) === String(candidate.artifactId)
      && String(entry.runId) === String(candidate.runId), "artifact_provenance_changed");
  }
  const plan = planCwsRelease({ stage, candidate, status, history, releaseVersions, historyTrusted: true });
  if (plan.action === "wait" || plan.action === "already_done") return plan;
  let record = history.findLast((entry) => sameCandidate(entry, candidate));
  if (!record) record = await journal.reserve(candidate);
  requireCondition(record && record.id, "durable_reservation_required");

  if (plan.action === "upload") {
    await journal.record(record.id, "upload_started");
    let uploaded;
    try { uploaded = await client.upload(zipBytes); }
    catch (error) {
      await journal.record(record.id, error.uncertain ? "upload_uncertain" : "failed");
      throw new PublicationError(error.uncertain ? "upload_outcome_unknown_reconcile_manually" : "upload_rejected");
    }
    if (uploaded.uploadState !== "SUCCEEDED" || uploaded.crxVersion !== candidate.version) {
      await journal.record(record.id, "upload_uncertain");
      throw new PublicationError("draft_identity_not_proven_reconcile_manually");
    }
    await journal.record(record.id, "upload_succeeded");
    // Only this uninterrupted run owns the synchronous matching upload receipt.
    // On a later retry, upload_succeeded alone is deliberately insufficient.
    const fresh = await client.fetchStatus();
    const unchanged = planCwsRelease({ stage, candidate, status: fresh, history, releaseVersions, historyTrusted: true });
    requireCondition(unchanged.action === "upload", "store_changed_after_upload");
  } else {
    requireCondition(plan.action === "promote", "unexpected_release_plan");
  }

  const promoting = plan.action === "promote";
  await journal.record(record.id, promoting ? "promote_started" : "submit_started");
  let response;
  try { response = await client.publish(promoting ? "DEFAULT_PUBLISH" : "STAGED_PUBLISH"); }
  catch (error) {
    if (!error.uncertain) {
      await journal.record(record.id, "failed");
      throw new PublicationError("submission_rejected");
    }
    // A timeout may mean the server accepted the request. Read; never replay it.
    try {
      const [latest, attempts, releases] = await Promise.all([
        client.fetchStatus(), journal.list(), journal.listReleaseVersions(),
      ]);
      const recovered = planCwsRelease({ stage, candidate, status: latest, history: attempts,
        releaseVersions: releases, historyTrusted: true });
      if (recovered.action === "wait" || recovered.action === "already_done") return recovered;
    } catch { /* Preserve the durable *_started phase for explicit reconciliation. */ }
    throw new PublicationError("submission_outcome_unknown_reconcile_manually");
  }
  requireCondition(!response.warningInfo?.warnings?.length, "store_returned_warnings");
  const phases = { PENDING_REVIEW: "submitted", STAGED: "staged", PUBLISHED: "published" };
  const phase = phases[response.state];
  requireCondition(phase, "unexpected_submission_state_reconcile_manually");
  await journal.record(record.id, phase);
  if (!promoting && response.state === "PUBLISHED") throw new PublicationError("unexpected_publication_state_check_dashboard");
  return { action: phase, reason: "Observed the store response; no automatic cancellation or retry was performed." };
}

async function approvalFromGitHub(env) {
  const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/approvals`, {
    headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    redirect: "error", signal: AbortSignal.timeout(30_000),
  });
  requireCondition(response.ok, "cannot_verify_environment_approval");
  assertEnvironmentApproval(await response.json());
}

async function main() {
  requireCondition(process.argv[2] === "execute", "use_execute_stage_verified_report");
  const env = process.env;
  assertActivation(env);
  requireCondition(env.GITHUB_TOKEN && env.CWS_ACCESS_TOKEN, "ephemeral_credentials_missing");
  await approvalFromGitHub(env);
  const report = JSON.parse(readFileSync(process.argv[4], "utf8"));
  requireCondition(report.schema_version === 1 && report.verified === true, "verified_artifact_report_required");
  requireCondition(report.output_dir === resolve(dirname(process.argv[4]), "verified"), "unexpected_artifact_directory");
  const candidate = { version: report.version, commit: report.source_commit, sha256: report.chrome_zip_sha256,
    itemId: report.item_id, artifactId: report.artifact_id, runId: report.run_id };
  requireCondition(candidate.itemId === ITEM_ID, "artifact_item_mismatch");
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  requireCondition(git("rev-parse", "HEAD") === candidate.commit, "checkout_sha_mismatch");
  execFileSync("git", ["merge-base", "--is-ancestor", candidate.commit, "origin/main"]);
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const tag = `v${candidate.version}`;
  const tagCommit = git("rev-parse", `refs/tags/${tag}^{commit}`);
  assertTagHistory(git("tag", "--list").split("\n").filter(Boolean), candidate.version, tag);
  const result = await executeRelease({
    enabled: true, stage: process.argv[3], candidate,
    identity: { packageVersion: pkg.version, manifestVersion: report.version, tag, tagCommit },
    zipBytes: readFileSync(resolve(dirname(process.argv[4]), "verified", report.chrome_zip)),
    client: new CwsClient({ publisherId: env.CWS_PUBLISHER_ID, itemId: ITEM_ID, accessToken: env.CWS_ACCESS_TOKEN }),
    journal: new GithubJournal({ repository: REPOSITORY, itemId: ITEM_ID, token: env.GITHUB_TOKEN }),
  });
  console.log(JSON.stringify({ version: candidate.version, source_commit: candidate.commit, artifact_sha256: candidate.sha256, ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof PublicationError ? error.code : "Release blocked; inspect verified inputs and durable journal. No automatic retry."); process.exitCode = 1; });
}
