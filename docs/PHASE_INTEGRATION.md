# HoneyProbe phase integration

## Four-phase inventory

| Phase | Entry points and APIs | Dependencies and persistence | Existing tests |
|---|---|---|---|
| **1 — operator platform** | React UI: `phases/phase1/artifacts/honeyprobe/src/App.tsx`; Express/Clerk gateway: `phases/phase1/artifacts/api-server/src/index.ts`; FastAPI: `phases/phase1/artifacts/api-server/python/honeyprobe/main.py`. Main API includes health, overview, event ingestion/search/export, sessions, loopback web decoy, controlled web/SSH/database/mobile simulators, Cowrie import, analytics, persisted findings, readiness assessment, self-tests, reports, evidence, source profiles, and dry-run action audit. | pnpm/TypeScript React + Express and Python 3.13 FastAPI/Pydantic/httpx/uvicorn. Python `sqlite3` is the canonical persisted store, default `phases/phase1/artifacts/api-server/data/honeyprobe.sqlite3`; override with `HONEYPROBE_DB_PATH`. The workspace's Drizzle scaffold is not the active event database. | `phases/phase1/artifacts/api-server/tests/test_honeyprobe.py` and `test_service_restart.py` (unittest; includes a real API process restart persistence check). |
| **2 — detection and profiling rules** | Standalone standard-library server/CLI: `phases/phase2/app.py`; server routes `/api/health`, `/api/dashboard`, `/api/events` (POST), and `/api/demo` (POST). Pure functions `normalize_event` and `detect_event` are reused by the Phase 1 Cowrie adapter and controlled decoy simulators. | Python standard library only. The standalone server writes its own SQLite file (`HONEYPROBE_DB`, default `phases/phase2/data/honeyprobe.db`); that server/database is intentionally not started by the integrated app. | `phases/phase2/tests/test_phase2.py` (unittest). |
| **3 — self-tests and adaptive-hardening policy** | Package CLI `honeyprobe-module3 --config <file>` from `phases/phase3/src/honeyprobe_module3/cli.py`; the Phase 1 adapter is `phases/phase1/artifacts/api-server/python/honeyprobe/phase3_adapter.py`. This phase has no HTTP API or database. | Python 3.11+, standard-library runtime; setuptools is its build backend. TOML policy config selects file permission checks. Integrated results are saved by the Phase 1 API in its SQLite store. The adapter forces `apply_changes=False`. | `phases/phase3/tests/test_config.py`, `test_configuration_permissions.py`, and `test_engine.py` (unittest). |
| **4 — Security Operations Console** | Vite/React entry: `phases/phase4/artifacts/security-console/src/main.tsx`; routes in `src/App.tsx`; live views in `src/pages/live-security-pages.tsx`. Same-origin `/api` requests are proxied to the Phase 1 gateway on `HONEYPROBE_GATEWAY_PORT` (default 8080). `src/data/demo-data.ts` remains the source for the explicit demo preview only. | React/TypeScript, Vite, Tailwind, Clerk browser SDK. The Phase 4 Express artifact server is only an unused health-check scaffold; it is not started, has no event database, and is not the console's API. | `phases/phase4/artifacts/security-console/test/` contains API-client tests; TypeScript typecheck and production build are also run. |

## Shared runtime and data flow

```text
Browser / Replit preview (port 5000)
  └─ Phase 4 Vite /api proxy
      └─ Phase 1 Express + Clerk gateway (internal port 8080)
          ├─ public shallow health checks only
          ├─ authenticated, verified-allowlisted operator routes
          └─ FastAPI on 127.0.0.1:8180
              ├─ common Pydantic event contract and Phase 1 SQLite store
               ├─ Phase 2 detection rules through Cowrie import and controlled decoy events
              ├─ persisted findings linked to both source events and evidence records
              ├─ Phase 3 self-test / dry-run adapter
              ├─ derived source profiles and per-event evidence hashes
              ├─ persisted JSON reports and CSV/HTML exports
              └─ adaptive-action preview audit records (no changes applied)
```

The event contract is defined in `phases/phase1/artifacts/api-server/python/honeyprobe/models.py`. Phase 2 detections are normalized into bounded event metadata and separately persisted as finding records with a detector name, rule name, severity, reason, event ID, and evidence ID. Raw imported Cowrie messages and raw local-decoy paths are analyzed in memory and are not stored. Controlled SSH and mobile simulators accept only fixed interaction categories; no credentials, device identifiers, or command text are accepted or stored. Existing event metadata is backfilled into the new findings table on startup without deleting events. Phase 3 checks return summary results only. Phase 4 uses matching TypeScript API types in `phases/phase4/artifacts/security-console/src/lib/honeyprobe-api.ts`.

The fictional web decoy is available only on the loopback-bound FastAPI listener at `http://127.0.0.1:8180/decoy`. It serves static home, about, login, and admin pages; unknown paths return a generic 404. It ignores query strings, rejects all non-empty login bodies, never collects headers or credentials, performs no file/database operations, and limits successful interactions to 60 per minute. Route text is analyzed by Phase 2 in memory; only a fixed known route or `/unmatched` and the matched rule summary are persisted. The Express gateway and public web preview do not proxy `/decoy`; the route is intended for local, controlled testing only.

SQLite schema additions are additive. Event insertion and its evidence snapshot/hash are committed together; startup backfills evidence for pre-existing events without deleting or replacing them. Generated reports and adaptive-action audits are also persisted in the same database.

The Phase 4 default API requests explicitly exclude records whose environment is `test`. Simulated decoy records in other environments are labeled per event. The static Phase 4 fixture screens can only be opened through the explicit **View demo preview** switch; API errors display an error and never substitute demo records.

## Authorization and adaptive-action boundary

The Express gateway applies `requireOperator` to all non-health API routes. That middleware requires a Clerk session and a verified email in `HONEYPROBE_ALLOWED_EMAILS`. For API forwarding it overwrites the internal `x-honeyprobe-operator` header with the authenticated Clerk user ID, so a caller cannot choose the audit actor by supplying their own header.

`POST /api/adaptive-actions/dry-run` rejects requests without the gateway-provided operator identity, invokes the Phase 3 adapter, and stores a `dry_run` audit row with `applied=false`. The Phase 3 adapter always forces changes off and fails if the engine reports an applied change. There is no live-apply route in this integration.

Evidence uses a canonical JSON event snapshot, per-event SHA-256, and a linked SHA-256 chain. These are tamper-evident checksums, not keyed signatures, and they do not replace an independently administered immutable evidence archive.

## API contract

All `/api/*` routes below are served behind the Express gateway. Only `GET /api/health` and `GET /api/healthz` are public; data, event, findings, reports, and action-audit routes require a valid Clerk session and a verified email in `HONEYPROBE_ALLOWED_EMAILS`. Missing Clerk configuration returns HTTP 503 for protected requests. Unauthenticated requests return 401; signed-in accounts outside the allowlist return 403; an unavailable authorization check returns 503. Invalid Pydantic request values return a generic HTTP 422 response without echoing submitted payloads. Requests larger than 256 KB are rejected with 413.

| Method and path | Request | Success response |
|---|---|---|
| `GET /api/healthz` | None | `200 {"status":"healthy"}`; shallow readiness only, or 503 when FastAPI is unavailable. |
| `GET /api/health` | None | Same public shallow readiness response as `/api/healthz`; it does not expose database paths or environment settings. |
| `POST /api/events` | Strict `EventInput`: `source_type` (`web`, `ssh`, `database`, `mobile`), patterned `event_type`, severity, target, summary; optional timestamp, IP, session, metadata, environment and ingestion source. Unknown fields are rejected. | `201 Event` with stable event ID and persisted values. |
| `POST /api/imports/cowrie` | `{"entries":[...]}` (1–250). Each entry requires `eventid` (max 100); optional `src_ip`, `session`, timestamp and message (max 500). Invalid source IPs are rejected. | `201 {"imported":number,"events":[Event...]}`. Raw messages are used transiently for Phase 2 analysis and are not stored. Identical imports are deduplicated. |
| `GET /api/findings` | Optional `event_id`, `severity`, `include_demo` (default `false`) and `limit` (1–500; default 100). | `200 DetectionFinding[]`, each containing `id`, `event_id`, `evidence_id`, `detector`, `rule_name`, `severity`, `reason` and `created_at`. Findings can come from loopback web observations, fixed simulator events, or Cowrie imports. |
| `GET /api/events/{event_id}` | Event ID in path. | `200 Event`, or `404` if absent. |
| `GET /api/evidence/{event_id}` | Event ID in path. | `200 EvidenceRecord` with the canonical event snapshot and hashes, or `404` if absent. |
| `POST /api/decoys/web/interaction` | Strict `WebInteractionInput`; only route visit, login attempt, or protected-route attempt. There is no password field. | `201 Event`, explicitly marked simulated. |
| `POST /api/decoys/ssh/interaction` | Fixed `connection_attempt`, `banner_probe`, `authentication_attempt`, or `command_attempt` category. Unknown fields are rejected. | `201 Event`, explicitly simulated; no SSH listener, password, or command execution. |
| `POST /api/decoys/database/interaction` | Strict operation category and logical decoy target. Arbitrary SQL is not accepted. | `201 Event`, explicitly marked simulated and isolated from the real database. |
| `POST /api/decoys/mobile/interaction` | Fixed app interaction and component enums only; device IDs and credentials are rejected. | `201 Event`, explicitly simulated; no device or emulator is contacted. |
| `GET /api/assessment/deception` | No input. Runs four in-memory synthetic detector fixtures. | `200 DeceptionReadinessAssessment`; score is controlled detector coverage only, not measured attacker deception effectiveness. |
| `POST /api/adaptive-actions/dry-run` | Action, short reason, and an existing non-test `finding_id`. Requires the gateway-supplied operator identity. | `201 AdaptiveActionAudit` with `mode="dry_run"`, `applied=false`, linked `finding_id`/`evidence_id`, and an evidence-hash-backed preview recommendation; no live-apply route exists. |

`Event` responses include timestamp, source type, event type, severity, source address, target, session, summary, sanitized metadata, environment, ingestion source, and processing status. Synthetic demonstrations use the `test` environment and can be excluded from live lists. Health, validation, authorization, and request-size errors use JSON `error` and `detail` fields; validation errors never echo user input.

Other implemented routes are `GET /api/overview`, `GET /api/events` (filters and pagination), `GET /api/events/export`, `GET /api/sessions`, `GET /api/sessions/{session_id}`, `PATCH /api/sessions/{session_id}`, `GET /api/decoys`, `GET /api/analytics`, `GET /api/sources/profiles`, `GET /api/evidence`, `GET /api/self-tests`, `POST /api/self-tests/run`, `GET /api/reports/summary`, `GET /api/reports/export`, `GET /api/reports/html`, `POST /api/reports/generate`, `GET /api/reports/latest`, `GET /api/reports/{report_id}`, `GET /api/reports/verify?sha256=...`, `GET /api/adaptive-actions/audit`, `POST /api/demo/generate`, and `POST /api/demo/reset`. The loopback-only decoy routes `GET /decoy`, `GET /decoy/{route}`, and empty-body `POST /decoy/login` are separate from the authenticated `/api` gateway. They emit an `X-HoneyProbe-Event-ID` response header so local tests can retrieve the stored event, finding, and evidence. Demo generation and reset are disabled outside development/demo/test. For exact field-level contracts, `GET /api/openapi.json` is available through the authenticated gateway.

Harmless local analysis fixture (documentation-only IP and synthetic content):

```json
{
  "entries": [{
    "eventid": "cowrie.login.failed",
    "src_ip": "198.51.100.50",
    "session": "local-fixture-1",
    "message": "failed login for synthetic-user"
  }]
}
```

Submit this body to the protected `POST /api/imports/cowrie` route from an authorized, isolated test environment. It creates an event and Phase 2 finding, but does not attempt a login, connect to a host, or run a command.

## Single startup workflow and ports

- Start the Replit **Project** workflow or run `bash scripts/start-honeyprobe.sh` from the repository root.
- The launcher runs only the Phase 1 API gateway/FastAPI service and the Phase 4 Security Operations Console.
- The console listens on 5000; the gateway listens on `HONEYPROBE_GATEWAY_PORT` (default 8080); FastAPI binds only to `127.0.0.1` on `HONEYPROBE_INTERNAL_PORT` (default 8180).
- The launcher validates that the three ports are distinct and passes the selected gateway port to the Vite proxy.
- Port 5000 is the only Replit web-preview mapping. The API ports are internal and should not be exposed as separate public services.
- Do not start the old standalone Phase 1 UI, Phase 1 API, or Phase 4 UI workflows alongside this launcher. Phase 2 standalone server and Phase 4 API scaffold are not part of this runtime.

## Environment configuration

| Variable | Use |
|---|---|
| `CLERK_SECRET_KEY` | Server-side Clerk middleware. Keep in Replit Secrets. |
| `CLERK_PUBLISHABLE_KEY` | Server gateway Clerk key. Keep in Replit Secrets. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Phase 4 browser sign-in. Keep in Replit Secrets/environment. |
| `HONEYPROBE_ALLOWED_EMAILS` | Comma-separated verified operator email allowlist; configure in environment settings, not source. |
| `HONEYPROBE_DB_PATH` | Optional SQLite file path; default is the Phase 1 API data directory. Preserve the existing file when restarting. |
| `HONEYPROBE_ENV` | `development` by default in the launcher; synthetic generation is restricted to development/demo/test. |
| `HONEYPROBE_GATEWAY_PORT` | Optional internal Express port; default `8080`. |
| `HONEYPROBE_INTERNAL_PORT` | Optional loopback FastAPI port; default `8180`. |
| `HONEYPROBE_CORS_ORIGINS` | Optional explicit browser origins for direct external clients. Same-origin Vite proxy needs no extra origin. |
| `VITE_CLERK_PROXY_URL` | Clerk browser proxy setting. Leave platform-managed behavior intact; do not hardcode this in the UI. |
| `HONEYPROBE_TRUSTED_PROXY_IPS` | Optional comma-separated exact peer IPs allowed to supply forwarded host/protocol/client-IP headers. Unlisted peers' forwarded headers are ignored. |
| `PORT`, `BASE_PATH` | Set by the single launcher for the UI; normally do not override them manually. |

The Replit-managed Clerk tenant and keys have been provisioned. Live operator access still requires the user's verified email in `HONEYPROBE_ALLOWED_EMAILS`; never add a development bypass.

## Commands and verification record

Run from the repository root unless noted:

```bash
# Phase 1 API tests
cd phases/phase1/artifacts/api-server
HONEYPROBE_ENV=test PYTHONPATH=python uv run --project ../.. python -m unittest discover -s tests -v

# Phase 2 rules
cd ../../../phase2
python -m unittest discover -s tests -v

# Phase 3 package
cd ../phase3
PYTHONPATH=src python -m unittest discover -s tests -v

# Phase 1 TypeScript checks/build
cd ../phase1
pnpm run typecheck
PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 pnpm run build

# Phase 4 TypeScript checks/build
cd ../phase4
pnpm --filter @workspace/security-console run typecheck
PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 pnpm run build
```

The actual test counts, build outcomes, and security scan summary for 2026-10-22 are recorded in the root `README.md`. Do not treat API unit tests as proof that a signed-in browser flow works when Clerk is unavailable.

## Known limits

- The Replit-managed Clerk tenant/keys are provisioned, but signed-in UI authorization still needs a verified operator email in `HONEYPROBE_ALLOWED_EMAILS` and a browser sign-in check.
- The dependency audit still reports `braces@3.0.3` without a listed fixed version and `postcss-selector-parser@6.0.10`, for which the listed fix is a major version. See the README verification record.
- The web decoy is a loopback-only fictional HTTP site, not a public honeypot listener. SSH, database, and mobile interactions are fixed-category local simulators, not live listeners or device telemetry. Cowrie is a bounded log import. External threat-intelligence feeds and attribution are not connected.
- Source profiles are local aggregates of persisted addresses/events; there is no external attribution or reputation enrichment.
- Phase 3 is limited to configured sample-target checks and dry-run previews. No production configuration changes or automated response are performed.
- Reports include JSON/CSV/printable HTML capabilities; no PDF export, keyed signature, external case-management integration, or independently immutable evidence store is provided.
