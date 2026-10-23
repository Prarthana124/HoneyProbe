# HoneyProbe acceptance report

**Run date:** 2026-10-23  
**Final decision:** **CODE COMPLETE WITH ENVIRONMENT BLOCKERS**  
**Scope:** Imported HoneyProbe workspace; no new product features, deployment, push, commit, or project restart from scratch.

## Summary

The Replit runtime was aligned with the Phase 1 Python requirement. The combined HoneyProbe workflow restarted and served the web console; the API health route returned HTTP 200. All executable test, typecheck, lint, and production-build checks passed.

The acceptance runner reported **14 PASS, 0 FAIL, 2 BLOCKED, 0 SKIPPED** and exited with status `2` because two required environment checks could not be completed:

1. Docker CLI is installed, but its daemon is unreachable, so Compose health and persistent-volume restart could not run.
2. The Replit-managed Clerk tenant and server/browser keys are provisioned, but the verified operator allowlist is not configured, so a real signed-in Live session could not be tested. Anonymous access is rejected with HTTP 401.

These are environment blockers, not passed checks. The final result is therefore not `VERIFIED COMPLETE`.

## Python runtime alignment

- Phase 1 configuration requires Python `>=3.13`; the Replit module is now `python-base-3.13`.
- The root/test process reports `/home/runner/workspace/.pythonlibs/bin/python`, Python `3.13.11`.
- The Phase 1 `uv` application environment reports the same executable and Python `3.13.11` with FastAPI `0.143.3`.
- The running Uvicorn process was checked directly and resolves to the Nix Python 3.13.11 interpreter.
- `scripts/start-honeyprobe.sh` sets `UV_PYTHON=3.13`, and the acceptance runner now enforces exactly Python 3.13 for the Phase 1 runtime readiness probe.

## Test and build results

The complete acceptance run was:

```bash
python scripts/self-test-honeyprobe.py
```

| Suite/check | Exact command or runner step | Result |
|---|---|---|
| Phase 1 backend, schema migration, evidence, response safety, and real process restart | From `phases/phase1/artifacts/api-server`: `uv run --no-sync --locked --project ../.. python -m unittest discover -s tests -v` | **PASS — 23 tests** |
| Trusted proxy allowlist and header validation | From the API server directory: `node --test tests/trusted_proxy.test.mjs` | **PASS — 7 tests** |
| Phase 2 | `python -m unittest discover -s tests -v` from `phases/phase2`, using the verified Python 3.13.11 test executable | **PASS — 4 tests** |
| Phase 3 | `python -m unittest discover -s tests -v` from `phases/phase3` with `PYTHONPATH=src`, using the verified Python 3.13.11 test executable | **PASS — 16 tests** |
| Phase 4 API client | `pnpm --filter @workspace/security-console run test` from `phases/phase4` | **PASS — 4 tests** |
| Self-test runner status contract | `python scripts/test_self_test_runner.py` | **PASS — 14 tests** |
| Phase 1 workspace typecheck | `pnpm run typecheck` from `phases/phase1` | **PASS** |
| Phase 1 workspace production build | `env PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 pnpm run build` from `phases/phase1` | **PASS** |
| Phase 4 console typecheck | `pnpm --filter @workspace/security-console run typecheck` from `phases/phase4` | **PASS** |
| Phase 4 console lint and test syntax | `pnpm --filter @workspace/security-console run lint` from `phases/phase4` | **PASS** |
| Phase 4 workspace production build | `env PORT=5000 BASE_PATH=/ HONEYPROBE_GATEWAY_PORT=8080 NODE_ENV=production pnpm run build` from `phases/phase4` | **PASS** |
| Compose configuration | `docker compose config --quiet` | **PASS** |
| Shell/patch hygiene | `git diff --check` | **PASS** |

That is **68 passing test cases** across the six test suites. The full acceptance runner reports **14 PASS, 0 FAIL, 2 BLOCKED, 0 SKIPPED**. The blockers are the unavailable Docker daemon and the unconfigured verified-operator email allowlist needed for a signed-in Clerk session. No required test was skipped or discovered as zero tests. Failed commands are classified `FAIL`; missing executables and required unavailable checks are not classified as `PASS`.

## Persisted end-to-end workflow

`test_local_decoy_finding_and_evidence_survive_a_real_process_restart` passed in the Phase 1 API suite. It uses an isolated temporary SQLite database and verifies:

1. A loopback-only local decoy request creates an observed event.
2. Phase 2 identifies the Path Traversal finding and links it to the event's exact evidence record.
3. The recommendation is a dry-run preview only (`applied=false`) and its evidence digest matches the linked evidence.
4. The preview appears in the audit record.
5. The real API process is stopped and restarted.
6. The event, finding, evidence, and audit entry remain retrievable; the evidence ID and SHA-256 digest still match.

The separate restart integration test also verifies authenticated-route behavior at the API boundary, finding/evidence linkage, report persistence, and dry-run audit persistence. The end-to-end tests did not use the workspace's persistent SQLite database.

## Running app and authentication

- The supported `HoneyProbe app` Project workflow restarted and is running on port `5000`.
- `GET /api/healthz`: **HTTP 200**, `{"status":"healthy"}`.
- The preview shows the protected operator landing page with **Sign in**, **Create account**, and **Open demo preview**. The Replit-managed Clerk development keys load; the browser reports only Clerk's standard development-key notice.
- `HONEYPROBE_ALLOWED_EMAILS` is still unset, so the signed-in operator dashboard has not been verified. Authentication remains enforced; no bypass was added.

## Security scan and remaining risk

Fresh scans were run with Replit's dependency audit, SAST, and HoundDog scanners:

| Scan | Result |
|---|---|
| Dependency audit | **0 critical, 2 high, 0 moderate, 0 low, 0 informational** |
| SAST | **0 findings** |
| HoundDog dataflow/privacy scan | **0 findings** |

The two high results are the same `GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687` advisory for transitive `braces@3.0.3` in the Phase 1 and Phase 4 workspace lockfiles. The Phase 1 API production path includes `http-proxy-middleware@4.2.0 → micromatch@4.0.8 → braces@3.0.3`; the workspace mockup tooling also pulls it through `fast-glob@3.3.3 → micromatch@4.0.8 → braces@3.0.3`. The advisory concerns stack exhaustion from deeply nested brace patterns. The audit lists no fixed version, so no unverified override was forced.

The prior `postcss-selector-parser` advisory is no longer reported by the latest scan; the current security scan note records the compatible workspace resolution. Continue to re-audit when dependencies change or a fixed `braces` release becomes available.

## Environment blockers and follow-up needed

- **Docker runtime — BLOCKED:** `docker --version` succeeds, but `docker info` cannot connect to a Docker daemon. Compose configuration parses successfully; image build, health checks, and persistent-volume restart were not run.
- **Clerk Live session — BLOCKED:** the Replit-managed tenant and keys are ready, but a verified operator email must be added to `HONEYPROBE_ALLOWED_EMAILS`; the headless runner cannot create that signed-in session.

## Security Console artifact workflow recovery

The integrated Project workflow is the supported preview and serves the console on port `5000`. The standalone Phase 1 API and Phase 4 console workflows are not needed beside it; they can fail when they try to claim ports already used by the integrated workflow. Use the root `HoneyProbe app` workflow instead.

The console package now declares TypeScript directly so its `typecheck` command works from the package. The integrated workflow installs dependencies from the Phase 4 workspace lockfile.

## Changed files

- `.replit` — select Python 3.13 for the Replit runtime.
- `scripts/self-test-honeyprobe.py` — report Python executable/version, enforce the exact backend Python minor, distinguish optional `SKIPPED` from required `BLOCKED`, include explicit status counts, and run full Phase 1/Phase 4 workspace builds.
- `scripts/test_self_test_runner.py` — cover required/optional skip classification and exit behavior.
- `README.md` and `replit.md` — replace stale verification claims with the current outcome and report link.
- `docs/HONEYPROBE_ACCEPTANCE_2026-10-23.md` — current acceptance results and blockers.
- `phases/phase1/artifacts/api-server/python/honeyprobe/models.py`, `analytics.py`, the Phase 1 backend tests, and the Phase 4 API/UI types and incident page — recent source activity timelines with category indicators only.

Controlled SSH/mobile event simulators, database Phase 2 findings, a simulation-only readiness assessment, dashboard scenario controls, and related tests were added. The existing persistent database was preserved. No deploy, push, or commit was performed. Security scanners were not rerun for this feature batch; the scan results above remain the earlier recorded results.
