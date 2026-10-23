#!/usr/bin/env bash
set -Eeuo pipefail

ARTIFACT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PHASE1_WORKSPACE="$(cd -- "$ARTIFACT_DIR/../.." && pwd)"

echo "Installing Phase 1 dependencies from $PHASE1_WORKSPACE with the frozen lockfile..."
cd "$PHASE1_WORKSPACE"
pnpm install --frozen-lockfile

echo "Starting HoneyProbe from $ARTIFACT_DIR..."
cd "$ARTIFACT_DIR"
exec pnpm exec vite --config vite.config.ts --host 0.0.0.0
