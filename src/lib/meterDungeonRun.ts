import type { EventStreamRecord } from './eventStreamFormat'
import { difficultyTierFromRaw, normalizeEventStreamDifficulty } from './dungeonDifficultyTags'
import { findDifficultyRow, readCachedDungeonDetails } from './dungeonDetailApi'

export type MeterDungeonRunOutcome = 'clear' | 'fail'

/** Wiki / EventStream objective progress tracked across the full dungeon pull. */
export type DungeonObjectiveProgressFields = {
  dungeonExpectedKillSteps: number[]
  dungeonCompletedKillSteps: number[]
  /** Highest-step boss label (e.g. `Togemon <Dungeon Boss>`). */
  dungeonFinalBossTarget: string | null
}

export function wikiObjectiveDisplayTarget(ob: {
  monster_name: string
  pen_name?: string
}): string {
  const name = String(ob.monster_name ?? '').trim()
  const pen = String(ob.pen_name ?? '').trim()
  if (!name) return pen
  if (!pen) return name
  return `${name} ${pen}`
}

export function resetDungeonObjectiveProgress(session: DungeonObjectiveProgressFields): void {
  session.dungeonExpectedKillSteps = []
  session.dungeonCompletedKillSteps = []
  session.dungeonFinalBossTarget = null
}

export function seedDungeonKillStepsFromWiki(
  session: DungeonObjectiveProgressFields & {
    dungeonId: string | null
    dungeonDifficulty: string | null
    dungeonDifficultyTier: number | null
  },
): void {
  resetDungeonObjectiveProgress(session)
  const id = session.dungeonId?.trim()
  if (!id) return

  const cached = readCachedDungeonDetails([id])[id]
  if (!cached) return

  let diffRow =
    (session.dungeonDifficulty
      ? findDifficultyRow(cached, session.dungeonDifficulty)
      : undefined) ??
    (session.dungeonDifficultyTier != null
      ? cached.difficulties.find(
          (d) => difficultyTierFromRaw(d.difficulty) === session.dungeonDifficultyTier,
        )
      : undefined) ??
    (cached.difficulties.length === 1 ? cached.difficulties[0] : undefined)

  if (!diffRow?.objectives?.length) return

  const steps = new Set<number>()
  let finalTarget: string | null = null
  let maxStep = -1
  for (const ob of diffRow.objectives) {
    if (!ob.monster_id?.trim() || !ob.monster_name?.trim()) continue
    if (ob.step > 0) steps.add(ob.step)
    if (ob.pen_name?.toLowerCase().includes('dungeon boss')) {
      finalTarget = wikiObjectiveDisplayTarget(ob)
    }
    if (ob.step > maxStep) {
      maxStep = ob.step
      if (!finalTarget) finalTarget = wikiObjectiveDisplayTarget(ob)
    }
  }

  session.dungeonExpectedKillSteps = [...steps].sort((a, b) => a - b)
  session.dungeonFinalBossTarget = finalTarget
}

function objectiveRowStep(row: Record<string, unknown>): number {
  const step = Number(row.step ?? row.objective_step ?? 0)
  return Number.isFinite(step) && step > 0 ? step : 0
}

function resolveObjectiveStepFromWiki(
  session: DungeonObjectiveProgressFields & {
    dungeonId: string | null
    dungeonDifficulty: string | null
    dungeonDifficultyTier: number | null
  },
  row: Record<string, unknown>,
): number {
  const id = session.dungeonId?.trim()
  if (!id) return 0
  const cached = readCachedDungeonDetails([id])[id]
  if (!cached) return 0
  const diffRow =
    (session.dungeonDifficulty
      ? findDifficultyRow(cached, session.dungeonDifficulty)
      : undefined) ??
    (session.dungeonDifficultyTier != null
      ? cached.difficulties.find(
          (d) => difficultyTierFromRaw(d.difficulty) === session.dungeonDifficultyTier,
        )
      : undefined)
  if (!diffRow) return 0
  const monsterId = String(row.monster_id ?? row.monsterId ?? '').trim()
  const name = normBossName(
    String(row.monster_name ?? row.monster ?? row.target ?? row.name ?? ''),
  )
  for (const ob of diffRow.objectives) {
    if (monsterId && ob.monster_id === monsterId) return ob.step
    if (name && normBossName(wikiObjectiveDisplayTarget(ob)) === name) return ob.step
    if (name && normBossName(ob.monster_name) === name) return ob.step
  }
  return 0
}

/** Merge completed kill steps from a `dungeon_progress` / query payload (partial updates OK). */
export function mergeDungeonObjectiveProgress(
  session: DungeonObjectiveProgressFields & {
    dungeonId: string | null
    dungeonDifficulty: string | null
    dungeonDifficultyTier: number | null
  },
  source: EventStreamRecord | unknown[],
): void {
  for (const raw of objectiveRows(source)) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!objectiveRowIsKill(row) || !objectiveRowComplete(row)) continue
    let step = objectiveRowStep(row)
    if (step <= 0) step = resolveObjectiveStepFromWiki(session, row)
    if (step <= 0) continue
    if (!session.dungeonCompletedKillSteps.includes(step)) {
      session.dungeonCompletedKillSteps.push(step)
    }
  }
}

/** True when every wiki kill step for this dungeon difficulty is marked complete. */
export function sessionAllKillObjectivesComplete(
  session: DungeonObjectiveProgressFields,
): boolean {
  const expected = session.dungeonExpectedKillSteps
  if (!expected.length) return false
  const done = new Set(session.dungeonCompletedKillSteps)
  return expected.every((step) => done.has(step))
}

export function markFinalKillStepComplete(session: DungeonObjectiveProgressFields): void {
  const finalStep = finalWikiKillStep(session)
  if (finalStep == null) return
  if (!session.dungeonCompletedKillSteps.includes(finalStep)) {
    session.dungeonCompletedKillSteps.push(finalStep)
  }
}

export function finalWikiKillStep(session: DungeonObjectiveProgressFields): number | null {
  const steps = session.dungeonExpectedKillSteps
  if (!steps.length) return null
  return Math.max(...steps)
}

export function sessionFinalKillStepComplete(session: DungeonObjectiveProgressFields): boolean {
  const finalStep = finalWikiKillStep(session)
  if (finalStep == null) return false
  return session.dungeonCompletedKillSteps.includes(finalStep)
}

/**
 * Final boss kill only — species-only names (e.g. "Togemon" at step 14) must not match
 * the step-15 `<Dungeon Boss>` label via substring rules.
 */
export function isFinalDungeonBossVictim(
  victimName: string,
  finalBossTarget: string | null,
): boolean {
  if (!finalBossTarget?.trim() || !victimName.trim()) return false
  const victim = victimName.trim()
  const final = finalBossTarget.trim()
  if (/<\s*dungeon\s+boss\s*>/i.test(victim)) {
    return bossNamesMatch(victim, final)
  }
  return normBossName(victim) === normBossName(final)
}

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
  const inBossGatedDungeon =
    Boolean(session.dungeonId?.trim()) && session.dungeonBossTargets.length > 0
  if (!inBossGatedDungeon) return true
  const victim = String(ev.target ?? '').trim()
  if (!victim) return false
  return combatVictimIsDungeonBoss(victim, session.dungeonBossTargets)
}

function objectiveRows(source: EventStreamRecord | unknown[]): unknown[] {
  if (Array.isArray(source)) return source
  if (source && typeof source === 'object' && Array.isArray((source as EventStreamRecord).objectives)) {
    return (source as EventStreamRecord).objectives as unknown[]
  }
  return []
}

/** Display name for a kill objective row (EventStream + wiki shapes). */
export function extractObjectiveTargetName(row: Record<string, unknown>): string {
  const direct = String(
    row.target ?? row.pen_name ?? row.monster_name ?? row.name ?? row.monster ?? '',
  ).trim()
  if (direct) return direct
  return String(row.text ?? '').trim()
}

function objectiveRowIsKill(row: Record<string, unknown>): boolean {
  const type = String(row.type ?? '').trim().toLowerCase()
  if (type && type !== 'kill') return false
  return Boolean(extractObjectiveTargetName(row))
}

/** True when the client marks this kill objective finished (dungeon_progress updates). */
export function objectiveRowComplete(row: Record<string, unknown>): boolean {
  if (row.complete === true || row.completed === true || row.done === true) return true
  const cur = Number(row.current ?? row.progress ?? row.killed ?? row.kill_count)
  const need = Number(row.count ?? row.required ?? row.total ?? 1)
  if (Number.isFinite(cur) && Number.isFinite(need) && need > 0 && cur >= need) return true
  return false
}

/** All kill objectives in the payload are complete (boss dead / run cleared). */
export function allKillObjectivesComplete(source: EventStreamRecord | unknown[]): boolean {
  const kills: Record<string, unknown>[] = []
  for (const raw of objectiveRows(source)) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (objectiveRowIsKill(row)) kills.push(row)
  }
  if (!kills.length) return false
  return kills.every(objectiveRowComplete)
}

/** Kill objective targets from `dungeon_progress` / `query_result.dungeon` (supports multi-boss runs). */
export function extractBossTargetsFromObjectives(source: EventStreamRecord | unknown[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of objectiveRows(source)) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!objectiveRowIsKill(row)) continue
    const target = extractObjectiveTargetName(row)
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

/** Entity name on `death` events (field varies by EventStream build). */
export function deathEntityName(ev: EventStreamRecord): string {
  return String(
    ev.name ?? ev.target ?? ev.pen_name ?? ev.monster_name ?? ev.monster ?? ev.digimon ?? '',
  ).trim()
}

export function deathIndicatesBossClear(
  ev: EventStreamRecord,
  bossTargets: readonly string[],
): boolean {
  if (String(ev.type ?? '') !== 'death') return false
  const name = deathEntityName(ev)
  if (!name || bossTargets.length === 0) return false
  return bossTargets.some((boss) => bossNamesMatch(name, boss))
}

/** Boss took a killing blow (target HP 0 on a combat line). */
export function combatKilledDungeonBoss(
  session: { dungeonId: string | null; dungeonBossTargets: readonly string[] },
  ev: EventStreamRecord,
): boolean {
  if (!session.dungeonId?.trim() || session.dungeonBossTargets.length === 0) return false
  const victim = String(ev.target ?? '').trim()
  if (!victim || !combatVictimIsDungeonBoss(victim, session.dungeonBossTargets)) return false
  const hp = Number(ev.hp)
  return Number.isFinite(hp) && hp <= 0
}

/** Same pull-boundary rules as `applyDungeonProgress` in the meter stream. */
export function shouldStartNewDungeonPull(
  session: {
    dungeonId: string | null
    dungeonRunActive: boolean
    lastRunOutcome: MeterDungeonRunOutcome | null
  },
  incomingDungeonId: string,
): boolean {
  const prev = session.dungeonId?.trim() || null
  const id = incomingDungeonId.trim()
  if (!id) return false
  return (
    !session.dungeonRunActive ||
    session.lastRunOutcome != null ||
    (prev != null && prev !== id)
  )
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
} & DungeonObjectiveProgressFields) {
  session.dungeonId = null
  session.dungeonName = null
  session.dungeonNameLoading = false
  session.dungeonDifficulty = null
  session.dungeonDifficultyTier = null
  session.dungeonRunActive = false
  session.dungeonBossTargets = []
  resetDungeonObjectiveProgress(session)
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
