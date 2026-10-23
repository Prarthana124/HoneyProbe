from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from honeyprobe.models import (
    AdaptiveActionAudit,
    DetectionFinding,
    EvidenceRecord,
    Event,
    ReportDocument,
)


SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('web', 'ssh', 'database', 'mobile')),
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    source_address TEXT,
    target TEXT NOT NULL,
    session_id TEXT,
    summary TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('local', 'test', 'configured_lab')),
    ingestion_source TEXT NOT NULL,
    fingerprint TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
CREATE INDEX IF NOT EXISTS idx_events_source_type ON events(source_type);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_target ON events(target);
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_fingerprint
    ON events(fingerprint) WHERE fingerprint IS NOT NULL;
CREATE TABLE IF NOT EXISTS session_status (
    session_id TEXT PRIMARY KEY,
    investigation_status TEXT NOT NULL
        CHECK (investigation_status IN ('unreviewed', 'investigating', 'resolved')),
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS self_test_results (
    name TEXT PRIMARY KEY,
    status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'blocked', 'not_run')),
    duration_ms INTEGER NOT NULL,
    last_run TEXT NOT NULL,
    diagnostic TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS evidence_records (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE REFERENCES events(id) ON DELETE CASCADE,
    captured_at TEXT NOT NULL,
    event_json TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    previous_hash TEXT,
    chain_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_evidence_event ON evidence_records(event_id);
CREATE TABLE IF NOT EXISTS detection_findings (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL REFERENCES evidence_records(id) ON DELETE CASCADE,
    detector TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    rule_id TEXT,
    rule_version INTEGER,
    UNIQUE(event_id, detector, rule_name)
);
CREATE INDEX IF NOT EXISTS idx_findings_event ON detection_findings(event_id);
CREATE INDEX IF NOT EXISTS idx_findings_evidence ON detection_findings(evidence_id);
CREATE INDEX IF NOT EXISTS idx_findings_created ON detection_findings(created_at DESC);
CREATE TABLE IF NOT EXISTS detection_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    conditions_json TEXT NOT NULL,
    recommended_steps_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_detection_rules_enabled ON detection_rules(enabled, deleted_at);
CREATE TABLE IF NOT EXISTS detection_rule_versions (
    rule_id TEXT NOT NULL REFERENCES detection_rules(id),
    version INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'rollback')),
    actor_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    definition_json TEXT NOT NULL,
    PRIMARY KEY(rule_id, version)
);
CREATE TABLE IF NOT EXISTS detection_rule_tests (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL REFERENCES detection_rules(id),
    rule_version INTEGER NOT NULL,
    actor_id TEXT NOT NULL,
    tested_at TEXT NOT NULL,
    matched INTEGER NOT NULL CHECK (matched IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_detection_rule_tests_latest
    ON detection_rule_tests(rule_id, rule_version, tested_at DESC);
CREATE TABLE IF NOT EXISTS operator_audit_log (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    details_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_operator_audit_time ON operator_audit_log(occurred_at DESC);
CREATE TABLE IF NOT EXISTS web_decoy_config (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    response_profile TEXT NOT NULL CHECK (response_profile IN ('baseline', 'contextual')),
    version INTEGER NOT NULL CHECK (version >= 1),
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS adaptive_proposals (
    id TEXT PRIMARY KEY,
    finding_id TEXT NOT NULL REFERENCES detection_findings(id),
    evidence_id TEXT NOT NULL REFERENCES evidence_records(id),
    response_profile TEXT NOT NULL CHECK (response_profile IN ('baseline', 'contextual')),
    previous_profile TEXT CHECK (previous_profile IN ('baseline', 'contextual')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'rejected', 'rolled_back')),
    reason TEXT NOT NULL,
    proposed_by TEXT NOT NULL,
    proposed_at TEXT NOT NULL,
    approved_by TEXT,
    approved_at TEXT,
    applied_at TEXT,
    rolled_back_at TEXT,
    applied_version INTEGER,
    verification_status TEXT NOT NULL CHECK (verification_status IN ('not_run', 'passed', 'failed')),
    verification_detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adaptive_proposals_created ON adaptive_proposals(proposed_at DESC);
CREATE TABLE IF NOT EXISTS adaptive_action_audit (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN ('restrict_file_permissions', 'restrict_configuration_file_permissions')),
    actor_id TEXT NOT NULL,
    requested_at TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode = 'dry_run'),
    applied INTEGER NOT NULL CHECK (applied = 0),
    result TEXT NOT NULL CHECK (result IN ('previewed', 'blocked', 'failed')),
    reason TEXT NOT NULL,
    preview_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adaptive_action_requested ON adaptive_action_audit(requested_at DESC);
CREATE TABLE IF NOT EXISTS generated_reports (
    id TEXT PRIMARY KEY,
    generated_at TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    document_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_generated_reports_time ON generated_reports(generated_at DESC);
"""

DEMO_SEED = [
    {
        "source_type": "web",
        "event_type": "route_visit",
        "severity": "low",
        "source_address": "198.51.100.24",
        "target": "/admin",
        "session_id": "demo-session-01",
        "summary": "Synthetic visit to a protected decoy route",
        "metadata": {"demo": True, "method": "GET"},
    },
    {
        "source_type": "web",
        "event_type": "login_attempt",
        "severity": "medium",
        "source_address": "203.0.113.18",
        "target": "/login",
        "session_id": "demo-session-02",
        "summary": "Synthetic decoy login attempt recorded without credentials",
        "metadata": {"demo": True, "username": "analyst-demo", "method": "POST"},
    },
    {
        "source_type": "database",
        "event_type": "database_read_attempt",
        "severity": "high",
        "source_address": None,
        "target": "decoy://ledger/customers",
        "session_id": "demo-session-03",
        "summary": "Synthetic read attempt against the isolated database decoy",
        "metadata": {"demo": True, "operation_category": "read"},
    },
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_utc(value: datetime | None = None) -> str:
    timestamp = value or utc_now()
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def database_path() -> Path:
    configured = os.getenv("HONEYPROBE_DB_PATH")
    path = Path(configured).expanduser() if configured else Path(__file__).resolve().parents[2] / "data" / "honeyprobe.sqlite3"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(database_path(), timeout=10.0)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=10000")
    return connection


@contextmanager
def db_connection() -> Iterator[sqlite3.Connection]:
    connection = connect()
    try:
        yield connection
        connection.commit()
    except BaseException:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    with db_connection() as connection:
        connection.executescript(SCHEMA)
        _migrate_self_test_result_statuses(connection)
        _migrate_detection_finding_rule_columns(connection)
        connection.execute(
            """
            INSERT OR IGNORE INTO web_decoy_config(
                singleton, response_profile, version, updated_at, updated_by
            ) VALUES (1, 'baseline', 1, ?, 'system')
            """,
            (iso_utc(),),
        )
        marker = connection.execute(
            "SELECT value FROM app_meta WHERE key = 'first_run_seeded'"
        ).fetchone()
        if marker is None:
            if os.getenv("HONEYPROBE_ENV", "development").lower() in {
                "development",
                "demo",
                "test",
            }:
                for index, item in enumerate(DEMO_SEED):
                    insert_event(
                        connection,
                        {
                            **item,
                            "id": f"evt_demo_{index + 1:03d}",
                            "timestamp": iso_utc(utc_now()),
                            "environment": "test",
                            "ingestion_source": "first_run_demo",
                        },
                    )
            connection.execute(
                "INSERT INTO app_meta(key, value) VALUES('first_run_seeded', 'true')"
            )
        missing_evidence = connection.execute(
            """
            SELECT events.* FROM events
            LEFT JOIN evidence_records ON evidence_records.event_id = events.id
            WHERE evidence_records.event_id IS NULL
            ORDER BY events.timestamp, events.rowid
            """
        ).fetchall()
        for row in missing_evidence:
            _record_event_evidence(connection, event_from_row(row))
        _backfill_phase2_findings(connection)


def _migrate_detection_finding_rule_columns(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(detection_findings)").fetchall()
    }
    if "rule_id" not in columns:
        connection.execute("ALTER TABLE detection_findings ADD COLUMN rule_id TEXT")
    if "rule_version" not in columns:
        connection.execute(
            "ALTER TABLE detection_findings ADD COLUMN rule_version INTEGER"
        )


def _migrate_self_test_result_statuses(connection: sqlite3.Connection) -> None:
    """Allow blocked results while preserving rows from pre-migration databases."""
    row = connection.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'self_test_results'"
    ).fetchone()
    table_sql = str(row["sql"] or "") if row is not None else ""
    if "'blocked'" in table_sql:
        return

    connection.execute("BEGIN IMMEDIATE")
    connection.execute("ALTER TABLE self_test_results RENAME TO self_test_results_legacy")
    connection.execute(
        """
        CREATE TABLE self_test_results (
            name TEXT PRIMARY KEY,
            status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'blocked', 'not_run')),
            duration_ms INTEGER NOT NULL,
            last_run TEXT NOT NULL,
            diagnostic TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        INSERT INTO self_test_results(name, status, duration_ms, last_run, diagnostic)
        SELECT name, status, duration_ms, last_run, diagnostic
        FROM self_test_results_legacy
        """
    )
    connection.execute("DROP TABLE self_test_results_legacy")


def _backfill_phase2_findings(connection: sqlite3.Connection) -> None:
    rows = connection.execute(
        """
        SELECT events.id, events.timestamp, events.metadata_json, evidence_records.id AS evidence_id
        FROM events
        JOIN evidence_records ON evidence_records.event_id = events.id
        WHERE events.metadata_json LIKE '%phase2_analysis%'
        """
    ).fetchall()
    for row in rows:
        try:
            analysis = json.loads(row["metadata_json"]).get("phase2_analysis", [])
        except (TypeError, json.JSONDecodeError):
            continue
        if not isinstance(analysis, list):
            continue
        for item in analysis:
            if not isinstance(item, dict):
                continue
            rule_name = item.get("category")
            severity = item.get("severity")
            reason = item.get("reason")
            if (
                not isinstance(rule_name, str)
                or severity not in {"info", "low", "medium", "high", "critical"}
                or not isinstance(reason, str)
            ):
                continue
            connection.execute(
                """
                INSERT OR IGNORE INTO detection_findings(
                    id, event_id, evidence_id, detector, rule_name, severity, reason, created_at
                ) VALUES (?, ?, ?, 'phase2', ?, ?, ?, ?)
                """,
                (
                    f"finding_{uuid.uuid4().hex}",
                    row["id"],
                    row["evidence_id"],
                    rule_name[:120],
                    severity,
                    reason[:500],
                    row["timestamp"],
                ),
            )


def event_from_row(row: sqlite3.Row | dict[str, Any]) -> Event:
    metadata = json.loads(row["metadata_json"])
    timestamp = datetime.fromisoformat(str(row["timestamp"]).replace("Z", "+00:00"))
    return Event(
        id=row["id"],
        timestamp=timestamp,
        source_type=row["source_type"],
        event_type=row["event_type"],
        severity=row["severity"],
        source_address=row["source_address"],
        target=row["target"],
        session_id=row["session_id"],
        summary=row["summary"],
        metadata=metadata,
        environment=row["environment"],
        ingestion_source=row["ingestion_source"],
        processing_status="accepted",
    )


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _record_event_evidence(connection: sqlite3.Connection, event: Event) -> EvidenceRecord:
    existing = connection.execute(
        "SELECT * FROM evidence_records WHERE event_id = ?", (event.id,)
    ).fetchone()
    if existing is not None:
        return evidence_from_row(existing)

    event_json = _canonical_json(event.model_dump(mode="json"))
    digest = hashlib.sha256(event_json.encode("utf-8")).hexdigest()
    previous = connection.execute(
        "SELECT chain_hash FROM evidence_records ORDER BY rowid DESC LIMIT 1"
    ).fetchone()
    previous_hash = previous["chain_hash"] if previous else None
    chain_material = f"{previous_hash or ''}\n{digest}".encode("utf-8")
    chain_hash = hashlib.sha256(chain_material).hexdigest()
    evidence_id = f"evidence_{uuid.uuid4().hex}"
    captured_at = iso_utc()
    connection.execute(
        """
        INSERT INTO evidence_records(
            id, event_id, captured_at, event_json, sha256, previous_hash, chain_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (evidence_id, event.id, captured_at, event_json, digest, previous_hash, chain_hash),
    )
    return EvidenceRecord(
        id=evidence_id,
        event_id=event.id,
        captured_at=datetime.fromisoformat(captured_at.replace("Z", "+00:00")),
        sha256=digest,
        previous_hash=previous_hash,
        chain_hash=chain_hash,
        event=event,
    )


def evidence_from_row(row: sqlite3.Row | dict[str, Any]) -> EvidenceRecord:
    return EvidenceRecord(
        id=row["id"],
        event_id=row["event_id"],
        captured_at=datetime.fromisoformat(str(row["captured_at"]).replace("Z", "+00:00")),
        sha256=row["sha256"],
        previous_hash=row["previous_hash"],
        chain_hash=row["chain_hash"],
        event=Event.model_validate(json.loads(row["event_json"])),
    )


def insert_event(
    connection: sqlite3.Connection,
    event: dict[str, Any],
    fingerprint: str | None = None,
) -> Event:
    event_id = event.get("id") or f"evt_{uuid.uuid4().hex}"
    timestamp = event.get("timestamp")
    if isinstance(timestamp, datetime):
        timestamp = iso_utc(timestamp)
    timestamp = timestamp or iso_utc()
    metadata_json = json.dumps(
        event.get("metadata", {}),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    try:
        connection.execute(
            """
            INSERT INTO events (
                id, timestamp, source_type, event_type, severity, source_address,
                target, session_id, summary, metadata_json, environment,
                ingestion_source, fingerprint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                timestamp,
                event["source_type"],
                event["event_type"],
                event["severity"],
                event.get("source_address"),
                event["target"],
                event.get("session_id"),
                event["summary"],
                metadata_json,
                event["environment"],
                event["ingestion_source"],
                fingerprint,
            ),
        )
    except sqlite3.IntegrityError:
        if fingerprint is None:
            raise
        existing = connection.execute(
            "SELECT * FROM events WHERE fingerprint = ?", (fingerprint,)
        ).fetchone()
        if existing is None:
            raise
        return event_from_row(existing)
    row = connection.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row is None:
        raise RuntimeError("Inserted event could not be read back")
    persisted_event = event_from_row(row)
    _record_event_evidence(connection, persisted_event)
    return persisted_event


def insert_detection_findings(
    connection: sqlite3.Connection,
    event: Event,
    findings: list[dict[str, str]],
) -> None:
    evidence = connection.execute(
        "SELECT id FROM evidence_records WHERE event_id = ?", (event.id,)
    ).fetchone()
    if evidence is None:
        raise RuntimeError("Event evidence must exist before detection findings are stored.")
    for finding in findings:
        rule_name = finding.get("rule_name", finding.get("category", "")).strip()[:120]
        severity = finding.get("severity")
        reason = finding.get("reason", "").strip()[:500]
        if (
            not rule_name
            or severity not in {"info", "low", "medium", "high", "critical"}
            or not reason
        ):
            raise ValueError("Phase 2 returned a finding outside the supported contract.")
        connection.execute(
            """
            INSERT OR IGNORE INTO detection_findings(
                id, event_id, evidence_id, detector, rule_name, severity, reason,
                created_at, rule_id, rule_version
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                f"finding_{uuid.uuid4().hex}",
                event.id,
                evidence["id"],
                finding.get("detector", "phase2"),
                rule_name,
                severity,
                reason,
                iso_utc(),
                finding.get("rule_id"),
                finding.get("rule_version"),
            ),
        )


def query_findings(
    *,
    event_id: str | None = None,
    severity: str | None = None,
    include_demo: bool = False,
    limit: int = 100,
) -> list[DetectionFinding]:
    clauses = ["1 = 1"]
    params: list[Any] = []
    if event_id:
        clauses.append("detection_findings.event_id = ?")
        params.append(event_id)
    if severity:
        clauses.append("detection_findings.severity = ?")
        params.append(severity)
    if not include_demo:
        clauses.append("events.environment != 'test'")
    params.append(min(max(limit, 1), 10000))
    with db_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT detection_findings.* FROM detection_findings
            JOIN events ON events.id = detection_findings.event_id
            WHERE {" AND ".join(clauses)}
            ORDER BY detection_findings.created_at DESC, detection_findings.id
            LIMIT ?
            """,
            params,
        ).fetchall()
    return [
        DetectionFinding(
            id=row["id"],
            event_id=row["event_id"],
            evidence_id=row["evidence_id"],
            detector=row["detector"],
            rule_name=row["rule_name"],
            severity=row["severity"],
            reason=row["reason"],
            created_at=datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00")),
            rule_id=row["rule_id"],
            rule_version=row["rule_version"],
        )
        for row in rows
    ]


def count_findings(
    *,
    since: datetime | None = None,
    until: datetime | None = None,
    include_demo: bool = False,
) -> tuple[int, int]:
    clauses = ["1 = 1"]
    params: list[Any] = []
    if since is not None:
        clauses.append("events.timestamp >= ?")
        params.append(iso_utc(since))
    if until is not None:
        clauses.append("events.timestamp <= ?")
        params.append(iso_utc(until))
    if not include_demo:
        clauses.append("events.environment != 'test'")
    with db_connection() as connection:
        row = connection.execute(
            f"""
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(CASE WHEN detection_findings.severity IN ('high', 'critical')
                                      THEN 1 ELSE 0 END), 0) AS high_critical
            FROM detection_findings
            JOIN events ON events.id = detection_findings.event_id
            WHERE {" AND ".join(clauses)}
            """,
            params,
        ).fetchone()
    return int(row["total"]), int(row["high_critical"])


def get_detection_finding(finding_id: str) -> DetectionFinding | None:
    with db_connection() as connection:
        row = connection.execute(
            """
            SELECT detection_findings.* FROM detection_findings
            JOIN events ON events.id = detection_findings.event_id
            WHERE detection_findings.id = ? AND events.environment != 'test'
            """,
            (finding_id,),
        ).fetchone()
    if row is None:
        return None
    return DetectionFinding(
        id=row["id"],
        event_id=row["event_id"],
        evidence_id=row["evidence_id"],
        detector=row["detector"],
        rule_name=row["rule_name"],
        severity=row["severity"],
        reason=row["reason"],
        created_at=datetime.fromisoformat(str(row["created_at"]).replace("Z", "+00:00")),
        rule_id=row["rule_id"],
        rule_version=row["rule_version"],
    )


def query_evidence(
    *,
    event_id: str | None = None,
    evidence_id: str | None = None,
    limit: int = 100,
    include_demo: bool = True,
) -> list[EvidenceRecord]:
    clauses = ["1 = 1"]
    params: list[Any] = []
    if event_id:
        clauses.append("events.id = ?")
        params.append(event_id)
    if evidence_id:
        clauses.append("evidence_records.id = ?")
        params.append(evidence_id)
    if not include_demo:
        clauses.append("events.environment != 'test'")
    params.append(min(max(limit, 1), 500))
    with db_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT evidence_records.* FROM evidence_records
            JOIN events ON events.id = evidence_records.event_id
            WHERE {" AND ".join(clauses)}
            ORDER BY evidence_records.rowid DESC
            LIMIT ?
            """,
            params,
        ).fetchall()
    return [evidence_from_row(row) for row in rows]


def create_adaptive_action_audit(
    *,
    action: str,
    actor_id: str,
    reason: str,
    result: str,
    preview: dict[str, Any],
    finding_id: str | None = None,
    evidence_id: str | None = None,
) -> AdaptiveActionAudit:
    stored_preview = {
        **preview,
        "finding_id": finding_id,
        "evidence_id": evidence_id,
    }
    audit = AdaptiveActionAudit(
        id=f"action_{uuid.uuid4().hex}",
        action=action,
        actor_id=actor_id[:128],
        requested_at=utc_now(),
        mode="dry_run",
        applied=False,
        result=result,
        reason=reason,
        preview=stored_preview,
        finding_id=finding_id,
        evidence_id=evidence_id,
    )
    with db_connection() as connection:
        connection.execute(
            """
            INSERT INTO adaptive_action_audit(
                id, action, actor_id, requested_at, mode, applied, result, reason, preview_json
            ) VALUES (?, ?, ?, ?, 'dry_run', 0, ?, ?, ?)
            """,
            (
                audit.id,
                audit.action,
                audit.actor_id,
                iso_utc(audit.requested_at),
                audit.result,
                audit.reason,
                _canonical_json(audit.preview),
            ),
        )
    return audit


def read_adaptive_action_audit(limit: int = 100) -> list[AdaptiveActionAudit]:
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT * FROM adaptive_action_audit
            ORDER BY requested_at DESC, rowid DESC
            LIMIT ?
            """,
            (min(max(limit, 1), 10000),),
        ).fetchall()
    return [
        AdaptiveActionAudit(
            id=row["id"],
            action=row["action"],
            actor_id=row["actor_id"],
            requested_at=datetime.fromisoformat(row["requested_at"].replace("Z", "+00:00")),
            mode=row["mode"],
            applied=bool(row["applied"]),
            result=row["result"],
            reason=row["reason"],
            preview=json.loads(row["preview_json"]),
            finding_id=json.loads(row["preview_json"]).get("finding_id"),
            evidence_id=json.loads(row["preview_json"]).get("evidence_id"),
        )
        for row in rows
    ]


def save_generated_report(document: ReportDocument) -> None:
    document_json = _canonical_json(document.model_dump(mode="json"))
    with db_connection() as connection:
        connection.execute(
            """
            INSERT INTO generated_reports(id, generated_at, sha256, document_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                document.id,
                iso_utc(document.generated_at),
                document.sha256,
                document_json,
            ),
        )


def get_generated_report(report_id: str | None = None) -> ReportDocument | None:
    with db_connection() as connection:
        if report_id:
            row = connection.execute(
                "SELECT document_json FROM generated_reports WHERE id = ?", (report_id,)
            ).fetchone()
        else:
            row = connection.execute(
                "SELECT document_json FROM generated_reports ORDER BY generated_at DESC, rowid DESC LIMIT 1"
            ).fetchone()
    return ReportDocument.model_validate(json.loads(row["document_json"])) if row else None


def verify_generated_report(digest: str) -> ReportDocument | None:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT document_json FROM generated_reports WHERE sha256 = ? ORDER BY rowid DESC LIMIT 1",
            (digest.lower(),),
        ).fetchone()
    if row is None:
        return None
    document = ReportDocument.model_validate(json.loads(row["document_json"]))
    unsigned = document.model_dump(mode="json", exclude={"sha256"})
    actual = hashlib.sha256(_canonical_json(unsigned).encode("utf-8")).hexdigest()
    return document if actual == document.sha256 == digest.lower() else None


def _where_clause(
    *,
    query: str | None = None,
    severity: str | None = None,
    source_type: str | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    include_demo: bool = True,
) -> tuple[str, list[Any]]:
    clauses = ["1 = 1"]
    params: list[Any] = []
    if query:
        escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        clauses.append(
            "(id LIKE ? ESCAPE '\\' OR session_id LIKE ? ESCAPE '\\' "
            "OR source_address LIKE ? ESCAPE '\\' OR event_type LIKE ? ESCAPE '\\' "
            "OR target LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')"
        )
        params.extend([pattern] * 6)
    if severity:
        clauses.append("severity = ?")
        params.append(severity)
    if source_type:
        clauses.append("source_type = ?")
        params.append(source_type)
    if event_type:
        clauses.append("event_type = ?")
        params.append(event_type)
    if since:
        clauses.append("timestamp >= ?")
        params.append(iso_utc(since))
    if until:
        clauses.append("timestamp <= ?")
        params.append(iso_utc(until))
    if not include_demo:
        clauses.append("environment != 'test'")
    return " AND ".join(clauses), params


def query_events(
    *,
    limit: int = 50,
    offset: int = 0,
    query: str | None = None,
    severity: str | None = None,
    source_type: str | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    sort_by: str = "timestamp",
    sort_direction: str = "desc",
    connection: sqlite3.Connection | None = None,
    include_demo: bool = True,
) -> tuple[list[Event], int]:
    where, params = _where_clause(
        query=query,
        severity=severity,
        source_type=source_type,
        event_type=event_type,
        since=since,
        until=until,
        include_demo=include_demo,
    )
    columns = {
        "timestamp": "timestamp",
        "event_type": "event_type",
        "severity": "CASE severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END",
    }
    order_column = columns.get(sort_by, "timestamp")
    direction = "ASC" if sort_direction.lower() == "asc" else "DESC"
    own_connection = connection is None
    context = db_connection() if own_connection else None
    if context:
        connection = context.__enter__()
    assert connection is not None
    try:
        total = connection.execute(
            f"SELECT COUNT(*) AS count FROM events WHERE {where}", params
        ).fetchone()["count"]
        rows = connection.execute(
            f"SELECT * FROM events WHERE {where} ORDER BY {order_column} {direction}, id DESC LIMIT ? OFFSET ?",
            [*params, min(max(limit, 1), 10000), max(offset, 0)],
        ).fetchall()
        return [event_from_row(row) for row in rows], int(total)
    finally:
        if context:
            context.__exit__(None, None, None)


def get_event(event_id: str) -> Event | None:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM events WHERE id = ?", (event_id,)
        ).fetchone()
    return event_from_row(row) if row else None


def all_events(
    *,
    source_type: str | None = None,
    severity: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = 10000,
    include_demo: bool = True,
) -> list[Event]:
    events, _ = query_events(
        limit=min(max(limit, 1), 10000),
        offset=0,
        source_type=source_type,
        severity=severity,
        since=since,
        until=until,
        include_demo=include_demo,
    )
    return events


def get_investigation_status(session_id: str) -> str:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT investigation_status FROM session_status WHERE session_id = ?",
            (session_id,),
        ).fetchone()
    return row["investigation_status"] if row else "unreviewed"


def set_investigation_status(session_id: str, status: str) -> None:
    with db_connection() as connection:
        connection.execute(
            """
            INSERT INTO session_status(session_id, investigation_status, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                investigation_status = excluded.investigation_status,
                updated_at = excluded.updated_at
            """,
            (session_id, status, iso_utc()),
        )


def remove_test_events() -> int:
    with db_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM events WHERE environment = 'test'"
        )
        return cursor.rowcount


def persist_self_test_results(results: list[dict[str, Any]]) -> None:
    with db_connection() as connection:
        for item in results:
            connection.execute(
                """
                INSERT INTO self_test_results(name, status, duration_ms, last_run, diagnostic)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    status = excluded.status,
                    duration_ms = excluded.duration_ms,
                    last_run = excluded.last_run,
                    diagnostic = excluded.diagnostic
                """,
                (
                    item["name"],
                    item["status"],
                    item["duration_ms"],
                    item["last_run"],
                    item["diagnostic"],
                ),
            )


def read_self_test_results() -> list[dict[str, Any]]:
    with db_connection() as connection:
        rows = connection.execute(
            "SELECT name, status, duration_ms, last_run, diagnostic FROM self_test_results ORDER BY rowid"
        ).fetchall()
    return [
        {
            "name": row["name"],
            "status": row["status"],
            "duration_ms": row["duration_ms"],
            "last_run": datetime.fromisoformat(row["last_run"].replace("Z", "+00:00")),
            "diagnostic": row["diagnostic"],
        }
        for row in rows
    ]


def database_health() -> tuple[bool, str]:
    try:
        with db_connection() as connection:
            connection.execute("SELECT 1").fetchone()
        return True, "workspace SQLite file"
    except sqlite3.Error:
        return False, "workspace SQLite file"
