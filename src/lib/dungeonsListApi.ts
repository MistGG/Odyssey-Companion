/**
 * Dungeon browser list — matches:
 * `GET https://thedigitalodyssey.com/api/wiki/dungeons?page=1&per_page=500`
 * (dev: proxied as `/api/wiki/dungeons?page=1&per_page=500`)
 */
import type { DungeonListResponse } from '../types'
import { fetchWithWikiCache } from './wikiCache'

const CACHE_KEY = 'dungeons:list:p1-500'

const DUNGEONS_PATH = '/api/wiki/dungeons?page=1&per_page=500'

async function fetchDungeonsLive(): Promise<DungeonListResponse> {
  if (window.odysseyCompanion) {
    return window.odysseyCompanion.fetchDungeons() as Promise<DungeonListResponse>
  }
  if (import.meta.env.DEV) {
    const res = await fetch(DUNGEONS_PATH)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  }
  const res = await fetch(
    'https://thedigitalodyssey.com/api/wiki/dungeons?page=1&per_page=500',
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchDungeonsListCached(): Promise<{
  response: DungeonListResponse
  stale: boolean
}> {
  const { value, stale } = await fetchWithWikiCache(CACHE_KEY, fetchDungeonsLive)
  return { response: value, stale }
}
