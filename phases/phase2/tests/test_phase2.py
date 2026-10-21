import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import app

class Phase2Tests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        app.DB_PATH = Path(self.tmp.name) / "test.db"
        app.get_db().close()

    def tearDown(self):
        self.tmp.cleanup()

    def test_bruteforce_detection(self):
        result = app.process_events([{
            "source_ip":"1.2.3.4", "service":"SSH", "event_type":"LOGIN_FAILED",
            "username":"root", "status":"failed"
        }])
        self.assertEqual(result["inserted"], 1)
        self.assertTrue(any("Brute Force" == d["category"] for d in result["details"][0]["detections"]))

    def test_sql_injection_detection(self):
        result = app.process_events([{
            "source_ip":"1.2.3.5", "service":"WEB", "event_type":"REQUEST",
            "request":"id=1 UNION SELECT username,password FROM users"
        }])
        self.assertTrue(any(d["category"] == "SQL Injection" for d in result["details"][0]["detections"]))

    def test_fingerprint_detection(self):
        result = app.process_events([{
            "source_ip":"1.2.3.6", "service":"SSH", "event_type":"PROBE",
            "command":"version probe; banner grab"
        }])
        self.assertTrue(any(d["category"].startswith("Fingerprinting:") for d in result["details"][0]["detections"]))

    def test_dashboard_has_profile(self):
        app.process_events([{
            "source_ip":"1.2.3.7", "service":"SSH", "event_type":"COMMAND", "command":"whoami"
        }])
        d = app.dashboard_data()
        self.assertEqual(d["unique_ips"], 1)
        self.assertEqual(d["profiles"][0]["ip"], "1.2.3.7")

if __name__ == "__main__":
    unittest.main()
