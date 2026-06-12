import type { SupabaseClient } from '@supabase/supabase-js'

import { getMeterPartyBarTheme, type MeterPartyBarThemeId } from './meterPartyBarThemes'
import { meterThemeShopPriceForTheme } from './meterThemeShop'
import { isShopPurchasableMeterThemeId } from './meterThemeGrants'

export async function purchaseMeterTheme(
  supabase: SupabaseClient,
  themeId: MeterPartyBarThemeId,
): Promise<{ ok: boolean; balance: number; error: string | null }> {
  if (!isShopPurchasableMeterThemeId(themeId)) {
    return { ok: false, balance: 0, error: 'This theme cannot be purchased.' }
  }
  const theme = getMeterPartyBarTheme(themeId)
  const cost = theme ? meterThemeShopPriceForTheme(theme) : 50
  const { data, error } = await supabase.rpc('meter_purchase_theme', {
    p_theme_id: themeId,
    p_cost: cost,
  })
  if (error) return { ok: false, balance: 0, error: error.message }
  if (data?.error === 'insufficient_points') {
    return { ok: false, balance: Number(data.balance ?? 0), error: 'Not enough points.' }
  }
  if (data?.error === 'already_owned') {
    return { ok: false, balance: Number(data.balance ?? 0), error: 'You already own this theme.' }
  }
  return { ok: Boolean(data?.ok), balance: Number(data.balance ?? 0), error: null }
}
