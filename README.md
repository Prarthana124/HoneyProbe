# HoneyProbe — integrated four-phase workspace

HoneyProbe keeps the four imported phases intact and connects them through the Phase 1 event contract and SQLite store. The Phase 4 Security Operations Console is the main Replit UI. Its live views read protected, persisted backend data; static demo fixtures are available only through the clearly labeled demo preview.

## Start the integrated app

Use the Replit **Project** workflow or run this from the repository root:

```bash
bash scripts/start-honeyprobe.sh
```

This is the single supported startup procedure. It starts the Phase 1 Express/Clerk gateway and FastAPI service, then the Phase 4 console. The ports are deliberately separate:

### Docker Compose

For a local containerized development startup, copy `.env.docker.example` to `.env`, fill in the matching Clerk development keys and verified operator allowlist if Live Mode is needed, then run:

```bash
docker compose up --build
```

Compose runs the existing combined HoneyProbe launcher in one container, publishes only the web console, checks both the console and API gateway health, and stores SQLite data in the persistent `honeyprobe-data` volume. Without Clerk configuration, protected Live API routes remain locked; there is no authentication bypass. `docker compose down` stops the app but preserves the database volume. The Compose setup has not yet been runtime-tested in this workspace because the Docker daemon is unavailable.

| Service | Bind | Port |
|---|---|---:|
| Phase 4 web console | `0.0.0.0` | `5000` |
| Phase 1 API gateway | `0.0.0.0` | `8080` by default |
| FastAPI backend | `127.0.0.1` only | `8180` by default |

Port 5000 serves the Replit web preview. The existing root `.replit` also forwards gateway port 8080 to external port 80 on the authenticated Replit development domain; this verification added no port mappings and did not publish or deploy the service. The launcher and Vite proxy share the gateway port setting, validate that the web, gateway, and internal API ports do not conflict, and wait for API health before serving the console. Optional internal ports can be set before startup:

```bash
HONEYPROBE_GATEWAY_PORT=8080 HONEYPROBE_INTERNAL_PORT=8180 bash scripts/start-honeyprobe.sh
```

Use the single Project workflow for the integrated runtime. The separate Phase 4 Security Operations Console artifact can also run on its managed port `22713` after the Phase 4 workspace dependencies are installed; its `/api` proxy uses the existing gateway on port `8080`. Avoid starting standalone Phase 1 API/UI workflows alongside the Project workflow because they can compete for ports `5000`, `8080`, or `8180`.

## Authentication and environment

Protected live API routes require a Clerk session and a verified email address on the server-side operator allowlist. Missing or incomplete configuration fails closed; there is no unauthenticated development bypass.

For development, configure matching test/development credentials from the same Clerk instance: `CLERK_SECRET_KEY` for the server, `CLERK_PUBLISHABLE_KEY` for the server, and the same publishable key as `VITE_CLERK_PUBLISHABLE_KEY` for the browser. Add `HONEYPROBE_ALLOWED_EMAILS` as a comma-separated list of verified operator email addresses. Keep the secret key in Replit Secrets; set the publishable key and allowlist in the workspace's development environment settings. `VITE_CLERK_PROXY_URL` is optional. These values must come from the project owner's configured Clerk instance; do not paste credentials into chat or source files. Clerk is not configured in the current workspace, so Live Mode remains locked until the owner configures it.

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
| `HONEYPROBE_TRUSTED_PROXY_IPS` | Optional comma-separated exact proxy-peer IP allowlist. Forwarded client, host, and protocol values are ignored unless the immediate socket peer is listed. |
| `VITE_CLERK_PROXY_URL` | Optional Clerk browser proxy setting; leave platform-managed behavior intact. |
| `PORT`, `BASE_PATH` | Set by the launcher for the console; do not override for the Project workflow. |

## Architecture and data boundaries

- **Phase 1** provides the Express auth gateway, FastAPI endpoints, and canonical SQLite event store. It persists observed events, built-in and operator-defined findings, linked evidence, rule versions, self-test results, reports, adaptation history, and operator audit records.
- **Phase 2** provides bounded built-in detection functions reused by event ingestion and the Cowrie import adapter. Operator-defined rules use a separate, declarative allowlist; they cannot run arbitrary code or regular expressions.
- **Phase 3** checks run through a read-only adapter that forces `apply_changes=False`; filesystem and host-hardening actions remain preview-only. A separate, approval-gated path can change only the local web decoy's allowlisted response profile.
- **Phase 4** reads live overview, event, finding, evidence, rule, self-test, adaptation, audit, health, and reporting endpoints through the same-origin `/api` proxy. The dashboard summarizes persisted activity, findings, decoy registry state, self-tests, and adaptation outcomes. Demo fixtures are separate and only shown through **View clearly labeled demo preview**. API errors do not fall back to demo data.

The fictional web decoy is a real local HTTP interaction source served only by FastAPI's loopback listener at `127.0.0.1:8180/decoy`; it records bounded visits and feeds route text to detection in memory. It does not accept credentials, execute paths, or touch files, and it is not exposed through the public web preview. Operators can propose, approve, verify, reject, and roll back only the `baseline` and `contextual` response profiles; changes are persisted and audited. Database, SSH, and mobile are bounded interaction simulators, not listening services. Cowrie is an import adapter, not a running Cowrie daemon; there is no external threat feed. Evidence hashes are tamper-evident checksums, not keyed signatures or an independently administered immutable archive.

## Detection, tests, and adaptation

Events are stored with sanitized metadata and evidence in SQLite. Built-in detection and enabled custom rules run during ingestion; findings link to both the original event and its evidence. The console's findings metrics are counted from persisted finding records rather than inferred from event severity.

Custom rules support bounded comparisons against known event fields and `metadata.*` values. Operators can create, edit, test against a non-persisted safe sample, enable only after a matching test, inspect version history, restore an earlier definition as a new disabled version, archive rules, and import/export JSON. Each write requires the authenticated gateway's operator identity and creates an audit entry.

The decoy adaptation workflow is intentionally narrow: it changes a stored response profile on the loopback-only fictional web decoy. A proposal must reference a non-test finding and its evidence; an operator must approve it; the allowlisted setting is read back and verified; and rollback restores the prior profile only if no newer change superseded it. Host files, firewall rules, SSH, database services, and mobile devices are not modified. Phase 3 hardening requests remain dry-run only.

The self-test endpoint runs safe local checks against schema, SQLite, ingestion, detection, reporting, the decoy profile, and Phase 3 dry-run behavior. Its results and the report's findings, tests, and adaptation history are persisted. Reports are SHA-256 verified against their canonical stored JSON content; verification does not provide an external immutable archive.

For the phase entry points, API routes, storage details, and test locations, see [`docs/PHASE_INTEGRATION.md`](docs/PHASE_INTEGRATION.md).

## Verification record

The previous full verification record is in the [HoneyProbe acceptance report](docs/HONEYPROBE_ACCEPTANCE_2026-10-23.md). The current UI update and its verification status are recorded separately once the current checks complete.

Current workspace decision: **LIVE UI BLOCKED ON CLERK SETUP**. The API and console workflows are running, but the current workspace has no Clerk configuration, so authenticated Live Mode cannot be opened. Protected APIs remain locked; there is no authentication bypass. Use the clearly labeled demo preview only for visual review, not as live telemetry.

Run the full acceptance suite with:

```bash
python scripts/self-test-honeyprobe.py
```

The Project workflow is the supported integrated runtime. The Security Operations Console artifact also runs independently on managed port `22713` once its workspace dependencies are installed. Avoid starting standalone Phase 1 API/UI workflows beside the Project workflow because they can compete for ports.

Do not publish this controlled-lab application without a separate network-isolation and access-control review. No deployment, push, or manual commit was performed. The workspace started on branch `main` aligned with `origin/main`; the current HoneyProbe changes are uncommitted. Confirm the repository state before release.
