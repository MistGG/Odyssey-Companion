import { isDungeonParseUploadAllowed } from './dungeonDifficultyTags'
import type { MeterDebugReportMeta } from './meterDebugReport'
import { buildMeterDungeonPartyParse } from './buildMeterDungeonPartyParse'
import {
  formatMeterCombatLogFile,
  meterCombatLogClear,
  meterCombatLogSnapshot,
  type MeterCombatLogFileHeader,
} from './meterCombatLog'
import { meterRunLogCapture } from './meterRunLog'
import {
  buildMeterRunReportFromSession,
  buildMeterRunReportFromSnapshot,
} from './meterRunReport'
import {
  isMeterSessionLeaderboardEligible,
  meterLeaderboardEligibilityDebugReason,
} from './meterLeaderboardEligibility'
import type { MeterStreamSession } from './meterEventStream'
import type { MeterEndedRunSnapshot } from './meterEndedRunSnapshot'
import { isMeterDungeonRunHistoryCandidate } from './meterEndedRunSnapshot'
import type { MeterDungeonRunOutcome } from './meterDungeonRun'

export type MeterRunUploadStatus =
  | 'uploaded_ranked'
  | 'uploaded_unranked'
  | 'not_uploaded'
  | 'not_applicable'

export type MeterRunHistoryEntry = {
  id: string
  sessionEndMs: number
  endedAt: string
  dungeonName: string | null
  dungeonId: string | null
  difficulty: string | null
  outcome: MeterDungeonRunOutcome
  uploadStatus: MeterRunUploadStatus
  uploadDetail: string
  debugReport: string
  /** Set after auto-save to disk completes (Electron only). */
  combatLogSaved?: boolean
}

const STORAGE_KEY = 'odyssey-meter-run-history-v1'
const MAX_ENTRIES = 10
const HISTORY_CHANGED_EVENT = 'meter-run-history-changed'

function notifyHistoryChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(HISTORY_CHANGED_EVENT))
}

function isValidHistoryEntry(row: unknown): row is MeterRunHistoryEntry {
  if (!row || typeof row !== 'object') return false
  const e = row as MeterRunHistoryEntry
  return typeof e.id === 'string' && typeof e.sessionEndMs === 'number'
}

/** Newest first; drops runs beyond {@link MAX_ENTRIES} so old debug reports are not kept. */
function pruneMeterRunHistoryEntries(entries: MeterRunHistoryEntry[]): MeterRunHistoryEntry[] {
  return [...entries]
    .filter(isValidHistoryEntry)
    .sort((a, b) => b.sessionEndMs - a.sessionEndMs)
    .slice(0, MAX_ENTRIES)
}

export function readMeterRunHistory(): MeterRunHistoryEntry[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const valid = (parsed as MeterRunHistoryEntry[]).filter(isValidHistoryEntry)
    const pruned = pruneMeterRunHistoryEntries(valid)
    if (pruned.length !== valid.length) {
      writeMeterRunHistory(pruned, { notify: false })
    }
    return pruned
  } catch {
    return []
  }
}

function writeMeterRunHistory(entries: MeterRunHistoryEntry[], opts?: { notify?: boolean }) {
  if (typeof localStorage === 'undefined') return
  const pruned = pruneMeterRunHistoryEntries(entries)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned))
  void pruneMeterCombatLogFiles(pruned.map((e) => e.id))
  if (opts?.notify !== false) notifyHistoryChanged()
}

function scheduleCombatLogFileSave(args: {
  header: MeterCombatLogFileHeader
  runTimeline: string
  sessionStartMs: number | null
}): void {
  const snapshot = meterCombatLogSnapshot(args.sessionStartMs)
  if (snapshot.rows.length === 0 && !args.runTimeline.trim()) {
    meterCombatLogClear()
    return
  }

  const run = () => {
    const text = formatMeterCombatLogFile(args.header, args.runTimeline, snapshot)
    const api = typeof window !== 'undefined' ? window.odysseyCompanion : undefined
    if (!api?.saveMeterCombatLog) {
      meterCombatLogClear()
      return
    }
    void api
      .saveMeterCombatLog({ runId: args.header.runId, text })
      .then((result) => {
        if (result.ok) {
          updateMeterRunHistoryEntry(args.header.runId, { combatLogSaved: true })
        }
        meterCombatLogClear()
      })
      .catch(() => meterCombatLogClear())
  }

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => run(), { timeout: 4000 })
  } else {
    setTimeout(run, 0)
  }
}

async function pruneMeterCombatLogFiles(keepRunIds: string[]): Promise<void> {
  const api = typeof window !== 'undefined' ? window.odysseyCompanion : undefined
  if (!api?.pruneMeterCombatLogs) return
  try {
    await api.pruneMeterCombatLogs(keepRunIds)
  } catch {
    /* */
  }
}

export function upsertMeterRunHistoryEntry(entry: MeterRunHistoryEntry) {
  const existing = readMeterRunHistory().filter((e) => e.id !== entry.id)
  writeMeterRunHistory([entry, ...existing].slice(0, MAX_ENTRIES))
}

export function updateMeterRunHistoryEntry(
  id: string,
  patch: Pick<MeterRunHistoryEntry, 'uploadStatus' | 'uploadDetail' | 'combatLogSaved'> & {
    debugReport?: string
  },
) {
  const list = readMeterRunHistory()
  const idx = list.findIndex((e) => e.id === id)
  if (idx < 0) return
  list[idx] = {
    ...list[idx],
    ...patch,
    debugReport: patch.debugReport ?? list[idx].debugReport,
  }
  writeMeterRunHistory(list)
}

export function meterRunHistoryChangedEventName(): string {
  return HISTORY_CHANGED_EVENT
}

export function classifyMeterRunUploadFromSnapshot(
  snap: MeterEndedRunSnapshot,
  supabaseConfigured: boolean,
): { uploadStatus: MeterRunUploadStatus; uploadDetail: string } {
  if (!isDungeonParseUploadAllowed(snap.dungeonId, snap.dungeonDifficultyTier)) {
    return { uploadStatus: 'not_applicable', uploadDetail: 'Story difficulty — not uploaded' }
  }
  if (snap.lastRunOutcome === 'fail') {
    return { uploadStatus: 'not_applicable', uploadDetail: 'Failed run — not uploaded' }
  }
  if (snap.lastRunOutcome !== 'clear') {
    return { uploadStatus: 'not_applicable', uploadDetail: 'Run did not clear' }
  }
  if (!supabaseConfigured) {
    return { uploadStatus: 'not_uploaded', uploadDetail: 'Cloud upload not configured' }
  }
  if (!snap.builtParse.dungeon.leaderboardEligible) {
    return {
      uploadStatus: 'not_uploaded',
      uploadDetail: 'Clear not eligible for upload (incomplete objectives)',
    }
  }
  return { uploadStatus: 'not_uploaded', uploadDetail: 'Upload pending' }
}

export function classifyMeterRunUpload(
  session: MeterStreamSession,
  supabaseConfigured: boolean,
): { uploadStatus: MeterRunUploadStatus; uploadDetail: string } {
  if (!session.dungeonId?.trim()) {
    return { uploadStatus: 'not_applicable', uploadDetail: 'Not a dungeon run' }
  }
  if (!isDungeonParseUploadAllowed(session.dungeonId, session.dungeonDifficultyTier)) {
    return { uploadStatus: 'not_applicable', uploadDetail: 'Story difficulty — not uploaded' }
  }
  if (session.lastRunOutcome === 'fail') {
    return { uploadStatus: 'not_applicable', uploadDetail: 'Failed run — not uploaded' }
  }
  if (session.lastRunOutcome !== 'clear') {
    return { uploadStatus: 'not_applicable', uploadDetail: 'Run did not clear' }
  }
  if (!supabaseConfigured) {
    return { uploadStatus: 'not_uploaded', uploadDetail: 'Cloud upload not configured' }
  }
  if (!isMeterSessionLeaderboardEligible(session)) {
    return {
      uploadStatus: 'not_uploaded',
      uploadDetail: meterLeaderboardEligibilityDebugReason(session),
    }
  }
  return { uploadStatus: 'not_uploaded', uploadDetail: 'Upload pending' }
}

export function recordMeterRunHistoryEntry(
  session: MeterStreamSession,
  meta: MeterDebugReportMeta,
  supabaseConfigured: boolean,
): MeterRunHistoryEntry | null {
  if (!isMeterDungeonRunHistoryCandidate(session)) return null
  const sessionEndMs = session.sessionEndMs
  const outcome = session.lastRunOutcome
  if (sessionEndMs == null || outcome == null || !session.dungeonId?.trim()) return null

  const endedAt = new Date(sessionEndMs).toISOString()
  const { uploadStatus, uploadDetail } = classifyMeterRunUpload(session, supabaseConfigured)
  const dungeonName =
    session.dungeonName?.trim() || session.dungeonId?.trim() || null
  const difficulty = session.dungeonDifficulty?.trim() || null

  const entry: MeterRunHistoryEntry = {
    id: String(sessionEndMs),
    sessionEndMs,
    endedAt,
    dungeonName,
    dungeonId: session.dungeonId?.trim() || null,
    difficulty,
    outcome,
    uploadStatus,
    uploadDetail,
    debugReport: buildMeterRunReportFromSession(
      session,
      meta,
      {
        endedAt,
        dungeonName,
        dungeonId: session.dungeonId?.trim() || null,
        difficulty,
        outcome,
        uploadStatus,
        uploadDetail,
      },
      buildMeterDungeonPartyParse(session),
      meterRunLogCapture(),
    ),
  }

  upsertMeterRunHistoryEntry(entry)
  scheduleCombatLogFileSave({
    header: {
      runId: entry.id,
      endedAt,
      dungeonName,
      dungeonId: session.dungeonId?.trim() || null,
      difficulty,
      outcome,
      appVersion: meta.appVersion,
    },
    runTimeline: meterRunLogCapture(),
    sessionStartMs: session.sessionStartMs,
  })
  return entry
}

export function recordMeterRunHistoryFromSnapshot(
  snap: MeterEndedRunSnapshot,
  meta: MeterDebugReportMeta,
  supabaseConfigured: boolean,
): MeterRunHistoryEntry | null {
  const endedAt = new Date(snap.sessionEndMs).toISOString()
  const { uploadStatus, uploadDetail } = classifyMeterRunUploadFromSnapshot(
    snap,
    supabaseConfigured,
  )
  const dungeonName = snap.dungeonName?.trim() || snap.dungeonId
  const difficulty = snap.dungeonDifficulty?.trim() || null
  const debugReport = buildMeterRunReportFromSnapshot(snap, meta, {
    uploadStatus,
    uploadDetail,
  })

  const entry: MeterRunHistoryEntry = {
    id: String(snap.sessionEndMs),
    sessionEndMs: snap.sessionEndMs,
    endedAt,
    dungeonName: snap.dungeonName,
    dungeonId: snap.dungeonId,
    difficulty,
    outcome: snap.lastRunOutcome,
    uploadStatus,
    uploadDetail,
    debugReport,
  }

  upsertMeterRunHistoryEntry(entry)
  scheduleCombatLogFileSave({
    header: {
      runId: entry.id,
      endedAt,
      dungeonName: snap.dungeonName ?? snap.dungeonId,
      dungeonId: snap.dungeonId,
      difficulty,
      outcome: snap.lastRunOutcome,
      appVersion: meta.appVersion,
    },
    runTimeline: snap.runEventLog,
    sessionStartMs: snap.sessionStartMs,
  })
  return entry
}

export function defaultCombatLogExportName(entry: MeterRunHistoryEntry): string {
  const dungeon = (entry.dungeonName ?? entry.dungeonId ?? 'dungeon')
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 48)
  const stamp = entry.endedAt.replace(/[:.]/g, '-').slice(0, 19)
  return `odyssey-combat-log-${dungeon}-${stamp}.txt`
}

export async function exportMeterRunCombatLog(
  entry: MeterRunHistoryEntry,
): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> {
  const api = window.odysseyCompanion
  if (!api?.exportMeterCombatLog) {
    return { ok: false, error: 'Combat log export is only available in the Odyssey Companion app.' }
  }
  return api.exportMeterCombatLog({
    runId: entry.id,
    defaultName: defaultCombatLogExportName(entry),
  })
}

export function uploadStatusLabel(status: MeterRunUploadStatus): string {
  switch (status) {
    case 'uploaded_ranked':
      return 'Uploaded — ranked'
    case 'uploaded_unranked':
      return 'Uploaded — not ranked'
    case 'not_uploaded':
      return 'Not uploaded'
    case 'not_applicable':
      return 'Not uploaded'
    default:
      return 'Unknown'
  }
}

export function getMeterRunHistoryEntry(id: string): MeterRunHistoryEntry | null {
  return readMeterRunHistory().find((e) => e.id === id) ?? null
}

export function patchMeterRunHistoryUpload(
  id: string,
  status: MeterRunUploadStatus,
  detail: string,
): void {
  const existing = getMeterRunHistoryEntry(id)
  if (!existing) return
  updateMeterRunHistoryEntry(id, {
    uploadStatus: status,
    uploadDetail: detail,
    debugReport: `${existing.debugReport}\n\n--- upload result ---\nupload_status=${status}\nupload_detail=${detail}\n`,
  })
}

export function formatRunHistoryWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}
