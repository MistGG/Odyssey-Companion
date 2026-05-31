import type { MonsterSkill } from '../types'

/** Order skills by cooldown (shortest first) for a readable fight timeline. */
export function skillsForTimeline(skills: MonsterSkill[]) {
  return [...skills].sort((a, b) => {
    if (a.cool_time !== b.cool_time) return a.cool_time - b.cool_time
    return a.skill_id - b.skill_id
  })
}

export function formatCooldownMs(ms: number) {
  const sec = Math.max(0, Math.round(ms / 1000))
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const r = sec % 60
  return r ? `${m}m ${r}s` : `${m}m`
}

export function formatCastMs(ms: number) {
  if (ms <= 0) return 'instant'
  return `${(ms / 1000).toFixed(1)}s cast`
}

/** Compact damage readout for timeline rows (0 / invalid → em dash). */
export function formatSkillDamage(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '—'
  return amount.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
