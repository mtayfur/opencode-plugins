import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type { TreeRow } from "../core/projection";

export type TreePalette = {
  readonly screenBackground: TuiThemeCurrent["background"];
  readonly panelBackground: TuiThemeCurrent["backgroundPanel"];
  readonly helpText: TuiThemeCurrent["textMuted"];
  readonly helpKey: TuiThemeCurrent["text"];
  readonly loadingText: TuiThemeCurrent["info"];
  readonly emptyText: TuiThemeCurrent["textMuted"];
  readonly errorText: TuiThemeCurrent["error"];
  readonly noticeText: TuiThemeCurrent["warning"];
  readonly branchingText: TuiThemeCurrent["accent"];
};

export function createTreePalette(theme: TuiThemeCurrent): TreePalette {
  return {
    screenBackground: theme.background,
    panelBackground: theme.backgroundPanel,
    helpText: theme.textMuted,
    helpKey: theme.text,
    loadingText: theme.info,
    emptyText: theme.textMuted,
    errorText: theme.error,
    noticeText: theme.warning,
    branchingText: theme.accent,
  };
}

export function getRowForeground(theme: TuiThemeCurrent, row: TreeRow): TuiThemeCurrent["text"] {
  if (row.kind === "session") {
    return row.isDeleted ? theme.error : theme.secondary;
  }

  if (row.kind === "day") return theme.secondary;
  if (row.role === "assistant") return theme.textMuted;
  if (row.role === "user") return theme.primary;
  return theme.text;
}
