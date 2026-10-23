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
            integration_type="Controlled event simulator + Cowrie JSON log adapter",
            status="demo_mode",
            description="Records fixed SSH interaction categories for local testing. It does not run an SSH listener, collect credentials, or execute commands; Cowrie JSON import remains optional.",
            event_count=counts["ssh"],
            last_event_at=last_seen.get("ssh"),
            setup_instructions="Use /api/decoys/ssh/interaction for controlled local scenarios. Optional Cowrie records can be imported through /api/imports/cowrie after review.",
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
            integration_type="Controlled event simulator",
            status="demo_mode",
            description="Records fixed mobile interaction categories for local testing. It does not connect to an emulator or collect device identifiers or credentials.",
            event_count=counts["mobile"],
            last_event_at=last_seen.get("mobile"),
            setup_instructions="Use /api/decoys/mobile/interaction to create a synthetic event. No mobile device or external endpoint is contacted.",
        ),
    ]


def web_decoy_is_available() -> bool:
    return {"/", "/about", "/login", "/admin"}.issubset(ROUTES)
