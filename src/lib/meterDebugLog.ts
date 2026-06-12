import type { EventStreamRecord } from './eventStreamFormat'

const MAX_LINES = 400
const STORAGE_KEY = 'odyssey-meter-debug'
const STORAGE_UNTIL_KEY = 'odyssey-meter-debug-until'

/** Auto-disable diagnostic capture after this long (settings + localStorage). */
export const METER_DEBUG_CAPTURE_MAX_MS = 10 * 60 * 1000

const lines: string[] = []

/** Returns true when capture was enabled but has passed its expiry (and is now off). */
export function maybeExpireMeterDebug(): boolean {
  try {
    if (localStorage.getItem(STORAGE_KEY) !== '1') return false
    const untilRaw = localStorage.getItem(STORAGE_UNTIL_KEY)
    const until = untilRaw != null ? Number(untilRaw) : NaN
    if (!Number.isFinite(until) || Date.now() >= until) {
      setMeterDebugEnabled(false)
      return true
    }
    return false
  } catch {
    return false
  }
}

export function isMeterDebugEnabled(): boolean {
  if (maybeExpireMeterDebug()) return false
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setMeterDebugEnabled(on: boolean) {
  try {
    if (on) {
      localStorage.setItem(STORAGE_KEY, '1')
      localStorage.setItem(
        STORAGE_UNTIL_KEY,
        String(Date.now() + METER_DEBUG_CAPTURE_MAX_MS),
      )
    } else {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(STORAGE_UNTIL_KEY)
    }
  } catch {
    /* */
  }
}

function pushLine(line: string) {
  if (!isMeterDebugEnabled()) return
  const ts = new Date().toISOString().slice(11, 23)
  lines.push(`[${ts}] ${line}`)
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES)
  console.log(`[meter-debug] ${line}`)
}

export function meterDebugClear() {
  lines.length = 0
}

export function meterDebugDump(): string {
  return lines.join('\n')
}

export function meterDebugEventSummary(ev: EventStreamRecord): string {
  const t = String(ev.type ?? '')
  const parts = [`type=${t}`]
  if (ev.from_self != null) parts.push(`from_self=${String(ev.from_self)}`)
  const hitter = String(ev.hitter ?? ev.attacker ?? '').trim()
  if (hitter) parts.push(`hitter=${hitter}`)
  const digimonId = String(ev.digimon_id ?? '').trim()
  if (digimonId) parts.push(`digimon_id=${digimonId}`)
  const dmg = Number(ev.damage)
  if (Number.isFinite(dmg) && dmg > 0) parts.push(`dmg=${dmg}`)
  const q = typeof ev.q === 'string' ? ev.q.trim() : ''
  if (q) parts.push(`q=${q}`)
  if (ev.dungeon && typeof ev.dungeon === 'object') {
    const d = ev.dungeon as Record<string, unknown>
    parts.push(`dungeon_id=${String(d.dungeon_id ?? '')}`)
  }
  return parts.join(' ')
}

export function meterDebugIngestState(session: {
  selfTamerName: string | null
  selfDigimonId: string | null
  selfDigimonNickname: string | null
  sessionStartMs: number | null
  sessionEndMs: number | null
  dungeonId: string | null
  dungeonRunActive: boolean
  mapName: string | null
  dungeonExpectedKillSteps?: number[]
  dungeonCompletedKillSteps?: number[]
  dungeonFinalBossTarget?: string | null
  dungeonFinalBossMonsterId?: string | null
  lastRunOutcome?: string | null
  clientDungeonComplete?: boolean
}): string {
  return [
    `tamer=${session.selfTamerName ?? ''}`,
    `nick=${session.selfDigimonNickname ?? ''}`,
    `digimon_id=${session.selfDigimonId ?? ''}`,
    `map=${session.mapName ?? ''}`,
    `dungeon_id=${session.dungeonId ?? ''}`,
    `runActive=${session.dungeonRunActive}`,
    `startMs=${session.sessionStartMs ?? 'null'}`,
    `endMs=${session.sessionEndMs ?? 'null'}`,
    `outcome=${session.lastRunOutcome ?? ''}`,
    `clientComplete=${String(session.clientDungeonComplete ?? false)}`,
    `expectedSteps=[${(session.dungeonExpectedKillSteps ?? []).join(',')}]`,
    `completedSteps=[${(session.dungeonCompletedKillSteps ?? []).join(',')}]`,
    `finalBoss=${session.dungeonFinalBossTarget ?? ''}`,
    `finalBossId=${session.dungeonFinalBossMonsterId ?? ''}`,
  ].join(' ')
}

export function meterDebugLog(line: string) {
  pushLine(line)
}

export function meterDebugLogEvent(ev: EventStreamRecord, detail: string) {
  pushLine(`${meterDebugEventSummary(ev)} | ${detail}`)
}
