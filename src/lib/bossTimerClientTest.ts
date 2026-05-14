/** Preview Neptunemon toast (Electron IPC or browser fallbacks). */

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

/** Kept for API compatibility; sound alerts are off for now. */
export async function runBossTimerTestSound(): Promise<{ ok: boolean; error?: string }> {
  const api = window.odysseyCompanion
  if (api?.bossTimerTestSound) {
    const r = await api.bossTimerTestSound()
    return r.ok ? { ok: true } : { ok: false, error: r.error }
  }
  return {
    ok: false,
    error: 'Sound spawn alerts are temporarily disabled — use Test toast to preview reminders.',
  }
}
