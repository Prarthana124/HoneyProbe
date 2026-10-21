from __future__ import annotations

import csv
import io
from html import escape
from typing import Iterable

from honeyprobe.models import Event, ReportSummary


def events_to_csv(events: Iterable[Event]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "id",
            "timestamp_utc",
            "source_type",
            "event_type",
            "severity",
            "source_address",
            "target",
            "session_id",
            "summary",
            "environment",
            "ingestion_source",
            "metadata_json",
        ]
    )
    for event in events:
        writer.writerow(
            [
                event.id,
                event.timestamp.isoformat(),
                event.source_type,
                event.event_type,
                event.severity,
                event.source_address or "",
                event.target,
                event.session_id or "",
                event.summary,
                event.environment,
                event.ingestion_source,
                event.model_dump_json(include={"metadata"}),
            ]
        )
    return output.getvalue()


def report_to_html(report: ReportSummary) -> str:
    rows = "".join(
        "<tr>"
        f"<td>{escape(event.timestamp.isoformat())}</td>"
        f"<td>{escape(event.severity.upper())}</td>"
        f"<td>{escape(event.source_type)}</td>"
        f"<td>{escape(event.event_type)}</td>"
        f"<td>{escape(event.target)}</td>"
        f"<td>{escape(event.session_id or '—')}</td>"
        f"<td>{escape(event.summary)}</td>"
        "</tr>"
        for event in report.events[:1000]
    )
    demo_label = "Included" if report.includes_demo_data else "Excluded"
    period_start = escape(report.period_start.isoformat() if report.period_start else "All available history")
    period_end = escape(report.period_end.isoformat() if report.period_end else "Now")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HoneyProbe telemetry report</title>
<style>
body{{font:14px/1.5 Inter,system-ui,sans-serif;color:#17212d;margin:36px}}
h1{{font-size:24px}}.meta{{color:#526172;margin-bottom:22px}}
table{{border-collapse:collapse;width:100%;font-size:12px}}
th,td{{border:1px solid #d7dee8;padding:8px;text-align:left;vertical-align:top}}
th{{background:#eef2f7}}@media print{{body{{margin:10mm}}}}
</style>
</head>
<body>
<h1>HoneyProbe telemetry report</h1>
<p class="meta">Period: {period_start} to {period_end}<br>
Generated: {escape(report.generated_at.isoformat())}<br>
Synthetic demo data: {demo_label}<br>
Matching events: {report.total_events}</p>
<h2>Event records</h2>
<table><thead><tr><th>UTC timestamp</th><th>Severity</th><th>Source</th><th>Event</th><th>Target</th><th>Session</th><th>Summary</th></tr></thead>
<tbody>{rows}</tbody></table>
<script>window.addEventListener('load',()=>window.print());</script>
</body></html>"""
