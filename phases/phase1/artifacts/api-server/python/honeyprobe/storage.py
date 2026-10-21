from __future__ import annotations

import json
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from honeyprobe.models import Event


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
    status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'not_run')),
    duration_ms INTEGER NOT NULL,
    last_run TEXT NOT NULL,
    diagnostic TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
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
    return event_from_row(row)


def _where_clause(
    *,
    query: str | None = None,
    severity: str | None = None,
    source_type: str | None = None,
    event_type: str | None = None,
    since: datetime | None = None,
    until: datetime | None = None,
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
) -> tuple[list[Event], int]:
    where, params = _where_clause(
        query=query,
        severity=severity,
        source_type=source_type,
        event_type=event_type,
        since=since,
        until=until,
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
) -> list[Event]:
    events, _ = query_events(
        limit=min(max(limit, 1), 10000),
        offset=0,
        source_type=source_type,
        severity=severity,
        since=since,
        until=until,
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
