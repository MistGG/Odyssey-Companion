import type { MeterStreamSession } from './meterEventStream'

/** Full dungeon clear — requires authoritative `dungeon_complete` success from the client. */
export function isMeterSessionLeaderboardEligible(session: MeterStreamSession): boolean {
  return (
    session.lastRunOutcome === 'clear' &&
    session.sessionEndMs != null &&
    session.clientDungeonComplete
  )
}

export function meterLeaderboardEligibilityDebugReason(session: MeterStreamSession): string {
  if (session.lastRunOutcome !== 'clear') return `outcome=${session.lastRunOutcome ?? 'null'}`
  if (session.sessionEndMs == null) return 'sessionEndMs=null'
  if (!session.clientDungeonComplete) return 'awaiting dungeon_complete (client authoritative)'
  return 'eligible'
}
