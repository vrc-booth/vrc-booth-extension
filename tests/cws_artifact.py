import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location("cws_artifact", ROOT / "scripts/cws-artifact.py")
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
SHA = "1" * 40
VERSION = "3.3.0"
KEY = re.search(r'undefined : "([A-Za-z0-9+/=]+)"', (ROOT / "wxt.config.ts").read_text()).group(1)
CHROME = f"boothplus-{VERSION}-chrome.zip"
SOURCES = f"boothplus-{VERSION}-sources.zip"
NAME = f"boothplus-chrome-{VERSION}-{SHA}"


def encoded(value):
    return json.dumps(value).encode()


def archive(files):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as target:
        for name, content in files.items():
            target.writestr(name, content)
    return buffer.getvalue()


def fixture():
    source_files = {"package.json": encoded({"name": "boothplus", "version": VERSION, "packageManager": "pnpm@11.19.0"}),
                    "CHANGELOG.md": f"# Changes\n\n## {VERSION} — candidate\n\nChange\n".encode(),
                    "pnpm-lock.yaml": b"lockfileVersion: '9.0'\n"}
    files = {CHROME: archive({"manifest.json": encoded({"name": "boothplus", "version": VERSION,
                                                       "manifest_version": 3, "key": KEY})}),
             SOURCES: archive(source_files)}
    report = {"version": VERSION, "proposed_tag": f"v{VERSION}", "source_commit": SHA,
              "working_tree_dirty": False, "publication_performed": False,
              "chrome_extension_id": verifier.CHROME_ID, "release_blockers": [],
              "package_manager": "pnpm@11.19.0", "lockfile_sha256": verifier.sha256(source_files["pnpm-lock.yaml"]),
              "artifacts": [{"file": name, "bytes": len(content), "sha256": verifier.sha256(content)} for name, content in files.items()]}
    files["release-manifest.json"] = encoded(report)
    files["release-qa.json"] = encoded({"schema_version": 1, "version": VERSION, "source_commit": SHA,
        "integration_issue": "https://github.com/vrc-booth/vrc-booth-extension/issues/30",
        "qa_issue": "https://github.com/vrc-booth/vrc-booth-extension/issues/31",
        "tester": "Installed-browser tester", "tested_at": "2026-01-01T12:00:00Z", "blockers": [],
        "browsers": {"chrome": {"browser_version": "123", "extension_id": verifier.CHROME_ID,
            "oauth_redirect": verifier.CHROME_REDIRECT, "evidence_url": "https://example.test/installed-qa",
            "scenarios": {scenario: "passed" for scenario in verifier.QA_SCENARIOS}}}})
    provenance = {"run": {"id": 123, "path": verifier.WORKFLOW_PATH, "head_sha": SHA,
                           "head_branch": "main", "event": "workflow_dispatch", "status": "completed", "conclusion": "success"},
                  "artifact": {"id": 456, "name": NAME, "expired": False,
                               "workflow_run": {"id": 123, "head_sha": SHA, "head_branch": "main"}}}
    return files, provenance


class ImmutableChromeArtifactTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.files, self.provenance = fixture()
        self.path = self.root / "downloaded.zip"
        self.options = dict(run_id="123", artifact_id="456", commit=SHA, version=VERSION,
                            item_id=verifier.CHROME_ID, artifact_name=NAME)
        self.save()

    def save(self):
        self.path.write_bytes(archive(self.files))
        self.provenance["artifact"]["digest"] = "sha256:" + verifier.sha256(self.path.read_bytes())

    def verify(self, **kwargs):
        return verifier.verify_artifact(self.path, self.provenance, **(self.options | kwargs))

    def mutate_json(self, name, mutation):
        obj = json.loads(self.files[name])
        mutation(obj)
        self.files[name] = encoded(obj)
        self.save()

    def mutate_inner(self, name, member, content):
        inner = verifier.safe_archive(self.files[name], "fixture")
        inner[member] = content
        self.files[name] = archive(inner)
        report = json.loads(self.files["release-manifest.json"])
        for item in report["artifacts"]:
            if item["file"] == name:
                item.update(bytes=len(self.files[name]), sha256=verifier.sha256(self.files[name]))
        self.files["release-manifest.json"] = encoded(report)
        self.save()

    def test_valid_exact_bytes_are_extracted_without_rebuild(self):
        output = self.root / "verified"
        before = self.files[CHROME]
        with patch("subprocess.run", side_effect=AssertionError("Must not rebuild")):
            report = self.verify(output_dir=output)
        self.assertTrue(report["verified"])
        self.assertEqual((output / CHROME).read_bytes(), before)
        self.assertEqual(report["chrome_zip_sha256"], hashlib.sha256(before).hexdigest())
        self.assertEqual(set(path.name for path in output.iterdir()), set(self.files))

    def test_does_not_overwrite_output_or_follow_existing_symlink(self):
        for symlink in (False, True):
            destination = self.root / str(symlink)
            if symlink:
                destination.symlink_to(self.root, target_is_directory=True)
            else:
                destination.mkdir()
            with self.assertRaises(FileExistsError):
                self.verify(output_dir=destination)

    def test_same_artifact_id_cannot_hide_downloaded_byte_mutation(self):
        self.path.write_bytes(self.path.read_bytes() + b"tampered")
        with self.assertRaisesRegex(ValueError, "trusted API digest"):
            self.verify()

    def test_repacked_same_content_requires_the_original_outer_digest(self):
        self.path.write_bytes(archive(dict(reversed(list(self.files.items())))))
        with self.assertRaisesRegex(ValueError, "trusted API digest"):
            self.verify()

    def test_wrong_expected_identity_version_or_artifact_name(self):
        for field, value in (("run_id", "321"), ("artifact_id", "654"), ("commit", "2" * 40),
                             ("item_id", "a" * 32), ("version", "3.3.1"), ("artifact_name", "arbitrary-name")):
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.verify(**{field: value})

    def test_rejects_each_untrusted_provenance_change(self):
        mutations = [("run", "path", ".github/workflows/node.js.yml"), ("run", "head_sha", "2" * 40),
            ("run", "head_branch", "dev"), ("run", "event", "pull_request"),
            ("run", "status", "in_progress"), ("run", "conclusion", "failure"),
            ("artifact", "expired", True), ("artifact", "digest", None),
            ("artifact", "name", "different"), ("artifact", "workflow_run", {"id": 999, "head_sha": SHA, "head_branch": "main"})]
        original = copy.deepcopy(self.provenance)
        for section, field, value in mutations:
            self.provenance = copy.deepcopy(original)
            self.provenance[section][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.verify()

    def test_missing_digest_is_not_accepted_even_when_package_hash_matches(self):
        del self.provenance["artifact"]["digest"]
        with self.assertRaisesRegex(ValueError, "Trusted API"):
            self.verify()

    def test_all_versions_are_strict_and_nonzero(self):
        for version in ("0.0.0", "3.3", "03.3.0", "3.3.0.0", "3.3.0-beta", "65536.0.0", "3.3.0\n", "3.3.٠"):
            with self.subTest(version=version), self.assertRaises(ValueError):
                verifier.version_ok(version)

    def test_altered_package_hash_or_size_fails_even_with_new_outer_digest(self):
        original = copy.deepcopy(self.files)
        for field, value in (("sha256", "0" * 64), ("bytes", 1), ("bytes", True)):
            self.files = copy.deepcopy(original)
            self.mutate_json("release-manifest.json", lambda report: report["artifacts"][0].update({field: value}))
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, "metadata"):
                self.verify()

    def test_replaced_chrome_zip_without_matching_metadata_is_rejected(self):
        self.files[CHROME] += b"changed"
        self.save()
        with self.assertRaisesRegex(ValueError, "metadata"):
            self.verify()

    def test_nested_zip_paths_and_duplicate_manifest_names_are_rejected(self):
        self.mutate_inner(SOURCES, "../package.json", b"untrusted")
        with self.assertRaisesRegex(ValueError, "unsafe ZIP path"):
            self.verify()

    def test_optional_changelog_and_checksums_are_validated_but_not_extracted(self):
        sources = verifier.safe_archive(self.files[SOURCES], "fixture")
        self.files["CHANGELOG.md"] = sources["CHANGELOG.md"]
        report = json.loads(self.files["release-manifest.json"])
        self.files["SHA256SUMS"] = "".join(f"{item['sha256']}  {item['file']}\n" for item in report["artifacts"]).encode()
        self.save()
        output = self.root / "verified"
        self.verify(output_dir=output)
        self.assertNotIn("CHANGELOG.md", [path.name for path in output.iterdir()])
        self.files["SHA256SUMS"] += b"forged"
        self.save()
        with self.assertRaisesRegex(ValueError, "SHA256SUMS"):
            self.verify()

    def test_release_manifest_integrity_fields(self):
        original = copy.deepcopy(self.files)
        for field, value in (("source_commit", "2" * 40), ("version", "3.3.1"), ("proposed_tag", "v3.3.1"),
                             ("working_tree_dirty", True), ("publication_performed", True),
                             ("chrome_extension_id", "a" * 32), ("release_blockers", ["pending"]),
                             ("artifacts", []), ("package_manager", "pnpm@0.0.0"), ("lockfile_sha256", "0" * 64)):
            self.files = copy.deepcopy(original)
            self.mutate_json("release-manifest.json", lambda report: report.update({field: value}))
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.verify()

    def test_modified_chrome_manifest_version_or_key_is_rejected(self):
        original = copy.deepcopy(self.files)
        for field, value in (("version", "3.3.1"), ("key", "d3Jvbmc="), ("manifest_version", 2)):
            self.files = copy.deepcopy(original)
            manifest = json.loads(verifier.safe_archive(self.files[CHROME], "fixture")["manifest.json"])
            manifest[field] = value
            self.mutate_inner(CHROME, "manifest.json", encoded(manifest))
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.verify()

    def test_source_package_version_changelog_and_lockfile_are_bound(self):
        original = copy.deepcopy(self.files)
        for name, content in (("package.json", encoded({"name": "boothplus", "version": "3.3.1"})),
                              ("CHANGELOG.md", b"## 3.3.1\nWrong candidate\n"),
                              ("pnpm-lock.yaml", b"different-lockfile")):
            self.files = copy.deepcopy(original)
            self.mutate_inner(SOURCES, name, content)
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.verify()

    def test_all_chrome_qa_scenarios_remain_mandatory(self):
        original = copy.deepcopy(self.files)
        for scenario in verifier.QA_SCENARIOS:
            self.files = copy.deepcopy(original)
            self.mutate_json("release-qa.json", lambda qa: qa["browsers"]["chrome"]["scenarios"].update({scenario: "not_run"}))
            with self.subTest(scenario=scenario), self.assertRaisesRegex(ValueError, scenario):
                self.verify()

    def test_qa_candidate_identity_redirect_date_and_blockers(self):
        original = copy.deepcopy(self.files)
        for scope, field, value in (("root", "source_commit", "2" * 40), ("root", "version", "3.3.1"),
                ("root", "tested_at", "2999-01-01T00:00:00Z"), ("root", "blockers", ["pending"]),
                ("chrome", "extension_id", "a" * 32), ("chrome", "oauth_redirect", verifier.CHROME_REDIRECT + "bad"),
                ("chrome", "evidence_url", "http://example.test/qa")):
            self.files = copy.deepcopy(original)
            self.mutate_json("release-qa.json", lambda qa: (qa if scope == "root" else qa["browsers"]["chrome"]).update({field: value}))
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.verify()

    def test_unexpected_or_missing_outer_members_rejected(self):
        original = copy.deepcopy(self.files)
        for operation in (lambda: self.files.update({"boothplus-3.3.0-firefox.zip": b"no"}),
                          lambda: self.files.pop("release-qa.json")):
            self.files = copy.deepcopy(original)
            operation()
            self.save()
            with self.assertRaisesRegex(ValueError, "missing or unexpected"):
                self.verify()

    def test_cli_fails_closed_and_emits_verified_report(self):
        provenance = self.root / "provenance.json"
        provenance.write_text(json.dumps(self.provenance))
        command = [sys.executable, "-B", str(ROOT / "scripts/cws-artifact.py"), "verify", "--archive", str(self.path),
                   "--provenance", str(provenance), "--run-id", "123", "--artifact-id", "456", "--candidate-sha", SHA,
                   "--version", VERSION, "--item-id", verifier.CHROME_ID, "--artifact-name", NAME,
                   "--output-dir", str(self.root / "verified"), "--report", str(self.root / "verification.json")]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)["verified"])
        self.path.write_bytes(b"tampered")
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("trusted API digest", result.stderr)


class HostileArchiveTests(unittest.TestCase):
    def test_traversal_absolute_backslash_windows_and_empty_path_segments(self):
        for name in ("../secret", "/absolute", "a\\b", "C:/foo", "a//b", "a/./b", "a/../b", "./file"):
            with self.subTest(name=name), self.assertRaises(ValueError):
                verifier.safe_archive(archive({name: b"content"}), "fixture")

    def test_duplicate_names_case_aliases_and_file_directory_conflict(self):
        for names in (("file", "file"), ("file", "FILE"), ("file", "file/child"), ("FILE", "file/child")):
            buffer = io.BytesIO()
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                with zipfile.ZipFile(buffer, "w") as target:
                    for name in names:
                        target.writestr(name, b"content")
            with self.subTest(names=names), self.assertRaises(ValueError):
                verifier.safe_archive(buffer.getvalue(), "fixture")

    def test_symlink_and_special_entries_fail(self):
        for mode in (stat.S_IFLNK, stat.S_IFIFO, stat.S_IFSOCK):
            info = zipfile.ZipInfo("entry")
            info.create_system = 3
            info.external_attr = (mode | 0o644) << 16
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as target:
                target.writestr(info, b"target")
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, "special"):
                verifier.safe_archive(buffer.getvalue(), "fixture")

    def test_size_count_expansion_and_compression_limits(self):
        data = archive({"one": b"a" * 100, "two": b"b" * 100})
        for constant, value in (("MAX_ARCHIVE_BYTES", 2), ("MAX_FILE_BYTES", 50), ("MAX_TOTAL_BYTES", 150),
                                ("MAX_ENTRIES", 1), ("MAX_COMPRESSION_RATIO", 2)):
            with self.subTest(limit=constant), patch.object(verifier, constant, value), self.assertRaises(ValueError):
                verifier.safe_archive(data, "fixture")

    def test_json_duplicate_keys_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate JSON"):
            verifier.load_json('{"version":"3.3.0", "version":"3.3.1"}', "fixture")


if __name__ == "__main__":
    unittest.main()
