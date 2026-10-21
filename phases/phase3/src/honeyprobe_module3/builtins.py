"""Minimal built-in self-test and bounded hardening control."""

from __future__ import annotations

import stat
from dataclasses import dataclass
from pathlib import Path

from .models import (
    ActionStatus,
    ExecutionContext,
    FindingConfidence,
    FindingSeverity,
    HardeningResult,
    ResultStatus,
    TestResult,
)

CONTROL_ID = "restrict-file-permissions"
CONFIGURATION_FILE_CONTROL_ID = "restrict-configuration-file-permissions"


@dataclass(frozen=True, slots=True)
class FilePermissionTest:
    path: Path
    forbid_group_write: bool = True
    forbid_world_write: bool = True
    severity: FindingSeverity = FindingSeverity.MEDIUM
    confidence: FindingConfidence = FindingConfidence.HIGH

    @property
    def test_id(self) -> str:
        return f"file-permissions:{self.path}"

    @property
    def control_id(self) -> str:
        return CONTROL_ID

    def run(self, context: ExecutionContext) -> TestResult:
        path = self.path.expanduser().resolve()
        if not context.path_is_allowed(path):
            return TestResult(
                self.test_id,
                ResultStatus.ERROR,
                "target is outside configured allowed roots",
                evidence={"path": str(path)},
                severity=self.severity,
                confidence=self.confidence,
            )
        if not path.exists():
            return TestResult(
                self.test_id,
                ResultStatus.ERROR,
                "target does not exist",
                evidence={"path": str(path)},
                severity=self.severity,
                confidence=self.confidence,
            )
        mode = stat.S_IMODE(path.stat().st_mode)
        forbidden = 0
        if self.forbid_group_write:
            forbidden |= stat.S_IWGRP
        if self.forbid_world_write:
            forbidden |= stat.S_IWOTH
        if mode & forbidden:
            return TestResult(
                self.test_id,
                ResultStatus.FAIL,
                "target has forbidden write permissions",
                recommended_control=self.control_id,
                evidence={
                    "path": str(path),
                    "current_mode": oct(mode),
                    "forbidden_mask": oct(forbidden),
                },
                severity=self.severity,
                confidence=self.confidence,
            )
        return TestResult(
            self.test_id,
            ResultStatus.PASS,
            "target permissions satisfy policy",
            evidence={"path": str(path), "current_mode": oct(mode)},
            severity=self.severity,
            confidence=self.confidence,
        )


class RestrictFilePermissions:
    @property
    def control_id(self) -> str:
        return CONTROL_ID

    def execute(
        self, finding: TestResult, context: ExecutionContext
    ) -> HardeningResult:
        raw_path = finding.evidence.get("path")
        raw_mask = finding.evidence.get("forbidden_mask")
        if not isinstance(raw_path, str) or not isinstance(raw_mask, str):
            raise ValueError("finding lacks file permission evidence")
        path = Path(raw_path).resolve()
        if not context.path_is_allowed(path):
            return HardeningResult(
                self.control_id,
                finding.test_id,
                ActionStatus.BLOCKED,
                "target is outside configured allowed roots",
                severity=finding.severity,
                confidence=finding.confidence,
            )
        current_mode = stat.S_IMODE(path.stat().st_mode)
        new_mode = current_mode & ~int(raw_mask, 8)
        if not context.apply_changes:
            return HardeningResult(
                self.control_id,
                finding.test_id,
                ActionStatus.PREVIEWED,
                f"would change mode from {oct(current_mode)} to {oct(new_mode)}",
                severity=finding.severity,
                confidence=finding.confidence,
            )
        path.chmod(new_mode)
        return HardeningResult(
            self.control_id,
            finding.test_id,
            ActionStatus.APPLIED,
            f"changed mode from {oct(current_mode)} to {oct(new_mode)}",
            changed=new_mode != current_mode,
            severity=finding.severity,
            confidence=finding.confidence,
        )


class ConfigurationFilePermissionTest(FilePermissionTest):
    """Check that a configured HoneyProbe file is not group/world writable."""

    @property
    def test_id(self) -> str:
        return f"configuration-file-permissions:{self.path}"

    @property
    def control_id(self) -> str:
        return CONFIGURATION_FILE_CONTROL_ID


class RestrictConfigurationFilePermissions(RestrictFilePermissions):
    """Apply only the forbidden write-bit removal to a configuration file."""

    @property
    def control_id(self) -> str:
        return CONFIGURATION_FILE_CONTROL_ID
