import { useMemo } from 'react'
import type { MonsterSkill, TimelineFightPayload } from '../types'
import type { FlatSkillEntry, QueuedEvent, QueuedGroup } from '../lib/timelineSchedule'
import { computeEventQueue, groupQueueByFireAt } from '../lib/timelineSchedule'
import { fightSkillsForLabeling, formatSkillEffectLabel } from '../lib/effectTypeDisplay'
import { formatSkillDamage } from '../lib/skillTimeline'
import { TargetCallout } from './TargetCallout'

type Props = {
  fight: TimelineFightPayload
  flatSkills: FlatSkillEntry[]
  elapsedMs: number
}

const MAX_VISIBLE_GROUPS = 5
const MAX_QUEUE_ROWS = 12

function showBossTag(entries: QueuedEvent[]) {
  return new Set(entries.map((e) => e.entry.objectiveIndex)).size > 1
}

function groupDomKey(g: QueuedGroup) {
  return `${g.fireAt}:${g.entries.map((e) => e.entry.key).join('|')}`
}

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

function pickPrimaryEntry(entries: QueuedEvent[]): {
  primary: QueuedEvent
  also: QueuedEvent[]
} {
  if (entries.length <= 1) {
    return { primary: entries[0]!, also: [] }
  }
  const sorted = [...entries].sort(
    (a, b) => b.entry.skill.effect_max - a.entry.skill.effect_max,
  )
  return { primary: sorted[0]!, also: sorted.slice(1) }
}

function CountdownBadge({
  fireAt,
  elapsedMs,
  hero,
}: {
  fireAt: number
  elapsedMs: number
  hero?: boolean
}) {
  const label = formatCountdownLabel(fireAt, elapsedMs)
  const cls = ['run-queue-countdown', hero ? 'run-queue-countdown--hero' : 'run-queue-countdown--compact']
    .filter(Boolean)
    .join(' ')

  if (label === '—') {
    return (
      <span className={cls} aria-hidden>
        —
      </span>
    )
  }

  if (label.includes(':')) {
    return (
      <span className={cls} aria-hidden>
        <span className="run-queue-countdown__value">{label}</span>
      </span>
    )
  }

  if (!hero) {
    return (
      <span className={cls} aria-hidden>
        {label}
      </span>
    )
  }

  const sec = label.replace(/s$/, '')
  return (
    <span className={cls} aria-hidden>
      <span className="run-queue-countdown__value">{sec}</span>
      <span className="run-queue-countdown__unit">s</span>
    </span>
  )
}

function HeroMechanicCard({
  fight,
  q,
  fightSkills,
  tagBoss,
  also,
}: {
  fight: TimelineFightPayload
  fightSkills: readonly MonsterSkill[]
  q: QueuedEvent
  tagBoss: boolean
  also: QueuedEvent[]
}) {
  const attack = formatSkillEffectLabel(q.entry.skill, fightSkills)
  const damage = formatSkillDamage(q.entry.skill.effect_max)
  const ob = fight.objectives[q.entry.objectiveIndex]
  const n = q.entry.skill.target_count

  return (
    <div className="run-queue-hero-mechanic">
      <div className="run-queue-hero-mechanic__target">
        <TargetCallout count={n} variant="hero" />
      </div>
      <div className="run-queue-hero-mechanic__main">
        {tagBoss && ob ? (
          <span className="run-queue-hero-mechanic__boss muted">{ob.monster_name}</span>
        ) : null}
        <span className="run-queue-hero-mechanic__action">{attack}</span>
        {also.length > 0 ? (
          <span className="run-queue-hero-mechanic__also muted">
            +{also.length} more at same time:{' '}
            {also
              .map((e) => {
                const a = formatSkillEffectLabel(e.entry.skill, fightSkills)
                const d = formatSkillDamage(e.entry.skill.effect_max)
                return `${a} ${d}`
              })
              .join(' · ')}
          </span>
        ) : null}
      </div>
      <div className="run-queue-hero-mechanic__damage">{damage}</div>
    </div>
  )
}

function CompactWaveRow({
  fight,
  group,
  elapsedMs,
  fightSkills,
}: {
  fight: TimelineFightPayload
  group: QueuedGroup
  elapsedMs: number
  fightSkills: readonly MonsterSkill[]
}) {
  const tagBoss = showBossTag(group.entries)
  const { primary, also } = pickPrimaryEntry(group.entries)
  const attack = formatSkillEffectLabel(primary.entry.skill, fightSkills)
  const damage = formatSkillDamage(primary.entry.skill.effect_max)
  const ob = fight.objectives[primary.entry.objectiveIndex]
  const n = primary.entry.skill.target_count
  const extra = also.length > 0 ? ` +${also.length}` : ''

  return (
    <div
      className="run-queue-compact-wave"
      title={group.entries
        .map((q) => {
          const a = formatSkillEffectLabel(q.entry.skill, fightSkills)
          const d = formatSkillDamage(q.entry.skill.effect_max)
          return `${a} ${d}`
        })
        .join('; ')}
    >
      <div className="run-queue-compact-wave__time">
        <CountdownBadge fireAt={group.fireAt} elapsedMs={elapsedMs} />
      </div>
      <div className="run-queue-compact-wave__target">
        {n > 0 ? <TargetCallout count={n} variant="compact" /> : null}
      </div>
      <div className="run-queue-compact-wave__action">
        {tagBoss && ob ? (
          <span className="run-queue-compact-wave__boss muted">{ob.monster_name}: </span>
        ) : null}
        {attack}
        {extra ? <span className="run-queue-compact-wave__extra muted">{extra}</span> : null}
      </div>
      <div className="run-queue-compact-wave__damage">{damage}</div>
    </div>
  )
}

function HeroNextWave({
  fight,
  group,
  elapsedMs,
}: {
  fight: TimelineFightPayload
  group: QueuedGroup
  elapsedMs: number
}) {
  const fightSkills = fightSkillsForLabeling(fight)
  const tagBoss = showBossTag(group.entries)
  const { primary, also } = pickPrimaryEntry(group.entries)
  const label = formatCountdownLabel(group.fireAt, elapsedMs)

  return (
    <article
      className="run-queue-hero-card"
      aria-label={`Next in ${label}: ${formatSkillEffectLabel(primary.entry.skill, fightSkills)}`}
    >
      <div className="run-queue-hero-card__timer">
        <CountdownBadge fireAt={group.fireAt} elapsedMs={elapsedMs} hero />
      </div>
      <HeroMechanicCard
        fight={fight}
        fightSkills={fightSkills}
        q={primary}
        tagBoss={tagBoss}
        also={also}
      />
    </article>
  )
}

export function TimelineRunQueue({ fight, flatSkills, elapsedMs }: Props) {
  const fightSkills = useMemo(() => fightSkillsForLabeling(fight), [fight])

  const queue = useMemo(
    () => computeEventQueue(flatSkills, elapsedMs, MAX_QUEUE_ROWS),
    [flatSkills, elapsedMs],
  )

  const groups = useMemo(() => groupQueueByFireAt(queue), [queue])
  const visibleGroups = groups.slice(0, MAX_VISIBLE_GROUPS)
  const hiddenGroupCount = Math.max(0, groups.length - visibleGroups.length)

  if (!groups.length) {
    return (
      <div className="timeline-run-queue timeline-run-queue--empty muted">
        No cooldown skills to schedule — use the full timeline below after Reset.
      </div>
    )
  }

  const upcoming = visibleGroups[0]!
  const stackGroups = visibleGroups.slice(1)

  return (
    <div className="timeline-carousel timeline-carousel--wide timeline-carousel--compact-run">
      <section className="timeline-carousel-upcoming" aria-labelledby="upcoming-action-label">
        <h2 id="upcoming-action-label" className="sr-only">
          Next mechanic
        </h2>
        <HeroNextWave fight={fight} group={upcoming} elapsedMs={elapsedMs} />
      </section>

      {stackGroups.length > 0 ? (
        <div className="timeline-carousel-stack">
          <p className="timeline-carousel-section-label timeline-carousel-section-label--stack">Then</p>
          <div className="run-queue-compact-list">
            {stackGroups.map((g) => (
              <CompactWaveRow
                key={groupDomKey(g)}
                fight={fight}
                group={g}
                elapsedMs={elapsedMs}
                fightSkills={fightSkills}
              />
            ))}
          </div>
          {hiddenGroupCount > 0 ? (
            <p className="timeline-run-queue-overflow muted">
              +{hiddenGroupCount} more wave{hiddenGroupCount === 1 ? '' : 's'} not shown
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
