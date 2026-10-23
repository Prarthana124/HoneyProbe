from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


API_DIR = Path(__file__).resolve().parents[1]
PYTHON_DIR = API_DIR / "python"


def unused_local_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


class ServiceRestartIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(prefix="honeyprobe-restart-")
        self.database_path = Path(self.temp_dir.name) / "restart.sqlite3"
        self.process: subprocess.Popen[str] | None = None
        self.base_url = ""

    def tearDown(self) -> None:
        self.stop_service()
        self.temp_dir.cleanup()

    def start_service(self) -> None:
        port = unused_local_port()
        self.base_url = f"http://127.0.0.1:{port}"
        environment = {
            **os.environ,
            "HONEYPROBE_DB_PATH": str(self.database_path),
            "HONEYPROBE_ENV": "development",
            "PYTHONPATH": str(PYTHON_DIR),
        }
        self.process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "honeyprobe.main:app",
                "--app-dir",
                str(PYTHON_DIR),
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            cwd=API_DIR,
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )

        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                self.fail("HoneyProbe API process exited before becoming healthy.")
            try:
                with urllib.request.urlopen(
                    f"{self.base_url}/api/healthz", timeout=1
                ) as response:
                    if response.status == 200:
                        return
            except (OSError, urllib.error.URLError):
                time.sleep(0.1)
        self.fail("HoneyProbe API process did not become healthy within 15 seconds.")

    def stop_service(self) -> None:
        if self.process is None:
            return
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=5)
        self.process = None

    def request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, dict[str, Any]]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request_headers = dict(headers or {})
        if body is not None:
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
            method=method,
            headers=request_headers,
        )
        try:
            response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def test_integrated_data_survives_a_real_api_process_restart(self) -> None:
        self.start_service()

        status, event = self.request(
            "POST",
            "/api/events",
            {
                "source_type": "web",
                "event_type": "controlled_restart_check",
                "severity": "medium",
                "target": "/integration/restart-check",
                "session_id": "restart-flow-session",
                "summary": "Controlled event used for restart verification",
                "metadata": {"test_run": "service-restart"},
                "environment": "local",
                "ingestion_source": "integration-test",
            },
        )
        self.assertEqual(status, 201)

        status, imported = self.request(
            "POST",
            "/api/imports/cowrie",
            {
                "entries": [
                    {
                        "eventid": "cowrie.login.failed",
                        "src_ip": "198.51.100.92",
                        "session": "restart-phase2-session",
                        "message": "failed login; UNION SELECT user,password FROM accounts",
                    }
                ]
            },
        )
        self.assertEqual(status, 201)
        cowrie_event = imported["events"][0]
        categories = {
            finding["category"]
            for finding in cowrie_event["metadata"]["phase2_analysis"]
        }
        self.assertIn("SQL Injection", categories)
        status, findings = self.request(
            "GET",
            f"/api/findings?event_id={cowrie_event['id']}&include_demo=true",
        )
        self.assertEqual(status, 200)
        sql_finding = next(
            item for item in findings if item["rule_name"] == "SQL Injection"
        )
        self.assertEqual(sql_finding["event_id"], cowrie_event["id"])
        self.assertTrue(sql_finding["evidence_id"].startswith("evidence_"))

        status, overview = self.request("GET", "/api/overview?include_demo=false")
        self.assertEqual(status, 200)
        self.assertIn(
            event["id"],
            {item["id"] for item in overview["recent_events"]},
        )

        status, unauthorized = self.request(
            "POST",
            "/api/adaptive-actions/dry-run",
            {
                "action": "restrict_file_permissions",
                "finding_id": "unauthorized-finding",
                "reason": "unauthorized restart integration check",
            },
        )
        self.assertEqual(status, 403)
        self.assertEqual(unauthorized["error"], "forbidden")

        status, audit = self.request("GET", "/api/adaptive-actions/audit")
        self.assertEqual(status, 200)
        self.assertFalse(
            any(
                "unauthorized restart integration check" in item["reason"]
                for item in audit
            )
        )

        status, preview_action = self.request(
            "POST",
            "/api/adaptive-actions/dry-run",
            {
                "action": "restrict_file_permissions",
                "finding_id": sql_finding["id"],
                "reason": "process restart evidence-backed preview",
            },
            headers={"x-honeyprobe-operator": "process-restart-test-operator"},
        )
        self.assertEqual(status, 201)
        self.assertEqual(preview_action["mode"], "dry_run")
        self.assertFalse(preview_action["applied"])
        self.assertEqual(preview_action["finding_id"], sql_finding["id"])
        self.assertEqual(preview_action["evidence_id"], sql_finding["evidence_id"])
        self.assertEqual(
            preview_action["preview"]["evidence_context"]["evidence_sha256"],
            preview_action["preview"]["recommendation"]["basis"]["evidence_sha256"],
        )

        status, tests = self.request("POST", "/api/self-tests/run", {})
        self.assertEqual(status, 200)
        self.assertEqual(tests["failed"], 0)
        phase3 = next(
            result
            for result in tests["results"]
            if result["name"] == "Phase 3 dry-run engine"
        )
        self.assertIn("none applied", phase3["diagnostic"])

        status, report = self.request("POST", "/api/reports/generate", {})
        self.assertEqual(status, 201)
        self.assertIn(event["id"], {item["id"] for item in report["events"]})
        self.assertFalse(report["summary"]["includes_demo_data"])
        self.assertEqual(len(report["sha256"]), 64)

        self.stop_service()
        self.start_service()

        status, stored_event = self.request("GET", f"/api/events/{event['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(stored_event["summary"], event["summary"])

        status, stored_cowrie = self.request(
            "GET", f"/api/events/{cowrie_event['id']}"
        )
        self.assertEqual(status, 200)
        self.assertIn(
            "SQL Injection",
            {
                finding["category"]
                for finding in stored_cowrie["metadata"]["phase2_analysis"]
            },
        )
        status, stored_findings = self.request(
            "GET",
            f"/api/findings?event_id={cowrie_event['id']}&include_demo=true",
        )
        self.assertEqual(status, 200)
        self.assertIn(sql_finding["id"], {item["id"] for item in stored_findings})
        self.assertEqual(
            sql_finding["evidence_id"],
            next(item for item in stored_findings if item["id"] == sql_finding["id"])[
                "evidence_id"
            ],
        )
        status, stored_audit = self.request("GET", "/api/adaptive-actions/audit")
        self.assertEqual(status, 200)
        persisted_action = next(
            item for item in stored_audit if item["id"] == preview_action["id"]
        )
        self.assertFalse(persisted_action["applied"])
        self.assertEqual(persisted_action["finding_id"], sql_finding["id"])
        self.assertEqual(persisted_action["evidence_id"], sql_finding["evidence_id"])

        status, stored_report = self.request(
            "GET", f"/api/reports/{report['id']}"
        )
        self.assertEqual(status, 200)
        self.assertEqual(stored_report["sha256"], report["sha256"])
        status, verification = self.request(
            "GET", f"/api/reports/verify?sha256={report['sha256']}"
        )
        self.assertEqual(status, 200)
        self.assertTrue(verification["valid"])

        status, stored_overview = self.request(
            "GET", "/api/overview?include_demo=false"
        )
        self.assertEqual(status, 200)
        self.assertIn(
            event["id"],
            {item["id"] for item in stored_overview["recent_events"]},
        )

    def test_local_decoy_finding_and_evidence_survive_a_real_process_restart(self) -> None:
        self.start_service()
        request = urllib.request.Request(
            f"{self.base_url}/decoy/%2e%2e/%2e%2e/local-check",
            method="GET",
        )
        try:
            response = urllib.request.urlopen(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            self.assertEqual(response.status, 404)
            event_id = response.headers["X-HoneyProbe-Event-ID"]

        status, event = self.request("GET", f"/api/events/{event_id}")
        self.assertEqual(status, 200)
        self.assertEqual(event["environment"], "local")
        self.assertEqual(event["ingestion_source"], "local_web_decoy")
        self.assertFalse(event["metadata"]["simulated"])
        self.assertEqual(event["target"], "/unmatched")
        self.assertIn(event["source_address"], {"127.0.0.1", "::1"})
        self.assertEqual(event["metadata"]["network"]["protocol"], "http")
        self.assertEqual(event["metadata"]["network"]["method"], "GET")
        self.assertEqual(event["metadata"]["network"]["path"], "/unmatched")
        self.assertGreater(event["metadata"]["network"]["source_port"], 0)
        self.assertGreater(event["metadata"]["network"]["destination_port"], 0)
        self.assertTrue(event["metadata"]["network"]["user_agent"])
        self.assertTrue(event["timestamp"])
        self.assertTrue(
            any(
                item["category"] == "Path Traversal"
                for item in event["metadata"]["phase2_analysis"]
            )
        )

        status, findings = self.request(
            "GET",
            f"/api/findings?event_id={event_id}&include_demo=true",
        )
        self.assertEqual(status, 200)
        finding = next(
            item for item in findings if item["rule_name"] == "Path Traversal"
        )
        status, evidence = self.request("GET", f"/api/evidence/{event_id}")
        self.assertEqual(status, 200)
        self.assertEqual(finding["event_id"], event_id)
        self.assertEqual(finding["evidence_id"], evidence["id"])
        self.assertNotIn("../../local-check", json.dumps(evidence))

        self.stop_service()
        self.start_service()
        status, stored_event = self.request("GET", f"/api/events/{event_id}")
        self.assertEqual(status, 200)
        self.assertEqual(stored_event["id"], event_id)
        self.assertEqual(stored_event["target"], "/unmatched")
        self.assertFalse(stored_event["metadata"]["simulated"])
        self.assertEqual(
            stored_event["metadata"]["network"],
            event["metadata"]["network"],
        )
        status, stored_findings = self.request(
            "GET",
            f"/api/findings?event_id={event_id}&include_demo=true",
        )
        self.assertEqual(status, 200)
        self.assertIn(finding["id"], {item["id"] for item in stored_findings})
        status, stored_evidence = self.request("GET", f"/api/evidence/{event_id}")
        self.assertEqual(status, 200)
        self.assertEqual(stored_evidence["sha256"], evidence["sha256"])


if __name__ == "__main__":
    unittest.main()
