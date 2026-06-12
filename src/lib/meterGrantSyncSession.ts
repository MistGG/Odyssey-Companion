const GRANT_SYNC_SESSION_KEY = 'odyssey-meter-grant-sync-v1'
const GRANT_SYNC_TTL_MS = 5 * 60 * 1000

export function shouldRunMeterGrantSync(): boolean {
  if (typeof sessionStorage === 'undefined') return true
  try {
    const raw = sessionStorage.getItem(GRANT_SYNC_SESSION_KEY)
    if (!raw) return true
    const at = Number(raw)
    return !Number.isFinite(at) || Date.now() - at > GRANT_SYNC_TTL_MS
  } catch {
    return true
  }
}

export function markMeterGrantSyncDone(): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(GRANT_SYNC_SESSION_KEY, String(Date.now()))
  } catch {
    /* quota */
  }
}
