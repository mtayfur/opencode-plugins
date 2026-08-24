# OpenCode Plugin Monorepo

## Repository boundaries

- This is a Bun workspace containing independently versioned and published OpenCode plugins under `packages/`.
- `packages/cache-view/`: TUI sidebar plugin. Entry: `src/index.tsx`; metric logic belongs under `src/metrics/`, separate from rendering in `src/cache-view.tsx`.
- `packages/chat-tree/`: conversation-tree plugin. Entry: `src/index.ts`; keep side-effect-free rules in `src/core/`, persistence/SDK boundaries in `src/adapters/`, and coordination/rendering in `src/ui/`.
- `packages/codex-fast/`: ChatGPT Codex priority-tier plugin. Server and TUI entries are `src/server.ts` and `src/tui.ts`; keep cross-process state path and persistence in `src/state.ts`.
- `packages/prompt-enhancer/`: prompt-rewriting plugin. Entry: `plugins/prompt-enhancer.tsx`; its nested `AGENTS.md` contains required TUI and prompt-handling constraints and takes precedence there.
- `packages/session-recap/`: session recap and title-refresh plugin. Entry: `src/index.tsx`.
- Keep packages independently buildable, publishable, installable, and free of dependencies on sibling plugins unless explicitly required.

## Commands

- Install all workspace dependencies from the repository root with `bun install --frozen-lockfile`.
- Validate all packages with `bun run check`.
- `packages/cache-view`: `bun run typecheck && bun run build`; use `npm pack --dry-run` when checking package contents.
- `packages/chat-tree`: `bun run fmt:check && bun run typecheck && bun run build`; use `npm pack --dry-run` when checking package contents. `bun run fmt` is the formatter command.
- `packages/codex-fast`: `bun run typecheck && bun run build`; use `npm pack --dry-run` when checking package contents.
- `packages/prompt-enhancer`: `bun run typecheck && bun run build`.
- `packages/session-recap`: `bun run typecheck && bun run build`; use `npm pack --dry-run` when checking package contents.
- None of the packages defines a test script or focused-test command; do not invent one.

## Build and local-install gotchas

- `dist/` is generated. Each build rewrites it; edit source, never generated output.
- Cache-view and chat-tree bundle with Bun plus `@opentui/solid/bun-plugin`; chat-tree also emits declarations through `tsconfig.build.json`.
- Prompt-enhancer deliberately compiles every `plugins/**/*.ts(x)` file with Babel because the OpenTUI Bun plugin is incompatible with Bun 1.3.x; keep `scripts/build.mjs` and its generated `dist/index.js` entry in sync with packaging changes.
- `bun run setup` / `setup:uninstall` are operational commands, not validation: they install/build and modify `~/.config/opencode/tui.json`. Run them only when local plugin registration is explicitly requested, then restart OpenCode.
- Releases use package-scoped tags and publish only the matching package; do not hand-edit package versions as a substitute for the release flow.
