from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from honeyprobe.models import (
    DatabaseInteractionInput,
    DeceptionReadinessAssessment,
    DeceptionReadinessCheck,
    MobileInteractionInput,
    SshInteractionInput,
    WebInteractionInput,
)
from honeyprobe.phase2_adapter import analyze_phase2_message


def make_deception_readiness_assessment() -> DeceptionReadinessAssessment:
    fixtures: list[tuple[str, str, str, Callable[[], object]]] = [
        (
            "web",
            "Fingerprinting: Header probe",
            "server header probe",
            lambda: WebInteractionInput(
                route="/about",
                interaction="route_visit",
            ),
        ),
        (
            "ssh",
            "Fingerprinting: SSH version probe",
            "ssh-2.0 protocol version probe",
            lambda: SshInteractionInput(interaction="banner_probe"),
        ),
        (
            "database",
            "Database Schema Probe",
            "database schema probe",
            lambda: DatabaseInteractionInput(
                operation_category="schema_probe",
                target="decoy://ledger/schema",
            ),
        ),
        (
            "mobile",
            "Mobile Endpoint Probe",
            "mobile deep-link probe",
            lambda: MobileInteractionInput(
                interaction="deep_link_probe",
                component="admin",
            ),
        ),
    ]

    checks: list[DeceptionReadinessCheck] = []
    for channel, detector, fixture, validate_input in fixtures:
        try:
            validate_input()
            detections = analyze_phase2_message(fixture, service=channel.upper())
            passed = any(item["category"] == detector for item in detections)
        except Exception:
            passed = False
        checks.append(
            DeceptionReadinessCheck(
                channel=channel,
                detector=detector,
                passed=passed,
                detail=(
                    "Controlled fixture matched the expected detector."
                    if passed
                    else "Controlled fixture did not match the expected detector."
                ),
            )
        )

    passed_count = sum(check.passed for check in checks)
    total = len(checks)
    score = round((passed_count / total) * 100) if total else 0
    status = (
        "ready"
        if passed_count == total
        else "partial"
        if passed_count > 0
        else "unavailable"
    )
    return DeceptionReadinessAssessment(
        readiness_score=score,
        passed=passed_count,
        total=total,
        status=status,
        checks=checks,
        limitations=[
            "This score measures controlled local detector coverage only, not whether a real attacker would be deceived.",
            "The fixtures are synthetic; no external services, device telemetry, credentials, or commands are used.",
        ],
        evaluated_at=datetime.now(timezone.utc),
    )
