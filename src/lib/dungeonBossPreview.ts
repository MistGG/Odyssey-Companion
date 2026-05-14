import type { DungeonDetail } from '../types'

/**
 * Unique boss / objective names in encounter order (all difficulties), for list-card preview.
 * Not available from the dungeon *list* API — only after `?id=` detail is loaded.
 */
export function bossNamesPreviewLine(detail: DungeonDetail, maxShown = 4): string {
  const ordered: string[] = []
  const seen = new Set<string>()
  for (const row of detail.difficulties) {
    for (const o of row.objectives) {
      const n = o.monster_name?.trim()
      if (!n || seen.has(n)) continue
      seen.add(n)
      ordered.push(n)
    }
  }
  if (ordered.length === 0) return ''
  const head = ordered.slice(0, maxShown)
  const suffix = ordered.length > maxShown ? '…' : ''
  return `${head.join(' · ')}${suffix}`
}

function itemNameMatches(itemName: string | undefined, needle: string): boolean {
  const n = itemName?.trim().toLowerCase()
  return Boolean(n && n.includes(needle))
}

/**
 * Dungeon list search: dungeon name, map name, boss / pen names, clear rewards, and raid roll item names.
 * (Detail payloads already include rewards; same data is persisted in the wiki localStorage cache.)
 */
export function dungeonDetailMatchesBrowserSearch(detail: DungeonDetail, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return false
  if (detail.name.trim().toLowerCase().includes(needle)) return true
  const map = detail.map_name?.trim().toLowerCase()
  if (map && map.includes(needle)) return true
  for (const row of detail.difficulties) {
    for (const o of row.objectives) {
      const mn = o.monster_name?.trim().toLowerCase()
      if (mn && mn.includes(needle)) return true
      const pen = o.pen_name?.trim().toLowerCase()
      if (pen && pen.includes(needle)) return true
      for (const band of o.raid_rankings ?? []) {
        for (const rr of band.rewards) {
          if (itemNameMatches(rr.item_name, needle)) return true
        }
      }
    }
    for (const cr of row.rewards ?? []) {
      if (itemNameMatches(cr.item_name, needle)) return true
    }
  }
  return false
}
