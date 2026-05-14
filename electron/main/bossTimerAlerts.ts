import { BrowserWindow, Notification } from 'electron'
import { nextNeptunemonSpawnUtcMs } from '../../src/lib/neptunemonSchedule'
import type { OverlaySettings } from '../../src/types'

let lastNotifiedSpawnEndMs = 0

export type ParsedChimeStyle = 'off' | 'gentle' | 'standard'

export function parseBossTimerChimeStyle(raw: unknown): ParsedChimeStyle {
  if (raw === 'off' || raw === 'gentle' || raw === 'standard') return raw
  return 'gentle'
}

/** Sound spawn alerts are temporarily disabled (no-op; kept for API compatibility). */
export function playBossTimerChime(_style: ParsedChimeStyle): void {}

export function playBossTimerTestBeep(_style: ParsedChimeStyle) {}

function relaxedNeptunemonCopy(minsApprox: number): { title: string; body: string } {
  return {
    title: 'Neptunemon',
    body: `About ${minsApprox} min until the next window. Bottom-right on Olympos festival isle — Olympian token when you get there. No rush.`,
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
  const nextSpawn = nextNeptunemonSpawnUtcMs(now)
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

  /** Sound alerts are off for now — desktop toast for all methods that expect an alert. */
  const showToast = method === 'toast' || method === 'both' || method === 'sound'
  if (showToast) {
    if (Notification.isSupported()) {
      void new Notification({ title, body }).show()
    }
  }
}
