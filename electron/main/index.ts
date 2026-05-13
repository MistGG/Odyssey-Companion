import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  shell,
  type MenuItemConstructorOptions,
} from 'electron'
import type { WebContents } from 'electron'
import electronUpdater from 'electron-updater'

/** CJS package — use default import; named `autoUpdater` breaks in packaged ESM main. */
const { autoUpdater } = electronUpdater
import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { stripHtmlToPlainText } from '../../src/lib/releaseNotesText'

/** Set `ODYSSEY_START_PANEL=meter` or `packetlab` to launch only that window (UI dev). */
const METER_ONLY_STARTUP = process.env.ODYSSEY_START_PANEL === 'meter'
/** Packet capture lab is dev-only — never shipped in packaged installs. */
const PACKET_LAB_ENABLED = !app.isPackaged
const PACKETLAB_ONLY_STARTUP =
  PACKET_LAB_ENABLED && process.env.ODYSSEY_START_PANEL === 'packetlab'

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
/** Dedicated always-on-top update UI (avoids native dialogs hidden under overlays). */
let updateWin: BrowserWindow | null = null
/** Dev / RE: guided Npcap capture (7030) — not the DPS meter. */
let packetLabWin: BrowserWindow | null = null
let packetLabProc: ChildProcess | null = null
let packetLabStdoutBuf = ''
let packetLabStderrBuf = ''
let packetLabJsonlStream: fs.WriteStream | null = null
let packetLabStderrStream: fs.WriteStream | null = null
/** Last capture output directory (Documents\\OdysseyCaptures\\…). */
let packetLabOutDir: string | null = null
let lastUpdaterState: Record<string, unknown> | null = null
let updateDownloadInProgress = false
let dpsReaderProc: ChildProcess | null = null
let dpsReaderStdoutBuf = ''
let tray: Tray | null = null
/** When false, the close handler hides to tray instead of destroying the window. */
let quitting = false

/**
 * Drop your logo here (PNG with transparency recommended): `resources/app-icon.png`
 * at the repo root (next to `package.json`). Used for tray + window/taskbar icons.
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

type WindowLayoutFile = {
  dungeon?: Electron.Rectangle
  timeline?: Electron.Rectangle
  meter?: Electron.Rectangle
}

const DEFAULT_DUNGEON_SIZE = {
  width: 1120,
  height: 740,
  minWidth: 820,
  minHeight: 580,
} as const

const DEFAULT_TIMELINE_SIZE = {
  width: 820,
  height: 440,
  minWidth: 380,
  minHeight: 180,
} as const

const DEFAULT_METER_SIZE = {
  width: 340,
  height: 220,
  minWidth: 260,
  minHeight: 160,
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

type HotkeyPayload = {
  toggle: string
  reset: string
  meterReconnect: string
  meterResetSession: string
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

function updateLoadUrl() {
  if (!VITE_DEV_SERVER_URL) return
  const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
  return `${base}/?panel=update`
}

function packetLabLoadUrl() {
  if (!VITE_DEV_SERVER_URL) return
  const base = VITE_DEV_SERVER_URL.replace(/\/$/, '')
  return `${base}/?panel=packetlab`
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
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: false,
    },
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

function createDungeonWindow() {
  const layout = readWindowLayout()
  const b = normalizeDungeonBounds(layout.dungeon)
  dungeonWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — Dungeons',
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
      preload,
      contextIsolation: true,
      sandbox: false,
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
    ...(os.platform() === 'win32' ? { roundedCorners: false as const } : {}),
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: false,
    },
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
}

function createMeterWindow() {
  const layout = readWindowLayout()
  const b = normalizeMeterBounds(layout.meter)
  meterWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — DPS meter',
    ...(b ?? {
      width: DEFAULT_METER_SIZE.width,
      height: DEFAULT_METER_SIZE.height,
    }),
    minWidth: DEFAULT_METER_SIZE.minWidth,
    minHeight: DEFAULT_METER_SIZE.minHeight,
    ...(os.platform() === 'win32' ? { roundedCorners: false as const } : {}),
    backgroundColor: '#00000000',
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: false,
    },
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
}

function createPacketLabWindow() {
  if (!PACKET_LAB_ENABLED) return
  packetLabWin = new BrowserWindow({
    icon: getWindowIcon(),
    title: 'Odyssey Companion — Packet lab',
    width: 520,
    height: 720,
    minWidth: 440,
    minHeight: 560,
    backgroundColor: '#070a12',
    transparent: false,
    frame: false,
    alwaysOnTop: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: false,
    },
  })
  const url = packetLabLoadUrl()
  if (url) {
    void packetLabWin.loadURL(url)
  } else {
    void packetLabWin.loadFile(indexHtml, { query: { panel: 'packetlab' } })
  }
  packetLabWin.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  packetLabWin.on('close', () => {
    if (!quitting) {
      stopPacketLabCapture()
    }
  })
  wireHideInsteadOfClose(packetLabWin)
  packetLabWin.on('closed', () => {
    packetLabWin = null
  })
}

function showPacketLabWindow() {
  if (!PACKET_LAB_ENABLED) return
  if (!packetLabWin || packetLabWin.isDestroyed()) {
    createPacketLabWindow()
  }
  if (!packetLabWin || packetLabWin.isDestroyed()) return
  const w = packetLabWin
  w.show()
  w.setSkipTaskbar(false)
  if (w.isMinimized()) w.restore()
  w.focus()
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

/** Packet capture stays CLI-only (`scripts/odyssey_packet_sniffer.py`) until opcode clustering is ready for the meter. */
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

function packetSnifferScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'odyssey_packet_sniffer.py')
  }
  return path.join(process.env.APP_ROOT ?? '', 'scripts', 'odyssey_packet_sniffer.py')
}

function sanitizePacketLabSessionName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.trim() : ''
  const cleaned = s.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48)
  return cleaned.length > 0 ? cleaned : 'session'
}

function summarizePacketlabLogLine(line: string): string {
  const t = line.trim()
  if (!t) return ''
  if (t.length <= 220) return t
  try {
    const o = JSON.parse(t) as {
      type?: string
      dir?: string
      total_len?: number
      opcode_u16_le?: number | null
      t_rel_s?: number
    }
    if (o.type === 'packet_frame') {
      return `[${o.dir ?? '?'}] tl=${o.total_len ?? '?'} op=${o.opcode_u16_le ?? '—'} t=${o.t_rel_s ?? '?'}`
    }
    if (o.type === 'opcode_cluster_tick' || o.type === 'opcode_cluster_summary') {
      return `[${o.type}] t=${o.t_rel_s ?? '?'} …`
    }
  } catch {
    /* ignore */
  }
  return `${t.slice(0, 200)}…`
}

function broadcastPacketLabLog(stream: 'stdout' | 'stderr', rawLine: string) {
  const text = summarizePacketlabLogLine(rawLine)
  if (!text) return
  if (packetLabWin && !packetLabWin.isDestroyed()) {
    packetLabWin.webContents.send('packetlab:log', { stream, text })
  }
}

function broadcastPacketLabStatus(payload: {
  state: 'running' | 'idle' | 'error'
  outDir?: string
  message?: string
}) {
  if (packetLabWin && !packetLabWin.isDestroyed()) {
    packetLabWin.webContents.send('packetlab:status', payload)
  }
}

function closePacketLabFileStreams() {
  for (const st of [packetLabJsonlStream, packetLabStderrStream]) {
    if (st) {
      try {
        st.end()
      } catch {
        /* ignore */
      }
    }
  }
  packetLabJsonlStream = null
  packetLabStderrStream = null
}

function stopPacketLabCapture() {
  if (packetLabProc && !packetLabProc.killed) {
    try {
      packetLabProc.kill()
    } catch {
      /* ignore */
    }
  }
  packetLabProc = null
  packetLabStdoutBuf = ''
  packetLabStderrBuf = ''
  closePacketLabFileStreams()
  broadcastPacketLabStatus({ state: 'idle', outDir: packetLabOutDir ?? undefined })
}

function startPacketLabCapture(opts: {
  sessionName?: unknown
  iface?: unknown
}): { ok: boolean; error?: string; outDir?: string } {
  if (!PACKET_LAB_ENABLED) {
    return { ok: false, error: 'Packet capture lab is only available in development builds.' }
  }
  stopPacketLabCapture()
  const scriptPath = packetSnifferScriptPath()
  if (!fs.existsSync(scriptPath)) {
    return { ok: false, error: `Sniffer script not found: ${scriptPath}` }
  }
  const session = sanitizePacketLabSessionName(opts.sessionName)
  const iface =
    typeof opts.iface === 'string' && opts.iface.trim() ? opts.iface.trim() : 'Ethernet'
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const outDir = path.join(app.getPath('documents'), 'OdysseyCaptures', `${session}_${stamp}`)
  try {
    fs.mkdirSync(outDir, { recursive: true })
  } catch (e) {
    return { ok: false, error: `Could not create output folder: ${e}` }
  }
  const summaryJson = path.join(outDir, 'run.json')
  const jsonlPath = path.join(outDir, 'run.jsonl')
  const stderrPath = path.join(outDir, 'run.stderr.txt')

  const { exe: py, cwd: pyCwd } = resolvePythonForDps()
  let proc: ChildProcess
  try {
    proc = spawn(
      py,
      ['-u', scriptPath, '--iface', iface, '--jsonl', '--cluster-summary-json', summaryJson],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        ...(pyCwd ? { cwd: pyCwd } : {}),
      },
    )
  } catch (e) {
    return { ok: false, error: String(e) }
  }

  let jsonlStream: fs.WriteStream
  let stderrStream: fs.WriteStream
  try {
    jsonlStream = fs.createWriteStream(jsonlPath, { flags: 'w' })
    stderrStream = fs.createWriteStream(stderrPath, { flags: 'w' })
  } catch (e) {
    try {
      proc.kill()
    } catch {
      /* ignore */
    }
    return { ok: false, error: `Could not open output files: ${e}` }
  }

  packetLabProc = proc
  packetLabOutDir = outDir
  packetLabJsonlStream = jsonlStream
  packetLabStderrStream = stderrStream
  packetLabStdoutBuf = ''
  packetLabStderrBuf = ''

  proc.stdout?.on('data', (chunk: Buffer) => {
    packetLabStdoutBuf += chunk.toString('utf8')
    let nl: number
    while ((nl = packetLabStdoutBuf.indexOf('\n')) >= 0) {
      const line = packetLabStdoutBuf.slice(0, nl)
      packetLabStdoutBuf = packetLabStdoutBuf.slice(nl + 1)
      try {
        packetLabJsonlStream?.write(`${line}\n`)
      } catch {
        /* ignore */
      }
      broadcastPacketLabLog('stdout', line)
    }
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    packetLabStderrBuf += chunk.toString('utf8')
    let nl: number
    while ((nl = packetLabStderrBuf.indexOf('\n')) >= 0) {
      const line = packetLabStderrBuf.slice(0, nl)
      packetLabStderrBuf = packetLabStderrBuf.slice(nl + 1)
      try {
        packetLabStderrStream?.write(`${line}\n`)
      } catch {
        /* ignore */
      }
      broadcastPacketLabLog('stderr', line)
    }
  })
  proc.on('error', (err) => {
    broadcastPacketLabLog('stderr', String(err))
    broadcastPacketLabStatus({ state: 'error', message: String(err), outDir })
    packetLabProc = null
    packetLabStdoutBuf = ''
    packetLabStderrBuf = ''
    closePacketLabFileStreams()
    broadcastPacketLabStatus({ state: 'idle', outDir })
  })
  proc.once('exit', () => {
    packetLabProc = null
    packetLabStdoutBuf = ''
    packetLabStderrBuf = ''
    closePacketLabFileStreams()
    broadcastPacketLabStatus({ state: 'idle', outDir })
  })

  broadcastPacketLabStatus({ state: 'running', outDir })
  return { ok: true, outDir }
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
  stopPacketLabCapture()
  tray?.destroy()
  tray = null
  if (dungeonWin && !dungeonWin.isDestroyed()) dungeonWin.destroy()
  if (timelineWin && !timelineWin.isDestroyed()) timelineWin.destroy()
  if (meterWin && !meterWin.isDestroyed()) meterWin.destroy()
  if (updateWin && !updateWin.isDestroyed()) updateWin.destroy()
  if (packetLabWin && !packetLabWin.isDestroyed()) packetLabWin.destroy()
  dungeonWin = null
  timelineWin = null
  meterWin = null
  updateWin = null
  packetLabWin = null
  app.quit()
}

function createTray() {
  if (tray) return
  tray = new Tray(getTrayIcon())
  tray.setToolTip('Odyssey Companion')
  const menuTemplate: MenuItemConstructorOptions[] = [
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
  ]
  if (PACKET_LAB_ENABLED) {
    menuTemplate.push({
      label: 'Packet capture lab',
      click: () => showPacketLabWindow(),
    })
  }
  menuTemplate.push({ type: 'separator' }, {
    label: 'Quit',
    click: () => quitFromTray(),
  })
  const menu = Menu.buildFromTemplate(menuTemplate)
  tray.setContextMenu(menu)
  tray.on('click', () => {
    showDungeonWindow()
  })
}

function triggerMeterReconnectFromHotkey() {
  stopDpsReader()
  startDpsReader()
}

function triggerMeterResetFromHotkey() {
  sendDpsReaderReset()
  if (meterWin && !meterWin.isDestroyed()) {
    meterWin.webContents.send('meter:clear-session-ui')
  }
}

function registerHotkeys(cfg: HotkeyPayload) {
  globalShortcut.unregisterAll()
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
    { acc: cfg.meterReconnect.trim(), label: 'meterReconnect', fn: triggerMeterReconnectFromHotkey },
    { acc: cfg.meterResetSession.trim(), label: 'meterResetSession', fn: triggerMeterResetFromHotkey },
  ]
  for (const { acc, label, fn } of meterEntries) {
    if (!acc || acc.toLowerCase() === 'none') continue
    const ok = globalShortcut.register(acc, fn)
    if (!ok) {
      console.warn(`[odyssey-companion] Could not register global shortcut: ${acc} (${label})`)
    }
  }
}

function createWindows() {
  createDungeonWindow()
  createTimelineWindow()
}

function releaseNotesPlain(info: {
  releaseNotes?: string | Array<{ note?: string }> | null
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

app.whenReady().then(() => {
  if (PACKETLAB_ONLY_STARTUP) {
    createPacketLabWindow()
    packetLabWin?.show()
    packetLabWin?.setSkipTaskbar(false)
  } else if (METER_ONLY_STARTUP) {
    createMeterWindow()
    meterWin?.show()
    meterWin?.setSkipTaskbar(false)
  } else {
    createWindows()
    showDungeonWindow()
  }
  createTray()
  setupAutoUpdater()
})

/** Allow real quit (Cmd+Q, Alt+F4 chain, etc.) — without this, `close` handlers would hide instead of exiting. */
app.on('before-quit', () => {
  quitting = true
  stopDpsReader()
  stopPacketLabCapture()
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
    return
  }
  // Windows are hidden to tray, not destroyed — if we ever end up with zero
  // windows without quitting, keep the app alive on Windows (tray).
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    if (PACKETLAB_ONLY_STARTUP) {
      createPacketLabWindow()
      packetLabWin?.show()
    } else if (METER_ONLY_STARTUP) {
      createMeterWindow()
      meterWin?.show()
    } else {
      createWindows()
      showDungeonWindow()
    }
  }
})

app.on('second-instance', () => {
  if (PACKETLAB_ONLY_STARTUP) {
    showPacketLabWindow()
  } else if (METER_ONLY_STARTUP) {
    showMeterWindow()
  } else {
    showDungeonWindow()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

ipcMain.handle('wiki:fetch-dungeons', async () => {
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
  wikiLog('GET', url)
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) {
    throw new Error(`Monster detail returned ${res.status}`)
  }
  return res.json() as Promise<unknown>
})

ipcMain.handle('hotkeys:apply', (_evt, cfg: HotkeyPayload) => {
  try {
    registerHotkeys(cfg)
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
  if (updateWin && !updateWin.isDestroyed() && updateWin.webContents.id === id) {
    return updateWin
  }
  if (packetLabWin && !packetLabWin.isDestroyed() && packetLabWin.webContents.id === id) {
    return packetLabWin
  }
  return browserWindowForIpc(sender)
}

ipcMain.handle('window:minimize', (e) => {
  const id = e.sender.id
  if (updateWin && !updateWin.isDestroyed() && updateWin.webContents.id === id) {
    updateWin.minimize()
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

ipcMain.handle('window:show-packetlab', () => {
  if (!PACKET_LAB_ENABLED) return false
  showPacketLabWindow()
  return true
})

ipcMain.handle('packetlab:start', (_e, opts: unknown) => {
  if (!PACKET_LAB_ENABLED) {
    return { ok: false as const, error: 'Packet capture lab is only available in development builds.' }
  }
  if (!opts || typeof opts !== 'object') {
    return startPacketLabCapture({})
  }
  const o = opts as { sessionName?: unknown; iface?: unknown }
  return startPacketLabCapture({ sessionName: o.sessionName, iface: o.iface })
})

ipcMain.handle('packetlab:stop', () => {
  if (!PACKET_LAB_ENABLED) return { ok: true as const }
  stopPacketLabCapture()
  return { ok: true as const }
})

ipcMain.handle('packetlab:open-output-folder', () => {
  if (!PACKET_LAB_ENABLED) {
    return { ok: false as const, error: 'Packet capture lab is only available in development builds.' }
  }
  if (!packetLabOutDir || !fs.existsSync(packetLabOutDir)) {
    return { ok: false as const, error: 'No capture folder yet. Start a session first.' }
  }
  void shell.openPath(packetLabOutDir)
  return { ok: true as const }
})

ipcMain.on('meter:apply-options', (_e, opts: unknown) => {
  if (!opts || typeof opts !== 'object') return
  const v = (opts as { alwaysOnTop?: unknown }).alwaysOnTop
  if (typeof v === 'boolean') {
    setWinAlwaysOnTop(meterWin, v)
  }
})

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

ipcMain.on('timeline:apply-options', (_e, opts: TimelineOptionsPayload) => {
  setWinAlwaysOnTop(timelineWin, !!opts.alwaysOnTop)
})

ipcMain.on('overlay:push-settings', (event, payload: unknown) => {
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
  // Never echo `settings:patch` back to the sender — causes an infinite loop in DungeonApp
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
})

ipcMain.handle('timeline:load-fight', (_e, payload: unknown) => {
  lastFightPayload = payload
  if (!timelineWin?.webContents || timelineWin.isDestroyed()) return false
  timelineWin.webContents.send('fight:loaded', payload)
  timelineWin.show()
  timelineWin.setSkipTaskbar(false)
  timelineWin.moveTop()
  timelineWin.focus()
  setWinAlwaysOnTop(timelineWin, true)
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
