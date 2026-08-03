/** Legacy window constant; companion no longer blocks peer uploads by fingerprint. */
export const PARTY_UPLOAD_DEDUPE_WINDOW_SEC = 10

export function normalizePartyPlayerKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Stable fingerprint for a dungeon party clear: scope + duration + sorted tamers.
 * Stored on `meter_parses` for debugging. Peer meters of the same clear each insert
 * their own row and rank their sole `isSelf`; same-uploader retries are collapsed by
 * `process-meter-leaderboard`.
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
