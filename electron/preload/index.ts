import { contextBridge, ipcRenderer } from 'electron'

export type HotkeyConfig = {
  toggle: string
  reset: string
  meterReconnect: string
  meterResetSession: string
}

contextBridge.exposeInMainWorld('odysseyCompanion', {
  fetchDungeons: () => ipcRenderer.invoke('wiki:fetch-dungeons'),

  fetchDungeonDetail: (id: string) => ipcRenderer.invoke('wiki:fetch-dungeon', id),

  fetchMonsterDetail: (id: string) => ipcRenderer.invoke('wiki:fetch-monster', id),

  applyHotkeys: (cfg: HotkeyConfig) =>
    ipcRenderer.invoke('hotkeys:apply', cfg) as Promise<{ ok: boolean; error?: string }>,

  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),

  showMainWindow: () =>
    ipcRenderer.invoke('window:show-main') as Promise<boolean>,

  showTimelineWindow: () =>
    ipcRenderer.invoke('window:show-timeline') as Promise<boolean>,

  showMeterWindow: () =>
    ipcRenderer.invoke('window:show-meter') as Promise<boolean>,

  showPacketLabWindow: () =>
    ipcRenderer.invoke('window:show-packetlab') as Promise<boolean>,

  startPacketLabCapture: (opts: { sessionName?: string; iface?: string }) =>
    ipcRenderer.invoke('packetlab:start', opts) as Promise<{ ok: boolean; error?: string; outDir?: string }>,

  stopPacketLabCapture: () => ipcRenderer.invoke('packetlab:stop') as Promise<{ ok: boolean }>,

  openPacketLabOutputFolder: () =>
    ipcRenderer.invoke('packetlab:open-output-folder') as Promise<{ ok: boolean; error?: string }>,

  onPacketLabLog: (handler: (msg: { stream: 'stdout' | 'stderr'; text: string }) => void) => {
    const wrapped = (_evt: unknown, msg: unknown) => handler(msg as { stream: 'stdout' | 'stderr'; text: string })
    ipcRenderer.on('packetlab:log', wrapped)
    return () => ipcRenderer.removeListener('packetlab:log', wrapped)
  },

  onPacketLabStatus: (handler: (msg: { state: 'running' | 'idle' | 'error'; outDir?: string; message?: string }) => void) => {
    const wrapped = (_evt: unknown, msg: unknown) =>
      handler(msg as { state: 'running' | 'idle' | 'error'; outDir?: string; message?: string })
    ipcRenderer.on('packetlab:status', wrapped)
    return () => ipcRenderer.removeListener('packetlab:status', wrapped)
  },

  pushSettings: (settings: unknown) => ipcRenderer.send('overlay:push-settings', settings),

  applyTimelineWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('timeline:apply-options', opts)
  },

  applyMeterWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('meter:apply-options', opts)
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

  /** When locked: pass `true` so the timeline window ignores mouse (click-through); `false` receives clicks (drag strip / lock). */
  setTimelineIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send('timeline:set-ignore-mouse-events', ignore)
  },

  setMeterIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send('meter:set-ignore-mouse-events', ignore)
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
})
