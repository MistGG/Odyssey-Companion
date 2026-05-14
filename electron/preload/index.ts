import { contextBridge, ipcRenderer } from 'electron'

export type HotkeyConfig = {
  toggle: string
  reset: string
  meterReconnect: string
  meterResetSession: string
  meterUploadParse: string
}

export type HotkeysApplyPayload = HotkeyConfig & {
  hotkeysOnlyWhenCompanionFocused: boolean
}

contextBridge.exposeInMainWorld('odysseyCompanion', {
  fetchDungeons: () => ipcRenderer.invoke('wiki:fetch-dungeons'),

  fetchDungeonDetail: (id: string) => ipcRenderer.invoke('wiki:fetch-dungeon', id),

  fetchMonsterDetail: (id: string) => ipcRenderer.invoke('wiki:fetch-monster', id),

  fetchWikiNpc: (id: string) => ipcRenderer.invoke('wiki:fetch-npc', id),

  fetchWikiItem: (id: string) => ipcRenderer.invoke('wiki:fetch-item', id),

  applyHotkeys: (cfg: HotkeysApplyPayload) =>
    ipcRenderer.invoke('hotkeys:apply', cfg) as Promise<{ ok: boolean; error?: string }>,

  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),

  showMainWindow: () =>
    ipcRenderer.invoke('window:show-main') as Promise<boolean>,

  showTimelineWindow: () =>
    ipcRenderer.invoke('window:show-timeline') as Promise<boolean>,

  showMeterWindow: () =>
    ipcRenderer.invoke('window:show-meter') as Promise<boolean>,

  showTimersWindow: () =>
    ipcRenderer.invoke('window:show-timers') as Promise<boolean>,

  openSettings: (section?: string) =>
    ipcRenderer.invoke('window:open-settings', section ?? 'general') as Promise<boolean>,

  onSettingsNavigate: (handler: (section: string) => void) => {
    const wrapped = (_evt: unknown, section: unknown) =>
      handler(typeof section === 'string' ? section : 'general')
    ipcRenderer.on('settings:navigate', wrapped)
    return () => ipcRenderer.removeListener('settings:navigate', wrapped)
  },

  pushSettings: (settings: unknown) => ipcRenderer.send('overlay:push-settings', settings),

  applyTimelineWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('timeline:apply-options', opts)
  },

  applyMeterWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('meter:apply-options', opts)
  },

  applyTimersWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('timers:apply-options', opts)
  },

  startMeterReader: () =>
    ipcRenderer.invoke('meter:start-reader') as Promise<{ ok: boolean; error?: string }>,

  stopMeterReader: () => ipcRenderer.invoke('meter:stop-reader') as Promise<boolean>,

  resetMeterSession: () => ipcRenderer.invoke('meter:reset-session') as Promise<boolean>,

  /** Send a line to the Python reader stdin (DEBUG_ON, DEBUG_OFF, DUMP, RESET). */
  sendMeterReaderStdin: (line: string) =>
    ipcRenderer.invoke('meter:reader-stdin', line) as Promise<boolean>,

  onMeterTelemetry: (handler: (msg: unknown) => void) => {
    const wrapped = (_evt: unknown, msg: unknown) => handler(msg)
    ipcRenderer.on('meter:telemetry', wrapped)
    return () => ipcRenderer.removeListener('meter:telemetry', wrapped)
  },

  /** Main-process global shortcut fired “reset session” — clear meter totals without a second RESET. */
  onMeterClearSessionUi: (handler: () => void) => {
    const wrapped = () => handler()
    ipcRenderer.on('meter:clear-session-ui', wrapped)
    return () => ipcRenderer.removeListener('meter:clear-session-ui', wrapped)
  },

  onMeterTriggerUploadParse: (handler: () => void) => {
    const wrapped = () => handler()
    ipcRenderer.on('meter:trigger-upload-parse', wrapped)
    return () => ipcRenderer.removeListener('meter:trigger-upload-parse', wrapped)
  },

  /** When locked: pass `true` so the timeline window ignores mouse (click-through); `false` receives clicks (drag strip / lock). */
  setTimelineIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send('timeline:set-ignore-mouse-events', ignore)
  },

  setMeterIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send('meter:set-ignore-mouse-events', ignore)
  },

  setTimersIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send('timers:set-ignore-mouse-events', ignore)
  },

  loadFightIntoTimeline: (payload: unknown) =>
    ipcRenderer.invoke('timeline:load-fight', payload) as Promise<boolean>,

  /** Hydrate after load if `fight:loaded` was sent before listeners attached. */
  getLastFight: () =>
    ipcRenderer.invoke('timeline:get-last-fight') as Promise<unknown | null>,

  /** Call once after timeline mounts listeners so main can replay `fight:loaded`. */
  notifyTimelineReady: () =>
    ipcRenderer.invoke('timeline:renderer-ready') as Promise<boolean>,

  onTimelineAction: (handler: (action: 'toggle' | 'reset') => void) => {
    const wrapped = (_evt: unknown, action: 'toggle' | 'reset') => {
      handler(action)
    }
    ipcRenderer.on('timeline-action', wrapped)
    return () => ipcRenderer.removeListener('timeline-action', wrapped)
  },

  onSettingsPatch: (handler: (patch: unknown) => void) => {
    const wrapped = (_evt: unknown, patch: unknown) => handler(patch)
    ipcRenderer.on('settings:patch', wrapped)
    return () => ipcRenderer.removeListener('settings:patch', wrapped)
  },

  onFightLoaded: (handler: (payload: unknown) => void) => {
    const wrapped = (_evt: unknown, payload: unknown) => handler(payload)
    ipcRenderer.on('fight:loaded', wrapped)
    return () => ipcRenderer.removeListener('fight:loaded', wrapped)
  },

  getAppVersion: () => ipcRenderer.invoke('app:get-version'),

  checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),

  downloadUpdate: (setupExeUrl: string) =>
    ipcRenderer.invoke('updater:download-update', setupExeUrl),

  getLatestReleaseNotes: () =>
    ipcRenderer.invoke('updater:latest-release-notes'),

  getUpdaterUiState: () => ipcRenderer.invoke('updater:get-ui-state'),

  onUpdaterState: (handler: (state: unknown) => void) => {
    const wrapped = (_evt: unknown, payload: unknown) => handler(payload)
    ipcRenderer.on('updater:state', wrapped)
    return () => ipcRenderer.removeListener('updater:state', wrapped)
  },

  confirmUpdaterDownload: () =>
    ipcRenderer.invoke('updater:confirm-download') as Promise<{ ok: true } | { ok: false; error: string }>,

  quitAndInstall: () => ipcRenderer.invoke('updater:quit-and-install') as Promise<boolean>,

  dismissUpdateWindow: () => ipcRenderer.invoke('updater:dismiss-update-window') as Promise<boolean>,

  bossTimerTestToast: () =>
    ipcRenderer.invoke('boss-timer:test-toast') as Promise<{ ok: true } | { ok: false; error: string }>,

  bossTimerTestSound: (style?: 'off' | 'gentle' | 'standard') =>
    ipcRenderer.invoke('boss-timer:test-sound', style) as Promise<{ ok: true } | { ok: false; error: string }>,
})
