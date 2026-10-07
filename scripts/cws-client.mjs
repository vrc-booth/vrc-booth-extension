// Future release transports only. Importing this module performs no I/O.
// Policy, explicit enablement, QA, and immutable artifact checks belong to the
// orchestrator. A successful fetchStatus never proves the identity of a draft ZIP.
// API contracts: developer.chrome.com/docs/webstore/api/reference/rest/v2
//               docs.github.com/en/rest/deployments

const CWS_ORIGIN = "https://chromewebstore.googleapis.com";
const GITHUB_ORIGIN = "https://api.github.com";
const LEDGER_ENVIRONMENT = "chrome-web-store-ledger";
const MAX_JOURNAL_PAGES = 1000;
const ITEM_ID = /^[a-p]{32}$/;
const PHASES = new Set([
  "prepared", "upload_started", "upload_succeeded", "upload_uncertain",
  "submit_started", "submitted", "staged", "promote_started", "published", "failed",
]);

// Deliberately exclude response bodies, request headers, URLs, and exception
// causes. Fetch errors and API error messages can contain credentials.
export class TransportError extends Error {
  constructor(code, { uncertain = false, status } = {}) {
    super(`Release transport stopped: ${code}${uncertain ? " (outcome uncertain; do not retry mutations)" : ""}`);
    this.name = "TransportError";
    this.code = code;
    this.uncertain = uncertain;
    if (status !== undefined) this.status = status;
  }
}

function fail(code, uncertain = false) {
  throw new TransportError(code, { uncertain });
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value) { return typeof value === "string" && value.trim() === value; }

function token(value) {
  // Bearer values cannot contain whitespace or HTTP header control characters.
  return cleanString(value) && /^[\x21-\x7e]+$/.test(value);
}

function enumString(value) {
  // Unknown future states pass through to the fail-closed policy, never as success.
  return cleanString(value) && /^[A-Z][A-Z_]{0,99}$/.test(value);
}

function positiveId(value) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (cleanString(value) && /^[1-9][0-9]{0,19}$/.test(value)) return value;
  return null;
}

function chromeVersion(value) {
  if (!cleanString(value) || !/^(0|[1-9][0-9]*)(\.(0|[1-9][0-9]*)){0,3}$/.test(value)) return false;
  const parts = value.split(".").map(Number);
  return parts.every((part) => part <= 65535) && parts.some((part) => part > 0);
}

function validateOptions(fetchImpl, timeoutMs) {
  if (typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) {
    fail("INVALID_OPTIONS");
  }
}

async function requestJson(fetchImpl, url, init, timeoutMs, service) {
  const mutation = init.method !== "GET";
  const controller = new AbortController();
  let timer;
  // The deadline includes response-body consumption. Promise.race also bounds
  // injected fetch implementations that do not honor AbortSignal.
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TransportError(`${service}_TIMEOUT`, { uncertain: mutation }));
    }, timeoutMs);
  });
  try {
    return await Promise.race([deadline, (async () => {
      let response;
      try {
        response = await fetchImpl(url, { ...init, redirect: "error", signal: controller.signal });
      } catch {
        fail(`${service}_NETWORK_ERROR`, mutation);
      }
      if (!response || !Number.isInteger(response.status) || typeof response.json !== "function" ||
          !response.headers || typeof response.headers.get !== "function" || response.redirected ||
          (response.url && response.url !== url)) {
        fail(`${service}_MALFORMED_RESPONSE`, mutation);
      }
      if (response.status < 200 || response.status >= 300) {
        // Even a server error can arrive after a mutation. Never auto-retry.
        throw new TransportError(`${service}_HTTP_ERROR`, { uncertain: mutation, status: response.status });
      }
      let data;
      try {
        data = await response.json();
      } catch {
        fail(`${service}_MALFORMED_RESPONSE`, mutation);
      }
      return { data, headers: response.headers, status: response.status };
    })()]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

export class CwsClient {
  #accessToken;
  #fetch;
  #timeoutMs;
  #name;
  #itemId;

  constructor({ publisherId, itemId, accessToken, fetchImpl = fetch, timeoutMs = 30000 }) {
    if (!cleanString(publisherId) || !/^[A-Za-z0-9_-]{1,128}$/.test(publisherId) ||
        !cleanString(itemId) || !ITEM_ID.test(itemId) || !token(accessToken)) fail("INVALID_CWS_OPTIONS");
    validateOptions(fetchImpl, timeoutMs);
    this.#accessToken = accessToken;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
    this.#name = `publishers/${publisherId}/items/${itemId}`;
    this.#itemId = itemId;
  }

  async #request(action, method, body, contentType) {
    const prefix = action === "upload" ? "/upload/v2/" : "/v2/";
    const headers = { Authorization: `Bearer ${this.#accessToken}`, Accept: "application/json" };
    if (contentType) headers["Content-Type"] = contentType;
    const { data } = await requestJson(this.#fetch, `${CWS_ORIGIN}${prefix}${this.#name}:${action}`,
      { method, headers, ...(body !== undefined ? { body } : {}) }, this.#timeoutMs, "CWS");
    const uncertain = method !== "GET";
    if (!object(data) || data.name !== this.#name || data.itemId !== this.#itemId) {
      fail("CWS_IDENTITY_MISMATCH", uncertain);
    }
    if (data.error !== undefined) fail("CWS_MALFORMED_RESPONSE", uncertain);
    return data;
  }

  async fetchStatus() {
    const data = await this.#request("fetchStatus", "GET");
    for (const key of ["takenDown", "warned"]) {
      if (data[key] !== undefined && typeof data[key] !== "boolean") fail("CWS_MALFORMED_RESPONSE");
    }
    if (data.lastAsyncUploadState !== undefined && !enumString(data.lastAsyncUploadState)) fail("CWS_MALFORMED_RESPONSE");
    for (const key of ["publishedItemRevisionStatus", "submittedItemRevisionStatus"]) {
      if (data[key] === undefined) continue;
      const revision = data[key];
      if (!object(revision) || !enumString(revision.state)) fail("CWS_MALFORMED_RESPONSE");
      if (revision.distributionChannels !== undefined && (!Array.isArray(revision.distributionChannels) ||
          revision.distributionChannels.some((channel) => !object(channel) || !chromeVersion(channel.crxVersion) ||
            (channel.deployPercentage !== undefined && (!Number.isInteger(channel.deployPercentage) ||
              channel.deployPercentage < 0 || channel.deployPercentage > 100))))) fail("CWS_MALFORMED_RESPONSE");
    }
    return data;
  }

  async upload(zipBytes) {
    if (!(zipBytes instanceof Uint8Array) || zipBytes.byteLength === 0) fail("INVALID_ZIP_BYTES");
    const data = await this.#request("upload", "POST", zipBytes, "application/zip");
    if (!enumString(data.uploadState) || (data.crxVersion !== undefined && !chromeVersion(data.crxVersion)) ||
        (data.uploadState === "SUCCEEDED" && !chromeVersion(data.crxVersion))) fail("CWS_MALFORMED_RESPONSE", true);
    // Only the orchestrator can compare synchronous SUCCEEDED/crxVersion to
    // its immutable candidate. IN_PROGRESS and unknown states do not prove it.
    return data;
  }

  async publish(publishType) {
    if (!["DEFAULT_PUBLISH", "STAGED_PUBLISH"].includes(publishType)) fail("INVALID_PUBLISH_TYPE");
    const data = await this.#request("publish", "POST", JSON.stringify({ publishType, skipReview: false, blockOnWarnings: true }), "application/json");
    if (!enumString(data.state)) fail("CWS_MALFORMED_RESPONSE", true);
    if (data.warningInfo !== undefined && (!object(data.warningInfo) ||
        (data.warningInfo.warnings !== undefined && (!Array.isArray(data.warningInfo.warnings) ||
          data.warningInfo.warnings.some((warning) => !object(warning) ||
            typeof warning.reason !== "string" || typeof warning.description !== "string"))))) fail("CWS_MALFORMED_RESPONSE", true);
    return data;
  }
}

function candidateIdentity(candidate, uncertain = false) {
  if (!object(candidate) || !chromeVersion(candidate.version) ||
      !cleanString(candidate.commit) || !/^[0-9a-f]{40}$/.test(candidate.commit) ||
      !cleanString(candidate.sha256) || !/^[0-9a-f]{64}$/.test(candidate.sha256) ||
      !cleanString(candidate.itemId) || !ITEM_ID.test(candidate.itemId) ||
      !positiveId(candidate.artifactId) || !positiveId(candidate.runId)) fail("INVALID_JOURNAL_IDENTITY", uncertain);
  return {
    version: candidate.version, commit: candidate.commit, sha256: candidate.sha256,
    itemId: candidate.itemId, artifactId: positiveId(candidate.artifactId), runId: positiveId(candidate.runId),
  };
}

function phaseState(phase) {
  if (phase === "published") return "success";
  if (phase === "failed") return "failure";
  if (phase === "upload_uncertain") return "error";
  if (phase === "prepared") return "queued";
  return "in_progress";
}

export class GithubJournal {
  #token;
  #fetch;
  #timeoutMs;
  #path;
  #itemId;
  #known = new Map();

  constructor({ repository, token: authToken, itemId, fetchImpl = fetch, timeoutMs = 30000 }) {
    if (!cleanString(repository) || !/^[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repository) ||
        [".", ".."].includes(repository.split("/")[1]) || !token(authToken) ||
        !cleanString(itemId) || !ITEM_ID.test(itemId)) fail("INVALID_JOURNAL_OPTIONS");
    validateOptions(fetchImpl, timeoutMs);
    this.#token = authToken;
    this.#fetch = fetchImpl;
    this.#timeoutMs = timeoutMs;
    this.#path = `/repos/${repository}/deployments`;
    this.#itemId = itemId;
  }

  async #request(path, method = "GET", body) {
    const headers = { Authorization: `Bearer ${this.#token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const result = await requestJson(this.#fetch, `${GITHUB_ORIGIN}${path}`,
      { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }, this.#timeoutMs, "JOURNAL");
    if (result.status !== (method === "GET" ? 200 : 201)) fail("JOURNAL_UNEXPECTED_STATUS", method !== "GET");
    return result;
  }

  #deployment(data, uncertain = false) {
    if (!object(data) || !positiveId(data.id) || data.environment !== LEDGER_ENVIRONMENT ||
        data.transient_environment !== false || data.production_environment !== false) fail("JOURNAL_MALFORMED_DEPLOYMENT", uncertain);
    let payload = data.payload;
    if (typeof payload === "string") {
      try { payload = JSON.parse(payload); } catch { fail("JOURNAL_MALFORMED_DEPLOYMENT", uncertain); }
    }
    if (!object(payload) || payload.schema !== 1 || payload.product !== "boothplus") fail("JOURNAL_MALFORMED_DEPLOYMENT", uncertain);
    const identity = candidateIdentity(payload, uncertain);
    if (data.ref !== identity.commit || data.sha !== identity.commit) fail("JOURNAL_IDENTITY_MISMATCH", uncertain);
    return { id: positiveId(data.id), ...identity, phase: "prepared" };
  }

  #status(data, id, uncertain = false) {
    if (!object(data) || !positiveId(data.id) || typeof data.description !== "string" ||
        !data.description.startsWith("cws:")) fail("JOURNAL_MALFORMED_STATUS", uncertain);
    const phase = data.description.slice(4);
    if (!PHASES.has(phase) || data.state !== phaseState(phase) ||
        (data.environment !== undefined && data.environment !== LEDGER_ENVIRONMENT) ||
        (data.deployment_url !== undefined && data.deployment_url !== `${GITHUB_ORIGIN}${this.#path}/${id}`)) {
      fail("JOURNAL_MALFORMED_STATUS", uncertain);
    }
    return phase;
  }

  #checkPagination(headers, page, count, path = this.#path, environment = true) {
    const link = headers.get("link");
    if (!link) return;
    const relations = new Map();
    for (const part of link.split(",")) {
      const match = part.trim().match(/^<([^>]+)>;\s*rel="(next|prev|first|last)"$/);
      if (!match || relations.has(match[2])) fail("JOURNAL_INVALID_PAGINATION");
      let url;
      try { url = new URL(match[1]); } catch { fail("JOURNAL_INVALID_PAGINATION"); }
      const linkedPage = Number(url.searchParams.get("page"));
      const keys = environment ? ["environment", "per_page", "page"] : ["per_page", "page"];
      if (url.origin !== GITHUB_ORIGIN || url.pathname !== path || url.username || url.password || url.hash ||
          (environment && url.searchParams.get("environment") !== LEDGER_ENVIRONMENT) || url.searchParams.get("per_page") !== "100" ||
          !Number.isSafeInteger(linkedPage) || linkedPage < 1 ||
          [...url.searchParams.keys()].some((key) => !keys.includes(key)) ||
          [...url.searchParams.keys()].length !== keys.length) fail("JOURNAL_INVALID_PAGINATION");
      relations.set(match[2], linkedPage);
    }
    if ((relations.has("next") && (relations.get("next") !== page + 1 || count === 0)) ||
        (relations.has("last") && relations.get("last") > page && !relations.has("next"))) fail("JOURNAL_TRUNCATED_HISTORY");
  }

  async list() {
    const records = [];
    const seen = new Set();
    // Never follow a server-supplied URL with our bearer token. Generate each
    // page on the fixed origin and read through an empty page even without Link.
    for (let page = 1; page <= MAX_JOURNAL_PAGES; page++) {
      const { data, headers } = await this.#request(`${this.#path}?environment=${LEDGER_ENVIRONMENT}&per_page=100&page=${page}`);
      if (!Array.isArray(data) || data.length > 100) fail("JOURNAL_MALFORMED_HISTORY");
      this.#checkPagination(headers, page, data.length);
      if (data.length === 0) {
        // GitHub deployment IDs are monotonically allocated. Keep the policy's
        // latest reservation last, independently of response-page ordering.
        records.sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : 1);
        this.#known = new Map(records.map((record) => [record.id, record]));
        return records;
      }
      for (const deployment of data) {
        const record = this.#deployment(deployment);
        if (seen.has(record.id)) fail("JOURNAL_TRUNCATED_HISTORY");
        seen.add(record.id);
        if (record.itemId !== this.#itemId) continue;
        // The API returns statuses newest first. Only the latest one is needed;
        // an unrecognized latest status blocks rather than falling back to an old one.
        const { data: statuses } = await this.#request(`${this.#path}/${record.id}/statuses?per_page=1&page=1`);
        if (!Array.isArray(statuses) || statuses.length > 1) fail("JOURNAL_MALFORMED_STATUS");
        if (statuses.length) record.phase = this.#status(statuses[0], record.id);
        records.push(record);
      }
    }
    fail("JOURNAL_TRUNCATED_HISTORY");
  }

  async listReleaseVersions() {
    const path = this.#path.replace(/\/deployments$/, "/releases");
    const versions = [];
    const seen = new Set();
    for (let page = 1; page <= MAX_JOURNAL_PAGES; page++) {
      const { data, headers } = await this.#request(`${path}?per_page=100&page=${page}`);
      if (!Array.isArray(data) || data.length > 100) fail("JOURNAL_MALFORMED_RELEASES");
      this.#checkPagination(headers, page, data.length, path, false);
      if (data.length === 0) return versions;
      for (const release of data) {
        if (!object(release) || !positiveId(release.id) || !cleanString(release.tag_name) ||
            !/^v?[0-9]+(?:\.[0-9]+){0,3}$/.test(release.tag_name)) fail("JOURNAL_UNSUPPORTED_RELEASE_TAG");
        const id = positiveId(release.id);
        if (seen.has(id)) fail("JOURNAL_TRUNCATED_HISTORY");
        seen.add(id);
        // Drafts and prereleases also consume versions. Bounds/canonicalization
        // are checked by policy, and unsupported tags require reconciliation.
        versions.push(release.tag_name.replace(/^v/, ""));
      }
    }
    fail("JOURNAL_TRUNCATED_HISTORY");
  }

  async reserve(candidate) {
    const identity = candidateIdentity(candidate);
    if (identity.itemId !== this.#itemId) fail("JOURNAL_IDENTITY_MISMATCH");
    const { data } = await this.#request(this.#path, "POST", {
      ref: identity.commit, environment: LEDGER_ENVIRONMENT, auto_merge: false,
      required_contexts: [], production_environment: false, transient_environment: false,
      description: "BOOTHPlus Chrome Web Store release ledger",
      payload: { schema: 1, product: "boothplus", ...identity },
    });
    const record = this.#deployment(data, true);
    if (Object.keys(identity).some((key) => record[key] !== identity[key])) fail("JOURNAL_IDENTITY_MISMATCH", true);
    this.#known.set(record.id, record);
    return await this.record(record.id, "prepared");
  }

  async record(id, phase) {
    id = positiveId(id);
    if (!id || !PHASES.has(phase)) fail("INVALID_JOURNAL_PHASE");
    let record = this.#known.get(id);
    if (!record) {
      const { data } = await this.#request(`${this.#path}/${id}`);
      record = this.#deployment(data);
      if (record.id !== id || record.itemId !== this.#itemId) fail("JOURNAL_IDENTITY_MISMATCH");
    }
    const { data } = await this.#request(`${this.#path}/${id}/statuses`, "POST", {
      state: phaseState(phase), description: `cws:${phase}`, environment: LEDGER_ENVIRONMENT, auto_inactive: false,
    });
    if (this.#status(data, id, true) !== phase) fail("JOURNAL_IDENTITY_MISMATCH", true);
    const updated = { ...record, phase };
    this.#known.set(id, updated);
    return updated;
  }
}
