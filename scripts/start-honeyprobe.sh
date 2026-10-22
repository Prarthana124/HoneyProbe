#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PHASE1_DIR="$ROOT_DIR/phases/phase1"
PHASE4_DIR="$ROOT_DIR/phases/phase4"
WEB_PORT=5000
GATEWAY_PORT="${HONEYPROBE_GATEWAY_PORT:-8080}"
INTERNAL_PORT="${HONEYPROBE_INTERNAL_PORT:-8180}"
API_PID=""
WEB_PID=""

for port_name in WEB_PORT GATEWAY_PORT INTERNAL_PORT; do
  port="${!port_name}"
  if [[ ! "$port" =~ ^[0-9]+$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
    echo "$port_name must be a valid TCP port." >&2
    exit 1
  fi
done
if [[ "$WEB_PORT" == "$GATEWAY_PORT" ||
      "$WEB_PORT" == "$INTERNAL_PORT" ||
      "$GATEWAY_PORT" == "$INTERNAL_PORT" ]]; then
  echo "The web, gateway, and internal API ports must all be different." >&2
  exit 1
fi

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

if [[ ! -x "$PHASE1_DIR/node_modules/.bin/tsc" ]] || \
  [[ ! -x "$PHASE1_DIR/artifacts/api-server/node_modules/.bin/esbuild" ]]; then
  echo "Installing the locked Phase 1 backend JavaScript dependencies..."
  (cd "$PHASE1_DIR" && pnpm install --frozen-lockfile)
fi

if [[ ! -x "$PHASE4_DIR/artifacts/security-console/node_modules/.bin/vite" ]] || \
  [[ ! -x "$PHASE4_DIR/node_modules/.bin/tsc" ]]; then
  echo "Installing the locked Phase 4 console dependencies..."
  (cd "$PHASE4_DIR" && pnpm install --frozen-lockfile)
fi

if [[ ! -x "$ROOT_DIR/.pythonlibs/bin/python" ]] || \
  ! "$ROOT_DIR/.pythonlibs/bin/python" -c 'import fastapi, httpx, uvicorn' >/dev/null 2>&1; then
  echo "Installing the locked Phase 1 Python dependencies..."
  uv sync --locked --project "$PHASE1_DIR"
fi

(
  cd "$PHASE1_DIR"
  export PORT="$GATEWAY_PORT"
  export HONEYPROBE_GATEWAY_PORT="$GATEWAY_PORT"
  export HONEYPROBE_INTERNAL_PORT="$INTERNAL_PORT"
  export HONEYPROBE_ENV="${HONEYPROBE_ENV:-development}"
  exec pnpm --filter @workspace/api-server run dev
) &
API_PID=$!

ready=false
for _ in $(seq 1 80); do
  if curl -fsS "http://127.0.0.1:${GATEWAY_PORT}/api/healthz" >/dev/null; then
    ready=true
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    wait "$API_PID"
  fi
  sleep 0.25
done
if [[ "$ready" != true ]]; then
  echo "HoneyProbe API gateway did not become healthy on port ${GATEWAY_PORT}." >&2
  exit 1
fi

(
  cd "$PHASE4_DIR"
  export PORT="$WEB_PORT"
  export HONEYPROBE_GATEWAY_PORT="$GATEWAY_PORT"
  export BASE_PATH=/
  exec pnpm --filter @workspace/security-console run dev
) &
WEB_PID=$!

echo "HoneyProbe Security Operations Console: port ${WEB_PORT}"
echo "Protected API gateway: internal port ${GATEWAY_PORT}; FastAPI remains bound to 127.0.0.1:${INTERNAL_PORT}."
wait -n "$API_PID" "$WEB_PID"
