import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Dungeon, DungeonDetail, MonsterDetail } from './types'
import { loadSettings, hotkeysApplyPayload } from './lib/settingsStorage'
import { dungeonImageUrl } from './lib/dungeonImage'
import { fetchDungeonsListCached } from './lib/dungeonsListApi'
import { orderDungeonsByFirstSeen } from './lib/dungeonListFirstSeen'
import { difficultyTagClassName, orderedDifficultyLabels } from './lib/dungeonDifficultyTags'
import { bossNamesPreviewLine, dungeonDetailMatchesBrowserSearch } from './lib/dungeonBossPreview'
import { fetchDungeonDetail, findDifficultyRow, readCachedDungeonDetails } from './lib/dungeonDetailApi'
import { fetchMonsterDetail } from './lib/monsterDetailApi'
import { buildTimelineFightPayload } from './lib/buildTimelineFightPayload'
import { DungeonDifficultyDetail } from './components/DungeonDifficultyDetail'
import { HomePanel } from './components/HomePanel'
import { MarketLookup } from './components/MarketLookup'
import { ThemesPanel } from './components/ThemesPanel'
import ServerStatusTitlebar from './components/ServerStatusTitlebar'
import { getMeterSupabaseCredentials } from './lib/meterSupabaseEnv'
import { initSupabaseAuth } from './lib/supabaseAuthStorage'
import { displayNameFromUserMetadata, getSupabaseClient } from './lib/supabaseMeter'

function hashHue(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h % 360
}

export default function DungeonApp() {
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
  const [toolView, setToolView] = useState<'home' | 'themes' | 'dungeons' | 'market'>('home')
  const [authReady, setAuthReady] = useState(false)
  const [meterUser, setMeterUser] = useState<User | null>(null)

  const supabase = useMemo(() => {
    const { url, anonKey } = getMeterSupabaseCredentials()
    if (!url || !anonKey) return null
    return getSupabaseClient(url, anonKey)
  }, [])

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
      return det ? dungeonDetailMatchesBrowserSearch(det, q) : false
    })
  }, [dungeons, query, detailById])

  useEffect(() => {
    const api = window.odysseyCompanion
    if (!api) return
    const s = loadSettings()
    void api.applyHotkeys(hotkeysApplyPayload(s))
    api.pushSettings(s)
  }, [])

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    let cancelled = false
    void initSupabaseAuth(supabase).then(() => {
      if (cancelled) return
      void supabase.auth.getUser().then(({ data }) => {
        if (!cancelled) {
          setMeterUser(data.user ?? null)
          setAuthReady(true)
        }
      })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!cancelled) setMeterUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  useEffect(() => {
    if (toolView !== 'dungeons') return
    ;(async () => {
      try {
        setLoading(true)
        const { response: res, stale } = await fetchDungeonsListCached()
        setDungeons(orderDungeonsByFirstSeen(res.data ?? []))
        setListFromCache(stale)
        setLoadError(null)
      } catch (e) {
        setListFromCache(false)
        setLoadError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [toolView])

  /**
   * List API has no boss names — only `?id=` detail does. Prefetch details in the background
   * (low concurrency) so cards can show bosses and search can match them without opening first.
   * Successful responses are persisted in localStorage (`fetchWithWikiCache`); we also hydrate
   * from that cache on load so boss lines and reward search survive rate limits / offline starts.
   */
  useEffect(() => {
    if (toolView !== 'dungeons' || dungeons.length === 0) return
    const cached = readCachedDungeonDetails(dungeons.map((d) => d.id))
    if (Object.keys(cached).length === 0) return
    setDetailById((prev) => ({ ...cached, ...prev }))
  }, [dungeons, toolView])

  useEffect(() => {
    if (toolView !== 'dungeons' || loading || loadError || dungeons.length === 0) return
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
          setDetailById((prev) => ({ ...prev, [id]: detail }))
        } catch {
          /* ignore per-dungeon failures */
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()))
    return () => {
      cancelled = true
    }
  }, [dungeons, loading, loadError, toolView])

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
        /* Always refetch when opening a dungeon so we never show an older trimmed in-memory
         * snapshot (prefetch used to skip updates once an id existed). */
        const detail = await fetchDungeonDetail(pickedDungeonId)
        if (cancelled) return
        setDetailById((prev) => ({ ...prev, [detail.id]: detail }))
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
          { dungeonId: pickedDungeonId },
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

  const homeMode = toolView === 'home'
  const themesMode = toolView === 'themes'
  const browseMode = toolView === 'dungeons' && !pickedDungeonId
  const marketMode = toolView === 'market'
  const profileDisplayName = meterUser ? displayNameFromUserMetadata(meterUser) : null

  return (
    <div className="shell shell--dungeon">
      <header className="titlebar titlebar--solid">
        <div className="titlebar-drag">
          <span className="logo-dot" aria-hidden />
          <div className="title-text">
            <strong>
              {homeMode
                ? 'Odyssey Companion'
                : themesMode
                ? 'Meter themes'
                : marketMode
                ? 'Market lookup'
                : browseMode
                ? 'Odyssey Companion'
                : pickedDungeon?.name ?? 'Dungeon'}
            </strong>
            <span className="subtitle">
              {homeMode
                ? 'News, teasers & official patch notes'
                : themesMode
                ? 'Earn points · shop & equip bar themes'
                : marketMode
                ? 'Search listings · compare unit prices'
                : browseMode
                ? 'Pick a dungeon · search and select a fight'
                : 'Objectives & rewards · open timeline when ready'}
            </span>
          </div>
        </div>
        <ServerStatusTitlebar />
        <div className="titlebar-actions">
          {toolView === 'dungeons' && pickedDungeonId && (
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
          <div className="titlebar-main-tabs" role="tablist" aria-label="Main tools">
            <button
              type="button"
              role="tab"
              aria-selected={homeMode}
              className={`main-tool-tab${homeMode ? ' main-tool-tab--active' : ''}`}
              onClick={() => {
                setToolView('home')
                setPickedDungeonId(null)
                setFightPanelError(null)
              }}
            >
              Home
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={themesMode}
              className={`main-tool-tab${themesMode ? ' main-tool-tab--active' : ''}`}
              onClick={() => {
                setToolView('themes')
                setPickedDungeonId(null)
                setFightPanelError(null)
              }}
            >
              Themes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={toolView === 'dungeons'}
              className={`main-tool-tab${toolView === 'dungeons' ? ' main-tool-tab--active' : ''}`}
              onClick={() => {
                setToolView('dungeons')
                setPickedDungeonId(null)
                setFightPanelError(null)
              }}
            >
              Dungeons
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={marketMode}
              className={`main-tool-tab${marketMode ? ' main-tool-tab--active' : ''}`}
              onClick={() => {
                setToolView('market')
                setPickedDungeonId(null)
                setFightPanelError(null)
              }}
            >
              Market
            </button>
          </div>
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
            title="Show Raid Timer overlay"
            onClick={() => void window.odysseyCompanion?.showTimersWindow()}
          >
            Raid Timer
          </button>
          <button
            type="button"
            className="btn ghost"
            title="Show Digi Aura overlay"
            onClick={() => void window.odysseyCompanion?.showHudWindow()}
          >
            Digi Aura
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
            title="Companion settings"
            aria-label="Open Companion settings"
            onClick={() => void window.odysseyCompanion?.openSettings?.('general')}
          >
            <svg className="dungeon-titlebar-svg" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"
              />
            </svg>
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

      {homeMode ? (
        <HomePanel />
      ) : themesMode ? (
        <ThemesPanel
          supabase={supabase}
          user={meterUser}
          profileDisplayName={profileDisplayName}
          authReady={authReady}
          onOpenSettings={() => void window.odysseyCompanion?.openSettings?.('meter')}
          onThemeChange={() => void window.odysseyCompanion?.notifyMeterPartyThemesChanged?.()}
        />
      ) : marketMode ? (
        <MarketLookup />
      ) : browseMode ? (
        <main className="main main--dungeon">
          <div className="toolbar">
            <input
              className="search"
              placeholder="Search by dungeon, boss, map, or reward…"
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
              {difficultyLabels.map((label) => {
                const detail = pickedDungeonId
                  ? detailById[pickedDungeonId]
                  : undefined
                const row = detail ? findDifficultyRow(detail, label) : undefined
                const busy = loadingDifficulty !== null || prefetchLoading
                return (
                  <article key={label} className="fight-diff-card">
                    <div className="fight-diff-card-head">
                      <span className="fight-diff-name">{label}</span>
                      <button
                        type="button"
                        className="btn primary fight-diff-timeline-btn"
                        disabled={busy || !row}
                        onClick={() => void loadDifficultyToTimeline(label)}
                      >
                        {loadingDifficulty === label
                          ? 'Opening…'
                          : 'Open timeline'}
                      </button>
                    </div>
                    {prefetchLoading && !row ? (
                      <p className="muted fight-diff-detail-placeholder">
                        Loading dungeon data…
                      </p>
                    ) : row ? (
                      <div className="fight-diff-detail-scroll">
                        <DungeonDifficultyDetail row={row} />
                      </div>
                    ) : (
                      <p className="muted fight-diff-detail-placeholder">
                        No data for this difficulty.
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="muted fight-centered">
              Could not determine difficulties for this dungeon.
            </p>
          )}
        </main>
      )}

    </div>
  )
}
