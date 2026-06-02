import type { EventStreamRecord } from './eventStreamFormat'
import autoAttackIconUrl from '../assets/auto_attack.png'

export const METER_AUTO_ATTACK_LABEL = 'Auto Attack'

/** Canonical skill bucket key for meter breakdown rows. */
export const METER_BASIC_ATTACK_SKILL_KEY = '(basic)'

/** EventStream / wiki skill id for default attacks. */
export function isMeterBasicAttackSkillKey(skillKey: string): boolean {
  const k = skillKey.trim().toLowerCase()
  return k === '(basic)' || k === 'basic'
}

/**
 * EventStream sends auto attacks as `hit_taken` (attacker + damage, no skill_id).
 * `(basic)` only appears in debug text formatting, not in raw JSON.
 */
export function isMeterBasicAttackEvent(ev: EventStreamRecord): boolean {
  const t = String(ev.type ?? '').trim()
  if (t === 'hit_taken') {
    const dmg = Number(ev.damage)
    return Number.isFinite(dmg) && dmg > 0
  }
  const rawSkill = String(ev.skill ?? '').trim()
  if (isMeterBasicAttackSkillKey(rawSkill)) return true
  const sid = String(ev.skill_id ?? ev.skillId ?? '').trim()
  return isMeterBasicAttackSkillKey(sid)
}

/**
 * `skill_use` / `party_skill` rows for default attacks — skip crediting; the matching
 * `hit_taken` event carries the same damage.
 */
export function isMeterBasicSkillUseEvent(ev: EventStreamRecord): boolean {
  const t = String(ev.type ?? '').trim()
  if (t !== 'skill_use' && t !== 'party_skill') return false
  const rawSkill = String(ev.skill ?? '').trim()
  if (isMeterBasicAttackSkillKey(rawSkill)) return true
  const sid = String(ev.skill_id ?? ev.skillId ?? '').trim()
  return isMeterBasicAttackSkillKey(sid)
}

export function meterBasicAttackIconUrl(): string {
  return autoAttackIconUrl
}

export function meterBasicAttackPresentation(skillKey: string): {
  skillName: string
  skillIconId: string
  iconUrl: string
} | null {
  if (!isMeterBasicAttackSkillKey(skillKey)) return null
  return {
    skillName: METER_AUTO_ATTACK_LABEL,
    skillIconId: '',
    iconUrl: meterBasicAttackIconUrl(),
  }
}
