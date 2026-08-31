# OpenCode Cache View

`@mtayfur/opencode-cache-view` adds a compact sidebar to the OpenCode TUI for cache efficiency, estimated context
usage, generation speed, and loaded skills. The latest cache-hit ratio and trend also remain visible in the prompt
status row.

```text
Cache View
Hit [████████████████] 98.7% ↑0.8%
Session Hit                96.0%
Read                    8.0M tok
Miss                    326K tok
▼ Speed ─────────────────────
TTFT                       ~1.4 s
TPS                       47 tok/s
Trend                    ▂▅▄▇▆█
▼ Estimated Tokens ──────────
Prompt                  186K tok
Tool Call                59K tok
Tool Result              80K tok
Agent Reasoning          14K tok
Agent Output             21K tok
Total                   326K tok
▼ Loaded Skills (2) ─────────
playwright-mcp-ops       2.4K tok
customize-opencode       3.1K tok
```

## Metrics

- **Cache:** `Hit` is `cache.read / (input + cache.read + cache.write)` for the latest regular LLM step.
  `Session Hit` is the aggregate OpenCode session ratio, including compaction calls. `Miss` combines uncached input and
  cache writes.
- **Estimated Tokens:** Uses one character-based estimator for the visible system, user, tool, reasoning, and output
  content from the latest completed compaction summary, its preserved tail, and subsequent messages loaded in the TUI.
  Provider system prompts, tool schemas, and media tokens are not included.
- **Speed:** During streaming, `TPS` shows a `~`-prefixed estimate from visible text and reasoning deltas over the
  latest five seconds. Hidden reasoning with no deltas uses the previous completed turn or remains `… tok/s` when none
  exists.
  Completed tool-call steps and tool execution time are excluded. The rate remains `~`-prefixed while the turn is
  incomplete; the final non-tool-call assistant step replaces it with exact `(output + reasoning) / duration`
  throughput. `TTFT` retains the estimated delay to the first visible reasoning or text block, and `Trend` shows the
  latest eight completed-turn TPS values.
- **Loaded Skills:** Shows active, non-compacted skill outputs and their estimated token counts. When a skill is loaded
  more than once, the latest load is shown.

Rows and the cache-hit bar adapt to the available sidebar width. The arrow next to the hit rate compares the latest two
LLM steps. Sections can be expanded or collapsed with the mouse.

The prompt status indicator uses the composable `session_prompt_right` slot, so it does not replace the prompt or
conflict with plugins that customize prompt behavior. It shows the same completed-step TPS as the sidebar, followed by
a single separator and the cache ratio; only the cache trend is color-coded.

## Requirements

- OpenCode `1.18.16` or a newer compatible 1.x release

## Installation

Install the plugin globally with OpenCode:

```sh
opencode plugin @mtayfur/opencode-cache-view --global
```

Restart OpenCode after installation.

### Manual configuration

Alternatively, add the package to `~/.config/opencode/tui.json`:

```json
{
  "plugin": ["@mtayfur/opencode-cache-view"]
}
```

Restart OpenCode after changing the configuration.
