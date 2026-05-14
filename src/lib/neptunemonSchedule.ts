import { utcMillisForWallClockInZone } from './zonedWallClock'

/** Shared reference timezone so all clients agree on spawn instants (Arizona — no DST). */
export const NEPTUNEMON_SCHEDULE_TIMEZONE = 'America/Phoenix'

/** First grid point: 01:19 on this calendar day in {@link NEPTUNEMON_SCHEDULE_TIMEZONE}. Adjust if the in-game phase shifts. */
const NEPTUNEMON_ANCHOR_YEAR = 2026
const NEPTUNEMON_ANCHOR_MONTH = 1
const NEPTUNEMON_ANCHOR_DAY = 1

export const NEPTUNEMON_SPAWN_PERIOD_MS = 90 * 60 * 1000

/** UTC instant of one spawn; every spawn is this + n × 90 minutes. */
export const NEPTUNEMON_GRID_ANCHOR_UTC_MS = utcMillisForWallClockInZone(
  NEPTUNEMON_ANCHOR_YEAR,
  NEPTUNEMON_ANCHOR_MONTH,
  NEPTUNEMON_ANCHOR_DAY,
  1,
  19,
  NEPTUNEMON_SCHEDULE_TIMEZONE,
)

/** Next spawn strictly after `afterMs` (if `afterMs` lands exactly on a spawn, returns the following slot). */
export function nextNeptunemonSpawnUtcMs(afterMs: number): number {
  const diff = afterMs - NEPTUNEMON_GRID_ANCHOR_UTC_MS
  if (diff < 0) return NEPTUNEMON_GRID_ANCHOR_UTC_MS
  const n = Math.floor(diff / NEPTUNEMON_SPAWN_PERIOD_MS) + 1
  return NEPTUNEMON_GRID_ANCHOR_UTC_MS + n * NEPTUNEMON_SPAWN_PERIOD_MS
}

export function msUntilNextNeptunemon(fromMs: number): number {
  return Math.max(0, nextNeptunemonSpawnUtcMs(fromMs) - fromMs)
}

export function formatDurationCountdown(totalMs: number): string {
  const s = Math.ceil(totalMs / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}
