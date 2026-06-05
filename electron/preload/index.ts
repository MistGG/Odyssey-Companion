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

  fetchWikiDigimon: (id: string) => ipcRenderer.invoke('wiki:fetch-digimon', id),

  fetchWikiNpc: (id: string) => ipcRenderer.invoke('wiki:fetch-npc', id),

  fetchWikiItem: (id: string) => ipcRenderer.invoke('wiki:fetch-item', id),

  openMarketLogin: () => ipcRenderer.invoke('market:open-login') as Promise<boolean>,

  fetchMarketSearch: (query: string) =>
    ipcRenderer.invoke('market:search-items', query) as Promise<unknown>,

  fetchMarketListings: (item: string, side: 'sell' | 'buy' = 'sell', limit = 50) =>
    ipcRenderer.invoke('market:fetch-listings', item, side, limit) as Promise<unknown>,

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

  showHudWindow: () =>
    ipcRenderer.invoke('window:show-hud') as Promise<boolean>,

  openSettings: (section?: string) =>
    ipcRenderer.invoke('window:open-settings', section ?? 'general') as Promise<boolean>,

  onSettingsNavigate: (handler: (section: string) => void) => {
    const wrapped = (_evt: unknown, section: unknown) =>
      handler(typeof section === 'string' ? section : 'general')
    ipcRenderer.on('settings:navigate', wrapped)
    return () => ipcRenderer.removeListener('settings:navigate', wrapped)
  },

  pushSettings: (settings: unknown) => ipcRenderer.send('overlay:push-settings', settings),

  pushBossTimerSchedule: (schedule: unknown) => {
    ipcRenderer.send('boss-timer:push-schedule', schedule)
  },

  applyTimelineWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('timeline:apply-options', opts)
  },

  applyMeterWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('meter:apply-options', opts)
  },

  applyTimersWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('timers:apply-options', opts)
  },

  applyHudWindowOptions: (opts: { alwaysOnTop: boolean }) => {
    ipcRenderer.send('hud:apply-options', opts)
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

  notifyMeterPartyThemesChanged: () => {
    ipcRenderer.send('meter:party-themes-changed')
  },

  onMeterPartyThemesChanged: (handler: () => void) => {
    const wrapped = () => handler()
    ipcRenderer.on('meter:party-themes-changed', wrapped)
    return () => ipcRenderer.removeListener('meter:party-themes-changed', wrapped)
  },

  setMeterDiagnosticCapture: (enabled: boolean) =>
    ipcRenderer.invoke('meter:set-diagnostic-capture', enabled) as Promise<
      { ok: true } | { ok: false; error: string }
    >,

  copyMeterDebugReport: () =>
    ipcRenderer.invoke('meter:copy-debug-report') as Promise<
      { ok: true } | { ok: false; error: string }
    >,

  saveMeterDebugReport: () =>
    ipcRenderer.invoke('meter:save-debug-report') as Promise<
      { ok: true; filePath?: string } | { ok: false; error: string }
    >,

  saveMeterCombatLog: (payload: { runId: string; text: string }) =>
    ipcRenderer.invoke('meter:save-combat-log', payload) as Promise<
      { ok: true; filePath: string } | { ok: false; error: string }
    >,

  hasMeterCombatLog: (runId: string) =>
    ipcRenderer.invoke('meter:has-combat-log', runId) as Promise<{ ok: true; exists: boolean }>,

  exportMeterCombatLog: (payload: { runId: string; defaultName: string }) =>
    ipcRenderer.invoke('meter:export-combat-log', payload) as Promise<
      { ok: true; filePath: string } | { ok: false; error: string }
    >,

  pruneMeterCombatLogs: (keepRunIds: string[]) =>
    ipcRenderer.invoke('meter:prune-combat-logs', keepRunIds) as Promise<
      { ok: true } | { ok: false; error: string }
    >,

  sendMeterDebugReportReady: (payload: {
    requestId: string
    text?: string
    error?: string
  }) => {
    ipcRenderer.send('meter:debug-report-ready', payload)
  },

  onMeterCollectDebugReport: (
    handler: (payload: { requestId: string }) => void,
  ) => {
    const wrapped = (_evt: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const p = payload as { requestId?: string }
      if (typeof p.requestId !== 'string' || !p.requestId) return
      handler({ requestId: p.requestId })
    }
    ipcRenderer.on('meter:collect-debug-report', wrapped)
    return () => ipcRenderer.removeListener('meter:collect-debug-report', wrapped)
  },

  onMeterSetDiagnosticCapture: (handler: (enabled: boolean) => void) => {
    const wrapped = (_evt: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const enabled = Boolean((payload as { enabled?: boolean }).enabled)
      handler(enabled)
    }
    ipcRenderer.on('meter:set-diagnostic-capture', wrapped)
    return () => ipcRenderer.removeListener('meter:set-diagnostic-capture', wrapped)
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

  setHudIgnoreMouseEvents: (ignore: boolean) => {
    ipcRenderer.send('hud:set-ignore-mouse-events', ignore)
  },

  beginHudWindowResize: (edge: string) =>
    ipcRenderer.invoke('hud:begin-window-resize', edge) as Promise<
      { ok: true } | { ok: false; error: string }
    >,

  updateHudWindowResize: (screenX: number, screenY: number) =>
    ipcRenderer.invoke('hud:update-window-resize', screenX, screenY) as Promise<
      { ok: true } | { ok: false }
    >,

  endHudWindowResize: () =>
    ipcRenderer.invoke('hud:end-window-resize') as Promise<{ ok: true } | { ok: false }>,

  /** Grow / restore timers window when overlay loot drop table is toggled. */
  setTimersLootDetailExpanded: (expanded: boolean, contentHeightPx?: number | null) =>
    ipcRenderer.invoke(
      'timers:set-loot-detail-expanded',
      expanded,
      contentHeightPx ?? null,
    ) as Promise<{ ok: true } | { ok: false; error?: string }>,

  loadFightIntoTimeline: (payload: unknown, opts?: { silent?: boolean }) =>
    ipcRenderer.invoke('timeline:load-fight', payload, opts) as Promise<boolean>,

  clearFightInTimeline: () =>
    ipcRenderer.invoke('timeline:clear-fight') as Promise<boolean>,

  /** Hydrate after load if `fight:loaded` was sent before listeners attached. */
  getLastFight: () =>
    ipcRenderer.invoke('timeline:get-last-fight') as Promise<unknown | null>,

  /** Call once after timeline mounts listeners so main can replay `fight:loaded`. */
  notifyTimelineReady: () =>
    ipcRenderer.invoke('timeline:renderer-ready') as Promise<boolean>,

  sendTimelineAction: (
    action: 'toggle' | 'reset' | 'start' | 'stop',
    opts?: { offsetMs?: number },
  ) => ipcRenderer.invoke('timeline:send-action', action, opts) as Promise<boolean>,

  setFightEngageEpoch: (epoch: { dungeonKey: string; engagedAtMs: number }) =>
    ipcRenderer.invoke('fight-engage:set', epoch) as Promise<boolean>,

  getFightEngageEpoch: () =>
    ipcRenderer.invoke('fight-engage:get') as Promise<{
      dungeonKey: string
      engagedAtMs: number
    } | null>,

  clearFightEngageEpoch: () => ipcRenderer.invoke('fight-engage:clear') as Promise<boolean>,

  onTimelineAction: (
    handler: (
      action:
        | 'toggle'
        | 'reset'
        | 'start'
        | 'stop'
        | { action: 'toggle' | 'reset' | 'start' | 'stop'; offsetMs?: number },
    ) => void,
  ) => {
    const wrapped = (_evt: unknown, action: unknown) => {
      handler(action as Parameters<typeof handler>[0])
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

  serverStatusTestNotification: () =>
    ipcRenderer.invoke('server-status:test-notification') as Promise<
      { ok: true } | { ok: false; error: string }
    >,

  fetchGameServerStatus: () =>
    ipcRenderer.invoke('server-status:get') as Promise<{ online: boolean | null }>,

  /** Main sends this when a real pre-spawn sound cue should play (timers window only). */
  connectEventStream: (host: string, port: number) =>
    ipcRenderer.invoke('event-stream:connect', { host, port }) as Promise<
      { ok: true } | { ok: false; error: string }
    >,

  disconnectEventStream: () =>
    ipcRenderer.invoke('event-stream:disconnect') as Promise<{ ok: true }>,

  sendEventStreamQuery: (what: string) =>
    ipcRenderer.invoke('event-stream:query', { what }) as Promise<{ ok: true } | { ok: false; error: string }>,

  onEventStreamMessage: (
    handler: (payload: { raw: string; event: Record<string, unknown> }) => void,
  ) => {
    const wrapped = (_evt: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const p = payload as { raw?: unknown; event?: unknown }
      const raw = typeof p.raw === 'string' ? p.raw : ''
      const event =
        p.event && typeof p.event === 'object' && !Array.isArray(p.event)
          ? (p.event as Record<string, unknown>)
          : { type: 'unknown' }
      handler({ raw, event })
    }
    ipcRenderer.on('event-stream:message', wrapped)
    return () => ipcRenderer.removeListener('event-stream:message', wrapped)
  },

  onEventStreamStatus: (handler: (payload: { status: string; detail: string | null }) => void) => {
    const wrapped = (_evt: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const p = payload as { status?: unknown; detail?: unknown }
      handler({
        status: typeof p.status === 'string' ? p.status : 'idle',
        detail: typeof p.detail === 'string' ? p.detail : p.detail === null ? null : null,
      })
    }
    ipcRenderer.on('event-stream:status', wrapped)
    return () => ipcRenderer.removeListener('event-stream:status', wrapped)
  },

  supabaseAuthStorageGetItem: (key: string) =>
    ipcRenderer.invoke('supabase-auth-storage:get', key) as Promise<string | null>,

  supabaseAuthStorageSetItem: (key: string, value: string) =>
    ipcRenderer.invoke('supabase-auth-storage:set', key, value) as Promise<void>,

  supabaseAuthStorageRemoveItem: (key: string) =>
    ipcRenderer.invoke('supabase-auth-storage:remove', key) as Promise<void>,

  onBossTimerChime: (
    handler: (payload: {
      style: 'braveHeart' | 'digivice' | 'digibeep'
      volume: number
      repeats: number
    }) => void,
  ) => {
    const wrapped = (_evt: unknown, payload: unknown) => {
      if (!payload || typeof payload !== 'object') return
      const p = payload as { style?: unknown; volume?: unknown; repeats?: unknown }
      if (p.style !== 'braveHeart' && p.style !== 'digivice' && p.style !== 'digibeep') return
      const volume =
        typeof p.volume === 'number' && Number.isFinite(p.volume) ? Math.min(1, Math.max(0, p.volume)) : 0.45
      const repeats =
        typeof p.repeats === 'number' && Number.isFinite(p.repeats)
          ? Math.min(5, Math.max(1, Math.round(p.repeats)))
          : 1
      handler({ style: p.style, volume, repeats })
    }
    ipcRenderer.on('boss-timer:chime', wrapped)
    return () => ipcRenderer.removeListener('boss-timer:chime', wrapped)
  },
})
