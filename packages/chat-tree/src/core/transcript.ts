import type { Message, Part, ToolPart } from "@opencode-ai/sdk/v2";

const MAX_TOOL_ARGUMENT_LENGTH = 1000;
const TOOL_ARGUMENTS = {
  bash: ["command", "workdir"],
  read: ["filePath", "offset", "limit"],
  grep: ["pattern", "path", "include"],
  glob: ["pattern", "path"],
  edit: ["filePath", "replaceAll"],
  write: ["filePath"],
  task: ["description", "subagent_type"],
  webfetch: ["url"],
} as const;

export type ConversationEntry = {
  readonly id: string;
  readonly metadata: Message;
  readonly parts: readonly Part[];
};

export type SessionTranscript = {
  readonly sessionId: string;
  readonly status: "available" | "deleted";
  readonly messages: readonly ConversationEntry[];
  readonly byId: ReadonlyMap<string, ConversationEntry>;
  readonly indexById: ReadonlyMap<string, number>;
};

export type TranscriptMap = Readonly<Record<string, SessionTranscript>>;

export function createSessionTranscript(input: {
  readonly sessionId: string;
  readonly status: SessionTranscript["status"];
  readonly messages: readonly ConversationEntry[];
}): SessionTranscript {
  const messages = [...input.messages];
  const byId = new Map<string, ConversationEntry>();
  const indexById = new Map<string, number>();

  for (const [index, message] of messages.entries()) {
    byId.set(message.id, message);
    indexById.set(message.id, index);
  }

  return {
    sessionId: input.sessionId,
    status: input.status,
    messages,
    byId,
    indexById,
  };
}

export function getVisibleText(parts: readonly Part[]): string | undefined {
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .filter((part) => !part.synthetic && !part.ignored)
    .map((part) => part.text)
    .join("");

  return text.trim().length > 0 ? text : undefined;
}

export function getMessagePreview(input: Pick<ConversationEntry, "parts">): string {
  let firstVisibleText: string | undefined;
  const fallbackTypes: string[] = [];
  const seenFallbackTypes = new Set<string>();

  for (const part of input.parts) {
    if (part.type === "text" && !part.synthetic && !part.ignored) {
      firstVisibleText ??= part.text;
    }

    if (
      part.type === "tool" ||
      part.type === "reasoning" ||
      part.type === "patch" ||
      part.type === "step-start" ||
      part.type === "step-finish"
    ) {
      continue;
    }

    if (seenFallbackTypes.has(part.type)) continue;
    seenFallbackTypes.add(part.type);
    fallbackTypes.push(part.type);
  }

  if (firstVisibleText !== undefined) {
    const normalized = firstVisibleText.replace(/\s+/g, " ").trim();
    return normalized || "(empty text)";
  }

  if (fallbackTypes.length > 0) {
    return `[${fallbackTypes.join(", ")}]`;
  }

  return "(no content)";
}

export function isInternalAssistantMessage(message: ConversationEntry): boolean {
  if (message.metadata.role !== "assistant") return false;

  let hasInternalPart = false;

  for (const part of message.parts) {
    if (part.type === "tool" || part.type === "reasoning" || part.type === "patch") {
      hasInternalPart = true;
      continue;
    }

    if (part.type === "step-start" || part.type === "step-finish") continue;
    if (part.type === "text" && (part.synthetic || part.ignored || part.text.trim().length === 0)) {
      continue;
    }

    return false;
  }

  return hasInternalPart;
}

export function serializeTranscriptForSummary(messages: readonly ConversationEntry[]): string {
  return messages
    .map(serializeMessageForSummary)
    .filter((blocks) => blocks.length > 0)
    .map((blocks) => blocks.join("\n"))
    .join("\n\n");
}

function serializeMessageForSummary(message: ConversationEntry): readonly string[] {
  const blocks: string[] = [];
  const role = message.metadata.role === "user" ? "User" : "Assistant";

  for (const part of message.parts) {
    const text = getVisibleText([part]);
    if (text) {
      blocks.push(`[${role}]: ${text}`);
      continue;
    }

    if (role === "Assistant" && part.type === "tool") {
      const tool = formatToolCall(part);
      if (tool) blocks.push(`[Tool]: ${tool}`);
    }
  }

  return blocks;
}

function formatToolCall(part: ToolPart): string | undefined {
  const tool = part.tool.startsWith("functions.")
    ? part.tool.slice("functions.".length)
    : part.tool;
  const args =
    tool === "apply_patch"
      ? summarizePatchArguments(part.state.input)
      : isKnownTool(tool)
        ? summarizeKnownArguments(part.state.input, TOOL_ARGUMENTS[tool])
        : undefined;

  if (!args) return undefined;

  const call = `${tool}(${args.join(", ")})`;
  if (part.state.status === "error") return `${call} -> error: ${part.state.error}`;
  return `${call} -> ${part.state.status === "completed" ? "success" : part.state.status}`;
}

function isKnownTool(tool: string): tool is keyof typeof TOOL_ARGUMENTS {
  return Object.hasOwn(TOOL_ARGUMENTS, tool);
}

function summarizeKnownArguments(
  input: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): readonly string[] {
  return keys.flatMap((key) => {
    const value = formatToolArgument(input[key]);
    return value === undefined ? [] : [`${key}=${value}`];
  });
}

function summarizePatchArguments(input: Readonly<Record<string, unknown>>): readonly string[] {
  const paths = extractPatchPaths(input.patchText);
  return paths.length > 0 ? [`paths=${JSON.stringify(paths)}`] : [];
}

function formatToolArgument(value: unknown): string | undefined {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value !== "string") return undefined;

  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) return undefined;
  const truncated =
    compact.length > MAX_TOOL_ARGUMENT_LENGTH
      ? `${compact.slice(0, MAX_TOOL_ARGUMENT_LENGTH)}…`
      : compact;
  return JSON.stringify(truncated);
}

function extractPatchPaths(value: unknown): readonly string[] {
  if (typeof value !== "string") return [];

  const paths = Array.from(
    value.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File:|Move to:) (.+)$/gm),
    (match) => match[1],
  ).filter((path): path is string => path !== undefined);

  return [...new Set(paths)];
}
