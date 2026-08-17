# OpenCode Session Recap

`@mtayfur/opencode-session-recap` keeps long-running OpenCode sessions easy to identify and resume.

## Capabilities

- Generates a readable recap of up to 1,000 characters after 10 minutes of inactivity.
- Shows the recap in a large dialog without adding it to the transcript or future model context.
- Regenerates the recap on demand with `/recap`.
- Re-evaluates the session title every 20 user messages and after recap generation.
- Keeps the current title when the dominant topic has not changed.
- Stops automatic title changes after a manual rename is detected.
- Stores recap and title bookkeeping in session metadata.

## Requirements

- OpenCode `1.18.16` or a compatible newer 1.x release
- Bun `1.3.14` or newer for local development

## Installation

Add the package to `~/.config/opencode/tui.json`:

```json
{
  "plugin": ["@mtayfur/opencode-session-recap"]
}
```

Restart OpenCode after changing the configuration.

### Local checkout

Install and register the local build:

```sh
bun run setup
```

The installer resolves dependencies with the checked-in lockfile, builds `dist/index.js`, and replaces the published package entry in `~/.config/opencode/tui.json` with the local file URL.

Restore the published package entry with:

```sh
bun run setup:uninstall
```

Restart OpenCode after rebuilding or changing the plugin configuration.

## Configuration

```json
{
  "plugin": [
    [
      "@mtayfur/opencode-session-recap",
      {
        "model": "openai/gpt-5.6-luna-fast",
        "models": {
          "title": "openai/gpt-5.6-luna-fast",
          "recap": "openai/gpt-5.6-luna-fast"
        },
        "title": {
          "enabled": true,
          "refreshEveryUserMessages": 20,
          "respectManualTitle": true
        },
        "recap": {
          "enabled": true,
          "idleDelayMs": 600000
        }
      }
    ]
  ]
}
```

`model` is the shared override. `models.title` and `models.recap` override it per task. Without a plugin override, OpenCode Session Recap uses OpenCode's configured `small_model`; if no `small_model` is configured, it falls back to the current session model.

## Development

From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @mtayfur/opencode-session-recap typecheck
bun run --filter @mtayfur/opencode-session-recap build
npm pack ./packages/session-recap --dry-run
```
