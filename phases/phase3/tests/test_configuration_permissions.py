from __future__ import annotations

import stat
import tempfile
import unittest
from pathlib import Path

from honeyprobe_module3.builtins import (
    CONFIGURATION_FILE_CONTROL_ID,
    ConfigurationFilePermissionTest,
    RestrictConfigurationFilePermissions,
)
from honeyprobe_module3.config import Module3Config
from honeyprobe_module3.engine import HardeningEngine
from honeyprobe_module3.models import (
    ActionStatus,
    FindingConfidence,
    FindingSeverity,
    ResultStatus,
)


class ConfigurationFilePermissionTests(unittest.TestCase):
    def _run(
        self,
        target: Path,
        *,
        apply_changes: bool = False,
        approved: bool = True,
        allowed_roots: tuple[Path, ...] | None = None,
    ):
        roots = allowed_roots if allowed_roots is not None else (target.parent,)
        config = Module3Config(
            apply_changes=apply_changes,
            approved_controls=(
                frozenset({CONFIGURATION_FILE_CONTROL_ID}) if approved else frozenset()
            ),
            allowed_roots=roots,
        )
        return HardeningEngine(
            config,
            [ConfigurationFilePermissionTest(target)],
            [RestrictConfigurationFilePermissions()],
        ).run()

    def test_pass_includes_path_and_permission_mode_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "honeyprobe.toml"
            target.write_text("[engine]\n", encoding="utf-8")
            target.chmod(0o640)

            summary = self._run(target)

            result = summary.tests[0]
            self.assertEqual(result.status, ResultStatus.PASS)
            self.assertEqual(result.evidence["path"], str(target.resolve()))
            self.assertEqual(result.evidence["current_mode"], "0o640")
            self.assertEqual(summary.hardening, ())

    def test_fail_recommends_configuration_control_with_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "honeyprobe.toml"
            target.write_text("[engine]\n", encoding="utf-8")
            target.chmod(0o666)

            summary = self._run(target, approved=False)

            result = summary.tests[0]
            self.assertEqual(result.status, ResultStatus.FAIL)
            self.assertEqual(result.recommended_control, CONFIGURATION_FILE_CONTROL_ID)
            self.assertEqual(result.evidence["path"], str(target.resolve()))
            self.assertEqual(result.evidence["current_mode"], "0o666")
            self.assertEqual(result.evidence["forbidden_mask"], "0o22")

    def test_dry_run_previews_without_modifying_configuration_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "honeyprobe.toml"
            target.write_text("[engine]\n", encoding="utf-8")
            target.chmod(0o666)

            summary = self._run(target)

            action = summary.hardening[0]
            self.assertEqual(action.status, ActionStatus.PREVIEWED)
            self.assertFalse(action.changed)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o666)
            self.assertIsNotNone(action.verification)
            assert action.verification is not None
            self.assertEqual(action.verification.before.status, ResultStatus.FAIL)
            self.assertEqual(action.verification.after.status, ResultStatus.FAIL)
            self.assertFalse(action.verification.resolved)

    def test_apply_removes_only_group_and_world_write_bits(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "honeyprobe.toml"
            target.write_text("[engine]\n", encoding="utf-8")
            target.chmod(0o676)

            summary = self._run(target, apply_changes=True)

            action = summary.hardening[0]
            self.assertEqual(action.status, ActionStatus.APPLIED)
            self.assertTrue(action.changed)
            self.assertEqual(action.severity, FindingSeverity.MEDIUM)
            self.assertEqual(action.confidence, FindingConfidence.HIGH)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o654)
            self.assertIsNotNone(action.verification)
            assert action.verification is not None
            self.assertTrue(action.verification.resolved)
            self.assertEqual(action.verification.after.status, ResultStatus.PASS)
            self.assertEqual(action.verification.before.severity, FindingSeverity.MEDIUM)
            self.assertEqual(action.verification.before.confidence, FindingConfidence.HIGH)
            self.assertEqual(action.verification.after.severity, FindingSeverity.MEDIUM)
            self.assertEqual(action.verification.after.confidence, FindingConfidence.HIGH)
            self.assertTrue(summary.healthy)

    def test_unapproved_configuration_control_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "honeyprobe.toml"
            target.write_text("[engine]\n", encoding="utf-8")
            target.chmod(0o666)

            summary = self._run(target, approved=False)

            self.assertEqual(summary.hardening[0].status, ActionStatus.BLOCKED)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o666)
            self.assertFalse(summary.hardening[0].resolved)

    def test_configuration_file_outside_allowed_roots_is_not_hardened(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "honeyprobe.toml"
            target.write_text("[engine]\n", encoding="utf-8")
            target.chmod(0o666)

            summary = self._run(
                target,
                apply_changes=True,
                allowed_roots=(Path(directory) / "different-root",),
            )

            self.assertEqual(summary.tests[0].status, ResultStatus.ERROR)
            self.assertEqual(summary.hardening, ())
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o666)


if __name__ == "__main__":
    unittest.main()