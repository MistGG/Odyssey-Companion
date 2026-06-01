/** Window for treating separate uploads as the same party clear. */
export const PARTY_UPLOAD_DEDUPE_WINDOW_SEC = 10

export function normalizePartyPlayerKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Stable fingerprint for a dungeon party clear: scope + duration + sorted tamers.
 * Used to reject duplicate uploads when multiple party members upload the same run.
 */
export function buildPartyRunFingerprint(
  dungeonId: string,
  difficultyId: number,
  durationSec: number,
  members: Array<{ tamerName?: string; displayLabel?: string; memberKey?: string }>,
): string {
  const players = members
    .map((m) =>
      normalizePartyPlayerKey(m.tamerName?.trim() || m.displayLabel?.trim() || m.memberKey?.trim() || ''),
    )
    .filter(Boolean)
    .sort()
  const dur = Math.max(0, Math.round(durationSec))
  return `${dungeonId.trim()}:${difficultyId}:${dur}:${players.join('\u0001')}`
}
