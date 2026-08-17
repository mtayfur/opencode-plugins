import type { Part } from "@opencode-ai/sdk/v2"

export type CacheMetrics = {
  latestHit?: number
  trend?: number
  totalHit?: number
  read: number
  miss: number
}

export type TokenEstimate = {
  system: number
  user: number
  agent: number
  toolCall: number
  toolResult: number
  output: number
  reasoning: number
  total: number
}

export type SpeedMetrics = {
  active: boolean
  value?: number
  estimated: boolean
  ttft?: number
  trend: number[]
}

export type LoadedSkill = {
  name: string
  tokens: number
}

export type Metrics = {
  cache: CacheMetrics
  tokens: TokenEstimate
  skills: LoadedSkill[]
  speed: SpeedMetrics
}

export type PartsByMessage = ReadonlyMap<string, readonly Part[]>
