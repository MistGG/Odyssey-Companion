import type { OverlaySettings } from '../types'

export function normalizeBossTimerIgnoredIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

export function toggleBossTimerIgnore(
  settings: OverlaySettings,
  monsterId: string,
): OverlaySettings {
  const id = monsterId.trim()
  if (!id) return settings
  const next = new Set(settings.bossTimerIgnoredMonsterIds)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return { ...settings, bossTimerIgnoredMonsterIds: [...next].sort() }
}
