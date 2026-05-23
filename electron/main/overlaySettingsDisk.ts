import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, type OverlaySettings } from '../../src/types'
import { parseOverlaySettingsJson } from '../../src/lib/settingsStorage'

const FILE_NAME = 'overlay-settings-v1.json'

function settingsFilePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

export function readOverlaySettingsFromDisk(): OverlaySettings {
  try {
    const raw = fs.readFileSync(settingsFilePath(), 'utf8')
    return parseOverlaySettingsJson(JSON.parse(raw) as unknown)
  } catch {
    return {
      ...DEFAULT_SETTINGS,
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys },
    }
  }
}

export function writeOverlaySettingsToDisk(settings: OverlaySettings): void {
  try {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(settingsFilePath(), JSON.stringify(settings), 'utf8')
  } catch (e) {
    console.warn('[odyssey-companion] failed to write overlay settings disk mirror', e)
  }
}
