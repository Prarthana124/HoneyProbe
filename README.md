# HoneyProbe — integrated four-phase workspace

This workspace keeps the four imported phases intact and connects them through the Phase 1 event contract and SQLite store. The Phase 4 Security Operations Console is the primary Replit UI; its default views use protected, persisted HoneyProbe data. Phase 2 detections and Phase 3 preview-only checks are reused through Phase 1 adapters.

## Start the application

Use the single **Project** workflow, or run this from the workspace root:

```bash
bash scripts/start-honeyprobe.sh
```

The workflow serves the Phase 4 console on port 5000. It starts the Express/Clerk API gateway on internal port 8080 and FastAPI on loopback port 8180. The console proxies `/api` to the gateway. Only port 5000 is mapped for the web preview; do not start the standalone Phase 1/Phase 4 artifact workflows alongside it.

The launcher installs locked JavaScript/Python dependencies when missing. Python package installation requires access to the locked package sources.

## Access and data modes

Live API routes require Clerk authentication and an operator email on the verified server-side allowlist. Missing Clerk configuration fails closed; it does not enable an unauthenticated mode. Configure the required keys and allowlist in Replit's secrets/environment settings as described in `replit.md`.

The console defaults to live API data and excludes events marked as test/demo. Simulated decoy interactions are individually labeled. The original Phase 4 static fixtures remain available only through **View demo preview** and are labeled as demo data. API failure never falls back to those fixtures.

## Data and safety

- Phase 1 SQLite remains the canonical event store; its path can be selected with `HONEYPROBE_DB_PATH`.
- Phase 2 rules analyze Cowrie imports in memory; raw Cowrie messages are not persisted.
- Phase 3 adaptive operations are forced to dry-run. No live apply endpoint is exposed.
- New evidence snapshots and SHA-256 chain links are stored with events. Generated JSON reports are persisted and can be verified later.
- The web/database decoys are controlled simulations; no SSH service or external threat feed is started by the integrated app.

## Project map, tests, environment, and limitations

See:

- `docs/PHASE_INTEGRATION.md` for phase entry points, APIs, dependencies, databases, test locations, and integration boundaries.
- `replit.md` for exact startup, environment-variable requirements, test commands/results, and remaining blockers.

Keep the current SQLite database and original source structure. Do not expose the API ports or publish this controlled-lab application without a separate network-isolation and access-control review.
