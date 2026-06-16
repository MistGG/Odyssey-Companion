/**
 * Leaderboard ranking cycles. Edit when a new cycle starts: set `endsAt` on the
 * outgoing cycle and add a new live entry without `endsAt`.
 */
export type MeterLeaderboardCycle = {
  id: string
  label: string
  startsAt: string
  endsAt?: string | null
  note?: string
  hofThemeId: 'hall-of-fame' | 'magia-hall-of-fame'
  hofThemeLabel: string
}

/** June 15, 2026 5:30 PM Arizona — Magia cycle start / Olympus cycle end. */
export const MAGIA_CYCLE_START_UTC = '2026-06-16T00:30:00.000Z'

export const OLYMPUS_CYCLE_START_UTC = '1970-01-01T00:00:00.000Z'

export const METER_LEADERBOARD_CYCLES: MeterLeaderboardCycle[] = [
  {
    id: 'olympus',
    label: 'Olympus Cycle: April 20th - June 15',
    startsAt: OLYMPUS_CYCLE_START_UTC,
    endsAt: MAGIA_CYCLE_START_UTC,
    hofThemeId: 'hall-of-fame',
    hofThemeLabel: 'Olympus Breaker',
  },
  {
    id: 'magia',
    label: 'Magia Cycle: June 15 - Current',
    startsAt: MAGIA_CYCLE_START_UTC,
    note: 'Rankings update as new clears are uploaded.',
    hofThemeId: 'magia-hall-of-fame',
    hofThemeLabel: 'Magia Breaker',
  },
]

export function isMeterLeaderboardCycleLive(cycle: MeterLeaderboardCycle): boolean {
  return cycle.endsAt == null || cycle.endsAt === ''
}

export function getDefaultMeterLeaderboardCycle(): MeterLeaderboardCycle {
  const live = METER_LEADERBOARD_CYCLES.find(isMeterLeaderboardCycleLive)
  return live ?? METER_LEADERBOARD_CYCLES[METER_LEADERBOARD_CYCLES.length - 1]!
}

export function getMeterLeaderboardCycle(id: string): MeterLeaderboardCycle | null {
  const trimmed = id.trim()
  if (!trimmed) return null
  return METER_LEADERBOARD_CYCLES.find((c) => c.id === trimmed) ?? null
}

export function meterLeaderboardCycleWindow(cycle: MeterLeaderboardCycle): {
  windowStart: string
  windowEnd: string | null
} {
  return {
    windowStart: cycle.startsAt,
    windowEnd: cycle.endsAt ?? null,
  }
}
