import type { SupabaseClient } from '@supabase/supabase-js'

import {
  isMeterDevBaselinePartyKey,
  meterBarThemeIdFromMemberKey,
  type MeterPartyBarThemeId,
} from './meterPartyBarThemes'
import type { MeterStreamSession } from './meterEventStream'
import {
  equippedThemeIdForTamer,
  fetchEquippedThemesForTamers,
  normalizePartyTamerThemeKey,
} from './meterPartyTamerThemes'

export function collectPartyTamerNamesFromSession(session: MeterStreamSession): string[] {
  const names = new Set<string>()
  for (const row of session.members.values()) {
    if (row.isSelf) continue
    if (meterBarThemeIdFromMemberKey(row.key) || isMeterDevBaselinePartyKey(row.key)) continue
    const name = row.tamerName?.trim()
    if (name) names.add(name)
  }
  for (const snap of session.rosterMembers.values()) {
    if (snap.isSelf) continue
    const name = snap.tamerName?.trim()
    if (name) names.add(name)
  }
  return [...names]
}

export function applyEquippedThemesToMeterSession(
  session: MeterStreamSession,
  themesByTamer: Map<string, MeterPartyBarThemeId>,
): boolean {
  let changed = false
  for (const row of session.members.values()) {
    if (row.isSelf) continue
    if (meterBarThemeIdFromMemberKey(row.key) || isMeterDevBaselinePartyKey(row.key)) continue
    const nextId = equippedThemeIdForTamer(themesByTamer, row.tamerName)
    if (!nextId) continue
    if (row.meterBarThemeId !== nextId) {
      row.meterBarThemeId = nextId
      changed = true
    }
  }
  return changed
}

export async function resolveAndApplyPartyTamerThemes(
  client: SupabaseClient | null,
  session: MeterStreamSession,
  options?: { bustCache?: boolean },
): Promise<boolean> {
  const names = collectPartyTamerNamesFromSession(session)
  if (!names.length) return false
  const themes = await fetchEquippedThemesForTamers(client, names, options)
  if (!themes.size) return false
  return applyEquippedThemesToMeterSession(session, themes)
}

export function partyTamerThemeResolveSignature(session: MeterStreamSession): string {
  const tamers = collectPartyTamerNamesFromSession(session)
    .map(normalizePartyTamerThemeKey)
    .sort()
    .join('|')
  const mapId = session.mapId?.trim() || ''
  const mapName = session.mapName?.trim() || ''
  const dungeonId = session.dungeonId?.trim() || ''
  return `${dungeonId}::${mapId}::${mapName}::${tamers}`
}
