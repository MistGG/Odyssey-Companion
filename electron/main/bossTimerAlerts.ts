import { BrowserWindow, Notification } from 'electron'
import type { OverlaySettings } from '../../src/types'
import type { RaidBossAlertSnapshot, RaidBossStatus } from '../../src/lib/raidTimerApi'

let activeBossAlerts: RaidBossAlertSnapshot[] = []

export type ParsedChimeStyle = 'off' | 'braveHeart' | 'digivice' | 'digibeep'

/** Boss spawns within this window are batched into one toast/chime. */
export const BOSS_SPAWN_GROUP_WINDOW_MS = 60_000

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

function relaxedGroupedBossCopy(
  bosses: RaidBossAlertSnapshot[],
  minsApprox: number,
): { title: string; body: string } {
  if (bosses.length === 1) return relaxedBossCopy(bosses[0]!, minsApprox)

  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const lines = bosses.map((boss) => {
    const place = boss.mapName?.trim() || 'world boss location'
    const time = timeFmt.format(new Date(boss.nextSpawnUtcMs))
    return `• ${boss.monsterName} — ${place} (${time})`
  })

  return {
    title: `${bosses.length} bosses spawning soon`,
    body: `About ${minsApprox} min until the next window.\n${lines.join('\n')}`,
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

const notifiedSpawnByKey = new Map<string, number>()

/** Group bosses whose spawn times are within `windowMs` of the previous boss in sorted order. */
export function groupBossAlertsBySpawnWindow(
  bosses: RaidBossAlertSnapshot[],
  windowMs = BOSS_SPAWN_GROUP_WINDOW_MS,
): RaidBossAlertSnapshot[][] {
  if (bosses.length === 0) return []
  const sorted = [...bosses].sort((a, b) => a.nextSpawnUtcMs - b.nextSpawnUtcMs)
  const groups: RaidBossAlertSnapshot[][] = []
  let current: RaidBossAlertSnapshot[] = [sorted[0]!]

  for (let i = 1; i < sorted.length; i++) {
    const boss = sorted[i]!
    const prev = current[current.length - 1]!
    if (boss.nextSpawnUtcMs - prev.nextSpawnUtcMs <= windowMs) {
      current.push(boss)
    } else {
      groups.push(current)
      current = [boss]
    }
  }
  groups.push(current)
  return groups
}

/**
 * Pre-spawn alerts for bosses in `respawning` state (raid timer API).
 */
export function bossTimerAlertTick(settings: OverlaySettings | null, timersWin: BrowserWindow | null): void {
  if (!settings) return

  const timersVisible = timersWindowIsUsableVisible(timersWin)
  const whenClosed = settings.bossTimerNotifyWhenUiClosed
  if (!timersVisible && !whenClosed) return

  const leadMs = settings.bossTimerNotifyLeadMin * 60_000
  const method = settings.bossTimerNotifyMethod
  const now = Date.now()

  const chime = parseBossTimerChimeStyle(settings.bossTimerChimeStyle)
  const wantToast = method === 'toast' || method === 'both'
  const wantSound = (method === 'sound' || method === 'both') && chime !== 'off'

  const pending: RaidBossAlertSnapshot[] = []

  for (const boss of activeBossAlerts) {
    if (boss.status !== 'respawning') continue
    const remaining = boss.nextSpawnUtcMs - now
    if (remaining > leadMs || remaining <= 0) {
      notifiedSpawnByKey.delete(boss.monsterName)
      continue
    }
    if (notifiedSpawnByKey.get(boss.monsterName) === boss.nextSpawnUtcMs) continue
    pending.push(boss)
  }

  if (pending.length === 0) return

  const groups = groupBossAlertsBySpawnWindow(pending)

  for (const group of groups) {
    for (const boss of group) {
      notifiedSpawnByKey.set(boss.monsterName, boss.nextSpawnUtcMs)
    }

    const soonestRemaining = Math.min(...group.map((boss) => boss.nextSpawnUtcMs - now))
    const mins = Math.max(1, Math.ceil(soonestRemaining / 60_000))
    const { title, body } =
      group.length === 1 ? relaxedBossCopy(group[0]!, mins) : relaxedGroupedBossCopy(group, mins)

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
