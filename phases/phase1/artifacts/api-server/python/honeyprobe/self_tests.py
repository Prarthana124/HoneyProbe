from __future__ import annotations

import time
from datetime import timezone
from typing import Callable

from honeyprobe.models import EventInput, SelfTestResult, SelfTestRun
from honeyprobe.reports import events_to_csv
from honeyprobe.storage import (
    db_connection,
    insert_event,
    iso_utc,
    persist_self_test_results,
    query_events,
    read_self_test_results,
    utc_now,
)
from honeyprobe.web_decoy import ROUTES


def _event_schema_check() -> None:
    EventInput(
        source_type="web",
        event_type="route_visit",
        severity="info",
        target="/self-test",
        summary="Self-test schema validation",
        metadata={"test": True},
        environment="local",
        ingestion_source="self_test",
    )


def _database_read_write_check() -> None:
    with db_connection() as connection:
        connection.execute("SAVEPOINT honeyprobe_self_test")
        item = {
            "id": "evt_self_test_probe",
            "timestamp": iso_utc(),
            "source_type": "web",
            "event_type": "self_test_probe",
            "severity": "info",
            "source_address": None,
            "target": "/self-test",
            "session_id": None,
            "summary": "Transient self-test row",
            "metadata": {"test": True},
            "environment": "test",
            "ingestion_source": "self_test",
        }
        insert_event(connection, item)
        found = connection.execute(
            "SELECT id FROM events WHERE id = ?", (item["id"],)
        ).fetchone()
        if found is None:
            raise RuntimeError("SQLite insert/read did not return the transient row")
        connection.execute("ROLLBACK TO honeyprobe_self_test")
        connection.execute("RELEASE honeyprobe_self_test")


def _ingestion_path_check() -> None:
    with db_connection() as connection:
        connection.execute("SAVEPOINT honeyprobe_ingestion_test")
        inserted = insert_event(
            connection,
            {
                "id": "evt_ingestion_self_test",
                "timestamp": iso_utc(),
                "source_type": "web",
                "event_type": "self_test_ingestion",
                "severity": "info",
                "source_address": None,
                "target": "/self-test",
                "session_id": "self-test-session",
                "summary": "Transient ingestion check",
                "metadata": {"validation": "passed"},
                "environment": "test",
                "ingestion_source": "self_test",
            },
        )
        if inserted.processing_status != "accepted":
            raise RuntimeError("The event was not accepted by the ingestion model")
        connection.execute("ROLLBACK TO honeyprobe_ingestion_test")
        connection.execute("RELEASE honeyprobe_ingestion_test")


def run_self_tests() -> SelfTestRun:
    started_at = utc_now()
    checks: list[tuple[str, Callable[[], None], str]] = [
        ("API process", lambda: None, "FastAPI process is responding."),
        ("SQLite read/write", _database_read_write_check, "Transient write/read succeeded and was rolled back."),
        ("Event schema validation", _event_schema_check, "Pydantic accepted a valid common-event payload."),
        ("Event ingestion", _ingestion_path_check, "Ingestion validation and SQLite transaction path succeeded."),
        (
            "Web-decoy route contract",
            lambda: None if {"/", "/about", "/login", "/admin"}.issubset(ROUTES) else (_ for _ in ()).throw(RuntimeError("A required route is missing")),
            "The separate fictional decoy route set is available.",
        ),
        (
            "Dashboard event retrieval",
            lambda: query_events(limit=1),
            "The dashboard query returned a valid event page.",
        ),
        (
            "CSV export",
            lambda: _validate_csv_output(),
            "CSV generation returned a header row from stored event data.",
        ),
    ]
    results: list[SelfTestResult] = []
    for name, check, success_message in checks:
        before = time.perf_counter()
        status = "pass"
        diagnostic = success_message
        try:
            check()
        except Exception as error:  # A diagnostic should not expose request data or tracebacks.
            status = "fail"
            diagnostic = f"Check failed: {type(error).__name__}"
        results.append(
            SelfTestResult(
                name=name,
                status=status,
                duration_ms=max(0, round((time.perf_counter() - before) * 1000)),
                last_run=started_at.astimezone(timezone.utc),
                diagnostic=diagnostic,
            )
        )
    persist_self_test_results(
        [
            {
                "name": result.name,
                "status": result.status,
                "duration_ms": result.duration_ms,
                "last_run": iso_utc(result.last_run),
                "diagnostic": result.diagnostic,
            }
            for result in results
        ]
    )
    return SelfTestRun(
        results=results,
        passed=sum(result.status == "pass" for result in results),
        failed=sum(result.status == "fail" for result in results),
        completed_at=started_at,
    )


def _validate_csv_output() -> None:
    events, _ = query_events(limit=2)
    output = events_to_csv(events)
    if not output.startswith("id,timestamp_utc,"):
        raise RuntimeError("CSV header did not match the event export schema")


def previous_self_tests() -> list[SelfTestResult]:
    return [SelfTestResult(**item) for item in read_self_test_results()]
