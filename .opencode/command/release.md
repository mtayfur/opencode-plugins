---
description: Analyze and release one plugin with a semantic version bump and concise changelog.
agent: build
---

Release exactly one plugin from this repository. The invocation arguments are: `$ARGUMENTS`.

Accepted plugin names are `cache-view`, `chat-tree`, `prompt-enhancer`, and `session-recap`. Treat the first argument as the plugin name and reject additional arguments. If the plugin is missing or invalid, ask the user to select one accepted plugin.

Before proposing a release:

1. Verify the current branch is `main`, the worktree is clean, and `origin` is available. Stop without changing anything if a precondition fails.
2. Find the latest version-sorted `${plugin}-v*` tag that is merged into `HEAD`. Stop if no matching tag exists.
3. Inspect both the commits and the complete diff from that tag to `HEAD` under `packages/${plugin}`. Base the decision on the actual behavior changes, not commit titles alone. Stop if that package has no changes.
4. Choose exactly one bump using the highest applicable level:
   - `major`: backward-incompatible public API, configuration, or behavior.
   - `minor`: backward-compatible user-visible capability.
   - `patch`: fixes, performance improvements, documentation, refactoring, build changes, or other compatible updates without a new capability.

Write concise English release notes that summarize meaningful outcomes rather than copying commit messages. Use this format:

```text
Changes
- Added or changed behavior.

Fixes
- Corrected behavior.
```

Include only headings that have entries. Put an incompatible item under `Changes` and prefix its bullet with `**Breaking:**`. Do not add `Breaking Changes`, `Maintenance`, commit hashes, a version title, or empty headings. Internal changes may influence the bump and should normally be omitted, but the notes must contain at least one bullet; for an internal-only release, summarize the release-relevant outcome under `Changes`.

Before executing the release, show the plugin, previous tag, selected bump, resulting version, bump rationale, and exact release notes. Ask for confirmation once because the script commits, tags, pushes, and triggers npm publishing. Do not proceed without explicit confirmation.

After confirmation, create a temporary notes file outside the worktree containing only the release-notes body, then run:

```sh
bash ./release.sh "$plugin" "$bump" "$notes_file"
```

Always remove the temporary notes file afterward. Do not edit package versions, commit, tag, push, or publish separately; `release.sh` owns the complete release operation. Report the pushed tag when successful, or the exact failing step without bypassing it.
