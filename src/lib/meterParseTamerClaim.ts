import type { SupabaseClient } from '@supabase/supabase-js'
import type { MeterDungeonPartyMemberParse } from './supabaseMeter'

const SELF_TAMER_STORAGE_KEY = 'odyssey-meter-self-tamer'

export function rememberSelfTamerName(tamerName: string): void {
  const name = tamerName.trim()
  if (!name) return
  try {
    localStorage.setItem(SELF_TAMER_STORAGE_KEY, name)
  } catch {
    /* */
  }
}

export function readRememberedSelfTamerName(): string | null {
  try {
    const raw = localStorage.getItem(SELF_TAMER_STORAGE_KEY)?.trim()
    return raw || null
  } catch {
    return null
  }
}

export function selfTamerNameFromDungeonMembers(
  members: Pick<MeterDungeonPartyMemberParse, 'isSelf' | 'tamerName' | 'displayLabel'>[],
): string | null {
  for (const member of members) {
    if (!member.isSelf) continue
    const name = member.tamerName?.trim() || member.displayLabel?.trim()
    if (name) return name
  }
  return null
}

/** Attach anonymous companion uploads (isSelf) to the signed-in account. */
export async function claimAnonymousMeterParsesForTamer(
  client: SupabaseClient,
  tamerName: string,
): Promise<{ claimed: number; error: string | null }> {
  const name = tamerName.trim()
  if (!name) return { claimed: 0, error: null }

  const { data, error } = await client.rpc('claim_anonymous_meter_parses_for_tamer', {
    p_tamer_name: name,
  })

  if (error) return { claimed: 0, error: error.message }

  const claimed = typeof data === 'number' ? data : Number(data) || 0
  return { claimed, error: null }
}
