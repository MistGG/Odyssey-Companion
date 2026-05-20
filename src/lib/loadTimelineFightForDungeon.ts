import type { MonsterDetail, TimelineFightPayload } from '../types'
import { buildTimelineFightPayload } from './buildTimelineFightPayload'
import { fetchDungeonDetail, findDifficultyRow } from './dungeonDetailApi'
import { normalizeEventStreamDifficulty } from './dungeonDifficultyTags'
import { fetchMonsterDetail } from './monsterDetailApi'

export async function loadTimelineFightForDungeon(
  dungeonId: string,
  difficultyRaw: string,
  opts?: { dungeonDisplayName?: string | null },
): Promise<{ ok: true; payload: TimelineFightPayload } | { ok: false; error: string }> {
  const id = dungeonId.trim()
  const difficultyLabel = normalizeEventStreamDifficulty(difficultyRaw)
  if (!id) return { ok: false, error: 'Missing dungeon id.' }
  if (!difficultyLabel) return { ok: false, error: 'Missing dungeon difficulty.' }

  try {
    const detail = await fetchDungeonDetail(id)
    const row = findDifficultyRow(detail, difficultyLabel)
    if (!row) {
      return {
        ok: false,
        error: `Difficulty "${difficultyLabel}" was not found for this dungeon.`,
      }
    }

    const monsterIds = [...new Set(row.objectives.map((o) => o.monster_id).filter(Boolean))]
    const monsterMap: Record<string, MonsterDetail> = {}
    await Promise.all(
      monsterIds.map(async (mid) => {
        try {
          monsterMap[mid] = await fetchMonsterDetail(mid)
        } catch {
          /* payload still builds with empty skills */
        }
      }),
    )

    const dungeonName =
      detail.name?.trim() || opts?.dungeonDisplayName?.trim() || id
    const payload = buildTimelineFightPayload(dungeonName, row, monsterMap)
    return { ok: true, payload }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
