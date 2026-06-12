import type { SupabaseClient } from '@supabase/supabase-js'

import type { PublicMeterParseRow } from './meterPublicStats'

const MY_METER_PARSES_LIMIT = 150
const MY_METER_PARSE_GRANT_SELECT =
  'id, created_at, duration_sec, app_version, total_damage, hit_count, parse_kind, dungeon_id, dungeon_name, difficulty, difficulty_id, leaderboard_summary, payload'

type MeterParseRowDb = PublicMeterParseRow & { user_id?: string }

function rowsOwnedByUser(rows: MeterParseRowDb[], userId: string): PublicMeterParseRow[] {
  return rows.filter((row) => row.user_id === userId)
}

export async function fetchMyMeterParsesForGrants(
  supabase: SupabaseClient | null,
): Promise<{ rows: PublicMeterParseRow[]; error: string | null }> {
  if (!supabase) {
    return { rows: [], error: null }
  }

  const { data: authData, error: authError } = await supabase.auth.getUser()
  const userId = authData.user?.id
  if (authError || !userId) {
    return { rows: [], error: null }
  }

  const { data, error } = await supabase
    .from('meter_parses')
    .select(`${MY_METER_PARSE_GRANT_SELECT}, user_id`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MY_METER_PARSES_LIMIT)

  if (error) return { rows: [], error: error.message }

  const owned = rowsOwnedByUser((data ?? []) as MeterParseRowDb[], userId)
  return { rows: owned, error: null }
}
