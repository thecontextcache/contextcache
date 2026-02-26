#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "[exposure-guard] FAIL: $1" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "Missing required file: $path"
}

forbidden_path() {
  local path="$1"
  if [[ -e "$path" ]]; then
    fail "Forbidden path present: $path"
  fi
}

forbid_pattern_in_file() {
  local pattern="$1"
  local file="$2"
  if rg -n -e "$pattern" "$file" >/dev/null 2>&1; then
    fail "Forbidden pattern '$pattern' found in $file"
  fi
}

require_pattern_in_file() {
  local pattern="$1"
  local file="$2"
  if ! rg -n -e "$pattern" "$file" >/dev/null 2>&1; then
    fail "Required pattern '$pattern' missing in $file"
  fi
}

check_stub_only() {
  local file="$1"
  local required_import="$2"
  require_file "$file"
  require_pattern_in_file "$required_import" "$file"

  # Public analyzer stubs must not contain implementation functions/classes.
  forbid_pattern_in_file '^\s*def\s+' "$file"
  forbid_pattern_in_file '^\s*class\s+' "$file"
}

echo "[exposure-guard] Checking forbidden paths..."
forbidden_path "docs/05-aco-cache.md"
forbidden_path "site/05-aco-cache"

echo "[exposure-guard] Checking analyzer stubs..."
check_stub_only "api/app/analyzer/algorithm.py" "from contextcache_engine\\.algorithm import"
check_stub_only "api/app/analyzer/cag.py" "from contextcache_engine\\.cag import"
check_stub_only "api/app/analyzer/sfc.py" "from contextcache_engine\\.sfc import"

require_file "api/app/analyzer/core.py"
forbid_pattern_in_file '^\s*def\s+' "api/app/analyzer/core.py"
forbid_pattern_in_file '^\s*class\s+' "api/app/analyzer/core.py"

echo "[exposure-guard] Checking public refinery surface..."
require_file "api/app/worker/tasks.py"
require_pattern_in_file "from contextcache_engine\\.refinery import refine_content_with_llm" "api/app/worker/tasks.py"
forbid_pattern_in_file "_GEMINI_SYSTEM_PROMPT" "api/app/worker/tasks.py"
forbid_pattern_in_file "Classify them as: DECISION, FINDING, TODO, CODE, or NOTE" "api/app/worker/tasks.py"
forbid_pattern_in_file "from google import genai" "api/app/worker/tasks.py"
forbid_pattern_in_file "response_mime_type=\"application/json\"" "api/app/worker/tasks.py"

echo "[exposure-guard] PASS"
