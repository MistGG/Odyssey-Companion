import type { MeterStreamSession } from './meterEventStream'
import { sessionAllKillObjectivesComplete } from './meterDungeonRun'

/** Full dungeon clear (all wiki kill steps) — required for public leaderboards. */
export function isMeterSessionLeaderboardEligible(session: MeterStreamSession): boolean {
  return (
    session.lastRunOutcome === 'clear' &&
    session.sessionEndMs != null &&
    sessionAllKillObjectivesComplete(session)
  )
}
