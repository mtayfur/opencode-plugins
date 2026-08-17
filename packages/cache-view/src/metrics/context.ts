import type { Message, Session, ToolPart } from "@opencode-ai/sdk/v2"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { TokenEstimator } from "../token-estimator"
import { partsFor, serializedInput } from "./helpers"
import type { LoadedSkill, PartsByMessage, TokenEstimate } from "./types"

export function estimateSessionTokens(
  messages: readonly Message[],
  parts: PartsByMessage,
  activeStart: number,
  session: Session | undefined,
  config: TuiPluginApi["state"]["config"],
  estimator: TokenEstimator,
): TokenEstimate {
  const agentConfig = config as unknown as {
    default_agent?: string
    agent?: Record<string, { prompt?: string }>
  }
  const agentName = session?.agent ?? agentConfig.default_agent
  const agentPrompt = agentName ? agentConfig.agent?.[agentName]?.prompt ?? "" : ""
  const result: TokenEstimate = {
    system: estimator.count(`agent:${agentName ?? "default"}:prompt`, agentPrompt),
    user: 0,
    agent: 0,
    toolCall: 0,
    toolResult: 0,
    output: 0,
    reasoning: 0,
    total: 0,
  }

  for (let index = activeStart; index < messages.length; index++) {
    const message = messages[index]
    if (message.role === "user") {
      result.system += estimator.count(`message:${message.id}:system`, message.system ?? "")
    }

    for (const part of partsFor(parts, message.id)) {
      if (message.role === "user" && part.type === "text" && !part.ignored) {
        result.user += estimator.count(`part:${part.id}:text`, part.text)
      } else if (message.role === "user" && part.type === "compaction") {
        result.user += estimator.count(`part:${part.id}:compaction`, "What did we do so far?")
      } else if (message.role === "assistant" && part.type === "text") {
        result.output += estimator.count(`part:${part.id}:text`, part.text)
      } else if (message.role === "assistant" && part.type === "reasoning") {
        result.reasoning += estimator.count(`part:${part.id}:text`, part.text)
      } else if (message.role === "assistant" && part.type === "tool") {
        const input = estimator.count(`part:${part.id}:input`, serializedInput(part))
        if (part.tool === "task") result.agent += input
        else result.toolCall += input

        if (part.state.status === "completed") {
          const output = part.state.time.compacted
            ? "[Old tool result content cleared]"
            : part.state.output
          result.toolResult += estimator.count(`part:${part.id}:output`, output)
        } else if (part.state.status === "error") {
          result.toolResult += estimator.count(`part:${part.id}:error`, part.state.error)
        }
      } else if (part.type === "subtask") {
        result.agent += estimator.count(
          `part:${part.id}:subtask`,
          part.prompt || part.description,
        )
      } else if (part.type === "agent") {
        result.agent += estimator.count(`part:${part.id}:agent`, part.source?.value ?? "")
      }
    }
  }

  result.total =
    result.system +
    result.user +
    result.agent +
    result.toolCall +
    result.toolResult +
    result.output +
    result.reasoning
  return result
}

export function activeContextStart(messages: readonly Message[], parts: PartsByMessage): number {
  const messageIndex = new Map(messages.map((message, index) => [message.id, index]))

  for (let index = messages.length - 1; index >= 0; index--) {
    const summary = messages[index]
    if (
      summary.role !== "assistant" ||
      !summary.summary ||
      !summary.finish ||
      summary.error !== undefined
    ) {
      continue
    }
    const compactionIndex = messageIndex.get(summary.parentID)
    if (compactionIndex === undefined) continue
    const compaction = partsFor(parts, summary.parentID).find(
      (part) => part.type === "compaction",
    )
    if (!compaction) continue
    const tailIndex = compaction.tail_start_id
      ? messageIndex.get(compaction.tail_start_id)
      : undefined
    return tailIndex !== undefined && tailIndex < compactionIndex
      ? tailIndex
      : compactionIndex
  }
  return 0
}

function skillName(part: ToolPart): string | undefined {
  const metadataName = "metadata" in part.state ? part.state.metadata?.name : undefined
  if (typeof metadataName === "string" && metadataName) return metadataName

  const output = part.state.status === "completed" ? part.state.output : undefined
  const outputMatch = output?.match(/^#{1,2}\s*Skill:\s*(.+)$/m)
  if (outputMatch?.[1]) return outputMatch[1].trim()

  const input = part.state.input
  if (typeof input === "object" && input !== null && "name" in input) {
    const inputName = (input as { name?: unknown }).name
    if (typeof inputName === "string" && inputName) return inputName
  }
  return undefined
}

export function loadedSkills(
  messages: readonly Message[],
  parts: PartsByMessage,
  activeStart: number,
  estimator: TokenEstimator,
): LoadedSkill[] {
  const skills = new Map<string, LoadedSkill>()

  for (let index = activeStart; index < messages.length; index++) {
    const message = messages[index]
    if (message.role !== "assistant") continue

    for (const part of partsFor(parts, message.id)) {
      if (part.type !== "tool" || part.tool !== "skill" || part.state.status !== "completed") {
        continue
      }
      if (part.state.time.compacted) continue
      const name = skillName(part)
      if (!name) continue
      const tokens = estimator.count(`part:${part.id}:output`, part.state.output)
      skills.set(name, { name, tokens })
    }
  }

  return [...skills.values()]
}
