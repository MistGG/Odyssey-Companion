import type { MonsterSkill } from '../types'
import { formatSkillEffectLabel } from '../lib/effectTypeDisplay'
import {
  formatCastMs,
  formatCooldownMs,
  formatSkillDamage,
  skillsForTimeline,
} from '../lib/skillTimeline'
import { TargetCallout } from './TargetCallout'

type Props = {
  skills: MonsterSkill[]
  /** Must match `flattenFightSkills` keying: objective index in fight. */
  objectiveIndex: number
  /** Full fight roster — Tank Buster vs filler is judged across all bosses. */
  labelContextSkills: readonly MonsterSkill[]
}

function skillRowTitle(skill: MonsterSkill): string | undefined {
  const parts = [
    formatCastMs(skill.cast_time),
    skill.condition ? `${skill.condition} ${skill.condition_val}` : null,
    skill.max_uses != null ? `×${skill.max_uses} uses` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

export function SkillTimelineList({ skills, objectiveIndex, labelContextSkills }: Props) {
  if (!skills.length) {
    return <p className="timeline-hint muted">No skill data.</p>
  }
  const ordered = skillsForTimeline(skills)
  return (
    <ol className="skill-timeline">
      <li className="skill-timeline__header" aria-hidden>
        <span className="skill-timeline__col-when">Every</span>
        <span className="skill-timeline__col-targets">Target</span>
        <span className="skill-timeline__col-action">Action</span>
        <span className="skill-timeline__col-amount">Amount</span>
      </li>
      {ordered.map((s, j) => {
        const rowKey = `${objectiveIndex}-${j}-${s.skill_id}`
        const effectLabel = formatSkillEffectLabel(s, labelContextSkills)
        const rowTitle = skillRowTitle(s)
        return (
          <li key={rowKey} className="skill-timeline__row" title={rowTitle}>
            <span className="skill-timeline__when">{formatCooldownMs(s.cool_time)}</span>
            <span className="skill-timeline__targets">
              {s.target_count > 0 ? (
                <TargetCallout count={s.target_count} variant="mini" />
              ) : (
                <span className="skill-timeline__targets-empty" aria-hidden>
                  —
                </span>
              )}
            </span>
            <span className="skill-timeline__action">{effectLabel}</span>
            <span
              className={`skill-timeline__amount${s.effect_max <= 0 ? ' skill-timeline__amount--empty' : ''}`}
            >
              {formatSkillDamage(s.effect_max)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
