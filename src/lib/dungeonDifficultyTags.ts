const CANON = ['Story', 'Normal', 'Hard'] as const

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

/** CSS module-style class string for difficulty pill. */
export function difficultyTagClassName(label: string): string {
  const n = label.trim().toLowerCase()
  if (n === 'story') return 'dungeon-diff-tag dungeon-diff-tag--story'
  if (n === 'normal') return 'dungeon-diff-tag dungeon-diff-tag--normal'
  if (n === 'hard') return 'dungeon-diff-tag dungeon-diff-tag--hard'
  return 'dungeon-diff-tag dungeon-diff-tag--other'
}
