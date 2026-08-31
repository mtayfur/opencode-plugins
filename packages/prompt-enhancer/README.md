# OpenCode Prompt Enhancer

`@mtayfur/opencode-prompt-enhancer` rewrites rough prompt drafts into clearer, stronger prompts directly inside the
OpenCode TUI.

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

## Requirements

- OpenCode `1.18.12` or a newer compatible 1.x release

## Installation

Install the plugin globally with OpenCode:

```sh
opencode plugin @mtayfur/opencode-prompt-enhancer --global
```

Restart OpenCode after installation.

### Manual configuration

Alternatively, add the package to OpenCode's `tui.json` plugin list:

```jsonc
{
  "plugin": [
    "@mtayfur/opencode-prompt-enhancer"
  ]
}
```

Restart OpenCode after changing the plugin configuration.

## Model

The enhancer uses OpenCode's `small_model` when `model` is not set.

```jsonc
{
  "plugin": [
    [
      "@mtayfur/opencode-prompt-enhancer",
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
6. Press `Ctrl+Shift+E` to cancel an active enhancement or revert to the original prompt. Revert is skipped if the
   enhanced prompt was edited or is no longer active.
