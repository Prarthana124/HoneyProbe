from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class EventInput(StrictModel):
    timestamp: datetime | None = None
    source_type: Literal["web", "ssh", "database", "mobile"]
    event_type: str = Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_.-]+$")
    severity: Literal["info", "low", "medium", "high", "critical"]
    source_address: str | None = Field(default=None, max_length=64)
    target: str = Field(min_length=1, max_length=300)
    session_id: str | None = Field(default=None, max_length=128)
    summary: str = Field(min_length=1, max_length=500)
    metadata: dict[str, Any] = Field(default_factory=dict)
    environment: Literal["local", "test", "configured_lab"] = "local"
    ingestion_source: str = Field(default="operator_api", min_length=1, max_length=100)

    @field_validator("source_address")
    @classmethod
    def validate_source_address(cls, value: str | None) -> str | None:
        if value is None or value == "":
            return None
        import ipaddress

        try:
            return str(ipaddress.ip_address(value))
        except ValueError as error:
            raise ValueError("source_address must be a valid IPv4 or IPv6 address") from error


class Event(StrictModel):
    id: str
    timestamp: datetime
    source_type: Literal["web", "ssh", "database", "mobile"]
    event_type: str
    severity: Literal["info", "low", "medium", "high", "critical"]
    source_address: str | None = None
    target: str
    session_id: str | None = None
    summary: str
    metadata: dict[str, Any]
    environment: Literal["local", "test", "configured_lab"]
    ingestion_source: str
    processing_status: Literal["accepted", "rejected"] = "accepted"


class EventPage(StrictModel):
    items: list[Event]
    total: int
    limit: int
    offset: int


class WebInteractionInput(StrictModel):
    route: str = Field(min_length=1, max_length=200)
    interaction: Literal["route_visit", "login_attempt", "protected_route_attempt"]
    method: str = Field(default="GET", max_length=10)
    session_id: str | None = Field(default=None, max_length=128)
    username: str | None = Field(default=None, max_length=120)


class DatabaseInteractionInput(StrictModel):
    operation_category: Literal["connect", "read", "write", "schema_probe", "denied_operation"]
    target: str = Field(min_length=1, max_length=200)
    session_id: str | None = Field(default=None, max_length=128)


class CowrieEntry(StrictModel):
    eventid: str = Field(max_length=100)
    src_ip: str | None = Field(default=None, max_length=64)
    session: str | None = Field(default=None, max_length=128)
    timestamp: datetime | None = None
    message: str = Field(max_length=500)


class CowrieImportInput(StrictModel):
    entries: list[CowrieEntry] = Field(min_length=1, max_length=250)


class ImportResult(StrictModel):
    imported: int
    events: list[Event]


class SessionStatusInput(StrictModel):
    investigation_status: Literal["unreviewed", "investigating", "resolved"]


class DemoGenerationInput(StrictModel):
    count: int = Field(default=5, ge=1, le=30)


class DemoGenerationResult(StrictModel):
    created: int
    events: list[Event]


class DemoResetResult(StrictModel):
    deleted: int
    preserved_observed_events: Literal[True] = True


class Metric(StrictModel):
    value: int
    context: str


class Decoy(StrictModel):
    id: Literal["web", "ssh", "database", "mobile"]
    name: str
    integration_type: str
    status: Literal["connected", "not_configured", "unavailable", "demo_mode"]
    description: str
    event_count: int
    last_event_at: datetime | None = None
    setup_instructions: str


class Session(StrictModel):
    session_id: str
    first_seen: datetime
    last_seen: datetime
    event_count: int
    source_types: list[str]
    event_categories: list[str]
    highest_severity: Literal["info", "low", "medium", "high", "critical"]
    investigation_status: Literal["unreviewed", "investigating", "resolved"]


class SessionPage(StrictModel):
    items: list[Session]
    total: int
    limit: int
    offset: int


class SessionDetail(StrictModel):
    session: Session
    events: list[Event]


class ActivityBucket(StrictModel):
    bucket: datetime
    count: int


class Overview(StrictModel):
    total_events: Metric
    suspicious_events: Metric
    unique_sessions: Metric
    active_decoys: Metric
    telemetry_health: Literal["healthy", "degraded"]
    activity: list[ActivityBucket]
    severity_counts: dict[str, int]
    recent_events: list[Event]
    sessions: list[Session]
    decoys: list[Decoy]
    last_updated: datetime


class Analytics(StrictModel):
    total_events: int
    demo_events: int
    observed_events: int
    events_over_time: list[ActivityBucket]
    severity_counts: dict[str, int]
    source_counts: dict[str, int]
    category_counts: dict[str, int]
    session_activity: list[Session]
    top_routes: list[dict[str, Any]]


class SourceProfile(StrictModel):
    source_address: str
    event_count: int
    session_count: int
    first_seen: datetime
    last_seen: datetime
    highest_severity: Literal["info", "low", "medium", "high", "critical"]
    category_counts: dict[str, int]
    includes_demo_data: bool
    simulated_events: int


class EvidenceRecord(StrictModel):
    id: str
    event_id: str
    captured_at: datetime
    sha256: str
    previous_hash: str | None = None
    chain_hash: str
    event: Event


class DetectionFinding(StrictModel):
    id: str
    event_id: str
    evidence_id: str
    detector: str
    rule_name: str
    severity: Literal["info", "low", "medium", "high", "critical"]
    reason: str
    created_at: datetime


class AdaptiveActionInput(StrictModel):
    action: Literal["restrict_file_permissions", "restrict_configuration_file_permissions"]
    finding_id: str = Field(min_length=1, max_length=128)
    reason: str = Field(min_length=1, max_length=300)


class AdaptiveActionAudit(StrictModel):
    id: str
    action: Literal["restrict_file_permissions", "restrict_configuration_file_permissions"]
    actor_id: str
    requested_at: datetime
    mode: Literal["dry_run"] = "dry_run"
    applied: Literal[False] = False
    result: Literal["previewed", "blocked", "failed"]
    reason: str
    preview: dict[str, Any]
    finding_id: str | None = None
    evidence_id: str | None = None


class SelfTestResult(StrictModel):
    name: str
    status: Literal["pass", "fail", "not_run"]
    duration_ms: int
    last_run: datetime | None = None
    diagnostic: str


class SelfTestRun(StrictModel):
    results: list[SelfTestResult]
    passed: int
    failed: int
    completed_at: datetime


class SystemHealth(StrictModel):
    status: Literal["healthy", "degraded"]
    environment: str
    database: dict[str, str]
    checked_at: datetime


class ReportSummary(StrictModel):
    generated_at: datetime
    period_start: datetime | None = None
    period_end: datetime | None = None
    includes_demo_data: bool
    total_events: int
    severity_counts: dict[str, int]
    category_counts: dict[str, int]
    source_counts: dict[str, int]
    active_sessions: list[Session]
    events: list[Event]


class ReportDocument(StrictModel):
    id: str
    generated_at: datetime
    sha256: str
    summary: ReportSummary
    events: list[Event]
    evidence: list[EvidenceRecord]


class ReportVerification(StrictModel):
    valid: bool
    report_id: str | None = None
    checked_at: datetime
    detail: str
