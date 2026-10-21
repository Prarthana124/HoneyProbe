---
name: HoneyProbe SQLite storage
description: HoneyProbe's event store and decoy scope constraints.
---

HoneyProbe must keep its persistent application data in SQLite; do not replace it with the workspace's PostgreSQL database. Decoys must remain clearly labelled as controlled demos/adapters unless real health checks confirm a real isolated service.

**Why:** The project owner explicitly requires a persistent SQLite foundation and prohibits presenting simulated integrations as live honeypots.

**How to apply:** Keep event ingestion, dashboards, sessions, analytics, reports, and self-tests on the SQLite store. Label Cowrie/mobile as unconfigured and web/database simulation as demo mode unless an actual isolated service is connected.
