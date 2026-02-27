#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "[ui-gates] FAIL: $1" >&2
  exit 1
}

if rg -n --glob 'web/app/**/*.tsx' '#[0-9A-Fa-f]{6}' web/app >/dev/null 2>&1; then
  echo "[ui-gates] WARN: hard-coded hex colors found in TSX. Prefer tokens."
fi

if ! rg -n "focus-visible:ring|focus-visible:outline" web/app >/dev/null 2>&1; then
  fail "No focus-visible styles found in app components"
fi

if ! rg -n "data-theme='dark'|data-theme=\"dark\"" web/app/globals.css >/dev/null 2>&1; then
  fail "Dark theme mapping missing in globals.css"
fi

if ! rg -n "role=\"application\"|aria-live|aria-label" "web/app/(dashboard)/brain/brain-content-webgl.tsx" >/dev/null 2>&1; then
  fail "Brain accessibility hooks missing"
fi

echo "[ui-gates] PASS"
