/** @jsxImportSource @opentui/solid */

import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui"
import type { BoxRenderable } from "@opentui/core"
import { createMemo, createSignal, onCleanup, onMount } from "solid-js"
import {
  formatCompact,
  formatDuration,
  formatHitTrend,
  formatPercent,
  formatSpeed,
  progressBar,
  row,
  skillRow,
  sparkline,
} from "./format"
import { readMetrics } from "./metrics/read"
import type { SpeedTracker } from "./metrics/speed"
import { TokenEstimator } from "./token-estimator"

const DEFAULT_CONTENT_WIDTH = 29
const MIN_CONTENT_WIDTH = 20

function SectionHeader(props: {
  title: string
  open: boolean
  width: number
  theme: TuiThemeCurrent
  toggle: () => void
}) {
  const prefix = `${props.open ? "▼" : "▶"} ${props.title}`
  return (
    <text onMouseUp={props.toggle}>
      <span style={{ fg: props.theme.text }}><b>{prefix}</b></span>
      <span style={{ fg: props.theme.border }}>
        {"─".repeat(Math.max(1, props.width - prefix.length))}
      </span>
    </text>
  )
}

export function CacheView(props: {
  api: TuiPluginApi
  sessionID: string
  speed: SpeedTracker
  theme: TuiThemeCurrent
}) {
  const estimator = new TokenEstimator()
  const [refresh, setRefresh] = createSignal(0)
  const [tokensOpen, setTokensOpen] = createSignal(true)
  const [skillsOpen, setSkillsOpen] = createSignal(true)
  const [speedOpen, setSpeedOpen] = createSignal(true)
  const [contentWidth, setContentWidth] = createSignal(DEFAULT_CONTENT_WIDTH)
  let estimatorSession = ""
  let boxElement: BoxRenderable | undefined
  const metrics = createMemo(() => {
    void refresh()
    if (estimatorSession !== props.sessionID) {
      estimator.clear()
      estimatorSession = props.sessionID
    }
    return readMetrics(props.api, props.sessionID, estimator, props.speed.get(props.sessionID))
  })
  const hitColor = createMemo(() => {
    const hit = metrics().cache.latestHit
    if (hit === undefined) return props.theme.textMuted
    if (hit >= 85) return props.theme.success
    if (hit >= 60) return props.theme.warning
    return props.theme.error
  })
  const trendColor = createMemo(() => {
    const trend = metrics().cache.trend
    if (trend === undefined || Math.abs(trend) < 0.05) return props.theme.textMuted
    return trend > 0 ? props.theme.success : props.theme.error
  })
  const hitBarWidth = createMemo(() => {
    const percent = formatPercent(metrics().cache.latestHit)
    const trend = formatHitTrend(metrics().cache.trend)
    const fixedWidth = "Hit ".length + 2 + 1 + percent.length + 1 + trend.length
    return Math.max(3, contentWidth() - fixedWidth)
  })

  onMount(() => {
    type ScopedEvent = { properties: { sessionID: string } }
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const matches = (event: ScopedEvent) => event.properties.sessionID === props.sessionID
    const bump = () => setRefresh((value) => value + 1)
    const scheduleRefresh = (event: ScopedEvent) => {
      if (!matches(event) || refreshTimer !== undefined) return
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined
        bump()
      }, 100)
    }

    const message = props.api.event.on("message.updated", scheduleRefresh)
    const messageRemoved = props.api.event.on("message.removed", (event) => {
      if (!matches(event)) return
      estimator.clear()
      scheduleRefresh(event)
    })
    const part = props.api.event.on("message.part.updated", scheduleRefresh)
    const partRemoved = props.api.event.on("message.part.removed", (event) => {
      if (!matches(event)) return
      estimator.clear()
      scheduleRefresh(event)
    })
    const delta = props.api.event.on("message.part.delta", (event) => {
      if (!matches(event)) return
      if (event.properties.field === "text") {
        estimator.append(`part:${event.properties.partID}:text`, event.properties.delta)
      }
      scheduleRefresh(event)
    })
    const session = props.api.event.on("session.updated", scheduleRefresh)
    const compacted = props.api.event.on("session.compacted", scheduleRefresh)

    onCleanup(() => {
      if (refreshTimer !== undefined) clearTimeout(refreshTimer)
      message()
      messageRemoved()
      part()
      partRemoved()
      delta()
      session()
      compacted()
    })
  })

  return (
    <box
      flexDirection="column"
      ref={(element) => {
        boxElement = element
      }}
      onSizeChange={() => {
        const width = boxElement?.width
        if (typeof width === "number" && width > 0) {
          setContentWidth(Math.max(MIN_CONTENT_WIDTH, width))
        }
      }}
    >
      <text>
        <span style={{ fg: props.theme.text }}><b>Cache View</b></span>
      </text>

      <text>
        <span style={{ fg: props.theme.text }}>Hit </span>
        <span style={{ fg: hitColor() }}>[{progressBar(metrics().cache.latestHit, hitBarWidth())}]</span>
        <span style={{ fg: props.theme.text }}> {formatPercent(metrics().cache.latestHit)}</span>
        <span style={{ fg: trendColor() }}> {formatHitTrend(metrics().cache.trend)}</span>
      </text>
      <text fg={props.theme.textMuted}>{row("Session Hit", formatPercent(metrics().cache.totalHit), contentWidth())}</text>
      <text fg={props.theme.textMuted}>{row("Read", `${formatCompact(metrics().cache.read)} tok`, contentWidth())}</text>
      <text fg={props.theme.textMuted}>{row("Miss", `${formatCompact(metrics().cache.miss)} tok`, contentWidth())}</text>

      <SectionHeader
        title="Speed"
        open={speedOpen()}
        width={contentWidth()}
        theme={props.theme}
        toggle={() => setSpeedOpen((value) => !value)}
      />
      {speedOpen() && (
        <>
          <text fg={props.theme.textMuted}>{row("TTFT", formatDuration(metrics().speed.ttft, true), contentWidth())}</text>
          <text fg={props.theme.textMuted}>{row("TPS", metrics().speed.active && metrics().speed.value === undefined ? "… tok/s" : formatSpeed(metrics().speed.value, metrics().speed.estimated), contentWidth())}</text>
          <text fg={props.theme.textMuted}>{row("Trend", sparkline(metrics().speed.trend), contentWidth())}</text>
        </>
      )}

      <SectionHeader
        title="Estimated Tokens"
        open={tokensOpen()}
        width={contentWidth()}
        theme={props.theme}
        toggle={() => setTokensOpen((value) => !value)}
      />
      {tokensOpen() && (
        <>
          <text fg={props.theme.textMuted}>{row("Prompt", `${formatCompact(metrics().tokens.system + metrics().tokens.user + metrics().tokens.agent)} tok`, contentWidth())}</text>
          <text fg={props.theme.textMuted}>{row("Tool Call", `${formatCompact(metrics().tokens.toolCall)} tok`, contentWidth())}</text>
          <text fg={props.theme.textMuted}>{row("Tool Result", `${formatCompact(metrics().tokens.toolResult)} tok`, contentWidth())}</text>
          <text fg={props.theme.textMuted}>{row("Agent Reasoning", `${formatCompact(metrics().tokens.reasoning)} tok`, contentWidth())}</text>
          <text fg={props.theme.textMuted}>{row("Agent Output", `${formatCompact(metrics().tokens.output)} tok`, contentWidth())}</text>
          <text fg={props.theme.text}>{row("Total", `${formatCompact(metrics().tokens.total)} tok`, contentWidth())}</text>
        </>
      )}

      {metrics().skills.length > 0 && (
        <>
          <SectionHeader
            title={`Loaded Skills (${metrics().skills.length})`}
            open={skillsOpen()}
            width={contentWidth()}
            theme={props.theme}
            toggle={() => setSkillsOpen((value) => !value)}
          />
          {skillsOpen() && metrics().skills.map((skill) => (
            <text fg={props.theme.textMuted}>{skillRow(skill, contentWidth())}</text>
          ))}
        </>
      )}
    </box>
  )
}
