import type { AssistantMessage, Session } from "@opencode-ai/sdk/v2"
import { finite, partsFor } from "./helpers"
import type { CacheMetrics, PartsByMessage } from "./types"

type UsageSample = {
  tokens: AssistantMessage["tokens"]
}

export function usageSamples(
  assistants: AssistantMessage[],
  parts: PartsByMessage,
): UsageSample[] {
  const samples: UsageSample[] = []
  for (const message of assistants) {
    const finishes = partsFor(parts, message.id).filter((part) => part.type === "step-finish")
    if (finishes.length > 0) {
      for (const finish of finishes) samples.push({ tokens: finish.tokens })
      continue
    }

    const tokens = message.tokens
    const total =
      finite(tokens.input) +
      finite(tokens.output) +
      finite(tokens.reasoning) +
      finite(tokens.cache.read) +
      finite(tokens.cache.write)
    if (message.time.completed && total > 0) samples.push({ tokens })
  }
  return samples
}

function sumUsage(samples: UsageSample[]): AssistantMessage["tokens"] {
  const result: AssistantMessage["tokens"] = {
    input: 0,
    output: 0,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  }
  for (const sample of samples) {
    result.input += finite(sample.tokens.input)
    result.output += finite(sample.tokens.output)
    result.reasoning += finite(sample.tokens.reasoning)
    result.cache.read += finite(sample.tokens.cache.read)
    result.cache.write += finite(sample.tokens.cache.write)
  }
  return result
}

function promptTokens(tokens: AssistantMessage["tokens"]): number {
  return finite(tokens.input) + finite(tokens.cache.read) + finite(tokens.cache.write)
}

export function cacheMetrics(
  sessionTokens: Session["tokens"] | undefined,
  normalUsage: UsageSample[],
  allUsage: UsageSample[],
): CacheMetrics {
  const hitRates: number[] = []
  for (const sample of normalUsage) {
    const tokens = sample.tokens
    const read = finite(tokens.cache?.read)
    const prompt = promptTokens(tokens)
    if (prompt > 0) hitRates.push((read / prompt) * 100)
  }
  const latestHit = hitRates.at(-1)
  const previousHit = hitRates.at(-2)

  const aggregate = sessionTokens ?? sumUsage(allUsage)
  const input = finite(aggregate.input)
  const read = finite(aggregate.cache.read)
  const write = finite(aggregate.cache.write)
  const prompt = input + read + write
  return {
    latestHit,
    trend:
      latestHit !== undefined && previousHit !== undefined
        ? latestHit - previousHit
        : undefined,
    totalHit: prompt > 0 ? (read / prompt) * 100 : undefined,
    read,
    miss: input + write,
  }
}
