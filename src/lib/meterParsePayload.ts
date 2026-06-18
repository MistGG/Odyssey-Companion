export type MeterSkillRow = {
  skill: string
  damage: number
  hits: number
  skillKey?: string
  skillIconId?: string | null
  iconUrl?: string
}

export type DigimonSkillBreakdownStored = {
  digimonId: string
  digimonName: string
  iconId: string | null
  portraitUrl?: string
  totalDamage: number
  skills: MeterSkillRow[]
}

export type MeterPartyMemberStored = {
  memberKey: string
  displayLabel: string
  totalDamage: number
  durationSec: number
  skills: MeterSkillRow[]
  tamerName?: string
  currentDigimonName?: string | null
  currentDigimonId?: string | null
  portraitIconId?: string | null
  portraitUrl?: string
  isSelf?: boolean
  meterBarThemeId?: string
  digimons?: DigimonSkillBreakdownStored[]
  leaderboardEligible?: boolean
  died?: boolean
  isDead?: boolean
  deathBeforeClear?: boolean
}

export type MeterParseDungeonStored = {
  dungeonId: string
  dungeonName: string | null
  difficulty: string
  difficultyId: number
  mapName: string | null
  partyId: string | null
  bossTargets: string[]
  runOutcome: 'clear' | 'fail' | null
  invalidatedByManualReset?: boolean
  leaderboardEligible?: boolean
}

type MeterParsePayloadPartyStored = {
  schemaVersion: 2
  kind: 'party'
  partyKey: string
  capturedAtMs: number
  members: MeterPartyMemberStored[]
}

type MeterParsePayloadDungeonPartyStored = {
  schemaVersion: 3
  kind: 'dungeon_party'
  capturedAtMs: number
  sessionDurationSec?: number
  raidTotalDamage?: number
  dungeon: MeterParseDungeonStored
  members: MeterPartyMemberStored[]
}

function isSkillRow(x: unknown): x is MeterSkillRow {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.skill === 'string' &&
    typeof o.damage === 'number' &&
    Number.isFinite(o.damage) &&
    typeof o.hits === 'number' &&
    Number.isFinite(o.hits) &&
    o.hits >= 0
  )
}

function isDigimonBreakdown(x: unknown): x is DigimonSkillBreakdownStored {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.digimonId !== 'string' || typeof o.digimonName !== 'string') return false
  if (typeof o.totalDamage !== 'number' || !Number.isFinite(o.totalDamage)) return false
  if (!Array.isArray(o.skills)) return false
  return o.skills.every(isSkillRow)
}

function isPartyMemberRow(x: unknown): x is MeterPartyMemberStored {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.memberKey !== 'string' || typeof o.displayLabel !== 'string') return false
  if (typeof o.totalDamage !== 'number' || !Number.isFinite(o.totalDamage)) return false
  if (typeof o.durationSec !== 'number' || !Number.isFinite(o.durationSec)) return false
  if (Array.isArray(o.digimons) && o.digimons.every(isDigimonBreakdown)) return true
  if (!Array.isArray(o.skills)) return false
  return o.skills.every(isSkillRow)
}

function isPartyParsePayload(payload: unknown): payload is MeterParsePayloadPartyStored {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  if (p.schemaVersion !== 2 || p.kind !== 'party') return false
  if (typeof p.partyKey !== 'string') return false
  if (!Array.isArray(p.members)) return false
  return p.members.every(isPartyMemberRow)
}

function isDungeonPartyParsePayload(
  payload: unknown,
): payload is MeterParsePayloadDungeonPartyStored {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as Record<string, unknown>
  if (p.schemaVersion !== 3 || p.kind !== 'dungeon_party') return false
  const d = p.dungeon
  if (!d || typeof d !== 'object') return false
  const dungeon = d as Record<string, unknown>
  if (typeof dungeon.dungeonId !== 'string') return false
  if (typeof dungeon.difficulty !== 'string') return false
  if (typeof dungeon.difficultyId !== 'number') return false
  if (!Array.isArray(p.members)) return false
  return p.members.every(isPartyMemberRow)
}

function normalizeSkillRows(skills: unknown): MeterSkillRow[] {
  if (!Array.isArray(skills)) return []
  return skills.filter(isSkillRow)
}

function normalizeDigimonBreakdown(d: DigimonSkillBreakdownStored): DigimonSkillBreakdownStored {
  return { ...d, skills: normalizeSkillRows(d.skills) }
}

export function normalizePartyMember(member: MeterPartyMemberStored): MeterPartyMemberStored {
  const digimons = Array.isArray(member.digimons)
    ? member.digimons.map(normalizeDigimonBreakdown)
    : undefined
  return {
    ...member,
    skills: normalizeSkillRows(member.skills),
    digimons: digimons?.length ? digimons : undefined,
  }
}

export function partyMembersFromPayload(payload: unknown): MeterPartyMemberStored[] {
  if (isDungeonPartyParsePayload(payload)) {
    return payload.members.map(normalizePartyMember)
  }
  if (!isPartyParsePayload(payload)) return []
  return payload.members.map(normalizePartyMember)
}

export function dungeonFromPayload(payload: unknown): MeterParseDungeonStored | null {
  if (!isDungeonPartyParsePayload(payload)) return null
  const d = payload.dungeon
  const bosses = Array.isArray(d.bossTargets)
    ? d.bossTargets.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    : []
  return { ...d, bossTargets: bosses }
}

export function isLeaderboardEligibleDungeonParsePayload(payload: unknown): boolean {
  const dungeon = dungeonFromPayload(payload)
  if (!dungeon) return false
  if (dungeon.invalidatedByManualReset === true) return false
  if (dungeon.leaderboardEligible === false) return false
  if (typeof dungeon.leaderboardEligible === 'boolean') return dungeon.leaderboardEligible
  return dungeon.runOutcome === 'clear'
}

function totalDamageFromSkills(skills: MeterSkillRow[]): number {
  let t = 0
  for (const s of skills) t += s.damage
  return Math.round(t)
}

export function memberDigimonBreakdowns(member: MeterPartyMemberStored): DigimonSkillBreakdownStored[] {
  const normalized = normalizePartyMember(member)
  if (normalized.digimons?.length) return normalized.digimons
  const skills = normalized.skills
  if (!skills.length) return []
  const iconId = normalized.portraitIconId?.trim() || ''
  return [
    {
      digimonId: normalized.currentDigimonId?.trim() || 'unknown',
      digimonName: normalized.currentDigimonName?.trim() || normalized.displayLabel,
      iconId: iconId || null,
      portraitUrl: normalized.portraitUrl,
      totalDamage: normalized.totalDamage,
      skills,
    },
  ]
}

export function memberDamageTotal(member: MeterPartyMemberStored): number {
  const normalized = normalizePartyMember(member)
  const digimons = memberDigimonBreakdowns(normalized)
  if (digimons.length) {
    const sum = digimons.reduce((s, d) => s + Math.max(0, d.totalDamage), 0)
    if (sum > 0) return Math.round(sum)
  }
  if (normalized.skills.length) {
    return totalDamageFromSkills(normalized.skills)
  }
  return Math.round(Math.max(0, normalized.totalDamage))
}

function raidTotalFromPayload(payload: unknown, members: MeterPartyMemberStored[]): number {
  if (isDungeonPartyParsePayload(payload) && typeof payload.raidTotalDamage === 'number') {
    return Math.round(payload.raidTotalDamage)
  }
  let t = 0
  for (const m of members) t += m.totalDamage
  return Math.round(t)
}

export function sessionDurationFromPayload(
  payload: unknown,
  rowDurationSec: number,
  members: MeterPartyMemberStored[],
): number {
  if (isDungeonPartyParsePayload(payload) && typeof payload.sessionDurationSec === 'number') {
    return Math.max(0, payload.sessionDurationSec)
  }
  return Math.max(rowDurationSec, ...members.map((m) => m.durationSec), 0)
}

function partyMemberHasLoggedDigimon(member: MeterPartyMemberStored): boolean {
  return memberDigimonBreakdowns(member).length > 0
}

const MIN_LEADERBOARD_PARTY_DAMAGE_SHARE = 0.02

export function isBrokenMeterPartyParse(
  payload: unknown,
  members: MeterPartyMemberStored[],
): boolean {
  if (!isDungeonPartyParsePayload(payload)) return false
  if (members.length < 2) return false

  if (members.some((m) => !partyMemberHasLoggedDigimon(m))) return true

  const damages = members.map((m) => memberDamageTotal(m))
  const sumMember = damages.reduce((s, d) => s + d, 0)
  const raidTotal = Math.max(raidTotalFromPayload(payload, members), sumMember, 1)
  const maxDmg = Math.max(0, ...damages)
  if (maxDmg <= 0) return false

  if (damages.some((d) => d / raidTotal < MIN_LEADERBOARD_PARTY_DAMAGE_SHARE)) return true

  const nearZeroCount = damages.filter((d) => d < raidTotal * 0.02).length
  const nonzeroCount = damages.filter((d) => d >= raidTotal * 0.02).length

  if (nonzeroCount <= 1 && maxDmg >= raidTotal * 0.88) return true
  if (maxDmg >= raidTotal * 0.9 && nearZeroCount >= members.length - 1) return true

  return false
}
