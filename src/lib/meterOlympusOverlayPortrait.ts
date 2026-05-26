import type { OlymposXiiBaseThemeId, MeterPartyBarTheme } from './meterPartyBarThemes'

/** Bundled PNGs (sync from digimon-hub `src/assets/meter-themes/olympus/`). */
const OLYMPUS_OVERLAY_SRC = import.meta.glob<string>('../assets/meter-themes/olympus/*.png', {
  eager: true,
  import: 'default',
})

const OLYMPUS_OVERLAY_FILES: Record<OlymposXiiBaseThemeId, string> = {
  apollomon: 'apollomon.png',
  bacchusmon: 'bacchusmon.png',
  ceresmon: 'ceresmon.png',
  dianamon: 'dianamon.png',
  junomon: 'junomon.png',
  jupitermon: 'jupitermon.png',
  marsmon: 'marsmon.png',
  mercurymon: 'mercurymon.png',
  minervamon: 'minervamon.png',
  neptunemon: 'neptunemon.png',
  venusmon: 'venusmon.png',
  vulcanusmon: 'vulcanusmon.png',
}

function bundledOlympusOverlayUrl(styleId: OlymposXiiBaseThemeId): string | undefined {
  const file = OLYMPUS_OVERLAY_FILES[styleId]
  if (!file) return undefined
  return OLYMPUS_OVERLAY_SRC[`../assets/meter-themes/olympus/${file}`]
}

/** Vertical `object-position` % — lower shows more head, higher shows more body/feet. */
const OLYMPUS_OVERLAY_FOCUS_Y: Record<OlymposXiiBaseThemeId, number> = {
  apollomon: 16,
  bacchusmon: 38,
  ceresmon: 38,
  jupitermon: 38,
  venusmon: 24,
  dianamon: 36,
  junomon: 42,
  mercurymon: 18,
  minervamon: 34,
  neptunemon: 4,
  vulcanusmon: 18,
  marsmon: 14,
}

export function olympusOverlayPortraitUrl(theme: MeterPartyBarTheme): string | undefined {
  if (theme.variant !== 'rare') return undefined
  return bundledOlympusOverlayUrl(theme.barStyleId as OlymposXiiBaseThemeId)
}

export function olympusOverlayObjectPosition(theme: MeterPartyBarTheme): string {
  const styleId = theme.barStyleId as OlymposXiiBaseThemeId
  const y = OLYMPUS_OVERLAY_FOCUS_Y[styleId]
  return `center ${y}%`
}
