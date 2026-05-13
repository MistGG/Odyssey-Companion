import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type {
  AppVersionInfo,
  Dungeon,
  DungeonDetail,
  HotkeyConfig,
  LatestReleaseResult,
  MonsterDetail,
  OverlaySettings,
} from './types'
import { DEFAULT_SETTINGS } from './types'
import { loadSettings, saveSettings } from './lib/settingsStorage'
import { dungeonImageUrl } from './lib/dungeonImage'
import { fetchDungeonsListCached } from './lib/dungeonsListApi'
import { difficultyTagClassName, orderedDifficultyLabels } from './lib/dungeonDifficultyTags'
import { bossNamesPreviewLine, dungeonDetailMatchesBossQuery } from './lib/dungeonBossPreview'
import { fetchDungeonDetail, findDifficultyRow } from './lib/dungeonDetailApi'
import { mergeOverlaySettings } from './lib/overlaySettingsGuard'
import { fetchMonsterDetail } from './lib/monsterDetailApi'
import { buildTimelineFightPayload } from './lib/buildTimelineFightPayload'
import { stripHtmlToPlainText } from './lib/releaseNotesText'
import { DifficultyTimelinePreview } from './components/DifficultyTimelinePreview'
import { keyboardEventToAccelerator } from './lib/hotkeyAccelerator'

const HOTKEY_FIELDS: { label: string; slot: keyof HotkeyConfig }[] = [
  { label: 'Start / Pause', slot: 'toggle' },
  { label: 'Reset', slot: 'reset' },
]

function hashHue(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

export default function DungeonApp() {
  const [settings, setSettings] = useState<OverlaySettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dungeons, setDungeons] = useState<Dungeon[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  /** Dungeon chosen from the grid — hides browser and shows difficulty columns. */
  const [pickedDungeonId, setPickedDungeonId] = useState<string | null>(null)
  const [imgFailed, setImgFailed] = useState<Record<string, true>>({})
  const [detailById, setDetailById] = useState<Record<string, DungeonDetail>>({})
  const [monsterById, setMonsterById] = useState<Record<string, MonsterDetail>>({})
  const [loadingDifficulty, setLoadingDifficulty] = useState<string | null>(null)
  const [fightPanelError, setFightPanelError] = useState<string | null>(null)
  /** Difficulty names (from detail after fetch). */
  const [difficultyLabels, setDifficultyLabels] = useState<string[]>([])
  /** Fetching dungeon detail + all monster timelines for this page. */
  const [prefetchLoading, setPrefetchLoading] = useState(false)
  /** Dungeon list was served from localStorage cache (wiki unreachable). */
  const [listFromCache, setListFromCache] = useState(false)
  const lastPushedSettingsJson = useRef<string | null>(null)
  const [hotkeyListening, setHotkeyListening] = useState<keyof HotkeyConfig | null>(null)

  const [appVersion, setAppVersion] = useState<AppVersionInfo | null>(null)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateCheckLine, setUpdateCheckLine] = useState<string | null>(null)
  /** After a check finds a newer GitHub release — drives Download vs fallback link. */
  const [updateOffer, setUpdateOffer] = useState<{
    latestVersion: string
    setupDownloadUrl: string | null
    releasePageUrl: string
  } | null>(null)

  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  const [releaseNotesContent, setReleaseNotesContent] = useState<
    LatestReleaseResult | undefined
  >(undefined)

  const pickedDungeon = useMemo(
    () => dungeons.find((d) => d.id === pickedDungeonId) ?? null,
    [dungeons, pickedDungeonId],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return dungeons
    return dungeons.filter((d) => {
      if (d.name.toLowerCase().includes(q)) return true
      const det = detailById[d.id]
      return det ? dungeonDetailMatchesBossQuery(det, q) : false
    })
  }, [dungeons, query, detailById])

  useEffect(() => {
    saveSettings(settings)
    const api = window.odysseyCompanion
    if (!api) return
    const json = JSON.stringify(settings)
    if (lastPushedSettingsJson.current === json) return
    lastPushedSettingsJson.current = json
    api.pushSettings(settings)
    void api.applyHotkeys(settings.hotkeys)
  }, [settings])

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const { response: res, stale } = await fetchDungeonsListCached()
        setDungeons(res.data ?? [])
        setListFromCache(stale)
        setLoadError(null)
      } catch (e) {
        setListFromCache(false)
        setLoadError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  /**
   * List API has no boss names — only `?id=` detail does. Prefetch details in the background
   * (low concurrency) so cards can show bosses and search can match them without opening first.
   */
  useEffect(() => {
    if (loading || loadError || dungeons.length === 0) return
    let cancelled = false
    const ids = dungeons.map((d) => d.id)
    const concurrency = 3
    const worker = async () => {
      while (!cancelled) {
        const id = ids.shift()
        if (!id) break
        try {
          const detail = await fetchDungeonDetail(id)
          if (cancelled) return
          setDetailById((prev) => {
            if (prev[id]) return prev
            return { ...prev, [id]: detail }
          })
        } catch {
          /* ignore per-dungeon failures */
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()))
    return () => {
      cancelled = true
    }
  }, [dungeons, loading, loadError])

  useEffect(() => {
    if (!settingsOpen) setHotkeyListening(null)
  }, [settingsOpen])

  useEffect(() => {
    if (!settingsOpen) return
    const api = window.odysseyCompanion
    if (!api) return
    setUpdateCheckLine(null)
    setUpdateOffer(null)
    setAppVersion(null)
    void api.getAppVersion().then(setAppVersion)
  }, [settingsOpen])

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

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const off = api.onSettingsPatch((patch) => {
      setSettings((prev) => {
        const merged = mergeOverlaySettings(prev, patch)
        if (!merged) return prev
        saveSettings(merged)
        void api.applyHotkeys(merged.hotkeys)
        return merged
      })
    })
    return () => off()
  }, [])

  /** When opening a dungeon: load wiki detail, prefetch every monster timeline, push first difficulty to overlay. */
  useEffect(() => {
    if (!pickedDungeonId || !pickedDungeon) {
      setDifficultyLabels([])
      setPrefetchLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setPrefetchLoading(true)
      setFightPanelError(null)
      try {
        let detail = detailById[pickedDungeonId]
        if (!detail) {
          detail = await fetchDungeonDetail(pickedDungeonId)
          if (cancelled) return
          setDetailById((prev) => ({ ...prev, [detail!.id]: detail! }))
        }
        setDifficultyLabels(detail.difficulties.map((d) => d.difficulty))

        const monsterIds = [
          ...new Set(
            detail.difficulties.flatMap((row) =>
              row.objectives.map((o) => o.monster_id).filter(Boolean),
            ),
          ),
        ]
        const mergedMonsters: Record<string, MonsterDetail> = { ...monsterById }
        await Promise.all(
          monsterIds.map(async (mid) => {
            if (mergedMonsters[mid]) return
            try {
              mergedMonsters[mid] = await fetchMonsterDetail(mid)
            } catch {
              /* non-fatal */
            }
          }),
        )
        if (cancelled) return
        setMonsterById((prev) => ({ ...prev, ...mergedMonsters }))
        /* Timeline loads only when you click Story / Normal / Hard — not automatically. */
      } catch (e) {
        if (!cancelled) {
          setFightPanelError(e instanceof Error ? e.message : String(e))
          setDifficultyLabels([])
        }
      } finally {
        if (!cancelled) setPrefetchLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when dungeon picked; detail/monster caches updated inside effect
  }, [pickedDungeonId, pickedDungeon])

  const loadDifficultyToTimeline = useCallback(
    async (difficultyLabel: string) => {
      if (!pickedDungeonId || !pickedDungeon) return
      const api = window.odysseyCompanion
      if (!api) {
        const inElectron =
          typeof navigator !== 'undefined' &&
          navigator.userAgent.includes('Electron')
        setFightPanelError(
          inElectron
            ? 'Timeline bridge unavailable (preload did not load). Restart npm run dev.'
            : 'Open this screen from Electron (npm run dev) to sync the timeline window.',
        )
        return
      }
      setFightPanelError(null)
      setLoadingDifficulty(difficultyLabel)
      try {
        const detail = detailById[pickedDungeonId]
        if (!detail) {
          setFightPanelError('Dungeon detail still loading — try again in a moment.')
          return
        }
        const row = findDifficultyRow(detail, difficultyLabel)
        if (!row) {
          setFightPanelError(
            `Difficulty "${difficultyLabel}" was not found in the wiki response.`,
          )
          return
        }

        const ids = [
          ...new Set(row.objectives.map((o) => o.monster_id).filter(Boolean)),
        ]
        const monsterMap: Record<string, MonsterDetail> = { ...monsterById }
        await Promise.all(
          ids.map(async (mid) => {
            if (monsterMap[mid]) return
            try {
              const m = await fetchMonsterDetail(mid)
              monsterMap[mid] = m
              setMonsterById((prev) => ({ ...prev, [mid]: m }))
            } catch {
              /* missing monster skills — payload still builds */
            }
          }),
        )

        const payload = buildTimelineFightPayload(
          pickedDungeon.name,
          row,
          monsterMap,
        )
        const ok = await api.loadFightIntoTimeline(payload)
        if (!ok) {
          setFightPanelError('Timeline window is not ready. Try again.')
        }
      } catch (e) {
        setFightPanelError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoadingDifficulty(null)
      }
    },
    [pickedDungeonId, pickedDungeon, detailById, monsterById],
  )

  const applyHotkeysNow = useCallback(async () => {
    const h = settings.hotkeys
    const used = [h.toggle, h.reset].filter((x) => x && x !== 'None')
    if (new Set(used).size !== used.length) {
      alert('Each hotkey must be unique (or set to None).')
      return
    }
    const r = await window.odysseyCompanion?.applyHotkeys(h)
    if (r && !r.ok) alert(`Hotkeys: ${r.error ?? 'could not register'}`)
  }, [settings.hotkeys])

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

  const browseMode = !pickedDungeonId

  return (
    <div className="shell shell--dungeon">
      <header className="titlebar titlebar--solid">
        <div className="titlebar-drag">
          <span className="logo-dot" aria-hidden />
          <div className="title-text">
            <strong>{browseMode ? 'Odyssey Companion' : pickedDungeon?.name ?? 'Dungeon'}</strong>
            <span className="subtitle">
              {browseMode
                ? 'Pick a dungeon · search and select a fight'
                : 'Pick Story, Normal, or Hard'}
            </span>
          </div>
        </div>
        <div className="titlebar-actions">
          {!browseMode && (
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setFightPanelError(null)
                setPickedDungeonId(null)
              }}
            >
              ← All dungeons
            </button>
          )}
          <button type="button" className="btn primary" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button
            type="button"
            className="btn ghost"
            title="Show timeline window"
            onClick={() => void window.odysseyCompanion?.showTimelineWindow()}
          >
            Timeline
          </button>
          <button
            type="button"
            className="btn ghost"
            title="Show DPS meter overlay"
            onClick={() => void window.odysseyCompanion?.showMeterWindow()}
          >
            Meter
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

      {browseMode ? (
        <main className="main main--dungeon">
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search by dungeon or boss name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="toolbar-meta">
              {loading ? 'Loading…' : `${filtered.length} / ${dungeons.length} shown`}
            </span>
          </div>

          {loadError && (
            <div className="banner error">
              Could not load dungeons: {loadError}
            </div>
          )}

          {listFromCache && !loadError && (
            <div className="banner info">
              Showing cached dungeon list — could not reach the live wiki.
            </div>
          )}

          <div className="dungeon-list">
            {filtered.map((d) => {
              const url = dungeonImageUrl(d.image)
              const failed = !!imgFailed[d.id]
              const hue = hashHue(d.id)
              const detail = detailById[d.id]
              const bossLine = detail ? bossNamesPreviewLine(detail) : ''
              const titleText = bossLine || d.name
              const diffTags = orderedDifficultyLabels(d.difficulties)
              return (
                <button
                  key={d.id}
                  type="button"
                  className="dungeon-list-row"
                  style={
                    {
                      '--dl-hue': String(hue),
                    } as CSSProperties
                  }
                  aria-label={`${titleText} — ${d.name}${diffTags.length ? ` — ${diffTags.join(', ')}` : ''}`}
                  onClick={() => {
                    setFightPanelError(null)
                    setPickedDungeonId(d.id)
                  }}
                >
                  {!failed ? (
                    <img
                      className="dungeon-list-row__bg-img"
                      src={url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      aria-hidden
                      onError={() =>
                        setImgFailed((prev) => ({ ...prev, [d.id]: true }))
                      }
                    />
                  ) : (
                    <div className="dungeon-list-row__bg-fallback" aria-hidden />
                  )}
                  <div className="dungeon-list-row__scrim" aria-hidden />
                  <div className="dungeon-list-row__inner">
                    <div className="dungeon-list-row__thumb-wrap">
                      {!failed ? (
                        <img
                          className="dungeon-list-row__thumb"
                          src={url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          onError={() =>
                            setImgFailed((prev) => ({ ...prev, [d.id]: true }))
                          }
                        />
                      ) : (
                        <span className="dungeon-list-row__thumb-fallback" aria-hidden>
                          {titleText.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="dungeon-list-row__text">
                      {bossLine ? (
                        <>
                          <div className="dungeon-list-row__title" title={bossLine}>
                            {bossLine}
                          </div>
                          <div className="dungeon-list-row__dungeon-name" title={d.name}>
                            {d.name}
                          </div>
                        </>
                      ) : (
                        <div className="dungeon-list-row__title" title={d.name}>
                          {d.name}
                        </div>
                      )}
                      {diffTags.length > 0 ? (
                        <div className="dungeon-list-row__tags" aria-label="Difficulties">
                          {diffTags.map((label) => (
                            <span key={label} className={difficultyTagClassName(label)}>
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <span className="dungeon-list-row__chevron" aria-hidden>
                      ›
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </main>
      ) : (
        <main className="fight-main">
          {fightPanelError && (
            <div className="banner error">{fightPanelError}</div>
          )}
          {prefetchLoading && difficultyLabels.length === 0 ? (
            <p className="muted fight-centered">Loading dungeon detail and monster timelines…</p>
          ) : difficultyLabels.length ? (
            <div className="fight-diff-row">
              {difficultyLabels.map((label) => (
                <button
                  key={label}
                  type="button"
                  className="fight-diff-card"
                  disabled={loadingDifficulty !== null || prefetchLoading}
                  onClick={() => void loadDifficultyToTimeline(label)}
                >
                  <span className="fight-diff-name">{label}</span>
                  {loadingDifficulty === label ? (
                    <span className="fight-diff-loading muted">Sending to timeline…</span>
                  ) : null}
                  <DifficultyTimelinePreview
                    dungeonDetail={
                      pickedDungeonId ? detailById[pickedDungeonId] : undefined
                    }
                    difficultyLabel={label}
                    monsterById={monsterById}
                    prefetchLoading={prefetchLoading}
                  />
                  <span className="fight-diff-action">Load</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="muted fight-centered">
              Could not determine difficulties for this dungeon.
            </p>
          )}
        </main>
      )}

      {settingsOpen && (
        <>
        <div
          className="modal-backdrop modal-backdrop--solid"
          role="presentation"
          onClick={() => {
            setHotkeyListening(null)
            setReleaseNotesOpen(false)
            setSettingsOpen(false)
          }}
        >
          <aside
            className="settings-panel settings-panel--solid"
            role="dialog"
            aria-label="Settings"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-head">
              <h2>Settings</h2>
              <button
                type="button"
                className="btn icon"
                onClick={() => {
                  setHotkeyListening(null)
                  setReleaseNotesOpen(false)
                  setSettingsOpen(false)
                }}
              >
                ✕
              </button>
            </div>

            <section className="field-group">
              <h3>Hotkeys (timeline)</h3>
              {hotkeyListening ? (
                <p className="hint hotkey-listen-hint">Esc cancels · pressing a modifier alone does nothing</p>
              ) : null}
              {HOTKEY_FIELDS.map(({ label, slot }) => (
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
                        ? 'Click any key to register..'
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
              <button type="button" className="btn secondary" onClick={applyHotkeysNow}>
                Save
              </button>
            </section>

            <section className="field-group">
              <h3>Timeline window</h3>
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

            <section className="field-group">
              <h3>DPS meter overlay</h3>
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
                  Default 10. 0 = disabled. Clears live DPS/total/time only; skills stay until new damage.
                </span>
              </label>
            </section>

            <section className="field-group">
              <h3>Updates</h3>
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
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setReleaseNotesOpen(true)}
                >
                  Release notes
                </button>
              </div>
              {updateCheckLine ? (
                <p className="hint settings-update-status">{updateCheckLine}</p>
              ) : null}
              {updateOffer && updateOffer.setupDownloadUrl ? (
                <div className="settings-download-row">
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => void handleDownloadUpdate()}
                  >
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
            </section>

            <section className="field-group row">
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
                Reset defaults
              </button>
            </section>
          </aside>
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
                <button
                  type="button"
                  className="btn icon"
                  onClick={() => setReleaseNotesOpen(false)}
                >
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
                    {stripHtmlToPlainText(releaseNotesContent.body.trim()) ||
                      'No notes for this release.'}
                  </pre>
                </>
              ) : (
                <p className="hint error">{releaseNotesContent.error}</p>
              )}
            </aside>
          </div>
        ) : null}
        </>
      )}
    </div>
  )
}
