import type { MeterStreamSession } from './meterEventStream'
import {
  meterMemberSkillBreakdownByDigimon,
  meterPartyRows,
  meterSessionDurationSec,
  streamIconIdForDigimon,
} from './meterEventStream'
import { digimonIdToBucket, type MeterRoleBucket } from './meterRoleBuckets'
import type { MeterDungeonPartyMemberParse, MeterParseDungeonContext } from './supabaseMeter'

export type LeaderboardSummaryMember = {
  playerKey: string
  displayName: string
  dps: number
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  roleBucket: MeterRoleBucket | null
}

export type MeterLeaderboardSummary = {
  version: 1
  eligible: boolean
  sessionDurationSec: number
  members: LeaderboardSummaryMember[]
}

function normalizePlayerKey(tamerName: string, displayLabel: string): string {
  return (tamerName.trim() || displayLabel.trim()).toLowerCase()
}

function memberPrimaryDigimonFromUpload(member: MeterDungeonPartyMemberParse) {
  const dur = Math.max(member.durationSec, 1e-6)
  let best = member.digimons[0]
  let bestDps = -1
  for (const dg of member.digimons) {
    const dps = dg.totalDamage / dur
    if (dps > bestDps) {
      bestDps = dps
      best = dg
    }
  }
  return best
}

export function buildMeterLeaderboardSummary(
  session: MeterStreamSession,
  dungeon: MeterParseDungeonContext,
  members: MeterDungeonPartyMemberParse[],
  durationSec: number,
): MeterLeaderboardSummary {
  if (!dungeon.leaderboardEligible) {
    return { version: 1, eligible: false, sessionDurationSec: durationSec, members: [] }
  }

  const roleByDigimonId = new Map<string, string>()
  for (const [id, cache] of session.wikiByDigimonId) {
    if (cache.role?.trim()) roleByDigimonId.set(id, cache.role.trim())
  }

  const sessionDur = Math.max(durationSec, meterSessionDurationSec(session), 1e-6)
  const out: LeaderboardSummaryMember[] = []

  for (const member of members) {
    const primary = memberPrimaryDigimonFromUpload(member)
    const digimonId = primary?.digimonId?.trim() || member.currentDigimonId?.trim() || ''
    const iconId =
      primary?.iconId?.trim() ||
      (digimonId ? streamIconIdForDigimon(session, digimonId) : '') ||
      member.portraitIconId?.trim() ||
      null

    const roleBucket = digimonId ? digimonIdToBucket(digimonId, roleByDigimonId) : null
    const memberDur = Math.max(member.durationSec, sessionDur, 1e-6)
    const dps = member.totalDamage / memberDur
    const wikiName = digimonId ? session.wikiByDigimonId.get(digimonId)?.digimonName?.trim() : ''
    const storedName =
      primary?.digimonName?.trim() || member.currentDigimonName?.trim() || member.displayLabel.trim()

    out.push({
      playerKey: normalizePlayerKey(member.tamerName, member.displayLabel),
      displayName: member.tamerName.trim() || member.displayLabel.trim(),
      dps,
      digimonId,
      digimonName: wikiName || storedName,
      iconId: iconId || null,
      portraitUrl: primary?.portraitUrl || member.portraitUrl,
      roleBucket,
    })
  }

  return {
    version: 1,
    eligible: true,
    sessionDurationSec: sessionDur,
    members: out,
  }
}

/** Digimon ids used in the current party meter (for wiki role prefetch). */
export function collectPartyDigimonIds(session: MeterStreamSession, nowMs = Date.now()): string[] {
  const ids = new Set<string>()
  for (const row of meterPartyRows(session, nowMs)) {
    for (const group of meterMemberSkillBreakdownByDigimon(session, row.key)) {
      const id = group.digimonId.trim()
      if (id) ids.add(id)
    }
  }
  return [...ids]
}
