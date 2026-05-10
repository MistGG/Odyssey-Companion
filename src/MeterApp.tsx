import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { HotkeyConfig, OverlaySettings } from './types'
import { loadSettings, saveSettings } from './lib/settingsStorage'
import { mergeOverlaySettings } from './lib/overlaySettingsGuard'
import { keyboardEventToAccelerator } from './lib/hotkeyAccelerator'

export type MeterHitRow = {
  skill: string
  target: string
  damage: number
  crit: boolean
}

function formatInt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

type SkillBreakdownRow = {
  skill: string
  damage: number
  hits: number
}

const SESSION_HITS_CAP = 2000

const METER_HOTKEY_FIELDS: { label: string; slot: 'meterReconnect' | 'meterResetSession' }[] = [
  { label: 'Reconnect reader', slot: 'meterReconnect' },
  { label: 'Reset session', slot: 'meterResetSession' },
]

function isHitMessage(m: unknown): m is { type: 'hit' } & MeterHitRow {
  if (!m || typeof m !== 'object') return false
  const o = m as Record<string, unknown>
  return (
    o.type === 'hit' &&
    typeof o.skill === 'string' &&
    typeof o.target === 'string' &&
    typeof o.damage === 'number' &&
    typeof o.crit === 'boolean'
  )
}

export default function MeterApp() {
  const lastPushedSettingsJson = useRef<string | null>(null)
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hotkeyListening, setHotkeyListening] = useState<
    keyof Pick<HotkeyConfig, 'meterReconnect' | 'meterResetSession'> | null
  >(null)

  const titleDragRef = useRef<HTMLDivElement>(null)
  const lockBtnRef = useRef<HTMLButtonElement>(null)
  const gearBtnRef = useRef<HTMLButtonElement>(null)
  const reconnectBtnRef = useRef<HTMLButtonElement>(null)
  const resetBtnRef = useRef<HTMLButtonElement>(null)
  const minimizeBtnRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const ignoreMouseRaf = useRef<number | null>(null)
  const lastIgnoreSent = useRef<boolean | null>(null)
  const lastHitMsRef = useRef<number | null>(null)
  const hitsRef = useRef<MeterHitRow[]>([])
  const sessionStartMsRef = useRef<number | null>(null)

  const [sessionStartMs, setSessionStartMs] = useState<number | null>(null)
  const [totalDamage, setTotalDamage] = useState(0)
  const [hits, setHits] = useState<MeterHitRow[]>([])
  /** After idle auto-reset: show prior breakdown until new hits arrive (live `hits` cleared). */
  const [frozenHits, setFrozenHits] = useState<MeterHitRow[] | null>(null)
  const [, setTick] = useState(0)
  const [readerError, setReaderError] = useState<string | null>(null)
  const [readerHint, setReaderHint] = useState<string | null>(null)
  /** Distinct from errors: warning = offsets/patch likely; info = normal status line. */
  const [readerHintKind, setReaderHintKind] = useState<'info' | 'warning'>('info')

  hitsRef.current = hits
  sessionStartMsRef.current = sessionStartMs

  const positionLocked = settings.meterPositionLocked

  useEffect(() => {
    if (sessionStartMs == null) return
    const id = window.setInterval(() => setTick((t) => t + 1), 100)
    return () => window.clearInterval(id)
  }, [sessionStartMs])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const json = JSON.stringify(settings)
    if (lastPushedSettingsJson.current === json) return
    lastPushedSettingsJson.current = json
    saveSettings(settings)
    api.pushSettings(settings)
    void api.applyHotkeys(settings.hotkeys)
    api.applyMeterWindowOptions?.({ alwaysOnTop: settings.meterAlwaysOnTop })
  }, [settings])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const off = api.onSettingsPatch((patch) => {
      setSettings((prev) => {
        const merged = mergeOverlaySettings(prev, patch)
        if (!merged) return prev
        saveSettings(merged)
        lastPushedSettingsJson.current = JSON.stringify(merged)
        void api.applyHotkeys(merged.hotkeys)
        api.applyMeterWindowOptions?.({ alwaysOnTop: merged.meterAlwaysOnTop })
        return merged
      })
    })
    return () => off()
  }, [])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onMeterClearSessionUi) return
    return api.onMeterClearSessionUi(() => {
      setSessionStartMs(null)
      setTotalDamage(0)
      setHits([])
      setFrozenHits(null)
      lastHitMsRef.current = null
    })
  }, [])

  /**
   * Locked overlay: OS click-through except title controls (same pattern as timeline).
   * Disabled while settings modal is open.
   */
  useEffect(() => {
    const api = window.odysseyCompanion
    const setIgnore = (ignore: boolean) => {
      if (lastIgnoreSent.current === ignore) return
      lastIgnoreSent.current = ignore
      api?.setMeterIgnoreMouseEvents?.(ignore)
    }

    if (!positionLocked || settingsOpen) {
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

    const onPointer = (clientX: number, clientY: number) => {
      if (ignoreMouseRaf.current != null) cancelAnimationFrame(ignoreMouseRaf.current)
      ignoreMouseRaf.current = requestAnimationFrame(() => {
        ignoreMouseRaf.current = null
        const interactive =
          inRect(clientX, clientY, titleDragRef.current) ||
          inRect(clientX, clientY, lockBtnRef.current) ||
          inRect(clientX, clientY, gearBtnRef.current) ||
          inRect(clientX, clientY, reconnectBtnRef.current) ||
          inRect(clientX, clientY, resetBtnRef.current) ||
          inRect(clientX, clientY, minimizeBtnRef.current) ||
          inRect(clientX, clientY, closeBtnRef.current)
        setIgnore(!interactive)
      })
    }

    const onMove = (e: MouseEvent) => {
      onPointer(e.clientX, e.clientY)
    }

    const collapsePassthrough = () => {
      setIgnore(true)
    }

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
  }, [positionLocked, settingsOpen])

  useEffect(() => {
    if (!settingsOpen) setHotkeyListening(null)
  }, [settingsOpen])

  useEffect(() => {
    if (!hotkeyListening) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Escape') {
        setHotkeyListening(null)
        return
      }
      const acc = keyboardEventToAccelerator(e)
      if (!acc) return
      setSettings((s) => ({
        ...s,
        hotkeys: { ...s.hotkeys, [hotkeyListening]: acc },
      }))
      setHotkeyListening(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [hotkeyListening])

  /**
   * After `meterAutoResetIdleSec` with no damage lines, zero live DPS/total/time only.
   * Keeps a frozen skill breakdown until the next hit (does not send RESET to the reader).
   */
  useEffect(() => {
    const idleSec = settings.meterAutoResetIdleSec
    if (idleSec <= 0) return

    const id = window.setInterval(() => {
      const last = lastHitMsRef.current
      if (last == null) return
      if (Date.now() - last < idleSec * 1000) return

      const h = hitsRef.current
      const active = h.length > 0 || sessionStartMsRef.current != null
      if (!active) return

      if (h.length > 0) {
        setFrozenHits([...h])
      }
      setHits([])
      setTotalDamage(0)
      setSessionStartMs(null)
      lastHitMsRef.current = null
    }, 250)

    return () => window.clearInterval(id)
  }, [settings.meterAutoResetIdleSec])

  /** Live pymem reader: spawn on mount, stdout → IPC → here */
  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.startMeterReader || !api.onMeterTelemetry) return

    setReaderHintKind('info')
    setReaderHint(null)
    void api.startMeterReader().then((r) => {
      if (!r.ok) {
        setReaderError(r.error ?? 'Could not start DPS reader')
        setReaderHint(null)
        return
      }
      setReaderError(null)
      setReaderHint(null)
    })

    const offTel = api.onMeterTelemetry((msg: unknown) => {
      if (!msg || typeof msg !== 'object') return
      const o = msg as Record<string, unknown>
      if (o.type === 'debug_parse') {
        return
      }
      if (o.type === 'reader_attach') {
        return
      }
      if (isHitMessage(msg)) {
        setFrozenHits(null)
        lastHitMsRef.current = Date.now()
        setHits((h) => [...h, msg].slice(-SESSION_HITS_CAP))
        setTotalDamage((t) => t + msg.damage)
        setSessionStartMs((s) => s ?? Date.now())
        return
      }
      if (o.type === 'status' && typeof o.status === 'string') {
        if (o.status === 'error' && typeof o.message === 'string') {
          setReaderError(o.message)
        } else if (o.status === 'connected') {
          setReaderError(null)
          setReaderHintKind('info')
          const m = typeof o.message === 'string' ? o.message.trim() : ''
          setReaderHint(m.length > 0 ? m : null)
        } else if (o.status === 'warning' && typeof o.message === 'string') {
          setReaderError(null)
          setReaderHintKind('warning')
          setReaderHint(o.message)
        } else if (o.status === 'stopped') {
          setReaderHintKind('info')
          setReaderHint('Reader stopped')
        } else if (o.status === 'starting') {
          setReaderHintKind('info')
          const m = typeof o.message === 'string' ? o.message.trim() : ''
          setReaderHint(m.length > 0 ? m : null)
        }
      }
    })

    return () => {
      offTel()
      void api.stopMeterReader?.()
    }
  }, [])

  const elapsedSec =
    sessionStartMs == null ? 0 : Math.max(0, (Date.now() - sessionStartMs) / 1000)

  const dps = elapsedSec > 0 ? totalDamage / elapsedSec : 0

  const breakdownHits = useMemo(
    () => (hits.length > 0 ? hits : frozenHits ?? []),
    [hits, frozenHits],
  )

  const breakdownDamageTotal = useMemo(
    () => breakdownHits.reduce((s, h) => s + h.damage, 0),
    [breakdownHits],
  )

  const skillBreakdown = useMemo((): SkillBreakdownRow[] => {
    const map = new Map<string, SkillBreakdownRow>()
    for (const h of breakdownHits) {
      const prev = map.get(h.skill)
      if (prev) {
        prev.damage += h.damage
        prev.hits += 1
      } else {
        map.set(h.skill, {
          skill: h.skill,
          damage: h.damage,
          hits: 1,
        })
      }
    }
    return [...map.values()].sort((a, b) => b.damage - a.damage)
  }, [breakdownHits])

  const showingFrozenBreakdown = hits.length === 0 && (frozenHits?.length ?? 0) > 0

  const resetSession = useCallback(() => {
    setFrozenHits(null)
    lastHitMsRef.current = null
    setSessionStartMs(null)
    setTotalDamage(0)
    setHits([])
    void window.odysseyCompanion?.resetMeterSession?.()
  }, [])

  const reconnectReader = useCallback(() => {
    const api = window.odysseyCompanion
    if (!api?.stopMeterReader || !api.startMeterReader) return
    setReaderError(null)
    setReaderHintKind('info')
    setReaderHint('Reconnecting…')
    void api.stopMeterReader().then(() => {
      void api.startMeterReader?.().then((r) => {
        if (!r.ok) {
          setReaderError(r.error ?? 'Reconnect failed')
          setReaderHint(null)
        } else {
          setReaderHint(null)
        }
      })
    })
  }, [])

  const toggleMeterLock = useCallback(() => {
    setSettings((s) => ({ ...s, meterPositionLocked: !s.meterPositionLocked }))
  }, [])

  const shellStyle = useMemo(
    () =>
      ({
        '--meter-backdrop-alpha': String(settings.meterBackdropOpacity),
      }) as CSSProperties,
    [settings.meterBackdropOpacity],
  )

  const ghostChrome = settings.meterBackdropOpacity < 0.04

  const shellCls = [
    'shell',
    'shell--meter',
    ghostChrome ? 'meter-shell--ghost' : '',
    positionLocked ? 'meter-position-locked' : 'meter-position-unlocked',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellCls} style={shellStyle}>
      <div className={`meter-backdrop ${ghostChrome ? 'meter-backdrop--ghost' : ''}`}>
        <header className="titlebar titlebar--meter titlebar--meter-compact">
          <div ref={titleDragRef} className="titlebar-drag titlebar-drag--meter">
            <span className="logo-dot logo-dot--meter" aria-hidden />
            <strong className="meter-title-text">DPS</strong>
          </div>
          <div className="titlebar-actions titlebar-actions--meter">
            <button
              ref={lockBtnRef}
              type="button"
              className={`btn meter-icon-tile ${positionLocked ? 'meter-icon-tile--active' : ''}`}
              title={
                positionLocked
                  ? 'Unlock — interact with full meter'
                  : 'Lock — keep position; clicks pass through (except this bar)'
              }
              aria-pressed={positionLocked}
              aria-label={positionLocked ? 'Unlock meter overlay' : 'Lock overlay click-through'}
              onClick={toggleMeterLock}
            >
              {positionLocked ? (
                <svg className="meter-inline-svg" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                  />
                </svg>
              ) : (
                <svg className="meter-inline-svg" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z"
                  />
                </svg>
              )}
            </button>
            <button
              ref={gearBtnRef}
              type="button"
              className="btn meter-icon-tile"
              title="Meter settings"
              aria-label="Meter settings"
              onClick={() => setSettingsOpen(true)}
            >
              <svg className="meter-inline-svg" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
                />
              </svg>
            </button>
            <button
              ref={reconnectBtnRef}
              type="button"
              className="btn meter-icon-tile"
              title="Reconnect"
              aria-label="Reconnect"
              onClick={reconnectReader}
            >
              <svg className="meter-inline-svg" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.56 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                />
              </svg>
            </button>
            <button
              ref={resetBtnRef}
              type="button"
              className="btn meter-icon-tile"
              title="RESET"
              aria-label="RESET"
              onClick={resetSession}
            >
              <svg
                className="meter-inline-svg meter-inline-svg--stroke"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
            <button
              ref={minimizeBtnRef}
              type="button"
              className="btn meter-icon-tile"
              title="Minimize to tray"
              aria-label="Minimize to tray"
              onClick={() => void window.odysseyCompanion?.minimize()}
            >
              <span aria-hidden className="meter-win-icon">
                ─
              </span>
            </button>
            <button
              ref={closeBtnRef}
              type="button"
              className="btn meter-icon-tile meter-icon-tile--danger"
              title="Close to tray"
              aria-label="Close to tray"
              onClick={() => void window.odysseyCompanion?.close()}
            >
              <span aria-hidden className="meter-win-icon">
                ✕
              </span>
            </button>
          </div>
        </header>

        <main className="meter-body meter-body--compact">
          {readerError ? (
            <p className="meter-banner meter-banner--error meter-banner--compact" role="alert">
              {readerError}
              <span className="muted meter-banner-sub">
                {' '}
                {/could not open|attach to client/i.test(readerError) ? (
                  <>
                    This is usually <strong>Windows blocking access</strong> to the game (run Companion as admin,
                    match elevation with the game, or allow in antivirus)—not a missing Python install; the installer
                    bundles Python.
                  </>
                ) : (
                  <>
                    Game (<code>client.exe</code>) must be running. From-source dev:{' '}
                    <code>pip install -r scripts/requirements-dps.txt</code>. Installers bundle Python + pymem.
                  </>
                )}
              </span>
            </p>
          ) : null}
          {!readerError && readerHint ? (
            <p
              className={`meter-banner meter-banner--${readerHintKind} muted meter-banner--compact`}
              role={readerHintKind === 'warning' ? 'status' : undefined}
            >
              {readerHint}
            </p>
          ) : null}

          <div className="meter-stats-row meter-stats-row--compact">
            <div className="meter-stat meter-stat--hero meter-stat--compact">
              <span className="meter-stat-label">DPS</span>
              <span className="meter-stat-value">{formatInt(dps)}</span>
            </div>
            <div className="meter-stat meter-stat--compact">
              <span className="meter-stat-label">TOTAL</span>
              <span className="meter-stat-value meter-stat-value--accent">{formatInt(totalDamage)}</span>
            </div>
            <div className="meter-stat meter-stat--compact">
              <span className="meter-stat-label">Time</span>
              <span className="meter-stat-value">{elapsedSec.toFixed(0)}s</span>
            </div>
          </div>

          <section
            className="meter-breakdown meter-breakdown--compact"
            aria-label={
              showingFrozenBreakdown ? 'Damage by skill (last pull, until new hits)' : 'Damage by skill'
            }
          >
            <div className="meter-breakdown-head-inline">
              <span className="meter-breakdown-title meter-breakdown-title--inline">Skills</span>
              {showingFrozenBreakdown ? (
                <span className="meter-breakdown-meta muted" title="Cleared when new damage arrives">
                  last
                </span>
              ) : null}
            </div>
            <div className="meter-breakdown-table meter-breakdown-table--compact">
              <div className="meter-breakdown-colhead meter-breakdown-colhead--compact">
                <span>Skill</span>
                <span className="meter-col-num">Dmg</span>
                <span className="meter-col-pct">%</span>
                <span className="meter-col-hits">#</span>
              </div>
              <div className="meter-breakdown-scroll meter-scroll--themed meter-breakdown-scroll--compact">
                {skillBreakdown.length === 0 ? (
                  <p className="meter-breakdown-empty meter-breakdown-empty--compact muted">
                    Damage rolls up here.
                  </p>
                ) : (
                  skillBreakdown.map((row) => {
                    const sharePct =
                      breakdownDamageTotal > 0 ? (100 * row.damage) / breakdownDamageTotal : 0
                    return (
                      <div key={row.skill} className="meter-breakdown-row meter-breakdown-row--compact">
                        <div
                          className="meter-breakdown-bar"
                          style={{ width: `${Math.min(100, sharePct)}%` }}
                          aria-hidden
                        />
                        <div className="meter-breakdown-row-grid meter-breakdown-row-grid--compact">
                          <span className="meter-breakdown-skill" title={row.skill}>
                            {row.skill}
                          </span>
                          <span className="meter-breakdown-dmg">{formatInt(row.damage)}</span>
                          <span className="meter-breakdown-share">{sharePct.toFixed(0)}</span>
                          <span className="meter-breakdown-hits">{row.hits}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </section>
        </main>

        {settingsOpen ? (
          <>
            <div
              className="modal-backdrop modal-backdrop--solid"
              role="presentation"
              onClick={() => {
                setHotkeyListening(null)
                setSettingsOpen(false)
              }}
            >
              <aside
                className="settings-panel settings-panel--solid meter-settings-panel"
                role="dialog"
                aria-label="Meter settings"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="settings-head">
                  <h2>Meter settings</h2>
                  <button
                    type="button"
                    className="btn icon"
                    onClick={() => {
                      setHotkeyListening(null)
                      setSettingsOpen(false)
                    }}
                  >
                    ✕
                  </button>
                </div>

                <section className="field-group">
                  <h3>Appearance</h3>
                  <label className="field">
                    <span>Panel opacity</span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={settings.meterBackdropOpacity}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          meterBackdropOpacity: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settings.meterAlwaysOnTop}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          meterAlwaysOnTop: e.target.checked,
                        }))
                      }
                    />
                    Keep meter above other apps
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={settings.meterPositionLocked}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          meterPositionLocked: e.target.checked,
                        }))
                      }
                    />
                    Lock overlay — clicks pass through except title controls
                  </label>
                  <label className="field">
                    <span>Reset current DPS after no hits (seconds)</span>
                    <input
                      type="number"
                      min={0}
                      max={86400}
                      step={1}
                      value={settings.meterAutoResetIdleSec}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (!Number.isFinite(n)) return
                        setSettings((s) => ({
                          ...s,
                          meterAutoResetIdleSec: Math.min(86400, Math.max(0, Math.round(n))),
                        }))
                      }}
                    />
                    <span className="hint muted" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                      0 = off. Clears live totals only; skill list stays until new damage (full reset still uses
                      the button / hotkey).
                    </span>
                  </label>
                </section>

                <section className="field-group">
                  <h3>Global hotkeys</h3>
                  <p className="hint muted" style={{ marginTop: 0 }}>
                    Work even when this window is not focused. Use <strong>None</strong> or Clear to disable. Esc
                    cancels capture.
                  </p>
                  {hotkeyListening ? (
                    <p className="hint hotkey-listen-hint">Press a key combination…</p>
                  ) : null}
                  {METER_HOTKEY_FIELDS.map(({ label, slot }) => (
                    <label key={slot} className="field">
                      <span>{label}</span>
                      <div className="hotkey-row">
                        <button
                          type="button"
                          className={`hotkey-capture ${
                            hotkeyListening === slot ? 'hotkey-capture--listening' : ''
                          }`}
                          onClick={() => setHotkeyListening(slot)}
                        >
                          {hotkeyListening === slot
                            ? 'Listening…'
                            : settings.hotkeys[slot]}
                        </button>
                        <button
                          type="button"
                          className="btn ghost hotkey-clear"
                          onClick={() =>
                            setSettings((s) => ({
                              ...s,
                              hotkeys: { ...s.hotkeys, [slot]: 'None' },
                            }))
                          }
                        >
                          Clear
                        </button>
                      </div>
                    </label>
                  ))}
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
