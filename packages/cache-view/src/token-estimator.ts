export function estimateTokenUnits(text: string): number {
  let units = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const isWide =
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff)
    units += isWide ? 4 : 1
  }
  return units
}

export class TokenEstimator {
  private cache = new Map<string, { text: string; units: number; tokens: number }>()

  count(key: string, text: string): number {
    const cached = this.cache.get(key)
    if (cached?.text === text) return cached.tokens
    const units = estimateTokenUnits(text)
    const tokens = Math.ceil(units / 4)
    this.cache.set(key, { text, units, tokens })
    return tokens
  }

  append(key: string, delta: string): void {
    const cached = this.cache.get(key)
    if (!cached) return
    const units = cached.units + estimateTokenUnits(delta)
    this.cache.set(key, {
      text: cached.text + delta,
      units,
      tokens: Math.ceil(units / 4),
    })
  }

  clear(): void {
    this.cache.clear()
  }
}
