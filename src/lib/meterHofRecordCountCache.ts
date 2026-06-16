const HOF_COUNT_CACHE_KEY = 'odyssey-meter-hof-record-counts-v1'
const HOF_COUNT_CACHE_TTL_MS = 30 * 60 * 1000

export type MeterHofRecordCountCache = {
  playerKey: string
  counts: Record<string, number>
  at: number
}

export function readMeterHofRecordCountCache(playerKey: string): Record<string, number> | null {
  if (typeof sessionStorage === 'undefined') return null
  const key = playerKey.trim().toLowerCase()
  if (!key) return null
  try {
    const raw = sessionStorage.getItem(HOF_COUNT_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as MeterHofRecordCountCache
    if (parsed.playerKey !== key) return null
    if (Date.now() - parsed.at > HOF_COUNT_CACHE_TTL_MS) return null
    return parsed.counts
  } catch {
    return null
  }
}

export function writeMeterHofRecordCountCache(playerKey: string, counts: Record<string, number>): void {
  if (typeof sessionStorage === 'undefined') return
  const key = playerKey.trim().toLowerCase()
  if (!key) return
  try {
    sessionStorage.setItem(
      HOF_COUNT_CACHE_KEY,
      JSON.stringify({ playerKey: key, counts, at: Date.now() } satisfies MeterHofRecordCountCache),
    )
  } catch {
    /* quota */
  }
}

export function invalidateMeterHofRecordCountCache(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(HOF_COUNT_CACHE_KEY)
  } catch {
    /* ignore */
  }
}
