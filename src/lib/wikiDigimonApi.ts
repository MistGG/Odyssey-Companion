import { fetchWithWikiCache } from './wikiCache'

export type WikiDigimonSkill = {
  id: string
  name: string
  description: string
  element: string
  icon_id: string
}

export type WikiDigimonDetail = {
  id: string
  name: string
  model_id: string
  skills: WikiDigimonSkill[]
}

export function parseDigimonDetail(raw: unknown): WikiDigimonDetail {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid digimon response')
  }
  const o = raw as Record<string, unknown>
  const skills: WikiDigimonSkill[] = []
  if (Array.isArray(o.skills)) {
    for (const row of o.skills) {
      if (!row || typeof row !== 'object') continue
      const s = row as Record<string, unknown>
      const id = String(s.id ?? '').trim()
      if (!id) continue
      skills.push({
        id,
        name: String(s.name ?? '').trim() || id,
        description: String(s.description ?? ''),
        element: String(s.element ?? ''),
        icon_id: String(s.icon_id ?? ''),
      })
    }
  }
  return {
    id: String(o.id ?? '').trim(),
    name: String(o.name ?? '').trim(),
    model_id: String(o.model_id ?? '').trim(),
    skills,
  }
}

export function skillNameMapFromDigimon(detail: WikiDigimonDetail): Record<string, string> {
  const out: Record<string, string> = {}
  for (const s of detail.skills) {
    out[s.id] = s.name
  }
  return out
}

async function fetchDigimonDetailLive(safe: string): Promise<WikiDigimonDetail> {
  let raw: unknown
  if (window.odysseyCompanion?.fetchWikiDigimon) {
    raw = await window.odysseyCompanion.fetchWikiDigimon(safe)
  } else {
    const path = `/api/wiki/digimon?id=${encodeURIComponent(safe)}`
    if (import.meta.env.DEV) {
      const res = await fetch(path)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    } else {
      const res = await fetch(
        `https://thedigitalodyssey.com/api/wiki/digimon?id=${encodeURIComponent(safe)}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    }
  }
  return parseDigimonDetail(raw)
}

export async function fetchWikiDigimon(id: string): Promise<WikiDigimonDetail> {
  const safe = id.trim()
  if (!safe) throw new Error('Missing digimon id')
  const key = `digimon:v1:${safe}`
  const { value } = await fetchWithWikiCache(key, () => fetchDigimonDetailLive(safe))
  return value
}
