import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const QA_SCENARIOS = [
  "booth_main_and_shop", "late_anchor_and_navigation", "oauth_login_cancel_retry",
  "session_refresh_and_logout", "account_settings", "review_crud_test_account",
  "new_install", "upgrade_from_previous", "rollback_plan", "permissions_and_identity",
];

export const CHROME_ID = "hafbafjoecfjdlhjilpakabocglkaegj";
export const CHROME_REDIRECT = `https://${CHROME_ID}.chromiumapp.org/`;
export const CHROME_QA_SCENARIOS = [...QA_SCENARIOS, "service_worker_restart"];

export function releaseMetadata(pkg) {
  assert.equal(pkg.name, "boothplus", "Unexpected package name");
  assert.match(pkg.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "Use a numeric x.y.z release version");
  assert.equal(pkg.version.trim(), pkg.version, "Use a numeric x.y.z release version without whitespace");
  assert.notEqual(pkg.version, "0.0.0", "Extension version must not be all zero");
  assert.ok(pkg.version.split(".").every((part) => Number(part) <= 65535), "Extension version component exceeds 65535");
  return {
    version: pkg.version,
    tag: `v${pkg.version}`,
    chrome: `dist/boothplus-${pkg.version}-chrome.zip`,
    firefox: `dist/boothplus-${pkg.version}-firefox.zip`,
    sources: `dist/boothplus-${pkg.version}-sources.zip`,
  };
}

export function validateQaRecord(record, { version, commit, browsers = ["chrome", "firefox"] }) {
  releaseMetadata({ name: "boothplus", version });
  assert.ok(Array.isArray(browsers) && browsers.length > 0 && new Set(browsers).size === browsers.length
    && browsers.every((browser) => ["chrome", "firefox"].includes(browser)), "Select supported QA browsers");
  assert.match(commit, /^[a-f0-9]{40}$/, "Candidate must be a full commit SHA");
  assert.equal(commit.length, 40, "Candidate must be a full commit SHA");
  assert.equal(record.schema_version, 1, "Unsupported QA schema");
  assert.equal(record.source_commit, commit, "QA evidence must match the candidate commit");
  assert.equal(record.version, version, "QA evidence version mismatch");
  assert.equal(record.integration_issue, "https://github.com/vrc-booth/vrc-booth-extension/issues/30");
  assert.equal(record.qa_issue, "https://github.com/vrc-booth/vrc-booth-extension/issues/31");
  assert.ok(typeof record.tester === "string" && record.tester.trim().length > 0, "QA tester is required");
  assert.ok(typeof record.tested_at === "string" && !Number.isNaN(Date.parse(record.tested_at)), "QA date is required");
  assert.ok(Date.parse(record.tested_at) <= Date.now(), "QA date cannot be in the future");
  assert.ok(Array.isArray(record.blockers) && record.blockers.length === 0, "Unresolved release blockers");
  for (const browser of browsers) {
    const qa = record.browsers?.[browser];
    assert.ok(qa && typeof qa.browser_version === "string" && qa.browser_version.trim(), `${browser}: version is required`);
    assert.ok(typeof qa.extension_id === "string" && qa.extension_id.trim(), `${browser}: installed extension ID is required`);
    assert.ok(typeof qa.oauth_redirect === "string" && qa.oauth_redirect.startsWith("https://"), `${browser}: observed OAuth redirect is required`);
    const evidence = new URL(qa.evidence_url);
    assert.equal(evidence.protocol, "https:", `${browser}: evidence must be an HTTPS URL`);
    for (const scenario of QA_SCENARIOS) {
      assert.equal(qa.scenarios?.[scenario], "passed", `${browser}: ${scenario} has not passed`);
    }
  }
  return record;
}

export function validateChromeQaRecord(record, candidate) {
  validateQaRecord(record, { ...candidate, browsers: ["chrome"] });
  assert.match(record.tested_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/, "Chrome QA date must include a timezone");
  const qa = record.browsers.chrome;
  assert.equal(qa.extension_id, CHROME_ID, "Chrome QA must use the published extension ID");
  assert.equal(qa.oauth_redirect, CHROME_REDIRECT, "Chrome QA must observe the exact registered identity redirect");
  for (const scenario of CHROME_QA_SCENARIOS) {
    assert.equal(qa.scenarios?.[scenario], "passed", `chrome: ${scenario} has not passed`);
  }
  return record;
}

function main() {
  const metadata = releaseMetadata(JSON.parse(readFileSync("package.json", "utf8")));
  const command = process.argv[2];
  if (command === "metadata") {
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(metadata).map(([key, value]) => `${key}=${value}\n`).join(""));
    }
    console.log(JSON.stringify(metadata, null, 2));
    return;
  }
  assert.ok(["gate", "chrome-gate"].includes(command), "Use metadata, gate, or chrome-gate [qa-record.json]");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(process.env.EXPECTED_VERSION, metadata.version, "Expected version does not match package.json");
  assert.equal(process.env.CANDIDATE_SHA, commit, "Checkout is not the requested candidate SHA");
  assert.equal(execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { encoding: "utf8" }).trim(), "", "Release candidate must have a clean working tree");
  // Fetch tags before this command in CI. Accept neither prefixed nor legacy bare duplicates.
  for (const tag of [metadata.tag, metadata.version]) {
    const found = execFileSync("git", ["tag", "--list", tag], { encoding: "utf8" }).trim();
    assert.equal(found, "", `Tag ${tag} already exists; never overwrite a released tag`);
  }
  const raw = process.argv[3] ? readFileSync(process.argv[3], "utf8") : process.env.QA_RECORD;
  assert.ok(raw, "Provide a QA JSON record; see docs/release/qa-record.example.json");
  const validate = command === "chrome-gate" ? validateChromeQaRecord : validateQaRecord;
  const qa = validate(JSON.parse(raw), { version: metadata.version, commit });
  // dist is ignored and contains only build/report artifacts. This does not publish anything.
  writeFileSync("dist/release-qa.json", JSON.stringify(qa, null, 2) + "\n");
  console.log(`QA attestation validated for ${metadata.tag} at ${commit}. Publication still requires separate approval.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
