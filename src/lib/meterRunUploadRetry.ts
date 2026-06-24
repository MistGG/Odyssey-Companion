import { difficultyTierFromRaw } from './dungeonDifficultyTags'
import {
  getMeterRunHistoryEntry,
  patchMeterRunHistoryUpload,
  type MeterRunHistoryEntry,
  type MeterRunUploadStatus,
} from './meterRunHistory'
import {
  claimAnonymousMeterParsesForTamer,
  selfTamerNameFromDungeonMembers,
} from './meterParseTamerClaim'
import type { MeterRunUploadSnapshot } from './meterRunUploadSnapshot'
import {
  insertMeterParse,
  type MeterDungeonPartyMemberParse,
  type MeterParseDungeonContext,
} from './supabaseMeter'
import type { SupabaseClient } from '@supabase/supabase-js'
import { userFacingUploadError } from './userFacingMessages'

function readHeaderValue(debugReport: string, key: string): string | null {
  const re = new RegExp(`^${key}=(.+)$`, 'm')
  const match = debugReport.match(re)
  return match?.[1]?.trim() || null
}

function readSessionField(debugReport: string, key: string): string | null {
  const sessionBlock = debugReport.match(/--- session ---\n([\s\S]*?)(?:\n---|\n\n---|$)/)
  if (!sessionBlock) return null
  const re = new RegExp(`${key}=([^\\s]+)`)
  const match = sessionBlock[1].match(re)
  const value = match?.[1]?.trim()
  if (!value || value === 'null') return null
  return value
}

/** Rebuild upload payload from a stored debug report (runs recorded before uploadSnapshot existed). */
export function parseUploadSnapshotFromDebugReport(
  entry: MeterRunHistoryEntry,
): MeterRunUploadSnapshot | null {
  const report = entry.debugReport
  const partyStart = report.indexOf('--- party & damage ---')
  if (partyStart < 0) return null

  const partyBlock = report.slice(partyStart)
  const partyLines = partyBlock.split('\n').slice(1)
  const readPartyField = (key: string): string | null => {
    const line = partyLines.find((l) => l.startsWith(`${key}=`))
    if (!line) return null
    return line.slice(key.length + 1).trim()
  }

  const durationRaw = readPartyField('duration_sec')
  const durationSec = durationRaw != null ? Number(durationRaw) : NaN
  if (!Number.isFinite(durationSec) || durationSec <= 0) return null

  const raidTotalRaw = readPartyField('raid_total_damage')
  const raidTotalDamage = raidTotalRaw != null ? Number(raidTotalRaw) : 0

  const leaderboardEligible = readPartyField('leaderboard_eligible') === 'true'
  const bossTargetsRaw = readPartyField('boss_targets')
  const bossTargets =
    !bossTargetsRaw || bossTargetsRaw === '(none)'
      ? []
      : bossTargetsRaw.split(' | ').map((b) => b.trim()).filter(Boolean)

  const dungeonId = entry.dungeonId?.trim() || readSessionField(report, 'dungeon_id') || ''
  if (!dungeonId) return null

  const difficulty = entry.difficulty?.trim() || readHeaderValue(report, 'difficulty') || 'Unknown'
  const difficultyId = difficultyTierFromRaw(difficulty) ?? difficultyTierFromRaw(entry.difficulty) ?? 0

  const clientComplete =
    entry.clientClearRank != null ||
    entry.clientClearTimeSec != null ||
    readPartyField('client_clear_rank')
      ? {
          success: true,
          rank: entry.clientClearRank ?? readPartyField('client_clear_rank'),
          timeSec:
            entry.clientClearTimeSec ??
            (() => {
              const raw = readPartyField('client_clear_time_sec')
              const n = raw != null ? Number(raw) : NaN
              return Number.isFinite(n) ? n : null
            })(),
          deaths: (() => {
            const raw = readPartyField('client_clear_deaths')
            const n = raw != null ? Number(raw) : NaN
            return Number.isFinite(n) ? n : null
          })(),
          partySize: (() => {
            const raw = readPartyField('client_clear_party_size')
            const n = raw != null ? Number(raw) : NaN
            return Number.isFinite(n) ? n : null
          })(),
          exp: null,
          money: null,
        }
      : null

  const members: MeterDungeonPartyMemberParse[] = []
  let currentMember: MeterDungeonPartyMemberParse | null = null
  let currentDigimon: MeterDungeonPartyMemberParse['digimons'][number] | null = null

  for (const rawLine of partyLines) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith('duration_sec=') || line.startsWith('raid_total_damage=')) continue
    if (line.startsWith('leaderboard_eligible=') || line.startsWith('boss_targets=')) continue
    if (line.startsWith('client_clear_')) continue

    const memberMatch = line.match(/^(.+?)( \(self\))? \| total=(\d+) \| duration=(\d+)s \| digimon=(.*)$/)
    if (memberMatch) {
      const displayLabel = memberMatch[1].trim()
      const isSelf = Boolean(memberMatch[2])
      currentMember = {
        memberKey: isSelf ? 'self' : displayLabel,
        displayLabel,
        tamerName: displayLabel,
        currentDigimonName: memberMatch[5].trim() === '?' ? null : memberMatch[5].trim(),
        currentDigimonId: null,
        portraitIconId: null,
        totalDamage: Number(memberMatch[3]),
        durationSec: Number(memberMatch[4]),
        isSelf,
        digimons: [],
      }
      members.push(currentMember)
      currentDigimon = null
      continue
    }

    const digimonMatch = line.match(/^\s{2}(.+?) \((.+?)\) total=(\d+)$/)
    if (digimonMatch && currentMember) {
      const digimonId = digimonMatch[2].trim() === '?' ? '' : digimonMatch[2].trim()
      currentDigimon = {
        digimonId,
        digimonName: digimonMatch[1].trim(),
        iconId: null,
        totalDamage: Number(digimonMatch[3]),
        skills: [],
      }
      currentMember.digimons.push(currentDigimon)
      if (!currentMember.currentDigimonId && digimonId) currentMember.currentDigimonId = digimonId
      continue
    }

    const skillMatch = line.match(/^\s{4}(.+?) \| dmg=(\d+) hits=(\d+)$/)
    if (skillMatch && currentDigimon) {
      currentDigimon.skills.push({
        skill: skillMatch[1].trim(),
        damage: Number(skillMatch[2]),
        hits: Number(skillMatch[3]),
      })
    }
  }

  if (members.length === 0) return null
  const uploadDamageSum = members.reduce((s, m) => s + Math.max(0, m.totalDamage), 0)
  if (uploadDamageSum <= 0) return null

  const dungeon: MeterParseDungeonContext = {
    dungeonId,
    dungeonName: entry.dungeonName?.trim() || readHeaderValue(report, 'dungeon') || null,
    difficulty,
    difficultyId,
    mapName: readSessionField(report, 'map'),
    partyId: null,
    bossTargets,
    runOutcome: 'clear',
    invalidatedByManualReset: /invalidated by manual meter reset/i.test(entry.uploadDetail),
    leaderboardEligible,
    clientComplete,
  }

  return {
    durationSec: Math.round(durationSec),
    raidTotalDamage: Math.round(raidTotalDamage || uploadDamageSum),
    dungeon,
    members,
  }
}

export function resolveMeterRunUploadSnapshot(entry: MeterRunHistoryEntry): MeterRunUploadSnapshot | null {
  if (entry.uploadSnapshot) return entry.uploadSnapshot
  return parseUploadSnapshotFromDebugReport(entry)
}

export function canRetryMeterRunUpload(entry: MeterRunHistoryEntry): boolean {
  if (entry.outcome !== 'clear') return false
  if (entry.uploadStatus === 'uploaded_ranked' || entry.uploadStatus === 'uploaded_unranked') {
    return false
  }
  if (entry.uploadStatus === 'not_applicable') return false
  if (/invalidated by manual meter reset/i.test(entry.uploadDetail)) return false

  const snapshot = resolveMeterRunUploadSnapshot(entry)
  if (!snapshot) return false
  if (snapshot.dungeon.invalidatedByManualReset) return false
  if (snapshot.dungeon.difficultyId < 2) return false

  const damage = snapshot.members.reduce((s, m) => s + Math.max(0, m.totalDamage), 0)
  return snapshot.members.length > 0 && damage > 0
}

export type MeterRunUploadRetryResult =
  | { ok: true; uploadStatus: MeterRunUploadStatus; detail: string; deduped?: boolean }
  | { ok: false; error: string }

export async function retryMeterRunUpload(
  client: SupabaseClient,
  userId: string,
  entryId: string,
): Promise<MeterRunUploadRetryResult> {
  const entry = getMeterRunHistoryEntry(entryId)
  if (!entry) return { ok: false, error: 'Run not found in recent history.' }
  if (!canRetryMeterRunUpload(entry)) {
    return { ok: false, error: 'This run cannot be uploaded (missing data or not eligible).' }
  }

  const snapshot = resolveMeterRunUploadSnapshot(entry)
  if (!snapshot) {
    return { ok: false, error: 'Upload data is missing — copy report and send to support.' }
  }

  const info = await window.odysseyCompanion?.getAppVersion?.()
  const appVersion = info?.version ?? 'unknown'

  const { error, deduped } = await insertMeterParse(client, userId, {
    mode: 'dungeon_party',
    appVersion,
    durationSec: snapshot.durationSec,
    dungeon: snapshot.dungeon,
    members: snapshot.members,
    digimonNamesRequireWikiLookup: snapshot.digimonNamesRequireWikiLookup,
  })

  if (error) {
    const message = userFacingUploadError(error)
    patchMeterRunHistoryUpload(entryId, 'not_uploaded', message)
    return { ok: false, error: message }
  }

  const selfTamer = selfTamerNameFromDungeonMembers(snapshot.members)
  if (selfTamer) {
    void claimAnonymousMeterParsesForTamer(client, selfTamer)
  }

  const ranked = snapshot.dungeon.leaderboardEligible
  const uploadStatus: MeterRunUploadStatus = ranked ? 'uploaded_ranked' : 'uploaded_unranked'
  const detail = deduped
    ? 'Already uploaded — matched existing parse'
    : ranked
      ? 'Clear uploaded — ranked'
      : 'Uploaded — not ranked'

  patchMeterRunHistoryUpload(entryId, uploadStatus, detail)
  return { ok: true, uploadStatus, detail, deduped }
}
