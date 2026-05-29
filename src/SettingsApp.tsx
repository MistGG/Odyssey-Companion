import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type {
  AppVersionInfo,
  HotkeyConfig,
  LatestReleaseResult,
  OverlaySettings,
  StartupPanelKey,
} from './types'
import { STARTUP_PANEL_KEYS } from './types'
import { DEFAULT_SETTINGS } from './types'
import { loadSettings, saveSettings, hotkeysApplyPayload } from './lib/settingsStorage'
import { mergeOverlaySettings } from './lib/overlaySettingsGuard'
import { maybeExpireMeterDebug } from './lib/meterDebugLog'
import { keyboardEventToAccelerator } from './lib/hotkeyAccelerator'
import { stripHtmlToPlainText } from './lib/releaseNotesText'
import { runBossTimerTestToast, runBossTimerTestSound, runServerStatusTestNotification } from './lib/bossTimerClientTest'
import { bossTimerChimeRepeatsConfigurable } from './lib/bossTimerWebChime'
import { getMeterSupabaseCredentials } from './lib/meterSupabaseEnv'
import { initSupabaseAuth } from './lib/supabaseAuthStorage'
import { userFacingAuthError } from './lib/userFacingMessages'
import {
  displayNameFromUserMetadata,
  getSupabaseClient,
  signInEmail,
  signOut,
  signUpWithProfile,
} from './lib/supabaseMeter'
import { MeterCompanionBarThemes } from './components/MeterCompanionBarThemes'
import { MeterRunHistorySection } from './components/MeterRunHistorySection'
import {
  normalizeSettingsSection,
  readInitialSettingsSection,
  type SettingsSectionId,
} from './lib/settingsSection'

const HOTKEY_TIMELINE: { label: string; slot: 'toggle' | 'reset' }[] = [
  { label: 'Start / Pause', slot: 'toggle' },
  { label: 'Reset', slot: 'reset' },
]

const HOTKEY_METER: {
  label: string
  slot: 'meterReconnect' | 'meterResetSession'
}[] = [
  { label: 'Reconnect reader', slot: 'meterReconnect' },
  { label: 'Reset session', slot: 'meterResetSession' },
]

const STARTUP_PANEL_LABELS: Record<StartupPanelKey, string> = {
  main: 'Main (dungeons)',
  timeline: 'Timeline',
  meter: 'DPS meter',
  timers: 'Boss timers',
  hud: 'Digi Aura',
}

const NAV: { id: SettingsSectionId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'meter', label: 'DPS meter' },
  { id: 'timers', label: 'Boss timers' },
  { id: 'hud', label: 'Digi Aura' },
  { id: 'updates', label: 'Updates' },
]

function sectionScrollId(id: SettingsSectionId) {
  return `settings-section-${id}`
}

/** Last nav section whose heading top is at or above a band below the scrollport top — matches manual scroll position. */
function pickActiveSectionFromMainScroll(main: HTMLElement): SettingsSectionId {
  const activationY = main.getBoundingClientRect().top + Math.min(64, main.clientHeight * 0.12)
  let best: SettingsSectionId = NAV[0]!.id
  for (const { id } of NAV) {
    const el = document.getElementById(sectionScrollId(id))
    if (!el) continue
    if (el.getBoundingClientRect().top <= activationY) best = id
  }
  return best
}

export default function SettingsApp() {
  const lastPushedSettingsJson = useRef<string | null>(null)
  const mainScrollRef = useRef<HTMLElement | null>(null)
  /** While non-zero time, scroll-spy ignores scroll (smooth programmatic scroll from nav / IPC). */
  const ignoreScrollSpyUntilRef = useRef(0)
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings())
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => readInitialSettingsSection())
  const [hotkeyListening, setHotkeyListening] = useState<keyof HotkeyConfig | null>(null)

  const [appVersion, setAppVersion] = useState<AppVersionInfo | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateCheckLine, setUpdateCheckLine] = useState<string | null>(null)
  const [updateOffer, setUpdateOffer] = useState<{
    latestVersion: string
    setupDownloadUrl: string | null
    releasePageUrl: string
  } | null>(null)

  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  const [releaseNotesContent, setReleaseNotesContent] = useState<LatestReleaseResult | undefined>(undefined)

  const [timerTestBusy, setTimerTestBusy] = useState<'toast' | 'sound' | null>(null)
  const [serverStatusTestBusy, setServerStatusTestBusy] = useState(false)
  const [serverStatusTestHint, setServerStatusTestHint] = useState<string | null>(null)
  const [meterReportBusy, setMeterReportBusy] = useState(false)
  const [meterReportHint, setMeterReportHint] = useState<string | null>(null)
  const [timerTestHint, setTimerTestHint] = useState<string | null>(null)
  const [timerTestHintIsError, setTimerTestHintIsError] = useState(false)

  const supabase = useMemo(() => {
    const { url, anonKey } = getMeterSupabaseCredentials()
    return getSupabaseClient(url, anonKey)
  }, [])
  const serverStatusChimeControlsDisabled = useMemo(
    () =>
      !settings.serverStatusMonitorEnabled || settings.serverStatusNotifyMethod === 'toast',
    [settings.serverStatusMonitorEnabled, settings.serverStatusNotifyMethod],
  )
  const bossTimerChimeControlsDisabled = useMemo(
    () => settings.bossTimerNotifyMethod === 'toast',
    [settings.bossTimerNotifyMethod],
  )
  const [onlineUser, setOnlineUser] = useState<User | null>(null)
  const [onlineBusy, setOnlineBusy] = useState(false)
  const [onlineMsg, setOnlineMsg] = useState<string | null>(null)
  const [onlineEmail, setOnlineEmail] = useState('')
  const [onlinePassword, setOnlinePassword] = useState('')
  const [onlineDisplayName, setOnlineDisplayName] = useState('')
  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const json = JSON.stringify(settings)
    if (lastPushedSettingsJson.current === json) return
    lastPushedSettingsJson.current = json
    saveSettings(settings)
    api.pushSettings(settings)
    void api.applyHotkeys(hotkeysApplyPayload(settings))
    api.applyTimelineWindowOptions?.({ alwaysOnTop: settings.timelineAlwaysOnTop })
    api.applyMeterWindowOptions?.({ alwaysOnTop: settings.meterAlwaysOnTop })
    api.applyTimersWindowOptions?.({ alwaysOnTop: settings.timersAlwaysOnTop })
    api.applyHudWindowOptions?.({ alwaysOnTop: settings.hudAlwaysOnTop })
  }, [settings])

  useEffect(() => {
    if (!settings.meterDiagnosticCapture) return
    const syncExpired = () => {
      if (!maybeExpireMeterDebug()) return
      setSettings((s) => ({ ...s, meterDiagnosticCapture: false }))
      void window.odysseyCompanion?.setMeterDiagnosticCapture?.(false)
      void window.odysseyCompanion?.copyMeterDebugReport?.().then((r) => {
        if (r?.ok) {
          setMeterReportHint(
            'Recording ended — debug report copied to clipboard. Paste to Mist on Discord.',
          )
        } else {
          setMeterReportHint(
            r?.error ??
              'Recording ended — open the DPS meter, then use Copy debug report.',
          )
        }
      })
    }
    syncExpired()
    const id = window.setInterval(syncExpired, 30_000)
    return () => window.clearInterval(id)
  }, [settings.meterDiagnosticCapture])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    void initSupabaseAuth(supabase).then(() => {
      if (cancelled) return
      void supabase.auth.getUser().then(({ data }) => {
        if (!cancelled) setOnlineUser(data.user ?? null)
      })
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setOnlineUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api?.onSettingsNavigate) return
    return api.onSettingsNavigate((raw) => {
      const id = normalizeSettingsSection(raw)
      ignoreScrollSpyUntilRef.current = Date.now() + 700
      setActiveSection(id)
      requestAnimationFrame(() => {
        document.getElementById(sectionScrollId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }, [])

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
        api.applyTimelineWindowOptions?.({ alwaysOnTop: merged.timelineAlwaysOnTop })
        api.applyMeterWindowOptions?.({ alwaysOnTop: merged.meterAlwaysOnTop })
        api.applyTimersWindowOptions?.({ alwaysOnTop: merged.timersAlwaysOnTop })
        api.applyHudWindowOptions?.({ alwaysOnTop: merged.hudAlwaysOnTop })
        return merged
      })
    })
    return () => off()
  }, [])

  useEffect(() => {
    const main = mainScrollRef.current
    if (!main) return

    ignoreScrollSpyUntilRef.current = Date.now() + 200
    const initialId = readInitialSettingsSection()
    requestAnimationFrame(() => {
      document.getElementById(sectionScrollId(initialId))?.scrollIntoView({ behavior: 'auto', block: 'start' })
    })

    let raf = 0
    const syncFromScroll = () => {
      if (Date.now() < ignoreScrollSpyUntilRef.current) return
      const next = pickActiveSectionFromMainScroll(main)
      setActiveSection((prev) => (prev === next ? prev : next))
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(syncFromScroll)
    }
    main.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScroll) : null
    ro?.observe(main)
    requestAnimationFrame(() => {
      requestAnimationFrame(syncFromScroll)
    })
    return () => {
      main.removeEventListener('scroll', onScroll)
      ro?.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    setAppVersion(null)
    void window.odysseyCompanion?.getAppVersion?.().then(setAppVersion)
  }, [])

  useEffect(() => {
    if (!releaseNotesOpen) return
    const api = window.odysseyCompanion
    if (!api) return
    setReleaseNotesContent(undefined)
    void api.getLatestReleaseNotes().then(setReleaseNotesContent)
  }, [releaseNotesOpen])

  useEffect(() => {
    if (!releaseNotesOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReleaseNotesOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [releaseNotesOpen])

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

  const handleCheckForUpdates = useCallback(async () => {
    const api = window.odysseyCompanion
    if (!api) return
    setUpdateChecking(true)
    setUpdateCheckLine(null)
    setUpdateOffer(null)
    const minDelay = new Promise<void>((resolve) => {
      setTimeout(resolve, 2000)
    })
    try {
      const [r] = await Promise.all([api.checkForUpdates(), minDelay])
      if (!r.ok) {
        setUpdateCheckLine(r.error)
        return
      }
      if (r.updateAvailable) {
        setUpdateCheckLine(`Update available: v${r.latestVersion}`)
        setUpdateOffer({
          latestVersion: r.latestVersion,
          setupDownloadUrl: r.setupDownloadUrl,
          releasePageUrl: r.releasePageUrl,
        })
      } else {
        setUpdateCheckLine(`You're up to date (v${r.currentVersion}).`)
      }
    } catch (e) {
      setUpdateCheckLine(e instanceof Error ? e.message : String(e))
    } finally {
      setUpdateChecking(false)
    }
  }, [])

  const handleDownloadUpdate = useCallback(async () => {
    const api = window.odysseyCompanion
    if (!api || !updateOffer?.setupDownloadUrl) return
    const r = await api.downloadUpdate(updateOffer.setupDownloadUrl)
    if (!r.ok) {
      setUpdateCheckLine(r.error ?? 'Download failed')
      return
    }
    if (r.mode === 'auto-updater') {
      setUpdateCheckLine('Downloading… — watch the update window for progress.')
      return
    }
    if (r.mode === 'browser' || r.mode === 'browser-fallback') {
      setUpdateCheckLine('Opened the installer in your browser. Run it when the download finishes.')
    }
  }, [updateOffer?.setupDownloadUrl])

  const handleOnlineSignIn = useCallback(() => {
    if (!supabase) return
    setOnlineBusy(true)
    setOnlineMsg(null)
    void signInEmail(supabase, onlineEmail, onlinePassword).then(({ error }) => {
      setOnlineBusy(false)
      setOnlineMsg(error ? userFacingAuthError(error) : 'Signed in.')
    })
  }, [onlineEmail, onlinePassword, supabase])

  const handleOnlineSignUp = useCallback(() => {
    if (!supabase) return
    setOnlineBusy(true)
    setOnlineMsg(null)
    void signUpWithProfile(supabase, onlineEmail, onlinePassword, onlineDisplayName).then(({ error }) => {
      setOnlineBusy(false)
      setOnlineMsg(
        error
          ? userFacingAuthError(error)
          : 'Account created. Check your email if confirmation is enabled, then sign in.',
      )
    })
  }, [onlineDisplayName, onlineEmail, onlinePassword, supabase])

  const handleOnlineSignOut = useCallback(() => {
    if (!supabase) return
    setOnlineBusy(true)
    setOnlineMsg(null)
    void signOut(supabase).then(() => {
      setOnlineBusy(false)
      setOnlineMsg('Signed out.')
    })
  }, [supabase])

  return (
    <div className="shell shell--settings">
      <header className="titlebar titlebar--solid titlebar--settings-app">
        <div className="titlebar-drag">
          <span className="logo-dot" aria-hidden />
          <div className="title-text">
            <strong>Companion settings</strong>
            <span className="subtitle">Hotkeys, overlays, reminders, and updates</span>
          </div>
        </div>
        <div className="titlebar-actions">
          <button
            type="button"
            className="btn icon"
            title="Minimize"
            aria-label="Minimize"
            onClick={() => void window.odysseyCompanion?.minimize()}
          >
            ─
          </button>
          <button
            type="button"
            className="btn icon danger"
            title="Close"
            aria-label="Close"
            onClick={() => void window.odysseyCompanion?.close()}
          >
            ✕
          </button>
        </div>
      </header>

      <div className="settings-app-layout">
        <nav className="settings-app-nav" aria-label="Settings sections">
          {NAV.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`settings-app-nav__btn ${activeSection === id ? 'settings-app-nav__btn--active' : ''}`}
              onClick={() => {
                ignoreScrollSpyUntilRef.current = Date.now() + 700
                setActiveSection(id)
                requestAnimationFrame(() => {
                  document.getElementById(sectionScrollId(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                })
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        <main ref={mainScrollRef} className="settings-app-main meter-scroll--themed">
          <section id={sectionScrollId('general')} className="settings-app-section">
            <h2 className="settings-app-section__title">General</h2>

            <h3 className="settings-app-subhead" style={{ marginTop: 0 }}>
              Panels at startup
            </h3>
            <div className="settings-panel-toggles" role="group" aria-label="Panels at startup">
              {STARTUP_PANEL_KEYS.map((key) => {
                const on = settings.startupPanels.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    className={`settings-panel-toggles__item${on ? ' settings-panel-toggles__item--on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      setSettings((s) => {
                        const has = s.startupPanels.includes(key)
                        let next = has
                          ? s.startupPanels.filter((p) => p !== key)
                          : [...s.startupPanels, key]
                        if (next.length === 0) next = ['main']
                        return { ...s, startupPanels: next }
                      })
                    }}
                  >
                    <span className="settings-panel-toggles__label">{STARTUP_PANEL_LABELS[key]}</span>
                    <span className="settings-panel-toggles__state">{on ? 'Opens' : 'Off'}</span>
                  </button>
                )
              })}
            </div>

            <h3 className="settings-app-subhead">Game server status</h3>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.serverStatusMonitorEnabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    serverStatusMonitorEnabled: e.target.checked,
                  }))
                }
              />
              Notify when game server status changes
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Notify with</span>
              <select
                value={settings.serverStatusNotifyMethod}
                disabled={!settings.serverStatusMonitorEnabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    serverStatusNotifyMethod: e.target.value as OverlaySettings['serverStatusNotifyMethod'],
                  }))
                }
              >
                <option value="toast">Toast only</option>
                <option value="sound">Sound only</option>
                <option value="both">Toast and sound</option>
              </select>
            </label>
            <label className="field" style={{ marginTop: 10 }}>
              <span>Chime style</span>
              <select
                value={settings.serverStatusChimeStyle}
                disabled={serverStatusChimeControlsDisabled}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    serverStatusChimeStyle: e.target.value as OverlaySettings['serverStatusChimeStyle'],
                  }))
                }
              >
                <option value="braveHeart">Brave Heart</option>
                <option value="digivice">Digivice</option>
                <option value="digibeep">Digi Beep</option>
              </select>
            </label>
            <label className="field">
              <span>Chime volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                disabled={serverStatusChimeControlsDisabled}
                value={settings.serverStatusChimeVolume}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    serverStatusChimeVolume: Number(e.target.value),
                  }))
                }
              />
              <span className="hint muted" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                {Math.round(settings.serverStatusChimeVolume * 100)}%
              </span>
            </label>
            <label className="field">
              <span>Chime repeats</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                disabled={
                  serverStatusChimeControlsDisabled ||
                  !bossTimerChimeRepeatsConfigurable(settings.serverStatusChimeStyle)
                }
                value={settings.serverStatusChimeRepeats}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    serverStatusChimeRepeats: Math.min(
                      5,
                      Math.max(1, Math.round(Number(e.target.value))),
                    ),
                  }))
                }
              />
              <span className="hint muted" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                {settings.serverStatusChimeStyle === 'braveHeart'
                  ? 'Brave Heart always plays once.'
                  : `${settings.serverStatusChimeRepeats}× fades out, then ${2}s pause between plays.`}
              </span>
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                className="btn secondary"
                disabled={serverStatusTestBusy || !settings.serverStatusMonitorEnabled}
                onClick={() => {
                  setServerStatusTestHint(null)
                  setServerStatusTestBusy(true)
                  void runServerStatusTestNotification().then((r) => {
                    setServerStatusTestBusy(false)
                    if (r.ok) {
                      setServerStatusTestHint('Test notification sent.')
                    } else {
                      setServerStatusTestHint(r.error ?? 'Could not send test notification.')
                    }
                  })
                }}
              >
                {serverStatusTestBusy ? 'Working…' : 'Test notification'}
              </button>
            </div>
            {serverStatusTestHint ? (
              <p className="hint" style={{ marginTop: 10 }} role="status">
                {serverStatusTestHint}
              </p>
            ) : null}

            <h3 className="settings-app-subhead">Hotkeys</h3>
            <p className="hint muted" style={{ marginTop: 0 }}>
              Registered globally with Windows by default (including over the game). Use the option below if you need
              the same keys for typing elsewhere.
            </p>
            {hotkeyListening ? (
              <p className="hint hotkey-listen-hint">Esc cancels · pressing a modifier alone does nothing</p>
            ) : null}

            <h3 className="settings-app-subhead">Timeline</h3>
            {HOTKEY_TIMELINE.map(({ label, slot }) => (
              <label key={slot} className="field">
                <span>{label}</span>
                <div className="hotkey-row">
                  <button
                    type="button"
                    className={`hotkey-capture ${hotkeyListening === slot ? 'hotkey-capture--listening' : ''}`}
                    onClick={() => setHotkeyListening(slot)}
                  >
                    {hotkeyListening === slot ? 'Click any key to register…' : settings.hotkeys[slot]}
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

            <h3 className="settings-app-subhead">DPS meter</h3>
            {HOTKEY_METER.map(({ label, slot }) => (
              <label key={slot} className="field">
                <span>{label}</span>
                <div className="hotkey-row">
                  <button
                    type="button"
                    className={`hotkey-capture ${hotkeyListening === slot ? 'hotkey-capture--listening' : ''}`}
                    onClick={() => setHotkeyListening(slot)}
                  >
                    {hotkeyListening === slot ? 'Listening…' : settings.hotkeys[slot]}
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

            <label className="check" style={{ marginTop: 12 }}>
              <input
                type="checkbox"
                checked={settings.hotkeysOnlyWhenCompanionFocused}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    hotkeysOnlyWhenCompanionFocused: e.target.checked,
                  }))
                }
              />
              <span>Only while Companion is focused</span>
            </label>
            <p className="hint muted" style={{ marginTop: 6 }}>
              Leave off so hotkeys work while the game is focused. Turn on if you need the same keys for typing in
              other apps when a Companion window is not active.
            </p>
          </section>

          <section id={sectionScrollId('timeline')} className="settings-app-section">
            <h2 className="settings-app-section__title">Timeline window</h2>
            <label className="field">
              <span>Background strength</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={settings.timelineBackdropOpacity}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    timelineBackdropOpacity: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.timelineAlwaysOnTop}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    timelineAlwaysOnTop: e.target.checked,
                  }))
                }
              />
              Keep timeline window above other apps
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.timelinePositionLocked}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    timelinePositionLocked: e.target.checked,
                  }))
                }
              />
              Lock timeline window position (disable dragging)
            </label>
          </section>

          <section id={sectionScrollId('meter')} className="settings-app-section">
            <h2 className="settings-app-section__title">DPS meter overlay</h2>
            <label className="field">
              <span>Background strength</span>
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
              Keep DPS meter above other apps
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
              Lock meter — click-through except title bar (same as meter lock button)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.meterPartyShowSelfDisplayName}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    meterPartyShowSelfDisplayName: e.target.checked,
                  }))
                }
              />
              Party meter: show your display name instead of &quot;You&quot;
            </label>

            <section className="field-group" style={{ marginTop: 20 }}>
              <h3 className="settings-app-subhead">Odyssey Calc account</h3>
              {!supabase ? (
                <p className="hint muted" style={{ marginTop: 0 }}>
                  Sign-in and cloud features are not available in this build.
                </p>
              ) : onlineUser ? (
                <>
                  <p className="hint muted" style={{ marginTop: 0 }}>
                    Signed in as <strong>{onlineUser.email ?? 'Supabase user'}</strong>.
                  </p>
                  <button type="button" className="btn secondary" disabled={onlineBusy} onClick={handleOnlineSignOut}>
                    {onlineBusy ? 'Signing out…' : 'Sign out'}
                  </button>
                </>
              ) : (
                <>
                  <p className="hint muted" style={{ marginTop: 0 }}>
                    Sign in with the same Odyssey Calc account for bar themes, My Parses history, and
                    meter rewards. Parses still upload without an account.
                  </p>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={onlineEmail}
                      autoComplete="email"
                      onChange={(e) => setOnlineEmail(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={onlinePassword}
                      autoComplete="current-password"
                      onChange={(e) => setOnlinePassword(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Display name</span>
                    <input
                      value={onlineDisplayName}
                      autoComplete="nickname"
                      placeholder="Only needed when creating an account"
                      onChange={(e) => setOnlineDisplayName(e.target.value)}
                    />
                  </label>
                  <div className="field-group row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn secondary" disabled={onlineBusy} onClick={handleOnlineSignIn}>
                      {onlineBusy ? 'Working…' : 'Sign in'}
                    </button>
                    <button type="button" className="btn ghost" disabled={onlineBusy} onClick={handleOnlineSignUp}>
                      Create account
                    </button>
                  </div>
                </>
              )}
              {onlineMsg ? <p className="hint" style={{ marginTop: 10 }}>{onlineMsg}</p> : null}
            </section>

            {supabase ? (
              <>
                <section className="field-group" style={{ marginTop: 16 }}>
                  <h3 className="settings-app-subhead">Parse uploads</h3>
                  <p className="hint muted" style={{ marginTop: 0 }}>
                    After each Normal or Hard dungeon clear, the companion uploads the party parse
                    automatically — no sign-in required. Sign in later to attach earlier anonymous
                    uploads to your account (matched by your in-game tamer). View history on Odyssey
                    Calc → Meter → My Parses. Story runs and failed runs are not uploaded.
                  </p>
                </section>
                <MeterRunHistorySection />
              </>
            ) : null}

            {supabase && onlineUser ? (
              <>
                <section className="field-group" style={{ marginTop: 16 }}>
                  <h3 className="settings-app-subhead">Bar themes</h3>
                  <p className="hint muted" style={{ marginTop: 0 }}>
                    Equip themes earned on the Odyssey Calc meter shop. Changes apply to your party bar on the
                    meter overlay.
                  </p>
                  <MeterCompanionBarThemes
                    supabase={supabase}
                    profileDisplayName={displayNameFromUserMetadata(onlineUser)}
                    onThemeChange={() => void window.odysseyCompanion?.notifyMeterPartyThemesChanged?.()}
                  />
                </section>
              </>
            ) : null}

            <section className="field-group" style={{ marginTop: 16 }}>
              <h3 className="settings-app-subhead">Troubleshooting</h3>
              <p className="hint muted" style={{ margin: '0 0 10px' }}>
                Record meter events while reproducing an issue. Recording turns off after 10
                minutes and copies a debug report to your clipboard — paste it to Mist on Discord.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.meterDiagnosticCapture}
                  onChange={(e) => {
                    const enabled = e.target.checked
                    setSettings((s) => ({ ...s, meterDiagnosticCapture: enabled }))
                    void window.odysseyCompanion?.setMeterDiagnosticCapture?.(enabled)
                  }}
                />
                Record meter diagnostics
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={meterReportBusy}
                  onClick={() => {
                    setMeterReportHint(null)
                    setMeterReportBusy(true)
                    void window.odysseyCompanion?.copyMeterDebugReport?.().then((r) => {
                      setMeterReportBusy(false)
                      if (r?.ok) {
                        setMeterReportHint('Debug report copied to clipboard.')
                      } else {
                        setMeterReportHint(r?.error ?? 'Could not copy report.')
                      }
                    })
                  }}
                >
                  {meterReportBusy ? 'Working…' : 'Copy debug report'}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={meterReportBusy}
                  onClick={() => {
                    setMeterReportHint(null)
                    setMeterReportBusy(true)
                    void window.odysseyCompanion?.saveMeterDebugReport?.().then((r) => {
                      setMeterReportBusy(false)
                      if (r?.ok) {
                        setMeterReportHint(
                          r.filePath ? `Saved to ${r.filePath}` : 'Debug report saved.',
                        )
                      } else {
                        setMeterReportHint(r?.error ?? 'Could not save report.')
                      }
                    })
                  }}
                >
                  Save debug report…
                </button>
              </div>
              {meterReportHint ? (
                <p className="hint" style={{ marginTop: 10 }} role="status">
                  {meterReportHint}
                </p>
              ) : null}
            </section>
          </section>

          <section id={sectionScrollId('timers')} className="settings-app-section">
            <h2 className="settings-app-section__title">Boss timers</h2>
            <section className="field-group" style={{ marginTop: 0 }}>
              <h3 className="settings-app-subhead">Overlay</h3>
              <label className="field">
                <span>Background strength</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.timersBackdropOpacity}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      timersBackdropOpacity: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.timersAlwaysOnTop}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      timersAlwaysOnTop: e.target.checked,
                    }))
                  }
                />
                Keep timers above other apps
              </label>
            </section>

            <section className="field-group">
              <h3 className="settings-app-subhead">Reminders</h3>
              <label className="field">
                <span>Notify before spawn (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  step={1}
                  value={settings.bossTimerNotifyLeadMin}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      bossTimerNotifyLeadMin: Math.min(
                        120,
                        Math.max(1, Math.round(Number(e.target.value) || 15)),
                      ),
                    }))
                  }
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.bossTimerNotifyWhenUiClosed}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      bossTimerNotifyWhenUiClosed: e.target.checked,
                    }))
                  }
                />
                Notify while timers window is hidden (tray)
              </label>
              <label className="field">
                <span>Notify with</span>
                <select
                  value={settings.bossTimerNotifyMethod}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      bossTimerNotifyMethod: e.target.value as OverlaySettings['bossTimerNotifyMethod'],
                    }))
                  }
                >
                  <option value="toast">Toast only</option>
                  <option value="sound">Sound only</option>
                  <option value="both">Toast and sound</option>
                </select>
                <span className="hint muted" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                  Sound plays in the timers window. If the timers process is not running, you may only get a toast.
                </span>
              </label>
              <label className="field">
                <span>Chime style</span>
                <select
                  value={settings.bossTimerChimeStyle}
                  disabled={bossTimerChimeControlsDisabled}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      bossTimerChimeStyle: e.target.value as OverlaySettings['bossTimerChimeStyle'],
                    }))
                  }
                >
                  <option value="off">Off</option>
                  <option value="braveHeart">Brave Heart</option>
                  <option value="digivice">Digivice</option>
                  <option value="digibeep">Digi Beep</option>
                </select>
              </label>
              <label className="field">
                <span>Chime volume</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={bossTimerChimeControlsDisabled}
                  value={settings.bossTimerChimeVolume}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      bossTimerChimeVolume: Number(e.target.value),
                    }))
                  }
                />
                <span className="hint muted" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                  {Math.round(settings.bossTimerChimeVolume * 100)}% applies to sound and both; toast volume follows
                  Windows.
                </span>
              </label>
              <label className="field">
                <span>Chime repeats</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  disabled={
                    bossTimerChimeControlsDisabled ||
                    !bossTimerChimeRepeatsConfigurable(settings.bossTimerChimeStyle)
                  }
                  value={settings.bossTimerChimeRepeats}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      bossTimerChimeRepeats: Math.min(5, Math.max(1, Math.round(Number(e.target.value)))),
                    }))
                  }
                />
                <span className="hint muted" style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                  {settings.bossTimerChimeStyle === 'braveHeart'
                    ? 'Brave Heart always plays once (repeats disabled).'
                    : `${settings.bossTimerChimeRepeats}× fades out, then ${2}s pause between plays.`}
                </span>
              </label>
            </section>

            <section className="field-group">
              <h3 className="settings-app-subhead">Try it</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={timerTestBusy !== null}
                  onClick={() => {
                    setTimerTestHint(null)
                    setTimerTestBusy('toast')
                    void runBossTimerTestToast().then((r) => {
                      setTimerTestBusy(null)
                      if (r.ok) {
                        setTimerTestHintIsError(false)
                        setTimerTestHint('Sent. Check notifications / Action Center.')
                      } else {
                        setTimerTestHintIsError(true)
                        setTimerTestHint(r.error ?? 'Failed')
                      }
                    })
                  }}
                >
                  {timerTestBusy === 'toast' ? 'Sending…' : 'Test toast'}
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={timerTestBusy !== null}
                  onClick={() => {
                    setTimerTestHint(null)
                    setTimerTestBusy('sound')
                    void runBossTimerTestSound().then((r) => {
                      setTimerTestBusy(null)
                      if (r.ok) {
                        setTimerTestHintIsError(false)
                        setTimerTestHint('Played chime with your style, volume, and repeat count.')
                      } else {
                        setTimerTestHintIsError(true)
                        setTimerTestHint(r.error ?? 'Failed')
                      }
                    })
                  }}
                >
                  {timerTestBusy === 'sound' ? 'Playing…' : 'Test chime'}
                </button>
              </div>
              {timerTestHint ? (
                <p className={`hint ${timerTestHintIsError ? 'error' : ''}`} style={{ marginTop: 10 }}>
                  {timerTestHint}
                </p>
              ) : null}
            </section>
          </section>

          <section id={sectionScrollId('hud')} className="settings-app-section">
            <h2 className="settings-app-section__title">Digi Aura</h2>
            <section className="field-group" style={{ marginTop: 0 }}>
              <h3 className="settings-app-subhead">Overlay</h3>
              <label className="field">
                <span>Edit-mode panel strength</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={settings.hudBackdropOpacity}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      hudBackdropOpacity: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={settings.hudAlwaysOnTop}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      hudAlwaysOnTop: e.target.checked,
                    }))
                  }
                />
                Keep Digi Aura above other apps
              </label>
              {settings.hudLayoutLocked ? (
                <button
                  type="button"
                  className="btn secondary"
                  style={{ marginTop: 12 }}
                  onClick={() =>
                    setSettings((s) => ({
                      ...s,
                      hudLayoutLocked: false,
                    }))
                  }
                >
                  Unlock layout for editing
                </button>
              ) : (
                <p className="hint muted" style={{ marginTop: 10 }}>
                  Use the lock button in the Digi Aura title bar to hide chrome and pin widget positions. Unlock here or from
                  the tray menu.
                </p>
              )}
            </section>
          </section>

          <section id={sectionScrollId('updates')} className="settings-app-section">
            <h2 className="settings-app-section__title">Updates</h2>
            <p className="muted settings-version-line">
              {appVersion ? (
                <>
                  Version <strong>{appVersion.version}</strong>
                  {appVersion.isPackaged ? ' · installed build' : ' · development build'}
                </>
              ) : (
                'Loading version…'
              )}
            </p>
            <div className="settings-update-actions">
              <button
                type="button"
                className={`btn secondary settings-update-btn ${updateChecking ? 'settings-update-btn--loading' : ''}`}
                disabled={updateChecking}
                onClick={() => void handleCheckForUpdates()}
              >
                {updateChecking ? 'Checking…' : 'Check for updates'}
              </button>
              <button type="button" className="btn ghost" onClick={() => setReleaseNotesOpen(true)}>
                Release notes
              </button>
            </div>
            {updateCheckLine ? <p className="hint settings-update-status">{updateCheckLine}</p> : null}
            {updateOffer && updateOffer.setupDownloadUrl ? (
              <div className="settings-download-row">
                <button type="button" className="btn primary" onClick={() => void handleDownloadUpdate()}>
                  Download &amp; install latest
                </button>
              </div>
            ) : null}
            {updateOffer && !updateOffer.setupDownloadUrl ? (
              <p className="hint settings-update-status">
                No installer file on this release —{' '}
                <a href={updateOffer.releasePageUrl} target="_blank" rel="noreferrer">
                  open the release on GitHub
                </a>
                .
              </p>
            ) : null}

            <div className="field-group row" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setSettings({
                    ...DEFAULT_SETTINGS,
                    hotkeys: { ...DEFAULT_SETTINGS.hotkeys },
                  })
                  localStorage.removeItem('dmo-overlay-settings-v1')
                }}
              >
                Reset all settings to defaults
              </button>
            </div>
          </section>
        </main>
      </div>

      {releaseNotesOpen ? (
        <div
          className="modal-backdrop modal-backdrop--solid modal-backdrop--release-notes"
          role="presentation"
          onClick={() => setReleaseNotesOpen(false)}
        >
          <aside
            className="release-notes-panel settings-panel--solid"
            role="dialog"
            aria-label="Release notes"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-head">
              <h2>Release notes</h2>
              <button type="button" className="btn icon" onClick={() => setReleaseNotesOpen(false)}>
                ✕
              </button>
            </div>
            {releaseNotesContent === undefined ? (
              <p className="muted">Loading…</p>
            ) : releaseNotesContent.ok ? (
              <>
                <p className="settings-release-meta muted">
                  {releaseNotesContent.tag}
                  {releaseNotesContent.publishedAt
                    ? ` · ${new Date(releaseNotesContent.publishedAt).toLocaleDateString(undefined, {
                        dateStyle: 'medium',
                      })}`
                    : ''}{' '}
                  ·{' '}
                  <a href={releaseNotesContent.url} target="_blank" rel="noreferrer">
                    Open on GitHub
                  </a>
                </p>
                <pre className="settings-changelog-body release-notes-body">
                  {stripHtmlToPlainText(releaseNotesContent.body.trim()) || 'No notes for this release.'}
                </pre>
              </>
            ) : (
              <p className="hint error">{releaseNotesContent.error}</p>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
