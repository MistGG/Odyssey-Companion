import { BrowserWindow, Notification } from 'electron'
import type { OverlaySettings } from '../../src/types'
import { dispatchCompanionWebChime, parseBossTimerChimeStyle } from './bossTimerAlerts'
import { isWikiQuiet, msUntilWikiQuiet } from './wikiRequestActivity'

const SERVER_STATUS_URL = 'https://thedigitalodyssey.com/api/server-status'
const POLL_ONLINE_MS = 5 * 60_000
const POLL_OFFLINE_MS = 10_000
const MIN_DEFER_MS = 5_000

const FETCH_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'OdysseyCompanion/1.0',
}

type SoundWindowGetter = () => BrowserWindow[]

let pollTimer: ReturnType<typeof setTimeout> | null = null
let checking = false
let lastKnownOnline: boolean | null = null
let getSoundWindows: SoundWindowGetter = () => []

function clearPollTimer() {
  if (pollTimer != null) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function schedulePoll(delayMs: number) {
  clearPollTimer()
  pollTimer = setTimeout(() => {
    pollTimer = null
    void runPoll()
  }, Math.max(MIN_DEFER_MS, delayMs))
}

async function fetchServerOnline(): Promise<boolean | null> {
  try {
    const res = await fetch(SERVER_STATUS_URL, { headers: FETCH_HEADERS })
    if (!res.ok) return null
    const data = (await res.json()) as { online?: unknown }
    return data.online === true
  } catch {
    return null
  }
}

function notifyMethod(settings: OverlaySettings) {
  return settings.serverStatusNotifyMethod
}

function effectiveServerStatusChimeRepeats(
  style: OverlaySettings['serverStatusChimeStyle'],
  repeats: number,
): number {
  if (style === 'braveHeart') return 1
  return Math.min(5, Math.max(1, Math.round(repeats)))
}

function playStatusChime(settings: OverlaySettings) {
  const chime = parseBossTimerChimeStyle(settings.serverStatusChimeStyle)
  if (chime === 'off') return
  dispatchCompanionWebChime(
    getSoundWindows(),
    chime,
    settings.serverStatusChimeVolume,
    effectiveServerStatusChimeRepeats(settings.serverStatusChimeStyle, settings.serverStatusChimeRepeats),
  )
}

function showStatusToast(title: string, body: string) {
  if (!Notification.isSupported()) return
  try {
    void new Notification({ title, body }).show()
  } catch {
    /* */
  }
}

function notifyTransition(settings: OverlaySettings, online: boolean) {
  const method = notifyMethod(settings)
  const wantToast = method === 'toast' || method === 'both'
  const wantSound = method === 'sound' || method === 'both'

  if (online) {
    if (wantToast) {
      showStatusToast(
        'Odyssey Companion',
        'The Digital Odyssey game servers appear to be back online.',
      )
    }
    if (wantSound) playStatusChime(settings)
    return
  }

  if (wantToast) {
    showStatusToast(
      'Odyssey Companion',
      'The Digital Odyssey game servers appear to be offline.',
    )
  }
  if (wantSound) playStatusChime(settings)
}

async function runPoll() {
  const settings = currentSettings
  if (!settings?.serverStatusMonitorEnabled) return

  if (!isWikiQuiet()) {
    schedulePoll(msUntilWikiQuiet() || MIN_DEFER_MS)
    return
  }

  if (checking) {
    schedulePoll(POLL_OFFLINE_MS)
    return
  }

  checking = true
  const online = await fetchServerOnline()
  checking = false

  if (online === null) {
    schedulePoll(lastKnownOnline === false ? POLL_OFFLINE_MS : POLL_ONLINE_MS)
    return
  }

  const prev = lastKnownOnline
  lastKnownOnline = online

  if (prev !== null && prev !== online) {
    notifyTransition(settings, online)
  }

  schedulePoll(online ? POLL_ONLINE_MS : POLL_OFFLINE_MS)
}

let currentSettings: OverlaySettings | null = null

export function syncServerStatusMonitor(
  settings: OverlaySettings | null,
  soundWindows: SoundWindowGetter,
): void {
  currentSettings = settings
  getSoundWindows = soundWindows

  clearPollTimer()

  if (!settings?.serverStatusMonitorEnabled) {
    lastKnownOnline = null
    checking = false
    return
  }

  schedulePoll(isWikiQuiet() ? MIN_DEFER_MS : msUntilWikiQuiet() || MIN_DEFER_MS)
}

export function tryShowServerStatusTestNotification(
  settings: OverlaySettings | null,
  soundWindows: SoundWindowGetter,
): { ok: true } | { ok: false; error: string } {
  if (!settings) {
    return { ok: false, error: 'Settings not loaded.' }
  }
  getSoundWindows = soundWindows
  const method = notifyMethod(settings)
  const wantToast = method === 'toast' || method === 'both'
  const wantSound = method === 'sound' || method === 'both'

  if (wantToast) {
    if (!Notification.isSupported()) {
      return { ok: false, error: 'Desktop notifications are not supported on this platform.' }
    }
    showStatusToast(
      'Odyssey Companion',
      'Server status alerts are enabled. You will be notified when the game servers go offline or come back online.',
    )
  }

  if (wantSound) {
    const chime = parseBossTimerChimeStyle(settings.serverStatusChimeStyle)
    if (chime === 'off') {
      return { ok: false, error: 'Pick a chime style for server status sound alerts.' }
    }
    dispatchCompanionWebChime(
      soundWindows(),
      chime,
      settings.serverStatusChimeVolume,
      effectiveServerStatusChimeRepeats(settings.serverStatusChimeStyle, settings.serverStatusChimeRepeats),
    )
  }

  if (!wantToast && !wantSound) {
    return { ok: false, error: 'Pick Toast, Sound, or Both.' }
  }

  return { ok: true }
}
