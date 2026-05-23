/** Sections in the unified Companion settings window (query + IPC). */
export type SettingsSectionId = 'general' | 'online' | 'timeline' | 'meter' | 'timers' | 'hud' | 'updates'

export function normalizeSettingsSection(raw: unknown): SettingsSectionId {
  if (
    raw === 'online' ||
    raw === 'timeline' ||
    raw === 'meter' ||
    raw === 'timers' ||
    raw === 'hud' ||
    raw === 'updates'
  ) {
    return raw
  }
  return 'general'
}

export function readInitialSettingsSection(): SettingsSectionId {
  try {
    const q = new URLSearchParams(window.location.search).get('section')
    return normalizeSettingsSection(q)
  } catch {
    return 'general'
  }
}
