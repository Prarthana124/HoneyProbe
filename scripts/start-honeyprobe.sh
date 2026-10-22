#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PHASE1_DIR="$ROOT_DIR/phases/phase1"
API_PID=""
WEB_PID=""

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  for pid in "$API_PID" "$WEB_PID"; do
    if [[ -n "$pid" ]]; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$API_PID" "$WEB_PID"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
  exit "$status"
}
trap cleanup EXIT INT TERM

if [[ ! -x "$PHASE1_DIR/node_modules/.bin/vite" ]]; then
  echo "Installing the locked Phase 1 JavaScript workspace dependencies..."
  (cd "$PHASE1_DIR" && pnpm install --frozen-lockfile)
fi

if [[ ! -x "$ROOT_DIR/.pythonlibs/bin/python" ]]; then
  echo "Installing the locked Phase 1 Python dependencies..."
  uv sync --locked --project "$PHASE1_DIR"
fi

(
  cd "$PHASE1_DIR"
  export PORT=8080
  export HONEYPROBE_INTERNAL_PORT=8180
  export HONEYPROBE_ENV="${HONEYPROBE_ENV:-development}"
  exec pnpm --filter @workspace/api-server run dev
) &
API_PID=$!

ready=false
for _ in $(seq 1 80); do
  if curl -fsS http://127.0.0.1:8080/api/healthz >/dev/null; then
    ready=true
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    wait "$API_PID"
  fi
  sleep 0.25
done
if [[ "$ready" != true ]]; then
  echo "HoneyProbe API gateway did not become healthy on port 8080." >&2
  exit 1
fi

(
  cd "$PHASE1_DIR"
  export PORT=5000
  export BASE_PATH=/
  exec pnpm --filter @workspace/honeyprobe run dev
) &
WEB_PID=$!

echo "HoneyProbe operator interface: port 5000"
echo "API gateway: port 8080; FastAPI remains bound to loopback on port 8180."
wait -n "$API_PID" "$WEB_PID"
