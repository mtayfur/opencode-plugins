import type { Part } from "@opencode-ai/sdk/v2"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { TokenEstimator } from "../token-estimator"
import { cacheMetrics, usageSamples } from "./cache"
import { activeContextStart, estimateSessionTokens, loadedSkills } from "./context"
import { assistantMessages } from "./helpers"
import { timeToFirstToken } from "./speed"
import type { Metrics, SpeedMetrics, TokenEstimate } from "./types"

function emptyTokenEstimate(): TokenEstimate {
  return {
    system: 0,
    user: 0,
    agent: 0,
    toolCall: 0,
    toolResult: 0,
    output: 0,
    reasoning: 0,
    total: 0,
  }
}

export function readMetrics(
  api: TuiPluginApi,
  sessionID: string,
  estimator: TokenEstimator,
  speed: SpeedMetrics,
): Metrics {
  if (!sessionID) {
    return {
      cache: { read: 0, miss: 0 },
      tokens: emptyTokenEstimate(),
      skills: [],
      speed,
    }
  }

  const messages = api.state.session.messages(sessionID)
  const parts = new Map<string, readonly Part[]>()
  for (const message of messages) parts.set(message.id, api.state.part(message.id))
  const allAssistants = assistantMessages(messages, true)
  const assistants = assistantMessages(messages, false)
  const allUsage = usageSamples(allAssistants, parts)
  const normalUsage = usageSamples(assistants, parts)
  const activeStart = activeContextStart(messages, parts)
  const session = api.state.session.get(sessionID)
  return {
    cache: cacheMetrics(session?.tokens, normalUsage, allUsage),
    tokens: estimateSessionTokens(
      messages,
      parts,
      activeStart,
      session,
      api.state.config,
      estimator,
    ),
    skills: loadedSkills(messages, parts, activeStart, estimator),
    speed: { ...speed, ttft: timeToFirstToken(parts, assistants.at(-1)) },
  }
}
