import type { SupabaseClient } from '@supabase/supabase-js'

import { getMeterPartyBarTheme, type MeterPartyBarThemeId } from './meterPartyBarThemes'

export function normalizePartyTamerThemeKey(tamerName: string): string {
  return tamerName.trim().toLowerCase()
}

type ThemeCacheEntry = {
  themeId: MeterPartyBarThemeId | null
  fetchedAt: number
}

const THEME_CACHE_MS = 60_000
const themeCache = new Map<string, ThemeCacheEntry>()

function readCachedThemeId(tamerKey: string, bustCache: boolean): MeterPartyBarThemeId | null | undefined {
  if (bustCache) {
    themeCache.delete(tamerKey)
    return undefined
  }
  const hit = themeCache.get(tamerKey)
  if (!hit) return undefined
  if (Date.now() - hit.fetchedAt > THEME_CACHE_MS) {
    themeCache.delete(tamerKey)
    return undefined
  }
  return hit.themeId
}

function writeCachedThemeId(tamerKey: string, themeId: MeterPartyBarThemeId | null): void {
  themeCache.set(tamerKey, { themeId, fetchedAt: Date.now() })
}

/** Latest equipped theme per tamer (from their most recent self dungeon parse). */
export async function fetchEquippedThemesForTamers(
  client: SupabaseClient | null,
  tamerNames: Iterable<string>,
  options?: { bustCache?: boolean },
): Promise<Map<string, MeterPartyBarThemeId>> {
  const bustCache = options?.bustCache === true
  const keys = new Set<string>()
  for (const raw of tamerNames) {
    const key = normalizePartyTamerThemeKey(raw)
    if (key) keys.add(key)
  }

  const out = new Map<string, MeterPartyBarThemeId>()
  if (!client || keys.size === 0) return out

  const toFetch: string[] = []
  for (const key of keys) {
    const cached = readCachedThemeId(key, bustCache)
    if (cached === undefined) {
      toFetch.push(key)
      continue
    }
    if (cached) out.set(key, cached)
  }

  if (toFetch.length === 0) return out

  const { data, error } = await client.rpc('meter_equipped_themes_for_tamers', {
    p_tamer_names: toFetch,
  })

  if (error) return out

  const resolved = new Set<string>()
  for (const row of (data ?? []) as { tamer_key?: string; equipped_theme_id?: string }[]) {
    const key = normalizePartyTamerThemeKey(String(row.tamer_key ?? ''))
    const rawId = String(row.equipped_theme_id ?? '').trim()
    if (!key || !rawId) continue
    resolved.add(key)
    const theme = getMeterPartyBarTheme(rawId)
    const themeId = theme?.id ?? null
    writeCachedThemeId(key, themeId)
    if (themeId) out.set(key, themeId)
  }

  for (const key of toFetch) {
    if (resolved.has(key)) continue
    writeCachedThemeId(key, null)
  }

  for (const key of keys) {
    const cached = readCachedThemeId(key, false)
    if (cached) out.set(key, cached)
  }

  return out
}

export function equippedThemeIdForTamer(
  map: Map<string, MeterPartyBarThemeId>,
  tamerName: string,
): MeterPartyBarThemeId | undefined {
  return map.get(normalizePartyTamerThemeKey(tamerName))
}
