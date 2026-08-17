import {
  getVisibleText,
  type SessionTranscript,
  type TranscriptMap,
  type ConversationEntry,
} from "./transcript";
import type { TreeRow } from "./projection";

export type BranchPlan = {
  readonly sessionId: string;
  readonly anchorMessageId: string;
  readonly forkMessageId: string;
  readonly appendPromptText?: string;
};

export type BranchIntent =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "notice";
      readonly message: string;
      readonly variant: "info" | "error";
    }
  | {
      readonly kind: "navigate";
      readonly sessionId: string;
    }
  | {
      readonly kind: "fork";
      readonly plan: BranchPlan;
    };

export function planBranchIntent(
  row: TreeRow | undefined,
  transcripts: TranscriptMap,
): BranchIntent {
  if (!row) {
    return {
      kind: "notice",
      message: "Select a message row first.",
      variant: "info",
    };
  }

  if (row.kind === "session") {
    return row.isDeleted ? { kind: "none" } : { kind: "navigate", sessionId: row.sessionId };
  }

  if (row.kind === "day") return { kind: "none" };

  const transcript = transcripts[row.sessionId];
  const message = transcript?.byId.get(row.messageId);
  if (!message) {
    return {
      kind: "notice",
      message: `Message ${row.messageId} is unavailable.`,
      variant: "error",
    };
  }

  if (row.role === "user") {
    if (
      message.parts.some(
        (part) => part.type === "file" || part.type === "agent" || part.type === "subtask",
      )
    ) {
      return {
        kind: "notice",
        message: "Messages with attachments or delegated prompt parts cannot be replayed safely.",
        variant: "error",
      };
    }

    return {
      kind: "fork",
      plan: {
        sessionId: row.sessionId,
        anchorMessageId: row.messageId,
        forkMessageId: row.messageId,
        appendPromptText: getVisibleText(message.parts),
      },
    };
  }

  const nextMessage = getNextMessage(transcript, row.messageId);
  if (!nextMessage) {
    return { kind: "navigate", sessionId: row.sessionId };
  }

  return {
    kind: "fork",
    plan: {
      sessionId: row.sessionId,
      anchorMessageId: row.messageId,
      forkMessageId: nextMessage.id,
    },
  };
}

export function collectSummaryMessages(
  row: TreeRow | undefined,
  transcripts: TranscriptMap,
): readonly ConversationEntry[] {
  if (!row) throw new Error("Select a message row first.");
  if (row.kind !== "message") throw new Error("Select a message row to summarize.");

  const transcript = transcripts[row.sessionId];
  if (!transcript || transcript.status === "deleted") {
    throw new Error(`Session ${row.sessionId} is unavailable.`);
  }

  const startIndex = transcript.indexById.get(row.messageId);
  if (startIndex === undefined) {
    throw new Error(`Message ${row.messageId} is unavailable.`);
  }

  return transcript.messages.slice(startIndex);
}

function getNextMessage(
  transcript: SessionTranscript | undefined,
  messageId: string,
): SessionTranscript["messages"][number] | undefined {
  if (!transcript) return undefined;

  const index = transcript.indexById.get(messageId);
  if (index === undefined) return undefined;
  return transcript.messages[index + 1];
}
