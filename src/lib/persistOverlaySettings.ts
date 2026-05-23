import type { OverlaySettings } from '../types'
import { saveSettings } from './settingsStorage'

/** Write overlay settings to disk and sync all Companion windows (call after HUD layout edits). */
export function persistOverlaySettings(settings: OverlaySettings): void {
  saveSettings(settings)
  try {
    window.odysseyCompanion?.pushSettings?.(settings)
  } catch {
    /* */
  }
}
