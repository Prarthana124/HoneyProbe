# HoneyProbe workspace notes

## Start and port layout

- Start the single Replit **Project** workflow, or run `bash scripts/start-honeyprobe.sh` at the workspace root.
- The launcher starts the Phase 1 Express/Clerk gateway + FastAPI backend and the Phase 4 Security Operations Console.
- Phase 4 Vite listens on port 5000. It proxies same-origin `/api` requests to `HONEYPROBE_GATEWAY_PORT` (default 8080).
- FastAPI binds only to `127.0.0.1` on `HONEYPROBE_INTERNAL_PORT` (default 8180). The launcher checks gateway health before starting the UI.
- The launcher validates that the web, gateway, and internal API ports are distinct. The Vite proxy uses the same gateway port setting.
- Port 5000 is the only web-preview mapping. Do not start the former Phase 1 UI/API or Phase 4 UI workflows at the same time; those duplicate the services and ports.
- The standalone Phase 2 server and Phase 4 API scaffold are not part of this integrated runtime.

The launcher installs the locked Phase 1 and Phase 4 pnpm workspace dependencies when missing. It runs `uv sync --locked --project phases/phase1` if the Phase 1 Python environment is incomplete.
The Replit Python module, Phase 1 Python requirement, and launcher `UV_PYTHON` are aligned on Python 3.13.
This is the single supported startup path; it preserves the workspace and the existing SQLite database.

## Authentication and environment

Live API data and adaptive-action audit routes require a Clerk session and a verified operator email in the server-side allowlist. The Express gateway remains fail-closed when Clerk or the allowlist is unavailable. There is no unauthenticated development bypass.

Required configuration:

| Variable | Required use |
|---|---|
| `CLERK_SECRET_KEY` | Server-only Clerk key; store as a Replit Secret. |
| `CLERK_PUBLISHABLE_KEY` | Server-side Clerk middleware setting; store as a Replit Secret. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Browser-side sign-in key; store as a Replit Secret/environment variable. |
| `HONEYPROBE_ALLOWED_EMAILS` | Comma-separated verified operator addresses, configured in environment settings and never committed to source. |

Optional/runtime variables:

- `HONEYPROBE_DB_PATH` selects the SQLite file. Default: `phases/phase1/artifacts/api-server/data/honeyprobe.sqlite3`. Keep the existing file when restarting.
- `HONEYPROBE_ENV` defaults to `development`; synthetic event generation is disabled outside development/demo/test.
- `HONEYPROBE_GATEWAY_PORT` selects the Express gateway port (default `8080`).
- `HONEYPROBE_INTERNAL_PORT` selects the loopback FastAPI port (default `8180`).
- `HONEYPROBE_CORS_ORIGINS` is only needed for an explicitly configured cross-origin client. The integrated same-origin proxy does not need it.
- `VITE_CLERK_PROXY_URL` is platform-managed for production; do not hardcode a proxy path.
- The launcher manages console `PORT` (`5000`) and `BASE_PATH` (`/`); do not override them for the normal workflow.

Clerk is currently not configured in this imported workspace. The console shows a setup notice until authentication is configured; live data remains locked. The explicit Phase 4 demo preview can still be viewed and remains labeled as static demo data. API failures never fall back to demo data.

## Four-phase interfaces and storage

- **Phase 1:** React operator UI, Express auth gateway, loopback FastAPI API, a loopback-only fictional HTTP web decoy, and the canonical SQLite event/session/self-test store. The decoy serves `/decoy` on the internal FastAPI listener, accepts no credentials, analyzes route text in memory through Phase 2, and is not proxied to the public preview. Event/API models are in `phases/phase1/artifacts/api-server/python/honeyprobe/models.py`.
- **Phase 2:** standard-library server/CLI and a separate SQLite store. Integrated Cowrie imports reuse its `normalize_event` and `detect_event` rules through the Phase 1 adapter; raw messages are analyzed in memory and not persisted.
- **Phase 3:** Python self-test and adaptive-hardening package. The Phase 1 adapter forces dry-run (`apply_changes=False`) and stores only summary results.
- **Phase 4:** React Security Operations Console. Live pages read authenticated Phase 1 endpoints; original static fixtures are available only from the explicit demo-preview switch.

Events, evidence snapshots, source profiles, generated JSON reports, and adaptive-action audit records use the Phase 1 SQLite file. Evidence stores a canonical event snapshot, SHA-256, previous hash, and chain hash. This detects content changes but is not a keyed signature or external immutable archive. Reports can be verified against their saved content. Demo/test events are excluded from Phase 4 live queries.

The adaptive-action API only offers a dry-run preview. It requires the operator identity injected by the authenticated gateway, records the action/reason/result/actor, and persists `applied=false`. No live apply route is implemented.

See `docs/PHASE_INTEGRATION.md` for phase entry points, routes, dependencies, database boundaries, test paths, and known limitations.

## Test, typecheck, build, and security-check commands

```bash
# Phase 1 backend
cd phases/phase1/artifacts/api-server
HONEYPROBE_ENV=test PYTHONPATH=python uv run --project ../.. python -m unittest discover -s tests -v

# Phase 2 tests
cd ../../../phase2
python -m unittest discover -s tests -v

# Phase 3 tests
cd ../phase3
PYTHONPATH=src python -m unittest discover -s tests -v

# Phase 1 TypeScript checks and workspace production build
cd ../phase1
pnpm run typecheck
PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 pnpm run build

# Phase 4 frontend
cd ../phase4
pnpm --filter @workspace/security-console run typecheck
PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 pnpm run build
```

Security scans are run through Replit's Security tools.

### Verification record

- **2026-10-23:** Phase 1 API/integration tests: 15 passed; Phase 2 tests: 4 passed; Phase 3 tests: 16 passed; Phase 4 API-client tests: 4 passed.
- Phase 1 and Phase 4 workspace typechecks and production builds passed. Phase 4 ESLint and JavaScript syntax checks passed. The UI builds emit a non-fatal source-map warning for a tooltip component.
- Fresh security scans: 0 critical, 2 high and 2 moderate dependency findings across the phase workspaces; SAST: 0 findings; HoundDog: 0 findings. The two high instances are `braces@3.0.3` (CVE-2026-93687); npm has no compatible patched release. The two moderate instances are `postcss-selector-parser@6.0.10` (CVE-2026-104844); the available fix is version 7.1.6, a major-version update not applied without compatibility evidence.
- The Replit Python module and Phase 1/launcher configuration now use Python 3.13. The combined HoneyProbe workflow restarted successfully; the gateway health check returned HTTP 200 and the internal API is bound to `127.0.0.1:8180`.
- Forged operator headers do not unlock protected gateway routes: they return HTTP 503 while Clerk is unconfigured. The genuine preview shows the authentication-setup notice and a separate, labeled demo-preview option. No sign-in bypass was added.
- Isolated API integration tests verified loopback decoy ingestion, detection, evidence linkage, duplicate handling, credential redaction, and records surviving a real API process restart. Those tests use temporary databases and do not alter the workspace's persisted SQLite data.
- Authenticated Live verification remains blocked until the owner configures matching Clerk keys and a verified operator allowlist. See the root `README.md` for commands and prior verification context.

## Known limitations

- No Clerk tenant/keys are configured yet; live console authorization requires the workspace owner to configure them and the verified operator allowlist.
- Current event records retain source IP when the source provides it, but do not model source/destination ports, destination IP, protocol, user-agent, or ASN/geolocation enrichment.
- The API self-test runner currently covers nine basic schema, storage, ingestion, route, query, export, detection, and Phase 3 dry-run checks; it is not yet the structured readiness/security/restart report described in the master completion prompt.
- The adaptive-action endpoint records preview-only Phase 3 results but does not yet produce a recommendation linked to a specific finding and its evidence.
- The dependency audit still reports `braces@3.0.3` without a compatible patched release and `postcss-selector-parser@6.0.10`, whose available fix is a major-version update. Do not force that update without compatibility testing.
- The fictional web decoy is local-only and does not collect credentials or operate on host resources; the database decoy is a simulator and no SSH/Cowrie service starts. Mobile telemetry, threat-intelligence enrichment, and case-management integrations are absent.
- Source profiles are aggregated from local events only; there is no external attribution.
- Phase 3 only runs configured sample-target checks and dry-run previews. No automated production changes are performed.
- Reports currently provide saved JSON, CSV, and printable HTML; no PDF generator, keyed signing, or independently immutable archive is connected.
