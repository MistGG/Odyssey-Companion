import { verdandiOverlayImageStyle, verdandiOverlayPortraitUrl } from '../lib/meterVerdandiOverlayPortrait'
import type { MeterPartyBarTheme } from '../lib/meterPartyBarThemes'

type MeterVerdandiBarDigimonOverlayProps = {
  theme: MeterPartyBarTheme
}

/** Verdandi cycle bar — transparent PNG watermark centered on the fill. */
export function MeterVerdandiBarDigimonOverlay({ theme }: MeterVerdandiBarDigimonOverlayProps) {
  const portraitUrl = verdandiOverlayPortraitUrl(theme)
  if (!portraitUrl) return null

  return (
    <img
      className={`meter-party-verdandi-digimon-overlay meter-party-verdandi-digimon-overlay--${theme.barStyleId}`}
      src={portraitUrl}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      style={verdandiOverlayImageStyle(theme)}
    />
  )
}
