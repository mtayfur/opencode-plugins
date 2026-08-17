import type { AssistantMessage, Message, Part, ToolPart } from "@opencode-ai/sdk/v2"
import type { PartsByMessage } from "./types"

export function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function partsFor(parts: PartsByMessage, messageID: string): readonly Part[] {
  return parts.get(messageID) ?? []
}

export function assistantMessages(
  messages: readonly Message[],
  includeSummaries: boolean,
): AssistantMessage[] {
  return messages.filter(
    (message): message is AssistantMessage =>
      message.role === "assistant" && (includeSummaries || !message.summary),
  )
}

export function serializedInput(part: ToolPart): string {
  if (part.state.status === "pending" && part.state.raw) return part.state.raw
  try {
    return JSON.stringify(part.state.input)
  } catch {
    return ""
  }
}
