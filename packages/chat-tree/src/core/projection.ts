import type { TreeSnapshot } from "./tree";
import {
  getMessagePreview,
  isInternalAssistantMessage,
  type SessionTranscript,
  type TranscriptMap,
  type ConversationEntry,
} from "./transcript";

export type ProjectedMessage = {
  readonly kind: "message";
  readonly sessionId: string;
  readonly messageId: string;
  readonly entry: ConversationEntry;
  readonly childSessions: readonly ProjectedSession[];
};

export type ProjectedSession = {
  readonly kind: "session";
  readonly sessionId: string;
  readonly status: SessionTranscript["status"];
  readonly childSessions: readonly ProjectedSession[];
  readonly messages: readonly ProjectedMessage[];
};

export function projectConversationTree(
  snapshot: TreeSnapshot,
  transcripts: TranscriptMap,
): ProjectedSession {
  return projectSession(snapshot, transcripts, snapshot.rootSessionId);
}

function projectSession(
  snapshot: TreeSnapshot,
  transcripts: TranscriptMap,
  sessionId: string,
): ProjectedSession {
  const node = snapshot.sessions[sessionId];
  if (!node) throw new Error(`Missing snapshot session ${sessionId}`);

  const transcript = transcripts[sessionId];
  if (!transcript) throw new Error(`Missing transcript for session ${sessionId}`);

  if (transcript.status === "deleted") {
    return {
      kind: "session",
      sessionId,
      status: "deleted",
      childSessions: node.children.map((childId) => projectSession(snapshot, transcripts, childId)),
      messages: [],
    };
  }

  const hiddenPrefixCount = getHiddenPrefixCount(transcripts, node);
  const groupedChildren = groupChildrenByAnchor(snapshot, transcript, node.children);
  const messages = transcript.messages.slice(hiddenPrefixCount).map((message) => {
    const childIds = groupedChildren.byAnchor.get(message.id) ?? [];

    return {
      kind: "message",
      sessionId,
      messageId: message.id,
      entry: message,
      childSessions: childIds.map((childId) => projectSession(snapshot, transcripts, childId)),
    } satisfies ProjectedMessage;
  });

  return {
    kind: "session",
    sessionId,
    status: "available",
    childSessions: groupedChildren.detached.map((childId) =>
      projectSession(snapshot, transcripts, childId),
    ),
    messages,
  };
}

function getHiddenPrefixCount(
  transcripts: TranscriptMap,
  node: TreeSnapshot["sessions"][string],
): number {
  if (!node.parentSessionId || !node.anchorMessageId) return 0;

  const parentTranscript = transcripts[node.parentSessionId];
  if (!parentTranscript) {
    throw new Error(`Missing transcript for parent session ${node.parentSessionId}`);
  }

  if (parentTranscript.status === "deleted") return 0;

  const parentAnchorIndex = parentTranscript.indexById.get(node.anchorMessageId);
  const childTranscript = transcripts[node.sessionId];
  const anchorTranscript = parentAnchorIndex === undefined ? childTranscript : parentTranscript;
  const anchorIndex = parentAnchorIndex ?? childTranscript?.indexById.get(node.anchorMessageId);
  const anchor = anchorIndex === undefined ? undefined : anchorTranscript?.messages[anchorIndex];

  if (anchorIndex === undefined || !anchor) return 0;

  return anchor.metadata.role === "assistant" ? anchorIndex + 1 : anchorIndex;
}

function groupChildrenByAnchor(
  snapshot: TreeSnapshot,
  transcript: SessionTranscript,
  childIds: readonly string[],
): {
  readonly byAnchor: ReadonlyMap<string, readonly string[]>;
  readonly detached: readonly string[];
} {
  const childrenByAnchor = new Map<string, string[]>();
  const detached: string[] = [];

  for (const childId of childIds) {
    const child = snapshot.sessions[childId];
    if (!child) throw new Error(`Missing snapshot child session ${childId}`);

    if (!child.anchorMessageId) {
      throw new Error(`Missing anchorMessageId for child session ${childId}`);
    }

    if (!transcript.byId.has(child.anchorMessageId)) {
      detached.push(childId);
      continue;
    }

    const children = childrenByAnchor.get(child.anchorMessageId);
    if (children) {
      children.push(childId);
    } else {
      childrenByAnchor.set(child.anchorMessageId, [childId]);
    }
  }

  return {
    byAnchor: childrenByAnchor,
    detached,
  };
}

export type SessionRowId = `session:${string}`;
export type MessageRowId = `message:${string}:${string}`;
export type DayRowId = `day:${string}:${string}:${string}`;
export type TreeRowId = SessionRowId | MessageRowId | DayRowId;

export function getSessionRowId(sessionId: string): SessionRowId {
  return `session:${sessionId}`;
}

export function getMessageRowId(sessionId: string, messageId: string): MessageRowId {
  return `message:${sessionId}:${messageId}`;
}

export function getDayRowId(day: string, sessionId: string, messageId: string): DayRowId {
  return `day:${day}:${sessionId}:${messageId}`;
}

type SessionRow = {
  readonly kind: "session";
  readonly id: SessionRowId;
  readonly depth: number;
  readonly sessionId: string;
  readonly title: string;
  readonly isDeleted: boolean;
  readonly isCollapsible: boolean;
  readonly isCollapsed: boolean;
};

type DayRow = {
  readonly kind: "day";
  readonly id: DayRowId;
  readonly depth: number;
  readonly sessionId: string;
  readonly day: string;
  readonly isCollapsible: true;
  readonly isCollapsed: boolean;
};

type MessageRow = {
  readonly kind: "message";
  readonly id: MessageRowId;
  readonly depth: number;
  readonly sessionId: string;
  readonly messageId: string;
  readonly role: ConversationEntry["metadata"]["role"];
  readonly createdAt?: number;
  readonly preview: string;
};

export type TreeRow = SessionRow | DayRow | MessageRow;

export type TreePresentation = {
  readonly rows: readonly TreeRow[];
  readonly rowIndexById: Readonly<Record<TreeRowId, number>>;
  readonly lastRowIndexBySessionId: Readonly<Record<string, number>>;
  readonly parentRowIdById: ReadonlyMap<TreeRowId, TreeRowId | undefined>;
  readonly sessionById: Readonly<Record<string, ProjectedSession>>;
};

type PresentationOptions = {
  readonly collapsedSessionIds?: ReadonlySet<string>;
  readonly collapsedDays?: ReadonlySet<string>;
};

export function buildTreePresentation(
  root: ProjectedSession,
  options: PresentationOptions = {},
): TreePresentation {
  const state: PresentationState = {
    rows: [],
    rowIndexById: {},
    lastRowIndexBySessionId: {},
    parentRowIdById: new Map(),
    sessionById: {},
    previousMessageDay: undefined,
  };

  visitSession(root, undefined, 0, true, state, options);

  return {
    rows: state.rows,
    rowIndexById: state.rowIndexById,
    lastRowIndexBySessionId: state.lastRowIndexBySessionId,
    parentRowIdById: state.parentRowIdById,
    sessionById: state.sessionById,
  };
}

export function resolveVisibleRowId(input: {
  readonly presentation: TreePresentation;
  readonly currentSessionId?: string;
  readonly preferredRowId?: TreeRowId;
}): TreeRowId | undefined {
  if (input.preferredRowId) {
    let rowId: TreeRowId | undefined = input.preferredRowId;

    while (rowId) {
      if (input.presentation.rowIndexById[rowId] !== undefined) return rowId;
      rowId = input.presentation.parentRowIdById.get(rowId);
    }
  }

  const fallbackIndex = input.currentSessionId
    ? (input.presentation.lastRowIndexBySessionId[input.currentSessionId] ?? 0)
    : 0;

  return input.presentation.rows[fallbackIndex]?.id;
}

export function moveRowSelection(
  rows: readonly TreeRow[],
  currentIndex: number | undefined,
  direction: -1 | 1,
): number | undefined {
  if (rows.length === 0) return undefined;
  if (currentIndex === undefined) return direction < 0 ? rows.length - 1 : 0;

  return Math.min(rows.length - 1, Math.max(0, currentIndex + direction));
}

export function formatLocalDay(createdAt: number): string | undefined {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return undefined;

  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

type PresentationState = {
  readonly rows: TreeRow[];
  readonly rowIndexById: Record<TreeRowId, number>;
  readonly lastRowIndexBySessionId: Record<string, number>;
  readonly parentRowIdById: Map<TreeRowId, TreeRowId | undefined>;
  readonly sessionById: Record<string, ProjectedSession>;
  previousMessageDay: string | undefined;
};

function visitSession(
  session: ProjectedSession,
  parentRowId: TreeRowId | undefined,
  depth: number,
  includeRows: boolean,
  state: PresentationState,
  options: PresentationOptions,
): void {
  const sessionRowId = getSessionRowId(session.sessionId);
  state.parentRowIdById.set(sessionRowId, parentRowId);
  state.sessionById[session.sessionId] = session;

  const isCollapsible = session.childSessions.length > 0 || session.messages.length > 0;
  const isCollapsed =
    includeRows && isCollapsible && (options.collapsedSessionIds?.has(session.sessionId) ?? false);

  if (includeRows) {
    appendRow(state, {
      kind: "session",
      id: sessionRowId,
      depth,
      sessionId: session.sessionId,
      title: session.sessionId,
      isDeleted: session.status === "deleted",
      isCollapsible,
      isCollapsed,
    });
  }

  const includeChildRows = includeRows && !isCollapsed;

  for (const child of session.childSessions) {
    visitSession(child, sessionRowId, depth + 1, includeChildRows, state, options);
  }

  for (const message of session.messages) {
    visitMessage(message, sessionRowId, depth, includeChildRows, state, options);
  }
}

function visitMessage(
  message: ProjectedMessage,
  parentRowId: SessionRowId,
  sessionDepth: number,
  includeRows: boolean,
  state: PresentationState,
  options: PresentationOptions,
): void {
  const messageRowId = getMessageRowId(message.sessionId, message.messageId);
  state.parentRowIdById.set(messageRowId, parentRowId);

  if (!includeRows) {
    for (const child of message.childSessions) {
      visitSession(child, messageRowId, sessionDepth + 1, false, state, options);
    }
    return;
  }

  if (isInternalAssistantMessage(message.entry)) {
    for (const child of message.childSessions) {
      visitSession(child, messageRowId, sessionDepth + 1, true, state, options);
    }
    return;
  }

  const createdAt = message.entry.metadata.time.created;
  const day = formatLocalDay(createdAt);
  const dayIsCollapsed = day !== undefined && (options.collapsedDays?.has(day) ?? false);

  if (day && day !== state.previousMessageDay) {
    appendRow(state, {
      kind: "day",
      id: getDayRowId(day, message.sessionId, message.messageId),
      depth: 0,
      sessionId: message.sessionId,
      day,
      isCollapsible: true,
      isCollapsed: dayIsCollapsed,
    });
  }
  if (day) state.previousMessageDay = day;

  if (!dayIsCollapsed) {
    appendRow(state, {
      kind: "message",
      id: messageRowId,
      depth: sessionDepth + 1,
      sessionId: message.sessionId,
      messageId: message.messageId,
      role: message.entry.metadata.role,
      createdAt,
      preview: getMessagePreview(message.entry),
    });
  }

  for (const child of message.childSessions) {
    visitSession(
      child,
      messageRowId,
      sessionDepth + (dayIsCollapsed ? 1 : 2),
      true,
      state,
      options,
    );
  }
}

function appendRow(state: PresentationState, row: TreeRow): void {
  state.rows.push(row);
  state.rowIndexById[row.id] = state.rows.length - 1;
  state.lastRowIndexBySessionId[row.sessionId] = state.rows.length - 1;
}
