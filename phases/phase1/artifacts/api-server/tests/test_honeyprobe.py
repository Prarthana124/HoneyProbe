from __future__ import annotations

import json
import os
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
        self.assertNotIn("should-not-persist", _db_path.read_bytes().decode("latin-1"))

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
        self.assertEqual(test_run.json()["failed"], 0)
        self.assertGreaterEqual(test_run.json()["passed"], 6)

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


if __name__ == "__main__":
    unittest.main()
