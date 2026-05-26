import {
  DEV_METER_TAMER_NAME,
  meterDevTestPartyRowCount,
} from './meterPartyBarThemes'
import type { MeterStreamSession } from './meterEventStream'
import { boostMeterSelfBarForThemePreview, seedMeterDevTestParty } from './meterEventStream'

export function meterDevTestEnabled(): boolean {
  if (!import.meta.env.DEV) return false
  return import.meta.env.VITE_METER_DEV_TEST === '1'
}

export function applyMeterDevTestPartyIfEnabled(session: MeterStreamSession): boolean {
  if (!meterDevTestEnabled()) return false
  seedMeterDevTestParty(session)
  return true
}

/** EventStream ingest can collapse preview rows — restore the full theme gallery. */
export function restoreMeterDevTestPartyIfCollapsed(session: MeterStreamSession): boolean {
  if (!meterDevTestEnabled() || !session.devTestPartySeeded) return false
  if (session.members.size >= meterDevTestPartyRowCount()) return false
  session.devTestPartySeeded = false
  seedMeterDevTestParty(session)
  return true
}

export function applyMeterSelfBarPreviewIfDev(session: MeterStreamSession): (() => void) | null {
  if (!import.meta.env.DEV) return null
  return boostMeterSelfBarForThemePreview(session)
}

export { DEV_METER_TAMER_NAME }
