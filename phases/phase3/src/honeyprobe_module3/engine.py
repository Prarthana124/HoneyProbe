"""Coordinator for self-tests and policy-gated hardening."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import replace

from .config import Module3Config
from .contracts import HardeningControl, SelfTest
from .models import (
    ActionStatus,
    ExecutionContext,
    HardeningResult,
    ResultStatus,
    RunSummary,
    TestComparison,
    TestResult,
)


class HardeningEngine:
    def __init__(
        self,
        config: Module3Config,
        tests: Iterable[SelfTest],
        controls: Iterable[HardeningControl],
    ) -> None:
        self._config = config
        self._tests = tuple(tests)
        self._controls = self._unique_controls(controls)

    @staticmethod
    def _unique_controls(
        controls: Iterable[HardeningControl],
    ) -> dict[str, HardeningControl]:
        registry: dict[str, HardeningControl] = {}
        for control in controls:
            if control.control_id in registry:
                raise ValueError(f"duplicate control id: {control.control_id}")
            registry[control.control_id] = control
        return registry

    def run(self) -> RunSummary:
        context = ExecutionContext(
            apply_changes=self._config.apply_changes,
            allowed_roots=tuple(path.resolve() for path in self._config.allowed_roots),
        )
        test_results: list[TestResult] = []
        hardening_results: list[HardeningResult] = []
        retests: list[TestResult] = []

        for self_test in self._tests:
            result = self._run_test(self_test, context)
            test_results.append(result)

            if result.status is not ResultStatus.FAIL or not result.recommended_control:
                continue

            hardening = replace(
                self._handle_finding(result, context),
                severity=result.severity,
                confidence=result.confidence,
            )
            after = self._run_test(self_test, context, metadata_from=result)
            retests.append(after)
            hardening_results.append(
                replace(
                    hardening,
                    verification=TestComparison(before=result, after=after),
                )
            )

        return RunSummary(tuple(test_results), tuple(hardening_results), tuple(retests))

    def _run_test(
        self,
        self_test: SelfTest,
        context: ExecutionContext,
        *,
        metadata_from: TestResult | None = None,
    ) -> TestResult:
        try:
            result = self_test.run(context)
            if metadata_from is not None:
                return replace(
                    result,
                    severity=metadata_from.severity,
                    confidence=metadata_from.confidence,
                )
            return result
        except Exception as exc:
            if self._config.stop_on_error:
                raise
            severity = metadata_from.severity if metadata_from else None
            confidence = metadata_from.confidence if metadata_from else None
            return TestResult(
                test_id=self_test.test_id,
                status=ResultStatus.ERROR,
                summary=f"self-test raised {type(exc).__name__}: {exc}",
                **({"severity": severity} if severity else {}),
                **({"confidence": confidence} if confidence else {}),
            )

    def _handle_finding(
        self, finding: TestResult, context: ExecutionContext
    ) -> HardeningResult:
        control_id = finding.recommended_control
        assert control_id is not None
        if control_id not in self._config.approved_controls:
            return HardeningResult(
                control_id=control_id,
                test_id=finding.test_id,
                status=ActionStatus.BLOCKED,
                summary="control is not explicitly approved",
                severity=finding.severity,
                confidence=finding.confidence,
            )
        control = self._controls.get(control_id)
        if control is None:
            return HardeningResult(
                control_id=control_id,
                test_id=finding.test_id,
                status=ActionStatus.BLOCKED,
                summary="approved control is not registered",
                severity=finding.severity,
                confidence=finding.confidence,
            )
        try:
            return control.execute(finding, context)
        except Exception as exc:
            if self._config.stop_on_error:
                raise
            return HardeningResult(
                control_id=control_id,
                test_id=finding.test_id,
                status=ActionStatus.ERROR,
                summary=f"control raised {type(exc).__name__}: {exc}",
                severity=finding.severity,
                confidence=finding.confidence,
            )
