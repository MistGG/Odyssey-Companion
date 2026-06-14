import type { MonsterDetail, MonsterDrop, MonsterLocation, MonsterSkill } from '../types'
import { normalizeSkillTargetCount } from './effectTypeDisplay'
import { fetchWithWikiCache } from './wikiCache'
import { parseWikiRaidRankings } from './wikiRaidRankingsParse'

function parseMonsterDrops(raw: unknown): MonsterDrop[] {
  if (!Array.isArray(raw)) return []
  const out: MonsterDrop[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const o = row as Record<string, unknown>
    out.push({
      item_id: String(o.item_id ?? ''),
      item_name: String(o.item_name ?? ''),
      item_icon_id: String(o.item_icon_id ?? ''),
      quantity: Number(o.quantity ?? 1),
      drop_type: String(o.drop_type ?? ''),
    })
  }
  return out
}

function parseMonsterLocations(raw: unknown): MonsterLocation[] {
  if (!Array.isArray(raw)) return []
  const out: MonsterLocation[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const lo = row as Record<string, unknown>
    out.push({
      map_id: String(lo.map_id ?? ''),
      map_name: String(lo.map_name ?? ''),
      count: Number(lo.count ?? 0),
    })
  }
  return out
}

function parseMonsterDetail(raw: unknown): MonsterDetail {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid monster response')
  }
  const o = raw as Record<string, unknown>
  const skillsRaw = o.skills
  const skills: MonsterSkill[] = []
  if (Array.isArray(skillsRaw)) {
    for (const s of skillsRaw) {
      if (!s || typeof s !== 'object') continue
      const x = s as Record<string, unknown>
      const maxUses = x.max_uses
      const effectType = String(x.effect_type ?? '')
      skills.push({
        skill_id: Number(x.skill_id ?? 0),
        cool_time: Number(x.cool_time ?? 0),
        cast_time: Number(x.cast_time ?? 0),
        effect_type: effectType,
        effect_min: Number(x.effect_min ?? 0),
        effect_max: Number(x.effect_max ?? 0),
        target_count: normalizeSkillTargetCount(effectType, Number(x.target_count ?? 0)),
        condition: String(x.condition ?? ''),
        condition_val: Number(x.condition_val ?? 0),
        ...(typeof maxUses === 'number' ? { max_uses: maxUses } : {}),
      })
    }
  }
  const raidRankings = parseWikiRaidRankings(o.raid_rankings)
  const drops = parseMonsterDrops(o.drops)
  const locations = parseMonsterLocations(o.locations)
  const row: MonsterDetail = {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    pen_name: String(o.pen_name ?? ''),
    model_id: String(o.model_id ?? ''),
    level: Number(o.level ?? 0),
    skills,
  }
  if (drops.length) row.drops = drops
  if (raidRankings.length) row.raid_rankings = raidRankings
  if (locations.length) row.locations = locations
  return row
}

async function fetchMonsterDetailLive(safe: string): Promise<MonsterDetail> {
  let raw: unknown
  if (window.odysseyCompanion) {
    raw = await window.odysseyCompanion.fetchMonsterDetail(safe)
  } else {
    const path = `/api/wiki/monsters?id=${encodeURIComponent(safe)}`
    if (import.meta.env.DEV) {
      const res = await fetch(path)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    } else {
      const res = await fetch(
        `https://thedigitalodyssey.com/api/wiki/monsters?id=${encodeURIComponent(safe)}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    }
  }
  return parseMonsterDetail(raw)
}

export async function fetchMonsterDetail(id: string): Promise<MonsterDetail> {
  const safe = id.trim()
  if (!safe) throw new Error('Missing monster id')
  const key = `monster:v4:${safe}`
  const { value } = await fetchWithWikiCache(key, () => fetchMonsterDetailLive(safe))
  return value
}
