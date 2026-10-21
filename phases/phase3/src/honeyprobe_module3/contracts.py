"""Narrow interfaces owned by Module 3."""

from __future__ import annotations

from typing import Protocol

from .models import ExecutionContext, HardeningResult, TestResult


class SelfTest(Protocol):
    """A deterministic check that reports a typed result and finding metadata."""

    @property
    def test_id(self) -> str: ...

    def run(self, context: ExecutionContext) -> TestResult: ...


class HardeningControl(Protocol):
    """A narrowly scoped, policy-gated response to a failed self-test."""

    @property
    def control_id(self) -> str: ...

    def execute(
        self, finding: TestResult, context: ExecutionContext
    ) -> HardeningResult: ...
