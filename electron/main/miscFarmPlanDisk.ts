import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const FILE_NAME = 'misc-farm-plan-v1.json'

function planFilePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME)
}

export function readMiscFarmPlanFromDisk(): unknown | null {
  try {
    const raw = fs.readFileSync(planFilePath(), 'utf8')
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function writeMiscFarmPlanToDisk(plan: unknown): void {
  try {
    const dir = app.getPath('userData')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(planFilePath(), JSON.stringify(plan), 'utf8')
  } catch (e) {
    console.warn('[odyssey-companion] failed to write misc farm plan', e)
  }
}
