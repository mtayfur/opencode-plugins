#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="${1:-}"
VERSION_SPEC="${2:-patch}"
NOTES_FILE="${3:-}"

usage() {
  echo "Usage: $0 [cache-view|chat-tree|prompt-enhancer|session-recap] [patch|minor|major|version] [notes-file]"
}

if [ "$#" -gt 3 ]; then
  usage
  exit 1
fi

if [ -n "${NOTES_FILE}" ]; then
  case "${NOTES_FILE}" in
    /*) ;;
    *) NOTES_FILE="${PWD}/${NOTES_FILE}" ;;
  esac

  if [ ! -f "${NOTES_FILE}" ] || [ ! -r "${NOTES_FILE}" ]; then
    echo "Release notes file is not readable: ${NOTES_FILE}" >&2
    exit 1
  fi

  if [ ! -s "${NOTES_FILE}" ]; then
    echo "Release notes file must not be empty: ${NOTES_FILE}" >&2
    exit 1
  fi
fi

for command_name in bun git node npm; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
done

cd "${ROOT_DIR}"

if [ "$(git branch --show-current)" != "main" ]; then
  echo "Releases must be created from the main branch." >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "The worktree must be clean before creating a release." >&2
  exit 1
fi

git remote get-url origin >/dev/null

if [ -z "${PLUGIN}" ]; then
  echo "Select a plugin to release:"
  echo "  1) Cache View"
  echo "  2) Chat Tree"
  echo "  3) Prompt Enhancer"
  echo "  4) Session Recap"
  printf "> "
  read -r selection

  case "${selection}" in
    1) PLUGIN="cache-view" ;;
    2) PLUGIN="chat-tree" ;;
    3) PLUGIN="prompt-enhancer" ;;
    4) PLUGIN="session-recap" ;;
    *) echo "Invalid selection: ${selection}" >&2; exit 1 ;;
  esac
fi

case "${PLUGIN}" in
  cache-view|chat-tree|prompt-enhancer|session-recap) ;;
  *) usage; exit 1 ;;
esac

PACKAGE_DIR="packages/${PLUGIN}"
PACKAGE_JSON="${PACKAGE_DIR}/package.json"

current_version="$(node -p "require('./${PACKAGE_JSON}').version")"
echo "Bumping ${PLUGIN} from ${current_version} using ${VERSION_SPEC}..."

version_dir="$(mktemp -d)"
trap 'rm -rf -- "${version_dir}"' EXIT
cp "${PACKAGE_JSON}" "${version_dir}/package.json"
new_version="$(cd "${version_dir}" && npm version "${VERSION_SPEC}" --no-git-tag-version --ignore-scripts)"
new_version="${new_version#v}"

tag="${PLUGIN}-v${new_version}"
tag_message_file="${version_dir}/tag-message"

if [ -n "${NOTES_FILE}" ]; then
  {
    printf '%s v%s\n\n' "${PLUGIN}" "${new_version}"
    cat -- "${NOTES_FILE}"
  } > "${tag_message_file}"
else
  printf '%s\n' "${tag}" > "${tag_message_file}"
fi

if git rev-parse --verify --quiet "refs/tags/${tag}" >/dev/null; then
  echo "Tag already exists: ${tag}" >&2
  exit 1
fi

if ! remote_tag="$(git ls-remote --tags origin "refs/tags/${tag}")"; then
  echo "Could not check remote tags on origin." >&2
  exit 1
fi

if [ -n "${remote_tag}" ]; then
  echo "Tag already exists on origin: ${tag}" >&2
  exit 1
fi

bun install --frozen-lockfile --ignore-scripts

if [ "${PLUGIN}" = "chat-tree" ]; then
  bun run --cwd "${PACKAGE_DIR}" fmt:check
fi
bun run --cwd "${PACKAGE_DIR}" typecheck
bun run --cwd "${PACKAGE_DIR}" build

(cd "${PACKAGE_DIR}" && npm version "${new_version}" --no-git-tag-version --ignore-scripts --workspaces-update=false >/dev/null)
bun install --lockfile-only --ignore-scripts
bun install --frozen-lockfile --ignore-scripts

git add -- "${PACKAGE_JSON}" bun.lock
git commit -m "release(${PLUGIN}): v${new_version}"
git tag -a "${tag}" -F "${tag_message_file}"

git push --atomic origin main "${tag}"
echo "Pushed ${tag}. GitHub Actions will publish ${PLUGIN}@${new_version} to npm."
