from __future__ import annotations

import json
import hashlib
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


_test_dir = tempfile.TemporaryDirectory(prefix="honeyprobe-tests-")
_db_path = Path(_test_dir.name) / "honeyprobe-test.sqlite3"
os.environ["HONEYPROBE_DB_PATH"] = str(_db_path)
os.environ["HONEYPROBE_ENV"] = "test"

from fastapi.testclient import TestClient  # noqa: E402
from honeyprobe.main import app  # noqa: E402
from honeyprobe.models import EvidenceRecord  # noqa: E402
from honeyprobe.self_tests import SelfTestBlocked  # noqa: E402
from honeyprobe.storage import db_connection, initialize_database  # noqa: E402


class HoneyProbeApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.client_context.__exit__(None, None, None)

    def test_health_and_sqlite_persistence(self) -> None:
        health = self.client.get("/api/health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()["database"]["engine"], "SQLite")

        response = self.client.post(
            "/api/events",
            json={
                "source_type": "web",
                "event_type": "test_observation",
                "severity": "medium",
                "target": "/test-record",
                "session_id": "persistence-session",
                "summary": "SQLite persistence check",
                "metadata": {"origin": "unit-test"},
                "environment": "local",
                "ingestion_source": "test",
            },
        )
        self.assertEqual(response.status_code, 201)
        event_id = response.json()["id"]
        reopened = TestClient(app)
        with reopened:
            stored = reopened.get(f"/api/events/{event_id}")
        self.assertEqual(stored.status_code, 200)
        self.assertEqual(stored.json()["summary"], "SQLite persistence check")

    def test_web_decoy_records_without_accepting_passwords(self) -> None:
        response = self.client.post(
            "/api/decoys/web/interaction",
            json={
                "route": "/login",
                "interaction": "login_attempt",
                "method": "POST",
                "session_id": "web-safe-session",
                "username": "demo-operator",
                "password": "NEVER-PERSIST-THIS",
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("NEVER-PERSIST-THIS", response.text)
        self.assertNotIn("NEVER-PERSIST-THIS", _db_path.read_bytes().decode("latin-1"))

        accepted = self.client.post(
            "/api/decoys/web/interaction",
            json={
                "route": "/login",
                "interaction": "login_attempt",
                "method": "POST",
                "session_id": "web-safe-session",
                "username": "demo-operator",
            },
        )
        self.assertEqual(accepted.status_code, 201)
        self.assertNotIn("password", accepted.json()["metadata"])
        self.assertFalse(accepted.json()["metadata"]["login_data_collected"])

    def test_loopback_web_decoy_records_real_visit_and_phase2_evidence(self) -> None:
        response = self.client.get(
            "/decoy/%2e%2e/%2e%2e/local-check",
            headers={
                "x-forwarded-for": "203.0.113.222",
                "user-agent": "private-user-agent-marker",
            },
        )
        self.assertEqual(response.status_code, 404)
        self.assertIn("X-HoneyProbe-Event-ID", response.headers)
        self.assertNotIn("../../local-check", response.text)

        event_id = response.headers["X-HoneyProbe-Event-ID"]
        event_response = self.client.get(f"/api/events/{event_id}")
        self.assertEqual(event_response.status_code, 200)
        event = event_response.json()
        self.assertEqual(event["ingestion_source"], "local_web_decoy")
        self.assertFalse(event["metadata"]["simulated"])
        self.assertEqual(event["target"], "/unmatched")
        self.assertIsNone(event["source_address"])
        self.assertNotIn("203.0.113.222", json.dumps(event))
        self.assertEqual(event["metadata"]["network"]["protocol"], "http")
        self.assertEqual(event["metadata"]["network"]["method"], "GET")
        self.assertEqual(event["metadata"]["network"]["path"], "/unmatched")
        self.assertEqual(
            event["metadata"]["network"]["user_agent"],
            "private-user-agent-marker",
        )
        self.assertIsNotNone(event["timestamp"])
        self.assertEqual(
            event["metadata"]["network"]["source_port"],
            50000,
        )
        self.assertTrue(
            any(
                item["category"] == "Path Traversal"
                for item in event["metadata"]["phase2_analysis"]
            )
        )
        findings = self.client.get(
            "/api/findings",
            params={"event_id": event_id, "include_demo": "true"},
        )
        self.assertEqual(findings.status_code, 200)
        self.assertEqual(len(findings.json()), 1)
        self.assertEqual(findings.json()[0]["rule_name"], "Path Traversal")

        evidence = self.client.get(f"/api/evidence/{event_id}?include_demo=true")
        self.assertEqual(evidence.status_code, 200)
        self.assertEqual(findings.json()[0]["evidence_id"], evidence.json()["id"])
        self.assertNotIn("../../local-check", evidence.text)

    def test_local_decoy_metadata_redacts_credentials_from_user_agent(self) -> None:
        response = self.client.get(
            "/decoy/about",
            headers={
                "user-agent": "HoneyProbeTest token=do-not-store authorization=Bearer secret-value",
            },
        )
        self.assertEqual(response.status_code, 200)
        event = self.client.get(
            f"/api/events/{response.headers['X-HoneyProbe-Event-ID']}"
        ).json()
        user_agent = event["metadata"]["network"]["user_agent"]
        self.assertEqual(user_agent, "HoneyProbeTest token=[redacted] authorization=[redacted]")
        self.assertNotIn("do-not-store", json.dumps(event))
        self.assertNotIn("secret-value", json.dumps(event))

    def test_loopback_web_decoy_login_never_accepts_or_persists_credentials(self) -> None:
        private_marker = "decoy-password-must-not-persist"
        rejected = self.client.post(
            "/decoy/login",
            content=f"password={private_marker}",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        self.assertEqual(rejected.status_code, 400)
        self.assertNotIn(private_marker, rejected.text)
        self.assertNotIn(private_marker, _db_path.read_bytes().decode("latin-1"))

        accepted = self.client.post("/decoy/login")
        self.assertEqual(accepted.status_code, 200)
        self.assertIn("never accepts or stores credentials", accepted.text)
        self.assertIn("X-HoneyProbe-Event-ID", accepted.headers)
        event = self.client.get(
            f"/api/events/{accepted.headers['X-HoneyProbe-Event-ID']}"
        ).json()
        self.assertEqual(event["event_type"], "login_attempt")

    def test_secret_metadata_is_removed_before_storage(self) -> None:
        response = self.client.post(
            "/api/events",
            json={
                "source_type": "web",
                "event_type": "safe_metadata_test",
                "severity": "low",
                "target": "/metadata-test",
                "summary": "Sensitive metadata filtering",
                "metadata": {
                    "visible": "kept",
                    "nested": {"access_token": "hidden", "count": 1},
                    "password": "hidden",
                    "request_note": "Authorization: Bearer metadata-secret-marker",
                },
                "environment": "local",
                "ingestion_source": "test",
            },
        )
        self.assertEqual(response.status_code, 201)
        metadata = response.json()["metadata"]
        self.assertEqual(metadata["visible"], "kept")
        self.assertEqual(metadata["nested"], {"count": 1})
        self.assertNotIn("password", metadata)
        self.assertNotIn("access_token", json.dumps(metadata))
        self.assertNotIn("metadata-secret-marker", json.dumps(metadata))

    def test_evidence_lookup_is_exact_redacted_and_hides_test_records_by_default(self) -> None:
        sensitive_markers = (
            "target-secret-marker",
            "summary-secret-marker",
            "metadata-secret-marker",
        )
        with patch.dict(os.environ, {"HONEYPROBE_ENV": "development"}):
            created = self.client.post(
                "/api/events",
                json={
                    "source_type": "web",
                    "event_type": "evidence_lookup_test",
                    "severity": "medium",
                    "target": f"/audit?access_token={sensitive_markers[0]}",
                    "summary": f"Authorization: Bearer {sensitive_markers[1]}",
                    "metadata": {
                        "request_note": f"token={sensitive_markers[2]}",
                        "visible": "retained",
                    },
                    "environment": "local",
                    "ingestion_source": "evidence_lookup_test",
                },
            )
        self.assertEqual(created.status_code, 201)
        event = created.json()
        self.assertTrue(all(marker not in created.text for marker in sensitive_markers))

        evidence_list = self.client.get(
            "/api/evidence",
            params={"event_id": event["id"], "include_demo": "false"},
        )
        self.assertEqual(evidence_list.status_code, 200)
        self.assertEqual(len(evidence_list.json()), 1)
        evidence_id = evidence_list.json()[0]["id"]
        evidence_response = self.client.get(
            f"/api/evidence/by-id/{evidence_id}"
        )
        self.assertEqual(evidence_response.status_code, 200)
        evidence = evidence_response.json()
        self.assertTrue(evidence["redacted"])
        self.assertEqual(evidence["id"], evidence_id)
        self.assertEqual(evidence["event_id"], event["id"])
        self.assertTrue(all(marker not in evidence_response.text for marker in sensitive_markers))
        self.assertEqual(evidence["event"]["metadata"]["visible"], "retained")
        self.assertEqual(
            self.client.get("/api/evidence/by-id/evidence_missing").status_code,
            404,
        )

        canonical_event = json.dumps(
            evidence["event"],
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        self.assertEqual(
            evidence["sha256"],
            hashlib.sha256(canonical_event.encode("utf-8")).hexdigest(),
        )

        persisted = EvidenceRecord.model_validate(evidence)
        legacy_event = persisted.event.model_copy(
            update={
                "summary": "password=legacy-summary-secret",
                "target": "/legacy?token=legacy-target-secret",
                "metadata": {
                    "header": "Authorization: Bearer legacy-metadata-secret",
                },
            }
        )
        legacy_record = persisted.model_copy(update={"event": legacy_event})
        with patch("honeyprobe.main.query_evidence", return_value=[legacy_record]):
            legacy_response = self.client.get(
                f"/api/evidence/by-id/{evidence_id}"
            )
        self.assertEqual(legacy_response.status_code, 200)
        self.assertTrue(legacy_response.json()["redacted"])
        for marker in (
            "legacy-summary-secret",
            "legacy-target-secret",
            "legacy-metadata-secret",
        ):
            self.assertNotIn(marker, legacy_response.text)

        with patch.dict(os.environ, {"HONEYPROBE_ENV": "test"}):
            test_event_response = self.client.post(
                "/api/events",
                json={
                    "source_type": "web",
                    "event_type": "test_only_evidence_lookup",
                    "severity": "info",
                    "target": "/test-evidence",
                    "summary": "Test-only evidence",
                    "metadata": {},
                    "environment": "test",
                    "ingestion_source": "evidence_lookup_test",
                },
            )
        self.assertEqual(test_event_response.status_code, 201)
        test_event = test_event_response.json()
        test_evidence = self.client.get(
            "/api/evidence",
            params={"event_id": test_event["id"], "include_demo": "true"},
        ).json()[0]
        self.assertEqual(
            self.client.get(
                f"/api/evidence/by-id/{test_evidence['id']}"
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(f"/api/evidence/{test_event['id']}").status_code,
            404,
        )
        self.assertEqual(
            self.client.get(
                f"/api/evidence/{test_event['id']}?include_demo=true"
            ).status_code,
            200,
        )

    def test_invalid_event_payload_is_rejected_without_echoing_input(self) -> None:
        response = self.client.post(
            "/api/events",
            json={
                "source_type": "not-a-decoy",
                "event_type": "bad",
                "severity": "urgent",
                "target": "/bad",
                "summary": "malformed",
                "metadata": {},
                "password": "PRIVATE-INPUT",
            },
        )
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("PRIVATE-INPUT", response.text)

    def test_request_body_limit_also_covers_chunked_uploads(self) -> None:
        response = self.client.post(
            "/api/events",
            content=iter((b"x" * (256 * 1024), b"x")),
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"], "request_too_large")

    def test_synthetic_generation_is_disabled_outside_demo_environment(self) -> None:
        with patch.dict(os.environ, {"HONEYPROBE_ENV": "production"}):
            response = self.client.post("/api/demo/generate", json={"count": 1})
        self.assertEqual(response.status_code, 403)
        with patch.dict(os.environ, {"HONEYPROBE_ENV": "production"}):
            event_response = self.client.post(
                "/api/events",
                json={
                    "source_type": "web",
                    "event_type": "synthetic_test",
                    "severity": "low",
                    "target": "/synthetic",
                    "summary": "Should be blocked",
                    "metadata": {"test": True},
                    "environment": "test",
                    "ingestion_source": "operator",
                },
            )
        self.assertEqual(event_response.status_code, 403)

    def test_cowrie_import_is_normalized_and_deduplicated(self) -> None:
        payload = {
            "entries": [
                {
                    "eventid": "cowrie.login.failed",
                    "src_ip": "198.51.100.44",
                    "session": "cowrie-session-1",
                    "timestamp": "2026-01-01T10:00:00Z",
                    "message": "login failed for synthetic-user password=should-not-persist",
                }
            ]
        }
        first = self.client.post("/api/imports/cowrie", json=payload)
        second = self.client.post("/api/imports/cowrie", json=payload)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(first.json()["events"][0]["id"], second.json()["events"][0]["id"])
        findings = self.client.get(
            "/api/findings",
            params={"event_id": first.json()["events"][0]["id"], "include_demo": "true"},
        )
        self.assertEqual(findings.status_code, 200)
        self.assertEqual(len(findings.json()), 1)
        self.assertEqual(findings.json()[0]["rule_name"], "Brute Force")
        self.assertNotIn("should-not-persist", _db_path.read_bytes().decode("latin-1"))

    def test_cowrie_import_reuses_phase2_rules_without_storing_raw_message(self) -> None:
        private_marker = "phase2-fixture-secret-must-not-persist"
        response = self.client.post(
            "/api/imports/cowrie",
            json={
                "entries": [
                    {
                        "eventid": "cowrie.login.failed",
                        "src_ip": "198.51.100.45",
                        "session": "phase2-adapter-session",
                        "message": (
                            "login failed; UNION SELECT username,password FROM users; "
                            f"password={private_marker}"
                        ),
                    }
                ]
            },
        )
        self.assertEqual(response.status_code, 201)
        event = response.json()["events"][0]
        detections = event["metadata"]["phase2_analysis"]
        self.assertTrue(any(item["category"] == "SQL Injection" for item in detections))
        self.assertTrue(any(item["category"] == "Brute Force" for item in detections))
        findings_response = self.client.get(
            "/api/findings",
            params={"event_id": event["id"], "include_demo": "true"},
        )
        self.assertEqual(findings_response.status_code, 200)
        findings = findings_response.json()
        self.assertEqual(
            {finding["rule_name"] for finding in findings},
            {"SQL Injection", "Brute Force"},
        )
        self.assertTrue(all(finding["detector"] == "phase2" for finding in findings))
        evidence = self.client.get(
            f"/api/evidence/{event['id']}?include_demo=true"
        ).json()
        self.assertEqual(
            {finding["evidence_id"] for finding in findings},
            {evidence["id"]},
        )
        self.assertTrue(all(finding["event_id"] == event["id"] for finding in findings))
        self.assertNotIn(private_marker, json.dumps(event))
        database_text = _db_path.read_bytes().decode("latin-1")
        self.assertNotIn(private_marker, database_text)
        self.assertNotIn("UNION SELECT", database_text)

    def test_export_and_self_tests_use_real_records(self) -> None:
        csv_response = self.client.get("/api/reports/export")
        self.assertEqual(csv_response.status_code, 200)
        self.assertTrue(csv_response.text.startswith("id,timestamp_utc,"))
        self.client.post(
            "/api/events",
            json={
                "source_type": "web",
                "event_type": "export_filter_marker",
                "severity": "high",
                "target": "/export-filter",
                "summary": "Unique export filter marker",
                "metadata": {},
                "environment": "local",
                "ingestion_source": "test",
            },
        )
        filtered_csv = self.client.get(
            "/api/events/export",
            params={
                "q": "export_filter_marker",
                "severity": "high",
                "source_type": "web",
                "event_type": "export_filter_marker",
            },
        )
        self.assertEqual(filtered_csv.status_code, 200)
        self.assertIn("Unique export filter marker", filtered_csv.text)
        self.assertTrue(filtered_csv.text.startswith("id,timestamp_utc,"))
        html_response = self.client.get("/api/reports/html")
        self.assertEqual(html_response.status_code, 200)
        self.assertIn("HoneyProbe telemetry report", html_response.text)

        test_run = self.client.post("/api/self-tests/run")
        self.assertEqual(test_run.status_code, 200)
        run_result = test_run.json()
        self.assertEqual(run_result["failed"], 0)
        self.assertEqual(run_result["blocked"], 0)
        self.assertGreaterEqual(run_result["passed"], 9)
        self_test_names = {result["name"] for result in run_result["results"]}
        self.assertIn("Phase 2 detection adapter", self_test_names)
        self.assertIn("Phase 3 dry-run engine", self_test_names)
        phase3_result = next(
            result
            for result in run_result["results"]
            if result["name"] == "Phase 3 dry-run engine"
        )
        self.assertIn("none applied", phase3_result["diagnostic"])

    def test_self_test_run_counts_blocked_prerequisites_separately(self) -> None:
        with patch(
            "honeyprobe.self_tests.run_phase3_dry_run",
            side_effect=SelfTestBlocked("Phase 3 is unavailable."),
        ):
            response = self.client.post("/api/self-tests/run")
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["blocked"], 1)
        self.assertEqual(
            result["passed"] + result["failed"] + result["blocked"],
            len(result["results"]),
        )
        phase3_result = next(
            item for item in result["results"] if item["name"] == "Phase 3 dry-run engine"
        )
        self.assertEqual(phase3_result["status"], "blocked")

    def test_self_test_status_schema_migration_preserves_existing_rows(self) -> None:
        with tempfile.TemporaryDirectory(prefix="honeyprobe-self-test-migration-") as temp:
            database = Path(temp) / "legacy.sqlite3"
            with sqlite3.connect(database) as connection:
                connection.execute(
                    """
                    CREATE TABLE self_test_results (
                        name TEXT PRIMARY KEY,
                        status TEXT NOT NULL CHECK (status IN ('pass', 'fail', 'not_run')),
                        duration_ms INTEGER NOT NULL,
                        last_run TEXT NOT NULL,
                        diagnostic TEXT NOT NULL
                    )
                    """
                )
                connection.execute(
                    """
                    INSERT INTO self_test_results(name, status, duration_ms, last_run, diagnostic)
                    VALUES ('existing check', 'pass', 4, '2026-10-23T00:00:00Z', 'preserved')
                    """
                )

            with patch.dict(
                os.environ,
                {
                    "HONEYPROBE_DB_PATH": str(database),
                    "HONEYPROBE_ENV": "test",
                },
            ):
                initialize_database()
                with db_connection() as connection:
                    existing = connection.execute(
                        "SELECT * FROM self_test_results WHERE name = 'existing check'"
                    ).fetchone()
                    self.assertEqual(existing["status"], "pass")
                    self.assertEqual(existing["diagnostic"], "preserved")
                    connection.execute(
                        """
                        INSERT INTO self_test_results(
                            name, status, duration_ms, last_run, diagnostic
                        ) VALUES ('blocked check', 'blocked', 0, '2026-10-23T00:00:00Z', 'unavailable')
                        """
                    )
                    blocked = connection.execute(
                        "SELECT status FROM self_test_results WHERE name = 'blocked check'"
                    ).fetchone()
                    self.assertEqual(blocked["status"], "blocked")

    def test_demo_reset_only_removes_test_events(self) -> None:
        with patch.dict(os.environ, {"HONEYPROBE_ENV": "development"}):
            observed = self.client.post(
                "/api/events",
                json={
                    "source_type": "web",
                    "event_type": "observed_preservation_test",
                    "severity": "info",
                    "target": "/preserve",
                    "summary": "Observed event",
                    "metadata": {},
                    "environment": "local",
                    "ingestion_source": "test",
                },
            )
        self.assertEqual(observed.status_code, 201)
        reset = self.client.post("/api/demo/reset")
        self.assertEqual(reset.status_code, 200)
        self.assertTrue(reset.json()["preserved_observed_events"])
        found = self.client.get(f"/api/events/{observed.json()['id']}")
        self.assertEqual(found.status_code, 200)

    def test_live_event_evidence_profile_report_and_dry_run_audit(self) -> None:
        with patch.dict(os.environ, {"HONEYPROBE_ENV": "development"}):
            imported = self.client.post(
                "/api/imports/cowrie",
                json={
                    "entries": [
                        {
                            "eventid": "cowrie.login.failed",
                            "src_ip": "203.0.113.77",
                            "session": "e2e-observed-session",
                            "message": "login failed; UNION SELECT username,password FROM users",
                        }
                    ]
                },
            )
        self.assertEqual(imported.status_code, 201)
        event = imported.json()["events"][0]
        self.assertEqual(event["environment"], "local")
        self.assertTrue(event["metadata"]["phase2_analysis"])
        self.assertNotIn("UNION SELECT", json.dumps(event))

        listed = self.client.get("/api/events?include_demo=false&limit=200")
        self.assertEqual(listed.status_code, 200)
        self.assertIn(event["id"], {item["id"] for item in listed.json()["items"]})

        profiles = self.client.get("/api/sources/profiles?include_demo=false")
        self.assertEqual(profiles.status_code, 200)
        source = next(
            item for item in profiles.json()
            if item["source_address"] == "203.0.113.77"
        )
        self.assertEqual(source["event_count"], 1)
        self.assertGreaterEqual(source["category_counts"].get("SQL Injection", 0), 1)
        self.assertFalse(source["includes_demo_data"])

        evidence_response = self.client.get(
            f"/api/evidence/{event['id']}?include_demo=true"
        )
        self.assertEqual(evidence_response.status_code, 200)
        evidence = evidence_response.json()
        canonical_event = json.dumps(
            evidence["event"],
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        event_digest = hashlib.sha256(canonical_event.encode("utf-8")).hexdigest()
        self.assertEqual(evidence["sha256"], event_digest)
        chain_material = f"{evidence['previous_hash'] or ''}\n{event_digest}".encode("utf-8")
        self.assertEqual(
            evidence["chain_hash"],
            hashlib.sha256(chain_material).hexdigest(),
        )

        overview = self.client.get("/api/overview?include_demo=false")
        self.assertEqual(overview.status_code, 200)
        self.assertNotIn(
            "test",
            {item["environment"] for item in overview.json()["recent_events"]},
        )
        self.assertIn(event["id"], {item["id"] for item in overview.json()["recent_events"]})

        report_response = self.client.post("/api/reports/generate")
        self.assertEqual(report_response.status_code, 201)
        report = report_response.json()
        self.assertFalse(report["summary"]["includes_demo_data"])
        self.assertIn(event["id"], {item["id"] for item in report["events"]})
        report_unsigned = {key: value for key, value in report.items() if key != "sha256"}
        report_canonical = json.dumps(
            report_unsigned,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        self.assertEqual(
            report["sha256"],
            hashlib.sha256(report_canonical.encode("utf-8")).hexdigest(),
        )

        denied_action = self.client.post(
            "/api/adaptive-actions/dry-run",
            json={
                "action": "restrict_file_permissions",
                "finding_id": "untrusted-finding",
                "reason": "unauthenticated preview attempt",
            },
        )
        self.assertEqual(denied_action.status_code, 403)
        authorized_preview = self.client.post(
            "/api/adaptive-actions/dry-run",
            headers={"x-honeyprobe-operator": "test-verified-operator"},
            json={
                "action": "restrict_file_permissions",
                "finding_id": self.client.get(
                    "/api/findings",
                    params={"event_id": event["id"], "include_demo": "true"},
                ).json()[0]["id"],
                "reason": "integration test preview only",
            },
        )
        self.assertEqual(authorized_preview.status_code, 201)
        self.assertEqual(authorized_preview.json()["mode"], "dry_run")
        self.assertFalse(authorized_preview.json()["applied"])
        self.assertEqual(
            authorized_preview.json()["actor_id"],
            "test-verified-operator",
        )
        self.assertEqual(
            authorized_preview.json()["finding_id"],
            authorized_preview.json()["preview"]["evidence_context"]["finding_id"],
        )
        self.assertEqual(
            authorized_preview.json()["evidence_id"],
            authorized_preview.json()["preview"]["evidence_context"]["evidence_id"],
        )
        self.assertEqual(
            authorized_preview.json()["preview"]["recommendation"]["mode"],
            "preview_only",
        )
        audit = self.client.get("/api/adaptive-actions/audit")
        self.assertEqual(audit.status_code, 200)
        self.assertTrue(
            any(
                item["id"] == authorized_preview.json()["id"]
                and item["applied"] is False
                and item["evidence_id"] == authorized_preview.json()["evidence_id"]
                for item in audit.json()
            )
        )

        with TestClient(app) as restarted_client:
            persisted_event = restarted_client.get(f"/api/events/{event['id']}")
            persisted_evidence = restarted_client.get(
                f"/api/evidence/{event['id']}?include_demo=true"
            )
            persisted_report = restarted_client.get(f"/api/reports/{report['id']}")
            persisted_audit = restarted_client.get("/api/adaptive-actions/audit")
            verified_report = restarted_client.get(
                "/api/reports/verify",
                params={"sha256": report["sha256"]},
            )
        self.assertEqual(persisted_event.status_code, 200)
        self.assertEqual(persisted_evidence.json()["sha256"], evidence["sha256"])
        self.assertEqual(persisted_report.json()["sha256"], report["sha256"])
        stored_action = next(
            item
            for item in persisted_audit.json()
            if item["id"] == authorized_preview.json()["id"]
        )
        self.assertFalse(stored_action["applied"])
        self.assertEqual(
            stored_action["finding_id"],
            authorized_preview.json()["finding_id"],
        )
        self.assertEqual(
            stored_action["evidence_id"],
            authorized_preview.json()["evidence_id"],
        )
        self.assertTrue(verified_report.json()["valid"])

    def test_adaptive_action_rejects_missing_test_only_and_unlinked_findings(self) -> None:
        with patch.dict(os.environ, {"HONEYPROBE_ENV": "development"}):
            real_import = self.client.post(
                "/api/imports/cowrie",
                json={
                    "entries": [
                        {
                            "eventid": "cowrie.login.failed",
                            "src_ip": "198.51.100.61",
                            "session": "dry-run-validation-real",
                            "message": "failed login; UNION SELECT name FROM accounts",
                        }
                    ]
                },
            )
        self.assertEqual(real_import.status_code, 201)
        real_event = real_import.json()["events"][0]
        real_findings = self.client.get(
            "/api/findings",
            params={"event_id": real_event["id"], "include_demo": "true"},
        )
        self.assertEqual(real_findings.status_code, 200)
        real_finding = next(
            item for item in real_findings.json() if item["rule_name"] == "SQL Injection"
        )

        with patch.dict(os.environ, {"HONEYPROBE_ENV": "test"}):
            test_import = self.client.post(
                "/api/imports/cowrie",
                json={
                    "entries": [
                        {
                            "eventid": "cowrie.login.failed",
                            "src_ip": "198.51.100.62",
                            "session": "dry-run-validation-test",
                            "message": "failed login; UNION SELECT name FROM accounts",
                        }
                    ]
                },
            )
        self.assertEqual(test_import.status_code, 201)
        test_event = test_import.json()["events"][0]
        self.assertEqual(test_event["environment"], "test")
        test_findings = self.client.get(
            "/api/findings",
            params={"event_id": test_event["id"], "include_demo": "true"},
        )
        self.assertEqual(test_findings.status_code, 200)
        test_finding = next(
            item for item in test_findings.json() if item["rule_name"] == "SQL Injection"
        )
        linked_evidence_response = self.client.get(
            f"/api/evidence/{real_event['id']}?include_demo=true"
        )
        self.assertEqual(linked_evidence_response.status_code, 200)
        linked_evidence = EvidenceRecord.model_validate(
            linked_evidence_response.json()
        )

        def request_preview(finding_id: str):
            return self.client.post(
                "/api/adaptive-actions/dry-run",
                headers={"x-honeyprobe-operator": "dry-run-validation-operator"},
                json={
                    "action": "restrict_file_permissions",
                    "finding_id": finding_id,
                    "reason": "Validate finding and evidence requirements.",
                },
            )

        invalid_action = self.client.post(
            "/api/adaptive-actions/dry-run",
            headers={"x-honeyprobe-operator": "dry-run-validation-operator"},
            json={
                "action": "block_source_ip",
                "finding_id": real_finding["id"],
                "reason": "Validate unsupported action rejection.",
            },
        )
        self.assertEqual(invalid_action.status_code, 422)
        empty_reason = self.client.post(
            "/api/adaptive-actions/dry-run",
            headers={"x-honeyprobe-operator": "dry-run-validation-operator"},
            json={
                "action": "restrict_file_permissions",
                "finding_id": real_finding["id"],
                "reason": "",
            },
        )
        self.assertEqual(empty_reason.status_code, 422)

        missing = request_preview("finding_does_not_exist")
        self.assertEqual(missing.status_code, 404)

        test_only = request_preview(test_finding["id"])
        self.assertEqual(test_only.status_code, 404)

        with patch("honeyprobe.main.query_evidence", return_value=[]):
            unlinked = request_preview(real_finding["id"])
        self.assertEqual(unlinked.status_code, 409)
        self.assertIn("linked evidence", unlinked.json()["detail"])

        invalid_evidence_records = {
            "wrong evidence ID": linked_evidence.model_copy(
                update={"id": "evidence_not_linked"}
            ),
            "wrong event ID": linked_evidence.model_copy(
                update={"event_id": "evt_unrelated"}
            ),
        }
        for label, invalid_evidence in invalid_evidence_records.items():
            with self.subTest(linked_evidence=label):
                with patch(
                    "honeyprobe.main.query_evidence",
                    return_value=[invalid_evidence],
                ):
                    invalid = request_preview(real_finding["id"])
                self.assertEqual(invalid.status_code, 409)
                self.assertIn("linked evidence", invalid.json()["detail"])

        audit = self.client.get("/api/adaptive-actions/audit")
        self.assertEqual(audit.status_code, 200)
        self.assertFalse(
            any(
                item["finding_id"]
                in {
                    "finding_does_not_exist",
                    test_finding["id"],
                    real_finding["id"],
                }
                and item["reason"] == "Validate finding and evidence requirements."
                for item in audit.json()
            )
        )


if __name__ == "__main__":
    unittest.main()
