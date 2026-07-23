import type { MeterShopCategoryId, MeterShopSubcategoryId } from './meterShopCategories'
import { isShopPurchasableMeterThemeId } from './meterThemeGrants'
import {
  isHallOfFameMeterTheme,
  isVerdandiSssLegendaryTheme,
  MAGIA_LEGENDARY_METER_PARTY_BAR_THEMES,
  MAGIA_RARE_SHOP_THEMES,
  OLYMPOS_XII_COMMON_SHOP_THEMES,
  OLYMPOS_XII_LEGENDARY_METER_PARTY_BAR_THEMES,
  OLYMPOS_XII_RARE_METER_PARTY_BAR_THEMES,
  VERDANDI_LEGENDARY_METER_PARTY_BAR_THEMES,
  VERDANDI_RARE_SHOP_THEMES,
  type MeterPartyBarTheme,
  type MeterPartyBarThemeId,
} from './meterPartyBarThemes'

export const METER_THEME_SHOP_PRICE = 50
export const METER_THEME_SHOP_RARE_PRICE = 75
export const METER_THEME_SHOP_LEGENDARY_PRICE = 150
/** Verdandi SSS Legendary shop price. */
export const METER_THEME_SHOP_SSS_LEGENDARY_PRICE = 200

export const METER_THEME_SHOP_TIER_LABEL = 'Common'
export const METER_THEME_SHOP_RARE_TIER_LABEL = 'Rare'
export const METER_THEME_SHOP_SSS_LEGENDARY_TIER_LABEL = 'SSS Legendary'

export function meterThemeShopPriceForTheme(theme: MeterPartyBarTheme): number {
  if (!isShopPurchasableMeterThemeId(theme.id)) {
    return Number.POSITIVE_INFINITY
  }
  if (isVerdandiSssLegendaryTheme(theme)) return METER_THEME_SHOP_SSS_LEGENDARY_PRICE
  if (theme.variant === 'legendary') return METER_THEME_SHOP_LEGENDARY_PRICE
  if (theme.variant === 'rare') return METER_THEME_SHOP_RARE_PRICE
  return METER_THEME_SHOP_PRICE
}

export function meterThemeShopTierLabelForTheme(theme: MeterPartyBarTheme): string {
  if (isHallOfFameMeterTheme(theme)) return 'Hall of Fame'
  if (isVerdandiSssLegendaryTheme(theme)) return METER_THEME_SHOP_SSS_LEGENDARY_TIER_LABEL
  if (theme.variant === 'rare') return METER_THEME_SHOP_RARE_TIER_LABEL
  if (theme.variant === 'legendary') return 'Legendary'
  return METER_THEME_SHOP_TIER_LABEL
}

export const SHOP_METER_PARTY_BAR_THEMES: MeterPartyBarTheme[] = [
  ...OLYMPOS_XII_COMMON_SHOP_THEMES,
  ...OLYMPOS_XII_RARE_METER_PARTY_BAR_THEMES,
  ...OLYMPOS_XII_LEGENDARY_METER_PARTY_BAR_THEMES,
  ...MAGIA_RARE_SHOP_THEMES,
  ...MAGIA_LEGENDARY_METER_PARTY_BAR_THEMES,
  ...VERDANDI_RARE_SHOP_THEMES,
  ...VERDANDI_LEGENDARY_METER_PARTY_BAR_THEMES,
]

export function shopMeterPartyBarThemesForSubcategory(
  categoryId: MeterShopCategoryId,
  subcategoryId: MeterShopSubcategoryId,
): MeterPartyBarTheme[] {
  if (categoryId === 'magia-bar-themes') {
    if (subcategoryId === 'rare') return MAGIA_RARE_SHOP_THEMES
    if (subcategoryId === 'legendary') return MAGIA_LEGENDARY_METER_PARTY_BAR_THEMES
    return []
  }
  if (categoryId === 'verdandi-bar-themes') {
    if (subcategoryId === 'rare') return VERDANDI_RARE_SHOP_THEMES
    if (subcategoryId === 'legendary') return VERDANDI_LEGENDARY_METER_PARTY_BAR_THEMES
    return []
  }
  if (subcategoryId === 'common') return OLYMPOS_XII_COMMON_SHOP_THEMES
  if (subcategoryId === 'rare') return OLYMPOS_XII_RARE_METER_PARTY_BAR_THEMES
  if (subcategoryId === 'legendary') return OLYMPOS_XII_LEGENDARY_METER_PARTY_BAR_THEMES
  return []
}

export const METER_THEME_PREVIEW_DIGIMON_POOL = [
  'WarGreymon',
  'MetalGarurumon',
  'Imperialdramon',
  'Omnimon',
  'Gallantmon',
  'Sakuyamon',
  'Beelzemon',
  'Dukemon',
  'MirageGaogamon',
  'Ravemon',
  'ShineGreymon',
  'Rosemon',
  'UlforceVeedramon',
  'Craniamon',
  'Magnadramon',
  'Phoenixmon',
  'Barbamon',
  'Leopardmon',
  'Crusadermon',
  'LordKnightmon',
] as const

export const METER_THEME_PREVIEW_BAR_FILL = [42, 55, 68] as const

export function previewDigimonForTheme(themeId: MeterPartyBarThemeId, seed = 0): string[] {
  const pool = METER_THEME_PREVIEW_DIGIMON_POOL
  let h = 0
  for (let i = 0; i < themeId.length; i += 1) h = (h * 31 + themeId.charCodeAt(i)) | 0
  h = (h + seed * 17) | 0
  const picks: string[] = []
  const used = new Set<number>()
  while (picks.length < 3 && used.size < pool.length) {
    const idx = Math.abs((h + picks.length * 9973) % pool.length)
    h = (h * 16807) | 0
    if (used.has(idx)) continue
    used.add(idx)
    picks.push(pool[idx]!)
  }
  return picks
}

export function meterThemePreviewStats(fillPct: number, rowIndex: number) {
  const base = 12000 + fillPct * 180 + rowIndex * 400
  const dps = Math.round(base)
  const durationSec = 90 + rowIndex * 3
  const totalDamage = Math.round(dps * durationSec)
  return { dps, totalDamage, durationSec }
}
