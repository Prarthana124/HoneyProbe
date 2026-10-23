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

Port 5000 serves the Replit web preview. The existing root `.replit` also forwards gateway port 8080 to external port 80 on the authenticated Replit development domain; this verification added no port mappings and did not publish or deploy the service. The launcher and Vite proxy share the gateway port setting, validate that the web, gateway, and internal API ports do not conflict, and wait for API health before serving the console. Optional internal ports can be set before startup:

```bash
HONEYPROBE_GATEWAY_PORT=8080 HONEYPROBE_INTERNAL_PORT=8180 bash scripts/start-honeyprobe.sh
```

Keep the single Project workflow active. Do not start the individual Phase 1 or Phase 4 artifact workflows alongside it; those are separate development entry points and can compete for ports.

## Authentication and environment

Protected live API routes require a Clerk session and a verified email address on the server-side operator allowlist. Missing or incomplete configuration fails closed; there is no unauthenticated development bypass.

For development, supply matching test/development credentials from the same Clerk instance: `CLERK_SECRET_KEY` for the server, `CLERK_PUBLISHABLE_KEY` for the server, and the same publishable key as `VITE_CLERK_PUBLISHABLE_KEY` for the browser. Add `HONEYPROBE_ALLOWED_EMAILS` as a comma-separated list of verified operator email addresses. Keep the secret key in Replit Secrets; set the publishable key and allowlist in the workspace's development environment settings. `VITE_CLERK_PROXY_URL` is optional. These values must come from the project owner's configured Clerk instance; do not paste credentials into chat or source files. The Clerk server/browser keys are not configured in the current workspace, so authenticated Live verification remains blocked until they are supplied.

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

- **Phase 1** provides the Express auth gateway, FastAPI endpoints, and canonical SQLite event store. It persists events, Phase 2 findings, evidence snapshots and hash links, reports, and dry-run audit records.
- **Phase 2** detection rules are reused by the Cowrie import adapter. Findings are persisted separately and linked to their event and evidence record. Raw imported Cowrie messages are analyzed in memory and are not persisted.
- **Phase 3** checks run through a read-only adapter that forces `apply_changes=False`; no live adaptive action route is exposed.
- **Phase 4** reads live overview, event, finding, evidence, and reporting endpoints through the same-origin `/api` proxy. Demo fixtures are separate and only shown through **View clearly labeled demo preview**. API errors do not fall back to demo data.

The fictional web decoy is a real local HTTP interaction source served only by FastAPI's loopback listener at `127.0.0.1:8180/decoy`; it records bounded visits and feeds route text to Phase 2 in memory. It does not accept credentials, execute paths, or touch files, and it is not exposed through the public web preview. The database decoy remains a logical simulator. The integrated app does not start an SSH/Cowrie service or external threat feed. Evidence hashes are tamper-evident checksums, not keyed signatures or an independently administered immutable archive.

For the phase entry points, API routes, storage details, and test locations, see [`docs/PHASE_INTEGRATION.md`](docs/PHASE_INTEGRATION.md).

## Verification record

Checks run on **2026-10-22**:

| Check | Command | Result |
|---|---|---|
| Phase 1 API and integration tests | `cd phases/phase1/artifacts/api-server && HONEYPROBE_ENV=test PYTHONPATH=python uv run --project ../.. python -m unittest discover -s tests -v` | **PASS** — 15 tests, including a loopback decoy request creating a Phase 2 finding and linked evidence that survive a real API process restart, plus credential rejection and chunked request-size enforcement |
| Phase 2 tests | `cd phases/phase2 && python -m unittest discover -s tests -v` | **PASS** — 4 tests |
| Phase 3 tests | `cd phases/phase3 && PYTHONPATH=src python -m unittest discover -s tests -v` | **PASS** — 16 tests |
| Phase 1 workspace typecheck | `cd phases/phase1 && pnpm run typecheck` | **PASS** |
| Phase 4 console typecheck | `cd phases/phase4 && pnpm --filter @workspace/security-console run typecheck` | **PASS** |
| Phase 1 workspace production build | `cd phases/phase1 && PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 pnpm run build` | **PASS** — build completed; existing source-map warning in a UI tooltip component |
| Phase 4 workspace production build | `cd phases/phase4 && PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 pnpm run build` | **PASS** — build completed; same non-fatal source-map warning |

The integrated workflow restarted successfully. Gateway health returned HTTP 200. The web console is on port 5000, the gateway on internal port 8080, and FastAPI is bound to `127.0.0.1:8180`. The local `/decoy` path is not proxied by the gateway (404). With Clerk not configured, protected requests—including a forged operator-header request—return HTTP 503 `authentication_unavailable`; no authorization bypass was added. Backend integration tests separately confirm direct unauthorized dry-run requests return 403 and create no audit record.

Security tools were rerun against the completed changes on the same date:

- Dependency audit: **0 critical, 2 high, 2 moderate** reported instances remain across the two phase lockfiles. The high findings are `braces@3.0.3` (no fix listed); the moderate findings are `postcss-selector-parser@6.0.10` (the listed fix is major version 7.1.6). No dependency was changed without compatibility verification.
- Static analysis (SAST): **0 findings**.
- Dataflow/privacy scan (HoundDog): **0 findings**.

The Replit preview was visually checked after restart. It displays **Authentication setup required** and a clearly labeled demo-preview option. Clerk is not configured in this workspace; `/api/findings` returns HTTP 503, so a signed-in Live dashboard, real Clerk session authorization, and the matching finding rendered in the signed-in UI remain **blocked**. No frontend test runner is configured; Phase 4 typechecking, production build, and static preview capture passed. Configure Clerk and the verified operator allowlist before verifying the Live browser workflow.

## Verification refresh — 2026-10-23

- **Combined startup: PASS after stopping the competing standalone API Server workflow.** The supported launcher checks the Phase 4 runtime modules before starting services, waits for gateway health, then starts the console. The separate API artifact also binds ports 8080/8180 and must not run alongside the Project workflow.
- **Backend end-to-end and persistence: PASS.** A harmless loopback-only decoy visit produced event `evt_b00659f414ff437ba458312188f0c805`, Path Traversal finding `finding_73d46d97426341f4921c993353a2f58e`, and linked evidence `evidence_6da6a67c69ff4f40b1b8fafa473abf97`. In isolated SQLite file `/tmp/honeyprobe-final-loopback-3s_pnyh9/honeyprobe.sqlite3`, counts changed from 3 events / 0 findings / 3 evidence records to 4 / 1 / 4, then remained 4 / 1 / 4 after restarting the API process. The temporary database was removed after verification.
- **Frontend and backend checks: PASS.** Phase 4 Node tests: 4/4; ESLint and test syntax check: pass; Phase 4 workspace typecheck and production build: pass. Phase 1 API integration suite: 15/15; Phase 1 workspace typecheck and Python compilation: pass; launcher Bash syntax and `git diff --check`: pass. The production build retains a non-fatal source-map warning in the existing tooltip component.
- **Authentication and Live dashboard: BLOCKED, fail-closed.** `/api/healthz` returned HTTP 200; unauthenticated `/api/findings` returned HTTP 503 `authentication_unavailable`. The preview shows the authentication-setup-required state. Clerk management is not configured; provide genuine development-instance values for `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, and `VITE_CLERK_PUBLISHABLE_KEY`, plus a verified operator allowlist, before validating signed-in Live records.
- **Dependency review: unresolved.** Each workspace audit reports one high `braces@3.0.3` advisory and one moderate `postcss-selector-parser@6.0.10` advisory. No compatible patched `braces` release is available; the selector-parser fix is major version 7.1.6 while the current typography plugin pins version 6.0.10. Neither was force-overridden.
- No commit, push, public deployment, or new port mapping was made.

Do not publish this controlled-lab application without a separate network-isolation and access-control review. No deployment, push, or manual commit was performed. The workspace started on branch `main` aligned with `origin/main`; the current HoneyProbe changes are uncommitted. Confirm the repository state before release.
