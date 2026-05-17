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

export type HotkeyConfig = {
  /** Same accelerator toggles Start ↔ Pause (clock pause only; Reset restores reference timeline). */
  toggle: string
  reset: string
  /** Global: restart the Python DPS reader (`None` to disable). */
  meterReconnect: string
  /** Global: reset meter session / reader cursor (`None` to disable). */
  meterResetSession: string
  /** Global: upload current meter session to Parse cloud (`None` to disable). */
  meterUploadParse: string
}

/** Payload for `applyHotkeys` IPC — hotkeys plus focus gating flag. */
export type HotkeysApplyPayload = HotkeyConfig & {
  hotkeysOnlyWhenCompanionFocused: boolean
}

export type OverlaySettings = {
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
  meterAutoResetIdleSec: number
  /**
   * Party meter: show your `profiles.display_name` for your own row (list and self skill breakdown) instead of "You".
   */
  meterPartyShowSelfDisplayName: boolean
  /**
   * When true: timeline/meter hotkeys are registered only while a Companion window
   * (dungeon, timeline, or meter) is focused, so keys remain available for typing in other apps.
   * When false (default): hotkeys work globally, including while the game is focused.
   */
  hotkeysOnlyWhenCompanionFocused: boolean
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
  bossTimerChimeStyle: 'off' | 'warmDuo' | 'airy'
  /** Chime loudness 0–1 (Web Audio master trim). */
  bossTimerChimeVolume: number
  /** How many times to play the chime in a row (1–5). */
  bossTimerChimeRepeats: number
}

export const DEFAULT_SETTINGS: OverlaySettings = {
  hotkeys: {
    toggle: 'F9',
    reset: 'F11',
    meterReconnect: 'None',
    meterResetSession: 'None',
    meterUploadParse: 'None',
  },
  timelineBackdropOpacity: 0.88,
  timelineAlwaysOnTop: true,
  timelinePositionLocked: false,
  meterBackdropOpacity: 0.82,
  meterAlwaysOnTop: true,
  meterPositionLocked: false,
  meterAutoResetIdleSec: 10,
  meterPartyShowSelfDisplayName: false,
  hotkeysOnlyWhenCompanionFocused: false,
  timersBackdropOpacity: 0.86,
  timersAlwaysOnTop: true,
  timersPositionLocked: false,
  bossTimerNotifyLeadMin: 15,
  bossTimerNotifyMethod: 'toast',
  bossTimerNotifyWhenUiClosed: true,
  bossTimerChimeStyle: 'warmDuo',
  bossTimerChimeVolume: 0.45,
  bossTimerChimeRepeats: 1,
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
