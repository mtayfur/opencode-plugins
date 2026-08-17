/** @jsxImportSource @opentui/solid */

import { RenderableEvents, ScrollBoxRenderable, TextAttributes } from "@opentui/core";
import type { TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import { createEffect, createMemo, For, on, onCleanup, onMount } from "solid-js";
import type { TreeRow } from "../core/projection";
import { getRowForeground } from "./theme";

export type TreeViewProps = {
  readonly rows: readonly TreeRow[];
  readonly currentSessionId?: string;
  readonly selectedIndex?: number;
  readonly width: number;
  readonly theme: () => TuiThemeCurrent;
  readonly autoFocus?: boolean;
  readonly onFocusChange?: (focused: boolean) => void;
};

type RowParts = {
  readonly prefix: string;
  readonly body: string;
};

type RenderedTreeRow = {
  readonly id: string;
  readonly selected: boolean;
  readonly backgroundColor?: TuiThemeCurrent["backgroundElement"];
  readonly borderColor?: TuiThemeCurrent["borderActive"];
  readonly guideColor: TuiThemeCurrent["primary"];
  readonly foregroundColor: TuiThemeCurrent["text"];
  readonly attributes?: typeof TextAttributes.BOLD;
  readonly parts: RowParts;
};

const MAX_SCROLL_ATTEMPTS = 5;
const INDENT_UNIT = "  ";
const GUIDE_MARKER = "┃";
const SESSION_PREFIX = "SESSION";
const CURRENT_SESSION_SUFFIX = " [CURRENT]";
const DELETED_SESSION_SUFFIX = " [DELETED]";

export function TreeView(props: TreeViewProps) {
  let scroll: ScrollBoxRenderable | undefined;
  let pendingScrollTimeout: ReturnType<typeof setTimeout> | undefined;
  let scrollRequestId = 0;
  const handleFocused = () => props.onFocusChange?.(true);
  const handleBlurred = () => props.onFocusChange?.(false);

  const renderedRows = createMemo<readonly RenderedTreeRow[]>(() => {
    const theme = props.theme();

    return props.rows.map((row, index) => {
      const selected = props.selectedIndex === index;
      const current = row.kind !== "day" && row.sessionId === props.currentSessionId;

      return {
        id: row.id,
        selected,
        backgroundColor: selected ? theme.backgroundElement : undefined,
        borderColor: selected ? theme.borderActive : undefined,
        guideColor: theme.primary,
        foregroundColor: getRowForeground(theme, row),
        attributes: selected || current ? TextAttributes.BOLD : undefined,
        parts: formatTreeRow(row, selected, current, props.width),
      };
    });
  });

  const selectedRowId = createMemo(() => {
    const index = props.selectedIndex;
    if (index === undefined) return undefined;
    return props.rows[index]?.id;
  });

  const clearPendingScroll = () => {
    if (pendingScrollTimeout === undefined) return;
    clearTimeout(pendingScrollTimeout);
    pendingScrollTimeout = undefined;
  };

  const scheduleScrollIntoView = (rowId: string) => {
    clearPendingScroll();
    const requestId = ++scrollRequestId;
    let attempts = 0;

    const scrollIntoViewWhenReady = () => {
      pendingScrollTimeout = undefined;
      if (requestId !== scrollRequestId || !scroll || attempts >= MAX_SCROLL_ATTEMPTS) return;
      attempts += 1;

      const child = scroll.content.findDescendantById(rowId);
      if (!child || scroll.viewport.height <= 0 || child.height <= 0) {
        if (attempts >= MAX_SCROLL_ATTEMPTS) return;
        pendingScrollTimeout = setTimeout(scrollIntoViewWhenReady, 0);
        return;
      }

      scroll.scrollChildIntoView(rowId);
    };

    pendingScrollTimeout = setTimeout(scrollIntoViewWhenReady, 0);
  };

  onMount(() => {
    scroll?.on(RenderableEvents.FOCUSED, handleFocused);
    scroll?.on(RenderableEvents.BLURRED, handleBlurred);

    if (props.autoFocus) {
      scroll?.focus();
    }

    const rowId = selectedRowId();
    if (rowId) scheduleScrollIntoView(rowId);
  });

  createEffect(
    on(
      selectedRowId,
      (rowId) => {
        if (!rowId) {
          clearPendingScroll();
          scrollRequestId += 1;
          return;
        }
        scheduleScrollIntoView(rowId);
      },
      { defer: true },
    ),
  );

  onCleanup(() => {
    clearPendingScroll();
    scrollRequestId += 1;
    props.onFocusChange?.(false);
    scroll?.off(RenderableEvents.FOCUSED, handleFocused);
    scroll?.off(RenderableEvents.BLURRED, handleBlurred);
  });

  return (
    <scrollbox
      ref={(renderable: ScrollBoxRenderable) => (scroll = renderable)}
      flexGrow={1}
      minHeight={0}
      width="100%"
      focusable
      scrollbarOptions={{ visible: false }}
    >
      <box flexDirection="column" gap={0} width="100%">
        <For each={renderedRows()}>
          {(row) => (
            <box
              id={row.id}
              width="100%"
              flexDirection="row"
              backgroundColor={row.backgroundColor}
              border={row.selected ? ["left"] : undefined}
              borderColor={row.borderColor}
            >
              <text wrapMode="none" attributes={row.attributes} fg={row.guideColor}>
                {row.parts.prefix}
              </text>
              <text wrapMode="none" attributes={row.attributes} fg={row.foregroundColor}>
                {row.parts.body}
              </text>
            </box>
          )}
        </For>
      </box>
    </scrollbox>
  );
}

function formatTreeRow(row: TreeRow, selected: boolean, current: boolean, width: number): RowParts {
  const rowWidth = Number.isFinite(width) ? Math.max(1, Math.floor(width)) : 1;
  const prefix = formatRowPrefix(row.depth, selected, current);

  if (row.kind === "day") {
    const collapseMarker = row.isCollapsed ? "▶" : "▼";
    const availableWidth = Math.max(0, rowWidth - prefix.length - collapseMarker.length - 1);
    const dayLabel = `${row.day} `;
    const separator = `${dayLabel}${"─".repeat(Math.max(0, availableWidth - dayLabel.length))}`;
    const body = `${collapseMarker} ${separator}`;
    return {
      prefix,
      body: truncateToWidth(body, Math.max(0, rowWidth - prefix.length)),
    };
  }

  if (row.kind === "session") {
    const collapseMarker = formatSessionCollapseMarker(row);
    const suffix = formatSessionSuffix(row, current);
    const label = `${collapseMarker} ${SESSION_PREFIX}${suffix}:`;
    const titleWidth = Math.max(0, rowWidth - prefix.length - label.length - 1);
    const title = truncateToWidth(row.title, titleWidth);
    const body = title ? `${label} ${title}` : label;
    return {
      prefix,
      body: truncateToWidth(body, Math.max(0, rowWidth - prefix.length)),
    };
  }

  const label = `${row.role}: `;
  const previewWidth = Math.max(0, rowWidth - prefix.length - label.length);
  const preview = truncateToWidth(row.preview, previewWidth);
  const body = preview ? `${label}${preview}` : label.trimEnd();
  return {
    prefix,
    body: truncateToWidth(body, Math.max(0, rowWidth - prefix.length)),
  };
}

function formatSessionCollapseMarker(row: Extract<TreeRow, { kind: "session" }>): string {
  if (!row.isCollapsible) return " ";
  return row.isCollapsed ? "▶" : "▼";
}

function formatSessionSuffix(row: Extract<TreeRow, { kind: "session" }>, current: boolean): string {
  const suffixes: string[] = [];
  if (row.isDeleted) suffixes.push(DELETED_SESSION_SUFFIX);
  if (current) suffixes.push(CURRENT_SESSION_SUFFIX);
  return suffixes.join("");
}

function formatRowPrefix(depth: number, selected: boolean, current: boolean): string {
  const indent = INDENT_UNIT.repeat(Math.max(0, depth));
  const selectedMarker = selected ? "›" : " ";
  const currentMarker = current && !selected ? GUIDE_MARKER : " ";
  return `${selectedMarker}${currentMarker} ${indent}`;
}

function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return "";
  if (text.length <= width) return text;
  if (width === 1) return "…";
  return `${text.slice(0, width - 1)}…`;
}
