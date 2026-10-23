#!/usr/bin/env bash
set -Eeuo pipefail

ARTIFACT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PHASE4_WORKSPACE="$(cd -- "$ARTIFACT_DIR/../.." && pwd)"

echo "Installing Phase 4 dependencies from $PHASE4_WORKSPACE with the frozen lockfile..."
cd "$PHASE4_WORKSPACE"
pnpm install --frozen-lockfile

echo "Starting the console from $ARTIFACT_DIR..."
cd "$ARTIFACT_DIR"
exec pnpm exec vite --config vite.config.ts --host 0.0.0.0
