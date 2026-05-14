import type { WikiNpcDetail } from '../types'
import { fetchWithWikiCache } from './wikiCache'

function parseWikiNpc(raw: unknown): WikiNpcDetail {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid NPC response')
  const o = raw as Record<string, unknown>
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    pen_name: String(o.pen_name ?? ''),
    model_id: String(o.model_id ?? ''),
  }
}

/** Wiki serves `model_id` without the trailing `l` segment used by the CDN model PNG URL. */
export function wikiNpcModelImageUrl(modelId: string): string {
  const id = modelId.trim()
  if (!id) return ''
  return `https://thedigitalodyssey.com/models/${id}l.png`
}

async function fetchWikiNpcLive(safe: string): Promise<WikiNpcDetail> {
  let raw: unknown
  if (window.odysseyCompanion?.fetchWikiNpc) {
    raw = await window.odysseyCompanion.fetchWikiNpc(safe)
  } else {
    const path = `/api/wiki/npcs?id=${encodeURIComponent(safe)}`
    if (import.meta.env.DEV) {
      const res = await fetch(path)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    } else {
      const res = await fetch(
        `https://thedigitalodyssey.com/api/wiki/npcs?id=${encodeURIComponent(safe)}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    }
  }
  return parseWikiNpc(raw)
}

export async function fetchWikiNpcDetail(id: string): Promise<WikiNpcDetail> {
  const safe = id.trim()
  if (!safe) throw new Error('Missing npc id')
  const key = `wiki:npc:${safe}`
  const { value } = await fetchWithWikiCache(key, () => fetchWikiNpcLive(safe))
  return value
}
