import { BrowserWindow, Notification } from 'electron'
import type { OverlaySettings } from '../../src/types'
import {
  BOSS_TRAIN_WINDOW_MS,
  groupAlertSnapshotsIntoTrains,
  type RaidBossAlertSnapshot,
  type RaidBossStatus,
} from '../../src/lib/raidTimerApi'

let activeBossAlerts: RaidBossAlertSnapshot[] = []

export type ParsedChimeStyle = 'off' | 'braveHeart' | 'digivice' | 'digibeep'

/** Must match `BOSS_TIMER_ALERT_INTERVAL_MS` in electron/main/index.ts. */
export const BOSS_TIMER_ALERT_TICK_MS = 15_000

/** @deprecated Use BOSS_TRAIN_WINDOW_MS from raidTimerApi */
export const BOSS_SPAWN_GROUP_WINDOW_MS = BOSS_TRAIN_WINDOW_MS

export function parseBossTimerChimeStyle(raw: unknown): ParsedChimeStyle {
  if (raw === 'off' || raw === 'braveHeart' || raw === 'digivice' || raw === 'digibeep') {
    return raw
  }
  if (raw === 'warmDuo' || raw === 'airy' || raw === 'gentle' || raw === 'standard') {
    return 'braveHeart'
  }
  return 'braveHeart'
}

function dispatchTimersWebChime(
  win: BrowserWindow | null,
  style: Exclude<ParsedChimeStyle, 'off'>,
  volume: number,
  repeats: number,
): void {
  if (!win || win.isDestroyed()) return
  const v = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0.45
  const r = Number.isFinite(repeats) ? Math.min(5, Math.max(1, Math.round(repeats))) : 1
  try {
    win.webContents.send('boss-timer:chime', { style, volume: v, repeats: r })
  } catch {
    /* ignore */
  }
}

/** Play chime in the first open companion window that listens for boss-timer:chime. */
export function dispatchCompanionWebChime(
  wins: BrowserWindow[],
  style: Exclude<ParsedChimeStyle, 'off'>,
  volume: number,
  repeats: number,
): void {
  for (const win of wins) {
    if (!win || win.isDestroyed()) continue
    dispatchTimersWebChime(win, style, volume, repeats)
    return
  }
}

function relaxedBossCopy(boss: RaidBossAlertSnapshot, minsApprox: number): { title: string; body: string } {
  const place = boss.mapName?.trim() || 'world boss location'
  return {
    title: boss.monsterName,
    body: `About ${minsApprox} min until the next window. ${place}.`,
  }
}

function relaxedTrainCopy(
  train: RaidBossAlertSnapshot[],
  minsApprox: number,
): { title: string; body: string } {
  if (train.length === 1) return relaxedBossCopy(train[0]!, minsApprox)

  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const lines = train.map((boss) => {
    const place = boss.mapName?.trim() || 'world boss location'
    const time = timeFmt.format(new Date(boss.nextSpawnUtcMs))
    return `• ${boss.monsterName} — ${place} (${time})`
  })

  return {
    title: `Boss train (${train.length} spawns)`,
    body: `About ${minsApprox} min until the train starts.\n${lines.join('\n')}`,
  }
}

function relaxedTestCopy(): { title: string; body: string } {
  return {
    title: 'Odyssey Companion',
    body: 'This is a quiet preview of spawn reminders. Change alert timing in Companion settings anytime.',
  }
}

export function tryShowBossTimerTestNotification():
  | { ok: true }
  | { ok: false; error: string } {
  if (!Notification.isSupported()) {
    return { ok: false, error: 'Desktop notifications are not supported on this platform.' }
  }
  try {
    const { title, body } = relaxedTestCopy()
    void new Notification({ title, body }).show()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}

export function setActiveRaidBossAlerts(raw: unknown): boolean {
  if (!Array.isArray(raw)) {
    activeBossAlerts = []
    return true
  }
  const next: RaidBossAlertSnapshot[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const monsterName = typeof o.monsterName === 'string' ? o.monsterName.trim() : ''
    const nextSpawnUtcMs = Number(o.nextSpawnUtcMs)
    const status = o.status as RaidBossStatus
    if (!monsterName || !Number.isFinite(nextSpawnUtcMs)) continue
    if (status !== 'alive' && status !== 'ready' && status !== 'respawning') continue
    next.push({
      monsterName,
      mapName: typeof o.mapName === 'string' ? o.mapName.trim() : '',
      status,
      nextSpawnUtcMs: Math.round(nextSpawnUtcMs),
    })
  }
  activeBossAlerts = next
  return true
}

function timersWindowIsUsableVisible(win: BrowserWindow | null): boolean {
  return !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized())
}

/** Stable key for one train spawn cycle — minute bucket absorbs raid-timer API jitter. */
function trainNotifyKey(train: RaidBossAlertSnapshot[]): string {
  const first = train[0]!
  const spawnBucket = Math.floor(first.nextSpawnUtcMs / 60_000)
  const roster = train
    .map((b) => b.monsterName)
    .sort()
    .join('|')
  return `${spawnBucket}:${roster}`
}

const notifiedTrainKeys = new Set<string>()
/** Previous tick's ms-until-first-spawn — detects crossing into the lead window. */
const lastFirstRemainingMs = new Map<string, number>()

/** Group bosses whose spawn times are within `windowMs` of the previous boss in sorted order. */
export function groupBossAlertsBySpawnWindow(
  bosses: RaidBossAlertSnapshot[],
  nowMs = Date.now(),
  windowMs = BOSS_TRAIN_WINDOW_MS,
): RaidBossAlertSnapshot[][] {
  return groupAlertSnapshotsIntoTrains(bosses, nowMs, windowMs)
}

/**
 * Pre-spawn alerts for bosses in `respawning` state (raid timer API).
 * Trains share one toast/chime when the first boss crosses into the lead window (~N min before spawn).
 */
export function bossTimerAlertTick(settings: OverlaySettings | null, timersWin: BrowserWindow | null): void {
  if (!settings) return

  const timersVisible = timersWindowIsUsableVisible(timersWin)
  const whenClosed = settings.bossTimerNotifyWhenUiClosed
  if (!timersVisible && !whenClosed) return

  const leadMin = Math.min(120, Math.max(1, Math.round(settings.bossTimerNotifyLeadMin)))
  const leadMs = leadMin * 60_000
  const method = settings.bossTimerNotifyMethod
  const now = Date.now()

  const chime = parseBossTimerChimeStyle(settings.bossTimerChimeStyle)
  const wantToast = method === 'toast' || method === 'both'
  const wantSound = (method === 'sound' || method === 'both') && chime !== 'off'

  const respawning = activeBossAlerts.filter((boss) => boss.status === 'respawning')
  const trains = groupAlertSnapshotsIntoTrains(respawning, now)

  for (const train of trains) {
    const first = train[0]!
    const firstRemaining = first.nextSpawnUtcMs - now
    const notifyKey = trainNotifyKey(train)
    const prevRemaining = lastFirstRemainingMs.get(notifyKey)

    if (firstRemaining <= 0) {
      notifiedTrainKeys.delete(notifyKey)
      lastFirstRemainingMs.delete(notifyKey)
      continue
    }

    if (firstRemaining > leadMs) {
      notifiedTrainKeys.delete(notifyKey)
      lastFirstRemainingMs.set(notifyKey, firstRemaining)
      continue
    }

    lastFirstRemainingMs.set(notifyKey, firstRemaining)

    const crossedIntoLead =
      prevRemaining != null && prevRemaining > leadMs && firstRemaining <= leadMs
    const coldStartNearLead =
      prevRemaining == null &&
      firstRemaining <= leadMs &&
      firstRemaining >= leadMs - BOSS_TIMER_ALERT_TICK_MS * 2

    if (!crossedIntoLead && !coldStartNearLead) {
      continue
    }

    if (notifiedTrainKeys.has(notifyKey)) {
      continue
    }
    notifiedTrainKeys.add(notifyKey)

    const { title, body } = relaxedTrainCopy(train, leadMin)

    if (wantToast && Notification.isSupported()) {
      void new Notification({ title, body }).show()
    }
    if (wantSound) {
      const repeats =
        chime === 'braveHeart'
          ? 1
          : Math.min(5, Math.max(1, Math.round(settings.bossTimerChimeRepeats)))
      dispatchTimersWebChime(timersWin, chime, settings.bossTimerChimeVolume, repeats)
    }
  }
}
