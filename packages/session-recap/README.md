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

## Installation

Install the plugin globally with OpenCode:

```sh
opencode plugin @mtayfur/opencode-session-recap --global
```

Restart OpenCode after installation.

### Manual configuration

Alternatively, add the package to `~/.config/opencode/tui.json`:

```json
{
  "plugin": ["@mtayfur/opencode-session-recap"]
}
```

Restart OpenCode after changing the configuration.

## Configuration

```json
{
  "plugin": [
    [
      "@mtayfur/opencode-session-recap",
      {
        "model": "openai/gpt-5.6-luna-fast",
        "variant": "high",
        "models": {
          "title": "openai/gpt-5.6-luna-fast",
          "recap": "anthropic/claude-sonnet-4-6"
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

When a model is not set, title and recap generation use OpenCode's `small_model`.
