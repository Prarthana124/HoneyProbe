from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from honeyprobe.models import Decoy, Event
from honeyprobe.web_decoy import ROUTES


def decoy_catalog(events: list[Event]) -> list[Decoy]:
    counts: dict[str, int] = defaultdict(int)
    last_seen: dict[str, datetime] = {}
    for event in events:
        counts[event.source_type] += 1
        if event.source_type not in last_seen or event.timestamp > last_seen[event.source_type]:
            last_seen[event.source_type] = event.timestamp

    return [
        Decoy(
            id="web",
            name="Web Decoy",
            integration_type="Built-in controlled demonstration",
            status="demo_mode",
            description=f"Fictional company site with {len(ROUTES)} monitored routes. Interactions persist as real SQLite events; this is not an independently exposed honeypot.",
            event_count=counts["web"],
            last_event_at=last_seen.get("web"),
            setup_instructions="Open /decoy in the operator app. This route is intended for a controlled demonstration, not public honeypot deployment.",
        ),
        Decoy(
            id="ssh",
            name="SSH / Cowrie",
            integration_type="Cowrie JSON log adapter",
            status="not_configured",
            description="No Cowrie service is running. The JSON log importer validates and normalizes sample records.",
            event_count=counts["ssh"],
            last_event_at=last_seen.get("ssh"),
            setup_instructions="Run Cowrie in an isolated lab host or container; do not expose an SSH honeypot from this app. POST normalized JSON entries to /api/imports/cowrie.",
        ),
        Decoy(
            id="database",
            name="Database Decoy",
            integration_type="Isolated operation simulator",
            status="demo_mode",
            description="Records synthetic operation categories in a logical decoy namespace; it never connects to HoneyProbe's SQLite file.",
            event_count=counts["database"],
            last_event_at=last_seen.get("database"),
            setup_instructions="Use the safe interaction control to record connect, read, write, schema-probe, or denied-operation attempts. Arbitrary SQL is not accepted.",
        ),
        Decoy(
            id="mobile",
            name="Mobile / Android",
            integration_type="Future emulator adapter",
            status="not_configured",
            description="No Android emulator or mobile telemetry source is configured.",
            event_count=counts["mobile"],
            last_event_at=last_seen.get("mobile"),
            setup_instructions="Future adapter payloads should use the common event schema; connect a controlled emulator only in an isolated lab.",
        ),
    ]


def web_decoy_is_available() -> bool:
    return {"/", "/about", "/login", "/admin"}.issubset(ROUTES)
