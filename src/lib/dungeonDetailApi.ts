/**
 * Single dungeon — matches `GET …/api/wiki/dungeons?id={id}`
 * (Story / Normal / … difficulties include `objectives[].monster_id` for timeline loads.)
 */
import type {
  DungeonDetail,
  DungeonDetailDifficulty,
  DungeonObjective,
} from '../types'
import { fetchWithWikiCache } from './wikiCache'

function parseDungeonDetail(raw: unknown): DungeonDetail {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid dungeon response')
  }
  let o = raw as Record<string, unknown>
  const wrapped = o.data
  if (
    wrapped &&
    typeof wrapped === 'object' &&
    !Array.isArray(wrapped) &&
    ('difficulties' in (wrapped as object) || 'id' in (wrapped as object))
  ) {
    o = wrapped as Record<string, unknown>
  }
  const difficultiesRaw = o.difficulties
  if (!Array.isArray(difficultiesRaw)) {
    throw new Error('Invalid dungeon difficulties')
  }
  const difficulties = difficultiesRaw.map((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('Invalid difficulty row')
    }
    const d = item as Record<string, unknown>
    const objectivesRaw = d.objectives
    const objectives: DungeonObjective[] = []
    if (Array.isArray(objectivesRaw)) {
      for (const ob of objectivesRaw) {
        if (!ob || typeof ob !== 'object') continue
        const x = ob as Record<string, unknown>
        objectives.push({
          step: Number(x.step ?? 0),
          monster_id: String(x.monster_id ?? ''),
          monster_name: String(x.monster_name ?? ''),
          pen_name: String(x.pen_name ?? ''),
          level: Number(x.level ?? 0),
          model_id: String(x.model_id ?? ''),
          count: Number(x.count ?? 1),
        })
      }
    }
    return {
      difficulty: String(d.difficulty ?? ''),
      time_limit_sec: Number(d.time_limit_sec ?? 0),
      death_limit: Number(d.death_limit ?? 0),
      objectives,
    }
  })
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    map_name: String(o.map_name ?? ''),
    image: String(o.image ?? ''),
    difficulties,
  }
}

async function fetchDungeonDetailLive(safe: string): Promise<DungeonDetail> {
  let raw: unknown
  if (window.odysseyCompanion) {
    raw = await window.odysseyCompanion.fetchDungeonDetail(safe)
  } else {
    const path = `/api/wiki/dungeons?id=${encodeURIComponent(safe)}`
    if (import.meta.env.DEV) {
      const res = await fetch(path)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    } else {
      const res = await fetch(
        `https://thedigitalodyssey.com/api/wiki/dungeons?id=${encodeURIComponent(safe)}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    }
  }
  return parseDungeonDetail(raw)
}

export async function fetchDungeonDetail(id: string): Promise<DungeonDetail> {
  const safe = id.trim()
  if (!safe) throw new Error('Missing dungeon id')
  const key = `dungeon:${safe}`
  const { value } = await fetchWithWikiCache(key, () => fetchDungeonDetailLive(safe))
  return value
}

/** Match list/detail difficulty labels (wiki strings can differ slightly in spacing/case). */
export function findDifficultyRow(
  detail: DungeonDetail,
  label: string,
): DungeonDetailDifficulty | undefined {
  const want = label.trim().toLowerCase()
  return detail.difficulties.find(
    (r) => r.difficulty.trim().toLowerCase() === want,
  )
}
