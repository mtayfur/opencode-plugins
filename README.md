# OpenCode Plugins

Independent OpenCode plugins maintained in a single Bun workspace.

## Packages

| Package | Description |
| --- | --- |
| [`@mtayfur/opencode-cache-view`](packages/cache-view) | Cache usage, token estimates, and generation-speed metrics. |
| [`@mtayfur/opencode-chat-tree`](packages/chat-tree) | Conversation branching and tree navigation. |
| [`@mtayfur/opencode-codex-fast`](packages/codex-fast) | Global ChatGPT Codex priority-tier toggle. |
| [`@mtayfur/opencode-prompt-enhancer`](packages/prompt-enhancer) | Prompt rewriting from the active TUI input. |
| [`@mtayfur/opencode-session-recap`](packages/session-recap) | Context-free session recaps and topic-aware title refreshes. |

Each plugin is versioned, published, and installed independently. See the package README for installation and
configuration.

## Development

```sh
bun install --frozen-lockfile
bun run check
```

Run a command for one package with its npm name:

```sh
bun run --filter @mtayfur/opencode-chat-tree typecheck
bun run --filter @mtayfur/opencode-chat-tree build
```

Register one local plugin, or all of them, from the workspace root:

```sh
bun run setup
```

The script asks which plugin to install. To restore the selected plugin's published package entry, run:

```sh
bun run setup:uninstall
```

Package-scoped `setup` and `setup:uninstall` commands remain available. They update the plugin's required OpenCode
configuration files; restart OpenCode afterward.
