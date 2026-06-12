import { useState } from 'react'
import type { MeterDungeonEarnProgress, MeterEarnMilestoneId } from '../lib/meterPointEarnProgress'
import {
  meterEarnMilestoneTierColor,
  METER_ONE_TIME_MILESTONES,
  todayDailyGrantKey,
} from '../lib/meterPointEarnProgress'
import { parseScoreColor } from '../lib/meterParseScoreColor'

type MeterThemeShopEarnPanelsProps = {
  loading: boolean
  dungeonProgress: MeterDungeonEarnProgress[]
  grantKeys: Set<string>
  dailyCompletedToday: boolean
}

function MilestoneChip({
  milestoneId,
  label,
  points,
  ratio,
  granted,
}: {
  milestoneId: MeterEarnMilestoneId
  label: string
  points: number
  ratio: '0/1' | '1/1'
  granted: boolean
}) {
  const tierColor = meterEarnMilestoneTierColor(milestoneId)
  const openTierStyle =
    !granted && tierColor ? ({ borderColor: tierColor, color: tierColor } as const) : undefined

  return (
    <span
      className={`meter-shop-milestone${granted ? ' meter-shop-milestone--done' : ' meter-shop-milestone--open'}${tierColor && !granted ? ` meter-shop-milestone--${milestoneId}` : ''}`}
      style={openTierStyle}
      title={`${label} (+${points} pts)`}
    >
      <span className="meter-shop-milestone-label">{label}</span>
      <span className="meter-shop-milestone-ratio">{ratio}</span>
    </span>
  )
}

function OneTimePointsLegend() {
  return (
    <ul className="meter-shop-onetime-legend" aria-label="One-time point values per category">
      {METER_ONE_TIME_MILESTONES.map((m) => {
        const tierColor = meterEarnMilestoneTierColor(m.id)
        return (
          <li key={m.id}>
            <span
              className="meter-shop-onetime-legend-label"
              style={tierColor ? { color: tierColor } : undefined}
            >
              {m.label}
            </span>
            <span className="meter-shop-earn-pts">+{m.points}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function MeterThemeShopEarnPanels({
  loading,
  dungeonProgress,
  grantKeys,
  dailyCompletedToday,
}: MeterThemeShopEarnPanelsProps) {
  const [oneTimeOpen, setOneTimeOpen] = useState(false)
  const dailyGranted = dailyCompletedToday || grantKeys.has(todayDailyGrantKey())
  const dailyRatio = dailyGranted ? '1/1' : '0/1'

  return (
    <div className="meter-shop-earn-panels">
      <section className="meter-shop-earn-panel meter-shop-earn-panel--onetime">
        <div className="meter-shop-onetime-head">
          <h3 className="meter-shop-earn-panel-title">One time</h3>
          <button
            type="button"
            className="meter-shop-btn meter-shop-btn--primary meter-shop-onetime-toggle"
            aria-expanded={oneTimeOpen}
            onClick={() => setOneTimeOpen((open) => !open)}
          >
            {oneTimeOpen ? 'Hide dungeons' : 'Show dungeons'}
          </button>
        </div>
        <p className="muted meter-shop-onetime-sub">
          Per Hard dungeon · each milestone once (first clear, 90+, 99+, 100 parse score).
        </p>
        <OneTimePointsLegend />
        {oneTimeOpen ? (
          <div className="meter-shop-onetime-body">
            {loading ? (
              <p className="muted">Loading dungeons…</p>
            ) : dungeonProgress.length === 0 ? (
              <p className="muted">No Hard dungeons found.</p>
            ) : (
              <ul className="meter-shop-dungeon-list meter-scroll--themed">
                {dungeonProgress.map((dungeon) => (
                  <li key={dungeon.dungeonId} className="meter-shop-dungeon-row">
                    <div className="meter-shop-dungeon-head">
                      <span className="meter-shop-dungeon-name">{dungeon.dungeonName}</span>
                      {dungeon.bestScore != null ? (
                        <span
                          className="meter-shop-dungeon-score"
                          style={{ color: parseScoreColor(dungeon.bestScore) }}
                          title="Best parse score vs pool"
                        >
                          Score {dungeon.bestScore}
                        </span>
                      ) : (
                        <span className="meter-shop-dungeon-score meter-shop-dungeon-score--none">
                          No score
                        </span>
                      )}
                    </div>
                    <div className="meter-shop-dungeon-milestones">
                      {dungeon.milestones.map((m) => (
                        <MilestoneChip
                          key={m.id}
                          milestoneId={m.id}
                          label={m.label}
                          points={m.points}
                          ratio={m.ratio}
                          granted={m.granted}
                        />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      <section
        className="meter-shop-earn-panel meter-shop-earn-panel--daily"
        aria-labelledby="meter-shop-daily-heading"
      >
        <h3 id="meter-shop-daily-heading" className="meter-shop-earn-panel-title">
          Daily
        </h3>
        <p className="muted meter-shop-earn-panel-note">
          First eligible Normal or Hard clear each UTC day awards +1 point. Upload a valid self
          parse from the meter after your run.
        </p>
        <div className="meter-shop-daily-card">
          <div className="meter-shop-daily-card-row">
            <span>Normal or Hard clear today</span>
            <span className="meter-shop-earn-pts">+1 pt</span>
          </div>
          <div className="meter-shop-daily-card-status">
            <span
              className={`meter-shop-milestone meter-shop-milestone--${dailyGranted ? 'done' : 'open'}`}
            >
              <span className="meter-shop-milestone-label">Today</span>
              <span className="meter-shop-milestone-ratio">{dailyRatio}</span>
            </span>
          </div>
          <p className="muted meter-shop-earn-panel-foot">
            {dailyGranted
              ? 'Points for today are already in your wallet.'
              : 'Clear any Normal or Hard dungeon with a valid self parse to earn today’s point.'}
          </p>
        </div>
      </section>
    </div>
  )
}
