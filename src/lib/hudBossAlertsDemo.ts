import type { BossAlertsWidgetConfig, TimelineFightPayload } from '../types'
import type { HudBossAlertRow } from './hudBossAlerts'
import { listTrackedBossAlertSkills } from './hudBossAlerts'
import { fightSkillsForLabeling, formatSkillEffectLabel } from './effectTypeDisplay'
import { flattenFightSkills, type FlatSkillEntry } from './timelineSchedule'

const DEMO_DISPLAY_SEC_MIN = 2.5

export type BossAlertsDemoSession = {
  label: string
  fight: TimelineFightPayload
  playKey: string
  endsAtMs: number
  row: HudBossAlertRow
}

function demoDisplaySec(config: BossAlertsWidgetConfig): number {
  return Math.max(DEMO_DISPLAY_SEC_MIN, config.warnLeadSec)
}

function buildDemoRow(
  fight: TimelineFightPayload,
  entry: FlatSkillEntry,
  playKey: string,
  secondsRemaining: number,
): HudBossAlertRow {
  const ob = fight.objectives[entry.objectiveIndex]
  const fightSkills = fightSkillsForLabeling(fight)
  return {
    key: playKey,
    skillLabel: formatSkillEffectLabel(entry.skill, fightSkills),
    targetCount: entry.skill.target_count,
    bossName: ob?.monster_name?.trim() || ob?.pen_name?.trim() || null,
    secondsRemaining,
    urgent: secondsRemaining <= 2,
  }
}

function pickRandomEntry(pool: FlatSkillEntry[]): FlatSkillEntry {
  return pool[Math.floor(Math.random() * pool.length)]!
}

function advanceDemoSession(
  session: BossAlertsDemoSession,
  nowMs: number,
  config: BossAlertsWidgetConfig,
): BossAlertsDemoSession {
  const pool = listTrackedBossAlertSkills(session.fight, config)
  if (!pool.length) {
    return session
  }
  const entry = pickRandomEntry(pool)
  const displaySec = demoDisplaySec(config)
  const endsAtMs = nowMs + displaySec * 1000
  const playKey = `demo-${entry.key}-${nowMs}`
  return {
    ...session,
    playKey,
    endsAtMs,
    row: buildDemoRow(session.fight, entry, playKey, displaySec),
  }
}

export function createBossAlertsDemoSession(
  fight: TimelineFightPayload,
  config: BossAlertsWidgetConfig,
  label: string,
): BossAlertsDemoSession {
  const pool = listTrackedBossAlertSkills(fight, config)
  if (!pool.length) {
    throw new Error('Enable at least one track option (single or multi-target) to preview alerts.')
  }
  const nowMs = Date.now()
  return advanceDemoSession(
    {
      label,
      fight,
      playKey: '',
      endsAtMs: 0,
      row: {
        key: 'demo-placeholder',
        skillLabel: '',
        targetCount: 0,
        bossName: null,
        secondsRemaining: 0,
        urgent: false,
      },
    },
    nowMs,
    config,
  )
}

export function tickBossAlertsDemoSession(
  session: BossAlertsDemoSession,
  nowMs: number,
  config: BossAlertsWidgetConfig,
): { session: BossAlertsDemoSession; alerts: HudBossAlertRow[] } {
  const pool = listTrackedBossAlertSkills(session.fight, config)
  if (!pool.length) {
    return { session, alerts: [] }
  }

  let next = session
  if (nowMs >= session.endsAtMs) {
    next = advanceDemoSession(session, nowMs, config)
  } else {
    const sec = Math.max(0, (session.endsAtMs - nowMs) / 1000)
    next = {
      ...session,
      row: {
        ...session.row,
        secondsRemaining: sec,
        urgent: sec <= 2,
      },
    }
  }

  return { session: next, alerts: [next.row] }
}
