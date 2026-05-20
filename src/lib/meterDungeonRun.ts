import type { EventStreamRecord } from './eventStreamFormat'
import { difficultyTierFromRaw, normalizeEventStreamDifficulty } from './dungeonDifficultyTags'

export type MeterDungeonRunOutcome = 'clear' | 'fail'

export type MeterRunContextDisplay = {
  mapName: string | null
  dungeonName: string | null
  dungeonNameLoading: boolean
  dungeonDifficulty: string | null
  bossNames: string[]
  lastRunOutcome: MeterDungeonRunOutcome | null
  inDungeon: boolean
}

export type DungeonDifficultyMeta = {
  label: string | null
  tier: number | null
}

function difficultyRawFromEvent(ev: EventStreamRecord): unknown {
  if (ev.difficulty != null && ev.difficulty !== '') return ev.difficulty
  const block = ev.dungeon
  if (block && typeof block === 'object' && !Array.isArray(block)) {
    return (block as Record<string, unknown>).difficulty
  }
  return null
}

/** Story / Normal / Hard + tier (1/2/3) from `dungeon_progress` or `query_result.dungeon`. */
export function extractDungeonDifficultyMeta(ev: EventStreamRecord): DungeonDifficultyMeta {
  const raw = difficultyRawFromEvent(ev)
  return {
    label: normalizeEventStreamDifficulty(raw),
    tier: difficultyTierFromRaw(raw),
  }
}

export function extractDungeonDifficulty(ev: EventStreamRecord): string | null {
  return extractDungeonDifficultyMeta(ev).label
}

export function ingestEventStreamMap(
  session: { mapName: string | null; mapId: string | null },
  ev: EventStreamRecord,
) {
  const map = String(ev.map ?? '').trim()
  const mapId = String(ev.map_id ?? '').trim()
  if (map) session.mapName = map
  if (mapId) session.mapId = mapId
}

function normBossName(s: string): string {
  return s.trim().toLowerCase()
}

export function bossNamesMatch(deathOrTarget: string, bossTarget: string): boolean {
  const a = normBossName(deathOrTarget)
  const b = normBossName(bossTarget)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

/** True when combat `target` is one of the dungeon kill objectives. */
export function combatVictimIsDungeonBoss(
  victimName: string,
  bossTargets: readonly string[],
): boolean {
  const victim = victimName.trim()
  if (!victim || bossTargets.length === 0) return false
  return bossTargets.some((boss) => bossNamesMatch(victim, boss))
}

/**
 * True when this combat event damaged a real target (not a phantom row).
 * In dungeon with known bosses, the target must match a kill objective.
 */
export function combatHitStartsMeterTimer(
  session: { dungeonId: string | null; dungeonBossTargets: readonly string[] },
  ev: EventStreamRecord,
): boolean {
  const victim = String(ev.target ?? '').trim()
  if (!victim) return false
  if (session.dungeonId?.trim() && session.dungeonBossTargets.length) {
    return combatVictimIsDungeonBoss(victim, session.dungeonBossTargets)
  }
  return true
}

function objectiveRows(source: EventStreamRecord | unknown[]): unknown[] {
  if (Array.isArray(source)) return source
  if (source && typeof source === 'object' && Array.isArray((source as EventStreamRecord).objectives)) {
    return (source as EventStreamRecord).objectives as unknown[]
  }
  return []
}

/** Kill objective targets from `dungeon_progress` / `query_result.dungeon` (supports multi-boss runs). */
export function extractBossTargetsFromObjectives(source: EventStreamRecord | unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of objectiveRows(source)) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    const target = String(row.target ?? '').trim()
    if (!target) continue
    const type = String(row.type ?? '').trim().toLowerCase()
    if (type && type !== 'kill') continue
    const key = normBossName(target)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(target)
  }
  return out
}

export function syncDungeonBossTargets(
  session: { dungeonBossTargets: string[] },
  ev: EventStreamRecord,
) {
  const targets = extractBossTargetsFromObjectives(ev)
  if (targets.length) session.dungeonBossTargets = targets
}

export function deathIndicatesBossClear(
  ev: EventStreamRecord,
  bossTargets: readonly string[],
): boolean {
  if (String(ev.type ?? '') !== 'death') return false
  const name = String(ev.name ?? '').trim()
  if (!name || bossTargets.length === 0) return false
  return bossTargets.some((boss) => bossNamesMatch(name, boss))
}

export function markDungeonRunClear(session: {
  dungeonRunActive: boolean
  lastRunOutcome: MeterDungeonRunOutcome | null
}) {
  session.lastRunOutcome = 'clear'
  session.dungeonRunActive = false
}

export function markDungeonRunFail(session: {
  dungeonRunActive: boolean
  lastRunOutcome: MeterDungeonRunOutcome | null
}) {
  session.lastRunOutcome = 'fail'
  session.dungeonRunActive = false
}

export function leaveDungeonSession(session: {
  dungeonId: string | null
  dungeonName: string | null
  dungeonNameLoading: boolean
  dungeonDifficulty: string | null
  dungeonDifficultyTier: number | null
  dungeonRunActive: boolean
  dungeonBossTargets: string[]
  sessionEndMs?: number | null
}) {
  session.dungeonId = null
  session.dungeonName = null
  session.dungeonNameLoading = false
  session.dungeonDifficulty = null
  session.dungeonDifficultyTier = null
  session.dungeonRunActive = false
  session.dungeonBossTargets = []
  if ('sessionEndMs' in session) session.sessionEndMs = null
}

export function meterRunContextDisplay(session: {
  mapName: string | null
  dungeonId: string | null
  dungeonName: string | null
  dungeonNameLoading: boolean
  dungeonDifficulty: string | null
  dungeonBossTargets: string[]
  lastRunOutcome: MeterDungeonRunOutcome | null
}): MeterRunContextDisplay {
  const inDungeon = Boolean(session.dungeonId?.trim())
  const diffRaw = session.dungeonDifficulty?.trim() || null
  return {
    mapName: inDungeon ? null : session.mapName?.trim() || null,
    dungeonName: inDungeon
      ? session.dungeonNameLoading
        ? null
        : session.dungeonName?.trim() || session.dungeonId?.trim() || null
      : null,
    dungeonNameLoading: inDungeon && session.dungeonNameLoading,
    dungeonDifficulty: inDungeon && diffRaw ? diffRaw : null,
    bossNames: inDungeon ? session.dungeonBossTargets : [],
    lastRunOutcome: inDungeon ? session.lastRunOutcome : null,
    inDungeon,
  }
}
