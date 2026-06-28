import type { DungeonDetailDifficulty, MonsterDetail, TimelineFightPayload } from '../types'
import { fightTimelineScheduleFor } from './fightTimelineOverrides'

export function buildTimelineFightPayload(
  dungeonName: string,
  row: DungeonDetailDifficulty,
  monsterById: Record<string, MonsterDetail>,
  opts?: { dungeonId?: string },
): TimelineFightPayload {
  const payload: TimelineFightPayload = {
    dungeonName,
    difficulty: row.difficulty,
    time_limit_sec: row.time_limit_sec,
    death_limit: row.death_limit,
    objectives: row.objectives.map((o) => ({
      step: o.step,
      monster_id: o.monster_id,
      monster_name: o.monster_name,
      pen_name: o.pen_name,
      level: o.level,
      count: o.count,
    })),
    monsterSkills: row.objectives.map((o) => ({
      monster_id: o.monster_id,
      skills: monsterById[o.monster_id]?.skills ?? [],
    })),
  }
  const dungeonId = opts?.dungeonId?.trim()
  if (dungeonId) {
    const schedule = fightTimelineScheduleFor(dungeonId, row.difficulty)
    if (schedule) payload.schedule = schedule
  }
  return payload
}
