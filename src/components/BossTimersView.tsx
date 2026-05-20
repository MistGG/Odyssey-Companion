import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MonsterDetail } from '../types'
import { fetchMonsterDetail } from '../lib/monsterDetailApi'
import { wikiItemIconUrl } from '../lib/wikiItemDetailApi'
import { wikiNpcModelImageUrl } from '../lib/wikiNpcDetailApi'
import { formatDropRatePermille } from '../lib/wikiDropRateFormat'
import { runBossTimerTestToast } from '../lib/bossTimerClientTest'
import {
  bossStatusLabel,
  fetchRaidTimer,
  formatRespawnCycleMinutes,
  isBossAlive,
  isBossReady,
  nextSpawnUtcMs,
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

function measureTimersElectronContentHeightPx(): number {
  const titlebar = document.querySelector('.titlebar--timers')
  const main = document.querySelector('main.timers-body')
  const th = titlebar instanceof HTMLElement ? titlebar.offsetHeight : 0
  const mh =
    main instanceof HTMLElement
      ? Math.max(main.offsetHeight, main.scrollHeight, Math.ceil(main.getBoundingClientRect().height))
      : 0
  const doc = Math.ceil(document.documentElement.scrollHeight)
  return Math.max(Math.ceil(th + mh), doc)
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
                  <span className="boss-timer-drops__row-name">{r.item_name}</span>
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
  onLootRatesExpandedChange?: (expanded: boolean) => void
}

function BossTimerCard({
  boss,
  serverOffsetMs,
  tick,
  variant,
  lootRatesOpen,
  onToggleLootRates,
}: {
  boss: RaidBossEntry
  serverOffsetMs: number
  tick: number
  variant: 'overlay' | 'page'
  lootRatesOpen: boolean
  onToggleLootRates: () => void
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
  const locationLine = `${mapDisplayName} (Bottom Right)`

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
        className={`boss-timer-overlay-strip${stripStatusMod ? ` boss-timer-overlay-strip--${stripStatusMod}` : ''}`}
      >
        <div className="boss-timer-overlay-strip__thumb">
          {bossImg ? (
            <img className="boss-timer-overlay-strip__img" src={bossImg} alt="" decoding="async" />
          ) : (
            <span className="boss-timer-overlay-strip__fallback" aria-hidden>
              {bossName.slice(0, 1)}
            </span>
          )}
        </div>
        <div className="boss-timer-overlay-strip__main">
          <div className="boss-timer-overlay-strip__top">
            <span className="boss-timer-overlay-strip__name">{bossName}</span>
            <span
              className={`boss-timer-overlay-strip__countdown${stripStatusMod ? ` boss-timer-overlay-strip__countdown--${stripStatusMod}` : ''}`}
              aria-live="polite"
            >
              {countdownLabel}
            </span>
          </div>
          <div className="boss-timer-overlay-strip__meta muted">
            <div className="boss-timer-overlay-strip__loc-line">{locationLine}</div>
            {lootBar({ overlay: true })}
            {lootRatesOpen && raidRewards.length > 0 ? <RaidDropsTable rewards={raidRewards} compact /> : null}
            {nextLine(true)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <article className="boss-timer-card">
      <div className="boss-timer-card__media">
        {bossImg ? (
          <img className="boss-timer-card__boss-img" src={bossImg} alt="" decoding="async" />
        ) : (
          <div className="boss-timer-card__boss-fallback" aria-hidden>
            {bossName.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="boss-timer-card__body">
        <h2 className="boss-timer-card__title">{bossName}</h2>
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

export default function BossTimersView({ variant = 'page', onLootRatesExpandedChange }: BossTimersViewProps) {
  const overlayStripRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)
  const [testBusy, setTestBusy] = useState<'toast' | null>(null)
  const [testHint, setTestHint] = useState<string | null>(null)
  const [testHintIsError, setTestHintIsError] = useState(false)
  const [lootRatesOpen, setLootRatesOpen] = useState(false)
  const [raid, setRaid] = useState<RaidTimerResponse | null>(null)
  const [raidErr, setRaidErr] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    onLootRatesExpandedChange?.(lootRatesOpen)
  }, [lootRatesOpen, onLootRatesExpandedChange])

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
    if (variant !== 'overlay' || lootRatesOpen) return
    void window.odysseyCompanion?.setTimersLootDetailExpanded?.(false)
  }, [variant, lootRatesOpen])

  useLayoutEffect(() => {
    if (variant !== 'overlay' || !lootRatesOpen) return
    const api = window.odysseyCompanion?.setTimersLootDetailExpanded
    if (!api) return

    let id1 = 0
    let id2 = 0
    let ro: ResizeObserver | null = null

    const push = () => {
      void api(true, measureTimersElectronContentHeightPx())
    }

    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(push)
    })

    const strip = overlayStripRef.current
    if (strip && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        requestAnimationFrame(push)
      })
      ro.observe(strip)
    }

    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
      ro?.disconnect()
    }
  }, [variant, lootRatesOpen, raid?.bosses.length])

  useEffect(() => {
    return () => {
      void window.odysseyCompanion?.setTimersLootDetailExpanded?.(false)
    }
  }, [])

  const serverOffsetMs = raid?.serverOffsetMs ?? 0
  const bosses = raid?.bosses ?? []

  if (variant === 'overlay') {
    return (
      <div ref={overlayStripRef} className="boss-timer-overlay-stack">
        {!raid?.live && raid ? (
          <p className="hint muted" style={{ margin: '0 0 6px', fontSize: 10 }}>
            Raid timer feed is not live.
          </p>
        ) : null}
        {bosses.map((boss) => (
          <BossTimerCard
            key={boss.monster_id}
            boss={boss}
            serverOffsetMs={serverOffsetMs}
            tick={tick}
            variant="overlay"
            lootRatesOpen={lootRatesOpen}
            onToggleLootRates={() => setLootRatesOpen((v) => !v)}
          />
        ))}
        {!bosses.length && !raidErr ? <p className="hint muted">Loading raid timers…</p> : null}
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

      {bosses.map((boss) => (
        <p key={`intro-${boss.monster_id}`} className="timers-intro muted">
          {boss.monster_name} — respawns about every {formatRespawnCycleMinutes(boss.respawn_sec)}; next spawn{' '}
          {formatTimeStamp(nextSpawnUtcMs(boss))} (your local time).
        </p>
      ))}

      {bosses.map((boss) => (
        <BossTimerCard
          key={boss.monster_id}
          boss={boss}
          serverOffsetMs={serverOffsetMs}
          tick={tick}
          variant="page"
          lootRatesOpen={lootRatesOpen}
          onToggleLootRates={() => setLootRatesOpen((v) => !v)}
        />
      ))}

      {!bosses.length && !raidErr ? <p className="hint muted">Loading raid timers…</p> : null}
    </div>
  )
}
