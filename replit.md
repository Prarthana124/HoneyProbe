# HoneyProbe workspace notes

## Start and port layout

- Start the single Replit **Project** workflow, or run `bash scripts/start-honeyprobe.sh` at the workspace root.
- The launcher starts the Phase 1 Express/Clerk gateway + FastAPI backend and the Phase 4 Security Operations Console.
- Phase 4 Vite listens on port 5000. It proxies same-origin `/api` requests to `HONEYPROBE_GATEWAY_PORT` (default 8080).
- FastAPI binds only to `127.0.0.1` on `HONEYPROBE_INTERNAL_PORT` (default 8180). The launcher checks gateway health before starting the UI.
- The launcher validates that the web, gateway, and internal API ports are distinct. The Vite proxy uses the same gateway port setting.
- Port 5000 serves the integrated Project preview. The separate Phase 4 Security Operations Console artifact uses managed port 22713 (mapped to external port 3000) and proxies `/api` to the existing gateway; it can run beside the Project workflow once Phase 4 dependencies are installed. Avoid starting standalone Phase 1 API/UI workflows beside the Project workflow because they use shared ports.
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

The Replit-managed Clerk development tenant, keys, and operator allowlist are configured in this workspace. Sign in with the allowlisted verified operator account to access live data. The explicit Phase 4 demo preview remains clearly labeled static sample data; API failures never fall back to demo data.

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

- The latest exact commands, test counts, runtime identities, scan results, and blockers are recorded in [`docs/HONEYPROBE_ACCEPTANCE_2026-10-23.md`](docs/HONEYPROBE_ACCEPTANCE_2026-10-23.md).
- `python scripts/self-test-honeyprobe.py`: **14 PASS, 0 FAIL, 2 BLOCKED, 0 SKIPPED**. The two required environment checks remain blocked; the runner exits nonzero rather than presenting an incomplete run as a pass.
- The Replit module, Phase 1 backend, locked `uv` environment, and root test process use Python **3.13.11**. The combined Project workflow restarted successfully, the Phase 1 API interpreter was checked in the running Uvicorn process, and gateway health returned HTTP 200.
- Phase 1 backend/integration: 23 tests; trusted-proxy: 7; Phase 2: 4; Phase 3: 16; Phase 4 API client: 4; runner status contract: 14. Both workspace typechecks, lint, and production builds passed.
- Fresh scans: **0 critical, 2 high, 0 moderate, 0 low** dependency findings; SAST: **0**; HoundDog: **0**. The unresolved high advisory is `braces@3.0.3`; details and affected dependency paths are in `docs/security-scan-results.md`.
- The preview shows the protected operator sign-in page and labeled demo option. Clerk development keys load; protected routes reject anonymous requests with HTTP 401. The headless screenshot browser is not signed in.
- Docker Compose configuration validation passed, but runtime/volume-restart verification is blocked because the Docker daemon is unreachable. Authenticated API requests returned HTTP 200 after the allowlist was configured; the signed-in UI was not visually verified by the headless browser.

## Known limitations

- The development allowlist is configured. A manually signed-in, verified operator session is needed for full visual verification of the live console.
- Current event records retain source IP when the source provides it, but do not model source/destination ports, destination IP, protocol, user-agent, or ASN/geolocation enrichment.
- The `/api/self-tests` endpoint is an in-process checklist; the root `scripts/self-test-honeyprobe.py` is the separate end-to-end acceptance runner for readiness, access control, backend and frontend suites, builds, restart persistence, and environment blockers.
- Adaptive-action previews are tied to a non-test finding and its exact linked evidence, include the evidence digest in the recommendation, and persist in the audit log. They remain preview-only; no live apply route exists.
- The dependency audit still reports the high `braces@3.0.3` advisory with no fixed release listed. The latest scan reports no moderate `postcss-selector-parser` findings; see `docs/security-scan-results.md`.
- The fictional web decoy is local-only and does not collect credentials or operate on host resources; the database, SSH, and mobile channels are interaction simulators, not public listeners. Raw command capture, external threat-intelligence enrichment, and case-management integrations are absent.
- Source profiles are aggregated from local events only; there is no external attribution.
- Phase 3 only runs configured sample-target checks and dry-run previews. No automated production changes are performed.
- Reports currently provide saved JSON, CSV, and printable HTML; no PDF generator, keyed signing, or independently immutable archive is connected.
