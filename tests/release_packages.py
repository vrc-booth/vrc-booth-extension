import importlib.util
import json
import re
from unittest.mock import patch
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location("release_packages", Path(__file__).parents[1] / "scripts/release-packages.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseArchiveTests(unittest.TestCase):
    def test_normalization_is_byte_identical_for_different_timestamps_and_order(self):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory) / f"{n}.zip" for n in (1, 2)]
            for index, path in enumerate(paths):
                with zipfile.ZipFile(path, "w") as archive:
                    for name in (["b.js", "manifest.json"] if index == 0 else ["manifest.json", "b.js"]):
                        info = zipfile.ZipInfo(name, (2020 + index, 1, 1, 0, 0, 0))
                        archive.writestr(info, b"same-content")
            self.assertNotEqual(paths[0].read_bytes(), paths[1].read_bytes())
            for path in paths:
                release.normalize_archive(path)
            self.assertEqual(paths[0].read_bytes(), paths[1].read_bytes())
            self.assertEqual(release.archive_contents(paths[0]), {"b.js": b"same-content", "manifest.json": b"same-content"})

    def test_rejects_path_traversal_and_bytecode(self):
        for name in ("../secret", "/absolute", "foo\\bar", "__pycache__/foo.pyc"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "invalid.zip"
                with zipfile.ZipFile(path, "w") as archive:
                    archive.writestr(name, b"invalid")
                with self.assertRaises(ValueError):
                    release.archive_contents(path)

    def test_missing_firefox_identity_and_disclosure_block_release(self):
        self.assertEqual(len(release.release_blockers({"firefox": {}})), 2)
        self.assertEqual(release.release_blockers({"firefox": {"browser_specific_settings": {"gecko": {
            "id": "test@example.test", "data_collection_permissions": {"required": ["authenticationInfo"]}
        }}}}), [])

    def test_invalid_or_mismatched_manifests_do_not_pass(self):
        with self.assertRaises(ValueError):
            release.validate_extension({"manifest.json": b'{"version":"3.2.0"}'}, {"version": "3.3.0"}, "3.3.0", "chrome")
        with self.assertRaises(ValueError):
            release.validate_extension({"manifest.json": b'{"version":"3.2.0"}'}, {"version": "3.2.0"}, "3.3.0", "chrome")


class ChromeOnlyPackagingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.commit = "1" * 40
        self.version = "3.3.0"
        actual_root = Path(__file__).parents[1]
        key = re.search(r'undefined : "([A-Za-z0-9+/=]+)"', (actual_root / "wxt.config.ts").read_text()).group(1)
        self.manifest = {
            "name": "boothplus", "version": self.version, "manifest_version": 3,
            "default_locale": "ko", "permissions": ["identity", "tabs", "storage", "sidePanel"],
            "host_permissions": list(release.HOSTS), "content_scripts": [{"matches": list(release.MATCHES)}],
            "background": {"service_worker": "background.js"}, "key": key,
            "side_panel": {"default_path": "account.html"},
        }
        chrome = {name: b"fixture" for name in ["account.html", "background.js", "_locales/ko/messages.json",
                                                "_locales/en/messages.json", "_locales/ja/messages.json"]}
        chrome["manifest.json"] = json.dumps(self.manifest).encode()
        for name, content in chrome.items():
            path = self.root / "dist/chrome-mv3" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        sources = {
            "package.json": json.dumps({"name": "boothplus", "version": self.version, "packageManager": "bun@1.4.2"}).encode(),
            "bun.lock": b"lockfile", "bunfig.toml": b'[install]\nlinker = "isolated"\n', "wxt.config.ts": b"fixture",
            "scripts/release-packages.py": b"fixture", "CHANGELOG.md": b"## 3.3.0\nCandidate\n",
        }
        for name, content in sources.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
        for browser, files in (("chrome", chrome), ("sources", sources)):
            with zipfile.ZipFile(self.root / "dist" / f"boothplus-{self.version}-{browser}.zip", "w") as target:
                for name, content in files.items():
                    target.writestr(name, content)
        cws_spec = importlib.util.spec_from_file_location("cws_artifact_fixture", actual_root / "scripts/cws-artifact.py")
        cws = importlib.util.module_from_spec(cws_spec)
        cws_spec.loader.exec_module(cws)
        self.qa = {"schema_version": 1, "source_commit": self.commit, "version": self.version,
            "integration_issue": "https://github.com/vrc-booth/vrc-booth-extension/issues/30",
            "qa_issue": "https://github.com/vrc-booth/vrc-booth-extension/issues/31",
            "tester": "Installed-browser tester", "tested_at": "2026-01-01T00:00:00Z", "blockers": [],
            "browsers": {"chrome": {"browser_version": "123", "extension_id": release.CHROME_ID,
                "oauth_redirect": f"https://{release.CHROME_ID}.chromiumapp.org/", "evidence_url": "https://example.test/qa",
                "scenarios": {scenario: "passed" for scenario in cws.QA_SCENARIOS}}}}
        self.write_qa()

    def write_qa(self):
        (self.root / "dist/release-qa.json").write_text(json.dumps(self.qa))

    def verify(self, chrome_only=True, release_ready=True, dirty=False):
        def git(command, **kwargs):
            return (" M package.json" if dirty else "") if command[1] == "status" else self.commit
        with patch.object(release.subprocess, "check_output", side_effect=git):
            return release.verify(self.root, release_ready=release_ready, chrome_only=chrome_only)

    def test_chrome_preparation_needs_no_firefox_build_or_qa(self):
        report = self.verify()
        self.assertEqual(report["release_blockers"], [])
        self.assertEqual([row["file"] for row in report["artifacts"]], ["boothplus-3.3.0-chrome.zip", "boothplus-3.3.0-sources.zip"])
        self.assertFalse(report["publication_performed"])

    def test_bun_lock_digest_and_manager_are_recorded(self):
        report = self.verify()
        self.assertEqual(report["package_manager"], "bun@1.4.2")
        self.assertEqual(report["lockfile_sha256"], release.hashlib.sha256((self.root / "bun.lock").read_bytes()).hexdigest())

    def test_source_archive_requires_exact_bun_lock_and_config(self):
        path = self.root / "dist" / f"boothplus-{self.version}-sources.zip"
        original = release.archive_contents(path)
        for name in ("bun.lock", "bunfig.toml"):
            for content in (None, b"tampered"):
                files = dict(original)
                if content is None:
                    files.pop(name)
                else:
                    files[name] = content
                with zipfile.ZipFile(path, "w") as target:
                    for member, data in files.items():
                        target.writestr(member, data)
                with self.subTest(name=name, content=content), self.assertRaisesRegex(ValueError, "missing|differs"):
                    self.verify()

    def test_default_path_still_requires_firefox(self):
        with self.assertRaisesRegex(ValueError, "firefox"):
            self.verify(chrome_only=False)

    def test_chrome_packaging_revalidates_qa_and_dirty_candidate(self):
        with self.assertRaisesRegex(ValueError, "uncommitted"):
            self.verify(dirty=True)
        self.qa["browsers"]["chrome"]["scenarios"]["service_worker_restart"] = "not_run"
        self.write_qa()
        with self.assertRaisesRegex(ValueError, "service_worker_restart"):
            self.verify()

    def test_chrome_exact_redirect_is_required(self):
        self.qa["browsers"]["chrome"]["oauth_redirect"] += "unexpected"
        self.write_qa()
        with self.assertRaisesRegex(ValueError, "redirect"):
            self.verify()


if __name__ == "__main__":
    unittest.main()
