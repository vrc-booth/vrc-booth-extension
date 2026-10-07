#!/usr/bin/env python3
"""Validate WXT outputs locally. No network, tag, signing, or publication operations."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys
import tempfile
import zipfile

CHROME_ID = "hafbafjoecfjdlhjilpakabocglkaegj"
HOSTS = {"*://vbt.kamyu.me/api/**/*", "*://discord.com/**/*"}
MATCHES = {"*://*.booth.pm/items/*", "*://booth.pm/*/items/*"}


def check(condition, message):
    if not condition:
        raise ValueError(message)


def archive_contents(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        check(len(names) == len(set(names)), f"{path}: duplicate ZIP entries")
        for name in names:
            check(not name.startswith("/") and ".." not in PurePosixPath(name).parts
                  and "\\" not in name, f"{path}: unsafe entry {name}")
            check(not name.endswith(".pyc") and "__pycache__" not in name,
                  f"{path}: generated Python bytecode in source package")
        check(archive.testzip() is None, f"{path}: invalid ZIP CRC")
        return {name: archive.read(name) for name in names if not name.endswith("/")}


def normalize_archive(path):
    """Remove WXT's wall-clock ZIP timestamps and sort entries for stable archives."""
    contents = archive_contents(path)
    fd, temporary = tempfile.mkstemp(prefix="release-", suffix=".zip", dir=path.parent)
    os.close(fd)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, content in sorted(contents.items()):
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate_extension(contents, manifest, version, browser):
    check(json.loads(contents["manifest.json"]) == manifest, f"{browser}: archived manifest differs from build")
    check(manifest.get("version") == version, f"{browser}: manifest version mismatch")
    check(manifest.get("manifest_version") == (3 if browser == "chrome" else 2), f"{browser}: manifest format changed")
    check(manifest.get("name") == "boothplus", f"{browser}: extension name changed")
    check(manifest.get("default_locale") == "ko", f"{browser}: default locale changed")
    permissions = set(manifest.get("permissions", []))
    check(set(manifest.get("host_permissions", [])) == (HOSTS if browser == "chrome" else set()),
          f"{browser}: host_permissions changed; review scope before packaging")
    expected = {"identity", "tabs", "storage"} | ({"sidePanel"} if browser == "chrome" else HOSTS)
    check(permissions == expected, f"{browser}: permission scope changed: {sorted(permissions)}")
    scripts = manifest.get("content_scripts", [])
    check(len(scripts) == 1 and set(scripts[0].get("matches", [])) == MATCHES,
          f"{browser}: BOOTH content-script matches changed")
    resources = ["account.html", "background.js", "_locales/ko/messages.json", "_locales/en/messages.json", "_locales/ja/messages.json"]
    resources += list(manifest.get("icons", {}).values())
    resources += scripts[0].get("js", []) + scripts[0].get("css", [])
    if browser == "chrome":
        check(manifest.get("background", {}).get("service_worker") == "background.js", "Chrome background worker missing")
        key = manifest.get("key", "")
        check(key, "Chrome stable public key missing")
        digest = hashlib.sha256(base64.b64decode(key, validate=True)).hexdigest()[:32]
        extension_id = "".join(chr(97 + int(digit, 16)) for digit in digest)
        check(extension_id == CHROME_ID, "Chrome extension ID changed")
        resources.append(manifest.get("side_panel", {}).get("default_path", ""))
    else:
        check("key" not in manifest and "side_panel" not in manifest, "Chrome-only manifest keys leaked into Firefox")
        check(manifest.get("background", {}).get("scripts") == ["background.js"], "Firefox background script missing")
    for resource in resources:
        check(resource and resource in contents, f"{browser}: referenced resource missing: {resource}")
    check(not any(name.endswith(".map") for name in contents), f"{browser}: unexpected source maps")


def release_blockers(manifests):
    blockers = []
    firefox = manifests["firefox"]
    gecko = firefox.get("browser_specific_settings", {}).get("gecko", {})
    if not gecko.get("id"):
        blockers.append("Firefox publisher-approved stable Gecko ID and its registered OAuth redirect are not configured")
    if not gecko.get("data_collection_permissions", {}).get("required"):
        blockers.append("Firefox AMO data-collection disclosure must be reviewed and configured before submission")
    return blockers


def verify(root, normalize=False, release_ready=False):
    pkg = json.loads((root / "package.json").read_text())
    version = pkg["version"]
    check(pkg["name"] == "boothplus" and re.fullmatch(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)", version), "Invalid release metadata")
    names = [f"boothplus-{version}-{target}.zip" for target in ("chrome", "firefox", "sources")]
    manifests = {}
    artifacts = []
    for target, name in zip(("chrome", "firefox", "sources"), names):
        path = root / "dist" / name
        check(path.is_file(), f"Missing expected WXT artifact: {path}")
        contents = archive_contents(path)
        if target == "sources":
            for required in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "wxt.config.ts", "scripts/release-packages.py"):
                check(required in contents, f"Source archive missing {required}")
            check(json.loads(contents["package.json"])["version"] == version, "Source package version mismatch")
            for name_in_zip, data in contents.items():
                check((root / name_in_zip).is_file() and (root / name_in_zip).read_bytes() == data,
                      f"Source archive differs from checkout: {name_in_zip}")
        else:
            directory = root / "dist" / ("chrome-mv3" if target == "chrome" else "firefox-mv2")
            manifest = json.loads((directory / "manifest.json").read_text())
            validate_extension(contents, manifest, version, target)
            expected_files = {path.relative_to(directory).as_posix(): path.read_bytes() for path in directory.rglob("*") if path.is_file()}
            check(contents == expected_files, f"{target}: ZIP contents do not exactly match the build directory")
            manifests[target] = manifest
        if normalize:
            normalize_archive(path)
            check(archive_contents(path) == contents, f"{target}: normalization changed content")
        artifacts.append({"file": path.name, "bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    git = lambda *args: subprocess.check_output(["git", *args], cwd=root, text=True).strip()
    dirty = bool(git("status", "--porcelain", "--untracked-files=normal"))
    blockers = release_blockers(manifests)
    if dirty:
        blockers.append("Working tree has uncommitted changes; artifacts are local candidates, not a verified release commit")
    qa_path = root / "dist" / "release-qa.json"
    if not qa_path.is_file():
        blockers.append("Installed Chrome/Firefox QA attestation for the exact candidate is missing")
    if release_ready:
        check(not blockers, "Release blocked: " + "; ".join(blockers))
        qa = json.loads(qa_path.read_text())
        check(qa.get("source_commit") == git("rev-parse", "HEAD") and qa.get("version") == version, "QA evidence is stale")
        check(qa["browsers"]["chrome"]["extension_id"] == CHROME_ID, "Chrome QA used a different extension ID")
        check(qa["browsers"]["chrome"]["oauth_redirect"].startswith(f"https://{CHROME_ID}.chromiumapp.org/"), "Chrome QA redirect differs from stable identity")
        check(qa["browsers"]["firefox"]["extension_id"] == manifests["firefox"]["browser_specific_settings"]["gecko"]["id"], "Firefox QA used a different extension ID")
    report = {"version": version, "proposed_tag": f"v{version}", "source_commit": git("rev-parse", "HEAD"),
              "working_tree_dirty": dirty, "publication_performed": False,
              "chrome_extension_id": CHROME_ID, "release_blockers": blockers,
              "lockfile_sha256": hashlib.sha256((root / "pnpm-lock.yaml").read_bytes()).hexdigest(),
              "package_manager": pkg.get("packageManager"), "artifacts": artifacts}
    (root / "dist" / "release-manifest.json").write_text(json.dumps(report, indent=2) + "\n")
    (root / "dist" / "SHA256SUMS").write_text("".join(f"{item['sha256']}  {item['file']}\n" for item in artifacts))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--normalize", action="store_true")
    parser.add_argument("--release-ready", action="store_true")
    args = parser.parse_args()
    print(json.dumps(verify(Path.cwd(), args.normalize, args.release_ready), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, zipfile.BadZipFile) as error:
        print(f"Packaging validation failed: {error}", file=sys.stderr)
        sys.exit(1)
