import type { WikiItemDetail, WikiItemDropSource, WikiItemRaidSource } from '../types'
import { fetchWithWikiCache } from './wikiCache'

function parseDropSources(raw: unknown): WikiItemDropSource[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.map((row) => {
    const o = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
    const locationsRaw = Array.isArray(o.locations) ? o.locations : []
    return {
      monster_id: String(o.monster_id ?? ''),
      monster_name: String(o.monster_name ?? ''),
      monster_level: Number(o.monster_level ?? 0),
      quantity: Number(o.quantity ?? 0),
      drop_type: String(o.drop_type ?? ''),
      locations: locationsRaw.map((loc) => {
        const l = (loc && typeof loc === 'object' ? loc : {}) as Record<string, unknown>
        return {
          map_id: String(l.map_id ?? ''),
          map_name: String(l.map_name ?? ''),
          count: Number(l.count ?? 0),
        }
      }),
    }
  })
}

function parseRaidSources(raw: unknown): WikiItemRaidSource[] | undefined {
  if (!Array.isArray(raw)) return undefined
  return raw.map((row) => {
    const o = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>
    const dungeonsRaw = Array.isArray(o.dungeons) ? o.dungeons : []
    return {
      boss_id: String(o.boss_id ?? ''),
      boss_name: String(o.boss_name ?? ''),
      boss_level: Number(o.boss_level ?? 0),
      dungeons: dungeonsRaw.map((d) => {
        const dungeon = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
        return {
          id: String(dungeon.id ?? ''),
          name: String(dungeon.name ?? ''),
        }
      }),
      rank_start: Number(o.rank_start ?? 0),
      rank_end: Number(o.rank_end ?? 0),
      rate: Number(o.rate ?? 0),
      min: Number(o.min ?? 0),
      max: Number(o.max ?? 0),
    }
  })
}

function parseWikiItem(raw: unknown): WikiItemDetail {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid item response')
  const o = raw as Record<string, unknown>
  return {
    id: String(o.id ?? ''),
    name: String(o.name ?? ''),
    icon_id: String(o.icon_id ?? ''),
    drop_sources: parseDropSources(o.drop_sources),
    raid_sources: parseRaidSources(o.raid_sources),
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
