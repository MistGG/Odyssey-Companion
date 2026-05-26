import type { CSSProperties } from 'react'

/** Live tamer name for the companion author. */
export const DEV_METER_TAMER_NAME = 'Mist'

const EQUIPPED_THEME_STORAGE_KEY = 'odyssey-meter-bar-theme'

export type MeterPartyBarThemeId =
  | 'iliad-core'
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

export type MeterPartyBarTheme = {
  id: MeterPartyBarThemeId
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

export const METER_PARTY_BAR_THEMES: MeterPartyBarTheme[] = [
  {
    id: 'iliad-core',
    label: 'Iliad Core',
    badge: '★',
    domain: 'Digital World — Homeros',
    earnable: false,
    subtitle: 'Default · Digivice',
    style: {
      accent: '#3ee0ff',
      c1: 'rgba(26, 106, 122, 0.55)',
      c2: 'rgba(92, 240, 196, 0.45)',
      grid: 'rgba(62, 224, 255, 0.08)',
    },
  },
  {
    id: 'apollomon',
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

const THEME_BY_ID = new Map(METER_PARTY_BAR_THEMES.map((t) => [t.id, t]))

export const METER_PARTY_BAR_THEME_IDS = METER_PARTY_BAR_THEMES.map((t) => t.id)

export const EARNABLE_METER_PARTY_BAR_THEMES = METER_PARTY_BAR_THEMES.filter((t) => t.earnable)

/** Dev gallery: Mist rows using the normal hashed party bar (no custom theme). */
export const METER_DEV_BASELINE_PREVIEW_ROWS = [
  { memberKey: 'mist:baseline-1', subtitle: 'Baseline · standard A', fillPct: 42, totalDamage: 245_000 },
  { memberKey: 'mist:baseline-2', subtitle: 'Baseline · standard B', fillPct: 55, totalDamage: 232_000 },
  { memberKey: 'mist:baseline-3', subtitle: 'Baseline · standard C', fillPct: 68, totalDamage: 218_000 },
] as const

export function meterDevTestPartyRowCount(): number {
  return METER_PARTY_BAR_THEMES.length + METER_DEV_BASELINE_PREVIEW_ROWS.length + 1
}

/** Persistent DEV badge for the companion author — independent of bar themes. */
export const METER_DEV_TAMER_BADGE = 'DEV'

export function shouldShowMeterDevTamerBadge(tamerName: string | null | undefined): boolean {
  return isMistTamer(tamerName)
}

export function isMeterDevBaselinePartyKey(memberKey: string): boolean {
  return memberKey.trim().toLowerCase().startsWith('mist:baseline-')
}

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

/** @deprecated Prefer {@link readStoredEquippedMeterPartyBarThemeId} */
export function readEquippedMeterPartyBarThemeId(): MeterPartyBarThemeId | null {
  return readStoredEquippedMeterPartyBarThemeId()
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
  options?: { isSelf?: boolean },
): MeterPartyBarTheme | null {
  const fromMember = getMeterPartyBarTheme(memberThemeId ?? undefined)
  if (!options?.isSelf) return fromMember
  const equippedId = effectiveEquippedThemeIdForSelf(tamerName)
  return equippedId ? getMeterPartyBarTheme(equippedId) : null
}

export function meterPartyBarThemeStyle(theme: MeterPartyBarTheme): CSSProperties {
  const { accent, c1, c2 } = theme.style
  return {
    ['--mb-accent' as string]: accent,
    ['--mb-c1' as string]: c1,
    ['--mb-c2' as string]: c2,
  }
}

export function meterPartyBarThemeBarClassName(theme: MeterPartyBarTheme): string {
  return `meter-party-member-bar meter-party-member-bar--bar-theme meter-party-bar-theme--${theme.id}`
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
