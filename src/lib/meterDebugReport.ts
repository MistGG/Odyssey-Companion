import { isMeterDebugEnabled, meterDebugDump, meterDebugIngestState } from './meterDebugLog'
import type { MeterStreamSession } from './meterEventStream'
import { meterPartyRows } from './meterEventStream'
import { readEventStreamEndpoint } from './eventStreamConstants'

export type MeterDebugReportMeta = {
  appVersion: string
  eventStreamConnected: boolean
  readerHint: string | null
}

function partySummary(session: MeterStreamSession, nowMs: number): string {
  const rows = meterPartyRows(session, nowMs)
  if (!rows.length) return '(no party rows)'
  return rows
    .map((r) => {
      const tag = r.isSelf ? ' self' : ''
      return `  - ${r.tamerName || '?'} | dmg=${Math.round(r.totalDamage)} dps=${Math.round(r.dps)}${tag} | digimon=${r.digimonName || '?'}`
    })
    .join('\n')
}

export function buildMeterDebugReport(
  session: MeterStreamSession,
  meta: MeterDebugReportMeta,
): string {
  const nowMs = Date.now()
  const { host, port } = readEventStreamEndpoint()
  const lines: string[] = [
    'Odyssey Companion — meter debug report',
    `generated_utc=${new Date(nowMs).toISOString()}`,
    `app_version=${meta.appVersion}`,
    `event_stream=${host}:${port} connected=${meta.eventStreamConnected}`,
    `reader_hint=${meta.readerHint ?? ''}`,
    `diagnostic_logging=${isMeterDebugEnabled()}`,
    '',
    '--- session ---',
    meterDebugIngestState(session),
    `member_count=${session.members.size}`,
    `roster_count=${session.rosterMembers.size}`,
    '',
    '--- party rows ---',
    partySummary(session, nowMs),
    '',
    '--- event log (newest last) ---',
  ]

  const log = meterDebugDump().trim()
  if (log) lines.push(log)
  else {
    lines.push(
      '(empty — turn on "Record meter diagnostics", fight for a bit, then export again)',
    )
  }

  return lines.join('\n')
}
