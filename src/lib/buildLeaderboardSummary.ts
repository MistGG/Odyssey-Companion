import type { MeterStreamSession } from './meterEventStream'
import {
  meterMemberSkillBreakdownByDigimon,
  meterPartyRows,
  meterSessionDurationSec,
  streamIconIdForDigimon,
} from './meterEventStream'
import { digimonIdToBucket, isDpsRoleBucket, type MeterRoleBucket } from './meterRoleBuckets'
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

function memberHasDpsAndNonDpsDamage(
  totals: Map<string, number>,
  roleByDigimonId: Map<string, string>,
): boolean {
  let hasDps = false
  let hasNonDps = false
  for (const [id, damage] of totals) {
    if (damage <= 0) continue
    const bucket = digimonIdToBucket(id, roleByDigimonId)
    if (!bucket) continue
    if (isDpsRoleBucket(bucket)) hasDps = true
    else hasNonDps = true
    if (hasDps && hasNonDps) return true
  }
  return false
}

/** Digimon with the highest damage this run (any end-of-run swap, same role or not). */
function memberPrimaryDigimonFromUpload(
  member: MeterDungeonPartyMemberParse,
  roleByDigimonId?: Map<string, string>,
) {
  const totals = new Map<string, number>()
  const rowsById = new Map<string, (typeof member.digimons)[number]>()
  for (const dg of member.digimons) {
    const id = dg.digimonId.trim()
    if (!id) continue
    const damage = Math.max(0, dg.totalDamage)
    totals.set(id, (totals.get(id) ?? 0) + damage)
    const prev = rowsById.get(id)
    if (!prev || damage > Math.max(0, prev.totalDamage)) rowsById.set(id, dg)
  }

  if (roleByDigimonId && memberHasDpsAndNonDpsDamage(totals, roleByDigimonId)) {
    let bestDpsId: string | null = null
    let bestDpsDamage = -1
    for (const [id, damage] of totals) {
      if (!isDpsRoleBucket(digimonIdToBucket(id, roleByDigimonId))) continue
      if (damage > bestDpsDamage) {
        bestDpsDamage = damage
        bestDpsId = id
      }
    }
    if (bestDpsId) return rowsById.get(bestDpsId)
  }

  let bestId: string | null = null
  let bestDamage = -1
  for (const [id, damage] of totals) {
    if (damage > bestDamage) {
      bestDamage = damage
      bestId = id
    }
  }
  return bestId ? rowsById.get(bestId) : undefined
}

function memberLeaderboardDamageFromUpload(
  member: MeterDungeonPartyMemberParse,
  roleByDigimonId?: Map<string, string>,
): number {
  if (member.digimons.length <= 1) return Math.max(0, member.totalDamage)
  const totals = new Map<string, number>()
  for (const dg of member.digimons) {
    const id = dg.digimonId.trim()
    if (!id) continue
    totals.set(id, (totals.get(id) ?? 0) + Math.max(0, dg.totalDamage))
  }
  if (totals.size <= 1) {
    return member.digimons.reduce((sum, dg) => sum + Math.max(0, dg.totalDamage), 0)
  }
  if (roleByDigimonId && memberHasDpsAndNonDpsDamage(totals, roleByDigimonId)) {
    return member.digimons.reduce((sum, dg) => sum + Math.max(0, dg.totalDamage), 0)
  }
  const primary = memberPrimaryDigimonFromUpload(member, roleByDigimonId)
  if (!primary) return Math.max(0, member.totalDamage)
  return Math.max(0, totals.get(primary.digimonId.trim()) ?? 0)
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
    const primary = memberPrimaryDigimonFromUpload(member, roleByDigimonId)
    const digimonId = primary?.digimonId?.trim() || member.currentDigimonId?.trim() || ''
    const iconId =
      primary?.iconId?.trim() ||
      (digimonId ? streamIconIdForDigimon(session, digimonId) : '') ||
      member.portraitIconId?.trim() ||
      null

    const roleBucket = digimonId ? digimonIdToBucket(digimonId, roleByDigimonId) : null
    const memberDur = Math.max(member.durationSec, sessionDur, 1e-6)
    const attributedDamage = memberLeaderboardDamageFromUpload(member, roleByDigimonId)
    const dps = attributedDamage / memberDur
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
