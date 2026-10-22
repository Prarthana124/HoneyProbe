# HoneyProbe phase integration

## Integration map

| Phase | Existing functionality | Reused components | Integration method | Verification |
|---|---|---|---|---|
| 1 | React/TypeScript operator console; Express/Clerk gateway; FastAPI API; SQLite events, sessions, analytics, decoy simulations, self-tests, and CSV/HTML reports | `phases/phase1/artifacts/honeyprobe/`, `phases/phase1/artifacts/api-server/`, `phases/phase1/lib/api-spec/` | Canonical application and data store. The root launcher starts the API gateway and Vite UI together; Vite proxies `/api` to the gateway. | Phase 1 API tests plus TypeScript typecheck/build. |
| 2 | Standard-library event normalization, rule-based detection, behaviour summaries, fingerprint indicators, standalone dashboard, and Cowrie parser | `phases/phase2/app.py`, especially `normalize_event` and `detect_event` | `phase1/.../honeyprobe/phase2_adapter.py` loads the original pure functions. Cowrie imports run detections in memory and persist only bounded rule names, severities, and generic reasons with the common Phase 1 event. The standalone Phase 2 HTTP server/database is not started by the integrated app. | Phase 2 tests; Phase 1 Cowrie-import test checks SQL/auth indicators and confirms raw message text is absent from the response and SQLite file. |
| 3 | Self-test coordinator, file-permission tests, policy-gated hardening controls, and retesting | `phases/phase3/src/honeyprobe_module3/`, `phases/phase3/config.example.toml` | `phase1/.../honeyprobe/phase3_adapter.py` runs its configured sample-target checks as part of the Phase 1 self-test endpoint. The adapter forcibly sets `apply_changes=False`; any reported applied action fails the check. Summary results are persisted in Phase 1's self-test table. | Phase 3's original unit tests; Phase 1 API test verifies the integrated dry-run result and that no action was applied. |
| 4 | React security-console visual prototype with dashboard, incidents, adaptation, reports, and verification screens | `phases/phase4/artifacts/security-console/` and `src/data/demo-data.ts` | Not merged into the live routes: its incident/adaptation records and several health claims are hardcoded demo data with no operational API connection. The Phase 1 console already has API-backed overview, telemetry, sessions, decoy state, self-tests, and reports. Phase 4 files remain preserved for future redesign work. | Source inspection confirms this console reads the static demo-data module rather than the common event API. |

## Runtime and data flow

```text
Browser on port 5000
  └─ Vite /api proxy → Express + Clerk gateway on port 8080
                         ├─ public shallow health checks
                         └─ verified, allowlisted operator → FastAPI on 127.0.0.1:8180
                              ├─ web/database simulated interactions
                              ├─ bounded Cowrie import → Phase 2 rules in memory
                              ├─ common event/session/analytics queries
                              ├─ self-test endpoint → Phase 1 checks + Phase 3 dry-run
                              └─ CSV and printable HTML report generation
                                    ↓
                              Phase 1 SQLite event store
```

Relevant API routes include `/api/health`, `/api/overview`, `/api/events`, `/api/sessions`, `/api/decoys`, `/api/decoys/web/interaction`, `/api/decoys/database/interaction`, `/api/imports/cowrie`, `/api/self-tests`, `/api/self-tests/run`, and `/api/reports/*`. The Express gateway requires Clerk authentication and the configured verified-email allowlist for data routes; FastAPI stays bound to loopback.

Cowrie import input is bounded and validated. Phase 2 analyzes each message only in memory. Persisted metadata contains detection categories, severity, and generic reasons, not raw commands, payloads, credentials, or request strings. Events, sessions, self-test summaries, and reports use Phase 1's SQLite store; Phase 2's separate SQLite database is not part of the live data path.

## Run and verification

- One command: `bash scripts/start-honeyprobe.sh` from the workspace root, or start the Replit **Project** workflow.
- Phase 1 dependencies: Node.js 24 + pnpm workspace, Python 3.13 + uv.
- Phase 2 and Phase 3 tests use Python's standard library; no third-party dependencies are needed for those suites.
- The application is designed for a local or isolated research workspace. Do not publish decoy routes as public honeypots without separate network-isolation and access-control review.

## Current limits

- This workspace has no Clerk tenant configured. The frontend now presents an explicit setup-required screen; protected data APIs remain fail-closed. Configure Clerk and the approved verified operator list before using the dashboard.
- The web and database decoys are simulations. Cowrie is imported from logs; no SSH service is launched. Mobile/Android telemetry is unavailable.
- No external threat-intelligence feed or URL enrichment is connected. No case-management system, evidence-chain store, PDF report generator, or measured deception score is implemented.
- Phase 3 is limited to the sample-target permission checks and is always dry-run through the integrated API. No automated production configuration changes are made.
- Phase 4 remains an isolated visual prototype because its hardcoded data must not be presented as real observations.
