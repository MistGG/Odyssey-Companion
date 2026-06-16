import { magiaOverlayImageStyle, magiaOverlayPortraitUrl } from '../lib/meterMagiaOverlayPortrait'
import type { MeterPartyBarTheme } from '../lib/meterPartyBarThemes'

type MeterMagiaBarDigimonOverlayProps = {
  theme: MeterPartyBarTheme
}

/** Magia cycle bar — transparent PNG watermark centered on the fill. */
export function MeterMagiaBarDigimonOverlay({ theme }: MeterMagiaBarDigimonOverlayProps) {
  const portraitUrl = magiaOverlayPortraitUrl(theme)
  if (!portraitUrl) return null

  return (
    <img
      className={`meter-party-magia-digimon-overlay meter-party-magia-digimon-overlay--${theme.barStyleId}`}
      src={portraitUrl}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      style={magiaOverlayImageStyle(theme)}
    />
  )
}
