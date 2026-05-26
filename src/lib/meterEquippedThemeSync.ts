import type { SupabaseClient } from '@supabase/supabase-js'

import type { MeterStreamSession } from './meterEventStream'
import {
  clearEquippedMeterPartyBarThemeId,
  getMeterPartyBarTheme,
  readStoredEquippedMeterPartyBarThemeId,
  writeEquippedMeterPartyBarThemeId,
  type MeterPartyBarThemeId,
} from './meterPartyBarThemes'

/** Slow fallback while the meter tab is visible (equip changed on the website). */
const VISIBLE_FALLBACK_MS = 3 * 60 * 1000

export async function fetchEquippedMeterPartyBarThemeIdFromAccount(
  client: SupabaseClient,
  userId: string,
): Promise<MeterPartyBarThemeId | null> {
  const { data, error } = await client
    .from('meter_reward_accounts')
    .select('equipped_theme_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return null
  const raw = (data as { equipped_theme_id?: unknown } | null)?.equipped_theme_id
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (!id) return null
  const theme = getMeterPartyBarTheme(id)
  return theme ? theme.id : null
}

/** Persist remote equip choice and update live self rows. Returns true if anything changed. */
export function syncEquippedThemeToMeterSession(
  session: MeterStreamSession,
  equippedId: MeterPartyBarThemeId | null,
): boolean {
  const storedId = readStoredEquippedMeterPartyBarThemeId()
  let changed = storedId !== equippedId

  if (equippedId) {
    if (storedId !== equippedId) writeEquippedMeterPartyBarThemeId(equippedId)
  } else if (storedId != null) {
    clearEquippedMeterPartyBarThemeId()
  }

  for (const row of session.members.values()) {
    if (!row.isSelf) continue
    const nextId = equippedId ?? undefined
    if (row.meterBarThemeId !== nextId) {
      row.meterBarThemeId = nextId
      changed = true
    }
  }
  return changed
}

/**
 * Keep the live meter aligned with `meter_reward_accounts.equipped_theme_id`.
 * Does not poll aggressively: one read on start, on window focus, when the tab
 * becomes visible, and at most once every few minutes while visible.
 */
export function startMeterEquippedThemeSync(
  client: SupabaseClient,
  userId: string,
  getSession: () => MeterStreamSession,
  onSessionThemeChange: () => void,
): () => void {
  let cancelled = false
  let inFlight = false
  let fallbackTimer: number | undefined

  const pull = async () => {
    if (cancelled || inFlight || document.visibilityState === 'hidden') return
    inFlight = true
    try {
      const remoteId = await fetchEquippedMeterPartyBarThemeIdFromAccount(client, userId)
      if (cancelled) return
      if (syncEquippedThemeToMeterSession(getSession(), remoteId)) {
        onSessionThemeChange()
      }
    } finally {
      inFlight = false
    }
  }

  const scheduleFallback = () => {
    if (fallbackTimer != null) window.clearTimeout(fallbackTimer)
    if (cancelled || document.visibilityState === 'hidden') return
    fallbackTimer = window.setTimeout(() => {
      void pull()
      scheduleFallback()
    }, VISIBLE_FALLBACK_MS)
  }

  const onFocus = () => void pull()
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      void pull()
      scheduleFallback()
    } else if (fallbackTimer != null) {
      window.clearTimeout(fallbackTimer)
      fallbackTimer = undefined
    }
  }

  void pull()
  scheduleFallback()
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    cancelled = true
    if (fallbackTimer != null) window.clearTimeout(fallbackTimer)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
