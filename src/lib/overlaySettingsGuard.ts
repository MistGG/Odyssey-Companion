import type { OverlaySettings } from '../types'

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
  const merged: OverlaySettings = {
    ...prev,
    ...(patch as Partial<OverlaySettings>),
    hotkeys: {
      ...prev.hotkeys,
      ...((patch as Partial<OverlaySettings>).hotkeys ?? {}),
    },
  }
  return isOverlaySettings(merged) ? merged : null
}

export function isOverlaySettings(v: unknown): v is OverlaySettings {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (
    typeof o.timelineBackdropOpacity !== 'number' ||
    typeof o.timelineAlwaysOnTop !== 'boolean' ||
    typeof o.meterBackdropOpacity !== 'number' ||
    typeof o.meterAlwaysOnTop !== 'boolean' ||
    typeof o.meterPositionLocked !== 'boolean' ||
    typeof o.meterAutoResetIdleSec !== 'number' ||
    !Number.isFinite(o.meterAutoResetIdleSec) ||
    o.meterAutoResetIdleSec < 0 ||
    typeof o.meterPartyShowSelfDisplayName !== 'boolean' ||
    typeof o.hotkeysOnlyWhenCompanionFocused !== 'boolean' ||
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
      o.bossTimerChimeStyle !== 'gentle' &&
      o.bossTimerChimeStyle !== 'standard') ||
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
