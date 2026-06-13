import type { EventStreamRecord } from './eventStreamFormat'
import { buildMeterDungeonPartyParse } from './buildMeterDungeonPartyParse'
import {
  applyMeterEndedRunSnapshotToSession,
  type MeterEndedRunSnapshot,
} from './meterEndedRunSnapshot'
import {
  extractDungeonDifficultyMeta,
  markDungeonRunClear,
  markDungeonRunFail,
  syncAllWikiKillStepsComplete,
  type MeterDungeonRunOutcome,
} from './meterDungeonRun'
import type { MeterStreamSession } from './meterEventStream'
import { meterDebugLog } from './meterDebugLog'
import { meterRunLogNote } from './meterRunLog'
import type { MeterClientDungeonComplete } from './supabaseMeter'

export type DungeonCompletePayload = {
  dungeonId: string
  success: boolean
  exp: number | null
  money: number | null
  rank: string | null
  partySize: number | null
  timeSec: number | null
  deaths: number | null
  difficulty: string | null
  difficultyTier: number | null
}

export function meterClientClearForParse(
  payload: DungeonCompletePayload | null | undefined,
): MeterClientDungeonComplete | null {
  if (!payload) return null
  return {
    success: payload.success,
    rank: payload.rank,
    timeSec: payload.timeSec,
    deaths: payload.deaths,
    partySize: payload.partySize,
    exp: payload.exp,
    money: payload.money,
  }
}

function readNum(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
  return Number.isFinite(n) ? n : null
}

function readBool(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw
  if (raw === 'true' || raw === 1 || raw === '1') return true
  if (raw === 'false' || raw === 0 || raw === '0') return false
  return null
}

/** Parse `dungeon_complete` EventStream payload (authoritative run end). */
export function parseDungeonCompleteEvent(ev: EventStreamRecord): DungeonCompletePayload | null {
  if (String(ev.type ?? '') !== 'dungeon_complete') return null

  const dungeonId = String(ev.dungeon_id ?? ev.dungeonId ?? '').trim()
  const success = readBool(ev.success)
  if (!dungeonId || success == null) return null

  const diffMeta = extractDungeonDifficultyMeta(ev)

  return {
    dungeonId,
    success,
    exp: readNum(ev.exp),
    money: readNum(ev.money),
    rank: String(ev.rank ?? '').trim() || null,
    partySize: readNum(ev.party_size ?? ev.partySize),
    timeSec: readNum(ev.time_sec ?? ev.timeSec),
    deaths: readNum(ev.deaths),
    difficulty: diffMeta.label,
    difficultyTier: diffMeta.tier,
  }
}

function freezeMeterTimer(session: MeterStreamSession, endMs: number) {
  if (session.sessionStartMs == null) return
  if (session.sessionEndMs != null) return
  session.sessionEndMs = Math.max(session.sessionStartMs, endMs)
}

function logDungeonComplete(parsed: DungeonCompletePayload, successLabel: string) {
  meterDebugLog(`dungeon_complete ${successLabel} ${JSON.stringify(parsed)}`)
}

function applyOutcomeFromParsed(
  session: MeterStreamSession,
  parsed: DungeonCompletePayload,
  eventMs: number,
): MeterDungeonRunOutcome {
  session.clientDungeonComplete = parsed.success
  session.dungeonCompletePayload = parsed

  if (parsed.difficulty) session.dungeonDifficulty = parsed.difficulty
  if (parsed.difficultyTier != null) session.dungeonDifficultyTier = parsed.difficultyTier

  if (parsed.success) {
    syncAllWikiKillStepsComplete(session)
    markDungeonRunClear(session)
    freezeMeterTimer(session, eventMs)
    meterRunLogNote(
      session,
      `run outcome: CLEAR (dungeon_complete rank=${parsed.rank ?? '?'} time=${parsed.timeSec ?? '?'}s deaths=${parsed.deaths ?? '?'})`,
    )
    logDungeonComplete(parsed, 'SUCCESS')
    return 'clear'
  }

  markDungeonRunFail(session)
  freezeMeterTimer(session, eventMs)
  meterRunLogNote(session, 'run outcome: FAIL (dungeon_complete success=false)')
  logDungeonComplete(parsed, 'FAIL')
  return 'fail'
}

function refreshPendingSnapshot(
  session: MeterStreamSession,
  pending: MeterEndedRunSnapshot,
  parsed: DungeonCompletePayload,
  eventMs: number,
): MeterEndedRunSnapshot {
  pending.clientDungeonComplete = parsed.success
  pending.dungeonCompletePayload = parsed
  pending.lastRunOutcome = parsed.success ? 'clear' : 'fail'
  if (parsed.difficulty) pending.dungeonDifficulty = parsed.difficulty
  if (parsed.difficultyTier != null) pending.dungeonDifficultyTier = parsed.difficultyTier

  applyMeterEndedRunSnapshotToSession(session, pending)
  session.clientDungeonComplete = parsed.success
  session.dungeonCompletePayload = parsed
  session.lastRunOutcome = pending.lastRunOutcome
  if (parsed.success) syncAllWikiKillStepsComplete(session)

  pending.builtParse = buildMeterDungeonPartyParse(session)
  session.pendingEndedRun = pending
  return pending
}

/** Apply authoritative dungeon completion while still inside the instance. */
export function applyDungeonCompleteEvent(
  session: MeterStreamSession,
  ev: EventStreamRecord,
  nowMs = Date.now(),
): { outcome: MeterDungeonRunOutcome; parsed: DungeonCompletePayload } | null {
  if (session.runInvalidatedByReset) {
    meterDebugLog('dungeon_complete ignored — run invalidated by manual reset')
    meterRunLogNote(session, 'dungeon_complete ignored — run invalidated by manual reset')
    return null
  }

  const parsed = parseDungeonCompleteEvent(ev)
  if (!parsed) return null

  const eventMs = Number(ev.ts) || nowMs
  const activeId = session.dungeonId?.trim()

  if (activeId && activeId !== parsed.dungeonId) {
    meterDebugLog(
      `dungeon_complete ignored (dungeon_id mismatch active=${activeId} event=${parsed.dungeonId})`,
    )
    return null
  }

  if (!activeId) session.dungeonId = parsed.dungeonId

  const outcome = applyOutcomeFromParsed(session, parsed, eventMs)
  return { outcome, parsed }
}

/**
 * `dungeon_complete` can arrive after `map_change`. Reconcile against `pendingEndedRun`
 * so upload/history still see the authoritative result.
 */
export function applyDungeonCompleteToPendingRun(
  session: MeterStreamSession,
  ev: EventStreamRecord,
  nowMs = Date.now(),
): { outcome: MeterDungeonRunOutcome; parsed: DungeonCompletePayload } | null {
  if (session.runInvalidatedByReset) {
    meterDebugLog('dungeon_complete ignored — run invalidated by manual reset (pending reconcile)')
    meterRunLogNote(session, 'dungeon_complete ignored — run invalidated by manual reset')
    return null
  }

  const parsed = parseDungeonCompleteEvent(ev)
  if (!parsed) return null

  const pending = session.pendingEndedRun
  if (!pending || pending.dungeonId !== parsed.dungeonId) {
    meterDebugLog(
      `dungeon_complete after leave — no matching pending run (event=${parsed.dungeonId})`,
    )
    return null
  }

  const eventMs = Number(ev.ts) || nowMs
  refreshPendingSnapshot(session, pending, parsed, eventMs)
  logDungeonComplete(parsed, 'reconciled pending run')
  return { outcome: pending.lastRunOutcome, parsed }
}

/** Log raw JSON for support reports (always, not only when debug flag is on). */
export function logDungeonCompleteEventRaw(_session: MeterStreamSession, ev: EventStreamRecord): void {
  meterRunLogNote(_session, `dungeon_complete ${JSON.stringify(ev)}`)
}
