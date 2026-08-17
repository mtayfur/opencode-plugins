import type { Binding, KeyEvent, Renderable } from "@opencode-ai/plugin/tui";

export const TREE_COMMANDS = {
  moveUp: "chat-tree.move-up",
  moveDown: "chat-tree.move-down",
  collapse: "chat-tree.collapse",
  expand: "chat-tree.expand",
  select: "chat-tree.select",
  back: "chat-tree.back",
} as const;

export const TREE_BINDINGS = [
  { key: "up", cmd: TREE_COMMANDS.moveUp },
  { key: "down", cmd: TREE_COMMANDS.moveDown },
  { key: "left", cmd: TREE_COMMANDS.collapse },
  { key: "right", cmd: TREE_COMMANDS.expand },
  { key: "h", cmd: TREE_COMMANDS.collapse },
  { key: "l", cmd: TREE_COMMANDS.expand },
  { key: "return", cmd: TREE_COMMANDS.select },
  { key: "escape", cmd: TREE_COMMANDS.back },
  { key: "ctrl+c", cmd: TREE_COMMANDS.back },
] as const satisfies readonly Binding<Renderable, KeyEvent>[];
