import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  shell,
} from 'electron'
import type { WebContents } from 'electron'
import electronUpdater from 'electron-updater'

/** CJS package — use default import; named `autoUpdater` breaks in packaged ESM main. */
const { autoUpdater } = electronUpdater
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { stripHtmlToPlainText } from '../../src/lib/releaseNotesText'

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

let layoutSaveTimer: ReturnType<typeof setTimeout> | null = null

function persistWindowLayout(): void {
  const layout = readWindowLayout()
  if (dungeonWin && !dungeonWin.isDestroyed()) {
    layout.dungeon = dungeonWin.getBounds()
  }
  if (timelineWin && !timelineWin.isDestroyed()) {
    layout.timeline = timelineWin.getBounds()
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
    ...(b ?? {
      width: DEFAULT_TIMELINE_SIZE.width,
      height: DEFAULT_TIMELINE_SIZE.height,
    }),
    minWidth: DEFAULT_TIMELINE_SIZE.minWidth,
    minHeight: DEFAULT_TIMELINE_SIZE.minHeight,
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

function hideWindowToTray(win: BrowserWindow | null | undefined) {
  if (!win || win.isDestroyed()) return false
  win.hide()
  win.setSkipTaskbar(true)
  return true
}

function quitFromTray() {
  quitting = true
  globalShortcut.unregisterAll()
  tray?.destroy()
  tray = null
  if (dungeonWin && !dungeonWin.isDestroyed()) dungeonWin.destroy()
  if (timelineWin && !timelineWin.isDestroyed()) timelineWin.destroy()
  dungeonWin = null
  timelineWin = null
  app.quit()
}

function createTray() {
  if (tray) return
  tray = new Tray(getTrayIcon())
  tray.setToolTip('Odyssey Companion')
  const menu = Menu.buildFromTemplate([
    {
      label: 'Open main',
      click: () => showDungeonWindow(),
    },
    {
      label: 'Open timeline',
      click: () => showTimelineWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => quitFromTray(),
    },
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => {
    showDungeonWindow()
  })
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

  autoUpdater.on('update-available', async (info) => {
    const notes = stripHtmlToPlainText(releaseNotesPlain(info))
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update available',
      message: `Odyssey Companion ${info.version} is available.`,
      detail: notes || undefined,
    })
    if (response === 0) {
      try {
        await autoUpdater.downloadUpdate()
      } catch (e) {
        console.warn('[odyssey-companion] download failed', e)
        void dialog.showMessageBox({
          type: 'error',
          title: 'Update',
          message: 'Could not download the update.',
          detail: String(e),
        })
      }
    }
  })

  autoUpdater.on('update-not-available', () => {
    /* silent — optional: toast on manual check later */
  })

  autoUpdater.on('error', (e) => {
    console.warn('[odyssey-companion] updater error', e)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const notes = stripHtmlToPlainText(releaseNotesPlain(info))
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'Update ready',
      message: 'The update has been downloaded.',
      detail: notes ? `Changes:\n${notes}` : undefined,
    })
    if (response === 0) {
      setImmediate(() => autoUpdater.quitAndInstall(false, true))
    }
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
  createWindows()
  createTray()
  setupAutoUpdater()
})

/** Allow real quit (Cmd+Q, Alt+F4 chain, etc.) — without this, `close` handlers would hide instead of exiting. */
app.on('before-quit', () => {
  quitting = true
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
    return
  }
  // Windows are hidden to tray, not destroyed — if we ever end up with zero
  // windows without quitting, keep the app alive on Windows (tray).
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows()
  }
})

app.on('second-instance', () => {
  showDungeonWindow()
  showTimelineWindow()
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
  return browserWindowForIpc(sender)
}

ipcMain.handle('window:minimize', (e) => {
  return hideWindowToTray(windowFromSenderExact(e.sender))
})

ipcMain.handle('window:close', (e) => {
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
        const check = await autoUpdater.checkForUpdates()
        if (check?.isUpdateAvailable) {
          await autoUpdater.downloadUpdate()
          return { ok: true, mode: 'auto-updater' }
        }
      } catch (e) {
        console.warn('[odyssey-companion] autoUpdater download path failed', e)
      }
      await shell.openExternal(url)
      return { ok: true, mode: 'browser-fallback' }
    }

    await shell.openExternal(url)
    return { ok: true, mode: 'browser' }
  },
)

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
