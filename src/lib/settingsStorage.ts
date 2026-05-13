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
  meterReconnect?: string
  meterResetSession?: string
  meterUploadParse?: string
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
  const meterReconnect =
    typeof raw.meterReconnect === 'string'
      ? raw.meterReconnect
      : DEFAULT_SETTINGS.hotkeys.meterReconnect
  const meterResetSession =
    typeof raw.meterResetSession === 'string'
      ? raw.meterResetSession
      : DEFAULT_SETTINGS.hotkeys.meterResetSession
  const meterUploadParse =
    typeof raw.meterUploadParse === 'string'
      ? raw.meterUploadParse
      : DEFAULT_SETTINGS.hotkeys.meterUploadParse
  return { toggle, reset, meterReconnect, meterResetSession, meterUploadParse }
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

  let meterBackdrop =
    typeof raw.meterBackdropOpacity === 'number' ? raw.meterBackdropOpacity : undefined
  if (meterBackdrop === undefined && typeof raw.meterOpacity === 'number') {
    meterBackdrop = raw.meterOpacity
  }

  let meterTop =
    typeof raw.meterAlwaysOnTop === 'boolean' ? raw.meterAlwaysOnTop : undefined

  let meterLocked =
    typeof raw.meterPositionLocked === 'boolean' ? raw.meterPositionLocked : undefined

  let meterIdleReset =
    typeof raw.meterAutoResetIdleSec === 'number' ? raw.meterAutoResetIdleSec : undefined

  let meterPartyShowSelf =
    typeof raw.meterPartyShowSelfDisplayName === 'boolean'
      ? raw.meterPartyShowSelfDisplayName
      : undefined

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
    meterBackdropOpacity:
      typeof meterBackdrop === 'number'
        ? Math.min(1, Math.max(0, meterBackdrop))
        : DEFAULT_SETTINGS.meterBackdropOpacity,
    meterAlwaysOnTop:
      typeof meterTop === 'boolean' ? meterTop : DEFAULT_SETTINGS.meterAlwaysOnTop,
    meterPositionLocked:
      typeof meterLocked === 'boolean'
        ? meterLocked
        : DEFAULT_SETTINGS.meterPositionLocked,
    meterAutoResetIdleSec:
      typeof meterIdleReset === 'number' &&
      Number.isFinite(meterIdleReset) &&
      meterIdleReset >= 0
        ? Math.min(86400, Math.round(meterIdleReset))
        : DEFAULT_SETTINGS.meterAutoResetIdleSec,
    meterPartyShowSelfDisplayName:
      typeof meterPartyShowSelf === 'boolean'
        ? meterPartyShowSelf
        : DEFAULT_SETTINGS.meterPartyShowSelfDisplayName,
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
