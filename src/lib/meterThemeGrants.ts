import {
  HALL_OF_FAME_THEME_ID,
  MIST_DEV_REWARD_THEME_ID,
  type MeterPartyBarThemeId,
} from './meterPartyBarThemes'

/** Themes that cannot be bought with shop points (granted by rules or dev). */
export const GRANT_ONLY_METER_THEME_IDS: readonly MeterPartyBarThemeId[] = [
  MIST_DEV_REWARD_THEME_ID,
  HALL_OF_FAME_THEME_ID,
]

export function isGrantOnlyMeterThemeId(themeId: string): themeId is MeterPartyBarThemeId {
  return (GRANT_ONLY_METER_THEME_IDS as readonly string[]).includes(themeId)
}

/** Only Olympos shop catalog themes may be purchased for points. */
export function isShopPurchasableMeterThemeId(themeId: string): boolean {
  return !isGrantOnlyMeterThemeId(themeId)
}
