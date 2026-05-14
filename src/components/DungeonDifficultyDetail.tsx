import type { DungeonClearReward, DungeonDetailDifficulty } from '../types'
import { wikiItemIconUrl } from '../lib/dungeonImage'
import { formatDropRatePermille } from '../lib/wikiDropRateFormat'

const CLEAR_RANK_LABELS = ['Base', 'F', 'E', 'D', 'C', 'B', 'A', 'S'] as const

/** API `rank` index → wiki label */
function clearRankLabel(rank: number): string {
  return CLEAR_RANK_LABELS[rank] ?? `Rank ${rank}`
}

/** Visual order: Base first, then best grade (S) down to F */
const CLEAR_REWARD_TIER_ORDER = [
  'Base',
  'S',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
] as const

function clearRewardTierSortKey(label: string): number {
  const i = CLEAR_REWARD_TIER_ORDER.indexOf(
    label as (typeof CLEAR_REWARD_TIER_ORDER)[number],
  )
  if (i >= 0) return i
  return 100
}

function groupClearRewardsByTier(
  rewards: DungeonClearReward[],
): [string, DungeonClearReward[]][] {
  const by = new Map<string, DungeonClearReward[]>()
  for (const r of rewards) {
    const tier = clearRankLabel(r.rank)
    if (!by.has(tier)) by.set(tier, [])
    by.get(tier)!.push(r)
  }
  for (const [, list] of by) {
    list.sort((a, b) => {
      const na = (a.item_name || '').localeCompare(b.item_name || '')
      if (na !== 0) return na
      return a.item_id.localeCompare(b.item_id)
    })
  }
  return [...by.entries()].sort(
    (a, b) =>
      clearRewardTierSortKey(a[0]) - clearRewardTierSortKey(b[0]) ||
      a[0].localeCompare(b[0]),
  )
}

function formatDurationSec(sec: number): string {
  if (!sec) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (s) return `${m}m ${s}s`
  return `${m}m`
}

function qtyRange(min: number, max: number): string {
  if (min === max) return `×${min}`
  return `×${min}–${max}`
}

type Props = {
  row: DungeonDetailDifficulty
}

export function DungeonDifficultyDetail({ row }: Props) {
  const metaBits: string[] = []
  if (row.user_limit != null && row.user_limit > 0) {
    metaBits.push(`Players: ${row.user_limit}`)
  }
  if (row.weekly_limit != null && row.weekly_limit > 0) {
    metaBits.push(`Weekly: ${row.weekly_limit}`)
  }
  if (row.time_limit_sec) {
    metaBits.push(`⏱ ${formatDurationSec(row.time_limit_sec)}`)
  }
  if (row.death_limit) {
    metaBits.push(`💀 ${row.death_limit} deaths`)
  }

  return (
    <div className="dungeon-diff-detail">
      {metaBits.length > 0 ? (
        <div className="dungeon-diff-detail__meta">{metaBits.join(' · ')}</div>
      ) : null}

      {row.enter_conditions && row.enter_conditions.length > 0 ? (
        <div className="dungeon-diff-detail__conditions">
          {row.enter_conditions.map((c, i) => (
            <div key={i} className="dungeon-diff-detail__condition-row">
              {c.type ? (
                <span className="dungeon-diff-detail__condition-type">{c.type}</span>
              ) : null}
              <span className="dungeon-diff-detail__condition-desc">{c.description}</span>
            </div>
          ))}
        </div>
      ) : null}

      {row.objectives.length > 0 ? (
        <div className="dungeon-diff-detail__section">
          <div className="dungeon-diff-detail__section-title">Objectives</div>
          <div className="dungeon-diff-detail__objectives">
            {row.objectives.map((obj, i) => (
              <div key={`${obj.monster_id}-${obj.step}-${i}`} className="dungeon-diff-detail__objective">
                <div className="dungeon-diff-detail__objective-head">
                  <span className="dungeon-diff-detail__step">{obj.step || i + 1}.</span>
                  {obj.level ? (
                    <span className="dungeon-diff-detail__lvl">[Lv.{obj.level}]</span>
                  ) : null}
                  <span className="dungeon-diff-detail__boss">{obj.monster_name || '—'}</span>
                  {obj.pen_name ? (
                    <span className="dungeon-diff-detail__pen">{obj.pen_name}</span>
                  ) : null}
                  <span className="dungeon-diff-detail__count">×{obj.count}</span>
                </div>
                {obj.raid_rankings && obj.raid_rankings.length > 0 ? (
                  <div className="dungeon-diff-detail__raid">
                    <div className="dungeon-diff-detail__raid-title">Raid rewards</div>
                    {obj.raid_rankings.map((rk, ri) => (
                      <div key={ri} className="dungeon-diff-detail__raid-band">
                        <div className="dungeon-diff-detail__raid-band-label">
                          Rank{' '}
                          {rk.start === rk.end
                            ? `#${rk.start}`
                            : `#${rk.start}–${rk.end}`}
                        </div>
                        <div className="dungeon-diff-detail__reward-chips dungeon-diff-detail__reward-chips--raid">
                          {rk.rewards.map((r, j) => (
                            <span
                              key={`${r.item_id}-${j}`}
                              className="dungeon-diff-detail__reward-chip dungeon-diff-detail__reward-chip--raid"
                              title={r.item_name}
                            >
                              {r.item_icon_id ? (
                                <img
                                  src={wikiItemIconUrl(r.item_icon_id)}
                                  alt=""
                                  className="dungeon-diff-detail__reward-icon"
                                  loading="lazy"
                                  decoding="async"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none'
                                  }}
                                />
                              ) : null}
                              <span className="dungeon-diff-detail__reward-name">
                                {r.item_name}
                              </span>
                              <span className="dungeon-diff-detail__reward-qty">
                                {qtyRange(r.min, r.max)}
                              </span>
                              <span className="dungeon-diff-detail__reward-rate">
                                ({formatDropRatePermille(r.rate_permil)})
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {row.rewards && row.rewards.length > 0 ? (
        <div className="dungeon-diff-detail__section">
          <div className="dungeon-diff-detail__section-title">Rewards</div>
          <div className="dungeon-diff-detail__reward-tiers">
            {groupClearRewardsByTier(row.rewards).map(([tier, items]) => (
              <div key={tier} className="dungeon-diff-detail__reward-tier">
                <div className="dungeon-diff-detail__tier-label">{tier}</div>
                <ul className="dungeon-diff-detail__tier-list">
                  {items.map((r, i) => (
                    <li
                      key={`${tier}-${r.item_id}-${i}`}
                      className="dungeon-diff-detail__tier-row"
                      title={r.item_name}
                    >
                      {r.item_icon_id ? (
                        <img
                          src={wikiItemIconUrl(r.item_icon_id)}
                          alt=""
                          className="dungeon-diff-detail__reward-icon"
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <span
                          className="dungeon-diff-detail__tier-icon-fallback"
                          aria-hidden
                        >
                          ◆
                        </span>
                      )}
                      <span className="dungeon-diff-detail__tier-name">
                        {r.item_name}
                      </span>
                      <span className="dungeon-diff-detail__tier-qty">
                        ×{r.item_count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
