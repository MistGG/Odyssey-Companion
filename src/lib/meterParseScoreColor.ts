/** WoW-style parse tier colors by percentile (0–100). */
export function parseScoreColor(percentile: number): string {
  const p = Math.round(Math.min(100, Math.max(0, percentile)))
  if (p >= 100) return '#e5cc80'
  if (p >= 99) return '#e268a8'
  if (p >= 95) return '#ff8000'
  if (p >= 75) return '#a335ee'
  if (p >= 50) return '#0070ff'
  if (p >= 25) return '#1eff00'
  return '#666666'
}

/**
 * Parse percentile 0–100 for coloring: linear vs the best DPS in the pool, floor at 0.
 * Top parse → 100; 0 DPS → 0; others scale in between (two players no longer 100 vs 0 only).
 */
export function dpsToPercentile(dps: number, poolDps: readonly number[]): number {
  const arr = poolDps.filter((x) => Number.isFinite(x) && x >= 0)
  const max = arr.length > 0 ? Math.max(...arr) : 0
  const value = Math.max(0, dps)
  if (max <= 0) return value > 0 ? 100 : 0
  return Math.min(100, Math.max(0, Math.round((value / max) * 100)))
}

/** @deprecated Use {@link dpsToPercentile}; order of `poolDps` does not matter. */
export function dpsToPercentileDesc(dps: number, sortedDpsDesc: number[]): number {
  return dpsToPercentile(dps, sortedDpsDesc)
}
