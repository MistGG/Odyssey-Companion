import { useMemo, type CSSProperties } from 'react'
import type { MonsterSkill, TimelineFightPayload } from '../types'
import type { FlatSkillEntry, QueuedEvent } from '../lib/timelineSchedule'
import {
  computeEventQueue,
  groupQueueByFireAt,
  sequentialGroupProgress,
} from '../lib/timelineSchedule'
import { TargetBubble } from './TargetBubble'

type Props = {
  fight: TimelineFightPayload
  flatSkills: FlatSkillEntry[]
  elapsedMs: number
}

function showBossTag(entries: QueuedEvent[]) {
  return new Set(entries.map((e) => e.entry.objectiveIndex)).size > 1
}

function formatDamageMax(s: MonsterSkill): string {
  return String(s.effect_max)
}

function skillBrief(skill: MonsterSkill) {
  return {
    attack: skill.effect_type,
    damage: formatDamageMax(skill),
  }
}

function groupDomKey(g: { fireAt: number; entries: QueuedEvent[] }) {
  return `${g.fireAt}:${g.entries.map((e) => e.entry.key).join('|')}`
}

/** Integer % for labels and ARIA — rounding the bar *width* to whole % made fills look stepped at ~60fps. */
function pctInt(p: number): number {
  return Math.min(100, Math.max(0, Math.round(p * 100)))
}

function barFillWidthStyle(p: number): CSSProperties {
  const w = Math.min(100, Math.max(0, p * 100))
  return { width: `${w}%` }
}

export function TimelineRunQueue({ fight, flatSkills, elapsedMs }: Props) {
  const queue = useMemo(
    () => computeEventQueue(flatSkills, elapsedMs, 24),
    [flatSkills, elapsedMs],
  )

  const groups = useMemo(() => groupQueueByFireAt(queue), [queue])

  if (!groups.length) {
    return (
      <div className="timeline-run-queue timeline-run-queue--empty muted">
        No cooldown skills to schedule — use the full timeline below after Reset.
      </div>
    )
  }

  const upcoming = groups[0]!
  const upcomingProg = sequentialGroupProgress(groups, 0, elapsedMs)
  const stackGroups = groups.slice(1)

  return (
    <div className="timeline-carousel timeline-carousel--wide">
      <section className="timeline-carousel-upcoming" aria-labelledby="upcoming-action-label">
        <h2 id="upcoming-action-label" className="timeline-carousel-section-label">
          Upcoming
        </h2>
        <div className="timeline-carousel-bar-row">
          <div
            className="skill-schedule-bar skill-schedule-bar--compact-hero timeline-carousel-schedule-bar"
            role="progressbar"
            aria-valuenow={pctInt(upcomingProg)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Time until this mechanic"
          >
            <div
              className="skill-schedule-bar__fill"
              style={barFillWidthStyle(upcomingProg)}
            />
          </div>
          <span className="timeline-carousel-bar-pct muted" aria-hidden>
            {pctInt(upcomingProg)}%
          </span>
        </div>

        <div className="timeline-carousel-group-lines">
          {upcoming.entries.map((q) => {
            const b = skillBrief(q.entry.skill)
            const ob = fight.objectives[q.entry.objectiveIndex]
            const tagBoss = showBossTag(upcoming.entries)
            return (
              <p key={q.entry.key} className="timeline-carousel-line timeline-carousel-line--hero">
                {tagBoss && ob ? (
                  <>
                    <span className="timeline-carousel-boss-tag">{ob.monster_name}</span>
                    <span className="timeline-carousel-sep" aria-hidden>
                      {' '}
                      ·{' '}
                    </span>
                  </>
                ) : null}
                <TargetBubble count={q.entry.skill.target_count} />
                <span className="timeline-carousel-attack">{b.attack}</span>
                <span className="timeline-carousel-sep" aria-hidden>
                  {' '}
                  ·{' '}
                </span>
                <span className="timeline-carousel-damage">{b.damage}</span>
              </p>
            )
          })}
        </div>
      </section>

      {stackGroups.length > 0 ? (
        <div className="timeline-carousel-stack">
          {stackGroups.map((g, gi) => {
            const prog = sequentialGroupProgress(groups, gi + 1, elapsedMs)
            return (
              <div key={groupDomKey(g)} className="timeline-carousel-stack-row">
                <span className="timeline-carousel-cue muted">{gi === 0 ? 'Next' : 'Then'}</span>
                <div className="timeline-carousel-bar-row">
                  <div
                    className="skill-schedule-bar skill-schedule-bar--compact-stack timeline-carousel-schedule-bar"
                    role="progressbar"
                    aria-valuenow={pctInt(prog)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={gi === 0 ? 'Progress until next wave' : 'Progress until later wave'}
                  >
                    <div
                      className="skill-schedule-bar__fill"
                      style={barFillWidthStyle(prog)}
                    />
                  </div>
                  <span className="timeline-carousel-bar-pct muted" aria-hidden>
                    {pctInt(prog)}%
                  </span>
                </div>
                <div className="timeline-carousel-group-lines">
                  {g.entries.map((q) => {
                    const b = skillBrief(q.entry.skill)
                    const ob = fight.objectives[q.entry.objectiveIndex]
                    const tagBoss = showBossTag(g.entries)
                    return (
                      <p key={q.entry.key} className="timeline-carousel-line timeline-carousel-line--stack">
                        {tagBoss && ob ? (
                          <>
                            <span className="timeline-carousel-boss-tag">{ob.monster_name}</span>
                            <span className="timeline-carousel-sep" aria-hidden>
                              {' '}
                              ·{' '}
                            </span>
                          </>
                        ) : null}
                        <TargetBubble count={q.entry.skill.target_count} />
                        <span className="timeline-carousel-attack">{b.attack}</span>
                        <span className="timeline-carousel-sep" aria-hidden>
                          {' '}
                          ·{' '}
                        </span>
                        <span className="timeline-carousel-damage">{b.damage}</span>
                      </p>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
