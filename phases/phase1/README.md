# HoneyProbe

HoneyProbe is a controlled-lab cyber-deception and telemetry platform. It records web-decoy interactions into SQLite, groups related events into sessions, and provides an operator interface for monitoring, investigation, analytics, tests, and reports.

## Run in Replit

Start both managed workflows:

- **API Server** — FastAPI backend and SQLite event store.
- **HoneyProbe** — React operator interface.

The operator interface is served at `/`; the API is routed under `/api`. FastAPI's generated API documentation is available at `/api/docs`.

## Run locally

Use Python 3.13, `uv`, Node.js 24, and pnpm.

```sh
uv sync
pnpm install
```

Run the API and web interface in separate terminals:

```sh
pnpm --filter @workspace/api-server run dev
```

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/honeyprobe run dev
```

For a browser running outside Replit's same-origin proxy, set `HONEYPROBE_CORS_ORIGINS=http://localhost:5173` for the API and `VITE_API_BASE_URL=http://localhost:8080` for the web app.

The SQLite file is created at `artifacts/api-server/data/honeyprobe.sqlite3` by default. Set `HONEYPROBE_DB_PATH` to use a different file. Restarting the API does not reset stored events.

## Demonstration workflow

1. Open the HoneyProbe overview and check API/SQLite health.
2. Open **Decoy Environments → Web Decoy**, or visit `/decoy`.
3. Navigate to the home/about/login/admin routes. The decoy sends route interactions to the API.
4. Use a synthetic username in the login form. The UI does not submit a password; the API rejects extra password fields and never stores credentials.
5. Return to **Live Telemetry** to inspect the persisted event and session.
6. Filter and export events as CSV, review analytics, or generate a printable HTML report.
7. Run self-tests. Use **Generate Test Event** only in a development/demo/test environment.

## API and tests

```sh
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

The API contract is maintained in `lib/api-spec/openapi.yaml`. The SQLite event model includes indexes for timestamps, severity, decoy type, session ID, target, and external-ingestion deduplication.

## Integration status and safety

- The web decoy is a fictional, built-in demonstration site. Its interactions are real persisted records, but the module is not an independently exposed honeypot.
- The database decoy records operation categories in a logical namespace and cannot execute SQL or connect to the application's event database.
- Cowrie is not running by default. A bounded JSON log importer validates and normalizes sample entries; raw Cowrie messages are not stored.
- Android/mobile telemetry is a not-configured adapter placeholder.
- Synthetic events are disabled outside development, demo, and test environments. Reset removes only `environment=test` rows.
- The operator dashboard and non-health API routes require a Clerk session plus a verified email on the server-side allowlist. Keep this application in a local or isolated research environment; review network isolation and deployment controls before exposing it publicly.
- Configure approved addresses through the shared `HONEYPROBE_ALLOWED_EMAILS` environment variable as a comma-separated list. If the setting is missing, data routes fail closed.
