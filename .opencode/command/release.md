---
description: Analyze and independently release one or more plugins with patch version bumps and concise changelogs.
agent: build
---

Release one or more plugins independently from this repository. Arguments: `$ARGUMENTS`.

Accepted plugins: `cache-view`, `chat-tree`, `codex-fast`, `prompt-enhancer`, `session-recap`. Accept zero or one
positional argument; reject additional arguments without changing anything.

## Resolve the plugins

First verify with read-only commands that the branch is `main`, the index and worktree are clean including untracked
files, and `origin` is configured. On failure, stop unchanged and report the failed precondition.

Use a valid supplied plugin as the sole selection. If it is missing or invalid, find each accepted plugin's latest
version-sorted `<plugin>-v*` tag merged into `HEAD`. Retain tagged plugins with a non-empty diff from that tag to
`HEAD` under `packages/<plugin>`. Retain an untagged plugin when its package directory has committed history; treat it
as an initial release. If none remain, stop. Otherwise use the `question` tool once with `multiple: true` to offer
exactly the retained plugins and require the user to select at least one. Treat all selected plugins as independent
releases.

## Analyze

For each selected plugin independently:

1. Find or reuse its latest version-sorted merged tag. If none exists, mark it as an initial release.
2. For a tagged release, verify that `packages/<plugin>/package.json` has the same version as the tag suffix; stop on
   mismatch. For an initial release, verify that the package version is valid semver.
3. For a tagged release, inspect the complete commit range and package diff from that tag to `HEAD`; stop if empty. For
   an initial release, inspect all committed history under `packages/<plugin>` and the complete package tree at `HEAD`.
4. Always choose a `patch` bump regardless of the type or scope of the changes.
5. Calculate the resulting version as `x.y.(z+1)` from the package version `x.y.z`.

## Release notes

Write concise English notes about meaningful outcomes, not commit messages, using only applicable sections:

```markdown
## Changes

- Added or changed behavior.

## Fixes

- Corrected behavior.
```

Use the `##` headings exactly as shown, leave a blank line before each bullet list, and format identifiers with inline
code only when it improves readability.

Include no empty headings, version title, commit hashes, `Breaking Changes`, or `Maintenance`. Put incompatible bullets
under `Changes` prefixed with `**Breaking:**`. Normally omit internal details, but always include at least one bullet;
summarize an internal-only outcome under `Changes`.

## Confirm and execute

Show every selected plugin's previous tag, bump, resulting version, concise rationale, and exact notes body, clearly
separated by plugin. Then use the `question` tool once with `Release all now` and `Cancel` choices. State that each
plugin is released independently: the script atomically pushes its commit and tag, which starts the downstream release.
Proceed only after explicit `Release all now`; do not ask again.

After confirmation, process the selected plugins sequentially in the displayed order. For each plugin, create a separate
temporary file outside the worktree containing only that plugin's notes body and run exactly:

```sh
bash ./release.sh "$plugin" "$bump" "$notes_file"
```

Always remove each temporary file after its command. Do not separately edit versions or lockfiles, commit, tag, push,
publish, create a GitHub Release, rerun `release.sh`, or compensate; `release.sh` is the sole release entry point.
Report every pushed tag on success. If any release fails,
stop without attempting the remaining plugins and report the exact step and error, plugins already released, plugins not
attempted, and residual worktree or tag state found with read-only checks.
