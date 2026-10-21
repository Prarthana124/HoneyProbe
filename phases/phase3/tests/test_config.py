from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from honeyprobe_module3.config import Module3Config


class Module3ConfigTests(unittest.TestCase):
    def test_relative_paths_are_resolved_from_config_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            config_file = base / "module3.toml"
            config_file.write_text(
                """
[engine]
allowed_roots = ["managed"]
approved_controls = ["restrict-file-permissions"]

[[file_permission_targets]]
path = "managed/target"
""",
                encoding="utf-8",
            )

            config = Module3Config.from_toml(config_file)

            self.assertEqual(config.allowed_roots, ((base / "managed").resolve(),))
            self.assertEqual(
                config.file_permission_targets[0].path,
                (base / "managed/target").resolve(),
            )

    def test_configuration_file_targets_are_resolved_from_config_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            config_file = base / "module3.toml"
            config_file.write_text(
                """
[engine]
allowed_roots = ["managed"]
approved_controls = ["restrict-configuration-file-permissions"]

[[configuration_file_targets]]
path = "managed/honeyprobe.toml"
forbid_group_write = true
forbid_world_write = true
""",
                encoding="utf-8",
            )

            config = Module3Config.from_toml(config_file)

            self.assertEqual(
                config.configuration_file_targets[0].path,
                (base / "managed/honeyprobe.toml").resolve(),
            )


if __name__ == "__main__":
    unittest.main()