import type { DungeonDetailDifficulty, MonsterDetail, TimelineFightPayload } from '../types'

export function buildTimelineFightPayload(
  dungeonName: string,
  row: DungeonDetailDifficulty,
  monsterById: Record<string, MonsterDetail>,
): TimelineFightPayload {
  return {
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
}
