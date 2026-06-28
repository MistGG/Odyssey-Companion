import type { MonsterSkill } from '../types'
import { formatSkillEffectLabel } from '../lib/effectTypeDisplay'
import {
  formatAtMs,
  formatCastMs,
  formatCooldownMs,
  formatSkillDamage,
} from '../lib/skillTimeline'
import type { FlatSkillEntry } from '../lib/timelineSchedule'
import { TargetCallout } from './TargetCallout'

type Props = {
  entries: FlatSkillEntry[]
  /** Full fight roster — Tank Buster vs filler is judged across all bosses. */
  labelContextSkills: readonly MonsterSkill[]
  /** When true, the when-column shows pull timestamps instead of cooldown intervals. */
  absoluteTiming?: boolean
}

function skillRowTitle(skill: MonsterSkill): string | undefined {
  const parts = [
    formatCastMs(skill.cast_time),
    skill.condition ? `${skill.condition} ${skill.condition_val}` : null,
    skill.max_uses != null ? `×${skill.max_uses} uses` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}

function whenLabel(entry: FlatSkillEntry, absoluteTiming: boolean): string {
  if (absoluteTiming || entry.skill.fire_at_ms != null) {
    return formatAtMs(entry.skill.fire_at_ms ?? entry.skill.cool_time)
  }
  return formatCooldownMs(entry.skill.cool_time)
}

export function SkillTimelineList({
  entries,
  labelContextSkills,
  absoluteTiming = false,
}: Props) {
  if (!entries.length) {
    return <p className="timeline-hint muted">No skill data.</p>
  }
  const whenHeader = absoluteTiming ? 'At' : 'Every'
  return (
    <ol className="skill-timeline">
      <li className="skill-timeline__header" aria-hidden>
        <span className="skill-timeline__col-when">{whenHeader}</span>
        <span className="skill-timeline__col-targets">Target</span>
        <span className="skill-timeline__col-action">Action</span>
        <span className="skill-timeline__col-amount">Amount</span>
      </li>
      {entries.map((entry) => {
        const s = entry.skill
        const rowKey = entry.key
        const effectLabel = formatSkillEffectLabel(s, labelContextSkills)
        const rowTitle = skillRowTitle(s)
        return (
          <li key={rowKey} className="skill-timeline__row" title={rowTitle}>
            <span className="skill-timeline__when">{whenLabel(entry, absoluteTiming)}</span>
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
