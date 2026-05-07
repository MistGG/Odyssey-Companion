import { useMemo, type CSSProperties } from 'react'
import type { MonsterSkill, TimelineFightPayload } from '../types'
import type { FlatSkillEntry, QueuedEvent } from '../lib/timelineSchedule'
import {
  computeEventQueue,
  groupQueueByFireAt,
  sequentialGroupProgress,
} from '../lib/timelineSchedule'
import { formatEffectTypeDisplay } from '../lib/effectTypeDisplay'
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
    attack: formatEffectTypeDisplay(skill.effect_type),
    damage: formatDamageMax(skill),
  }
}

function groupDomKey(g: { fireAt: number; entries: QueuedEvent[] }) {
  return `${g.fireAt}:${g.entries.map((e) => e.entry.key).join('|')}`
}

/** Integer % for bar width — rounding the bar *width* to whole % made fills look stepped at ~60fps. */
function pctInt(p: number): number {
  return Math.min(100, Math.max(0, Math.round(p * 100)))
}

/** Whole-second countdown until `fireAt` (ceil), for bar labels. */
function formatBarCountdown(fireAt: number, elapsedMs: number): string {
  if (!Number.isFinite(fireAt) || fireAt === Number.POSITIVE_INFINITY) return '—'
  const remain = Math.max(0, fireAt - elapsedMs)
  const sec = Math.ceil(remain / 1000)
  return `${sec}s`
}

function barFillWidthStyle(p: number): CSSProperties {
  const w = Math.min(100, Math.max(0, p * 100))
  return { width: `${w}%` }
}

function RunQueueTimingRow({
  fireAt,
  elapsedMs,
  progress,
  compactBar,
  ariaBarLabel,
}: {
  fireAt: number
  elapsedMs: number
  progress: number
  compactBar?: boolean
  ariaBarLabel: string
}) {
  const label = formatBarCountdown(fireAt, elapsedMs)
  return (
    <div className="timeline-run-queue-timing">
      <span className="timeline-run-queue-countdown" aria-hidden>
        {label === '—' ? (
          label
        ) : (
          <>
            <span className="timeline-run-queue-countdown__value">{label.replace(/s$/, '')}</span>
            <span className="timeline-run-queue-countdown__unit">s</span>
          </>
        )}
      </span>
      <div
        className={`skill-schedule-bar timeline-run-queue-bar ${compactBar ? 'timeline-run-queue-bar--stack' : 'timeline-run-queue-bar--hero'}`}
        role="progressbar"
        aria-valuenow={pctInt(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${label} until cast`}
        aria-label={ariaBarLabel}
      >
        <div className="skill-schedule-bar__fill" style={barFillWidthStyle(progress)} />
      </div>
    </div>
  )
}

function RunQueueMechanicCard({
  fight,
  q,
  tagBoss,
}: {
  fight: TimelineFightPayload
  q: QueuedEvent
  tagBoss: boolean
}) {
  const b = skillBrief(q.entry.skill)
  const ob = fight.objectives[q.entry.objectiveIndex]
  const n = q.entry.skill.target_count
  return (
    <div className="run-queue-mechanic-card">
      {tagBoss && ob ? <div className="run-queue-boss-line muted">{ob.monster_name}</div> : null}
      <div className="run-queue-mechanic-body">
        <div className="run-queue-target-block">
          {n > 0 ? (
            <>
              <TargetBubble count={n} prominent />
              <span className="run-queue-target-label">Targets hit</span>
            </>
          ) : (
            <>
              <span className="run-queue-target-placeholder" title="No target count in data">
                —
              </span>
              <span className="run-queue-target-label">Targets hit</span>
            </>
          )}
        </div>
        <div className="run-queue-main-facts">
          <span className="run-queue-action">{b.attack}</span>
          <span className="run-queue-damage">{b.damage}</span>
        </div>
      </div>
    </div>
  )
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
        <RunQueueTimingRow
          fireAt={upcoming.fireAt}
          elapsedMs={elapsedMs}
          progress={upcomingProg}
          ariaBarLabel="Time until this mechanic"
        />

        <div className="timeline-carousel-group-lines timeline-carousel-group-lines--cards">
          {upcoming.entries.map((q) => (
            <RunQueueMechanicCard
              key={q.entry.key}
              fight={fight}
              q={q}
              tagBoss={showBossTag(upcoming.entries)}
            />
          ))}
        </div>
      </section>

      {stackGroups.length > 0 ? (
        <div className="timeline-carousel-stack">
          {stackGroups.map((g, gi) => {
            const prog = sequentialGroupProgress(groups, gi + 1, elapsedMs)
            return (
              <div key={groupDomKey(g)} className="timeline-carousel-stack-row">
                <span className="timeline-carousel-cue muted">{gi === 0 ? 'Next' : 'Then'}</span>
                <RunQueueTimingRow
                  fireAt={g.fireAt}
                  elapsedMs={elapsedMs}
                  progress={prog}
                  compactBar
                  ariaBarLabel={gi === 0 ? 'Time until next wave' : 'Time until later wave'}
                />
                <div className="timeline-carousel-group-lines timeline-carousel-group-lines--cards">
                  {g.entries.map((q) => (
                    <RunQueueMechanicCard
                      key={q.entry.key}
                      fight={fight}
                      q={q}
                      tagBoss={showBossTag(g.entries)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
