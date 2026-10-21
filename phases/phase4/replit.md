# Security Operations Console

A security operations dashboard for reviewing incidents, attack behaviour, adaptation history, reports, and report-integrity verification.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/security-console/src/pages/security-pages.tsx` — dashboard, incident register, adaptation timeline, reports, and SHA-256 verification.
- `artifacts/security-console/src/components/console-shell.tsx` — navigation shell and live API health status.
- `artifacts/security-console/src/data/demo-data.ts` — typed Phase 1–3 demo data and report payload contract.
- `artifacts/api-server/src/routes/health.ts` — existing live API health endpoint used by the console.

## Architecture decisions

- The current workspace does not contain Phase 1–3 incident outputs or a populated database, so the console uses clearly labelled demo records rather than inventing a second persistence system.
- API reachability is live and independent from the demo incident records; the console probes `/api/healthz` without browser caching.
- Reports are generated as JSON in the browser from the same typed dataset rendered in the UI, then hashed with the Web Crypto SHA-256 implementation.
- The hash verification screen compares a supplied digest against the current report snapshot and explicitly labels the result as report-integrity verification.

## Product

The console provides a dashboard overview, searchable and filterable incident/attack records, adaptation history, downloadable report snapshots, and SHA-256 integrity verification. Upstream records are marked `DEMO DATA` until the Phase 1–3 provider is available.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The Vite build requires the workflow-provided `PORT` and `BASE_PATH` values when run outside the managed workflow.
- Replace the demo data provider with Phase 1–3 API output when those phases are added; keep the existing incident and adaptation field contract so reports and verification remain stable.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
