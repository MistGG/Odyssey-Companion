import type { MonsterSkill } from '../types'
import { formatSkillEffectLabel } from '../lib/effectTypeDisplay'
import { formatCastMs, formatCooldownMs, skillsForTimeline } from '../lib/skillTimeline'
import { TargetBubble } from './TargetBubble'

type Props = {
  skills: MonsterSkill[]
  /** Must match `flattenFightSkills` keying: objective index in fight. */
  objectiveIndex: number
  /** Full fight roster — Tank Buster vs filler is judged across all bosses. */
  labelContextSkills: readonly MonsterSkill[]
}

export function SkillTimelineList({ skills, objectiveIndex, labelContextSkills }: Props) {
  if (!skills.length) {
    return <p className="timeline-hint muted">No skill data.</p>
  }
  const ordered = skillsForTimeline(skills)
  return (
    <ol className="skill-timeline">
      {ordered.map((s, j) => {
        const rowKey = `${objectiveIndex}-${j}-${s.skill_id}`
        const effectLabel = formatSkillEffectLabel(s, labelContextSkills)
        return (
          <li key={rowKey} className="skill-timeline__row">
            <div className="skill-line-main">
              <span className="skill-cd">{formatCooldownMs(s.cool_time)}</span>
              <TargetBubble count={s.target_count} />
              <span className="skill-type">{effectLabel}</span>
            </div>
            <div className="skill-meta">
              {formatCastMs(s.cast_time)}
              {s.condition ? ` · ${s.condition} ${s.condition_val}` : ''}
              {s.max_uses != null ? ` · ×${s.max_uses} uses` : ''}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
