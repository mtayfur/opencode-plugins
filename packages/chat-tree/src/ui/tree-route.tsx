/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import { useTerminalDimensions } from "@opentui/solid";
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  on,
  onCleanup,
  Show,
} from "solid-js";
import { OpenCodeTreeGateway, type SummaryModel } from "../adapters/opencode-gateway";
import { TreeRepository } from "../adapters/tree-repository";
import { planBranchIntent } from "../core/branching";
import {
  buildTreePresentation,
  formatLocalDay,
  getMessageRowId,
  getSessionRowId,
  moveRowSelection,
  projectConversationTree,
  resolveVisibleRowId,
  type TreePresentation,
  type TreeRow,
  type TreeRowId,
} from "../core/projection";
import { createBranchWorkflow } from "./branch-workflow";
import { TREE_BINDINGS, TREE_COMMANDS } from "./controls";
import { createTreePalette, type TreePalette } from "./theme";
import { TreeView } from "./tree-view";

export type TreeRouteProps = {
  readonly api: TuiPluginApi;
  readonly projectRoot?: string;
  readonly storageRoot?: string;
  readonly sessionId?: string;
  readonly summaryModel?: SummaryModel;
  readonly summaryVariant?: string;
  readonly navigateToSession: (sessionId: string) => void | Promise<void>;
};

type RouteStatus = {
  readonly tone: "notice" | "loading" | "error" | "empty";
  readonly message: string;
};

export function TreeRoute(props: TreeRouteProps) {
  const [selectedRowId, setSelectedRowId] = createSignal<TreeRowId | undefined>();
  const [collapsedSessionIds, setCollapsedSessionIds] = createSignal<ReadonlySet<string>>(
    new Set(),
  );
  const [collapsedDays, setCollapsedDays] = createSignal<ReadonlySet<string>>(new Set());
  const [focused, setFocused] = createSignal(false);
  const dimensions = useTerminalDimensions();

  const theme = createMemo(() => props.api.theme.current);
  const palette = createMemo(() => createTreePalette(theme()));
  const repository = createMemo(() =>
    props.storageRoot ? new TreeRepository(props.storageRoot) : undefined,
  );
  const contextRequest = createMemo(() => {
    const treeRepository = repository();
    if (!treeRepository || !props.projectRoot) return undefined;
    return {
      treeRepository,
      projectRoot: props.projectRoot,
      sessionId: props.sessionId,
    };
  });
  const [context] = createResource(contextRequest, (request) =>
    request.treeRepository.open(request.projectRoot, request.sessionId),
  );
  const gateway = createMemo(() => {
    const treeRepository = repository();
    if (!treeRepository || !props.projectRoot) return undefined;
    return new OpenCodeTreeGateway({
      client: props.api.client,
      projectRoot: props.projectRoot,
      repository: treeRepository,
    });
  });
  const transcriptRequest = createMemo(() => {
    const treeContext = context();
    const treeGateway = gateway();
    if (!treeGateway || treeContext?.kind !== "ready") return undefined;
    return {
      treeGateway,
      snapshot: treeContext.snapshot,
    };
  });
  const [transcripts] = createResource(transcriptRequest, (request) =>
    request.treeGateway.loadTranscripts(request.snapshot),
  );
  const projectedTree = createMemo(() => {
    const treeContext = context();
    const loadedTranscripts = transcripts();
    if (treeContext?.kind !== "ready" || !loadedTranscripts) return undefined;
    return projectConversationTree(treeContext.snapshot, loadedTranscripts);
  });
  const presentation = createMemo<TreePresentation | undefined>(() => {
    const root = projectedTree();
    if (!root) return undefined;
    return buildTreePresentation(root, {
      collapsedSessionIds: collapsedSessionIds(),
      collapsedDays: collapsedDays(),
    });
  });
  const rows = createMemo<readonly TreeRow[]>(() => presentation()?.rows ?? []);
  const selectedIndex = createMemo(() => {
    const rowId = selectedRowId();
    if (!rowId) return undefined;
    return presentation()?.rowIndexById[rowId];
  });
  const selectedRow = createMemo(() => {
    const index = selectedIndex();
    return index === undefined ? undefined : rows()[index];
  });
  const readySnapshot = createMemo(() => {
    const treeContext = context();
    return treeContext?.kind === "ready" ? treeContext.snapshot : undefined;
  });
  const workflow = createBranchWorkflow({
    api: props.api,
    gateway,
    snapshot: readySnapshot,
    transcripts,
    selectedRow,
    summaryModel: props.summaryModel,
    summaryVariant: props.summaryVariant,
    navigateToSession: props.navigateToSession,
  });
  onCleanup(workflow.dispose);
  const status = createMemo<RouteStatus | undefined>(() => {
    if (!props.projectRoot || !props.storageRoot) {
      return { tone: "notice", message: "Project root unavailable." };
    }
    if (context.loading) return { tone: "loading", message: "Opening conversation tree..." };
    if (context.error)
      return {
        tone: "error",
        message: `Storage error: ${errorMessage(context.error)}`,
      };
    if (context()?.kind === "missing-session") {
      return { tone: "notice", message: "Open /tree from an active session." };
    }
    if (transcriptRequest() && transcripts.loading) {
      return { tone: "loading", message: "Loading conversation history..." };
    }
    if (transcripts.error) {
      return { tone: "error", message: `Conversation error: ${errorMessage(transcripts.error)}` };
    }
    if (presentation() && rows().length === 0) {
      return { tone: "empty", message: "Conversation tree is empty." };
    }
    return undefined;
  });

  createEffect(
    on(presentation, (nextPresentation) => {
      if (!nextPresentation) {
        setSelectedRowId(undefined);
        return;
      }

      setSelectedRowId((preferredRowId) =>
        resolveVisibleRowId({
          presentation: nextPresentation,
          currentSessionId: props.sessionId,
          preferredRowId,
        }),
      );
    }),
  );

  createEffect(() => {
    const dispose = props.api.keymap.registerLayer({
      commands: [
        {
          name: TREE_COMMANDS.moveUp,
          hidden: true,
          enabled: canUseRows,
          run: () => moveSelection(-1),
        },
        {
          name: TREE_COMMANDS.moveDown,
          hidden: true,
          enabled: canUseRows,
          run: () => moveSelection(1),
        },
        {
          name: TREE_COMMANDS.collapse,
          hidden: true,
          enabled: canUseRows,
          run: collapseSelection,
        },
        {
          name: TREE_COMMANDS.expand,
          hidden: true,
          enabled: canUseRows,
          run: expandSelection,
        },
        {
          name: TREE_COMMANDS.select,
          hidden: true,
          enabled: canUseRows,
          run: selectRow,
        },
        {
          name: TREE_COMMANDS.back,
          hidden: true,
          enabled: () =>
            props.api.route.current.name === "tree" &&
            !props.api.ui.dialog.open &&
            !workflow.busy() &&
            Boolean(props.sessionId),
          run: leaveTree,
        },
      ],
      bindings: [...TREE_BINDINGS],
    });

    onCleanup(dispose);
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      paddingLeft={1}
      paddingRight={1}
      paddingBottom={1}
      backgroundColor={palette().screenBackground}
    >
      <HelpBar palette={palette()} busy={workflow.busy()} />

      <Show when={workflow.errorMessage()} keyed>
        {(message: string) => (
          <StatusPanel palette={palette()} tone="error" message={`Action error: ${message}`} />
        )}
      </Show>

      <Show
        when={status()}
        keyed
        fallback={
          <box
            flexDirection="column"
            flexGrow={1}
            minHeight={0}
            backgroundColor={palette().panelBackground}
          >
            <TreeView
              rows={rows()}
              currentSessionId={props.sessionId}
              selectedIndex={selectedIndex()}
              width={Math.max(1, dimensions().width - 2)}
              theme={theme}
              autoFocus
              onFocusChange={setFocused}
            />
          </box>
        }
      >
        {(currentStatus: RouteStatus) => (
          <StatusPanel
            palette={palette()}
            tone={currentStatus.tone}
            message={currentStatus.message}
          />
        )}
      </Show>
    </box>
  );

  function canUseRoute(): boolean {
    return focused() && !props.api.ui.dialog.open && !workflow.busy();
  }

  function canUseRows(): boolean {
    return canUseRoute() && rows().length > 0;
  }

  function moveSelection(direction: -1 | 1): void {
    const nextIndex = moveRowSelection(rows(), selectedIndex(), direction);
    const nextRow = nextIndex === undefined ? undefined : rows()[nextIndex];
    if (nextRow) setSelectedRowId(nextRow.id);
  }

  function collapseSelection(): void {
    const row = selectedRow();
    if (!row) return;

    if (row.kind === "day") {
      collapseDay(row.day, row.id);
      return;
    }

    if (row.kind === "message" && row.createdAt !== undefined) {
      const day = formatLocalDay(row.createdAt);
      if (day) {
        collapseDay(day, findSelectedDayRowId(day));
        return;
      }
    }

    const sessionRow = findSelectedSessionRow();
    if (!sessionRow?.isCollapsible || sessionRow.isCollapsed) return;
    setCollapsedSessionIds((current) => new Set(current).add(sessionRow.sessionId));
  }

  function expandSelection(): void {
    const row = selectedRow();
    if (row?.kind === "day") {
      if (!row.isCollapsed) return;
      setCollapsedDays((current) => withoutValue(current, row.day));
      return;
    }

    const sessionRow = findSelectedSessionRow();
    if (!sessionRow?.isCollapsible || !sessionRow.isCollapsed) return;
    const firstMessage = presentation()?.sessionById[sessionRow.sessionId]?.messages[0];
    setCollapsedSessionIds((current) => withoutValue(current, sessionRow.sessionId));
    setSelectedRowId(
      firstMessage
        ? getMessageRowId(sessionRow.sessionId, firstMessage.messageId)
        : getSessionRowId(sessionRow.sessionId),
    );
  }

  function selectRow(): void {
    const row = selectedRow();
    if (row?.kind === "day") {
      if (row.isCollapsed) expandSelection();
      else collapseSelection();
      return;
    }

    const loadedTranscripts = transcripts();
    if (!loadedTranscripts) return;
    const intent = planBranchIntent(row, loadedTranscripts);

    if (intent.kind === "notice") {
      props.api.ui.toast({ message: intent.message, variant: intent.variant });
    } else if (intent.kind === "navigate") {
      void props.navigateToSession(intent.sessionId);
    } else if (intent.kind === "fork") {
      workflow.open(intent.plan);
    }
  }

  function leaveTree(): void {
    if (props.sessionId && canUseRoute()) void props.navigateToSession(props.sessionId);
  }

  function findSelectedSessionRow(): Extract<TreeRow, { kind: "session" }> | undefined {
    const row = selectedRow();
    if (!row || row.kind === "day") return undefined;
    const index = presentation()?.rowIndexById[getSessionRowId(row.sessionId)];
    const sessionRow = index === undefined ? undefined : rows()[index];
    return sessionRow?.kind === "session" ? sessionRow : undefined;
  }

  function collapseDay(day: string, dayRowId?: TreeRowId): void {
    if (collapsedDays().has(day)) return;
    setCollapsedDays((current) => new Set(current).add(day));
    if (dayRowId) setSelectedRowId(dayRowId);
  }

  function findSelectedDayRowId(day: string): TreeRowId | undefined {
    const index = selectedIndex();
    if (index === undefined) return undefined;
    for (let candidateIndex = index; candidateIndex >= 0; candidateIndex -= 1) {
      const candidate = rows()[candidateIndex];
      if (candidate?.kind === "day") return candidate.day === day ? candidate.id : undefined;
    }
    return undefined;
  }
}

function HelpBar(props: { readonly palette: TreePalette; readonly busy: boolean }) {
  return (
    <box
      flexDirection="row"
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      paddingBottom={2}
      backgroundColor={props.palette.panelBackground}
    >
      <text fg={props.busy ? props.palette.branchingText : props.palette.helpText}>
        <span style={{ fg: props.palette.helpKey }}>↑/↓</span> move •{" "}
        <span style={{ fg: props.palette.helpKey }}>←/→</span> fold •{" "}
        <span style={{ fg: props.palette.helpKey }}>enter</span> branch •{" "}
        <span style={{ fg: props.palette.helpKey }}>esc</span> back
      </text>
    </box>
  );
}

function StatusPanel(props: {
  readonly palette: TreePalette;
  readonly tone: RouteStatus["tone"];
  readonly message: string;
}) {
  const foreground = () => {
    if (props.tone === "loading") return props.palette.loadingText;
    if (props.tone === "error") return props.palette.errorText;
    if (props.tone === "empty") return props.palette.emptyText;
    return props.palette.noticeText;
  };

  return (
    <box
      backgroundColor={props.palette.panelBackground}
      paddingLeft={1}
      paddingRight={1}
      paddingBottom={1}
    >
      <text fg={foreground()}>{props.message}</text>
    </box>
  );
}

function withoutValue<T>(values: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(values);
  next.delete(value);
  return next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
