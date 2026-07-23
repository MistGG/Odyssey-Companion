import type { CSSProperties } from 'react'
import type { MeterPartyBarTheme, VerdandiBaseThemeId } from './meterPartyBarThemes'
import { isVerdandiMeterShopTheme } from './meterPartyBarThemes'

/** Bundled PNGs (regenerate via `node scripts/process-verdandi-overlays.mjs`). */
const VERDANDI_OVERLAY_SRC = import.meta.glob<string>('../assets/meter-themes/verdandi/*.png', {
  eager: true,
  import: 'default',
})

const VERDANDI_OVERLAY_FILES: Record<VerdandiBaseThemeId, string> = {
  omegamon: 'omegamon.png',
  'ulforce-veemon-x': 'ulforce-veemon-x.png',
  'alphamon-ouryuken': 'alphamon-ouryuken.png',
}

function bundledVerdandiOverlayUrl(styleId: VerdandiBaseThemeId): string | undefined {
  const file = VERDANDI_OVERLAY_FILES[styleId]
  if (!file) return undefined
  return VERDANDI_OVERLAY_SRC[`../assets/meter-themes/verdandi/${file}`]
}

/** Vertical `object-position` % — lower shows more head, higher shows more body/feet. */
const VERDANDI_OVERLAY_FOCUS_Y: Record<VerdandiBaseThemeId, number> = {
  omegamon: 20,
  'ulforce-veemon-x': 46,
  'alphamon-ouryuken': 28,
}

/** Raise (+) or lower (−) the watermark within the bar clip. */
const VERDANDI_OVERLAY_RAISE_PCT: Record<VerdandiBaseThemeId, number> = {
  omegamon: 2,
  'ulforce-veemon-x': -8,
  'alphamon-ouryuken': 2,
}

/** Rare / legendary Verdandi bar themes — transparent PNG watermark. */
export function verdandiOverlayPortraitUrl(theme: MeterPartyBarTheme): string | undefined {
  if (!isVerdandiMeterShopTheme(theme)) return undefined
  if (theme.variant !== 'rare' && theme.variant !== 'legendary') return undefined
  return bundledVerdandiOverlayUrl(theme.barStyleId as VerdandiBaseThemeId)
}

export function verdandiOverlayObjectPosition(theme: MeterPartyBarTheme): string {
  const styleId = theme.barStyleId as VerdandiBaseThemeId
  const y = VERDANDI_OVERLAY_FOCUS_Y[styleId] ?? 28
  return `center ${y}%`
}

export function verdandiOverlayImageStyle(theme: MeterPartyBarTheme): CSSProperties {
  const styleId = theme.barStyleId as VerdandiBaseThemeId
  const raise = VERDANDI_OVERLAY_RAISE_PCT[styleId] ?? 0
  return {
    objectPosition: verdandiOverlayObjectPosition(theme),
    transform: `translate(-50%, calc(-50% - ${raise}%))`,
  }
}
