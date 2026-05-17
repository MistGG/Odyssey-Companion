import { BrowserWindow, Notification } from 'electron'
import {
  nextNeptunemonSpawnUtcMs,
  normalizeNeptunemonSchedule,
  type NeptunemonScheduleSnapshot,
} from '../../src/lib/neptunemonSchedule'
import type { OverlaySettings } from '../../src/types'

let lastNotifiedSpawnEndMs = 0
let activeNeptunemonSchedule: NeptunemonScheduleSnapshot | null = null

export type ParsedChimeStyle = 'off' | 'warmDuo' | 'airy'

export function parseBossTimerChimeStyle(raw: unknown): ParsedChimeStyle {
  if (raw === 'off' || raw === 'warmDuo' || raw === 'airy') return raw
  if (raw === 'gentle' || raw === 'standard') return 'warmDuo'
  return 'warmDuo'
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

function relaxedNeptunemonCopy(minsApprox: number): { title: string; body: string } {
  return {
    title: 'Neptunemon',
    body: `About ${minsApprox} min until the next window. Bottom-right on Olympos Festival Island.`,
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

export function setActiveNeptunemonSchedule(raw: unknown): boolean {
  const next = normalizeNeptunemonSchedule(raw)
  if (!next) return false
  activeNeptunemonSchedule = next
  lastNotifiedSpawnEndMs = 0
  return true
}

function timersWindowIsUsableVisible(win: BrowserWindow | null): boolean {
  return !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized())
}

/**
 * One tick of Neptunemon pre-spawn alerts (main process).
 */
export function bossTimerAlertTick(settings: OverlaySettings | null, timersWin: BrowserWindow | null): void {
  if (!settings) return

  const timersVisible = timersWindowIsUsableVisible(timersWin)
  const whenClosed = settings.bossTimerNotifyWhenUiClosed
  if (!timersVisible && !whenClosed) return

  const leadMs = settings.bossTimerNotifyLeadMin * 60_000
  const method = settings.bossTimerNotifyMethod

  const now = Date.now()
  const nextSpawn = nextNeptunemonSpawnUtcMs(now, activeNeptunemonSchedule)
  const remaining = nextSpawn - now

  if (remaining > leadMs) {
    lastNotifiedSpawnEndMs = 0
    return
  }
  if (remaining <= 0) return

  if (lastNotifiedSpawnEndMs === nextSpawn) return
  lastNotifiedSpawnEndMs = nextSpawn

  const mins = Math.max(1, Math.ceil(remaining / 60_000))
  const { title, body } = relaxedNeptunemonCopy(mins)

  const chime = parseBossTimerChimeStyle(settings.bossTimerChimeStyle)
  const wantToast = method === 'toast' || method === 'both'
  const wantSound = (method === 'sound' || method === 'both') && chime !== 'off'

  if (wantToast && Notification.isSupported()) {
    void new Notification({ title, body }).show()
  }

  if (wantSound) {
    dispatchTimersWebChime(timersWin, chime, settings.bossTimerChimeVolume, settings.bossTimerChimeRepeats)
  }
}
