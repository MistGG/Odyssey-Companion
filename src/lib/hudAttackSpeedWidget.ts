import type { AttackSpeedWidgetConfig } from '../types'
import {
  clampHudWidgetBackgroundOpacity,
  DEFAULT_HUD_WIDGET_BACKGROUND_OPACITY,
} from './hudWidgetBackground'

export const DEFAULT_ATTACK_SPEED_WIDGET_CONFIG: AttackSpeedWidgetConfig = {
  threshold: null,
  thresholdTextColor: '#b8ffd4',
  thresholdBackgroundColor: 'rgba(22, 88, 52, 0.92)',
  hideLabel: false,
  valueFontSizePx: 18,
  widgetWidthPx: 120,
  widgetHeightPx: null,
  backgroundOpacity: DEFAULT_HUD_WIDGET_BACKGROUND_OPACITY,
}

export function normalizeAttackSpeedWidgetConfig(
  raw: unknown,
  legacyBackgroundOpacity?: number,
): AttackSpeedWidgetConfig {
  const base = { ...DEFAULT_ATTACK_SPEED_WIDGET_CONFIG }
  const legacyFallback =
    legacyBackgroundOpacity != null
      ? clampHudWidgetBackgroundOpacity(legacyBackgroundOpacity, base.backgroundOpacity)
      : base.backgroundOpacity
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>

  let threshold: number | null = null
  if (o.threshold === null || o.threshold === undefined || o.threshold === '') {
    threshold = null
  } else if (typeof o.threshold === 'number' && Number.isFinite(o.threshold) && o.threshold >= 0) {
    threshold = o.threshold
  }

  const thresholdTextColor =
    typeof o.thresholdTextColor === 'string' && o.thresholdTextColor.trim()
      ? o.thresholdTextColor.trim()
      : base.thresholdTextColor

  const thresholdBackgroundColor =
    typeof o.thresholdBackgroundColor === 'string' && o.thresholdBackgroundColor.trim()
      ? o.thresholdBackgroundColor.trim()
      : base.thresholdBackgroundColor

  const hideLabel = typeof o.hideLabel === 'boolean' ? o.hideLabel : base.hideLabel

  let valueFontSizePx = base.valueFontSizePx
  if (typeof o.valueFontSizePx === 'number' && Number.isFinite(o.valueFontSizePx)) {
    valueFontSizePx = Math.min(48, Math.max(10, Math.round(o.valueFontSizePx)))
  }

  let widgetWidthPx = base.widgetWidthPx
  if (typeof o.widgetWidthPx === 'number' && Number.isFinite(o.widgetWidthPx)) {
    widgetWidthPx = Math.min(320, Math.max(72, Math.round(o.widgetWidthPx)))
  }

  let widgetHeightPx: number | null = base.widgetHeightPx
  if (o.widgetHeightPx === null || o.widgetHeightPx === undefined) {
    widgetHeightPx = null
  } else if (typeof o.widgetHeightPx === 'number' && Number.isFinite(o.widgetHeightPx)) {
    widgetHeightPx = Math.min(160, Math.max(28, Math.round(o.widgetHeightPx)))
  }

  const backgroundOpacity = clampHudWidgetBackgroundOpacity(
    o.backgroundOpacity ?? o.widgetOpacity,
    legacyFallback,
  )

  return {
    threshold,
    thresholdTextColor,
    thresholdBackgroundColor,
    hideLabel,
    valueFontSizePx,
    widgetWidthPx,
    widgetHeightPx,
    backgroundOpacity,
  }
}

/** When set, current speed below threshold uses highlight colors. */
export function attackSpeedMeetsThreshold(
  speed: number | null,
  threshold: number | null,
): boolean {
  if (threshold == null || !Number.isFinite(threshold) || speed == null) return false
  return speed < threshold
}
