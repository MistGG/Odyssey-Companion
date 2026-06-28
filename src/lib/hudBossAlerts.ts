import type { EventStreamRecord } from './eventStreamFormat'
import { eventStreamTimeMs } from './fightEngageEpoch'
import type { BossAlertsWidgetConfig, TimelineFightPayload } from '../types'
import { shouldTrackSkillTargetCount } from './hudBossAlertSound'
import type { MeterDungeonRunOutcome } from './meterDungeonRun'
import {
  combatHitStartsMeterTimer,
  deathIndicatesBossClear,
  eventStreamReportsFullClear,
  extractBossTargetsFromObjectives,
  extractDungeonDifficultyMeta,
  markDungeonRunClear,
  markDungeonRunFail,
  shouldStartNewDungeonPull,
  syncDungeonBossTargets,
} from './meterDungeonRun'
import { parseDungeonCompleteEvent } from './meterDungeonComplete'
import { flattenFightSkills, computeFightEventQueue, buildTimelineDisplayEntries, type FlatSkillEntry } from './timelineSchedule'
import { fightSkillsForLabeling, formatSkillEffectLabel } from './effectTypeDisplay'

export type HudBossAlertRow = {
  key: string
  skillLabel: string
  targetCount: number
  bossName: string | null
  secondsRemaining: number
  urgent: boolean
}

export type HudBossAlertsState = {
  dungeonId: string | null
  dungeonDifficulty: string | null
  dungeonBossTargets: string[]
  fight: TimelineFightPayload | null
  fightKey: string | null
  fightLoading: boolean
  bossEngagedAtMs: number | null
  /** Mirrors meter session — new pull after clear/fail or dungeon id change. */
  dungeonRunActive: boolean
  lastRunOutcome: MeterDungeonRunOutcome | null
  testMode: boolean
  testLabel: string | null
}

export function createHudBossAlertsState(): HudBossAlertsState {
  return {
    dungeonId: null,
    dungeonDifficulty: null,
    dungeonBossTargets: [],
    fight: null,
    fightKey: null,
    fightLoading: false,
    bossEngagedAtMs: null,
    dungeonRunActive: false,
    lastRunOutcome: null,
    testMode: false,
    testLabel: null,
  }
}

function markHudDungeonRunClear(state: HudBossAlertsState) {
  markDungeonRunClear(state)
}

function markHudDungeonRunFail(state: HudBossAlertsState) {
  markDungeonRunFail(state)
}

/** Boss alerts only run during an active pull (cleared/failed runs stay idle until next pull). */
export function isBossAlertPullActive(state: HudBossAlertsState): boolean {
  return state.dungeonRunActive && state.lastRunOutcome == null
}

export function bossAlertsFightKey(dungeonId: string, difficulty: string): string {
  return `${dungeonId.trim()}|${difficulty.trim()}`
}

function resetBossPull(state: HudBossAlertsState) {
  state.bossEngagedAtMs = null
}

function clearBossAlertsFight(state: HudBossAlertsState) {
  state.fight = null
  state.fightKey = null
  state.fightLoading = false
}

function clearDungeon(state: HudBossAlertsState) {
  state.dungeonId = null
  state.dungeonDifficulty = null
  state.dungeonBossTargets = []
  clearBossAlertsFight(state)
  state.testMode = false
  state.testLabel = null
  state.dungeonRunActive = false
  state.lastRunOutcome = null
  resetBossPull(state)
}

export function listTrackedBossAlertSkills(
  fight: TimelineFightPayload,
  config: BossAlertsWidgetConfig,
): FlatSkillEntry[] {
  if (fight.schedule?.events.length) {
    return buildTimelineDisplayEntries(fight).filter((e) =>
      shouldTrackSkillTargetCount(
        e.skill.target_count,
        config.trackSingleTarget,
        config.trackMultiTarget,
      ),
    )
  }
  return flattenFightSkills(fight).filter((e) =>
    shouldTrackSkillTargetCount(
      e.skill.target_count,
      config.trackSingleTarget,
      config.trackMultiTarget,
    ),
  )
}

function nextFireMs(elapsedMs: number, cooldownMs: number): number {
  if (cooldownMs <= 0) return Number.POSITIVE_INFINITY
  const k = Math.floor(elapsedMs / cooldownMs)
  return Math.round((k + 1) * cooldownMs)
}

function completedFires(elapsedMs: number, cooldownMs: number): number {
  if (cooldownMs <= 0) return 0
  return Math.floor(elapsedMs / cooldownMs)
}

export function computeHudBossAlerts(
  state: HudBossAlertsState,
  nowMs: number,
  config: BossAlertsWidgetConfig,
): HudBossAlertRow[] {
  if (!isBossAlertPullActive(state)) return []

  const fight = state.fight
  const engagedAt = state.bossEngagedAtMs
  if (!fight || engagedAt == null) return []

  const elapsedMs = Math.max(0, nowMs - engagedAt)
  const warnLeadMs = Math.max(1, config.warnLeadSec) * 1000
  const rows: HudBossAlertRow[] = []
  const fightSkills = fightSkillsForLabeling(fight)
  const flat = flattenFightSkills(fight)

  if (fight.schedule?.events.length) {
    const queue = computeFightEventQueue(fight, flat, elapsedMs, 32)
    for (const q of queue) {
      if (
        !shouldTrackSkillTargetCount(
          q.entry.skill.target_count,
          config.trackSingleTarget,
          config.trackMultiTarget,
        )
      ) {
        continue
      }
      const remainMs = q.fireAt - elapsedMs
      if (remainMs > warnLeadMs) continue
      if (remainMs <= -500) continue
      const sec = Math.max(0, remainMs / 1000)
      const ob = fight.objectives[q.entry.objectiveIndex]
      rows.push({
        key: q.entry.key,
        skillLabel: formatSkillEffectLabel(q.entry.skill, fightSkills),
        targetCount: q.entry.skill.target_count,
        bossName: ob?.monster_name?.trim() || ob?.pen_name?.trim() || null,
        secondsRemaining: sec,
        urgent: sec <= 2,
      })
    }
    rows.sort((a, b) => a.secondsRemaining - b.secondsRemaining)
    return rows
  }

  for (const entry of listTrackedBossAlertSkills(fight, config)) {
    const cd = entry.skill.cool_time
    if (cd <= 0) continue
    const maxUses = entry.skill.max_uses
    const done = completedFires(elapsedMs, cd)
    const nextOrdinal = done + 1
    if (typeof maxUses === 'number' && maxUses >= 0 && nextOrdinal > maxUses) continue

    const fireAt = nextFireMs(elapsedMs, cd)
    const remainMs = fireAt - elapsedMs
    if (remainMs > warnLeadMs) continue
    if (remainMs <= -500) continue

    const sec = Math.max(0, remainMs / 1000)
    const ob = fight.objectives[entry.objectiveIndex]
    rows.push({
      key: `${entry.key}-${nextOrdinal}`,
      skillLabel: formatSkillEffectLabel(entry.skill, fightSkills),
      targetCount: entry.skill.target_count,
      bossName: ob?.monster_name?.trim() || ob?.pen_name?.trim() || null,
      secondsRemaining: sec,
      urgent: sec <= 2,
    })
  }

  rows.sort((a, b) => a.secondsRemaining - b.secondsRemaining)
  return rows
}

export type HudBossAlertsIngestResult = {
  state: HudBossAlertsState
  /** Load wiki fight data for this dungeon + difficulty. */
  requestFightLoad: { dungeonId: string; difficulty: string } | null
  /** New boss pull — reset engagement clock. */
  dungeonReset: boolean
  /** First boss hit this pull — share engage time with timeline via main process. */
  fightJustEngaged: { dungeonId: string; difficulty: string; engagedAtMs: number } | null
}

export function ingestHudBossAlertsEvent(
  state: HudBossAlertsState,
  ev: EventStreamRecord,
): HudBossAlertsIngestResult {
  const next = { ...state, dungeonBossTargets: [...state.dungeonBossTargets] }
  let requestFightLoad: HudBossAlertsIngestResult['requestFightLoad'] = null
  let dungeonReset = false
  let fightJustEngaged: HudBossAlertsIngestResult['fightJustEngaged'] = null

  const t = String(ev.type ?? '')

  if (t === 'map_change') {
    if (next.testMode) {
      clearDungeon(next)
      return { state: next, requestFightLoad: null, dungeonReset: false, fightJustEngaged: null }
    }
    // Match timeline/meter: any map change while in a dungeon instance ends the pull.
    if (next.dungeonId?.trim()) {
      clearDungeon(next)
      return { state: next, requestFightLoad: null, dungeonReset: true, fightJustEngaged: null }
    }
    return { state: next, requestFightLoad: null, dungeonReset: false, fightJustEngaged: null }
  }

  if (t === 'dungeon_complete') {
    const parsed = parseDungeonCompleteEvent(ev)
    const activeId = next.dungeonId?.trim() || null
    if (parsed && (!activeId || activeId === parsed.dungeonId)) {
      if (!activeId) next.dungeonId = parsed.dungeonId
      if (parsed.difficulty) next.dungeonDifficulty = parsed.difficulty
      if (parsed.success) markHudDungeonRunClear(next)
      else markHudDungeonRunFail(next)
      resetBossPull(next)
      clearBossAlertsFight(next)
      dungeonReset = true
    }
    return { state: next, requestFightLoad: null, dungeonReset, fightJustEngaged: null }
  }

  if (t === 'dungeon_progress') {
    const dungeonId = String(ev.dungeon_id ?? '').trim() || null
    if (!dungeonId) {
      clearDungeon(next)
      return { state: next, requestFightLoad: null, dungeonReset: false, fightJustEngaged: null }
    }

    next.testMode = false
    next.testLabel = null

    const diffMeta = extractDungeonDifficultyMeta(ev)
    const difficulty = diffMeta.label?.trim() || ''
    const targets = extractBossTargetsFromObjectives(ev)
    if (targets.length) syncDungeonBossTargets(next, ev)

    if (
      eventStreamReportsFullClear(ev, { dungeonBossTargets: next.dungeonBossTargets }) &&
      next.dungeonRunActive
    ) {
      markHudDungeonRunClear(next)
      resetBossPull(next)
      clearBossAlertsFight(next)
      dungeonReset = true
      next.dungeonId = dungeonId
      if (difficulty) next.dungeonDifficulty = difficulty
      return { state: next, requestFightLoad, dungeonReset, fightJustEngaged }
    }

    const prevDungeonId = next.dungeonId?.trim() || null
    const prevKey = next.fightKey
    const newKey = difficulty ? bossAlertsFightKey(dungeonId, difficulty) : null
    const newPull =
      !next.dungeonId?.trim() || shouldStartNewDungeonPull(next, dungeonId)

    next.dungeonId = dungeonId
    if (difficulty) next.dungeonDifficulty = difficulty

    if (newPull) {
      next.lastRunOutcome = null
      next.dungeonRunActive = true
      dungeonReset = true
      resetBossPull(next)
      clearBossAlertsFight(next)
      if (newKey) {
        next.fightKey = newKey
        next.fightLoading = true
        requestFightLoad = { dungeonId, difficulty }
      }
    } else if (prevDungeonId && prevDungeonId !== dungeonId) {
      dungeonReset = true
      resetBossPull(next)
      clearBossAlertsFight(next)
      if (newKey) {
        next.fightKey = newKey
        next.fightLoading = true
        requestFightLoad = { dungeonId, difficulty }
      }
    } else if (newKey && prevKey !== newKey && difficulty) {
      clearBossAlertsFight(next)
      next.fightKey = newKey
      next.fightLoading = true
      requestFightLoad = { dungeonId, difficulty }
    } else if (newKey && difficulty && !next.fight && !requestFightLoad) {
      next.fightKey = newKey
      next.fightLoading = true
      requestFightLoad = { dungeonId, difficulty }
    }

    return { state: next, requestFightLoad, dungeonReset, fightJustEngaged }
  }

  if (t === 'death') {
    if (
      next.dungeonId?.trim() &&
      next.dungeonBossTargets.length > 0 &&
      next.bossEngagedAtMs != null &&
      !deathIndicatesBossClear(ev, next.dungeonBossTargets)
    ) {
      resetBossPull(next)
      dungeonReset = true
    }
    return { state: next, requestFightLoad, dungeonReset, fightJustEngaged }
  }

  if (!next.dungeonId?.trim() || next.dungeonBossTargets.length === 0) {
    return { state: next, requestFightLoad, dungeonReset, fightJustEngaged }
  }

  if (!isBossAlertPullActive(next)) {
    return { state: next, requestFightLoad, dungeonReset, fightJustEngaged }
  }

  const combatTypes = new Set(['skill_use', 'party_skill', 'hit_taken', 'enemy_skill'])
  if (!combatTypes.has(t)) {
    return { state: next, requestFightLoad, dungeonReset, fightJustEngaged }
  }

  const dmg = Number(ev.damage)
  if (Number.isFinite(dmg) && dmg > 0) {
    const sessionLike = {
      dungeonId: next.dungeonId,
      dungeonBossTargets: next.dungeonBossTargets,
    }
    if (
      combatHitStartsMeterTimer(sessionLike, ev) &&
      next.bossEngagedAtMs == null &&
      !next.fightLoading &&
      next.fight != null &&
      next.fightKey != null
    ) {
      const engagedAtMs = eventStreamTimeMs(ev)
      next.bossEngagedAtMs = engagedAtMs
      const diff = next.dungeonDifficulty?.trim()
      if (diff) {
        fightJustEngaged = {
          dungeonId: next.dungeonId!,
          difficulty: diff,
          engagedAtMs,
        }
      }
    }
  }

  return { state: next, requestFightLoad, dungeonReset, fightJustEngaged }
}

export function applyHudBossAlertsFightLoaded(
  state: HudBossAlertsState,
  fightKey: string,
  fight: TimelineFightPayload | null,
): HudBossAlertsState {
  if (state.fightKey !== fightKey) return state
  return {
    ...state,
    fight,
    fightLoading: false,
  }
}

export function clearHudBossAlertsTest(state: HudBossAlertsState): HudBossAlertsState {
  if (!state.testMode) return state
  return createHudBossAlertsState()
}
