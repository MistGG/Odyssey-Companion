import {
  DEFAULT_SETTINGS,
  STARTUP_PANEL_KEYS,
  type HotkeyConfig,
  type HotkeysApplyPayload,
  type HudWidget,
  type OverlaySettings,
  type StartupPanelKey,
} from '../types'
import { DEFAULT_ATTACK_SPEED_WIDGET_CONFIG, normalizeAttackSpeedWidgetConfig } from './hudAttackSpeedWidget'
import { DEFAULT_BUFF_TRACKER_WIDGET_CONFIG, normalizeBuffTrackerWidgetConfig } from './hudBuffTrackerWidget'

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

function normalizeStartupPanels(raw: unknown): StartupPanelKey[] {
  if (!Array.isArray(raw)) return [...DEFAULT_SETTINGS.startupPanels]
  const valid = new Set<string>(STARTUP_PANEL_KEYS)
  const out: StartupPanelKey[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const key = item.trim() as StartupPanelKey
    if (!valid.has(key)) continue
    if (out.includes(key)) continue
    out.push(key)
  }
  return out.length > 0 ? out : [...DEFAULT_SETTINGS.startupPanels]
}

function normalizeHudWidgets(raw: unknown, legacyWidgetOpacity?: number): HudWidget[] {
  if (!Array.isArray(raw)) return DEFAULT_SETTINGS.hudWidgets
  const legacy =
    typeof legacyWidgetOpacity === 'number' && Number.isFinite(legacyWidgetOpacity)
      ? legacyWidgetOpacity
      : undefined
  const out: HudWidget[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const w = item as Record<string, unknown>
    if (typeof w.id !== 'string' || !w.id.trim()) continue
    if (typeof w.x !== 'number' || !Number.isFinite(w.x)) continue
    if (typeof w.y !== 'number' || !Number.isFinite(w.y)) continue
    if (w.type === 'attack_speed') {
      out.push({
        id: w.id.trim(),
        type: 'attack_speed',
        x: Math.round(w.x),
        y: Math.round(w.y),
        attackSpeed: normalizeAttackSpeedWidgetConfig(
          w.attackSpeed ?? DEFAULT_ATTACK_SPEED_WIDGET_CONFIG,
          legacy,
        ),
      })
      continue
    }
    if (w.type === 'buff_tracker') {
      out.push({
        id: w.id.trim(),
        type: 'buff_tracker',
        x: Math.round(w.x),
        y: Math.round(w.y),
        buffTracker: normalizeBuffTrackerWidgetConfig(
          w.buffTracker ?? DEFAULT_BUFF_TRACKER_WIDGET_CONFIG,
          legacy,
        ),
      })
    }
  }
  return out
}

export function parseOverlaySettingsJson(raw: unknown): OverlaySettings {
  return normalizeLoaded(raw)
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

  let meterPartyShowSelf =
    typeof raw.meterPartyShowSelfDisplayName === 'boolean'
      ? raw.meterPartyShowSelfDisplayName
      : undefined

  let hotkeysFocusOnly =
    typeof raw.hotkeysOnlyWhenCompanionFocused === 'boolean'
      ? raw.hotkeysOnlyWhenCompanionFocused
      : undefined

  let meterAutoUploadAfterClear =
    typeof raw.meterAutoUploadAfterClear === 'boolean'
      ? raw.meterAutoUploadAfterClear
      : undefined

  let timersBackdrop =
    typeof raw.timersBackdropOpacity === 'number' ? raw.timersBackdropOpacity : undefined
  let timersTop = typeof raw.timersAlwaysOnTop === 'boolean' ? raw.timersAlwaysOnTop : undefined
  let timersLocked =
    typeof raw.timersPositionLocked === 'boolean' ? raw.timersPositionLocked : undefined
  let bossLead =
    typeof raw.bossTimerNotifyLeadMin === 'number' ? raw.bossTimerNotifyLeadMin : undefined
  const methodRaw = raw.bossTimerNotifyMethod
  let bossMethod: OverlaySettings['bossTimerNotifyMethod'] | undefined
  if (methodRaw === 'toast' || methodRaw === 'sound' || methodRaw === 'both') {
    bossMethod = methodRaw
  }
  let bossWhenClosed =
    typeof raw.bossTimerNotifyWhenUiClosed === 'boolean'
      ? raw.bossTimerNotifyWhenUiClosed
      : undefined
  const chimeRaw = raw.bossTimerChimeStyle
  let bossChime: OverlaySettings['bossTimerChimeStyle'] | undefined
  if (chimeRaw === 'off' || chimeRaw === 'warmDuo' || chimeRaw === 'airy') {
    bossChime = chimeRaw
  } else if (chimeRaw === 'gentle' || chimeRaw === 'standard') {
    bossChime = 'warmDuo'
  }

  let bossChimeVol: number | undefined
  if (typeof raw.bossTimerChimeVolume === 'number' && Number.isFinite(raw.bossTimerChimeVolume)) {
    bossChimeVol = Math.min(1, Math.max(0, raw.bossTimerChimeVolume))
  }

  let bossChimeRepeats: number | undefined
  if (typeof raw.bossTimerChimeRepeats === 'number' && Number.isFinite(raw.bossTimerChimeRepeats)) {
    bossChimeRepeats = Math.min(5, Math.max(1, Math.round(raw.bossTimerChimeRepeats)))
  }

  let hudBackdrop =
    typeof raw.hudBackdropOpacity === 'number' ? raw.hudBackdropOpacity : undefined
  let hudTop = typeof raw.hudAlwaysOnTop === 'boolean' ? raw.hudAlwaysOnTop : undefined
  let hudLocked =
    typeof raw.hudLayoutLocked === 'boolean' ? raw.hudLayoutLocked : undefined
  const legacyHudWidgetOpacity =
    typeof raw.hudWidgetOpacity === 'number' ? raw.hudWidgetOpacity : undefined
  const hudWidgets = normalizeHudWidgets(raw.hudWidgets, legacyHudWidgetOpacity)
  const startupPanels = normalizeStartupPanels(raw.startupPanels)

  return {
    ...DEFAULT_SETTINGS,
    startupPanels,
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
    meterPartyShowSelfDisplayName:
      typeof meterPartyShowSelf === 'boolean'
        ? meterPartyShowSelf
        : DEFAULT_SETTINGS.meterPartyShowSelfDisplayName,
    hotkeysOnlyWhenCompanionFocused:
      typeof hotkeysFocusOnly === 'boolean'
        ? hotkeysFocusOnly
        : DEFAULT_SETTINGS.hotkeysOnlyWhenCompanionFocused,
    meterAutoUploadAfterClear:
      typeof meterAutoUploadAfterClear === 'boolean'
        ? meterAutoUploadAfterClear
        : DEFAULT_SETTINGS.meterAutoUploadAfterClear,
    timersBackdropOpacity:
      typeof timersBackdrop === 'number'
        ? Math.min(1, Math.max(0, timersBackdrop))
        : DEFAULT_SETTINGS.timersBackdropOpacity,
    timersAlwaysOnTop:
      typeof timersTop === 'boolean' ? timersTop : DEFAULT_SETTINGS.timersAlwaysOnTop,
    timersPositionLocked:
      typeof timersLocked === 'boolean'
        ? timersLocked
        : DEFAULT_SETTINGS.timersPositionLocked,
    bossTimerNotifyLeadMin:
      typeof bossLead === 'number' &&
      Number.isFinite(bossLead) &&
      bossLead >= 1 &&
      bossLead <= 120
        ? Math.round(bossLead)
        : DEFAULT_SETTINGS.bossTimerNotifyLeadMin,
    bossTimerNotifyMethod: bossMethod ?? DEFAULT_SETTINGS.bossTimerNotifyMethod,
    bossTimerNotifyWhenUiClosed:
      typeof bossWhenClosed === 'boolean'
        ? bossWhenClosed
        : DEFAULT_SETTINGS.bossTimerNotifyWhenUiClosed,
    bossTimerChimeStyle: bossChime ?? DEFAULT_SETTINGS.bossTimerChimeStyle,
    bossTimerChimeVolume: bossChimeVol ?? DEFAULT_SETTINGS.bossTimerChimeVolume,
    bossTimerChimeRepeats: bossChimeRepeats ?? DEFAULT_SETTINGS.bossTimerChimeRepeats,
    hudBackdropOpacity:
      typeof hudBackdrop === 'number'
        ? Math.min(1, Math.max(0, hudBackdrop))
        : DEFAULT_SETTINGS.hudBackdropOpacity,
    hudAlwaysOnTop: typeof hudTop === 'boolean' ? hudTop : DEFAULT_SETTINGS.hudAlwaysOnTop,
    hudLayoutLocked:
      typeof hudLocked === 'boolean' ? hudLocked : DEFAULT_SETTINGS.hudLayoutLocked,
    hudWidgets,
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

export function hotkeysApplyPayload(settings: OverlaySettings): HotkeysApplyPayload {
  return {
    ...settings.hotkeys,
    hotkeysOnlyWhenCompanionFocused: settings.hotkeysOnlyWhenCompanionFocused,
  }
}
