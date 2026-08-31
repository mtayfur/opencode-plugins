# OpenCode Plugins

A collection of focused TUI plugins for OpenCode.

Monitor cache performance, navigate conversation trees, toggle Codex Fast Mode, enhance prompts, and generate
automatic session recaps.

## Plugins

| Plugin | What it does | Install |
| --- | --- | --- |
| [Cache View](packages/cache-view) | Displays cache usage, token estimates, TTFT, and generation speed. | `opencode plugin @mtayfur/opencode-cache-view --global` |
| [Chat Tree](packages/chat-tree) | Adds conversation branching and tree navigation. | `opencode plugin @mtayfur/opencode-chat-tree --global` |
| [Codex Fast](packages/codex-fast) | Toggles the ChatGPT Codex priority service tier globally. | `opencode plugin @mtayfur/opencode-codex-fast --global` |
| [Prompt Enhancer](packages/prompt-enhancer) | Rewrites rough prompts directly inside the OpenCode TUI. | `opencode plugin @mtayfur/opencode-prompt-enhancer --global` |
| [Session Recap](packages/session-recap) | Generates session recaps and refreshes titles automatically. | `opencode plugin @mtayfur/opencode-session-recap --global` |

Install only the plugins you need. The OpenCode installer registers them globally; restart OpenCode afterward. Each
plugin is versioned and published independently. See its linked README for requirements, configuration, and usage.
