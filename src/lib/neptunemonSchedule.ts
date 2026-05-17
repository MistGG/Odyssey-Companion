import { utcMillisForWallClockInZone } from './zonedWallClock'

/** Shared reference timezone so all clients agree on spawn instants (Arizona — no DST). */
export const NEPTUNEMON_SCHEDULE_TIMEZONE = 'America/Phoenix'
export const NEPTUNEMON_BOSS_ID = 'neptunemon'

/**
 * Observed spawn phase after the server restart: 1:10:30 AM Arizona time on 2026-05-17.
 * Neptunemon is alive for roughly 1m45s, then the next 90-minute timer starts.
 * That makes observed spawn-to-spawn spacing roughly 91m45s.
 */
export const NEPTUNEMON_ANCHOR_YEAR = 2026
export const NEPTUNEMON_ANCHOR_MONTH = 5
export const NEPTUNEMON_ANCHOR_DAY = 17
export const NEPTUNEMON_ANCHOR_HOUR = 1
export const NEPTUNEMON_ANCHOR_MINUTE = 10
export const NEPTUNEMON_ANCHOR_SECOND = 30

export const NEPTUNEMON_DEFAULT_RESPAWN_WAIT_MS = 90 * 60 * 1000
export const NEPTUNEMON_SPAWN_PERIOD_MS = (91 * 60 + 45) * 1000
export const NEPTUNEMON_ANCHOR_LABEL = '1:10:30 AM'

/** UTC instant of one spawn; every spawn is this + n × roughly 91m45s. */
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
export const NEPTUNEMON_ALIVE_WINDOW_MS = 105 * 1000

export type NeptunemonScheduleSnapshot = {
  bossId: typeof NEPTUNEMON_BOSS_ID
  anchorUtcMs: number
  aliveWindowMs: number
  respawnWaitMs: number
  updatedAtMs: number
}

export function getDefaultNeptunemonSchedule(): NeptunemonScheduleSnapshot {
  return {
    bossId: NEPTUNEMON_BOSS_ID,
    anchorUtcMs: NEPTUNEMON_GRID_ANCHOR_UTC_MS,
    aliveWindowMs: NEPTUNEMON_ALIVE_WINDOW_MS,
    respawnWaitMs: NEPTUNEMON_DEFAULT_RESPAWN_WAIT_MS,
    updatedAtMs: NEPTUNEMON_GRID_ANCHOR_UTC_MS,
  }
}

export function normalizeNeptunemonSchedule(raw: unknown): NeptunemonScheduleSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const anchorUtcMs = Number(o.anchorUtcMs)
  const aliveWindowMs = Number(o.aliveWindowMs)
  const respawnWaitMs = Number(o.respawnWaitMs)
  const updatedAtMs = Number(o.updatedAtMs)
  if (
    o.bossId !== NEPTUNEMON_BOSS_ID ||
    !Number.isFinite(anchorUtcMs) ||
    !Number.isFinite(aliveWindowMs) ||
    !Number.isFinite(respawnWaitMs) ||
    !Number.isFinite(updatedAtMs) ||
    aliveWindowMs < 5_000 ||
    aliveWindowMs > 15 * 60_000 ||
    respawnWaitMs < 30 * 60_000 ||
    respawnWaitMs > 3 * 60 * 60_000
  ) {
    return null
  }
  return {
    bossId: NEPTUNEMON_BOSS_ID,
    anchorUtcMs: Math.round(anchorUtcMs),
    aliveWindowMs: Math.round(aliveWindowMs),
    respawnWaitMs: Math.round(respawnWaitMs),
    updatedAtMs: Math.round(updatedAtMs),
  }
}

export function neptunemonSpawnPeriodMs(schedule: NeptunemonScheduleSnapshot): number {
  return schedule.respawnWaitMs + schedule.aliveWindowMs
}

function scheduleOrDefault(schedule?: NeptunemonScheduleSnapshot | null): NeptunemonScheduleSnapshot {
  return schedule ?? getDefaultNeptunemonSchedule()
}

/** UTC instant of the most recent spawn at or before `atMs` (null if before the grid anchor). */
export function lastNeptunemonSpawnUtcMs(
  atMs: number,
  schedule?: NeptunemonScheduleSnapshot | null,
): number | null {
  const s = scheduleOrDefault(schedule)
  const periodMs = neptunemonSpawnPeriodMs(s)
  const diff = atMs - s.anchorUtcMs
  if (diff < 0) return null
  const k = Math.floor(diff / periodMs)
  return s.anchorUtcMs + k * periodMs
}

/** True during the first {@link NEPTUNEMON_ALIVE_WINDOW_MS} after a spawn instant. */
export function isNeptunemonAliveWindow(
  atMs: number,
  schedule?: NeptunemonScheduleSnapshot | null,
): boolean {
  const s = scheduleOrDefault(schedule)
  const last = lastNeptunemonSpawnUtcMs(atMs, s)
  if (last === null) return false
  return atMs < last + s.aliveWindowMs
}

/** Next spawn strictly after `afterMs` (if `afterMs` lands exactly on a spawn, returns the following slot). */
export function nextNeptunemonSpawnUtcMs(
  afterMs: number,
  schedule?: NeptunemonScheduleSnapshot | null,
): number {
  const s = scheduleOrDefault(schedule)
  const periodMs = neptunemonSpawnPeriodMs(s)
  const diff = afterMs - s.anchorUtcMs
  if (diff < 0) return s.anchorUtcMs
  const n = Math.floor(diff / periodMs) + 1
  return s.anchorUtcMs + n * periodMs
}

export function msUntilNextNeptunemon(
  fromMs: number,
  schedule?: NeptunemonScheduleSnapshot | null,
): number {
  return Math.max(0, nextNeptunemonSpawnUtcMs(fromMs, schedule) - fromMs)
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
