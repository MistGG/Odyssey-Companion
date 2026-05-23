import { STARTUP_PANEL_KEYS, type HudWidget, type OverlaySettings, type StartupPanelKey } from '../types'

function isStartupPanels(v: unknown): v is StartupPanelKey[] {
  if (!Array.isArray(v) || v.length === 0) return false
  const valid = new Set<string>(STARTUP_PANEL_KEYS)
  return v.every((item) => typeof item === 'string' && valid.has(item))
}

function isHudWidget(v: unknown): v is HudWidget {
  if (!v || typeof v !== 'object') return false
  const w = v as Record<string, unknown>
  if (
    typeof w.id !== 'string' ||
    w.id.length === 0 ||
    typeof w.x !== 'number' ||
    !Number.isFinite(w.x) ||
    typeof w.y !== 'number' ||
    !Number.isFinite(w.y)
  ) {
    return false
  }
  if (w.type === 'attack_speed') {
    if (w.attackSpeed !== undefined && (typeof w.attackSpeed !== 'object' || w.attackSpeed === null)) {
      return false
    }
    return true
  }
  if (w.type === 'buff_tracker') {
    if (w.buffTracker !== undefined && (typeof w.buffTracker !== 'object' || w.buffTracker === null)) {
      return false
    }
    return true
  }
  return false
}

function isHudWidgets(v: unknown): boolean {
  if (!Array.isArray(v)) return false
  return v.every(isHudWidget)
}

function isHotkeyShape(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const h = v as Record<string, unknown>
  return (
    typeof h.toggle === 'string' &&
    typeof h.reset === 'string' &&
    typeof h.meterReconnect === 'string' &&
    typeof h.meterResetSession === 'string' &&
    typeof h.meterUploadParse === 'string'
  )
}

export function mergeOverlaySettings(
  prev: OverlaySettings,
  patch: unknown,
): OverlaySettings | null {
  if (!patch || typeof patch !== 'object') return null
  const p = patch as Partial<OverlaySettings>
  const merged: OverlaySettings = {
    ...prev,
    ...p,
    hotkeys: {
      ...prev.hotkeys,
      ...(p.hotkeys ?? {}),
    },
    hudWidgets: p.hudWidgets !== undefined ? p.hudWidgets : prev.hudWidgets,
    startupPanels:
      p.startupPanels !== undefined ? p.startupPanels : prev.startupPanels,
  }
  return isOverlaySettings(merged) ? merged : null
}

export function isOverlaySettings(v: unknown): v is OverlaySettings {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (
    !isStartupPanels(o.startupPanels) ||
    typeof o.timelineBackdropOpacity !== 'number' ||
    typeof o.timelineAlwaysOnTop !== 'boolean' ||
    typeof o.meterBackdropOpacity !== 'number' ||
    typeof o.meterAlwaysOnTop !== 'boolean' ||
    typeof o.meterPositionLocked !== 'boolean' ||
    typeof o.meterPartyShowSelfDisplayName !== 'boolean' ||
    typeof o.hotkeysOnlyWhenCompanionFocused !== 'boolean' ||
    typeof o.meterAutoUploadAfterClear !== 'boolean' ||
    typeof o.timersBackdropOpacity !== 'number' ||
    typeof o.timersAlwaysOnTop !== 'boolean' ||
    typeof o.timersPositionLocked !== 'boolean' ||
    typeof o.bossTimerNotifyLeadMin !== 'number' ||
    !Number.isFinite(o.bossTimerNotifyLeadMin) ||
    o.bossTimerNotifyLeadMin < 1 ||
    o.bossTimerNotifyLeadMin > 120 ||
    typeof o.bossTimerNotifyWhenUiClosed !== 'boolean' ||
    (o.bossTimerNotifyMethod !== 'toast' &&
      o.bossTimerNotifyMethod !== 'sound' &&
      o.bossTimerNotifyMethod !== 'both') ||
    (o.bossTimerChimeStyle !== 'off' &&
      o.bossTimerChimeStyle !== 'warmDuo' &&
      o.bossTimerChimeStyle !== 'airy') ||
    typeof o.bossTimerChimeVolume !== 'number' ||
    !Number.isFinite(o.bossTimerChimeVolume) ||
    o.bossTimerChimeVolume < 0 ||
    o.bossTimerChimeVolume > 1 ||
    typeof o.bossTimerChimeRepeats !== 'number' ||
    !Number.isFinite(o.bossTimerChimeRepeats) ||
    !Number.isInteger(o.bossTimerChimeRepeats) ||
    o.bossTimerChimeRepeats < 1 ||
    o.bossTimerChimeRepeats > 5 ||
    typeof o.hudBackdropOpacity !== 'number' ||
    !Number.isFinite(o.hudBackdropOpacity) ||
    o.hudBackdropOpacity < 0 ||
    o.hudBackdropOpacity > 1 ||
    typeof o.hudAlwaysOnTop !== 'boolean' ||
    typeof o.hudLayoutLocked !== 'boolean' ||
    !isHudWidgets(o.hudWidgets) ||
    !isHotkeyShape(o.hotkeys)
  ) {
    return false
  }
  if (
    'timelinePositionLocked' in o &&
    typeof o.timelinePositionLocked !== 'boolean'
  ) {
    return false
  }
  return true
}
