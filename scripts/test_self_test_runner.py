#!/usr/bin/env python3
"""Unit tests for the HoneyProbe self-test runner's exit-status contract."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch


RUNNER_PATH = Path(__file__).with_name("self-test-honeyprobe.py")
SPEC = importlib.util.spec_from_file_location("honeyprobe_self_test_runner", RUNNER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load the HoneyProbe self-test runner.")
RUNNER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RUNNER)


class SelfTestRunnerExitCodeTests(unittest.TestCase):
    def test_successful_suite_with_tests_is_pass(self) -> None:
        status, reason = RUNNER.classify_command_result(
            0,
            "Ran 2 tests in 0.01s\nOK\n",
        )
        self.assertEqual(status, "PASS")
        self.assertIsNone(reason)

    def test_ansi_colored_summary_is_still_counted(self) -> None:
        status, reason = RUNNER.classify_command_result(
            0,
            "\x1b[32mRan 4 tests in 0.01s\x1b[0m\n"
            "\x1b[32mOK\x1b[0m\n",
        )
        self.assertEqual(status, "PASS")
        self.assertIsNone(reason)

    def test_skipped_tests_are_blocked_not_passed(self) -> None:
        status, reason = RUNNER.classify_command_result(
            0,
            "Ran 2 tests in 0.01s\nOK (skipped=1)\n",
        )
        self.assertEqual(status, "BLOCKED")
        self.assertIn("Required tests were skipped", reason or "")

    def test_tap_reported_skips_are_blocked_not_passed(self) -> None:
        status, reason = RUNNER.classify_command_result(
            0,
            "TAP version 13\n1..2\n# tests 2\n# pass 1\n# fail 0\n# skipped 1\n",
        )
        self.assertEqual(status, "BLOCKED")
        self.assertIn("skipped", reason or "")

    def test_optional_skipped_tests_are_reported_as_skipped(self) -> None:
        status, reason = RUNNER.classify_command_result(
            0,
            "Ran 2 tests in 0.01s\nOK (skipped=1)\n",
            required=False,
        )
        self.assertEqual(status, "SKIPPED")
        self.assertIn("Optional tests were skipped", reason or "")

    def test_zero_test_suite_is_blocked_not_passed(self) -> None:
        status, reason = RUNNER.classify_command_result(
            0,
            "Ran 0 tests in 0.01s\nOK\n",
        )
        self.assertEqual(status, "BLOCKED")
        self.assertIn("zero tests", reason or "")

    def test_zero_test_tap_suite_is_blocked_not_passed(self) -> None:
        status, reason = RUNNER.classify_command_result(
            0,
            "TAP version 13\n1..0\n# tests 0\n# pass 0\n# fail 0\n# skipped 0\n",
        )
        self.assertEqual(status, "BLOCKED")
        self.assertIn("zero tests", reason or "")

    def test_missing_executable_is_blocked(self) -> None:
        with patch.object(RUNNER, "RESULTS", []):
            RUNNER.run_command(
                "Missing test executable",
                ["/definitely/not/a/honeyprobe-test-executable"],
                timeout=1,
            )
            result = RUNNER.RESULTS[-1]
        self.assertEqual(result["status"], "BLOCKED")
        self.assertIn("unavailable", result["reason"])

    def test_failed_test_discovery_is_fail(self) -> None:
        status, reason = RUNNER.classify_command_result(
            2,
            "ImportError: Failed to import test module\nRan 0 tests in 0.01s\n",
        )
        self.assertEqual(status, "FAIL")
        self.assertIn("status 2", reason or "")

    def test_failed_suite_is_fail(self) -> None:
        status, reason = RUNNER.classify_command_result(
            1,
            "Ran 2 tests in 0.01s\nFAILED (failures=1)\n",
        )
        self.assertEqual(status, "FAIL")
        self.assertIn("status 1", reason or "")

    def test_all_pass_returns_zero(self) -> None:
        self.assertEqual(
            RUNNER.self_test_exit_code(
                {"PASS": 5, "FAIL": 0, "BLOCKED": 0, "SKIPPED": 0}
            ),
            0,
        )

    def test_optional_skips_do_not_hide_required_failures_or_blockers(self) -> None:
        self.assertEqual(
            RUNNER.self_test_exit_code(
                {"PASS": 5, "FAIL": 0, "BLOCKED": 0, "SKIPPED": 1}
            ),
            0,
        )

    def test_required_failure_returns_nonzero_even_with_other_blockers(self) -> None:
        self.assertEqual(
            RUNNER.self_test_exit_code(
                {"PASS": 3, "FAIL": 1, "BLOCKED": 2, "SKIPPED": 1}
            ),
            1,
        )

    def test_blocked_required_layer_returns_nonzero(self) -> None:
        self.assertEqual(
            RUNNER.self_test_exit_code(
                {"PASS": 3, "FAIL": 0, "BLOCKED": 1, "SKIPPED": 1}
            ),
            2,
        )


if __name__ == "__main__":
    unittest.main()
