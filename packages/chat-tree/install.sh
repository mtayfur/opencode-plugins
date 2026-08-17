#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_PATH="${PROJECT_DIR}/dist/index.js"
WORKSPACE_ROOT="$(cd "${PROJECT_DIR}/../.." && pwd)"
PACKAGE_NAME="@mtayfur/opencode-chat-tree"

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
  if [ -f "${WORKSPACE_ROOT}/bun.lock" ]; then
    bun install --cwd "${WORKSPACE_ROOT}" --frozen-lockfile --filter "${PACKAGE_NAME}"
  elif [ -f "${PROJECT_DIR}/bun.lock" ]; then
    bun install --cwd "${PROJECT_DIR}" --frozen-lockfile
  else
    bun install --cwd "${PROJECT_DIR}"
  fi

  echo "Building plugin..."
  bun run --cwd "${PROJECT_DIR}" build

  if [ ! -f "${PLUGIN_PATH}" ]; then
    echo "Plugin build not found: ${PLUGIN_PATH}" >&2
    exit 1
  fi
fi

bun run --cwd "${PROJECT_DIR}" scripts/configure-plugin.ts "${ACTION}" "${PLUGIN_PATH}"
echo "Restart OpenCode for changes to take effect."
