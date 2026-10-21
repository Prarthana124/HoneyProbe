# HoneyProbe

HoneyProbe is a controlled-lab cyber-deception platform for recording decoy interactions, investigating sessions, and reviewing SQLite-backed telemetry.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the Python FastAPI API and controlled decoy event services
- `pnpm --filter @workspace/honeyprobe run dev` — run the React operator interface
- `pnpm --filter @workspace/api-server run test` — run backend and API integration tests
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Python dependencies are declared in the root `pyproject.toml` and `uv.lock`.
- `HONEYPROBE_DB_PATH` optionally selects the SQLite file. The default is `artifacts/api-server/data/honeyprobe.sqlite3`.
- `HONEYPROBE_ENV` defaults to `development`; synthetic event generation and reset are blocked in other environments.
- `HONEYPROBE_CORS_ORIGINS` optionally lists explicit comma-separated browser origins. CORS is closed by default.
- FastAPI OpenAPI docs: `/api/docs`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Operator interface: React, TypeScript, Vite, Wouter, React Query
- API: Python 3.13, FastAPI, Pydantic
- Event store: SQLite with indexed, transactional event ingestion; no PostgreSQL connection is used by HoneyProbe
- API contract and generated frontend hooks: OpenAPI 3.1 and Orval

## Where things live

- `artifacts/honeyprobe/` — operator dashboard and separate fictional `/decoy` site
- `artifacts/api-server/python/honeyprobe/` — API, event ingestion, analytics, reporting, SQLite access, and safe decoy adapters
- `artifacts/api-server/tests/` — backend and API tests
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `artifacts/api-server/data/` — local SQLite file (ignored by Git and deployment packaging)

## Architecture decisions

- The API workflow runs an Express authentication gateway in front of the existing FastAPI service. FastAPI binds to loopback on a separate internal port; do not expose that port.
- Store approved operator addresses only in the shared `HONEYPROBE_ALLOWED_EMAILS` environment variable; do not commit addresses to source.
- SQLite is the only HoneyProbe event store. Do not switch it to the template's PostgreSQL database.
- Web and database decoys are controlled demonstration modules, not independently exposed honeypots.
- SSH/Cowrie and Android are reported as not configured unless an actual service or adapter is connected.
- The operator UI and all non-health API routes require Clerk authentication and a verified email from the runtime allowlist. Keep the app in an isolated research environment; authentication does not replace network isolation.

## Product

HoneyProbe records normalized web, SSH, database-simulator, and mobile-adapter events; groups events into explainable sessions; derives dashboards and reports from stored rows; supports CSV and printable HTML exports; and runs component self-tests.

## User preferences

- Keep the HoneyProbe UI aligned with the attached premium cybersecurity visual identity.
- Use SQLite for persistent application data; do not switch to PostgreSQL.
- Clearly label unavailable integrations and never represent synthetic functionality as a connected honeypot.

## Gotchas

- Re-run OpenAPI code generation after editing `lib/api-spec/openapi.yaml`.
- Synthetic records use `environment=test`; the reset endpoint deletes only those rows and preserves local/configured-lab observations.
- Do not publish or expose the decoy routes to the public internet without adding appropriate authentication and network isolation.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
