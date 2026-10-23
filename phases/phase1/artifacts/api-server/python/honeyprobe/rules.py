"""Persistent, bounded declarative detection rules; supplied rules never execute code."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException

from honeyprobe.models import (
    DetectionRuleDefinition,
    DetectionRuleRecord,
    DetectionRuleTestResult,
    DetectionRuleVersion,
    EventInput,
    OperatorAuditRecord,
)
from honeyprobe.storage import db_connection, iso_utc


def _definition_json(definition: DetectionRuleDefinition) -> str:
    return json.dumps(
        definition.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _rule_from_row(row: sqlite3.Row) -> DetectionRuleRecord:
    return DetectionRuleRecord(
        id=row["id"],
        name=row["name"],
        category=row["category"],
        description=row["description"],
        severity=row["severity"],
        conditions=json.loads(row["conditions_json"]),
        recommended_steps=json.loads(row["recommended_steps_json"]),
        enabled=bool(row["enabled"]),
        version=row["version"],
        created_at=datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")),
        updated_at=datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00")),
        created_by=row["created_by"],
        updated_by=row["updated_by"],
    )


def _write_audit(
    connection: sqlite3.Connection,
    *,
    actor_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    details: dict[str, Any],
) -> None:
    connection.execute(
        """
        INSERT INTO operator_audit_log(
            id, actor_id, action, entity_type, entity_id, occurred_at, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f"audit_{uuid.uuid4().hex}",
            actor_id,
            action,
            entity_type,
            entity_id,
            iso_utc(),
            json.dumps(details, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
        ),
    )


def _write_version(
    connection: sqlite3.Connection,
    rule_id: str,
    version: int,
    action: str,
    actor_id: str,
    definition: DetectionRuleDefinition,
) -> None:
    connection.execute(
        """
        INSERT INTO detection_rule_versions(
            rule_id, version, action, actor_id, created_at, definition_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        (rule_id, version, action, actor_id, iso_utc(), _definition_json(definition)),
    )


def list_rules() -> list[DetectionRuleRecord]:
    with db_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM detection_rules WHERE deleted_at IS NULL ORDER BY created_at DESC, id"
        ).fetchall()
    return [_rule_from_row(row) for row in rows]


def get_rule(rule_id: str) -> DetectionRuleRecord | None:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM detection_rules WHERE id = ? AND deleted_at IS NULL",
            (rule_id,),
        ).fetchone()
    return _rule_from_row(row) if row else None


def create_rule(
    definition: DetectionRuleDefinition, actor_id: str
) -> DetectionRuleRecord:
    rule_id = f"rule_{uuid.uuid4().hex}"
    now = iso_utc()
    with db_connection() as connection:
        connection.execute(
            """
            INSERT INTO detection_rules(
                id, name, category, description, severity, conditions_json,
                recommended_steps_json, enabled, version, created_at, updated_at,
                created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)
            """,
            (
                rule_id,
                definition.name,
                definition.category,
                definition.description,
                definition.severity,
                json.dumps([c.model_dump(mode="json") for c in definition.conditions]),
                json.dumps(definition.recommended_steps),
                now,
                now,
                actor_id,
                actor_id,
            ),
        )
        _write_version(connection, rule_id, 1, "created", actor_id, definition)
        _write_audit(
            connection,
            actor_id=actor_id,
            action="rule.created",
            entity_type="detection_rule",
            entity_id=rule_id,
            details={"version": 1, "enabled": False},
        )
        row = connection.execute(
            "SELECT * FROM detection_rules WHERE id = ?", (rule_id,)
        ).fetchone()
    return _rule_from_row(row)


def update_rule(
    rule_id: str, definition: DetectionRuleDefinition, actor_id: str
) -> DetectionRuleRecord:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM detection_rules WHERE id = ? AND deleted_at IS NULL",
            (rule_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Detection rule not found.")
        version = int(row["version"]) + 1
        now = iso_utc()
        connection.execute(
            """
            UPDATE detection_rules SET name=?, category=?, description=?, severity=?,
                conditions_json=?, recommended_steps_json=?, enabled=0, version=?,
                updated_at=?, updated_by=? WHERE id=?
            """,
            (
                definition.name,
                definition.category,
                definition.description,
                definition.severity,
                json.dumps([c.model_dump(mode="json") for c in definition.conditions]),
                json.dumps(definition.recommended_steps),
                version,
                now,
                actor_id,
                rule_id,
            ),
        )
        _write_version(connection, rule_id, version, "updated", actor_id, definition)
        _write_audit(
            connection,
            actor_id=actor_id,
            action="rule.updated",
            entity_type="detection_rule",
            entity_id=rule_id,
            details={"version": version, "enabled": False},
        )
        updated = connection.execute(
            "SELECT * FROM detection_rules WHERE id = ?", (rule_id,)
        ).fetchone()
    return _rule_from_row(updated)


def set_rule_enabled(rule_id: str, enabled: bool, actor_id: str) -> DetectionRuleRecord:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM detection_rules WHERE id = ? AND deleted_at IS NULL",
            (rule_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Detection rule not found.")
        if enabled:
            tested = connection.execute(
                """
                SELECT matched FROM detection_rule_tests
                WHERE rule_id = ? AND rule_version = ?
                ORDER BY tested_at DESC, id DESC LIMIT 1
                """,
                (rule_id, row["version"]),
            ).fetchone()
            if tested is None or not tested["matched"]:
                raise HTTPException(
                    status_code=409,
                    detail="Run a matching safe test for this rule version before enabling it.",
                )
        connection.execute(
            "UPDATE detection_rules SET enabled=?, updated_at=?, updated_by=? WHERE id=?",
            (int(enabled), iso_utc(), actor_id, rule_id),
        )
        _write_audit(
            connection,
            actor_id=actor_id,
            action="rule.enabled" if enabled else "rule.disabled",
            entity_type="detection_rule",
            entity_id=rule_id,
            details={"version": row["version"], "enabled": enabled},
        )
        updated = connection.execute(
            "SELECT * FROM detection_rules WHERE id = ?", (rule_id,)
        ).fetchone()
    return _rule_from_row(updated)


def delete_rule(rule_id: str, actor_id: str) -> None:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT version FROM detection_rules WHERE id = ? AND deleted_at IS NULL",
            (rule_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Detection rule not found.")
        connection.execute(
            "UPDATE detection_rules SET enabled=0, deleted_at=?, updated_at=?, updated_by=? WHERE id=?",
            (iso_utc(), iso_utc(), actor_id, rule_id),
        )
        _write_audit(
            connection,
            actor_id=actor_id,
            action="rule.deleted",
            entity_type="detection_rule",
            entity_id=rule_id,
            details={"version": row["version"], "soft_delete": True},
        )


def rule_versions(rule_id: str) -> list[DetectionRuleVersion]:
    with db_connection() as connection:
        exists = connection.execute(
            "SELECT 1 FROM detection_rules WHERE id = ? AND deleted_at IS NULL",
            (rule_id,),
        ).fetchone()
        if exists is None:
            raise HTTPException(status_code=404, detail="Detection rule not found.")
        rows = connection.execute(
            """
            SELECT * FROM detection_rule_versions WHERE rule_id=?
            ORDER BY version DESC
            """,
            (rule_id,),
        ).fetchall()
    return [
        DetectionRuleVersion(
            version=row["version"],
            action=row["action"],
            actor_id=row["actor_id"],
            created_at=datetime.fromisoformat(row["created_at"].replace("Z", "+00:00")),
            definition=DetectionRuleDefinition.model_validate(
                json.loads(row["definition_json"])
            ),
        )
        for row in rows
    ]


def rollback_rule(rule_id: str, version: int, actor_id: str) -> DetectionRuleRecord:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM detection_rules WHERE id = ? AND deleted_at IS NULL",
            (rule_id,),
        ).fetchone()
        source = connection.execute(
            """
            SELECT definition_json FROM detection_rule_versions
            WHERE rule_id=? AND version=?
            """,
            (rule_id, version),
        ).fetchone()
        if row is None or source is None:
            raise HTTPException(status_code=404, detail="Rule or version not found.")
        definition = DetectionRuleDefinition.model_validate(
            json.loads(source["definition_json"])
        )
        next_version = int(row["version"]) + 1
        now = iso_utc()
        connection.execute(
            """
            UPDATE detection_rules SET name=?, category=?, description=?, severity=?,
                conditions_json=?, recommended_steps_json=?, enabled=0, version=?,
                updated_at=?, updated_by=? WHERE id=?
            """,
            (
                definition.name,
                definition.category,
                definition.description,
                definition.severity,
                json.dumps([c.model_dump(mode="json") for c in definition.conditions]),
                json.dumps(definition.recommended_steps),
                next_version,
                now,
                actor_id,
                rule_id,
            ),
        )
        _write_version(
            connection, rule_id, next_version, "rollback", actor_id, definition
        )
        _write_audit(
            connection,
            actor_id=actor_id,
            action="rule.rolled_back",
            entity_type="detection_rule",
            entity_id=rule_id,
            details={"source_version": version, "new_version": next_version},
        )
        updated = connection.execute(
            "SELECT * FROM detection_rules WHERE id = ?", (rule_id,)
        ).fetchone()
    return _rule_from_row(updated)


def _condition_candidate_value(event: dict[str, Any], field: str) -> Any:
    value: Any = event
    for part in field.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def _evaluate_definition(
    definition: dict[str, Any], event: dict[str, Any]
) -> tuple[bool, list[str]]:
    matched_conditions: list[str] = []
    for condition in definition["conditions"]:
        actual = _condition_candidate_value(event, condition["field"])
        expected = condition["value"]
        if actual is None or isinstance(actual, (dict, list)):
            return False, []
        actual_text = str(actual)[:1000].casefold()
        expected_values = (
            [str(value).casefold() for value in expected]
            if condition["operator"] == "one_of"
            else [str(expected).casefold()]
        )
        operator = condition["operator"]
        matched = (
            actual_text == expected_values[0]
            if operator == "equals"
            else expected_values[0] in actual_text
            if operator == "contains"
            else actual_text.startswith(expected_values[0])
            if operator == "starts_with"
            else actual_text in expected_values
        )
        if not matched:
            return False, []
        matched_conditions.append(
            f"{condition['field']} {operator} {expected!r}"
        )
    return True, matched_conditions


def test_rule(
    rule_id: str, candidate: EventInput, actor_id: str
) -> DetectionRuleTestResult:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM detection_rules WHERE id=? AND deleted_at IS NULL",
            (rule_id,),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Detection rule not found.")
        definition = {
            "conditions": json.loads(row["conditions_json"]),
        }
        matched, details = _evaluate_definition(
            definition, candidate.model_dump(mode="json")
        )
        tested_at = iso_utc()
        connection.execute(
            """
            INSERT INTO detection_rule_tests(
                id, rule_id, rule_version, actor_id, tested_at, matched
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                f"rule_test_{uuid.uuid4().hex}",
                rule_id,
                row["version"],
                actor_id,
                tested_at,
                int(matched),
            ),
        )
        _write_audit(
            connection,
            actor_id=actor_id,
            action="rule.tested",
            entity_type="detection_rule",
            entity_id=rule_id,
            details={"version": row["version"], "matched": matched},
        )
    return DetectionRuleTestResult(
        rule_id=rule_id,
        rule_version=row["version"],
        matched=matched,
        tested_at=datetime.fromisoformat(tested_at.replace("Z", "+00:00")),
        matched_conditions=details,
    )


def evaluate_event_rules(
    connection: sqlite3.Connection, event: Any
) -> list[dict[str, Any]]:
    """Evaluate enabled rules in the same transaction as event/evidence insertion."""
    rows = connection.execute(
        """
        SELECT id, name, category, severity, conditions_json, version
        FROM detection_rules WHERE enabled=1 AND deleted_at IS NULL
        ORDER BY id LIMIT 500
        """
    ).fetchall()
    event_data = event.model_dump(mode="json")
    matches: list[dict[str, Any]] = []
    for row in rows:
        definition = {"conditions": json.loads(row["conditions_json"])}
        matched, details = _evaluate_definition(definition, event_data)
        if matched:
            matches.append(
                {
                    "detector": f"custom:{row['id']}",
                    "rule_id": row["id"],
                    "rule_version": row["version"],
                    "rule_name": row["name"],
                    "category": row["category"],
                    "severity": row["severity"],
                    "reason": "; ".join(details)[:500],
                }
            )
    return matches


def list_audit_records(limit: int = 100) -> list[OperatorAuditRecord]:
    with db_connection() as connection:
        rows = connection.execute(
            """
            SELECT * FROM operator_audit_log ORDER BY occurred_at DESC, id DESC
            LIMIT ?
            """,
            (min(max(limit, 1), 500),),
        ).fetchall()
    return [
        OperatorAuditRecord(
            id=row["id"],
            actor_id=row["actor_id"],
            action=row["action"],
            entity_type=row["entity_type"],
            entity_id=row["entity_id"],
            occurred_at=datetime.fromisoformat(row["occurred_at"].replace("Z", "+00:00")),
            details=json.loads(row["details_json"]),
        )
        for row in rows
    ]


def audit_operator_action(
    *,
    actor_id: str,
    action: str,
    entity_type: str,
    entity_id: str,
    details: dict[str, Any] | None = None,
) -> None:
    with db_connection() as connection:
        _write_audit(
            connection,
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details or {},
        )
