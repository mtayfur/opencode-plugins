import { randomUUID } from "node:crypto";

export const STORAGE_FORMAT_VERSION = 1 as const;

export type TreeNode = {
  readonly sessionId: string;
  readonly parentSessionId: string | null;
  readonly anchorMessageId: string | null;
  readonly children: readonly string[];
};

export type TreeSnapshot = {
  readonly version: typeof STORAGE_FORMAT_VERSION;
  readonly treeId: string;
  readonly rootSessionId: string;
  readonly sessions: Readonly<Record<string, TreeNode>>;
};

export function createTreeId(generateUuid: () => string = randomUUID): string {
  return `tree_${generateUuid().replaceAll("-", "")}`;
}

export function createRootSnapshot(treeId: string, sessionId: string): TreeSnapshot {
  return {
    version: STORAGE_FORMAT_VERSION,
    treeId,
    rootSessionId: sessionId,
    sessions: {
      [sessionId]: {
        sessionId,
        parentSessionId: null,
        anchorMessageId: null,
        children: [],
      },
    },
  };
}

export function attachBranch(
  snapshot: TreeSnapshot,
  input: {
    readonly sessionId: string;
    readonly parentSessionId: string;
    readonly anchorMessageId: string;
  },
): TreeSnapshot {
  const parent = snapshot.sessions[input.parentSessionId];
  if (!parent) {
    throw new Error(`Missing parent session ${input.parentSessionId}`);
  }

  const existing = snapshot.sessions[input.sessionId];
  if (existing) {
    const sameParent = existing.parentSessionId === input.parentSessionId;
    const sameAnchor = existing.anchorMessageId === input.anchorMessageId;

    if (sameParent && sameAnchor) {
      return snapshot;
    }

    throw new Error(
      `Session ${input.sessionId} is already attached to parent ${existing.parentSessionId ?? "<root>"} at anchor ${existing.anchorMessageId ?? "<root>"}`,
    );
  }

  return {
    ...snapshot,
    sessions: {
      ...snapshot.sessions,
      [input.parentSessionId]: {
        ...parent,
        children: [...parent.children, input.sessionId],
      },
      [input.sessionId]: {
        sessionId: input.sessionId,
        parentSessionId: input.parentSessionId,
        anchorMessageId: input.anchorMessageId,
        children: [],
      },
    },
  };
}
