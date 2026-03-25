#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if grep -qi microsoft /proc/version 2>/dev/null && command -v cmd.exe >/dev/null 2>&1; then
  WIN_SCRIPT="$(wslpath -w "${SCRIPT_DIR}/start-workspace.bat")"
  cmd.exe /c "${WIN_SCRIPT}" "$@"
  exit $?
fi

bash "${SCRIPT_DIR}/sync-projects.sh"
node "${SCRIPT_DIR}/start-workspace.js" "$@"
