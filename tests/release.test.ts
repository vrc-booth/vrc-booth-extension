import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { QA_SCENARIOS, releaseMetadata, validateQaRecord } from "../scripts/release.mjs";

const read = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const commit = "1".repeat(40);
const candidate = { version: "3.3.0", commit };
const validRecord = () => ({
  schema_version: 1,
  version: candidate.version,
  source_commit: commit,
  integration_issue: "https://github.com/vrc-booth/vrc-booth-extension/issues/30",
  qa_issue: "https://github.com/vrc-booth/vrc-booth-extension/issues/31",
  tester: "Test maintainer",
  tested_at: "2026-01-01T00:00:00Z",
  blockers: [],
  browsers: Object.fromEntries(["chrome", "firefox"].map((browser) => [browser, {
    browser_version: "test-version", extension_id: `test-${browser}`,
    oauth_redirect: "https://example.test/callback", evidence_url: "https://example.test/qa",
    scenarios: Object.fromEntries(QA_SCENARIOS.map((scenario: string) => [scenario, "passed"])),
  }])),
});

describe("release metadata and explicit QA gate", () => {
  it("uses exact WXT artifact filenames without stray quotes or upload globs", () => {
    expect(releaseMetadata({ name: "boothplus", version: "3.3.0" })).toEqual({
      version: "3.3.0", tag: "v3.3.0", chrome: "dist/boothplus-3.3.0-chrome.zip",
      firefox: "dist/boothplus-3.3.0-firefox.zip", sources: "dist/boothplus-3.3.0-sources.zip",
    });
  });
  it.each(['3.3.0"', "v3.3.0", "3.3.0-beta.1", "03.3.0", "65536.0.0", "3.3.0\nBAD=value"])("rejects unsafe/unsupported version %s", (version) => {
    expect(() => releaseMetadata({ name: "boothplus", version })).toThrow();
  });
  it("accepts a complete attestation for the exact commit", () => {
    const qa = validRecord();
    expect(validateQaRecord(qa, candidate)).toBe(qa);
  });
  it("fails closed on the checked-in incomplete QA template", () => {
    expect(() => validateQaRecord(JSON.parse(read("docs/release/qa-record.example.json")), candidate)).toThrow();
  });
  it("rejects evidence for a different version or commit", () => {
    expect(() => validateQaRecord({ ...validRecord(), source_commit: "2".repeat(40) }, candidate)).toThrow(/commit/);
    expect(() => validateQaRecord({ ...validRecord(), version: "3.2.0" }, candidate)).toThrow(/version/);
  });
  it("does not allow a missing browser or a single untested scenario", () => {
    const missingBrowser = validRecord();
    delete missingBrowser.browsers.firefox;
    expect(() => validateQaRecord(missingBrowser, candidate)).toThrow();
    const qa = validRecord();
    qa.browsers.chrome.scenarios.upgrade_from_previous = "not_run";
    expect(() => validateQaRecord(qa, candidate)).toThrow(/upgrade_from_previous/);
  });
  it("rejects unresolved blockers, future dates, and non-HTTPS evidence", () => {
    expect(() => validateQaRecord({ ...validRecord(), blockers: ["OAuth not registered"] }, candidate)).toThrow(/blockers/);
    expect(() => validateQaRecord({ ...validRecord(), tested_at: "2999-01-01" }, candidate)).toThrow(/future/);
    const qa = validRecord();
    qa.browsers.firefox.evidence_url = "http://example.test/qa";
    expect(() => validateQaRecord(qa, candidate)).toThrow(/HTTPS/);
  });
});

describe("workflow publication safety", () => {
  const ci = read(".github/workflows/node.js.yml");
  const prepare = read(".github/workflows/prepare-release.yml");
  it("tests active PRs for dev/main and does not react to closed PRs", () => {
    expect(ci).toContain("branches: [main, dev]");
    expect(ci).toContain("types: [opened, synchronize, reopened, ready_for_review]");
    expect(ci).not.toMatch(/\bclosed\b|pull_request_target/);
    for (const command of ["pnpm install --frozen-lockfile", "pnpm test", "pnpm test:release", "pnpm compile", "pnpm build", "pnpm build:firefox", "pnpm release:package"]) {
      expect(ci).toContain(command);
    }
  });
  it("contains no publishing credentials or release/tag/store mutations", () => {
    for (const workflow of [ci, prepare]) {
      expect(workflow).toContain("contents: read");
      expect(workflow).toContain("persist-credentials: false");
      expect(workflow).not.toMatch(/contents:\s*write|secrets\.|create-release|upload-release-asset|gh release|git push|wxt submit|web-ext sign/);
    }
  });
  it("manual preparation binds QA/version to an exact candidate on main", () => {
    expect(prepare).toContain("workflow_dispatch:");
    expect(prepare).not.toMatch(/pull_request:|\bpush:/);
    expect(prepare).toContain("if: github.ref == 'refs/heads/main'");
    expect(prepare).toContain('git merge-base --is-ancestor "$CANDIDATE_SHA" origin/main');
    expect(prepare).toContain("node scripts/release.mjs gate");
    expect(prepare).toContain("--release-ready");
    expect(prepare).toContain("if-no-files-found: error");
    expect(prepare).not.toContain("dist/*.zip");
    expect(prepare).toContain("steps.release.outputs.chrome");
    expect(prepare).toContain("steps.release.outputs.firefox");
    expect(prepare).toContain("steps.release.outputs.sources");
  });
  it("pins the verified pnpm and only the reviewed esbuild installer", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.packageManager).toBe("pnpm@11.19.0");
    expect(read("pnpm-workspace.yaml")).toMatch(/allowBuilds:\s+esbuild@0\.25\.12: true/);
    expect(read("pnpm-workspace.yaml")).not.toContain("dangerouslyAllowAllBuilds");
    expect(read("pnpm-workspace.yaml")).toMatch(/^  spawn-sync: false$/m);
    expect(read("pnpm-workspace.yaml")).not.toContain("set this to true or false");
  });
});
