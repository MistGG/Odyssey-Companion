import { useMemo } from 'react'
import type { MonsterSkill, TimelineFightPayload } from '../types'
import type { FlatSkillEntry, QueuedEvent } from '../lib/timelineSchedule'
import { computeEventQueue, groupQueueByFireAt } from '../lib/timelineSchedule'
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

/** Whole-second countdown until `fireAt` (ceil); uses M:SS at ≥60s. */
function formatCountdownLabel(fireAt: number, elapsedMs: number): string {
  if (!Number.isFinite(fireAt) || fireAt === Number.POSITIVE_INFINITY) return '—'
  const remain = Math.max(0, fireAt - elapsedMs)
  const secTotal = Math.ceil(remain / 1000)
  if (secTotal >= 60) {
    const m = Math.floor(secTotal / 60)
    const s = secTotal % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }
  return `${secTotal}s`
}

function CountdownInline({
  fireAt,
  elapsedMs,
  compact,
}: {
  fireAt: number
  elapsedMs: number
  compact?: boolean
}) {
  const label = formatCountdownLabel(fireAt, elapsedMs)
  return (
    <span
      className={`run-queue-row-timer ${compact ? 'run-queue-row-timer--compact' : ''}`}
      aria-hidden
    >
      {label === '—' ? (
        label
      ) : label.includes(':') ? (
        <span className="run-queue-row-timer__value run-queue-row-timer__value--clock">{label}</span>
      ) : (
        <>
          <span className="run-queue-row-timer__value">{label.replace(/s$/, '')}</span>
          <span className="run-queue-row-timer__unit">s</span>
        </>
      )}
    </span>
  )
}

function RunQueueMechanicRow({
  fight,
  q,
  tagBoss,
  fireAt,
  elapsedMs,
  density,
  ariaLabel,
}: {
  fight: TimelineFightPayload
  q: QueuedEvent
  tagBoss: boolean
  fireAt: number
  elapsedMs: number
  density: 'hero' | 'compact'
  ariaLabel: string
}) {
  const b = skillBrief(q.entry.skill)
  const ob = fight.objectives[q.entry.objectiveIndex]
  const n = q.entry.skill.target_count
  const label = formatCountdownLabel(fireAt, elapsedMs)
  const spoken = `${ariaLabel}: ${label}; ${b.attack}; ${b.damage} damage${tagBoss && ob ? ` (${ob.monster_name})` : ''}`

  const rowCls = [
    'run-queue-mechanic-row',
    density === 'hero' ? 'run-queue-mechanic-row--hero' : 'run-queue-mechanic-row--compact',
  ].join(' ')

  return (
    <div className={rowCls} aria-label={spoken}>
      <CountdownInline fireAt={fireAt} elapsedMs={elapsedMs} compact={density === 'compact'} />
      <span className="run-queue-row-target">
        {n > 0 ? (
          <TargetBubble count={n} prominent={density === 'hero'} />
        ) : (
          <span className="run-queue-row-target-dash" title="No target count in data">
            —
          </span>
        )}
      </span>
      <span className="run-queue-row-mechanic" title={b.attack}>
        {tagBoss && ob ? (
          <>
            <span className="run-queue-row-boss muted">{ob.monster_name}</span>
            <span className="run-queue-row-boss-sep muted" aria-hidden>
              {' · '}
            </span>
          </>
        ) : null}
        <span className="run-queue-row-action">{b.attack}</span>
      </span>
      <span className="run-queue-row-damage">{b.damage}</span>
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
  const stackGroups = groups.slice(1)

  return (
    <div className="timeline-carousel timeline-carousel--wide timeline-carousel--compact-run">
      <section className="timeline-carousel-upcoming" aria-labelledby="upcoming-action-label">
        <h2 id="upcoming-action-label" className="timeline-carousel-section-label">
          Upcoming
        </h2>

        <div className="timeline-carousel-group-lines timeline-carousel-group-lines--inline-rows">
          {upcoming.entries.map((q) => (
            <RunQueueMechanicRow
              key={q.entry.key}
              fight={fight}
              q={q}
              tagBoss={showBossTag(upcoming.entries)}
              fireAt={upcoming.fireAt}
              elapsedMs={elapsedMs}
              density="hero"
              ariaLabel="Next mechanic"
            />
          ))}
        </div>
      </section>

      {stackGroups.length > 0 ? (
        <div className="timeline-carousel-stack">
          {stackGroups.map((g) => {
            return (
              <div key={groupDomKey(g)} className="timeline-carousel-stack-row">
                <div className="timeline-carousel-group-lines timeline-carousel-group-lines--inline-rows">
                  {g.entries.map((q) => (
                    <RunQueueMechanicRow
                      key={q.entry.key}
                      fight={fight}
                      q={q}
                      tagBoss={showBossTag(g.entries)}
                      fireAt={g.fireAt}
                      elapsedMs={elapsedMs}
                      density="compact"
                      ariaLabel="Later mechanic"
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
