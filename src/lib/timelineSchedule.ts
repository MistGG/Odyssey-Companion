import type {
  FightTimelineScheduledEvent,
  FightTimelineSchedule,
  MonsterSkill,
  TimelineFightPayload,
} from '../types'
import { skillsForTimeline } from './skillTimeline'

export type FlatSkillEntry = {
  objectiveIndex: number
  indexInObjective: number
  skill: MonsterSkill
  /** Stable key for DOM / scroll targets */
  key: string
}

const ABSOLUTE_SKILL_ID_BASE = -10_000

function absoluteEventToEntry(
  ev: FightTimelineScheduledEvent,
  index: number,
): FlatSkillEntry {
  const skill: MonsterSkill = {
    skill_id: ABSOLUTE_SKILL_ID_BASE - index,
    cool_time: ev.atMs,
    cast_time: 0,
    effect_type: ev.label,
    effect_min: 0,
    effect_max: ev.effectMax ?? 0,
    target_count: ev.targetCount,
    condition: '',
    condition_val: 0,
    max_uses: 1,
    display_label: ev.label,
    fire_at_ms: ev.atMs,
  }
  return {
    objectiveIndex: 0,
    indexInObjective: index,
    skill,
    key: `abs-${index}-${ev.atMs}`,
  }
}

function entryFireAtMs(entry: FlatSkillEntry): number {
  return entry.skill.fire_at_ms ?? entry.skill.cool_time
}

function isAbsoluteEntry(entry: FlatSkillEntry): boolean {
  return entry.skill.fire_at_ms != null
}

export function flattenFightSkills(fight: TimelineFightPayload): FlatSkillEntry[] {
  const out: FlatSkillEntry[] = []
  for (let i = 0; i < fight.objectives.length; i++) {
    const raw = fight.monsterSkills[i]?.skills ?? []
    const ordered = skillsForTimeline(raw)
    ordered.forEach((skill, j) => {
      out.push({
        objectiveIndex: i,
        indexInObjective: j,
        skill,
        key: `${i}-${j}-${skill.skill_id}`,
      })
    })
  }
  return out
}

/** Static timeline rows: verified schedule + wiki tail after cutover. */
export function buildTimelineDisplayEntries(fight: TimelineFightPayload): FlatSkillEntry[] {
  const schedule = fight.schedule
  if (!schedule) return flattenFightSkills(fight)

  const entries: FlatSkillEntry[] = schedule.events.map(absoluteEventToEntry)
  for (const entry of flattenFightSkills(fight)) {
    if (entry.skill.cool_time > schedule.wikiCutoverMs) {
      entries.push(entry)
    }
  }
  entries.sort((a, b) => entryFireAtMs(a) - entryFireAtMs(b))
  return entries
}

function wikiPostCutoverEntries(
  flat: FlatSkillEntry[],
  cutoverMs: number,
): FlatSkillEntry[] {
  return flat.filter((e) => e.skill.cool_time > cutoverMs)
}

function nextWikiCooldownFire(elapsedMs: number, cooldownMs: number): number {
  if (cooldownMs <= 0) return Number.POSITIVE_INFINITY
  const k = Math.floor(elapsedMs / cooldownMs)
  return Math.round((k + 1) * cooldownMs)
}

function completedWikiCooldownFires(elapsedMs: number, cooldownMs: number): number {
  if (cooldownMs <= 0) return 0
  return Math.floor(elapsedMs / cooldownMs)
}

function nextFireAfter(elapsedMs: number, cooldownMs: number): number {
  if (cooldownMs <= 0) return Number.POSITIVE_INFINITY
  const k = Math.floor(elapsedMs / cooldownMs)
  return Math.round((k + 1) * cooldownMs)
}

function completedCooldownFires(elapsedMs: number, cooldownMs: number): number {
  if (cooldownMs <= 0) return 0
  return Math.floor(elapsedMs / cooldownMs)
}

export type QueuedEvent = {
  entry: FlatSkillEntry
  /** Fight-time ms when this cast occurs */
  fireAt: number
}

function compareQueuedEvent(a: QueuedEvent, b: QueuedEvent): number {
  if (a.fireAt !== b.fireAt) return compareFireAtKeys(a.fireAt, b.fireAt)
  if (a.entry.objectiveIndex !== b.entry.objectiveIndex)
    return a.entry.objectiveIndex - b.entry.objectiveIndex
  if (a.entry.indexInObjective !== b.entry.indexInObjective)
    return a.entry.indexInObjective - b.entry.indexInObjective
  return a.entry.skill.skill_id - b.entry.skill.skill_id
}

/** Stable ordering for queue timestamps (handles ∞ without NaN from `a - b`). */
function compareFireAtKeys(a: number, b: number): number {
  if (a === b) return 0
  if (a === Number.POSITIVE_INFINITY) return 1
  if (b === Number.POSITIVE_INFINITY) return -1
  if (a === Number.NEGATIVE_INFINITY) return -1
  if (b === Number.NEGATIVE_INFINITY) return 1
  return a - b
}

/** Multiple skill lines can share the same fire time — group for display. */
export type QueuedGroup = {
  fireAt: number
  entries: QueuedEvent[]
}

/**
 * Merge every skill line that shares the same predicted cast instant (may span bosses).
 * Uses integer-rounded fire times so floating-point cooldown math cannot split a simultaneous wave.
 */
export function groupQueueByFireAt(queue: QueuedEvent[]): QueuedGroup[] {
  if (!queue.length) return []
  const byTime = new Map<number, QueuedEvent[]>()
  for (const q of queue) {
    const t =
      q.fireAt === Number.POSITIVE_INFINITY ? q.fireAt : Math.round(q.fireAt)
    const list = byTime.get(t)
    const normalized = t === q.fireAt ? q : { ...q, fireAt: t }
    if (list) list.push(normalized)
    else byTime.set(t, [normalized])
  }
  return [...byTime.entries()]
    .sort((a, b) => compareFireAtKeys(a[0], b[0]))
    .map(([fireAt, entries]) => ({
      fireAt,
      entries: [...entries].sort(compareQueuedEvent),
    }))
}

/** Single progress 0–1 for a simultaneous group (shared deadline `fireAt`). */
export function groupProgress(group: QueuedGroup, elapsedMs: number): number {
  const T = group.fireAt
  let windowStart = T
  for (const q of group.entries) {
    const cd = q.entry.skill.cool_time
    if (cd > 0 && !isAbsoluteEntry(q.entry)) {
      windowStart = Math.min(windowStart, T - cd)
    } else if (isAbsoluteEntry(q.entry)) {
      windowStart = Math.min(windowStart, T - 15_000)
    }
  }
  if (windowStart >= T) return elapsedMs >= T ? 1 : 0
  if (elapsedMs <= windowStart) return 0
  if (elapsedMs >= T) return 1
  return (elapsedMs - windowStart) / (T - windowStart)
}

/**
 * Progress for the Nth wave group: the first (**Upcoming**) uses each line’s cooldown window.
 * Later stacked groups use progress toward that wave’s `fireAt` from fight start (`elapsedMs / fireAt`)
 * so those bars move while Upcoming is still filling — the old “wait until previous wave fires”
 * segment left them at 0% until the first wave resolved.
 */
export function sequentialGroupProgress(
  groups: QueuedGroup[],
  index: number,
  elapsedMs: number,
): number {
  const g = groups[index]
  if (!g) return 0
  if (index === 0) return groupProgress(g, elapsedMs)

  const thisT = g.fireAt
  if (thisT === Number.POSITIVE_INFINITY || !(thisT > 0)) return 0

  const prevT = groups[index - 1].fireAt
  if (thisT <= prevT && prevT !== Number.POSITIVE_INFINITY) {
    return elapsedMs >= thisT ? 1 : 0
  }

  if (elapsedMs >= thisT) return 1
  return elapsedMs / thisT
}

function queueFromAbsoluteSchedule(
  schedule: FightTimelineSchedule,
  elapsedMs: number,
): QueuedEvent[] {
  const items: QueuedEvent[] = []
  schedule.events.forEach((ev, index) => {
    if (ev.atMs <= elapsedMs) return
    items.push({
      entry: absoluteEventToEntry(ev, index),
      fireAt: ev.atMs,
    })
  })
  return items
}

function queueFromWikiPostCutover(
  flat: FlatSkillEntry[],
  schedule: FightTimelineSchedule,
  elapsedMs: number,
): QueuedEvent[] {
  const items: QueuedEvent[] = []
  for (const entry of wikiPostCutoverEntries(flat, schedule.wikiCutoverMs)) {
    const cd = entry.skill.cool_time
    const maxUses = entry.skill.max_uses
    const done = completedWikiCooldownFires(elapsedMs, cd)
    const nextOrdinal = done + 1
    if (typeof maxUses === 'number' && maxUses >= 0 && nextOrdinal > maxUses) continue
    const fireAt = nextWikiCooldownFire(elapsedMs, cd)
    if (fireAt <= schedule.wikiCutoverMs) continue
    if (fireAt <= elapsedMs) continue
    items.push({ entry, fireAt })
  }
  return items
}

/** Run queue + boss alerts — honors verified schedules when present. */
export function computeFightEventQueue(
  fight: TimelineFightPayload,
  flat: FlatSkillEntry[],
  elapsedMs: number,
  maxRows: number,
): QueuedEvent[] {
  const schedule = fight.schedule
  if (!schedule) {
    return computeEventQueue(flat, elapsedMs, maxRows)
  }

  const items = [
    ...queueFromAbsoluteSchedule(schedule, elapsedMs),
    ...queueFromWikiPostCutover(flat, schedule, elapsedMs),
  ]
  items.sort(compareQueuedEvent)
  return items.slice(0, Math.max(0, maxRows))
}

/** Ordered soonest-first upcoming casts (one row per skill line). */
export function computeEventQueue(
  flat: FlatSkillEntry[],
  elapsedMs: number,
  maxRows: number,
): QueuedEvent[] {
  const items: QueuedEvent[] = []
  for (const entry of flat) {
    const cd = entry.skill.cool_time
    if (cd <= 0) continue
    const maxUses = entry.skill.max_uses
    const done = completedCooldownFires(elapsedMs, cd)
    /** Next occurrence is the (done+1)th cast at time (done+1)*cd — skip if over budget. */
    const nextOrdinal = done + 1
    if (
      typeof maxUses === 'number' &&
      maxUses >= 0 &&
      nextOrdinal > maxUses
    ) {
      continue
    }
    const fireAt = nextFireAfter(elapsedMs, cd)
    items.push({ entry, fireAt })
  }
  items.sort(compareQueuedEvent)
  return items.slice(0, Math.max(0, maxRows))
}

export function fightUsesAbsoluteSchedule(
  fight: Pick<TimelineFightPayload, 'schedule'>,
): boolean {
  return (fight.schedule?.events.length ?? 0) > 0
}
