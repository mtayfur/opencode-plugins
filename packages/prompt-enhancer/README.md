# opencode-prompt-enhancer

OpenCode TUI plugin that rewrites rough prompt drafts into clearer, stronger prompts.

## What it does

- Rewrites rough prompt drafts into clearer, stronger prompts.
- Uses lightweight workspace context.
- Keeps the original intent and language, and does not read file contents.
- Preserves a leading OpenCode slash command while enhancing only its instructions.
- Supports canceling an active enhancement and reverting an unchanged enhanced prompt.

## Context used

The enhancer uses:

- the current working directory
- the current VCS branch
- recent user prompts in the current session
- files changed in the current session

## Install

For local development without an npm release:

```bash
bun run setup
```

This replaces the released plugin entry in OpenCode's `tui.json` plugin list with the local checkout. To restore the released plugin entry:

```bash
bun run setup:uninstall
```

The setup command installs dependencies, builds `dist`, and updates the TUI plugin configuration.

For npm install/publish flows, add the package to OpenCode's `tui.json` plugin list:

```jsonc
{
  "plugin": [
    "@mtayfur/opencode-prompt-enhancer@latest"
  ]
}
```

OpenCode `>=1.18.12 <2` is required.

Restart OpenCode after changing the plugin configuration.

## Model

The enhancer uses OpenCode's `small_model` when `model` is not set.

```jsonc
{
  "plugin": [
    [
      "@mtayfur/opencode-prompt-enhancer@latest",
      {
        "model": "anthropic/claude-sonnet-4-6",
        "variant": "high"
      }
    ]
  ]
}
```

## Use

1. Open OpenCode in a workspace.
2. Enter a rough prompt in the TUI prompt.
3. Press `Ctrl+E` or run the `Enhance Prompt` command.
4. Review the prefilled dialog, edit it if needed, and confirm.
5. The enhanced prompt replaces the current input.
6. Press `Ctrl+Shift+E` to cancel an active enhancement or revert to the original prompt. Revert is skipped if the enhanced prompt was edited or is no longer active.

## Development

From the repository root:

```bash
bun install --frozen-lockfile
bun run --filter @mtayfur/opencode-prompt-enhancer typecheck
bun run --filter @mtayfur/opencode-prompt-enhancer build
npm pack ./packages/prompt-enhancer --dry-run
```
