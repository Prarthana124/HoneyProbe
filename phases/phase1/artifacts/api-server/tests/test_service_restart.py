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
    ) -> tuple[int, dict[str, Any]]:
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = urllib.request.Request(
            f"{self.base_url}{path}",
            data=body,
            method=method,
            headers={"Content-Type": "application/json"} if body is not None else {},
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


if __name__ == "__main__":
    unittest.main()
