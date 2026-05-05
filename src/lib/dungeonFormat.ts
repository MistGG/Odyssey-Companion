/** Format seconds as a short timer (e.g. 7:00, 30:00, 1:00:00). */
export function formatTimeLimitSec(sec: number) {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

export type DungeonDifficultyRow = {
  difficulty: string
  time_limit_sec: number
  death_limit: number
}

export function summarizeDifficultyRows(rows: DungeonDifficultyRow[]) {
  return rows
    .map(
      (r) =>
        `${r.difficulty} ${formatTimeLimitSec(r.time_limit_sec)} · ${r.death_limit} deaths`,
    )
    .join(' · ')
}
