import type { MeterStreamSession } from './meterEventStream'
import {
  sessionAllKillObjectivesComplete,
  sessionFinalKillStepComplete,
} from './meterDungeonRun'

/** Full dungeon clear (all wiki kill steps + final boss step) — required for public leaderboards. */
export function isMeterSessionLeaderboardEligible(session: MeterStreamSession): boolean {
  return (
    session.lastRunOutcome === 'clear' &&
    session.sessionEndMs != null &&
    sessionAllKillObjectivesComplete(session) &&
    sessionFinalKillStepComplete(session)
  )
}
