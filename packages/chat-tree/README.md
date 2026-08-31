# OpenCode Chat Tree

`@mtayfur/opencode-chat-tree` adds persistent conversation branching to the OpenCode TUI. It presents related
sessions as a navigable tree, creates branches from any visible message, and can carry a generated handoff into the
new branch.

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

## Installation

Install the plugin globally with OpenCode:

```sh
opencode plugin @mtayfur/opencode-chat-tree --global
```

Restart OpenCode after installation.

### Manual configuration

Alternatively, add the package to `~/.config/opencode/tui.json`:

```json
{
  "plugin": ["@mtayfur/opencode-chat-tree"]
}
```

Restart OpenCode after changing the configuration.

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

Each project has a `registry.json` and immutable-style tree snapshots under `trees/<tree-id>/snapshot.json`. Writes use
temporary files and atomic renames. The plugin validates ownership, parent-child symmetry, graph reachability, and
path-safe tree IDs before using persisted data.
