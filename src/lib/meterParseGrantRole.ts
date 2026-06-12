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

function memberTopDigimonUsed(member: MeterPartyMemberStored) {
  const digimons = memberDigimonBreakdowns(member)
  let best: (typeof digimons)[number] | null = null
  let bestDamage = -1
  for (const dg of digimons) {
    const damage = Math.max(0, dg.totalDamage)
    if (damage > bestDamage) {
      bestDamage = damage
      best = dg
    }
  }
  return best
}

function memberLeaderboardDamage(member: MeterPartyMemberStored): number {
  const digimons = memberDigimonBreakdowns(member)
  if (digimons.length <= 1) return memberDamageTotal(member)
  const top = memberTopDigimonUsed(member)
  if (!top) return memberDamageTotal(member)
  const row = digimons.find((d) => d.digimonId === top.digimonId)
  const dmg = Math.max(0, row?.totalDamage ?? 0)
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
