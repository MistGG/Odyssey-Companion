import type { PublicMeterParseRow } from './meterPublicStats'
import { parseScoreColor } from './meterParseScoreColor'
import { bestParseScoreForHardDungeon, HARD_DIFFICULTY_ID } from './meterPointGrants'
import type { Dungeon } from '../types'
import { hardMeterDungeonsFromList } from './wikiDungeonsMeter'

export type MeterEarnMilestoneId = 'first_clear' | 'score90' | 'score99' | 'score100'

export const METER_ONE_TIME_MILESTONES: {
  id: MeterEarnMilestoneId
  label: string
  points: number
}[] = [
  { id: 'first_clear', label: 'First', points: 2 },
  { id: 'score90', label: '90+', points: 3 },
  { id: 'score99', label: '99+', points: 4 },
  { id: 'score100', label: '100', points: 10 },
]

export function meterGrantKeyForMilestone(
  milestone: MeterEarnMilestoneId,
  dungeonId: string,
): string {
  switch (milestone) {
    case 'first_clear':
      return `first_clear:${dungeonId}`
    case 'score90':
      return `score90:${dungeonId}`
    case 'score99':
      return `score99:${dungeonId}`
    case 'score100':
      return `score100:${dungeonId}`
  }
}

export function hardMeterDungeons(dungeons: Dungeon[]): { dungeonId: string; dungeonName: string }[] {
  return hardMeterDungeonsFromList(dungeons)
}

export type MeterEarnMilestoneProgress = {
  id: MeterEarnMilestoneId
  label: string
  points: number
  granted: boolean
  ratio: '0/1' | '1/1'
}

export type MeterDungeonEarnProgress = {
  dungeonId: string
  dungeonName: string
  bestScore: number | null
  milestones: MeterEarnMilestoneProgress[]
}

export function buildDungeonEarnProgress(
  hardDungeons: { dungeonId: string; dungeonName: string }[],
  grantKeys: Set<string>,
  myParses: PublicMeterParseRow[],
  publicRowsByDungeon: Map<string, PublicMeterParseRow[]>,
): MeterDungeonEarnProgress[] {
  return hardDungeons.map(({ dungeonId, dungeonName }) => {
    const pool = publicRowsByDungeon.get(dungeonId)
    const bestScore =
      pool != null ? bestParseScoreForHardDungeon(myParses, pool, dungeonId) || null : null
    const scoreDisplay = bestScore != null && bestScore > 0 ? bestScore : null

    const milestones = METER_ONE_TIME_MILESTONES.map((m) => {
      const granted = grantKeys.has(meterGrantKeyForMilestone(m.id, dungeonId))
      return {
        id: m.id,
        label: m.label,
        points: m.points,
        granted,
        ratio: granted ? ('1/1' as const) : ('0/1' as const),
      }
    })

    return {
      dungeonId,
      dungeonName,
      bestScore: scoreDisplay,
      milestones,
    }
  })
}

export function meterEarnMilestoneTierColor(id: MeterEarnMilestoneId): string | undefined {
  switch (id) {
    case 'score90':
      return parseScoreColor(90)
    case 'score99':
      return parseScoreColor(99)
    case 'score100':
      return parseScoreColor(100)
    default:
      return undefined
  }
}

export function todayDailyGrantKey(): string {
  const d = new Date()
  const today = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  return `daily:${today}`
}

export { HARD_DIFFICULTY_ID }
