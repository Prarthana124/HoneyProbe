# Fast integration plan

## Goal
Keep Phase 1 as the entry point and reuse each other phase's logic, rather than launching four separate dashboards/services permanently.

## Recommended order
1. **Baseline Phase 1:** install dependencies using its own package/requirements manifests and confirm the existing app runs before edits.
2. **Inspect contracts:** document each phase's entry point, API routes, data model, environment variables, and start command. Do not copy `.env` secrets or local databases.
3. **Phase 2 adapter:** wrap monitoring/detection functions behind Phase 1's API. Map Phase 2 events to a common event model. Avoid running its standalone server on the same port as Phase 1.
4. **Phase 3 adapter:** call its self-test engine from a controlled backend endpoint or CLI job. Keep dry-run behavior enabled until actions and permissions are reviewed.
5. **Phase 4 UI:** identify its reusable pages/components. Prefer merging selected components into Phase 1's frontend rather than keeping duplicate dashboards. Align API client types and routes.
6. **Shared persistence:** define migrations/schema first. Do not combine SQLite files by copying them over one another.
7. **Verification:** run each phase's tests, then integration tests for event ingestion, dashboard display, self-tests, and failure handling.
8. **Phase 4 final checks:** verify security controls, authentication, CORS, and secrets handling before deployment.

## Completion checklist
- [ ] Phase 1 starts unchanged
- [ ] Phase 2 events reach the Phase 1 API and appear in its dashboard
- [ ] Phase 3 tests run and results are recorded; hardening remains dry-run by default
- [ ] Phase 4 dashboard functionality is incorporated without duplicate conflicting routes
- [ ] All original test suites pass, plus integration tests
- [ ] One documented start command and environment setup are provided

This bundle is intentionally organized but not represented as a finished merge. A code-level merge requires adapting interfaces and running the app/tests in the target environment.
