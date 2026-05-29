/** Preview Neptunemon toast (Electron IPC or browser fallbacks). */

import { loadSettings } from './settingsStorage'
import { playBossTimerWebChimeFromSetting } from './bossTimerWebChime'

export async function runBossTimerTestToast(): Promise<{ ok: boolean; error?: string }> {
  const api = window.odysseyCompanion
  if (api?.bossTimerTestToast) {
    const r = await api.bossTimerTestToast()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  }
  if (typeof Notification === 'undefined') {
    return { ok: false, error: 'This browser does not support notifications.' }
  }
  if (Notification.permission === 'denied') {
    return { ok: false, error: 'Notifications are blocked for this site — check browser settings.' }
  }
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') {
      return { ok: false, error: 'Notification permission was not granted.' }
    }
  }
  try {
    new Notification('Odyssey Companion', {
      body: 'Quiet preview — same relaxed style as real Neptunemon reminders.',
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Plays the current chime style in this renderer (Web Audio). */
export async function runBossTimerTestSound(): Promise<{ ok: boolean; error?: string }> {
  try {
    const s = loadSettings()
    const chime = s.bossTimerChimeStyle
    if (chime === 'off') {
      return {
        ok: false,
        error: 'Chime is Off — pick Warm Duo or Airy to hear a preview.',
      }
    }
    await playBossTimerWebChimeFromSetting(chime, s.bossTimerChimeVolume, s.bossTimerChimeRepeats)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function runServerStatusTestNotification(): Promise<{ ok: boolean; error?: string }> {
  const api = window.odysseyCompanion
  if (api?.serverStatusTestNotification) {
    const r = await api.serverStatusTestNotification()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  }
  return { ok: false, error: 'Server status alerts require the Odyssey Companion app.' }
}
