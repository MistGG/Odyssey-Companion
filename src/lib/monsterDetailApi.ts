/** Monster timeline — matches `GET …/api/wiki/monsters?id={id}` (`skills` → timeline rows). */
import type { MonsterDetail, MonsterSkill } from '../types'
import { fetchWithWikiCache } from './wikiCache'

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
      skills.push({
        skill_id: Number(x.skill_id ?? 0),
        cool_time: Number(x.cool_time ?? 0),
        cast_time: Number(x.cast_time ?? 0),
        effect_type: String(x.effect_type ?? ''),
        effect_min: Number(x.effect_min ?? 0),
        effect_max: Number(x.effect_max ?? 0),
        target_count: Number(x.target_count ?? 0),
        condition: String(x.condition ?? ''),
        condition_val: Number(x.condition_val ?? 0),
        ...(typeof maxUses === 'number' ? { max_uses: maxUses } : {}),
      })
    }
  }
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    pen_name: String(o.pen_name ?? ''),
    model_id: String(o.model_id ?? ''),
    level: Number(o.level ?? 0),
    skills,
  }
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
  const key = `monster:${safe}`
  const { value } = await fetchWithWikiCache(key, () => fetchMonsterDetailLive(safe))
  return value
}
