function coerceAttackSpeed(raw: unknown): number | null {
  const speed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  if (!Number.isFinite(speed)) return null
  return speed
}

/** Parse `event.digimon.attack_speed` when present on any EventStream payload. */
export function parseDigimonAttackSpeed(event: Record<string, unknown>): number | null {
  const digimon = event.digimon
  if (!digimon || typeof digimon !== 'object' || Array.isArray(digimon)) return null
  return coerceAttackSpeed((digimon as Record<string, unknown>).attack_speed)
}

/** Prefer `query_result` with `q: "all"`; also accepts other snapshots that include `digimon.attack_speed`. */
export function parseAttackSpeedFromQueryResult(event: Record<string, unknown>): number | null {
  if (String(event.type ?? '') !== 'query_result') return null
  const q = String(event.q ?? '')
  if (q && q !== 'all' && q !== 'party') return null
  return parseDigimonAttackSpeed(event)
}

export type HudAttackSpeedStreamStatus = 'connected' | 'connecting' | 'waiting' | 'idle'

export function formatAttackSpeedDisplay(
  speed: number | null,
  streamStatus: HudAttackSpeedStreamStatus,
): string {
  if (speed != null) return speed.toFixed(3)
  if (streamStatus === 'connected' || streamStatus === 'connecting' || streamStatus === 'waiting') {
    return '…'
  }
  return '—'
}
