import type { SupabaseClient } from '@supabase/supabase-js'

import {
  fetchMeterPlayerHofRecordCountForTheme,
  readHofThemeAutoEquipDone,
  resolveMeterPlayerKeyForHof,
  userQualifiesForHallOfFameTheme,
  writeHofThemeAutoEquipDone,
} from './meterHallOfFameTheme'
import { getDefaultMeterLeaderboardCycle } from './meterLeaderboardCycles'
import {
  clearEquippedMeterPartyBarThemeId,
  DEV_METER_TAMER_NAME,
  EARNABLE_METER_PARTY_BAR_THEMES,
  getMeterPartyBarTheme,
  HALL_OF_FAME_THEME_ID,
  isMistTamer,
  MAGIA_HALL_OF_FAME_THEME_ID,
  METER_PARTY_BAR_THEMES,
  MIST_DEV_REWARD_THEME_ID,
  type MeterPartyBarTheme,
  type MeterPartyBarThemeId,
  writeEquippedMeterPartyBarThemeId,
} from './meterPartyBarThemes'

export type CompanionRewardTheme = MeterPartyBarTheme & {
  owned: boolean
  hofRecordCount?: number
}

async function grantHallOfFameThemesIfEligible(
  client: SupabaseClient,
  profileDisplayName: string | null,
  themes: CompanionRewardTheme[],
): Promise<void> {
  const playerKey = await resolveMeterPlayerKeyForHof(client, profileDisplayName)
  if (!playerKey) return
  for (const themeId of [HALL_OF_FAME_THEME_ID, MAGIA_HALL_OF_FAME_THEME_ID] as const) {
    const { count } = await fetchMeterPlayerHofRecordCountForTheme(client, playerKey, themeId)
    if (!userQualifiesForHallOfFameTheme(count)) continue
    const theme = getMeterPartyBarTheme(themeId)
    if (!theme) continue
    const existing = themes.find((t) => t.id === theme.id)
    if (existing) {
      existing.hofRecordCount = count
      existing.owned = true
    } else {
      themes.push({ ...theme, owned: true, hofRecordCount: count })
    }
  }
}

/**
 * First time a record breaker has no bar theme equipped, auto-apply the live-cycle
 * breaker theme once. Never runs again after that (even if they unequip later).
 */
export async function maybeAutoEquipHallOfFameTheme(
  client: SupabaseClient,
  profileDisplayName: string | null,
  equippedThemeId: string | null,
): Promise<{ equipped: boolean; error: string | null }> {
  const { data: auth } = await client.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return { equipped: false, error: null }

  if (readHofThemeAutoEquipDone(userId)) return { equipped: false, error: null }
  if (equippedThemeId?.trim()) return { equipped: false, error: null }

  const playerKey = await resolveMeterPlayerKeyForHof(client, profileDisplayName)
  if (!playerKey) return { equipped: false, error: null }

  const liveThemeId = getDefaultMeterLeaderboardCycle().hofThemeId
  const { count } = await fetchMeterPlayerHofRecordCountForTheme(
    client,
    playerKey,
    liveThemeId,
  )
  if (!userQualifiesForHallOfFameTheme(count)) return { equipped: false, error: null }

  const res = await equipCompanionMeterTheme(client, liveThemeId, profileDisplayName)
  if (!res.ok) return { equipped: false, error: res.error }

  writeHofThemeAutoEquipDone(userId)
  return { equipped: true, error: null }
}

export async function fetchCompanionRewardThemes(
  client: SupabaseClient,
  profileDisplayName: string | null,
): Promise<{ themes: CompanionRewardTheme[]; equippedThemeId: string | null; error: string | null }> {
  const { data: purchases, error: purchaseError } = await client.from('meter_theme_purchases').select('theme_id')
  if (purchaseError) {
    return { themes: [], equippedThemeId: null, error: purchaseError.message }
  }

  const owned = new Set((purchases ?? []).map((r) => String(r.theme_id)))
  const mistDev = isMistTamer(profileDisplayName)

  const themes: CompanionRewardTheme[] = []
  if (mistDev) {
    const iliad = getMeterPartyBarTheme('iliad-core')
    if (iliad) themes.push({ ...iliad, owned: true })
  }
  await grantHallOfFameThemesIfEligible(client, profileDisplayName, themes)
  for (const theme of EARNABLE_METER_PARTY_BAR_THEMES) {
    if (owned.has(theme.id)) themes.push({ ...theme, owned: true })
  }

  const { data: account, error: accountError } = await client
    .from('meter_reward_accounts')
    .select('equipped_theme_id')
    .maybeSingle()

  if (accountError) {
    return { themes, equippedThemeId: null, error: accountError.message }
  }

  const equipped = (account as { equipped_theme_id?: string } | null)?.equipped_theme_id?.trim() || null
  return { themes, equippedThemeId: equipped, error: null }
}

async function upsertEquippedTheme(
  client: SupabaseClient,
  themeId: MeterPartyBarThemeId,
): Promise<void> {
  writeEquippedMeterPartyBarThemeId(themeId)
  const { data: auth } = await client.auth.getUser()
  if (auth.user?.id) {
    await client.from('meter_reward_accounts').upsert({
      user_id: auth.user.id,
      equipped_theme_id: themeId,
      updated_at: new Date().toISOString(),
    })
  }
}

export async function equipCompanionMeterTheme(
  client: SupabaseClient,
  themeId: MeterPartyBarThemeId,
  profileDisplayName: string | null,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await client.rpc('meter_equip_theme', { p_theme_id: themeId })
  if (!error && data?.ok) {
    writeEquippedMeterPartyBarThemeId(themeId)
    return { ok: true, error: null }
  }

  if (data?.error === 'not_owned' && themeId === MIST_DEV_REWARD_THEME_ID && isMistTamer(profileDisplayName)) {
    await upsertEquippedTheme(client, themeId)
    return { ok: true, error: null }
  }

  if (
    data?.error === 'not_owned' &&
    (themeId === HALL_OF_FAME_THEME_ID || themeId === MAGIA_HALL_OF_FAME_THEME_ID)
  ) {
    const playerKey = await resolveMeterPlayerKeyForHof(client, profileDisplayName)
    if (playerKey) {
      const { count } = await fetchMeterPlayerHofRecordCountForTheme(client, playerKey, themeId)
      if (userQualifiesForHallOfFameTheme(count)) {
        await upsertEquippedTheme(client, themeId)
        return { ok: true, error: null }
      }
    }
    return {
      ok: false,
      error:
        themeId === MAGIA_HALL_OF_FAME_THEME_ID
          ? 'Earn a Magia cycle record break to unlock this theme.'
          : 'Earn an Olympus cycle record break to unlock this theme.',
    }
  }

  if (data?.error === 'not_owned') {
    return { ok: false, error: 'Purchase this theme on the Odyssey Calc site first.' }
  }

  return { ok: false, error: error?.message ?? 'Could not equip theme.' }
}

export async function unequipCompanionMeterTheme(
  client: SupabaseClient,
): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await client.rpc('meter_unequip_theme')
  if (!error && data?.ok) {
    clearEquippedMeterPartyBarThemeId()
    return { ok: true, error: null }
  }

  const { data: auth, error: authError } = await client.auth.getUser()
  const userId = auth.user?.id
  if (authError || !userId) {
    return { ok: false, error: error?.message ?? authError?.message ?? 'Not signed in.' }
  }

  const { error: upsertError } = await client.from('meter_reward_accounts').upsert({
    user_id: userId,
    equipped_theme_id: null,
    updated_at: new Date().toISOString(),
  })

  if (upsertError) {
    return { ok: false, error: upsertError.message }
  }

  clearEquippedMeterPartyBarThemeId()
  return { ok: true, error: null }
}

export function companionThemeLabel(theme: CompanionRewardTheme): string {
  if (theme.id === MIST_DEV_REWARD_THEME_ID) return `${theme.label} (Unique)`
  if (theme.id === HALL_OF_FAME_THEME_ID || theme.id === MAGIA_HALL_OF_FAME_THEME_ID) {
    const n = theme.hofRecordCount ?? 0
    return n > 0 ? `${theme.label} · ${n} break${n === 1 ? '' : 's'}` : theme.label
  }
  return theme.label
}

export { DEV_METER_TAMER_NAME, METER_PARTY_BAR_THEMES }
