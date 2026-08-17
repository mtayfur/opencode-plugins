#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN="${1:-}"
VERSION_SPEC="${2:-patch}"

usage() {
  echo "Usage: $0 [cache-view|chat-tree|prompt-enhancer|session-recap] [patch|minor|major|version]"
}

if [ "$#" -gt 2 ]; then
  usage
  exit 1
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

(cd "${PACKAGE_DIR}" && npm version "${new_version}" --no-git-tag-version --ignore-scripts >/dev/null)
bun install --lockfile-only --ignore-scripts
bun install --frozen-lockfile --ignore-scripts

git add -- "${PACKAGE_JSON}" bun.lock
git commit -m "release(${PLUGIN}): v${new_version}"
git tag -a "${tag}" -m "${tag}"

git push --atomic origin main "${tag}"
echo "Pushed ${tag}. GitHub Actions will publish ${PLUGIN}@${new_version} to npm."
