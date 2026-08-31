# OpenCode Codex Fast

`@mtayfur/opencode-codex-fast` adds a global Fast Mode toggle for ChatGPT Codex. When enabled, matching HTTP
requests include:

```json
{
  "service_tier": "priority"
}
```

Other providers and endpoints are unaffected.

## Requirements

- OpenCode `1.18.21` or a newer compatible 1.x release

## Installation

Install both plugin targets with OpenCode:

```sh
opencode plugin @mtayfur/opencode-codex-fast --global
```

The package uses separate server and TUI entry points. The installer registers both targets.

### Manual configuration

Add the package to `~/.config/opencode/opencode.jsonc` (`opencode.json` is also supported):

```jsonc
{
  "plugin": ["@mtayfur/opencode-codex-fast"]
}
```

Add the same package to `~/.config/opencode/tui.json`:

```json
{
  "plugin": ["@mtayfur/opencode-codex-fast"]
}
```

Restart OpenCode after installation or configuration changes.

## Usage

Run `/fast` or select `codex.fast.toggle` from the command palette. The command updates the global state and shows a
toast; it does not create a session message or call a model.

- `⚡` — Fast Mode is enabled.
- `🐢` — Fast Mode is disabled.

The icon appears only in sessions using the `openai` provider. A model change is reflected after the first prompt sent
with that model.

## Behavior

Fast Mode applies to primary agents and sub-agents that use the ChatGPT Codex HTTP endpoint:

- Protocol: `https:`
- Hostname: `chatgpt.com`
- Pathname: `/backend-api/codex/responses`

The state is read before every matching request. Experimental WebSocket transports may bypass `globalThis.fetch` and
are not supported.

## State

The state file contains only the `enabled` boolean. Its location is:

- `$XDG_CONFIG_HOME/opencode/codex-fast.json`
- `%APPDATA%\opencode\codex-fast.json` on Windows
- `~/.config/opencode/codex-fast.json` otherwise

Missing or invalid state means disabled. Writes are atomic.
