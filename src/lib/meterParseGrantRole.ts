import {
  isBrokenMeterPartyParse,
  memberDamageTotal,
  memberDigimonBreakdowns,
  sessionDurationFromPayload,
  type MeterPartyMemberStored,
} from './meterParsePayload'

export type MeterRoleBucket = 'melee' | 'ranged' | 'caster' | 'hybrid' | 'tank' | 'healer'

export const METER_ROLE_BUCKETS: MeterRoleBucket[] = [
  'melee',
  'ranged',
  'caster',
  'hybrid',
  'tank',
  'healer',
]

export function normalizePlayerKey(member: MeterPartyMemberStored): string {
  const raw = member.tamerName?.trim() || member.displayLabel.trim()
  return raw.toLowerCase()
}

export function playerDisplayName(member: MeterPartyMemberStored): string {
  return member.tamerName?.trim() || member.displayLabel.trim()
}

function digimonIdDamageTotals(
  digimons: ReturnType<typeof memberDigimonBreakdowns>,
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const dg of digimons) {
    const id = dg.digimonId.trim()
    if (!id) continue
    totals.set(id, (totals.get(id) ?? 0) + Math.max(0, dg.totalDamage))
  }
  return totals
}

function memberTopDigimonUsed(member: MeterPartyMemberStored) {
  const digimons = memberDigimonBreakdowns(member)
  const totals = digimonIdDamageTotals(digimons)
  let bestId: string | null = null
  let bestDamage = -1
  for (const [id, damage] of totals) {
    if (damage > bestDamage) {
      bestDamage = damage
      bestId = id
    }
  }
  if (!bestId) return null
  let bestRow: (typeof digimons)[number] | null = null
  let bestRowDamage = -1
  for (const dg of digimons) {
    if (dg.digimonId.trim() !== bestId) continue
    const damage = Math.max(0, dg.totalDamage)
    if (damage > bestRowDamage) {
      bestRowDamage = damage
      bestRow = dg
    }
  }
  return bestRow
}

function memberLeaderboardDamage(member: MeterPartyMemberStored): number {
  const digimons = memberDigimonBreakdowns(member)
  if (digimons.length <= 1) return memberDamageTotal(member)
  const totals = digimonIdDamageTotals(digimons)
  if (totals.size <= 1) return memberDamageTotal(member)
  const top = memberTopDigimonUsed(member)
  if (!top) return memberDamageTotal(member)
  const dmg = Math.max(0, totals.get(top.digimonId.trim()) ?? 0)
  return dmg > 0 ? dmg : memberDamageTotal(member)
}

export function memberDpsInParse(
  member: MeterPartyMemberStored,
  payload: unknown,
  rowDurationSec: number,
  members: MeterPartyMemberStored[],
): number {
  if (isBrokenMeterPartyParse(payload, members)) return 0
  const damage = memberLeaderboardDamage(member)
  const sessionDur = sessionDurationFromPayload(payload, rowDurationSec, members)
  const dur = Math.max(sessionDur, member.durationSec, 1e-6)
  return dur > 0 ? damage / dur : 0
}
