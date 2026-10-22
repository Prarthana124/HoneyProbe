# HoneyProbe workspace notes

## Start and port layout

- Start the single Replit **Project** workflow, or run `bash scripts/start-honeyprobe.sh` at the workspace root.
- The launcher starts the Phase 1 Express/Clerk gateway + FastAPI backend and the Phase 4 Security Operations Console.
- Phase 4 Vite listens on port 5000. It proxies same-origin `/api` requests to the gateway on internal port 8080.
- FastAPI binds only to `127.0.0.1:8180`. The launcher checks the gateway health before starting the UI.
- Port 5000 is the only web-preview mapping. Do not start the former Phase 1 UI/API or Phase 4 UI workflows at the same time; those duplicate the services and ports.
- The standalone Phase 2 server and Phase 4 API scaffold are not part of this integrated runtime.

The launcher installs the locked Phase 1 and Phase 4 pnpm workspace dependencies when missing. It runs `uv sync --locked --project phases/phase1` if the Phase 1 Python environment is incomplete.

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
- `HONEYPROBE_CORS_ORIGINS` is only needed for an explicitly configured cross-origin client. The integrated same-origin proxy does not need it.
- `VITE_CLERK_PROXY_URL` is platform-managed for production; do not hardcode a proxy path.
- The launcher manages `PORT`, `HONEYPROBE_INTERNAL_PORT`, and `BASE_PATH`; do not override them for the normal workflow.

Clerk is currently not configured in this imported workspace. The console shows a setup notice until authentication is configured; live data remains locked. The explicit Phase 4 demo preview can still be viewed and remains labeled as static demo data. API failures never fall back to demo data.

## Four-phase interfaces and storage

- **Phase 1:** React operator UI, Express auth gateway, FastAPI API, and the canonical SQLite event/session/self-test store. Event/API models are in `phases/phase1/artifacts/api-server/python/honeyprobe/models.py`.
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
python -m unittest discover -s tests -v

# Phase 1 TypeScript checks and workspace production build
cd ../phase1
pnpm run typecheck
pnpm run build

# Phase 4 frontend
cd ../phase4
pnpm --filter @workspace/security-console run typecheck
pnpm --filter @workspace/security-console run build
```

Security scans: dependency audit, static analysis, and dataflow/privacy scan are run through Replit's Security tools. Results are recorded below only after the scanners actually complete.

### Verification record

Update this section after each verification run. Do not infer browser authorization success from API unit tests. The signed-in UI cannot be visually verified until Clerk is configured.

- Backend tests: pending.
- Phase 1 / Phase 4 frontend typechecks: pending.
- Production builds: pending.
- Security scans: pending.
- Replit preview: pending; startup may be blocked by unavailable Python package downloads or missing Clerk configuration.

## Known limitations

- No Clerk tenant/keys are configured yet; live console authorization requires the workspace owner to configure them and the verified operator allowlist.
- The current locked Python package installation attempt failed with a package-host TLS certificate trust error. Do not disable TLS verification. Until package sources are reachable, the backend service and Phase 1 backend tests cannot run.
- Web/database decoys are controlled simulations; no SSH/Cowrie service starts. Mobile telemetry, threat-intelligence enrichment, and case-management integrations are absent.
- Source profiles are aggregated from local events only; there is no external attribution.
- Phase 3 only runs configured sample-target checks and dry-run previews. No automated production changes are performed.
- Reports currently provide saved JSON, CSV, and printable HTML; no PDF generator, keyed signing, or independently immutable archive is connected.
