import type {
  AppVersionInfo,
  DownloadUpdateResult,
  DungeonListResponse,
  HotkeysApplyPayload,
  LatestReleaseResult,
  OverlaySettings,
  UpdateCheckResult,
} from './types'

export {}

declare global {
  interface Window {
    /** Preload bridge; undefined in a normal browser tab. */
    odysseyCompanion?: {
      fetchDungeons: () => Promise<DungeonListResponse>
      fetchDungeonDetail: (id: string) => Promise<unknown>
      fetchMonsterDetail: (id: string) => Promise<unknown>
      fetchWikiNpc: (id: string) => Promise<unknown>
      fetchWikiItem: (id: string) => Promise<unknown>
      openMarketLogin?: () => Promise<boolean>
      fetchMarketSearch?: (query: string) => Promise<unknown>
      fetchMarketListings?: (item: string, side?: 'sell' | 'buy', limit?: number) => Promise<unknown>
      applyHotkeys: (cfg: HotkeysApplyPayload) => Promise<{ ok: boolean; error?: string }>
      minimize: () => Promise<unknown>
      close: () => Promise<unknown>
      showMainWindow: () => Promise<boolean>
      showTimelineWindow: () => Promise<boolean>
      showMeterWindow: () => Promise<boolean>
      showTimersWindow: () => Promise<boolean>
      openSettings: (section?: string) => Promise<boolean>
      onSettingsNavigate: (handler: (section: string) => void) => () => void
      pushSettings: (settings: OverlaySettings) => void
      applyTimelineWindowOptions: (opts: { alwaysOnTop: boolean }) => void
      applyMeterWindowOptions: (opts: { alwaysOnTop: boolean }) => void
      applyTimersWindowOptions: (opts: { alwaysOnTop: boolean }) => void
      startMeterReader: () => Promise<{ ok: boolean; error?: string }>
      stopMeterReader: () => Promise<boolean>
      resetMeterSession: () => Promise<boolean>
      sendMeterReaderStdin: (line: string) => Promise<boolean>
      onMeterTelemetry: (handler: (msg: unknown) => void) => () => void
      onMeterClearSessionUi: (handler: () => void) => () => void
      onMeterTriggerUploadParse: (handler: () => void) => () => void
      /** Electron timeline window only: OS-level click-through when `true`. */
      setTimelineIgnoreMouseEvents?: (ignore: boolean) => void
      setMeterIgnoreMouseEvents?: (ignore: boolean) => void
      setTimersIgnoreMouseEvents?: (ignore: boolean) => void
      /** Timers overlay: resize window to fit drop table, restore prior bounds when collapsed. */
      setTimersLootDetailExpanded?: (
        expanded: boolean,
        contentHeightPx?: number | null,
      ) => Promise<{ ok: true } | { ok: false; error?: string }>,
      loadFightIntoTimeline: (payload: unknown) => Promise<boolean>
      getLastFight: () => Promise<unknown | null>
      notifyTimelineReady: () => Promise<boolean>
      onTimelineAction: (handler: (action: 'toggle' | 'reset') => void) => () => void
      onSettingsPatch: (handler: (patch: unknown) => void) => () => void
      onFightLoaded: (handler: (payload: unknown) => void) => () => void
      getAppVersion: () => Promise<AppVersionInfo>
      checkForUpdates: () => Promise<UpdateCheckResult>
      downloadUpdate: (setupExeUrl: string) => Promise<DownloadUpdateResult>
      getLatestReleaseNotes: () => Promise<LatestReleaseResult>
      getUpdaterUiState: () => Promise<unknown>
      onUpdaterState: (handler: (state: unknown) => void) => () => void
      confirmUpdaterDownload: () => Promise<{ ok: true } | { ok: false; error: string }>
      quitAndInstall: () => Promise<boolean>
      dismissUpdateWindow: () => Promise<boolean>
      bossTimerTestToast: () => Promise<{ ok: true } | { ok: false; error: string }>
      /** Timers window: play Web Audio chime when main fires a pre-spawn sound reminder. */
      onBossTimerChime?: (
        handler: (payload: { style: 'warmDuo' | 'airy'; volume: number; repeats: number }) => void,
      ) => () => void
    }
  }
}
