import type { DamageNumbersWidgetConfig } from '../types'
import {
  DEFAULT_MAPLE_DAMAGE_SKIN_NUMBER,
  DEFAULT_MAPLE_REGION,
  type MapleRegion,
} from './mapleDamageSkin'
import {
  clampHudWidgetBackgroundOpacity,
  DEFAULT_HUD_WIDGET_BACKGROUND_OPACITY,
} from './hudWidgetBackground'

export const DAMAGE_NUMBERS_WIDGET_SCALE_MIN = 0.5
export const DAMAGE_NUMBERS_WIDGET_SCALE_MAX = 2.5
export const DEFAULT_HIGH_TIER_THRESHOLD = 100_000

export const DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG: DamageNumbersWidgetConfig = {
  backgroundOpacity: 0,
  widgetScale: 1,
  widgetWidthPx: 280,
  widgetHeightPx: 200,
  skinNumber: DEFAULT_MAPLE_DAMAGE_SKIN_NUMBER,
  mapleRegion: DEFAULT_MAPLE_REGION,
  highTierThreshold: DEFAULT_HIGH_TIER_THRESHOLD,
}

const MAPLE_REGIONS = new Set<string>([
  'KMS',
  'KMST',
  'GMS',
  'JMS',
  'TMS',
  'CMS',
  'EMS',
  'SEA',
])

export function normalizeDamageNumbersWidgetConfig(
  raw: unknown,
  legacyOpacity?: number,
): DamageNumbersWidgetConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  let widgetScale = DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG.widgetScale
  if (typeof o.widgetScale === 'number' && Number.isFinite(o.widgetScale)) {
    widgetScale = Math.min(
      DAMAGE_NUMBERS_WIDGET_SCALE_MAX,
      Math.max(DAMAGE_NUMBERS_WIDGET_SCALE_MIN, o.widgetScale),
    )
  }
  let widgetWidthPx = DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG.widgetWidthPx
  if (typeof o.widgetWidthPx === 'number' && Number.isFinite(o.widgetWidthPx)) {
    widgetWidthPx = Math.min(480, Math.max(120, Math.round(o.widgetWidthPx)))
  }
  let widgetHeightPx = DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG.widgetHeightPx
  if (typeof o.widgetHeightPx === 'number' && Number.isFinite(o.widgetHeightPx)) {
    widgetHeightPx = Math.min(360, Math.max(80, Math.round(o.widgetHeightPx)))
  }
  let skinNumber = DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG.skinNumber
  if (typeof o.skinNumber === 'number' && Number.isFinite(o.skinNumber)) {
    skinNumber = Math.min(999, Math.max(1, Math.round(o.skinNumber)))
  }

  let skinItemId: number | undefined
  if (typeof o.skinItemId === 'number' && Number.isFinite(o.skinItemId)) {
    skinItemId = Math.round(o.skinItemId)
  }

  let skinName: string | undefined
  if (typeof o.skinName === 'string' && o.skinName.trim()) {
    skinName = o.skinName.trim()
  }

  let mapleRegion: MapleRegion = DEFAULT_MAPLE_REGION
  if (typeof o.mapleRegion === 'string' && MAPLE_REGIONS.has(o.mapleRegion)) {
    mapleRegion = o.mapleRegion as MapleRegion
  }

  let mapleWzVersion: number | undefined
  if (typeof o.mapleWzVersion === 'number' && Number.isFinite(o.mapleWzVersion)) {
    mapleWzVersion = Math.round(o.mapleWzVersion)
  }

  let highTierThreshold = DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG.highTierThreshold
  if (typeof o.highTierThreshold === 'number' && Number.isFinite(o.highTierThreshold)) {
    highTierThreshold = Math.min(999_999_999_999, Math.max(0, Math.round(o.highTierThreshold)))
  }

  return {
    backgroundOpacity: clampHudWidgetBackgroundOpacity(
      o.backgroundOpacity ?? legacyOpacity,
      DEFAULT_DAMAGE_NUMBERS_WIDGET_CONFIG.backgroundOpacity,
    ),
    widgetScale,
    widgetWidthPx,
    widgetHeightPx,
    skinNumber,
    skinItemId,
    skinName,
    mapleRegion,
    mapleWzVersion,
    highTierThreshold,
  }
}
