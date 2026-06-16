import type { SupabaseClient } from '@supabase/supabase-js'

import { filterGoldRecordBreaks, mapHofGoldRpcRow, type HofGoldRow } from './meterHallOfFameGold'
import {
  getMeterLeaderboardCycle,
  meterLeaderboardCycleWindow,
} from './meterLeaderboardCycles'
import { normalizeRoutePlayerKey } from './meterPlayerProfileGrant'
import { fetchStoredConfirmedPlayerKey } from './meterPointGrants'
import {
  HALL_OF_FAME_THEME_ID,
  MAGIA_HALL_OF_FAME_THEME_ID,
  type MeterPartyBarTheme,
  type MeterPartyBarThemeId,
} from './meterPartyBarThemes'

/** Matches `get_meter_player_scopes` RPC cap (50). */
const HOF_SCOPE_LIMIT = 50
const HOF_SCOPE_BATCH = 4

/** Demo record count for shop / theme previews. */
export const HOF_PREVIEW_DEMO_RECORD_COUNT = 7

type ScopeRef = { dungeonId: string; difficultyId: number }

async function fetchPlayerMeterScopes(
  client: SupabaseClient,
  playerKey: string,
  limit: number,
): Promise<ScopeRef[]> {
  const { data, error } = await client.rpc('get_meter_player_scopes', {
    p_player_key: playerKey,
    p_limit: limit,
  })
  if (error || !data?.length) return []

  return (data as Array<{ dungeon_id?: string; difficulty_id?: number }>)
    .map((row) => {
      const dungeonId = row.dungeon_id?.trim() ?? ''
      const difficultyId = row.difficulty_id ?? 0
      if (!dungeonId || difficultyId < 2) return null
      return { dungeonId, difficultyId }
    })
    .filter((row): row is ScopeRef => row != null)
}

function rowInCycleWindow(
  achievedAt: string,
  windowStart: string,
  windowEnd: string | null,
): boolean {
  const t = new Date(achievedAt).getTime()
  if (!Number.isFinite(t)) return false
  const start = new Date(windowStart).getTime()
  if (t < start) return false
  if (windowEnd) {
    const end = new Date(windowEnd).getTime()
    if (t >= end) return false
  }
  return true
}

function mapRpcHofGoldRows(
  data: unknown,
  windowStart: string,
  windowEnd: string | null,
): HofGoldRow[] {
  return (data ?? [])
    .map((row) => mapHofGoldRpcRow(row as Parameters<typeof mapHofGoldRpcRow>[0]))
    .filter((row): row is HofGoldRow => row != null)
    .filter((row) => rowInCycleWindow(row.achievedAt, windowStart, windowEnd))
}

async function fetchScopeHofGoldRows(
  client: SupabaseClient,
  scope: ScopeRef,
  windowStart: string,
  windowEnd: string | null,
): Promise<{ rows: HofGoldRow[]; error: string | null }> {
  const windowed = await client.rpc('get_meter_hof_gold_breaks', {
    p_dungeon_id: scope.dungeonId,
    p_difficulty_id: scope.difficultyId,
    p_window_start: windowStart,
    p_window_end: windowEnd,
  })
  if (!windowed.error) {
    return { rows: mapRpcHofGoldRows(windowed.data, windowStart, windowEnd), error: null }
  }

  const fallback = await client.rpc('get_meter_hof_gold_breaks', {
    p_dungeon_id: scope.dungeonId,
    p_difficulty_id: scope.difficultyId,
  })
  if (fallback.error) return { rows: [], error: fallback.error.message }
  return { rows: mapRpcHofGoldRows(fallback.data, windowStart, windowEnd), error: null }
}

function hofThemeCycleId(themeId: MeterPartyBarThemeId): string | null {
  if (themeId === HALL_OF_FAME_THEME_ID) return 'olympus'
  if (themeId === MAGIA_HALL_OF_FAME_THEME_ID) return 'magia'
  return null
}

/** Induction count for a cycle — same rules as the website profile (per scope). */
export async function fetchMeterPlayerHofRecordCount(
  client: SupabaseClient,
  playerKey: string,
  options?: { cycleId?: string },
): Promise<{ count: number; error: string | null }> {
  const key = playerKey.trim().toLowerCase()
  if (!key) return { count: 0, error: null }

  const cycleId = options?.cycleId?.trim() || 'magia'
  const cycle = getMeterLeaderboardCycle(cycleId)
  if (!cycle) return { count: 0, error: null }
  const { windowStart, windowEnd } = meterLeaderboardCycleWindow(cycle)

  const scopes = await fetchPlayerMeterScopes(client, key, HOF_SCOPE_LIMIT)
  if (!scopes.length) return { count: 0, error: null }

  let total = 0

  for (let i = 0; i < scopes.length; i += HOF_SCOPE_BATCH) {
    const batch = scopes.slice(i, i + HOF_SCOPE_BATCH)
    const batchResults = await Promise.all(
      batch.map(async (scope) => {
        const { rows, error } = await fetchScopeHofGoldRows(
          client,
          scope,
          windowStart,
          windowEnd,
        )
        if (error) return { count: 0, error }

        // Gold logic is per dungeon scope — same as website fetchScopeHallOfFameGoldEntries.
        const gold = filterGoldRecordBreaks(rows)
        const count = gold.filter((row) => row.playerKey === key).length
        return { count, error: null as string | null }
      }),
    )

    for (const result of batchResults) {
      if (result.error) return { count: 0, error: result.error }
      total += result.count
    }
  }

  return { count: total, error: null }
}

export async function fetchMeterPlayerHofRecordCountsByCycle(
  client: SupabaseClient,
  playerKey: string,
): Promise<{ counts: Record<string, number>; error: string | null }> {
  const results = await Promise.all(
    (['olympus', 'magia'] as const).map(async (cycle) => {
      const res = await fetchMeterPlayerHofRecordCount(client, playerKey, { cycleId: cycle })
      return { cycle, ...res }
    }),
  )
  for (const result of results) {
    if (result.error) return { counts: {}, error: result.error }
  }
  const counts: Record<string, number> = {}
  for (const result of results) counts[result.cycle] = result.count
  return { counts, error: null }
}

export async function fetchMeterPlayerHofRecordCountForTheme(
  client: SupabaseClient,
  playerKey: string,
  themeId: MeterPartyBarThemeId,
): Promise<{ count: number; error: string | null }> {
  const cycleId = hofThemeCycleId(themeId)
  if (!cycleId) return { count: 0, error: null }
  return fetchMeterPlayerHofRecordCount(client, playerKey, { cycleId })
}

export function hofRecordCountForTheme(
  theme: MeterPartyBarTheme | null | undefined,
  counts: Record<string, number>,
): number {
  if (!theme) return 0
  if (theme.id === HALL_OF_FAME_THEME_ID) return counts.olympus ?? 0
  if (theme.id === MAGIA_HALL_OF_FAME_THEME_ID) return counts.magia ?? 0
  return 0
}

export async function resolveMeterPlayerKeyForHof(
  client: SupabaseClient,
  profileDisplayName: string | null,
): Promise<string | null> {
  const stored = await fetchStoredConfirmedPlayerKey(client)
  if (stored) return stored
  const name = profileDisplayName?.trim()
  return name ? normalizeRoutePlayerKey(name) : null
}

export function userQualifiesForHallOfFameTheme(recordCount: number): boolean {
  return recordCount > 0
}

const HOF_AUTO_EQUIP_STORAGE_PREFIX = 'odyssey-meter-hof-auto-equipped:'

export function readHofThemeAutoEquipDone(userId: string): boolean {
  try {
    return localStorage.getItem(`${HOF_AUTO_EQUIP_STORAGE_PREFIX}${userId}`) === '1'
  } catch {
    return false
  }
}

export function writeHofThemeAutoEquipDone(userId: string): void {
  try {
    localStorage.setItem(`${HOF_AUTO_EQUIP_STORAGE_PREFIX}${userId}`, '1')
  } catch {
    /* ignore */
  }
}
