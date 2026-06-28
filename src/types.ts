export type Dungeon = {
  id: string
  name: string
  map_name: string
  image: string
  difficulties?: string[]
}

export type DungeonListResponse = {
  data: Dungeon[]
  page: number
  per_page: number
  total: number
  total_pages: number
}

export type MarketSearchItem = {
  item: string
  name: string
  icon: string
}

export type MarketListing = {
  item: string
  name: string
  icon: string
  qty: number
  price: number
  total: string
  created: number
  expires: number
}

export type MarketListingsResponse = {
  listings: MarketListing[]
}

export type DungeonEnterCondition = {
  type: string
  description: string
}

/** Boss chest / raid roll row (permille ×100 = display %, matching the wiki). */
export type DungeonRaidRewardRoll = {
  item_id: string
  item_name: string
  item_icon_id: string
  rate_permil: number
  min: number
  max: number
}

export type DungeonRaidRankingBand = {
  start: number
  end: number
  rewards: DungeonRaidRewardRoll[]
}

export type DungeonClearReward = {
  rank: number
  item_id: string
  item_name: string
  item_icon_id: string
  item_count: number
}

export type DungeonObjective = {
  step: number
  monster_id: string
  monster_name: string
  pen_name: string
  level: number
  model_id: string
  count: number
  raid_rankings?: DungeonRaidRankingBand[]
}

/** Single-dungeon API (`?id=`) — difficulties include objectives (monster_id → monster timeline). */
export type DungeonDetailDifficulty = {
  difficulty: string
  time_limit_sec: number
  death_limit: number
  objectives: DungeonObjective[]
  user_limit?: number
  weekly_limit?: number
  enter_conditions?: DungeonEnterCondition[]
  rewards?: DungeonClearReward[]
}

export type DungeonDetail = {
  id: string
  name: string
  map_name: string
  image: string
  difficulties: DungeonDetailDifficulty[]
}

export type MonsterSkill = {
  skill_id: number
  cool_time: number
  cast_time: number
  effect_type: string
  effect_min: number
  effect_max: number
  target_count: number
  condition: string
  condition_val: number
  max_uses?: number
  /** Player-facing label — skips effect-type heuristics when set. */
  display_label?: string
  /** One-shot cast at this ms from pull (not a repeating cooldown interval). */
  fire_at_ms?: number
}

/** Verified mechanic schedule when wiki cooldown data is wrong. */
export type FightTimelineScheduledEvent = {
  atMs: number
  label: string
  targetCount: number
  effectMax?: number
}

export type FightTimelineSchedule = {
  events: FightTimelineScheduledEvent[]
  /** After this ms, append wiki skills whose first cast is later than the cutover. */
  wikiCutoverMs: number
}

/** `GET …/api/wiki/monsters` — map rows on the monster payload. */
export type MonsterLocation = {
  map_id: string
  map_name: string
  count: number
}

export type MonsterDrop = {
  item_id: string
  item_name: string
  item_icon_id: string
  quantity: number
  drop_type: string
}

export type MonsterDetail = {
  id: string
  name: string
  pen_name: string
  model_id: string
  level: number
  skills: MonsterSkill[]
  /** Normal monster drops from `GET …/api/wiki/monsters?id=` (optional). */
  drops?: MonsterDrop[]
  /** World / field boss loot bands from `GET …/api/wiki/monsters?id=` (optional). */
  raid_rankings?: DungeonRaidRankingBand[]
  /** Spawn / field locations from the monsters API (optional). */
  locations?: MonsterLocation[]
}

export type HudWidgetType = 'attack_speed' | 'buff_tracker' | 'boss_alerts'

/** Companion panels that may open when the app starts (settings excluded). */
export const STARTUP_PANEL_KEYS = ['main', 'timeline', 'meter', 'timers', 'hud'] as const

export type StartupPanelKey = (typeof STARTUP_PANEL_KEYS)[number]

/** Per-widget options for the attack speed HUD element. */
export type AttackSpeedWidgetConfig = {
  /** When set, speed below threshold uses threshold colors (null = off). */
  threshold: number | null
  thresholdTextColor: string
  thresholdBackgroundColor: string
  /** Hide the "Attack speed" caption above the value. */
  hideLabel: boolean
  /** Font size in px for the ASP value readout. */
  valueFontSizePx: number
  /** Widget box width in px. */
  widgetWidthPx: number
  /** Fixed height in px, or `null` to size to content. */
  widgetHeightPx: number | null
  /** Background panel opacity (0–1); content stays fully opaque. */
  backgroundOpacity: number
}

/** Saved buff row for blacklist (persisted in overlay settings). */
export type BuffTrackerSavedBuff = {
  buffId: string
  buffName: string
  skillIcon: string | null
}

/** Per-widget options for the buff tracker HUD element. */
export type BuffTrackerDisplayMode = 'all' | 'whitelist'

export type BuffTrackerWidgetConfig = {
  /** Show every active buff except blacklisted, or only buffs on the allow list. */
  displayMode: BuffTrackerDisplayMode
  /** When `displayMode` is `whitelist`, only these buffs are shown. */
  allowedBuffs: BuffTrackerSavedBuff[]
  /** Custom widget title; empty uses “Buffs”. */
  widgetLabel: string
  /** Buffs hidden from the widget; persisted across sessions. */
  blacklistedBuffs: BuffTrackerSavedBuff[]
  /** Iconless buffs the user explicitly restored to the widget (opt-out of auto-blacklist). */
  shownIconlessBuffs: BuffTrackerSavedBuff[]
  /** Hide the widget title (“Buffs”). */
  hideBuffsLabel: boolean
  /** Hide per-buff name labels; show icon and timer only. */
  hideBuffLabel: boolean
  /** Hide per-buff countdown timers. */
  hideCountdown: boolean
  /** Buffs in a row: name above icon, timer below icon. */
  horizontalLayout: boolean
  /** Hide the “No active buffs” placeholder when the list is empty. */
  hideEmptyMessage: boolean
  /** Seconds remaining when rows blink and show tenths (default 5). */
  expiringWarningSec: number
  /** Background panel opacity (0–1); content stays fully opaque. */
  backgroundOpacity: number
  /** When layout is locked, hide the widget if there are no active buffs. */
  hideWhenNoActiveBuffs: boolean
  /** Scales the whole widget and contents (0.5–2). */
  widgetScale: number
}

/** Which mechanic types trigger the alert sound. */
export type BossAlertSoundFor = 'single' | 'multi' | 'both'

/** Boss mechanic warnings from wiki skill schedule. */
export type BossAlertsWidgetConfig = {
  /** Show alerts this many seconds before the predicted cast (default 5). */
  warnLeadSec: number
  /** Wiki skills with `target_count === 1`. */
  trackSingleTarget: boolean
  /** Wiki skills with `target_count > 1` (default on). */
  trackMultiTarget: boolean
  alertSoundEnabled: boolean
  /** `file://` path from the file picker (Electron). */
  alertSoundFilePath: string | null
  /** Fallback when path cannot be used (short clips). */
  alertSoundDataUrl: string | null
  alertSoundVolume: number
  alertSoundFor: BossAlertSoundFor
  backgroundOpacity: number
  widgetScale: number
  hideEmptyMessage: boolean
  hideWhenInactive: boolean
}

export type HudWidget = {
  id: string
  type: HudWidgetType
  x: number
  y: number
  attackSpeed?: AttackSpeedWidgetConfig
  buffTracker?: BuffTrackerWidgetConfig
  bossAlerts?: BossAlertsWidgetConfig
}

export type HotkeyConfig = {
  /** Same accelerator toggles Start ↔ Pause (clock pause only; Reset restores reference timeline). */
  toggle: string
  reset: string
  /** Global: reset meter session (`None` to disable). */
  meterResetSession: string
  /** Global: upload current meter session to Parse cloud (`None` to disable). */
  meterUploadParse: string
}

/** Payload for `applyHotkeys` IPC — hotkeys plus focus gating flag. */
export type HotkeysApplyPayload = HotkeyConfig & {
  hotkeysOnlyWhenCompanionFocused: boolean
}

export type OverlaySettings = {
  /** Which companion panels to show on app launch. Default: main only. */
  startupPanels: StartupPanelKey[]
  hotkeys: HotkeyConfig
  /**
   * Timeline window only: background strength (0 = fully transparent so only timeline UI shows, 1 = solid).
   */
  timelineBackdropOpacity: number
  /** Applies to the timeline overlay window only. */
  timelineAlwaysOnTop: boolean
  /**
   * When true, the timeline window cannot be moved (no drag regions).
   */
  timelinePositionLocked: boolean
  /** DPS meter overlay window — panel opacity (0–1). */
  meterBackdropOpacity: number
  /** Keep DPS meter above other windows. */
  meterAlwaysOnTop: boolean
  /**
   * When true: window stays put; pointer passes through except controls (gear, lock, title strip, etc.).
   */
  meterPositionLocked: boolean
  /**
   * After this many seconds without a damage hit, clear live DPS/total/time only.
   * Skill breakdown is frozen until new hits arrive. `0` disables.
   */
  /**
   * Party meter: show your `profiles.display_name` for your own row (list and self skill breakdown) instead of "You".
   */
  meterPartyShowSelfDisplayName: boolean
  /** Record EventStream / meter lines for support debug reports. */
  meterDiagnosticCapture: boolean
  /**
   * When true: timeline/meter hotkeys are registered only while a Companion window
   * (dungeon, timeline, or meter) is focused, so keys remain available for typing in other apps.
   * When false (default): hotkeys work globally, including while the game is focused.
   */
  hotkeysOnlyWhenCompanionFocused: boolean
  /** Always on: auto-upload party parse after Normal/Hard clear (kept for settings compatibility). */
  meterAutoUploadAfterClear: boolean
  /** Boss timers overlay — panel opacity (0–1). */
  timersBackdropOpacity: number
  /** Keep boss timers window above other apps. */
  timersAlwaysOnTop: boolean
  /**
   * When true: window stays put; pointer passes through except title strip and interactive panel
   * (same pattern as the DPS meter overlay).
   */
  timersPositionLocked: boolean
  /** Fire a reminder this many minutes before Neptunemon spawns (1–120). */
  bossTimerNotifyLeadMin: number
  /** How to alert before spawn (Windows toast and/or a short ring-style chime). */
  bossTimerNotifyMethod: 'toast' | 'sound' | 'both'
  /**
   * When true, main-process reminders still run while the timers window is hidden to tray
   * (otherwise alerts only fire while the timers overlay is visible).
   */
  bossTimerNotifyWhenUiClosed: boolean
  /** Chime voice for pre-spawn sound alerts (Web Audio in the timers window). */
  bossTimerChimeStyle: 'off' | 'braveHeart' | 'digivice' | 'digibeep'
  /** Chime loudness 0–1 (Web Audio master trim). */
  bossTimerChimeVolume: number
  /** How many times to play the chime in a row (1–5). */
  bossTimerChimeRepeats: number
  /** How many upcoming bosses to show in the timers overlay (1–15). */
  bossTimerVisibleCount: number
  /** Poll The Digital Odyssey server-status API and alert on offline/online changes. */
  serverStatusMonitorEnabled: boolean
  /** How to alert when game server status changes. */
  serverStatusNotifyMethod: 'toast' | 'sound' | 'both'
  /** Chime voice for server status sound alerts. */
  serverStatusChimeStyle: 'braveHeart' | 'digivice' | 'digibeep'
  /** Chime loudness 0–1 for server status sound alerts. */
  serverStatusChimeVolume: number
  /** How many times to play the server status chime in a row (1–5). */
  serverStatusChimeRepeats: number
  /** Digi Aura overlay — panel opacity in edit mode (0–1). */
  hudBackdropOpacity: number
  /** Keep HUD above other apps. */
  hudAlwaysOnTop: boolean
  /**
   * When true: title bar and backdrop hidden; widgets only, with full click-through (including over widgets).
   * Unlock only via tray or Settings (not the HUD lock button).
   */
  hudLayoutLocked: boolean
  /** Placed HUD widgets (positions persisted while editing layout). */
  hudWidgets: HudWidget[]
  /**
   * When true: disable backdrop blur, pause overlay CSS animations while the game
   * has focus, and throttle unfocused overlay renderers for lower GPU use.
   */
  overlayPerformanceMode: boolean
  /**
   * When true: meter/timeline/hud/timers windows use opaque Electron surfaces
   * (`#070a12`) instead of OS alpha compositing.
   */
  overlayOpaqueWindows: boolean
}

export const DEFAULT_SETTINGS: OverlaySettings = {
  startupPanels: ['main'],
  hotkeys: {
    toggle: 'F9',
    reset: 'F11',
    meterResetSession: 'None',
    meterUploadParse: 'None',
  },
  timelineBackdropOpacity: 0.88,
  timelineAlwaysOnTop: true,
  timelinePositionLocked: false,
  meterBackdropOpacity: 0.82,
  meterAlwaysOnTop: true,
  meterPositionLocked: false,
  meterPartyShowSelfDisplayName: false,
  meterDiagnosticCapture: false,
  hotkeysOnlyWhenCompanionFocused: false,
  meterAutoUploadAfterClear: true,
  timersBackdropOpacity: 0.86,
  timersAlwaysOnTop: true,
  timersPositionLocked: false,
  bossTimerNotifyLeadMin: 15,
  bossTimerNotifyMethod: 'toast',
  bossTimerNotifyWhenUiClosed: true,
  bossTimerChimeStyle: 'braveHeart',
  bossTimerChimeVolume: 0.45,
  bossTimerChimeRepeats: 1,
  bossTimerVisibleCount: 5,
  serverStatusMonitorEnabled: false,
  serverStatusNotifyMethod: 'toast',
  serverStatusChimeStyle: 'digivice',
  serverStatusChimeVolume: 0.45,
  serverStatusChimeRepeats: 1,
  hudBackdropOpacity: 0.78,
  hudAlwaysOnTop: true,
  hudLayoutLocked: false,
  hudWidgets: [],
  overlayPerformanceMode: false,
  overlayOpaqueWindows: false,
}

/** Sent to the timeline window when a difficulty is chosen. */
export type TimelineFightPayload = {
  dungeonName: string
  difficulty: string
  time_limit_sec: number
  death_limit: number
  objectives: Array<{
    step: number
    monster_id: string
    monster_name: string
    pen_name: string
    level: number
    count: number
  }>
  monsterSkills: Array<{
    monster_id: string
    skills: MonsterSkill[]
  }>
  /** Verified pull schedule — overrides wiki cooldown queue until wikiCutoverMs. */
  schedule?: FightTimelineSchedule
}

export type AppVersionInfo = {
  version: string
  isPackaged: boolean
}

/** Compares `app.getVersion()` with GitHub `releases/latest` (semver). */
export type UpdateCheckResult =
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

export type DownloadUpdateResult =
  | { ok: true; mode: 'auto-updater' | 'browser' | 'browser-fallback' }
  | { ok: false; error: string }

export type LatestReleaseResult =
  | { ok: true; tag: string; publishedAt: string; body: string; url: string }
  | { ok: false; error: string }

/** `GET …/api/wiki/npcs?id=` — fields used by boss timers / portraits. */
export type WikiNpcDetail = {
  id: string
  name: string
  pen_name: string
  model_id: string
}

/** `GET …/api/wiki/items?id=` — fields used for reward icon URLs. */
export type WikiItemDetail = {
  id: string
  name: string
  icon_id: string
}
