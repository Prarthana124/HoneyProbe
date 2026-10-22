# HoneyProbe imported workspace

## Run

- Start the **Project** workflow, or run `bash scripts/start-honeyprobe.sh` from the workspace root.
- The launcher starts the Phase 1 React interface on port 5000 and the API gateway on port 8080. The gateway starts FastAPI internally on loopback port 8180; Vite proxies `/api` through the gateway.
- The launcher installs Phase 1 dependencies from the checked-in pnpm and uv lockfiles on first run.
- Manual dependency setup: `cd phases/phase1 && pnpm install --frozen-lockfile`, then `uv sync --locked --project phases/phase1`.

## Authentication and data safety

- The dashboard and all non-health API routes remain behind Clerk and a verified operator allowlist. Configure Clerk and the approved operator list before expecting dashboard data. Missing configuration must fail closed; do not add an unauthenticated bypass.
- The built-in web and database decoys are controlled simulations, not independently exposed services. SSH/Cowrie is an import adapter only; Android and external threat-intelligence feeds are not configured.
- Phase 2 detection analyzes Cowrie messages in memory. Persist only rule categories and explanations, never the raw imported message.
- Phase 3 checks run with changes forced off. Do not turn on hardening actions through the API.
- Synthetic events are labeled as test data and may be generated only in development, demo, or test environments.
- SQLite is the persistent event store. Do not switch databases or merge phase database files.

## Project map

See `docs/PHASE_INTEGRATION.md` for phase ownership, data flow, available functionality, test coverage, and deferred capabilities.
