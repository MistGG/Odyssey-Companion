import { contextBridge, ipcRenderer } from 'electron'

export type HotkeyConfig = {
  toggle: string
  reset: string
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

  pushSettings: (settings: unknown) => ipcRenderer.send('overlay:push-settings', settings),

  applyTimelineWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('timeline:apply-options', opts)
  },

  /** When locked: pass `true` so the timeline window ignores mouse (click-through); `false` receives clicks (drag strip / lock). */
  setTimelineIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send('timeline:set-ignore-mouse-events', ignore)
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
})
