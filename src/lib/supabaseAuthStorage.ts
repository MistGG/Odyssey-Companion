import type { SupabaseClient } from '@supabase/supabase-js'

type AuthStorage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

function electronAuthBridge():
  | {
      getItem: (key: string) => Promise<string | null>
      setItem: (key: string, value: string) => Promise<void>
      removeItem: (key: string) => Promise<void>
    }
  | undefined {
  const api = typeof window !== 'undefined' ? window.odysseyCompanion : undefined
  if (
    !api?.supabaseAuthStorageGetItem ||
    !api?.supabaseAuthStorageSetItem ||
    !api?.supabaseAuthStorageRemoveItem
  ) {
    return undefined
  }
  return {
    getItem: (key) => api.supabaseAuthStorageGetItem(key),
    setItem: (key, value) => api.supabaseAuthStorageSetItem(key, value),
    removeItem: (key) => api.supabaseAuthStorageRemoveItem(key),
  }
}

/** Persist Supabase auth in Electron userData (survives app updates). */
export function createSupabaseAuthStorage(): AuthStorage | undefined {
  const bridge = electronAuthBridge()
  if (!bridge) return undefined
  return {
    getItem: (key) => bridge.getItem(key),
    setItem: (key, value) => bridge.setItem(key, value),
    removeItem: (key) => bridge.removeItem(key),
  }
}

let migratePromise: Promise<void> | null = null

/** Copy any existing renderer `localStorage` session into the main-process store once. */
export async function migrateSupabaseAuthFromLocalStorage(): Promise<void> {
  const bridge = electronAuthBridge()
  if (!bridge || typeof localStorage === 'undefined') return
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith('sb-')) continue
    const value = localStorage.getItem(key)
    if (!value) continue
    const existing = await bridge.getItem(key)
    if (!existing) await bridge.setItem(key, value)
  }
}

export function ensureSupabaseAuthMigrated(): Promise<void> {
  if (!migratePromise) {
    migratePromise = migrateSupabaseAuthFromLocalStorage()
  }
  return migratePromise
}

/** Wait for persisted session to load before reading auth state. */
export async function initSupabaseAuth(client: SupabaseClient): Promise<void> {
  await ensureSupabaseAuthMigrated()
  await client.auth.getSession()
}
