# OpenCode Codex Fast

`@mtayfur/opencode-codex-fast` adds a global Fast Mode toggle for ChatGPT Codex. When enabled, matching HTTP
requests include:

```json
{
  "service_tier": "priority"
}
```

Other providers and endpoints are unaffected.

## Installation

Install both plugin targets with OpenCode:

```sh
opencode plugin --global @mtayfur/opencode-codex-fast
```

The package uses separate server and TUI entry points. The installer adds it to `opencode.json(c)` and `tui.json`.
If configuring manually, add `@mtayfur/opencode-codex-fast` to the `plugin` array in both files. Restart OpenCode
after installation or updates.

For a local checkout, run `bun run --cwd packages/codex-fast setup`. Use `setup:uninstall` to remove both local
registrations.

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

## Development

```sh
bun install --frozen-lockfile
bun run --filter @mtayfur/opencode-codex-fast typecheck
bun run --filter @mtayfur/opencode-codex-fast build
npm pack ./packages/codex-fast --dry-run
```
