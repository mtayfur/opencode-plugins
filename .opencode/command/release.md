---
description: Analyze and release one plugin with a semantic version bump and concise changelog.
agent: build
---

Release exactly one plugin from this repository. Arguments: `$ARGUMENTS`.

Accepted plugins: `cache-view`, `chat-tree`, `prompt-enhancer`, `session-recap`. Accept zero or one positional
argument; reject additional arguments without changing anything.

## Resolve the plugin

First verify with read-only commands that the branch is `main`, the index and worktree are clean including untracked
files, and `origin` is configured. On failure, stop unchanged and report the failed precondition.

Use a valid supplied plugin. If it is missing or invalid, find each accepted plugin's latest version-sorted
`<plugin>-v*` tag merged into `HEAD`, then retain only plugins with a non-empty diff from that tag to `HEAD` under
`packages/<plugin>`. Exclude plugins without a matching tag. If none remain, stop. Otherwise use the `question` tool
to offer exactly the retained plugins and require the user to select one.

## Analyze

For the selected plugin:

1. Find or reuse its latest version-sorted merged tag. Stop if none exists.
2. Verify that `packages/<plugin>/package.json` has the same version as the tag suffix; stop on mismatch.
3. Inspect both the complete commit range and complete package diff from that tag to `HEAD`. Stop if the diff is empty.
4. Choose exactly one highest-applicable bump from actual behavior, not commit titles:
   - `major`: backward-incompatible public API, configuration, or behavior.
   - `minor`: backward-compatible user-visible capability.
   - `patch`: compatible fixes, performance, documentation, refactoring, build, or other non-capability changes.
5. Calculate the resulting version from the package version and bump.

## Release notes

Write concise English notes about meaningful outcomes, not commit messages, using only applicable sections:

```text
Changes
- Added or changed behavior.

Fixes
- Corrected behavior.
```

Include no empty headings, version title, commit hashes, `Breaking Changes`, or `Maintenance`. Put incompatible bullets
under `Changes` prefixed with `**Breaking:**`. Normally omit internal details, but always include at least one bullet;
summarize an internal-only outcome under `Changes`.

## Confirm and execute

Show the plugin, previous tag, bump, resulting version, concise rationale, and exact notes body. Then use the `question`
tool once with `Release now` and `Cancel` choices. State that the script commits, tags, atomically pushes, and triggers
npm publishing. Proceed only after explicit `Release now`; do not ask again.

After confirmation, create a temporary file outside the worktree containing only the notes body and run exactly:

```sh
bash ./release.sh "$plugin" "$bump" "$notes_file"
```

Always remove the temporary file afterward. Do not separately edit versions or lockfiles, commit, tag, push, publish,
retry, or compensate; `release.sh` owns the release. Report the pushed tag on success. On failure, report the exact step
and error plus residual worktree or tag state found with read-only checks.
