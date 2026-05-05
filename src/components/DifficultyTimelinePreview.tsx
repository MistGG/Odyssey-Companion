import type { DungeonDetail, MonsterDetail } from '../types'
import { findDifficultyRow } from '../lib/dungeonDetailApi'
import { formatTimeLimitSec } from '../lib/dungeonFormat'
import { SkillTimelineList } from './SkillTimelineList'

type Props = {
  dungeonDetail: DungeonDetail | undefined
  difficultyLabel: string
  monsterById: Record<string, MonsterDetail>
  prefetchLoading?: boolean
}

export function DifficultyTimelinePreview({
  dungeonDetail,
  difficultyLabel,
  monsterById,
  prefetchLoading,
}: Props) {
  const row = dungeonDetail
    ? findDifficultyRow(dungeonDetail, difficultyLabel)
    : undefined

  if (!row) {
    return (
      <div className="fight-diff-preview fight-diff-preview--empty muted">
        No encounter data for this mode.
      </div>
    )
  }

  const missingAnyMonster = row.objectives.some((o) => !monsterById[o.monster_id])

  return (
    <div className="fight-diff-preview">
      <div className="fight-diff-preview-meta">
        <span>{formatTimeLimitSec(row.time_limit_sec)}</span>
        <span className="muted">·</span>
        <span>{row.death_limit} deaths</span>
        {prefetchLoading && missingAnyMonster ? (
          <span className="fight-diff-preview-loading">Fetching skills…</span>
        ) : null}
      </div>
      <div className="fight-diff-preview-scroll">
        {row.objectives.map((ob, i) => (
          <section
            key={`${ob.monster_id}-${ob.step}-${i}`}
            className="fight-diff-objective-block"
          >
            <div className="objective-head objective-head--compact">
              <div className="objective-titles">
                <strong>{ob.monster_name}</strong>
                {ob.pen_name ? <span className="pen-name">{ob.pen_name}</span> : null}
              </div>
              <span className="objective-meta">
                Lv.{ob.level}
                {ob.count > 1 ? ` · ×${ob.count}` : ''}
              </span>
            </div>
            <SkillTimelineList
              objectiveIndex={i}
              skills={monsterById[ob.monster_id]?.skills ?? []}
            />
          </section>
        ))}
      </div>
    </div>
  )
}
