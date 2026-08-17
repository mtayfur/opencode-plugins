/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { Part } from "@opencode-ai/sdk/v2"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import { formatHitTrend, formatPercent, formatSpeed } from "./format"
import { cacheMetrics, usageSamples } from "./metrics/cache"
import { assistantMessages } from "./metrics/helpers"
import type { SpeedTracker } from "./metrics/speed"

export function CacheStatus(props: {
  api: TuiPluginApi
  sessionID: string
  speed: SpeedTracker
  theme: TuiThemeCurrent
}) {
  const [refresh, setRefresh] = createSignal(0)
  const metrics = createMemo(() => {
    void refresh()
    const messages = props.api.state.session.messages(props.sessionID)
    const parts = new Map<string, readonly Part[]>()
    for (const message of messages) parts.set(message.id, props.api.state.part(message.id))

    const assistants = assistantMessages(messages, false)
    const allUsage = usageSamples(assistantMessages(messages, true), parts)
    const normalUsage = usageSamples(assistants, parts)
    return {
      cache: cacheMetrics(
        props.api.state.session.get(props.sessionID)?.tokens,
        normalUsage,
        allUsage,
      ),
      speed: props.speed.get(props.sessionID),
    }
  })
  const trendColor = createMemo(() => {
    const trend = metrics().cache.trend
    if (trend === undefined || Math.abs(trend) < 0.05) return props.theme.textMuted
    return trend > 0 ? props.theme.success : props.theme.error
  })
  const speedValue = createMemo(() => {
    const speed = metrics().speed
    if (speed.active && speed.value === undefined) return "… tok/s"
    return formatSpeed(speed.value, speed.estimated)
  })

  onMount(() => {
    type ScopedEvent = { properties: { sessionID: string } }
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleRefresh = (event: ScopedEvent) => {
      if (event.properties.sessionID !== props.sessionID || refreshTimer !== undefined) return
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined
        setRefresh((value) => value + 1)
      }, 100)
    }

    const message = props.api.event.on("message.updated", scheduleRefresh)
    const messageRemoved = props.api.event.on("message.removed", scheduleRefresh)
    const part = props.api.event.on("message.part.updated", scheduleRefresh)
    const delta = props.api.event.on("message.part.delta", scheduleRefresh)
    const partRemoved = props.api.event.on("message.part.removed", scheduleRefresh)
    const session = props.api.event.on("session.updated", scheduleRefresh)
    const compacted = props.api.event.on("session.compacted", scheduleRefresh)

    onCleanup(() => {
      if (refreshTimer !== undefined) clearTimeout(refreshTimer)
      message()
      messageRemoved()
      part()
      delta()
      partRemoved()
      session()
      compacted()
    })
  })

  return (
    <text>
      <span style={{ fg: props.theme.text }}>{speedValue()}</span>
      <span style={{ fg: props.theme.textMuted }}> │ </span>
      <span style={{ fg: props.theme.text }}>{formatPercent(metrics().cache.latestHit)}</span>
      <span style={{ fg: trendColor() }}> {formatHitTrend(metrics().cache.trend)}</span>
    </text>
  )
}
