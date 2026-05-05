import { DEFAULT_SETTINGS, type HotkeyConfig, type OverlaySettings } from '../types'

const KEY = 'dmo-overlay-settings-v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Saved JSON may still use legacy `start` / `stop` / `reset`. */
type HotkeyConfigLike = {
  toggle?: string
  reset?: string
  start?: string
  stop?: string
}

function migrateHotkeys(raw: HotkeyConfigLike): HotkeyConfig {
  const toggle =
    typeof raw.toggle === 'string'
      ? raw.toggle
      : typeof raw.start === 'string'
        ? raw.start
        : DEFAULT_SETTINGS.hotkeys.toggle
  const reset =
    typeof raw.reset === 'string' ? raw.reset : DEFAULT_SETTINGS.hotkeys.reset
  return { toggle, reset }
}

function normalizeLoaded(raw: unknown): OverlaySettings {
  if (!isRecord(raw)) {
    return { ...DEFAULT_SETTINGS, hotkeys: { ...DEFAULT_SETTINGS.hotkeys } }
  }
  const hotkeysRaw = isRecord(raw.hotkeys)
    ? (raw.hotkeys as HotkeyConfigLike)
    : {}
  const hotkeys = migrateHotkeys(hotkeysRaw)

  let timelineBackdrop =
    typeof raw.timelineBackdropOpacity === 'number'
      ? raw.timelineBackdropOpacity
      : undefined
  if (timelineBackdrop === undefined && typeof raw.panelOpacity === 'number') {
    timelineBackdrop = raw.panelOpacity
  }
  if (timelineBackdrop === undefined && typeof raw.windowOpacity === 'number') {
    timelineBackdrop = raw.windowOpacity
  }

  let timelineTop =
    typeof raw.timelineAlwaysOnTop === 'boolean' ? raw.timelineAlwaysOnTop : undefined
  if (timelineTop === undefined && typeof raw.alwaysOnTop === 'boolean') {
    timelineTop = raw.alwaysOnTop
  }

  let positionLocked: boolean | undefined
  if (typeof raw.timelinePositionLocked === 'boolean') {
    positionLocked = raw.timelinePositionLocked
  }

  return {
    ...DEFAULT_SETTINGS,
    hotkeys,
    timelineBackdropOpacity:
      typeof timelineBackdrop === 'number'
        ? Math.min(1, Math.max(0, timelineBackdrop))
        : DEFAULT_SETTINGS.timelineBackdropOpacity,
    timelineAlwaysOnTop:
      typeof timelineTop === 'boolean' ? timelineTop : DEFAULT_SETTINGS.timelineAlwaysOnTop,
    timelinePositionLocked:
      typeof positionLocked === 'boolean'
        ? positionLocked
        : DEFAULT_SETTINGS.timelinePositionLocked,
  }
}

export function loadSettings(): OverlaySettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS, hotkeys: { ...DEFAULT_SETTINGS.hotkeys } }
    return normalizeLoaded(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_SETTINGS, hotkeys: { ...DEFAULT_SETTINGS.hotkeys } }
  }
}

export function saveSettings(s: OverlaySettings) {
  localStorage.setItem(KEY, JSON.stringify(s))
}
