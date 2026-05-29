import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { OverlaySettings } from './types'
import { loadSettings, saveSettings, hotkeysApplyPayload } from './lib/settingsStorage'
import { mergeOverlaySettings } from './lib/overlaySettingsGuard'
import BossTimersView from './components/BossTimersView'

export default function TimersApp() {
  const lastPushedSettingsJson = useRef<string | null>(null)
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings())

  const titleDragRef = useRef<HTMLDivElement>(null)
  const lockBtnRef = useRef<HTMLButtonElement>(null)
  const gearBtnRef = useRef<HTMLButtonElement>(null)
  const minimizeBtnRef = useRef<HTMLButtonElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const timersBodyRef = useRef<HTMLElement | null>(null)
  const ignoreMouseRaf = useRef<number | null>(null)
  const lastIgnoreSent = useRef<boolean | null>(null)

  const [timersLootExpanded, setTimersLootExpanded] = useState(false)

  const onLootRatesExpandedChange = useCallback((expanded: boolean) => {
    setTimersLootExpanded(expanded)
  }, [])

  const positionLocked = settings.timersPositionLocked

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const json = JSON.stringify(settings)
    if (lastPushedSettingsJson.current === json) return
    lastPushedSettingsJson.current = json
    saveSettings(settings)
    api.pushSettings(settings)
    void api.applyHotkeys(hotkeysApplyPayload(settings))
    api.applyTimersWindowOptions?.({ alwaysOnTop: settings.timersAlwaysOnTop })
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
        void api.applyHotkeys(hotkeysApplyPayload(merged))
        api.applyTimersWindowOptions?.({ alwaysOnTop: merged.timersAlwaysOnTop })
        return merged
      })
    })
    return () => off()
  }, [])

  useEffect(() => {
    const api = window.odysseyCompanion
    const setIgnore = (ignore: boolean) => {
      if (lastIgnoreSent.current === ignore) return
      lastIgnoreSent.current = ignore
      api?.setTimersIgnoreMouseEvents?.(ignore)
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

    const onPointer = (clientX: number, clientY: number) => {
      if (ignoreMouseRaf.current != null) cancelAnimationFrame(ignoreMouseRaf.current)
      ignoreMouseRaf.current = requestAnimationFrame(() => {
        ignoreMouseRaf.current = null
        const interactive =
          inRect(clientX, clientY, titleDragRef.current) ||
          inRect(clientX, clientY, lockBtnRef.current) ||
          inRect(clientX, clientY, gearBtnRef.current) ||
          inRect(clientX, clientY, minimizeBtnRef.current) ||
          inRect(clientX, clientY, closeBtnRef.current) ||
          inRect(clientX, clientY, timersBodyRef.current)
        setIgnore(!interactive)
      })
    }

    const onMove = (e: MouseEvent) => onPointer(e.clientX, e.clientY)
    const collapsePassthrough = () => setIgnore(true)
    const onBlur = () => collapsePassthrough()

    lastIgnoreSent.current = null
    setIgnore(true)

    const onMouseDown = (e: MouseEvent) => onPointer(e.clientX, e.clientY)

    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('blur', onBlur)
    document.documentElement.addEventListener('mouseleave', collapsePassthrough)

    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onMouseDown, true)
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

  const toggleTimersLock = useCallback(() => {
    setSettings((s) => ({ ...s, timersPositionLocked: !s.timersPositionLocked }))
  }, [])

  const shellStyle = useMemo(
    () =>
      ({
        '--timers-backdrop-alpha': String(settings.timersBackdropOpacity),
      }) as CSSProperties,
    [settings.timersBackdropOpacity],
  )

  const ghostChrome = settings.timersBackdropOpacity < 0.04

  const shellCls = [
    'shell',
    'shell--timers',
    ghostChrome ? 'timers-shell--ghost' : '',
    positionLocked ? 'timers-position-locked' : 'timers-position-unlocked',
    timersLootExpanded ? 'shell--timers-loot-expanded' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellCls} style={shellStyle}>
      <div className={`timers-backdrop ${ghostChrome ? 'timers-backdrop--ghost' : ''}`}>
        <header className="titlebar titlebar--timers titlebar--timers-compact">
          <div ref={titleDragRef} className="titlebar-drag titlebar-drag--timers">
            <span className="logo-dot logo-dot--timers" aria-hidden />
            <strong className="timers-title-text">Timers</strong>
          </div>
          <div className="titlebar-actions titlebar-actions--timers">
            <button
              ref={lockBtnRef}
              type="button"
              className={`btn timers-icon-tile ${positionLocked ? 'timers-icon-tile--active' : ''}`}
              title={
                positionLocked
                  ? 'Unlock — drag the window freely'
                  : 'Lock — pin position; clicks pass through except this bar and the timer strip'
              }
              aria-pressed={positionLocked}
              aria-label={positionLocked ? 'Unlock timers overlay' : 'Lock timers overlay'}
              onClick={toggleTimersLock}
            >
              {positionLocked ? (
                <svg className="timers-inline-svg" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                  />
                </svg>
              ) : (
                <svg className="timers-inline-svg" viewBox="0 0 24 24" aria-hidden>
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
              className="btn timers-icon-tile"
              title="Open Companion settings (boss timers section)"
              aria-label="Open Companion settings"
              onClick={() => void window.odysseyCompanion?.openSettings?.('timers')}
            >
              <svg className="timers-inline-svg" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
                />
              </svg>
            </button>
            <button
              ref={minimizeBtnRef}
              type="button"
              className="btn timers-icon-tile"
              title="Minimize to tray"
              aria-label="Minimize to tray"
              onClick={() => void window.odysseyCompanion?.minimize()}
            >
              <span aria-hidden className="timers-win-icon">
                ─
              </span>
            </button>
            <button
              ref={closeBtnRef}
              type="button"
              className="btn timers-icon-tile timers-icon-tile--danger"
              title="Close to tray"
              aria-label="Close to tray"
              onClick={() => void window.odysseyCompanion?.close()}
            >
              <span aria-hidden className="timers-win-icon">
                ✕
              </span>
            </button>
          </div>
        </header>

        <main
          ref={timersBodyRef}
          className={`timers-body timers-body--compact${timersLootExpanded ? ' timers-body--loot-expanded' : ''}`}
        >
          <BossTimersView
            variant="overlay"
            visibleCount={settings.bossTimerVisibleCount}
            onLootRatesExpandedChange={onLootRatesExpandedChange}
          />
        </main>
      </div>
    </div>
  )
}
