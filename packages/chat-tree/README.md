# OpenCode Chat Tree

`@mtayfur/opencode-chat-tree` adds persistent conversation branching to the OpenCode TUI. It presents related sessions as a navigable tree, creates branches from any visible message, and can carry a generated handoff into the new branch.

## Capabilities

- Open the current conversation tree with `/tree`.
- Navigate parent and child sessions from a single view.
- Collapse sessions or calendar-day groups.
- Branch from user and assistant messages without changing OpenCode's fork semantics.
- Replay a selected user prompt in the new branch.
- Generate an optional branch handoff.
- Store tree metadata globally or inside the project.
- Detect deleted sessions while preserving their descendants in the tree.

## Requirements

- OpenCode `1.18.16` or newer compatible 1.x release
- Bun `1.3.14` or newer for local development

## Installation

Add the package to `~/.config/opencode/tui.json`:

```json
{
  "plugin": ["@mtayfur/opencode-chat-tree"]
}
```

OpenCode installs package plugins automatically. Restart the TUI after changing the configuration.

### Local checkout

```sh
bash ./install.sh
```

The installer resolves dependencies, builds `dist/index.js`, and replaces the package entry with a local file URL. Restore the published package entry with:

```sh
bash ./install.sh --uninstall
```

## Configuration

The plugin intentionally keeps its configuration small:

```json
{
  "plugin": [
    [
      "@mtayfur/opencode-chat-tree",
      {
        "storageScope": "global",
        "model": "openai/gpt-5.6-luna-fast",
        "variant": "high"
      }
    ]
  ]
}
```

| Option         | Default                | Description                             |
| -------------- | ---------------------- | --------------------------------------- |
| `storageScope` | `global`               | Use `global` or `local` tree metadata.  |
| `model`        | OpenCode `small_model` | Model used to generate branch handoffs. |
| `variant`      | Model default          | Model variant used for branch handoffs. |

When `model` is not set, branch handoffs use OpenCode's `small_model`.

Unknown options are ignored so removing an obsolete option does not prevent the plugin from loading.

## Controls

| Keys             | Action                                           |
| ---------------- | ------------------------------------------------ |
| `↑` / `k`        | Move up                                          |
| `↓` / `j`        | Move down                                        |
| `←` / `h`        | Collapse the selected group                      |
| `→` / `l`        | Expand the selected group                        |
| `Enter`          | Open a session, toggle a day, or create a branch |
| `Esc` / `Ctrl+C` | Return to the originating session                |

Controls are fixed by design. OpenCode activates them only while the tree has focus.

## Branch behavior

- Selecting a session opens it.
- Selecting a user message forks at that message and restores its prompt in the input area.
- Selecting an assistant message forks at the following message boundary.
- Selecting the last assistant message returns to its session because no later fork boundary exists.
- A generated handoff is written into the new session as context without requesting a reply.

## Storage

- Global: `<OpenCode state>/plugins/opencode-chat-tree/projects/<project-slug-hash>/`
- Local: `<project>/.opencode/opencode-chat-tree/`

Each project has a `registry.json` and immutable-style tree snapshots under `trees/<tree-id>/snapshot.json`. Writes use temporary files and atomic renames. The plugin validates ownership, parent-child symmetry, graph reachability, and path-safe tree IDs before using persisted data.

## Architecture

```text
src/
├── adapters/       OpenCode and filesystem boundaries
├── core/           Tree, transcript, projection, and branch rules
├── ui/             TUI controls, workflow, route, and rendering
├── configuration.ts
└── index.ts        Plugin entrypoint
```

Core modules are side-effect free. `TreeRepository` owns persistence, while `OpenCodeTreeGateway` owns SDK calls and fork cleanup. The UI only coordinates reactive state and user interaction.

## Development

From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @mtayfur/opencode-chat-tree fmt:check
bun run --filter @mtayfur/opencode-chat-tree typecheck
bun run --filter @mtayfur/opencode-chat-tree build
npm pack ./packages/chat-tree --dry-run
```
