import { findDifficultyRow, readCachedDungeonDetails } from './dungeonDetailApi'
import { bossNamesMatch, deathEntityName, wikiObjectiveDisplayTarget } from './meterDungeonRun'
import type { MonsterSkill, TimelineFightPayload } from '../types'
import type { FlatSkillEntry } from './timelineSchedule'

/** Command Server + Twins — show one boss rotation at a time from combat target. */
export const OBJECTIVE_TARGET_FILTER_DUNGEON_IDS = new Set([
  'u15q6eum', // Command Server
  'u1evhxxo', // Twins of Destruction
])

export type FightObjectiveLike = {
  monster_name: string
  pen_name?: string
}

export function dungeonUsesObjectiveTargetFilter(dungeonId: string | null | undefined): boolean {
  const id = dungeonId?.trim()
  return Boolean(id && OBJECTIVE_TARGET_FILTER_DUNGEON_IDS.has(id))
}

export function objectiveIndexForCombatTarget(
  objectives: readonly FightObjectiveLike[],
  targetName: string,
): number | null {
  const victim = targetName.trim()
  if (!victim || !objectives.length) return null
  for (let i = 0; i < objectives.length; i++) {
    const ob = objectives[i]
    const full = wikiObjectiveDisplayTarget(ob)
    if (bossNamesMatch(victim, full)) return i
    const species = ob.monster_name?.trim()
    if (species && bossNamesMatch(victim, species)) return i
    const pen = ob.pen_name?.trim()
    if (pen && bossNamesMatch(victim, pen)) return i
  }
  return null
}

function wikiObjectivesForDungeon(
  dungeonId: string,
  difficulty: string | null | undefined,
): FightObjectiveLike[] {
  const cached = readCachedDungeonDetails([dungeonId])[dungeonId]
  if (!cached?.difficulties?.length) return []
  const diff = difficulty?.trim()
  const row =
    (diff ? findDifficultyRow(cached, diff) : undefined) ??
    (cached.difficulties.length === 1 ? cached.difficulties[0] : undefined)
  return row?.objectives ?? []
}

export function updateActiveObjectiveFromCombat(
  dungeonId: string | null | undefined,
  objectives: readonly FightObjectiveLike[] | null,
  difficulty: string | null | undefined,
  current: number | null,
  targetName: string,
): number | null {
  if (!dungeonUsesObjectiveTargetFilter(dungeonId)) return current
  const list =
    objectives?.length ? objectives : wikiObjectivesForDungeon(dungeonId!.trim(), difficulty)
  if (!list.length) return current
  const idx = objectiveIndexForCombatTarget(list, targetName)
  if (idx != null) return idx
  return current
}

export function updateActiveObjectiveFromDeath(
  dungeonId: string | null | undefined,
  objectives: readonly FightObjectiveLike[] | null,
  difficulty: string | null | undefined,
  current: number | null,
  victimName: string,
): number | null {
  if (!dungeonUsesObjectiveTargetFilter(dungeonId) || current == null) return current
  const list =
    objectives?.length ? objectives : wikiObjectivesForDungeon(dungeonId!.trim(), difficulty)
  if (!list.length) return current
  const idx = objectiveIndexForCombatTarget(list, victimName)
  if (idx === current) return null
  return current
}

export function updateActiveObjectiveFromDeathEvent(
  dungeonId: string | null | undefined,
  objectives: readonly FightObjectiveLike[] | null,
  difficulty: string | null | undefined,
  current: number | null,
  ev: { type?: unknown; name?: unknown; target?: unknown; pen_name?: unknown; monster_name?: unknown; monster?: unknown; digimon?: unknown },
): number | null {
  if (String(ev.type ?? '') !== 'death') return current
  return updateActiveObjectiveFromDeath(
    dungeonId,
    objectives,
    difficulty,
    current,
    deathEntityName(ev),
  )
}

export function filterFlatSkillsForActiveObjective(
  dungeonId: string | null | undefined,
  flat: FlatSkillEntry[],
  activeObjectiveIndex: number | null,
): FlatSkillEntry[] {
  if (!dungeonUsesObjectiveTargetFilter(dungeonId)) return flat
  if (activeObjectiveIndex == null) return []
  return flat.filter((e) => e.objectiveIndex === activeObjectiveIndex)
}

export function fightSkillsForActiveObjectiveLabeling(
  fight: TimelineFightPayload,
  dungeonId: string | null | undefined,
  activeObjectiveIndex: number | null,
): MonsterSkill[] {
  if (!dungeonUsesObjectiveTargetFilter(dungeonId)) {
    return fight.monsterSkills.flatMap((m) => m.skills ?? [])
  }
  if (activeObjectiveIndex == null) return []
  const block = fight.monsterSkills[activeObjectiveIndex]
  return block?.skills ?? []
}
