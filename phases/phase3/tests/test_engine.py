from __future__ import annotations

import stat
import tempfile
import unittest
from pathlib import Path

from honeyprobe_module3.builtins import FilePermissionTest, RestrictFilePermissions
from honeyprobe_module3.config import Module3Config
from honeyprobe_module3.engine import HardeningEngine
from honeyprobe_module3.models import (
    ActionStatus,
    FindingConfidence,
    FindingSeverity,
    HardeningResult,
    ResultStatus,
    TestResult,
)


class HardeningEngineTests(unittest.TestCase):
    def test_finding_metadata_is_preserved_on_retest_and_control_result(self) -> None:
        class MetadataDroppingTest:
            test_id = "metadata-dropping"
            calls = 0

            def run(self, context: object) -> TestResult:
                self.calls += 1
                if self.calls == 1:
                    return TestResult(
                        self.test_id,
                        ResultStatus.FAIL,
                        "initial failure",
                        recommended_control="metadata-control",
                        severity=FindingSeverity.CRITICAL,
                        confidence=FindingConfidence.HIGH,
                    )
                return TestResult(self.test_id, ResultStatus.PASS, "fixed")

        class MetadataDroppingControl:
            control_id = "metadata-control"

            def execute(self, finding: TestResult, context: object) -> HardeningResult:
                return HardeningResult(
                    self.control_id,
                    finding.test_id,
                    ActionStatus.APPLIED,
                    "applied",
                )

        summary = HardeningEngine(
            Module3Config(
                apply_changes=True,
                approved_controls=frozenset({"metadata-control"}),
            ),
            [MetadataDroppingTest()],
            [MetadataDroppingControl()],
        ).run()

        action = summary.hardening[0]
        self.assertEqual(action.severity, FindingSeverity.CRITICAL)
        self.assertEqual(action.confidence, FindingConfidence.HIGH)
        self.assertIsNotNone(action.after)
        assert action.after is not None
        self.assertEqual(action.after.severity, FindingSeverity.CRITICAL)
        self.assertEqual(action.after.confidence, FindingConfidence.HIGH)
        self.assertTrue(action.resolved)
        self.assertTrue(summary.healthy)

    def test_control_errors_are_recorded_and_retested_safely(self) -> None:
        class FailingTest:
            test_id = "control-error"

            def run(self, context: object) -> TestResult:
                return TestResult(
                    self.test_id,
                    ResultStatus.FAIL,
                    "failure",
                    recommended_control="raising-control",
                    severity=FindingSeverity.HIGH,
                    confidence=FindingConfidence.HIGH,
                )

        class RaisingControl:
            control_id = "raising-control"

            def execute(self, finding: TestResult, context: object) -> HardeningResult:
                raise RuntimeError("control unavailable")

        summary = HardeningEngine(
            Module3Config(
                approved_controls=frozenset({"raising-control"}),
            ),
            [FailingTest()],
            [RaisingControl()],
        ).run()

        action = summary.hardening[0]
        self.assertEqual(action.status, ActionStatus.ERROR)
        self.assertEqual(action.severity, FindingSeverity.HIGH)
        self.assertEqual(action.confidence, FindingConfidence.HIGH)
        self.assertIsNotNone(action.after)
        assert action.after is not None
        self.assertEqual(action.after.status, ResultStatus.FAIL)
        self.assertFalse(action.resolved)
        self.assertFalse(summary.healthy)

    def test_retest_errors_are_recorded_with_finding_metadata(self) -> None:
        class RaisesDuringRetest:
            test_id = "retest-error"
            calls = 0

            def run(self, context: object) -> TestResult:
                self.calls += 1
                if self.calls == 1:
                    return TestResult(
                        self.test_id,
                        ResultStatus.FAIL,
                        "initial failure",
                        recommended_control="preview-control",
                        severity=FindingSeverity.HIGH,
                        confidence=FindingConfidence.HIGH,
                    )
                raise RuntimeError("retest unavailable")

        class PreviewControl:
            control_id = "preview-control"

            def execute(self, finding: TestResult, context: object) -> HardeningResult:
                return HardeningResult(
                    self.control_id,
                    finding.test_id,
                    ActionStatus.PREVIEWED,
                    "previewed",
                    severity=finding.severity,
                    confidence=finding.confidence,
                )

        summary = HardeningEngine(
            Module3Config(
                approved_controls=frozenset({"preview-control"}),
            ),
            [RaisesDuringRetest()],
            [PreviewControl()],
        ).run()

        result = summary.hardening[0]
        self.assertIsNotNone(result.after)
        assert result.after is not None
        self.assertEqual(result.after.status, ResultStatus.ERROR)
        self.assertEqual(result.after.severity, FindingSeverity.HIGH)
        self.assertEqual(result.after.confidence, FindingConfidence.HIGH)
        self.assertFalse(result.resolved)
        self.assertFalse(summary.healthy)

    def test_existing_result_constructor_keeps_metadata_defaults(self) -> None:
        result = TestResult("existing-test", ResultStatus.PASS, "still supported")

        self.assertEqual(result.severity, FindingSeverity.MEDIUM)
        self.assertEqual(result.confidence, FindingConfidence.MEDIUM)

    def test_dry_run_previews_without_changing_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            target.write_text("test", encoding="utf-8")
            target.chmod(0o666)
            config = Module3Config(
                approved_controls=frozenset({"restrict-file-permissions"}),
                allowed_roots=(Path(directory),),
            )

            summary = HardeningEngine(
                config,
                [FilePermissionTest(target)],
                [RestrictFilePermissions()],
            ).run()

            self.assertEqual(summary.tests[0].status, ResultStatus.FAIL)
            self.assertEqual(summary.tests[0].severity, FindingSeverity.MEDIUM)
            self.assertEqual(summary.tests[0].confidence, FindingConfidence.HIGH)
            self.assertEqual(summary.hardening[0].status, ActionStatus.PREVIEWED)
            self.assertEqual(summary.hardening[0].severity, FindingSeverity.MEDIUM)
            self.assertEqual(summary.hardening[0].confidence, FindingConfidence.HIGH)
            self.assertEqual(len(summary.retests), 1)
            assert summary.hardening[0].verification is not None
            self.assertFalse(summary.hardening[0].verification.resolved)
            self.assertEqual(
                summary.hardening[0].verification.before.status,
                ResultStatus.FAIL,
            )
            self.assertEqual(
                summary.hardening[0].verification.after.status,
                ResultStatus.FAIL,
            )
            self.assertFalse(summary.healthy)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o666)

    def test_apply_removes_forbidden_write_bits(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            target.write_text("test", encoding="utf-8")
            target.chmod(0o666)
            config = Module3Config(
                apply_changes=True,
                approved_controls=frozenset({"restrict-file-permissions"}),
                allowed_roots=(Path(directory),),
            )

            summary = HardeningEngine(
                config,
                [FilePermissionTest(target)],
                [RestrictFilePermissions()],
            ).run()

            self.assertEqual(summary.hardening[0].status, ActionStatus.APPLIED)
            assert summary.hardening[0].verification is not None
            self.assertTrue(summary.hardening[0].verification.resolved)
            self.assertEqual(
                summary.hardening[0].verification.after.status,
                ResultStatus.PASS,
            )
            self.assertTrue(summary.healthy)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o644)

    def test_unapproved_control_is_blocked(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            target.write_text("test", encoding="utf-8")
            target.chmod(0o666)
            config = Module3Config(allowed_roots=(Path(directory),))

            summary = HardeningEngine(
                config,
                [FilePermissionTest(target)],
                [RestrictFilePermissions()],
            ).run()

            self.assertEqual(summary.hardening[0].status, ActionStatus.BLOCKED)
            self.assertEqual(summary.hardening[0].severity, FindingSeverity.MEDIUM)
            self.assertEqual(summary.hardening[0].confidence, FindingConfidence.HIGH)
            assert summary.hardening[0].verification is not None
            self.assertFalse(summary.hardening[0].verification.resolved)
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o666)

    def test_target_outside_allowed_roots_is_not_hardened(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "target"
            target.write_text("test", encoding="utf-8")
            target.chmod(0o666)
            config = Module3Config(
                apply_changes=True,
                approved_controls=frozenset({"restrict-file-permissions"}),
                allowed_roots=(Path(directory) / "different-root",),
            )

            summary = HardeningEngine(
                config,
                [FilePermissionTest(target)],
                [RestrictFilePermissions()],
            ).run()

            self.assertEqual(summary.tests[0].status, ResultStatus.ERROR)
            self.assertEqual(summary.hardening, ())
            self.assertEqual(stat.S_IMODE(target.stat().st_mode), 0o666)


if __name__ == "__main__":
    unittest.main()
