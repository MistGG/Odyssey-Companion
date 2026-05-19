import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  NEPTUNEMON_ANCHOR_LABEL,
  NEPTUNEMON_DEFAULT_RESPAWN_WAIT_MS,
  NEPTUNEMON_SCHEDULE_TIMEZONE,
  formatDurationCountdown,
  getDefaultNeptunemonSchedule,
  isNeptunemonAliveWindow,
  msUntilNextNeptunemon,
  neptunemonSpawnPeriodMs,
  nextNeptunemonSpawnUtcMs,
  normalizeNeptunemonSchedule,
  type NeptunemonScheduleSnapshot,
} from '../lib/neptunemonSchedule'
import type { MonsterDetail } from '../types'
import { fetchMonsterDetail } from '../lib/monsterDetailApi'
import { wikiItemIconUrl } from '../lib/wikiItemDetailApi'
import { wikiNpcModelImageUrl } from '../lib/wikiNpcDetailApi'
import { formatDropRatePermille } from '../lib/wikiDropRateFormat'
import { runBossTimerTestToast } from '../lib/bossTimerClientTest'
import {
  fetchRemoteNeptunemonSchedule,
  pickEffectiveNeptunemonSchedule,
  publishRemoteNeptunemonSchedule,
  readLocalNeptunemonSchedule,
  readPendingNeptunemonSpawnUtcMs,
  submitNeptunemonTimerReport,
  type BossTimerReportEvent,
  type ScheduleSource,
  clearPendingNeptunemonSpawnUtcMs,
  writeLocalNeptunemonSchedule,
  writePendingNeptunemonSpawnUtcMs,
} from '../lib/bossTimerScheduleSync'

/** Neptunemon — `GET …/api/wiki/monsters?id=` (drops + locations + portrait `model_id`). */
const NEPTUNEMON_MONSTER_ID = 'm4vc8mv'

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

function qtyRange(min: number, max: number): string {
  if (min === max) return `×${min}`
  return `×${min}–${max}`
}

function formatTimeStamp(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: NEPTUNEMON_SCHEDULE_TIMEZONE,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(ms))
}

/** Full timers webContents height (titlebar + body) for Electron resize; avoids inner scroll traps. */
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
    <div
      className={
        compact
          ? 'boss-timer-drops__table-wrap boss-timer-drops__table-wrap--overlay meter-scroll--themed'
          : 'boss-timer-drops__table-wrap meter-scroll--themed'
      }
    >
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
              <td className="boss-timer-drops__td-num boss-timer-drops__td-qty">{qtyRange(r.min, r.max)}</td>
              <td className="boss-timer-drops__td-num boss-timer-drops__td-rate">
                {r.rate_label}
              </td>
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
  /** `overlay` = compact strip for the floating timers window. `page` = larger layout + local test buttons. */
  variant?: 'overlay' | 'page'
  /** Overlay only: toggles shell/body classes + drives window resize when drop rates open. */
  onLootRatesExpandedChange?: (expanded: boolean) => void
}

function validObservedAliveMs(now: number, spawnUtcMs: number): number | null {
  const aliveMs = Math.round((now - spawnUtcMs) / 1000) * 1000
  if (aliveMs < 5_000 || aliveMs > 15 * 60_000) return null
  return aliveMs
}

export default function BossTimersView({ variant = 'page', onLootRatesExpandedChange }: BossTimersViewProps) {
  const overlayStripRef = useRef<HTMLDivElement>(null)
  const scheduleRef = useRef<NeptunemonScheduleSnapshot>(getDefaultNeptunemonSchedule())
  const pendingSpawnRef = useRef<number | null>(readPendingNeptunemonSpawnUtcMs())
  const [tick, setTick] = useState(0)
  const [testBusy, setTestBusy] = useState<'toast' | null>(null)
  const [testHint, setTestHint] = useState<string | null>(null)
  const [testHintIsError, setTestHintIsError] = useState(false)
  const [monster, setMonster] = useState<MonsterDetail | null>(null)
  const [monsterErr, setMonsterErr] = useState<string | null>(null)
  const [lootRatesOpen, setLootRatesOpen] = useState(false)
  const [schedule, setSchedule] = useState<NeptunemonScheduleSnapshot>(() => scheduleRef.current)
  const [scheduleSource, setScheduleSource] = useState<ScheduleSource>('default')
  const [scheduleActionUpdated, setScheduleActionUpdated] = useState<'spawn' | 'death' | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    onLootRatesExpandedChange?.(lootRatesOpen)
  }, [lootRatesOpen, onLootRatesExpandedChange])

  useEffect(() => {
    scheduleRef.current = schedule
    window.odysseyCompanion?.pushBossTimerSchedule?.(schedule)
  }, [schedule])

  useEffect(() => {
    let cancelled = false

    const applyEffective = (remote: NeptunemonScheduleSnapshot | null, remoteError: string | null) => {
      const local = readLocalNeptunemonSchedule()
      const effective = pickEffectiveNeptunemonSchedule(local, remote)
      if (cancelled) return
      setSchedule(effective.schedule)
      setScheduleSource(effective.source)
      if (effective.source === 'remote') {
        writeLocalNeptunemonSchedule(effective.schedule)
      }
      void remoteError
    }

    const local = readLocalNeptunemonSchedule()
    if (local) {
      setSchedule(local)
      setScheduleSource('local')
    }

    const refreshRemote = () => {
      void fetchRemoteNeptunemonSchedule().then((res) => {
        if (cancelled) return
        if (!res.enabled) return
        applyEffective(res.schedule, res.error)
      })
    }

    refreshRemote()
    const id = window.setInterval(refreshRemote, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const m = await fetchMonsterDetail(NEPTUNEMON_MONSTER_ID)
        if (cancelled) return
        setMonster(m)
        setMonsterErr(null)
      } catch (e) {
        if (!cancelled) setMonsterErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const bossName = monster?.name?.trim() || 'Neptunemon'
  const bossImg = useMemo(() => {
    const mid = monster?.model_id?.trim()
    if (!mid) return null
    return wikiNpcModelImageUrl(mid) || null
  }, [monster?.model_id])

  const raidRewards = useMemo(() => flattenMonsterRewards(monster), [monster])

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
  }, [variant, lootRatesOpen, monster, raidRewards.length])

  useEffect(() => {
    return () => {
      void window.odysseyCompanion?.setTimersLootDetailExpanded?.(false)
    }
  }, [])

  const mapDisplayName = monster?.locations?.[0]?.map_name?.trim() || 'Olympos Festival Island'
  const locationLine = `${mapDisplayName} (Bottom Right)`

  const flashUpdated = useCallback((action: 'spawn' | 'death') => {
    setScheduleActionUpdated(action)
    window.setTimeout(() => {
      setScheduleActionUpdated((current) => (current === action ? null : current))
    }, 1400)
  }, [])

  const saveUserSchedule = useCallback(
    (nextRaw: NeptunemonScheduleSnapshot, eventType: BossTimerReportEvent, observedUtcMs: number) => {
      const next = normalizeNeptunemonSchedule(nextRaw)
      if (!next) {
        return false
      }
      writeLocalNeptunemonSchedule(next)
      setSchedule(next)
      setScheduleSource('local')
      void publishRemoteNeptunemonSchedule(next)
      void submitNeptunemonTimerReport(next, eventType, observedUtcMs)
      return true
    },
    [],
  )

  const markSpawnNow = useCallback(() => {
    const now = Date.now()
    pendingSpawnRef.current = now
    writePendingNeptunemonSpawnUtcMs(now)
    const ok = saveUserSchedule(
      {
        ...scheduleRef.current,
        anchorUtcMs: now,
        updatedAtMs: now,
      },
      'spawn',
      now,
    )
    if (ok) flashUpdated('spawn')
  }, [flashUpdated, saveUserSchedule])

  const markDeathNow = useCallback(() => {
    const now = Date.now()
    const active = scheduleRef.current
    const observedSpawn = pendingSpawnRef.current ?? readPendingNeptunemonSpawnUtcMs()
    if (observedSpawn === null) return
    const aliveMs = validObservedAliveMs(now, observedSpawn)
    if (aliveMs === null) {
      pendingSpawnRef.current = null
      clearPendingNeptunemonSpawnUtcMs()
      return
    }
    const ok = saveUserSchedule(
      {
        ...active,
        anchorUtcMs: observedSpawn,
        aliveWindowMs: aliveMs,
        respawnWaitMs: NEPTUNEMON_DEFAULT_RESPAWN_WAIT_MS,
        updatedAtMs: now,
      },
      'death',
      now,
    )
    if (ok) {
      pendingSpawnRef.current = null
      clearPendingNeptunemonSpawnUtcMs()
      flashUpdated('death')
    }
  }, [flashUpdated, saveUserSchedule])

  const nextMs = useMemo(() => nextNeptunemonSpawnUtcMs(Date.now(), schedule), [tick, schedule])
  const remainingMs = useMemo(() => msUntilNextNeptunemon(Date.now(), schedule), [tick, schedule])
  const countdownLabel = formatDurationCountdown(remainingMs)
  const alive = useMemo(() => isNeptunemonAliveWindow(Date.now(), schedule), [tick, schedule])

  const nextLocalLabel = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(nextMs))
  }, [nextMs])

  const periodMin = neptunemonSpawnPeriodMs(schedule) / 60_000
  const periodLabel = Number.isInteger(periodMin)
    ? `${periodMin} min`
    : `${Math.floor(periodMin)}m ${Math.round((periodMin % 1) * 60)}s`
  const tzLabel = NEPTUNEMON_SCHEDULE_TIMEZONE.replace(/_/g, ' ')

  const scheduleControls = (compact = false) => (
    <div className={compact ? 'boss-timer-sync boss-timer-sync--compact' : 'boss-timer-sync'}>
      <div className="boss-timer-sync__actions">
        <button type="button" className="btn boss-timer-sync__btn boss-timer-sync__btn--spawn" onClick={markSpawnNow}>
          {scheduleActionUpdated === 'spawn' ? 'Updated' : 'Spawn now'}
        </button>
        <button type="button" className="btn boss-timer-sync__btn boss-timer-sync__btn--death" onClick={markDeathNow}>
          {scheduleActionUpdated === 'death' ? 'Updated' : 'Death now'}
        </button>
      </div>
    </div>
  )

  const nextLine = (compact = false) => (
    <div className={compact ? 'boss-timer-next-row boss-timer-next-row--compact' : 'boss-timer-next-row'}>
      <span className="boss-timer-overlay-strip__next-line">Next {nextLocalLabel}</span>
      {scheduleControls(compact)}
    </div>
  )

  const lootBar = (opts: { overlay?: boolean }) => (
    <div className={opts.overlay ? 'boss-timer-loot-bar boss-timer-loot-bar--overlay' : 'boss-timer-loot-bar'}>
      {raidRewards.length > 0 ? <LootIconStrip rewards={raidRewards} /> : <span className="muted">—</span>}
      {raidRewards.length > 0 ? (
        <button
          type="button"
          className={opts.overlay ? 'btn boss-timer-loot-bar__btn' : 'btn secondary boss-timer-loot-bar__btn'}
          onClick={() => setLootRatesOpen((v) => !v)}
        >
          {lootRatesOpen ? 'Hide drop rates' : 'Drop rates'}
        </button>
      ) : null}
    </div>
  )

  if (variant === 'overlay') {
    return (
      <div ref={overlayStripRef} className={`boss-timer-overlay-strip${alive ? ' boss-timer-overlay-strip--alive' : ''}`}>
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
              className={`boss-timer-overlay-strip__countdown${alive ? ' boss-timer-overlay-strip__countdown--alive' : ''}`}
              aria-live="polite"
            >
              {alive ? 'Alive' : countdownLabel}
            </span>
          </div>
          <div className="boss-timer-overlay-strip__meta muted">
            <div className="boss-timer-overlay-strip__loc-line">{locationLine}</div>
            {lootBar({ overlay: true })}
            {lootRatesOpen && raidRewards.length > 0 ? <RaidDropsTable rewards={raidRewards} compact /> : null}
            {nextLine(true)}
          </div>
          {monsterErr ? (
            <p className="hint error" style={{ margin: '6px 0 0', fontSize: 10 }}>
              {monsterErr}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="timers-module">
      <section className="boss-timer-test-panel" aria-label="Notification tests">
        <h3 className="boss-timer-test-panel__title">Test alerts</h3>
        <p className="hint muted boss-timer-test-panel__hint">
          Soft reminder style — same tone as real spawn toasts. Desktop notifications only for now (sound preview is
          off).
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

      <p className="timers-intro muted">
        About every {periodLabel} · anchored to{' '}
        <strong>
          {scheduleSource === 'default' ? NEPTUNEMON_ANCHOR_LABEL : formatTimeStamp(schedule.anchorUtcMs)} {tzLabel}
        </strong>
        ; next line is your local time.
      </p>

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
            {mapDisplayName} (Bottom Right)
          </p>
          <div className="boss-timer-countdown" aria-live="polite">
            <span className="boss-timer-countdown__label">{alive ? 'Status' : 'Next spawn in'}</span>
            <span
              className={`boss-timer-countdown__value${alive ? ' boss-timer-countdown__value--alive' : ''}`}
            >
              {alive ? 'Alive' : countdownLabel}
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
            ) : (
              <p className="hint muted boss-timer-drops__empty">
                {monsterErr ? 'Could not load wiki drops.' : monster ? 'No drop table on this monster response.' : 'Loading…'}
              </p>
            )}
          </div>
          {monsterErr ? (
            <p className="hint error boss-timer-card__wiki-hint" role="status">
              Wiki monster: {monsterErr}
            </p>
          ) : null}
        </div>
      </article>
    </div>
  )
}
