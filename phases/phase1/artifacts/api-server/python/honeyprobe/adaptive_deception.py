"""Approval-gated, allowlisted web-decoy response profile changes."""

from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from typing import Literal

from fastapi import HTTPException

from honeyprobe.models import AdaptiveProposal, WebDecoyConfig
from honeyprobe.storage import db_connection, get_detection_finding, iso_utc, query_evidence

ResponseProfile = Literal["baseline", "contextual"]


def _audit(
    connection: sqlite3.Connection,
    *,
    actor_id: str,
    action: str,
    proposal_id: str,
    details: dict[str, object],
) -> None:
    connection.execute(
        """
        INSERT INTO operator_audit_log(
            id, actor_id, action, entity_type, entity_id, occurred_at, details_json
        ) VALUES (?, ?, ?, 'adaptive_proposal', ?, ?, ?)
        """,
        (
            f"audit_{uuid.uuid4().hex}",
            actor_id,
            action,
            proposal_id,
            iso_utc(),
            json.dumps(details, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
        ),
    )


def _proposal_from_row(row: sqlite3.Row) -> AdaptiveProposal:
    return AdaptiveProposal(
        id=row["id"],
        finding_id=row["finding_id"],
        evidence_id=row["evidence_id"],
        response_profile=row["response_profile"],
        previous_profile=row["previous_profile"],
        status=row["status"],
        reason=row["reason"],
        proposed_by=row["proposed_by"],
        proposed_at=datetime.fromisoformat(row["proposed_at"].replace("Z", "+00:00")),
        approved_by=row["approved_by"],
        approved_at=(
            datetime.fromisoformat(row["approved_at"].replace("Z", "+00:00"))
            if row["approved_at"]
            else None
        ),
        applied_at=(
            datetime.fromisoformat(row["applied_at"].replace("Z", "+00:00"))
            if row["applied_at"]
            else None
        ),
        rolled_back_at=(
            datetime.fromisoformat(row["rolled_back_at"].replace("Z", "+00:00"))
            if row["rolled_back_at"]
            else None
        ),
        applied_version=row["applied_version"],
        verification_status=row["verification_status"],
        verification_detail=row["verification_detail"],
    )


def get_web_decoy_config() -> WebDecoyConfig:
    with db_connection() as connection:
        row = connection.execute(
            "SELECT * FROM web_decoy_config WHERE singleton=1"
        ).fetchone()
    if row is None:
        raise RuntimeError("Web decoy configuration is not initialized.")
    return WebDecoyConfig(
        response_profile=row["response_profile"],
        version=row["version"],
        updated_at=datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00")),
        updated_by=row["updated_by"],
    )


def verify_web_decoy_config(
    expected_profile: ResponseProfile | None = None,
    expected_version: int | None = None,
) -> tuple[bool, str]:
    config = get_web_decoy_config()
    if config.response_profile not in {"baseline", "contextual"}:
        return False, "Stored response profile is outside the allowlist."
    if expected_profile and config.response_profile != expected_profile:
        return False, "Stored profile does not match the approved proposal."
    if expected_version is not None and config.version != expected_version:
        return False, "Stored configuration version does not match the applied version."
    return True, f"Verified allowlisted web-decoy profile {config.response_profile} at version {config.version}."


def list_adaptive_proposals(limit: int = 100) -> list[AdaptiveProposal]:
    with db_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM adaptive_proposals ORDER BY proposed_at DESC, id DESC LIMIT ?",
            (min(max(limit, 1), 500),),
        ).fetchall()
    return [_proposal_from_row(row) for row in rows]


def create_adaptive_proposal(
    *,
    finding_id: str,
    response_profile: ResponseProfile,
    reason: str,
    actor_id: str,
) -> AdaptiveProposal:
    finding = get_detection_finding(finding_id)
    if finding is None:
        raise HTTPException(
            status_code=404,
            detail="The referenced non-test finding was not found.",
        )
    evidence = next(
        (
            item
            for item in query_evidence(
                event_id=finding.event_id, limit=1, include_demo=False
            )
            if item.id == finding.evidence_id
        ),
        None,
    )
    if evidence is None:
        raise HTTPException(
            status_code=409,
            detail="The finding's linked non-test evidence is unavailable.",
        )

    proposal_id = f"adapt_{uuid.uuid4().hex}"
    proposed_at = iso_utc()
    with db_connection() as connection:
        config = connection.execute(
            "SELECT response_profile FROM web_decoy_config WHERE singleton=1"
        ).fetchone()
        if config is None:
            raise HTTPException(status_code=503, detail="Web decoy configuration is unavailable.")
        if config["response_profile"] == response_profile:
            raise HTTPException(
                status_code=409,
                detail="The requested profile is already active; no change is needed.",
            )
        connection.execute(
            """
            INSERT INTO adaptive_proposals(
                id, finding_id, evidence_id, response_profile, status, reason,
                proposed_by, proposed_at, verification_status, verification_detail
            ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, 'not_run', 'Awaiting operator approval.')
            """,
            (
                proposal_id,
                finding.id,
                evidence.id,
                response_profile,
                reason.strip(),
                actor_id,
                proposed_at,
            ),
        )
        _audit(
            connection,
            actor_id=actor_id,
            action="adaptation.proposed",
            proposal_id=proposal_id,
            details={
                "finding_id": finding.id,
                "evidence_id": evidence.id,
                "response_profile": response_profile,
            },
        )
        row = connection.execute(
            "SELECT * FROM adaptive_proposals WHERE id=?", (proposal_id,)
        ).fetchone()
    return _proposal_from_row(row)


def approve_adaptive_proposal(proposal_id: str, actor_id: str) -> AdaptiveProposal:
    with db_connection() as connection:
        proposal = connection.execute(
            "SELECT * FROM adaptive_proposals WHERE id=?", (proposal_id,)
        ).fetchone()
        if proposal is None:
            raise HTTPException(status_code=404, detail="Adaptation proposal not found.")
        if proposal["status"] != "pending":
            raise HTTPException(status_code=409, detail="Only pending proposals can be approved.")
        config = connection.execute(
            "SELECT * FROM web_decoy_config WHERE singleton=1"
        ).fetchone()
        if config is None:
            raise HTTPException(status_code=503, detail="Web decoy configuration is unavailable.")
        if config["response_profile"] == proposal["response_profile"]:
            raise HTTPException(
                status_code=409,
                detail="The requested profile is already active; proposal was not applied.",
            )
        next_version = int(config["version"]) + 1
        now = iso_utc()
        connection.execute(
            """
            UPDATE web_decoy_config SET response_profile=?, version=?,
                updated_at=?, updated_by=? WHERE singleton=1
            """,
            (proposal["response_profile"], next_version, now, actor_id),
        )
        verified = connection.execute(
            "SELECT response_profile, version FROM web_decoy_config WHERE singleton=1"
        ).fetchone()
        verified_ok = (
            verified is not None
            and verified["response_profile"] == proposal["response_profile"]
            and verified["version"] == next_version
        )
        if not verified_ok:
            raise HTTPException(
                status_code=503,
                detail="Configuration verification failed; the transaction was rolled back.",
            )
        detail = f"Verified allowlisted response profile {verified['response_profile']} at version {next_version}."
        connection.execute(
            """
            UPDATE adaptive_proposals SET previous_profile=?, status='applied',
                approved_by=?, approved_at=?, applied_at=?, applied_version=?,
                verification_status='passed', verification_detail=? WHERE id=?
            """,
            (
                config["response_profile"],
                actor_id,
                now,
                now,
                next_version,
                detail,
                proposal_id,
            ),
        )
        _audit(
            connection,
            actor_id=actor_id,
            action="adaptation.approved_and_applied",
            proposal_id=proposal_id,
            details={
                "response_profile": verified["response_profile"],
                "previous_profile": config["response_profile"],
                "version": next_version,
                "verification_status": "passed",
            },
        )
        updated = connection.execute(
            "SELECT * FROM adaptive_proposals WHERE id=?", (proposal_id,)
        ).fetchone()
    return _proposal_from_row(updated)


def reject_adaptive_proposal(proposal_id: str, actor_id: str) -> AdaptiveProposal:
    with db_connection() as connection:
        proposal = connection.execute(
            "SELECT * FROM adaptive_proposals WHERE id=?", (proposal_id,)
        ).fetchone()
        if proposal is None:
            raise HTTPException(status_code=404, detail="Adaptation proposal not found.")
        if proposal["status"] != "pending":
            raise HTTPException(status_code=409, detail="Only pending proposals can be rejected.")
        now = iso_utc()
        connection.execute(
            "UPDATE adaptive_proposals SET status='rejected', approved_by=?, approved_at=?, verification_detail='Rejected by operator; no configuration change was applied.' WHERE id=?",
            (actor_id, now, proposal_id),
        )
        _audit(
            connection,
            actor_id=actor_id,
            action="adaptation.rejected",
            proposal_id=proposal_id,
            details={"finding_id": proposal["finding_id"]},
        )
        updated = connection.execute(
            "SELECT * FROM adaptive_proposals WHERE id=?", (proposal_id,)
        ).fetchone()
    return _proposal_from_row(updated)


def rollback_adaptive_proposal(
    proposal_id: str, actor_id: str
) -> AdaptiveProposal:
    with db_connection() as connection:
        proposal = connection.execute(
            "SELECT * FROM adaptive_proposals WHERE id=?", (proposal_id,)
        ).fetchone()
        if proposal is None:
            raise HTTPException(status_code=404, detail="Adaptation proposal not found.")
        if proposal["status"] != "applied" or not proposal["previous_profile"]:
            raise HTTPException(status_code=409, detail="Only applied proposals can be rolled back.")
        config = connection.execute(
            "SELECT * FROM web_decoy_config WHERE singleton=1"
        ).fetchone()
        if (
            config is None
            or config["version"] != proposal["applied_version"]
            or config["response_profile"] != proposal["response_profile"]
        ):
            raise HTTPException(
                status_code=409,
                detail="The decoy configuration changed since this proposal; refusing to overwrite newer work.",
            )
        next_version = int(config["version"]) + 1
        now = iso_utc()
        connection.execute(
            """
            UPDATE web_decoy_config SET response_profile=?, version=?,
                updated_at=?, updated_by=? WHERE singleton=1
            """,
            (proposal["previous_profile"], next_version, now, actor_id),
        )
        verified = connection.execute(
            "SELECT response_profile, version FROM web_decoy_config WHERE singleton=1"
        ).fetchone()
        if (
            verified is None
            or verified["response_profile"] != proposal["previous_profile"]
            or verified["version"] != next_version
        ):
            raise HTTPException(
                status_code=503,
                detail="Rollback verification failed; the transaction was rolled back.",
            )
        detail = f"Rollback verified: restored {verified['response_profile']} at version {next_version}."
        connection.execute(
            """
            UPDATE adaptive_proposals SET status='rolled_back', rolled_back_at=?,
                verification_status='passed', verification_detail=? WHERE id=?
            """,
            (now, detail, proposal_id),
        )
        _audit(
            connection,
            actor_id=actor_id,
            action="adaptation.rolled_back",
            proposal_id=proposal_id,
            details={
                "response_profile": verified["response_profile"],
                "version": next_version,
                "verification_status": "passed",
            },
        )
        updated = connection.execute(
            "SELECT * FROM adaptive_proposals WHERE id=?", (proposal_id,)
        ).fetchone()
    return _proposal_from_row(updated)
