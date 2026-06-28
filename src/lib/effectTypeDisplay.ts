import type { MonsterSkill, TimelineFightPayload } from '../types'

/** UI labels for wiki/API effect types (timeline + run queue). */
const EFFECT_TYPE_LABELS: Record<string, string> = {
  'Knock Back': 'Spread',
  Spreads: 'Spread',
  'Stacking Debuff': 'Raidwide Damage',
  Raidwide: 'Raidwide Damage',
  'Stack Damage': 'Stack',
  'Persistent AoE': 'AoE Puddle',
  Puddles: 'AoE Puddle',
  'Continuous AoE': 'Meteors',
  'Continous AoE': 'Meteors',
  'Repeated Circles': 'Circles',
  Exterminate: 'Enrage',
  'Summon Monster': 'Summon',
}

type SkillEffectFields = Pick<MonsterSkill, 'effect_type' | 'target_count' | 'effect_max'>

/** Wiki lists these as single-target but they hit the full party (4). */
const SINGLE_TARGET_AS_MULTI_EFFECT_TYPES = new Set(['Raidwide', 'Random AoE', 'Stack Damage'])

export const PARTY_WIDE_TARGET_COUNT = 4

/** Correct wiki target_count for timeline + boss alerts. */
export function normalizeSkillTargetCount(effectType: string, targetCount: number): number {
  if (targetCount === 1 && SINGLE_TARGET_AS_MULTI_EFFECT_TYPES.has(effectType.trim())) {
    return PARTY_WIDE_TARGET_COUNT
  }
  return targetCount
}

/** All monster skills on a fight — shared context for Tank Buster detection. */
export function fightSkillsForLabeling(
  fight: Pick<TimelineFightPayload, 'monsterSkills'>,
): MonsterSkill[] {
  return fight.monsterSkills.flatMap((m) => m.skills ?? [])
}

function hpDamagePeers(fightSkills: readonly SkillEffectFields[]): SkillEffectFields[] {
  return fightSkills.filter(
    (s) => s.effect_type === 'HP Damage' && s.target_count === 1 && s.effect_max > 0,
  )
}

/** High single-target HP Damage on this fight (e.g. Seadragon 95k vs 70k filler). */
export function isTankBusterSkill(
  skill: SkillEffectFields,
  fightSkills: readonly SkillEffectFields[],
): boolean {
  if (skill.effect_type !== 'HP Damage' || skill.target_count !== 1) return false
  const peers = hpDamagePeers(fightSkills)
  if (peers.length < 2) return false
  const minPeer = Math.min(...peers.map((s) => s.effect_max))
  return skill.effect_max > minPeer && skill.effect_max >= minPeer * 1.15
}

/** Lower single-target HP Damage tier when a Tank Buster exists on the same fight. */
export function isTankHitSkill(
  skill: SkillEffectFields,
  fightSkills: readonly SkillEffectFields[],
): boolean {
  if (skill.effect_type !== 'HP Damage' || skill.target_count !== 1) return false
  if (isTankBusterSkill(skill, fightSkills)) return false
  return hpDamagePeers(fightSkills).some((s) => isTankBusterSkill(s, fightSkills))
}

export function formatEffectTypeDisplay(effectType: string): string {
  return EFFECT_TYPE_LABELS[effectType] ?? effectType
}

/** Timeline / alerts label; rewrites spike single-target HP Damage as Tank Buster. */
export function formatSkillEffectLabel(
  skill: SkillEffectFields & Pick<MonsterSkill, 'display_label'>,
  fightSkills?: readonly SkillEffectFields[],
): string {
  const explicit = skill.display_label?.trim()
  if (explicit) return explicit
  if (fightSkills?.length) {
    if (isTankBusterSkill(skill, fightSkills)) return 'Tank Buster'
    if (isTankHitSkill(skill, fightSkills)) return 'Tank Hit'
  }
  return formatEffectTypeDisplay(skill.effect_type)
}
