#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="$PROJECT_ROOT/.test-backend.pid"
DB_FILE="$PROJECT_ROOT/data/e2e-test.db"

if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Test backend already running (PID $OLD_PID)"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

mkdir -p "$PROJECT_ROOT/data"
rm -f "$DB_FILE"

export SERVER_PORT=${E2E_BACKEND_PORT:-8001}
export SERVER_MODE=debug
export DB_DRIVER=sqlite
export DB_DSN="$DB_FILE"
export JWT_SECRET=e2e-test-secret
export JWT_EXPIRE_TIME=24
export LOG_LEVEL=warn

cd "$PROJECT_ROOT"
go run main.go &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$PID_FILE"

echo "Waiting for backend to start (PID $BACKEND_PID)..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:${SERVER_PORT}/healthz > /dev/null 2>&1; then
    echo "Backend is ready."
    exit 0
  fi
  sleep 1
done

echo "ERROR: Backend failed to start within 30 seconds."
kill "$BACKEND_PID" 2>/dev/null || true
rm -f "$PID_FILE"
exit 1
