import type { TimelineFightPayload } from '../types'

export type FightPayloadNormalizeResult =
  | { ok: true; value: TimelineFightPayload }
  | { ok: false; reason: string }

/** Detailed rejection reasons — use in the timeline UI when skills never appear. */
export function normalizeFightPayloadDetailed(
  raw: unknown,
): FightPayloadNormalizeResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'payload is missing or not a plain object' }
  }
  const o = raw as Record<string, unknown>
  if (typeof o.dungeonName !== 'string') {
    return {
      ok: false,
      reason: `dungeonName must be a string (got ${typeof o.dungeonName})`,
    }
  }
  if (typeof o.difficulty !== 'string') {
    return {
      ok: false,
      reason: `difficulty must be a string (got ${typeof o.difficulty})`,
    }
  }
  const time_limit_sec = Number(o.time_limit_sec)
  const death_limit = Number(o.death_limit)
  if (!Number.isFinite(time_limit_sec)) {
    return {
      ok: false,
      reason: `time_limit_sec is not a finite number (got ${String(o.time_limit_sec)})`,
    }
  }
  if (!Number.isFinite(death_limit)) {
    return {
      ok: false,
      reason: `death_limit is not a finite number (got ${String(o.death_limit)})`,
    }
  }
  if (!Array.isArray(o.objectives)) {
    return { ok: false, reason: 'objectives must be an array' }
  }
  if (!Array.isArray(o.monsterSkills)) {
    return { ok: false, reason: 'monsterSkills must be an array' }
  }
  return {
    ok: true,
    value: {
      dungeonName: o.dungeonName,
      difficulty: o.difficulty,
      time_limit_sec,
      death_limit,
      objectives: o.objectives as TimelineFightPayload['objectives'],
      monsterSkills: o.monsterSkills as TimelineFightPayload['monsterSkills'],
    },
  }
}

/** Accept payloads from IPC after JSON round-trip (numbers may arrive loose). */
export function normalizeFightPayload(raw: unknown): TimelineFightPayload | null {
  const r = normalizeFightPayloadDetailed(raw)
  return r.ok ? r.value : null
}
