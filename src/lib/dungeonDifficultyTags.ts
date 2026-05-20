const CANON = ['Story', 'Normal', 'Hard'] as const

/** In-game EventStream `difficulty` id → wiki-style label. */
const DIFFICULTY_BY_ID: Record<number, (typeof CANON)[number]> = {
  1: 'Story',
  2: 'Normal',
  3: 'Hard',
}

/**
 * EventStream sends `difficulty` as 1 / 2 / 3 (or string). Wiki uses Story / Normal / Hard.
 */
/** Numeric EventStream difficulty (1 Story, 2 Normal, 3 Hard). */
export function difficultyTierFromRaw(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.round(raw)
    if (n >= 1 && n <= 3) return n
  }
  const s = String(raw ?? '').trim()
  if (!s) return null
  const asNum = Number(s)
  if (Number.isFinite(asNum) && String(Math.round(asNum)) === s) {
    const n = Math.round(asNum)
    if (n >= 1 && n <= 3) return n
  }
  const label = normalizeEventStreamDifficulty(raw)
  if (!label) return null
  const low = label.toLowerCase()
  if (low === 'story') return 1
  if (low === 'normal') return 2
  if (low === 'hard') return 3
  return null
}

/** Upload dungeon parses only on Normal (2) or Hard (3), while in a dungeon. */
export function isDungeonParseUploadAllowed(
  dungeonId: string | null | undefined,
  difficultyTier: number | null | undefined,
): boolean {
  if (!dungeonId?.trim()) return false
  const tier = difficultyTier ?? 0
  return tier >= 2
}

export function normalizeEventStreamDifficulty(raw: unknown): string | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const mapped = DIFFICULTY_BY_ID[Math.round(raw)]
    if (mapped) return mapped
  }
  const s = String(raw).trim()
  if (!s) return null
  const asNum = Number(s)
  if (Number.isFinite(asNum) && String(Math.round(asNum)) === s) {
    const mapped = DIFFICULTY_BY_ID[Math.round(asNum)]
    if (mapped) return mapped
  }
  const low = s.toLowerCase()
  const hit = CANON.find((c) => c.toLowerCase() === low)
  return hit ?? s
}

/**
 * Story → Normal → Hard first (case-insensitive match), then any other wiki labels.
 */
export function orderedDifficultyLabels(labels: string[] | undefined): string[] {
  if (!labels?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const canon of CANON) {
    const hit = labels.find((l) => l.trim().toLowerCase() === canon.toLowerCase())
    if (hit) {
      seen.add(canon.toLowerCase())
      out.push(canon)
    }
  }
  for (const l of labels) {
    const t = l.trim()
    const low = t.toLowerCase()
    if (!low || seen.has(low)) continue
    seen.add(low)
    out.push(t)
  }
  return out
}

/** Wiki / EventStream label → display title (Story, Normal, Hard, or original). */
export function formatDifficultyDisplay(label: string | null | undefined): string | null {
  return normalizeEventStreamDifficulty(label)
}

/** CSS module-style class string for difficulty pill. */
export function difficultyTagClassName(label: string): string {
  const n = label.trim().toLowerCase()
  if (n === 'story') return 'dungeon-diff-tag dungeon-diff-tag--story'
  if (n === 'normal') return 'dungeon-diff-tag dungeon-diff-tag--normal'
  if (n === 'hard') return 'dungeon-diff-tag dungeon-diff-tag--hard'
  return 'dungeon-diff-tag dungeon-diff-tag--other'
}
