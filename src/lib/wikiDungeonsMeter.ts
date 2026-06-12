import type { Dungeon } from '../types'
import { HARD_DIFFICULTY_ID } from './meterPointGrants'

function wikiDifficultyToTierId(name: string): number | null {
  const n = name.trim().toLowerCase()
  if (n === 'normal') return 2
  if (n === 'hard') return 3
  return null
}

export function hardMeterDungeonsFromList(
  dungeons: Dungeon[],
): { dungeonId: string; dungeonName: string }[] {
  return [...dungeons]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((dungeon) =>
      (dungeon.difficulties ?? []).some(
        (difficulty) => wikiDifficultyToTierId(difficulty) === HARD_DIFFICULTY_ID,
      ),
    )
    .map((dungeon) => ({ dungeonId: dungeon.id, dungeonName: dungeon.name }))
}
