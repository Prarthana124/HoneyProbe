from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

from honeyprobe.decoys import decoy_catalog
from honeyprobe.models import (
    ActivityBucket,
    Analytics,
    Event,
    Metric,
    Overview,
    ReportSummary,
    Session,
    SourceProfile,
    SourceProfileActivity,
)
from honeyprobe.storage import get_investigation_status, utc_now

SEVERITY_ORDER = {"info": 1, "low": 2, "medium": 3, "high": 4, "critical": 5}
SEVERITIES = ("info", "low", "medium", "high", "critical")


def make_sessions(events: list[Event]) -> list[Session]:
    grouped: dict[str, list[Event]] = defaultdict(list)
    for event in events:
        if event.session_id:
            grouped[event.session_id].append(event)

    sessions: list[Session] = []
    for session_id, session_events in grouped.items():
        timestamps = [event.timestamp for event in session_events]
        highest = max(session_events, key=lambda event: SEVERITY_ORDER[event.severity]).severity
        sessions.append(
            Session(
                session_id=session_id,
                first_seen=min(timestamps),
                last_seen=max(timestamps),
                event_count=len(session_events),
                source_types=sorted({event.source_type for event in session_events}),
                event_categories=sorted({event.event_type for event in session_events}),
                highest_severity=highest,
                investigation_status=get_investigation_status(session_id),
            )
        )
    return sorted(sessions, key=lambda session: session.last_seen, reverse=True)


def count_by(values: list[str], defaults: tuple[str, ...] = ()) -> dict[str, int]:
    counts = Counter(values)
    for key in defaults:
        counts.setdefault(key, 0)
    return dict(sorted(counts.items()))


def make_source_profiles(events: list[Event], *, limit: int = 100) -> list[SourceProfile]:
    grouped: dict[str, list[Event]] = defaultdict(list)
    for event in events:
        if event.source_address:
            grouped[event.source_address].append(event)

    profiles: list[SourceProfile] = []
    for address, source_events in grouped.items():
        categories: Counter[str] = Counter()
        timeline: list[SourceProfileActivity] = []
        recent_events = sorted(
            source_events,
            key=lambda event: event.timestamp,
            reverse=True,
        )[:12]
        for event in source_events:
            categories[event.event_type] += 1
            detections = event.metadata.get("phase2_analysis", [])
            if isinstance(detections, list):
                for detection in detections:
                    if isinstance(detection, dict) and isinstance(detection.get("category"), str):
                        categories[detection["category"]] += 1
        for event in recent_events:
            detections = event.metadata.get("phase2_analysis", [])
            indicators = (
                sorted(
                    {
                        detection["category"][:80]
                        for detection in detections
                        if isinstance(detection, dict)
                        and isinstance(detection.get("category"), str)
                        and detection["category"].strip()
                    }
                )
                if isinstance(detections, list)
                else []
            )
            timeline.append(
                SourceProfileActivity(
                    event_id=event.id,
                    timestamp=event.timestamp,
                    event_type=event.event_type,
                    source_type=event.source_type,
                    severity=event.severity,
                    session_id=event.session_id,
                    indicators=indicators[:12],
                    simulated=(
                        event.environment == "test"
                        or bool(event.metadata.get("simulated"))
                        or bool(event.metadata.get("demo"))
                    ),
                )
            )
        timestamps = [event.timestamp for event in source_events]
        highest = max(
            source_events,
            key=lambda event: SEVERITY_ORDER[event.severity],
        ).severity
        profiles.append(
            SourceProfile(
                source_address=address,
                event_count=len(source_events),
                session_count=len(
                    {event.session_id for event in source_events if event.session_id}
                ),
                first_seen=min(timestamps),
                last_seen=max(timestamps),
                highest_severity=highest,
                category_counts=dict(sorted(categories.items())),
                includes_demo_data=any(event.environment == "test" for event in source_events),
                simulated_events=sum(
                    event.environment == "test"
                    or bool(event.metadata.get("simulated"))
                    or bool(event.metadata.get("demo"))
                    for event in source_events
                ),
                timeline=timeline,
            )
        )
    profiles.sort(key=lambda profile: (profile.event_count, profile.last_seen), reverse=True)
    return profiles[: min(max(limit, 1), 500)]


def make_activity_buckets(
    events: list[Event],
    *,
    since: datetime | None = None,
    until: datetime | None = None,
    hours: int = 24,
) -> list[ActivityBucket]:
    end = until or utc_now()
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    end = end.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = since or (end - timedelta(hours=hours - 1))
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    start = start.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    if start > end:
        start, end = end, start
    bucket_counts: Counter[datetime] = Counter()
    for event in events:
        bucket = event.timestamp.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
        bucket_counts[bucket] += 1
    result: list[ActivityBucket] = []
    current = start
    max_buckets = 168
    while current <= end and len(result) < max_buckets:
        result.append(ActivityBucket(bucket=current, count=bucket_counts[current]))
        current += timedelta(hours=1)
    if not result:
        result.append(ActivityBucket(bucket=end, count=0))
    return result


def make_overview(events: list[Event], *, since: datetime | None, until: datetime | None) -> Overview:
    sessions = make_sessions(events)
    decoys = decoy_catalog(events)
    suspicious = sum(event.severity in {"high", "critical"} for event in events)
    connected = sum(decoy.status == "connected" for decoy in decoys)
    severity_counts = count_by([event.severity for event in events], SEVERITIES)
    return Overview(
        total_events=Metric(value=len(events), context="Persisted records in the selected window"),
        suspicious_events=Metric(value=suspicious, context="High and critical stored events"),
        unique_sessions=Metric(value=len(sessions), context="Sessions correlated by shared session ID"),
        active_decoys=Metric(value=connected, context="Independently connected services; demo modules excluded"),
        telemetry_health="healthy",
        activity=make_activity_buckets(events, since=since, until=until),
        severity_counts=severity_counts,
        recent_events=events[:8],
        sessions=sessions[:5],
        decoys=decoys,
        last_updated=utc_now(),
    )


def make_analytics(events: list[Event], *, since: datetime | None, until: datetime | None) -> Analytics:
    sessions = make_sessions(events)
    demo_count = sum(event.environment == "test" for event in events)
    route_counts: Counter[str] = Counter()
    for event in events:
        if event.source_type == "web":
            route = event.metadata.get("route") or event.target
            route_counts[str(route)] += 1
    top_routes = [
        {"route": route, "count": count}
        for route, count in route_counts.most_common(8)
    ]
    return Analytics(
        total_events=len(events),
        demo_events=demo_count,
        observed_events=len(events) - demo_count,
        events_over_time=make_activity_buckets(events, since=since, until=until),
        severity_counts=count_by([event.severity for event in events], SEVERITIES),
        source_counts=count_by([event.source_type for event in events], ("web", "ssh", "database", "mobile")),
        category_counts=count_by([event.event_type for event in events]),
        session_activity=sessions[:10],
        top_routes=top_routes,
    )


def make_report(
    events: list[Event],
    *,
    since: datetime | None,
    until: datetime | None,
) -> ReportSummary:
    sessions = make_sessions(events)
    return ReportSummary(
        generated_at=utc_now(),
        period_start=since,
        period_end=until,
        includes_demo_data=any(event.environment == "test" for event in events),
        total_events=len(events),
        severity_counts=count_by([event.severity for event in events], SEVERITIES),
        category_counts=count_by([event.event_type for event in events]),
        source_counts=count_by([event.source_type for event in events], ("web", "ssh", "database", "mobile")),
        active_sessions=sessions[:10],
        events=events,
    )


def filter_sessions(
    events: list[Event],
    *,
    query: str | None,
    severity: str | None,
    source_type: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Session], int]:
    sessions = make_sessions(events)
    if query:
        needle = query.casefold()
        sessions = [session for session in sessions if needle in session.session_id.casefold()]
    if severity:
        sessions = [session for session in sessions if session.highest_severity == severity]
    if source_type:
        sessions = [session for session in sessions if source_type in session.source_types]
    return sessions[offset : offset + limit], len(sessions)


def as_dict(value: Any) -> dict[str, Any]:
    return value.model_dump(mode="json")
