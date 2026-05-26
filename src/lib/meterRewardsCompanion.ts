import type { SupabaseClient } from '@supabase/supabase-js'

import {
  clearEquippedMeterPartyBarThemeId,
  DEV_METER_TAMER_NAME,
  EARNABLE_METER_PARTY_BAR_THEMES,
  getMeterPartyBarTheme,
  isMistTamer,
  METER_PARTY_BAR_THEMES,
  type MeterPartyBarTheme,
  type MeterPartyBarThemeId,
  writeEquippedMeterPartyBarThemeId,
} from './meterPartyBarThemes'

export type CompanionRewardTheme = MeterPartyBarTheme & { owned: boolean }

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

  if (
    data?.error === 'not_owned' &&
    themeId === 'iliad-core' &&
    isMistTamer(profileDisplayName)
  ) {
    writeEquippedMeterPartyBarThemeId(themeId)
    const { data: auth } = await client.auth.getUser()
    if (auth.user?.id) {
      await client.from('meter_reward_accounts').upsert({
        user_id: auth.user.id,
        equipped_theme_id: themeId,
        updated_at: new Date().toISOString(),
      })
    }
    return { ok: true, error: null }
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

export function companionThemeLabel(theme: MeterPartyBarTheme): string {
  if (theme.id === 'iliad-core') return `${theme.label} (Unique)`
  return theme.label
}

export { DEV_METER_TAMER_NAME, METER_PARTY_BAR_THEMES }
