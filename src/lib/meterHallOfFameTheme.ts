import type { SupabaseClient } from '@supabase/supabase-js'

import { filterGoldRecordBreaks, mapHofGoldRpcRow } from './meterHallOfFameGold'
import { normalizeRoutePlayerKey } from './meterPlayerProfileGrant'
import { fetchStoredConfirmedPlayerKey } from './meterPointGrants'

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

/** Induction count — same rules as the website profile (excludes self-record improvements). */
export async function fetchMeterPlayerHofRecordCount(
  client: SupabaseClient,
  playerKey: string,
): Promise<{ count: number; error: string | null }> {
  const key = playerKey.trim().toLowerCase()
  if (!key) return { count: 0, error: null }

  const scopes = await fetchPlayerMeterScopes(client, key, HOF_SCOPE_LIMIT)
  if (!scopes.length) return { count: 0, error: null }

  let total = 0

  for (let i = 0; i < scopes.length; i += HOF_SCOPE_BATCH) {
    const batch = scopes.slice(i, i + HOF_SCOPE_BATCH)
    const batchResults = await Promise.all(
      batch.map(async (scope) => {
        const { data, error } = await client.rpc('get_meter_hof_gold_breaks', {
          p_dungeon_id: scope.dungeonId,
          p_difficulty_id: scope.difficultyId,
        })
        if (error) return { count: 0, error: error.message }

        const rows = filterGoldRecordBreaks(
          (data ?? [])
            .map((row) => mapHofGoldRpcRow(row))
            .filter((row): row is NonNullable<typeof row> => row != null),
        )
        const count = rows.filter((row) => row.playerKey === key).length
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
