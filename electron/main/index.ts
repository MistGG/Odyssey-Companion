import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  globalShortcut,
  ipcMain,
  nativeImage,
  protocol,
  screen,
  session,
  shell,
} from 'electron'
import type { Rectangle, WebContents } from 'electron'
import electronUpdater from 'electron-updater'

/** CJS package — use default import; named `autoUpdater` breaks in packaged ESM main. */
const { autoUpdater } = electronUpdater
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { stripHtmlToPlainText } from '../../src/lib/releaseNotesText'
import { fetchForumTeaserLive } from './fetchForumTeaserBrowser'
import {
  registerForumTeaserImageProtocol,
  TEASER_IMAGE_SCHEME,
} from './forumTeaserImageCache'
import { fetchPatchNotesCached, fetchPatchNoteDetail } from './fetchPatchNotes'
import { isOverlaySettings } from '../../src/lib/overlaySettingsGuard'
import { normalizeSettingsSection } from '../../src/lib/settingsSection'
import type { OverlaySettings, StartupPanelKey } from '../../src/types'
import { readOverlaySettingsFromDisk, writeOverlaySettingsToDisk } from './overlaySettingsDisk'
import {
  bossTimerAlertTick,
  setActiveRaidBossAlerts,
  tryShowBossTimerTestNotification,
} from './bossTimerAlerts'
import { registerMeterCombatLogIpc } from './meterCombatLogIpc'
import { registerMeterDebugReportIpc } from './meterDebugReportIpc'
import {
  syncServerStatusMonitor,
  tryShowServerStatusTestNotification,
  fetchGameServerOnline,
} from './serverStatusMonitor'
import { markWikiApiRequest } from './wikiRequestActivity'
import {
  clearFightEngageEpoch,
  getFightEngageEpoch,
  setFightEngageEpoch,
} from './fightEngageEpoch'
import { registerEventStreamBridge, shutdownEventStreamBridge, isDevStreamCaptureActive } from './eventStreamBridge'
import {
  boundsAfterHudResize,
  parseHudResizeEdge,
  type HudResizeEdge,
} from './hudWindowResize'
import {
  supabaseAuthStorageGet,
  supabaseAuthStorageRemove,
  supabaseAuthStorageSet,
} from './supabaseAuthStorage'

/** Must match `build.appId` in package.json — Windows toast header uses this identity. */
const APP_USER_MODEL_ID = 'gg.mist.odyssey.companion'
const APP_DISPLAY_NAME = 'Odyssey Companion'

app.setName(APP_DISPLAY_NAME)
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID)
  // Keep overlay CSS animations alive when a fullscreen game has focus on top.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: TEASER_IMAGE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

/** Set `ODYSSEY_START_PANEL=meter`, `=timers`, `=hud`, or `=settings` to launch only that window (UI dev). */
const METER_ONLY_STARTUP = process.env.ODYSSEY_START_PANEL === 'meter'
const TIMERS_ONLY_STARTUP = process.env.ODYSSEY_START_PANEL === 'timers'
const HUD_ONLY_STARTUP = process.env.ODYSSEY_START_PANEL === 'hud'
const SETTINGS_ONLY_STARTUP = process.env.ODYSSEY_START_PANEL === 'settings'

function companionChimeWindows(): BrowserWindow[] {
  return [timersWin, dungeonWin, settingsWin, meterWin, hudWin].filter(
    (w): w is BrowserWindow => !!(w && !w.isDestroyed()),
  )
}

function refreshServerStatusMonitor() {
  syncServerStatusMonitor(lastOverlaySettings, companionChimeWindows)
}

function browserWindowForIpc(sender: WebContents): BrowserWindow | undefined {
  const direct = BrowserWindow.fromWebContents(sender)
  if (direct && !direct.isDestroyed()) return direct
  const id = sender.id
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue
    if (w.webContents.id === id) return w
  }
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  return undefined
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const preload = path.join(__dirname, '../preload/index.cjs')

const BASE_WEB_PREFERENCES = {
  preload,
  contextIsolation: true,
  sandbox: false,
} as const

/** Solid background for opaque overlay windows (matches app shell CSS). */
const OVERLAY_WINDOW_BG_OPAQUE = '#070a12'

/** Overlays sit above the game — runtime throttling policy applied per-window. */
const OVERLAY_WEB_PREFERENCES = {
  ...BASE_WEB_PREFERENCES,
  backgroundThrottling: false,
} as const

function overlayWindowChromeOptions(): Pick<
  Electron.BrowserWindowConstructorOptions,
  'transparent' | 'backgroundColor'
> {
  if (lastOverlaySettings?.overlayOpaqueWindows === true) {
    return { transparent: false, backgroundColor: OVERLAY_WINDOW_BG_OPAQUE }
  }
  return { transparent: true, backgroundColor: '#00000000' }
}

function overlayRendererWindows(): BrowserWindow[] {
  return [timelineWin, meterWin, timersWin, hudWin].filter(
    (w): w is BrowserWindow => !!(w && !w.isDestroyed()),
  )
}

function companionGameFocused(): boolean {
  const w = BrowserWindow.getFocusedWindow()
  if (!w || w.isDestroyed()) return true
  const id = w.id
  if (timelineWin && !timelineWin.isDestroyed() && timelineWin.id === id) return false
  if (meterWin && !meterWin.isDestroyed() && meterWin.id === id) return false
  if (timersWin && !timersWin.isDestroyed() && timersWin.id === id) return false
  if (hudWin && !hudWin.isDestroyed() && hudWin.id === id) return false
  return true
}

let lastBroadcastGameFocused: boolean | null = null

function sendOverlayGameFocusTo(contents: WebContents) {
  if (contents.isDestroyed()) return
  contents.send('overlay:game-focused', { gameFocused: companionGameFocused() })
}

function broadcastGameFocusState(force = false) {
  const gameFocused = companionGameFocused()
  if (!force && lastBroadcastGameFocused === gameFocused) return
  lastBroadcastGameFocused = gameFocused
  const payload = { gameFocused }
  for (const w of overlayRendererWindows()) {
    if (!w.webContents.isDestroyed()) {
      w.webContents.send('overlay:game-focused', payload)
    }
  }
}

function applyOverlayWebContentsPolicy(win: BrowserWindow) {
  if (win.isDestroyed() || win.webContents.isDestroyed()) return
  const perfMode = lastOverlaySettings?.overlayPerformanceMode === true
  if (!perfMode) {
    win.webContents.setBackgroundThrottling(false)
    return
  }
  const focusedWin = BrowserWindow.getFocusedWindow()
  const focused =
    !!focusedWin && !focusedWin.isDestroyed() && focusedWin.id === win.id
  win.webContents.setBackgroundThrottling(!focused)
}

function syncAllOverlayBackgroundThrottling() {
  for (const w of overlayRendererWindows()) {
    applyOverlayWebContentsPolicy(w)
  }
}

function wireOverlayWebContentsLifecycle(win: BrowserWindow) {
  win.webContents.on('did-finish-load', () => {
    sendOverlayGameFocusTo(win.webContents)
    applyOverlayWebContentsPolicy(win)
  })
  win.on('focus', () => {
    applyOverlayWebContentsPolicy(win)
  })
  win.on('blur', () => {
    applyOverlayWebContentsPolicy(win)
  })
}

type OverlayWindowSnapshot = {
  bounds: Rectangle
  visible: boolean
  minimized: boolean
}

function snapshotOverlayWindow(win: BrowserWindow): OverlayWindowSnapshot {
  return {
    bounds: win.getBounds(),
    visible: win.isVisible(),
    minimized: win.isMinimized(),
  }
}

function restoreOverlayWindow(win: BrowserWindow, snap: OverlayWindowSnapshot) {
  win.setBounds(snap.bounds)
  if (snap.minimized) {
    win.minimize()
    return
  }
  if (snap.visible) {
    win.show()
    win.setSkipTaskbar(false)
  } else {
    win.hide()
    win.setSkipTaskbar(true)
  }
}

function replayTimelineFightIfAny() {
  if (lastFightPayload == null || !timelineWin || timelineWin.isDestroyed()) return
  const wc = timelineWin.webContents
  const replay = () => {
    if (!wc.isDestroyed()) wc.send('fight:loaded', lastFightPayload)
  }
  if (wc.isLoading()) wc.once('did-finish-load', replay)
  else replay()
}

function recreateTimelineWindowForOpaqueToggle() {
  if (!timelineWin || timelineWin.isDestroyed()) return
  const snap = snapshotOverlayWindow(timelineWin)
  const top = lastOverlaySettings?.timelineAlwaysOnTop ?? true
  timelineWin.destroy()
  timelineWin = null
  createTimelineWindow()
  if (!timelineWin) return
  restoreOverlayWindow(timelineWin, snap)
  setWinAlwaysOnTop(timelineWin, top)
  replayTimelineFightIfAny()
}

function recreateMeterWindowForOpaqueToggle() {
  if (!meterWin || meterWin.isDestroyed()) return
  const snap = snapshotOverlayWindow(meterWin)
  const top = lastOverlaySettings?.meterAlwaysOnTop ?? true
  meterWin.destroy()
  meterWin = null
  createMeterWindow()
  if (!meterWin) return
  restoreOverlayWindow(meterWin, snap)
  setWinAlwaysOnTop(meterWin, top)
}

function recreateTimersWindowForOpaqueToggle() {
  if (!timersWin || timersWin.isDestroyed()) return
  const snap = snapshotOverlayWindow(timersWin)
  const top = lastOverlaySettings?.timersAlwaysOnTop ?? true
  const savedLootBounds = timersLootDetailSavedBounds
  timersWin.destroy()
  timersWin = null
  createTimersWindow()
  timersLootDetailSavedBounds = savedLootBounds
  if (!timersWin) return
  restoreOverlayWindow(timersWin, snap)
  setWinAlwaysOnTop(timersWin, top)
}

function recreateHudWindowForOpaqueToggle() {
  if (!hudWin || hudWin.isDestroyed()) return
  const snap = snapshotOverlayWindow(hudWin)
  const top = lastOverlaySettings?.hudAlwaysOnTop ?? true
  hudWin.destroy()
  hudWin = null
  createHudWindow()
  if (!hudWin) return
  restoreOverlayWindow(hudWin, snap)
  setWinAlwaysOnTop(hudWin, top)
}

function recreateOverlayWindowsForOpaqueToggle() {
  recreateTimelineWindowForOpaqueToggle()
  recreateMeterWindowForOpaqueToggle()
  recreateTimersWindowForOpaqueToggle()
  recreateHudWindowForOpaqueToggle()
}

const indexHtml = path.join(RENDERER_DIST, 'index.html')

const DUNGEONS_URL =
  'https://thedigitalodyssey.com/api/wiki/dungeons?page=1&per_page=500'

function dungeonDetailUrl(id: string) {
  const q = new URLSearchParams({ id })
  return `https://thedigitalodyssey.com/api/wiki/dungeons?${q}`
}

function monsterDetailUrl(id: string) {
  const q = new URLSearchParams({ id })
  return `https://thedigitalodyssey.com/api/wiki/monsters?${q}`
}

function digimonDetailUrl(id: string) {
  const q = new URLSearchParams({ id })
  return `https://thedigitalodyssey.com/api/wiki/digimon?${q}`
}

function npcDetailUrl(id: string) {
  const q = new URLSearchParams({ id })
  return `https://thedigitalodyssey.com/api/wiki/npcs?${q}`
}

function wikiItemDetailUrl(id: string) {
  const q = new URLSearchParams({ id })
  return `https://thedigitalodyssey.com/api/wiki/items?${q}`
}

function marketItemsUrl(query: string) {
  const q = new URLSearchParams({ q: query })
  return `https://thedigitalodyssey.com/api/market/items?${q}`
}

function marketListingsUrl(item: string, side: string, limit: number) {
  const q = new URLSearchParams({ item, side, limit: String(limit) })
  return `https://thedigitalodyssey.com/api/market/listings?${q}`
}

const FETCH_HEADERS = {
  Accept: 'application/json',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
} as const

/** Renderer DevTools Network tab only shows *renderer* fetches. Wiki IPC runs in main — log here to trace URLs. */
function wikiLog(label: string, url: string) {
  if (!app.isPackaged) {
    console.log(`[odyssey-companion][wiki] ${label} ${url}`)
  }
}

let dungeonWin: BrowserWindow | null = null
let timelineWin: BrowserWindow | null = null
let meterWin: BrowserWindow | null = null
let timersWin: BrowserWindow | null = null
let hudWin: BrowserWindow | null = null
let hudResizeSession: {
  edge: HudResizeEdge
  startBounds: Rectangle
  startCursor: { x: number; y: number }
} | null = null
/** Bounds before expanding loot drop table — restored on collapse or tray hide. */
let timersLootDetailSavedBounds: Rectangle | null = null
/** Unified settings (fixed layout; not tied to overlay size). */
let settingsWin: BrowserWindow | null = null
/** EventStream WebSocket log viewer (dev / support). */
/** Dedicated always-on-top update UI (avoids native dialogs hidden under overlays). */
let updateWin: BrowserWindow | null = null
let marketLoginWin: BrowserWindow | null = null
let lastUpdaterState: Record<string, unknown> | null = null
let updateDownloadInProgress = false
let dpsReaderProc: ChildProcess | null = null
let dpsReaderStdoutBuf = ''
let tray: Tray | null = null
/** When false, the close handler hides to tray instead of destroying the window. */
let quitting = false

/**
 * Odyssey logo for tray + window taskbar icons.
 * Source: `resources/app-icon-source.png` (or `.svg`) — run `npm run prepare:icons` to regenerate PNG/ICO.
 */
function appIconPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'resources', 'app-icon.png')
  }
  return path.join(process.env.APP_ROOT ?? '', 'resources', 'app-icon.png')
}

/** Fallback when `resources/app-icon.png` is missing — 16×16 cyan tile. */
const TRAY_ICON_FALLBACK = nativeImage.createFromDataURL(
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAUElEQVQ4T2NkoBAwUhiwMDEwMPxnYAADKPzPwMDwn8EIAsgwMjL8Z4ABBgZGRsb/EAFGRsb/GDEwsLAwMoABAwMj49gfIQMDAwMjCAEAZhUsEOsVyDQAAAAASUVORK5CYII=',
)

function loadAppIconFromDisk(): Electron.NativeImage | null {
  const p = appIconPath()
  if (!fs.existsSync(p)) return null
  const img = nativeImage.createFromPath(p)
  return img.isEmpty() ? null : img
}

/** Taskbar / BrowserWindow title bar icon. */
function getWindowIcon(): Electron.NativeImage {
  return loadAppIconFromDisk() ?? TRAY_ICON_FALLBACK
}

/** Tray: downscale large PNGs so the silhouette stays readable at 16–32px. */
function getTrayIcon(): Electron.NativeImage {
  const img = loadAppIconFromDisk()
  if (!img) return TRAY_ICON_FALLBACK
  const { width, height } = img.getSize()
  if (width <= 32 && height <= 32) return img
  return img.resize({ width: 32, height: 32 })
}

/** Latest fight payload — survives IPC race when `fight:loaded` fires before the timeline mounts listeners. */
let lastFightPayload: unknown | undefined

/** Latest overlay settings from any renderer — used for boss timer tray alerts. */
let lastOverlaySettings: OverlaySettings | null = null

const BOSS_TIMER_ALERT_INTERVAL_MS = 15_000

type WindowLayoutFile = {
  dungeon?: Electron.Rectangle
  timeline?: Electron.Rectangle
  meter?: Electron.Rectangle
  timers?: Electron.Rectangle
  hud?: Electron.Rectangle
  settings?: Electron.Rectangle
}

/** Main companion window — sized for home teaser + patch notes layout. */
const DEFAULT_DUNGEON_SIZE = {
  width: 1180,
  height: 780,
  minWidth: 1020,
  minHeight: 720,
} as const

/**
 * Timeline window floor: must keep minimize / close and the timer row on-screen (shell + titlebar chrome).
 */
const TIMELINE_WINDOW_MIN_WIDTH = 432

const DEFAULT_TIMELINE_SIZE = {
  width: 820,
  height: 440,
  minWidth: TIMELINE_WINDOW_MIN_WIDTH,
  minHeight: 180,
} as const

const DEFAULT_METER_SIZE = {
  width: 340,
  height: 220,
  minWidth: 260,
  minHeight: 160,
} as const

const DEFAULT_TIMERS_SIZE = {
  width: 300,
  height: 128,
  minWidth: 260,
  minHeight: 108,
} as const

const DEFAULT_HUD_SIZE = {
  width: 420,
  height: 320,
  minWidth: 200,
  minHeight: 150,
} as const

const DEFAULT_SETTINGS_SIZE = {
  width: 620,
  height: 760,
  minWidth: 480,
  minHeight: 520,
} as const

function layoutFilePath(): string {
  return path.join(app.getPath('userData'), 'window-layout.json')
}

function readWindowLayout(): WindowLayoutFile {
  try {
    const raw = fs.readFileSync(layoutFilePath(), 'utf8')
    const j = JSON.parse(raw) as WindowLayoutFile
    return j && typeof j === 'object' ? j : {}
  } catch {
    return {}
  }
}

function writeWindowLayout(layout: WindowLayoutFile): void {
  try {
    fs.writeFileSync(layoutFilePath(), JSON.stringify(layout), 'utf8')
  } catch (e) {
    console.warn('[odyssey-companion] failed to save window layout', e)
  }
}

function normalizeDungeonBounds(
  r?: Electron.Rectangle,
): Pick<Electron.Rectangle, 'x' | 'y' | 'width' | 'height'> | undefined {
  if (!r || typeof r.width !== 'number' || typeof r.height !== 'number') return undefined
  return {
    x: typeof r.x === 'number' ? Math.round(r.x) : 0,
    y: typeof r.y === 'number' ? Math.round(r.y) : 0,
    width: Math.max(DEFAULT_DUNGEON_SIZE.minWidth, Math.round(r.width)),
    height: Math.max(DEFAULT_DUNGEON_SIZE.minHeight, Math.round(r.height)),
  }
}

function normalizeTimelineBounds(
  r?: Electron.Rectangle,
): Pick<Electron.Rectangle, 'x' | 'y' | 'width' | 'height'> | undefined {
  if (!r || typeof r.width !== 'number' || typeof r.height !== 'number') return undefined
  return {
    x: typeof r.x === 'number' ? Math.round(r.x) : 0,
    y: typeof r.y === 'number' ? Math.round(r.y) : 0,
    width: Math.max(DEFAULT_TIMELINE_SIZE.minWidth, Math.round(r.width)),
    height: Math.max(DEFAULT_TIMELINE_SIZE.minHeight, Math.round(r.height)),
  }
}

function normalizeMeterBounds(
  r?: Electron.Rectangle,
): Pick<Electron.Rectangle, 'x' | 'y' | 'width' | 'height'> | undefined {
  if (!r || typeof r.width !== 'number' || typeof r.height !== 'number') return undefined
  return {
    x: typeof r.x === 'number' ? Math.round(r.x) : 0,
    y: typeof r.y === 'number' ? Math.round(r.y) : 0,
    width: Math.max(DEFAULT_METER_SIZE.minWidth, Math.round(r.width)),
    height: Math.max(DEFAULT_METER_SIZE.minHeight, Math.round(r.height)),
  }
}

function normalizeTimersBounds(
  r?: Electron.Rectangle,
): Pick<Electron.Rectangle, 'x' | 'y' | 'width' | 'height'> | undefined {
  if (!r || typeof r.width !== 'number' || typeof r.height !== 'number') return undefined
  return {
    x: typeof r.x === 'number' ? Math.round(r.x) : 0,
    y: typeof r.y === 'number' ? Math.round(r.y) : 0,
    width: Math.max(DEFAULT_TIMERS_SIZE.minWidth, Math.round(r.width)),
    height: Math.max(DEFAULT_TIMERS_SIZE.minHeight, Math.round(r.height)),
  }
}

function normalizeHudBounds(
  r?: Electron.Rectangle,
): Pick<Electron.Rectangle, 'x' | 'y' | 'width' | 'height'> | undefined {
  if (!r || typeof r.width !== 'number' || typeof r.height !== 'number') return undefined
  return {
    x: typeof r.x === 'number' ? Math.round(r.x) : 0,
    y: typeof r.y === 'number' ? Math.round(r.y) : 0,
    width: Math.max(DEFAULT_HUD_SIZE.minWidth, Math.round(r.width)),
    height: Math.max(DEFAULT_HUD_SIZE.minHeight, Math.round(r.height)),
  }
}

function normalizeSettingsBounds(
  r?: Electron.Rectangle,
): Pick<Electron.Rectangle, 'x' | 'y' | 'width' | 'height'> | undefined {
  if (!r || typeof r.width !== 'number' || typeof r.height !== 'number') return undefined
  return {
    x: typeof r.x === 'number' ? Math.round(r.x) : 0,
    y: typeof r.y === 'number' ? Math.round(r.y) : 0,
    width: Math.max(DEFAULT_SETTINGS_SIZE.minWidth, Math.round(r.width)),
    height: Math.max(DEFAULT_SETTINGS_SIZE.minHeight, Math.round(r.height)),
  }
}

let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null

function persistWindowLayout(): void {
  const layout = readWindowLayout()
  if (dungeonWin && !dungeonWin.isDestroyed()) {
    layout.dungeon = dungeonWin.getBounds()
  }
  if (timelineWin && !timelineWin.isDestroyed()) {
    layout.timeline = timelineWin.getBounds()
  }
  if (meterWin && !meterWin.isDestroyed()) {
    layout.meter = meterWin.getBounds()
  }
  if (timersWin && !timersWin.isDestroyed()) {
    layout.timers = timersWin.getBounds()
  }
  if (hudWin && !hudWin.isDestroyed()) {
    layout.hud = hudWin.getBounds()
  }
  if (settingsWin && !settingsWin.isDestroyed()) {
    layout.settings = settingsWin.getBounds()
  }
  writeWindowLayout(layout)
}

function schedulePersistWindowLayout(): void {
  if (layoutSaveTimer) clearTimeout(layoutSaveTimer)
  layoutSaveTimer = setTimeout(() => {
    layoutSaveTimer = null
    persistWindowLayout()
  }, 450)
}

function attachWindowLayoutTracking(win: BrowserWindow): void {
  win.on('resize', schedulePersistWindowLayout)
  win.on('move', schedulePersistWindowLayout)
}

/** Strongest always-on-top tier on Windows so overlays stay above games (exclusive fullscreen may still win). */
function setWinAlwaysOnTop(win: BrowserWindow | null, flag: boolean) {
  if (!win || win.isDestroyed()) return
  if (flag && process.platform === 'win32') {
    win.setAlwaysOnTop(true, 'screen-saver')
  } else {
    win.setAlwaysOnTop(flag)
  }
}

/** Settings uses the same topmost tier as overlays so `moveTop()` can order it above them. */
function setSettingsAlwaysOnTop(win: BrowserWindow | null, flag: boolean) {
  setWinAlwaysOnTop(win, flag)
}

function raiseSettingsAboveCompanionPanels(focus = false) {
  if (!settingsWin || settingsWin.isDestroyed() || !settingsWin.isVisible()) return
  settingsWin.moveTop()
  if (focus) {
    settingsWin.focus()
  }
}

/** When another panel is focused, keep settings painted above overlays if it is open. */
function wireSettingsStaysAboveOnOverlayFocus(win: BrowserWindow) {
  win.on('focus', () => {
    raiseSettingsAboveCompanionPanels(false)
  })
}

type HotkeyPayload = {
  toggle: string
  reset: string
  meterResetSession: string
  meterUploadParse: string
}

let storedHotkeys: HotkeyPayload | null = null
let hotkeysWhenCompanionFocused = false
let hotkeyFocusDebounce: ReturnType<typeof setTimeout> | null = null

function companionHotkeyWindowHasFocus(): boolean {
  const w = BrowserWindow.getFocusedWindow()
  if (!w || w.isDestroyed()) return false
  const id = w.id
  if (dungeonWin && !dungeonWin.isDestroyed() && dungeonWin.id === id) return true
  if (timelineWin && !timelineWin.isDestroyed() && timelineWin.id === id) return true
  if (meterWin && !meterWin.isDestroyed() && meterWin.id === id) return true
  if (timersWin && !timersWin.isDestroyed() && timersWin.id === id) return true
  if (hudWin && !hudWin.isDestroyed() && hudWin.id === id) return true
  if (settingsWin && !settingsWin.isDestroyed() && settingsWin.id === id) return true
  return false
}

/** Register shortcuts from `cfg` without calling `unregisterAll` first. */
function registerHotkeysDirect(cfg: HotkeyPayload) {
  const entries: { acc: string; action: 'toggle' | 'reset' }[] = [
    { acc: cfg.toggle.trim(), action: 'toggle' },
    { acc: cfg.reset.trim(), action: 'reset' },
  ]
  for (const { acc, action } of entries) {
    if (!acc || acc.toLowerCase() === 'none') continue
    const ok = globalShortcut.register(acc, () => {
      const target = timelineWin ?? dungeonWin
      target?.webContents.send('timeline-action', action)
    })
    if (!ok) {
      console.warn(`[odyssey-companion] Could not register global shortcut: ${acc} (${action})`)
    }
  }
  const meterEntries: { acc: string; label: string; fn: () => void }[] = [
    { acc: cfg.meterResetSession.trim(), label: 'meterResetSession', fn: triggerMeterResetFromHotkey },
    { acc: cfg.meterUploadParse.trim(), label: 'meterUploadParse', fn: triggerMeterUploadFromHotkey },
  ]
  for (const { acc, label, fn } of meterEntries) {
    if (!acc || acc.toLowerCase() === 'none') continue
    const ok = globalShortcut.register(acc, fn)
    if (!ok) {
      console.warn(`[odyssey-companion] Could not register global shortcut: ${acc} (${label})`)
    }
  }
}

function applyHotkeysForCurrentPolicy() {
  if (!storedHotkeys) return
  globalShortcut.unregisterAll()
  if (hotkeysWhenCompanionFocused && !companionHotkeyWindowHasFocus()) {
    return
  }
  registerHotkeysDirect(storedHotkeys)
}

function setHotkeysFromRenderer(cfg: HotkeyPayload, whenCompanionFocusedOnly: boolean) {
  storedHotkeys = cfg
  hotkeysWhenCompanionFocused = whenCompanionFocusedOnly
  applyHotkeysForCurrentPolicy()
}

function scheduleHotkeysFocusRefresh() {
  if (hotkeyFocusDebounce != null) clearTimeout(hotkeyFocusDebounce)
  hotkeyFocusDebounce = setTimeout(() => {
    hotkeyFocusDebounce = null
    if (storedHotkeys && hotkeysWhenCompanionFocused) {
      applyHotkeysForCurrentPolicy()
    }
    broadcastGameFocusState()
    syncAllOverlayBackgroundThrottling()
  }, 40)
}

type TimelineOptionsPayload = {
  alwaysOnTop: boolean
}

function dungeonLoadUrl() {
  if (!VITE_DEV_SERVER_URL) return
  const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
  return `${base}/?panel=dungeon`
}

function timelineLoadUrl() {
  if (!VITE_DEV_SERVER_URL) return
  const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
  return `${base}/?panel=timeline`
}

function meterLoadUrl() {
  if (!VITE_DEV_SERVER_URL) return
  const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
  return `${base}/?panel=meter`
}

function timersLoadUrl() {
  if (!VITE_DEV_SERVER_URL) return
  const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
  return `${base}/?panel=timers`
}

function hudLoadUrl() {
  if (!VITE_DEV_SERVER_URL) return
  const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
  return `${base}/?panel=hud`
}

function updateLoadUrl() {
  if (!VITE_DEV_SERVER_URL) return
  const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
  return `${base}/?panel=update`
}

function settingsLoadUrl(section: string) {
  if (!VITE_DEV_SERVER_URL) return
  const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
  const sec = encodeURIComponent(section)
  return `${base}/?panel=settings&section=${sec}`
}

function centerSettingsWindow(win: BrowserWindow) {
  const { width, height } = win.getBounds()
  const wa = screen.getPrimaryDisplay().workArea
  const x = Math.round(wa.x + (wa.width - width) / 2)
  const y = Math.round(wa.y + (wa.height - height) / 2)
  win.setPosition(x, y)
}

function createSettingsWindow(sectionRaw?: unknown) {
  const section = normalizeSettingsSection(sectionRaw)
  const layout = readWindowLayout()
  const b = normalizeSettingsBounds(layout.settings)
  settingsWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — Settings',
    ...(b ?? {
      width: DEFAULT_SETTINGS_SIZE.width,
      height: DEFAULT_SETTINGS_SIZE.height,
    }),
    minWidth: DEFAULT_SETTINGS_SIZE.minWidth,
    minHeight: DEFAULT_SETTINGS_SIZE.minHeight,
    ...(os.platform() === 'win32'
      ? { roundedCorners: false as const, thickFrame: true as const }
      : {}),
    show: false,
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#0a0e16',
    transparent: false,
    frame: false,
    alwaysOnTop: true,
    webPreferences: BASE_WEB_PREFERENCES,
  })
  setSettingsAlwaysOnTop(settingsWin, true)
  const url = settingsLoadUrl(section)
  if (url) {
    void settingsWin.loadURL(url)
  } else {
    void settingsWin.loadFile(indexHtml, { query: { panel: 'settings', section } })
  }
  settingsWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  settingsWin.once('ready-to-show', () => {
    if (!settingsWin || settingsWin.isDestroyed()) return
    if (!b) centerSettingsWindow(settingsWin)
    settingsWin.show()
    settingsWin.setSkipTaskbar(false)
    raiseSettingsAboveCompanionPanels(true)
  })
  settingsWin.on('closed', () => {
    settingsWin = null
  })
  attachWindowLayoutTracking(settingsWin)
}

function showSettingsWindow(sectionRaw?: unknown) {
  const section = normalizeSettingsSection(sectionRaw)
  if (!settingsWin || settingsWin.isDestroyed()) {
    createSettingsWindow(section)
    return
  }
  settingsWin.webContents.send('settings:navigate', section)
  const w = settingsWin
  w.show()
  w.setSkipTaskbar(false)
  if (w.isMinimized()) w.restore()
  setSettingsAlwaysOnTop(w, true)
  raiseSettingsAboveCompanionPanels(true)
}

function pushUpdaterState(payload: Record<string, unknown>) {
  lastUpdaterState = payload
  if (updateWin && !updateWin.isDestroyed() && !updateWin.webContents.isDestroyed()) {
    updateWin.webContents.send('updater:state', payload)
  }
}

function centerUpdateWindow(win: BrowserWindow) {
  const { width, height } = win.getBounds()
  const wa = screen.getPrimaryDisplay().workArea
  const x = Math.round(wa.x + (wa.width - width) / 2)
  const y = Math.round(wa.y + (wa.height - height) / 2)
  win.setPosition(x, y)
}

function showOrFocusUpdateWindow() {
  if (updateWin && !updateWin.isDestroyed()) {
    updateWin.show()
    updateWin.focus()
    if (lastUpdaterState) {
      updateWin.webContents.send('updater:state', lastUpdaterState)
    }
    return
  }
  updateWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — Update',
    width: 440,
    height: 360,
    minWidth: 400,
    minHeight: 300,
    ...(os.platform() === 'win32' ? { roundedCorners: false as const } : {}),
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    show: false,
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: BASE_WEB_PREFERENCES,
  })
  setWinAlwaysOnTop(updateWin, true)
  const url = updateLoadUrl()
  if (url) {
    void updateWin.loadURL(url)
  } else {
    void updateWin.loadFile(indexHtml, { query: { panel: 'update' } })
  }
  updateWin.once('ready-to-show', () => {
    if (!updateWin || updateWin.isDestroyed()) return
    centerUpdateWindow(updateWin)
    updateWin.show()
    updateWin.focus()
    if (lastUpdaterState) {
      updateWin.webContents.send('updater:state', lastUpdaterState)
    }
  })
  updateWin.on('closed', () => {
    updateWin = null
  })
}

function wireHideInsteadOfClose(win: BrowserWindow) {
  win.on('close', (e) => {
    if (quitting) return
    e.preventDefault()
    if (!win.isDestroyed()) {
      win.hide()
      win.setSkipTaskbar(true)
    }
  })
}

function createDungeonWindow(options?: { show?: boolean }) {
  const layout = readWindowLayout()
  const b = normalizeDungeonBounds(layout.dungeon)
  dungeonWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — Dungeons',
    show: options?.show ?? true,
    ...(b ?? {
      width: DEFAULT_DUNGEON_SIZE.width,
      height: DEFAULT_DUNGEON_SIZE.height,
    }),
    minWidth: DEFAULT_DUNGEON_SIZE.minWidth,
    minHeight: DEFAULT_DUNGEON_SIZE.minHeight,
    backgroundColor: '#070a12',
    transparent: false,
    frame: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    webPreferences: {
      ...BASE_WEB_PREFERENCES,
      backgroundThrottling: false,
    },
  })

  const url = dungeonLoadUrl()
  if (url) {
    dungeonWin.loadURL(url)
  } else {
    dungeonWin.loadFile(indexHtml, { query: { panel: 'dungeon' } })
  }

  dungeonWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  setWinAlwaysOnTop(dungeonWin, true)
  wireHideInsteadOfClose(dungeonWin)
  attachWindowLayoutTracking(dungeonWin)
  wireSettingsStaysAboveOnOverlayFocus(dungeonWin)
  dungeonWin.on('show', () => {
    notifyHomeRefresh()
  })
}

function notifyHomeRefresh() {
  if (!dungeonWin || dungeonWin.isDestroyed() || dungeonWin.webContents.isDestroyed()) return
  if (dungeonWin.webContents.isLoading()) return
  dungeonWin.webContents.send('home:refresh')
}

function createTimelineWindow() {
  const layout = readWindowLayout()
  const b = normalizeTimelineBounds(layout.timeline)
  timelineWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — Timeline',
    show: false,
    ...(b ?? {
      width: DEFAULT_TIMELINE_SIZE.width,
      height: DEFAULT_TIMELINE_SIZE.height,
    }),
    minWidth: DEFAULT_TIMELINE_SIZE.minWidth,
    minHeight: DEFAULT_TIMELINE_SIZE.minHeight,
    /** Required for edge resize: a large `-webkit-app-region: drag` body would swallow resize hits (see timeline CSS). */
    resizable: true,
    /**
     * Win11 + transparent frameless windows get DWM-rounded outer corners by default.
     * Our `.timeline-backdrop` already draws a 14px radius + border — two mismatched arcs read as a “double corner”.
     */
    ...(os.platform() === 'win32'
      ? { roundedCorners: false as const, thickFrame: true as const }
      : {}),
    ...overlayWindowChromeOptions(),
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: OVERLAY_WEB_PREFERENCES,
  })

  const url = timelineLoadUrl()
  if (url) {
    timelineWin.loadURL(url)
  } else {
    timelineWin.loadFile(indexHtml, { query: { panel: 'timeline' } })
  }

  timelineWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  setWinAlwaysOnTop(timelineWin, true)
  wireHideInsteadOfClose(timelineWin)
  attachWindowLayoutTracking(timelineWin)
  wireSettingsStaysAboveOnOverlayFocus(timelineWin)
  wireOverlayWebContentsLifecycle(timelineWin)
}

function createMeterWindow() {
  const layout = readWindowLayout()
  const b = normalizeMeterBounds(layout.meter)
  meterWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — Meter',
    ...(b ?? {
      width: DEFAULT_METER_SIZE.width,
      height: DEFAULT_METER_SIZE.height,
    }),
    minWidth: DEFAULT_METER_SIZE.minWidth,
    minHeight: DEFAULT_METER_SIZE.minHeight,
    ...(os.platform() === 'win32'
      ? { roundedCorners: false as const, thickFrame: true as const }
      : {}),
    ...overlayWindowChromeOptions(),
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: OVERLAY_WEB_PREFERENCES,
  })

  const url = meterLoadUrl()
  if (url) {
    meterWin.loadURL(url)
  } else {
    meterWin.loadFile(indexHtml, { query: { panel: 'meter' } })
  }

  meterWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  setWinAlwaysOnTop(meterWin, true)
  wireHideInsteadOfClose(meterWin)
  attachWindowLayoutTracking(meterWin)
  wireSettingsStaysAboveOnOverlayFocus(meterWin)
  wireOverlayWebContentsLifecycle(meterWin)
}

function createTimersWindow() {
  timersLootDetailSavedBounds = null
  const layout = readWindowLayout()
  const b = normalizeTimersBounds(layout.timers)
  timersWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — Raid Timer',
    ...(b ?? {
      width: DEFAULT_TIMERS_SIZE.width,
      height: DEFAULT_TIMERS_SIZE.height,
    }),
    minWidth: DEFAULT_TIMERS_SIZE.minWidth,
    minHeight: DEFAULT_TIMERS_SIZE.minHeight,
    ...(os.platform() === 'win32'
      ? { roundedCorners: false as const, thickFrame: true as const }
      : {}),
    ...overlayWindowChromeOptions(),
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: OVERLAY_WEB_PREFERENCES,
  })

  const url = timersLoadUrl()
  if (url) {
    timersWin.loadURL(url)
  } else {
    timersWin.loadFile(indexHtml, { query: { panel: 'timers' } })
  }

  timersWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  setWinAlwaysOnTop(timersWin, true)
  wireHideInsteadOfClose(timersWin)
  timersWin.on('hide', () => {
    if (!timersWin || timersWin.isDestroyed()) return
    if (timersLootDetailSavedBounds) {
      timersWin.setBounds(timersLootDetailSavedBounds)
      timersLootDetailSavedBounds = null
    }
  })
  attachWindowLayoutTracking(timersWin)
  wireSettingsStaysAboveOnOverlayFocus(timersWin)
  wireOverlayWebContentsLifecycle(timersWin)
}

function createHudWindow() {
  const layout = readWindowLayout()
  const b = normalizeHudBounds(layout.hud)
  hudWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — Digi Aura',
    ...(b ?? {
      width: DEFAULT_HUD_SIZE.width,
      height: DEFAULT_HUD_SIZE.height,
    }),
    minWidth: DEFAULT_HUD_SIZE.minWidth,
    minHeight: DEFAULT_HUD_SIZE.minHeight,
    resizable: true,
    ...(os.platform() === 'win32'
      ? { roundedCorners: false as const, thickFrame: true as const }
      : {}),
    ...overlayWindowChromeOptions(),
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: OVERLAY_WEB_PREFERENCES,
  })

  const url = hudLoadUrl()
  if (url) {
    hudWin.loadURL(url)
  } else {
    hudWin.loadFile(indexHtml, { query: { panel: 'hud' } })
  }

  hudWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  setWinAlwaysOnTop(hudWin, true)
  wireHideInsteadOfClose(hudWin)
  attachWindowLayoutTracking(hudWin)
  wireSettingsStaysAboveOnOverlayFocus(hudWin)
  wireOverlayWebContentsLifecycle(hudWin)
}

function showDungeonWindow() {
  if (!dungeonWin || dungeonWin.isDestroyed()) {
    createDungeonWindow()
  }
  const w = dungeonWin!
  w.show()
  w.setSkipTaskbar(false)
  if (w.isMinimized()) w.restore()
  w.focus()
  setWinAlwaysOnTop(w, true)
  raiseSettingsAboveCompanionPanels(false)
}

function showTimelineWindow() {
  if (!timelineWin || timelineWin.isDestroyed()) {
    createTimelineWindow()
  }
  const w = timelineWin!
  w.show()
  w.setSkipTaskbar(false)
  if (w.isMinimized()) w.restore()
  w.focus()
  setWinAlwaysOnTop(w, true)
  raiseSettingsAboveCompanionPanels(false)
}

function showMeterWindow() {
  if (!meterWin || meterWin.isDestroyed()) {
    createMeterWindow()
  }
  const w = meterWin!
  w.show()
  w.setSkipTaskbar(false)
  if (w.isMinimized()) w.restore()
  w.focus()
  setWinAlwaysOnTop(w, true)
  raiseSettingsAboveCompanionPanels(false)
}

function showMarketLoginWindow() {
  if (marketLoginWin && !marketLoginWin.isDestroyed()) {
    marketLoginWin.show()
    if (marketLoginWin.isMinimized()) marketLoginWin.restore()
    marketLoginWin.focus()
    return true
  }

  marketLoginWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey market login',
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
    },
  })
  marketLoginWin.loadURL('https://thedigitalodyssey.com/auth/login')
  marketLoginWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      return { action: 'allow' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })
  marketLoginWin.on('closed', () => {
    marketLoginWin = null
  })
  return true
}

function showTimersWindow() {
  if (!timersWin || timersWin.isDestroyed()) {
    createTimersWindow()
  }
  const w = timersWin!
  w.show()
  w.setSkipTaskbar(false)
  if (w.isMinimized()) w.restore()
  w.focus()
  setWinAlwaysOnTop(w, true)
  raiseSettingsAboveCompanionPanels(false)
}

function showHudWindow() {
  if (!hudWin || hudWin.isDestroyed()) {
    createHudWindow()
  }
  const w = hudWin!
  w.show()
  w.setSkipTaskbar(false)
  if (w.isMinimized()) w.restore()
  w.focus()
  setWinAlwaysOnTop(w, true)
  raiseSettingsAboveCompanionPanels(false)
}

function dpsReaderScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'odyssey-dps-reader.py')
  }
  return path.join(process.env.APP_ROOT ?? '', 'scripts', 'odyssey-dps-reader.py')
}

/**
 * Windows: prefer embeddable CPython + pymem from `npm run prepare:dps-python` (shipped under
 * `resources/python-runtime` in the installer). Dev: `bundle/python-runtime/python.exe` if present.
 * Override with env `ODYSSEY_PYTHON` (full path to interpreter).
 */
function bundledPythonExecutable(): string | null {
  if (process.platform !== 'win32') return null
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, 'python-runtime', 'python.exe')
    return fs.existsSync(p) ? p : null
  }
  const dev = path.join(process.env.APP_ROOT ?? '', 'bundle', 'python-runtime', 'python.exe')
  return fs.existsSync(dev) ? dev : null
}

function resolvePythonForDps(): { exe: string; cwd?: string } {
  const fromEnv = process.env.ODYSSEY_PYTHON?.trim()
  if (fromEnv) {
    return { exe: fromEnv }
  }
  const bundled = bundledPythonExecutable()
  if (bundled) {
    return { exe: bundled, cwd: path.dirname(bundled) }
  }
  return { exe: process.platform === 'win32' ? 'python' : 'python3' }
}

function broadcastMeterTelemetry(payload: unknown) {
  if (meterWin && !meterWin.isDestroyed()) {
    meterWin.webContents.send('meter:telemetry', payload)
  }
}

function stopDpsReader() {
  if (!dpsReaderProc) return
  try {
    dpsReaderProc.kill()
  } catch {
    /* ignore */
  }
  dpsReaderProc = null
  dpsReaderStdoutBuf = ''
}

/** Meter Python reader stdout → renderer telemetry. */
function wireMeterReaderStreams() {
  if (!dpsReaderProc) return
  dpsReaderStdoutBuf = ''
  dpsReaderProc.stdout?.on('data', (chunk: Buffer) => {
    dpsReaderStdoutBuf += chunk.toString('utf8')
    let nl: number
    while ((nl = dpsReaderStdoutBuf.indexOf('\n')) >= 0) {
      const line = dpsReaderStdoutBuf.slice(0, nl).trim()
      dpsReaderStdoutBuf = dpsReaderStdoutBuf.slice(nl + 1)
      if (!line) continue
      try {
        const msg: unknown = JSON.parse(line)
        broadcastMeterTelemetry(msg)
      } catch {
        broadcastMeterTelemetry({
          type: 'log',
          level: 'warn',
          message: `Non-JSON stdout: ${line}`,
        })
      }
    }
  })
  dpsReaderProc.stderr?.on('data', (chunk: Buffer) => {
    const t = chunk.toString('utf8').trim()
    if (t) {
      broadcastMeterTelemetry({ type: 'log', level: 'stderr', message: t })
    }
  })
  dpsReaderProc.on('error', (err) => {
    broadcastMeterTelemetry({
      type: 'status',
      status: 'error',
      message: String(err),
    })
    dpsReaderProc = null
    dpsReaderStdoutBuf = ''
  })
  dpsReaderProc.on('exit', (code, signal) => {
    dpsReaderProc = null
    dpsReaderStdoutBuf = ''
    broadcastMeterTelemetry({
      type: 'status',
      status: 'stopped',
      code,
      signal: signal ?? undefined,
    })
  })
}

function startDpsReader(): { ok: boolean; error?: string } {
  if (dpsReaderProc !== null && !dpsReaderProc.killed) {
    return { ok: true }
  }

  const scriptPath = dpsReaderScriptPath()
  if (!fs.existsSync(scriptPath)) {
    return {
      ok: false,
      error: `Meter reader script not found at ${scriptPath}`,
    }
  }

  const { exe: py, cwd: pyCwd } = resolvePythonForDps()

  try {
    dpsReaderProc = spawn(py, ['-u', scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      ...(pyCwd ? { cwd: pyCwd } : {}),
    })
  } catch (e) {
    return { ok: false, error: String(e) }
  }

  wireMeterReaderStreams()

  return { ok: true }
}

function sendDpsReaderReset() {
  if (!dpsReaderProc?.stdin || dpsReaderProc.killed) return
  try {
    dpsReaderProc.stdin.write('RESET\n')
  } catch {
    /* stdin closed */
  }
}

function hideWindowToTray(win: BrowserWindow | null | undefined) {
  if (!win || win.isDestroyed()) return false
  win.hide()
  win.setSkipTaskbar(true)
  return true
}

function quitFromTray() {
  quitting = true
  globalShortcut.unregisterAll()
  stopDpsReader()
  timersLootDetailSavedBounds = null
  tray?.destroy()
  tray = null
  if (dungeonWin && !dungeonWin.isDestroyed()) dungeonWin.destroy()
  if (timelineWin && !timelineWin.isDestroyed()) timelineWin.destroy()
  if (meterWin && !meterWin.isDestroyed()) meterWin.destroy()
  if (timersWin && !timersWin.isDestroyed()) timersWin.destroy()
  if (hudWin && !hudWin.isDestroyed()) hudWin.destroy()
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.destroy()
  if (updateWin && !updateWin.isDestroyed()) updateWin.destroy()
  if (marketLoginWin && !marketLoginWin.isDestroyed()) marketLoginWin.destroy()
  void shutdownEventStreamBridge()
  dungeonWin = null
  timelineWin = null
  meterWin = null
  timersWin = null
  hudWin = null
  settingsWin = null
  updateWin = null
  marketLoginWin = null
  app.quit()
}

function broadcastSettingsPatch(payload: unknown) {
  for (const w of [
    dungeonWin,
    timelineWin,
    meterWin,
    timersWin,
    hudWin,
    settingsWin,
  ]) {
    if (w && !w.isDestroyed()) {
      w.webContents.send('settings:patch', payload)
    }
  }
}

function unlockHudLayoutFromTray() {
  showHudWindow()
  const patch = { hudLayoutLocked: false }
  if (lastOverlaySettings) {
    lastOverlaySettings = { ...lastOverlaySettings, hudLayoutLocked: false }
  }
  broadcastSettingsPatch(patch)
  refreshTrayMenu()
}

function buildTrayMenuTemplate(): Electron.MenuItemConstructorOptions[] {
  const hudLocked = lastOverlaySettings?.hudLayoutLocked === true
  const items: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Open main',
      click: () => showDungeonWindow(),
    },
    {
      label: 'Open timeline',
      click: () => showTimelineWindow(),
    },
    {
      label: 'Open DPS meter',
      click: () => showMeterWindow(),
    },
    {
      label: 'Open Raid Timer',
      click: () => showTimersWindow(),
    },
    {
      label: hudLocked ? 'Unlock Digi Aura' : 'Open Digi Aura',
      click: () => (hudLocked ? unlockHudLayoutFromTray() : showHudWindow()),
    },
    {
      label: 'Settings',
      click: () => showSettingsWindow('general'),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => quitFromTray(),
    },
  ]
  return items
}

function refreshTrayMenu() {
  if (!tray) return
  tray.setContextMenu(Menu.buildFromTemplate(buildTrayMenuTemplate()))
}

function createTray() {
  if (tray) return
  tray = new Tray(getTrayIcon())
  tray.setToolTip('Odyssey Companion')
  refreshTrayMenu()
  tray.on('click', () => {
    showDungeonWindow()
  })
}

function triggerMeterResetFromHotkey() {
  if (meterWin && !meterWin.isDestroyed()) {
    meterWin.webContents.send('meter:clear-session-ui')
  }
}

function triggerMeterUploadFromHotkey() {
  if (meterWin && !meterWin.isDestroyed()) {
    meterWin.webContents.send('meter:trigger-upload-parse')
  }
}

function notifyMeterPartyThemesChanged() {
  if (meterWin && !meterWin.isDestroyed()) {
    meterWin.webContents.send('meter:party-themes-changed')
  }
}

function createWindows() {
  createDungeonWindow({ show: false })
  createTimelineWindow()
}

function openStartupPanels(settings: OverlaySettings) {
  const panels = new Set<StartupPanelKey>(settings.startupPanels)
  if (panels.has('main')) showDungeonWindow()
  if (panels.has('timeline')) showTimelineWindow()
  if (panels.has('meter')) showMeterWindow()
  if (panels.has('timers')) showTimersWindow()
  if (panels.has('hud')) showHudWindow()
}

function launchCompanionWindows(settings: OverlaySettings) {
  lastOverlaySettings = settings
  createWindows()
  openStartupPanels(settings)
  refreshServerStatusMonitor()
}

function releaseNotesPlain(info: {
  releaseNotes?: string | Array<{ note?: string | null }> | null
}) {
  const n = info.releaseNotes
  if (n == null) return ''
  if (typeof n === 'string') return n
  return n.map((x) => x.note ?? '').filter(Boolean).join('\n\n')
}

/** Uses GitHub Releases (see `build.publish` in package.json). Changelog = release notes on the GitHub release. */
function setupAutoUpdater() {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    if (updateDownloadInProgress) return
    const notes = stripHtmlToPlainText(releaseNotesPlain(info))
    showOrFocusUpdateWindow()
    pushUpdaterState({
      phase: 'available',
      version: info.version,
      notes,
    })
  })

  autoUpdater.on('update-not-available', () => {
    /* silent — optional: toast on manual check later */
  })

  autoUpdater.on('download-progress', (p) => {
    pushUpdaterState({
      phase: 'downloading',
      percent: Math.round(p.percent ?? 0),
      transferred: p.transferred,
      total: p.total,
    })
  })

  autoUpdater.on('error', (e) => {
    console.warn('[odyssey-companion] updater error', e)
    updateDownloadInProgress = false
    pushUpdaterState({ phase: 'error', message: String(e) })
    showOrFocusUpdateWindow()
  })

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloadInProgress = false
    const notes = stripHtmlToPlainText(releaseNotesPlain(info))
    showOrFocusUpdateWindow()
    pushUpdaterState({
      phase: 'ready',
      version: info.version,
      notes,
    })
  })

  void autoUpdater.checkForUpdates().catch((e) => {
    console.warn('[odyssey-companion] update check failed', e)
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

registerEventStreamBridge(() => {
  const wins: BrowserWindow[] = []
  if (meterWin && !meterWin.isDestroyed()) wins.push(meterWin)
  if (hudWin && !hudWin.isDestroyed()) wins.push(hudWin)
  if (timelineWin && !timelineWin.isDestroyed()) wins.push(timelineWin)
  if (isDevStreamCaptureActive() && settingsWin && !settingsWin.isDestroyed()) {
    wins.push(settingsWin)
  }
  return wins
})

registerMeterDebugReportIpc(() => meterWin, showMeterWindow)
registerMeterCombatLogIpc()

app.whenReady().then(() => {
  registerForumTeaserImageProtocol()

  app.on('browser-window-focus', scheduleHotkeysFocusRefresh)
  app.on('browser-window-blur', scheduleHotkeysFocusRefresh)

  if (METER_ONLY_STARTUP) {
    createMeterWindow()
    meterWin?.show()
    meterWin?.setSkipTaskbar(false)
  } else if (TIMERS_ONLY_STARTUP) {
    createTimersWindow()
    timersWin?.show()
    timersWin?.setSkipTaskbar(false)
  } else if (HUD_ONLY_STARTUP) {
    createHudWindow()
    hudWin?.show()
    hudWin?.setSkipTaskbar(false)
  } else if (SETTINGS_ONLY_STARTUP) {
    showSettingsWindow('general')
  } else {
    launchCompanionWindows(readOverlaySettingsFromDisk())
  }
  createTray()
  setupAutoUpdater()
  refreshServerStatusMonitor()

  setInterval(() => {
    bossTimerAlertTick(lastOverlaySettings, timersWin)
  }, BOSS_TIMER_ALERT_INTERVAL_MS)
})

/** Allow real quit (Cmd+Q, Alt+F4 chain, etc.) — without this, `close` handlers would hide instead of exiting. */
app.on('before-quit', () => {
  quitting = true
  stopDpsReader()
  if (layoutSaveTimer) {
    clearTimeout(layoutSaveTimer)
    layoutSaveTimer = null
  }
  persistWindowLayout()
})

app.on('window-all-closed', () => {
  if (quitting) {
    dungeonWin = null
    timelineWin = null
    meterWin = null
    timersWin = null
    hudWin = null
    settingsWin = null
    marketLoginWin = null
    return
  }
  // Windows are hidden to tray, not destroyed — if we ever end up with zero
  // windows without quitting, keep the app alive on Windows (tray).
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (METER_ONLY_STARTUP) {
      createMeterWindow()
      meterWin?.show()
    } else if (TIMERS_ONLY_STARTUP) {
      createTimersWindow()
      timersWin?.show()
    } else if (HUD_ONLY_STARTUP) {
      createHudWindow()
      hudWin?.show()
    } else if (SETTINGS_ONLY_STARTUP) {
      showSettingsWindow('general')
    } else {
      launchCompanionWindows(readOverlaySettingsFromDisk())
    }
  }
})

app.on('second-instance', () => {
  if (METER_ONLY_STARTUP) {
    showMeterWindow()
  } else if (TIMERS_ONLY_STARTUP) {
    showTimersWindow()
  } else if (HUD_ONLY_STARTUP) {
    showHudWindow()
  } else if (SETTINGS_ONLY_STARTUP) {
    showSettingsWindow('general')
  } else {
    showDungeonWindow()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

async function marketCookieHeader(): Promise<string> {
  const cookies = await session.defaultSession.cookies.get({
    url: 'https://thedigitalodyssey.com',
  })
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

async function fetchMarketJson(url: string): Promise<unknown> {
  wikiLog('MARKET', url)
  const cookie = await marketCookieHeader()
  const headers: Record<string, string> = { ...FETCH_HEADERS }
  if (cookie) headers.Cookie = cookie
  const res = await fetch(url, { headers })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Please login with Discord to retrieve market values')
    }
    throw new Error(`Market API returned ${res.status}`)
  }
  const type = res.headers.get('content-type') ?? ''
  if (!type.toLowerCase().includes('application/json')) {
    throw new Error('Please login with Discord to retrieve market values')
  }
  return res.json() as Promise<unknown>
}

ipcMain.handle('supabase-auth-storage:get', async (_evt, key: unknown) => {
  return supabaseAuthStorageGet(typeof key === 'string' ? key : '')
})

ipcMain.handle('supabase-auth-storage:set', async (_evt, key: unknown, value: unknown) => {
  await supabaseAuthStorageSet(typeof key === 'string' ? key : '', typeof value === 'string' ? value : '')
})

ipcMain.handle('supabase-auth-storage:remove', async (_evt, key: unknown) => {
  await supabaseAuthStorageRemove(typeof key === 'string' ? key : '')
})

ipcMain.handle('forum:fetch-teaser', async () => {
  return fetchForumTeaserLive()
})

ipcMain.handle('docs:fetch-patch-notes', async () => {
  return fetchPatchNotesCached()
})

ipcMain.handle('docs:fetch-patch-note', async (_evt, url: unknown) => {
  const safe = typeof url === 'string' ? url.trim() : ''
  if (!safe) throw new Error('Missing patch note URL')
  return fetchPatchNoteDetail(safe)
})

ipcMain.handle('shell:open-external', async (_evt, url: unknown) => {
  const safe = typeof url === 'string' ? url.trim() : ''
  if (!safe) throw new Error('Missing URL')
  let parsed: URL
  try {
    parsed = new URL(safe)
  } catch {
    throw new Error('Invalid URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are allowed')
  }
  await shell.openExternal(parsed.href)
})

ipcMain.handle('wiki:fetch-dungeons', async () => {
  markWikiApiRequest()
  wikiLog('GET', DUNGEONS_URL)
  const res = await fetch(DUNGEONS_URL, { headers: FETCH_HEADERS })
  if (!res.ok) {
    throw new Error(`Dungeons API returned ${res.status}`)
  }
  return res.json() as Promise<unknown>
})

ipcMain.handle('wiki:fetch-dungeon', async (_evt, id: string) => {
  const safe = typeof id === 'string' ? id.trim() : ''
  if (!safe) throw new Error('Missing dungeon id')
  const url = dungeonDetailUrl(safe)
  markWikiApiRequest()
  wikiLog('GET', url)
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) {
    throw new Error(`Dungeon detail returned ${res.status}`)
  }
  return res.json() as Promise<unknown>
})

ipcMain.handle('wiki:fetch-monster', async (_evt, id: string) => {
  const safe = typeof id === 'string' ? id.trim() : ''
  if (!safe) throw new Error('Missing monster id')
  const url = monsterDetailUrl(safe)
  markWikiApiRequest()
  wikiLog('GET', url)
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) {
    throw new Error(`Monster detail returned ${res.status}`)
  }
  return res.json() as Promise<unknown>
})

ipcMain.handle('wiki:fetch-digimon', async (_evt, id: string) => {
  const safe = typeof id === 'string' ? id.trim() : ''
  if (!safe) throw new Error('Missing digimon id')
  const url = digimonDetailUrl(safe)
  markWikiApiRequest()
  wikiLog('GET', url)
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) {
    throw new Error(`Digimon detail returned ${res.status}`)
  }
  return res.json() as Promise<unknown>
})

ipcMain.handle('wiki:fetch-npc', async (_evt, id: string) => {
  const safe = typeof id === 'string' ? id.trim() : ''
  if (!safe) throw new Error('Missing npc id')
  const url = npcDetailUrl(safe)
  markWikiApiRequest()
  wikiLog('GET', url)
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) {
    throw new Error(`NPC detail returned ${res.status}`)
  }
  return res.json() as Promise<unknown>
})

ipcMain.handle('wiki:fetch-item', async (_evt, id: string) => {
  const safe = typeof id === 'string' ? id.trim() : ''
  if (!safe) throw new Error('Missing item id')
  const url = wikiItemDetailUrl(safe)
  markWikiApiRequest()
  wikiLog('GET', url)
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) {
    throw new Error(`Item detail returned ${res.status}`)
  }
  return res.json() as Promise<unknown>
})

ipcMain.handle('market:open-login', () => showMarketLoginWindow())

ipcMain.handle('market:search-items', async (_evt, query: string) => {
  const safe = typeof query === 'string' ? query.trim() : ''
  if (!safe) return []
  return fetchMarketJson(marketItemsUrl(safe))
})

ipcMain.handle('market:fetch-listings', async (_evt, item: string, side: string, limit: unknown) => {
  const safeItem = typeof item === 'string' ? item.trim() : ''
  const safeSide = side === 'buy' ? 'buy' : 'sell'
  const safeLimit =
    typeof limit === 'number' && Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.round(limit)))
      : 50
  if (!safeItem) throw new Error('Missing market item id')
  return fetchMarketJson(marketListingsUrl(safeItem, safeSide, safeLimit))
})

ipcMain.handle('boss-timer:test-toast', () => {
  return tryShowBossTimerTestNotification()
})

ipcMain.handle('server-status:test-notification', () => {
  return tryShowServerStatusTestNotification(lastOverlaySettings, companionChimeWindows)
})

ipcMain.handle('server-status:get', async () => {
  const online = await fetchGameServerOnline()
  return { online }
})

ipcMain.on('boss-timer:push-schedule', (_event, payload: unknown) => {
  setActiveRaidBossAlerts(payload)
})

ipcMain.handle('hotkeys:apply', (_evt, cfg: unknown) => {
  try {
    const c = cfg as Partial<HotkeyPayload> & { hotkeysOnlyWhenCompanionFocused?: boolean }
    const normalized: HotkeyPayload = {
      toggle: typeof c.toggle === 'string' ? c.toggle : '',
      reset: typeof c.reset === 'string' ? c.reset : '',
      meterResetSession: typeof c.meterResetSession === 'string' ? c.meterResetSession : 'None',
      meterUploadParse: typeof c.meterUploadParse === 'string' ? c.meterUploadParse : 'None',
    }
    setHotkeysFromRenderer(normalized, Boolean(c.hotkeysOnlyWhenCompanionFocused))
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: String(e) }
  }
})

function windowFromSenderExact(sender: WebContents): BrowserWindow | undefined {
  const id = sender.id
  if (dungeonWin && !dungeonWin.isDestroyed() && dungeonWin.webContents.id === id) {
    return dungeonWin
  }
  if (timelineWin && !timelineWin.isDestroyed() && timelineWin.webContents.id === id) {
    return timelineWin
  }
  if (meterWin && !meterWin.isDestroyed() && meterWin.webContents.id === id) {
    return meterWin
  }
  if (timersWin && !timersWin.isDestroyed() && timersWin.webContents.id === id) {
    return timersWin
  }
  if (hudWin && !hudWin.isDestroyed() && hudWin.webContents.id === id) {
    return hudWin
  }
  if (settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents.id === id) {
    return settingsWin
  }
  if (updateWin && !updateWin.isDestroyed() && updateWin.webContents.id === id) {
    return updateWin
  }
  return browserWindowForIpc(sender)
}

ipcMain.handle('window:minimize', (e) => {
  const id = e.sender.id
  if (updateWin && !updateWin.isDestroyed() && updateWin.webContents.id === id) {
    updateWin.minimize()
    return true
  }
  if (settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents.id === id) {
    settingsWin.minimize()
    return true
  }
  return hideWindowToTray(windowFromSenderExact(e.sender))
})

ipcMain.handle('window:close', (e) => {
  const id = e.sender.id
  if (updateWin && !updateWin.isDestroyed() && updateWin.webContents.id === id) {
    updateWin.destroy()
    updateWin = null
    return true
  }
  if (settingsWin && !settingsWin.isDestroyed() && settingsWin.webContents.id === id) {
    settingsWin.destroy()
    settingsWin = null
    return true
  }
  return hideWindowToTray(windowFromSenderExact(e.sender))
})

ipcMain.handle('window:show-main', () => {
  showDungeonWindow()
  return true
})

ipcMain.handle('window:show-timeline', () => {
  showTimelineWindow()
  return true
})

ipcMain.handle('window:show-meter', () => {
  showMeterWindow()
  return true
})

ipcMain.handle('window:show-timers', () => {
  showTimersWindow()
  return true
})

ipcMain.handle('window:show-hud', () => {
  if (lastOverlaySettings?.hudLayoutLocked === true) {
    unlockHudLayoutFromTray()
  } else {
    showHudWindow()
  }
  return true
})

ipcMain.handle('window:open-settings', (_e, sectionArg: unknown) => {
  showSettingsWindow(sectionArg)
  return true
})

ipcMain.on('meter:party-themes-changed', () => {
  notifyMeterPartyThemesChanged()
})

ipcMain.on('meter:apply-options', (_e, opts: unknown) => {
  if (!opts || typeof opts !== 'object') return
  const v = (opts as { alwaysOnTop?: unknown }).alwaysOnTop
  if (typeof v === 'boolean') {
    setWinAlwaysOnTop(meterWin, v)
  }
})

ipcMain.on('timers:apply-options', (_e, opts: unknown) => {
  if (!opts || typeof opts !== 'object') return
  const v = (opts as { alwaysOnTop?: unknown }).alwaysOnTop
  if (typeof v === 'boolean') {
    setWinAlwaysOnTop(timersWin, v)
  }
})

ipcMain.on('hud:apply-options', (_e, opts: unknown) => {
  if (!opts || typeof opts !== 'object') return
  const v = (opts as { alwaysOnTop?: unknown }).alwaysOnTop
  if (typeof v === 'boolean') {
    setWinAlwaysOnTop(hudWin, v)
  }
})

ipcMain.handle(
  'timers:set-loot-detail-expanded',
  (_evt, expanded: unknown, contentHeightPx: unknown) => {
    if (!timersWin || timersWin.isDestroyed()) {
      return { ok: false as const, error: 'No timers window' }
    }
    if (expanded === true) {
      if (!timersLootDetailSavedBounds) {
        timersLootDetailSavedBounds = timersWin.getBounds()
      }
      if (typeof contentHeightPx === 'number' && Number.isFinite(contentHeightPx) && contentHeightPx > 0) {
        const [, ch] = timersWin.getContentSize()
        const target = Math.ceil(contentHeightPx)
        if (target > ch) {
          const b = timersWin.getBounds()
          const wa = screen.getDisplayMatching(b).workArea
          const maxOuterH = Math.max(1, wa.y + wa.height - b.y - 12)
          const dh = target - ch
          const newH = Math.min(b.height + dh, maxOuterH)
          if (newH > b.height) {
            timersWin.setBounds({ ...b, height: newH })
          }
        }
      }
      return { ok: true as const }
    }
    if (expanded === false) {
      if (timersLootDetailSavedBounds) {
        timersWin.setBounds(timersLootDetailSavedBounds)
        timersLootDetailSavedBounds = null
      }
      return { ok: true as const }
    }
    return { ok: false as const, error: 'Invalid expanded flag' }
  },
)

ipcMain.handle(
  'meter:start-reader',
  (): { ok: boolean; error?: string } => startDpsReader(),
)

ipcMain.handle('meter:stop-reader', () => {
  stopDpsReader()
  return true
})

ipcMain.handle('meter:reset-session', () => {
  sendDpsReaderReset()
  return true
})

ipcMain.handle('meter:reader-stdin', (_e, line: unknown) => {
  if (typeof line !== 'string' || !line.trim()) return false
  if (!dpsReaderProc?.stdin || dpsReaderProc.killed) return false
  try {
    const out = line.endsWith('\n') ? line : `${line}\n`
    dpsReaderProc.stdin.write(out)
    return true
  } catch {
    return false
  }
})

ipcMain.on('timeline:set-ignore-mouse-events', (_e, ignore: unknown) => {
  if (!timelineWin || timelineWin.isDestroyed()) return
  if (ignore === true) {
    timelineWin.setIgnoreMouseEvents(true, { forward: true })
  } else {
    timelineWin.setIgnoreMouseEvents(false)
  }
})

ipcMain.on('meter:set-ignore-mouse-events', (_e, ignore: unknown) => {
  if (!meterWin || meterWin.isDestroyed()) return
  if (ignore === true) {
    meterWin.setIgnoreMouseEvents(true, { forward: true })
  } else {
    meterWin.setIgnoreMouseEvents(false)
  }
})

ipcMain.on('timers:set-ignore-mouse-events', (_e, ignore: unknown) => {
  if (!timersWin || timersWin.isDestroyed()) return
  if (ignore === true) {
    timersWin.setIgnoreMouseEvents(true, { forward: true })
  } else {
    timersWin.setIgnoreMouseEvents(false)
  }
})

ipcMain.on('hud:set-ignore-mouse-events', (_e, ignore: unknown) => {
  if (!hudWin || hudWin.isDestroyed()) return
  if (hudResizeSession) return
  if (ignore === true) {
    hudWin.setIgnoreMouseEvents(true, { forward: true })
  } else {
    hudWin.setIgnoreMouseEvents(false)
  }
})

function hudWindowFromSender(sender: WebContents): BrowserWindow | null {
  if (!hudWin || hudWin.isDestroyed()) return null
  return sender.id === hudWin.webContents.id ? hudWin : null
}

ipcMain.handle('hud:begin-window-resize', (e, edgeRaw: unknown) => {
  const win = hudWindowFromSender(e.sender)
  if (!win) return { ok: false as const, error: 'no hud window' }
  const edge = parseHudResizeEdge(edgeRaw)
  if (!edge) return { ok: false as const, error: 'bad edge' }
  win.setIgnoreMouseEvents(false)
  hudResizeSession = {
    edge,
    startBounds: win.getBounds(),
    startCursor: screen.getCursorScreenPoint(),
  }
  return { ok: true as const }
})

ipcMain.handle('hud:update-window-resize', (e, screenX: unknown, screenY: unknown) => {
  const win = hudWindowFromSender(e.sender)
  if (!win || !hudResizeSession) return { ok: false as const }
  const sx = Number(screenX)
  const sy = Number(screenY)
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return { ok: false as const }
  const dx = sx - hudResizeSession.startCursor.x
  const dy = sy - hudResizeSession.startCursor.y
  win.setBounds(
    boundsAfterHudResize(
      hudResizeSession.startBounds,
      hudResizeSession.edge,
      dx,
      dy,
      DEFAULT_HUD_SIZE.minWidth,
      DEFAULT_HUD_SIZE.minHeight,
    ),
  )
  return { ok: true as const }
})

ipcMain.handle('hud:end-window-resize', (e) => {
  if (!hudWindowFromSender(e.sender)) return { ok: false as const }
  hudResizeSession = null
  return { ok: true as const }
})

ipcMain.on('timeline:apply-options', (_e, opts: TimelineOptionsPayload) => {
  setWinAlwaysOnTop(timelineWin, !!opts.alwaysOnTop)
})

ipcMain.handle('overlay:get-game-focused', () => ({
  gameFocused: companionGameFocused(),
}))

ipcMain.on('overlay:push-settings', (event, payload: unknown) => {
  const prevOpaque = lastOverlaySettings?.overlayOpaqueWindows ?? false
  const prevPerformance = lastOverlaySettings?.overlayPerformanceMode ?? false
  if (isOverlaySettings(payload)) {
    lastOverlaySettings = payload
    writeOverlaySettingsToDisk(payload)
    refreshServerStatusMonitor()
  }
  if (payload && typeof payload === 'object' && 'timelineAlwaysOnTop' in payload) {
    const v = (payload as { timelineAlwaysOnTop: unknown }).timelineAlwaysOnTop
    if (typeof v === 'boolean') {
      setWinAlwaysOnTop(timelineWin, v)
    }
  }
  if (payload && typeof payload === 'object' && 'meterAlwaysOnTop' in payload) {
    const v = (payload as { meterAlwaysOnTop: unknown }).meterAlwaysOnTop
    if (typeof v === 'boolean') {
      setWinAlwaysOnTop(meterWin, v)
    }
  }
  if (payload && typeof payload === 'object' && 'timersAlwaysOnTop' in payload) {
    const v = (payload as { timersAlwaysOnTop: unknown }).timersAlwaysOnTop
    if (typeof v === 'boolean') {
      setWinAlwaysOnTop(timersWin, v)
    }
  }
  if (payload && typeof payload === 'object' && 'hudAlwaysOnTop' in payload) {
    const v = (payload as { hudAlwaysOnTop: unknown }).hudAlwaysOnTop
    if (typeof v === 'boolean') {
      setWinAlwaysOnTop(hudWin, v)
    }
  }
  if (payload && typeof payload === 'object' && 'hudLayoutLocked' in payload) {
    refreshTrayMenu()
  }
  const nextOpaque = lastOverlaySettings?.overlayOpaqueWindows ?? false
  const nextPerformance = lastOverlaySettings?.overlayPerformanceMode ?? false
  if (prevOpaque !== nextOpaque) {
    recreateOverlayWindowsForOpaqueToggle()
  }
  if (prevPerformance !== nextPerformance) {
    syncAllOverlayBackgroundThrottling()
    broadcastGameFocusState(true)
  }
  // Never echo `settings:patch` back to the sender — causes an infinite loop in renderers
  // (useEffect → pushSettings → patch → setSettings → useEffect …) and freezes the UI.
  const senderId = event.sender.id
  if (
    dungeonWin &&
    !dungeonWin.isDestroyed() &&
    dungeonWin.webContents.id !== senderId
  ) {
    dungeonWin.webContents.send('settings:patch', payload)
  }
  if (
    timelineWin &&
    !timelineWin.isDestroyed() &&
    timelineWin.webContents.id !== senderId
  ) {
    timelineWin.webContents.send('settings:patch', payload)
  }
  if (
    meterWin &&
    !meterWin.isDestroyed() &&
    meterWin.webContents.id !== senderId
  ) {
    meterWin.webContents.send('settings:patch', payload)
  }
  if (
    timersWin &&
    !timersWin.isDestroyed() &&
    timersWin.webContents.id !== senderId
  ) {
    timersWin.webContents.send('settings:patch', payload)
  }
  if (
    hudWin &&
    !hudWin.isDestroyed() &&
    hudWin.webContents.id !== senderId
  ) {
    hudWin.webContents.send('settings:patch', payload)
  }
  if (
    settingsWin &&
    !settingsWin.isDestroyed() &&
    settingsWin.webContents.id !== senderId
  ) {
    settingsWin.webContents.send('settings:patch', payload)
  }
})

type TimelineActionMessage =
  | 'toggle'
  | 'reset'
  | 'start'
  | 'stop'
  | { action: 'toggle' | 'reset' | 'start' | 'stop'; offsetMs?: number }

function sendTimelineActionToWindow(
  action: 'toggle' | 'reset' | 'start' | 'stop',
  opts?: { offsetMs?: number },
): boolean {
  if (!timelineWin?.webContents || timelineWin.isDestroyed()) return false
  const payload: TimelineActionMessage =
    action === 'start' && opts?.offsetMs != null && opts.offsetMs > 0
      ? { action: 'start', offsetMs: Math.round(opts.offsetMs) }
      : action
  timelineWin.webContents.send('timeline-action', payload)
  return true
}

ipcMain.handle(
  'timeline:load-fight',
  (_e, payload: unknown, opts?: { silent?: boolean }) => {
    lastFightPayload = payload
    if (!timelineWin?.webContents || timelineWin.isDestroyed()) return false
    timelineWin.webContents.send('fight:loaded', payload)
    if (opts?.silent) {
      setWinAlwaysOnTop(timelineWin, true)
      return true
    }
    timelineWin.show()
    timelineWin.setSkipTaskbar(false)
    if (timelineWin.isMinimized()) timelineWin.restore()
    timelineWin.moveTop()
    timelineWin.focus()
    setWinAlwaysOnTop(timelineWin, true)
    return true
  },
)

ipcMain.handle('timeline:clear-fight', () => {
  lastFightPayload = null
  if (!timelineWin?.webContents || timelineWin.isDestroyed()) return false
  timelineWin.webContents.send('fight:loaded', null)
  return true
})

ipcMain.handle(
  'timeline:send-action',
  (_e, action: unknown, opts?: { offsetMs?: number }) => {
    const a = String(action ?? '')
    if (a !== 'toggle' && a !== 'reset' && a !== 'start' && a !== 'stop') return false
    return sendTimelineActionToWindow(a, opts)
  },
)

ipcMain.handle('fight-engage:set', (_e, payload: unknown) => {
  if (!payload || typeof payload !== 'object') return false
  const p = payload as { dungeonKey?: string; engagedAtMs?: number }
  const dungeonKey = String(p.dungeonKey ?? '').trim()
  const engagedAtMs = Number(p.engagedAtMs)
  if (!dungeonKey || !Number.isFinite(engagedAtMs) || engagedAtMs <= 0) return false
  setFightEngageEpoch({ dungeonKey, engagedAtMs })
  return true
})

ipcMain.handle('fight-engage:get', () => getFightEngageEpoch())

ipcMain.handle('fight-engage:clear', () => {
  clearFightEngageEpoch()
  return true
})

ipcMain.handle('timeline:get-last-fight', () => lastFightPayload ?? null)

/** Call after timeline registers `fight:loaded` — replays payload if main sent it earlier (IPC race). */
ipcMain.handle('timeline:renderer-ready', () => {
  if (
    lastFightPayload != null &&
    timelineWin?.webContents &&
    !timelineWin.isDestroyed()
  ) {
    timelineWin.webContents.send('fight:loaded', lastFightPayload)
  }
  return true
})

const GITHUB_RELEASES_LATEST =
  'https://api.github.com/repos/MistGG/Odyssey-Companion/releases/latest'

function semverParts(v: string): number[] {
  const core = v.replace(/^v/i, '').split(/[-+]/)[0] ?? ''
  return core.split('.').map((x) => parseInt(x.replace(/\D/g, ''), 10) || 0)
}

/** Positive if a > b */
function compareSemver(a: string, b: string): number {
  const pa = semverParts(a)
  const pb = semverParts(b)
  const n = Math.max(pa.length, pb.length)
  for (let i = 0; i < n; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

function pickWindowsSetupUrl(
  assets: ReadonlyArray<{ name: string; browser_download_url: string }>,
): string | null {
  const lower = (s: string) => s.toLowerCase()
  const setup = assets.find(
    (x) => lower(x.name).endsWith('.exe') && lower(x.name).includes('setup'),
  )
  if (setup) return setup.browser_download_url
  const anyExe = assets.find((x) => lower(x.name).endsWith('.exe'))
  return anyExe?.browser_download_url ?? null
}

ipcMain.handle('app:get-version', () => ({
  version: app.getVersion(),
  isPackaged: app.isPackaged,
}))

ipcMain.handle(
  'updater:check-for-updates',
  async (): Promise<
    | {
        ok: true
        currentVersion: string
        latestVersion: string
        latestTag: string
        updateAvailable: boolean
        setupDownloadUrl: string | null
        releasePageUrl: string
      }
    | { ok: false; error: string }
  > => {
    try {
      const res = await fetch(GITHUB_RELEASES_LATEST, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Odyssey-Companion',
        },
      })
      if (!res.ok) {
        return { ok: false, error: `GitHub returned ${res.status}` }
      }
      const j = (await res.json()) as {
        tag_name?: string
        html_url?: string
        assets?: Array<{ name: string; browser_download_url: string }>
      }
      const tag = j.tag_name ?? 'v0.0.0'
      const latestVersion = tag.replace(/^v/i, '')
      const currentVersion = app.getVersion()
      const releasePageUrl =
        j.html_url ?? 'https://github.com/MistGG/Odyssey-Companion/releases/latest'
      const setupDownloadUrl = pickWindowsSetupUrl(j.assets ?? [])
      const updateAvailable = compareSemver(latestVersion, currentVersion) > 0

      return {
        ok: true,
        currentVersion,
        latestVersion,
        latestTag: tag,
        updateAvailable,
        setupDownloadUrl,
        releasePageUrl,
      }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  },
)

ipcMain.handle(
  'updater:download-update',
  async (
    _e,
    setupUrl: unknown,
  ): Promise<
    | { ok: true; mode: 'auto-updater' | 'browser' | 'browser-fallback' }
    | { ok: false; error: string }
  > => {
    const url = typeof setupUrl === 'string' ? setupUrl.trim() : ''
    if (!url) return { ok: false, error: 'Missing installer URL' }

    if (app.isPackaged) {
      try {
        updateDownloadInProgress = true
        showOrFocusUpdateWindow()
        pushUpdaterState({ phase: 'downloading', percent: 0 })
        const check = await autoUpdater.checkForUpdates()
        if (check?.isUpdateAvailable) {
          await autoUpdater.downloadUpdate()
          return { ok: true, mode: 'auto-updater' }
        }
        updateDownloadInProgress = false
        pushUpdaterState({
          phase: 'error',
          message:
            'The auto-updater did not report a new build. Opening the installer page in your browser instead.',
        })
      } catch (e) {
        updateDownloadInProgress = false
        const msg = String(e)
        console.warn('[odyssey-companion] autoUpdater download path failed', e)
        pushUpdaterState({ phase: 'error', message: msg })
      }
      await shell.openExternal(url)
      return { ok: true, mode: 'browser-fallback' }
    }

    await shell.openExternal(url)
    return { ok: true, mode: 'browser' }
  },
)

ipcMain.handle('updater:get-ui-state', () => lastUpdaterState)

ipcMain.handle(
  'updater:confirm-download',
  async (): Promise<{ ok: true } | { ok: false; error: string }> => {
    if (!app.isPackaged) {
      return { ok: false, error: 'Updates apply to installed builds only.' }
    }
    if (updateDownloadInProgress) {
      return { ok: false, error: 'Download already in progress.' }
    }
    updateDownloadInProgress = true
    showOrFocusUpdateWindow()
    pushUpdaterState({ phase: 'downloading', percent: 0 })
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (e) {
      updateDownloadInProgress = false
      const msg = String(e)
      pushUpdaterState({ phase: 'error', message: msg })
      return { ok: false, error: msg }
    }
  },
)

ipcMain.handle('updater:quit-and-install', () => {
  if (!app.isPackaged) return false
  setImmediate(() => autoUpdater.quitAndInstall(false, true))
  return true
})

ipcMain.handle('updater:dismiss-update-window', () => {
  if (updateWin && !updateWin.isDestroyed()) {
    updateWin.close()
  }
  return true
})

ipcMain.handle(
  'updater:latest-release-notes',
  async (): Promise<
    | { ok: true; tag: string; publishedAt: string; body: string; url: string }
    | { ok: false; error: string }
  > => {
    try {
      const res = await fetch(GITHUB_RELEASES_LATEST, {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Odyssey-Companion',
        },
      })
      if (!res.ok) {
        return { ok: false, error: `GitHub returned ${res.status}` }
      }
      const j = (await res.json()) as {
        tag_name?: string
        body?: string | null
        published_at?: string
        html_url?: string
      }
      const rawBody = typeof j.body === 'string' ? j.body : ''
      return {
        ok: true,
        tag: j.tag_name ?? '?',
        publishedAt: j.published_at ?? '',
        body: stripHtmlToPlainText(rawBody),
        url: j.html_url ?? 'https://github.com/MistGG/Odyssey-Companion/releases',
      }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  },
)

