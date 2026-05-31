import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import type { MonsterDetail } from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { fetchMonsterDetail } from '../lib/monsterDetailApi'
import { wikiItemIconUrl } from '../lib/wikiItemDetailApi'
import { wikiNpcModelImageUrl } from '../lib/wikiNpcDetailApi'
import { formatDropRatePermille } from '../lib/wikiDropRateFormat'
import { runBossTimerTestToast } from '../lib/bossTimerClientTest'
import {
  bossStatusLabel,
  bossTrainSpawnMs,
  fetchRaidTimer,
  formatRespawnCycleMinutes,
  isBossAlive,
  isBossReady,
  nextSpawnUtcMs,
  pickVisibleBossTrains,
  serverNowMs,
  toAlertSnapshots,
  type RaidBossEntry,
  type RaidTimerResponse,
} from '../lib/raidTimerApi'
type BossTimerReward = {
  key: string
  item_id: string
  item_name: string
  item_icon_id: string
  min: number
  max: number
  rate_label: string
}

function titleCase(value: string): string {
  const clean = value.replace(/[_-]+/g, ' ').trim()
  if (!clean) return 'Drop'
  return clean.replace(/\b\w/g, (c) => c.toUpperCase())
}

function bossNameInitial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '?'
}

function BossTimerPortrait({
  name,
  imgUrl,
  portraitClassName,
  imgClassName,
}: {
  name: string
  imgUrl: string | null
  portraitClassName: string
  imgClassName: string
}) {
  const [imgFailed, setImgFailed] = useState(false)

  useEffect(() => {
    setImgFailed(false)
  }, [imgUrl])

  if (imgUrl && !imgFailed) {
    return (
      <img
        className={imgClassName}
        src={imgUrl}
        alt=""
        decoding="async"
        onError={() => setImgFailed(true)}
      />
    )
  }

  return (
    <span className={portraitClassName} aria-hidden>
      {bossNameInitial(name)}
    </span>
  )
}

function flattenMonsterRewards(monster: MonsterDetail | null): BossTimerReward[] {
  if (!monster) return []
  const out: BossTimerReward[] = []
  for (const [i, drop] of (monster.drops ?? []).entries()) {
    const qty = Math.max(1, Math.round(drop.quantity || 1))
    out.push({
      key: `drop:${drop.item_id}:${i}`,
      item_id: drop.item_id,
      item_name: drop.item_name,
      item_icon_id: drop.item_icon_id,
      min: qty,
      max: qty,
      rate_label: titleCase(drop.drop_type),
    })
  }
  for (const [bandIndex, band] of (monster.raid_rankings ?? []).entries()) {
    for (const [rewardIndex, r] of band.rewards.entries()) {
      out.push({
        key: `raid:${bandIndex}:${r.item_id}:${rewardIndex}`,
        item_id: r.item_id,
        item_name: r.item_name,
        item_icon_id: r.item_icon_id,
        min: r.min,
        max: r.max,
        rate_label: formatDropRatePermille(r.rate_permil),
      })
    }
  }
  return out
}

function formatTimeStamp(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms))
}

function RaidDropsTable({ rewards, compact }: { rewards: BossTimerReward[]; compact?: boolean }) {
  return (
    <div className={compact ? 'boss-timer-drops__table-wrap boss-timer-drops__table-wrap--overlay meter-scroll--themed' : 'boss-timer-drops__table-wrap meter-scroll--themed'}>
      <table className={`boss-timer-drops__table${compact ? ' boss-timer-drops__table--overlay' : ''}`}>
        <thead>
          <tr>
            <th scope="col">Item</th>
            <th scope="col" className="boss-timer-drops__th-num boss-timer-drops__th-qty-col">
              Qty
            </th>
            <th scope="col" className="boss-timer-drops__th-num boss-timer-drops__th-rate-col">
              Rate
            </th>
          </tr>
        </thead>
        <tbody>
          {rewards.map((r) => (
            <tr key={r.key}>
              <td className="boss-timer-drops__td-item">
                <span className="boss-timer-drops__item-cell">
                  {r.item_icon_id ? (
                    <img
                      className="boss-timer-drops__row-icon"
                      src={wikiItemIconUrl(r.item_icon_id)}
                      alt=""
                      decoding="async"
                    />
                  ) : (
                    <span className="boss-timer-drops__row-icon-fallback" aria-hidden>
                      ◆
                    </span>
                  )}
                  <span className="boss-timer-drops__row-name" title={r.item_name}>
                    {r.item_name}
                  </span>
                </span>
              </td>
              <td className="boss-timer-drops__td-num boss-timer-drops__td-qty">
                {r.min === r.max ? `×${r.min}` : `×${r.min}–${r.max}`}
              </td>
              <td className="boss-timer-drops__td-num boss-timer-drops__td-rate">{r.rate_label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LootIconStrip({ rewards }: { rewards: BossTimerReward[] }) {
  return (
    <div className="boss-timer-loot-icons" aria-hidden={rewards.length === 0}>
      {rewards.map((r) =>
        r.item_icon_id ? (
          <img
            key={r.key}
            className="boss-timer-loot-icons__ico"
            src={wikiItemIconUrl(r.item_icon_id)}
            alt=""
            decoding="async"
            title={r.item_name}
          />
        ) : (
          <span key={r.key} className="boss-timer-loot-icons__fallback" title={r.item_name}>
            ◆
          </span>
        ),
      )}
    </div>
  )
}

type BossTimersViewProps = {
  variant?: 'overlay' | 'page'
  visibleCount?: number
  onLootRatesExpandedChange?: (expanded: boolean) => void
}

function BossTimerCard({
  boss,
  serverOffsetMs,
  tick,
  variant,
  lootRatesOpen,
  onToggleLootRates,
  inTrain = false,
}: {
  boss: RaidBossEntry
  serverOffsetMs: number
  tick: number
  variant: 'overlay' | 'page'
  lootRatesOpen: boolean
  onToggleLootRates: () => void
  /** Nested inside a multi-boss train row. */
  inTrain?: boolean
}) {
  const [monster, setMonster] = useState<MonsterDetail | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const m = await fetchMonsterDetail(boss.monster_id)
        if (cancelled) return
        setMonster(m)
      } catch {
        if (!cancelled) setMonster(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [boss.monster_id])

  const alive = useMemo(() => isBossAlive(boss), [boss.status])
  const ready = useMemo(() => isBossReady(boss), [boss.status])
  const countdownLabel = useMemo(() => bossStatusLabel(boss, serverOffsetMs), [boss, serverOffsetMs, tick])
  const stripStatusMod = alive ? 'alive' : ready ? 'ready' : null
  const stripRowStatusClass =
    stripStatusMod && !inTrain ? ` boss-timer-overlay-strip--${stripStatusMod}` : ''
  const stripInTrainStatusClass =
    stripStatusMod && inTrain ? ` boss-timer-overlay-strip--in-train-${stripStatusMod}` : ''
  const nextMs = useMemo(() => nextSpawnUtcMs(boss), [boss.next_spawn_ts])
  const nextLocalLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(nextMs)),
    [nextMs],
  )

  const bossName = boss.monster_name
  const bossImg = useMemo(() => {
    const mid = boss.model_id?.trim() || monster?.model_id?.trim()
    if (!mid) return null
    return wikiNpcModelImageUrl(mid) || null
  }, [boss.model_id, monster?.model_id])

  const raidRewards = useMemo(() => flattenMonsterRewards(monster), [monster])
  const mapDisplayName = boss.map_name?.trim() || monster?.locations?.[0]?.map_name?.trim() || 'Unknown map'
  const locationLine = mapDisplayName

  const nextLine = (compact: boolean) => (
    <div className={compact ? 'boss-timer-next-row boss-timer-next-row--compact' : 'boss-timer-next-row'}>
      <span className="boss-timer-overlay-strip__next-line">Next {nextLocalLabel}</span>
    </div>
  )

  const lootBar = (opts: { overlay?: boolean }) => (
    <div className={opts.overlay ? 'boss-timer-loot-bar boss-timer-loot-bar--overlay' : 'boss-timer-loot-bar'}>
      {raidRewards.length > 0 ? <LootIconStrip rewards={raidRewards} /> : <span className="muted">—</span>}
      {raidRewards.length > 0 ? (
        <button
          type="button"
          className={opts.overlay ? 'btn boss-timer-loot-bar__btn' : 'btn secondary boss-timer-loot-bar__btn'}
          onClick={onToggleLootRates}
        >
          {lootRatesOpen ? 'Hide drop rates' : 'Drop rates'}
        </button>
      ) : null}
    </div>
  )

  if (variant === 'overlay') {
    return (
      <div
        className={`boss-timer-overlay-strip${stripRowStatusClass}${stripInTrainStatusClass}${inTrain ? ' boss-timer-overlay-strip--in-train' : ''}`}
      >
        <div className={`boss-timer-overlay-strip__thumb${inTrain ? ' boss-timer-overlay-strip__thumb--train' : ''}`}>
          <BossTimerPortrait
            name={bossName}
            imgUrl={bossImg}
            portraitClassName="boss-timer-overlay-strip__portrait"
            imgClassName="boss-timer-overlay-strip__img"
          />
        </div>
        <div className="boss-timer-overlay-strip__main">
          <div className="boss-timer-overlay-strip__top">
            <span className="boss-timer-overlay-strip__name-row">
              <span className="boss-timer-overlay-strip__name">{bossName}</span>
              {inTrain && alive ? (
                <span className="boss-timer-train__status-pill boss-timer-train__status-pill--live">Live</span>
              ) : inTrain && ready ? (
                <span className="boss-timer-train__status-pill boss-timer-train__status-pill--ready">Ready</span>
              ) : null}
            </span>
            <span
              className={`boss-timer-overlay-strip__countdown${stripStatusMod ? ` boss-timer-overlay-strip__countdown--${stripStatusMod}` : ''}${inTrain ? ' boss-timer-overlay-strip__countdown--in-train' : ''}`}
              aria-live="polite"
            >
              {countdownLabel}
            </span>
          </div>
          <div className="boss-timer-overlay-strip__meta muted">
            <div className="boss-timer-overlay-strip__loc-line">{locationLine}</div>
            {lootBar({ overlay: true })}
            {lootRatesOpen && raidRewards.length > 0 ? (
              <RaidDropsTable rewards={raidRewards} compact />
            ) : null}
            {!inTrain ? nextLine(true) : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <article className={`boss-timer-card${inTrain ? ' boss-timer-card--in-train' : ''}${stripStatusMod && inTrain ? ` boss-timer-card--in-train-${stripStatusMod}` : ''}`}>
      <div className="boss-timer-card__media">
        <BossTimerPortrait
          name={bossName}
          imgUrl={bossImg}
          portraitClassName="boss-timer-card__portrait"
          imgClassName="boss-timer-card__boss-img"
        />
      </div>
      <div className="boss-timer-card__body">
        <h2 className="boss-timer-card__title">
          {bossName}
          {inTrain && alive ? (
            <span className="boss-timer-train__status-pill boss-timer-train__status-pill--live">Live</span>
          ) : inTrain && ready ? (
            <span className="boss-timer-train__status-pill boss-timer-train__status-pill--ready">Ready</span>
          ) : null}
        </h2>
        <p className="boss-timer-card__location">
          <span className="boss-timer-card__label">Location</span>
          {locationLine}
        </p>
        <div className="boss-timer-countdown" aria-live="polite">
          <span className="boss-timer-countdown__label">{alive || ready ? 'Status' : 'Next spawn in'}</span>
          <span
            className={`boss-timer-countdown__value${stripStatusMod ? ` boss-timer-countdown__value--${stripStatusMod}` : ''}`}
          >
            {countdownLabel}
          </span>
          <span className="boss-timer-countdown__local muted">({nextLocalLabel} your time)</span>
        </div>
        {nextLine(false)}
        <div className="boss-timer-drops">
          <span className="boss-timer-card__label">Wiki loot</span>
          {raidRewards.length ? (
            <>
              {lootBar({ overlay: false })}
              {lootRatesOpen ? <RaidDropsTable rewards={raidRewards} /> : null}
            </>
          ) : monster ? (
            <p className="hint muted boss-timer-drops__empty">No drop table on this monster response.</p>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function BossTimerTrainGroup({
  bosses,
  totalSpawnCount,
  serverOffsetMs,
  tick,
  variant,
  expandedLootBossId,
  onToggleLootRatesForBoss,
}: {
  bosses: RaidBossEntry[]
  totalSpawnCount: number
  serverOffsetMs: number
  tick: number
  variant: 'overlay' | 'page'
  expandedLootBossId: string | null
  onToggleLootRatesForBoss: (bossId: string) => void
}) {
  const isTrain = totalSpawnCount > 1
  const displayBosses = useMemo(() => {
    const nowMs = serverNowMs(serverOffsetMs)
    return [...bosses].sort((a, b) => bossTrainSpawnMs(a, nowMs) - bossTrainSpawnMs(b, nowMs))
  }, [bosses, serverOffsetMs])

  if (!isTrain) {
    const boss = bosses[0]!
    return (
      <BossTimerCard
        boss={boss}
        serverOffsetMs={serverOffsetMs}
        tick={tick}
        variant={variant}
        lootRatesOpen={expandedLootBossId === boss.monster_id}
        onToggleLootRates={() => onToggleLootRatesForBoss(boss.monster_id)}
      />
    )
  }

  const trainKey = displayBosses.map((b) => b.monster_id).join('|')

  if (variant === 'overlay') {
    return (
      <div className="boss-timer-train" data-train-count={totalSpawnCount}>
        <div className="boss-timer-train__header">
          <span className="boss-timer-train__title">Boss train</span>
          <span className="boss-timer-train__count muted">{totalSpawnCount} spawns</span>
        </div>
        <div className="boss-timer-train__rows">
          {displayBosses.map((boss) => (
            <BossTimerCard
              key={`${trainKey}:${boss.monster_id}`}
              boss={boss}
              serverOffsetMs={serverOffsetMs}
              tick={tick}
              variant="overlay"
              lootRatesOpen={expandedLootBossId === boss.monster_id}
              onToggleLootRates={() => onToggleLootRatesForBoss(boss.monster_id)}
              inTrain
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <section className="boss-timer-train boss-timer-train--page" data-train-count={totalSpawnCount}>
      <header className="boss-timer-train__header boss-timer-train__header--page">
        <h2 className="boss-timer-train__title">Boss train</h2>
        <p className="hint muted boss-timer-train__count">
          {totalSpawnCount} bosses spawning within 5 minutes
        </p>
      </header>
      <div className="boss-timer-train__cards">
        {displayBosses.map((boss) => (
          <BossTimerCard
            key={`${trainKey}:${boss.monster_id}`}
            boss={boss}
            serverOffsetMs={serverOffsetMs}
            tick={tick}
            variant="page"
            lootRatesOpen={expandedLootBossId === boss.monster_id}
            onToggleLootRates={() => onToggleLootRatesForBoss(boss.monster_id)}
            inTrain
          />
        ))}
      </div>
    </section>
  )
}

export default function BossTimersView({
  variant = 'page',
  visibleCount = DEFAULT_SETTINGS.bossTimerVisibleCount,
  onLootRatesExpandedChange,
}: BossTimersViewProps) {
  const [tick, setTick] = useState(0)
  const [testBusy, setTestBusy] = useState<'toast' | null>(null)
  const [testHint, setTestHint] = useState<string | null>(null)
  const [testHintIsError, setTestHintIsError] = useState(false)
  const [expandedLootBossId, setExpandedLootBossId] = useState<string | null>(null)
  const lootDetailsExpanded = expandedLootBossId !== null
  const [raid, setRaid] = useState<RaidTimerResponse | null>(null)
  const [raidErr, setRaidErr] = useState<string | null>(null)

  const onToggleLootRatesForBoss = useCallback((bossId: string) => {
    setExpandedLootBossId((prev) => (prev === bossId ? null : bossId))
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    onLootRatesExpandedChange?.(lootDetailsExpanded)
  }, [lootDetailsExpanded, onLootRatesExpandedChange])

  const refreshRaid = useCallback(() => {
    void fetchRaidTimer()
      .then((data) => {
        setRaid(data)
        setRaidErr(null)
        window.odysseyCompanion?.pushBossTimerSchedule?.(toAlertSnapshots(data.bosses, data.serverOffsetMs))
      })
      .catch((e) => {
        setRaidErr(e instanceof Error ? e.message : String(e))
      })
  }, [])

  useEffect(() => {
    refreshRaid()
    const id = window.setInterval(refreshRaid, 10_000)
    return () => window.clearInterval(id)
  }, [refreshRaid])

  useLayoutEffect(() => {
    if (variant !== 'overlay') return
    void window.odysseyCompanion?.setTimersLootDetailExpanded?.(lootDetailsExpanded)
  }, [variant, lootDetailsExpanded])

  useEffect(() => {
    return () => {
      void window.odysseyCompanion?.setTimersLootDetailExpanded?.(false)
    }
  }, [])

  const serverOffsetMs = raid?.serverOffsetMs ?? 0
  const allBosses = raid?.bosses ?? []
  const bossTrains = useMemo(
    () => pickVisibleBossTrains(allBosses, visibleCount, serverOffsetMs),
    [allBosses, visibleCount, serverOffsetMs],
  )

  if (variant === 'overlay') {
    return (
      <div className="boss-timer-overlay-stack">
        {!raid?.live && raid ? (
          <p className="hint muted" style={{ margin: '0 0 6px', fontSize: 10 }}>
            Raid timer feed is not live.
          </p>
        ) : null}
        {bossTrains.map((train) => (
          <BossTimerTrainGroup
            key={train.bosses.map((b) => b.monster_id).join('|')}
            bosses={train.bosses}
            totalSpawnCount={train.totalSpawnCount}
            serverOffsetMs={serverOffsetMs}
            tick={tick}
            variant="overlay"
            expandedLootBossId={expandedLootBossId}
            onToggleLootRatesForBoss={onToggleLootRatesForBoss}
          />
        ))}
        {!bossTrains.length && !raidErr ? <p className="hint muted">Loading raid timers…</p> : null}
      </div>
    )
  }

  return (
    <div className="timers-module">
      <section className="boss-timer-test-panel" aria-label="Notification tests">
        <h3 className="boss-timer-test-panel__title">Test alerts</h3>
        <p className="hint muted boss-timer-test-panel__hint">
          Soft reminder style — same tone as real spawn toasts.
        </p>
        <div className="boss-timer-test-panel__actions">
          <button
            type="button"
            className="btn secondary"
            disabled={testBusy !== null}
            onClick={() => {
              setTestHint(null)
              setTestBusy('toast')
              void runBossTimerTestToast().then((r) => {
                setTestBusy(null)
                if (r.ok) {
                  setTestHintIsError(false)
                  setTestHint('Toast sent — check the notification area / Action Center.')
                } else {
                  setTestHintIsError(true)
                  setTestHint(r.error ?? 'Toast failed.')
                }
              })
            }}
          >
            {testBusy === 'toast' ? 'Sending…' : 'Test Windows toast'}
          </button>
        </div>
        {testHint ? (
          <p className={`hint boss-timer-test-panel__status ${testHintIsError ? 'error' : ''}`} role="status">
            {testHint}
          </p>
        ) : null}
      </section>

      {!raid?.live && raid ? <p className="hint muted">Raid timer feed is not live.</p> : null}

      {bossTrains.flatMap((train) =>
        train.bosses.map((boss) => (
          <p key={`intro-${boss.monster_id}`} className="timers-intro muted">
            {boss.monster_name} — respawns about every {formatRespawnCycleMinutes(boss.respawn_sec)}; next spawn{' '}
            {formatTimeStamp(nextSpawnUtcMs(boss))} (your local time).
          </p>
        )),
      )}

      {bossTrains.map((train) => (
        <BossTimerTrainGroup
          key={train.bosses.map((b) => b.monster_id).join('|')}
          bosses={train.bosses}
          totalSpawnCount={train.totalSpawnCount}
          serverOffsetMs={serverOffsetMs}
          tick={tick}
          variant="page"
          expandedLootBossId={expandedLootBossId}
          onToggleLootRatesForBoss={onToggleLootRatesForBoss}
        />
      ))}

      {!bossTrains.length && !raidErr ? <p className="hint muted">Loading raid timers…</p> : null}
    </div>
  )
}
