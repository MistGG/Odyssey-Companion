import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { OverlaySettings, TimelineFightPayload } from './types'
import { loadSettings, saveSettings } from './lib/settingsStorage'
import { useStopwatch } from './lib/useStopwatch'
import { SkillTimelineList } from './components/SkillTimelineList'
import { TimelineRunQueue } from './components/TimelineRunQueue'
import { mergeOverlaySettings } from './lib/overlaySettingsGuard'
import { normalizeFightPayloadDetailed } from './lib/fightPayload'
import { flattenFightSkills } from './lib/timelineSchedule'

function formatMs(ms: number) {
  const totalCs = Math.floor(ms / 10)
  const cs = totalCs % 100
  const totalS = Math.floor(totalCs / 100)
  const s = totalS % 60
  const m = Math.floor(totalS / 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export default function TimelineApp() {
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings())
  const [fight, setFight] = useState<TimelineFightPayload | null>(null)
  const [fightPayloadReject, setFightPayloadReject] = useState<string | null>(null)
  const { elapsedMs, running, start, stop, reset } = useStopwatch()
  /** After first Start, keep the run-queue view until Reset (Pause only stops the clock). */
  const [runSessionActive, setRunSessionActive] = useState(false)

  const positionLocked = settings.timelinePositionLocked
  const titleDragRef = useRef<HTMLDivElement>(null)
  /** Timer + Start / Reset / Lock / minimize / close — one rect for click-through hit-testing. */
  const titlebarActionsRef = useRef<HTMLDivElement>(null)
  const ignoreMouseRaf = useRef<number | null>(null)
  const lastIgnoreSent = useRef<boolean | null>(null)

  const resetTimeline = useCallback(() => {
    stop()
    reset()
    setRunSessionActive(false)
  }, [stop, reset])

  const toggleRunClock = useCallback(() => {
    if (running) {
      stop()
      return
    }
    start()
    setRunSessionActive(true)
  }, [running, start, stop])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const s = loadSettings()
    api.applyTimelineWindowOptions({ alwaysOnTop: s.timelineAlwaysOnTop })
  }, [])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const off = api.onTimelineAction((action) => {
      if (action === 'toggle') {
        toggleRunClock()
      } else {
        resetTimeline()
      }
    })
    return () => off()
  }, [toggleRunClock, resetTimeline])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const off = api.onSettingsPatch((patch) => {
      setSettings((prev) => {
        const merged = mergeOverlaySettings(prev, patch)
        if (!merged) return prev
        saveSettings(merged)
        api.applyTimelineWindowOptions({ alwaysOnTop: merged.timelineAlwaysOnTop })
        return merged
      })
    })
    return () => off()
  }, [])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const applyFightPayload = (payload: unknown) => {
      const r = normalizeFightPayloadDetailed(payload)
      if (r.ok) {
        setFightPayloadReject(null)
        setFight(r.value)
      } else {
        setFight(null)
        setFightPayloadReject(r.reason)
      }
    }
    const off = api.onFightLoaded(applyFightPayload)
    void api.getLastFight().then((raw) => {
      if (raw != null) applyFightPayload(raw)
    })
    void api.notifyTimelineReady()
    return () => off()
  }, [])

  useEffect(() => {
    if (fight == null) setRunSessionActive(false)
  }, [fight])

  const togglePositionLock = useCallback(() => {
    setSettings((s) => {
      const next: OverlaySettings = {
        ...s,
        timelinePositionLocked: !s.timelinePositionLocked,
      }
      saveSettings(next)
      window.odysseyCompanion?.pushSettings(next)
      return next
    })
  }, [])

  const shellStyle = useMemo(
    () =>
      ({
        '--timeline-backdrop-alpha': String(settings.timelineBackdropOpacity),
      }) as CSSProperties,
    [settings.timelineBackdropOpacity],
  )

  /** Near-zero backdrop: fully transparent shell so the game shows through (including behind each entry). */
  const ghostChrome = settings.timelineBackdropOpacity < 0.04

  const shellCls = [
    'shell',
    'shell--timeline',
    positionLocked ? 'timeline-position-locked' : 'timeline-position-unlocked',
  ].join(' ')

  const flatSkills = useMemo(
    () => (fight ? flattenFightSkills(fight) : []),
    [fight],
  )

  /** Wall-clock cap from dungeon JSON — `<= 0` means no enforceable limit in data. */
  const fightLimitMs = useMemo(() => {
    if (!fight || fight.time_limit_sec <= 0) return null
    return Math.round(fight.time_limit_sec * 1000)
  }, [fight])

  const cappedElapsedMs = useMemo(() => {
    if (fightLimitMs == null) return elapsedMs
    return Math.min(elapsedMs, fightLimitMs)
  }, [elapsedMs, fightLimitMs])

  useEffect(() => {
    if (fightLimitMs == null || !running) return
    if (elapsedMs >= fightLimitMs) stop()
  }, [fightLimitMs, running, elapsedMs, stop])

  /**
   * When position is locked, the window is click-through except over interactive controls:
   * title drag strip, Start/Pause, Reset, Lock, minimize, close.
   * Uses `setIgnoreMouseEvents` in the main process.
   */
  useEffect(() => {
    const api = window.odysseyCompanion
    const setIgnore = (ignore: boolean) => {
      if (lastIgnoreSent.current === ignore) return
      lastIgnoreSent.current = ignore
      api?.setTimelineIgnoreMouseEvents?.(ignore)
    }

    if (!positionLocked) {
      if (ignoreMouseRaf.current != null) {
        cancelAnimationFrame(ignoreMouseRaf.current)
        ignoreMouseRaf.current = null
      }
      lastIgnoreSent.current = null
      setIgnore(false)
      return
    }

    const inRect = (x: number, y: number, el: Element | null) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    }

    /** Frameless + click-through: OS resize hits the window edge; those pixels must not be forwarded. */
    const RESIZE_EDGE_PX = 16
    const nearResizeEdge = (x: number, y: number) => {
      const w = window.innerWidth
      const h = window.innerHeight
      return (
        x <= RESIZE_EDGE_PX ||
        y <= RESIZE_EDGE_PX ||
        x >= w - RESIZE_EDGE_PX ||
        y >= h - RESIZE_EDGE_PX
      )
    }

    const onPointer = (clientX: number, clientY: number) => {
      if (ignoreMouseRaf.current != null) cancelAnimationFrame(ignoreMouseRaf.current)
      ignoreMouseRaf.current = requestAnimationFrame(() => {
        ignoreMouseRaf.current = null
        const interactive =
          nearResizeEdge(clientX, clientY) ||
          inRect(clientX, clientY, titleDragRef.current) ||
          inRect(clientX, clientY, titlebarActionsRef.current)
        setIgnore(!interactive)
      })
    }

    const onMove = (e: MouseEvent) => {
      onPointer(e.clientX, e.clientY)
    }

    const collapsePassthrough = () => {
      setIgnore(true)
    }

    /** Hide cursor leaves the browser window without firing move again */
    const onBlur = () => {
      collapsePassthrough()
    }

    lastIgnoreSent.current = null
    setIgnore(true)

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('blur', onBlur)
    document.documentElement.addEventListener('mouseleave', collapsePassthrough)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('blur', onBlur)
      document.documentElement.removeEventListener('mouseleave', collapsePassthrough)
      if (ignoreMouseRaf.current != null) {
        cancelAnimationFrame(ignoreMouseRaf.current)
        ignoreMouseRaf.current = null
      }
      lastIgnoreSent.current = null
      setIgnore(false)
    }
  }, [positionLocked])

  return (
    <div className={shellCls} style={shellStyle}>
      <div
        className={`timeline-backdrop ${ghostChrome ? 'timeline-backdrop--ghost' : ''}`}
      >
        <header className="titlebar titlebar--timeline">
          <div ref={titleDragRef} className="titlebar-drag titlebar-drag--inline">
            <span className="logo-dot" aria-hidden />
            <div className="titlebar-inline-brand">
              <strong className="titlebar-inline-title">Timeline</strong>
              {fight ? (
                <>
                  <span className="titlebar-inline-sep" aria-hidden>
                    ·
                  </span>
                  <span className="titlebar-inline-context" title={`${fight.dungeonName} · ${fight.difficulty}`}>
                    {fight.dungeonName} · {fight.difficulty}
                  </span>
                </>
              ) : (
                <>
                  <span className="titlebar-inline-sep" aria-hidden>
                    ·
                  </span>
                  <span className="titlebar-inline-context titlebar-inline-context--muted">
                    No encounter
                  </span>
                </>
              )}
            </div>
          </div>
          <div ref={titlebarActionsRef} className="titlebar-actions titlebar-actions--timeline">
            <div
              className="timer-block"
              aria-live="polite"
              title={
                running ? 'Running' : runSessionActive ? 'Paused' : 'Stopped'
              }
            >
              <span className={`timer-dot ${running ? 'on' : ''}`} />
              <code className="timer-readout">{formatMs(cappedElapsedMs)}</code>
              <span className="timer-state">
                {running ? 'Running' : runSessionActive ? 'Paused' : 'Stopped'}
              </span>
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={toggleRunClock}
            >
              {running ? 'Pause' : 'Start'}
            </button>
            <button type="button" className="btn ghost" onClick={resetTimeline}>
              Reset
            </button>
            <button
              type="button"
              className="btn ghost"
              title="Companion settings (timeline section)"
              aria-label="Open Companion settings"
              onClick={() => void window.odysseyCompanion?.openSettings?.('timeline')}
            >
              ⚙
            </button>
            <button
              type="button"
              className={`btn icon ${positionLocked ? 'btn-lock-active' : ''}`}
              title={
                positionLocked
                  ? 'Unlock — drag from Timeline title, or use Start / Reset / Lock / minimize / close'
                  : 'Lock — click-through overlay (except title strip & controls)'
              }
              aria-pressed={positionLocked}
              onClick={togglePositionLock}
            >
              {positionLocked ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="btn icon"
              title="Hide to system tray"
              onClick={() => void window.odysseyCompanion?.minimize()}
            >
              ─
            </button>
            <button
              type="button"
              className="btn icon danger"
              title="Hide to system tray"
              onClick={() => void window.odysseyCompanion?.close()}
            >
              ✕
            </button>
          </div>
        </header>

        <div
          className={`timeline-body-drag-framing ${ghostChrome ? 'timeline-body-drag-framing--ghost' : ''}`}
        >
          <div
            className={`timeline-boss-surface ${!ghostChrome ? 'timeline-boss-surface--panel' : ''}`}
          >
          <div className="timeline-scroll-inner timeline-scroll-inner--styled">
            {fightPayloadReject && (
              <div className="banner error inline timeline-payload-reject">
                Fight payload did not validate: {fightPayloadReject}
              </div>
            )}
            {fight ? (
              runSessionActive ? (
                <div className="timeline-fight timeline-fight--run timeline-fight--run-compact">
                  <TimelineRunQueue fight={fight} flatSkills={flatSkills} elapsedMs={cappedElapsedMs} />
                </div>
              ) : (
                <div className="timeline-fight">
                  {fight.objectives.map((ob, i) => (
                    <section
                      key={`${ob.monster_id}-${ob.step}-${i}`}
                      className="timeline-objective-block"
                    >
                      <div className="objective-head">
                        <div className="objective-titles">
                          <strong>{ob.monster_name}</strong>
                          {ob.pen_name ? <span className="pen-name">{ob.pen_name}</span> : null}
                        </div>
                        <span className="objective-meta">
                          Lv.{ob.level}
                          {ob.count > 1 ? ` · ×${ob.count}` : ''}
                        </span>
                      </div>
                      <SkillTimelineList objectiveIndex={i} skills={fight.monsterSkills[i]?.skills ?? []} />
                    </section>
                  ))}
                </div>
              )
            ) : (
              <div className="timeline-empty" aria-hidden />
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
