import type { BossAlertSoundFor, BossAlertsWidgetConfig } from '../types'
import {
  clampHudWidgetBackgroundOpacity,
  DEFAULT_HUD_WIDGET_BACKGROUND_OPACITY,
} from './hudWidgetBackground'

export const BOSS_ALERTS_WIDGET_SCALE_MIN = 0.5
export const BOSS_ALERTS_WIDGET_SCALE_MAX = 4

export const DEFAULT_BOSS_ALERTS_WIDGET_CONFIG: BossAlertsWidgetConfig = {
  warnLeadSec: 5,
  trackSingleTarget: false,
  trackMultiTarget: true,
  alertSoundEnabled: false,
  alertSoundFilePath: null,
  alertSoundDataUrl: null,
  alertSoundVolume: 1,
  alertSoundFor: 'multi',
  backgroundOpacity: DEFAULT_HUD_WIDGET_BACKGROUND_OPACITY,
  widgetScale: 1,
  hideEmptyMessage: false,
  hideWhenInactive: true,
}

function normalizeSoundFor(raw: unknown): BossAlertSoundFor {
  if (raw === 'single' || raw === 'multi' || raw === 'both') return raw
  return DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.alertSoundFor
}

export function normalizeBossAlertsWidgetConfig(
  raw: unknown,
  legacyOpacity?: number,
): BossAlertsWidgetConfig {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  let warnLeadSec = DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.warnLeadSec
  if (typeof o.warnLeadSec === 'number' && Number.isFinite(o.warnLeadSec)) {
    warnLeadSec = Math.min(30, Math.max(1, Math.round(o.warnLeadSec)))
  }
  let widgetScale = DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.widgetScale
  if (typeof o.widgetScale === 'number' && Number.isFinite(o.widgetScale)) {
    widgetScale = Math.min(
      BOSS_ALERTS_WIDGET_SCALE_MAX,
      Math.max(BOSS_ALERTS_WIDGET_SCALE_MIN, o.widgetScale),
    )
  }
  let alertSoundVolume = DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.alertSoundVolume
  if (typeof o.alertSoundVolume === 'number' && Number.isFinite(o.alertSoundVolume)) {
    alertSoundVolume = Math.min(1, Math.max(0, o.alertSoundVolume))
  }
  const alertSoundFilePath =
    typeof o.alertSoundFilePath === 'string' && o.alertSoundFilePath.trim()
      ? o.alertSoundFilePath.trim()
      : null
  const alertSoundDataUrl =
    typeof o.alertSoundDataUrl === 'string' && o.alertSoundDataUrl.trim()
      ? o.alertSoundDataUrl.trim()
      : null

  let trackSingleTarget = DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.trackSingleTarget
  let trackMultiTarget = DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.trackMultiTarget
  if (typeof o.trackSingleTarget === 'boolean') trackSingleTarget = o.trackSingleTarget
  if (typeof o.trackMultiTarget === 'boolean') trackMultiTarget = o.trackMultiTarget
  if (!trackSingleTarget && !trackMultiTarget) {
    trackMultiTarget = true
  }

  return {
    warnLeadSec,
    trackSingleTarget,
    trackMultiTarget,
    alertSoundEnabled:
      typeof o.alertSoundEnabled === 'boolean'
        ? o.alertSoundEnabled
        : DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.alertSoundEnabled,
    alertSoundFilePath,
    alertSoundDataUrl,
    alertSoundVolume,
    alertSoundFor: normalizeSoundFor(o.alertSoundFor),
    backgroundOpacity: clampHudWidgetBackgroundOpacity(
      o.backgroundOpacity ?? legacyOpacity,
      DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.backgroundOpacity,
    ),
    widgetScale,
    hideEmptyMessage:
      typeof o.hideEmptyMessage === 'boolean'
        ? o.hideEmptyMessage
        : DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.hideEmptyMessage,
    hideWhenInactive:
      typeof o.hideWhenInactive === 'boolean'
        ? o.hideWhenInactive
        : DEFAULT_BOSS_ALERTS_WIDGET_CONFIG.hideWhenInactive,
  }
}
