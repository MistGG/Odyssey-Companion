import type { MeterDebugReportMeta } from './meterDebugReport'
import { meterDebugIngestState, isMeterDebugEnabled, meterDebugDump } from './meterDebugLog'
import type { MeterEndedRunSnapshot } from './meterEndedRunSnapshot'
import { meterLeaderboardEligibilityDebugReason } from './meterLeaderboardEligibility'
import type { MeterStreamSession } from './meterEventStream'
import { meterPartyRows } from './meterEventStream'
import type { MeterRunUploadStatus } from './meterRunHistory'
import { buildMeterDungeonPartyParse } from './buildMeterDungeonPartyParse'

type BuiltParse = ReturnType<typeof buildMeterDungeonPartyParse>

function formatPartyParseSection(parse: BuiltParse): string {
  const lines: string[] = [
    '--- party & damage ---',
    `duration_sec=${parse.durationSec}`,
    `raid_total_damage=${parse.raidTotalDamage}`,
    `leaderboard_eligible=${parse.dungeon.leaderboardEligible}`,
    `boss_targets=${parse.dungeon.bossTargets.join(' | ') || '(none)'}`,
    '',
  ]

  for (const m of parse.members) {
    lines.push(
      `${m.displayLabel}${m.isSelf ? ' (self)' : ''} | total=${m.totalDamage} | duration=${m.durationSec}s | digimon=${m.currentDigimonName ?? '?'}`,
    )
    for (const d of m.digimons) {
      lines.push(`  ${d.digimonName} (${d.digimonId || '?'}) total=${d.totalDamage}`)
      for (const s of d.skills) {
        lines.push(`    ${s.skill} | dmg=${s.damage} hits=${s.hits}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n').trimEnd()
}

function formatSessionDungeonSection(session: MeterStreamSession): string {
  return [
    '--- dungeon state ---',
    meterDebugIngestState(session),
    `killed_bosses=[${session.dungeonKilledBossTargets.join(' | ')}]`,
    `boss_targets=[${session.dungeonBossTargets.join(' | ')}]`,
    `leaderboard_eligible=${session.lastRunOutcome === 'clear' ? String(
      session.sessionEndMs != null &&
        meterLeaderboardEligibilityDebugReason(session) === 'eligible',
    ) : 'false'}`,
    session.lastRunOutcome === 'clear'
      ? `eligibility_detail=${meterLeaderboardEligibilityDebugReason(session)}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatRunHeader(run: {
  endedAt: string
  dungeonName: string | null
  dungeonId: string | null
  difficulty: string | null
  outcome: string
  uploadStatus: MeterRunUploadStatus
  uploadDetail: string
  meta: MeterDebugReportMeta
}): string {
  return [
    'Odyssey Companion — meter run report',
    `ended_at=${run.endedAt}`,
    `dungeon=${run.dungeonName ?? run.dungeonId ?? '?'}`,
    `difficulty=${run.difficulty ?? '?'}`,
    `outcome=${run.outcome}`,
    `upload_status=${run.uploadStatus}`,
    `upload_detail=${run.uploadDetail}`,
    `app_version=${run.meta.appVersion}`,
    `event_stream_connected=${run.meta.eventStreamConnected}`,
    `reader_hint=${run.meta.readerHint ?? ''}`,
    `diagnostic_logging=${isMeterDebugEnabled()}`,
    'combat_log=use Export combat log in Settings → Recent runs',
    '',
  ].join('\n')
}

function formatRunTimeline(runEventLog: string): string {
  if (!runEventLog.trim()) {
    return '--- run timeline ---\n(empty — no dungeon events recorded for this run)'
  }
  return `--- run timeline ---\n${runEventLog.trim()}`
}

function formatOptionalDiagnostics(): string {
  const dump = meterDebugDump().trim()
  if (!dump) return ''
  return `\n\n--- optional diagnostics (Record meter diagnostics was on) ---\n${dump}`
}

export function buildMeterRunReportFromSnapshot(
  snap: MeterEndedRunSnapshot,
  meta: MeterDebugReportMeta,
  upload: { uploadStatus: MeterRunUploadStatus; uploadDetail: string },
): string {
  const endedAt = new Date(snap.sessionEndMs).toISOString()
  const dungeonName = snap.dungeonName?.trim() || snap.dungeonId
  const difficulty = snap.dungeonDifficulty?.trim() || null

  const sessionLike = {
    selfTamerName: null,
    selfDigimonId: null,
    selfDigimonNickname: null,
    sessionStartMs: null,
    sessionEndMs: snap.sessionEndMs,
    dungeonId: snap.dungeonId,
    dungeonRunActive: false,
    mapName: snap.builtParse.dungeon.mapName,
    dungeonExpectedKillSteps: snap.dungeonExpectedKillSteps,
    dungeonCompletedKillSteps: snap.dungeonCompletedKillSteps,
    dungeonFinalBossTarget: snap.dungeonFinalBossTarget,
    dungeonFinalBossMonsterId: snap.dungeonFinalBossMonsterId,
    lastRunOutcome: snap.lastRunOutcome,
  }

  return [
    formatRunHeader({
      endedAt,
      dungeonName,
      dungeonId: snap.dungeonId,
      difficulty,
      outcome: snap.lastRunOutcome,
      uploadStatus: upload.uploadStatus,
      uploadDetail: upload.uploadDetail,
      meta,
    }),
    '--- session ---',
    meterDebugIngestState(sessionLike),
    `killed_bosses=[${snap.dungeonKilledBossTargets.join(' | ')}]`,
    `boss_targets=[${snap.builtParse.dungeon.bossTargets.join(' | ')}]`,
    `eligibility_detail=${snap.builtParse.dungeon.leaderboardEligible ? 'eligible' : 'not eligible'}`,
    '',
    formatPartyParseSection(snap.builtParse),
    '',
    formatRunTimeline(snap.runEventLog),
    formatOptionalDiagnostics(),
  ].join('\n')
}

export function buildMeterRunReportFromSession(
  session: MeterStreamSession,
  meta: MeterDebugReportMeta,
  run: {
    endedAt: string
    dungeonName: string | null
    dungeonId: string | null
    difficulty: string | null
    outcome: string
    uploadStatus: MeterRunUploadStatus
    uploadDetail: string
  },
  builtParse: BuiltParse,
  runEventLog: string,
): string {
  const partyRows = meterPartyRows(session, Date.now())
  const partySummary =
    partyRows.length === 0
      ? '(no party rows)'
      : partyRows
          .map((r) => {
            const tag = r.isSelf ? ' self' : ''
            return `  - ${r.tamerName || '?'} | dmg=${Math.round(r.totalDamage)} dps=${Math.round(r.dps)}${tag} | digimon=${r.digimonName || '?'}`
          })
          .join('\n')

  return [
    formatRunHeader({ ...run, meta }),
    '--- session ---',
    meterDebugIngestState(session),
    '',
    '--- party rows (live) ---',
    partySummary,
    '',
    formatSessionDungeonSection(session),
    '',
    formatPartyParseSection(builtParse),
    '',
    formatRunTimeline(runEventLog),
    formatOptionalDiagnostics(),
  ].join('\n')
}
