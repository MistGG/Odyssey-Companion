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

export function meterLeaderboardEligibilityDebugReason(session: MeterStreamSession): string {
  if (session.lastRunOutcome !== 'clear') return `outcome=${session.lastRunOutcome ?? 'null'}`
  if (session.sessionEndMs == null) return 'sessionEndMs=null'
  if (!sessionAllKillObjectivesComplete(session)) {
    return `objectives incomplete expected=[${session.dungeonExpectedKillSteps.join(',')}] done=[${session.dungeonCompletedKillSteps.join(',')}]`
  }
  if (!sessionFinalKillStepComplete(session)) return 'final step not in completedSteps'
  return 'eligible'
}
