import type { MeterStreamSession } from './meterEventStream'

/** Full dungeon clear via client API — required for public leaderboards. */
export function isMeterSessionLeaderboardEligible(session: MeterStreamSession): boolean {
  return session.lastRunOutcome === 'clear' && session.sessionEndMs != null
}
