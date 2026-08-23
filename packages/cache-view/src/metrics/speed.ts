import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { AssistantMessage, Event, Part } from "@opencode-ai/sdk/v2"
import { estimateTokenUnits } from "../token-estimator"
import { partsFor } from "./helpers"
import type { PartsByMessage, SpeedMetrics } from "./types"

const STREAM_WINDOW = 5_000
const MIN_STREAM_DURATION = 1_000

type EventOf<Type extends Event["type"]> = Extract<Event, { type: Type }>

type StepStart = {
  sessionID: string
  time: number
  firstTokenTime?: number
  lastTokenTime?: number
}

type StreamPart = {
  messageID: string
  units: number
}

type StreamSample = {
  time: number
  tokens: number
}

export type SpeedTracker = {
  get(sessionID: string): SpeedMetrics
  dispose(): void
}

export function createSpeedTracker(api: TuiPluginApi): SpeedTracker {
  const starts = new Map<string, StepStart>()
  const latest = new Map<string, number>()
  const trends = new Map<string, number[]>()
  const pendingToolTurns = new Set<string>()
  const streamParts = new Map<string, StreamPart>()
  const streamSamples = new Map<string, StreamSample[]>()

  const clearStream = (messageID: string) => {
    streamSamples.delete(messageID)
    for (const [partID, stream] of streamParts) {
      if (stream.messageID === messageID) streamParts.delete(partID)
    }
  }

  const streamingSpeed = (messageID: string, now: number): number | undefined => {
    const samples = (streamSamples.get(messageID) ?? [])
      .filter((sample) => sample.time >= now - STREAM_WINDOW)
    if (samples.length === 0) return undefined
    const tokens = samples.reduce((sum, sample) => sum + sample.tokens, 0)
    const duration = Math.max(MIN_STREAM_DURATION, samples.at(-1)!.time - samples[0].time)
    return (tokens / duration) * 1_000
  }

  const part = api.event.on("message.part.updated", (event: EventOf<"message.part.updated">) => {
    const value = event.properties.part
    if (value.type === "step-start") {
      if (!starts.has(value.messageID)) {
        starts.set(value.messageID, {
          sessionID: event.properties.sessionID,
          time: event.properties.time,
        })
      }
      return
    }
    if (value.type !== "step-finish") return

    const start = starts.get(value.messageID)
    starts.delete(value.messageID)
    if (!start || start.sessionID !== event.properties.sessionID) return
    clearStream(value.messageID)
    const duration = start.firstTokenTime === undefined || start.lastTokenTime === undefined
      ? 0
      : start.lastTokenTime - start.firstTokenTime
    const tokens = value.tokens.output + value.tokens.reasoning
    if (value.reason === "tool-calls") {
      pendingToolTurns.add(start.sessionID)
      return
    }
    pendingToolTurns.delete(start.sessionID)
    if (duration <= 0 || tokens <= 0) return
    const speed = (tokens / duration) * 1_000
    latest.set(start.sessionID, speed)
    trends.set(start.sessionID, [...(trends.get(start.sessionID) ?? []), speed].slice(-8))
  })

  const delta = api.event.on("message.part.delta", (event: EventOf<"message.part.delta">) => {
    if (event.properties.field !== "text") return
    const start = starts.get(event.properties.messageID)
    if (!start) return
    const now = Date.now()
    start.firstTokenTime ??= now
    start.lastTokenTime = now
    const previous = streamParts.get(event.properties.partID) ?? {
      messageID: event.properties.messageID,
      units: 0,
    }
    const previousTokens = Math.ceil(previous.units / 4)
    const units = previous.units + estimateTokenUnits(event.properties.delta)
    const tokens = Math.ceil(units / 4) - previousTokens
    streamParts.set(event.properties.partID, { messageID: event.properties.messageID, units })
    if (tokens <= 0) return

    const samples = streamSamples.get(event.properties.messageID) ?? []
    streamSamples.set(
      event.properties.messageID,
      [...samples, { time: now, tokens }].filter((sample) => sample.time >= now - STREAM_WINDOW),
    )
  })

  const message = api.event.on("message.updated", (event: EventOf<"message.updated">) => {
    if (event.properties.info.role !== "assistant") return
    if (event.properties.info.time.completed === undefined && event.properties.info.error === undefined) return
    starts.delete(event.properties.info.id)
    clearStream(event.properties.info.id)
    if (event.properties.info.error !== undefined) pendingToolTurns.delete(event.properties.sessionID)
  })

  const messageRemoved = api.event.on("message.removed", (event: EventOf<"message.removed">) => {
    starts.delete(event.properties.messageID)
    clearStream(event.properties.messageID)
  })

  const sessionDeleted = api.event.on("session.deleted", (event: EventOf<"session.deleted">) => {
    latest.delete(event.properties.sessionID)
    trends.delete(event.properties.sessionID)
    pendingToolTurns.delete(event.properties.sessionID)
    for (const [messageID, start] of starts) {
      if (start.sessionID === event.properties.sessionID) {
        starts.delete(messageID)
        clearStream(messageID)
      }
    }
  })

  return {
    get(sessionID) {
      let activeMessageID: string | undefined
      let activeTime = Number.NEGATIVE_INFINITY
      for (const [messageID, start] of starts) {
        if (start.sessionID === sessionID && start.time > activeTime) {
          activeMessageID = messageID
          activeTime = start.time
        }
      }
      const active = activeMessageID !== undefined
      const live = activeMessageID === undefined ? undefined : streamingSpeed(activeMessageID, Date.now())
      const fallback = latest.get(sessionID)
      const provisional = active || pendingToolTurns.has(sessionID)
      return {
        active,
        value: active ? live ?? fallback : fallback,
        estimated: provisional && (live !== undefined || fallback !== undefined),
        trend: trends.get(sessionID) ?? [],
      }
    },
    dispose() {
      part()
      delta()
      message()
      messageRemoved()
      sessionDeleted()
      starts.clear()
      latest.clear()
      trends.clear()
      pendingToolTurns.clear()
      streamParts.clear()
      streamSamples.clear()
    },
  }
}

type ObservablePart = Extract<Part, { type: "text" | "reasoning" }>

function isObservablePart(part: Part): part is ObservablePart {
  if (part.type === "reasoning") return part.text.length > 0
  return part.type === "text" && !part.synthetic && !part.ignored && part.text.length > 0
}

export function timeToFirstToken(
  parts: PartsByMessage,
  message: AssistantMessage | undefined,
): number | undefined {
  if (!message) return undefined
  let first = Number.POSITIVE_INFINITY
  for (const part of partsFor(parts, message.id)) {
    if (!isObservablePart(part)) continue
    const start = part.time?.start
    if (typeof start === "number" && start < first) first = start
  }
  if (!Number.isFinite(first) || first < message.time.created) return undefined
  return first - message.time.created
}
