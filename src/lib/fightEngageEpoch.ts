/** Shared dungeon pull key for fight engage epoch (timeline + HUD + meter). */
export function fightEngageDungeonKey(dungeonId: string, difficulty: string): string {
  return `${dungeonId.trim()}|${difficulty.trim()}`
}

/** Prefer EventStream `ts`; fall back to wall clock. */
export function eventStreamTimeMs(ev: { ts?: unknown }): number {
  const ts = Number(ev.ts)
  return Number.isFinite(ts) && ts > 0 ? ts : Date.now()
}

export function fightEngageElapsedMs(engagedAtMs: number, nowMs = Date.now()): number {
  return Math.max(0, nowMs - engagedAtMs)
}
