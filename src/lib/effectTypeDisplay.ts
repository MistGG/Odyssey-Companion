import type { MonsterSkill, TimelineFightPayload } from '../types'

/** UI labels for wiki/API effect types (timeline + run queue). */
const EFFECT_TYPE_LABELS: Record<string, string> = {
  'Knock Back': 'Spread',
  'Stacking Debuff': 'Raidwide Damage',
  'Persistent AoE': 'AoE Puddle',
  'Continuous AoE': 'Meteors',
  'Continous AoE': 'Meteors',
}

type SkillEffectFields = Pick<MonsterSkill, 'effect_type' | 'target_count' | 'effect_max'>

/** All monster skills on a fight — shared context for Tank Buster detection. */
export function fightSkillsForLabeling(
  fight: Pick<TimelineFightPayload, 'monsterSkills'>,
): MonsterSkill[] {
  return fight.monsterSkills.flatMap((m) => m.skills ?? [])
}

/** High single-target HP Damage on this fight (e.g. Pinocchimon 42k/48k vs 28k filler). */
export function isTankBusterSkill(
  skill: SkillEffectFields,
  fightSkills: readonly SkillEffectFields[],
): boolean {
  if (skill.effect_type !== 'HP Damage' || skill.target_count !== 1) return false
  const peers = fightSkills.filter(
    (s) => s.effect_type === 'HP Damage' && s.target_count === 1 && s.effect_max > 0,
  )
  if (peers.length < 2) return false
  const avg = peers.reduce((sum, s) => sum + s.effect_max, 0) / peers.length
  return skill.effect_max >= avg * 1.15
}

export function formatEffectTypeDisplay(effectType: string): string {
  return EFFECT_TYPE_LABELS[effectType] ?? effectType
}

/** Timeline / alerts label; rewrites spike single-target HP Damage as Tank Buster. */
export function formatSkillEffectLabel(
  skill: SkillEffectFields,
  fightSkills?: readonly SkillEffectFields[],
): string {
  if (fightSkills?.length && isTankBusterSkill(skill, fightSkills)) {
    return 'Tank Buster'
  }
  return formatEffectTypeDisplay(skill.effect_type)
}
