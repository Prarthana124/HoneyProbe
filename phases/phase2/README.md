# HoneyProbe — Phase 2: Monitoring & Analysis

This is a runnable standalone implementation of **only Phase 2** from the HoneyProbe project presentation:

1. **Central Monitoring & Attack Detection**
2. **Behaviour Monitoring + Honeypot Fingerprinting**

It follows the project architecture and terminology in the supplied PPT/paper. It does **not** implement Phase 3 self-testing/adaptation.

## Requirements

- Python 3.10+
- No external Python packages are required.

## Run

```bash
python app.py
```

Open: http://127.0.0.1:8080

Click **Generate demo activity** to populate the dashboard.

## What is implemented

### Central monitoring
- Normalizes incoming events from SSH/Web/DB-style sources.
- Stores timestamp, source IP, ports, protocol, service, event type, session, command/request/payload, status and response timing.
- SQLite persistence in `data/honeyprobe.db`.

### Attack detection
Rule-based Phase 2 detection for:
- failed authentication / brute-force indicators
- SQL injection-like payloads
- command injection-like input
- path traversal
- reconnaissance/scanning indicators

### Behaviour monitoring
- Per-source-IP attacker profiles
- targeted services
- observed commands
- event/session history

### Honeypot fingerprinting
Detects observable indicators such as:
- SSH/version probing
- timing probes
- header/banner probes
- service/honeypot fingerprint probes

## API

### POST `/api/events`
Send one event:

```json
{
  "source_ip": "10.0.0.10",
  "service": "SSH",
  "event_type": "COMMAND",
  "command": "whoami",
  "session_id": "S100"
}
```

Or a batch:

```json
{"events": [{"source_ip":"10.0.0.10","service":"SSH","event_type":"LOGIN_FAILED","username":"root"}]}
```

### GET `/api/dashboard`
Returns dashboard metrics, detection categories, recent activity and attacker profiles.

### GET `/api/health`
Returns service health.

### POST `/api/demo`
Inserts safe simulated events for demonstration.

## Cowrie integration

The parser accepts Cowrie-style JSON-lines logs:

```bash
python app.py --import-cowrie path/to/cowrie.json
```

The parser maps common fields such as `src_ip`, `eventid`, `input`, `username`, `session`, `timestamp`, etc. into the central Phase 2 event model.

## Project mapping

```text
Gateway / log source
       ↓
Central event normalization
       ↓
SQLite telemetry store
       ↓
Attack detection
       ↓
Behaviour analysis + attacker profile
       ↓
Fingerprint detection
       ↓
Dashboard / API
```

The next project phase can consume the stored telemetry, but this package intentionally stops at Phase 2.

## Demo flow for presentation

1. Start `python app.py`.
2. Open the dashboard.
3. Click **Generate demo activity**.
4. Show suspicious interactions and detection categories.
5. Show the attacker profile for `10.10.10.20`.
6. Explain how commands and targeted services are correlated.
7. Show fingerprinting detection for the SSH probe.

All demo traffic is synthetic; it does not attack any real system.
