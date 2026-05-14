export const WIKI_LOCAL_STORAGE_PREFIX = 'dmo-wiki-cache-v1:'

function cacheRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(WIKI_LOCAL_STORAGE_PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function cacheWrite(key: string, data: unknown): void {
  try {
    localStorage.setItem(WIKI_LOCAL_STORAGE_PREFIX + key, JSON.stringify(data))
  } catch {
    /* quota or private mode */
  }
}

export function wikiCacheRead<T>(key: string): T | null {
  return cacheRead<T>(key)
}

/**
 * On success: writes through to localStorage.
 * On failure: returns last cached value so the UI stays usable offline / when the wiki is down.
 */
export async function fetchWithWikiCache<T>(
  key: string,
  fetcher: () => Promise<T>,
): Promise<{ value: T; stale: boolean }> {
  try {
    const value = await fetcher()
    cacheWrite(key, value)
    return { value, stale: false }
  } catch {
    const stale = cacheRead<T>(key)
    if (stale !== null) {
      return { value: stale, stale: true }
    }
    throw new Error(`Wiki request failed and no cache for ${key}`)
  }
}
