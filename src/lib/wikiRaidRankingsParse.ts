import type { DungeonRaidRankingBand, DungeonRaidRewardRoll } from '../types'

export function parseWikiRaidRewardRolls(raw: unknown): DungeonRaidRewardRoll[] {
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

export function parseWikiRaidRankings(raw: unknown): DungeonRaidRankingBand[] {
  if (!Array.isArray(raw)) return []
  const out: DungeonRaidRankingBand[] = []
  for (const rk of raw) {
    if (!rk || typeof rk !== 'object') continue
    const o = rk as Record<string, unknown>
    out.push({
      start: Number(o.start ?? 0),
      end: Number(o.end ?? 0),
      rewards: parseWikiRaidRewardRolls(o.rewards),
    })
  }
  return out
}
