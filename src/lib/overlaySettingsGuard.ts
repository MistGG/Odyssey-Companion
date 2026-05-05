import type { OverlaySettings } from '../types'

function isHotkeyShape(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const h = v as Record<string, unknown>
  return typeof h.toggle === 'string' && typeof h.reset === 'string'
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
