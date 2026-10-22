# HoneyProbe — integrated four-phase workspace

HoneyProbe keeps the four imported phases intact and connects them through the Phase 1 event contract and SQLite store. The Phase 4 Security Operations Console is the main Replit UI. Its live views read protected, persisted backend data; static demo fixtures are available only through the clearly labeled demo preview.

## Start the integrated app

Use the Replit **Project** workflow or run this from the repository root:

```bash
bash scripts/start-honeyprobe.sh
```

This is the single supported startup procedure. It starts the Phase 1 Express/Clerk gateway and FastAPI service, then the Phase 4 console. The ports are deliberately separate:

| Service | Bind | Port |
|---|---|---:|
| Phase 4 web console | `0.0.0.0` | `5000` |
| Phase 1 API gateway | `0.0.0.0` | `8080` by default |
| FastAPI backend | `127.0.0.1` only | `8180` by default |

Only port 5000 is mapped to the Replit web preview. The launcher and Vite proxy share the gateway port setting, validate that the web, gateway, and internal API ports do not conflict, and wait for API health before serving the console. Optional internal ports can be set before startup:

```bash
HONEYPROBE_GATEWAY_PORT=8080 HONEYPROBE_INTERNAL_PORT=8180 bash scripts/start-honeyprobe.sh
```

Keep the single Project workflow active. Do not start the individual Phase 1 or Phase 4 artifact workflows alongside it; those are separate development entry points and can compete for ports.

## Authentication and environment

Protected live API routes require a Clerk session and a verified email address on the server-side operator allowlist. Missing or incomplete configuration fails closed; there is no unauthenticated development bypass.

Configure these in Replit Secrets/environment settings. Never put their values in source control:

| Variable | Purpose |
|---|---|
| `CLERK_SECRET_KEY` | Server-side Clerk middleware |
| `CLERK_PUBLISHABLE_KEY` | Server-side Clerk middleware |
| `VITE_CLERK_PUBLISHABLE_KEY` | Browser sign-in |
| `HONEYPROBE_ALLOWED_EMAILS` | Comma-separated verified operator email addresses |

Other settings:

| Variable | Purpose and default |
|---|---|
| `HONEYPROBE_DB_PATH` | SQLite file; defaults to `phases/phase1/artifacts/api-server/data/honeyprobe.sqlite3`. Preserve this file across restarts. |
| `HONEYPROBE_ENV` | Defaults to `development`; synthetic event generation is disabled outside development/demo/test. |
| `HONEYPROBE_GATEWAY_PORT` | Internal Express port; defaults to `8080`. |
| `HONEYPROBE_INTERNAL_PORT` | Loopback FastAPI port; defaults to `8180`. |
| `HONEYPROBE_CORS_ORIGINS` | Optional comma-separated origins for a separate cross-origin client. The integrated same-origin proxy does not need it. |
| `VITE_CLERK_PROXY_URL` | Optional Clerk browser proxy setting; leave platform-managed behavior intact. |
| `PORT`, `BASE_PATH` | Set by the launcher for the console; do not override for the Project workflow. |

## Architecture and data boundaries

- **Phase 1** provides the Express auth gateway, FastAPI endpoints, and canonical SQLite event store. It persists events, evidence snapshots and hash links, reports, and dry-run audit records.
- **Phase 2** detection rules are reused by the Cowrie import adapter. Raw imported Cowrie messages are analyzed in memory and are not persisted.
- **Phase 3** checks run through a read-only adapter that forces `apply_changes=False`; no live adaptive action route is exposed.
- **Phase 4** reads live overview, event, and reporting endpoints through the same-origin `/api` proxy. Demo fixtures are separate and only shown through **View clearly labeled demo preview**. API errors do not fall back to demo data.

The web/database decoys are controlled simulations. The integrated app does not start an SSH/Cowrie service or external threat feed. Evidence hashes are tamper-evident checksums, not keyed signatures or an independently administered immutable archive.

For the phase entry points, API routes, storage details, and test locations, see [`docs/PHASE_INTEGRATION.md`](docs/PHASE_INTEGRATION.md).

## Verification record

Checks run on **2026-10-22**:

| Check | Command | Result |
|---|---|---|
| Phase 1 API and integration tests | `cd phases/phase1/artifacts/api-server && HONEYPROBE_ENV=test PYTHONPATH=python uv run --project ../.. python -m unittest discover -s tests -v` | **PASS** — 11 tests, including a real API process restart and SQLite persistence check |
| Phase 2 tests | `cd phases/phase2 && python -m unittest discover -s tests -v` | **PASS** — 4 tests |
| Phase 3 tests | `cd phases/phase3 && PYTHONPATH=src python -m unittest discover -s tests -v` | **PASS** — 16 tests |
| Phase 1 workspace typecheck | `cd phases/phase1 && pnpm run typecheck` | **PASS** |
| Phase 4 console typecheck | `cd phases/phase4 && pnpm --filter @workspace/security-console run typecheck` | **PASS** |
| Phase 1 workspace production build | `cd phases/phase1 && PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 pnpm run build` | **PASS** — build completed; existing source-map warning in a UI tooltip component |
| Phase 4 workspace production build | `cd phases/phase4 && PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 pnpm run build` | **PASS** — build completed; same non-fatal source-map warning |

The integrated workflow also started successfully. Gateway health returned HTTP 200. With Clerk not configured, a protected event request and an adaptive-action request carrying a caller-supplied operator header both returned HTTP 503 `authentication_unavailable`; the internal adaptive-action audit remained empty. The backend integration test separately confirmed an unauthenticated dry-run request returns 403 and creates no audit record.

Security tools were run on the same date:

- Dependency audit: **0 critical, 2 high, 2 moderate** reported instances remain. The high findings are `braces@3.0.3` (the scanner listed no fixed version); the moderate findings are `postcss-selector-parser@6.0.10` (the listed fix is major version 7.1.6). Other fixable findings were addressed in the workspace locks.
- Static analysis (SAST): **0 findings**.
- Dataflow/privacy scan (HoundDog): **0 findings**.

The Replit preview was visually checked. It correctly displays **Authentication setup required** and a clearly labeled demo-preview option. Clerk is not configured in this workspace, so a signed-in live dashboard and real Clerk session authorization have **not** been tested. Configure Clerk and the verified operator allowlist before expecting live data in the browser.

Do not publish this controlled-lab application without a separate network-isolation and access-control review. No deployment or push was performed. No manual `git commit` command was run; at verification time, the local branch was one commit ahead of `origin/main` (`8279f9c`). Confirm the repository state before release.
