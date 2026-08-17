import type { LoadedSkill } from "./metrics/types"

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 10_000) return `${(value / 1_000).toFixed(1)}K`
  return Math.round(value).toLocaleString("en-US")
}

export function formatPercent(value: number | undefined): string {
  return value === undefined ? "—" : `${value.toFixed(1)}%`
}

export function formatSpeed(value: number | undefined, estimated = false): string {
  if (value === undefined) return "—"
  return `${estimated ? "~" : ""}${Math.round(value)} tok/s`
}

export function formatDuration(value: number | undefined, estimated = false): string {
  if (value === undefined) return "—"
  const prefix = estimated ? "~" : ""
  if (value < 1_000) return `${prefix}${Math.round(value)} ms`
  if (value < 10_000) return `${prefix}${(value / 1_000).toFixed(2)} s`
  return `${prefix}${(value / 1_000).toFixed(1)} s`
}

export function formatHitTrend(value: number | undefined): string {
  if (value === undefined) return "—"
  if (Math.abs(value) < 0.05) return "-"
  return `${value > 0 ? "↑" : "↓"}${Math.abs(value).toFixed(1)}%`
}

export function progressBar(percent: number | undefined, width: number): string {
  const filled = percent === undefined
    ? 0
    : Math.round((Math.max(0, Math.min(100, percent)) / 100) * width)
  return "█".repeat(filled) + "░".repeat(width - filled)
}

export function sparkline(values: number[]): string {
  if (values.length === 0) return "—"
  if (values.length === 1) return "▅"

  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return "▅".repeat(values.length)
  return values
    .map((value) => bars[Math.round(((value - min) / (max - min)) * (bars.length - 1))])
    .join("")
}

export function row(label: string, value: string, width: number): string {
  return label + " ".repeat(Math.max(1, width - label.length - value.length)) + value
}

export function skillRow(skill: LoadedSkill, width: number): string {
  const value = `${formatCompact(skill.tokens)} tok`
  const maxName = Math.max(4, width - value.length - 1)
  const name = skill.name.length > maxName
    ? `${skill.name.slice(0, maxName - 1)}…`
    : skill.name
  return row(name, value, width)
}
