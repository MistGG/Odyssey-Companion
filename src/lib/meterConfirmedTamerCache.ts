const CONFIRMED_TAMER_STORAGE_KEY = 'odyssey-meter-confirmed-tamer'

export function readCachedConfirmedTamer(): string | null {
  try {
    const raw = localStorage.getItem(CONFIRMED_TAMER_STORAGE_KEY)?.trim()
    return raw || null
  } catch {
    return null
  }
}

export function writeCachedConfirmedTamer(tamerName: string): void {
  const name = tamerName.trim()
  if (!name) return
  try {
    localStorage.setItem(CONFIRMED_TAMER_STORAGE_KEY, name)
  } catch {
    /* ignore */
  }
}
