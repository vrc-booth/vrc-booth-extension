import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { CHROME_ID, CHROME_REDIRECT, CHROME_QA_SCENARIOS, QA_SCENARIOS, releaseMetadata, validateChromeQaRecord, validateQaRecord } from "../scripts/release.mjs";

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
  it.each(['0.0.0', '3.3.0"', "v3.3.0", "3.3.0-beta.1", "03.3.0", "65536.0.0", "3.3.0\nBAD=value", "3.3.0\n", "3.3.0\r"])("rejects unsafe/unsupported version %s", (version) => {
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
    for (const command of ["bun install --frozen-lockfile", "bun run test", "bun run test:release", "bun run compile", "bun run build", "bun run build:firefox", "bun run release:package"]) {
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
  it("pins Bun and only the reviewed esbuild installer", () => {
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.packageManager).toBe("bun@1.4.2");
    expect(pkg.engines.node).toBe("24.x");
    expect(pkg.trustedDependencies).toEqual(["esbuild"]);
    expect(pkg.overrides).toEqual({ esbuild: "0.25.12" });
    expect(read("bunfig.toml")).toMatch(/linker\s*=\s*"isolated"/);
    const resolutions = [...read("bun.lock").matchAll(/\["(esbuild@[^"]+)"/g)].map((match) => match[1]);
    expect(resolutions).toEqual(["esbuild@0.25.12"]);
    for (const name of ["pnpm-lock.yaml", "pnpm-workspace.yaml", "package-lock.json", "yarn.lock", "bun.lockb"]) {
      expect(existsSync(new URL(`../${name}`, import.meta.url))).toBe(false);
    }
  });
  it("uses the same pinned Bun and frozen lockfile in every build workflow", () => {
    const chromePrepare = read(".github/workflows/prepare-chrome-release.yml");
    for (const workflow of [ci, prepare, chromePrepare]) {
      expect(workflow).toContain("oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6");
      expect(workflow).toContain("bun-version-file: package.json");
      expect(workflow).toContain("node-version: 24.19.0");
      expect(workflow).toContain("test -f bun.lock && bun install --frozen-lockfile");
      expect(workflow).not.toMatch(/pnpm|corepack|bun (test|build)\b|--bun|--ignore-scripts/);
    }
    expect(JSON.parse(read("package.json")).scripts.test).toBe("vitest run");
    expect(JSON.parse(read("package.json")).scripts.build).toBe("wxt build");
    expect(JSON.parse(read("package.json")).scripts.postinstall).toBe("wxt prepare");
  });
});


describe("independent Chrome preparation gate", () => {
  const chromeRecord = () => {
    const record = validRecord();
    delete record.browsers.firefox;
    record.browsers.chrome.extension_id = CHROME_ID;
    record.browsers.chrome.oauth_redirect = CHROME_REDIRECT;
    record.browsers.chrome.scenarios = Object.fromEntries(CHROME_QA_SCENARIOS.map((scenario) => [scenario, "passed"]));
    return record;
  };
  it("selects Chrome QA independently without changing the default both-browser gate", () => {
    const qa = chromeRecord();
    expect(validateQaRecord(qa, { ...candidate, browsers: ["chrome"] })).toBe(qa);
    expect(validateChromeQaRecord(qa, candidate)).toBe(qa);
    expect(() => validateQaRecord(qa, candidate)).toThrow(/firefox/);
    expect(() => validateQaRecord(qa, { ...candidate, browsers: [] })).toThrow(/browsers/);
  });
  it.each(CHROME_QA_SCENARIOS)("requires installed Chrome scenario %s", (scenario) => {
    const qa = chromeRecord();
    qa.browsers.chrome.scenarios[scenario] = "not_run";
    expect(() => validateChromeQaRecord(qa, candidate)).toThrow(scenario);
  });
  it("rejects wrong Chrome identity and any altered redirect", () => {
    const qa = chromeRecord();
    qa.browsers.chrome.extension_id = "another-id";
    expect(() => validateChromeQaRecord(qa, candidate)).toThrow(/ID/);
    qa.browsers.chrome.extension_id = CHROME_ID;
    qa.browsers.chrome.oauth_redirect += "other";
    expect(() => validateChromeQaRecord(qa, candidate)).toThrow(/redirect/);
  });
  it("still rejects Chrome blockers and the uncompleted checked-in Chrome template", () => {
    expect(() => validateChromeQaRecord({ ...chromeRecord(), blockers: ["Chrome QA pending"] }, candidate)).toThrow(/blockers/);
    expect(() => validateChromeQaRecord(JSON.parse(read("docs/release/chrome-qa-record.example.json")), candidate)).toThrow();
  });
});
