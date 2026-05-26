import {
  olympusOverlayObjectPosition,
  olympusOverlayPortraitUrl,
} from '../lib/meterOlympusOverlayPortrait'
import type { MeterPartyBarTheme } from '../lib/meterPartyBarThemes'

type MeterOlympusBarDigimonOverlayProps = {
  theme: MeterPartyBarTheme
}

/** Rare Olympos bar — transparent PNG watermark centered on the fill. */
export function MeterOlympusBarDigimonOverlay({ theme }: MeterOlympusBarDigimonOverlayProps) {
  const portraitUrl = olympusOverlayPortraitUrl(theme)
  if (!portraitUrl) return null

  return (
    <img
      className="meter-party-olympus-digimon-overlay"
      src={portraitUrl}
      alt=""
      aria-hidden
      decoding="async"
      style={{ objectPosition: olympusOverlayObjectPosition(theme) }}
    />
  )
}
