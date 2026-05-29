import { buildMeterDungeonPartyParse } from './buildMeterDungeonPartyParse'
import { buildMeterDebugReport } from './meterDebugReport'
import { isDungeonParseUploadAllowed } from './dungeonDifficultyTags'
import type { MeterDungeonRunOutcome } from './meterDungeonRun'
import type { MeterStreamSession } from './meterEventStream'

export type MeterEndedRunSnapshot = {
  sessionEndMs: number
  lastRunOutcome: MeterDungeonRunOutcome
  dungeonId: string
  dungeonName: string | null
  dungeonDifficulty: string | null
  dungeonDifficultyTier: number | null
  dungeonExpectedKillSteps: number[]
  dungeonCompletedKillSteps: number[]
  dungeonFinalBossTarget: string | null
  dungeonFinalBossMonsterId: string | null
  builtParse: ReturnType<typeof buildMeterDungeonPartyParse>
  debugReportBase: string
}

export function meterSessionTotalDamage(session: MeterStreamSession): number {
  let total = 0
  for (const row of session.members.values()) {
    total += Math.max(0, row.totalDamage)
  }
  return total
}

/** Normal/Hard dungeon runs with meter damage — excludes story, overworld, empty sessions. */
export function isMeterDungeonRunHistoryCandidate(session: MeterStreamSession): boolean {
  if (!session.dungeonId?.trim()) return false
  if (!isDungeonParseUploadAllowed(session.dungeonId, session.dungeonDifficultyTier)) return false
  if (session.sessionStartMs == null) return false
  return meterSessionTotalDamage(session) > 0
}

export function captureMeterEndedRunSnapshot(
  session: MeterStreamSession,
): MeterEndedRunSnapshot | null {
  const sessionEndMs = session.sessionEndMs
  const lastRunOutcome = session.lastRunOutcome
  const dungeonId = session.dungeonId?.trim()
  if (sessionEndMs == null || !lastRunOutcome || !dungeonId) return null
  if (!isMeterDungeonRunHistoryCandidate(session)) return null

  return {
    sessionEndMs,
    lastRunOutcome,
    dungeonId,
    dungeonName: session.dungeonName?.trim() || null,
    dungeonDifficulty: session.dungeonDifficulty?.trim() || null,
    dungeonDifficultyTier: session.dungeonDifficultyTier,
    dungeonExpectedKillSteps: [...session.dungeonExpectedKillSteps],
    dungeonCompletedKillSteps: [...session.dungeonCompletedKillSteps],
    dungeonFinalBossTarget: session.dungeonFinalBossTarget,
    dungeonFinalBossMonsterId: session.dungeonFinalBossMonsterId,
    builtParse: buildMeterDungeonPartyParse(session),
    debugReportBase: buildMeterDebugReport(session, {
      appVersion: 'captured-at-dungeon-exit',
      eventStreamConnected: false,
      readerHint: null,
    }),
  }
}

export function applyMeterEndedRunSnapshotToSession(
  session: MeterStreamSession,
  snap: MeterEndedRunSnapshot,
): void {
  session.sessionEndMs = snap.sessionEndMs
  session.lastRunOutcome = snap.lastRunOutcome
  session.dungeonId = snap.dungeonId
  session.dungeonName = snap.dungeonName
  session.dungeonDifficulty = snap.dungeonDifficulty
  session.dungeonDifficultyTier = snap.dungeonDifficultyTier
  session.dungeonExpectedKillSteps = [...snap.dungeonExpectedKillSteps]
  session.dungeonCompletedKillSteps = [...snap.dungeonCompletedKillSteps]
  session.dungeonFinalBossTarget = snap.dungeonFinalBossTarget
  session.dungeonFinalBossMonsterId = snap.dungeonFinalBossMonsterId
  session.dungeonRunActive = false
}
