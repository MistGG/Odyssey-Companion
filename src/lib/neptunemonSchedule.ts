import { utcMillisForWallClockInZone } from './zonedWallClock'

/** Shared reference timezone so all clients agree on spawn instants (Arizona — no DST). */
export const NEPTUNEMON_SCHEDULE_TIMEZONE = 'America/Phoenix'

/**
 * Observed spawn phase: 12:07:45 PM Arizona time on 2026-05-16.
 * Neptunemon's next 90-minute timer starts when it dies, so model observed
 * spawn-to-spawn spacing as roughly 90 minutes plus a 30-second alive window.
 */
export const NEPTUNEMON_ANCHOR_YEAR = 2026
export const NEPTUNEMON_ANCHOR_MONTH = 5
export const NEPTUNEMON_ANCHOR_DAY = 16
export const NEPTUNEMON_ANCHOR_HOUR = 12
export const NEPTUNEMON_ANCHOR_MINUTE = 7
export const NEPTUNEMON_ANCHOR_SECOND = 45

export const NEPTUNEMON_SPAWN_PERIOD_MS = (90 * 60 + 30) * 1000
export const NEPTUNEMON_ANCHOR_LABEL = '12:07:45 PM'

/** UTC instant of one spawn; every spawn is this + n × roughly 90m30s. */
export const NEPTUNEMON_GRID_ANCHOR_UTC_MS = utcMillisForWallClockInZone(
  NEPTUNEMON_ANCHOR_YEAR,
  NEPTUNEMON_ANCHOR_MONTH,
  NEPTUNEMON_ANCHOR_DAY,
  NEPTUNEMON_ANCHOR_HOUR,
  NEPTUNEMON_ANCHOR_MINUTE,
  NEPTUNEMON_SCHEDULE_TIMEZONE,
  NEPTUNEMON_ANCHOR_SECOND,
)

/** After each spawn instant, show the green “alive” state while Neptunemon is expected to be alive. */
export const NEPTUNEMON_ALIVE_WINDOW_MS = 30 * 1000

/** UTC instant of the most recent spawn at or before `atMs` (null if before the grid anchor). */
export function lastNeptunemonSpawnUtcMs(atMs: number): number | null {
  const diff = atMs - NEPTUNEMON_GRID_ANCHOR_UTC_MS
  if (diff < 0) return null
  const k = Math.floor(diff / NEPTUNEMON_SPAWN_PERIOD_MS)
  return NEPTUNEMON_GRID_ANCHOR_UTC_MS + k * NEPTUNEMON_SPAWN_PERIOD_MS
}

/** True during the first {@link NEPTUNEMON_ALIVE_WINDOW_MS} after a spawn instant. */
export function isNeptunemonAliveWindow(atMs: number): boolean {
  const last = lastNeptunemonSpawnUtcMs(atMs)
  if (last === null) return false
  return atMs < last + NEPTUNEMON_ALIVE_WINDOW_MS
}

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
