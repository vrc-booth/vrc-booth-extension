import importlib.util
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


if __name__ == "__main__":
    unittest.main()
