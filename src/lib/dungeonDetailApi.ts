/**
 * Single dungeon — matches `GET …/api/wiki/dungeons?id={id}`
 * (Story / Normal / … difficulties include `objectives[].monster_id` for timeline loads.)
 */
import type {
  DungeonClearReward,
  DungeonDetail,
  DungeonDetailDifficulty,
  DungeonEnterCondition,
  DungeonObjective,
  DungeonRaidRankingBand,
  DungeonRaidRewardRoll,
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
  const parseRaidRewards = (raw: unknown): DungeonRaidRewardRoll[] => {
    if (!Array.isArray(raw)) return []
    const out: DungeonRaidRewardRoll[] = []
    for (const r of raw) {
      if (!r || typeof r !== 'object') continue
      const o = r as Record<string, unknown>
      out.push({
        item_id: String(o.item_id ?? ''),
        item_name: String(o.item_name ?? ''),
        item_icon_id: String(o.item_icon_id ?? ''),
        rate_permil: Number(o.rate_permil ?? 0),
        min: Number(o.min ?? 1),
        max: Number(o.max ?? o.min ?? 1),
      })
    }
    return out
  }

  const parseRaidRankings = (raw: unknown): DungeonRaidRankingBand[] => {
    if (!Array.isArray(raw)) return []
    const out: DungeonRaidRankingBand[] = []
    for (const rk of raw) {
      if (!rk || typeof rk !== 'object') continue
      const o = rk as Record<string, unknown>
      out.push({
        start: Number(o.start ?? 0),
        end: Number(o.end ?? 0),
        rewards: parseRaidRewards(o.rewards),
      })
    }
    return out
  }

  const parseEnterConditions = (raw: unknown): DungeonEnterCondition[] => {
    if (!Array.isArray(raw)) return []
    const out: DungeonEnterCondition[] = []
    for (const c of raw) {
      if (!c || typeof c !== 'object') continue
      const o = c as Record<string, unknown>
      out.push({
        type: String(o.type ?? ''),
        description: String(o.description ?? ''),
      })
    }
    return out
  }

  const parseClearRewards = (raw: unknown): DungeonClearReward[] => {
    if (!Array.isArray(raw)) return []
    const out: DungeonClearReward[] = []
    for (const r of raw) {
      if (!r || typeof r !== 'object') continue
      const o = r as Record<string, unknown>
      out.push({
        rank: Number(o.rank ?? 0),
        item_id: String(o.item_id ?? ''),
        item_name: String(o.item_name ?? ''),
        item_icon_id: String(o.item_icon_id ?? ''),
        item_count: Number(o.item_count ?? 1),
      })
    }
    return out
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
        const raidRankings = parseRaidRankings(x.raid_rankings)
        objectives.push({
          step: Number(x.step ?? 0),
          monster_id: String(x.monster_id ?? ''),
          monster_name: String(x.monster_name ?? ''),
          pen_name: String(x.pen_name ?? ''),
          level: Number(x.level ?? 0),
          model_id: String(x.model_id ?? ''),
          count: Number(x.count ?? 1),
          raid_rankings: raidRankings.length ? raidRankings : undefined,
        })
      }
    }
    const userLimit = d.user_limit
    const weeklyLimit = d.weekly_limit
    const enterConditions = parseEnterConditions(d.enter_conditions)
    const rewards = parseClearRewards(d.rewards)
    const row: DungeonDetailDifficulty = {
      difficulty: String(d.difficulty ?? ''),
      time_limit_sec: Number(d.time_limit_sec ?? 0),
      death_limit: Number(d.death_limit ?? 0),
      objectives,
    }
    if (typeof userLimit === 'number' && Number.isFinite(userLimit)) {
      row.user_limit = userLimit
    }
    if (typeof weeklyLimit === 'number' && Number.isFinite(weeklyLimit) && weeklyLimit > 0) {
      row.weekly_limit = weeklyLimit
    }
    if (enterConditions.length) row.enter_conditions = enterConditions
    if (rewards.length) row.rewards = rewards
    return row
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
  /** Bump when parsed shape changes so we do not resurrect trim objects from localStorage. */
  const key = `dungeon:v2:${safe}`
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
