#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_ROOT="$(cd "${PROJECT_DIR}/../.." && pwd)"
PACKAGE_NAME="@mtayfur/opencode-codex-fast"
SERVER_PATH="${PROJECT_DIR}/dist/server.js"
TUI_PATH="${PROJECT_DIR}/dist/tui.js"

case "${1:-install}" in
  install|--install) ACTION="install" ;;
  uninstall|--uninstall) ACTION="uninstall" ;;
  *)
    echo "Usage: $0 [install|uninstall]"
    exit 1
    ;;
esac

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun is required." >&2
  exit 1
fi

if [ "${ACTION}" = "install" ]; then
  echo "Installing dependencies..."
  bun install --cwd "${WORKSPACE_ROOT}" --frozen-lockfile --filter "${PACKAGE_NAME}"

  echo "Building plugin..."
  bun run --cwd "${PROJECT_DIR}" build

  for plugin_path in "${SERVER_PATH}" "${TUI_PATH}"; do
    if [ ! -f "${plugin_path}" ]; then
      echo "Plugin build not found: ${plugin_path}" >&2
      exit 1
    fi
  done
fi

bun run --cwd "${PROJECT_DIR}" scripts/configure-plugin.ts "${ACTION}" "${SERVER_PATH}" "${TUI_PATH}"
echo "Restart OpenCode for changes to take effect."
