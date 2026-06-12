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
  /** Wiki `monster_id` for the final `<Dungeon Boss>` step (e.g. SCC Togemon step 15). */
  dungeonFinalBossMonsterId: string | null
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
  session.dungeonFinalBossMonsterId = null
}

/** Mark every wiki kill step complete (client sent all objectives done). */
export function syncAllWikiKillStepsComplete(session: DungeonObjectiveProgressFields): void {
  for (const step of session.dungeonExpectedKillSteps) {
    if (!session.dungeonCompletedKillSteps.includes(step)) {
      session.dungeonCompletedKillSteps.push(step)
    }
  }
  markFinalKillStepComplete(session)
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
  let finalMonsterId: string | null = null
  let maxStep = -1
  for (const ob of diffRow.objectives) {
    if (!ob.monster_id?.trim() || !ob.monster_name?.trim()) continue
    if (ob.step > 0) steps.add(ob.step)
    if (ob.pen_name?.toLowerCase().includes('dungeon boss')) {
      finalTarget = wikiObjectiveDisplayTarget(ob)
      finalMonsterId = ob.monster_id.trim()
    }
    if (ob.step > maxStep) {
      maxStep = ob.step
      if (!finalTarget) finalTarget = wikiObjectiveDisplayTarget(ob)
      if (!finalMonsterId && ob.monster_id?.trim()) finalMonsterId = ob.monster_id.trim()
    }
  }

  session.dungeonExpectedKillSteps = [...steps].sort((a, b) => a - b)
  session.dungeonFinalBossTarget = finalTarget
  session.dungeonFinalBossMonsterId = finalMonsterId
}

function wikiDiffRowForSession(
  session: {
    dungeonId: string | null
    dungeonDifficulty: string | null
    dungeonDifficultyTier: number | null
  },
) {
  const id = session.dungeonId?.trim()
  if (!id) return undefined
  const cached = readCachedDungeonDetails([id])[id]
  if (!cached) return undefined
  return (
    (session.dungeonDifficulty
      ? findDifficultyRow(cached, session.dungeonDifficulty)
      : undefined) ??
    (session.dungeonDifficultyTier != null
      ? cached.difficulties.find(
          (d) => difficultyTierFromRaw(d.difficulty) === session.dungeonDifficultyTier,
        )
      : undefined) ??
    (cached.difficulties.length === 1 ? cached.difficulties[0] : undefined)
  )
}

/** EventStream shape: `Defeat Gazimon <Mini Boss> 1/1` */
export function parseEventStreamObjectiveText(
  text: string,
): { label: string; cur: number; need: number } | null {
  const m = text.trim().match(/^Defeat\s+(.+?)\s+(\d+)\s*\/\s*(\d+)\s*$/i)
  if (!m) return null
  const cur = Number(m[2])
  const need = Number(m[3])
  if (!Number.isFinite(cur) || !Number.isFinite(need) || need <= 0) return null
  return { label: m[1].trim(), cur, need }
}

export function parsedObjectiveProgress(
  row: Record<string, unknown>,
): { label: string; cur: number; need: number } | null {
  return parseEventStreamObjectiveText(String(row.text ?? ''))
}

function listWikiStepsMatchingLabel(
  session: {
    dungeonId: string | null
    dungeonDifficulty: string | null
    dungeonDifficultyTier: number | null
  },
  label: string,
  monsterId = '',
): number[] {
  const diffRow = wikiDiffRowForSession(session)
  if (!diffRow) return []
  const want = label.trim()
  if (!want && !monsterId) return []
  const steps: number[] = []
  for (const ob of diffRow.objectives) {
    if (monsterId && ob.monster_id === monsterId) {
      if (ob.step > 0) steps.push(ob.step)
      continue
    }
    if (!want) continue
    if (bossNamesMatch(want, wikiObjectiveDisplayTarget(ob))) steps.push(ob.step)
    else if (bossNamesMatch(want, ob.monster_name)) steps.push(ob.step)
  }
  return [...new Set(steps.filter((s) => s > 0))].sort((a, b) => a - b)
}

/** Mark the next incomplete wiki step that matches this boss label (handles duplicate species). */
export function markNextWikiStepForVictim(
  session: DungeonObjectiveProgressFields & {
    dungeonId: string | null
    dungeonDifficulty: string | null
    dungeonDifficultyTier: number | null
  },
  victimLabel: string,
  victimMonsterId = '',
): number | null {
  const steps = listWikiStepsMatchingLabel(session, victimLabel, victimMonsterId)
  for (const step of steps) {
    if (!session.dungeonCompletedKillSteps.includes(step)) {
      session.dungeonCompletedKillSteps.push(step)
      return step
    }
  }
  return null
}

/** Credit boss kills from `death` events (EventStream omits step ids on objectives). */
export function mergeDeathIntoObjectiveProgress(
  session: DungeonObjectiveProgressFields &
    DungeonBossTargetTracking & {
      dungeonId: string | null
      dungeonDifficulty: string | null
      dungeonDifficultyTier: number | null
    },
  ev: EventStreamRecord,
): number | null {
  if (!session.dungeonId?.trim() || !session.dungeonExpectedKillSteps.length) return null
  const victim = deathEntityName(ev)
  if (!victim) return null
  const victimId = deathEntityMonsterId(ev)
  const targets = session.dungeonBossTargets.filter((t) => t.trim())
  const matchesKnownBoss = targets.some((t) => bossNamesMatch(victim, t))
  const matchesFinal = isFinalDungeonBossKill(victim, victimId, session)
  if (!matchesKnownBoss && !matchesFinal) return null
  recordBossTargetKill(session, victim, session.dungeonBossTargets)
  if (isFinalDungeonBossKill(victim, victimId, session)) {
    markFinalKillStepComplete(session)
    return finalWikiKillStep(session)
  }
  return markNextWikiStepForVictim(session, victim, victimId)
}

export type DungeonBossTargetTracking = {
  dungeonBossTargets: string[]
  dungeonKilledBossTargets: string[]
}

/** Union boss labels across partial `dungeon_progress` snapshots (multi-phase dungeons). */
export function syncDungeonBossTargets(
  session: Pick<DungeonBossTargetTracking, 'dungeonBossTargets'>,
  source: EventStreamRecord | unknown[],
): void {
  const incoming = extractBossTargetsFromObjectives(source)
  if (!incoming.length) return
  const seen = new Set(session.dungeonBossTargets.map(normBossName))
  for (const target of incoming) {
    const key = normBossName(target)
    if (seen.has(key)) continue
    seen.add(key)
    session.dungeonBossTargets.push(target)
  }
}

export function resetDungeonBossTargetTracking(session: DungeonBossTargetTracking): void {
  session.dungeonBossTargets = []
  session.dungeonKilledBossTargets = []
}

/** Record a boss kill when the victim matches a known dungeon objective target. */
export function recordBossTargetKill(
  session: Pick<DungeonBossTargetTracking, 'dungeonKilledBossTargets'>,
  victimLabel: string,
  bossTargets: readonly string[],
): void {
  const victim = victimLabel.trim()
  if (!victim || !bossTargets.length) return
  for (const target of bossTargets) {
    if (!bossNamesMatch(victim, target)) continue
    const killed = session.dungeonKilledBossTargets
    if (killed.some((k) => bossNamesMatch(k, target))) return
    killed.push(target)
    return
  }
}

export function finalBossTargetKilled(
  session: Pick<DungeonObjectiveProgressFields, 'dungeonFinalBossTarget'> &
    Pick<DungeonBossTargetTracking, 'dungeonKilledBossTargets'>,
): boolean {
  const final = session.dungeonFinalBossTarget?.trim()
  if (!final) return true
  return session.dungeonKilledBossTargets.some((k) => bossNamesMatch(k, final))
}

export function allBossTargetsKilled(session: DungeonBossTargetTracking): boolean {
  const targets = session.dungeonBossTargets.filter((t) => t.trim())
  if (!targets.length) return true
  const killed = session.dungeonKilledBossTargets
  return targets.every((target) => killed.some((k) => bossNamesMatch(k, target)))
}

/** Add synthetic wiki steps when EventStream reports more bosses than the wiki lists. */
export function syncExpectedKillStepsFromBossTargets(
  session: DungeonObjectiveProgressFields & Pick<DungeonBossTargetTracking, 'dungeonBossTargets'>,
): void {
  const targetCount = session.dungeonBossTargets.length
  if (targetCount <= session.dungeonExpectedKillSteps.length) return
  const steps = new Set(session.dungeonExpectedKillSteps)
  let next = steps.size ? Math.max(...steps) + 1 : 1
  while (steps.size < targetCount) {
    steps.add(next++)
  }
  session.dungeonExpectedKillSteps = [...steps].sort((a, b) => a - b)
}

function completeKillObjectiveRows(source: EventStreamRecord | unknown[]): Record<string, unknown>[] {
  const kills: Record<string, unknown>[] = []
  for (const raw of objectiveRows(source)) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!objectiveRowIsKill(row) || !objectiveRowComplete(row)) continue
    kills.push(row)
  }
  return kills
}

/** Merge completed kill steps from a `dungeon_progress` / query payload (partial updates OK). */
export function mergeDungeonObjectiveProgress(
  session: DungeonObjectiveProgressFields &
    DungeonBossTargetTracking & {
      dungeonId: string | null
      dungeonDifficulty: string | null
      dungeonDifficultyTier: number | null
      clientReportedFullClear?: boolean
    },
  source: EventStreamRecord | unknown[],
): void {
  if (eventStreamReportsFullClear(source, session)) {
    syncAllWikiKillStepsComplete(session)
    session.clientReportedFullClear = true
  }
  for (const raw of objectiveRows(source)) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (!objectiveRowIsKill(row) || !objectiveRowComplete(row)) continue
    const parsed = parsedObjectiveProgress(row)
    const label = parsed?.label ?? extractObjectiveTargetName(row)
    const monsterId = String(row.monster_id ?? row.monsterId ?? '').trim()
    if (label) recordBossTargetKill(session, label, session.dungeonBossTargets)
    if (label || monsterId) {
      markNextWikiStepForVictim(session, label, monsterId)
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

/** All wiki kill steps done — infer a clear even when `dungeonRunActive` never flipped true (query-only entry). */
export function sessionObjectiveProgressIndicatesClear(
  session: DungeonObjectiveProgressFields &
    DungeonBossTargetTracking & { dungeonId?: string | null; clientReportedFullClear?: boolean },
): boolean {
  if (!session.dungeonId?.trim()) return false
  if (!sessionAllKillObjectivesComplete(session) || !sessionFinalKillStepComplete(session)) {
    return false
  }
  if (session.clientReportedFullClear) return true
  return dungeonBossPhaseComplete(session)
}

export function deathEntityMonsterId(ev: EventStreamRecord): string {
  return String(ev.monster_id ?? ev.monsterId ?? '').trim()
}

/** Species-only names must not substring-match the final `<Dungeon Boss>` label. */
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

/**
 * Final boss kill — prefer wiki `monster_id` (SCC step-14 vs step-15 Togemon share a name).
 * Falls back to `<Dungeon Boss>` pen or exact full target label match.
 */
export function isFinalDungeonBossKill(
  victimName: string,
  victimMonsterId: string,
  session: Pick<DungeonObjectiveProgressFields, 'dungeonFinalBossTarget' | 'dungeonFinalBossMonsterId'>,
): boolean {
  const finalId = session.dungeonFinalBossMonsterId?.trim()
  const id = victimMonsterId.trim()
  if (finalId && id && normKey(finalId) === normKey(id)) return true
  return isFinalDungeonBossVictim(victimName, session.dungeonFinalBossTarget)
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
  const parsed = parsedObjectiveProgress(row)
  if (parsed?.label) return parsed.label
  const direct = String(
    row.target ?? row.pen_name ?? row.monster_name ?? row.name ?? row.monster ?? '',
  ).trim()
  if (direct) return direct
  return String(row.text ?? '').trim()
}

function objectiveRowIsKill(row: Record<string, unknown>): boolean {
  const type = String(row.type ?? '').trim().toLowerCase()
  if (type && type !== 'kill') return false
  if (parsedObjectiveProgress(row)) return true
  return Boolean(extractObjectiveTargetName(row))
}

/** True when the client marks this kill objective finished (dungeon_progress updates). */
export function objectiveRowComplete(row: Record<string, unknown>): boolean {
  if (row.complete === true || row.completed === true || row.done === true) return true
  const parsed = parsedObjectiveProgress(row)
  if (parsed && parsed.cur >= parsed.need) return true
  const cur = Number(row.current ?? row.progress ?? row.killed ?? row.kill_count)
  const need = Number(row.count ?? row.required ?? row.total ?? 1)
  if (Number.isFinite(cur) && Number.isFinite(need) && need > 0 && cur >= need) return true
  return false
}

/** All kill objectives in the payload are complete (boss dead / run cleared). */
export function allKillObjectivesComplete(
  source: EventStreamRecord | unknown[],
  requiredBossTargets: readonly string[] = [],
): boolean {
  const kills: Record<string, unknown>[] = []
  for (const raw of objectiveRows(source)) {
    if (!raw || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (objectiveRowIsKill(row)) kills.push(row)
  }
  if (!kills.length) return false
  if (!kills.every(objectiveRowComplete)) return false
  if (!requiredBossTargets.length) return true
  const completeLabels = kills
    .filter(objectiveRowComplete)
    .map((row) => extractObjectiveTargetName(row))
  return requiredBossTargets.every((target) =>
    completeLabels.some((label) => bossNamesMatch(label, target)),
  )
}

/**
 * True when the client payload marks every known boss dead — not just every row in a partial snapshot.
 * When a final boss is known, that boss must appear complete in the payload (Twins: Giga-only ≠ clear).
 */
export function eventStreamReportsFullClear(
  source: EventStreamRecord | unknown[],
  session: {
    dungeonBossTargets?: readonly string[]
    dungeonFinalBossTarget?: string | null
  },
): boolean {
  const required = (session.dungeonBossTargets ?? []).filter((t) => t.trim())
  if (!allKillObjectivesComplete(source, required)) return false
  // Multi-boss: every known target must be complete in this payload (order-independent).
  if (required.length >= 2) return true
  const final = session.dungeonFinalBossTarget?.trim()
  if (!final) return true
  const completeLabels = completeKillObjectiveRows(source).map((row) =>
    extractObjectiveTargetName(row),
  )
  return completeLabels.some((label) => bossNamesMatch(label, final))
}

/** True when this pull has no remaining dungeon boss targets (any kill order). */
export function dungeonBossPhaseComplete(
  session: DungeonBossTargetTracking &
    Pick<DungeonObjectiveProgressFields, 'dungeonFinalBossTarget'>,
): boolean {
  const targets = session.dungeonBossTargets.filter((t) => t.trim())
  if (targets.length >= 2) return allBossTargetsKilled(session)
  if (targets.length === 1) {
    return session.dungeonKilledBossTargets.some((k) => bossNamesMatch(k, targets[0]))
  }
  return finalBossTargetKilled(session)
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
} & DungeonObjectiveProgressFields &
  DungeonBossTargetTracking) {
  session.dungeonId = null
  session.dungeonName = null
  session.dungeonNameLoading = false
  session.dungeonDifficulty = null
  session.dungeonDifficultyTier = null
  session.dungeonRunActive = false
  resetDungeonBossTargetTracking(session)
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
