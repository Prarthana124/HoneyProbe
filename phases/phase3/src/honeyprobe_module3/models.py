"""Immutable domain models for Module 3."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any, Mapping


class ResultStatus(StrEnum):
    PASS = "pass"
    FAIL = "fail"
    ERROR = "error"
    SKIPPED = "skipped"


class FindingSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class FindingConfidence(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ActionStatus(StrEnum):
    PREVIEWED = "previewed"
    APPLIED = "applied"
    BLOCKED = "blocked"
    ERROR = "error"


@dataclass(frozen=True, slots=True)
class ExecutionContext:
    apply_changes: bool
    allowed_roots: tuple[Path, ...]

    def path_is_allowed(self, path: Path) -> bool:
        candidate = path.expanduser().resolve()
        return any(candidate.is_relative_to(root) for root in self.allowed_roots)


@dataclass(frozen=True, slots=True)
class TestResult:
    test_id: str
    status: ResultStatus
    summary: str
    recommended_control: str | None = None
    evidence: Mapping[str, Any] = field(default_factory=dict)
    severity: FindingSeverity = FindingSeverity.MEDIUM
    confidence: FindingConfidence = FindingConfidence.MEDIUM


@dataclass(frozen=True, slots=True)
class HardeningResult:
    control_id: str
    test_id: str
    status: ActionStatus
    summary: str
    changed: bool = False
    severity: FindingSeverity = FindingSeverity.MEDIUM
    confidence: FindingConfidence = FindingConfidence.MEDIUM
    verification: TestComparison | None = None

    @property
    def before(self) -> TestResult | None:
        return self.verification.before if self.verification else None

    @property
    def after(self) -> TestResult | None:
        return self.verification.after if self.verification else None

    @property
    def resolved(self) -> bool | None:
        return self.verification.resolved if self.verification else None


@dataclass(frozen=True, slots=True)
class TestComparison:
    """The result of running the same self-test before and after hardening."""

    before: TestResult
    after: TestResult

    @property
    def resolved(self) -> bool:
        return self.after.status is ResultStatus.PASS

    @property
    def status_changed(self) -> bool:
        return self.before.status is not self.after.status


@dataclass(frozen=True, slots=True)
class RunSummary:
    tests: tuple[TestResult, ...]
    hardening: tuple[HardeningResult, ...]
    retests: tuple[TestResult, ...] = ()

    @property
    def final_tests(self) -> tuple[TestResult, ...]:
        """Return each initial test's latest result, including post-hardening retests."""

        latest = {result.test_id: result for result in self.retests}
        return tuple(latest.get(result.test_id, result) for result in self.tests)

    @property
    def healthy(self) -> bool:
        return all(result.status is ResultStatus.PASS for result in self.final_tests)
