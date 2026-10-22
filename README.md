# HoneyProbe — All Phases Starter Bundle

This bundle preserves the four uploaded phase projects in one workspace. Phase 1 is the live application; Phase 2 detection and Phase 3 self-tests are connected through bounded, safe adapters. Phase 4 is retained as a UI prototype because its incident and adaptation records are hardcoded demo data, not live backend results. See `docs/PHASE_INTEGRATION.md` for the exact mapping and limitations.

## Folder map

- `phases/phase1/` — Phase 1 master project (React/TypeScript frontend and API/Python code)
- `phases/phase2/` — Phase 2 event monitoring / analysis project
- `phases/phase3/` — Phase 3 self-testing and adaptive-hardening Python package
- `phases/phase4/` — Phase 4 security dashboard project
- `INTEGRATION_PLAN.md` — short, safe integration order

Generated dependencies, Git histories, caches, and local Replit state were excluded to keep the ZIP smaller. Lockfiles and normal source/configuration files are retained where present. The root Replit workflow installs Phase 1 dependencies from its lockfiles when needed.

## Run on Replit

Start the **Project** workflow, or run `bash scripts/start-honeyprobe.sh` from the workspace root. The launcher starts the Phase 1 API gateway and React interface together; Vite forwards `/api` requests through the gateway. The first launch installs the locked Phase 1 dependencies.

The operator dashboard remains protected by Clerk and a verified operator allowlist. Clerk is not configured in this imported workspace, so the UI displays an authentication-setup notice and the API denies protected data routes until authentication is configured. No development authentication bypass is enabled.

## Important

Keep your original ZIPs as backups. Avoid merging SQLite database files directly; the live application uses Phase 1's common event schema and SQLite store. Synthetic records are labeled as test data, Cowrie message text is analyzed in memory but not stored, and Phase 3 actions are forced to dry-run mode.
