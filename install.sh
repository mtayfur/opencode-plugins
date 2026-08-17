#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

case "${1:-install}" in
  install|--install) ACTION="install" ;;
  uninstall|--uninstall) ACTION="uninstall" ;;
  *)
    echo "Usage: $0 [install|uninstall]"
    exit 1
    ;;
esac

PLUGIN_DIRS=(cache-view chat-tree prompt-enhancer session-recap)
PLUGIN_NAMES=("Cache View" "Chat Tree" "Prompt Enhancer" "Session Recap")

echo "Select a plugin to ${ACTION}:"
for index in "${!PLUGIN_NAMES[@]}"; do
  printf "  %d) %s\n" "$((index + 1))" "${PLUGIN_NAMES[$index]}"
done
printf "  %d) All plugins\n" "$((${#PLUGIN_NAMES[@]} + 1))"
printf "> "
read -r selection

case "${selection}" in
  1|2|3|4)
    SELECTED_DIRS=("${PLUGIN_DIRS[$((selection - 1))]}")
    ;;
  5)
    SELECTED_DIRS=("${PLUGIN_DIRS[@]}")
    ;;
  *)
    echo "Invalid selection: ${selection}" >&2
    exit 1
    ;;
esac

for plugin_dir in "${SELECTED_DIRS[@]}"; do
  echo ""
  echo "=== ${ACTION}: ${plugin_dir} ==="
  bash "${ROOT_DIR}/packages/${plugin_dir}/install.sh" "${ACTION}"
done
