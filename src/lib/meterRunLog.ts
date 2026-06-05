import type { EventStreamRecord } from './eventStreamFormat'
import { meterDebugEventSummary } from './meterDebugLog'
import type { MeterStreamSession } from './meterEventStream'

/** Per-run timeline cap — enough for a full dungeon without bloating localStorage. */
const MAX_RUN_LOG_LINES = 1200

const ALWAYS_LOG_TYPES = new Set([
  'map_change',
  'dungeon_progress',
  'death',
  'hello',
  'digimon_change',
  'party_change',
  'party_join',
  'party_update',
  'party_roster',
  'party_member_added',
])

let lines: string[] = []

export function meterRunLogClear(): void {
  lines = []
}

export function meterRunLogCapture(): string {
  if (lines.length === 0) return ''
  return lines.join('\n')
}

function pushLine(line: string): void {
  lines.push(line)
  if (lines.length > MAX_RUN_LOG_LINES) {
    lines.splice(0, lines.length - MAX_RUN_LOG_LINES)
  }
}

function runLogActive(session: MeterStreamSession): boolean {
  return Boolean(session.dungeonId?.trim() || session.dungeonRunActive)
}

function shouldLogQueryResult(ev: EventStreamRecord): boolean {
  if (ev.dungeon && typeof ev.dungeon === 'object') return true
  if (ev.map && typeof ev.map === 'object') return true
  const party = ev.party
  if (party && typeof party === 'object' && !Array.isArray(party)) return true
  if (Array.isArray(party) && party.length > 0) return true
  const q = typeof ev.q === 'string' ? ev.q.trim() : ''
  if (q && q !== 'all' && q !== 'party') return true
  return false
}

function shouldLogEventType(t: string, ev: EventStreamRecord): boolean {
  if (ALWAYS_LOG_TYPES.has(t)) return true
  if (t === 'query_result') return shouldLogQueryResult(ev)
  return false
}

/** Append a concise event line while a dungeon run is active (cheap — no string work on combat spam). */
export function meterRunLogRecordEvent(
  session: MeterStreamSession,
  ev: EventStreamRecord,
  notes?: string[],
): void {
  if (!runLogActive(session)) return
  const t = String(ev.type ?? '')
  if (!shouldLogEventType(t, ev)) return
  const summary = meterDebugEventSummary(ev)
  const ts = new Date().toISOString().slice(11, 23)
  const extra = notes?.filter(Boolean).join(' | ')
  pushLine(extra ? `[${ts}] ${summary} | ${extra}` : `[${ts}] ${summary}`)
}

/** Milestone lines (timer start, outcome, pull reset) — not tied to a single event type. */
export function meterRunLogNote(_session: MeterStreamSession, line: string): void {
  const ts = new Date().toISOString().slice(11, 23)
  pushLine(`[${ts}] ${line}`)
}
