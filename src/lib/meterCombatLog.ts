import type { EventStreamRecord } from './eventStreamFormat'
import { extractEventSkillId, extractStreamSkillName } from './eventStreamSkillLookup'
import type { MeterStreamSession } from './meterEventStream'

/** Ring buffer cap — a long dungeon at high party DPS; oldest events drop with a counter. */
const MAX_EVENTS = 20_000

type CombatLogRow = {
  ts: number
  type: string
  dmg: number
  tamer: string
  digimon: string
  digimonId: string
  skill: string
  fromSelf: boolean
  credited: boolean
}

const buf: CombatLogRow[] = new Array(MAX_EVENTS)
let head = 0
let count = 0
let dropped = 0

export function meterCombatLogClear(): void {
  head = 0
  count = 0
  dropped = 0
}

function push(row: CombatLogRow): void {
  buf[head] = row
  head = (head + 1) % MAX_EVENTS
  if (count < MAX_EVENTS) count++
  else dropped++
}

function runActive(session: MeterStreamSession): boolean {
  return Boolean(session.dungeonId?.trim() || session.dungeonRunActive)
}

function skillLabel(ev: EventStreamRecord): string {
  const fromStream = extractStreamSkillName(ev)
  if (fromStream) return fromStream
  const raw = String(ev.skill ?? '').trim()
  if (raw) return raw
  return extractEventSkillId(ev) ?? ''
}

/** Record a party combat event (compact struct — no string formatting here). */
export function meterCombatLogRecordPartyHit(
  session: MeterStreamSession,
  ev: EventStreamRecord,
  opts: {
    ts: number
    tamer: string
    digimon: string
    digimonId: string
    fromSelf: boolean
    credited: boolean
  },
): void {
  if (!runActive(session) || session.sessionEndMs != null) return
  push({
    ts: opts.ts,
    type: String(ev.type ?? ''),
    dmg: Number(ev.damage) || 0,
    tamer: opts.tamer,
    digimon: opts.digimon,
    digimonId: opts.digimonId,
    skill: skillLabel(ev),
    fromSelf: opts.fromSelf,
    credited: opts.credited,
  })
}

export type MeterCombatLogSnapshot = {
  rows: CombatLogRow[]
  dropped: number
  sessionStartMs: number | null
}

export function meterCombatLogSnapshot(sessionStartMs: number | null): MeterCombatLogSnapshot {
  const rows: CombatLogRow[] = []
  const startIdx = count < MAX_EVENTS ? 0 : head
  for (let i = 0; i < count; i++) {
    rows.push(buf[(startIdx + i) % MAX_EVENTS])
  }
  return { rows, dropped, sessionStartMs }
}

export type MeterCombatLogFileHeader = {
  runId: string
  endedAt: string
  dungeonName: string | null
  dungeonId: string | null
  difficulty: string | null
  outcome: string
  appVersion: string
}

export function formatMeterCombatLogFile(
  header: MeterCombatLogFileHeader,
  runTimeline: string,
  snapshot: MeterCombatLogSnapshot,
): string {
  const lines: string[] = [
    'Odyssey Companion — meter combat log',
    `run_id=${header.runId}`,
    `ended_at=${header.endedAt}`,
    `dungeon=${header.dungeonName ?? header.dungeonId ?? '?'}`,
    `difficulty=${header.difficulty ?? '?'}`,
    `outcome=${header.outcome}`,
    `app_version=${header.appVersion}`,
    `party_events=${snapshot.rows.length}`,
    ...(snapshot.dropped > 0 ? [`dropped_oldest_events=${snapshot.dropped}`] : []),
    '',
    'Summary damage breakdown is in Copy report (Settings → Recent runs).',
    '',
  ]

  if (runTimeline.trim()) {
    lines.push('--- run milestones ---', runTimeline.trim(), '')
  }

  lines.push('--- party combat events (chronological) ---')
  const base = snapshot.sessionStartMs
  for (const row of snapshot.rows) {
    const rel =
      base != null
        ? `+${Math.max(0, (row.ts - base) / 1000).toFixed(3)}s`
        : new Date(row.ts).toISOString().slice(11, 23)
    const credit = row.credited ? '' : ' uncredited_basic'
    lines.push(
      `[${rel}] type=${row.type} dmg=${row.dmg} tamer=${row.tamer} digimon=${row.digimon} id=${row.digimonId} skill=${row.skill} self=${row.fromSelf}${credit}`,
    )
  }

  return lines.join('\n')
}
