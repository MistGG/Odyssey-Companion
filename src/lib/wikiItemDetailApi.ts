import type { WikiItemDetail } from '../types'
import { fetchWithWikiCache } from './wikiCache'

function parseWikiItem(raw: unknown): WikiItemDetail {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid item response')
  const o = raw as Record<string, unknown>
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    icon_id: String(o.icon_id ?? ''),
  }
}

export function wikiItemIconUrl(iconId: string): string {
  const id = iconId.trim()
  if (!id) return ''
  return `https://thedigitalodyssey.com/game_icons/items/${id}.png`
}

async function fetchWikiItemLive(safe: string): Promise<WikiItemDetail> {
  let raw: unknown
  if (window.odysseyCompanion?.fetchWikiItem) {
    raw = await window.odysseyCompanion.fetchWikiItem(safe)
  } else {
    const path = `/api/wiki/items?id=${encodeURIComponent(safe)}`
    if (import.meta.env.DEV) {
      const res = await fetch(path)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    } else {
      const res = await fetch(
        `https://thedigitalodyssey.com/api/wiki/items?id=${encodeURIComponent(safe)}`,
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      raw = await res.json()
    }
  }
  return parseWikiItem(raw)
}

export async function fetchWikiItemDetail(id: string): Promise<WikiItemDetail> {
  const safe = id.trim()
  if (!safe) throw new Error('Missing item id')
  const key = `wiki:item:${safe}`
  const { value } = await fetchWithWikiCache(key, () => fetchWikiItemLive(safe))
  return value
}
