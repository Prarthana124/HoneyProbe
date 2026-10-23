from __future__ import annotations

import hashlib
import ipaddress
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from honeyprobe.models import (
    CowrieImportInput,
    DatabaseInteractionInput,
    DemoGenerationInput,
    Event,
    EventInput,
    MobileInteractionInput,
    SshInteractionInput,
    WebInteractionInput,
)
from honeyprobe.phase2_adapter import analyze_phase2_message
from honeyprobe.rules import evaluate_event_rules
from honeyprobe.storage import (
    db_connection,
    insert_detection_findings,
    insert_event,
    iso_utc,
)
from honeyprobe.web_decoy import ROUTES as WEB_DECOY_ROUTES

SENSITIVE_KEYS = re.compile(
    r"(password|passwd|token|secret|authorization|cookie|credential|api.?key|private.?key)",
    re.IGNORECASE,
)
SENSITIVE_ASSIGNMENT = re.compile(
    r"(?i)\b(?P<key>access[_-]?token|refresh[_-]?token|password|passwd|token|secret|"
    r"credential|api[_-]?key|private[_-]?key|authorization)\b\s*[:=]\s*"
    r"(?:bearer\s+)?(?:\"[^\"]*\"|'[^']*'|[^\s,;&]+)"
)
SENSITIVE_COOKIE = re.compile(r"(?i)\b(?:cookie|set-cookie)\s*[:=][^\r\n]*")
BEARER_VALUE = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+")
URL_CREDENTIALS = re.compile(r"(?i)\b(https?://)[^/\s:@]+:[^/\s@]+@")
MAX_METADATA_BYTES = 8192


def sanitize_sensitive_text(value: str) -> str:
    value = SENSITIVE_COOKIE.sub("cookie=[redacted]", value)
    value = SENSITIVE_ASSIGNMENT.sub(
        lambda match: f"{match.group('key')}=[redacted]", value
    )
    value = BEARER_VALUE.sub("Bearer [redacted]", value)
    return URL_CREDENTIALS.sub(r"\1[redacted]@", value)


def runtime_event_environment() -> str:
    import os

    environment = os.getenv("HONEYPROBE_ENV", "development").lower()
    if environment in {"demo", "test"}:
        return "test"
    if environment in {"development", "local"}:
        return "local"
    return "configured_lab"


def sanitize_metadata(value: Any, depth: int = 0) -> Any:
    if depth > 5:
        return "[nested metadata omitted]"
    if isinstance(value, dict):
        result: dict[str, Any] = {}
        for key, item in list(value.items())[:50]:
            key_text = str(key)[:100]
            if SENSITIVE_KEYS.search(key_text):
                continue
            result[key_text] = sanitize_metadata(item, depth + 1)
        return result
    if isinstance(value, list):
        return [sanitize_metadata(item, depth + 1) for item in value[:50]]
    if isinstance(value, str):
        return sanitize_sensitive_text(value)[:1000]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    return str(value)[:200]


def _persist(
    values: dict[str, Any],
    *,
    ingestion_source: str,
    environment: str | None = None,
    fingerprint: str | None = None,
    phase2_findings: list[dict[str, str]] | None = None,
) -> Event:
    metadata = sanitize_metadata(values.get("metadata", {}))
    if len(json.dumps(metadata, ensure_ascii=False).encode("utf-8")) > MAX_METADATA_BYTES:
        raise HTTPException(status_code=422, detail="Event metadata exceeds the 8 KB limit.")
    timestamp = values.get("timestamp")
    if timestamp is not None and timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    event = {
        **values,
        "id": f"evt_{uuid.uuid4().hex}",
        "timestamp": iso_utc(timestamp),
        "target": sanitize_sensitive_text(str(values["target"]))[:300],
        "summary": sanitize_sensitive_text(str(values["summary"]))[:500],
        "metadata": metadata,
        "environment": environment or runtime_event_environment(),
        "ingestion_source": ingestion_source[:100],
    }
    with db_connection() as connection:
        persisted_event = insert_event(connection, event, fingerprint=fingerprint)
        findings = list(phase2_findings or [])
        findings.extend(evaluate_event_rules(connection, persisted_event))
        if findings:
            insert_detection_findings(connection, persisted_event, findings)
        return persisted_event


def record_operator_event(event: EventInput) -> Event:
    if event.environment == "test":
        import os

        if os.getenv("HONEYPROBE_ENV", "development").lower() not in {
            "development",
            "demo",
            "test",
        }:
            raise HTTPException(
                status_code=403,
                detail="Synthetic event ingestion is disabled outside development, demo, and test environments.",
            )
        return _persist(
            event.model_dump(),
            ingestion_source="operator_test_event",
            environment="test",
        )
    return _persist(
        event.model_dump(),
        ingestion_source="operator_api",
    )


def record_web_interaction(
    interaction: WebInteractionInput,
    *,
    simulated: bool = True,
    detection_input: str | None = None,
    source_address: str | None = None,
    network_metadata: dict[str, Any] | None = None,
) -> Event:
    request_path = interaction.route.split("?", 1)[0]
    if not request_path.startswith("/"):
        request_path = f"/{request_path}"
    path = request_path if simulated or request_path in WEB_DECOY_ROUTES else "/unmatched"
    phase2_detections = analyze_phase2_message(
        detection_input if detection_input is not None else request_path,
        service="WEB",
    )
    severity = "info"
    summary = "A synthetic visitor opened a fictional decoy route"
    if interaction.interaction == "login_attempt":
        severity = "medium"
        summary = "A synthetic login attempt was recorded; no password was received or stored"
    elif interaction.interaction == "protected_route_attempt":
        severity = "high"
        summary = "A synthetic visitor attempted to access a protected decoy route"
    if not simulated:
        summary = summary.replace("synthetic visitor", "local visitor")
        summary = summary.replace("synthetic login attempt", "local login attempt")
    if phase2_detections:
        severity_rank = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
        severity = max(
            [severity, *(item["severity"] for item in phase2_detections)],
            key=severity_rank.__getitem__,
        )
        categories = ", ".join(
            dict.fromkeys(item["category"] for item in phase2_detections)
        )
        summary += f"; Phase 2 rule indicators: {categories[:200]}"
    return _persist(
        {
            "source_type": "web",
            "event_type": interaction.interaction,
            "severity": severity,
            "source_address": source_address,
            "target": path[:300],
            "session_id": interaction.session_id or f"web_{uuid.uuid4().hex[:16]}",
            "summary": summary,
            "metadata": {
                "route": path[:200],
                "method": interaction.method.upper()[:10],
                "username": interaction.username,
                "login_data_collected": False,
                "simulated": simulated,
                "network": network_metadata or {},
                "phase2_analysis": [
                    {
                        "category": item["category"],
                        "severity": item["severity"],
                        "reason": item["reason"],
                    }
                    for item in phase2_detections
                ],
            },
        },
        ingestion_source="web_decoy" if simulated else "local_web_decoy",
        phase2_findings=phase2_detections,
    )


def record_database_interaction(interaction: DatabaseInteractionInput) -> Event:
    severities = {
        "connect": "info",
        "read": "low",
        "write": "medium",
        "schema_probe": "high",
        "denied_operation": "critical",
    }
    target = interaction.target.strip()
    if not target.startswith("decoy://"):
        target = f"decoy://{target.lstrip('/')}"
    phase2_detections = analyze_phase2_message(
        f"database {interaction.operation_category.replace('_', ' ')}",
        service="DATABASE",
    )
    severity_rank = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
    severity = max(
        [severities[interaction.operation_category], *(item["severity"] for item in phase2_detections)],
        key=severity_rank.__getitem__,
    )
    categories = list(dict.fromkeys(item["category"] for item in phase2_detections))
    summary = f"Synthetic {interaction.operation_category} attempt against the isolated database decoy"
    if categories:
        summary += f"; Phase 2 indicators: {', '.join(categories)}"
    return _persist(
        {
            "source_type": "database",
            "event_type": f"database_{interaction.operation_category}_attempt",
            "severity": severity,
            "source_address": None,
            "target": target[:300],
            "session_id": interaction.session_id or f"db_{uuid.uuid4().hex[:16]}",
            "summary": summary,
            "metadata": {
                "operation_category": interaction.operation_category,
                "simulated": True,
                "real_database_access": False,
                "phase2_analysis": [
                    {
                        "category": item["category"],
                        "severity": item["severity"],
                        "reason": item["reason"],
                    }
                    for item in phase2_detections
                ],
            },
        },
        ingestion_source="database_decoy_simulator",
        phase2_findings=phase2_detections,
    )


def record_ssh_interaction(interaction: SshInteractionInput) -> Event:
    event_configuration = {
        "connection_attempt": (
            "ssh_connection_attempt",
            "low",
            "SSH connection attempt",
        ),
        "banner_probe": (
            "ssh_banner_probe",
            "medium",
            "ssh-2.0 protocol version probe",
        ),
        "authentication_attempt": (
            "ssh_authentication_attempt",
            "medium",
            "ssh failed login authentication attempt",
        ),
        "command_attempt": (
            "ssh_command_attempt",
            "high",
            "ssh command attempt",
        ),
    }
    event_type, base_severity, detector_message = event_configuration[
        interaction.interaction
    ]
    phase2_detections = analyze_phase2_message(detector_message, service="SSH")
    severity_rank = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
    severity = max(
        [base_severity, *(item["severity"] for item in phase2_detections)],
        key=severity_rank.__getitem__,
    )
    categories = list(dict.fromkeys(item["category"] for item in phase2_detections))
    summary = (
        f"Simulated {interaction.interaction.replace('_', ' ')} recorded by the SSH "
        "interaction simulator; no credentials or command text were collected or executed"
    )
    if categories:
        summary += f"; Phase 2 indicators: {', '.join(categories)}"
    return _persist(
        {
            "source_type": "ssh",
            "event_type": event_type,
            "severity": severity,
            "source_address": None,
            "target": "ssh://controlled-simulator",
            "session_id": f"ssh_{uuid.uuid4().hex[:16]}",
            "summary": summary,
            "metadata": {
                "interaction": interaction.interaction,
                "simulated": True,
                "raw_input_stored": False,
                "credentials_collected": False,
                "command_text_collected": False,
                "command_execution": False,
                "phase2_analysis": [
                    {
                        "category": item["category"],
                        "severity": item["severity"],
                        "reason": item["reason"],
                    }
                    for item in phase2_detections
                ],
            },
        },
        ingestion_source="ssh_interaction_simulator",
        phase2_findings=phase2_detections,
    )


def record_mobile_interaction(interaction: MobileInteractionInput) -> Event:
    event_configuration = {
        "app_open": ("mobile_app_open", "info", "mobile application opened"),
        "deep_link_probe": (
            "mobile_deep_link_probe",
            "medium",
            "mobile deep-link probe",
        ),
        "permission_probe": (
            "mobile_permission_probe",
            "medium",
            "android permission probe",
        ),
        "api_probe": ("mobile_api_probe", "low", "mobile API probe"),
    }
    event_type, base_severity, detector_message = event_configuration[
        interaction.interaction
    ]
    phase2_detections = analyze_phase2_message(detector_message, service="MOBILE")
    severity_rank = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
    severity = max(
        [base_severity, *(item["severity"] for item in phase2_detections)],
        key=severity_rank.__getitem__,
    )
    categories = list(dict.fromkeys(item["category"] for item in phase2_detections))
    summary = (
        f"Simulated {interaction.interaction.replace('_', ' ')} recorded for the "
        f"mobile decoy component '{interaction.component}'; no device identifiers or "
        "mobile credentials were collected"
    )
    if categories:
        summary += f"; Phase 2 indicators: {', '.join(categories)}"
    return _persist(
        {
            "source_type": "mobile",
            "event_type": event_type,
            "severity": severity,
            "source_address": None,
            "target": f"mobile://app/{interaction.component}",
            "session_id": f"mobile_{uuid.uuid4().hex[:16]}",
            "summary": summary,
            "metadata": {
                "interaction": interaction.interaction,
                "component": interaction.component,
                "simulated": True,
                "device_identifiers_collected": False,
                "credentials_collected": False,
                "phase2_analysis": [
                    {
                        "category": item["category"],
                        "severity": item["severity"],
                        "reason": item["reason"],
                    }
                    for item in phase2_detections
                ],
            },
        },
        ingestion_source="mobile_interaction_simulator",
        phase2_findings=phase2_detections,
    )


def _safe_cowrie_address(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        return str(ipaddress.ip_address(value))
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Cowrie src_ip must be a valid IP address.") from error


def import_cowrie_events(payload: CowrieImportInput) -> list[Event]:
    imported: list[Event] = []
    for entry in payload.entries:
        event_id = entry.eventid.lower()
        lowered = entry.message.lower()
        if "failed" in event_id or "failed" in lowered or "login" in event_id:
            event_type, severity = "ssh_login_attempt", "medium"
        elif "command" in event_id or "command" in lowered:
            event_type, severity = "ssh_command_attempt", "high"
        elif "connect" in event_id or "connect" in lowered:
            event_type, severity = "ssh_connection_attempt", "low"
        else:
            event_type, severity = "ssh_cowrie_event", "info"
        safe_event_id = re.sub(r"[^a-zA-Z0-9_.-]", "_", entry.eventid)[:100]
        fingerprint_material = "|".join(
            [
                safe_event_id,
                entry.src_ip or "",
                entry.session or "",
                iso_utc(entry.timestamp) if entry.timestamp else "",
                entry.message,
            ]
        )
        fingerprint = hashlib.sha256(fingerprint_material.encode("utf-8")).hexdigest()
        phase2_detections = analyze_phase2_message(entry.message)
        severity_rank = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
        if phase2_detections:
            severity = max(
                [severity, *(item["severity"] for item in phase2_detections)],
                key=severity_rank.__getitem__,
            )
        summary = f"Cowrie-style event imported: {safe_event_id}"
        if phase2_detections:
            categories = ", ".join(
                dict.fromkeys(item["category"] for item in phase2_detections)
            )
            summary += f"; Phase 2 rule indicators: {categories[:200]}"
        imported.append(
            _persist(
                {
                    "source_type": "ssh",
                    "event_type": event_type,
                    "severity": severity,
                    "source_address": _safe_cowrie_address(entry.src_ip),
                    "target": "ssh://cowrie-adapter",
                    "session_id": entry.session or f"ssh_{uuid.uuid4().hex[:16]}",
                    "timestamp": entry.timestamp,
                    "summary": summary,
                    # Raw Cowrie messages can contain credentials. Only a bounded event category is stored.
                    "metadata": {
                        "cowrie_eventid": safe_event_id,
                        "message_category": event_type,
                        "raw_message_stored": False,
                        "phase2_analysis": [
                            {
                                "category": item["category"],
                                "severity": item["severity"],
                                "reason": item["reason"],
                            }
                            for item in phase2_detections
                        ],
                    },
                },
                ingestion_source="cowrie_log_import",
                fingerprint=fingerprint,
                phase2_findings=phase2_detections,
            )
        )
    return imported


DEMO_TEMPLATES = [
    ("web", "route_visit", "low", "/about", "Synthetic visit to the fictional company about page"),
    ("web", "login_attempt", "medium", "/login", "Synthetic login attempt; credentials were not collected"),
    ("web", "protected_route_attempt", "high", "/admin", "Synthetic access attempt against a protected route"),
    ("database", "database_read_attempt", "medium", "decoy://ledger/reports", "Synthetic read attempt in the isolated database decoy"),
]


def generate_demo_events(payload: DemoGenerationInput) -> list[Event]:
    import random

    generated: list[Event] = []
    for index in range(payload.count):
        source_type, event_type, severity, target, summary = random.choice(DEMO_TEMPLATES)
        generated.append(
            _persist(
                {
                    "source_type": source_type,
                    "event_type": event_type,
                    "severity": severity,
                    "source_address": f"198.51.100.{10 + (index % 200)}",
                    "target": target,
                    "session_id": f"demo_{uuid.uuid4().hex[:10]}",
                    "summary": summary,
                    "metadata": {"demo": True, "generated": True},
                },
                ingestion_source="demo_generator",
                environment="test",
            )
        )
    return generated
