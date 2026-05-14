import { useEffect, useMemo, useState } from 'react'
import {
  NEPTUNEMON_SCHEDULE_TIMEZONE,
  NEPTUNEMON_SPAWN_PERIOD_MS,
  formatDurationCountdown,
  msUntilNextNeptunemon,
  nextNeptunemonSpawnUtcMs,
} from '../lib/neptunemonSchedule'
import { fetchWikiItemDetail, wikiItemIconUrl } from '../lib/wikiItemDetailApi'
import { fetchWikiNpcDetail, wikiNpcModelImageUrl } from '../lib/wikiNpcDetailApi'
import { runBossTimerTestToast } from '../lib/bossTimerClientTest'

const NEPTUNEMON_NPC_ID = 'ck9tq0g'
const OLYMPIAN_TOKEN_ITEM_ID = 'i1tbze8b'

type BossTimersViewProps = {
  /** `overlay` = compact strip for the floating timers window. `page` = larger layout + local test buttons. */
  variant?: 'overlay' | 'page'
}

export default function BossTimersView({ variant = 'page' }: BossTimersViewProps) {
  const [tick, setTick] = useState(0)
  const [testBusy, setTestBusy] = useState<'toast' | null>(null)
  const [testHint, setTestHint] = useState<string | null>(null)
  const [testHintIsError, setTestHintIsError] = useState(false)
  const [npcErr, setNpcErr] = useState<string | null>(null)
  const [itemErr, setItemErr] = useState<string | null>(null)
  const [bossName, setBossName] = useState('Neptunemon')
  const [bossImg, setBossImg] = useState<string | null>(null)
  const [rewardName, setRewardName] = useState('Olympian Token')
  const [rewardImg, setRewardImg] = useState<string | null>(null)

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const npc = await fetchWikiNpcDetail(NEPTUNEMON_NPC_ID)
        if (cancelled) return
        if (npc.name) setBossName(npc.name)
        const url = wikiNpcModelImageUrl(npc.model_id)
        setBossImg(url || null)
        setNpcErr(null)
      } catch (e) {
        if (!cancelled) setNpcErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const item = await fetchWikiItemDetail(OLYMPIAN_TOKEN_ITEM_ID)
        if (cancelled) return
        if (item.name) setRewardName(item.name)
        const url = wikiItemIconUrl(item.icon_id)
        setRewardImg(url || null)
        setItemErr(null)
      } catch (e) {
        if (!cancelled) setItemErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const nextMs = useMemo(() => nextNeptunemonSpawnUtcMs(Date.now()), [tick])
  const remainingMs = useMemo(() => msUntilNextNeptunemon(Date.now()), [tick])
  const countdownLabel = formatDurationCountdown(remainingMs)

  const nextLocalLabel = useMemo(() => {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(nextMs))
  }, [nextMs])

  const periodMin = NEPTUNEMON_SPAWN_PERIOD_MS / 60_000
  const tzLabel = NEPTUNEMON_SCHEDULE_TIMEZONE.replace(/_/g, ' ')

  if (variant === 'overlay') {
    return (
      <div className="boss-timer-overlay-strip">
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
            <span className="boss-timer-overlay-strip__countdown" aria-live="polite">
              {countdownLabel}
            </span>
          </div>
          <div className="boss-timer-overlay-strip__meta muted">
            Olympos (BR) · {rewardName}
            {rewardImg ? (
              <img className="boss-timer-overlay-strip__reward-ico" src={rewardImg} alt="" decoding="async" />
            ) : null}
            <span className="boss-timer-overlay-strip__next"> · {nextLocalLabel}</span>
          </div>
          {(npcErr || itemErr) && (
            <p className="hint error" style={{ margin: '6px 0 0', fontSize: 10 }}>
              {npcErr ?? itemErr}
            </p>
          )}
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
        Every {periodMin} min · anchored to <strong>01:19 {tzLabel}</strong> so everyone shares the same countdown;
        next line is your local time.
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
            Olympos Festival Island (bottom right)
          </p>
          <div className="boss-timer-countdown" aria-live="polite">
            <span className="boss-timer-countdown__label">Next spawn in</span>
            <span className="boss-timer-countdown__value">{countdownLabel}</span>
            <span className="boss-timer-countdown__local muted">({nextLocalLabel} your time)</span>
          </div>
          <div className="boss-timer-reward">
            <span className="boss-timer-card__label">Reward</span>
            <div className="boss-timer-reward__row">
              {rewardImg ? (
                <img className="boss-timer-reward__icon" src={rewardImg} alt="" decoding="async" />
              ) : (
                <span className="boss-timer-reward__icon-fallback" aria-hidden>
                  ◆
                </span>
              )}
              <span className="boss-timer-reward__name">{rewardName}</span>
            </div>
          </div>
          {(npcErr || itemErr) && (
            <p className="hint error boss-timer-card__wiki-hint" role="status">
              {npcErr && `Wiki NPC: ${npcErr}`}
              {npcErr && itemErr ? ' · ' : null}
              {itemErr && `Wiki item: ${itemErr}`}
            </p>
          )}
        </div>
      </article>
    </div>
  )
}
