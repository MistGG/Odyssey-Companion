import type { Dungeon } from '../types'
import { WIKI_LOCAL_STORAGE_PREFIX } from './wikiCache'

/** When the wiki adds dungeons not seen before, pin them to the top (newest additions first). */
const FIRST_SEEN_KEY = `${WIKI_LOCAL_STORAGE_PREFIX}dungeons:first-seen:v1`

function readFirstSeenMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(FIRST_SEEN_KEY)
    if (!raw) return {}
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object') return {}
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeFirstSeenMap(m: Record<string, number>): void {
  try {
    localStorage.setItem(FIRST_SEEN_KEY, JSON.stringify(m))
  } catch {
    /* quota / private mode */
  }
}

/**
 * Dungeons first seen on a given fetch sort above older entries; among new ids in the same response,
 * API order is preserved. Removed wiki ids are dropped from the map.
 */
export function orderDungeonsByFirstSeen(dungeons: Dungeon[]): Dungeon[] {
  if (dungeons.length === 0) return dungeons

  const map = readFirstSeenMap()
  const idSet = new Set(dungeons.map((d) => d.id))
  const now = Date.now()
  let changed = false

  for (const d of dungeons) {
    if (map[d.id] === undefined) {
      map[d.id] = now
      changed = true
    }
  }

  for (const k of Object.keys(map)) {
    if (!idSet.has(k)) {
      delete map[k]
      changed = true
    }
  }

  if (changed) writeFirstSeenMap(map)

  const tagged = dungeons.map((d, i) => ({
    d,
    i,
    ts: map[d.id] ?? 0,
  }))

  tagged.sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts
    return a.i - b.i
  })

  return tagged.map((x) => x.d)
}
