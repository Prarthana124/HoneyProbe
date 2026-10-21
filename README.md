# HoneyProbe — All Phases Starter Bundle

This bundle organizes the four uploaded phase projects into one workspace while preserving each phase's source files. It is an **integration starter**, not yet a verified single running application: the original projects use different entry points, dependencies, and data stores. Do not assume the four modules are already wired together.

## Folder map

- `phases/phase1/` — Phase 1 master project (React/TypeScript frontend and API/Python code)
- `phases/phase2/` — Phase 2 event monitoring / analysis project
- `phases/phase3/` — Phase 3 self-testing and adaptive-hardening Python package
- `phases/phase4/` — Phase 4 security dashboard project
- `INTEGRATION_PLAN.md` — short, safe integration order

Generated dependencies, Git histories, caches, and local Replit state were excluded to keep the ZIP smaller. Lockfiles and normal source/configuration files are retained where present. Reinstall dependencies in each phase using its own manifest before attempting to run it.

## Important

Keep your original ZIPs as backups. Integrate one phase at a time and test it before moving to the next. Avoid merging SQLite database files directly; define a common event schema and connect through APIs/adapters instead.
