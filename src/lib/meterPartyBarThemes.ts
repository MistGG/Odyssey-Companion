import type { CSSProperties } from 'react'

/** Live tamer name for the companion author. */
export const DEV_METER_TAMER_NAME = 'Mist'

/** Shop / card copy for Olympos XII themes (digimon subtitle line). */
export const OLYMPUS_XII_SHOP_PREFIX = 'Olympus XII'

export function olympusThemeShopDigimonLine(theme: MeterPartyBarTheme): string {
  const name = theme.label.replace(/\s*\(Rare\)\s*$/i, '').trim()
  return `${OLYMPUS_XII_SHOP_PREFIX} - ${name}`
}

export const MIST_DEV_REWARD_THEME_ID: MeterPartyBarThemeId = 'iliad-core'
export const HALL_OF_FAME_THEME_ID: MeterPartyBarThemeId = 'hall-of-fame'
export const MAGIA_HALL_OF_FAME_THEME_ID: MeterPartyBarThemeId = 'magia-hall-of-fame'

export function meterThemeRewardsCardTitle(
  theme: MeterPartyBarTheme,
  hofRecordCount?: number,
): string {
  if (theme.id === MIST_DEV_REWARD_THEME_ID) return theme.label
  if (theme.id === HALL_OF_FAME_THEME_ID || theme.id === MAGIA_HALL_OF_FAME_THEME_ID) {
    const n = hofRecordCount ?? 0
    return n > 0 ? `${theme.label} · ${n} break${n === 1 ? '' : 's'}` : theme.label
  }
  return olympusThemeShopDigimonLine(theme)
}

export function meterThemePreviewDigimonLine(theme: MeterPartyBarTheme): string {
  if (theme.id === MIST_DEV_REWARD_THEME_ID) return theme.subtitle
  if (theme.id === HALL_OF_FAME_THEME_ID || theme.id === MAGIA_HALL_OF_FAME_THEME_ID) {
    return theme.subtitle
  }
  return olympusThemeShopDigimonLine(theme)
}

export function isHallOfFameMeterTheme(
  theme: MeterPartyBarTheme | null | undefined,
): theme is MeterPartyBarTheme {
  return theme?.id === HALL_OF_FAME_THEME_ID || theme?.id === MAGIA_HALL_OF_FAME_THEME_ID
}

export function hofOverlayVariantForTheme(
  theme: MeterPartyBarTheme | null | undefined,
): 'olympus' | 'magia' {
  return theme?.id === MAGIA_HALL_OF_FAME_THEME_ID ? 'magia' : 'olympus'
}

const EQUIPPED_THEME_STORAGE_KEY = 'odyssey-meter-bar-theme'

export type OlymposXiiBaseThemeId =
  | 'apollomon'
  | 'bacchusmon'
  | 'ceresmon'
  | 'dianamon'
  | 'junomon'
  | 'jupitermon'
  | 'marsmon'
  | 'mercurymon'
  | 'minervamon'
  | 'neptunemon'
  | 'venusmon'
  | 'vulcanusmon'

export type MeterPartyBarThemeId =
  | 'iliad-core'
  | 'hall-of-fame'
  | 'magia-hall-of-fame'
  | OlymposXiiBaseThemeId
  | `${OlymposXiiBaseThemeId}-rare`
  | `${OlymposXiiBaseThemeId}-legendary`

export type MeterPartyBarThemeVariant = 'common' | 'rare' | 'legendary'

export type MeterPartyBarTheme = {
  id: MeterPartyBarThemeId
  /** CSS gradient key (common + rare share the same bar art). */
  barStyleId: string
  variant?: MeterPartyBarThemeVariant
  /** UI label (Olympos XII member). */
  label: string
  /** Short badge on the party row. */
  badge: string
  domain: string
  earnable: boolean
  /** Shown under tamer name when previewing themes. */
  subtitle: string
  style: {
    accent: string
    c1: string
    c2: string
    grid: string
  }
}

const ILIAD_CORE_THEME: MeterPartyBarTheme = {
    id: 'iliad-core',
    barStyleId: 'iliad-core',
    label: 'Iliad Core',
    badge: '',
    domain: 'Digital World — Iliad',
    earnable: false,
    subtitle: 'Homeros · Digital World Iliad',
    style: {
      accent: '#3ee0ff',
      c1: 'rgba(6, 22, 30, 0.94)',
      c2: 'rgba(12, 52, 68, 0.88)',
      grid: 'rgba(62, 224, 255, 0.1)',
    },
  }

const HALL_OF_FAME_THEME: MeterPartyBarTheme = {
  id: 'hall-of-fame',
  barStyleId: 'hall-of-fame',
  label: 'Olympus Breaker',
  badge: '',
  domain: 'Olympus cycle — gold record breaks',
  earnable: false,
  subtitle: 'Olympus Cycle · Olympus breaker',
  style: {
    accent: '#d4af37',
    c1: 'rgba(26, 12, 18, 0.97)',
    c2: 'rgba(74, 52, 22, 0.94)',
    grid: 'rgba(212, 175, 55, 0.08)',
  },
}

const MAGIA_HALL_OF_FAME_THEME: MeterPartyBarTheme = {
  id: 'magia-hall-of-fame',
  barStyleId: 'magia-hall-of-fame',
  label: 'Magia Breaker',
  badge: '',
  domain: 'Magia cycle — record breaks',
  earnable: false,
  subtitle: 'Magia Cycle · Magia breaker',
  style: {
    accent: '#a78bfa',
    c1: 'rgba(18, 10, 36, 0.97)',
    c2: 'rgba(46, 16, 72, 0.94)',
    grid: 'rgba(167, 139, 250, 0.1)',
  },
}

const OLYMPOS_XII_COMMON_THEMES: MeterPartyBarTheme[] = [
  {
    id: 'apollomon',
    barStyleId: 'apollomon',
    variant: 'common',
    label: 'Apollomon',
    badge: '☀',
    domain: 'Sun & flame',
    earnable: true,
    subtitle: 'Olympos XII · Apollomon',
    style: {
      accent: '#ffb347',
      c1: 'rgba(120, 52, 12, 0.55)',
      c2: 'rgba(255, 140, 48, 0.5)',
      grid: 'rgba(255, 180, 80, 0.1)',
    },
  },
  {
    id: 'bacchusmon',
    barStyleId: 'bacchusmon',
    variant: 'common',
    label: 'Bacchusmon',
    badge: '🍇',
    domain: 'Wine & revelry',
    earnable: true,
    subtitle: 'Olympos XII · Bacchusmon',
    style: {
      accent: '#b87cff',
      c1: 'rgba(58, 22, 78, 0.58)',
      c2: 'rgba(140, 72, 180, 0.48)',
      grid: 'rgba(180, 120, 255, 0.09)',
    },
  },
  {
    id: 'ceresmon',
    barStyleId: 'ceresmon',
    variant: 'common',
    label: 'Ceresmon',
    badge: '🌿',
    domain: 'Harvest & fertility',
    earnable: true,
    subtitle: 'Olympos XII · Ceresmon',
    style: {
      accent: '#9fd356',
      c1: 'rgba(32, 72, 28, 0.58)',
      c2: 'rgba(120, 168, 64, 0.48)',
      grid: 'rgba(160, 220, 100, 0.09)',
    },
  },
  {
    id: 'dianamon',
    barStyleId: 'dianamon',
    variant: 'common',
    label: 'Dianamon',
    badge: '☾',
    domain: 'Moon, water & ice',
    earnable: true,
    subtitle: 'Olympos XII · Dianamon',
    style: {
      accent: '#9ec5ff',
      c1: 'rgba(28, 48, 88, 0.58)',
      c2: 'rgba(140, 188, 255, 0.45)',
      grid: 'rgba(180, 210, 255, 0.09)',
    },
  },
  {
    id: 'junomon',
    barStyleId: 'junomon',
    variant: 'common',
    label: 'Junomon',
    badge: '👁',
    domain: 'Foresight & order',
    earnable: true,
    subtitle: 'Olympos XII · Junomon',
    style: {
      accent: '#d4a5ff',
      c1: 'rgba(52, 28, 82, 0.58)',
      c2: 'rgba(168, 108, 210, 0.48)',
      grid: 'rgba(210, 160, 255, 0.09)',
    },
  },
  {
    id: 'jupitermon',
    barStyleId: 'jupitermon',
    variant: 'common',
    label: 'Jupitermon',
    badge: '⚡',
    domain: 'Thunder & sky',
    earnable: true,
    subtitle: 'Olympos XII · Jupitermon',
    style: {
      accent: '#f0d060',
      c1: 'rgba(48, 52, 72, 0.6)',
      c2: 'rgba(200, 170, 60, 0.48)',
      grid: 'rgba(255, 230, 120, 0.1)',
    },
  },
  {
    id: 'marsmon',
    barStyleId: 'marsmon',
    variant: 'common',
    label: 'Marsmon',
    badge: '🔥',
    domain: 'War & valor',
    earnable: true,
    subtitle: 'Olympos XII · Marsmon',
    style: {
      accent: '#e85d4a',
      c1: 'rgba(72, 18, 12, 0.6)',
      c2: 'rgba(200, 72, 48, 0.5)',
      grid: 'rgba(255, 120, 90, 0.09)',
    },
  },
  {
    id: 'mercurymon',
    barStyleId: 'mercurymon',
    variant: 'common',
    label: 'Mercurymon',
    badge: '💨',
    domain: 'Speed & travel',
    earnable: true,
    subtitle: 'Olympos XII · Mercurymon',
    style: {
      accent: '#d8e4f0',
      c1: 'rgba(48, 58, 72, 0.55)',
      c2: 'rgba(180, 200, 220, 0.42)',
      grid: 'rgba(220, 235, 255, 0.1)',
    },
  },
  {
    id: 'minervamon',
    barStyleId: 'minervamon',
    variant: 'common',
    label: 'Minervamon',
    badge: '⚔',
    domain: 'Strategy & wisdom',
    earnable: true,
    subtitle: 'Olympos XII · Minervamon',
    style: {
      accent: '#c9b458',
      c1: 'rgba(48, 52, 60, 0.58)',
      c2: 'rgba(130, 138, 155, 0.48)',
      grid: 'rgba(210, 190, 120, 0.09)',
    },
  },
  {
    id: 'neptunemon',
    barStyleId: 'neptunemon',
    variant: 'common',
    label: 'Neptunemon',
    badge: '🌊',
    domain: 'Sea & depths',
    earnable: true,
    subtitle: 'Olympos XII · Neptunemon',
    style: {
      accent: '#3ecfcf',
      c1: 'rgba(12, 48, 72, 0.6)',
      c2: 'rgba(40, 140, 180, 0.5)',
      grid: 'rgba(80, 220, 220, 0.09)',
    },
  },
  {
    id: 'venusmon',
    barStyleId: 'venusmon',
    variant: 'common',
    label: 'Venusmon',
    badge: '♥',
    domain: 'Love & beauty',
    earnable: true,
    subtitle: 'Olympos XII · Venusmon',
    style: {
      accent: '#f0a8c0',
      c1: 'rgba(72, 32, 52, 0.55)',
      c2: 'rgba(220, 140, 170, 0.45)',
      grid: 'rgba(255, 180, 210, 0.09)',
    },
  },
  {
    id: 'vulcanusmon',
    barStyleId: 'vulcanusmon',
    variant: 'common',
    label: 'Vulcanusmon',
    badge: '🔨',
    domain: 'Forge & smithing',
    earnable: true,
    subtitle: 'Olympos XII · Vulcanusmon',
    style: {
      accent: '#ff8c42',
      c1: 'rgba(56, 28, 12, 0.6)',
      c2: 'rgba(200, 88, 32, 0.5)',
      grid: 'rgba(255, 160, 80, 0.1)',
    },
  },
]

function olympusRareVariant(base: MeterPartyBarTheme): MeterPartyBarTheme {
  const rareId = `${base.barStyleId}-rare` as MeterPartyBarThemeId
  return {
    ...base,
    id: rareId,
    variant: 'rare',
    label: `${base.label} (Rare)`,
    subtitle: `${base.subtitle} · Rare`,
  }
}

export const OLYMPOS_XII_RARE_METER_PARTY_BAR_THEMES: MeterPartyBarTheme[] =
  OLYMPOS_XII_COMMON_THEMES.map(olympusRareVariant)

function olympusLegendaryVariant(base: MeterPartyBarTheme): MeterPartyBarTheme {
  const legendaryId = `${base.barStyleId}-legendary` as MeterPartyBarThemeId
  return {
    ...base,
    id: legendaryId,
    variant: 'legendary',
    label: `${base.label} (Legendary)`,
    subtitle: `${base.subtitle} · Legendary`,
  }
}

export const OLYMPOS_XII_LEGENDARY_METER_PARTY_BAR_THEMES: MeterPartyBarTheme[] =
  OLYMPOS_XII_COMMON_THEMES.map(olympusLegendaryVariant)

export const METER_PARTY_BAR_THEMES: MeterPartyBarTheme[] = [
  ILIAD_CORE_THEME,
  HALL_OF_FAME_THEME,
  MAGIA_HALL_OF_FAME_THEME,
  ...OLYMPOS_XII_COMMON_THEMES,
  ...OLYMPOS_XII_RARE_METER_PARTY_BAR_THEMES,
  ...OLYMPOS_XII_LEGENDARY_METER_PARTY_BAR_THEMES,
]

const THEME_BY_ID = new Map(METER_PARTY_BAR_THEMES.map((t) => [t.id, t]))

export const METER_PARTY_BAR_THEME_IDS = METER_PARTY_BAR_THEMES.map((t) => t.id)

export const EARNABLE_METER_PARTY_BAR_THEMES = METER_PARTY_BAR_THEMES.filter((t) => t.earnable)

export const OLYMPOS_XII_COMMON_SHOP_THEMES = OLYMPOS_XII_COMMON_THEMES

function normTamerName(name: string): string {
  return name.trim().toLowerCase()
}

export function isMistTamer(tamerName: string | null | undefined): boolean {
  const t = (tamerName ?? '').trim()
  if (!t) return false
  return normTamerName(t) === normTamerName(DEV_METER_TAMER_NAME)
}

/** @deprecated Use `isMistTamer` */
export function isDevMeterTamerMist(tamerName: string | null | undefined): boolean {
  return isMistTamer(tamerName)
}

export function getMeterPartyBarTheme(id: string | null | undefined): MeterPartyBarTheme | null {
  if (!id) return null
  return THEME_BY_ID.get(id as MeterPartyBarThemeId) ?? null
}

export function readStoredEquippedMeterPartyBarThemeId(): MeterPartyBarThemeId | null {
  try {
    const raw = localStorage.getItem(EQUIPPED_THEME_STORAGE_KEY)?.trim()
    if (raw && THEME_BY_ID.has(raw as MeterPartyBarThemeId)) {
      return raw as MeterPartyBarThemeId
    }
  } catch {
    /* ignore */
  }
  return null
}

export function readEquippedMeterPartyBarThemeId(): MeterPartyBarThemeId | null {
  return readStoredEquippedMeterPartyBarThemeId()
}

export const METER_DEV_TAMER_BADGE = 'DEV'

export function shouldShowMeterDevTamerBadge(tamerName: string | null | undefined): boolean {
  return isMistTamer(tamerName)
}

export function shouldShowMeterThemeBadge(
  theme: MeterPartyBarTheme | null | undefined,
): theme is MeterPartyBarTheme {
  if (!theme) return false
  if (theme.id === MIST_DEV_REWARD_THEME_ID) return false
  if (theme.id === HALL_OF_FAME_THEME_ID || theme.id === MAGIA_HALL_OF_FAME_THEME_ID) return false
  if (theme.variant === 'legendary') return false
  return theme.badge.trim().length > 0
}

export function writeEquippedMeterPartyBarThemeId(id: MeterPartyBarThemeId): void {
  try {
    localStorage.setItem(EQUIPPED_THEME_STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}

export function clearEquippedMeterPartyBarThemeId(): void {
  try {
    localStorage.removeItem(EQUIPPED_THEME_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function effectiveEquippedThemeIdForSelf(
  _tamerName: string | null | undefined,
): MeterPartyBarThemeId | null {
  return readStoredEquippedMeterPartyBarThemeId()
}

export function resolveMeterPartyBarTheme(
  tamerName: string | null | undefined,
  memberThemeId?: string | null,
  options?: { isSelf?: boolean; remoteThemeId?: string | null },
): MeterPartyBarTheme | null {
  if (!options?.isSelf) {
    return getMeterPartyBarTheme(memberThemeId ?? options?.remoteThemeId ?? undefined)
  }
  const equippedId = effectiveEquippedThemeIdForSelf(tamerName)
  return equippedId ? getMeterPartyBarTheme(equippedId) : getMeterPartyBarTheme(memberThemeId ?? undefined)
}

export function meterPartyBarThemeStyle(theme: MeterPartyBarTheme): CSSProperties {
  const { accent, c1, c2 } = theme.style
  return {
    ['--mb-accent' as string]: accent,
    ['--mb-c1' as string]: c1,
    ['--mb-c2' as string]: c2,
  }
}

export function meterPartyBarThemeBarStyleId(theme: MeterPartyBarTheme): string {
  return theme.barStyleId || theme.id
}

export function meterPartyBarThemeBarClassName(theme: MeterPartyBarTheme): string {
  const styleId = meterPartyBarThemeBarStyleId(theme)
  const variantClass =
    theme.variant === 'rare'
      ? ' meter-party-bar-theme--rare'
      : theme.variant === 'legendary'
        ? ' meter-party-bar-theme--legendary'
        : ''
  return `meter-party-member-bar meter-party-member-bar--bar-theme meter-party-bar-theme--${styleId}${variantClass}`
}

export function mistDevPartyMemberKey(themeId: MeterPartyBarThemeId): string {
  return `mist:${themeId}`
}

export function meterBarThemeIdFromMemberKey(
  memberKey: string,
): MeterPartyBarThemeId | undefined {
  const key = memberKey.trim().toLowerCase()
  if (key.startsWith('mist:')) {
    const id = key.slice(5)
    return THEME_BY_ID.has(id as MeterPartyBarThemeId) ? (id as MeterPartyBarThemeId) : undefined
  }
  return undefined
}

/** Dev gallery: Mist rows using the normal hashed party bar (no custom theme). */
export const METER_DEV_BASELINE_PREVIEW_ROWS = [
  { memberKey: 'mist:baseline-1', subtitle: 'Baseline · standard A', fillPct: 42, totalDamage: 245_000 },
  { memberKey: 'mist:baseline-2', subtitle: 'Baseline · standard B', fillPct: 55, totalDamage: 232_000 },
  { memberKey: 'mist:baseline-3', subtitle: 'Baseline · standard C', fillPct: 68, totalDamage: 218_000 },
] as const

export function meterDevTestPartyRowCount(): number {
  return METER_PARTY_BAR_THEMES.length + METER_DEV_BASELINE_PREVIEW_ROWS.length + 1
}

export function isMeterDevBaselinePartyKey(memberKey: string): boolean {
  return memberKey.trim().toLowerCase().startsWith('mist:baseline-')
}

/** Gallery bar width (30–70%) for dev theme preview rows. */
export function meterDevThemePreviewBarFillPct(themeIndex: number): number {
  const count = METER_PARTY_BAR_THEMES.length
  const t = count <= 1 ? 0.5 : themeIndex / (count - 1)
  return Math.round(30 + t * 40)
}

/** Stable dev-gallery fill width from member key (themes + baselines). */
export function meterDevPreviewBarFillPct(memberKey: string): number | undefined {
  const key = memberKey.trim().toLowerCase()
  const themeId = meterBarThemeIdFromMemberKey(key)
  if (themeId) {
    const index = METER_PARTY_BAR_THEMES.findIndex((t) => t.id === themeId)
    if (index >= 0) return meterDevThemePreviewBarFillPct(index)
  }
  const baseline = METER_DEV_BASELINE_PREVIEW_ROWS.find((b) => b.memberKey === key)
  return baseline?.fillPct
}
