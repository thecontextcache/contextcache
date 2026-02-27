#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "[brain-readiness] FAIL: $1" >&2
  exit 1
}

require_pattern() {
  local pattern="$1"
  local file="$2"
  if ! rg -n -e "$pattern" "$file" >/dev/null 2>&1; then
    fail "Missing '$pattern' in $file"
  fi
}

WEBGL_FILE="web/app/(dashboard)/brain/brain-content-webgl.tsx"
PAGE_FILE="web/app/(dashboard)/brain/page.tsx"
WORKER_FILE="web/app/(dashboard)/brain/brain-sim.worker.ts"

[[ -f "$WEBGL_FILE" ]] || fail "Missing $WEBGL_FILE"
[[ -f "$PAGE_FILE" ]] || fail "Missing $PAGE_FILE"
[[ -f "$WORKER_FILE" ]] || fail "Missing $WORKER_FILE"

require_pattern "NEXT_PUBLIC_BRAIN_RENDERER" "$PAGE_FILE"
require_pattern "new URL\\('\\./brain-sim\\.worker\\.ts'" "$WEBGL_FILE"
require_pattern "WebGL renderer failed" "$WEBGL_FILE"
require_pattern "__brainGraphDebug" "$WEBGL_FILE"
require_pattern "createSyntheticGraph" "$WEBGL_FILE"
require_pattern "role=\"application\"" "$WEBGL_FILE"
require_pattern "webglcontextlost" "$WEBGL_FILE"
require_pattern "forceSimulation" "$WORKER_FILE"

echo "[brain-readiness] PASS"
