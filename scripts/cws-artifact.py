#!/usr/bin/env python3
"""Verify an immutable, previously prepared Chrome artifact. No network or rebuilds.

--provenance must be a separately queried GitHub API response, never a file from
inside the artifact: {"run": GET actions/runs/ID, "artifact": GET actions/artifacts/ID}.
The caller must trust the repository/API response and run this verifier from its
protected workflow checkout, not execute code extracted from the candidate.
"""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import zipfile

CHROME_ID = "hafbafjoecfjdlhjilpakabocglkaegj"
CHROME_REDIRECT = f"https://{CHROME_ID}.chromiumapp.org/"
WORKFLOW_PATH = ".github/workflows/prepare-chrome-release.yml"
QA_SCENARIOS = (
    "booth_main_and_shop", "late_anchor_and_navigation", "oauth_login_cancel_retry",
    "session_refresh_and_logout", "account_settings", "review_crud_test_account",
    "new_install", "upgrade_from_previous", "rollback_plan", "permissions_and_identity",
    "service_worker_restart",
)
MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
MAX_FILE_BYTES = 128 * 1024 * 1024
MAX_TOTAL_BYTES = 512 * 1024 * 1024
MAX_ENTRIES = 20000
MAX_COMPRESSION_RATIO = 1000


def check(condition, message):
    if not condition:
        raise ValueError(message)


def version_ok(version):
    check(isinstance(version, str) and re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version), "Expected strict numeric x.y.z version")
    check(version != "0.0.0" and all(int(part) <= 65535 for part in version.split(".")), "Version must be nonzero with components <= 65535")


def load_json(data, label):
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            check(key not in result, f"{label}: duplicate JSON key {key}")
            result[key] = value
        return result
    try:
        result = json.loads(data, object_pairs_hook=unique_pairs,
                            parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"Invalid JSON constant {value}")))
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{label}: invalid JSON") from error
    check(isinstance(result, dict), f"{label}: expected a JSON object")
    return result


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def read_bounded(path, limit=MAX_ARCHIVE_BYTES):
    path = Path(path)
    check(not path.is_symlink() and path.is_file(), f"Expected regular input file: {path}")
    check(path.stat().st_size <= limit, f"Input exceeds size limit: {path}")
    with path.open("rb") as source:
        content = source.read(limit + 1)
    check(len(content) <= limit, f"Input exceeds size limit: {path}")
    return content


def safe_archive(data, label):
    """Read bounded ZIP bytes without extracting or trusting ZIP-provided paths."""
    check(len(data) <= MAX_ARCHIVE_BYTES, f"{label}: archive exceeds size limit")
    result = {}
    seen = set()
    files_seen = set()
    total = 0
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        check(len(archive.infolist()) <= MAX_ENTRIES, f"{label}: too many ZIP entries")
        for entry in archive.infolist():
            name = entry.filename
            check(name == entry.orig_filename and bool(name) and len(name) <= 1024,
                  f"{label}: invalid ZIP entry name")
            parts = name.rstrip("/").split("/")
            check(not name.startswith("/") and "\\" not in name and ":" not in name
                  and all(part not in ("", ".", "..") for part in parts)
                  and not any(ord(char) < 32 or ord(char) == 127 for char in name),
                  f"{label}: unsafe ZIP path {name!r}")
            canonical = str(PurePosixPath(name)).casefold()
            check(canonical not in seen, f"{label}: duplicate ZIP path {name}")
            seen.add(canonical)
            mode = entry.external_attr >> 16
            kind = stat.S_IFMT(mode)
            check(kind in (0, stat.S_IFDIR if entry.is_dir() else stat.S_IFREG),
                  f"{label}: symlink or special ZIP entry {name}")
            check(not entry.flag_bits & 1, f"{label}: encrypted ZIP entry")
            check(entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED),
                  f"{label}: unsupported ZIP compression")
            check(0 <= entry.file_size <= MAX_FILE_BYTES, f"{label}: entry exceeds size limit")
            total += entry.file_size
            check(total <= MAX_TOTAL_BYTES, f"{label}: expanded ZIP exceeds size limit")
            check(entry.file_size <= max(1, entry.compress_size) * MAX_COMPRESSION_RATIO,
                  f"{label}: excessive ZIP compression ratio")
            if entry.is_dir():
                check(entry.file_size == 0, f"{label}: nonempty directory entry")
                continue
            with archive.open(entry) as source:
                content = source.read(MAX_FILE_BYTES + 1)
            check(len(content) == entry.file_size and len(content) <= MAX_FILE_BYTES,
                  f"{label}: expanded entry size mismatch")
            result[name] = content
            files_seen.add(canonical)
        # Reject file/directory conflicts even though no ZIP paths are extracted.
        for name in seen:
            check(not any(parent.as_posix() in files_seen for parent in PurePosixPath(name).parents if str(parent) != "."),
                  f"{label}: ZIP file/directory conflict")
    return result


def validate_qa(record, version, commit, item_id):
    check(type(record.get("schema_version")) is int and record["schema_version"] == 1, "Unsupported QA schema")
    check(record.get("version") == version and record.get("source_commit") == commit, "QA candidate version/commit mismatch")
    check(record.get("integration_issue") == "https://github.com/vrc-booth/vrc-booth-extension/issues/30", "QA integration issue mismatch")
    check(record.get("qa_issue") == "https://github.com/vrc-booth/vrc-booth-extension/issues/31", "QA issue mismatch")
    check(isinstance(record.get("tester"), str) and record["tester"].strip(), "QA tester missing")
    try:
        tested = datetime.fromisoformat(record["tested_at"].replace("Z", "+00:00"))
    except (KeyError, TypeError, AttributeError, ValueError) as error:
        raise ValueError("QA date must be an ISO timestamp with timezone") from error
    check(tested.tzinfo is not None and tested <= datetime.now(timezone.utc), "QA date missing timezone or in future")
    check(record.get("blockers") == [], "Unresolved Chrome QA blockers")
    browser = record.get("browsers", {}).get("chrome", {})
    check(isinstance(browser.get("browser_version"), str) and browser["browser_version"].strip(), "Chrome browser version missing")
    check(browser.get("extension_id") == item_id, "QA extension ID mismatch")
    check(browser.get("oauth_redirect") == f"https://{item_id}.chromiumapp.org/", "QA OAuth redirect mismatch")
    from urllib.parse import urlsplit
    try:
        evidence = urlsplit(browser.get("evidence_url", ""))
        check(evidence.scheme == "https" and evidence.hostname and not evidence.username and not evidence.password,
              "QA evidence must be an HTTPS URL")
    except ValueError as error:
        raise ValueError("QA evidence must be an HTTPS URL") from error
    for scenario in QA_SCENARIOS:
        check(browser.get("scenarios", {}).get(scenario) == "passed", f"Chrome QA scenario not passed: {scenario}")


def validate_provenance(provenance, *, run_id, artifact_id, commit, artifact_name):
    for value, label in ((run_id, "run"), (artifact_id, "artifact")):
        check(re.fullmatch(r"[1-9][0-9]*", str(value)), f"Invalid expected {label} ID")
    run = provenance.get("run", {})
    artifact = provenance.get("artifact", {})
    check(type(run.get("id")) is int and str(run["id"]) == str(run_id), "Run ID mismatch")
    check(type(artifact.get("id")) is int and str(artifact["id"]) == str(artifact_id), "Artifact ID mismatch")
    check(run.get("path") == WORKFLOW_PATH, "Unexpected preparation workflow path")
    check(run.get("event") == "workflow_dispatch", "Preparation must be manually dispatched")
    check(run.get("head_branch") == "main", "Preparation must run on main")
    check(run.get("head_sha") == commit, "Preparation run head SHA mismatch")
    check(run.get("status") == "completed" and run.get("conclusion") == "success", "Preparation run did not succeed")
    check(artifact.get("name") == artifact_name, "Artifact name mismatch")
    check(artifact.get("expired") is False, "Artifact expired or expiry state missing")
    origin = artifact.get("workflow_run", {})
    check(type(origin.get("id")) is int and str(origin["id"]) == str(run_id), "Artifact belongs to another run")
    check(origin.get("head_sha") == commit and origin.get("head_branch") == "main", "Artifact run candidate mismatch")
    digest = artifact.get("digest")
    check(isinstance(digest, str) and re.fullmatch(r"sha256:[a-f0-9]{64}", digest), "Trusted API SHA-256 artifact digest required")
    return digest.removeprefix("sha256:")


def verify_artifact(archive_path, provenance, *, run_id, artifact_id, commit, version, item_id,
                    artifact_name, output_dir=None):
    version_ok(version)
    check(isinstance(commit, str) and re.fullmatch(r"[a-f0-9]{40}", commit), "Candidate must be a full commit SHA")
    check(item_id == CHROME_ID, "Expected Chrome Web Store item ID changed")
    check(artifact_name == f"boothplus-chrome-{version}-{commit}", "Artifact name must identify Chrome/version/commit exactly")
    digest = validate_provenance(provenance, run_id=run_id, artifact_id=artifact_id,
                                 commit=commit, artifact_name=artifact_name)
    raw = read_bounded(archive_path)
    check(sha256(raw) == digest, "Downloaded artifact SHA-256 differs from trusted API digest")
    contents = safe_archive(raw, "GitHub artifact")
    chrome_name = f"boothplus-{version}-chrome.zip"
    sources_name = f"boothplus-{version}-sources.zip"
    required = {chrome_name, sources_name, "release-manifest.json", "release-qa.json"}
    allowed = required | {"CHANGELOG.md", "SHA256SUMS"}
    check(required <= contents.keys() and contents.keys() <= allowed, "Artifact contains missing or unexpected files")
    manifest = load_json(contents["release-manifest.json"], "release manifest")
    check(manifest.get("version") == version and manifest.get("proposed_tag") == f"v{version}", "Release version/tag mismatch")
    check(manifest.get("source_commit") == commit, "Release source commit mismatch")
    check(manifest.get("working_tree_dirty") is False, "Release working tree must be clean")
    check(manifest.get("publication_performed") is False, "Preparation must not publish")
    check(manifest.get("chrome_extension_id") == item_id, "Release Chrome identity mismatch")
    check(manifest.get("release_blockers") == [], "Unresolved release blockers")
    entries = manifest.get("artifacts")
    check(isinstance(entries, list) and len(entries) == 2, "Expected exactly Chrome and sources metadata")
    by_name = {}
    for entry in entries:
        check(isinstance(entry, dict) and isinstance(entry.get("file"), str) and entry["file"] not in by_name,
              "Duplicate/invalid package metadata")
        by_name[entry["file"]] = entry
    check(by_name.keys() == {chrome_name, sources_name}, "Unexpected package metadata files")
    for name, entry in by_name.items():
        check(type(entry.get("bytes")) is int and entry["bytes"] == len(contents[name]), f"{name}: metadata size mismatch")
        check(entry.get("sha256") == sha256(contents[name]), f"{name}: metadata digest mismatch")
    chrome = safe_archive(contents[chrome_name], "Chrome ZIP")
    sources = safe_archive(contents[sources_name], "Sources ZIP")
    check("manifest.json" in chrome, "Chrome manifest missing")
    extension = load_json(chrome["manifest.json"], "Chrome manifest")
    check(extension.get("name") == "boothplus" and extension.get("manifest_version") == 3, "Unexpected Chrome manifest identity/format")
    check(extension.get("version") == version, "Chrome manifest version mismatch")
    check(extension.get("version_name", version) == version, "Chrome manifest version_name mismatch")
    try:
        key = base64.b64decode(extension.get("key", ""), validate=True)
    except (ValueError, TypeError) as error:
        raise ValueError("Invalid Chrome public key") from error
    check(bool(key), "Chrome public key missing")
    derived = "".join(chr(97 + int(digit, 16)) for digit in sha256(key)[:32])
    check(derived == item_id, "Chrome public key derives a different item ID")
    check({"package.json", "CHANGELOG.md", "pnpm-lock.yaml"} <= sources.keys(), "Source package metadata/changelog/lockfile missing")
    package = load_json(sources["package.json"], "Source package.json")
    check(package.get("name") == "boothplus" and package.get("version") == version, "Source package version/name mismatch")
    check(manifest.get("package_manager") == package.get("packageManager") and isinstance(package.get("packageManager"), str), "Source package-manager mismatch")
    check(manifest.get("lockfile_sha256") == sha256(sources["pnpm-lock.yaml"]), "Source lockfile digest mismatch")
    changelog = sources["CHANGELOG.md"].decode("utf-8")
    heading = re.search(r"^##[ \t]+v?([0-9]+\.[0-9]+\.[0-9]+)(?=[ \t\r\n]|$)", changelog, re.MULTILINE)
    check(heading is not None and heading.group(1) == version, "Changelog latest release/tag mismatch")
    if "CHANGELOG.md" in contents:
        check(contents["CHANGELOG.md"] == sources["CHANGELOG.md"], "Outer changelog differs from sources")
    if "SHA256SUMS" in contents:
        expected = "".join(f"{by_name[name]['sha256']}  {name}\n" for name in (chrome_name, sources_name))
        check(contents["SHA256SUMS"].decode("utf-8") == expected, "SHA256SUMS differs from package metadata")
    validate_qa(load_json(contents["release-qa.json"], "QA record"), version, commit, item_id)
    report = {
        "schema_version": 1, "verified": True, "run_id": str(run_id), "artifact_id": str(artifact_id),
        "artifact_name": artifact_name, "artifact_sha256": digest, "source_commit": commit,
        "version": version, "proposed_tag": f"v{version}", "item_id": item_id,
        "chrome_zip": chrome_name, "chrome_zip_sha256": sha256(contents[chrome_name]),
        "chrome_zip_bytes": len(contents[chrome_name]),
    }
    if output_dir is not None:
        destination = Path(output_dir)
        # Never overwrite an existing directory, symlink or file. Extract only
        # the four explicitly validated files, not arbitrary archive paths.
        destination.mkdir(mode=0o700, parents=False, exist_ok=False)
        for name in sorted(required):
            with (destination / name).open("xb") as output:
                output.write(contents[name])
        report["output_dir"] = str(destination.resolve())
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["verify"])
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--provenance", required=True, type=Path)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--artifact-id", required=True)
    parser.add_argument("--candidate-sha", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--item-id", required=True)
    parser.add_argument("--artifact-name", required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    provenance = load_json(read_bounded(args.provenance, 1024 * 1024), "GitHub provenance")
    report = verify_artifact(args.archive, provenance, run_id=args.run_id, artifact_id=args.artifact_id,
                             commit=args.candidate_sha, version=args.version, item_id=args.item_id,
                             artifact_name=args.artifact_name, output_dir=args.output_dir)
    encoded = json.dumps(report, indent=2) + "\n"
    if args.report:
        with args.report.open("x", encoding="utf-8") as output:
            output.write(encoded)
    print(encoded, end="")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, TypeError, OSError, UnicodeError, zipfile.BadZipFile, RuntimeError) as error:
        print(f"Chrome artifact verification failed: {error}", file=sys.stderr)
        sys.exit(1)
